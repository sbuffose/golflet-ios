/** Jockey Cancha Colorada tee lines from OpenStreetMap golf=hole ways (ODbL), read 2026-11-10.
 *  Each way is the one whose last node falls within 70 m of the Golfistics green center
 *  (the same match as osm.ts). Refs are 1C–18C. The first node is the tee.
 *  The green center stays the Golfistics axis. This is not a contour, not a pin,
 *  and not a stand-in for Cancha Vieja, which has no hole or tee ways. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bearingTrue } from "./course-map-core";
import { COLORADA_GREEN_AXIS } from "./golfistics-axis";

export type LL = { lat: number; lng: number };
const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "colorada-osm.json");
export const COLORADA_OSM_CREDIT = "Salida © OpenStreetMap contributors (ODbL) · Cancha Colorada, Jockey Club. El centro del green es Golfistics, no el pin ni un contorno.";

export function isJockeyColorada(club: string, course: string): boolean {
  const c = String(course || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
  return String(club) === "118" && /(^| )colorada($| )/.test(c);
}

type RawHole = { ref?: string; osm_id?: number; end_m?: number; line?: unknown };

function lineOf(raw: unknown): LL[] {
  if (!Array.isArray(raw)) return [];
  const out: LL[] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const lat = Number(row[0]), lng = Number(row[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) out.push({ lat, lng });
  }
  return out;
}

let cache: Record<string, RawHole> | null = null;
function holes(): Record<string, RawHole> {
  if (cache) return cache;
  const parsed = JSON.parse(readFileSync(FIXTURE, "utf8")) as { holes?: Record<string, RawHole> | null };
  const next: Record<string, RawHole> = parsed.holes || {};
  cache = next;
  return next;
}

export function coloradaOsmHole(n: number): { tee: LL; line: LL[]; ref: string; osm_id: number; end_m: number } | null {
  const raw = holes()[String(n)];
  const line = lineOf(raw?.line);
  if (!raw || line.length < 2) return null;
  return { tee: line[0], line, ref: String(raw.ref || ""), osm_id: Number(raw.osm_id) || 0, end_m: Number(raw.end_m) || 0 };
}

/** Tee and hole line only when this course is Colorada and the caller has no tee of its own. */
export function coloradaLine(club: string, course: string, hole: number) {
  if (!isJockeyColorada(club, course)) return null;
  return coloradaOsmHole(hole);
}

/** Same shape TRACK reads from /api/course-maps. Used when that table has no Colorada row. */
export function coloradaBundledMap(hole?: number | null) {
  const list = COLORADA_GREEN_AXIS.filter(h => hole == null || h.hole === hole).map(h => {
    const osm = coloradaOsmHole(h.hole);
    const tee = osm?.tee || null;
    const line = osm?.line || [];
    const bearing = tee ? bearingTrue([tee.lng, tee.lat], [h.center.lng, h.center.lat]) : null;
    return {
      hole: h.hole,
      par: null as number | null,
      line,
      tees: tee ? [{ center: tee, source: "openstreetmap" as const }] : [],
      fairways: [] as { polygon: LL[] }[],
      bunkers: [] as { polygon: LL[] }[],
      water: [] as { polygon: LL[] }[],
      green: {
        polygon: [] as LL[], center: h.center, front: h.front, back: h.back,
        source: "golfistics" as const, confidence: "golfistics_axis" as const,
        track_lie: false, track_camera: !!tee,
      },
      bearing: bearing == null ? undefined : { tee_to_green_true: Math.round(bearing * 10) / 10 },
    };
  });
  return {
    club_code: "118",
    course: "Colorada",
    extracted_at: null,
    imported_at: null,
    sources: { osm: { attribution: COLORADA_OSM_CREDIT, fixture: "web/lib/colorada-osm.json" }, greens: "golfistics_viewmaster" },
    boundary: null,
    summary: { holes: 18, bundled: true },
    bundled: true,
    green_surfaces: [] as number[],
    attribution: [COLORADA_OSM_CREDIT],
    holes: list,
    marker_ref: { to: "centro", label: "al centro del eje Golfistics, no al pin", source: "golfistics" },
  };
}
