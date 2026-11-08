/**
 * Sign-in with Golfistics matrícula + clave. The clave is checked live against Golfistics App (same read-only login as the
 * link/sync flow), used in memory, and only ever stored encrypted (lib/crypto.ts). Nothing here logs the clave, cookies or sessions.
 */
import { createHash } from "node:crypto";
import { q } from "./db";
import { GolfisticsApp } from "./golfistics-app";
import { GolfisticsError } from "./golfistics";
import { decryptSecret, encryptSecret } from "./crypto";

/** Where players set up or recover their clave (Golfistics App login page; it says the clave is recovered from the club's site). */
export const GOLFISTICS_APP_URL = "https://app.golfistics.com/golf/golfisticsapp_login.php";
export const RATE = { windowMin: 15, perMatricula: 5, perIp: 20 };

export type Verified = { player_name: string | null; handicap_index: number | null };
export type Verifier = (matricula: string, clave: string) => Promise<Verified>;

/** Real verifier: Golfistics App login (read-only form POST, cookies in memory only). */
export const golfisticsVerifier: Verifier = async (matricula, clave) => {
  const app = await new GolfisticsApp(matricula, clave).login();
  return { player_name: app.player.name, handicap_index: app.player.handicap_index };
};

/** Local QA only (never on Vercel): GOLFLET_MOCK_GOLFISTICS=1 → matrícula "qa…": clave "qa-ok" works, "qa-down" = Golfistics down. */
export const mockVerifier: Verifier = async (matricula, clave) => {
  if (!/^qa/i.test(matricula)) throw new GolfisticsError("login_failed", "Matrícula o contraseña incorrecta");
  if (clave === "qa-down") throw new GolfisticsError("unreachable", "No se pudo conectar con el sistema de tu club");
  if (clave !== "qa-ok") throw new GolfisticsError("login_failed", "Matrícula o contraseña incorrecta");
  return { player_name: `QA ${matricula}`, handicap_index: 12.3 };
};
let override: Verifier | null = null;
export const setVerifierForTests = (v: Verifier | null) => { override = v; };
export function currentVerifier(): Verifier {
  if (override) return override;
  if (process.env.GOLFLET_MOCK_GOLFISTICS === "1" && !process.env.VERCEL) return mockVerifier;
  return golfisticsVerifier;
}

/* ---------------- pure helpers (tested) ---------------- */
export function normMatricula(s: unknown): string | null {
  const m = String(s ?? "").trim();
  return /^[\w.-]{1,32}$/.test(m) ? m : null;
}
export type LoginFailure = { status: 401 | 429 | 503 | 400; code: string; message: string; hint?: string; golfistics_url?: string; retry_after_s?: number; counts: boolean };
/** Golfistics error → what the player sees. Rejections count for the rate limit; Golfistics being down doesn't. */
export function classifyLoginError(e: unknown): LoginFailure {
  if (e instanceof GolfisticsError && e.code === "login_failed")
    return { status: 401, code: "GOLFISTICS_REJECTED", counts: true, golfistics_url: GOLFISTICS_APP_URL,
      message: "No pudimos entrar con esa matrícula y contraseña.",
      hint: "Si todavía no configuraste tu contraseña o no la recordás, configurala desde el sitio de tu club y volvé a intentar." };
  return { status: 503, code: "GOLFISTICS_UNAVAILABLE", counts: false, message: "El sistema de tu club no responde en este momento. Probá de nuevo en unos minutos: tu matrícula y contraseña no se tocaron." };
}
export function rateDecision(failsMatricula: number, failsIp: number): LoginFailure | null {
  if (failsMatricula < RATE.perMatricula && failsIp < RATE.perIp) return null;
  return { status: 429, code: "TOO_MANY_ATTEMPTS", counts: false, retry_after_s: RATE.windowMin * 60,
    message: `Demasiados intentos fallidos. Esperá ${RATE.windowMin} minutos y volvé a probar.`, hint: "Si no recordás tu clave, configurala en el sitio de tu club.", golfistics_url: GOLFISTICS_APP_URL };
}
/** Several Golflet users linked to the same matrícula: staff role first, then the one synced most recently, then the oldest. */
export function pickUser<T extends { user_id: string; role: string | null; last_sync_at: Date | string | null; created_at: Date | string }>(rows: T[]): string | null {
  if (!rows.length) return null;
  const t = (d: any) => (d ? +new Date(d) : 0);
  return rows.slice().sort((a, b) => (b.role ? 1 : 0) - (a.role ? 1 : 0) || t(b.last_sync_at) - t(a.last_sync_at) || t(a.created_at) - t(b.created_at))[0].user_id;
}
export const placeholderEmail = (matricula: string) => `matricula-${matricula.toLowerCase().replace(/[^a-z0-9.-]/g, "-")}@golfistics.invalid`;
export const keyHash = (kind: "m" | "ip", v: string) => createHash("sha256").update(`${kind}:${v.toLowerCase()}`).digest("hex");

/* ---------------- DB ---------------- */
export async function failCounts(matricula: string, ip: string | null) {
  const [r] = await q(`select count(*) filter (where key_hash=$1)::int m, count(*) filter (where key_hash=$2)::int ip from login_attempt
    where not ok and at > now() - make_interval(mins => $3::int) and key_hash in ($1,$2)`, [keyHash("m", matricula), keyHash("ip", ip || "-"), RATE.windowMin]);
  return { m: r?.m ?? 0, ip: ip ? r?.ip ?? 0 : 0 };
}
export async function recordAttempt(matricula: string, ip: string | null, ok: boolean) {
  const keys = [keyHash("m", matricula), ...(ip ? [keyHash("ip", ip)] : [])];
  for (const k of keys) await q(`insert into login_attempt (key_hash, ok) values ($1,$2)`, [k, ok]).catch(() => {});
  if (ok) await q(`delete from login_attempt where key_hash=$1 and not ok`, [keyHash("m", matricula)]).catch(() => {});
  await q(`delete from login_attempt where at < now() - interval '2 days'`).catch(() => {});
}
/** Existing Golflet account for this matrícula: the Golfistics login link first, then any linked club account. */
export async function findUserForMatricula(matricula: string): Promise<string | null> {
  const [a] = await q(`select "userId" as user_id from account where "providerId"='golfistics' and lower("accountId")=lower($1) order by "createdAt" limit 1`, [matricula]);
  if (a) return a.user_id;
  const rows = await q(`select a.user_id, r.role, max(a.last_sync_at) last_sync_at, min(u."createdAt") created_at from club_account a join "user" u on u.id=a.user_id left join user_role r on r.user_id=a.user_id
    where lower(a.matricula)=lower($1) and a.user_id is not null group by a.user_id, r.role`, [matricula]);
  return pickUser(rows);
}
/** Keep the saved (encrypted) clave in step when the player changed it in Golfistics. Only touches accounts that chose to save it, unless `save` is true. */
export async function refreshSavedClave(userId: string, matricula: string, clave: string, save: boolean) {
  const rows = await q(`select id, password_enc from club_account where user_id=$1 and lower(matricula)=lower($2) and source='app'`, [userId, matricula]);
  let n = 0;
  for (const r of rows) {
    if (!r.password_enc && !save) continue;
    let same = false; if (r.password_enc) { try { same = decryptSecret(r.password_enc) === clave; } catch { same = false; } }
    if (!same) { await q(`update club_account set password_enc=$2 where id=$1`, [r.id, encryptSecret(clave)]); n++; }
  }
  return { linked: rows.length, updated: n };
}
export async function savePending(userId: string, matricula: string, clave: string, save: boolean) {
  await q(`insert into golfistics_pending (user_id, matricula, password_enc, save_password) values ($1,$2,$3,$4)
    on conflict (user_id) do update set matricula=excluded.matricula, password_enc=excluded.password_enc, save_password=excluded.save_password, created_at=now()`, [userId, matricula, encryptSecret(clave), save]);
}
