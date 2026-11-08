/** Durable scorecard reads. The cron calls `runScorecardFetches`. The app only reads `listScorecardFetches`.
 *  Scheduling rules live in scorecard-fetch-core.ts. This file loads bookings already stored by a club sync
 *  (including ones that are no longer "upcoming") and finished GPS rounds that have no booking. */
import { q } from "./db";
import { logSync } from "./sync-log";
import { syncAccount, syncAppLink, type SyncResult } from "./sync";
import {
  LOOKBACK_DAYS, MAX_SYNCS_PER_RUN, applyAttempt, artParts, artTeeInstant, blankJob, nextAttempt, outcomeAfterRead,
  planDue, reconcileJob, sameSchedule, scorecardLabel, type Attempt, type FetchJob, type FetchStatus, type RoundHit, type TeeSnap,
} from "./scorecard-fetch-core";

export class ScorecardSchemaError extends Error {
  constructor() {
    super("Falta aplicar web/db/migrations/0042_scorecard_fetch.sql antes de usar la búsqueda automática de tarjetas.");
    this.name = "ScorecardSchemaError";
  }
}

const MISSING = (e: unknown) => (e as { code?: string })?.code === "42P01" || /scorecard_fetch/.test(String((e as { message?: string })?.message || "")) && /does not exist|no existe/i.test(String((e as { message?: string })?.message || ""));

async function qry<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  try { return await q<T>(text, params); }
  catch (e) { if (MISSING(e)) throw new ScorecardSchemaError(); throw e; }
}

const iso = (v: unknown) => {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new Error("Fecha inválida en la búsqueda de tarjetas");
  return d.toISOString();
};
const day = (v: unknown) => {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return iso(v)!.slice(0, 10);
};

type AccountLink = { hasPassword: boolean; syncRunning: boolean; lastSyncAt: string | null; lastSyncStatus: string | null; source: "app" | "site" | null; matricula: string | null };

function asJob(row: any, link?: AccountLink): FetchJob {
  const source = (link?.source ?? row.source ?? null) as "app" | "site" | null;
  const matricula = link?.matricula ?? row.matricula ?? null;
  const running = link?.syncRunning ?? row.last_sync_status === "running";
  const hasPassword = link ? link.hasPassword : row.password_here === true || row.password_here === "t";
  return {
    id: String(row.id),
    userId: String(row.user_id),
    teeTimeId: row.tee_time_id ? String(row.tee_time_id) : null,
    liveRoundId: row.live_round_id ? String(row.live_round_id) : null,
    accountId: row.club_account_id ? String(row.club_account_id) : null,
    source, matricula, hasPassword, syncRunning: !!running,
    lastSyncAt: link?.lastSyncAt ?? iso(row.last_sync_at),
    lastSyncStatus: link?.lastSyncStatus ?? (row.last_sync_status ? String(row.last_sync_status) : null),
    playedAt: iso(row.played_at)!,
    date: day(row.date),
    time: row.time ? String(row.time).slice(0, 5) : null,
    clubCode: row.club_code ? String(row.club_code) : null,
    courseLabel: row.course_label ? String(row.course_label) : null,
    clubName: row.club_name ? String(row.club_name) : null,
    status: row.status as FetchStatus,
    nextAttemptAt: iso(row.next_attempt_at)!,
    lastAttemptAt: iso(row.last_attempt_at),
    attemptCount: Number(row.attempt_count) || 0,
    lastError: row.last_error ? String(row.last_error) : null,
    roundId: row.round_id ? String(row.round_id) : null,
    gone: row.gone === true || row.gone === "t",
  };
}

async function saveJob(job: FetchJob) {
  await qry(`update scorecard_fetch set club_account_id=$2, played_at=$3, date=$4, time=$5, club_code=$6, course_label=$7,
      status=$8, next_attempt_at=$9, last_attempt_at=$10, attempt_count=$11, last_error=$12, round_id=$13, locked_at=null, updated_at=now()
    where id=$1`, [
    job.id, job.accountId, job.playedAt, job.date, job.time, job.clubCode, job.courseLabel, job.status, job.nextAttemptAt,
    job.lastAttemptAt, job.attemptCount, job.lastError, job.roundId,
  ]);
  if (job.status === "complete" && job.roundId && job.teeTimeId)
    await qry(`update tee_time set round_id=$2 where id=$1 and user_id=$3 and round_id is null`, [job.teeTimeId, job.roundId, job.userId]);
  if (job.status === "complete" && job.roundId && job.liveRoundId)
    await qry(`update live_round set round_id=$2 where id=$1 and user_id=$3 and round_id is null`, [job.liveRoundId, job.roundId, job.userId]);
}

async function roundsFor(userIds: string[], dates: string[]): Promise<RoundHit[]> {
  if (!userIds.length || !dates.length) return [];
  const rows = await qry(`select r.id, r.date::text date, r.course, r.club_account_id, c.code club_code
    from round r join club_account a on a.id=r.club_account_id left join club c on c.id=a.club_id
    where a.user_id = any($1::text[]) and r.date = any($2::date[])`, [userIds, dates]);
  return rows.map((r: any) => ({ id: String(r.id), date: day(r.date), course: r.course ? String(r.course) : null, clubCode: r.club_code ? String(r.club_code) : null, accountId: r.club_account_id ? String(r.club_account_id) : null }));
}

function teeSnap(row: any): TeeSnap {
  return {
    date: day(row.date), time: String(row.time).slice(0, 5), gone: row.gone === true || row.gone === "t",
    courseLabel: row.course_label ? String(row.course_label) : null, roundId: row.round_id ? String(row.round_id) : null,
    clubName: row.club_name ? String(row.club_name) : null, clubCode: row.club_code ? String(row.club_code) : null,
    accountId: row.club_account_id ? String(row.club_account_id) : null,
  };
}

/** Insert or refresh jobs from bookings and finished GPS rounds. Bookings that already left the "upcoming" list stay. */
export async function enrollScorecardFetches(now = new Date()): Promise<{ enrolled: number; reconciled: number }> {
  let enrolled = 0, reconciled = 0;
  const tees = await qry(`select t.id, t.user_id, t.club_account_id, t.date::text date, t.time, t.course_label, t.club_name,
      (t.gone_at is not null) gone, t.round_id, c.code club_code, f.id fetch_id
    from tee_time t
    left join club_account a on a.id=t.club_account_id
    left join club c on c.id=a.club_id
    left join scorecard_fetch f on f.tee_time_id=t.id
    where t.source='club' and t.date >= ((now() at time zone 'America/Argentina/Buenos_Aires')::date - $1::int)
      and (
        f.id is null
        or (t.gone_at is not null and f.status not in ('cancelled','complete'))
        or (t.gone_at is null and f.status='cancelled')
        or t.date is distinct from f.date or t.time is distinct from f.time
        or t.course_label is distinct from f.course_label
        or (t.round_id is not null and f.status <> 'complete')
        or (f.status in ('scheduled','awaiting_card','error','needs_credentials') and exists (
          select 1 from round r where r.club_account_id=t.club_account_id and r.date=t.date))
      )
    limit 500`, [LOOKBACK_DAYS]);
  const teeDates = [...new Set(tees.map((t: any) => day(t.date)))];
  const teeUsers = [...new Set(tees.map((t: any) => String(t.user_id)))];
  const teeRounds = await roundsFor(teeUsers, teeDates);
  for (const row of tees) {
    const snap = teeSnap(row);
    const played = artTeeInstant(snap.date, snap.time);
    if (!row.fetch_id) {
      const job = reconcileJob(blankJob({
        id: "new", userId: String(row.user_id), playedAt: played.toISOString(), date: snap.date, time: snap.time,
        teeTimeId: String(row.id), accountId: snap.accountId, clubCode: snap.clubCode, courseLabel: snap.courseLabel,
        clubName: snap.clubName, gone: snap.gone, nextAttemptAt: nextAttempt(played, null).toISOString(),
      }), snap, teeRounds, now);
      await qry(`insert into scorecard_fetch (user_id, tee_time_id, club_account_id, played_at, date, time, club_code, course_label, status, next_attempt_at, last_attempt_at, attempt_count, last_error, round_id)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        on conflict (tee_time_id) where tee_time_id is not null do nothing`, [
        job.userId, job.teeTimeId, job.accountId, job.playedAt, job.date, job.time, job.clubCode, job.courseLabel, job.status,
        job.nextAttemptAt, job.lastAttemptAt, job.attemptCount, job.lastError, job.roundId,
      ]);
      enrolled++;
      if (job.status === "complete" && job.roundId)
        await qry(`update tee_time set round_id=$2 where id=$1 and user_id=$3 and round_id is null`, [job.teeTimeId, job.roundId, job.userId]);
      continue;
    }
    const [current] = await qry(`select f.*, (t.gone_at is not null) gone, t.club_name, c.code club_code, a.source, a.matricula, a.last_sync_at, a.last_sync_status,
        (a.password_enc is not null) password_here
      from scorecard_fetch f
      left join tee_time t on t.id=f.tee_time_id
      left join club_account a on a.id=f.club_account_id
      left join club c on c.id=a.club_id
      where f.id=$1`, [row.fetch_id]);
    if (!current) continue;
    const before = asJob(current);
    const after = reconcileJob(before, snap, teeRounds, now);
    if (sameSchedule(before, after)) continue;
    await saveJob(after);
    reconciled++;
  }

  const lives = await qry(`select l.id, l.user_id, l.started_at, l.date::text date, l.club_code, l.course, l.round_id,
      (select a.id from club_account a join club c on c.id=a.club_id where a.user_id=l.user_id and c.code=l.club_code
        order by a.last_sync_at desc nulls last limit 1) club_account_id
    from live_round l
    where l.ended_at is not null
      and l.date >= ((now() at time zone 'America/Argentina/Buenos_Aires')::date - $1::int)
      and not exists (select 1 from scorecard_fetch f where f.live_round_id=l.id)
      and not exists (
        select 1 from tee_time t
        join club_account a on a.id=t.club_account_id
        join club c on c.id=a.club_id
        where t.user_id=l.user_id and t.source='club' and t.gone_at is null and t.date=l.date
          and (l.club_code is null or c.code=l.club_code))
    limit 200`, [LOOKBACK_DAYS]);
  for (const row of lives) {
    const playedAt = iso(row.started_at);
    if (!playedAt) continue;
    const parts = artParts(new Date(playedAt));
    await qry(`insert into scorecard_fetch (user_id, live_round_id, club_account_id, played_at, date, time, club_code, course_label, status, next_attempt_at, round_id)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      on conflict (live_round_id) where live_round_id is not null do nothing`, [
      row.user_id, row.id, row.club_account_id, playedAt, day(row.date), parts.time, row.club_code, row.course,
      row.round_id ? "complete" : "scheduled", nextAttempt(new Date(playedAt), null).toISOString(), row.round_id,
    ]);
    enrolled++;
  }
  return { enrolled, reconciled };
}

async function loadDue(now: Date): Promise<FetchJob[]> {
  const rows = await qry(`select f.*, (t.gone_at is not null) gone, t.club_name, coalesce(c.code, f.club_code) club_code,
      a.source, a.matricula, a.last_sync_at, a.last_sync_status, (a.password_enc is not null) password_here
    from scorecard_fetch f
    left join tee_time t on t.id=f.tee_time_id
    left join club_account a on a.id=f.club_account_id
    left join club c on c.id=a.club_id
    where f.status in ('scheduled','awaiting_card','needs_credentials','error')
      and f.next_attempt_at <= $1
      and (f.locked_at is null or f.locked_at < $1::timestamptz - interval '20 minutes')
    order by f.next_attempt_at
    limit 80`, [now.toISOString()]);
  const jobs = rows.map((row: any) => asJob(row));
  const app = jobs.filter(j => j.source === "app" && j.matricula);
  if (!app.length) return jobs;
  const links = await qry(`select user_id, matricula, bool_or(password_enc is not null) has_password,
      bool_or(last_sync_status='running') sync_running, max(last_sync_at) last_sync_at,
      (array_agg(last_sync_status order by last_sync_at desc nulls last))[1] last_status
    from club_account where source='app' and user_id = any($1::text[]) and matricula = any($2::text[])
    group by user_id, matricula`, [[...new Set(app.map(j => j.userId))], [...new Set(app.map(j => j.matricula!))]]);
  const by = new Map<string, any>(links.map((r: any) => [`${r.user_id}:${r.matricula}`, r]));
  return jobs.map(job => {
    if (job.source !== "app" || !job.matricula) return job;
    const link = by.get(`${job.userId}:${job.matricula}`);
    if (!link) return job;
    const last = iso(link.last_sync_at);
    const running = link.sync_running === true || link.sync_running === "t";
    return {
      ...job,
      hasPassword: link.has_password === true || link.has_password === "t" || job.hasPassword,
      syncRunning: running || job.syncRunning,
      lastSyncAt: last && (!job.lastSyncAt || last > job.lastSyncAt) ? last : job.lastSyncAt,
      lastSyncStatus: running ? "running" : (link.last_status ? String(link.last_status) : job.lastSyncStatus),
    };
  });
}

export type ScorecardRunReport = {
  ok: true;
  enrolled: number;
  reconciled: number;
  due: number;
  synced: number;
  reused: number;
  completed: number;
  waiting: number;
  needs_credentials: number;
  errors: number;
  deferred: number;
  stopped: number;
  cancelled: number;
  held: number;
  messages: string[];
};

type SyncFn = (userId: string, matricula: string | null, accountId: string | null, source: "app" | "site", budgetMs: number) => Promise<SyncResult>;

/** Reads due bookings. One Golfistics login per player per run. Does not use the 20-hour daily throttle. */
export async function runScorecardFetches(opts: { now?: Date; budgetMs?: number; maxSyncs?: number; sync?: SyncFn } = {}): Promise<ScorecardRunReport> {
  const now = opts.now ?? new Date();
  const budgetMs = opts.budgetMs ?? 240_000;
  const started = Date.now();
  const report: ScorecardRunReport = {
    ok: true, enrolled: 0, reconciled: 0, due: 0, synced: 0, reused: 0, completed: 0, waiting: 0,
    needs_credentials: 0, errors: 0, deferred: 0, stopped: 0, cancelled: 0, held: 0, messages: [],
  };
  const enrolled = await enrollScorecardFetches(now);
  report.enrolled = enrolled.enrolled;
  report.reconciled = enrolled.reconciled;
  const jobs = await loadDue(now);
  const byId = new Map(jobs.map(j => [j.id, j]));
  const plan = planDue(jobs, now, opts.maxSyncs ?? MAX_SYNCS_PER_RUN);
  report.due = jobs.length;
  report.held = plan.held.length;
  const sync: SyncFn = opts.sync ?? (async (userId, matricula, accountId, source, budget) => {
    const t0 = Date.now();
    try {
      const result = source === "app" && matricula
        ? await syncAppLink(userId, matricula, { budgetMs: budget })
        : await syncAccount(accountId!, undefined, budget);
      await logSync(userId, "scorecard", result, t0);
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message.slice(0, 200) : "Error interno";
      await logSync(userId, "scorecard", null, t0, message);
      report.messages.push(message);
      return { ok: false, new_rounds: 0, updated: 0, pending: 0, message };
    }
  });

  for (const action of plan.actions) {
    if (action.kind === "defer" || action.kind === "credentials" || action.kind === "stop") {
      for (const id of action.jobIds) {
        const job = byId.get(id);
        if (!job) continue;
        const attempt: Attempt = action.kind === "defer" ? { type: "defer", message: action.reason }
          : action.kind === "credentials" ? { type: "credentials", message: action.reason }
          : { type: "stopped", message: action.reason };
        const updated = applyAttempt(job, now, attempt);
        await saveJob(updated);
        if (action.kind === "defer") report.deferred++;
        else if (action.kind === "credentials") report.needs_credentials++;
        else report.stopped++;
      }
      continue;
    }
    if (Date.now() - started > budgetMs) { report.held += action.jobIds.length; report.messages.push("Se cortó por tiempo. El próximo ciclo sigue."); continue; }
    const group = action.jobIds.map(id => byId.get(id)).filter((j): j is FetchJob => !!j);
    let read: { ok: boolean; message: string } = { ok: true, message: "" };
    if (action.kind === "sync") {
      const locked = await qry(`update scorecard_fetch set locked_at=now() where id = any($1::uuid[])
        and (locked_at is null or locked_at < now() - interval '20 minutes') returning id`, [action.jobIds]);
      const owned = new Set(locked.map((r: any) => String(r.id)));
      if (!owned.size) { report.deferred += action.jobIds.length; continue; }
      const remaining = Math.max(15_000, budgetMs - (Date.now() - started));
      read = await sync(action.userId, action.matricula, action.accountId, action.source, Math.min(70_000, remaining));
      report.synced++;
      for (const id of action.jobIds) if (!owned.has(id)) report.deferred++;
      const mine = group.filter(j => owned.has(j.id));
      const rounds = await roundsFor([...new Set(mine.map(j => j.userId))], [...new Set(mine.map(j => j.date))]);
      for (const job of mine) await finishJob(job, rounds, read, now, report);
      continue;
    }
    report.reused++;
    const rounds = await roundsFor([...new Set(group.map(j => j.userId))], [...new Set(group.map(j => j.date))]);
    for (const job of group) await finishJob(job, rounds, read, now, report);
  }
  return report;
}

async function finishJob(job: FetchJob, rounds: RoundHit[], read: { ok: boolean; message: string }, now: Date, report: ScorecardRunReport) {
  const updated = applyAttempt(job, now, outcomeAfterRead(job, rounds, read));
  await saveJob(updated);
  if (updated.status === "complete") report.completed++;
  else if (updated.status === "awaiting_card") report.waiting++;
  else if (updated.status === "error") report.errors++;
  else if (updated.status === "stopped") report.stopped++;
  else if (updated.status === "cancelled") report.cancelled++;
  if (updated.lastError && updated.status === "error") report.messages.push(`${job.clubName || job.clubCode || "club"}: ${updated.lastError}`.slice(0, 240));
}

export async function listScorecardFetches(userId: string, now = new Date()) {
  const rows = await qry(`select f.id, f.tee_time_id, f.live_round_id, f.date::text date, f.time, f.club_code, f.course_label,
      f.status, f.next_attempt_at, f.last_attempt_at, f.attempt_count, f.last_error, f.round_id, f.played_at,
      coalesce(t.club_name, cl.name, '') club_name
    from scorecard_fetch f
    left join tee_time t on t.id=f.tee_time_id
    left join lateral (select name from club where code=f.club_code order by seeded desc nulls last, id limit 1) cl on true
    where f.user_id=$1 and f.played_at > now() - interval '21 days'
      and (
        f.status in ('scheduled','awaiting_card','needs_credentials','error','stopped')
        or (f.status='complete' and f.updated_at > now() - interval '3 days')
        or (f.status='cancelled' and f.updated_at > now() - interval '2 days')
      )
    order by f.played_at desc
    limit 40`, [userId]);
  return rows.map((r: any) => ({
    id: String(r.id),
    tee_time_id: r.tee_time_id ? String(r.tee_time_id) : null,
    live_round_id: r.live_round_id ? String(r.live_round_id) : null,
    date: day(r.date),
    time: r.time ? String(r.time).slice(0, 5) : null,
    club_name: String(r.club_name || ""),
    course_label: r.course_label ? String(r.course_label) : null,
    club_code: r.club_code ? String(r.club_code) : null,
    status: String(r.status),
    next_attempt_at: iso(r.next_attempt_at),
    last_attempt_at: iso(r.last_attempt_at),
    attempt_count: Number(r.attempt_count) || 0,
    last_error: r.last_error ? String(r.last_error) : null,
    round_id: r.round_id ? String(r.round_id) : null,
    label: scorecardLabel(r.status, iso(r.next_attempt_at), r.last_error ? String(r.last_error) : null, now),
  }));
}
