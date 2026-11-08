/** Course strategy ("cómo jugar la cancha"): validation, status and map-based hazard prefill. Pure (no I/O). */
import { haversine, toYards, type LatLng } from "./geo";

export const HAZARD_TYPES = ["agua", "bunker", "ob", "arboles", "pendiente", "green_elevado", "rough_alto", "otro"] as const;
export const HAZARD_LABEL: Record<string, string> = { agua: "Agua", bunker: "Bunker", ob: "OB", arboles: "Árboles", pendiente: "Pendiente", green_elevado: "Green elevado", rough_alto: "Rough alto", otro: "Otro" };
export const SIDES = ["izquierda", "derecha", "centro", "ambos_lados", "frente_green", "detras_green"] as const;
export const SIDE_LABEL: Record<string, string> = { izquierda: "Izquierda", derecha: "Derecha", centro: "Centro", ambos_lados: "Ambos lados", frente_green: "Frente al green", detras_green: "Detrás del green" };
export const MISS_SIDES = ["izquierda", "derecha", "corto", "largo"] as const;
export const LEVELS = ["scratch", "medio", "alto"] as const;
export const LEVEL_LABEL: Record<string, string> = { scratch: "Scratch (0–5)", medio: "Hándicap medio (6–18)", alto: "Hándicap alto (19+)" };

const str = (v: unknown, n: number) => (v == null ? "" : String(v)).replace(/\r/g, "").replace(/[ \t]+/g, " ").trim().slice(0, n);
const yd = (v: unknown) => { if (v == null || v === "") return null; const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 && n <= 700 ? n : null; };
const pt = (v: any): LatLng | null => { const a = Number(v?.lat), b = Number(v?.lng);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 && !(a === 0 && b === 0) ? { lat: Math.round(a * 1e6) / 1e6, lng: Math.round(b * 1e6) / 1e6 } : null; };
const oneOf = <T extends readonly string[]>(list: T, v: unknown): T[number] | null => (list as readonly string[]).includes(String(v)) ? (String(v) as T[number]) : null;

export type Hazard = { id: string; type: (typeof HAZARD_TYPES)[number]; side: (typeof SIDES)[number] | null; from_yd: number | null; carry_yd: number | null; note: string; at: LatLng | null; source: "mapa" | "manual" };
export type Variant = { plan: string; tee_club: string };
export type HoleStrategy = {
  plan_title: string; plan_text: string; tee_club: string; tee_target: string; target: LatLng | null;
  hazards: Hazard[]; why: string; miss_side: (typeof MISS_SIDES)[number] | null; miss_note: string;
  green_slope: string; green_leave: string; green_notes: string; variants: Partial<Record<(typeof LEVELS)[number], Variant>>;
};

let seq = 0;
const hid = () => `h${Date.now().toString(36)}${(seq++).toString(36)}`;

export function normalizeHazard(h: any): Hazard | null {
  const type = oneOf(HAZARD_TYPES, h?.type); if (!type) return null;
  return { id: /^[\w-]{1,24}$/.test(String(h?.id || "")) ? String(h.id) : hid(), type, side: oneOf(SIDES, h?.side), from_yd: yd(h?.from_yd), carry_yd: yd(h?.carry_yd),
    note: str(h?.note, 300), at: pt(h?.at), source: h?.source === "mapa" ? "mapa" : "manual" };
}
export function normalizeHole(x: any): HoleStrategy {
  const variants: HoleStrategy["variants"] = {};
  for (const l of LEVELS) { const v = x?.variants?.[l]; const plan = str(v?.plan, 800), club = str(v?.tee_club, 40); if (plan || club) variants[l] = { plan, tee_club: club }; }
  return {
    plan_title: str(x?.plan_title, 90), plan_text: str(x?.plan_text, 1500), tee_club: str(x?.tee_club, 40), tee_target: str(x?.tee_target, 160), target: pt(x?.target),
    hazards: (Array.isArray(x?.hazards) ? x.hazards : []).slice(0, 25).map(normalizeHazard).filter(Boolean) as Hazard[],
    why: str(x?.why, 1500), miss_side: oneOf(MISS_SIDES, x?.miss_side), miss_note: str(x?.miss_note, 300),
    green_slope: str(x?.green_slope, 300), green_leave: str(x?.green_leave, 300), green_notes: str(x?.green_notes, 800), variants,
  };
}
export const normalizeOverview = (x: any) => ({ overview: str(x?.overview, 4000) });
export const isEmptyHole = (h: HoleStrategy | null | undefined) => !h || (!h.plan_title && !h.plan_text && !h.why && !h.hazards.length && !h.tee_club && !h.green_notes && !h.green_slope && !h.green_leave && !h.miss_side && !Object.keys(h.variants).length);

/** none | draft (never published) | published | changed (published, with unpublished edits) */
export function holeStatus(draft: any, published: any): "none" | "draft" | "published" | "changed" {
  const d = normalizeHole(draft || {});
  if (!published) return isEmptyHole(d) ? "none" : "draft";
  return JSON.stringify(stripIds(d)) === JSON.stringify(stripIds(normalizeHole(published))) ? "published" : "changed";
}
const stripIds = (h: HoleStrategy) => ({ ...h, hazards: h.hazards.map(({ id, ...r }) => r) });

/** Player payload: yards + meters for every distance. */
export function publicHole(hole: number, h: any) {
  const n = normalizeHole(h); const m = (y: number | null) => (y == null ? null : Math.round(y * 0.9144));
  return { hole, ...n, hazards: n.hazards.map(z => ({ ...z, from_m: m(z.from_yd), carry_m: m(z.carry_yd), type_label: HAZARD_LABEL[z.type], side_label: z.side ? SIDE_LABEL[z.side] : null })) };
}

/* ---------- prefill hazards from cached map data (OSM polygons + Golfistics greens) ---------- */
type GeoHole = { hole: number; green: { front: LatLng; center: LatLng; back: LatLng }; tee: LatLng | null; line: LatLng[] | null; hazards: { type: string; lat: number; lng: number; polygon: LatLng[] }[] };

/** Local planar frame (meters) with the hole axis pointing "up": x>0 = right of the line of play, y = distance along. */
function frame(origin: LatLng, toward: LatLng) {
  const k = Math.cos((origin.lat * Math.PI) / 180) * 111_320, kl = 110_540;
  const xy = (p: LatLng) => [(p.lng - origin.lng) * k, (p.lat - origin.lat) * kl];
  const [gx, gy] = xy(toward); const L = Math.hypot(gx, gy) || 1; const ux = gx / L, uy = gy / L;
  return (p: LatLng) => { const [x, y] = xy(p); return { along: x * ux + y * uy, side: x * uy - y * ux }; };   // side>0 = right
}

/** Hazards for one hole as DRAFT entries (source "mapa"), sorted from tee to green. Distances in yards from the tee (start / carry). */
export function prefillHazards(h: GeoHole): Hazard[] {
  const g = h.green.center; const tee = h.tee || h.line?.[0] || null;
  const out: Hazard[] = [];
  for (const z of h.hazards || []) {
    const c = { lat: z.lat, lng: z.lng }; const poly = z.polygon?.length ? z.polygon : [c];
    const type: Hazard["type"] = z.type === "water" ? "agua" : "bunker";
    const nearGreen = haversine(c, g) <= 40;
    let side: Hazard["side"] = null, from: number | null = null, carry: number | null = null, note = "";
    if (tee) {
      // along the real hole line when we have it (doglegs): project on the segment from the tee to the green, good enough for side + carry
      const f = frame(tee, g); const pts = poly.map(f), cc = f(c);
      const along = pts.map(p => p.along), sides = pts.map(p => p.side);
      from = Math.max(0, Math.round(toYards(Math.min(...along)))); carry = Math.round(toYards(Math.max(...along)));
      const minS = Math.min(...sides), maxS = Math.max(...sides);
      if (!nearGreen && carry < 50) continue;   // right next to the tee box: another hole's bunker, not in play
      if (nearGreen) {
        const ga = f(g).along;
        side = cc.along < ga - 12 && Math.abs(cc.side) < 14 ? "frente_green" : cc.along > ga + 12 && Math.abs(cc.side) < 14 ? "detras_green" : cc.side > 0 ? "derecha" : "izquierda";
      } else side = minS < -3 && maxS > 3 ? "centro" : cc.side > 0 ? "derecha" : "izquierda";
      const where = nearGreen ? (side === "frente_green" ? "frente al green" : side === "detras_green" ? "detrás del green" : `junto al green, a la ${side}`) : side === "centro" ? "cruzando la línea de juego" : `a la ${side}`;
      note = `${HAZARD_LABEL[type]} ${where}: empieza a ${from} yd de la salida, carry ${carry} yd.`;
    } else {
      const d = Math.round(toYards(haversine(c, g)));
      note = `${HAZARD_LABEL[type]} a ${d} yd del centro del green (sin salida mapeada: revisar lado y distancia).`;
    }
    out.push({ id: hid(), type, side, from_yd: from, carry_yd: carry, note, at: { lat: z.lat, lng: z.lng }, source: "mapa" });
  }
  return out.sort((a, b) => (a.from_yd ?? 9999) - (b.from_yd ?? 9999));
}

/** Merge map hazards into a draft without duplicating ones already there (same type within 15 m). Manual entries are never touched. */
export function mergeHazards(existing: Hazard[], fresh: Hazard[], replaceMap = false): { hazards: Hazard[]; added: number } {
  const keep = replaceMap ? existing.filter(h => h.source !== "mapa") : existing.slice();
  let added = 0;
  for (const f of fresh) {
    if (keep.some(k => k.type === f.type && k.at && f.at && haversine(k.at, f.at) <= 15)) continue;
    if (keep.length >= 25) break;
    keep.push(f); added++;
  }
  return { hazards: keep, added };
}
