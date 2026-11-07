import { competitionByKey } from "./competition";
import { q } from "./db";
import { HttpError } from "./http";

export async function ownRound(userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "No encontrado");
  const [r] = await q(`select r.id, r.date::text as date, r.course, r.data, r.holes, case when coalesce((r.data->>'other_course')::boolean, false) then coalesce(r.data->>'club_played', c.name) else c.name end as club_name, c.name as source_club_name,
      n.putts, n.gir, n.fir, n.notes, n.updated_at as notes_at
    from round r join club_account a on a.id=r.club_account_id join club c on c.id=a.club_id
    left join round_note n on n.round_id=r.id where r.id=$1 and a.user_id=$2`, [id, userId]);
  if (!r) throw new HttpError(404, "No encontrado");
  // t144u: competition flag + torneo name, from any copy of this card the user has (other club's copy may lack them)
  const sib = await q(`select r.date::text as date, r.course, r.data from round r join club_account a on a.id=r.club_account_id where a.user_id=$1 and r.date=$2::date`, [userId, r.date]);
  const cx = competitionByKey(sib.map((x: any) => ({ ...x.data, date: x.date, course: x.course }))).get({ ...r.data, date: r.date, course: r.course });
  r.is_competition = cx.is_competition;
  if (!(r.data?.tournament && String(r.data.tournament).trim()) && cx.tournament) r.data = { ...r.data, tournament: cx.tournament };
  return r;
}
