import { handle, json, requireUser } from "@/lib/http";
import { q } from "@/lib/db";
import { loadClubData } from "@/lib/club-stats-load";
import { clubDetail, distanceStats } from "@/lib/club-stats";
import { sampleDistances } from "@/lib/shot-samples";
import { countsForClub } from "@/lib/shots-calc";
import { postedStrokes } from "@/lib/shot-edit";

/** One club: the same metrics + its recent shots. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ club: string }> }) => {
  const user = await requireUser(req); const { club } = await ctx.params; const code = decodeURIComponent(club).slice(0, 8);
  const d = await loadClubData(user.id, new URL(req.url));
  const picked = d.shots.filter(s => s.club === code).sort((a: any, b: any) => +new Date(b.taken_at) - +new Date(a.taken_at)).slice(0, 30);
  const liveIds = [...new Set(picked.map((s: any) => s.live_round_id).filter(Boolean))];
  const scoreByLive = new Map<string, { round_id: string | null; holes: unknown }>();
  if (liveIds.length) {
    const metas = await q(`select l.id, l.round_id, r.holes from live_round l left join round r on r.id = l.round_id where l.id = any($1::uuid[])`, [liveIds]).catch(() => []);
    for (const row of metas) scoreByLive.set(row.id, { round_id: row.round_id, holes: row.holes });
  }
  const recent = picked.map((s: any) => {
    const meta = scoreByLive.get(s.live_round_id);
    const onHole = d.shots.filter((x: any) => x.live_round_id === s.live_round_id && x.hole === s.hole).length;
    return { id: s.id, live_round_id: s.live_round_id, round_id: meta?.round_id ?? null, date: s.date, hole: s.hole, shot_number: s.shot_number, distance_m: s.distance_m, distance_yd: s.distance_yd,
      distance_source: s.distance_source, to_green_yd: s.to_green_yd, lie: s.lie, result: s.result, direction: s.direction, length: s.length, mishit: !!s.mishit,
      shots_on_hole: onHole, posted_strokes: postedStrokes(meta?.holes, s.hole), counts_for_distance: countsForClub(s), distance_kind: s.distance_kind ?? null };
  });
  const cd: any = clubDetail(code, d.clubs, d.shots, d.samples);
  // t126u: GPS samples from iOS Jugar count too (rounds that have samples use them instead of their older shots), so Mi bolsa and this page agree
  const sd = await sampleDistances(user.id, code, d.filters as any);
  if (sd.values.length) { const old = d.shots.filter((s: any) => s.club === code && countsForClub(s) && !sd.rounds.has(s.live_round_id)).map((s: any) => s.distance_m);
    cd.distance = distanceStats([...old, ...sd.values]); cd.shots_measured = cd.distance?.n ?? 0; cd.outliers_trimmed = cd.distance?.trimmed ?? 0; cd.gps_samples = sd.values.length; }
  return json({ filters: d.filters, club: cd, recent_shots: recent });
});
