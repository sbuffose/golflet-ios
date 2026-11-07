import { handle, json, requireUser } from "@/lib/http";
import { HttpError } from "@/lib/http-error";

/** Hourly forecast around a tee time. Open-Meteo, no key. GET ?lat=&lng=&at=ISO */
const CACHE = new Map<string, { t: number; v: any }>();
const DIRS = ["norte", "noreste", "este", "sudeste", "sur", "sudoeste", "oeste", "noroeste"];
const cardinal = (deg: number) => {
  const wrapped = ((deg % 360) + 360) % 360;
  return DIRS[Math.floor((wrapped + 22.5) / 45) % 8];
};

export const GET = handle(async (req: Request) => {
  await requireUser(req);
  const sp = new URL(req.url).searchParams;
  const lat = Number(sp.get("lat")), lng = Number(sp.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new HttpError(400, "Posición inválida");
  const atRaw = sp.get("at") || "";
  const around = atRaw ? Date.parse(atRaw) : Date.now();
  if (!Number.isFinite(around)) throw new HttpError(400, "Horario inválido");
  const la = lat.toFixed(3), lo = lng.toFixed(3), k = `${la},${lo},${Math.round(around / 36e5)}`;
  const hit = CACHE.get(k);
  if (hit && Date.now() - hit.t < 300_000) return json(hit.v);

  const u = `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&hourly=temperature_2m,precipitation,wind_speed_10m,wind_direction_10m&wind_speed_unit=kmh&timezone=America%2FArgentina%2FBuenos_Aires&forecast_days=16`;
  const r = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(10000) }).catch(() => null);
  if (!r || !r.ok) throw new HttpError(502, "No pude leer el viento de este horario.");
  const hourly = (await r.json().catch(() => null))?.hourly;
  const times: string[] = hourly?.time || [];
  const dates = times.map((t: string) => Date.parse(t));
  let index = -1, best = Infinity;
  for (let i = 0; i < dates.length; i++) {
    const d = Math.abs(dates[i] - around);
    if (d < best) { best = d; index = i; }
  }
  if (index < 0 || best > 3 * 3600_000) {
    const v = { hours: [], note: "Este horario no trae pronóstico." };
    CACHE.set(k, { t: Date.now(), v });
    return json(v);
  }
  const end = Math.min(dates.length, index + 6);
  const num = (arr: any[], i: number) => {
    const raw = arr?.[i];
    if (raw == null || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  const temps = hourly.temperature_2m || [], rain = hourly.precipitation || [], wind = hourly.wind_speed_10m || [], dir = hourly.wind_direction_10m || [];
  const hours = [];
  for (let i = index; i < end; i++) {
    const kmh = num(wind, i), deg = num(dir, i), temp = num(temps, i), mm = num(rain, i);
    hours.push({
      at: times[i],
      temp_c: temp == null ? null : Math.round(temp),
      rain_mm: mm,
      wind_kmh: kmh == null ? null : Math.round(kmh),
      wind_from_deg: deg == null ? null : Math.round(deg),
      wind_from: deg == null ? null : cardinal(Math.round(deg)),
    });
  }
  const speeds = hours.map(h => h.wind_kmh).filter((n): n is number => n != null);
  const dirs = hours.map(h => h.wind_from_deg).filter((n): n is number => n != null);
  let shift: string | null = null;
  if (speeds.length >= 2 || dirs.length >= 2) {
    const parts: string[] = [];
    if (speeds.length >= 2 && Math.abs(speeds[0] - speeds[speeds.length - 1]) >= 5) parts.push(`el viento pasa de ${speeds[0]} a ${speeds[speeds.length - 1]} km/h`);
    if (dirs.length >= 2) {
      const raw = Math.abs(dirs[0] - dirs[dirs.length - 1]) % 360;
      const delta = Math.min(raw, 360 - raw);
      if (delta >= 45) parts.push(`el rumbo gira de ${cardinal(dirs[0])} a ${cardinal(dirs[dirs.length - 1])}`);
    }
    shift = parts.length ? `En las próximas horas, ${parts.join(" y ")}.` : "El viento se mantiene en estas horas.";
  }
  const v = { hours, shift, source: "Open-Meteo" };
  if (CACHE.size > 400) CACHE.clear();
  CACHE.set(k, { t: Date.now(), v });
  return json(v);
});
