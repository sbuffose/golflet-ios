import { handle, json, requireUser } from "@/lib/http";
import { studentView } from "@/lib/profesor-space";
/** One student, filtered by their "Qué comparto". 404 if they don't share with this profesor. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => { const u = await requireUser(req); const { id } = await ctx.params; return json({ alumno: await studentView(u.id, id) }); });
