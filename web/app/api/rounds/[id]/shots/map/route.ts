import { handle, json, requireUser } from "@/lib/http";
import { holeMap } from "@/lib/shot-samples";

/** t128u: GET ?hole=N (optional) → per hole: green, tee, hazards, flag (+ flag_source) and every shot with start/end points + "¿a cuánto la dejaste?". */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req); const { id } = await ctx.params; const h = Number(new URL(req.url).searchParams.get("hole"));
  return json(await holeMap(user.id, id, Number.isInteger(h) && h >= 1 && h <= 36 ? h : null));
});
