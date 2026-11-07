import { handle, json, requireUser } from "@/lib/http";
import { loadClubData } from "@/lib/club-stats-load";
import { allClubStats } from "@/lib/club-stats";

/** Per-club error metrics for every club with data. Filters: course | course_id, from, to, days. */
export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  const d = await loadClubData(user.id, new URL(req.url));
  return json({ filters: d.filters, clubs: allClubStats(d.clubs, d.shots, d.samples), shots_total: d.shots.length, launch_monitor_total: d.samples.length });
});
