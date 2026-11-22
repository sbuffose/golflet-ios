import { handle, json, requireUser } from "@/lib/http";
import { HttpError } from "@/lib/http-error";
import { currentWeather } from "@/lib/weather-now";

/** Wind right now at a rounded point. Open-Meteo, then MET Norway. No key. A stale memory reading is returned only after both fail. */
export const GET = handle(async (req: Request) => {
  await requireUser(req);
  const sp = new URL(req.url).searchParams;
  const lat = Number(sp.get("lat")), lng = Number(sp.get("lng"));
  const { weather, reason } = await currentWeather(lat, lng, { retry: sp.get("retry") === "1" });
  if (!weather) throw new HttpError(502, reason || "Sin datos de viento ahora");
  return json(weather);
});
