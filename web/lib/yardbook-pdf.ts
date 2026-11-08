/** t190u–t192u: pocket yardage book ("libreta"), pure black and white, on A4 LANDSCAPE: 3 cards side by side (99 mm wide each),
 *  dashed cut lines, 1 card = 1 hole, stapled at the top. Card height: 210 mm, or 177 mm with rules = "torneo" (Rules of Golf 4.3,
 *  Clarification 4.3a/1: a yardage book may be at most 4¼ × 7 in = 108 × 177.8 mm, so a dashed cut line marks a 33 mm strip to cut off).
 *  Duplex (default): print "doble faz, girar en el borde largo". On a landscape sheet the long edge is the top edge, so the sheet turns
 *  up over the top like a calendar: a back cell sits in the SAME column, upright, its bottom edge behind the front's top (the staple).
 *  The back of card N carries the green of the NEXT card's hole (blank if that hole is a par 3: its green is on its own front), so when
 *  card N is flipped up over the staple the green reads upright above hole N+1. The cover's back carries the first green.
 *  Simplex: the green goes on top of each hole's own front. "FRENTE · HOYO n" / "DORSO · HOYO n" sit in the staple margin.
 *  With rules = "torneo" every green image is drawn at ≤ 1:480 (≤ 5.4 pt per yd). API_v5 §63. */
import { printBrand as printBrandOf, Doc, Page, textWidth } from "./pdf-mini";
import { norm360 } from "./plan-core";
import { drawHoleMap, holeFrame, stipple, treesHatch, haloText, windArrow, c16, sgn, dLong, arTime } from "./yardage-pdf";
import { cardLayout, encodeCardId, FID, LOG_H, type CardLayout } from "./shotlog-core";
import { greenGeom, greenBox, RULES_480_PT_PER_YD, type GreenGuideCourse, type GgHole } from "./green-guide-core";

type XY = [number, number];
export type YardbookOpts = { holes?: number[]; format?: "duplex" | "simplex"; rules?: "torneo" | "normal"; brand?: string; mode?: BookMode };
/** t201u: "cancha" = plain course guide (no plan data); "estrategia" = the player's plan (shots, ETA, wind, ± yd). */
export type BookMode = "cancha" | "estrategia";
/** t200u: brand on every printed card (white-label later: PRINT_BRAND env, or opts.brand). */
export { printBrand } from "./pdf-mini";
/** Outlined wordmark rotated along the card's outer right edge (inside the 16 pt margin, no drawing there). */
export function watermark(pg: Page, brand: string, X: number, Y: number, H: number) {
  const ex = X + CW - 11, cy = Y + H / 2;
  pg.rotated(ex, cy, 90, () => pg.outlineText(brand, ex, cy + 3.2, 9, "B", "c", 0.35));
}
export type PrintLogo = { w: number; h: number; b64: string } | null;
export const SHEET_W = 841.89, SHEET_H = 595.28, PER_SHEET = 3, CARD_W_MM = 99, CARD_H_MM = 210, CARD_H_TORNEO_MM = 177;
const MM = 72 / 25.4, CW = SHEET_W / PER_SHEET, PAD = 16, STAPLE = 30, YD = 0.9144;
let RULER: [number, number, number][] | null = null;   // t202u: set by guideHole for the card being drawn
let CH = SHEET_H;   // card height for the current document (set per call; yardbookPdf is synchronous)
const ratio = (ptPerYd: number) => Math.round(2592 / ptPerYd);   // 1 yd = 36 in; paper inches = pt/72 → 1 : (36·72/pt)

/* ---------- green panel (guide detail or map shape) ---------- */
function arrowGlyph(pg: Page, x: number, y: number, dir: number, L: number, strength: 1 | 2 = 1) {
  pg.rotated(x, y, dir, () => {
    if (strength === 2) { pg.black().lw(.8).cap(1).dash().move(x - 1.1, y + L / 2).line(x - 1.1, y - L / 2 + 2.4).move(x + 1.1, y + L / 2).line(x + 1.1, y - L / 2 + 2.4).stroke(); pg.cap(0);   // t230u: double = more slope
      pg.fillBlack().poly([[x - 2.9, y - L / 2 + 3], [x, y - L / 2 - .8], [x + 2.9, y - L / 2 + 3]]).fill(); return; }
    pg.black().lw(.9).cap(1).dash().move(x, y + L / 2).line(x, y - L / 2 + 2.2).stroke(); pg.cap(0);
    pg.fillBlack().poly([[x - 2.1, y - L / 2 + 2.6], [x, y - L / 2 - .6], [x + 2.1, y - L / 2 + 2.6]]).fill(); });
}
function dashDot(pg: Page, a: XY, b: XY) { pg.black().lw(.9).dash([6, 2, 1.2, 2]).move(a[0], a[1]).line(b[0], b[1]).stroke(); pg.dash(); }
/** Draws the guide's green into box; returns pt per yd used. detail=false → shape + bunkers only. */
function guideGreen(pg: Page, g: any, bx: number, by: number, bw: number, bh: number, o: { cap: number | null; detail: boolean; labels?: boolean }) {
  const G = greenGeom(g), [x0, y0, x1, y1] = greenBox(G), ob = G.ob || [];
  const fit = Math.min((bw - 26) / (x1 - x0 + 4), (bh - 30) / (y1 - y0 + (ob.some((z: any) => z.side === "B") ? 10 : 4)));
  const s = o.cap ? Math.min(fit, o.cap) : fit, cx = bx + bw / 2 - ((x0 + x1) / 2) * s, cy = by + bh - 18 + y0 * s;
  const P = ([x, y]: XY): XY => [cx + x * s, cy - y * s];
  for (const b of G.bunkers) stipple(pg, b.poly.map(P));
  const outl = G.outline.map(P);
  if (o.detail) for (const bank of G.banks) for (const [a, b] of bank) { const A = P(a), B = P(b); pg.black().lw(.8).dash().move(A[0], A[1]).line(B[0], B[1]).stroke(); }
  pg.fillWhite().spoly(outl).fill(); pg.black().lw(1.7).dash().spoly(outl).stroke();
  if (o.detail) {
    pg.save().spoly(outl).clip();
    for (const t of G.tiers) { const pts = t.pts.map(P);
      if (t.kind === "nivel") pg.black().lw(1).dash().poly(pts, false).stroke();
      else { pg.black().lw(1.3).dash().poly(pts, false).stroke(); for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
        for (let d = 2; d < L; d += 3.2) { const m: XY = [a[0] + ux * d, a[1] + uy * d]; pg.lw(.7).move(m[0], m[1]).line(m[0] - uy * 3.4, m[1] + ux * 3.4).stroke(); } } } }
    pg.restore();
    // t227u: where the false front ends (club guide): dashed line across + its number outside the right edge
    if (G.false_front) { const ff = G.false_front, a = P([-ff.half[0] - 1, ff.yd]), b = P([ff.half[1] + 1, ff.yd]);
      if (ff.kind !== "pendiente") { pg.save().spoly(outl).clip(); pg.black().lw(1.2).dash([3.2, 2]).move(a[0], a[1]).line(b[0], b[1]).stroke(); pg.dash(); pg.restore(); }   // a slope band already marks it
      if (o.labels !== false) haloText(pg, String(ff.yd), b[0] + 5, b[1] + 2.4, 7, "B", "l"); }
    // t229u: the guide's other numbers on the green (yd from the entrance to that spot)
    if (o.labels !== false) for (const k of G.marks || []) { const q = P(k.at), inw = k.kind === "borde" ? (k.at[0] < 0 ? 1 : -1) : 0;
      pg.fillBlack().circle(q[0], q[1], 1.1).fill(); haloText(pg, String(k.yd), q[0] + inw * 2.6 + (inw ? 0 : 2.4), q[1] + (k.kind === "nivel" ? -2 : 2.4), 7, "B", inw < 0 ? "r" : "l"); }
    for (const f of G.falls) { const q = P(f.at); arrowGlyph(pg, q[0], q[1], f.dir, Math.max(9, Math.min(14, s * 3.4)), f.strength); }
  }
  // depth at the back, width at mid; OB
  const top = Math.min(...outl.map(p => p[1])), mid = P([0, G.depth / 2]);
  if (o.labels !== false) { haloText(pg, `${G.depth}`, mid[0], top + 10, 9, "B", "c"); }
  for (const z of ob) {
    if (z.side === "B") { const yy = top - 6 - (z.yd ? Math.min(z.yd, 14) * s * .5 : 0); dashDot(pg, [bx + 8, yy], [bx + bw - 8, yy]); pg.fillBlack().text(`Fuera de límites${z.yd ? ` · ${z.yd}` : ""}`, bx + bw / 2, yy - 3, 6.2, "R", "c"); }
    else { const sx = z.side === "R" ? bx + bw - 10 : bx + 10; dashDot(pg, [sx, by + 16], [sx, by + bh - 16]); pg.rotated(sx + (z.side === "R" ? -4 : 7), by + bh / 2, -90, () => pg.fillBlack().text(`Fuera de límites${z.yd ? ` · ${z.yd}` : ""}`, sx + (z.side === "R" ? -4 : 7), by + bh / 2, 6.2, "R", "c")); }
  }
  if (o.detail && o.labels !== false) for (const b of G.bunkers) if (b.nums?.length) { const q = P(b.label); const t = b.nums.join("/"); haloText(pg, t, b.side === "L" ? q[0] - (2 * (b.label[0] < 0 ? 0 : 1)) - textWidth(t, "B", 6) * 0 : q[0], q[1] + 2, 6, "B", b.side === "L" ? "r" : "l"); }
  // front marker + scale bar
  const front = P([0, 0]); pg.fillBlack().poly([[front[0] - 3, front[1] + 9], [front[0], front[1] + 5], [front[0] + 3, front[1] + 9]]).fill();
  pg.text("entrada", front[0], front[1] + 16, 5.8, "R", "c");
  const sb = 5 * s, sx0 = bx + 8, sy0 = by + bh - 8; pg.black().lw(1.2).move(sx0, sy0).line(sx0 + sb, sy0).stroke(); pg.lw(.7).move(sx0, sy0 - 2.5).line(sx0, sy0 + 2.5).move(sx0 + sb, sy0 - 2.5).line(sx0 + sb, sy0 + 2.5).stroke();
  pg.fillBlack().text(`5 yd · escala 1:${ratio(s)}`, sx0 + sb + 4, sy0 + 2.2, 6, "R");
  return s;
}
/** Green shape from the course map (no slope data): green + bunkers within 25 m, oriented with the approach up. */
function mapGreen(pg: Page, h: any, bx: number, by: number, bw: number, bh: number, cap: number | null) {
  if (!h?.green?.polygon) return null; const fr = holeFrame(h), gp = h.green.polygon.map(fr.toS) as XY[];
  const near = (h.bunkers || []).map((b: any) => b.polygon.map(fr.toS) as XY[]).filter((p: XY[]) => p.some(q => gp.some(g => Math.hypot(q[0] - g[0], q[1] - g[1]) < 25)));
  const all = [...gp, ...near.flat()], xs = all.map(p => p[0]), ys = all.map(p => p[1]);
  const W = (Math.max(...xs) - Math.min(...xs)) / YD, H = (Math.max(...ys) - Math.min(...ys)) / YD;
  const fit = Math.min((bw - 26) / (W + 4), (bh - 34) / (H + 4)), s = cap ? Math.min(fit, cap) : fit;
  const mx = (Math.max(...xs) + Math.min(...xs)) / 2, my = (Math.max(...ys) + Math.min(...ys)) / 2, ox = bx + bw / 2, oy = by + (bh - 12) / 2;
  const P = (q: XY): XY => [ox + (q[0] - mx) / YD * s, oy + (q[1] - my) / YD * s];
  for (const b of near) stipple(pg, b.map(P));
  const g = gp.map(P); pg.fillWhite().spoly(g).fill(); pg.black().lw(1.7).dash().spoly(g).stroke();
  const gy = gp.map(p => p[1]), depth = Math.round((Math.max(...gy) - Math.min(...gy)) / YD), topY = Math.min(...g.map(p => p[1]));
  const gcx = g.reduce((a, q) => a + q[0], 0) / g.length, top = g.reduce((a, q) => q[1] < a[1] ? q : a, g[0]);
  haloText(pg, String(depth), (gcx + top[0]) / 2, topY + 10, 9, "B", "c");
  const front: XY = g.reduce((a, q) => q[1] > a[1] ? q : a, g[0]); pg.fillBlack().poly([[front[0] - 3, front[1] + 9], [front[0], front[1] + 5], [front[0] + 3, front[1] + 9]]).fill(); pg.text("entrada", front[0], front[1] + 16, 5.8, "R", "c");
  const sb = 5 * s, sx0 = bx + 8, sy0 = by + bh - 8; pg.black().lw(1.2).move(sx0, sy0).line(sx0 + sb, sy0).stroke();
  pg.fillBlack().text(`5 yd · escala 1:${ratio(s)}`, sx0 + sb + 4, sy0 + 2.2, 6, "R");
  return s;
}

/* ---------- schematic hole from the guide (course without map geometry) ---------- */
function markerGlyph(pg: Page, c: string, x: number, y: number) {
  if (c === "rojo") pg.fillBlack().circle(x, y, 2.6).fill();
  else if (c === "azul") pg.fillBlack().rect(x - 2.5, y - 2.5, 5, 5).fill();
  else if (c === "amarillo") { pg.fillWhite().rect(x - 2.5, y - 2.5, 5, 5).fill(); pg.black().lw(.9).rect(x - 2.5, y - 2.5, 5, 5).stroke(); }
  else { pg.fillWhite().circle(x, y, 2.6).fill(); pg.black().lw(.9).circle(x, y, 2.6).stroke(); }
}
function box(pg: Page, s: string, x: number, y: number, al: "l" | "r" = "l") { const tw = textWidth(s, "B", 6.2) + 4, px = al === "r" ? x - tw : x;
  pg.fillWhite().rect(px, y - 4.4, tw, 8.6).fill(); pg.black().lw(.6).dash().rect(px, y - 4.4, tw, 8.6).stroke(); pg.fillBlack().text(s, px + tw / 2, y + 2.2, 6.2, "B", "c"); }
function guideHole(pg: Page, hg: GgHole, g: any, x: any, bx: number, by: number, bw: number, bh: number, cap: number | null) {
  pg.black().lw(.6).dash().rect(bx, by, bw, bh).stroke();
  const depth = g?.depth_yd ?? 30, len = hg.yd, front = len - depth / 2;
  const k = (bh - 26) / (len + depth / 2 + 10), cx = bx + bw / 2, teeY = by + bh - 10, Y = (yd: number) => teeY - yd * k, lat = Math.min(bw * .3, 46);
  pg.save().rect(bx, by, bw, bh).clip();
  for (const z of hg.hazards) {
    const sd = z.side.startsWith("izq") ? -1 : z.side.startsWith("der") ? 1 : 0;
    if (z.kind === "límite") { if (z.side === "atrás") dashDot(pg, [bx + 10, Y(len + depth / 2 + 5)], [bx + bw - 10, Y(len + depth / 2 + 5)]);
      else { const sx = cx + sd * (bw / 2 - 7); dashDot(pg, [sx, by + 8], [sx, by + bh - 8]); } continue; }
    if (z.kind === "árboles") { const sx = cx + sd * (bw / 2 - 18); treesHatch(pg, [[sx - 8, Y(len * .75)], [sx + 8, Y(len * .75)], [sx + 8, Y(len * .2)], [sx - 8, Y(len * .2)]]); continue; }
    let a: number, b: number;
    if (z.to_green?.length) { a = front - Math.max(...z.to_green); b = front - Math.min(...z.to_green); if (a === b) { a -= 4; b += 4; } }
    else if (z.reach != null || z.carry != null) { a = z.reach ?? (z.carry! - 12); b = z.carry ?? (z.reach! + 12); } else continue;
    const ccx = sd ? cx + sd * lat : cx, rx = sd ? 9 : Math.min(bw * .28, 38), poly: XY[] = Array.from({ length: 16 }, (_, i) => { const t = i / 16 * 2 * Math.PI; return [ccx + rx * Math.cos(t), (Y(a) + Y(b)) / 2 + (Y(a) - Y(b)) / 2 * Math.sin(t)] as XY; });
    if (z.kind === "bunker de pasto") { pg.black().lw(.7).dash([1.5, 1.5]).spoly(poly).stroke(); pg.dash(); pg.fillBlack().text("pasto", ccx, (Y(a) + Y(b)) / 2 + 2, 5.5, "R", "c"); continue; }
    stipple(pg, poly);
    const lab = z.to_green?.length ? `${z.to_green.join("-")} al green` : z.reach != null && z.carry != null ? `${z.reach}-${z.carry}` : String(z.carry ?? z.reach);
    if (sd <= 0) box(pg, lab, ccx - rx - 2, (Y(a) + Y(b)) / 2, "r"); else box(pg, lab, ccx + rx + 2, (Y(a) + Y(b)) / 2);
  }
  // line of play
  pg.black().lw(.6).dash([2, 1.8]).move(cx, teeY).line(cx, Y(len)).stroke(); pg.dash();
  RULER = [[cx, teeY, 0], [cx, Y(len), len]];   // t202u: schematic — distance along the line is real, lateral is approximate
  // green (true scale of the card) with its greenside bunkers
  if (g) { const G = greenGeom(g), P = ([gx, gy]: XY): XY => [cx + gx * k, Y(front + gy)];
    for (const b of G.bunkers) stipple(pg, b.poly.map(P));
    const o = G.outline.map(P); pg.fillWhite().spoly(o).fill(); pg.black().lw(1.4).dash().spoly(o).stroke(); }
  // tee
  pg.fillBlack().rect(cx - 5, teeY - 3, 10, 6).fill();
  if (hg.alt_tee) pg.fillBlack().text(`adelantada ${hg.alt_tee}`, cx + 8, teeY + 2, 5.8, "R");
  // the guide's markers: yards to the front of the green (and from the tee)
  for (const m of hg.markers) { const yy = Y(front - m.to_green); markerGlyph(pg, m.c, cx, yy);
    const s = String(m.to_green), tw = textWidth(s, "B", 6.3) + 5; pg.fillBlack().rrect(cx + 5, yy - 4.2, tw, 8.4, 4.2).fill(); pg.fillWhite().text(s, cx + 5 + tw / 2, yy + 2.2, 6.3, "B", "c"); pg.fillBlack();
    if (m.from_tee) haloText(pg, `(${m.from_tee})`, cx - 5, yy + 2.2, 5.8, "R", "r"); }
  // planned shots: dots on the line at the planned distance
  const shots = x.shots || []; let acc = 0;
  shots.forEach((s: any, i: number) => { acc = s.yd_from_tee ?? (acc + (s.yd || 0)); const yy = Y(Math.min(acc, len)), xx = cx + (s.aim_yd || 0) * k;
    pg.fillWhite().circle(xx, yy, 3.4).fill(); pg.fillBlack().circle(xx, yy, 2.6).fill(); haloText(pg, `${i + 1} ${s.club}`, xx - 6, yy + 2.4, 7, "B", "r"); });
  pg.restore();
  return k;
}

/* ---------- cards ---------- */
type Card = { kind: "cover" } | { kind: "hole"; x: any };
/** Pure layout: where every card's front and back go. Cards = cover + holes in play order, 3 per landscape sheet.
 *  Long-edge duplex on landscape = turn over the top edge: the back stays in the same column, upright (no rotation), vertically mirrored
 *  on the sheet (front top ↔ back bottom). back.green_of = the next card's hole, or null (next is a par 3, or there is no next card). */
export function sheetLayout(holes: { hole: number; par: number | null }[], format: "duplex" | "simplex" = "duplex") {
  const cards = [{ kind: "cover" as const, hole: null as number | null, par: null as number | null }, ...holes.map(h => ({ kind: "hole" as const, hole: h.hole, par: h.par }))];
  return cards.map((c, i) => { const sheet = Math.floor(i / PER_SHEET), col = i % PER_SHEET, row = 0, nx = cards[i + 1];
    return { i, kind: c.kind, hole: c.hole, sheet, front: { page: format === "duplex" ? sheet * 2 : sheet, col, row },
      back: format === "duplex" ? { page: sheet * 2 + 1, col, row, rotated: 0, staple: "abajo" as const, green_of: nx && nx.kind === "hole" && nx.par !== 3 ? nx.hole : null, blank_reason: !nx ? "ultima" : nx.par === 3 ? "par3" : null } : null }; });
}
function stapleLabel(pg: Page, X: number, Y: number, left: string, right: string) {
  pg.fillBlack().text(left, X + PAD + FID + 5, Y + PAD + 6, 7, "B"); pg.text(right, X + CW - PAD - FID - 5, Y + PAD + 6, 6, "R", "r");
  pg.black().lw(.4).dash([1, 2]).move(X + PAD, Y + STAPLE - 4).line(X + CW - PAD, Y + STAPLE - 4).stroke(); pg.dash();
}
/** t216u: same per-hole wording in both libretas (and the phone booklet): where it comes from + what the arrow means. */
function windLine(w: any, rumbo: number | null) { return `viene del ${c16(w.from_deg)} · flecha: hacia dónde sopla${rumbo == null ? " (arriba = norte)" : ""}`; }
function header(pg: Page, x: any, h: any, X: number, Y: number, W: number, rumbo: number | null, mode: BookMode = "estrategia") {
  pg.fillBlack().rect(X, Y, 30, 30).fill(); pg.fillWhite().text(String(x.hole), X + 15, Y + 21.5, 17, "B", "c"); pg.fillBlack();
  pg.text(`Par ${x.par ?? "—"} · ${x.play_length_yd ?? h?.play_length_yd ?? "—"} yd`, X + 36, Y + 11, 9.5, "B");
  if (mode === "cancha") {   // course guide: bearing (+ t214u: forecast wind when a day/time was chosen; no shots, no ± yd)
    pg.text(rumbo != null ? `Rumbo ${Math.round(rumbo)}° (${c16(rumbo)})${x.wind ? ` · hora ${x.eta}` : " · salida → green"}` : `Rumbo s/d${x.wind ? ` · hora ${x.eta}` : ""}`, X + 36, Y + 22, 7.5, "R");
    if (rumbo != null) { windArrow(pg, X + W - 9, Y + 15, 8.5, rumbo); pg.fillBlack().text("N arriba", X + W, Y + 30, 5.6, "R", "r"); }
    if (x.wind) { const wy = Y + 44;
      windArrow(pg, X + 9, wy, 8.5, rumbo != null ? norm360(x.wind.from_deg + 180 - rumbo) : norm360(x.wind.from_deg + 180));
      pg.fillBlack().text(`${Math.round(x.wind.kmh)} km/h`, X + 22, wy + 1, 9.5, "B");
      if (x.wind.gust_kmh) pg.text(`ráf. ${Math.round(x.wind.gust_kmh)}`, X + 22 + textWidth(`${Math.round(x.wind.kmh)} km/h`, "B", 9.5) + 4, wy + 1, 7, "R");
      pg.text(windLine(x.wind, rumbo), X + 22, wy + 9.5, 6.5, "R");
      pg.text("pronóstico", X + W, wy + 3, 7, "B", "r"); pg.text("Open-Meteo", X + W, wy + 10.5, 5.8, "R", "r"); }
    return;
  }
  pg.text(`Hora ${x.eta}${rumbo != null ? ` · Rumbo ${Math.round(rumbo)}°` : " · Rumbo s/d"}`, X + 36, Y + 22, 7.5, "R");
  const wy = Y + 44;
  if (x.wind) {
    windArrow(pg, X + 9, wy, 8.5, rumbo != null ? norm360(x.wind.from_deg + 180 - rumbo) : norm360(x.wind.from_deg + 180));
    pg.text(`${Math.round(x.wind.kmh)} km/h`, X + 22, wy + 1, 9.5, "B");
    if (x.wind.gust_kmh) pg.text(`ráf. ${Math.round(x.wind.gust_kmh)}`, X + 22 + textWidth(`${Math.round(x.wind.kmh)} km/h`, "B", 9.5) + 4, wy + 1, 7, "R");
    pg.text(windLine(x.wind, rumbo), X + 22, wy + 9.5, 6.5, "R");
    if (x.effect) { pg.text(`${sgn(x.effect.plays_like_yd)} yd`, X + W, wy + 3, 11, "B", "r"); pg.text("por viento", X + W, wy + 10.5, 6, "R", "r"); }
    else { pg.text("± s/d", X + W, wy + 3, 9, "B", "r"); pg.text(rumbo == null ? "falta el rumbo" : "", X + W, wy + 10.5, 5.8, "R", "r"); }
  } else pg.text("Viento: sin pronóstico", X, wy + 2, 7.5, "R");
}
/** t202u: pencil shot log + reading aids (corner fiducials, card id strip). Pure black; OMR reads it on the phone (lib/shotlog-core). */
function vGlyph(pg: Page, kind: "l" | "c" | "r", x: number, y: number) {
  pg.black().lw(.8).dash();
  if (kind === "c") pg.move(x, y - 2).line(x + 2, y).line(x + 5.5, y - 4.5).stroke();
  else { const d = kind === "l" ? -1 : 1, a = x + 2.75 - d * 2.75, b = x + 2.75 + d * 2.75; pg.move(a, y - 2.2).line(b, y - 2.2).stroke(); pg.move(b - d * 2, y - 4.2).line(b, y - 2.2).line(b - d * 2, y - .2).stroke(); }
}
function shotLog(pg: Page, L: CardLayout, X: number, Y: number, bits: number[], idText: string, mode: BookMode, par: number | null) {
  const T = (x: number, y: number): [number, number] => [X + x, Y + y];
  for (const k of ["tl", "tr", "bl", "br"] as const) { const [cx, cy] = T(...L.fid[k]); pg.fillBlack().rect(cx - FID / 2, cy - FID / 2, FID, FID).fill(); }
  L.id.forEach((c, i) => { const on = i === 0 || i === L.id.length - 1 || bits[i - 1] === 1; const [x, y] = T(c.x, c.y);
    if (on) pg.fillBlack().rect(x, y, c.w, c.h).fill(); else pg.black().lw(.3).dash().rect(x + .15, y + .15, c.w - .3, c.h - .3).stroke(); });
  const last = L.id[L.id.length - 1]; pg.fillBlack().text(idText, X + last.x + last.w + 5, Y + last.y + 4.4, 5.4, "R");
  const [lx, ly] = T(L.x0, L.top); pg.black().lw(.5).dash([2, 1.5]).move(lx, ly).line(X + CW - PAD, ly).stroke(); pg.dash();
  const R = (y: number) => Y + y, x0 = X + L.x0;
  pg.fillBlack().text(mode === "estrategia" && L.clubs.length ? "Lo jugué" : "Palos", x0, R(L.rows.r1), 6.6, "B");
  if (mode === "estrategia" && L.clubs.length) { for (const b of L.boxes.filter(b => b.key.startsWith("club_"))) { pg.black().lw(.7).dash().rect(X + b.x, Y + b.y, b.w, b.h).stroke(); pg.fillBlack().text(b.label!, X + b.x + b.w + 2.2, Y + b.y + 6, 6.2, "B"); } }
  else for (let i = 0; i < 4; i++) { const bx = x0 + 34 + i * 54; pg.fillBlack().text(String(i + 1), bx, R(L.rows.r1), 6.2, "B"); pg.black().lw(.45).dash().move(bx + 6, R(L.rows.r1) + 1).line(bx + 44, R(L.rows.r1) + 1).stroke(); }
  pg.fillBlack().text(par === 3 ? "Salida" : "Fairway", x0, R(L.rows.r2), 6.6, "B");
  if (par === 3) pg.text("par 3", x0 + 34, R(L.rows.r2), 6, "R");
  for (const b of L.boxes) { if (b.key.startsWith("club_") || b.key.startsWith("fp_")) continue;
    pg.black().lw(.7).dash().rect(X + b.x, Y + b.y, b.w, b.h).stroke();
    if (b.key.startsWith("fw_")) vGlyph(pg, b.key === "fw_l" ? "l" : b.key === "fw_c" ? "c" : "r", X + b.x + b.w + 1.6, Y + b.y + 5.8);
    else pg.fillBlack().text(b.label!, X + b.x - 2, Y + b.y + 6, 6.2, "B", "r"); }
  pg.fillBlack().text("Putts", x0, R(L.rows.r3), 6.6, "B");
  for (const r of L.rings) pg.fillBlack().text(r.label, X + r.cx, Y + r.cy + 2.4, 7, "B", "c");
  pg.text("1er putt", X + L.boxes.find(b => b.key === "fp_lt1")!.x - 30, R(L.rows.r3), 6.2, "B");
  for (const b of L.boxes.filter(b => b.key.startsWith("fp_"))) { pg.black().lw(.7).dash().rect(X + b.x, Y + b.y, b.w, b.h).stroke(); pg.fillBlack().text(b.label ?? "", X + b.x + b.w + 1.5, Y + b.y + 6, 5.6, "R"); }
  pg.fillBlack().text("m", X + CW - PAD, R(L.rows.r3), 5.6, "R", "r");
  pg.text("Circulá los putts · marcá con X dónde quedó cada golpe (1, 2, 3…) · sin score", x0, R(L.rows.hint), 5.4, "R");
}
function planLine(pg: Page, x: any, X: number, y: number, W: number, mode: BookMode = "estrategia") {
  if (mode === "cancha") { pg.fillBlack().text("Notas", X, y, 7, "B"); pg.black().lw(.45).dash(); for (let i = 0; i < 3; i++) pg.move(X + 26, y + i * 11).line(X + W, y + i * 11).stroke(); return; }
  const sh = x.shots || [];
  pg.fillBlack().text("Cómo lo juego", X, y, 7.5, "B");
  pg.text(sh.length ? `${sh.length} ${sh.length === 1 ? "golpe" : "golpes"} al green · ${sh.map((s: any, i: number) => `${i + 1} ${s.club}${s.aim_yd ? ` (${s.aim_yd < 0 ? "izq." : "der."} ${Math.abs(s.aim_yd)})` : ""}`).join(" · ")}` : "Sin golpes planificados", X + 56, y, 7.2, sh.length ? "B" : "R");
  pg.text("Notas", X, y + 13, 7, "B"); pg.black().lw(.45).dash(); for (let i = 0; i < 2; i++) pg.move(X + 26, y + 13 + i * 11).line(X + W, y + 13 + i * 11).stroke();
}

export function yardbookPdf(d: any, map: any | null, guide: GreenGuideCourse | null, logo: PrintLogo, o: YardbookOpts = {}) {
  const brand = printBrandOf(o), mode: BookMode = o.mode ?? "estrategia", fmt = o.format ?? "duplex", torneo = o.rules === "torneo", cap = torneo ? RULES_480_PT_PER_YD : null;
  CH = torneo ? CARD_H_TORNEO_MM * MM : SHEET_H; const cardMm = torneo ? CARD_H_TORNEO_MM : CARD_H_MM;
  const doc = new Doc(SHEET_W, SHEET_H), p = d.plan, order = [...d.holes].sort((a: any, b: any) => a.order - b.order).filter((x: any) => !o.holes?.length || o.holes.includes(x.hole));
  if (logo) doc.mask("L", { w: logo.w, h: logo.h, bits: Buffer.from(logo.b64, "base64") });
  const mh = (n: number) => map?.holes?.find((h: any) => h.hole === n) ?? null, gg = (n: number) => guide?.greens?.[n] ?? null, gh = (n: number) => guide?.holes?.[n] ?? null;
  const cards: Card[] = [{ kind: "cover" }, ...order.map((x: any) => ({ kind: "hole" as const, x }))];
  const W = CW - 2 * PAD, scales: number[] = [];
  const drawGreen = (n: number, bx: number, by: number, bw: number, bh: number, detail = true) => {
    const s = gg(n) ? guideGreen(pg0!, gg(n), bx, by, bw, bh, { cap, detail }) : mh(n) ? mapGreen(pg0!, mh(n), bx, by, bw, bh, cap) : null; if (s) scales.push(s); return s; };
  let pg0: Page | null = null;
  const meta: Record<number, any> = {};   // t202u: per-hole card geometry for the "Subir libreta" reader (card pt, origin top-left)
  const front = (pg: Page, c: Card, X: number, Y: number) => {
    pg0 = pg; const x0 = X + PAD, y0 = Y + STAPLE;
    if (c.kind === "cover") {
      stapleLabel(pg, X, Y, "FRENTE · CARÁTULA", "abrochar arriba");
      let y = y0 + 8;
      // t214u: club crest (official source only) or the club name typeset ONCE (was duplicated), then course, title, date
      if (logo) { const lw = 84, lh = lw * logo.h / logo.w; pg.fillBlack().image("L", X + CW / 2 - lw / 2, y, lw, lh); y += lh + 16; }
      else y += 18;
      pg.fillBlack().text(d.course.club_name || "", X + CW / 2, y, logo ? 12.5 : 15, "B", "c"); y += logo ? 15 : 18;
      pg.text(`Cancha ${String(d.course.course).replace(/^Cancha\s+/i, "")}`, X + CW / 2, y, 10.5, "R", "c"); y += 24;
      pg.text(mode === "cancha" ? "Libreta de la cancha" : "Estrategia de juego", X + CW / 2, y, 17, "B", "c"); y += 17;
      if (p?.date) { pg.text(dLong(p.date), X + CW / 2, y, 10, "R", "c"); y += 13; }
      if (mode !== "cancha") { pg.text(`Salida ${p.tee_time} · desde el hoyo ${p.start_hole}`, X + CW / 2, y, 10, "B", "c"); y += 16; }
      else if (p?.tee_time) { pg.text(`Salida ${p.tee_time} (hora usada para el viento)`, X + CW / 2, y, 8.5, "R", "c"); y += 14; }
      y += 4;
      // wind summary (both modes): Open-Meteo forecast at each hole's estimated time
      const ws = order.map((x: any) => x.wind).filter(Boolean);
      pg.black().lw(.9).dash().rect(x0, y, W, 50).stroke();
      if (ws.length) { const vx = ws.reduce((a: number, w: any) => a + w.kmh * Math.sin(w.from_deg * Math.PI / 180), 0), vy = ws.reduce((a: number, w: any) => a + w.kmh * Math.cos(w.from_deg * Math.PI / 180), 0), dom = norm360(Math.atan2(vx, vy) * 180 / Math.PI);
        windArrow(pg, x0 + W - 20, y + 25, 13, norm360(dom + 180));
        pg.fillBlack().text("Viento pronosticado", x0 + 7, y + 12, 8, "B");
        pg.text(`${Math.round(Math.min(...ws.map((w: any) => w.kmh)))}–${Math.round(Math.max(...ws.map((w: any) => w.kmh)))} km/h · ráf. hasta ${Math.round(Math.max(...ws.map((w: any) => w.gust_kmh || 0)))}`, x0 + 7, y + 25, 9, "B");
        pg.text(`viene del ${c16(dom)} · ${order[0].eta}–${order[order.length - 1].eta} · Open-Meteo${d.forecast?.fetched_at ? ` ${arTime(d.forecast.fetched_at)}` : ""}`, x0 + 7, y + 39, 6.3, "R"); }
      else { const st = d.forecast?.status;
        pg.fillBlack().text("Viento", x0 + 7, y + 12, 8, "B");
        pg.text(st === "no_date" || st === "no_time" || st == null ? "Sin pronóstico: no elegiste día y hora de salida." : st === "too_far" ? `Sin pronóstico todavía: disponible desde el ${dLong(d.forecast.available_from)}.` : st === "past" ? "Sin pronóstico: la fecha ya pasó." : "Sin pronóstico para esta fecha.", x0 + 7, y + 26, 7, "R");
        pg.text(mode === "cancha" ? "Elegí día y hora al imprimir para ver el viento en cada hoyo." : "", x0 + 7, y + 37, 6.2, "R"); }
      y += 50;
      if (ws.length) {   // t216u: legible arrow legend right under the wind box (normal text size), same convention on every card
        windArrow(pg, x0 + 6, y + 12, 5.5, 0);
        pg.fillBlack().text("La flecha indica hacia dónde sopla el viento", x0 + 16, y + 11, 8, "B");
        pg.text("(arriba = norte). En cada hoyo, la flecha va girada", x0 + 16, y + 21, 7.5, "R");
        pg.text("como el dibujo: salida abajo, green arriba.", x0 + 16, y + 30.5, 7.5, "R");
        y += 40;
      } else y += 10;
      // t214u: references/legend + rules at the BOTTOM of the cover (stacked up from the print instructions)
      let yb = Y + CH - PAD - 24;
      if (guide) { yb -= 16; pg.fillBlack().text(`Greens: ${guide.source.title}.`, x0, yb + 6, 5.8, "R"); pg.text("Datos generales, no relevamiento.", x0, yb + 13.5, 5.8, "R"); }
      yb -= 50; pg.black().lw(torneo ? 1.6 : .6).dash().rect(x0, yb, W, 44).stroke();
      pg.fillBlack().text(torneo ? "Apta para torneo (Regla 4.3)" : "No es para leer el putt en torneo", x0 + 7, yb + 12, 8.5, "B");
      pg.text(torneo ? "Greens a escala 1:480 o menor; tarjeta de 9,9 × 17,7 cm (Aclaración 4.3a/1)." : "Greens ampliados: en torneo usalos solo para el golpe al green,", x0 + 7, yb + 23, 6.2, "R");
      pg.text(torneo ? "Notas a mano: solo las tuyas o de tu caddie. Viento: pronóstico (preparación)." : "no para leer la línea en el green. Para torneo, elegí \"Torneo\".", x0 + 7, yb + 32, 6.2, "R");
      pg.text("Si rige la Regla Local G-12, no se puede usar en el green.", x0 + 7, yb + 40.5, 6.2, "R");
      if (mode === "cancha") { yb -= 56; pg.black().lw(.9).dash().rect(x0, yb, W, 50).stroke();
        pg.fillBlack().text("Referencias", x0 + 7, yb + 12, 8, "B");
        pg.text(map?.marker_ref?.to === "entrada" ? "Diseño de cada hoyo, rumbo, marcas de la cancha a la entrada del green," : "Diseño de cada hoyo, rumbo, marcas 50–250 al centro del green,", x0 + 7, yb + 24, 6.6, "R");
        pg.text(guide && Object.values(guide.greens || {}).some((g: any) => g.false_front) ? "obstáculos, greens con caídas y fin del frente falso (- - 9)." : "obstáculos con distancia para pasarlos y greens con sus caídas.", x0 + 7, yb + 33, 6.6, "R");
        pg.text(ws.length ? "Viento: pronóstico por hoyo. Sin tus golpes ni ± yd." : "Sin tus golpes de estrategia.", x0 + 7, yb + 43, 6.2, "R"); }
      pg.text(`Imprimí A4 horizontal, ${fmt === "duplex" ? "doble faz, girar en el borde largo" : "una cara"}, tamaño real (100%).`, x0, Y + CH - PAD - 10, 6, "B");
      pg.text(`${brand} · ${order.length} hoyos · tarjeta ${CARD_W_MM} × ${cardMm} mm${torneo ? " (cortá la tira de abajo)" : ""}`, x0, Y + CH - PAD - 2, 6, "R");
      return;
    }
    const x = c.x, h = mh(x.hole), g = gg(x.hole), hg = gh(x.hole), par3 = x.par === 3;
    stapleLabel(pg, X, Y, `FRENTE · HOYO ${x.hole}`, `orden ${cards.indexOf(c)}`);
    const rumbo = h?.bearing?.tee_to_green_true ?? null;
    header(pg, x, h, x0, y0 + 2, W, rumbo, mode);
    const L = cardLayout({ H: CH, par: x.par ?? null, mode, clubs: mode === "estrategia" ? (x.shots || []).map((s: any) => s.club) : [] }); RULER = null;
    const guideOnly = !h?.line?.length && !!hg;   // t208u: schematic from the club guide (no traced map) keeps a caption line under the drawing
    let my = y0 + (mode === "cancha" && !x.wind ? 44 : 62), mhh = Y + L.mapBottom - (guideOnly ? 9 : 3) - my;   // t208u: mapped holes use the caption gap for the drawing
    if (par3 || fmt === "simplex") { const gh_ = par3 ? Math.min(mhh * .55, 190) : Math.min(mhh * .42, 150); drawGreen(x.hole, x0, my, W, gh_, true); my += gh_ + 4; mhh -= gh_ + 4; }
    if (x.relevamiento && guideOnly) {   // t208u: hole not mapped yet but the club guide has it → the guide schematic, labelled as such
      guideHole(pg, hg, g, x, x0, my, W, mhh, cap);
      pg.fillBlack().text("Hoyo en relevamiento: esquema de la guía del club, sin mapa.", x0, my + mhh + 7, 5.6, "B");
    } else if (x.relevamiento) {   // t198u: a hole without the core data prints an explicit state, not a half-empty card
      pg.black().lw(.6).dash([3, 2]).rect(x0, my, W, mhh).stroke(); pg.dash();
      pg.fillBlack().text("Hoyo en relevamiento", x0 + W / 2, my + mhh / 2 - 6, 11, "B", "c");
      pg.text("Todavía no tenemos todos los datos de este hoyo", x0 + W / 2, my + mhh / 2 + 8, 6.8, "R", "c");
      pg.text("(salidas, línea de juego, green, marcas y obstáculos).", x0 + W / 2, my + mhh / 2 + 17, 6.8, "R", "c");
    } else if (h?.line?.length) RULER = drawHoleMap(pg, h, x, x0, my, W, mhh, { pad: [14, 12, 14, 10] }).ruler;
    else if (hg) guideHole(pg, hg, g, x, x0, my, W, mhh, cap);
    else { pg.black().lw(.6).dash().rect(x0, my, W, mhh).stroke(); pg.fillBlack().text("Sin mapa de esta cancha todavía", x0 + W / 2, my + mhh / 2, 8, "R", "c"); }
    if (!x.relevamiento && !h?.line?.length && hg) pg.fillBlack().text("Esquema según la guía del club: distancias reales, posición lateral aproximada.", x0, my + mhh + 7, 5.6, "R");
    meta[x.hole] = { par: x.par ?? null, clubs: L.clubs, schematic: !h?.line?.length, map: [x0 - X, my - Y, W, mhh].map(v => Math.round(v * 10) / 10),
      ruler: RULER ? RULER.map(([a, b, yd]) => [Math.round((a - X) * 10) / 10, Math.round((b - Y) * 10) / 10, yd]) : null };
    shotLog(pg, L, X, Y, encodeCardId({ hole: x.hole, mode, torneo, club: String(d.course.club_code), course: String(d.course.course) }), `hoyo ${x.hole} · ${String(d.course.course).replace(/^Cancha\s+/i, "")}`, mode, x.par ?? null);
  };
  const back = (pg: Page, i: number, X: number, Y: number) => {
    // upright, same column; the card occupies the bottom CH of the back page (its bottom edge is behind the front's top = the staple)
    pg0 = pg; const next = cards[i + 1], cur = cards[i];
    const curLabel = cur.kind === "cover" ? "CARÁTULA" : `HOYO ${(cur as any).x.hole}`;
    (() => {
      const sy = Y + CH - STAPLE; pg.black().lw(.4).dash([1, 2]).move(X + PAD, sy + 4).line(X + CW - PAD, sy + 4).stroke(); pg.dash();
      const nx = next?.kind === "hole" ? next.x : null;
      pg.fillBlack().text(`DORSO · ${curLabel}`, X + PAD, Y + CH - PAD - 2, 7, "B");
      if (!nx) { pg.text("en blanco", X + CW - PAD, Y + CH - PAD - 2, 6, "R", "r"); return; }
      if (nx.par === 3) { pg.text(`en blanco: el ${nx.hole} es par 3 (su green está en el frente)`, X + CW - PAD, Y + CH - PAD - 2, 6, "R", "r"); return; }
      pg.text(`green del hoyo ${nx.hole}`, X + CW - PAD, Y + CH - PAD - 2, 6, "R", "r");
      const x0 = X + PAD, y0 = Y + PAD;
      pg.fillBlack().rect(x0, y0, 22, 22).fill(); pg.fillWhite().text(String(nx.hole), x0 + 11, y0 + 16, 12.5, "B", "c"); pg.fillBlack();
      pg.text(`Green del ${nx.hole}`, x0 + 28, y0 + 9, 9, "B"); pg.text(gg(nx.hole) ? "Forma, caídas y niveles (guía del club)" : "Forma del green (sin datos de pendiente)", x0 + 28, y0 + 19, 6.3, "R");
      const gy = y0 + 28, gbh = CH - 2 * PAD - 28 - STAPLE - 26;
      drawGreen(nx.hole, x0, gy, W, gbh, true);
      if (gg(nx.hole)) { const ly = gy + gbh + 8; arrowGlyph(pg, x0 + 4, ly - 2, 90, 10); pg.fillBlack().text("cae hacia", x0 + 12, ly, 5.8, "R");
        pg.black().lw(1).move(x0 + 46, ly - 2).line(x0 + 58, ly - 2).stroke(); pg.fillBlack().text("cambio de nivel", x0 + 61, ly, 5.8, "R");
        pg.black().lw(1.3).move(x0 + 108, ly - 2).line(x0 + 120, ly - 2).stroke(); for (let k = 0; k < 4; k++) pg.lw(.7).move(x0 + 109 + k * 3.2, ly - 2).line(x0 + 109 + k * 3.2, ly + 1.4).stroke();
        pg.fillBlack().text("pendiente", x0 + 123, ly, 5.8, "R"); for (let k = 0; k < 3; k++) pg.black().lw(.8).move(x0 + 156 + k * 3, ly - 4).line(x0 + 156 + k * 3, ly).stroke(); pg.fillBlack().text("barranca", x0 + 167, ly, 5.8, "R");
        const G2: any = gg(nx.hole); if (G2?.false_front || G2?.marks?.length) { const l2 = ly + 9;   // t227u/t229u
          if (G2.false_front) { pg.black().lw(1.2).dash([3.2, 2]).move(x0 + 2, l2 - 2).line(x0 + 16, l2 - 2).stroke(); pg.dash(); pg.fillBlack().text("fin del frente falso", x0 + 19, l2, 5.8, "R"); }
          pg.fillBlack().text("Números en el green: yd desde la entrada", x0 + (G2.false_front ? 82 : 2), l2, 5.8, "B"); }
        if (G2?.falls?.some((f: any) => f[3] === 2)) { const l3 = ly + 18; arrowGlyph(pg, x0 + 4, l3 - 2, 90, 10, 2); pg.fillBlack().text("doble: cae más · simple: cae menos (guía del club)", x0 + 12, l3, 5.8, "R"); } }
    })();
  };
  const sheets = Math.ceil(cards.length / PER_SHEET), strip = SHEET_H - CH;
  // dashed cut lines between the 3 columns; in torneo also the cut-off strip (front: bottom; back: top, the same strip of paper)
  const cut = (pg: Page, isBack: boolean) => { pg.black().lw(.5).dash([4, 3]);
    for (let c = 1; c < PER_SHEET; c++) pg.move(c * CW, 6).line(c * CW, SHEET_H - 6).stroke();
    if (strip > 1) { const sy = isBack ? strip : CH; pg.move(6, sy).line(SHEET_W - 6, sy).stroke(); pg.dash();
      const ty = isBack ? strip / 2 : CH + strip / 2;
      for (let c = 0; c < PER_SHEET; c++) { pg.fillBlack().text("tira para cortar y descartar", c * CW + CW / 2, ty, 6.5, "B", "c");
        pg.text("Regla 4.3: la libreta no puede medir más de 4¼ × 7 pulgadas (17,8 cm)", c * CW + CW / 2, ty + 9, 5.6, "R", "c"); } }
    pg.dash(); pg.fillBlack().text("cortar", CW + 3, isBack && strip > 1 ? strip + 9 : 12, 5.5, "R"); pg.text("cortar", 2 * CW + 3, isBack && strip > 1 ? strip + 9 : 12, 5.5, "R"); };
  for (let s = 0; s < sheets; s++) {
    const pg = doc.page(); cut(pg, false);
    for (let j = 0; j < PER_SHEET; j++) { const i = s * PER_SHEET + j; if (i >= cards.length) break; front(pg, cards[i], j * CW, 0); watermark(pg, brand, j * CW, 0, CH); }
    if (fmt === "duplex") { const bk = doc.page(); cut(bk, true);
      for (let j = 0; j < PER_SHEET; j++) { const i = s * PER_SHEET + j; if (i >= cards.length) break; back(bk, i, j * CW, strip); watermark(bk, brand, j * CW, strip, CH); } }
  }
  const pdf = doc.render({ title: mode === "cancha" ? `Libreta de la cancha · ${d.course.course}` : `Libreta · ${d.course.course} · ${p.date}`, duplex: fmt === "duplex" ? "DuplexFlipLongEdge" : "Simplex" });
  return { card_meta: { card_pt: [Math.round(CW * 100) / 100, Math.round(CH * 100) / 100], mode, torneo, holes: meta }, pdf, maxPtPerYd: scales.length ? Math.max(...scales) : null, minRatio: scales.length ? ratio(Math.max(...scales)) : null, cards: cards.length, sheets, pages: doc.pages.length, card_mm: [CARD_W_MM, cardMm] as [number, number], brand, mode };
}
