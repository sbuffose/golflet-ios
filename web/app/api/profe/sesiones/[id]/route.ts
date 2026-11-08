import { handle, json, requireUser } from "@/lib/http";
import { deleteSession } from "@/lib/profesor-sessions";
export const DELETE = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => { const u = await requireUser(req); const { id } = await ctx.params; await deleteSession(u.id, id); return json({ ok: true }); });
