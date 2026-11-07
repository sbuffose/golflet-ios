import { handle, json, HttpError } from "@/lib/http";
import { adminBody, audit, requireAdmin } from "@/lib/admin";
import { hashPassword, validUsername, weakPassword } from "@/lib/admin-auth";
import { q } from "@/lib/db";
import { randomUUID } from "node:crypto";

/** Admin only. GET → club pin accounts. POST { club_code, name, email, username, password } → creates a club account (role 'club'):
 *  it signs in at /admin/login and can only load pins for that club's courses. It must change the password on first sign-in. */
export const GET = handle(async (req: Request) => {
  await requireAdmin(req);
  const staff = await q(`select cs.user_id, cs.club_code, c.name club_name, u.name, u.email, ac.username, ac.must_change, ac.last_login_at, cs.created_at
    from club_staff cs join "user" u on u.id=cs.user_id left join club c on c.code=cs.club_code left join admin_credential ac on ac.user_id=cs.user_id order by c.name, u.name`);
  const clubs = await q(`select distinct c.code, c.name from club c join vm_course v on v.club_code=c.code order by c.name`);
  return json({ staff, clubs });
});
export const POST = handle(async (req: Request) => {
  const me = await requireAdmin(req); const b = await adminBody(req);
  const club = String(b.club_code || ""); const [c] = await q(`select c.code, c.name from club c where c.code=$1 and exists (select 1 from vm_course v where v.club_code=c.code)`, [club]);
  if (!c) throw new HttpError(400, "Elegí un club con mapa de greens");
  const name = String(b.name || "").trim().slice(0, 80), email = String(b.email || "").trim().toLowerCase().slice(0, 120);
  if (name.length < 2) throw new HttpError(400, "Poné el nombre de la persona del club");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "Email inválido");
  if (!validUsername(b.username)) throw new HttpError(400, "Usuario: de 3 a 64 caracteres (letras, números, punto, guion, @).");
  const weak = weakPassword(b.password, b.username); if (weak) throw new HttpError(400, weak);
  const [dupU] = await q(`select 1 from admin_credential where lower(username)=lower($1)`, [b.username]); if (dupU) throw new HttpError(409, "Ese usuario ya está en uso.");
  const [ex] = await q(`select u.id, r.role from "user" u left join user_role r on r.user_id=u.id where lower(u.email)=$1`, [email]);
  if (ex) throw new HttpError(409, ex.role ? "Esa persona ya tiene acceso al panel." : "Ese email ya es de un jugador de Golflet: usá un email del club.");
  const id = "club-" + randomUUID();
  await q(`insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values ($1,$2,$3,false,now(),now())`, [id, name, email]);
  await q(`insert into user_role (user_id, role, granted_by) values ($1,'club',$2)`, [id, me.id]);
  await q(`insert into club_staff (user_id, club_code, created_by) values ($1,$2,$3)`, [id, club, me.id]);
  await q(`insert into admin_credential (user_id, username, pw_hash, must_change, set_by) values ($1,$2,$3,true,$4)`, [id, b.username, await hashPassword(b.password), me.id]);
  await audit(me, "club_staff.create", { type: "user", id }, `Cuenta de club para ${c.name} (usuario ${b.username})`);
  return json({ ok: true, user_id: id }, 201);
});
