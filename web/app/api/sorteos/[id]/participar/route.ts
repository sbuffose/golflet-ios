import { handle, json, requireUser } from "@/lib/http";
import { enter, leave } from "@/lib/sorteos";
/** POST { acepto_bases: true, bases_version } → enters (409 if closed or bases changed). DELETE → leaves while open. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => { const u = await requireUser(req); return json(await enter(u, (await ctx.params).id, await req.json().catch(() => null))); });
export const DELETE = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => { const u = await requireUser(req); return json(await leave(u, (await ctx.params).id)); });
