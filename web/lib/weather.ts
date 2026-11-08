/** Weather per round (t136u). Open-Meteo archive API (free, no key). Golfistics' weather providers/keys are NEVER used.
 *  Cache is shared (weather isn't personal): weather_cache keyed by rounded location + local date + hour window. */
import { q } from "./db";
import { visibleRoundIds } from "./data";
import { nowAR } from "./tee-times-core";
import { aggregate, windowFor, matchCourse, weatherGroups, bucketOf, type Hourly, type Wx, type WxRound } from "./weather-core";
import { HttpError } from "./http-error";

const ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";
let vmCache: { at: number; rows: { vm_course: string; lat: number; lng: number }[] } | null = null;
async function vmCoords() {
  if (vmCache && Date.now() - vmCache.at < 600_000) return vmCache.rows;
  const rows = await q(`select vm_course, avg((h->'center'->>'lat')::float8) lat, avg((h->'center'->>'lng')::float8) lng
                        from vm_course, jsonb_array_elements(holes) h where h->'center'->>'lat' is not null group by vm_course`);
  vmCache = { at: Date.now(), rows: rows.map((r: any) => ({ vm_course: r.vm_course, lat: +r.lat, lng: +r.lng })) };
  return vmCache.rows;
}
const keyOf = (lat: number, lng: number, date: string, w: [number, number]) => `${lat.toFixed(2)},${lng.toFixed(2)}|${date}|${w[0]}-${w[1]}`;

async function fetchArchive(lat: number, lng: number, date: string): Promise<Hourly | null> {
  const u = `${ARCHIVE}?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&start_date=${date}&end_date=${date}&hourly=temperature_2m,precipitation,wind_speed_10m,wind_gusts_10m,weather_code&timezone=America%2FArgentina%2FBuenos_Aires&wind_speed_unit=kmh`;
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
  try { const r = await fetch(u, { signal: ctl.signal, headers: { "User-Agent": "Golflet/1.0 (weather per round)" } }); if (!r.ok) return null; const j = await r.json(); return j?.hourly ?? null; }
  catch { return null; } finally { clearTimeout(t); }
}

/** Cached weather for a location/date/window; fetches at most once (unavailable rows retried after 12 h). */
export async function weatherAt(lat: number, lng: number, date: string, w: [number, number], allowFetch = true): Promise<(Wx & { status: string }) | null> {
  const key = keyOf(lat, lng, date, w);
  const [c] = await q(`select temp_c, precip_mm, rain_hours, wind_kmh, gust_kmh, weather_code, condition, status, fetched_at from weather_cache where key=$1`, [key]);
  if (c && (c.status === "ok" || Date.now() - new Date(c.fetched_at).getTime() < 12 * 3600e3)) return c;
  if (!allowFetch || date >= nowAR().date) return c ?? null;
  const h = await fetchArchive(lat, lng, date); if (!h) return c ?? null;          // network error: don't cache, try later
  const a = aggregate(h, date, w[0], w[1]);
  await q(`insert into weather_cache (key, lat, lng, date, hour_from, hour_to, temp_c, precip_mm, rain_hours, wind_kmh, gust_kmh, weather_code, condition, status, fetched_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now())
           on conflict (key) do update set temp_c=excluded.temp_c, precip_mm=excluded.precip_mm, rain_hours=excluded.rain_hours, wind_kmh=excluded.wind_kmh, gust_kmh=excluded.gust_kmh,
             weather_code=excluded.weather_code, condition=excluded.condition, status=excluded.status, fetched_at=now()`,
    [key, lat, lng, date, w[0], w[1], a?.temp_c ?? null, a?.precip_mm ?? null, a?.rain_hours ?? 0, a?.wind_kmh ?? null, a?.gust_kmh ?? null, a?.weather_code ?? null, a?.condition ?? null, a && a.condition ? "ok" : "unavailable"]);
  return a ? { ...a, status: a.condition ? "ok" : "unavailable" } : null;
}

/** The user's (deduped) rounds with what we need for weather. Tee time hour comes from a matched club booking when we have it. */
async function userRounds(userId: string) {
  const keep = [...await visibleRoundIds(userId)]; if (!keep.length) return [];
  return q(`select r.id, r.date::text date, r.course, r.data->>'club_played' club_played, nullif(r.data->>'differential_computed','')::float8 diff,
              nullif(r.data->>'gross','')::int gross, coalesce((r.data->>'valid_card')::boolean, true) valid,
              (select t.time from tee_time t where t.round_id=r.id and t.user_id=$2 order by t.time limit 1) tee_hhmm
            from round r where r.id = any($1::uuid[]) order by r.date desc`, [keep, userId]);
}

const pool = async <T, R>(items: T[], n: number, f: (x: T) => Promise<R>) => { const out: R[] = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await f(items[k]); } })); return out; };

/** Weather for every round of the user. Fetches up to `maxFetch` missing days from Open-Meteo per call (the rest fill on later calls / the backfill). */
export async function roundsWeather(userId: string, maxFetch = 20) {
  const rs = await userRounds(userId), vm = await vmCoords(); let budget = maxFetch, noCoords = 0, pending = 0;
  const res = await pool(rs, 4, async (r: any) => {
    const m = matchCourse(r.club_played, r.course, vm); if (!m) { noCoords++; return null; }
    const w = windowFor(r.tee_hhmm), cached = await weatherAt(m.lat, m.lng, r.date, w, false);
    let wx = cached;
    if ((!wx || wx.status !== "ok") && budget > 0) { budget--; wx = await weatherAt(m.lat, m.lng, r.date, w, true); }
    if (!wx || wx.status !== "ok") { pending++; return null; }
    return { r, wx: { temp_c: wx.temp_c, precip_mm: wx.precip_mm, rain_hours: wx.rain_hours, wind_kmh: wx.wind_kmh, gust_kmh: wx.gust_kmh, weather_code: wx.weather_code, condition: wx.condition },
      window: w, basis: r.tee_hhmm ? "tee_time" : "day" };
  });
  const rounds: Record<string, any> = {}; const list: WxRound[] = [];
  for (const x of res) if (x) { rounds[x.r.id] = { ...x.wx, window: x.window, basis: x.basis }; list.push({ round_id: x.r.id, date: x.r.date, course: x.r.course, differential: x.r.valid ? x.r.diff : null, gross: x.r.gross, wx: x.wx as Wx }); }
  return { source: "open-meteo-archive", rounds, list, coverage: { rounds: rs.length, with_weather: list.length, no_course_location: noCoords, pending } };
}
export async function roundWeather(userId: string, roundId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(roundId) || !(await visibleRoundIds(userId)).has(roundId)) throw new HttpError(404, "Ronda no encontrada");
  const [r] = (await userRounds(userId)).filter((x: any) => x.id === roundId); const vm = await vmCoords();
  const m = r && matchCourse(r.club_played, r.course, vm); if (!m) return { round_id: roundId, weather: null, reason: "no_course_location" };
  const w = windowFor(r.tee_hhmm), wx = await weatherAt(m.lat, m.lng, r.date, w, true);
  if (!wx || wx.status !== "ok") return { round_id: roundId, weather: null, reason: r.date >= nowAR().date ? "future" : "pending" };
  const { status, ...rest } = wx as any; delete rest.fetched_at;
  return { round_id: roundId, weather: { ...rest, window: w, basis: r.tee_hhmm ? "tee_time" : "day" }, source: "open-meteo-archive" };
}
export async function weatherMetrics(userId: string, dim?: string | null, bucket?: string | null) {
  const d = await roundsWeather(userId, 20), g = weatherGroups(d.list);
  if (dim) {
    if (!["lluvia", "temperatura", "viento"].includes(dim)) throw new HttpError(400, "dim: lluvia | temperatura | viento");
    const rows = d.list.filter(r => r.differential != null && (!bucket || bucketOf(dim, r) === bucket)).map(r => ({ ...r, bucket: bucketOf(dim, r) }));
    return { dim, bucket: bucket || null, group: (g as any)[dim], overall_avg_diff: g.overall_avg_diff, rounds: rows, coverage: d.coverage, source: d.source };
  }
  return { ...g, coverage: d.coverage, source: d.source };
}
