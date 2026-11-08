/** Pure ViewMaster parsing + course mapping (no I/O). */
import type { LatLng } from "./geo";

export type Green = { front: LatLng; center: LatLng; back: LatLng };
export type VmHole = { hole: number; front: LatLng; center: LatLng; back: LatLng };

const num = (s: unknown) => { const n = Number(s); return Number.isFinite(n) ? n : NaN; };
const pt = (lat: unknown, lng: unknown): LatLng | null => { const a = num(lat), b = num(lng); return Number.isFinite(a) && Number.isFinite(b) && !(a === 0 && b === 0) && Math.abs(a) <= 90 && Math.abs(b) <= 180 ? { lat: a, lng: b } : null; };

/** Parse viewmaster_get_holes_anonimo output -> holes with complete green points (front/back fall back to center). */
export function parseHoles(raw: unknown): VmHole[] {
  if (!Array.isArray(raw)) return [];
  const out: VmHole[] = [];
  for (const h of raw as any[]) {
    const hole = Number(h?.hole_number); if (!Number.isInteger(hole) || hole < 1 || hole > 36) continue;
    const c = pt(h.center_lat, h.center_lng); if (!c) continue;
    out.push({ hole, center: c, front: pt(h.front_lat, h.front_lng) || c, back: pt(h.back_lat, h.back_lng) || c });
  }
  return out.sort((a, b) => a.hole - b.hole);
}
export const parseCourses = (raw: unknown): string[] =>
  Array.isArray(raw) ? [...new Set((raw as any[]).map(x => String(x?.course_name ?? "").trim()).filter(Boolean))] : [];

export const slug = (club: string, course: string) => `${club}-${course}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const norm = (s: string) => ` ${(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;

/** Our course name ("Azul", "Cancha Vieja") -> the ViewMaster course of the same club ("JOCKEY AZUL", "MAR DEL PLATA CANCHA VIEJA"). */
export function matchVmCourse(ours: string, vmCourses: string[]): string | null {
  const o = norm(ours); if (o.trim() === "") return null;
  const exact = vmCourses.find(v => norm(v) === o); if (exact) return exact;
  const hits = vmCourses.filter(v => norm(v).includes(o));
  if (hits.length) return hits.sort((a, b) => a.length - b.length)[0];
  if (vmCourses.length === 1) return vmCourses[0];
  return null;
}
/** Reverse: ViewMaster course -> one of our course names for that club. */
export function matchOurCourse(vm: string, ours: string[]): string | null {
  const v = norm(vm);
  const hits = ours.filter(o => norm(o).trim() && v.includes(norm(o)));
  return hits.sort((a, b) => b.length - a.length)[0] || (ours.length === 1 ? ours[0] : null);
}

/** Front==center or center==back means Golfistics only has 2 distinct points for that green. */
export function greenWarnings(holes: VmHole[]): string[] {
  const same = (a: LatLng, b: LatLng) => Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lng - b.lng) < 1e-7;
  return holes.filter(h => same(h.front, h.center) || same(h.center, h.back)).map(h => `Hoyo ${h.hole}: Golfistics tiene el mismo punto para ${same(h.front, h.center) ? "frente y centro" : "centro y fondo"}.`);
}

