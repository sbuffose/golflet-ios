import { handle, requireUser } from "@/lib/http";
import { myPrivateMetrics } from "@/lib/private-metrics";
import { assertOwnerOnly, PRIVATE_HEADERS } from "@/lib/private-guard";
/** PRIVATE (owner session only): GET → { private, played, matched, overall_avg_diff, bands:[{key,label,played,matched,avg_diff}], partners:[{key,name,count,matched,avg_diff,last_date}], empty, note }.
 *  No subject parameter exists; naming one → 404. Never exposed to groups, profesores, shared links or admin. */
export const GET = handle(async (req: Request) => {
  const u = await requireUser(req); assertOwnerOnly(req);
  return Response.json(await myPrivateMetrics(u.id), { headers: PRIVATE_HEADERS });
});
