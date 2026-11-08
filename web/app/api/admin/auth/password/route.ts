import { handle, json, HttpError } from "@/lib/http";
import { adminBody, auditAuth, requirePanel } from "@/lib/admin";
import { endAllSessions, hashPassword, verifyPassword, weakPassword } from "@/lib/admin-auth";
import { q } from "@/lib/db";

/** PUT /api/admin/auth/password { current, password } → changes your own admin password; other admin sessions of yours are closed. */
export const PUT = handle(async (req: Request) => {
  const u = await requirePanel(req);
  const b = await adminBody(req);
  const [c] = await q(`select username, pw_hash from admin_credential where user_id=$1`, [u.id]);
  if (!c) throw new HttpError(404, "No tenés credenciales del panel");
  if (typeof b.current !== "string" || !(await verifyPassword(b.current, c.pw_hash))) {
    await auditAuth("admin.password.fail", u, "Cambio de contraseña rechazado (contraseña actual incorrecta)");
    throw new HttpError(400, "La contraseña actual no es correcta.");
  }
  const weak = weakPassword(b.password, c.username); if (weak) throw new HttpError(400, weak);
  if (b.password === b.current) throw new HttpError(400, "La nueva contraseña tiene que ser distinta.");
  await q(`update admin_credential set pw_hash=$2, must_change=false, updated_at=now() where user_id=$1`, [u.id, await hashPassword(b.password)]);
  await endAllSessions(u.id, req);
  await auditAuth("admin.password.change", u, "Cambió su contraseña del panel");
  return json({ ok: true });
});
