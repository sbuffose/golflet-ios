import { handle, json, requireUser, HttpError } from "@/lib/http";
import { loadImprove } from "@/lib/improve";
import { putting } from "@/lib/improve-core";
import { parseRange, RANGE_LABEL } from "@/lib/metrics";

/** Putting metrics: putts per round (notes) + per hole / per GIR / 1- and 3-putts / first-putt distance (GPS). ?range= */
export const GET = handle(async (req: Request) => {
  const user = await requireUser(req); const u = new URL(req.url);
  const rp = u.searchParams.get("range"), range = parseRange(rp); if (rp && !range) throw new HttpError(400, "range: 1m | 3m | 6m | 12m | all");
  const d = await loadImprove(user.id, range);
  return json({ range: d.range, range_label: RANGE_LABEL[d.range as keyof typeof RANGE_LABEL], since: d.since, ...putting(d.rounds, d.holes) });
});
