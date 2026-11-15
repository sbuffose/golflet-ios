/**
 * One Golflet user holds one matrícula. A matrícula that already belongs to another user
 * is never attached, and a sync never writes cards from a different matrícula.
 * Pure decisions live here so tests can lock the rule without a database or a password.
 */
import { q } from "./db";

export const MATRICULA_OTHER = "Esta cuenta ya está vinculada a otra matrícula. No copiamos tarjetas de una matrícula distinta.";
export const MATRICULA_OWNED = "Esa matrícula ya pertenece a otra cuenta. No la vinculamos acá.";
export const MATRICULA_REMOTE = "La sesión del club es de otra matrícula. No guardamos esas tarjetas.";

export function sameMatricula(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = String(a ?? "").trim().toLowerCase();
  const right = String(b ?? "").trim().toLowerCase();
  return left.length > 0 && left === right;
}

export type LoginCandidate = { userId: string; identity: string | null; via: "identity" | "club" };

/**
 * Who may open a session for this matrícula.
 * The Golfistics identity wins. A club row is only a fallback when that user has no different identity.
 * Two users, or a user already identified as someone else, produce no session user.
 */
export function loginUserId(matricula: string, candidates: LoginCandidate[]): string | null {
  const identity = candidates.find(c => c.via === "identity" && sameMatricula(c.identity ?? c.userId, matricula) && sameMatricula(c.identity, matricula));
  if (identity) return identity.userId;
  const club = candidates.filter(c => c.via === "club" && (!c.identity || sameMatricula(c.identity, matricula)));
  const ids = [...new Set(club.map(c => c.userId))];
  return ids.length === 1 ? ids[0] : null;
}

export type BindInput = {
  userId: string;
  incoming: string;
  /** Golfistics identity of this user, when they have signed in with a matrícula. */
  identity: string | null;
  /** Distinct matrículas already stored on this user's club accounts, oldest first. */
  clubMatriculas: string[];
  /** User who already owns this matrícula as a Golfistics identity, if any. */
  identityOwnerId: string | null;
};

export type BindDecision =
  | { ok: true }
  | { ok: false; reason: "other_matricula" | "owned_by_other"; message: string };

/** The only matrícula this user may link or sync. Identity wins; otherwise the oldest club matrícula. */
export function allowedMatricula(identity: string | null, clubMatriculas: string[]): string | null {
  const id = String(identity ?? "").trim();
  if (id) return id;
  const first = clubMatriculas.map(m => String(m ?? "").trim()).find(Boolean);
  return first || null;
}

export function bindDecision(input: BindInput): BindDecision {
  const incoming = String(input.incoming ?? "").trim();
  if (!incoming) return { ok: false, reason: "other_matricula", message: MATRICULA_OTHER };
  if (input.identityOwnerId && input.identityOwnerId !== input.userId) {
    return { ok: false, reason: "owned_by_other", message: MATRICULA_OWNED };
  }
  const allowed = allowedMatricula(input.identity, input.clubMatriculas);
  if (allowed && !sameMatricula(allowed, incoming)) {
    return { ok: false, reason: "other_matricula", message: MATRICULA_OTHER };
  }
  const extra = input.clubMatriculas.some(m => m && !sameMatricula(m, incoming) && !sameMatricula(m, allowed));
  if (extra && allowed && !sameMatricula(allowed, incoming)) {
    return { ok: false, reason: "other_matricula", message: MATRICULA_OTHER };
  }
  return { ok: true };
}

/** A sync may write only when the club session's matrícula is the account's matrícula. Missing means refuse. */
export function syncWriteAllowed(accountMatricula: string | null | undefined, remoteMatricula: string | null | undefined): boolean {
  return sameMatricula(accountMatricula, remoteMatricula);
}

function cookieBlob(cookies: Iterable<[string, string]>): string {
  const pairs: string[] = [];
  for (const [key, value] of cookies) {
    let decoded = value;
    try { decoded = decodeURIComponent(value.replace(/\+/g, " ")); } catch { decoded = value; }
    pairs.push(`${key}=${decoded}`);
  }
  return `${pairs.join("&")}&${pairs.map(x => x.slice(x.indexOf("=") + 1)).join("&")}`;
}

/** One field from a Golfistics cookie jar. Same blob Golfistics.login uses. Never logs the jar. */
export function cookieField(cookies: Iterable<[string, string]>, field: string): string | null {
  const safe = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = cookieBlob(cookies).match(new RegExp(`(?:^|&)${safe}=([^&;]*)`));
  const value = match?.[1]?.trim();
  return value || null;
}

/** userid from the club cookie. A value that itself contains userid= still counts. */
export function matriculaFromCookies(cookies: Iterable<[string, string]>): string | null {
  return cookieField(cookies, "userid");
}

export async function decideBind(userId: string, matricula: string): Promise<BindDecision> {
  const [ident] = await q(`select "accountId" as matricula from account where "userId"=$1 and "providerId"='golfistics' order by "createdAt" limit 1`, [userId]);
  const clubs = await q(`select matricula from club_account where user_id=$1 and matricula is not null group by matricula order by min(created_at)`, [userId]);
  const [owner] = await q(`select "userId" as user_id from account where "providerId"='golfistics' and lower("accountId")=lower($1) order by "createdAt" limit 1`, [matricula]);
  return bindDecision({
    userId,
    incoming: matricula,
    identity: ident?.matricula ?? null,
    clubMatriculas: clubs.map((r: { matricula: string }) => r.matricula),
    identityOwnerId: owner?.user_id ?? null,
  });
}

export class MatriculaConflict extends Error {
  constructor(message: string) { super(message); this.name = "MatriculaConflict"; }
}

/** Refuse before any credential is used and before any row is written. */
export async function assertCanBind(userId: string, matricula: string): Promise<void> {
  const decision = await decideBind(userId, matricula);
  if (!decision.ok) throw new MatriculaConflict(decision.message);
}
