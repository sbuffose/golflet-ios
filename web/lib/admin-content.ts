import { clubNames, namingFields } from "./course-names";
import { readCourse, dailyEnabled } from "./gps-daily";
/** Admin: users, roles, clubs, course-card corrections, GPS green overrides, settings, audit. Never selects claves, cookies, tokens or IPs. */
import { q } from "./db";
import { HttpError, type SessionUser } from "./http";
import { audit, ROLES, type Role } from "./admin";
import { listAccounts, visibleRoundIds } from "./data";
import { PLATFORM_SQL, TZ } from "./admin-metrics";
import { applyHolesOverride, buildOverride, cardWarning, parTotal, type GreenFix } from "./course-override";
import { CLUB_LOGOS, clubInitials } from "./club-logos";
import { greenWarnings, matchVmCourse, slug, type VmHole } from "./viewmaster-parse";
import { haversine, validLatLng } from "./geo";
import { getAllCanchas, getVmCourse, TTL_MS } from "./viewmaster";
import { serverAiEnabled } from "./ai";

const UID = /^[A-Za-z0-9_-]{8,64}$/;
const checkUid = (id: string) => { if (!UID.test(id || "")) throw new HttpError(404, "Usuario no encontrado"); return id; };

/* ---------------- users ---------------- */
/** Placeholder accounts (pending profesores) never expose their internal address: the UI shows "Sin email". */
export const PLACEHOLDER_EMAIL = /@pending\.golflet\.invalid$/i;
/** kind: admin | editor | profesor | prueba | jugador (one primary kind for the admin list; panel role wins, then profesor). */
function adminUserShape(u: any) {
  const placeholder = PLACEHOLDER_EMAIL.test(u.email || "");
  const kind = u.role === "admin" || u.role === "editor" ? u.role : u.prof_status ? "profesor" : u.test ? "prueba" : "jugador";
  const { prof_status, prof_verified, prof_name, ...rest } = u;
  return { ...rest, name: u.name || prof_name || null, email: placeholder ? null : u.email, kind,
    profesor: prof_status ? { status: prof_status, verified: !!prof_verified } : null };
}
export async function listUsers(search: string | null, includeTest: boolean) {
  const P: unknown[] = [includeTest]; let w = "";
  if (search) { P.push(`%${search.slice(0, 80)}%`); w = ` and (u.name ilike $2 or u.email ilike $2 or pp.display_name ilike $2)`; }
  const rows = await q(`select u.id, u.name, u.email, u."createdAt" created_at, r.role, (u.email ilike '%@example.com') test,
      pp.account_status prof_status, pp.verified prof_verified, pp.display_name prof_name,
      (select count(*)::int from club_account a where a.user_id=u.id) links,
      (select string_agg(distinct c.name, ' · ') from club_account a join club c on c.id=a.club_id where a.user_id=u.id) clubs,
      (select max(a.last_sync_at) from club_account a where a.user_id=u.id) last_sync,
      (select count(*)::int from round x join club_account a on a.id=x.club_account_id where a.user_id=u.id) rounds_stored,
      (select max(s."updatedAt") from session s where s."userId"=u.id) last_seen,
      (select string_agg(distinct ${PLATFORM_SQL(`s."userAgent"`)}, ' · ') from session s where s."userId"=u.id) platforms
    from "user" u left join user_role r on r.user_id=u.id left join profesor_profile pp on pp.user_id=u.id
    where ($1::boolean or u.email not ilike '%@example.com' or r.role is not null) ${w} order by u."createdAt" desc limit 500`, P);
  return rows.map(adminUserShape);
}

export async function userDetail(id: string) {
  checkUid(id);
  const [u] = await q(`select u.id, u.name, u.email, u."emailVerified" email_verified, u."createdAt" created_at, r.role, r.granted_at, g.email granted_by
    from "user" u left join user_role r on r.user_id=u.id left join "user" g on g.id=r.granted_by where u.id=$1`, [id]);
  if (!u) throw new HttpError(404, "Usuario no encontrado");
  if (PLACEHOLDER_EMAIL.test(u.email || "")) u.email = null;
  const [pf] = await q(`select p.display_name, p.account_status status, p.verified, p.active, p.created_via, p.claimed_at, p.verified_by, p.locations, p.aag_matricula, p.created_at,
      (select count(*)::int from player_profesor x where x.profesor_id=p.user_id) players, (select count(*)::int from player_profesor x where x.profesor_id=p.user_id and x.can_view_metrics) sharing
    from profesor_profile p where p.user_id=$1`, [id]);
  const accounts = (await listAccounts(id)).map((a: any) => ({ id: a.id, club_id: a.club_id, club_name: a.club_name, club_code: a.club_code, source: a.source, matricula: a.matricula, player_name: a.player_name,
    handicap_index: a.handicap_index == null ? null : Number(a.handicap_index), clave_guardada: !!a.password_saved, last_sync_at: a.last_sync_at, last_sync_status: a.last_sync_status, last_sync_message: a.last_sync_message,
    rounds_stored: a.rounds_stored, rounds_visible: a.rounds, rounds_with_holes: a.rounds_with_holes }));
  const sessions = await q(`select ${PLATFORM_SQL(`"userAgent"`)} platform, case when "userAgent" ~ '^Golflet/\\d+' then substring("userAgent" from '^Golflet/(\\d+)') end app_build,
      "createdAt" created_at, "updatedAt" last_seen, "expiresAt" expires_at from session where "userId"=$1 order by "updatedAt" desc`, [id]);
  const [c] = await q(`select (select count(*)::int from live_round where user_id=$1) live_rounds, (select count(*)::int from shot where user_id=$1) shots,
      (select count(*)::int from round_recap where user_id=$1) recaps, (select count(*)::int from round_note where user_id=$1) notes,
      (select count(*)::int from club_sample where user_id=$1) samples, (select jsonb_array_length(clubs) from bag where user_id=$1) bag_items,
      (select clubs from player_clubs where user_id=$1) player_clubs`, [id]);
  const keep = await visibleRoundIds(id);
  const byCourse = await q(`select r.id, coalesce(r.data->>'club_played', c.name) club_played, r.course, r.date::text date, (r.data->>'gross')::int gross from round r join club_account a on a.id=r.club_account_id join club c on c.id=a.club_id where a.user_id=$1`, [id]);
  const agg = new Map<string, { club_played: string; course: string; rounds: number; best: number | null; last: string }>();
  for (const r of byCourse) { if (!keep.has(r.id)) continue; const k = `${r.club_played}|${r.course}`; const x = agg.get(k) || { club_played: r.club_played, course: r.course, rounds: 0, best: null, last: "" };
    x.rounds++; if (r.gross && (x.best == null || r.gross < x.best)) x.best = r.gross; if (r.date > x.last) x.last = r.date; agg.set(k, x); }
  const syncs = await q(`select created_at, trigger, ok, new_rounds, message from sync_log where user_id=$1 order by created_at desc limit 15`, [id]);
  const hi = await q(`select h.date::text date, h.hi::float hi, h.club from hi_history h join club_account a on a.id=h.club_account_id where a.user_id=$1 order by h.date desc limit 1`, [id]);
  const auditRows = await q(`select created_at, actor_email, action, summary from admin_audit where target_type='user' and target_id=$1 order by created_at desc limit 20`, [id]);
  return { user: u, profesor: pf ?? null, accounts, sessions, counts: { ...c, rounds_visible: keep.size, rounds_stored: byCourse.length }, rounds_by_course: [...agg.values()].sort((a, b) => b.rounds - a.rounds),
    syncs, last_hi: hi[0] ?? null, audit: auditRows };
}

/* ---------------- roles ---------------- */
export async function listRoles() {
  return q(`select r.user_id, u.name, u.email, r.role, r.granted_at, g.email granted_by from user_role r join "user" u on u.id=r.user_id left join "user" g on g.id=r.granted_by order by r.role, r.granted_at`);
}
async function findUser(b: any) {
  if (b?.user_id) { const [u] = await q(`select id, email, name from "user" where id=$1`, [checkUid(String(b.user_id))]); if (u) return u; }
  if (b?.email) { const [u] = await q(`select id, email, name from "user" where lower(email)=lower($1)`, [String(b.email).trim().slice(0, 200)]); if (u) return u; }
  throw new HttpError(404, "No hay ningún usuario de Golflet con ese email");
}
export async function grantRole(actor: SessionUser, b: any) {
  const role = String(b?.role || "") as Role; if (!ROLES.includes(role)) throw new HttpError(400, "Rol inválido (admin o editor)");
  const t = await findUser(b);
  const [cur] = await q(`select role from user_role where user_id=$1`, [t.id]);
  if (cur?.role === role) return { user_id: t.id, role, changed: false };
  if (t.id === actor.id && cur?.role === "admin") throw new HttpError(409, "No podés bajarte tu propio rol de admin");
  await q(`insert into user_role (user_id, role, granted_by) values ($1,$2,$3) on conflict (user_id) do update set role=excluded.role, granted_by=excluded.granted_by, granted_at=now()`, [t.id, role, actor.id]);
  await audit(actor, cur ? "role.change" : "role.grant", { type: "user", id: t.id }, `${cur ? "Cambió el rol" : "Dio el rol"} ${role} a ${t.email}${cur ? ` (antes: ${cur.role})` : ""}`, { email: t.email, before: cur?.role ?? null, after: role });
  return { user_id: t.id, role, changed: true };
}
export async function revokeRole(actor: SessionUser, userId: string) {
  checkUid(userId);
  if (userId === actor.id) throw new HttpError(409, "No podés quitarte tu propio acceso de admin");
  const [cur] = await q(`select r.role, u.email from user_role r join "user" u on u.id=r.user_id where r.user_id=$1`, [userId]);
  if (!cur) return { ok: true, changed: false };
  if (cur.role === "admin") { const [n] = await q(`select count(*)::int n from user_role where role='admin'`); if (n.n <= 1) throw new HttpError(409, "Tiene que quedar al menos un admin"); }
  await q(`delete from user_role where user_id=$1`, [userId]);
  await audit(actor, "role.revoke", { type: "user", id: userId }, `Quitó el rol ${cur.role} a ${cur.email}`, { email: cur.email, before: cur.role, after: null });
  return { ok: true, changed: true };
}

/* ---------------- clubs + crests ---------------- */
export async function clubLogoUrl(code: string | null | undefined, uploaded?: Date | string | null) {
  if (!code) return null;
  if (uploaded === undefined) { const [r] = await q(`select updated_at from club_logo where club_code=$1`, [String(code)]); uploaded = r?.updated_at ?? null; }
  if (uploaded) return `/api/club-logo/${code}?v=${+new Date(uploaded)}`;
  return CLUB_LOGOS[String(code)] || null;
}
export async function listClubs() {
  const rows = await q(`select c.id, c.name, c.code, c.base_url, c.seeded, c.created_at, l.updated_at logo_at,
      (select count(*)::int from club_account a where a.club_id=c.id and a.user_id is not null) links,
      (select count(distinct a.user_id)::int from club_account a where a.club_id=c.id) users,
      (select count(*)::int from course co where co.club_id=c.id) courses,
      (select count(*)::int from round r join club_account a on a.id=r.club_account_id where a.club_id=c.id) rounds,
      (select count(*)::int from vm_course v where v.club_code=c.code) gps_courses
    from club c left join club_logo l on l.club_code=c.code order by rounds desc, c.id`);
  return Promise.all(rows.map(async (c: any) => ({ ...c, logo: await clubLogoUrl(c.code, c.logo_at), logo_source: c.logo_at ? "subido" : c.code && CLUB_LOGOS[c.code] ? "incluido" : "monograma", initials: clubInitials(c.name) })));
}
export async function updateClub(actor: SessionUser, id: number, b: any) {
  const [c] = await q(`select id, name from club where id=$1`, [id]); if (!c) throw new HttpError(404, "Club no encontrado");
  const name = String(b?.name ?? "").trim(); if (name.length < 2 || name.length > 120) throw new HttpError(400, "Nombre inválido (2–120 caracteres)");
  if (name === c.name) return { changed: false };
  await q(`update club set name=$2 where id=$1`, [id, name]);
  await audit(actor, "club.update", { type: "club", id }, `Renombró el club "${c.name}" a "${name}"`, { before: c.name, after: name });
  return { changed: true };
}
const MAGIC: [string, (b: Buffer) => boolean][] = [["image/png", b => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ["image/jpeg", b => b[0] === 0xff && b[1] === 0xd8], ["image/webp", b => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP"]];
export async function setClubLogo(actor: SessionUser, id: number, b: any) {
  const [c] = await q(`select id, name, code from club where id=$1`, [id]); if (!c) throw new HttpError(404, "Club no encontrado");
  if (!c.code) throw new HttpError(409, "Este club todavía no tiene código de Golfistics; el escudo se asocia al código");
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b?.data_url || ""));
  if (!m) throw new HttpError(400, "Subí un PNG, JPG o WebP");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 600_000) throw new HttpError(413, "La imagen pesa más de 600 KB");
  const kind = MAGIC.find(([, t]) => t(buf))?.[0]; if (!kind) throw new HttpError(400, "El archivo no es una imagen válida");
  await q(`insert into club_logo (club_code, mime, data, updated_by) values ($1,$2,$3,$4) on conflict (club_code) do update set mime=excluded.mime, data=excluded.data, updated_by=excluded.updated_by, updated_at=now()`, [c.code, kind, buf, actor.id]);
  await audit(actor, "club.logo", { type: "club", id }, `Subió el escudo de ${c.name}`, { bytes: buf.length, mime: kind });
  return { logo: await clubLogoUrl(c.code) };
}
export async function clearClubLogo(actor: SessionUser, id: number) {
  const [c] = await q(`select id, name, code from club where id=$1`, [id]); if (!c) throw new HttpError(404, "Club no encontrado");
  const r = await q(`delete from club_logo where club_code=$1 returning club_code`, [c.code]);
  if (r.length) await audit(actor, "club.logo_reset", { type: "club", id }, `Volvió al escudo original de ${c.name}`);
  return { logo: await clubLogoUrl(c.code, null) };
}

/* ---------------- course cards (holes, pars, yardages) ---------------- */
async function vmFor(code: string | null, name: string) {
  if (!code) return null;
  const vms = await q(`select vm_course, holes, osm, green_override from vm_course where club_code=$1`, [code]);
  const vm = matchVmCourse(name, vms.map((v: any) => v.vm_course)); return vms.find((v: any) => v.vm_course === vm) || null;
}
export async function listCourseCards() {
  const rows = await q(`select co.club_id, c.name club_name, c.code, co.name, co.par, co.as_of::text as_of, co.holes, co.holes_override, co.override_note, co.override_at, u.email override_by
    from course co join club c on c.id=co.club_id left join "user" u on u.id=co.override_by order by c.id, co.name`);
  return rows.map((r: any) => { const eff = applyHolesOverride(r.holes, r.holes_override);
    return { club_id: r.club_id, club_name: r.club_name, club_code: r.code, name: r.name, par: parTotal(eff) ?? r.par, synced_par: r.par, as_of: r.as_of, holes: (r.holes || []).length,
      tees: Object.keys(r.holes?.[0]?.yards || {}), corrected_holes: Object.keys(r.holes_override || {}).length, warnings: eff.filter((h: any) => cardWarning(h.par, h.yards)).length,
      override_note: r.override_note, override_at: r.override_at, override_by: r.override_by }; });
}
export async function courseCard(clubId: number, name: string) {
  const [r] = await q(`select co.*, co.as_of::text as_of, c.name club_name, c.code, u.email override_by_email from course co join club c on c.id=co.club_id left join "user" u on u.id=co.override_by where co.club_id=$1 and co.name=$2`, [clubId, name]);
  if (!r) throw new HttpError(404, "Cancha no encontrada");
  const vm = await vmFor(r.code, r.name);
  const ov = r.holes_override || {};
  const greens: Record<number, VmHole> = {}; if (vm) for (const h of vm.holes as VmHole[]) greens[h.hole] = { ...h, ...((vm.green_override || {})[String(h.hole)] || {}) };
  const holes = (r.holes || []).map((h: any) => {
    const f = ov[String(h.hole)] || null, eff = applyHolesOverride([h], f ? { [String(h.hole)]: f } : null)[0] as any;
    const tee = vm?.osm?.holes?.[String(h.hole)]?.tee || null, g = greens[h.hole];
    const gps = tee && g ? Math.round(haversine(tee, g.center) / 0.9144) : null;
    return { hole: h.hole, synced: { par: h.par, hcp: h.hcp, yards: h.yards, par_raw: h.par_raw, hcp_raw: h.hcp_raw }, override: f, effective: { par: eff.par, hcp: eff.hcp, yards: eff.yards },
      warning: cardWarning(eff.par, eff.yards), synced_warning: cardWarning(h.par, h.yards), gps_tee_to_center_yd: gps };
  });
  return { club_id: r.club_id, club_name: r.club_name, club_code: r.code, name: r.name, as_of: r.as_of, tees: r.tees, par: parTotal(holes.map((h: any) => h.effective)) ?? r.par, synced_par: r.par,
    vm_course: vm?.vm_course ?? null, gps_course_id: vm ? slug(r.code, vm.vm_course) : null, gps_note: vm ? (vm.osm ? "Yardas GPS: salida de OpenStreetMap al centro del green (aprox., sirve para detectar datos cruzados)." : "Sin salidas en el mapa: no hay yardas GPS.") : "Sin geometría GPS para esta cancha.",
    override_note: r.override_note, override_at: r.override_at, override_by: r.override_by_email, holes };
}
export async function saveCourseCard(actor: SessionUser, clubId: number, name: string, b: any) {
  const [r] = await q(`select holes, holes_override from course where club_id=$1 and name=$2`, [clubId, name]); if (!r) throw new HttpError(404, "Cancha no encontrada");
  const ov = buildOverride(r.holes || [], b?.holes ?? []);
  const note = b?.note == null ? null : String(b.note).slice(0, 500);
  const empty = !Object.keys(ov).length;
  await q(`update course set holes_override=$3, override_note=$4, override_by=$5, override_at=now() where club_id=$1 and name=$2`, [clubId, name, empty ? null : JSON.stringify(ov), note, actor.id]);
  const changed = [...new Set([...Object.keys(ov), ...Object.keys(r.holes_override || {})])].filter(k => JSON.stringify(ov[k] ?? null) !== JSON.stringify((r.holes_override || {})[k] ?? null)).map(Number).sort((a, b) => a - b);
  await audit(actor, empty ? "course.override_clear" : "course.override", { type: "course_card", id: `${clubId}:${name}` },
    empty ? `Volvió la tarjeta de ${name} a los datos de Golfistics` : `Corrigió la tarjeta de ${name}: hoyos ${changed.join(", ") || "sin cambios"}`, { before: r.holes_override || null, after: empty ? null : ov, note });
  return courseCard(clubId, name);
}

/* ---------------- GPS greens ---------------- */
export async function listGps() {
  const rows = await q(`select v.club_code, v.vm_course, v.holes, v.green_override, (v.osm is not null) has_osm, v.fetched_at, v.override_at, u.email override_by, v.daily_read, v.review,
      (select row_to_json(x) from (select started_at, status, changed_holes, message from gps_read_run g where g.club_code=v.club_code and g.vm_course=v.vm_course order by started_at desc limit 1) x) last_run,
      (select name from club where code=v.club_code order by seeded desc, id limit 1) club_name from vm_course v left join "user" u on u.id=v.override_by order by v.club_code, v.vm_course`);
  let all: { club_code: string; vm_course: string }[] = []; try { all = await getAllCanchas(); } catch { all = []; }
  const names = await clubNames([...new Set(rows.map((r: any) => r.club_code as string))]);
  return rows.map((r: any) => { const sib = all.filter(c => c.club_code === r.club_code).map(c => c.vm_course), siblings = sib.length ? sib : rows.filter((x: any) => x.club_code === r.club_code).map((x: any) => x.vm_course);
    const n = namingFields(r.club_code, r.vm_course, siblings, { ...names.get(r.club_code), golflet: names.get(r.club_code)?.golflet || r.club_name });
    return { course_id: slug(r.club_code, r.vm_course), ...n, vm_course: r.vm_course, holes: (r.holes || []).length, has_osm: r.has_osm,
    overridden_holes: Object.keys(r.green_override || {}).length, warnings: greenWarnings(r.holes || []).length, fetched_at: r.fetched_at, stale: !r.fetched_at || Date.now() - +new Date(r.fetched_at) > TTL_MS,
    override_at: r.override_at, override_by: r.override_by, daily_read: !!r.daily_read, review_holes: Object.keys(r.review || {}).length,
    last_run_at: r.last_run?.started_at ?? null, last_run_status: r.last_run?.status ?? null, last_run_changed: r.last_run?.changed_holes ?? 0 }; });
}
async function vmRow(courseId: string) {
  const m = /^(\d{1,5})-[a-z0-9-]{1,80}$/.exec(courseId || ""); if (!m) throw new HttpError(404, "Cancha no encontrada");
  const rows = await q(`select * from vm_course where club_code=$1`, [m[1]]);
  const r = rows.find((x: any) => slug(x.club_code, x.vm_course) === courseId); if (!r) throw new HttpError(404, "Cancha no encontrada (todavía no se leyó de Golfistics)");
  return r;
}
export async function gpsCourse(courseId: string) {
  const r = await vmRow(courseId);
  const [club] = await q(`select name from club where code=$1 order by seeded desc, id limit 1`, [r.club_code]);
  const ov = r.green_override || {};
  const holes = (r.holes as VmHole[]).map(h => { const f = ov[String(h.hole)] || null; const eff = { front: f?.front ?? h.front, center: f?.center ?? h.center, back: f?.back ?? h.back };
    return { hole: h.hole, golfistics: { front: h.front, center: h.center, back: h.back }, override: f, effective: eff, tee: r.osm?.holes?.[String(h.hole)]?.tee ?? null,
      depth_m: Math.round(haversine(eff.front, eff.back)), warning: greenWarnings([{ hole: h.hole, ...eff }])[0] ?? null }; });
  let all: { club_code: string; vm_course: string }[] = []; try { all = await getAllCanchas(); } catch { all = []; }
  const sib = all.filter(c => c.club_code === r.club_code).map(c => c.vm_course);
  const n = namingFields(r.club_code, r.vm_course, sib.length ? sib : [r.vm_course], { ...(await clubNames([r.club_code])).get(r.club_code), golflet: club?.name ?? null });
  const runs = await q(`select id, trigger, actor_email, started_at, finished_at, status, changed_holes, conflicts, message from gps_read_run where course_id=$1 order by started_at desc limit 10`, [courseId]);
  return { daily_read: !!r.daily_read, daily_global: await dailyEnabled(), review: r.review || {}, last_run: runs[0] ?? null, runs, course_id: courseId, ...n, vm_course: r.vm_course, fetched_at: r.fetched_at, has_osm: !!r.osm, override_at: r.override_at, holes };
}
export async function setGreen(actor: SessionUser, courseId: string, hole: number, b: any) {
  const r = await vmRow(courseId); const base = (r.holes as VmHole[]).find(h => h.hole === hole); if (!base) throw new HttpError(404, "Hoyo no encontrado");
  const fix: GreenFix = {};
  for (const k of ["front", "center", "back"] as const) {
    const v = b?.[k]; if (v == null) continue;
    const p = validLatLng(v.lat, v.lng); if (!p) throw new HttpError(400, `Coordenada inválida (${k})`);
    if (haversine(p, base.center) > 1500) throw new HttpError(400, `El punto (${k}) queda a más de 1,5 km del green original: revisalo`);
    const o = (base as any)[k]; if (Math.abs(o.lat - p.lat) > 1e-7 || Math.abs(o.lng - p.lng) > 1e-7) fix[k] = { lat: +p.lat.toFixed(7), lng: +p.lng.toFixed(7) };
  }
  const ov = { ...(r.green_override || {}) }; const before = ov[String(hole)] ?? null;
  if (Object.keys(fix).length) ov[String(hole)] = fix; else delete ov[String(hole)];
  await q(`update vm_course set green_override=$3, override_by=$4, override_at=now() where club_code=$1 and vm_course=$2`, [r.club_code, r.vm_course, Object.keys(ov).length ? JSON.stringify(ov) : null, actor.id]);
  await audit(actor, Object.keys(fix).length ? "green.override" : "green.override_clear", { type: "gps_course", id: courseId },
    Object.keys(fix).length ? `Corrigió el green del hoyo ${hole} (${Object.keys(fix).map(k => ({ front: "frente", center: "centro", back: "fondo" } as any)[k]).join(", ")}) en ${r.vm_course}` : `Volvió el green del hoyo ${hole} de ${r.vm_course} a Golfistics`,
    { hole, before, after: Object.keys(fix).length ? fix : null });
  return gpsCourse(courseId);
}
/** Re-read greens from Golfistics (read-only public endpoint, respects the cache retry window). Overrides are kept. */
export async function refreshGps(actor: SessionUser, courseId: string) {
  const r = await vmRow(courseId);
  const run = await readCourse(r.club_code, r.vm_course, "manual", actor.email);   // same read-only path as the daily cron; audited inside
  return { ...(await gpsCourse(courseId)), run };
}

/* ---------------- settings (read-only) ---------------- */
export function settings() {
  return {
    flags: [
      { key: "RECAP_SERVER_AI", label: "Transcripción de audios en el servidor", value: serverAiEnabled() ? "on" : "off", on: serverAiEnabled(),
        help: "Apagado: los audios post ronda se transcriben y resumen en el iPhone (Apple Speech + Foundation Models). Se cambia solo en Vercel (variable de entorno); desde acá no se toca." },
    ],
    fixed: [
      { label: "Sincronización automática", value: "Todos los días 06:00 (hora Argentina)", help: "Vercel Cron, /api/cron/sync. Solo vínculos con clave guardada; lee Golfistics, nunca escribe." },
      { label: "Región del servidor", value: "São Paulo (gru1)" },
      { label: "Greens GPS (Golfistics ViewMaster)", value: "Cache 7 días · 1 pedido a la vez · 600 ms entre pedidos", help: "Solo endpoints públicos de lectura. Nunca se llama a viewmaster_update_gps.php." },
      { label: "Tees y peligros", value: "OpenStreetMap (ODbL)", help: "Se usan como borrador; nada se publica solo." },
      { label: "Sesión", value: "60 días · se renueva cada 24 h" },
      { label: "Contraseñas de Golflet", value: "Mínimo 8 caracteres" },
      { label: "Recuperar contraseña por email", value: "Sin configurar", help: "Falta elegir un proveedor de email." },
      { label: "Escudos incluidos en la app", value: Object.keys(CLUB_LOGOS).join(", "), help: "Los demás clubes usan monograma, salvo que subas un escudo en Clubes." },
      { label: "Zona horaria de las métricas", value: TZ },
    ],
  };
}

/* ---------------- audit ---------------- */
export async function listAudit(sp: URLSearchParams) {
  const P: unknown[] = []; let w = "";
  const add = (v: unknown) => { P.push(v); return `$${P.length}`; };
  const act = sp.get("action"); if (act) w += ` and action like ${add(act.slice(0, 40).replace(/[%_]/g, "") + "%")}`;
  const actor = sp.get("actor"); if (actor) w += ` and actor_email = ${add(actor.slice(0, 200))}`;
  const days = Number(sp.get("days")); if (Number.isInteger(days) && days > 0) w += ` and created_at > now() - make_interval(days => ${add(days)}::int)`;
  const target = sp.get("target"); if (target) w += ` and target_id = ${add(target.slice(0, 200))}`;
  const rows = await q(`select id, created_at, actor_email, action, target_type, target_id, summary, detail from admin_audit where true ${w} order by created_at desc limit 300`, P);
  const actors = (await q(`select distinct actor_email from admin_audit where actor_email is not null order by 1`)).map((x: any) => x.actor_email);
  return { rows, actors };
}
