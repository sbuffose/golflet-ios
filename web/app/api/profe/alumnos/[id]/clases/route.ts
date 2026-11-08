import { handle, json, requireUser } from "@/lib/http";
import { pairHistory } from "@/lib/profesor-sessions";
/** Profesor: { sessions, content, plan:{ premium, video_upload, price_ars, billing } } for one student (who shares metrics). */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => { const u = await requireUser(req); const { id } = await ctx.params; return json(await pairHistory(u.id, id)); });
