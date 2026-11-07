import { handle, json, requireUser } from "@/lib/http";
import { leave } from "@/lib/groups";
/** POST → leave the group (the owner leaving deletes it). */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => { const u = await requireUser(req); const { id } = await ctx.params; return json(await leave(u.id, id)); });
