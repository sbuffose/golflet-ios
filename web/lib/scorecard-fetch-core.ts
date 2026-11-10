/** When to read a club scorecard after a tee time. No database and no Golfistics.
 *  Play is stored as an Argentina local date and HH:MM (UTC−3, no DST), the same clock as tee times.
 *  A job becomes due 5 hours after that tee. The cron runs every 15 minutes, so the first
 *  read happens in the quarter hour after that instant, not on the exact minute.
 *  Until the next local midnight after that first instant, a miss is retried every hour.
 *  After that midnight, once a day.
 *  The phone does not run this. The cron in /api/cron/scorecard does, even if the app is closed.
 *  The daily account refresh (20 hours, 06:00 ART) is a different job and does not gate this one. */

export const FIRST_DELAY_MS = 5 * 60 * 60 * 1000;
export const HOURLY_MS = 60 * 60 * 1000;
export const DAILY_MS = 24 * 60 * 60 * 1000;
export const ART_OFFSET_MS = 3 * 60 * 60 * 1000;
export const MAX_ATTEMPTS = 20;
export const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
/** A sync that just finished is reused. Anything older, including the morning cron, is not. */
export const FRESH_SYNC_MS = 90 * 1000;
export const MAX_SYNCS_PER_RUN = 4;
export const LOOKBACK_DAYS = 21;
/** A login left in 'running', or a lease with no heartbeat, is stale after this and may be taken. */
export const RUNNING_STALE_MS = 20 * 60 * 1000;
export const SYNC_BUSY_MESSAGE = "Hay una actualización en curso. Reintentamos en el próximo ciclo.";

export const FETCH_STATUSES = ["scheduled", "awaiting_card", "complete", "cancelled", "needs_credentials", "error", "stopped"] as const;
export type FetchStatus = (typeof FETCH_STATUSES)[number];

const OPEN: FetchStatus[] = ["scheduled", "awaiting_card", "needs_credentials", "error"];

export type FetchJob = {
  id: string;
  userId: string;
  teeTimeId: string | null;
  liveRoundId: string | null;
  accountId: string | null;
  source: "app" | "site" | null;
  matricula: string | null;
  hasPassword: boolean;
  syncRunning: boolean;
  /** When the account entered 'running'. Absent or older than RUNNING_STALE_MS is a crashed run, not a live one. */
  syncStartedAt: string | null;
  /** Another worker holds the login lease. */
  leaseHeld: boolean;
  /** Compare-and-swap counter read with the row. Enrollment writes only if it still matches. */
  version: number;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  playedAt: string;
  date: string;
  time: string | null;
  clubCode: string | null;
  courseLabel: string | null;
  clubName: string | null;
  status: FetchStatus;
  nextAttemptAt: string;
  lastAttemptAt: string | null;
  attemptCount: number;
  lastError: string | null;
  roundId: string | null;
  gone: boolean;
};

export type RoundHit = { id: string; userId: string; date: string; course: string | null; clubCode: string | null; accountId: string | null };

export type RoundClass = { roundId: string | null; ambiguous: boolean; reason: "match" | "none" | "ambiguous" | "other_course" };

export type TeeSnap = { date: string; time: string; gone: boolean; courseLabel: string | null; roundId: string | null; clubName: string | null; clubCode: string | null; accountId: string | null };

export function artTeeInstant(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh + 3, mm, 0));
}

export function artParts(instant: Date): { date: string; time: string } {
  const wall = new Date(instant.getTime() - ART_OFFSET_MS).toISOString();
  return { date: wall.slice(0, 10), time: wall.slice(11, 16) };
}

export function addArtDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function nextAttempt(playedAt: Date, lastAttempt: Date | null): Date {
  const first = new Date(playedAt.getTime() + FIRST_DELAY_MS);
  if (!lastAttempt) return first;
  const cutoff = artTeeInstant(addArtDays(artParts(first).date, 1), "00:00");
  const plusHour = new Date(lastAttempt.getTime() + HOURLY_MS);
  if (plusHour.getTime() < cutoff.getTime()) return plusHour;
  return new Date(lastAttempt.getTime() + DAILY_MS);
}

export function isDue(playedAt: Date, lastAttempt: Date | null, now: Date): boolean {
  return now.getTime() >= nextAttempt(playedAt, lastAttempt).getTime();
}

export function shouldStop(playedAt: Date, attemptCount: number, now: Date): boolean {
  return attemptCount >= MAX_ATTEMPTS || now.getTime() >= playedAt.getTime() + MAX_AGE_MS;
}

export function normName(value: string | null | undefined): string {
  return (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** One card for that player, club, and day. A card from another user is invisible.
 *  A course label that does not match is not a fallback: the job stays open. */
export function classifyRounds(job: { userId: string; date: string; courseLabel: string | null; clubCode: string | null; accountId: string | null }, rounds: RoundHit[]): RoundClass {
  let found = rounds.filter(r => r.userId === job.userId && r.date === job.date && (job.accountId ? r.accountId === job.accountId : !!job.clubCode && r.clubCode === job.clubCode));
  const want = normName(job.courseLabel);
  if (want) {
    const narrowed = found.filter(r => {
      const got = normName(r.course);
      return !!got && (got.includes(want) || want.includes(got));
    });
    if (found.length > 0 && narrowed.length === 0) return { roundId: null, ambiguous: true, reason: "other_course" };
    if (narrowed.length > 1) return { roundId: null, ambiguous: true, reason: "ambiguous" };
    found = narrowed;
  }
  if (found.length === 1) return { roundId: found[0].id, ambiguous: false, reason: "match" };
  if (found.length > 1) return { roundId: null, ambiguous: true, reason: "ambiguous" };
  return { roundId: null, ambiguous: false, reason: "none" };
}

/** True only while a run still has a start clock inside the lease window, or another worker holds the login lease. */
export function runningIsLive(job: Pick<FetchJob, "syncRunning" | "syncStartedAt" | "leaseHeld">, now: Date): boolean {
  if (job.leaseHeld) return true;
  if (!job.syncRunning || !job.syncStartedAt) return false;
  const age = now.getTime() - new Date(job.syncStartedAt).getTime();
  return age >= 0 && age < RUNNING_STALE_MS;
}

export function syncKey(job: Pick<FetchJob, "userId" | "accountId" | "source" | "matricula">): string | null {
  if (job.source === "app" && job.matricula) return `app:${job.userId}:${job.matricula}`;
  if (job.accountId) return `site:${job.accountId}`;
  return null;
}

/** Midnight ART after the first planned read (tee + 5h). Same cutoff the hourly window already uses. Not an AAG rule. */
export function absenceCutoff(playedAt: Date): Date {
  const first = new Date(playedAt.getTime() + FIRST_DELAY_MS);
  return artTeeInstant(addArtDays(artParts(first).date, 1), "00:00");
}

export type ScorecardBucket = "future" | "pending" | "absent" | "ready" | "cancelled" | "problem";

/** A read that reached the club and found no card. A failed read (last_error set, still awaiting) is not this. */
export function confirmedEmptyRead(status: FetchStatus, lastAttemptAt: string | null, lastError: string | null): boolean {
  return status === "awaiting_card" && !!lastAttemptAt && !lastError;
}

/** How the home card groups a job. The stored status does not change. */
export function scorecardPresentation(input: {
  status: FetchStatus;
  playedAt: string;
  nextAttemptAt?: string | null;
  lastAttemptAt?: string | null;
  lastError?: string | null;
  roundId?: string | null;
}, now = new Date()): { bucket: ScorecardBucket; heading: string; label: string } {
  const status = input.status;
  const played = new Date(input.playedAt);
  if (status === "complete" || input.roundId) return { bucket: "ready", heading: "Ya está", label: "La tarjeta ya está." };
  if (status === "cancelled") return { bucket: "cancelled", heading: "Otras", label: "La reserva se canceló." };
  if (status === "needs_credentials" || status === "error") {
    return { bucket: "problem", heading: "Sin confirmar", label: scorecardLabel(status, input.nextAttemptAt || null, input.lastError || null, now) };
  }
  if (status === "scheduled" && Number.isFinite(played.getTime()) && now.getTime() < played.getTime()) {
    return { bucket: "future", heading: "Próxima", label: "La salida todavía no fue. La buscamos cinco horas después." };
  }
  const empty = confirmedEmptyRead(status, input.lastAttemptAt || null, input.lastError || null);
  if (empty && Number.isFinite(played.getTime()) && now.getTime() >= absenceCutoff(played).getTime()) {
    return {
      bucket: "absent",
      heading: "No presentó",
      label: "No presentó. El club respondió y esa salida no tenía tarjeta. No es una decisión de la AAG y no cambia el hándicap ni el score. Seguimos mirando una vez por día, por si la cargan.",
    };
  }
  if (status === "stopped") {
    return { bucket: "problem", heading: "Sin confirmar", label: input.lastError || scorecardLabel(status, null, input.lastError || null, now) };
  }
  return { bucket: "pending", heading: "En curso", label: scorecardLabel(status, input.nextAttemptAt || null, input.lastError || null, now) };
}

export function scorecardLabel(status: FetchStatus, nextAttemptAt: string | null, lastError: string | null, now = new Date()): string {
  const when = nextAttemptAt ? artWhen(new Date(nextAttemptAt), now) : "";
  if (status === "scheduled") return lastError ? `${lastError} La buscamos ${when}.` : `La buscamos ${when}.`;
  if (status === "awaiting_card") return lastError ? `${lastError} Volvemos ${when}.` : `Todavía no está en el club. Volvemos ${when}.`;
  if (status === "complete") return "La tarjeta ya está.";
  if (status === "cancelled") return "La reserva se canceló.";
  if (status === "needs_credentials") return "Falta la clave guardada para buscar la tarjeta.";
  if (status === "stopped") return lastError || "Dejamos de buscar esta tarjeta automáticamente. Podés actualizar desde la app.";
  const why = lastError || "No pudimos leer el club.";
  return when ? `${why} Volvemos ${when}.` : why;
}

function artWhen(instant: Date, now: Date): string {
  const part = artParts(instant);
  const today = artParts(now).date;
  const day = part.date === today ? "hoy" : part.date === addArtDays(today, 1) ? "mañana" : `el ${part.date.slice(8, 10)}/${part.date.slice(5, 7)}`;
  return `${day} a las ${part.time}`;
}

export function blankJob(partial: Pick<FetchJob, "id" | "userId" | "playedAt" | "date"> & Partial<FetchJob>): FetchJob {
  const played = new Date(partial.playedAt);
  return {
    teeTimeId: null, liveRoundId: null, accountId: null, source: null, matricula: null, hasPassword: false,
    syncRunning: false, syncStartedAt: null, leaseHeld: false, version: 0, lastSyncAt: null, lastSyncStatus: null, time: null, clubCode: null, courseLabel: null, clubName: null,
    status: "scheduled", nextAttemptAt: nextAttempt(played, null).toISOString(), lastAttemptAt: null, attemptCount: 0,
    lastError: null, roundId: null, gone: false, ...partial,
  };
}

/** Booking moved, cancelled, came back, or the card is already stored. Does not call the club. */
export function reconcileJob(job: FetchJob, tee: TeeSnap | null, rounds: RoundHit[], now: Date): FetchJob {
  const next: FetchJob = { ...job };
  if (tee) {
    const played = artTeeInstant(tee.date, tee.time);
    next.clubName = tee.clubName ?? next.clubName;
    next.clubCode = tee.clubCode ?? next.clubCode;
    next.accountId = tee.accountId ?? next.accountId;
    next.courseLabel = tee.courseLabel;
    next.gone = tee.gone;
    if (played.getTime() !== new Date(job.playedAt).getTime() || tee.date !== job.date || tee.time !== job.time) {
      next.playedAt = played.toISOString();
      next.date = tee.date;
      next.time = tee.time;
      if (next.status !== "complete") {
        next.lastAttemptAt = null;
        next.attemptCount = 0;
        next.status = "scheduled";
        next.lastError = null;
        next.nextAttemptAt = nextAttempt(played, null).toISOString();
      }
    }
    if (tee.gone && next.status !== "complete") {
      next.status = "cancelled";
      next.lastError = null;
      return next;
    }
    if (!tee.gone && next.status === "cancelled") {
      next.status = "scheduled";
      next.lastAttemptAt = null;
      next.attemptCount = 0;
      next.lastError = null;
      next.nextAttemptAt = nextAttempt(played, null).toISOString();
    }
    if (tee.roundId) {
      next.status = "complete";
      next.roundId = tee.roundId;
      next.lastError = null;
      return next;
    }
  }
  if (next.status === "cancelled" || next.status === "complete") return next;
  const hit = classifyRounds(next, rounds);
  if (hit.roundId) {
    next.status = "complete";
    next.roundId = hit.roundId;
    next.lastError = null;
    return next;
  }
  if (next.status !== "stopped" && shouldStop(new Date(next.playedAt), next.attemptCount, now)) {
    next.status = "stopped";
    next.lastError = "Dejamos de buscar esta tarjeta automáticamente. Podés actualizar desde la app.";
  }
  return next;
}

export type SyncDisposition = "sync" | "reuse" | "defer" | "credentials" | "stop" | "skip";

export function syncDisposition(job: FetchJob, now: Date): SyncDisposition {
  if (!OPEN.includes(job.status) || job.gone) return "skip";
  if (new Date(job.nextAttemptAt).getTime() > now.getTime()) return "skip";
  if (shouldStop(new Date(job.playedAt), job.attemptCount, now)) return "stop";
  if (!job.hasPassword || !syncKey(job)) return "credentials";
  if (runningIsLive(job, now)) return "defer";
  if (job.lastSyncAt) {
    const age = now.getTime() - new Date(job.lastSyncAt).getTime();
    if (age >= 0 && age < FRESH_SYNC_MS) {
      if (job.lastSyncStatus === "ok") return "reuse";
      return "defer";
    }
  }
  return "sync";
}

export type PlanAction =
  | { kind: "sync" | "reuse"; key: string; userId: string; source: "app" | "site"; matricula: string | null; accountId: string | null; jobIds: string[] }
  | { kind: "defer" | "credentials" | "stop"; jobIds: string[]; reason: string };

/** Groups due work. A second tee on the same Golfistics login does not start a second sync. Extra logins wait for the next cron. */
export function planDue(jobs: FetchJob[], now: Date, maxSyncs = MAX_SYNCS_PER_RUN): { actions: PlanAction[]; held: string[] } {
  const ordered = jobs.slice().sort((a, b) => a.nextAttemptAt < b.nextAttemptAt ? -1 : a.nextAttemptAt > b.nextAttemptAt ? 1 : a.id < b.id ? -1 : 1);
  const actions: PlanAction[] = [];
  const syncs = new Map<string, PlanAction & { kind: "sync" }>();
  const reuses = new Map<string, PlanAction & { kind: "reuse" }>();
  const deferred: string[] = [];
  const missingPassword: string[] = [];
  const missingAccount: string[] = [];
  const stopped: string[] = [];
  const wanted: string[] = [];
  for (const job of ordered) {
    const how = syncDisposition(job, now);
    if (how === "skip") continue;
    if (how === "stop") { stopped.push(job.id); continue; }
    if (how === "credentials") { (syncKey(job) ? missingPassword : missingAccount).push(job.id); continue; }
    if (how === "defer") { deferred.push(job.id); continue; }
    const key = syncKey(job)!;
    if (how === "sync" && !syncs.has(key)) wanted.push(key);
    const existing = (how === "reuse" ? reuses : syncs).get(key);
    if (existing) { existing.jobIds.push(job.id); continue; }
    const made = {
      key, userId: job.userId, source: job.source === "app" ? "app" as const : "site" as const,
      matricula: job.matricula, accountId: job.accountId, jobIds: [job.id],
    };
    if (how === "reuse") reuses.set(key, { kind: "reuse", ...made });
    else syncs.set(key, { kind: "sync", ...made });
  }
  const allowed = new Set(wanted.slice(0, maxSyncs));
  const held: string[] = [];
  for (const key of wanted) {
    const action = syncs.get(key)!;
    if (allowed.has(key)) actions.push(action);
    else held.push(...action.jobIds);
  }
  for (const action of reuses.values()) actions.push(action);
  if (deferred.length) actions.push({ kind: "defer", jobIds: deferred, reason: SYNC_BUSY_MESSAGE });
  if (missingPassword.length) actions.push({ kind: "credentials", jobIds: missingPassword, reason: "Sin contraseña guardada: no podemos buscar la tarjeta." });
  if (missingAccount.length) actions.push({ kind: "credentials", jobIds: missingAccount, reason: "No hay una cuenta vinculada de ese club para buscar la tarjeta." });
  if (stopped.length) actions.push({ kind: "stop", jobIds: stopped, reason: "Dejamos de buscar esta tarjeta automáticamente. Podés actualizar desde la app." });
  return { actions, held };
}

export type Attempt =
  | { type: "complete"; roundId: string }
  | { type: "waiting"; message?: string }
  | { type: "error"; message: string }
  | { type: "credentials"; message: string }
  | { type: "cancelled" }
  | { type: "stopped"; message: string }
  | { type: "defer"; message: string };

export function outcomeAfterRead(job: FetchJob, rounds: RoundHit[], sync: { ok: boolean; message: string }): Attempt {
  const hit = classifyRounds(job, rounds);
  if (hit.roundId) return { type: "complete", roundId: hit.roundId };
  if (!sync.ok) return { type: "error", message: (sync.message || "No pudimos leer las tarjetas.").slice(0, 200) };
  if (hit.reason === "other_course") return { type: "waiting", message: "La tarjeta de ese día es de otra cancha. No la asociamos a esta salida." };
  if (hit.ambiguous) return { type: "waiting", message: "Hay más de una tarjeta ese día y no pudimos saber cuál es la de esta salida." };
  return { type: "waiting" };
}

export function applyAttempt(job: FetchJob, now: Date, attempt: Attempt): FetchJob {
  const next: FetchJob = { ...job };
  if (attempt.type === "defer") {
    next.lastError = attempt.message.slice(0, 200);
    return next;
  }
  if (attempt.type === "cancelled") {
    next.status = "cancelled";
    next.lastError = null;
    next.gone = true;
    return next;
  }
  if (attempt.type === "complete") {
    next.status = "complete";
    next.roundId = attempt.roundId;
    next.lastError = null;
    next.lastAttemptAt = now.toISOString();
    return next;
  }
  if (attempt.type === "stopped") {
    next.status = "stopped";
    next.lastError = attempt.message.slice(0, 200);
    return next;
  }
  const message = attempt.type === "waiting" ? attempt.message || null : attempt.message;
  const played = new Date(next.playedAt);
  const attemptCount = next.attemptCount + 1;
  if (shouldStop(played, attemptCount, now)) {
    next.status = "stopped";
    next.attemptCount = attemptCount;
    next.lastAttemptAt = now.toISOString();
    next.lastError = "Dejamos de buscar esta tarjeta automáticamente. Podés actualizar desde la app.";
    next.nextAttemptAt = nextAttempt(played, now).toISOString();
    return next;
  }
  next.attemptCount = attemptCount;
  next.lastAttemptAt = now.toISOString();
  next.nextAttemptAt = nextAttempt(played, now).toISOString();
  next.lastError = message ? message.slice(0, 200) : null;
  next.status = attempt.type === "credentials" ? "needs_credentials" : attempt.type === "error" ? "error" : "awaiting_card";
  return next;
}

export function sameSchedule(a: FetchJob, b: FetchJob): boolean {
  return a.status === b.status && a.playedAt === b.playedAt && a.date === b.date && a.time === b.time
    && a.courseLabel === b.courseLabel && a.roundId === b.roundId && a.attemptCount === b.attemptCount
    && a.lastAttemptAt === b.lastAttemptAt && a.nextAttemptAt === b.nextAttemptAt && a.lastError === b.lastError
    && a.gone === b.gone && a.accountId === b.accountId && a.clubCode === b.clubCode;
}
