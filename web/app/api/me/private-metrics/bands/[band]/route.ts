import { handle, requireUser } from "@/lib/http";
import { myBand } from "@/lib/private-metrics";
import { assertOwnerOnly, PRIVATE_HEADERS } from "@/lib/private-guard";
/** PRIVATE: GET /api/me/private-metrics/bands/{manana|mediodia|tarde} → { band, overall_avg_diff, tee_times:[…] }. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ band: string }> }) => {
  const u = await requireUser(req); assertOwnerOnly(req); const { band } = await ctx.params;
  return Response.json(await myBand(u.id, band), { headers: PRIVATE_HEADERS });
});
