/** Club extras read with the player's own club session (same pages on every club host of the platform):
 *  bookings + companions, official HI history, official playing handicap (compute-only calculator).
 *  READ-ONLY: GETs only, plus the calculator's compute submit (never txtaction, never bookings/cancel). Never logs cookies or claves.
 *  Each club and each page fails independently; status is kept in club_page_status. */
import { partnerKey } from "./private-metrics-core";
import { q } from "./db";
import { Golfistics, GolfisticsError } from "./golfistics";
import { parseBookings, parseCompanions, parseEvents, verifiedCourse, inferDate, parseCalcForm, parseCalcResult, CALC_MODALITIES } from "./club-pages";
import { titleCase } from "./course-names";
import { nowAR } from "./tee-times-core";

type Page = "bookings" | "companions" | "hi_history" | "calculator";
async function status(accId: string, page: Page, st: "ok" | "empty" | "missing" | "error", message: string | null, items: number | null = null) {
  const fresh = st === "ok" || st === "empty";
  await q(`insert into club_page_status (club_account_id, page, status, message, items, checked_at) values ($1,$2,$3,$4,$5,case when $6 then now() else null end)
           on conflict (club_account_id, page) do update set status=excluded.status, message=excluded.message, items=excluded.items,
             checked_at=case when $6 then now() else club_page_status.checked_at end`, [accId, page, st, message, items, fresh]);
}
const failKind = (e: unknown) => (e instanceof GolfisticsError && /\b404\b/.test(e.message) ? "missing" : "error");
const failMsg = (e: unknown) => (e instanceof GolfisticsError ? e.message : "Error leyendo la página del club").slice(0, 160);
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

async function dirFor(clubId: number) {
  const [c] = await q(`select d.key, d.name, (select value from ar_club_override o where o.club_key=d.key and o.field='name') ov from ar_club_directory d where d.golflet_club_id=$1 limit 1`, [clubId]).catch(() => []);
  const [g] = await q(`select name from club where id=$1`, [clubId]);
  const ov = c?.ov ? (typeof c.ov === "string" ? c.ov : c.ov?.value) : null;
  return { club_key: c?.key ?? null, club_name: titleCase(ov || c?.name || g?.name || "Club") };
}
async function courseDir(clubKey: string | null, clubId: number, course: string | null) {
  if (!clubKey || !course) return null;
  const [r] = await q(`select id from ar_course_directory where club_key=$1 and golflet_club_id=$2 and lower(golflet_course_name)=lower($3) limit 1`, [clubKey, clubId, course]).catch(() => []);
  return r?.id ?? null;
}

/** Bookings for one club account: upsert by TorneoID. t137u: kept forever; a future booking that disappears is marked gone_at (cancelled), never deleted.
 *  Returns whether misreservas.php was actually read. A failure does not move checked_at. */
export async function syncBookings(userId: string, acc: { id: string; club_id: number }, g: Golfistics, courses: string[], o: { light?: boolean } = {}): Promise<"ok" | "empty" | "error"> {
  let html: string;
  try { html = await g.req("GET", "misreservas.php"); } catch (e) { await status(acc.id, "bookings", failKind(e), failMsg(e)); return "error"; }
  const b = parseBookings(html);
  if (!b.recognized) { await status(acc.id, "bookings", "error", "La página de reservas no tiene el formato esperado"); return "error"; }
  const today = nowAR().date, dir = await dirFor(acc.club_id);
  let events = new Map<string, any>();
  if (b.rows.length) { try { events = parseEvents(await g.req("GET", "torneoshabilitadosparareservas.php")); } catch { /* date falls back to weekday + day */ } }
  const me = b.player_header ? norm(b.player_header) : null, keep: string[] = [];
  let compOk = 0, compFail = 0;
  for (const r of b.rows) {
    const ev = events.get(r.torneo_id), date = ev?.date ?? inferDate(r.weekday, r.day, today);
    if (!date) continue;
    const cf = verifiedCourse({ venue: ev?.venue ?? null }, courses);
    let companions: { name: string; hcp: number | null }[] = [];
    // t242u light check (home open): a booking we already have keeps its stored companions (the daily sync refreshes them); only new ones open their line page
    const known = o.light ? (await q(`select companions from tee_time where user_id=$1 and club_account_id=$2 and external_id=$3 and gone_at is null`, [userId, acc.id, `${r.torneo_id}@${r.time}`]))[0] : null;
    if (known && Array.isArray(known.companions)) { companions = known.companions; compOk++; }
    else try {
      const c = parseCompanions(await g.req("GET", `misjugadoresporlinea.php?TorneoID=${encodeURIComponent(r.torneo_id)}&PlayerID=${encodeURIComponent(r.player_id)}`));
      if (c.recognized) { companions = c.players.filter(p => !me || !(norm(p.name).startsWith(me) || me.startsWith(norm(p.name)))).slice(0, 7); compOk++; } else compFail++;
    } catch { compFail++; }
    const ext = `${r.torneo_id}@${r.time}`; keep.push(ext);
    await q(`insert into tee_time (user_id, date, time, club_key, course_id, club_name, course_label, companions, source, club_account_id, external_id, start_hole, modality, event_name, course_how, partner_keys, seen_at, updated_at)
             values ($1,$2,$3,$4,$5,$6,$7,$8,'club',$9,$10,$11,$12,$13,$14,$15,now(),now())
             on conflict (user_id, club_account_id, external_id) do update set date=excluded.date, time=excluded.time, club_key=excluded.club_key, course_id=excluded.course_id,
               club_name=excluded.club_name, course_label=excluded.course_label, companions=excluded.companions, start_hole=excluded.start_hole, modality=excluded.modality,
               event_name=excluded.event_name, course_how=excluded.course_how, partner_keys=excluded.partner_keys, gone_at=null, seen_at=now(), updated_at=case when tee_time.companions is distinct from excluded.companions or tee_time.time<>excluded.time then now() else tee_time.updated_at end`,
      [userId, date, r.time, dir.club_key, await courseDir(dir.club_key, acc.club_id, cf.course), dir.club_name, cf.course, JSON.stringify(companions), acc.id, ext, r.start_hole, ev?.modality ?? null, ev?.event ?? null, cf.how, companions.map(c => partnerKey(c.name)).filter(Boolean)]);
  }
  const nt = nowAR().time;   // only bookings still in the future count as cancelled (past ones simply leave the club page once played)
  await q(`update tee_time set gone_at=now() where club_account_id=$1 and source='club' and gone_at is null and (date > $2::date or (date = $2::date and time > $4)) and not (external_id = any($3::text[]))`, [acc.id, today, keep, nt]);
  const outcome = b.rows.length ? "ok" : "empty";
  await status(acc.id, "bookings", outcome, b.none ? "Sin reservas próximas" : null, b.rows.length);
  if (b.rows.length) await status(acc.id, "companions", compFail && !compOk ? "error" : "ok", compFail ? `${compFail} sin leer` : null, compOk);
  return outcome;
}

async function syncHi(acc: { id: string }, g: Golfistics) {
  try {
    const hh = await g.hiHistoryFull();
    for (const h of hh) await q(`insert into hi_history (club_account_id,date,club,hi) values ($1,$2,$3,$4) on conflict (club_account_id,date) do update set hi=excluded.hi, club=excluded.club`, [acc.id, h.date, h.club, h.hi]);
    await status(acc.id, "hi_history", hh.length ? "ok" : "empty", null, hh.length);
  } catch (e) { await status(acc.id, "hi_history", failKind(e), failMsg(e)); }
}

/** Official playing handicap per tee × modality for the player's courses (+ booked ones). Cached; refreshed when the index changes or after 20 h. */
async function syncCalculator(acc: { id: string; club_id: number; gender: string | null }, g: Golfistics, courses: string[], deadline: number) {
  let form; try { form = parseCalcForm(await g.req("GET", "calculadorahcpjuego.php")); } catch (e) { await status(acc.id, "calculator", failKind(e), failMsg(e)); return; }
  if (!form.recognized || !form.j1) { await status(acc.id, "calculator", "error", "La calculadora no tiene el formato esperado"); return; }
  const want = new Set(courses.map(norm));
  let opts = form.options.filter(o => want.has(norm(o.course)));
  if (!opts.length) opts = form.options;
  if (acc.gender === "C" || acc.gender === "D") opts = opts.filter(o => o.gender === acc.gender);
  const hiNow = g.player.handicap_index;
  const [fresh] = await q(`select count(*)::int n, min(fetched_at) > now() - interval '20 hours' ok, bool_and(hi is not distinct from $2::real) same from playing_hcp where club_account_id=$1`, [acc.id, hiNow]);
  if (fresh?.n && fresh.ok && fresh.same) { await status(acc.id, "calculator", "ok", "en caché", fresh.n); return; }
  const jobs = opts.flatMap(o => CALC_MODALITIES.map(m => ({ o, m }))); let done = 0, failed = 0;
  const run = async ({ o, m }: { o: any; m: string }) => {
    if (Date.now() > deadline) { failed++; return; }
    try {
      const r = parseCalcResult(await g.req("POST", "calculadorahcpjuego.php", { TorneoID: "", txtaction: "", HandicapIndex: "", SexoAAG: "", modalidad: m, CanchaSalida: o.id, hcpporc: "100", J1: form!.j1!, grabar: "CALCULAR HANDICAP" }));
      if (r.playing_hcp == null) { failed++; return; }
      await q(`insert into playing_hcp (club_account_id, option_id, course, tee, gender, modality, hi, playing_hcp, slope, course_rating, par, fetched_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
               on conflict (club_account_id, option_id, course, modality) do update set tee=excluded.tee, gender=excluded.gender, hi=excluded.hi, playing_hcp=excluded.playing_hcp, slope=excluded.slope, course_rating=excluded.course_rating, par=excluded.par, fetched_at=now()`,
        [acc.id, o.id, o.course, o.tee, o.gender, m, r.hi ?? hiNow, r.playing_hcp, r.slope, r.course_rating, r.par]);
      done++;
    } catch { failed++; }
  };
  for (let i = 0; i < jobs.length; i += 3) await Promise.all(jobs.slice(i, i + 3).map(run));
  await status(acc.id, "calculator", done ? "ok" : "error", failed ? `${failed} de ${jobs.length} sin calcular` : null, done);
}

/** Everything above for one linked club. Never throws (the card sync must not fail because of extras). */
export async function syncClubExtras(userId: string, accountId: string, g: Golfistics, opts: { deadline?: number } = {}) {
  try {
    const [acc] = await q(`select id, club_id, gender from club_account where id=$1 and user_id=$2`, [accountId, userId]); if (!acc) return;
    const courses = (await q(`select name from course where club_id=$1`, [acc.club_id])).map((c: any) => c.name as string);
    const deadline = opts.deadline ?? Date.now() + 40_000;
    await syncBookings(userId, acc, g, courses);
    await syncHi(acc, g);
    const booked = (await q(`select distinct course_label from tee_time where club_account_id=$1 and course_label is not null`, [acc.id])).map((r: any) => r.course_label as string);
    await syncCalculator({ ...acc, gender: acc.gender ?? g.player.gender ?? null }, g, [...new Set([...courses, ...booked])], deadline);
  } catch (e) { console.error("club extras error", e instanceof Error ? e.message.slice(0, 120) : "unknown"); }
}
