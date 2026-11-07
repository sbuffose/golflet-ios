/** OpenStreetMap golf features (Overpass `out geom`) -> per-hole tee, hole line and hazards, matched to Golfistics greens. Pure. */
import { centroid, distToPolyline, haversine, ll, simplify, type LatLng } from "./geo";
import type { VmHole } from "./viewmaster-parse";

type El = { type: string; id: number; tags?: Record<string, string>; geometry?: { lat: number; lon: number }[]; members?: { geometry?: { lat: number; lon: number }[] }[] };
const geom = (e: El): LatLng[] => (e.geometry || (e.members || []).flatMap(m => m.geometry || [])).filter(Boolean).map(g => ({ lat: g.lat, lng: g.lon }));

export type OsmHole = { tee: LatLng | null; line: LatLng[] | null; hazards: { type: "bunker" | "water"; lat: number; lng: number; polygon: LatLng[] }[]; osm_ref?: string | null };

/** Bounding box (s,w,n,e) around a set of greens, with a margin in degrees (~0.006 ≈ 650 m). */
export function bboxFor(holes: VmHole[], margin = 0.006): [number, number, number, number] {
  const la = holes.map(h => h.center.lat), lo = holes.map(h => h.center.lng);
  return [Math.min(...la) - margin, Math.min(...lo) - margin, Math.max(...la) + margin, Math.max(...lo) + margin];
}
export const overpassQuery = (b: [number, number, number, number]) =>
  `[out:json][timeout:60];(way["golf"~"^(hole|tee|green|bunker|water_hazard|lateral_water_hazard)$"](${b.join(",")});relation["golf"~"^(bunker|water_hazard|lateral_water_hazard)$"](${b.join(",")});way["natural"="water"](${b.join(",")}););out geom;`;

/**
 * Match each Golfistics green to the OSM hole way that ENDS nearest to it (<= 70 m). The way's first node is the tee
 * (OSM convention: golf=hole is drawn tee -> green). Hazards: bunker/water polygons within 35 m of that hole line, or within
 * 45 m of the green when there is no hole line.
 */
export function osmExtras(holes: VmHole[], elements: El[]): Record<string, OsmHole> {
  const tag = (e: El) => e.tags?.golf || (e.tags?.natural === "water" ? "water_hazard" : "");
  const holeWays = elements.filter(e => tag(e) === "hole").map(e => ({ ref: e.tags?.ref ?? null, pts: geom(e) })).filter(w => w.pts.length >= 2);
  const hazards = elements.filter(e => /bunker|water/.test(tag(e))).map(e => { const p = geom(e); return { type: (tag(e) === "bunker" ? "bunker" : "water") as "bunker" | "water", pts: p, c: centroid(p) }; })
    .filter(h => h.pts.length >= 3);
  const used = new Set<number>(); const out: Record<string, OsmHole> = {};
  for (const h of holes) {
    let best = -1, bd = Infinity;
    holeWays.forEach((w, i) => { if (used.has(i)) return; const d = haversine(w.pts[w.pts.length - 1], h.center); if (d < bd) { bd = d; best = i; } });
    const way = best >= 0 && bd <= 70 ? holeWays[best] : null; if (way) used.add(best);
    const line = way ? way.pts : null;
    const near = hazards.filter(z => line ? Math.min(...z.pts.map(p => distToPolyline(p, line))) <= 35 : haversine(z.c, h.center) <= 45 && z.type === "bunker")
      .filter(z => z.type === "bunker" || (line ? distToPolyline(z.c, line) <= 120 : true));
    out[String(h.hole)] = {
      tee: line ? ll(line[0]) : null, line: line ? simplify(line, 12).map(ll) : null, osm_ref: way?.ref ?? null,
      hazards: near.map(z => ({ type: z.type, ...ll(z.c), polygon: simplify(z.pts, 14).map(ll) })),
    };
  }
  return out;
}

/** Convert an OSM API 0.6 /map XML response into Overpass-style elements with inline geometry (ways + multipolygon relations). */
export function osmXmlToElements(xml: string): El[] {
  const nodes = new Map<string, { lat: number; lon: number }>();
  for (const m of xml.matchAll(/<node\b[^>]*?\bid="(-?\d+)"[^>]*?\blat="(-?[\d.]+)"[^>]*?\blon="(-?[\d.]+)"/g)) nodes.set(m[1], { lat: +m[2], lon: +m[3] });
  const tagsOf = (body: string) => Object.fromEntries([...body.matchAll(/<tag k="([^"]*)" v="([^"]*)"/g)].map(t => [t[1], t[2].replace(/&amp;/g, "&").replace(/&quot;/g, '"')]));
  const ways = new Map<string, El>();
  for (const m of xml.matchAll(/<way\b[^>]*?\bid="(\d+)"[^>]*>([\s\S]*?)<\/way>/g)) {
    const geometry = [...m[2].matchAll(/<nd ref="(-?\d+)"/g)].map(n => nodes.get(n[1])).filter(Boolean) as { lat: number; lon: number }[];
    ways.set(m[1], { type: "way", id: +m[1], tags: tagsOf(m[2]), geometry });
  }
  const rels: El[] = [];
  for (const m of xml.matchAll(/<relation\b[^>]*?\bid="(\d+)"[^>]*>([\s\S]*?)<\/relation>/g)) {
    const members = [...m[2].matchAll(/<member type="way" ref="(\d+)" role="(outer|)"/g)].map(x => ({ geometry: ways.get(x[1])?.geometry || [] }));
    rels.push({ type: "relation", id: +m[1], tags: tagsOf(m[2]), members });
  }
  return [...ways.values(), ...rels].filter(e => e.tags && (e.tags.golf || e.tags.natural === "water"));
}
