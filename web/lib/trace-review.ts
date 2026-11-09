/** What TRACK may reuse, and what still needs a person in the admin.
 *  Sources already in the repo. No world catalog and no invented ring.
 *  A satellite drawing is a visual trace. It is not a survey and it is not the day's pin. */
import { haversine, validLatLng, type LatLng } from "./geo";
import { azulOsmHoles, AZUL_OSM_CREDIT } from "./azul-osm";
import { COLORADA_YARDS } from "./jockey-plans";
import { MDP_CANCHA_VIEJA } from "./green-guide/209-cancha-vieja";

export const TRACE_IMAGERY = {
  provider: "esri_world_imagery",
  tiles: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  max_zoom: 17,
  attribution: "Esri, Maxar, Earthstar Geographics, and the GIS User Community",
};

/** Mainland box used only to reject a click that is not in Argentina. It does not create a course. */
export const AR_BOX = { latMin: -55.2, latMax: -21.5, lngMin: -73.6, lngMax: -53.2 };
export const GREEN_SPAN_MAX_M = 180;
export const TEE_ADJUST_MAX_M = 120;
export const TRACE_NEAR_AXIS_M = 80;

export type Confidence = "openstreetmap" | "golfistics_axis" | "satellite_visual" | "measured" | "schematic" | "none";
export type HoleState = "listo" | "revisar" | "necesito_una_mano";

export type HoleEvidence = {
  hole: number;
  state: HoleState;
  confidence: Confidence;
  track_lie: boolean;
  track_camera: boolean;
  tee: LatLng | null;
  polygon: LatLng[] | null;
  axis: { front: LatLng; center: LatLng; back: LatLng } | null;
  anchor: LatLng | null;
  par: number | null;
  card_yards: number | null;
  detail: string;
};

export type CourseCoverage = {
  club_code: string;
  course: string;
  title: string;
  source: string;
  holes: HoleEvidence[];
  listo: number;
  revisar: number;
  ayuda: number;
  fairway_holes: number | null;
  note: string;
};

function inArgentina(p: LatLng): boolean {
  return p.lat >= AR_BOX.latMin && p.lat <= AR_BOX.latMax && p.lng >= AR_BOX.lngMin && p.lng <= AR_BOX.lngMax;
}

function span(pts: LatLng[]): number {
  let m = 0;
  for (const a of pts) for (const b of pts) m = Math.max(m, haversine(a, b));
  return m;
}

export function ringCentroid(pts: LatLng[]): LatLng | null {
  if (pts.length < 3) return null;
  return { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length };
}

function azulHole(n: number): HoleEvidence {
  const h = azulOsmHoles().find(x => x.hole === n);
  const polygon = (h?.green.polygon || []).length >= 3 ? h!.green.polygon : null;
  const tee = h?.line?.[0] || h?.tees?.[0]?.center || null;
  const ready = !!polygon && !!tee;
  return {
    hole: n, state: ready ? "listo" : "revisar", confidence: polygon ? "openstreetmap" : "none",
    track_lie: !!polygon, track_camera: !!(polygon && tee),
    tee, polygon, axis: null, anchor: tee || polygon?.[0] || null,
    par: h?.par ?? null, card_yards: null,
    detail: ready
      ? `Contorno OSM (${polygon!.length} puntos) y salida. ${AZUL_OSM_CREDIT}`
      : "El fixture OSM de este hoyo no trae anillo de green o salida. No se completa con un rombo.",
  };
}

function coloradaHole(n: number): HoleEvidence {
  const card = COLORADA_YARDS.find(h => h.n === n);
  return {
    hole: n, state: "necesito_una_mano", confidence: "none", track_lie: false, track_camera: false,
    tee: null, polygon: null, axis: null, anchor: null,
    par: card?.par ?? null, card_yards: card?.yards ?? null,
    detail: "Hay par, hándicap y yardas de tarjeta en jockey-plans.ts. No hay lat/lng ni contorno. El satélite no se centra en un punto inventado.",
  };
}

function viejaHole(n: number): HoleEvidence {
  const g = MDP_CANCHA_VIEJA.greens?.[n];
  return {
    hole: n, state: "necesito_una_mano", confidence: "schematic", track_lie: false, track_camera: false,
    tee: null, polygon: null, axis: null, anchor: null,
    par: null, card_yards: null,
    detail: g
      ? "La guía impresa tiene forma, caídas y bunkers en u/v. No es lat/lng y no se proyecta sobre el satélite. El centro del campo OSM es solo el pronóstico."
      : "La guía impresa no trae este green.",
  };
}

export function priorityCourses(): CourseCoverage[] {
  const azul = azulOsmHoles();
  const fairways = azul.filter(h => h.fairways.length > 0).length;
  const holes = (build: (n: number) => HoleEvidence) => Array.from({ length: 18 }, (_, i) => build(i + 1));
  const pack = (club_code: string, course: string, title: string, source: string, list: HoleEvidence[], fairway_holes: number | null, note: string): CourseCoverage => ({
    club_code, course, title, source, holes: list, fairway_holes, note,
    listo: list.filter(h => h.state === "listo").length,
    revisar: list.filter(h => h.state === "revisar").length,
    ayuda: list.filter(h => h.state === "necesito_una_mano").length,
  });
  return [
    pack("118", "Azul", "Jockey Club · Cancha Azul", "Golflet/Resources/Fixtures/hoyos-azul.json", holes(azulHole), fairways,
      "18 hoyos con anillo de green y línea OSM. El fairway no está en todos. TRACK puede usar el contorno y la salida. No es el pin."),
    pack("118", "Colorada", "Jockey Club · Cancha Colorada", "web/lib/jockey-plans.ts", holes(coloradaHole), null,
      "Solo el plan de tarjeta. Sin polígono en el repo. Queda para trazar cuando haya un eje o un punto que pegues en el admin."),
    pack("209", "Cancha Vieja", "Mar del Plata Golf Club · Cancha Vieja", "web/lib/green-guide/209-cancha-vieja.ts", holes(viejaHole), null,
      "Guía AAG transcripta, esquemática. El eje de Golfistics, cuando la lectura GPS lo trae, orienta la cámara y no dibuja el green."),
  ];
}

export function courseEvidence(club: string, course: string): CourseCoverage | null {
  const want = course.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
  return priorityCourses().find(c => c.club_code === String(club) && c.course.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase() === want) || null;
}

export type TraceBody = {
  confirm?: boolean;
  status?: string;
  tee?: { lat?: unknown; lng?: unknown } | null;
  green?: { lat?: unknown; lng?: unknown }[] | null;
  note?: unknown;
  parent?: unknown;
  anchor?: { lat?: unknown; lng?: unknown } | null;
};

export function validateTrace(hole: HoleEvidence, raw: TraceBody) {
  const errors: string[] = [];
  const status = String(raw?.status || "draft");
  if (!["draft", "needs_review", "accepted", "rejected"].includes(status)) errors.push("Estado inválido.");
  const parent = String(raw?.parent || "none");
  if (!["openstreetmap", "golfistics_axis", "none"].includes(parent)) errors.push("La procedencia del punto de partida no es válida.");
  const tee = raw?.tee ? validLatLng(raw.tee.lat, raw.tee.lng) : null;
  if (raw?.tee && !tee) errors.push("La salida no es una coordenada.");
  if (tee && !inArgentina(tee)) errors.push("La salida queda fuera de la Argentina. No la guardo.");
  const green: LatLng[] = [];
  for (const p of raw?.green || []) {
    const ll = validLatLng(p?.lat, p?.lng);
    if (!ll) { errors.push("Hay un vértice del green que no es una coordenada."); break; }
    if (!inArgentina(ll)) { errors.push("Un vértice del green queda fuera de la Argentina."); break; }
    green.push(ll);
  }
  if (green.length && green.length < 3) errors.push("Un contorno necesita al menos 3 puntos que marques vos. No cierro un rombo.");
  if (green.length >= 3 && span(green) > GREEN_SPAN_MAX_M) errors.push(`Ese anillo mide más de ${GREEN_SPAN_MAX_M} m. No es un green.`);
  if (hole.polygon && hole.polygon.length >= 3 && green.length >= 3) errors.push("Este hoyo ya tiene contorno OSM. Un trazado sobre el satélite no lo reemplaza.");
  if (hole.confidence === "schematic" && green.length && parent !== "golfistics_axis") errors.push("La guía u/v no se convierte en lat/lng. Hace falta un eje de Golfistics como ancla, no el centro del campo.");
  if (tee && hole.tee && haversine(tee, hole.tee) > TEE_ADJUST_MAX_M) errors.push(`La salida nueva está a más de ${TEE_ADJUST_MAX_M} m de la que ya tenemos.`);
  const axis = hole.axis?.center || null;
  if (green.length >= 3 && axis) {
    const c = ringCentroid(green);
    if (c && haversine(c, axis) > TRACE_NEAR_AXIS_M) errors.push("El anillo no cae sobre el eje del green. No lo tomo como este hoyo.");
  }
  const note = String(raw?.note || "").trim().slice(0, 400);
  if (status === "accepted") {
    if (hole.polygon && hole.polygon.length >= 3) errors.push("No hace falta aceptar un trazado: el contorno OSM ya entra a TRACK.");
    if (green.length < 3) errors.push("Para que TRACK detecte el green hace falta el contorno marcado, no solo el eje.");
    if (!note) errors.push("Anotá de dónde salió el trazado antes de aceptarlo.");
  }
  const draft = {
    status, parent, tee, green: green.length ? green : null, note,
    confidence: "satellite_visual" as const,
    imagery: TRACE_IMAGERY.provider,
    track_lie: status === "accepted" && green.length >= 3 && !hole.polygon,
    track_camera: status === "accepted" && green.length >= 3 && !hole.polygon,
  };
  return errors.length ? { ok: false as const, errors, draft } : { ok: true as const, errors, draft };
}

/** Public map hole fields. A draft never reaches TRACK. OSM wins over a later visual trace. */
export function publicTrace(hole: { green?: { polygon?: LatLng[]; center?: LatLng | null; source?: string; confidence?: string; track_lie?: boolean } | null; line?: LatLng[]; tees?: { center?: LatLng | null }[] }, trace: { status: string; tee: LatLng | null; green: LatLng[] | null; note: string } | null) {
  const polygon = (hole.green?.polygon || []).length >= 3 ? hole.green!.polygon! : null;
  if (polygon) {
    return { green: { ...hole.green, polygon, confidence: hole.green?.confidence || "openstreetmap", track_lie: hole.green?.track_lie !== false, source: hole.green?.source || "openstreetmap" }, tee: hole.line?.[0] || hole.tees?.[0]?.center || null, used: "existing" as const };
  }
  if (trace?.status === "accepted" && trace.green && trace.green.length >= 3) {
    return {
      green: { polygon: trace.green, center: ringCentroid(trace.green), source: "satellite_visual", confidence: "satellite_visual", track_lie: true, note: trace.note },
      tee: trace.tee, used: "satellite_visual" as const,
    };
  }
  return { green: hole.green || null, tee: hole.line?.[0] || hole.tees?.[0]?.center || null, used: "unchanged" as const };
}
