import { handle, json, requireUser } from "@/lib/http";
import { weatherMetrics } from "@/lib/weather";
/** GET → groups (lluvia/seco, temperatura, viento) with mean differential per bucket (≥3 rounds each).
 *  ?dim=lluvia|temperatura|viento[&bucket=…] → the rounds behind a metric (detail page). */
export const GET = handle(async (req: Request) => {
  const u = await requireUser(req); const s = new URL(req.url).searchParams;
  return json(await weatherMetrics(u.id, s.get("dim"), s.get("bucket")));
});
