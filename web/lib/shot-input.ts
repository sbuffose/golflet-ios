import { HttpError } from "./http";
import { validLatLng } from "./geo";
import { DIRECTIONS, INTENTS, LENGTHS, LIES, RESULTS } from "./shots-calc";

/** Validate one shot from the app. Returns a row ready for insert. */
export function parseShot(s: any) {
  const intent = s?.intent == null || s.intent === "" ? null : (INTENTS.includes(s.intent) ? String(s.intent) : null);
  if (s?.intent && !intent) throw new HttpError(400, `Valor inválido: ${String(s.intent).slice(0, 20)}`);
  const conceded = intent === "conceded";
  const pos = validLatLng(s?.lat, s?.lng);
  if (conceded && pos) throw new HttpError(400, "Un putt concedido no lleva punto");
  if (!conceded && !pos) throw new HttpError(400, "Posición inválida");
  const hole = Number(s.hole); if (!Number.isInteger(hole) || hole < 1 || hole > 18) throw new HttpError(400, "Hoyo inválido");
  const n = s.shot_number == null ? null : Number(s.shot_number); if (n != null && (!Number.isInteger(n) || n < 1 || n > 20)) throw new HttpError(400, "Número de golpe inválido");
  const acc = s.accuracy_m == null || conceded ? null : Number(s.accuracy_m); if (acc != null && (!Number.isFinite(acc) || acc < 0 || acc > 5000)) throw new HttpError(400, "Precisión inválida");
  const at = s.taken_at ? new Date(s.taken_at) : new Date(); if (isNaN(+at)) throw new HttpError(400, "Fecha inválida");
  const opt = (v: unknown, list: readonly string[]) => (v == null || v === "" ? null : list.includes(String(v)) ? String(v) : (() => { throw new HttpError(400, `Valor inválido: ${String(v).slice(0, 20)}`); })());
  return { hole, shot_number: n, lat: pos?.lat ?? null, lng: pos?.lng ?? null, accuracy_m: acc, taken_at: at.toISOString(),
    club: conceded || s.club == null || s.club === "" ? null : String(s.club).slice(0, 8),
    lie: conceded ? null : opt(s.lie, LIES),
    result: conceded ? "holed" : opt(s.result, RESULTS),
    direction: conceded ? null : opt(s.direction, DIRECTIONS),
    length: conceded ? null : opt(s.length, LENGTHS),
    intent, mishit: conceded ? false : s.mishit === true,
    client_id: s.client_id == null ? null : String(s.client_id).slice(0, 64) };
}
