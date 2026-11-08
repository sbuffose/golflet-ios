/** Pure geo helpers (no I/O). Distances in meters; yards = m / 0.9144. */
export type LatLng = { lat: number; lng: number };
const R = 6_371_008.8;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversine(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
export const toYards = (m: number) => m / 0.9144;
export const round1 = (x: number) => Math.round(x * 10) / 10;

/** A coordinate that was actually stored. Null, blank and non-numeric stay unknown.
 *  Zero is a real latitude or longitude. The pair (0, 0) is not a saved point. */
function finiteCoord(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text || !/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(text)) return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function validLatLng(lat: unknown, lng: unknown): LatLng | null {
  const a = finiteCoord(lat), b = finiteCoord(lng);
  if (a == null || b == null || Math.abs(a) > 90 || Math.abs(b) > 180 || (a === 0 && b === 0)) return null;
  return { lat: a, lng: b };
}

/** Distance from p to segment a-b (meters, equirectangular approximation, fine at hole scale). */
export function distToSegment(p: LatLng, a: LatLng, b: LatLng): number {
  const k = Math.cos(rad(p.lat)) * R, x = (q: LatLng) => rad(q.lng) * k, y = (q: LatLng) => rad(q.lat) * R;
  const px = x(p), py = y(p), ax = x(a), ay = y(a), bx = x(b), by = y(b);
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
export function distToPolyline(p: LatLng, line: LatLng[]): number {
  if (!line.length) return Infinity;
  if (line.length === 1) return haversine(p, line[0]);
  let m = Infinity; for (let i = 0; i < line.length - 1; i++) m = Math.min(m, distToSegment(p, line[i], line[i + 1]));
  return m;
}
export function centroid(pts: LatLng[]): LatLng {
  const n = pts.length || 1;
  return { lat: pts.reduce((s, p) => s + p.lat, 0) / n, lng: pts.reduce((s, p) => s + p.lng, 0) / n };
}
/** Keep at most `max` points (uniform subsample, keeps ends). */
export function simplify(pts: LatLng[], max = 16): LatLng[] {
  if (pts.length <= max) return pts;
  const out: LatLng[] = []; for (let i = 0; i < max; i++) out.push(pts[Math.round((i * (pts.length - 1)) / (max - 1))]);
  return out;
}
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
export const ll = (p: LatLng): LatLng => ({ lat: r6(p.lat), lng: r6(p.lng) });

/** Front / center / back distances (m and yd, rounded) from a position to a green. */
export function greenDistances(pos: LatLng, g: { front: LatLng; center: LatLng; back: LatLng }) {
  const f = haversine(pos, g.front), c = haversine(pos, g.center), b = haversine(pos, g.back);
  return { front_m: Math.round(f), center_m: Math.round(c), back_m: Math.round(b),
    front_yd: Math.round(toYards(f)), center_yd: Math.round(toYards(c)), back_yd: Math.round(toYards(b)) };
}
