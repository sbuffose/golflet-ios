import { readFileSync } from "node:fs";
import path from "node:path";
import { handle, requireUser } from "@/lib/http";
import { q } from "@/lib/db";
import { courseBookData } from "@/lib/course-book";
import { yardbookPdf, type PrintLogo } from "@/lib/yardbook-pdf";
import { torneoNow } from "@/lib/torneo";

export const runtime = "nodejs";
type C = { params: Promise<{ club: string; course: string }> };
/** Official club logo only on the member's own document (club_account at that club); otherwise the club name is typeset. */
async function memberLogo(userId: string, club: string): Promise<PrintLogo> {
  if (!/^\d{1,5}$/.test(club)) return null;
  const [m] = await q(`select 1 from club_account a join club k on k.id=a.club_id where a.user_id=$1 and k.code=$2 limit 1`, [userId, club]);
  if (!m) return null;
  try { const j = JSON.parse(readFileSync(path.join(process.cwd(), "lib", "print-logos", `${club}.json`), "utf8")); return { w: j.w, h: j.h, b64: j.b64 }; } catch { return null; }
}
/** t201u: GET ?holes=&format=duplex|simplex&rules=torneo|normal&date=YYYY-MM-DD&time=HH:MM[&as=json] (t214u: forecast wind per hole when date+time are given) → "Libreta de la cancha": the plain course guide
 *  (hole design, bearing, markers 50–250, hazards with carries, greens/slopes on the backs), no plan data. Same 3-up A4 landscape duplex sheet,
 *  watermark and Regla 4.3 rules as the strategy libreta; ?as=cards → per-hole card geometry for the pencil log reader (§66); rules forced to torneo while modo torneo is active. 409 when the course is en relevamiento. API_v5 §65. */
export const GET = handle(async (req: Request, ctx: C) => {
  const u = await requireUser(req);
  const { club, course } = await ctx.params, cc = decodeURIComponent(club), cn = decodeURIComponent(course);
  const sp = new URL(req.url).searchParams;
  const d: any = await courseBookData(cc, cn, { date: sp.get("date"), time: sp.get("time") });
  if (!d) return Response.json({ error: "Todavía no tenemos datos de esta cancha" }, { status: 404 });
  const { _map, _guide, ...pub } = d;
  if (sp.get("as") === "json") return Response.json(pub, { headers: { "cache-control": "private, no-cache" } });
  if (!d.course.completeness.ready.libreta) return Response.json({ error: "Cancha en relevamiento: todavía no tenemos todos los datos de esta cancha para imprimir la libreta", completeness: d.course.completeness }, { status: 409, headers: { "cache-control": "private, no-store" } });
  if (sp.get("as") === "cards") {   // t202u: card geometry for "Subir libreta" (no PDF), every rules × format variant
    const cards: Record<string, any> = {};
    for (const rules of ["torneo", "normal"] as const) for (const format of ["duplex", "simplex"] as const) cards[`${rules}|${format}`] = yardbookPdf(d, _map, _guide, null, { holes: [], format, rules, mode: "cancha" }).card_meta;
    return Response.json({ course: { club_code: d.course.club_code, course: d.course.course }, mode: "cancha", cards }, { headers: { "cache-control": "private, no-store" } });
  }
  const holes = (sp.get("holes") || "").split(",").map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 18);
  const format = sp.get("format") === "simplex" ? "simplex" : "duplex";
  const tn = await torneoNow(u.id);
  const rules = sp.get("rules") !== "torneo" && !tn.on && !tn.active ? "normal" : "torneo";   // t209u: full-length card (no strip) by default
  const r = yardbookPdf(d, _map, _guide, await memberLogo(u.id, cc), { holes, format, rules, mode: "cancha" });
  const name = `libreta-cancha-${String(d.course.course).toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;
  return new Response(new Uint8Array(r.pdf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${name}"`, "cache-control": "private, no-store",
    "x-golflet-green-scale": r.minRatio ? `1:${r.minRatio}` : "none", "x-golflet-rules": rules, "x-golflet-mode": "cancha" } });
});
