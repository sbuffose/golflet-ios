/** t74u sorteos (pure): validation, effective status, bases version, winner pick. */
import { createHash } from "node:crypto";
export const STATUSES = ["borrador", "abierto", "cerrado", "sorteado", "cancelado"] as const;
export const basesVersion = (bases: string) => createHash("sha256").update(bases.trim()).digest("hex").slice(0, 16);
const t = (v: any, n: number) => String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f<>]/g, "").trim().slice(0, n);
const d = (v: any) => (v == null || v === "" ? null : isNaN(Date.parse(v)) ? undefined : new Date(v).toISOString());
export function cleanSorteo(b: any, partial = false) {
  const o: any = {};
  for (const [k, n, req] of [["title", 90, true], ["prize", 140, true], ["description", 1200, false], ["sponsor", 80, false], ["bases", 20000, true]] as const) {
    if (partial && !(k in (b || {}))) continue;
    const v = t(b?.[k], n); if (req && !v) throw new Error(`Falta ${k === "title" ? "el título" : k === "prize" ? "el premio" : "el texto de las bases y condiciones"}.`);
    o[k] = v || null;
  }
  for (const k of ["starts_at", "ends_at"] as const) {
    if (partial && !(k in (b || {}))) continue;
    const v = d(b?.[k]); if (v === undefined) throw new Error("Fecha inválida."); if (k === "ends_at" && !v) throw new Error("Falta la fecha de cierre.");
    o[k] = v;
  }
  if (o.starts_at && o.ends_at && o.starts_at >= o.ends_at) throw new Error("El cierre tiene que ser después del inicio.");
  if (o.bases) o.bases_version = basesVersion(o.bases);
  return o;
}
/** An "abierto" sorteo past its end date behaves as "cerrado"; before starts_at it isn't open yet. */
export function effStatus(s: { status: string; starts_at?: any; ends_at: any }, now = new Date()) {
  if (s.status !== "abierto") return s.status;
  if (+new Date(s.ends_at) <= +now) return "cerrado";
  if (s.starts_at && +new Date(s.starts_at) > +now) return "proximo";
  return "abierto";
}
export function pickIndex(n: number, rnd: (max: number) => number) { if (n < 1) throw new Error("Sin participantes"); const i = rnd(n); if (!Number.isInteger(i) || i < 0 || i >= n) throw new Error("rnd"); return i; }
