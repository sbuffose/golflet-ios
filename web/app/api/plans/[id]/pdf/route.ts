import { handle, requireUser } from "@/lib/http";
import { getPlan } from "@/lib/plans";
import { getCourseMap } from "@/lib/course-map";
import { yardagePdf } from "@/lib/yardage-pdf";

export const runtime = "nodejs";
type C = { params: Promise<{ id: string }> };
/** t185u: GET → the owner's plan as a printable A4 yardage book (application/pdf, black and white). Owner only (404 otherwise). API_v5 §62. */
export const GET = handle(async (req: Request, ctx: C) => {
  const u = await requireUser(req);
  const d: any = await getPlan(u.id, (await ctx.params).id);
  if (!d.course) return new Response(JSON.stringify({ error: "Todavía no tenemos el mapa de esta cancha" }), { status: 404, headers: { "content-type": "application/json" } });
  // t198u: printing is gated on course completeness (Jockey-level mapping); no half-empty cards
  if (d.course.completeness && !d.course.completeness.ready.libreta) return new Response(JSON.stringify({ error: "Cancha en relevamiento: todavía no tenemos todos los datos de esta cancha para imprimir la libreta", completeness: d.course.completeness }), { status: 409, headers: { "content-type": "application/json", "cache-control": "private, no-store" } });
  const m = await getCourseMap(d.course.club_code, d.course.course);
  const pdf = yardagePdf(d, m);
  const name = `estrategia-${String(d.course.course).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${d.plan.date}.pdf`;
  return new Response(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${name}"`, "cache-control": "private, no-store" } });
});
