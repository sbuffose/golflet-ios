import { handle, json, requireUser, HttpError } from "@/lib/http";
import { listTeeTimes, clubSources } from "@/lib/tee-times";

/** GET ?scope=upcoming|past|all (default upcoming) &limit=1..200 (default 50). Read-only: bookings come from each linked club (no manual entries). */
export const GET = handle(async (req: Request) => {
  const user = await requireUser(req); const u = new URL(req.url);
  const scope = u.searchParams.get("scope") || "upcoming"; if (!["upcoming", "past", "all"].includes(scope)) throw new HttpError(400, "scope: upcoming | past | all");
  const limit = Math.max(1, Math.min(200, Number(u.searchParams.get("limit")) || 50));
  return json({ scope, source: "club", clubs: await clubSources(user.id), tee_times: await listTeeTimes(user.id, scope, limit) });
});
