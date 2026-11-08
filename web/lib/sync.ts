import { q } from "./db";
import { claimLoginLease, isUndefinedColumn, newLeaseToken, releaseLoginLease, SYNC_BUSY_MESSAGE } from "./scorecard-lease";
import { syncClubExtras } from "./club-extras";
import { decryptSecret, encryptSecret } from "./crypto";
import { Golfistics, GolfisticsError, teeFor, strokesReceived, type CardDetail, type CardRow, type Tee } from "./golfistics";
import { GolfisticsApp, appServesClub } from "./golfistics-app";
import { norm } from "./dedupe";
import { StatsTracker, type SyncStats } from "./sync-stats";

/** Golfistics App logged in but listed no clubs (t166u: San Isidro members). The web/iOS then offer the club-site route. */
export const NO_APP_CLUBS = "El sistema de tu club no lista canchas para esta matrícula. Elegí tu club y usá la clave del sitio del club.";

type CourseDef = { holes: any[]; par: number | null; as_of: string | null };

/** Round fields from the card list (safe to refresh on every sync). */
const LIST_KEYS = ["torneo_id", "date", "weekday", "tournament", "club_played", "course", "weather", "category", "course_rating",
  "position", "field_size", "handicap_index", "playing_handicap", "out", "in", "gross", "net", "card_status", "summary_counts"] as const;

export function buildRound(row: CardRow, d: CardDetail | null, tees: Tee[], gender: string, cdef: CourseDef | undefined, otherCourse = false) {
  const tee = otherCourse ? null : teeFor(tees, row.course, row.course_rating, gender || "C");
  const r: Record<string, any> = {};
  for (const k of LIST_KEYS) r[k] = row[k] ?? null;
  r.tee = tee?.tee ?? null; r.slope = tee?.slope ?? null;
  r.valid_card = row.card_status === "OK";
  r.other_course = otherCourse;
  let holes: { hole: number; par: number | null; hcp: number | null; strokes: number | null }[] = [];
  if (d && d.strokes.some(s => s != null)) {
    holes = d.holes.map((h, i) => ({ hole: h, par: d.par[i], hcp: d.hole_hcp[i], strokes: d.strokes[i] }));
    r.hcp_allowance_pct = d.handicap_allowance_pct;
  }
  if (cdef?.holes?.length) {
    const ref = new Map(cdef.holes.map((h: any) => [h.hole, h]));
    for (const h of holes) if (!h.par && ref.has(h.hole)) { const x: any = ref.get(h.hole); h.par = x.par; h.hcp ??= x.hcp; }
  }
  const played = holes.filter(h => h.strokes);
  r.holes_played = holes.length ? played.length : null;
  // no detail (cards from other clubs): a 9-hole card shows up as a ~35 course rating
  r.is_9_holes = holes.length > 0 ? played.length === 9 : row.course_rating != null && row.course_rating > 0 && row.course_rating < 50;
  r.differential_computed = null; r.adjusted_gross = null; r.course_handicap = null;
  if (holes.length && r.slope && r.handicap_index != null && r.course_rating != null && holes.every(h => h.strokes && h.par)) {
    const parT = holes.reduce((s, h) => s + (h.par as number), 0);
    const ch = Math.round(r.handicap_index * r.slope / 113 + (r.course_rating - parT));
    const ags = holes.reduce((s, h) => s + Math.min(h.strokes as number, (h.par as number) + 2 + strokesReceived(ch, h.hcp)), 0);
    r.course_handicap = ch; r.adjusted_gross = ags;
    r.differential_computed = Math.round((113 / r.slope) * (ags - r.course_rating) * 10) / 10;
  }
  return { data: r, holes: holes.map(h => [h.hole, h.par, h.strokes]) };
}

function courseFromDetail(d: CardDetail) {
  return d.holes.map((h, i) => ({
    hole: h, par: d.par[i], par_raw: d.par_raw[i], hcp: d.hole_hcp[i], hcp_raw: d.hcp_raw[i],
    yards: Object.fromEntries(Object.entries(d.yardage_by_tee).map(([t, y]) => [t, y[i]])),
  }));
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>) {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

export type SyncResult = { ok: boolean; new_rounds: number; updated: number; pending: number; message: string; clubs?: ClubSyncResult[]; busy?: boolean };
export type ClubSyncResult = { account_id: string; club_name: string; ok: boolean; new_rounds: number; updated: number; pending: number; list_total: number; message: string };

export type Progress = {
  stage: "connect" | "list" | "cards" | "handicap" | "save" | "done"; done?: number; total?: number; list_total?: number;
  club?: string; club_index?: number; club_count?: number;
  /** v3 (additive): Golfistics club code of `club`, and live counters of the cards read so far */
  club_code?: string | null; stats?: SyncStats;
};
export type OnProgress = (p: Progress) => void;

/** Which card-list group is this club's own ("local") one. Others only have totals on this site. */
async function resolveLocalClub(g: Golfistics, list: CardRow[], known: string | null) {
  const groups = new Map<string, CardRow[]>();
  for (const r of list) { const k = r.club_played ?? ""; groups.set(k, [...(groups.get(k) ?? []), r]); }
  if (groups.size <= 1) return { local: [...groups.keys()][0] || known, probed: new Map<string, CardDetail>() };
  if (known && [...groups.keys()].some(k => norm(k) === norm(known))) return { local: known, probed: new Map<string, CardDetail>() };
  const probed = new Map<string, CardDetail>();
  const order = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [name, rows] of order.slice(0, 20)) {
    const sample = rows.filter(r => r.torneo_id && r.card_status === "OK" && r.gross).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    if (!sample) continue;
    const d = await g.cardDetail(sample.torneo_id!).catch(() => null);
    if (d && d.strokes.some(x => x != null)) { probed.set(sample.torneo_id!, d); return { local: name, probed }; }
  }
  return { local: known, probed };
}

/**
 * Core sync of one club account with an already-connected club client (site login or App SSO).
 * Budget-bound from `t0`: if not all new cards fit, the rest come in the next sync.
 */
async function syncWithClient(acc: any, g: Golfistics, t0: number, budgetMs: number, onProgress: OnProgress, last = true, tracker = new StatsTracker()): Promise<ClubSyncResult> {
  const accountId = acc.id as string;
  const clubName = acc.club_display as string;
  onProgress({ stage: "list" });
  await g.playerKey();
  const list = await g.cardsList();
  const { local, probed } = await resolveLocalClub(g, list, acc.local_club ?? null);
  const isOther = (r: CardRow) => !!local && norm(r.club_played) !== norm(local);
  const existing = new Map((await q(`select external_id, jsonb_array_length(holes) as n from round where club_account_id=$1`, [accountId])).map(r => [r.external_id, r.n]));
  const courses = new Map<string, CourseDef>((await q(`select name, holes, par, as_of::text from course where club_id=$1`, [acc.cid])).map(c => [c.name, c]));
  const ext = (r: CardRow) => r.torneo_id ?? `d:${r.date}`;
  const recent = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const fresh = list.filter(r => !isOther(r) && (!existing.has(ext(r)) || (r.torneo_id && existing.get(ext(r)) === 0 && r.date >= recent)));
  fresh.sort((a, b) => (a.date < b.date ? 1 : -1));
  const details = new Map<string, CardDetail | null>(probed);
  // cards from other clubs: totals only (this site has no hole detail for them)
  for (const r of list) if (isOther(r) && r.torneo_id && !existing.has(ext(r))) details.set(r.torneo_id, null);
  let pending = 0, read = 0;
  // live stats: totals-only cards (other courses, cards without id) and already-probed details count right away
  const parFor = (r: CardRow) => (hole: number) => (courses.get(r.course ?? "")?.holes.find((h: any) => h.hole === hole)?.par as number) ?? null;
  for (const r of list) if (isOther(r) && !existing.has(ext(r))) tracker.add(r, null, { other: true });
  for (const r of fresh) {
    if (!r.torneo_id) tracker.add(r, null, { club: clubName });
    else if (details.get(r.torneo_id)) tracker.add(r, details.get(r.torneo_id)!, { club: clubName, parFallback: parFor(r) });
  }
  const toRead = fresh.filter(r => r.torneo_id && !details.has(r.torneo_id)).length;
  onProgress({ stage: "cards", done: 0, total: toRead, list_total: list.length });
  await pool(fresh, 4, async r => {
    if (!r.torneo_id || details.has(r.torneo_id)) return;
    if (Date.now() - t0 > budgetMs) { pending++; return; }
    try { const d = await g.cardDetail(r.torneo_id); details.set(r.torneo_id, d); tracker.add(r, d, { club: clubName, parFallback: parFor(r) }); } catch { pending++; }
    onProgress({ stage: "cards", done: ++read, total: toRead, list_total: list.length });
  });
  onProgress({ stage: "handicap", list_total: list.length });
  const hi = await g.hiHistory();
  // course definitions from the newest detailed (local) card per course
  for (const r of list) {
    const d = r.torneo_id ? details.get(r.torneo_id) : null;
    if (!d || !r.course || !d.holes.length || isOther(r) || !d.strokes.some(x => x != null)) continue;
    const cur = courses.get(r.course);
    if (!cur || !cur.as_of || r.date > cur.as_of) {
      const holes = courseFromDetail(d);
      courses.set(r.course, { holes, par: holes.reduce((s, h) => s + (h.par || 0), 0), as_of: r.date });
    }
  }
  for (const [name, c] of courses) {
    const tees = Object.fromEntries(g.tees.filter(t => t.course === name).map(t => [t.tee, { course_rating: t.course_rating, slope: t.slope, gender: t.gender }]));
    await q(`insert into course (club_id,name,par,holes,tees,as_of) values ($1,$2,$3,$4,$5,$6)
             on conflict (club_id,name) do update set par=excluded.par, holes=excluded.holes, as_of=excluded.as_of,
             tees=case when excluded.tees='{}'::jsonb then course.tees else excluded.tees end`,
      [acc.cid, name, c.par, JSON.stringify(c.holes), JSON.stringify(tees), c.as_of]);
  }
  let added = 0, updated = 0, saved = 0;
  onProgress({ stage: "save", done: 0, total: list.length, list_total: list.length });
  for (const r of list) {
    onProgress({ stage: "save", done: saved++, total: list.length, list_total: list.length });
    const id = ext(r), other = isOther(r);
    const d = r.torneo_id ? details.get(r.torneo_id) : undefined;
    if (d !== undefined || !existing.has(id)) {
      if (!existing.has(id) && r.torneo_id && d === undefined) continue; // pending detail: next sync
      const b = buildRound(r, other ? null : d ?? null, g.tees, g.player.gender || acc.gender || "C", r.course && !other ? courses.get(r.course) : undefined, other);
      await q(`insert into round (club_account_id, external_id, date, course, data, holes) values ($1,$2,$3,$4,$5,$6)
               on conflict (club_account_id, external_id) do update set data=excluded.data, holes=excluded.holes, course=excluded.course, date=excluded.date, updated_at=now()`,
        [accountId, id, r.date, r.course, JSON.stringify(b.data), JSON.stringify(b.holes)]);
      existing.has(id) ? updated++ : added++;
    } else {
      const patch: Record<string, any> = {};
      for (const k of LIST_KEYS) patch[k] = r[k] ?? null;
      patch.valid_card = r.card_status === "OK";
      patch.other_course = other;
      await q(`update round set data = data || $3::jsonb, updated_at=now() where club_account_id=$1 and external_id=$2 and not (data @> $3::jsonb)`,
        [accountId, id, JSON.stringify(patch)]);
    }
  }
  for (const h of hi) await q(`insert into hi_history (club_account_id,date,club,hi) values ($1,$2,$3,$4) on conflict (club_account_id,date) do update set hi=excluded.hi, club=excluded.club`, [accountId, h.date, h.club, h.hi]);
  await q(`update club set code=coalesce(code,$2) where id=$1`, [acc.cid, g.club.club_code]);
  const msg = pending ? `${added} nuevas; faltan ${pending} tarjetas, se completan en la próxima actualización` : `${added} nuevas, ${list.length} en total`;
  await q(`update club_account set player_key=$2,
             player_name=case when source='app' then coalesce(player_name,$3) else coalesce($3,player_name) end,
             gender=coalesce($4,gender), handicap_index=coalesce($5,handicap_index), local_club=coalesce($7,local_club),
             last_sync_at=now(), last_sync_status='ok', last_sync_message=$6 where id=$1`,
    [accountId, g.player.txtkey, g.player.name, g.player.gender, g.player.handicap_index, msg, local]);
  if (last) onProgress({ stage: "done", done: list.length, total: list.length, list_total: list.length });
  return { account_id: accountId, club_name: clubName, ok: true, new_rounds: added, updated, pending, list_total: list.length, message: msg };
}

async function markRunning(accountId: string) {
  try {
    await q(`update club_account set last_sync_status='running', last_sync_started_at=now() where id=$1`, [accountId]);
  } catch (e) {
    if (!isUndefinedColumn(e, "last_sync_started_at")) throw e;
    await q(`update club_account set last_sync_status='running' where id=$1`, [accountId]);
  }
}

const busyResult = (): SyncResult => ({ ok: false, busy: true, new_rounds: 0, updated: 0, pending: 0, message: SYNC_BUSY_MESSAGE });

async function markError(accountId: string, e: unknown) {
  const msg = e instanceof GolfisticsError ? e.message : "No pudimos leer tus tarjetas. Probá de nuevo en unos minutos";
  await q(`update club_account set last_sync_at=now(), last_sync_status='error', last_sync_message=$2 where id=$1`, [accountId, msg]);
  return msg;
}

const loadAccount = async (id: string) =>
  (await q(`select a.*, c.base_url, c.name as club_display, c.id as cid, c.code as club_code from club_account a join club c on c.id=a.club_id where a.id=$1`, [id]))[0];

/**
 * Sync one account. App-source accounts sync their whole Golfistics App link (every club of that matrícula).
 * `password` is used in memory only; if absent, the stored encrypted one is used.
 */
export async function syncAccount(accountId: string, password?: string, budgetMs = 240_000, onProgress: OnProgress = () => {}, heldLease?: { token: string }): Promise<SyncResult> {
  const acc = await loadAccount(accountId);
  if (!acc) throw new Error("account not found");
  if (acc.source === "app") return syncAppLink(acc.user_id, acc.matricula, { password, budgetMs, onProgress, leaseToken: heldLease?.token });
  const t0 = Date.now();
  const pass = password ?? (acc.password_enc ? decryptSecret(acc.password_enc) : null);
  if (!pass) return { ok: false, new_rounds: 0, updated: 0, pending: 0, message: "Sin contraseña guardada: ingresala para actualizar" };
  // Golfistics App is the only sync path now: legacy site-linked accounts move to it as soon as the App login works
  try {
    const app = await new GolfisticsApp(acc.matricula, pass).login();
    // t166u: only move to the App when the App really serves this club (San Isidro players log in fine but get 0 clubs)
    if (appServesClub(await app.listClubs(), acc.club_code)) {
      await q(`update club_account set source='app' where id=$1`, [accountId]);
      return await syncAppLink(acc.user_id, acc.matricula, { password, app, budgetMs, onProgress });
    }
  } catch (e) {
    if (!(e instanceof GolfisticsError)) throw e; // App unreachable or rejected: fall back to the club site below
  }
  return syncSite(acc, pass, t0, budgetMs, onProgress, undefined, heldLease?.token);
}


/** Club-site route (the club's own login.php + the same read-only pages as the App SSO). `g` = an already logged-in client. */
async function syncSite(acc: any, pass: string, t0: number, budgetMs: number, onProgress: OnProgress, g0?: Golfistics, heldToken?: string): Promise<SyncResult> {
  const accountId = acc.id as string;
  const key = `site:${accountId}`;
  const token = heldToken ?? newLeaseToken();
  const lease = heldToken ? "acquired" as const : await claimLoginLease(q, key, token, String(acc.user_id), null);
  if (lease === "held") return busyResult();
  try {
    await markRunning(accountId);
    try {
      const tracker = new StatsTracker();
      const on: OnProgress = p => onProgress({ ...p, club: acc.club_display, club_index: 1, club_count: 1, club_code: acc.club_code ?? null, stats: tracker.snapshot() });
      on({ stage: "connect" });
      const g = g0 ?? await new Golfistics(acc.base_url, acc.matricula, pass).login();
      const r = await syncWithClient(acc, g, t0, budgetMs, on, true, tracker);
      await syncClubExtras(acc.user_id, accountId, g, { deadline: Math.min(t0 + 280_000, Date.now() + 30_000) });
      return { ok: true, new_rounds: r.new_rounds, updated: r.updated, pending: r.pending, message: r.message, clubs: [r] };
    } catch (e) {
      const msg = await markError(accountId, e);
      if (e instanceof GolfisticsError) return { ok: false, new_rounds: 0, updated: 0, pending: 0, message: msg };
      throw e;
    }
  } finally {
    if (!heldToken && lease === "acquired") await releaseLoginLease(q, key, token);
  }
}

/** Clubs a player can link directly on the club site (t166u). */
export const directClubs = () => q(`select id, name, code from club where direct_login order by name`);

/**
 * t166u: link one club through its own site (when Golfistics App lists no clubs for the matrícula, e.g. San Isidro).
 * The clave is checked live on the club's login.php before anything is stored; it is used in memory and only stored encrypted.
 * An existing App account for the same club + matrícula keeps syncing through the App.
 */
export async function linkSiteAccount(userId: string, clubId: number, matricula: string, password: string, savePassword: boolean,
  budgetMs = 240_000, onProgress: OnProgress = () => {}): Promise<SyncResult & { account_ids: string[] }> {
  const [club] = await q(`select id, base_url, name, code from club where id=$1 and direct_login`, [clubId]);
  if (!club) throw new GolfisticsError("bad_url", "Ese club no se puede vincular directo");
  const t0 = Date.now();
  onProgress({ stage: "connect", club: club.name, club_index: 1, club_count: 1, club_code: club.code ?? null });
  const g = await new Golfistics(club.base_url, matricula, password).login();   // throws login_failed before anything is stored
  if (club.code && g.club.club_code && g.club.club_code !== club.code) throw new GolfisticsError("login_failed", "Ese usuario es de otro club");
  let [acc] = await q(`select id, source from club_account where user_id=$1 and club_id=$2 and matricula=$3`, [userId, club.id, matricula]);
  if (!acc) [acc] = await q(`update club_account set user_id=$1 where id = (select id from club_account where user_id is null and club_id=$2 and matricula=$3 limit 1) and user_id is null returning id, source`, [userId, club.id, matricula]);
  if (!acc) [acc] = await q(`insert into club_account (user_id, club_id, matricula, source) values ($1,$2,$3,'site') returning id, source`, [userId, club.id, matricula]);
  await q(`update club_account set password_enc=$2 where id=$1`, [acc.id, savePassword ? encryptSecret(password) : null]);
  if (acc.source === "app") return { ...(await syncAccount(acc.id, password, budgetMs, onProgress)), account_ids: [acc.id] };
  const r = await syncSite(await loadAccount(acc.id), password, t0, budgetMs, onProgress, g);
  return { ...r, account_ids: [acc.id] };
}

/** Find or create the club row for an App club (by Golfistics code, else by the SSO base URL). */
async function ensureClub(cc: string, name: string, base: string) {
  let [club] = await q(`select * from club where code=$1 order by seeded desc, id limit 1`, [cc]);
  if (!club) [club] = await q(`select * from club where base_url=$1`, [base]);
  if (!club) [club] = await q(`insert into club (base_url, name, code) values ($1,$2,$3) on conflict (base_url) do update set code=coalesce(club.code, excluded.code) returning *`, [base, name, cc]);
  else if (!club.code) await q(`update club set code=$2 where id=$1`, [club.id, cc]);
  return club;
}

/** Find (or claim, or convert, or create) the user's App-source account for one club. */
export async function ensureAppAccount(userId: string, clubId: number, matricula: string, passwordEnc: string | null | undefined) {
  let [acc] = await q(`select id from club_account where user_id=$1 and club_id=$2 and matricula=$3`, [userId, clubId, matricula]);
  if (!acc) [acc] = await q(`update club_account set user_id=$1 where id = (select id from club_account where user_id is null and club_id=$2 and matricula=$3 limit 1) and user_id is null returning id`, [userId, clubId, matricula]);
  if (!acc) [acc] = await q(`insert into club_account (user_id, club_id, matricula, source) values ($1,$2,$3,'app') returning id`, [userId, clubId, matricula]);
  await q(`update club_account set source='app' where id=$1`, [acc.id]);
  if (passwordEnc !== undefined) await q(`update club_account set password_enc=$2 where id=$1`, [acc.id, passwordEnc]);
  return acc.id as string;
}

/**
 * Golfistics App link: one login, then SSO into every club listed for this matrícula and sync each one.
 * `savePassword`: true stores the clave (encrypted) on every account of the link, false clears it, undefined keeps
 * what is stored (and copies it onto newly found clubs).
 */
export async function syncAppLink(userId: string, matricula: string,
  o: { password?: string; savePassword?: boolean; budgetMs?: number; onProgress?: OnProgress; app?: GolfisticsApp; leaseToken?: string } = {}): Promise<SyncResult & { account_ids: string[] }> {
  const t0 = Date.now(), budgetMs = o.budgetMs ?? 240_000, onProgress = o.onProgress ?? (() => {});
  const linked = await q(`select id, password_enc, gender from club_account where user_id=$1 and matricula=$2 and source='app' order by created_at`, [userId, matricula]);
  const storedEnc = linked.find(a => a.password_enc)?.password_enc ?? null;
  const pass = o.password ?? (storedEnc ? decryptSecret(storedEnc) : null);
  const fail = (message: string) => ({ ok: false, new_rounds: 0, updated: 0, pending: 0, message, account_ids: linked.map(a => a.id) });
  if (!pass) return fail("Sin contraseña guardada: ingresala para actualizar");
  const leaseKey = `app:${userId}:${matricula}`;
  const leaseToken = o.leaseToken ?? newLeaseToken();
  const lease = o.leaseToken ? "acquired" as const : await claimLoginLease(q, leaseKey, leaseToken, userId, null);
  if (lease === "held") return { ...fail(SYNC_BUSY_MESSAGE), busy: true };
  try {
  const enc = o.savePassword === true ? encryptSecret(pass) : o.savePassword === false ? null : undefined;
  const gender = linked.find(a => a.gender)?.gender ?? null;
  onProgress({ stage: "connect", club: "tus clubes" });
  let app: GolfisticsApp;
  try { app = o.app ?? await new GolfisticsApp(matricula, pass).login(); await app.listClubs(); }
  catch (e) {
    const msg = e instanceof GolfisticsError ? e.message : "No pudimos leer tus tarjetas. Probá de nuevo en unos minutos";
    for (const a of linked) await markError(a.id, e);
    if (e instanceof GolfisticsError) return fail(msg);
    throw e;
  }
  if (!app.clubs.length) return fail(NO_APP_CLUBS);
  const results: ClubSyncResult[] = [], ids: string[] = [];
  const n = app.clubs.length, tracker = new StatsTracker();
  for (const [i, c] of app.clubs.entries()) {
    const tag = { club: c.name, club_index: i + 1, club_count: n, club_code: c.cc ?? null };
    const on: OnProgress = p => onProgress({ ...p, ...tag, stats: tracker.snapshot() });
    let accId: string | null = null;
    try {
      on({ stage: "connect" });
      const g = await app.openClub(c.cc, { gender });
      const club = await ensureClub(c.cc, c.name, g.base);
      accId = await ensureAppAccount(userId, club.id, matricula, enc !== undefined ? enc : storedEnc);
      ids.push(accId);
      await markRunning(accId);
      const acc = await loadAccount(accId);
      results.push(await syncWithClient(acc, g, t0, budgetMs, on, i === n - 1, tracker));
      await syncClubExtras(userId, accId, g, { deadline: Math.min(t0 + 280_000, Date.now() + 30_000) });   // bookings, official HI + playing handicap
    } catch (e) {
      const msg = accId ? await markError(accId, e) : e instanceof GolfisticsError ? e.message : "No pudimos leer tus tarjetas. Probá de nuevo en unos minutos";
      if (!(e instanceof GolfisticsError)) console.error("app sync error", c.cc, e instanceof Error ? e.message : "unknown");
      results.push({ account_id: accId ?? "", club_name: c.name, ok: false, new_rounds: 0, updated: 0, pending: 0, list_total: 0, message: msg });
    }
  }
  const okN = results.filter(r => r.ok).length;
  const added = results.reduce((s, r) => s + r.new_rounds, 0), pending = results.reduce((s, r) => s + r.pending, 0);
  const message = results.map(r => `${r.club_name}: ${r.message}`).join(" · ");
  return { ok: okN > 0, new_rounds: added, updated: results.reduce((s, r) => s + r.updated, 0), pending, message, clubs: results, account_ids: ids };
  } finally {
    if (!o.leaseToken && lease === "acquired") await releaseLoginLease(q, leaseKey, leaseToken);
  }
}
