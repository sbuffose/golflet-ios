/** Current wind at a point. Open-Meteo first (no key). MET Norway if that call fails, is empty, or passes 3 s.
 *  Nothing here is guessed: a reading needs a measured speed and a direction. The last valid reading stays in memory. */

export type NowReading = {
  at: string;
  hhmm: string;
  fetched_at: string;
  kmh: number;
  gust_kmh: number | null;
  from_deg: number;
  temp_c: number | null;
  precip_mm: number | null;
  source: "Open-Meteo" | "MET Norway";
  stale: boolean;
};

export type NowResult = { weather: NowReading | null; reason: string | null };

type Slot = { t: number; v: NowReading };
const MEMORY = new Map<string, Slot>();
const FAIL = "Open-Meteo y MET Norway no devolvieron viento.";

const keyOf = (lat: number, lng: number) => `${lat.toFixed(3)},${lng.toFixed(3)}`;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function hhmmAR(raw: string, utc: boolean): string {
  if (!utc) {
    const m = raw.match(/T(\d{2}):(\d{2})/);
    return m ? `${m[1]}:${m[2]}` : "";
  }
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

async function readOpenMeteo(lat: number, lng: number, fetchImpl: typeof fetch, timeoutMs: number, now: number): Promise<NowReading | null> {
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,precipitation&wind_speed_unit=kmh&timezone=America%2FArgentina%2FBuenos_Aires`;
  const r = await fetchImpl(u, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) return null;
  const c = (await r.json().catch(() => null))?.current;
  if (!c || !finite(c.wind_speed_10m) || !finite(c.wind_direction_10m)) return null;
  const at = String(c.time || "");
  return {
    at, hhmm: hhmmAR(at, false), fetched_at: new Date(now).toISOString(),
    kmh: c.wind_speed_10m, gust_kmh: finite(c.wind_gusts_10m) ? c.wind_gusts_10m : null, from_deg: Math.round(c.wind_direction_10m),
    temp_c: finite(c.temperature_2m) ? c.temperature_2m : null, precip_mm: finite(c.precipitation) ? c.precipitation : null,
    source: "Open-Meteo", stale: false,
  };
}

async function readMetNo(lat: number, lng: number, fetchImpl: typeof fetch, timeoutMs: number, now: number): Promise<NowReading | null> {
  const u = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat.toFixed(4)}&lon=${lng.toFixed(4)}`;
  const r = await fetchImpl(u, {
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "User-Agent": "Golflet/1.0 https://golflet.vercel.app", Accept: "application/json" },
  });
  if (!r.ok) return null;
  const series = (await r.json().catch(() => null))?.properties?.timeseries;
  const row = Array.isArray(series) ? series.find((x: { time?: string }) => x && typeof x.time === "string") : null;
  const details = row?.data?.instant?.details;
  const speed = details ? Number(details.wind_speed) : NaN;
  const dir = details ? Number(details.wind_from_direction) : NaN;
  if (!row || !Number.isFinite(speed) || !Number.isFinite(dir)) return null;
  const gust = Number(details.wind_speed_of_gust);
  const temp = Number(details.air_temperature);
  const rain = Number(row?.data?.next_1_hours?.details?.precipitation_amount);
  const at = String(row.time);
  return {
    at, hhmm: hhmmAR(at, true), fetched_at: new Date(now).toISOString(),
    kmh: Math.round(speed * 3.6 * 10) / 10, gust_kmh: Number.isFinite(gust) ? Math.round(gust * 3.6 * 10) / 10 : null, from_deg: Math.round(dir),
    temp_c: Number.isFinite(temp) ? temp : null, precip_mm: Number.isFinite(rain) ? rain : null,
    source: "MET Norway", stale: false,
  };
}

export async function currentWeather(lat: number, lng: number, opt?: {
  fetch?: typeof fetch; now?: number; cache?: Map<string, Slot>; retry?: boolean; timeoutMs?: number; freshMs?: number;
}): Promise<NowResult> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return { weather: null, reason: "Posición inválida" };
  const fetchImpl = opt?.fetch || fetch;
  const now = opt?.now ?? Date.now();
  const cache = opt?.cache || MEMORY;
  const timeoutMs = opt?.timeoutMs ?? 3000;
  const freshMs = opt?.freshMs ?? 300_000;
  const key = keyOf(lat, lng);
  const hit = cache.get(key);
  if (hit && !opt?.retry && now - hit.t < freshMs) return { weather: { ...hit.v, stale: false }, reason: null };
  let primary: NowReading | null = null;
  try { primary = await readOpenMeteo(lat, lng, fetchImpl, timeoutMs, now); } catch { primary = null; }
  if (primary) { cache.set(key, { t: now, v: primary }); return { weather: primary, reason: null }; }
  let backup: NowReading | null = null;
  try { backup = await readMetNo(lat, lng, fetchImpl, timeoutMs, now); } catch { backup = null; }
  if (backup) { cache.set(key, { t: now, v: backup }); return { weather: backup, reason: null }; }
  if (hit) return { weather: { ...hit.v, stale: true }, reason: "cached" };
  return { weather: null, reason: FAIL };
}
