import { handle, json, requireUser } from "@/lib/http";
import { leave } from "@/lib/groups";
/** POST → leave. The group row stays, including when the last member leaves. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => { const u = await requireUser(req); const { id } = await ctx.params; return json(await leave(u.id, id)); });
