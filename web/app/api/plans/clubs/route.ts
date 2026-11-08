import { handle, json, requireUser } from "@/lib/http";
import { planClubs } from "@/lib/plans";

/** t179u: per club, Libreto (typed carry/total) + GPS dispersion (wind-normalised mean + covariance, yd). API_v5 §61. */
export const GET = handle(async (req: Request) => { const u = await requireUser(req); return json(await planClubs(u.id)); });
