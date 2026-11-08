import { handle, json } from "@/lib/http";
import { requireClubStaff } from "@/lib/admin";
import { staffCourses } from "@/lib/pins";
import { artToday } from "@/lib/pins-core";
/** GET → courses the signed-in panel user can load pins for (club staff: their club; admins: all courses with a GPS map). */
export const GET = handle(async (req: Request) => {
  const s = await requireClubStaff(req);
  return json({ courses: await staffCourses(s.club_code), today: artToday(), role: s.role });
});
