import { handle, json, HttpError } from "@/lib/http";
import { requireClubStaff } from "@/lib/admin";
import { clubDay } from "@/lib/pins";
import { artToday } from "@/lib/pins-core";
/** GET ?club_code=&vm_course=&date=YYYY-MM-DD → 18 holes with the green map and that day's pin (player pins: only "cargada por un jugador" + zone). */
export const GET = handle(async (req: Request) => {
  const s = await requireClubStaff(req); const u = new URL(req.url);
  const date = u.searchParams.get("date") || artToday(); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, "Fecha inválida");
  return json(await clubDay(s, u.searchParams.get("club_code") || "", u.searchParams.get("vm_course") || "", date));
});
