import { handle, json, HttpError } from "@/lib/http";
import { adminBody, audit, requireAdmin } from "@/lib/admin";
import { adminReport, adminResolve } from "@/lib/pins";
type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f-]{36}$/i;
/** GET → report + green map + current pin. POST { action: 'clear' | 'move' (lat, lng, zone) | 'dismiss' }. */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  await requireAdmin(req); const { id } = await ctx.params; if (!UUID.test(id)) throw new HttpError(404, "Reporte no encontrado");
  return json(await adminReport(id));
});
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireAdmin(req); const { id } = await ctx.params; if (!UUID.test(id)) throw new HttpError(404, "Reporte no encontrado");
  const b = await adminBody(req); const r = await adminResolve(me.id, id, b);
  await audit(me, `pin.report.${String(b.action).slice(0, 10)}`, { type: "pin_report", id }, `Reporte de bandera: ${b.action}`);
  return json(r);
});
