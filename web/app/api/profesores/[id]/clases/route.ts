import { handle, json, requireUser } from "@/lib/http";
import { myClasses } from "@/lib/profesor-sessions";
/** Student: classes and content this profesor logged/assigned for me. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => { const u = await requireUser(req); const { id } = await ctx.params; return json(await myClasses(u.id, id)); });
