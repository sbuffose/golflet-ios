/** Weather per round (t136u). Open-Meteo archive API (free, no key). Golfistics' weather providers/keys are NEVER used.
 *  Cache is shared (weather isn't personal): weather_cache keyed by rounded location + local date + hour window. */
import { q } from "./db";
import { visibleRoundIds } from "./data";
import { nowAR } from "./tee-times-core";
import { aggregate, windowFor, matchCourse, weatherGroups, weatherPlay, bucketOf, roundWeatherPlan, weatherCacheFresh, countsAsObserved, daysBefore, ARCHIVE_SOURCE, FORECAST_SOURCE, type Hourly, type Wx, type PlayRound } from "./weather-core";
import { HttpError } from "./http-error";

const ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";
const FORECAST = "https://api.open-meteo.com/v1/forecast";
let vmCache: { at: number; rows: { vm_course: string; lat: number; lng: number }[] } | null = null;
async function vmCoords() {
  if (vmCache && Date.now() - vmCache.at < 600_000) return vmCache.rows;
  const rows = await q(`select vm_course, avg((h->'center'->>'lat')::float8) lat, avg((h->'center'->>'lng')::float8) lng
                        from vm_course, jsonb_array_elements(holes) h where h->'center'->>'lat' is not null group by vm_course`);
  vmCache = { at: Date.now(), rows: rows.map((r: any) => ({ vm_course: r.vm_course, lat: +r.lat, lng: +r.lng })) };
  return vmCache.rows;
}
const keyOf = (lat: number, lng: number, date: string, w: [number, number]) => `${lat.toFixed(2)},${lng.toFixed(2)}|${date}|${w[0]}-${w[1]}`;

const HOURLY = "temperature_2m,precipitation,wind_speed_10m,wind_gusts_10m,weather_code";
async function fetchMeteo(base: string, lat: number, lng: number, date: string, pastDays = 0): Promise<Hourly | null> {
  const past = pastDays > 0 ? `&past_days=${pastDays}` : "";
  const u = `${base}?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&start_date=${date}&end_date=${date}&hourly=${HOURLY}&timezone=America%2FArgentina%2FBuenos_Aires&wind_speed_unit=kmh${past}`;
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
  try { const r = await fetch(u, { signal: ctl.signal, headers: { "User-Agent": "Golflet/1.0 (weather per round)" } }); if (!r.ok) return null; const j = await r.json(); return j?.hourly ?? null; }
  catch { return null; } finally { clearTimeout(t); }
}
const fetchArchive = (lat: number, lng: number, date: string) => fetchMeteo(ARCHIVE, lat, lng, date);
const fetchForecast = (lat: number, lng: number, date: string, today: string) => fetchMeteo(FORECAST, lat, lng, date, Math.max(0, daysBefore(date, today)));

type WxOpts = { allowFetch?: boolean; retry?: boolean; today?: string };
type WxRow = Wx & { status: string; source: string; fetched_at?: string | Date | null };

async function saveWx(key: string, lat: number, lng: number, date: string, w: [number, number], a: Wx | null, source: string): Promise<WxRow> {
  const status = a?.condition ? "ok" : "unavailable";
  await q(`insert into weather_cache (key, lat, lng, date, hour_from, hour_to, temp_c, precip_mm, rain_hours, wind_kmh, gust_kmh, weather_code, condition, source, status, fetched_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now())
           on conflict (key) do update set temp_c=excluded.temp_c, precip_mm=excluded.precip_mm, rain_hours=excluded.rain_hours, wind_kmh=excluded.wind_kmh, gust_kmh=excluded.gust_kmh,
             weather_code=excluded.weather_code, condition=excluded.condition, source=excluded.source, status=excluded.status, fetched_at=now()`,
    [key, lat, lng, date, w[0], w[1], a?.temp_c ?? null, a?.precip_mm ?? null, a?.rain_hours ?? 0, a?.wind_kmh ?? null, a?.gust_kmh ?? null, a?.weather_code ?? null, a?.condition ?? null, source, status]);
  return { ...(a || { temp_c: null, precip_mm: null, rain_hours: 0, wind_kmh: null, gust_kmh: null, weather_code: null, condition: null }), status, source };
}

/** Cached weather for a location/date/window. The local day uses the forecast API. Older days use the archive.
 *  A recent day whose archive is empty may keep a forecast, marked with that source. Network errors are not cached. */
export async function weatherAt(lat: number, lng: number, date: string, w: [number, number], allowFetch: boolean | WxOpts = true): Promise<WxRow | null> {
  const opt: WxOpts = typeof allowFetch === "boolean" ? { allowFetch } : { allowFetch: true, ...allowFetch };
  const today = opt.today || nowAR().date;
  const plan = roundWeatherPlan(date, today);
  const key = keyOf(lat, lng, date, w);
  const [c] = await q(`select temp_c, precip_mm, rain_hours, wind_kmh, gust_kmh, weather_code, condition, source, status, fetched_at from weather_cache where key=$1`, [key]);
  if (plan.action === "skip") return null;
  if (c && weatherCacheFresh(c, Date.now(), !!opt.retry)) return c;
  if (opt.allowFetch === false) return c ?? null;
  let hourly: Hourly | null = null, source = ARCHIVE_SOURCE;
  if (plan.action === "forecast") { hourly = await fetchForecast(lat, lng, date, today); source = FORECAST_SOURCE; }
  else {
    hourly = await fetchArchive(lat, lng, date);
    if (!hourly && plan.forecastFallback) { hourly = await fetchForecast(lat, lng, date, today); source = FORECAST_SOURCE; }
  }
  if (!hourly) return c ?? null;
  let a = aggregate(hourly, date, w[0], w[1]);
  if ((!a || !a.condition) && plan.action === "archive" && plan.forecastFallback && source === ARCHIVE_SOURCE) {
    const alt = await fetchForecast(lat, lng, date, today);
    const b = alt ? aggregate(alt, date, w[0], w[1]) : null;
    if (b?.condition) { a = b; source = FORECAST_SOURCE; }
  }
  return saveWx(key, lat, lng, date, w, a, source);
}

/** The user's (deduped) rounds with what we need for weather. Tee time hour comes from a matched club booking when we have it. */
async function userRounds(userId: string) {
  const keep = [...await visibleRoundIds(userId)]; if (!keep.length) return [];
  return q(`select r.id, r.date::text date, r.course, r.holes, r.data->>'club_played' club_played, nullif(r.data->>'differential_computed','')::float8 diff,
              nullif(r.data->>'gross','')::int gross, coalesce((r.data->>'valid_card')::boolean, true) valid,
              coalesce(r.data->>'tee', r.data->>'tee_name') tee, coalesce((r.data->>'is_9_holes')::boolean, false) nine,
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
    const w = windowFor(r.tee_hhmm), today = nowAR().date;
    if (roundWeatherPlan(r.date, today).action === "skip") return null;
    const cached = await weatherAt(m.lat, m.lng, r.date, w, { allowFetch: false, today });
    let wx = cached;
    if ((!wx || wx.status !== "ok") && budget > 0) { budget--; wx = await weatherAt(m.lat, m.lng, r.date, w, { allowFetch: true, today }); }
    if (!wx || wx.status !== "ok") { pending++; return null; }
    const observed = countsAsObserved(wx.source);
    return { r, observed, wx: { temp_c: wx.temp_c, precip_mm: wx.precip_mm, rain_hours: wx.rain_hours, wind_kmh: wx.wind_kmh, gust_kmh: wx.gust_kmh, weather_code: wx.weather_code, condition: wx.condition, source: wx.source, kind: observed ? "observed" : "forecast" },
      window: w, basis: r.tee_hhmm ? "tee_time" : "day" };
  });
  const rounds: Record<string, any> = {}; const list: PlayRound[] = []; let forecastOnly = 0;
  for (const x of res) if (x) {
    rounds[x.r.id] = { ...x.wx, window: x.window, basis: x.basis };
    if (x.observed) list.push({ round_id: x.r.id, date: x.r.date, course: x.r.course, tee: x.r.tee || null, nine: !!x.r.nine, holes: x.r.holes, differential: x.r.valid ? x.r.diff : null, gross: x.r.gross, wx: x.wx as Wx });
    else forecastOnly++;
  }
  return { source: "open-meteo", rounds, list, coverage: { rounds: rs.length, with_weather: list.length, forecast_only: forecastOnly, no_course_location: noCoords, pending } };
}
export async function roundWeather(userId: string, roundId: string, opt?: { retry?: boolean }) {
  if (!/^[0-9a-f-]{36}$/i.test(roundId) || !(await visibleRoundIds(userId)).has(roundId)) throw new HttpError(404, "Ronda no encontrada");
  const [r] = (await userRounds(userId)).filter((x: any) => x.id === roundId); const vm = await vmCoords();
  const m = r && matchCourse(r.club_played, r.course, vm); if (!m) return { round_id: roundId, weather: null, reason: "no_course_location" };
  const today = nowAR().date, plan = roundWeatherPlan(r.date, today);
  if (plan.action === "skip") return { round_id: roundId, weather: null, reason: plan.reason };
  const w = windowFor(r.tee_hhmm), wx = await weatherAt(m.lat, m.lng, r.date, w, { allowFetch: true, retry: !!opt?.retry, today });
  if (!wx) return { round_id: roundId, weather: null, reason: "error" };
  if (wx.status !== "ok") return { round_id: roundId, weather: null, reason: "unavailable" };
  const { status: _status, fetched_at: _at, ...rest } = wx;
  const kind = countsAsObserved(wx.source) ? "observed" : "forecast";
  return { round_id: roundId, weather: { ...rest, kind, window: w, basis: r.tee_hhmm ? "tee_time" : "day" }, source: wx.source };
}
export async function weatherMetrics(userId: string, dim?: string | null, bucket?: string | null) {
  const d = await roundsWeather(userId, 20), g = weatherGroups(d.list), play = weatherPlay(d.list as PlayRound[]);
  if (dim) {
    if (!["lluvia", "temperatura", "viento"].includes(dim)) throw new HttpError(400, "dim: lluvia | temperatura | viento");
    const rows = d.list.filter(r => r.differential != null && (!bucket || bucketOf(dim, r) === bucket)).map(r => ({ ...r, bucket: bucketOf(dim, r) }));
    return { dim, bucket: bucket || null, group: (g as any)[dim], play: (play as any)[dim], overall_avg_diff: g.overall_avg_diff, rounds: rows, coverage: d.coverage, source: d.source };
  }
  return { ...g, play, coverage: d.coverage, source: d.source };
}
