import { handle, json, requireUser } from "@/lib/http";
import { outliersExplainer } from "@/lib/outliers";
/** Personalized net double bogey explainer (web page #/outliers, iOS sheet/page). API_v5 §25. */
export const GET = handle(async (req: Request) => { const user = await requireUser(req); return json(await outliersExplainer(user.id)); });
