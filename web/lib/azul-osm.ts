/** Jockey Cancha Azul hole geometry already shipped for iOS (Golflet/Resources/Fixtures/hoyos-azul.json).
 *  Lat/lng rings from OpenStreetMap (ODbL). Not a pin, not a slope survey, and not a stand-in for Colorada or Cancha Vieja. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bearingTrue } from "./course-map-core";

export type LL = { lat: number; lng: number };
const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "../../Golflet/Resources/Fixtures/hoyos-azul.json");
export const AZUL_OSM_CREDIT = "Contorno © OpenStreetMap contributors (ODbL) · Cancha Azul, Jockey Club. No es el pin ni un relevamiento de caídas.";

export function isJockeyAzul(club: string, course: string): boolean {
  const c = String(course || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
  return String(club) === "118" && (c === "azul" || c === "cancha azul" || c.endsWith(" azul"));
}

function coords(raw: unknown): LL[] {
  if (!Array.isArray(raw)) return [];
  const out: LL[] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const lat = Number(row[0]), lng = Number(row[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) out.push({ lat, lng });
  }
  return out;
}

export function centroid(pts: LL[]): LL | null {
  if (!pts.length) return null;
  return { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length };
}

export function pointInRing(p: LL, ring: LL[]): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.lat > p.lat) !== (b.lat > p.lat)) {
      const x = (b.lng - a.lng) * (p.lat - a.lat) / ((b.lat - a.lat) || 1e-12) + a.lng;
      if (p.lng < x) inside = !inside;
    }
  }
  return inside;
}

export function parseAzulOsm(raw: Record<string, unknown>) {
  const holes = [];
  for (let n = 1; n <= 18; n++) {
    const h = raw[String(n)] as { p?: number; m?: number; l?: unknown; g?: unknown; f?: unknown[] } | undefined;
    if (!h) continue;
    const line = coords(h.l);
    const green = coords(h.g);
    const feats: { kind: string; points: LL[] }[] = [];
    for (const item of h.f || []) {
      if (!Array.isArray(item) || item.length < 2) continue;
      feats.push({ kind: String(item[0]), points: coords(item[1]) });
    }
    const of = (k: string) => feats.filter(f => f.kind === k && f.points.length >= 3);
    const center = centroid(green);
    const tee = line[0] || null;
    const bearing = tee && center ? bearingTrue([tee.lng, tee.lat], [center.lng, center.lat]) : null;
    holes.push({
      hole: n,
      par: Number(h.p) || null,
      play_length_m: h.m ?? null,
      line,
      tees: of("t").map(f => ({ polygon: f.points, center: centroid(f.points) })),
      fairways: of("f").map(f => ({ polygon: f.points })),
      bunkers: of("b").map(f => ({ polygon: f.points })),
      water: of("w").map(f => ({ polygon: f.points })),
      green: { polygon: green, center, source: "openstreetmap" as const, confidence: "openstreetmap" as const, track_lie: green.length >= 3, track_camera: green.length >= 3 && !!tee },
      bearing: bearing == null ? undefined : { tee_to_green_true: Math.round(bearing * 10) / 10 },
    });
  }
  return holes;
}

let cache: ReturnType<typeof parseAzulOsm> | null = null;
export function azulOsmHoles() {
  if (!cache) cache = parseAzulOsm(JSON.parse(readFileSync(FIXTURE, "utf8")));
  return cache;
}

/** Same shape TRACK already reads from /api/course-maps. Used only when that table has no Azul row. */
export function azulBundledMap(hole?: number | null) {
  const holes = azulOsmHoles().filter(h => hole == null || h.hole === hole);
  return {
    club_code: "118",
    course: "Azul",
    extracted_at: null,
    imported_at: null,
    sources: { osm: { attribution: AZUL_OSM_CREDIT, fixture: "Golflet/Resources/Fixtures/hoyos-azul.json" } },
    boundary: null,
    summary: { holes: 18, bundled: true },
    bundled: true,
    green_surfaces: [] as number[],
    attribution: [AZUL_OSM_CREDIT],
    holes,
    marker_ref: { to: "centro", label: "al centro geométrico del contorno OSM, no al pin", source: "openstreetmap" },
  };
}
