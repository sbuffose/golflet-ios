import { handle, json, HttpError } from "@/lib/http";
import { audit, requireAdmin } from "@/lib/admin";
import { adminReporter } from "@/lib/pins";
/** GET → who reported (name, email). Only on purpose; every look is written to the audit log. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireAdmin(req); const { id } = await ctx.params; if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "Reporte no encontrado");
  const r = await adminReporter(id); await audit(me, "pin.report.reporter_view", { type: "pin_report", id }, "Vio quién reportó una bandera");
  return json({ reporter: r });
});
