import { readFileSync } from "node:fs";
import path from "node:path";
import { handle, requireUser } from "@/lib/http";
import { getPlan } from "@/lib/plans";
import { getCourseMap } from "@/lib/course-map";
import { getGreenGuide } from "@/lib/green-guide";
import { yardbookPdf, type PrintLogo } from "@/lib/yardbook-pdf";

export const runtime = "nodejs";
type C = { params: Promise<{ id: string }> };
function printLogo(club: string): PrintLogo {
  if (!/^\d{1,5}$/.test(club)) return null;
  try { const j = JSON.parse(readFileSync(path.join(process.cwd(), "lib", "print-logos", `${club}.json`), "utf8")); return { w: j.w, h: j.h, b64: j.b64 }; } catch { return null; }
}
/** t190u/t191u: GET ?holes=1,2,3&format=duplex|simplex&rules=torneo|normal → the owner's plan as a pocket yardage book (A4, 4 cards of A6 per sheet,
 *  pure black and white). rules defaults to "normal" (full 21 cm card, no strip; t209u) and is forced to "torneo" when the round is a competition (torneo on). Owner only. ?as=cards → per-hole card geometry for the pencil log reader (§66). API_v5 §63. */
export const GET = handle(async (req: Request, ctx: C) => {
  const u = await requireUser(req);
  const d: any = await getPlan(u.id, (await ctx.params).id);
  if (!d.course) return new Response(JSON.stringify({ error: "Todavía no tenemos datos de esta cancha" }), { status: 404, headers: { "content-type": "application/json" } });
  // t198u: printing is gated on course completeness (Jockey-level mapping); no half-empty cards
  if (d.course.completeness && !d.course.completeness.ready.libreta) return new Response(JSON.stringify({ error: "Cancha en relevamiento: todavía no tenemos todos los datos de esta cancha para imprimir la libreta", completeness: d.course.completeness }), { status: 409, headers: { "content-type": "application/json", "cache-control": "private, no-store" } });
  const sp = new URL(req.url).searchParams;
  const holes = (sp.get("holes") || "").split(",").map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 18);
  const format = sp.get("format") === "simplex" ? "simplex" : "duplex";
  const rules = sp.get("rules") !== "torneo" && !d.torneo?.on && !d.torneo?.active ? "normal" : "torneo";   // t209u: full-length card (no strip) by default
  const map = d.course.map === false ? null : await getCourseMap(d.course.club_code, d.course.course);
  if (sp.get("as") === "cards") {   // t202u: card geometry for "Subir libreta" (no PDF), every rules × format variant
    const cards: Record<string, any> = {}, gg = getGreenGuide(d.course.club_code, d.course.course);
    for (const ru of ["torneo", "normal"] as const) for (const fo of ["duplex", "simplex"] as const) cards[`${ru}|${fo}`] = yardbookPdf(d, map, gg, null, { holes: [], format: fo, rules: ru }).card_meta;
    return Response.json({ course: { club_code: d.course.club_code, course: d.course.course }, plan_id: d.plan.id, date: d.plan.date, mode: "estrategia", cards }, { headers: { "cache-control": "private, no-store" } });
  }
  const r = yardbookPdf(d, map, getGreenGuide(d.course.club_code, d.course.course), printLogo(String(d.course.club_code)), { holes, format, rules });
  const name = `libreta-${String(d.course.course).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${d.plan.date}.pdf`;
  return new Response(new Uint8Array(r.pdf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${name}"`, "cache-control": "private, no-store",
    "x-golflet-green-scale": r.minRatio ? `1:${r.minRatio}` : "none", "x-golflet-rules": rules } });
});
