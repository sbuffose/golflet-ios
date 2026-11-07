/** t104u/t105u: shot samples (iOS Jugar), merged bag distances, green geometry + green results. Never invents geometry or carry. */
import { q } from "./db";
import { HttpError } from "./http";
import { ownRound } from "./rounds";
import { cleanSample, greenOffset, mergeDistances, yd, flagFor, toFlag, leftAt } from "./shot-samples-core";
import { courseGeometry, resolveCourseId } from "./course-geo";
import { allUserShots, userClubs } from "./live";
import { countsForClub, isPutter } from "./shots-calc";
import { haversine } from "./geo";
import { distanceStats } from "./club-stats";

/** {id} may be a live_round (Golflet round) or a synced round. */
export async function resolveRoundRef(userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "Ronda no encontrada");
  const [l] = await q(`select id, club_code, vm_course from live_round where id=$1 and user_id=$2`, [id, userId]);
  if (l) return { live_round_id: l.id as string, round_id: null as string | null, course_hint: l.club_code && l.vm_course ? { club_code: l.club_code, vm_course: l.vm_course } : null };
  await ownRound(userId, id); return { live_round_id: null as string | null, round_id: id, course_hint: null };
}
const geoCache = new Map<string, any>();
async function geoFor(courseId: string | null, hint: any) {
  let c = hint; if (courseId) { try { c = await resolveCourseId(courseId); } catch { c = hint; } }
  if (!c) return null; const k = `${c.club_code}|${c.vm_course}`;
  if (!geoCache.has(k)) geoCache.set(k, await courseGeometry(c.club_code, c.vm_course).catch(() => null));
  return geoCache.get(k);
}
async function greenCenter(courseId: string | null, hint: any, hole: number) {
  return (await geoFor(courseId, hint))?.holes?.find((h: any) => h.hole === hole)?.green?.center ?? null;
}

export async function addSamples(userId: string, roundId: string, b: any) {
  const ref = await resolveRoundRef(userId, roundId);
  const list = Array.isArray(b?.samples) ? b.samples : null; if (!list || !list.length || list.length > 200) throw new HttpError(400, "Mandá entre 1 y 200 tiros en samples[]");
  const courseId = b?.course_id ? String(b.course_id).slice(0, 80) : null;
  const out: any[] = [], errors: any[] = [];
  for (const raw of list) {
    let s; try { s = cleanSample(raw); } catch (e: any) { errors.push({ client_id: raw?.client_id ?? null, error: e.message }); continue; }
    let green = null; const center = await greenCenter(courseId, ref.course_hint, s.hole);
    if (s.kind === "putt_start" && center && s.end) green = greenOffset(s.end, center, s.start);
    const { flag, flag_source } = flagFor(s.pin, center);   // t127u
    const [r] = await q(`insert into shot_samples (user_id, client_id, live_round_id, round_id, course_id, hole, club, kind, start_lat, start_lng, end_lat, end_lng, distance_m, accuracy_m, putts, green, taken_at,
          shot_number, holed, flag_lat, flag_lng, flag_source, to_flag_start_m, to_flag_end_m)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
        on conflict (user_id, client_id) do update set updated_at=shot_samples.updated_at returning id, client_id, kind, hole, club, shot_number, distance_m, putts, green, holed, flag_source, to_flag_start_m, to_flag_end_m, discarded, (xmax = 0) inserted`,
      [userId, s.client_id, ref.live_round_id, ref.round_id, courseId, s.hole, s.club, s.kind, s.start?.lat ?? null, s.start?.lng ?? null, s.end?.lat ?? null, s.end?.lng ?? null, s.distance_m, s.accuracy_m, s.putts, green ? JSON.stringify(green) : null, s.taken_at,
        s.shot_number, s.holed, flag?.lat ?? null, flag?.lng ?? null, flag_source, toFlag(s.start, flag), toFlag(s.end, flag)]);
    out.push({ ...r, distance_yd: yd(r.distance_m) });
  }
  return { saved: out.filter(r => r.inserted).length, duplicates: out.filter(r => !r.inserted).length, samples: out.map(({ inserted, ...r }) => r), errors };
}
export async function setDiscarded(userId: string, roundId: string, b: any) {
  const ref = await resolveRoundRef(userId, roundId);
  if (typeof b?.discarded !== "boolean") throw new HttpError(400, "discarded tiene que ser true o false");
  const ids = (Array.isArray(b?.ids) ? b.ids : []).map(String).filter((x: string) => /^[0-9a-f-]{36}$/i.test(x));
  const cids = (Array.isArray(b?.client_ids) ? b.client_ids : []).map(String).slice(0, 200);
  if (!ids.length && !cids.length) throw new HttpError(400, "Mandá ids[] o client_ids[]");
  const r = await q(`update shot_samples set discarded=$2, updated_at=now() where user_id=$1 and (id = any($3::uuid[]) or client_id = any($4::text[]))
      and (live_round_id is not distinct from $5::uuid) and (round_id is not distinct from $6::uuid) returning id`, [userId, b.discarded, ids, cids, ref.live_round_id, ref.round_id]);
  return { updated: r.length };
}
export async function listSamples(userId: string, roundId: string) {
  const ref = await resolveRoundRef(userId, roundId);
  const rows = await q(`select id, client_id, hole, club, kind, shot_number, start_lat, start_lng, end_lat, end_lng, distance_m, accuracy_m, putts, green, holed,
      flag_lat, flag_lng, flag_source, to_flag_start_m, to_flag_end_m, discarded, taken_at, created_at, course_id from shot_samples
    where user_id=$1 and (live_round_id is not distinct from $2::uuid) and (round_id is not distinct from $3::uuid) order by hole, shot_number nulls last, taken_at nulls last, created_at`, [userId, ref.live_round_id, ref.round_id]);
  // t127u: "¿a cuánto la dejaste?" per shot (in play order within each hole); discarded and legacy putt_start rows keep left_to_flag_m = null
  const left = new Map<string, any>(); for (const h of new Set(rows.map((r: any) => r.hole))) for (const x of leftAt(rows.filter((r: any) => r.hole === h))) left.set(x.id, x);
  return rows.map(({ created_at, ...r }: any) => ({ ...r, distance_yd: yd(r.distance_m), order: left.get(r.id)?.order ?? null,
    left_to_flag_m: left.get(r.id)?.left_to_flag_m ?? null, left_from: left.get(r.id)?.left_from ?? null }));
}

/* ---------- merged bag distances ---------- */
const BAG_ALIAS: Record<string, string> = { driver: "Dr", "madera 3": "3W", "madera 5": "5W", "híbrido": "Hy", hibrido: "Hy", "pitching wedge": "PW", "gap wedge": "GW", "sand wedge": "SW", "lob wedge": "LW" };
/** Club text (code, label, "Hierro 7", "Driver") → the user's club code. */
export function clubCoder(clubs: { code: string; label: string }[]) {
  return (c: string) => { const s = String(c || "").trim(), l = s.toLowerCase();
    const hit = clubs.find(x => x.code.toLowerCase() === l || x.label.toLowerCase() === l); if (hit) return hit.code;
    if (BAG_ALIAS[l]) return BAG_ALIAS[l]; const m = /^hierro\s*(\d)$/.exec(l); if (m) return `${m[1]}i`; return s; };
}
export async function bagDistances(userId: string) {
  const clubs = await userClubs(userId);
  const code = clubCoder(clubs);
  const [b] = await q(`select clubs from bag where user_id=$1`, [userId]);
  const manual = (Array.isArray(b?.clubs) ? b.clubs : []).filter((x: any) => x && typeof x === "object" && x.club).map((x: any) => ({ club: code(x.club), label: x.club, carry: x.carry ?? null, total: x.total ?? null }));
  const auto: Record<string, number[]> = {}, src: Record<string, { samples: number; shots: number }> = {};
  const push = (c: string, d: number, k: "samples" | "shots") => { const cc = code(c); (auto[cc] ||= []).push(d); (src[cc] ||= { samples: 0, shots: 0 })[k]++; };
  const ss = await q(`select club, distance_m, live_round_id from shot_samples where user_id=$1 and not discarded and kind in ('full','approach') and club is not null and distance_m between 10 and 400 and (accuracy_m is null or accuracy_m <= 20)`, [userId]);
  for (const r of ss) if (!isPutter(r.club)) push(r.club, r.distance_m, "samples");
  const withSamples = new Set(ss.map((r: any) => r.live_round_id).filter(Boolean));
  for (const s of await allUserShots(userId)) if (!withSamples.has(s.live_round_id) && countsForClub(s as any)) push(s.club!, s.distance_m!, "shots");   // GPS shots logged before samples existed
  const lmRows = await q(`select club, percentile_cont(0.5) within group (order by carry_m) carry_m, count(*)::int n from club_sample where user_id=$1 and not mishit and carry_m is not null group by club`, [userId]);
  const lm: Record<string, any> = {}; for (const r of lmRows) lm[code(r.club)] = { carry_m: r.carry_m, n: r.n };
  const label = (c: string) => manual.find((m: any) => m.club === c)?.label || clubs.find(x => x.code === c)?.label || c;
  const order = (c: string) => { const i = clubs.findIndex(x => x.code === c); return i < 0 ? 99 : i; };
  const rows = mergeDistances(manual, auto, lm).filter(r => !isPutter(r.club)).sort((a, b) => order(a.club) - order(b.club))
    .map(r => { const g = auto[r.club]?.length ? distanceStats(auto[r.club]) : null;   // t126u: GPS block (same trimming as /api/club-stats)
      return { ...r, code: r.club, club: label(r.club), auto_from: src[r.club] || { samples: 0, shots: 0 },
        manual: r.manual_total_yd != null || r.manual_carry_yd != null ? { carry_yd: r.manual_carry_yd, total_yd: r.manual_total_yd } : null,
        gps: g ? { n: g.n + g.trimmed, used: g.n, trimmed: g.trimmed, avg_yd: g.avg_yd, median_yd: g.median_yd, min_yd: yd(g.min_m), max_yd: g.max_yd, range_yd: g.range_yd, spread_yd: g.spread_yd, measures: "total" } : null,
        has_distance: r.manual_total_yd != null || r.manual_carry_yd != null || !!g }; });
  return { clubs: rows, rule: "Manda la distancia que cargaste en Mi bolsa. La de GPS se muestra al lado (promedio, tiros, rango) y solo se usa si no cargaste ninguna.", units: "yd", auto_measures: "total" };
}

/* ---------- green geometry ---------- */
export async function greenGeometry(courseId: string, hole: number) {
  if (!Number.isInteger(hole) || hole < 1 || hole > 36) throw new HttpError(404, "Hoyo no encontrado");
  const { club_code, vm_course } = await resolveCourseId(courseId);
  const geo = await courseGeometry(club_code, vm_course);
  const h = geo.holes?.find((x: any) => x.hole === hole); if (!h?.green?.center) throw new HttpError(404, "No tenemos el green de este hoyo");
  const g = h.green, depth = g.front && g.back ? Math.round(haversine(g.front, g.back) * 10) / 10 : null;
  const near = (h.hazards || []).map((z: any) => ({ type: z.type, distance_to_center_m: Math.round(haversine(g.center, z)), polygon: z.polygon || null })).filter((z: any) => z.distance_to_center_m <= 45);
  return { course_id: courseId, hole, par: h.par ?? null, front: g.front ?? null, center: g.center, back: g.back ?? null, depth_m: depth, depth_yd: yd(depth),
    outline: null, outline_source: null, hazards_near_green: near,
    note: "Tenemos frente, centro y fondo del green (Golfistics). El contorno del green no está cargado: no lo inventamos.", sources: geo.sources };
}
/** Green results per hole for a round: where the ball finished on the green (vs center) + putts. */
export async function greenResults(userId: string, roundId: string) {
  const rows = (await listSamples(userId, roundId)).filter((r: any) => r.kind === "putt_start" && !r.discarded);
  return rows.map((r: any) => ({ hole: r.hole, putts: r.putts, ball: { lat: r.end_lat, lng: r.end_lng }, green: r.green, client_id: r.client_id }));
}

/** t126u: GPS sample distances for one club (club-detail page), honouring ?from/?days; course filters skip samples. */
export async function sampleDistances(userId: string, code: string, f: { from?: string | null; days?: number | null; course?: string | null; course_id?: string | null }) {
  if (f.course || f.course_id) return { values: [] as number[], rounds: new Set<string>() };
  const clubs = await userClubs(userId), lab = clubs.find(c => c.code === code)?.label?.toLowerCase();
  const rows = await q(`select club, distance_m, live_round_id from shot_samples where user_id=$1 and not discarded and kind in ('full','approach') and club is not null and distance_m between 10 and 400 and (accuracy_m is null or accuracy_m <= 20)
    and ($2::date is null or created_at >= $2::date) and ($3::int is null or created_at >= now() - make_interval(days => $3::int))`, [userId, f.from ?? null, f.days ?? null]);
  const mine = rows.filter((r: any) => { const l = String(r.club).trim().toLowerCase(); return l === code.toLowerCase() || (lab && l === lab) || BAG_ALIAS[l] === code || /^hierro\s*(\d)$/.exec(l)?.[1] + 'i' === code; });
  return { values: mine.map((r: any) => +r.distance_m), rounds: new Set<string>(rows.map((r: any) => r.live_round_id).filter(Boolean)) };
}

/** t128u: per hole, everything to draw the hole map: green (front/center/back), tee, hazards, flag (+ source) and every shot with its points. */
export async function holeMap(userId: string, roundId: string, hole: number | null) {
  const ref = await resolveRoundRef(userId, roundId);
  const samples = (await listSamples(userId, roundId)).filter((r: any) => !r.discarded && r.kind !== "putt_start" && (hole == null || r.hole === hole));
  const legacy = ref.live_round_id ? await q(`select hole, shot_number, lat, lng, club, lie, result, accuracy_m from shot where live_round_id=$1 and user_id=$2 ${hole == null ? "" : "and hole=$3"} order by hole, shot_number`,
    hole == null ? [ref.live_round_id, userId] : [ref.live_round_id, userId, hole]) : [];
  const geo = await geoFor(samples.find((r: any) => r.course_id)?.course_id ?? null, ref.course_hint);
  const holes = [...new Set<number>([...samples.map((r: any) => r.hole), ...legacy.map((r: any) => r.hole)])].sort((a, b) => a - b);
  return { round_ref: ref, course_id: geo?.course_id ?? null, attribution: geo?.sources?.attribution ?? null, holes: holes.map(h => {
    const g = geo?.holes?.find((x: any) => x.hole === h) || null, mine = samples.filter((r: any) => r.hole === h);
    const marked = mine.find((r: any) => r.flag_source === "player_marked");
    const { flag, flag_source } = flagFor(marked ? { lat: marked.flag_lat, lng: marked.flag_lng } : null, g?.green?.center ?? null);
    const pts = legacy.filter((r: any) => r.hole === h);
    return { hole: h, par: g?.par ?? null, green: g?.green ?? null, tee: g?.tee ?? null, hazards: g?.hazards ?? [], flag, flag_source,
      flag_note: flag_source === "green_center" ? "Sin posición de bandera: medimos al centro del green." : null,
      shots: mine.map((r: any) => ({ id: r.id, client_id: r.client_id, order: r.order, shot_number: r.shot_number, kind: r.kind, club: r.club,
        start: r.start_lat != null ? { lat: r.start_lat, lng: r.start_lng } : null, end: r.end_lat != null ? { lat: r.end_lat, lng: r.end_lng } : null,
        distance_m: r.distance_m, to_flag_start_m: r.to_flag_start_m, left_to_flag_m: r.left_to_flag_m, left_from: r.left_from, holed: r.holed, flag_source: r.flag_source })),
      // older Golflet GPS shots (one point per stroke, putts included); the stroke goes from each point to the next
      points: pts.map((r: any, i: number) => ({ shot_number: r.shot_number, lat: r.lat, lng: r.lng, club: r.club, lie: r.lie, result: r.result,
        to_flag_m: toFlag({ lat: r.lat, lng: r.lng }, flag), left_to_flag_m: r.result === "holed" ? 0 : pts[i + 1] ? toFlag({ lat: pts[i + 1].lat, lng: pts[i + 1].lng }, flag) : null })) };
  }) };
}
