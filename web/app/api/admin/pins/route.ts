import { handle, json } from "@/lib/http";
import { adminBody, audit, requireClubStaff } from "@/lib/admin";
import { deleteClubPin, setClubPin } from "@/lib/pins";
/** PUT { club_code, vm_course, date (today..+60), hole, lat, lng, zone } → club pin (replaces a player pin that day). DELETE { club_code, vm_course, date, hole } → removes a club pin. */
export const PUT = handle(async (req: Request) => {
  const s = await requireClubStaff(req); const b = await adminBody(req); const r = await setClubPin(s, b);
  await audit(s, "pin.club.set", { type: "course_pin", id: r.id }, `Bandera del club · ${b.vm_course} hoyo ${b.hole} · ${b.date} · ${b.zone}`);
  return json(r);
});
export const DELETE = handle(async (req: Request) => {
  const s = await requireClubStaff(req); const b = await adminBody(req); const r = await deleteClubPin(s, b);
  await audit(s, "pin.club.delete", { type: "course_pin" }, `Bandera del club borrada · ${b.vm_course} hoyo ${b.hole} · ${b.date}`);
  return json(r);
});
