import { handle, json, requireUser } from "@/lib/http";
import { roundWeather } from "@/lib/weather";
/** GET → { round_id, weather | null, reason?: no_course_location | pending | future, source }. Own rounds only (404 otherwise). */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const u = await requireUser(req); const { id } = await ctx.params;
  return json(await roundWeather(u.id, id));
});
