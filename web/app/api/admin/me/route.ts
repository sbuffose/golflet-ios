import { handle, json } from "@/lib/http";
import { requirePanel } from "@/lib/admin";
import { q } from "@/lib/db";

/** Who is using the panel and which sections they can open (editors: course content only). */
export const GET = handle(async (req: Request) => {
  const u = await requirePanel(req);
  const all = ["dashboard", "users", "roles", "access", "requests", "leadsp", "leadsm", "leadsc", "feedback", "profesores", "sorteos", "clubmsgs", "videos", "clubs", "arclubs", "courses", "gps", "strategy", "pace", "settings", "audit", "pins", "pinstaff"];
  const [c] = await q(`select username, must_change from admin_credential where user_id=$1`, [u.id]);
  return json({ user: { id: u.id, name: u.name, email: u.email, role: u.role, username: c?.username ?? null, must_change: !!c?.must_change }, club_code: u.club_code,
    club_name: u.club_code ? (await q(`select name from club where code=$1`, [u.club_code]))[0]?.name ?? null : null,
    sections: u.role === "admin" ? all : u.role === "club" ? ["pins"] : ["arclubs", "courses", "gps", "strategy", "pace"] });
});
