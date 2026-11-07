import { HttpError } from "./http";
import { validLatLng } from "./geo";
import { DIRECTIONS, INTENTS, LENGTHS, LIES, RESULTS } from "./shots-calc";

/** Validate one shot from the app. Returns a row ready for insert. */
export function parseShot(s: any) {
  const pos = validLatLng(s?.lat, s?.lng); if (!pos) throw new HttpError(400, "Posición inválida");
  const hole = Number(s.hole); if (!Number.isInteger(hole) || hole < 1 || hole > 18) throw new HttpError(400, "Hoyo inválido");
  const n = s.shot_number == null ? null : Number(s.shot_number); if (n != null && (!Number.isInteger(n) || n < 1 || n > 20)) throw new HttpError(400, "Número de golpe inválido");
  const acc = s.accuracy_m == null ? null : Number(s.accuracy_m); if (acc != null && (!Number.isFinite(acc) || acc < 0 || acc > 5000)) throw new HttpError(400, "Precisión inválida");
  const at = s.taken_at ? new Date(s.taken_at) : new Date(); if (isNaN(+at)) throw new HttpError(400, "Fecha inválida");
  const opt = (v: unknown, list: readonly string[]) => (v == null || v === "" ? null : list.includes(String(v)) ? String(v) : (() => { throw new HttpError(400, `Valor inválido: ${String(v).slice(0, 20)}`); })());
  return { hole, shot_number: n, lat: pos.lat, lng: pos.lng, accuracy_m: acc, taken_at: at.toISOString(),
    club: s.club == null || s.club === "" ? null : String(s.club).slice(0, 8), lie: opt(s.lie, LIES), result: opt(s.result, RESULTS),
    direction: opt(s.direction, DIRECTIONS), length: opt(s.length, LENGTHS), intent: opt(s.intent, INTENTS), mishit: s.mishit === true,
    client_id: s.client_id == null ? null : String(s.client_id).slice(0, 64) };
}
