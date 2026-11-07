import { handle, json, requireUser } from "@/lib/http";
import { checkBookings } from "@/lib/booking-check";
import { listTeeTimes } from "@/lib/tee-times";

export const maxDuration = 60;
/** t242u: POST — light check for new/changed/cancelled bookings at the player's clubs (read-only against the club; throttled per account).
 *  → { status: checked|throttled|no_account|error, new: [id], changed: [id], gone: [id], next_in_s, tee_times: upcoming (≤ limit) } */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req); const u = new URL(req.url);
  const limit = Math.max(1, Math.min(200, Number(u.searchParams.get("limit")) || 4));
  const r = await checkBookings(user.id);
  return json({ ...r, tee_times: await listTeeTimes(user.id, "upcoming", limit) });
});
