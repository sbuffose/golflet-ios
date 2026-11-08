import { handle, json, HttpError } from "@/lib/http";
import { adminBody, auditAuth } from "@/lib/admin";
import { attemptLogin, sameOrigin, sessionCookie, validUsername } from "@/lib/admin-auth";

/** POST /api/admin/auth/login { username, password } → sets the 8h admin session cookie. No player session needed. */
export const POST = handle(async (req: Request) => {
  sameOrigin(req);
  const b = await adminBody(req);
  const username = typeof b.username === "string" ? b.username.trim() : "", password = typeof b.password === "string" ? b.password : "";
  if (!validUsername(username) || !password || password.length > 200) throw new HttpError(401, "Usuario o contraseña incorrectos.");
  const r = await attemptLogin(username, password, req.headers);
  if (!r.ok) {
    await auditAuth("admin.login.fail", r.user_id ? { id: r.user_id, email: r.email } : null, `Ingreso al panel rechazado (${r.reason})`, { reason: r.reason, username_known: !!r.user_id });
    return json({ error: r.error }, r.status);
  }
  await auditAuth("admin.login.ok", { id: r.user_id, email: r.email }, "Ingreso al panel");
  return Response.json({ ok: true, must_change: r.must_change }, { headers: { "Cache-Control": "no-store", "Set-Cookie": sessionCookie(r.token) } });
});
