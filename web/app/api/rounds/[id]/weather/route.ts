import { handle, json, requireUser } from "@/lib/http";
import { roundWeather } from "@/lib/weather";
/** GET → { round_id, weather | null, reason?: no_course_location | not_played | unavailable | error, source }.
 *  ?retry=1 refetches a forecast or a miss. A stored archive row is kept. Own rounds only (404 otherwise). */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const u = await requireUser(req); const { id } = await ctx.params;
  const retry = new URL(req.url).searchParams.get("retry") === "1";
  return json(await roundWeather(u.id, id, { retry }));
});
