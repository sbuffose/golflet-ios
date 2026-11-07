import { handle, json, requireUser } from "@/lib/http";
import { listSamples } from "@/lib/shot-samples";
/** All shot samples of a round (including discarded, flagged). */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => { const u = await requireUser(req); const { id } = await ctx.params; return json({ samples: await listSamples(u.id, id) }); });
