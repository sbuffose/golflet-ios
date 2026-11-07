import { handle, json, requireUser } from "@/lib/http";
import { getTeeTime, teesFor } from "@/lib/tee-times";

type Ctx = { params: Promise<{ id: string }> };
/** One booking (read-only) + its course tees with the playing handicap (official when the club calculator answered). ?modality=&tee= */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req); const u = new URL(req.url);
  const t = await getTeeTime(user.id, (await ctx.params).id);
  return json({ tee_time: t, ...(await teesFor(user.id, t, { tee: u.searchParams.get("tee"), modality: u.searchParams.get("modality") })) });
});
