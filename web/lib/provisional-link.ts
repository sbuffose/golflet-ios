/** Today's provisional round and the club card that later belongs to it.
 *  Matching is date + course + matrícula. One pair links. Two candidates wait for a tap.
 *  Official hole scores are never rewritten. */
import { courseLabelHits, normName } from "./match-core";

export type ProvRound = {
  id: string;
  date: string;
  course: string;
  matricula: string;
  roundId: string | null;
};

export type CardHole = { hole: number; strokes: number | null };

export type OfficialCard = {
  id: string;
  date: string;
  course: string;
  matricula: string;
  holes: CardHole[];
};

export type LinkAsk = {
  date: string;
  course: string;
  matricula: string;
  liveIds: string[];
  roundIds: string[];
};

export type LinkPlan = {
  links: { liveId: string; roundId: string }[];
  asks: LinkAsk[];
};

const day = (value: string) => String(value || "").slice(0, 10);
const mat = (value: string) => String(value || "").trim();

export function coursesMatch(a: string, b: string): boolean {
  const left = normName(a);
  const right = normName(b);
  if (!left || !right) return false;
  if (left === right) return true;
  return courseLabelHits(a, b) || courseLabelHits(b, a);
}

export function artToday(now = new Date()): string {
  return new Date(now.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}

/** «En juego» while the day's card is still missing. A past open round waits as «Tarjeta pendiente». A finished reconstruction keeps its own label. */
export function pendingLabel(date: string, today: string, linked: boolean, inPlay: boolean): "En juego" | "Tarjeta pendiente" | null {
  if (linked) return null;
  if (day(date) === day(today)) return "En juego";
  if (inPlay) return "Tarjeta pendiente";
  return null;
}

export function strokeTotal(shots: { hole: number; penalty?: number | null }[]): Record<number, number> {
  const totals: Record<number, number> = {};
  for (const shot of shots) {
    const hole = Number(shot.hole);
    if (!Number.isInteger(hole) || hole < 1 || hole > 18) continue;
    const penalty = Number(shot.penalty);
    const n = Number.isInteger(penalty) && penalty > 0 ? penalty : 1;
    totals[hole] = (totals[hole] || 0) + n;
  }
  return totals;
}

/** Holes whose track total is not the official score. The official numbers stay as they are. */
export function holeGaps(totals: Record<number, number>, holes: CardHole[]): number[] {
  const gaps: number[] = [];
  for (const hole of holes) {
    const official = hole.strokes;
    const tracked = totals[hole.hole];
    if (official == null || tracked == null) continue;
    if (official !== tracked) gaps.push(hole.hole);
  }
  return gaps;
}

function keyOf(date: string, course: string, matricula: string): string {
  return `${day(date)}|${normName(course)}|${mat(matricula)}`;
}

/** Unlinked provisionals against cards that are not already attached. Exact one-to-one links. Anything else is a question. */
export function planProvisionalLinks(lives: ProvRound[], cards: OfficialCard[]): LinkPlan {
  const taken = new Set(lives.map(live => live.roundId).filter((id): id is string => !!id));
  const open = lives.filter(live => !live.roundId && mat(live.matricula));
  const free = cards.filter(card => !taken.has(card.id) && mat(card.matricula));
  const groups = new Map<string, { lives: ProvRound[]; cards: OfficialCard[] }>();
  const bucket = (key: string) => groups.get(key) || groups.set(key, { lives: [], cards: [] }).get(key)!;
  for (const live of open) {
    for (const card of free) {
      if (day(live.date) !== day(card.date)) continue;
      if (mat(live.matricula) !== mat(card.matricula)) continue;
      if (!coursesMatch(live.course, card.course)) continue;
      const group = bucket(keyOf(card.date, card.course, card.matricula));
      if (!group.lives.some(row => row.id === live.id)) group.lives.push(live);
      if (!group.cards.some(row => row.id === card.id)) group.cards.push(card);
    }
  }
  const links: LinkPlan["links"] = [];
  const asks: LinkAsk[] = [];
  const usedLives = new Set<string>();
  const usedCards = new Set<string>();
  for (const group of groups.values()) {
    const pendingLives = group.lives.filter(live => !usedLives.has(live.id));
    const pendingCards = group.cards.filter(card => !usedCards.has(card.id));
    if (pendingLives.length === 1 && pendingCards.length === 1) {
      links.push({ liveId: pendingLives[0].id, roundId: pendingCards[0].id });
      usedLives.add(pendingLives[0].id);
      usedCards.add(pendingCards[0].id);
      continue;
    }
    if (pendingLives.length && pendingCards.length) {
      asks.push({
        date: day(pendingCards[0].date),
        course: pendingCards[0].course,
        matricula: mat(pendingCards[0].matricula),
        liveIds: pendingLives.map(live => live.id),
        roundIds: pendingCards.map(card => card.id),
      });
    }
  }
  return { links, asks };
}

/** A confirmed pair still has to be the same day, course and matrícula, and neither side may already point elsewhere. */
export function pairIsEligible(live: ProvRound, card: OfficialCard, lives: ProvRound[]): boolean {
  if (!mat(live.matricula) || mat(live.matricula) !== mat(card.matricula)) return false;
  if (day(live.date) !== day(card.date) || !coursesMatch(live.course, card.course)) return false;
  if (live.roundId && live.roundId !== card.id) return false;
  if (lives.some(row => row.id !== live.id && row.roundId === card.id)) return false;
  return true;
}

/** The club card is the row that counts. A provisional stays beside it only while it has no card. */
export function listedIds(cards: { id: string }[], lives: { id: string; roundId: string | null }[]): { cards: string[]; pending: string[] } {
  return {
    cards: cards.map(card => card.id),
    pending: lives.filter(live => !live.roundId).map(live => live.id),
  };
}
