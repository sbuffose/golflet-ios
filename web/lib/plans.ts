/** t176u/t177u/t179u/t180u "Estrategia de juego" (Preparar ronda). Plans, tee times and shots are PRIVATE to the owner:
 *  every query is scoped to the session user and nothing here is read by groups, profesor, clubs or admin metrics. API_v5 §61.
 *  Forecast: Open-Meteo (free tier is for non-commercial use; a commercial Golflet needs an Open-Meteo API plan). */
import { shotLogSummary } from "./shotlog";
import { getGreenGuide, listGreenGuides } from "./green-guide";
import { courseCompletenessFor } from "./course-map";
import { torneoForPlan, torneoNow, TORNEO_LOCKED_MSG } from "./torneo";
import { q } from "./db";
import { HttpError } from "./http-error";
import { nowAR, DATE_RE, TIME_RE } from "./tee-times-core";
import { bagDistances, clubCoder } from "./shot-samples";
import { userClubs } from "./live";
import { courseGeometry, resolveCourseId } from "./course-geo";
import { isPutter } from "./shots-calc";
import { gpsShotSql } from "./gps-shot";
import { DEFAULT_MIN_PER_HOLE, MIN_GPS_SHOTS, WIND_MODEL, cleanShots, dispersion, frame, holeSchedule, holeWindEffect, shotFrame, windAt, wxAt, windComp, aimPoint,
  type Hourly, type Sample, type LL } from "./plan-core";

export const PLAN_MAX_DAYS = 60;
import { hourlyWind, addDays, dayDiff, FORECAST_DAYS } from "./weather-hourly";
export { hourlyWind, FORECAST_DAYS };

/* ---------- courses with a detailed map ---------- */
async function mapCourses(userId: string) {
  const rows = await q(`select m.club_code, m.course, c.name club_name, c.id club_id, (m.summary->>'holes')::int holes,
              exists(select 1 from club_account a where a.user_id=$1 and a.club_id=c.id) mine
            from course_map m left join club c on c.code=m.club_code order by mine desc, m.club_code, m.course`, [userId]);
  // t190u: courses with only a club course guide (no map yet) can also be planned (schematic cards, no plays-like)
  for (const g of listGreenGuides()) {
    if (rows.some((r: any) => r.club_code === g.club_code && r.course.toLowerCase() === g.course.toLowerCase())) continue;
    const [c] = await q(`select k.name club_name, k.id club_id, exists(select 1 from club_account a where a.user_id=$1 and a.club_id=k.id) mine from club k where k.code=$2`, [userId, g.club_code]);
    if (c) rows.push({ club_code: g.club_code, course: g.course, club_name: c.club_name, club_id: c.club_id, holes: 18, mine: c.mine, guide_only: true });
  }
  return rows.sort((a: any, b: any) => (b.mine ? 1 : 0) - (a.mine ? 1 : 0));
}
/** t190u: a course with no map but with a club course guide (lib/green-guide): pars/yards from the club card, no bearing (no plays-like). */
async function guideMeta(clubCode: string, course: string) {
  const g = getGreenGuide(clubCode, course); if (!g) return null;
  const [c] = await q(`select k.code club_code, k.name club_name, k.id club_id, c.name course, c.holes from course c join club k on k.id=c.club_id where k.code=$1 and lower(c.name)=lower($2)`, [clubCode, course]);
  const card = (n: number) => (c?.holes || []).find((h: any) => h.hole === n);
  const ydOf = (h: any) => { const y = h?.yards || {}; return y.AZUL ?? y.Azul ?? (Object.values(y) as number[])[0] ?? null; };
  const holes = Array.from({ length: 18 }, (_, i) => i + 1).map(n => ({ hole: n, par: card(n)?.par ?? g.holes[n]?.par ?? null, hcp: Number.isFinite(card(n)?.hcp) ? card(n).hcp : null, play_length_yd: ydOf(card(n)) ?? g.holes[n]?.yd ?? null, bearing: null }));
  return { id: null, club_code: g.club_code, course: c?.course ?? g.course, club_name: c?.club_name ?? null, club_id: c?.club_id ?? null, loc: g.location ? { lat: g.location.lat, lng: g.location.lng } : null, holes, numbering_unconfirmed: false, guide_only: true };
}
async function mapMeta(clubCode: string, course: string) {
  const [m] = await q(`select m.id, m.club_code, m.course, c.name club_name, c.id club_id from course_map m left join club c on c.code=m.club_code where m.club_code=$1 and lower(m.course)=lower($2)`, [clubCode, course]);
  if (!m) return guideMeta(clubCode, course);
  const hs = await q(`select hole, data->'green'->'center' gc, data->'bearing' bearing, data->'play_length_yd' len, crosscheck from course_map_hole where course_map_id=$1 order by hole`, [m.id]);
  const gcs = hs.map((h: any) => h.gc).filter(Boolean); const loc = gcs.length ? { lng: gcs.reduce((a: number, g: any) => a + g[0], 0) / gcs.length, lat: gcs.reduce((a: number, g: any) => a + g[1], 0) / gcs.length } : null;
  const unconfirmed = /azul/i.test(m.course) && m.club_code === "118";
  // t258u: stroke index (S.I.) from our course card, when synced
  let cardH: any[] = []; try { const [cc] = await q(`select c.holes from course c join club k on k.id=c.club_id where k.code=$1 and lower(c.name)=lower($2) limit 1`, [clubCode, course]); cardH = Array.isArray(cc?.holes) ? cc.holes : []; } catch { cardH = []; }
  const hcpOf = (n: number) => { const v = Number(cardH.find((z: any) => z?.hole === n)?.hcp); return Number.isInteger(v) && v >= 1 && v <= 18 ? v : null; };   // OSM 3–8 ↔ 12–17 vs the club card: numbering not confirmed (§60)
  const holes = hs.map((h: any) => { const swapped = unconfirmed && ((h.hole >= 3 && h.hole <= 8) || (h.hole >= 12 && h.hole <= 17));
    return { hole: h.hole, par: swapped ? null : h.crosscheck?.card?.par ?? h.crosscheck?.par ?? null, hcp: swapped ? null : hcpOf(h.hole), play_length_yd: h.len ?? null, bearing: h.bearing }; });
  return { ...m, loc, holes, numbering_unconfirmed: unconfirmed };
}

/* ---------- own pace (live rounds), else the §50 estimate, else 14 min ---------- */
export async function ownPace(userId: string, clubId: number | null, course: string | null) {
  const rows = await q(`select extract(epoch from (coalesce(l.ended_at, mx.last) - mn.first))/60 mins, mx.holes
      from live_round l join lateral (select min(taken_at) first from shot s where s.live_round_id=l.id and ${gpsShotSql("s")}) mn on true
      join lateral (select max(taken_at) last, count(distinct hole)::int holes from shot s where s.live_round_id=l.id and ${gpsShotSql("s")}) mx on true
      where l.user_id=$1 and mx.holes >= 9 and mn.first is not null order by l.date desc limit 10`, [userId]);
  const per = rows.map((r: any) => +r.mins / r.holes).filter((x: number) => x >= 6 && x <= 25).sort((a: number, b: number) => a - b);
  if (per.length >= 2) return { min_per_hole: Math.round(per[per.length >> 1] * 10) / 10, source: "propio" as const, rounds: per.length };
  let est: number | null = null;
  try { const { paceFor } = await import("./pace"); est = (await paceFor(clubId, course, "medal", 4))?.min_per_hole ?? null; } catch { est = null; }
  return { min_per_hole: est ?? DEFAULT_MIN_PER_HOLE, source: "estimado" as const, rounds: per.length };
}

/* ---------- the player's own upcoming tee times (private) ---------- */
async function myTeeTimes(userId: string) {
  const t = nowAR();
  return q(`select t.id, t.date::text date, t.time, t.start_hole, t.club_name, t.course_label, g.code club_code
            from tee_time t left join ar_club_directory d on d.key=t.club_key left join club g on g.id=d.golflet_club_id
            where t.user_id=$1 and t.source='club' and t.gone_at is null and t.date >= $2::date and t.date <= $2::date + 60 order by t.date, t.time limit 30`, [userId, t.date]);
}
const courseFromLabel = (label: string | null, courses: string[]) => courses.find(c => label && label.toLowerCase().includes(c.toLowerCase())) ?? null;

export async function planSetup(userId: string) {
  const [courses, tees] = await Promise.all([mapCourses(userId), myTeeTimes(userId)]);
  const pace = await ownPace(userId, courses[0]?.club_id ?? null, courses[0]?.course ?? null);
  return { courses: courses.map((c: any) => ({ club_code: c.club_code, club_id: c.club_id, course: c.course, club_name: c.club_name, holes: c.holes, mine: c.mine, ...(c.guide_only ? { guide_only: true } : {}) })),
    tee_times: tees.map((x: any) => ({ ...x, course: x.club_code ? courseFromLabel(x.course_label, courses.filter((c: any) => c.club_code === x.club_code).map((c: any) => c.course)) : null, has_map: courses.some((c: any) => c.club_code === x.club_code) })),
    pace, today: nowAR().date, forecast_days: FORECAST_DAYS, max_days: PLAN_MAX_DAYS, wind_model: WIND_MODEL };
}

/* ---------- plans CRUD ---------- */
const COLS = `id, club_code, course, date::text date, tee_time, start_hole, min_per_hole, pace_source, tee_time_id, dist_source, holes, created_at, updated_at`;
function cleanPlan(b: any, prev: any = null) {
  const o: any = {}, today = nowAR().date;
  if (b.date !== undefined || !prev) { if (!DATE_RE.test(String(b.date))) throw new HttpError(400, "Fecha inválida");
    const d = dayDiff(today, b.date); if (d < 0) throw new HttpError(400, "La fecha ya pasó"); if (d > PLAN_MAX_DAYS) throw new HttpError(400, `Elegí una fecha dentro de los próximos ${PLAN_MAX_DAYS} días`); o.date = b.date; }
  if (b.tee_time !== undefined || !prev) { if (!TIME_RE.test(String(b.tee_time))) throw new HttpError(400, "Hora inválida (HH:MM)"); o.tee_time = b.tee_time; }
  if (b.start_hole !== undefined) { if (![1, 10].includes(Number(b.start_hole))) throw new HttpError(400, "Salida por el 1 o el 10"); o.start_hole = Number(b.start_hole); }
  if (b.min_per_hole !== undefined) { const m = Number(b.min_per_hole); if (!Number.isFinite(m) || m < 6 || m > 25) throw new HttpError(400, "Ritmo entre 6 y 25 min por hoyo"); o.min_per_hole = Math.round(m * 10) / 10; o.pace_source = b.pace_source === "propio" || b.pace_source === "estimado" ? b.pace_source : "manual"; }
  if (b.dist_source !== undefined) { if (!["libreto", "gps"].includes(b.dist_source)) throw new HttpError(400, "Fuente de distancias inválida"); o.dist_source = b.dist_source; }
  return o;
}
export async function listPlans(userId: string) {
  return (await q(`select ${COLS} from round_plan where user_id=$1 order by date desc, tee_time desc limit 50`, [userId])).map(({ holes, ...p }: any) => ({ ...p, holes_planned: Object.values(holes || {}).filter((h: any) => h?.shots?.length).length }));
}
export async function createPlan(userId: string, b: any) {
  const m = await mapMeta(String(b.club_code ?? ""), String(b.course ?? "")); if (!m) throw new HttpError(404, "Todavía no tenemos el mapa de esta cancha");
  const o = cleanPlan(b);
  let teeId: string | null = null;
  if (b.tee_time_id) { const [t] = await q(`select id, start_hole from tee_time where id=$1 and user_id=$2`, [b.tee_time_id, userId]); if (!t) throw new HttpError(404, "Tee time no encontrado"); teeId = t.id; if (o.start_hole == null && [1, 10].includes(t.start_hole)) o.start_hole = t.start_hole; }
  if (o.min_per_hole == null) { const p = await ownPace(userId, m.club_id, m.course); o.min_per_hole = p.min_per_hole; o.pace_source = p.source; }
  if (teeId) { const [ex] = await q(`select id from round_plan where user_id=$1 and tee_time_id=$2 and club_code=$3 and course=$4`, [userId, teeId, m.club_code, m.course]); if (ex) return getPlan(userId, ex.id); }
  const [r] = await q(`insert into round_plan (user_id, club_code, course, date, tee_time, start_hole, min_per_hole, pace_source, tee_time_id, dist_source)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`, [userId, m.club_code, m.course, o.date, o.tee_time, o.start_hole ?? 1, o.min_per_hole, o.pace_source ?? "estimado", teeId, o.dist_source ?? "libreto"]);
  return getPlan(userId, r.id);
}
async function ownPlan(userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "Plan no encontrado");
  const [p] = await q(`select ${COLS} from round_plan where id=$1 and user_id=$2`, [id, userId]); if (!p) throw new HttpError(404, "Plan no encontrado"); return p;
}
export async function updatePlan(userId: string, id: string, b: any) {
  const p = await ownPlan(userId, id), o = cleanPlan(b, p), ks = Object.keys(o); if (!ks.length) return getPlan(userId, id);
  await q(`update round_plan set ${ks.map((k, i) => `${k}=$${i + 3}`).join(", ")}, updated_at=now() where id=$1 and user_id=$2`, [p.id, userId, ...ks.map(k => o[k])]);
  return getPlan(userId, id);
}
export async function deletePlan(userId: string, id: string) { const p = await ownPlan(userId, id); await q(`delete from round_plan where id=$1 and user_id=$2`, [p.id, userId]); return { ok: true }; }
export async function saveHoleShots(userId: string, id: string, hole: number, shots: unknown) {
  if ((await torneoNow(userId)).locks.planner) throw new HttpError(423, TORNEO_LOCKED_MSG);
  const p = await ownPlan(userId, id); if (!Number.isInteger(hole) || hole < 1 || hole > 18) throw new HttpError(400, "Hoyo inválido");
  let s; try { s = cleanShots(shots); } catch { throw new HttpError(400, "Tiros inválidos"); }
  await q(`update round_plan set holes = jsonb_set(holes, $3, $4::jsonb, true), updated_at=now() where id=$1 and user_id=$2`, [p.id, userId, [String(hole)], JSON.stringify({ shots: s })]);
  return { hole, shots: s };
}

/** t221u: the tee the player plays most at this course, from their OWN club cards (last 20 with a tee). Private to the owner; null when unknown. */
export async function usualTeeFor(userId: string, clubCode: string, course: string): Promise<string | null> {
  const rows = await q(`select r.data->>'tee' tee from round r join club_account a on a.id=r.club_account_id join club c on c.id=a.club_id
      where a.user_id=$1 and c.code=$2 and lower(r.course)=lower($3) and coalesce(r.data->>'tee','') <> '' order by r.date desc limit 20`, [userId, clubCode, course]);
  const n = new Map<string, number>(); for (const r of rows) { const k = String(r.tee).trim().toUpperCase(); n.set(k, (n.get(k) || 0) + 1); }
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
/** The plan + schedule (ETA per hole) + forecast wind at each hole's ETA (per leg on doglegs). */
export async function getPlan(userId: string, id: string) {
  const p = await ownPlan(userId, id), m = await mapMeta(p.club_code, p.course);
  if (!m) return { plan: p, course: null, holes: [], forecast: { status: "no_map" } };
  const pars = Array.from({ length: 18 }, (_, i) => m.holes.find((h: any) => h.hole === i + 1)?.par ?? null);
  const sched = holeSchedule(p.tee_time, p.start_hole, p.min_per_hole, pars);
  const today = nowAR().date, ahead = dayDiff(today, p.date);
  let fc: any;
  if (ahead < 0) fc = { status: "past" };
  else if (ahead >= FORECAST_DAYS) fc = { status: "too_far", available_from: addDays(p.date, -(FORECAST_DAYS - 1)) };
  else if (!m.loc) fc = { status: "no_location" };
  else { const w = await hourlyWind(m.loc.lat, m.loc.lng, p.date, "forecast"); fc = w.hourly ? { status: "ok", source: w.source, fetched_at: w.fetched_at } : { status: "unavailable" }; fc._h = w.hourly; }
  const torneo = await torneoForPlan(userId, p.date, p.tee_time);
  const usualTee = await usualTeeFor(userId, m.club_code, m.course);   // t221u: default tee for the hole view (the player's own cards only)
  const comp = await courseCompletenessFor(m.club_code, m.course), relev = new Set((comp as any).override ? [] : comp.holes_en_relevamiento);   // guide override: schematic cards with s/d, as before
  const holes = sched.map(s => {
    const h = m.holes.find((x: any) => x.hole === s.hole), inSurvey = !comp.ready.wind_yd || relev.has(s.hole);
    const w = fc._h ? windAt(fc._h, `${p.date}T${s.eta}`) : null;
    const wx = fc._h ? wxAt(fc._h, `${p.date}T${s.eta}`) : null;   // t234u: temperature + rain at the hole's ETA (forecast)
    const legs = (h?.bearing?.segments?.length ? h.bearing.segments : h?.bearing?.tee_to_green_true != null ? [{ bearing_true: h.bearing.tee_to_green_true, length_m: (h.play_length_yd ?? 0) * 0.9144 }] : []);
    return { hole: s.hole, par: h?.par ?? null, hcp: h?.hcp ?? null, play_length_yd: h?.play_length_yd ?? null, eta: s.eta, order: s.order, minutes: s.minutes, bearing_true: h?.bearing?.tee_to_green_true ?? null,
      wind: w, wx, effect: w && legs.length && !torneo.locks.plays_like && !inSurvey ? holeWindEffect(legs, w) : null, ...(relev.has(s.hole) ? { relevamiento: true } : {}), shots: p.holes?.[String(s.hole)]?.shots ?? [] };
  });
  const { _h, ...forecast } = fc;
  const { holes: hp, ...plan } = p;
  return { plan, course: { club_code: m.club_code, course: m.course, club_name: m.club_name, numbering_unconfirmed: m.numbering_unconfirmed, map: !(m as any).guide_only, usual_tee: usualTee, green_guide: !!getGreenGuide(m.club_code, m.course),
      completeness: { status: comp.status, label: comp.label, ready: comp.ready, core_holes: comp.core_holes, of: comp.of, holes_en_relevamiento: [...relev], missing: comp.missing, ...((comp as any).override ? { override: (comp as any).override } : {}) } },
    holes, torneo, forecast: { ...forecast, provider: "Open-Meteo", note: "Pronóstico de Open-Meteo (viento a 10 m). Uso gratuito no comercial." }, wind_model: WIND_MODEL };
}

/* ---------- club distances for the planner: Libreto (typed) + GPS dispersion (wind-normalised) ---------- */
export async function planClubs(userId: string, o: { maxFetch?: number } = {}) {
  const locked = (await torneoNow(userId)).locks.ovals;
  const [bag, clubs] = await Promise.all([bagDistances(userId), userClubs(userId)]); const code = clubCoder(clubs);
  // t254u: torneo (Regla 4.3): your own typed distances (Libreto) stay, no GPS ovals. Throwing here blanked Jugar práctica during a Medal.
  if (locked) return { clubs: bag.clubs.map((c: any) => ({ code: c.code, label: c.club, libreto: c.manual && (c.manual.carry_yd != null || c.manual.total_yd != null) ? c.manual : null, gps: null, gps_median_yd: null, libreta: null })),
    method: "Modo torneo: tus distancias del Libreto, sin óvalos GPS (Regla 4.3).", min_gps_shots: MIN_GPS_SHOTS, wind_model: WIND_MODEL, torneo_locked: true };
  const rows = await q(`select club, course_id, hole, start_lat, start_lng, end_lat, end_lng, coalesce(taken_at, created_at) at from shot_samples
      where user_id=$1 and not discarded and kind in ('full','approach') and club is not null and course_id is not null and start_lat is not null and end_lat is not null
        and distance_m between 10 and 400 and (accuracy_m is null or accuracy_m <= 20) order by created_at desc limit 1500`, [userId]);
  const geo = new Map<string, any>();
  for (const cid of new Set<string>(rows.map((r: any) => r.course_id))) { try { const { club_code, vm_course } = await resolveCourseId(cid); geo.set(cid, await courseGeometry(club_code, vm_course)); } catch { geo.set(cid, null); } }
  let budget = o.maxFetch ?? 12; const winds = new Map<string, Hourly | null>();
  const samples: Record<string, Sample[]> = {};
  for (const r of rows) {
    if (isPutter(r.club)) continue;
    const h = geo.get(r.course_id)?.holes?.find((x: any) => x.hole === r.hole); const gc = h?.green?.center; if (!gc) continue;
    const ref: LL = [r.start_lng, r.start_lat], F = frame(ref), S = F.xy(ref), E = F.xy([r.end_lng, r.end_lat]);
    const len = Math.hypot(E[0] - S[0], E[1] - S[1]);
    const line: LL[] | null = Array.isArray(h.line) && h.line.length > 1 ? h.line.map((p: any) => Array.isArray(p) ? [p[0], p[1]] : [p.lng, p.lat]) : null;
    const path = [...(line ? line.slice(0, -1) : [ref]), [gc.lng, gc.lat] as LL].map(F.xy);
    const T = aimPoint(path, S, len);                               // same aim rule as the planner: along the hole line (doglegs)
    const fr = shotFrame(S, E, T);
    const at = new Date(new Date(r.at).getTime() - 3 * 3600e3).toISOString(), date = at.slice(0, 10), hm = at.slice(11, 16);
    const wk = `${r.start_lat.toFixed(2)},${r.start_lng.toFixed(2)}|${date}`;
    if (!winds.has(wk)) { const c = await hourlyWind(r.start_lat, r.start_lng, date, "observed", budget > 0); if (c.status !== "ok" && c.status !== "unavailable") budget--; else if (!c.hourly && budget > 0) budget--; winds.set(wk, c.hourly); }
    const w = windAt(winds.get(wk), `${date}T${hm}`);
    (samples[code(r.club)] ||= []).push({ fwd_yd: fr.fwd_yd, lat_yd: fr.lat_yd, wind: w ? windComp(fr.bearing, w) : null });
  }
  const logEst = await shotLogSummary(userId).then(s => s.club_estimates).catch(() => [] as any[]);
  return {
    clubs: bag.clubs.map((c: any) => {
      const s = samples[c.code] || [], d = s.length ? dispersion(s) : null;
      return { code: c.code, label: c.club, libreto: c.manual && (c.manual.carry_yd != null || c.manual.total_yd != null) ? c.manual : null,
        gps: d ? (d.ok ? { ok: true, n: d.n, used: d.used, trimmed: d.trimmed, wind_known: d.wind_known, mean: d.mean, cov: d.cov } : { ok: false, n: d.n, used: d.used, reason: d.reason, needs: MIN_GPS_SHOTS }) : null,
        gps_median_yd: c.gps?.median_yd ?? null,
        libreta: logEst.find(e => e.club.toLowerCase() === String(c.code).toLowerCase() || e.club.toLowerCase() === String(c.club).toLowerCase()) ?? null };   // t202u: estimate from own pencil/GPS shot log
    }),
    method: "GPS: cada tiro medido (salida → donde quedó) se mide contra la línea del hoyo, se le saca el viento que había ese día a esa hora (Open-Meteo), se descartan los extremos y se arma un óvalo con el 68% de los tiros. Después se le aplica el viento pronosticado.",
    min_gps_shots: MIN_GPS_SHOTS, wind_model: WIND_MODEL,
  };
}
