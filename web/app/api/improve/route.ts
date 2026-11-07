import { handle, json, requireUser, HttpError } from "@/lib/http";
import { loadImprove } from "@/lib/improve";
import { improve, areaDetail, AREAS } from "@/lib/improve-core";
import { parseRange, RANGE_LABEL } from "@/lib/metrics";

/** "Qué trabajar": top-3 areas by estimated strokes lost per round. ?range=1m|3m|6m|12m|all ; ?area=<key> → that area's evidence. */
export const GET = handle(async (req: Request) => {
  const user = await requireUser(req); const u = new URL(req.url);
  const rp = u.searchParams.get("range"), range = parseRange(rp); if (rp && !range) throw new HttpError(400, "range: 1m | 3m | 6m | 12m | all");
  const area = u.searchParams.get("area"); if (area && !AREAS[area]) throw new HttpError(400, `area: ${Object.keys(AREAS).join(" | ")}`);
  const d = await loadImprove(user.id, range);
  const meta = { range: d.range, range_label: RANGE_LABEL[d.range as keyof typeof RANGE_LABEL], since: d.since };
  if (area) return json({ ...meta, ...areaDetail(area, d.rounds, d.holes, d.shots, d.recaps, d.hi) });
  const { putting, ...rest } = improve(d.rounds, d.holes, d.shots, d.recaps, d.hi);
  return json({ ...meta, ...rest });
});
