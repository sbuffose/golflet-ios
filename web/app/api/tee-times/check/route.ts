import { handle, json, requireUser } from "@/lib/http";
import { checkBookings } from "@/lib/booking-check";
import { listTeeTimes } from "@/lib/tee-times";

export const maxDuration = 60;
/** POST — re-read the player's bookings with the stored clave. No 20-hour card throttle.
 *  Body { players: true, tee_id } is the explicit "Actualizar reserva" action: that booking's line is read again.
 *  A visit omits it and only refreshes the booking list. fresh is true only after misreservas.php was read.
 *  → { status, fresh, players_read, checked_at, last_checked_at, new, changed, gone, message, tee_times } */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req); const u = new URL(req.url);
  const limit = Math.max(1, Math.min(200, Number(u.searchParams.get("limit")) || 4));
  let b: any = {}; try { b = await req.json(); } catch { /* empty body */ }
  const teeId = typeof b.tee_id === "string" ? b.tee_id : undefined;
  const r = await checkBookings(user.id, { players: b.players === true, teeId });
  return json({ ...r, tee_times: await listTeeTimes(user.id, "upcoming", limit) });
});
