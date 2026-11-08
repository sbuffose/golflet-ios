import { handle, json, requireUser } from "@/lib/http";
import { getMatch, putMatch, abandonMatch } from "@/lib/matches";

type Ctx = { params: Promise<{ id: string }> };
/** t260u: one match. GET · PUT {date, course_label?, tee_time_id?, def, scores, finish?} (upsert by the client's uuid; 409 once finished) · DELETE = abandon (soft, open only). */
export const GET = handle(async (req: Request, ctx: Ctx) => { const u = await requireUser(req); return json(await getMatch(u.id, (await ctx.params).id)); });
export const PUT = handle(async (req: Request, ctx: Ctx) => { const u = await requireUser(req); return json(await putMatch(u.id, (await ctx.params).id, await req.json().catch(() => ({})))); });
export const DELETE = handle(async (req: Request, ctx: Ctx) => { const u = await requireUser(req); return json(await abandonMatch(u.id, (await ctx.params).id)); });
