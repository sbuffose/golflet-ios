import { handle, json, requireUser } from "@/lib/http";
import { q } from "@/lib/db";
import { visibleRoundIds } from "@/lib/data";
import { roundChips } from "@/lib/metrics";
import { competitionByKey } from "@/lib/competition";

/** Rounds of every linked club, deduped across clubs (same round listed by two club sites appears once). */
export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  const keep = await visibleRoundIds(user.id);
  const rows = await q(`select r.id, r.date::text as date, r.course,
      case when coalesce((r.data->>'other_course')::boolean, false) then coalesce(r.data->>'club_played', c.name) else c.name end as club_name,
      c.name as source_club_name, coalesce((r.data->>'other_course')::boolean, false) as other_course,
      jsonb_array_length(r.holes) > 0 as has_holes, r.data->>'tournament' as tournament, r.data->>'club_played' as club_played,
      r.data->>'field_size' as field_size, r.data->>'position' as position,
      (r.data->>'gross')::int as gross, (r.data->>'net')::int as net, r.data->>'card_status' as card_status,
      r.holes, r.data->'summary_counts' as summary_counts, coalesce((r.data->>'is_9_holes')::boolean, false) as is_9_holes, n.putts,
      (select count(*)::int from shot s join live_round l on l.id=s.live_round_id where l.round_id=r.id and (s.club ~* '^(pt|putter)$' or s.lie='green')) as gps_putts
    from round r join club_account a on a.id=r.club_account_id join club c on c.id=a.club_id left join round_note n on n.round_id=r.id
    where a.user_id=$1 order by r.date desc`, [user.id]);
  const comp = competitionByKey(rows as any[]);
  return json({ rounds: rows.filter(r => keep.has(r.id)).map(({ holes, summary_counts, putts, gps_putts, club_played, field_size, position, ...r }: any) => {
    const cx = comp.get({ ...r, club_played, field_size, position });
    return { ...r, tournament: r.tournament?.trim() ? r.tournament : cx.tournament, is_competition: cx.is_competition, ...roundChips({ holes, summary_counts, is_9_holes: r.is_9_holes }, putts, gps_putts) }; }) });
});
