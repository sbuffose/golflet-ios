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

export type MarkConflict = "stale" | "revision";
export type MarkOutcome = { mark: StoredMark; applied: boolean; conflict: MarkConflict | null; idempotent: boolean };

function payloadEqual(a: StoredMark, b: StoredMark) {
  return a.hole === b.hole && a.putts === b.putts && a.gir === b.gir && a.drive === b.drive;
}

/** Holes that belong to this round. A number from 1 to 18 is not enough. */
export function cardHoles(raw: unknown): HoleRef[] {
  if (!Array.isArray(raw)) return [];
  const out: HoleRef[] = [];
  for (const row of raw) {
    if (!Array.isArray(row)) continue;
    const hole = Number(row[0]);
    if (!Number.isInteger(hole) || hole < 1 || hole > 18) continue;
    const parRaw = row[1];
    const par = parRaw == null || parRaw === "" ? null : Number(parRaw);
    out.push({ hole, par: Number.isInteger(par) ? par : null });
  }
  return out;
}

/**
 * Compare-and-swap for one hole.
 * A lower rev is stale. The same rev with the same payload is an idempotent retry.
 * The same rev with a different payload is a conflict and does not write.
 * A cleared hole stays as a row of nulls at its rev. Deleting it would let an older write return.
 */
export function applyMark(stored: StoredMark | null, incoming: Record<string, unknown>, card: HoleRef[]): MarkOutcome {
  const hole = Number(incoming.hole);
  const rev = Number(incoming.rev);
  if (!Number.isInteger(hole) || hole < 1 || hole > 18) throw new HttpError(400, "Hoyo inválido");
  if (!Number.isInteger(rev) || rev < 1 || rev > 1_000_000) throw new HttpError(400, "Versión inválida");
  const onCard = card.find(h => h.hole === hole);
  if (!onCard) throw new HttpError(404, "Ese hoyo no está en la tarjeta");
  const mark: StoredMark = {
    hole,
    putts: has(incoming, "putts") ? parsePutts(incoming.putts) : (stored?.putts ?? null),
    gir: has(incoming, "gir") ? parseGir(incoming.gir) : (stored?.gir ?? null),
    drive: has(incoming, "drive") ? canonDrive(incoming.drive) : (stored?.drive ?? null),
    rev,
  };
  if (onCard.par === 3 && mark.drive) throw new HttpError(400, "Un par 3 no lleva fairway");
  if (!stored) return { mark, applied: true, conflict: null, idempotent: false };
  if (rev < stored.rev) return { mark: stored, applied: false, conflict: "stale", idempotent: false };
  if (rev === stored.rev) {
    if (payloadEqual(mark, stored)) return { mark: stored, applied: true, conflict: null, idempotent: true };
    return { mark: stored, applied: false, conflict: "revision", idempotent: false };
  }
  return { mark, applied: true, conflict: null, idempotent: false };
}

/** What the row means after the conditional write returns nothing. */
export function settleWrite(stored: StoredMark | null, attempted: StoredMark): MarkOutcome {
  if (!stored) return { mark: attempted, applied: false, conflict: "stale", idempotent: false };
  if (stored.rev === attempted.rev && payloadEqual(stored, attempted)) {
    return { mark: stored, applied: true, conflict: null, idempotent: true };
  }
  if (stored.rev === attempted.rev) return { mark: stored, applied: false, conflict: "revision", idempotent: false };
  return { mark: stored, applied: false, conflict: "stale", idempotent: false };
}

/** The next rev is the account rev of this hole plus one. Zero means the hole has no row yet. */
export function nextHoleRev(storedRev: number | null | undefined): number {
  const n = Number(storedRev);
  if (!Number.isInteger(n) || n < 1) return 1;
  return n + 1;
}

export function seedHoleRevs(marks: { hole?: number; rev?: number }[] | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const mark of marks || []) {
    const hole = Number(mark?.hole);
    const rev = Number(mark?.rev);
    if (Number.isInteger(hole) && Number.isInteger(rev) && rev >= 1) out[String(hole)] = rev;
  }
  return out;
}

export type FieldTouch = { putts: boolean; gir: boolean; drive: boolean };
export type OpenHole = { hole: number; putts: number | null; gir: boolean | null; drive: string | null; touched: FieldTouch };

/** Untouched fields stay on the account row. A tap before the read does not blank them. */
export function mergeAccountHole(
  account: { putts: number | null; gir: boolean | null; drive: string | null } | null,
  local: OpenHole,
): { hole: number; putts: number | null; gir: boolean | null; drive: string | null } {
  return {
    hole: local.hole,
    putts: local.touched.putts ? local.putts : (account?.putts ?? null),
    gir: local.touched.gir ? local.gir : (account?.gir ?? null),
    drive: local.touched.drive ? local.drive : (account?.drive ?? null),
  };
}

/** Apply the account snapshot to edits that started before it arrived. */
export function absorbAccountMarks(
  marks: Array<{ hole: number; putts: number | null; gir: boolean | null; drive: string | null; rev: number }>,
  locals: OpenHole[],
) {
  const by = new Map(marks.map(mark => [mark.hole, mark]));
  const revs = seedHoleRevs(marks);
  const holes = locals.map(local => {
    const merged = mergeAccountHole(by.get(local.hole) ?? null, local);
    return { ...merged, rev: planHoleSend(revs, local.hole, 0) };
  });
  return { holes, revs };
}

/** No account snapshot, or the screen is already gone: do not write. */
export function sendDecision(accountReady: boolean, stillHere: boolean): "send" | "hold" {
  if (!accountReady || !stillHere) return "hold";
  return "send";
}

/** A retry keeps the rev it already sent. A new edit takes the seeded account rev plus one. */
export function planHoleSend(revs: Record<string, number> | null | undefined, hole: number, alreadyRev?: number | null): number {
  const frozen = Number(alreadyRev);
  if (Number.isInteger(frozen) && frozen >= 1) return frozen;
  const table = revs || {};
  return nextHoleRev(table[String(hole)]);
}

export function interpretSave(
  sentRev: number,
  response: { applied?: boolean; conflict?: string | null; mark?: { rev?: number } } | null | undefined,
): "saved" | "conflict" {
  if (!response || response.conflict === "revision" || response.conflict === "stale") return "conflict";
  if (response.applied === true && Number(response.mark?.rev) === sentRev) return "saved";
  return "conflict";
}

/** A finished response is saved or a conflict. It is never left on "saving". */
export function phaseAfter(
  sentRev: number,
  response: { applied?: boolean; conflict?: string | null; mark?: { rev?: number } } | null | undefined,
): "saved" | "conflict" {
  return interpretSave(sentRev, response);
}

export function saveMessage(phase: string): string {
  if (phase === "saving") return "Guardando…";
  if (phase === "saved") return "Guardado en tu cuenta";
  if (phase === "conflict") return "Otra edición llegó antes. Tocá reintentar para traer la cuenta.";
  if (phase === "error") return "No se pudo guardar. Lo que marcaste sigue acá.";
  return "Sin cargar";
}

/** Commit a response only when it is the write this edit sent, and that edit is still the latest. */
export function shouldCommit(sentRev: number, latestRev: number, responseRev: number) {
  return sentRev === latestRev && responseRev === sentRev;
}

export type NotePatch = {
  putts: number | null;
  gir: number | null;
  fir: number | null;
  notes: string | null;
  puttsPresent: boolean;
  girPresent: boolean;
  firPresent: boolean;
  notesPresent: boolean;
};

/** Values for the keys this request actually sent. Absent keys are not in the patch. */
export function notePatch(body: Record<string, unknown> | null | undefined): NotePatch {
  const src = body && typeof body === "object" ? body : {};
  const patch: NotePatch = {
    putts: null,
    gir: null,
    fir: null,
    notes: null,
    puttsPresent: has(src, "putts"),
    girPresent: has(src, "gir"),
    firPresent: has(src, "fir"),
    notesPresent: has(src, "notes"),
  };
  if (patch.puttsPresent) patch.putts = parseCount(src.putts, 99);
  if (patch.girPresent) patch.gir = parseCount(src.gir, 18);
  if (patch.firPresent) patch.fir = parseCount(src.fir, 18);
  if (patch.notesPresent) patch.notes = src.notes == null ? null : String(src.notes).slice(0, 10_000);
  return patch;
}

/** One column moves only when this write included it. The other columns stay. */
export function applyPresentColumns(stored: NoteTotals, patch: NotePatch): NoteTotals {
  return {
    putts: patch.puttsPresent ? patch.putts : stored.putts,
    gir: patch.girPresent ? patch.gir : stored.gir,
    fir: patch.firPresent ? patch.fir : stored.fir,
    notes: patch.notesPresent ? patch.notes : stored.notes,
  };
}

/** Single statement. A concurrent GIR-only write cannot put the previous putts back. */
export const NOTE_UPSERT = `insert into round_note (round_id, user_id, putts, gir, fir, notes, updated_at)
  values ($1,$2,$3,$4,$5,$6,now())
  on conflict (round_id) do update set
    putts = case when $7 then excluded.putts else round_note.putts end,
    gir = case when $8 then excluded.gir else round_note.gir end,
    fir = case when $9 then excluded.fir else round_note.fir end,
    notes = case when $10 then excluded.notes else round_note.notes end,
    updated_at = now()
  returning putts, gir, fir, notes, updated_at`;

/**
 * A clear is an update to nulls at a higher rev, not a delete.
 * Equal rev writes only when the payload is the same (retry). A different payload matches nothing.
 */
export const HOLE_MARK_UPSERT = `insert into round_hole_mark (round_id, user_id, hole, putts, gir, drive, rev, updated_at)
  values ($1,$2,$3,$4,$5,$6,$7,now())
  on conflict (round_id, hole) do update set
    putts = excluded.putts,
    gir = excluded.gir,
    drive = excluded.drive,
    rev = excluded.rev,
    user_id = excluded.user_id,
    updated_at = now()
  where round_hole_mark.rev < excluded.rev
     or (round_hole_mark.rev = excluded.rev
         and round_hole_mark.putts is not distinct from excluded.putts
         and round_hole_mark.gir is not distinct from excluded.gir
         and round_hole_mark.drive is not distinct from excluded.drive)
  returning hole, putts, gir, drive, rev`;

export function accountView<T>(totals: T, marks: Mark[], holes: HoleRef[]) {
  return { totals, fields: noteFields(marks, holes) };
}

/** `12:Azul` names one club. Anything else, including a bare catalog key, is not a license to list every course. */
export function boundedCourseKey(raw: string | null | undefined): { clubId: string; name: string } | null {
  const match = /^(\d{1,9}):([^:]{1,120})$/.exec(String(raw ?? "").trim());
  if (!match) return null;
  return { clubId: match[1], name: match[2] };
}
