import { handle, json, requireUser } from "@/lib/http";
import { roundsWeather } from "@/lib/weather";
/** GET → { source, rounds: { [round_id]: {temp_c, precip_mm, rain_hours, wind_kmh, gust_kmh, weather_code, condition, window, basis} }, coverage }.
 *  Open-Meteo archive; fetches ≤20 missing days per call, the rest fill on later calls. */
export const GET = handle(async (req: Request) => {
  const u = await requireUser(req); const { list, ...d } = await roundsWeather(u.id, 20);
  return json(d);
});
