import { handle, requireUser } from "@/lib/http";
import { myPartner } from "@/lib/private-metrics";
import { assertOwnerOnly, PRIVATE_HEADERS } from "@/lib/private-guard";
/** PRIVATE: GET /api/me/private-metrics/partners/{key} (key from the list, normalized name) → { partner, overall_avg_diff, tee_times:[…] }. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ key: string }> }) => {
  const u = await requireUser(req); assertOwnerOnly(req); const { key } = await ctx.params;
  return Response.json(await myPartner(u.id, key), { headers: PRIVATE_HEADERS });
});
