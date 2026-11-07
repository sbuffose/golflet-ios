import { handle, json, requireUser } from "@/lib/http";
import { getPlan, updatePlan, deletePlan } from "@/lib/plans";

type C = { params: Promise<{ id: string }> };
/** t176u: GET plan + ETA per hole + forecast wind per hole · PATCH {date?, tee_time?, start_hole?, min_per_hole?, dist_source?} · DELETE. Owner only (404 otherwise). */
export const GET = handle(async (req: Request, ctx: C) => { const u = await requireUser(req); return json(await getPlan(u.id, (await ctx.params).id)); });
export const PATCH = handle(async (req: Request, ctx: C) => { const u = await requireUser(req); return json(await updatePlan(u.id, (await ctx.params).id, await req.json().catch(() => ({})))); });
export const DELETE = handle(async (req: Request, ctx: C) => { const u = await requireUser(req); return json(await deletePlan(u.id, (await ctx.params).id)); });
