/**
 * t144u: was this card a club competition (copa / torneo / fecha de programa)?
 * The club's card list has no "type" column (every card hangs off a TorneoID, including the "Tarjetas sueltas" bucket for loose
 * cards). What it does give per card, from the club itself: "Jugadores" (players entered in that torneo → field_size) and
 * "Puesto" (rank in the classification → position). A competition = a torneo with a field (≥ 2 players) where the card was
 * classified (has a Puesto) — or was handed in for that torneo but not classified (Tarj ≠ OK, e.g. DES).
 * Loose/practice cards are listed without a Puesto, so they don't count. No name guessing.
 * The same card synced under two clubs: the copy from the other club's site lacks Jugadores and the torneo name, so the
 * answer (and the name) is taken from any copy of that card.
 */
import { roundKey } from "./dedupe";
type R = { date: string; course?: string | null; club_played?: string | null; gross?: number | string | null; card_status?: string | null;
  tournament?: string | null; field_size?: number | string | null; position?: number | string | null };
const n = (v: unknown) => (v == null || v === "" ? null : Number(v));
export function isCompetitionCard(r: R): boolean {
  const f = n(r.field_size), p = n(r.position);
  if (f == null || !(f >= 2)) return false;
  return p != null && p > 0 ? true : !!r.card_status && r.card_status !== "OK";
}
/** roundKey → { is_competition, tournament } over every stored copy of each card. */
export function competitionByKey(rows: R[]) {
  const m = new Map<string, { is_competition: boolean; tournament: string | null }>();
  for (const r of rows) {
    const k = roundKey({ date: r.date, club_played: r.club_played ?? null, course: r.course ?? null, gross: n(r.gross), card_status: r.card_status ?? null });
    const e = m.get(k) ?? { is_competition: false, tournament: null };
    if (isCompetitionCard(r)) e.is_competition = true;
    if (!e.tournament && r.tournament && r.tournament.trim()) e.tournament = r.tournament;
    m.set(k, e);
  }
  return { get: (r: R) => m.get(roundKey({ date: r.date, club_played: r.club_played ?? null, course: r.course ?? null, gross: n(r.gross), card_status: r.card_status ?? null })) ?? { is_competition: false, tournament: null } };
}
