/**
 * Separate admin sign-in for /admin (usuario + contraseña), on top of the role check.
 * - Passwords: scrypt (N=2^15, r=8, p=1, 64-byte key, 16-byte salt). Only the hash is stored.
 * - Sessions: random 32-byte token in an HttpOnly, Secure, SameSite=Strict cookie, 8h absolute expiry; only sha256(token) is stored.
 * - Rate limit: per IP (hashed) 20 failures / 15 min; per username: 5 consecutive failures lock 15 min, 10 lock 1 h.
 * Never log or audit the password or the token.
 */
import { createHash, randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { q } from "./db";
import { HttpError } from "./http";

const N = 32768, R = 8, P = 1, KEYLEN = 64, MAXMEM = 96 * 1024 * 1024;
export const ADMIN_COOKIE = "__Host-gl_admin";
export const SESSION_HOURS = 8;

function scrypt(pw: string, salt: Buffer, n = N, r = R, p = P): Promise<Buffer> {
  return new Promise((res, rej) => _scrypt(pw.normalize("NFKC"), salt, KEYLEN, { N: n, r, p, maxmem: MAXMEM }, (e, k) => (e ? rej(e) : res(k as Buffer))));
}
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${(await scrypt(pw, salt)).toString("base64")}`;
}
export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, s, h] = stored.split("$");
  if (alg !== "scrypt" || !s || !h) return false;
  const want = Buffer.from(h, "base64"), got = await scrypt(pw, Buffer.from(s, "base64"), +n, +r, +p);
  return want.length === got.length && timingSafeEqual(want, got);
}
/** Strength rule shared by every place that sets an admin password. Returns an error message or null. */
export function weakPassword(pw: unknown, username = ""): string | null {
  if (typeof pw !== "string" || pw.length < 12) return "La contraseña tiene que tener al menos 12 caracteres.";
  if (pw.length > 200) return "La contraseña es demasiado larga.";
  if (new Set(pw).size < 6) return "La contraseña es demasiado simple.";
  if (username && pw.toLowerCase().includes(username.toLowerCase())) return "La contraseña no puede contener el usuario.";
  return null;
}
export const validUsername = (u: unknown): u is string => typeof u === "string" && /^[a-zA-Z0-9._@-]{3,64}$/.test(u);

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const secretSalt = () => process.env.BETTER_AUTH_SECRET || "golflet";
export const ipKey = (h: Headers) => "aip:" + sha(secretSalt() + ":" + ((h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0] || "").trim().slice(0, 64) || "none"));
export const userKey = (u: string) => "au:" + sha(u.toLowerCase());

export function readCookie(req: Request, name = ADMIN_COOKIE): string | null {
  const c = req.headers.get("cookie") || "";
  for (const part of c.split(";")) { const i = part.indexOf("="); if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim()); }
  return null;
}
export const sessionCookie = (token: string) => `${ADMIN_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}`;
export const clearCookie = () => `${ADMIN_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await q(`insert into admin_session (token_hash, user_id, expires_at) values ($1,$2, now() + make_interval(hours => $3::int))`, [sha(token), userId, SESSION_HOURS]);
  await q(`delete from admin_session where expires_at < now()`).catch(() => {});
  return token;
}
export type AdminSession = { user_id: string; email: string; name: string; username: string; must_change: boolean };
export async function getAdminSession(req: Request): Promise<AdminSession | null> {
  const t = readCookie(req); if (!t || t.length > 100) return null;
  const [r] = await q(`select s.user_id, u.email, u.name, c.username, c.must_change from admin_session s join "user" u on u.id=s.user_id
    join admin_credential c on c.user_id=s.user_id where s.token_hash=$1 and s.expires_at > now()`, [sha(t)]);
  return (r as AdminSession) ?? null;
}
export async function endSession(req: Request) { const t = readCookie(req); if (t) await q(`delete from admin_session where token_hash=$1`, [sha(t)]); }
export const endAllSessions = (userId: string, exceptReq?: Request) => {
  const t = exceptReq ? readCookie(exceptReq) : null;
  return q(`delete from admin_session where user_id=$1 and token_hash <> $2`, [userId, t ? sha(t) : ""]);
};

/** Origin check for the sign-in POST (plus JSON-only + SameSite=Strict). */
export function sameOrigin(req: Request) {
  const o = req.headers.get("origin"); if (!o) return;
  if (new URL(o).host !== new URL(req.url).host && new URL(o).host !== (req.headers.get("x-forwarded-host") || "")) throw new HttpError(403, "Origen no permitido");
}

export type LoginResult = { ok: true; user_id: string; email: string; must_change: boolean; token: string } | { ok: false; status: number; error: string; user_id?: string; email?: string; reason: string };
const GENERIC = "Usuario o contraseña incorrectos.";
export async function attemptLogin(username: string, password: string, h: Headers): Promise<LoginResult> {
  const ik = ipKey(h);
  const [rl] = await q(`select count(*)::int n from login_attempt where key_hash=$1 and not ok and at > now() - interval '15 minutes'`, [ik]);
  if (rl.n >= 20) return { ok: false, status: 429, error: "Demasiados intentos desde esta conexión. Probá de nuevo en 15 minutos.", reason: "ip_rate_limited" };
  const [c] = await q(`select c.user_id, c.pw_hash, c.must_change, c.failed_count, c.locked_until, u.email, (select role from user_role where user_id=c.user_id) role
    from admin_credential c join "user" u on u.id=c.user_id where lower(c.username)=lower($1)`, [username]);
  const fail = async (reason: string, status = 401, error = GENERIC): Promise<LoginResult> => {
    await q(`insert into login_attempt (key_hash, ok) values ($1,false),($2,false)`, [ik, userKey(username)]).catch(() => {});
    return { ok: false, status, error, reason, user_id: c?.user_id, email: c?.email };
  };
  if (!c) { await verifyPassword(password, "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==").catch(() => false); return fail("unknown_user"); }
  if (c.locked_until && new Date(c.locked_until) > new Date()) {
    const mins = Math.max(1, Math.ceil((new Date(c.locked_until).getTime() - Date.now()) / 60000));
    return fail("locked", 423, `Usuario bloqueado por intentos fallidos. Probá de nuevo en ${mins} min.`);
  }
  const ok = await verifyPassword(password, c.pw_hash).catch(() => false);
  if (!ok) {
    const n = c.failed_count + 1, lock = n >= 10 ? 60 : n >= 5 ? 15 : 0;
    await q(`update admin_credential set failed_count=$2, locked_until = case when $3::int > 0 then now() + make_interval(mins => $3::int) else locked_until end where user_id=$1`, [c.user_id, n, lock]);
    return fail(lock ? "bad_password_locked" : "bad_password", lock ? 423 : 401, lock ? `Usuario bloqueado por intentos fallidos. Probá de nuevo en ${lock} min.` : GENERIC);
  }
  if (!c.role) return fail("no_role", 403, "Esta cuenta ya no tiene acceso al panel.");
  await q(`update admin_credential set failed_count=0, locked_until=null, last_login_at=now() where user_id=$1`, [c.user_id]);
  await q(`insert into login_attempt (key_hash, ok) values ($1,true)`, [ik]).catch(() => {});
  return { ok: true, user_id: c.user_id, email: c.email, must_change: c.must_change, token: await createSession(c.user_id) };
}
