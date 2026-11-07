/**
 * Cross-club round dedupe. With the Golfistics App source one club site can list the player's cards from every
 * club (e.g. Mar del Plata lists the Jockey ones too), so the same round may be stored under several accounts.
 * Same round = same date + club played + course + gross (status when there is no gross).
 * Keeper: the copy with user notes, then the one with hole-by-hole detail, then the local (home-club) copy,
 * then the oldest linked account.
 */
export type DedupeRow = {
  id: string; account_id: string; date: string; course: string | null;
  club_played?: string | null; gross?: number | null; card_status?: string | null;
  holes_n: number; other_course?: boolean; has_notes?: boolean;
};

export const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function roundKey(r: Pick<DedupeRow, "date" | "club_played" | "course" | "gross" | "card_status">) {
  return [r.date, norm(r.club_played), norm(r.course), r.gross != null && Number(r.gross) > 0 ? String(Number(r.gross)) : `s:${norm(r.card_status)}`].join("|");
}

/** Returns the ids to keep (in input order) and, for each dropped id, the id that replaced it. */
export function dedupeRounds<T extends DedupeRow>(rows: T[], accountOrder: string[] = []) {
  const rank = (a: string) => { const i = accountOrder.indexOf(a); return i < 0 ? 999 : i; };
  const score = (r: T) => (r.has_notes ? 8 : 0) + (r.holes_n > 0 ? 4 : 0) + (r.other_course ? 0 : 2);
  const best = new Map<string, T>();
  for (const r of rows) {
    const k = roundKey(r), cur = best.get(k);
    if (!cur || score(r) > score(cur) || (score(r) === score(cur) && rank(r.account_id) < rank(cur.account_id))) best.set(k, r);
  }
  const keep = new Set([...best.values()].map(r => r.id));
  const replacedBy = new Map<string, string>();
  for (const r of rows) if (!keep.has(r.id)) replacedBy.set(r.id, best.get(roundKey(r))!.id);
  return { kept: rows.filter(r => keep.has(r.id)), keep, replacedBy };
}
