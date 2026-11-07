/**
 * t162u: collaborative daily pin positions (API_v5 §57). Pure rules, no DB.
 * One pin per course (club_code + vm_course) + hole + ART day. Club pin > player pin.
 * Players never see who set a pin or who reported it; clubs never see players' positions or identities.
 */
import { HttpError } from "./http-error";

export const ZONES = ["front", "middle", "back"] as const;
export type Zone = (typeof ZONES)[number];
export const ZONE_LABEL: Record<Zone, string> = { front: "Adelante", middle: "Medio", back: "Fondo" };
export type LL = { lat: number; lng: number };
export type PinRow = { id: string; lat: number; lng: number; zone: Zone; source: "player" | "club"; set_by: string | null; hole: number; date: string };

/** ART calendar day (UTC−3, no DST). */
export const artToday = (now = new Date()) => new Date(now.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
export function addDays(d: string, n: number) { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }

export function parseZone(z: unknown): Zone {
  if (typeof z === "string" && (ZONES as readonly string[]).includes(z)) return z as Zone;
  throw new HttpError(400, "Elegí dónde está la bandera: Adelante, Medio o Fondo");
}
export const distM = (a: LL, b: LL) => { const R = 6371000, t = (x: number) => (x * Math.PI) / 180, dLa = t(b.lat - a.lat), dLo = t(b.lng - a.lng);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };

/** A pin has to be on (or right next to) that hole's green: within max(35 m, front↔back depth) of the green center. No green map → accepted. */
export function onGreen(p: LL, g: { front?: LL | null; center?: LL | null; back?: LL | null } | null): boolean {
  if (!g?.center) return true;
  const depth = g.front && g.back ? distM(g.front, g.back) : 0;
  return distM(p, g.center) <= Math.max(35, depth);
}
/** Club scheduling window: today (ART) up to 60 days ahead. */
export function validPinDate(d: unknown, today = artToday()): string {
  if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(+new Date(d))) throw new HttpError(400, "Fecha inválida");
  if (d < today) throw new HttpError(400, "No se pueden cargar banderas de días pasados");
  if (d > addDays(today, 60)) throw new HttpError(400, "Se pueden programar hasta 60 días adelante");
  return d;
}

export type PinAction = "mark" | "remark" | "report" | "reported" | "none";
/** What the player's button does on this hole today. Club pin → no button at all. */
export function pinAction(pin: PinRow | null, me: string, reported: boolean): PinAction {
  if (!pin) return "mark";
  if (pin.source === "club") return "none";
  if (pin.set_by === me) return "remark";
  return reported ? "reported" : "report";
}
/** The only shape a player (or club) ever gets: no set_by, no reporter, no timestamps. */
export function publicPin(pin: PinRow | null, me: string | null) {
  if (!pin) return null;
  return { lat: pin.lat, lng: pin.lng, zone: pin.zone, zone_label: ZONE_LABEL[pin.zone], source: pin.source,
    source_label: pin.source === "club" ? "cargada por el club" : me && pin.set_by === me ? "la marcaste vos" : "cargada por un jugador", by_me: !!me && pin.set_by === me };
}
/** Flag used for a hole's metrics: club pin of the day > the player's own marked pin > another player's pin of the day > green center. */
export function pickFlag(day: PinRow | null, own: LL | null, center: LL | null): { flag: LL | null; source: "club" | "player_marked" | "day_pin" | "green_center" | null } {
  if (day?.source === "club") return { flag: day, source: "club" };
  if (own) return { flag: own, source: "player_marked" };
  if (day) return { flag: day, source: "day_pin" };
  return center ? { flag: center, source: "green_center" } : { flag: null, source: null };
}
/** Admin view of a reporter: never the name/email in lists, just a stable short tag + how many reports they made (abuse check). */
export const reporterTag = (userId: string) => "Jugador " + [...userId].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36).slice(-4).toUpperCase();
