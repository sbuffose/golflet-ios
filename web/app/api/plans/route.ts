import { handle, json, requireUser } from "@/lib/http";
import { listPlans, createPlan } from "@/lib/plans";

/** t176u Estrategia de juego: GET → own plans · POST {club_code, course, date, tee_time, start_hole?, min_per_hole?, tee_time_id?, dist_source?} → plan. API_v5 §61. */
export const GET = handle(async (req: Request) => { const u = await requireUser(req); return json({ plans: await listPlans(u.id) }); });
export const POST = handle(async (req: Request) => { const u = await requireUser(req); return json(await createPlan(u.id, await req.json().catch(() => ({}))), 201); });
