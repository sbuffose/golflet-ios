/** t111u "Encontrar un profesor": answers (private to the player) + matching over real, visible profesores only. Never fabricates. */
import { q } from "./db";
import { HttpError } from "./http";
import { cleanAnswers, scoreMatch } from "./profesor-core";

/** Places declared by visible profesores (the only options in step 4). */
export async function matchLocations(): Promise<string[]> {
  const rows = await q(`select distinct trim(l) l from profesor_profile p, unnest(p.locations) l where p.active and trim(l) <> '' order by 1`);
  const seen = new Map<string, string>(); for (const r of rows) { const k = r.l.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); if (!seen.has(k)) seen.set(k, r.l); }
  return [...seen.values()];
}
async function officialHi(userId: string): Promise<number | null> {
  const [h] = await q(`select h.hi::float hi from hi_history h join club_account a on a.id=h.club_account_id where a.user_id=$1 order by h.date desc limit 1`, [userId]);
  if (h) return h.hi;
  const [a] = await q(`select handicap_index::float hi from club_account where user_id=$1 and handicap_index is not null order by last_sync_at desc nulls last limit 1`, [userId]);
  return a?.hi ?? null;
}
export async function getAnswers(userId: string) {
  const [r] = await q(`select availability, hcp::float hcp, play_freq, locations, budget, class_freq, updated_at from profesor_match_answers where user_id=$1`, [userId]);
  return { answers: r ?? null, suggested_hcp: await officialHi(userId), locations: await matchLocations() };
}
export async function saveAnswers(userId: string, b: any) {
  const [cur] = await q(`select availability, hcp::float hcp, play_freq, locations, budget, class_freq from profesor_match_answers where user_id=$1`, [userId]);
  let a; try { a = cleanAnswers(b, cur || {}, await matchLocations()); } catch (e: any) { throw new HttpError(400, e.message); }
  await q(`insert into profesor_match_answers (user_id, availability, hcp, play_freq, locations, budget, class_freq, updated_at) values ($1,$2,$3,$4,$5,$6,$7,now())
           on conflict (user_id) do update set availability=$2, hcp=$3, play_freq=$4, locations=$5, budget=$6, class_freq=$7, updated_at=now()`,
    [userId, JSON.stringify(a.availability), a.hcp, a.play_freq, a.locations, a.budget, a.class_freq]);
  return a;
}
/** Top 5 real profesores (visible), best first. Excludes the player themself. Includes `linked`. */
export async function findMatches(userId: string) {
  const { answers } = await getAnswers(userId);
  if (!answers) throw new HttpError(400, "Primero contestá las preguntas");
  const ps = await q(`select p.user_id, p.display_name, p.verified, p.account_status, p.locations, p.availability, p.levels, p.price_min, p.price_max, p.formats,
      exists(select 1 from player_profesor x where x.player_id=$1 and x.profesor_id=p.user_id) linked
    from profesor_profile p where p.active and p.user_id <> $1`, [userId]);
  return ps.map((p: any) => ({ p, m: scoreMatch(answers, p) })).filter((x: any) => x.m && x.m.score > 0)
    .sort((x: any, y: any) => y.m.score - x.m.score || Number(y.p.verified) - Number(x.p.verified)).slice(0, 5)
    .map(({ p, m }: any) => ({ profesor_id: p.user_id, name: p.display_name, verified: !!p.verified, pending: p.account_status === "pending", locations: p.locations || [],
      price_min: p.price_min, price_max: p.price_max, formats: p.formats || [], linked: p.linked, score: m.score, reasons: m.reasons }));
}
