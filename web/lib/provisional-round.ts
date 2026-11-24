/** Find, create and attach today's provisional round. No new column: the card id lives on live_round.round_id. */
import { q } from "./db";
import { HttpError } from "./http-error";
import { bookingCourseName, courseChoices } from "./match-core";
import { isUndefinedColumn, type Sql } from "./scorecard-lease";
import { createManualRound } from "./reconstruct";
import {
  artToday, coursesMatch, holeGaps, pairIsEligible, pendingLabel, planProvisionalLinks, strokeTotal,
  type CardHole, type LinkAsk, type OfficialCard, type ProvRound,
} from "./provisional-link";

const runOf = (sql?: Sql): Sql => sql ?? ((text, params) => q(text, params ?? []));

function holesOf(raw: unknown): CardHole[] {
  if (!Array.isArray(raw)) return [];
  const holes: CardHole[] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 3) continue;
    const hole = Number(row[0]);
    const strokes = row[2] == null || row[2] === "" ? null : Number(row[2]);
    if (!Number.isInteger(hole)) continue;
    holes.push({ hole, strokes: strokes != null && Number.isInteger(strokes) ? strokes : null });
  }
  return holes;
}

async function loadSides(userId: string, sql: Sql): Promise<{ lives: ProvRound[]; cards: OfficialCard[] }> {
  const accounts = await sql(`select id, club_id, matricula from club_account where user_id=$1`, [userId]);
  const matriculaFor = (clubId: number | null) => {
    const rows = accounts.filter((row: any) => String(row.matricula || "").trim());
    const mine = clubId == null ? rows : rows.filter((row: any) => Number(row.club_id) === Number(clubId));
    return mine.length === 1 ? String(mine[0].matricula).trim() : "";
  };
  const lives = await sql(`select id, date::text as date, course, round_id, club_id from live_round where user_id=$1 and round_id is null and coalesce(official, false) = false`, [userId]);
  const cards = await sql(`select r.id, r.date::text as date, r.course, r.holes, a.matricula
    from round r join club_account a on a.id = r.club_account_id
    where a.user_id=$1 and coalesce(r.official, true)
      and not exists (select 1 from live_round x where x.user_id=$1 and x.round_id=r.id)`, [userId]);
  return {
    lives: lives.map((row: any) => ({
      id: String(row.id), date: String(row.date).slice(0, 10), course: String(row.course || ""),
      matricula: matriculaFor(row.club_id == null ? null : Number(row.club_id)), roundId: null,
    })),
    cards: cards.map((row: any) => ({
      id: String(row.id), date: String(row.date).slice(0, 10), course: String(row.course || ""),
      matricula: String(row.matricula || "").trim(), holes: holesOf(row.holes),
    })),
  };
}

export async function linkProvisionals(userId: string, sql?: Sql): Promise<{ linked: number; asks: LinkAsk[] }> {
  const db = runOf(sql);
  try {
    const { lives, cards } = await loadSides(userId, db);
    const plan = planProvisionalLinks(lives, cards);
    let linked = 0;
    for (const link of plan.links) {
      const rows = await db(`update live_round set round_id=$2, official=true, updated_at=now() where id=$1 and user_id=$3 and round_id is null returning id`, [link.liveId, link.roundId, userId]);
      if (rows.length) linked++;
    }
    return { linked, asks: plan.asks };
  } catch (e) {
    if (isUndefinedColumn(e, "official") || isUndefinedColumn(e, "round_id")) return { linked: 0, asks: [] };
    throw e;
  }
}

export async function confirmProvisionalLink(userId: string, liveId: string, roundId: string, sql?: Sql): Promise<{ linked: boolean }> {
  const db = runOf(sql);
  if (!/^[0-9a-f-]{36}$/i.test(liveId) || !/^[0-9a-f-]{36}$/i.test(roundId)) throw new HttpError(404, "No encontrado");
  const { lives, cards } = await loadSides(userId, db);
  const [current] = await db(`select id, date::text as date, course, round_id, club_id from live_round where id=$1 and user_id=$2`, [liveId, userId]);
  if (!current) throw new HttpError(404, "No encontrado");
  const accounts = await db(`select club_id, matricula from club_account where user_id=$1`, [userId]);
  const matching = accounts.filter((row: any) => String(row.matricula || "").trim() && (current.club_id == null || Number(row.club_id) === Number(current.club_id)));
  const live: ProvRound = {
    id: String(current.id), date: String(current.date).slice(0, 10), course: String(current.course || ""),
    matricula: matching.length === 1 ? String(matching[0].matricula).trim() : "",
    roundId: current.round_id ? String(current.round_id) : null,
  };
  const card = cards.find(row => row.id === roundId) || (await db(`select r.id, r.date::text as date, r.course, r.holes, a.matricula
    from round r join club_account a on a.id=r.club_account_id where r.id=$1 and a.user_id=$2`, [roundId, userId]))[0];
  if (!card) throw new HttpError(404, "No encontrado");
  const official: OfficialCard = card.holes ? card as OfficialCard : {
    id: String(card.id), date: String(card.date).slice(0, 10), course: String(card.course || ""),
    matricula: String(card.matricula || "").trim(), holes: holesOf(card.holes),
  };
  const known = lives.some(row => row.id === live.id) ? lives : [...lives, live];
  if (!pairIsEligible(live, official, known)) throw new HttpError(409, "Esa vuelta y esa tarjeta no son la misma salida.");
  if (live.roundId === official.id) return { linked: true };
  const rows = await db(`update live_round set round_id=$2, official=true, updated_at=now() where id=$1 and user_id=$3 and round_id is null returning id`, [live.id, official.id, userId]);
  return { linked: rows.length > 0 };
}

async function courseCatalog(userId: string, sql: Sql) {
  const rows = await sql(`select c.id as club_id, c.code, co.name from club_account a
    join club c on c.id=a.club_id join course co on co.club_id=c.id where a.user_id=$1`, [userId]);
  const names = [...new Set(rows.map((row: any) => String(row.name || "")).filter(Boolean))];
  return { rows, names };
}

function courseRow(catalog: { rows: any[]; names: string[] }, name: string) {
  const hit = catalog.rows.filter((row: any) => coursesMatch(String(row.name || ""), name));
  return hit.length === 1 ? hit[0] : null;
}

export async function openTodayRound(userId: string, body: { course?: string | null; teeId?: string | null }, sql?: Sql) {
  const db = runOf(sql);
  const today = artToday();
  const existing = await db(`select id, date::text as date, course, tee, club_code, vm_course from live_round
    where user_id=$1 and date=$2::date and round_id is null and coalesce(official, false)=false order by updated_at desc`, [userId, today]);
  const tees = await db(`select id, course_label, event_name from tee_time
    where user_id=$1 and source='club' and gone_at is null and date=$2::date order by time limit 5`, [userId, today]);
  const tee = body.teeId ? tees.find((row: any) => String(row.id) === body.teeId) || null : tees[0] || null;
  const catalog = await courseCatalog(userId, db);
  const named = String(body.course || "").trim();
  let resolved = named || (tee ? bookingCourseName({ course_label: tee.course_label, event_name: tee.event_name }, catalog.names) : null);
  if (!resolved && catalog.names.length === 1) resolved = catalog.names[0];
  const same = existing.find((row: any) => resolved && coursesMatch(String(row.course || ""), resolved));
  const reuse = same || (!resolved && existing.length === 1 ? existing[0] : null);
  if (reuse) {
    return { live_round: { id: String(reuse.id), date: today, course: String(reuse.course || ""), tee: reuse.tee || "", club_code: reuse.club_code || "", vm_course: reuse.vm_course || "" }, ask: null };
  }
  const ask = courseChoices(resolved, catalog.names);
  if (ask) return { live_round: null, ask, prompt: ask.includes("Azul") && ask.includes("Colorada") ? "¿Azul o Colorada?" : "¿Qué cancha?" };
  if (!resolved) throw new HttpError(400, "Elegí la cancha");
  const picked = courseRow(catalog, resolved);
  if (!picked) throw new HttpError(400, "Elegí la cancha");
  const live = await createManualRound({
    userId, date: today, clubCode: String(picked.code), vmCourse: String(picked.name),
    course: String(picked.name), clubId: Number(picked.club_id), roundId: null, inPlay: true,
  }, db);
  return { live_round: live, ask: null };
}

export async function trackGaps(userId: string, rounds: { round_id: string; holes?: unknown }[], sql?: Sql) {
  const db = runOf(sql);
  try {
    const shots = await db(`select l.round_id, s.hole, s.penalty_strokes from shot s
      join live_round l on l.id=s.live_round_id where l.user_id=$1 and l.round_id is not null`, [userId]);
    const byRound = new Map<string, { hole: number; penalty: number | null }[]>();
    for (const shot of shots) {
      const id = String(shot.round_id);
      byRound.set(id, [...(byRound.get(id) || []), { hole: Number(shot.hole), penalty: shot.penalty_strokes == null ? null : Number(shot.penalty_strokes) }]);
    }
    for (const round of rounds) {
      const totals = strokeTotal(byRound.get(String(round.round_id)) || []);
      (round as { track_diff?: number[] }).track_diff = holeGaps(totals, holesOf(round.holes));
    }
  } catch (e) {
    if (!isUndefinedColumn(e, "penalty_strokes") && !isUndefinedColumn(e, "round_id")) throw e;
  }
}

export function labelFor(date: string, today: string, linked: boolean, inPlay: boolean) {
  return pendingLabel(date, today, linked, inPlay);
}
