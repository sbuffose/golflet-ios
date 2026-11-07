import { handle, json, requireUser } from "@/lib/http";
import { HttpError } from "@/lib/http-error";

/** t245u: the wind right now (Open-Meteo «current», 15-minute data, no key) at a rounded point (~100 m). GET ?lat=&lng=
 *  → { at, kmh, gust_kmh, from_deg, temp_c, precip_mm, source }. Cached 5 min per point. Nothing is stored. */
const CACHE = new Map<string, { t: number; v: any }>();
export const GET = handle(async (req: Request) => {
  await requireUser(req);
  const sp = new URL(req.url).searchParams, lat = Number(sp.get("lat")), lng = Number(sp.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new HttpError(400, "Posición inválida");
  const la = lat.toFixed(3), lo = lng.toFixed(3), k = `${la},${lo}`, hit = CACHE.get(k);
  if (hit && Date.now() - hit.t < 300_000) return json(hit.v);
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,precipitation&wind_speed_unit=kmh&timezone=America%2FArgentina%2FBuenos_Aires`;
  const r = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!r || !r.ok) throw new HttpError(502, "Sin datos de viento ahora");
  const c = (await r.json().catch(() => null))?.current;
  if (!c || !Number.isFinite(c.wind_speed_10m) || !Number.isFinite(c.wind_direction_10m)) throw new HttpError(502, "Sin datos de viento ahora");
  const v = { at: c.time, interval_s: c.interval ?? 900, kmh: c.wind_speed_10m, gust_kmh: Number.isFinite(c.wind_gusts_10m) ? c.wind_gusts_10m : null, from_deg: Math.round(c.wind_direction_10m),
    temp_c: Number.isFinite(c.temperature_2m) ? c.temperature_2m : null, precip_mm: Number.isFinite(c.precipitation) ? c.precipitation : null, source: "Open-Meteo" };
  if (CACHE.size > 500) CACHE.clear(); CACHE.set(k, { t: Date.now(), v });
  return json(v);
});
