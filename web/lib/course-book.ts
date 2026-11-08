/** t201u: "Libreta de la cancha" — the plain course guide (no plan, no shots; t214u: forecast wind when a day and start time are given). Data: course map (when mapped) + club card + club green guide.
 *  Completeness-gated like the strategy libreta (course-map.ts LIBRETA_GUIDE_OVERRIDE keeps MdP Cancha Vieja). API_v5 §65. */
import { q } from "./db";
import { getCourseMap, courseCompletenessFor } from "./course-map";
import { getGreenGuide } from "./green-guide";
import { hourlyWind, FORECAST_DAYS, addDays, dayDiff } from "./weather-hourly";
import { DEFAULT_MIN_PER_HOLE, holeSchedule, windAt } from "./plan-core";
import { nowAR } from "./tee-times-core";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/, TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function courseBookData(clubCode: string, course: string, o: { date?: string | null; time?: string | null } = {}) {
  const [c] = await q(`select k.code club_code, k.name club_name, c.name course, c.holes from course c join club k on k.id=c.club_id where k.code=$1 and lower(c.name)=lower($2)`, [clubCode, course]);
  const guide = getGreenGuide(clubCode, course);
  const map = await getCourseMap(clubCode, course);
  if (!c && !map && !guide) return null;
  const comp = await courseCompletenessFor(clubCode, course), relev = new Set((comp as any).override ? [] : comp.holes_en_relevamiento);
  const card = (n: number) => (c?.holes || []).find((h: any) => h.hole === n);
  const ydOf = (h: any) => { const y = h?.yards || {}; return y.AZUL ?? y.Azul ?? (Object.values(y) as number[])[0] ?? null; };
  const unconfirmed = /azul/i.test(course) && clubCode === "118";
  const holes = Array.from({ length: 18 }, (_, i) => i + 1).map(n => {
    const mh = map?.holes?.find((h: any) => h.hole === n), swapped = unconfirmed && ((n >= 3 && n <= 8) || (n >= 12 && n <= 17));
    return { hole: n, order: n, par: swapped ? null : card(n)?.par ?? mh?.crosscheck?.card?.par ?? guide?.holes[n]?.par ?? null,
      play_length_yd: mh?.play_length_yd ?? ydOf(card(n)) ?? guide?.holes[n]?.yd ?? null, bearing_true: mh?.bearing?.tee_to_green_true ?? null,
      eta: null, wind: null, effect: null, shots: [], ...(relev.has(n) ? { relevamiento: true } : {}) };
  });
  // t214u: forecast wind (Open-Meteo, same source/cache as the strategy libreta) for the chosen day and start time; no shots, no ± yd.
  const date = o.date && DATE_RE.test(o.date) ? o.date : null, time = date && o.time && TIME_RE.test(o.time) ? o.time : null;
  let forecast: any = { status: "no_date" };
  if (date && !time) forecast = { status: "no_time" };
  else if (date && time) {
    const gcs = (map?.holes || []).map((h: any) => h.green?.center).filter(Boolean);
    const loc = gcs.length ? { lng: gcs.reduce((a: number, g: any) => a + g[0], 0) / gcs.length, lat: gcs.reduce((a: number, g: any) => a + g[1], 0) / gcs.length } : (guide as any)?.location ?? null;
    const ahead = dayDiff(nowAR().date, date);
    if (ahead < 0) forecast = { status: "past" };
    else if (ahead >= FORECAST_DAYS) forecast = { status: "too_far", available_from: addDays(date, -(FORECAST_DAYS - 1)) };
    else if (!loc) forecast = { status: "no_location" };
    else {
      const w = await hourlyWind(loc.lat, loc.lng, date, "forecast");
      forecast = w.hourly ? { status: "ok", source: w.source, fetched_at: w.fetched_at } : { status: "unavailable" };
      if (w.hourly) {
        const sched = holeSchedule(time, 1, DEFAULT_MIN_PER_HOLE, holes.map(h => h.par));
        for (const h of holes) { const s = sched.find(x => x.hole === h.hole); if (s) { (h as any).eta = s.eta; (h as any).wind = windAt(w.hourly, `${date}T${s.eta}`); } }
      }
    }
  }
  return {
    mode: "cancha" as const,
    plan: date ? { date, ...(time ? { tee_time: time, start_hole: 1, min_per_hole: DEFAULT_MIN_PER_HOLE } : {}) } : null,
    forecast: { ...forecast, provider: "Open-Meteo", note: "Pronóstico de Open-Meteo (viento a 10 m). Uso gratuito no comercial." },
    course: { club_code: clubCode, course: c?.course ?? map?.course ?? guide?.course ?? course, club_name: c?.club_name ?? null, numbering_unconfirmed: unconfirmed, map: !!map, green_guide: !!guide,
      completeness: { status: comp.status, label: comp.label, ready: comp.ready, core_holes: comp.core_holes, of: comp.of, holes_en_relevamiento: [...relev], missing: comp.missing, ...((comp as any).override ? { override: (comp as any).override } : {}) } },
    holes, _map: map, _guide: guide,
  };
}
