import { handle, json, requireUser } from "@/lib/http";
import { planSetup } from "@/lib/plans";

/** t176u: courses with a detailed map, the player's OWN upcoming tee times (prefill, private), own pace. API_v5 §61. */
export const GET = handle(async (req: Request) => { const u = await requireUser(req); return json(await planSetup(u.id)); });
