/** Shared hourly wind (Open-Meteo forecast/archive), cached in weather_hourly. Weather isn't personal: used by the strategy plans
 *  (lib/plans) and the course libreta (lib/course-book, t214u). Moved out of lib/plans so non-owner modules don't import it. */
import { q } from "./db";
import { nowAR } from "./tee-times-core";
import type { Hourly } from "./plan-core";

export const FORECAST_DAYS = 16;
const FORECAST = "https://api.open-meteo.com/v1/forecast", ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";
const HOURLY = "wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,precipitation";   // t234u: temperature + rain for the shot adjustments
export const addDays = (d: string, n: number) => new Date(Date.parse(d + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
export const dayDiff = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);

/* ---------- hourly wind (cached, shared: weather isn't personal) ---------- */
async function fetchHourly(base: string, lat: number, lng: number, date: string): Promise<Hourly | null> {
  const u = `${base}?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&start_date=${date}&end_date=${date}&hourly=${HOURLY}&timezone=America%2FArgentina%2FBuenos_Aires&wind_speed_unit=kmh`;
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
  try { const r = await fetch(u, { signal: ctl.signal, headers: { "User-Agent": "Golflet/1.0 (estrategia de juego)" } }); if (!r.ok) return null;
    const h = (await r.json())?.hourly; return h?.time?.length && h.wind_speed_10m?.some((x: any) => x != null) ? { time: h.time, wind_speed_10m: h.wind_speed_10m, wind_direction_10m: h.wind_direction_10m, wind_gusts_10m: h.wind_gusts_10m, ...(h.temperature_2m ? { temperature_2m: h.temperature_2m } : {}), ...(h.precipitation ? { precipitation: h.precipitation } : {}) } : null; }
  catch { return null; } finally { clearTimeout(t); }
}
/** kind=forecast: TTL 1 h. kind=observed: archive rows are final; recent-past rows (forecast API) are refreshed after 12 h. */
export async function hourlyWind(lat: number, lng: number, date: string, kind: "forecast" | "observed", allowFetch = true): Promise<{ hourly: Hourly | null; status: "ok" | "unavailable" | "not_fetched"; source: string | null; fetched_at: string | null }> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}|${date}|${kind}`;
  const [c] = await q(`select hourly, status, source, fetched_at from weather_hourly where key=$1`, [key]);
  const age = c ? Date.now() - new Date(c.fetched_at).getTime() : Infinity;
  const fresh = c && (kind === "forecast" ? age < 3600e3 && (!c.hourly || !!c.hourly.temperature_2m) : c.source === "open-meteo-archive" && c.status === "ok" ? true : age < 12 * 3600e3);
  if (fresh || !allowFetch) return c ? { hourly: c.hourly, status: c.status, source: c.source, fetched_at: c.fetched_at } : { hourly: null, status: "not_fetched", source: null, fetched_at: null };
  const today = nowAR().date, archive = kind === "observed" && dayDiff(date, today) > 6;
  let h = await fetchHourly(archive ? ARCHIVE : FORECAST, lat, lng, date), source = archive ? "open-meteo-archive" : "open-meteo-forecast";
  if (!h && kind === "observed") { h = await fetchHourly(archive ? FORECAST : ARCHIVE, lat, lng, date); source = archive ? "open-meteo-forecast" : "open-meteo-archive"; }
  if (!h && c) return { hourly: c.hourly, status: c.status, source: c.source, fetched_at: c.fetched_at };   // keep the last good copy on a network error
  await q(`insert into weather_hourly (key, lat, lng, date, kind, hourly, status, source, fetched_at) values ($1,$2,$3,$4,$5,$6,$7,$8,now())
           on conflict (key) do update set hourly=excluded.hourly, status=excluded.status, source=excluded.source, fetched_at=now()`,
    [key, lat, lng, date, kind, h ? JSON.stringify(h) : null, h ? "ok" : "unavailable", source]);
  return { hourly: h, status: h ? "ok" : "unavailable", source, fetched_at: new Date().toISOString() };
}

