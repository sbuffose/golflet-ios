import { handle, json, requireUser } from "@/lib/http";
import { loadClubData } from "@/lib/club-stats-load";
import { clubDetail, distanceStats } from "@/lib/club-stats";
import { sampleDistances } from "@/lib/shot-samples";
import { countsForClub } from "@/lib/shots-calc";

/** One club: the same metrics + its recent shots. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ club: string }> }) => {
  const user = await requireUser(req); const { club } = await ctx.params; const code = decodeURIComponent(club).slice(0, 8);
  const d = await loadClubData(user.id, new URL(req.url));
  const recent = d.shots.filter(s => s.club === code).sort((a: any, b: any) => +new Date(b.taken_at) - +new Date(a.taken_at)).slice(0, 30)
    .map((s: any) => ({ id: s.id, live_round_id: s.live_round_id, date: s.date, hole: s.hole, shot_number: s.shot_number, distance_m: s.distance_m, distance_yd: s.distance_yd,
      distance_source: s.distance_source, to_green_yd: s.to_green_yd, lie: s.lie, result: s.result, direction: s.direction, length: s.length, mishit: !!s.mishit }));
  const cd: any = clubDetail(code, d.clubs, d.shots, d.samples);
  // t126u: GPS samples from iOS Jugar count too (rounds that have samples use them instead of their older shots), so Mi bolsa and this page agree
  const sd = await sampleDistances(user.id, code, d.filters as any);
  if (sd.values.length) { const old = d.shots.filter((s: any) => s.club === code && countsForClub(s) && !sd.rounds.has(s.live_round_id)).map((s: any) => s.distance_m);
    cd.distance = distanceStats([...old, ...sd.values]); cd.shots_measured = cd.distance?.n ?? 0; cd.outliers_trimmed = cd.distance?.trimmed ?? 0; cd.gps_samples = sd.values.length; }
  return json({ filters: d.filters, club: cd, recent_shots: recent });
});
