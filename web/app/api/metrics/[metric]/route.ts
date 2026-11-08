import { handle, json, requireUser, HttpError } from "@/lib/http";
import { buildData } from "@/lib/data";
import { hcpImpact } from "@/lib/hcp-impact";
import { METRICS, metricDetail, metricSummary, parseOpts, type Metric } from "@/lib/metrics";

/** Drill-down for a metric tile (web + iOS).
 *  ?range=1m|3m|6m|12m|all (period selector; overrides scope/year when present)
 *  ?scope=year|since|all&year=YYYY&course=all|other|<course_key>&sort=date|gross|net|count&order=asc|desc
 *  /api/metrics/summary?range=…&course=… returns the range-filtered tiles for Inicio / Resumen / Cancha. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ metric: string }> }) => {
  const user = await requireUser(req); const { metric } = await ctx.params;
  const u = new URL(req.url);
  if (metric === "summary") { const r0 = u.searchParams.get("range"); if (r0 && !["1m", "3m", "6m", "12m", "all"].includes(r0)) throw new HttpError(400, "range inválido (1m, 3m, 6m, 12m o all)"); const o = parseOpts(u); return json(metricSummary(await buildData(user.id), o.range ? o : { ...o, scope: "all" })); }
  if (metric === "hcp-impact") { const r0 = u.searchParams.get("range"); if (r0 && !["1m", "3m", "6m", "12m", "all"].includes(r0)) throw new HttpError(400, "range inválido (1m, 3m, 6m, 12m o all)"); const o = parseOpts(u); return json({ range: o.range ?? "all", hcp_impact: hcpImpact(await buildData(user.id), o.range ? (o.since ?? null) : null) }); }
  if (!(METRICS as readonly string[]).includes(metric)) throw new HttpError(404, "Métrica desconocida");
  const r = u.searchParams.get("range"); if (r && !["1m", "3m", "6m", "12m", "all"].includes(r)) throw new HttpError(400, "range inválido (1m, 3m, 6m, 12m o all)");
  return json(metricDetail(await buildData(user.id), metric as Metric, parseOpts(u)));
});
