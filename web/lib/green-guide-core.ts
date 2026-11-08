/** t190u: coarse green guide (from a club's printed course guide): types + geometry in yards, shared by the PDF and the app.
 *  Frame: x yards across (left −, right +, seen from the approach), y yards from the front of the green (0) to the back (depth).
 *  Rules of Golf: Clarification 4.3a/1 (since 2023): any green image used to read a putt must be at scale ≤ 3/8 in : 5 yd (1:480)
 *  in a book ≤ 4¼ × 7 in. RULES_480_PT_PER_YD = points per yard at exactly 1:480. API_v5 §63. */
export type GgBunker = { side: "L" | "R" | "F" | "B"; y0: number; y1: number; x?: number; w?: number; nums?: number[] };
export type GgGreen = { depth_yd: number; width_yd: number; shape: [number, number][]; falls: ([number, number, number] | [number, number, number, 1 | 2])[];
  tiers: { kind: "nivel" | "pendiente"; pts: [number, number][] }[]; banks: [number, number][]; bunkers: GgBunker[]; ob: { side: "L" | "R" | "B"; yd?: number }[];
  /** t227u: yards from the entrance (front) to where the false front ends, as written on the guide's green */
  false_front?: { yd: number; kind: "linea" | "pendiente"; conf: "alta" | "media" };
  /** t229u: other numbers written on the green = yards from the entrance to that spot (u across, −0.5 left … 0.5 right) */
  marks?: { yd: number; u: number; kind: "borde" | "nivel" | "punto" }[] };
export type GgHazard = { kind: string; side: string; reach?: number; carry?: number; to_green?: number[]; note?: string };
export type GgHole = { par: number; yd: number; alt_tee?: number; markers: { c: string; to_green: number; from_tee?: number }[]; hazards: GgHazard[]; card_diff?: string };
export type GreenGuideCourse = { club_code: string; course: string; location?: { lat: number; lng: number; source: string };
  source: { kind: "guia_club"; title: string; provided_by: string; received_at: string; precision: "general"; note: string };
  /** t227u: what the course's yardage markers measure to (default: centre, as our 50–250 map markers) */
  marker_ref?: { to: "entrada" | "centro"; source: string };
  greens: Record<number, GgGreen>; holes: Record<number, GgHole> };

export const RULES_480_PT_PER_YD = 72 * 36 / 480;   // 1 yd = 36 in → 36/480 in on paper = 5.4 pt  (≈ 1.905 mm)
export const RULES_BOOK_MAX_IN = [4.25, 7];
export const A6_CARD_IN = [105 / 25.4, 148.5 / 25.4];   // 4.13 × 5.85 in: inside the size limit

type P = [number, number];
const polyAt = (shape: P[], W: number, D: number): P[] => shape.map(([u, v]) => [u * W, v * D]);
/** Half-width of the outline at depth y (yards), on one side (−1 left, +1 right). */
export function halfWidthAt(outline: P[], y: number, side: -1 | 1) {
  let best = 0;
  for (let i = 0; i < outline.length; i++) { const a = outline[i], b = outline[(i + 1) % outline.length];
    if ((a[1] - y) * (b[1] - y) > 0 || a[1] === b[1]) continue; const t = (y - a[1]) / (b[1] - a[1]), x = a[0] + t * (b[0] - a[0]);
    if (x * side > best) best = x * side; }
  return best;
}
export function ellipse(cx: number, cy: number, rx: number, ry: number, n = 18): P[] {
  return Array.from({ length: n }, (_, i) => { const a = i / n * 2 * Math.PI; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as P; });
}
/** Everything in yards (y up = toward the back). */
export function greenGeom(g: GgGreen) {
  const out = polyAt(g.shape, g.width_yd, g.depth_yd);
  const bunkers = g.bunkers.map(b => {
    const ry = Math.max(1.6, (b.y1 - b.y0) / 2), cy = (b.y0 + b.y1) / 2;
    if (b.side === "L" || b.side === "R") { const s = b.side === "L" ? -1 : 1, hw = halfWidthAt(out, Math.min(Math.max(cy, 0.5), g.depth_yd - 0.5), s as -1 | 1) || g.width_yd / 2, rx = 2.6;
      return { ...b, poly: ellipse(s * (hw + 1.6 + rx), cy, rx, ry), label: [s * (hw + 1.6 + 2 * rx + 1.5), cy] as P }; }
    const rx = Math.max(2, (b.w ?? 8) / 2), cx = b.x ?? 0;
    return { ...b, poly: ellipse(cx, cy, rx, ry), label: [cx + rx + 1.5, cy] as P };
  });
  const cx = out.reduce((a, p) => a + p[0], 0) / out.length, cy = g.depth_yd / 2;
  const falls = g.falls.map(([u, v, dir, st]) => ({ at: [u * g.width_yd, v * g.depth_yd] as P, dir, strength: (st === 2 ? 2 : 1) as 1 | 2 }));   // t230u: 2 = double arrow (more slope)
  const tiers = g.tiers.map(t => ({ kind: t.kind, pts: t.pts.map(([u, v]) => [u * g.width_yd, v * g.depth_yd] as P) }));
  // banks: radial ticks just outside the outline, for bearings a0..a1 (clockwise from "back")
  const banks = g.banks.map(([a0, a1]) => { const ticks: [P, P][] = [];
    for (let a = a0; a <= a1; a += 7) { const r = a * Math.PI / 180, dx = Math.sin(r), dy = Math.cos(r);
      let edge: P = [cx, cy]; for (let k = 0; k < 120; k++) { const p: P = [cx + dx * k * 0.5, cy + dy * k * 0.5]; if (!inPoly(p, out)) { edge = p; break; } }
      ticks.push([[edge[0] + dx * 0.8, edge[1] + dy * 0.8], [edge[0] + dx * 3.6, edge[1] + dy * 3.6]]); }
    return ticks; });
  const ff = g.false_front && g.false_front.yd > 0 && g.false_front.yd < g.depth_yd ? { ...g.false_front, half: [halfWidthAt(out, g.false_front.yd, -1), halfWidthAt(out, g.false_front.yd, 1)] as P } : null;
  const marks = (g.marks || []).filter(k => k.yd > 0 && k.yd < g.depth_yd).map(k => { const sd = k.u < 0 ? -1 : 1, hw = k.kind === "borde" ? halfWidthAt(out, k.yd, sd as -1 | 1) : 0;
    return { ...k, at: [k.kind === "borde" && hw ? sd * hw : k.u * g.width_yd, k.yd] as P }; });
  return { outline: out, bunkers, falls, tiers, banks, depth: g.depth_yd, width: g.width_yd, ob: g.ob, false_front: ff, marks };
}
export function inPoly(p: P, poly: P[]) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j];
  if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
/** Bounding box (yards) of the whole green panel content. */
export function greenBox(G: ReturnType<typeof greenGeom>) {
  const pts = [...G.outline, ...G.bunkers.flatMap(b => b.poly), ...G.banks.flat(2) as unknown as P[]];
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
