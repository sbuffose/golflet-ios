/**
 * Roles + audit. Roles: "admin" (everything) and "editor" (course content only: strategy, card corrections, GPS greens).
 * Admins grant/revoke roles from /admin/roles; nobody can drop their own admin role, and the last admin can't be removed.
 */
import { q } from "./db";
import { HttpError, type SessionUser } from "./http";
import { getAdminSession } from "./admin-auth";

export type Role = "admin" | "editor";
export const ROLES: Role[] = ["admin", "editor"];

export async function getRole(userId: string): Promise<Role | null> {
  const [r] = await q(`select role from user_role where user_id=$1`, [userId]);
  return r?.role === "admin" || r?.role === "editor" ? (r.role as Role) : null;   // 'club' (t162u) is NOT a panel role: see requireClubStaff
}
export async function isAdmin(userId: string): Promise<boolean> { return (await getRole(userId)) === "admin"; }

export type StaffUser = SessionUser & { role: Role };
/** "admin": admins only. "editor": admins or editors (course content). */
/**
 * v9: the admin panel needs its own sign-in (/admin/login, usuario + contraseña) — the player session is NOT enough.
 * The admin session cookie identifies the staff user; the role is re-read on every request.
 */
export async function requireRole(req: Request, need: Role): Promise<StaffUser> {
  const s = await getAdminSession(req);
  if (!s) throw new HttpError(401, "Iniciá sesión en el panel");
  const u: SessionUser = { id: s.user_id, email: s.email, name: s.name };
  const role = await getRole(u.id);
  if (!role || (need === "admin" && role !== "admin")) throw new HttpError(403, need === "admin" ? "Solo para administradores" : "No tenés acceso al panel");
  return { ...u, role };
}
export const requireAdmin = (req: Request) => requireRole(req, "admin");
/** Any panel user (admin, editor or club pin loader). Only for "who am I", own password and the panel page itself. */
export async function panelRole(userId: string): Promise<{ role: "admin" | "editor" | "club"; club_code: string | null } | null> {
  const [r] = await q(`select r.role, cs.club_code from user_role r left join club_staff cs on cs.user_id=r.user_id where r.user_id=$1`, [userId]);
  if (r?.role === "admin" || r?.role === "editor") return { role: r.role, club_code: null };
  if (r?.role === "club" && r.club_code) return { role: "club", club_code: r.club_code };
  return null;
}
export async function requirePanel(req: Request) {
  const s = await getAdminSession(req);
  if (!s) throw new HttpError(401, "Iniciá sesión en el panel");
  const pr = await panelRole(s.user_id); if (!pr) throw new HttpError(403, "No tenés acceso al panel");
  return { id: s.user_id, email: s.email, name: s.name, ...pr };
}
/** t162u: club pin loaders (role 'club' + club_staff.club_code) or Golflet admins. club_code = null means "any club" (admin). */
export type PinStaff = SessionUser & { role: "admin" | "club"; club_code: string | null };
export async function requireClubStaff(req: Request): Promise<PinStaff> {
  const s = await getAdminSession(req);
  if (!s) throw new HttpError(401, "Iniciá sesión en el panel");
  const u: SessionUser = { id: s.user_id, email: s.email, name: s.name };
  const [r] = await q(`select r.role, cs.club_code from user_role r left join club_staff cs on cs.user_id=r.user_id where r.user_id=$1`, [u.id]);
  if (r?.role === "admin") return { ...u, role: "admin", club_code: null };
  if (r?.role === "club" && r.club_code) return { ...u, role: "club", club_code: r.club_code };
  throw new HttpError(403, "No tenés acceso a las banderas");
}
export const requireEditor = (req: Request) => requireRole(req, "editor");

/** Admin writes must be JSON (a cross-site form can't send application/json without a CORS preflight). */
export async function adminBody(req: Request): Promise<any> {
  if (!(req.headers.get("content-type") || "").includes("application/json")) throw new HttpError(415, "Mandá JSON");
  try { return await req.json(); } catch { throw new HttpError(400, "JSON inválido"); }
}

/**
 * Audit row. `coalesceMinutes`: for autosaves, refresh the latest identical (actor, action, target) row instead of adding one.
 * Never pass secrets in `detail`.
 */
export async function audit(actor: SessionUser, action: string, target: { type?: string; id?: string | number | null } = {}, summary = "", detail: unknown = null, coalesceMinutes = 0) {
  try {
    const tid = target.id == null ? null : String(target.id);
    if (coalesceMinutes > 0) {
      const [r] = await q(`update admin_audit set created_at=now(), detail=$5, summary=$6 where id = (select id from admin_audit where actor_id=$1 and action=$2 and target_type is not distinct from $3 and target_id is not distinct from $4
        and created_at > now() - make_interval(mins => $7::int) order by id desc limit 1) returning id`, [actor.id, action, target.type ?? null, tid, detail == null ? null : JSON.stringify(detail), summary, coalesceMinutes]);
      if (r) return;
    }
    await q(`insert into admin_audit (actor_id, actor_email, action, target_type, target_id, summary, detail) values ($1,$2,$3,$4,$5,$6,$7)`,
      [actor.id, actor.email, action, target.type ?? null, tid, summary, detail == null ? null : JSON.stringify(detail)]);
  } catch (e) { console.error("audit failed", e instanceof Error ? e.message : "unknown"); }
}

/** Admin sign-in events (login.ok / login.fail / logout / password.*). Never the password or token. */
export async function auditAuth(action: string, user: { id?: string | null; email?: string | null } | null, summary: string, detail: unknown = null) {
  await q(`insert into admin_audit (actor_id, actor_email, action, target_type, target_id, summary, detail) values ($1,$2,$3,'admin_login',$1,$4,$5)`,
    [user?.id ?? null, user?.email ?? null, action, summary, detail == null ? null : JSON.stringify(detail)]).catch(() => {});
}
