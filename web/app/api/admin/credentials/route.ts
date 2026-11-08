import { handle, json, HttpError } from "@/lib/http";
import { adminBody, audit, requireAdmin } from "@/lib/admin";
import { endAllSessions, hashPassword, validUsername, weakPassword } from "@/lib/admin-auth";
import { q } from "@/lib/db";

/** Admin only. GET → staff (admins + editors) with their panel-credential status (never hashes). */
export const GET = handle(async (req: Request) => {
  await requireAdmin(req);
  const staff = await q(`select r.user_id, r.role, u.name, u.email, c.username, c.must_change, c.last_login_at, c.updated_at,
      (c.locked_until is not null and c.locked_until > now()) locked
    from user_role r join "user" u on u.id=r.user_id left join admin_credential c on c.user_id=r.user_id order by r.role, u.email`);
  return json({ staff });
});
/** PUT { user_id, username, password } → creates or replaces that staff member's credentials (they must change the password on first use unless it's yourself). */
export const PUT = handle(async (req: Request) => {
  const me = await requireAdmin(req);
  const b = await adminBody(req);
  const [r] = await q(`select r.role, u.email from user_role r join "user" u on u.id=r.user_id where r.user_id=$1`, [b.user_id]);
  if (!r) throw new HttpError(404, "Esa persona no tiene rol en el panel. Dale un rol primero.");
  if (!validUsername(b.username)) throw new HttpError(400, "Usuario: de 3 a 64 caracteres (letras, números, punto, guion, @).");
  const weak = weakPassword(b.password, b.username); if (weak) throw new HttpError(400, weak);
  const [dup] = await q(`select user_id from admin_credential where lower(username)=lower($1) and user_id<>$2`, [b.username, b.user_id]);
  if (dup) throw new HttpError(409, "Ese usuario ya está en uso.");
  const self = b.user_id === me.id;
  await q(`insert into admin_credential (user_id, username, pw_hash, must_change, set_by) values ($1,$2,$3,$4,$5)
    on conflict (user_id) do update set username=excluded.username, pw_hash=excluded.pw_hash, must_change=excluded.must_change, set_by=excluded.set_by, failed_count=0, locked_until=null, updated_at=now()`,
    [b.user_id, b.username, await hashPassword(b.password), !self, me.id]);
  await endAllSessions(b.user_id, self ? req : undefined);
  await audit(me, "admin.credential.set", { type: "user", id: b.user_id }, `Credenciales del panel para ${r.email} (usuario ${b.username})`);
  return json({ ok: true, must_change: !self });
});
/** DELETE { user_id } → removes someone's panel credentials and closes their admin sessions (not your own). */
export const DELETE = handle(async (req: Request) => {
  const me = await requireAdmin(req);
  const b = await adminBody(req);
  if (b.user_id === me.id) throw new HttpError(400, "No podés borrar tus propias credenciales.");
  const [r] = await q(`delete from admin_credential where user_id=$1 returning username`, [b.user_id]);
  if (!r) throw new HttpError(404, "No tenía credenciales.");
  await q(`delete from admin_session where user_id=$1`, [b.user_id]);
  await audit(me, "admin.credential.delete", { type: "user", id: b.user_id }, `Credenciales del panel borradas (usuario ${r.username})`);
  return json({ ok: true });
});
