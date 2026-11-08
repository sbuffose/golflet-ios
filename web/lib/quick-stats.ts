/** Per-hole quick stats. A partial sample never becomes the round total.
 *  A notes body only includes a total when every eligible hole has that stat.
 *  An older rev never replaces a newer one. */
import { HttpError } from "./http-error";

export type HoleRef = { hole: number; par: number | null };
export type Mark = { hole: number; putts: number | null; gir: boolean | null; drive: string | null; rev?: number };
export type NoteTotals = { putts: number | null; gir: number | null; fir: number | null; notes: string | null };
export type StoredMark = { hole: number; putts: number | null; gir: boolean | null; drive: string | null; rev: number };

const DRIVES = new Set(["left", "fairway", "right", "other", "hit"]);

function has(body: object, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function parseCount(v: unknown, max: number): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > max) throw new HttpError(400, "Valor inválido");
  return n;
}

export function canonDrive(v: unknown): string | null {
  if (v == null || v === "") return null;
  const s = String(v);
  if (!DRIVES.has(s)) throw new HttpError(400, "Salida inválida");
  return s === "hit" ? "fairway" : s;
}

function parsePutts(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 6) throw new HttpError(400, "Putts inválidos");
  return n;
}

function parseGir(v: unknown): boolean | null {
  if (v == null || v === "") return null;
  if (v === true || v === false) return v;
  throw new HttpError(400, "Green inválido");
}

/** Totals to send. Missing keys stay as they are on the account. */
export function noteFields(marks: Mark[], holes: HoleRef[]): { putts?: string; gir?: string; fir?: string } {
  const by = new Map<number, Mark>();
  for (const mark of marks) by.set(mark.hole, mark);
  const card = holes.filter(h => Number.isInteger(h.hole) && h.hole >= 1 && h.hole <= 18);
  const out: { putts?: string; gir?: string; fir?: string } = {};
  if (card.length && card.every(h => by.get(h.hole)?.putts != null)) {
    out.putts = String(card.reduce((sum, h) => sum + (by.get(h.hole)?.putts ?? 0), 0));
  }
  if (card.length && card.every(h => by.get(h.hole)?.gir === true || by.get(h.hole)?.gir === false)) {
    out.gir = String(card.filter(h => by.get(h.hole)?.gir === true).length);
  }
  const drives = new Set(["left", "right", "other", "fairway", "hit"]);
  const firHoles = card.filter(h => h.par != null && h.par !== 3);
  if (firHoles.length && firHoles.every(h => drives.has(String(by.get(h.hole)?.drive || "")))) {
    out.fir = String(firHoles.filter(h => {
      const drive = by.get(h.hole)?.drive;
      return drive === "fairway" || drive === "hit";
    }).length);
  }
  return out;
}

/** Present keys replace. Absent keys keep the stored total, including an empty body. */
export function mergeNote(existing: NoteTotals, body: Record<string, unknown> | null | undefined): NoteTotals {
  const src = body && typeof body === "object" ? body : {};
  const next: NoteTotals = {
    putts: existing.putts ?? null,
    gir: existing.gir ?? null,
    fir: existing.fir ?? null,
    notes: existing.notes ?? null,
  };
  if (has(src, "putts")) next.putts = parseCount(src.putts, 99);
  if (has(src, "gir")) next.gir = parseCount(src.gir, 18);
  if (has(src, "fir")) next.fir = parseCount(src.fir, 18);
  if (has(src, "notes")) next.notes = src.notes == null ? null : String(src.notes).slice(0, 10_000);
  return next;
}

/** A lower rev is ignored. The stored hole, including its rev, comes back unchanged. */
export function applyMark(stored: StoredMark | null, incoming: Record<string, unknown>): { mark: StoredMark; applied: boolean } {
  const hole = Number(incoming.hole);
  const rev = Number(incoming.rev);
  if (!Number.isInteger(hole) || hole < 1 || hole > 18) throw new HttpError(400, "Hoyo inválido");
  if (!Number.isInteger(rev) || rev < 1 || rev > 1_000_000) throw new HttpError(400, "Versión inválida");
  if (stored && rev < stored.rev) return { mark: stored, applied: false };
  const mark: StoredMark = {
    hole,
    putts: has(incoming, "putts") ? parsePutts(incoming.putts) : (stored?.putts ?? null),
    gir: has(incoming, "gir") ? parseGir(incoming.gir) : (stored?.gir ?? null),
    drive: has(incoming, "drive") ? canonDrive(incoming.drive) : (stored?.drive ?? null),
    rev,
  };
  return { mark, applied: true };
}

/** Commit a response only when it is the write this edit sent, and that edit is still the latest. */
export function shouldCommit(sentRev: number, latestRev: number, responseRev: number) {
  return sentRev === latestRev && responseRev === sentRev;
}

export function accountView<T>(totals: T, marks: Mark[], holes: HoleRef[]) {
  return { totals, fields: noteFields(marks, holes) };
}

/** `12:Azul` names one club. Anything else, including a bare catalog key, is not a license to list every course. */
export function boundedCourseKey(raw: string | null | undefined): { clubId: string; name: string } | null {
  const match = /^(\d{1,9}):([^:]{1,120})$/.exec(String(raw ?? "").trim());
  if (!match) return null;
  return { clubId: match[1], name: match[2] };
}
