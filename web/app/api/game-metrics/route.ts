import { handle, json, requireUser } from "@/lib/http";
import { parseRange } from "@/lib/metrics";
import { loadGameMetrics } from "@/lib/game-metrics";

/** GET ?range=3m|6m|1y|all -> fairways, drive miss, GIR, approach buckets (yd), putts from the user's live GPS rounds (API_v5 §55). */
export const GET = handle(async (req: Request) => {
  const user = await requireUser(req); const u = new URL(req.url);
  return json(await loadGameMetrics(user.id, parseRange(u.searchParams.get("range"))));
});
