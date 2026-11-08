/** Pure shot math: distance each shot flew (to the next shot, or to the green when marked on/holed) and per-club averages. */
import { haversine, toYards, type LatLng } from "./geo";

export const DEFAULT_CLUBS = [
  ["Dr", "Driver"], ["3W", "Madera 3"], ["5W", "Madera 5"], ["Hy", "Híbrido"],
  ["4i", "Hierro 4"], ["5i", "Hierro 5"], ["6i", "Hierro 6"], ["7i", "Hierro 7"], ["8i", "Hierro 8"], ["9i", "Hierro 9"],
  ["PW", "Pitching wedge"], ["GW", "Gap wedge"], ["SW", "Sand wedge"], ["LW", "Lob wedge"], ["Pt", "Putter"],
].map(([code, label]) => ({ code, label, enabled: true }));
export type ClubDef = { code: string; label: string; enabled: boolean; brand?: string | null; model?: string | null; model_custom?: boolean; loft?: number | null };
export const isPutter = (c: string | null | undefined) => !!c && /^(pt|putter)$/i.test(c);

export const LIES = ["tee", "fairway", "rough", "bunker", "green", "fringe", "recovery", "other"] as const;
export const RESULTS = ["fairway", "green", "rough", "bunker", "water", "ob", "penalty", "holed", "other"] as const;

export const DIRECTIONS = ["left", "center", "right"] as const;
export const LENGTHS = ["short", "on", "long"] as const;
export const INTENTS = ["green", "layup"] as const;
export type ShotIn = { id: string; hole: number; shot_number: number; lat: number | null; lng: number | null; accuracy_m: number | null; club: string | null; lie: string | null; result: string | null; taken_at: string | Date;
  direction?: string | null; length?: string | null; mishit?: boolean | null; intent?: string | null; source?: string | null; distance_kind?: string | null };
export type Greens = Record<number, { center: LatLng; front?: LatLng; back?: LatLng }>;
export type ShotOut = ShotIn & { distance_m: number | null; distance_yd: number | null; distance_source: "next_shot" | "green_center" | null; to_green_m: number | null; to_green_yd: number | null };

const pointOf = (x: { lat: number | null; lng: number | null }): LatLng | null =>
  x.lat != null && x.lng != null && Number.isFinite(x.lat) && Number.isFinite(x.lng) ? { lat: x.lat, lng: x.lng } : null;

export function computeDistances(shots: ShotIn[], greens: Greens): ShotOut[] {
  const s = shots.slice().sort((a, b) => a.hole - b.hole || a.shot_number - b.shot_number || +new Date(a.taken_at) - +new Date(b.taken_at));
  const blank = (x: ShotIn): ShotOut => ({ ...x, distance_m: null, distance_yd: null, distance_source: null, to_green_m: null, to_green_yd: null });
  return s.map((x, i) => {
    const here = pointOf(x);
    if (!here || (x.source && x.source !== "gps")) return blank(x);
    const g = greens[x.hole]?.center;
    const to = g ? haversine(here, g) : null;
    const next = s[i + 1] && s[i + 1].hole === x.hole ? pointOf(s[i + 1]) : null;
    const nextGps = next && (!s[i + 1].source || s[i + 1].source === "gps") ? next : null;
    let d: number | null = null, src: ShotOut["distance_source"] = null;
    if (nextGps) { d = haversine(here, nextGps); src = "next_shot"; }
    else if (g && !isPutter(x.club) && (x.result === "green" || x.result === "holed")) { d = to; src = "green_center"; }
    const r = (v: number | null) => (v == null ? null : Math.round(v));
    return { ...x, distance_m: r(d), distance_yd: d == null ? null : Math.round(toYards(d)), distance_source: src, to_green_m: r(to), to_green_yd: to == null ? null : Math.round(toYards(to)) };
  });
}

/** Shots that measure the club honestly: a GPS fix, not a hand-placed or estimated point, not putts, no penalty/OB/water, not a recovery, moved at least 10 m. */
export function countsForClub(x: ShotOut): boolean {
  if (x.source && x.source !== "gps") return false;
  if (x.distance_kind && x.distance_kind !== "measured") return false;
  return !!x.club && !isPutter(x.club) && x.distance_m != null && x.distance_m >= 10 && x.distance_m <= 400 &&
    (x.accuracy_m == null || x.accuracy_m <= 20) && !["ob", "penalty", "water"].includes(x.result || "") && x.lie !== "recovery" && !x.mishit;
}
const median = (a: number[]) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function clubStats(shots: ShotOut[], clubs: ClubDef[]) {
  const by = new Map<string, number[]>();
  for (const x of shots) if (countsForClub(x)) by.set(x.club!, [...(by.get(x.club!) || []), x.distance_m!]);
  const order = new Map(clubs.map((c, i) => [c.code, i]));
  const yd = (m: number | null) => (m == null ? null : Math.round(toYards(m)));
  return [...by.entries()].map(([code, ds]) => {
    const avg = ds.reduce((s, v) => s + v, 0) / ds.length, med = median(ds)!;
    return { club: code, label: clubs.find(c => c.code === code)?.label || code, shots: ds.length,
      avg_m: Math.round(avg), median_m: Math.round(med), longest_m: Math.max(...ds), shortest_m: Math.min(...ds),
      avg_yd: yd(avg), median_yd: yd(med), longest_yd: yd(Math.max(...ds)) };
  }).sort((a, b) => (order.get(a.club) ?? 99) - (order.get(b.club) ?? 99) || b.median_m - a.median_m);
}

export function normalizeClubs(raw: unknown): ClubDef[] {
  if (!Array.isArray(raw) || raw.length > 30) throw new Error("bad");
  const seen = new Set<string>(); const out: ClubDef[] = [];
  for (const c of raw as any[]) {
    const code = String(c?.code ?? "").trim().slice(0, 8); if (!code || seen.has(code.toLowerCase())) continue; seen.add(code.toLowerCase());
    const it: any = { code, label: String(c?.label ?? code).trim().slice(0, 30) || code, enabled: c?.enabled !== false };
    // Mi bolsa equipment (optional; the iPhone may omit it and the route keeps what was stored)
    if (c && "brand" in c) { it.brand = c.brand ? String(c.brand).trim().slice(0, 40) || null : null; it.model = c.model ? String(c.model).trim().slice(0, 60) || null : null; it.model_custom = !!c.model_custom; }
    if (c?.loft != null && Number.isFinite(+c.loft) && +c.loft >= 5 && +c.loft <= 70) it.loft = +c.loft;
    out.push(it);
  }
  if (!out.length) throw new Error("bad");
  return out;
}
