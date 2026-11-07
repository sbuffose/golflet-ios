/** t154u: pure helpers (unit-tested). */
import { HttpError } from "./http-error";
export const KINDS = ["group_invite", "club_message", "pin_report"] as const;
export type Kind = typeof KINDS[number];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Notification ids are "<kind>:<uuid>" (club_message:<club_message.id> | group_invite:<cmp_member.id>). */
export function parseId(s: unknown): { kind: Kind; ref: string } | null {
  if (typeof s !== "string") return null; const i = s.indexOf(":"); const kind = s.slice(0, i) as Kind, ref = s.slice(i + 1);
  return (KINDS as readonly string[]).includes(kind) && UUID.test(ref) ? { kind, ref: ref.toLowerCase() } : null;
}
/** Badge text: "" (hidden) for 0, "1"…"9", then "9+". */
export const badgeLabel = (n: number) => !(n > 0) ? "" : n > 9 ? "9+" : String(Math.floor(n));
/** POST /api/me/notifications/read body: { ids: [...] } or { all: true }. */
export function parseMarkRead(b: any): { all: true } | { ids: string[] } {
  if (b?.all === true) return { all: true };
  if (!Array.isArray(b?.ids) || !b.ids.length || b.ids.length > 100) throw new HttpError(400, "Mandá ids (1 a 100) o all: true");
  const ids = [...new Set(b.ids.map((x: unknown) => { const p = parseId(x); if (!p) throw new HttpError(400, "id inválido"); return `${p.kind}:${p.ref}`; }))] as string[];
  return { ids };
}
/** Admin club message: title 1–120, body ≤ 4000, club id int. */
export function parseClubMessage(b: any): { club_id: number; title: string; body: string } {
  const club_id = Number(b?.club_id), title = String(b?.title ?? "").replace(/\s+/g, " ").trim(), body = String(b?.body ?? "").replace(/\r\n/g, "\n").trim();
  if (!Number.isInteger(club_id) || club_id <= 0) throw new HttpError(400, "Elegí un club");
  if (!title) throw new HttpError(400, "Escribí un título");
  if (title.length > 120) throw new HttpError(400, "El título puede tener hasta 120 caracteres");
  if (body.length > 4000) throw new HttpError(400, "El mensaje puede tener hasta 4000 caracteres");
  return { club_id, title, body };
}
