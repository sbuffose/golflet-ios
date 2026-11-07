import { handle, json, requireUser } from "@/lib/http";
import { greenResults } from "@/lib/shot-samples";
/** Per hole: ball position on the green vs center (long/short, left/right relative to the approach) + putts. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => { const u = await requireUser(req); const { id } = await ctx.params; return json({ greens: await greenResults(u.id, id) }); });
