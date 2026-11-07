import { handle, json, requireUser } from "@/lib/http";
import { allUserShots, userClubs } from "@/lib/live";
import { clubStats } from "@/lib/shots-calc";

/** Per-club distances from logged shots. ?days=N limits to recent rounds. */
export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  const days = Number(new URL(req.url).searchParams.get("days")) || undefined;
  const shots = await allUserShots(user.id, days && days > 0 && days <= 3650 ? days : undefined);
  const clubs = await userClubs(user.id);
  return json({ clubs: clubStats(shots, clubs), shots_total: shots.length, unit_note: "metros (m) y yardas (yd)" });
});
