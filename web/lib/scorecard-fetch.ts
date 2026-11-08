/** Durable scorecard reads. The cron calls `runScorecardFetches`. The app only reads `listScorecardFetches`.
 *  Scheduling rules live in scorecard-fetch-core.ts. This file loads bookings already stored by a club sync
 *  (including ones that are no longer "upcoming") and finished GPS rounds that have no booking. */
import { q } from "./db";
import { logSync } from "./sync-log";
import { syncAccount, syncAppLink, type SyncResult } from "./sync";
import { claimLoginLease, isUndefinedColumn, isUndefinedTable, newLeaseToken, releaseLoginLease, type Sql } from "./scorecard-lease";
import {
  LOOKBACK_DAYS, MAX_SYNCS_PER_RUN, SYNC_BUSY_MESSAGE, applyAttempt, artParts, artTeeInstant, blankJob, nextAttempt, outcomeAfterRead,
  planDue, reconcileJob, sameSchedule, scorecardLabel, shouldStop, syncDisposition, syncKey, type Attempt, type FetchJob, type FetchStatus, type RoundHit, type TeeSnap,
} from "./scorecard-fetch-core";

export class ScorecardSchemaError extends Error {
  constructor() {
    super("Falta aplicar web/db/migrations/0042_scorecard_fetch.sql antes de usar la búsqueda automática de tarjetas.");
    this.name = "ScorecardSchemaError";
  }
}

function wrapSql(sql?: Sql): Sql {
  const run = sql ?? ((text, params) => q(text, params ?? []));
  return async (text, params = []) => {
    try { return await run(text, params); }
    catch (e) {
      if (isUndefinedTable(e, "scorecard_fetch") || isUndefinedTable(e, "scorecard_sync_lease")) throw new ScorecardSchemaError();
      if (isUndefinedColumn(e, "lock_token") || isUndefinedColumn(e, "version")) throw new ScorecardSchemaError();
      throw e;
    }
  };
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

type AccountLink = { hasPassword: boolean; syncRunning: boolean; syncStartedAt: string | null; lastSyncAt: string | null; lastSyncStatus: string | null; source: "app" | "site" | null; matricula: string | null };

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
    syncStartedAt: link?.syncStartedAt ?? iso(row.last_sync_started_at),
    leaseHeld: false,
    version: Number(row.version) || 0,
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

const JOB_SET = `club_account_id=$2, played_at=$3, date=$4, time=$5, club_code=$6, course_label=$7,
      status=$8, next_attempt_at=$9, last_attempt_at=$10, attempt_count=$11, last_error=$12, round_id=$13,
      lock_token=null, locked_at=null, version=version+1, updated_at=now()`;

function jobParams(job: FetchJob): unknown[] {
  return [
    job.id, job.accountId, job.playedAt, job.date, job.time, job.clubCode, job.courseLabel, job.status, job.nextAttemptAt,
    job.lastAttemptAt, job.attemptCount, job.lastError, job.roundId,
  ];
}

/** Writes a job the worker still owns. A replaced token matches nothing: the stale worker is fenced. */
async function saveOwned(sql: Sql, job: FetchJob, token: string): Promise<boolean> {
  const rows = await sql(`update scorecard_fetch set ${JOB_SET} where id=$1 and lock_token=$14 returning id`, [...jobParams(job), token]);
  if (!rows.length) return false;
  await linkRound(sql, job);
  return true;
}

/** Enrollment and deferral. A live lock, or a row whose version moved, is left untouched. */
async function saveIfIdle(sql: Sql, job: FetchJob): Promise<boolean> {
  const rows = await sql(`update scorecard_fetch set ${JOB_SET}
      where id=$1 and version=$14 and (lock_token is null or locked_at < now() - interval '20 minutes')
      returning id`, [...jobParams(job), job.version]);
  if (!rows.length) return false;
  await linkRound(sql, job);
  return true;
}

async function linkRound(sql: Sql, job: FetchJob) {
  if (job.status !== "complete" || !job.roundId) return;
  if (job.teeTimeId) await sql(`update tee_time set round_id=$2 where id=$1 and user_id=$3 and round_id is null`, [job.teeTimeId, job.roundId, job.userId]);
  if (job.liveRoundId) await sql(`update live_round set round_id=$2 where id=$1 and user_id=$3 and round_id is null`, [job.liveRoundId, job.roundId, job.userId]);
}

async function releaseJobs(sql: Sql, ids: string[], token: string) {
  if (!ids.length) return;
  await sql(`update scorecard_fetch set lock_token=null, locked_at=null where id = any($1::uuid[]) and lock_token=$2`, [ids, token]);
}

const EXECUTABLE = ["scheduled", "awaiting_card", "needs_credentials", "error"];

/** Claims only the rows that are still the version we loaded, still executable, still due, and still inside 14 days.
 *  The returned rows are the database rows after the claim, not the group snapshot from load. */
async function claimJobs(sql: Sql, jobs: FetchJob[], token: string, now: Date): Promise<FetchJob[]> {
  if (!jobs.length) return [];
  const rows = await sql(`update scorecard_fetch f set lock_token=$3, locked_at=now(), version=f.version+1, updated_at=now()
    from unnest($1::uuid[], $2::int[]) as obs(id, version)
    where f.id = obs.id
      and f.version = obs.version
      and f.status = any($4::text[])
      and f.next_attempt_at <= $5::timestamptz
      and f.played_at > $5::timestamptz - interval '14 days'
      and (f.lock_token is null or f.locked_at < now() - interval '20 minutes')
    returning f.*`, [jobs.map(j => j.id), jobs.map(j => j.version), token, EXECUTABLE, now.toISOString()]);
  return rows.map((row: any) => asJob(row));
}

async function accountRows(sql: Sql, ids: string[]): Promise<any[]> {
  if (!ids.length) return [];
  const text = (started: boolean) => `select id, source, matricula, last_sync_at, last_sync_status,
      ${started ? "last_sync_started_at" : "null::timestamptz last_sync_started_at"},
      (password_enc is not null) password_here
    from club_account where id = any($1::uuid[])`;
  try { return await sql(text(true), [ids]); }
  catch (e) {
    if (!isUndefinedColumn(e, "last_sync_started_at")) throw e;
    return sql(text(false), [ids]);
  }
}

/** Account password, matricula, and running clock as they are now. The load snapshot is not reused. */
async function reloadAccounts(sql: Sql, jobs: FetchJob[]): Promise<FetchJob[]> {
  const rows = await accountRows(sql, [...new Set(jobs.map(j => j.accountId).filter((id): id is string => !!id))]);
  const by = new Map(rows.map(row => [String(row.id), row]));
  const linked = jobs.map(job => {
    const row = job.accountId ? by.get(job.accountId) : undefined;
    if (!row) return { ...job, hasPassword: false, leaseHeld: false };
    const source = row.source === "app" || row.source === "site" ? row.source : null;
    return {
      ...job, leaseHeld: false, source, matricula: row.matricula ? String(row.matricula) : null,
      hasPassword: row.password_here === true || row.password_here === "t",
      syncRunning: row.last_sync_status === "running",
      syncStartedAt: iso(row.last_sync_started_at),
      lastSyncAt: iso(row.last_sync_at),
      lastSyncStatus: row.last_sync_status ? String(row.last_sync_status) : null,
    };
  });
  const app = linked.filter(j => j.source === "app" && j.matricula);
  if (!app.length) return linked.map(j => ({ ...j, leaseHeld: false }));
  const linkSql = (started: boolean) => `select user_id, matricula, bool_or(password_enc is not null) has_password,
      bool_or(last_sync_status='running') sync_running, max(last_sync_at) last_sync_at,
      ${started ? "max(last_sync_started_at) sync_started" : "null::timestamptz sync_started"},
      (array_agg(last_sync_status order by last_sync_at desc nulls last))[1] last_status
    from club_account where source='app' and user_id = any($1::text[]) and matricula = any($2::text[])
    group by user_id, matricula`;
  let links: any[];
  try { links = await sql(linkSql(true), [[...new Set(app.map(j => j.userId))], [...new Set(app.map(j => j.matricula!))]]); }
  catch (e) {
    if (!isUndefinedColumn(e, "last_sync_started_at")) throw e;
    links = await sql(linkSql(false), [[...new Set(app.map(j => j.userId))], [...new Set(app.map(j => j.matricula!))]]);
  }
  const agg = new Map<string, any>(links.map(row => [`${row.user_id}:${row.matricula}`, row]));
  return linked.map(job => {
    if (job.source !== "app" || !job.matricula) return { ...job, leaseHeld: false };
    const link = agg.get(`${job.userId}:${job.matricula}`);
    if (!link) return { ...job, leaseHeld: false };
    const running = link.sync_running === true || link.sync_running === "t";
    const last = iso(link.last_sync_at);
    return {
      ...job, leaseHeld: false,
      hasPassword: link.has_password === true || link.has_password === "t" || job.hasPassword,
      syncRunning: running || job.syncRunning,
      syncStartedAt: iso(link.sync_started) ?? (running ? job.syncStartedAt : null),
      lastSyncAt: last && (!job.lastSyncAt || last > job.lastSyncAt) ? last : job.lastSyncAt,
      lastSyncStatus: running ? "running" : (link.last_status ? String(link.last_status) : job.lastSyncStatus),
    };
  });
}

/** The booking or the finished round moved, was cancelled, or already has a card. The loaded job is then obsolete. */
async function targetAgrees(sql: Sql, job: FetchJob, now: Date): Promise<boolean> {
  if (!EXECUTABLE.includes(job.status) || job.gone) return false;
  if (new Date(job.nextAttemptAt).getTime() > now.getTime()) return false;
  if (shouldStop(new Date(job.playedAt), job.attemptCount, now)) return false;
  if (job.teeTimeId) {
    const [tee] = await sql(`select date::text date, time, course_label, club_account_id, (gone_at is not null) gone, round_id
      from tee_time where id=$1 and user_id=$2`, [job.teeTimeId, job.userId]);
    if (!tee) return false;
    const gone = tee.gone === true || tee.gone === "t";
    if (gone || tee.round_id) return false;
    if (day(tee.date) !== job.date || String(tee.time).slice(0, 5) !== job.time) return false;
    if ((tee.course_label ? String(tee.course_label) : null) !== job.courseLabel) return false;
    if ((tee.club_account_id ? String(tee.club_account_id) : null) !== job.accountId) return false;
  }
  if (job.liveRoundId) {
    const [live] = await sql(`select date::text date, club_code, course from live_round where id=$1 and user_id=$2`, [job.liveRoundId, job.userId]);
    if (!live) return false;
    if (day(live.date) !== job.date) return false;
    if ((live.club_code ? String(live.club_code) : null) !== job.clubCode) return false;
    if ((live.course ? String(live.course) : null) !== job.courseLabel) return false;
  }
  return true;
}

async function roundsFor(sql: Sql, userIds: string[], dates: string[]): Promise<RoundHit[]> {
  if (!userIds.length || !dates.length) return [];
  const rows = await sql(`select r.id, a.user_id, r.date::text date, r.course, r.club_account_id, c.code club_code
    from round r join club_account a on a.id=r.club_account_id left join club c on c.id=a.club_id
    where a.user_id = any($1::text[]) and r.date = any($2::date[])`, [userIds, dates]);
  return rows.map((r: any) => ({
    id: String(r.id), userId: String(r.user_id), date: day(r.date), course: r.course ? String(r.course) : null,
    clubCode: r.club_code ? String(r.club_code) : null, accountId: r.club_account_id ? String(r.club_account_id) : null,
  }));
}

function teeSnap(row: any): TeeSnap {
  return {
    date: day(row.date), time: String(row.time).slice(0, 5), gone: row.gone === true || row.gone === "t",
    courseLabel: row.course_label ? String(row.course_label) : null, roundId: row.round_id ? String(row.round_id) : null,
    clubName: row.club_name ? String(row.club_name) : null, clubCode: row.club_code ? String(row.club_code) : null,
    accountId: row.club_account_id ? String(row.club_account_id) : null,
  };
}

/** Insert or refresh jobs from bookings and finished GPS rounds. Bookings that already left the "upcoming" list stay.
 *  An insert that conflicts does nothing. A refresh writes only when the row is still the version we read and nobody holds a live lock. */
export async function enrollScorecardFetches(now = new Date(), sql: Sql = wrapSql()): Promise<{ enrolled: number; reconciled: number }> {
  let enrolled = 0, reconciled = 0;
  const tees = await sql(`select t.id, t.user_id, t.club_account_id, t.date::text date, t.time, t.course_label, t.club_name,
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
  const teeRounds = await roundsFor(sql, teeUsers, teeDates);
  for (const row of tees) {
    const snap = teeSnap(row);
    const played = artTeeInstant(snap.date, snap.time);
    if (!row.fetch_id) {
      const job = reconcileJob(blankJob({
        id: "new", userId: String(row.user_id), playedAt: played.toISOString(), date: snap.date, time: snap.time,
        teeTimeId: String(row.id), accountId: snap.accountId, clubCode: snap.clubCode, courseLabel: snap.courseLabel,
        clubName: snap.clubName, gone: snap.gone, nextAttemptAt: nextAttempt(played, null).toISOString(),
      }), snap, teeRounds, now);
      const inserted = await sql(`insert into scorecard_fetch (user_id, tee_time_id, club_account_id, played_at, date, time, club_code, course_label, status, next_attempt_at, last_attempt_at, attempt_count, last_error, round_id)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        on conflict (tee_time_id) where tee_time_id is not null do nothing
        returning id`, [
        job.userId, job.teeTimeId, job.accountId, job.playedAt, job.date, job.time, job.clubCode, job.courseLabel, job.status,
        job.nextAttemptAt, job.lastAttemptAt, job.attemptCount, job.lastError, job.roundId,
      ]);
      if (!inserted.length) continue;
      enrolled++;
      if (job.status === "complete" && job.roundId)
        await sql(`update tee_time set round_id=$2 where id=$1 and user_id=$3 and round_id is null`, [job.teeTimeId, job.roundId, job.userId]);
      continue;
    }
    const [current] = await sql(`select f.*, (t.gone_at is not null) gone, t.club_name, c.code club_code, a.source, a.matricula, a.last_sync_at, a.last_sync_status,
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
    if (await saveIfIdle(sql, after)) reconciled++;
  }

  const liveSql = (origin: boolean) => `select l.id, l.user_id, l.started_at, l.date::text date, l.club_code, l.course, l.round_id,
      (select a.id from club_account a join club c on c.id=a.club_id where a.user_id=l.user_id and c.code=l.club_code
        order by a.last_sync_at desc nulls last limit 1) club_account_id
    from live_round l
    where l.ended_at is not null
      ${origin ? "and coalesce(l.origin, 'live') = 'live'" : ""}
      and l.date >= ((now() at time zone 'America/Argentina/Buenos_Aires')::date - $1::int)
      and not exists (select 1 from scorecard_fetch f where f.live_round_id=l.id)
      and not exists (
        select 1 from tee_time t
        join club_account a on a.id=t.club_account_id
        join club c on c.id=a.club_id
        where t.user_id=l.user_id and t.source='club' and t.gone_at is null and t.date=l.date
          and (l.club_code is null or c.code=l.club_code))
    limit 200`;
  let lives: any[];
  try { lives = await sql(liveSql(true), [LOOKBACK_DAYS]); }
  catch (e) {
    if (!isUndefinedColumn(e, "origin")) throw e;
    lives = await sql(liveSql(false), [LOOKBACK_DAYS]);
  }
  for (const row of lives) {
    const playedAt = iso(row.started_at);
    if (!playedAt) continue;
    const parts = artParts(new Date(playedAt));
    const inserted = await sql(`insert into scorecard_fetch (user_id, live_round_id, club_account_id, played_at, date, time, club_code, course_label, status, next_attempt_at, round_id)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      on conflict (live_round_id) where live_round_id is not null do nothing
      returning id`, [
      row.user_id, row.id, row.club_account_id, playedAt, day(row.date), parts.time, row.club_code, row.course,
      row.round_id ? "complete" : "scheduled", nextAttempt(new Date(playedAt), null).toISOString(), row.round_id,
    ]);
    if (inserted.length) enrolled++;
  }
  return { enrolled, reconciled };
}

async function loadDue(sql: Sql, now: Date): Promise<FetchJob[]> {
  const dueSql = (started: boolean) => `select f.*, (t.gone_at is not null) gone, t.club_name, coalesce(c.code, f.club_code) club_code,
      a.source, a.matricula, a.last_sync_at, a.last_sync_status, ${started ? "a.last_sync_started_at" : "null::timestamptz last_sync_started_at"},
      (a.password_enc is not null) password_here
    from scorecard_fetch f
    left join tee_time t on t.id=f.tee_time_id
    left join club_account a on a.id=f.club_account_id
    left join club c on c.id=a.club_id
    where f.status in ('scheduled','awaiting_card','needs_credentials','error')
      and f.next_attempt_at <= $1
      and (f.locked_at is null or f.locked_at < $1::timestamptz - interval '20 minutes')
    order by f.next_attempt_at
    limit 80`;
  let rows: any[];
  try { rows = await sql(dueSql(true), [now.toISOString()]); }
  catch (e) {
    if (!isUndefinedColumn(e, "last_sync_started_at")) throw e;
    rows = await sql(dueSql(false), [now.toISOString()]);
  }
  let jobs = rows.map((row: any) => asJob(row));
  const app = jobs.filter(j => j.source === "app" && j.matricula);
  if (app.length) {
    const linkSql = (started: boolean) => `select user_id, matricula, bool_or(password_enc is not null) has_password,
        bool_or(last_sync_status='running') sync_running, max(last_sync_at) last_sync_at,
        ${started ? "max(last_sync_started_at) sync_started" : "null::timestamptz sync_started"},
        (array_agg(last_sync_status order by last_sync_at desc nulls last))[1] last_status
      from club_account where source='app' and user_id = any($1::text[]) and matricula = any($2::text[])
      group by user_id, matricula`;
    let links: any[];
    try { links = await sql(linkSql(true), [[...new Set(app.map(j => j.userId))], [...new Set(app.map(j => j.matricula!))]]); }
    catch (e) {
      if (!isUndefinedColumn(e, "last_sync_started_at")) throw e;
      links = await sql(linkSql(false), [[...new Set(app.map(j => j.userId))], [...new Set(app.map(j => j.matricula!))]]);
    }
    const by = new Map<string, any>(links.map((r: any) => [`${r.user_id}:${r.matricula}`, r]));
    jobs = jobs.map(job => {
      if (job.source !== "app" || !job.matricula) return job;
      const link = by.get(`${job.userId}:${job.matricula}`);
      if (!link) return job;
      const last = iso(link.last_sync_at);
      const running = link.sync_running === true || link.sync_running === "t";
      return {
        ...job,
        hasPassword: link.has_password === true || link.has_password === "t" || job.hasPassword,
        syncRunning: running || job.syncRunning,
        syncStartedAt: iso(link.sync_started) ?? (running ? job.syncStartedAt : null),
        lastSyncAt: last && (!job.lastSyncAt || last > job.lastSyncAt) ? last : job.lastSyncAt,
        lastSyncStatus: running ? "running" : (link.last_status ? String(link.last_status) : job.lastSyncStatus),
      };
    });
  }
  const held = await sql(`select sync_key from scorecard_sync_lease where expires_at > now()`);
  const keys = new Set(held.map((r: any) => String(r.sync_key)));
  return jobs.map(job => ({ ...job, leaseHeld: keys.has(syncKey(job) || "") }));
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
  /** A write lost the compare-and-swap. The row was left with whoever still owns it. */
  fenced: number;
  messages: string[];
};

type SyncFn = (userId: string, matricula: string | null, accountId: string | null, source: "app" | "site", budgetMs: number, leaseToken: string) => Promise<SyncResult>;

/** Reads due bookings. One Golfistics login per player per run. Does not use the 20-hour daily throttle. */
export async function runScorecardFetches(opts: { now?: Date; budgetMs?: number; maxSyncs?: number; sync?: SyncFn; sql?: Sql } = {}): Promise<ScorecardRunReport> {
  const now = opts.now ?? new Date();
  const budgetMs = opts.budgetMs ?? 240_000;
  const sql = wrapSql(opts.sql);
  const started = Date.now();
  const report: ScorecardRunReport = {
    ok: true, enrolled: 0, reconciled: 0, due: 0, synced: 0, reused: 0, completed: 0, waiting: 0,
    needs_credentials: 0, errors: 0, deferred: 0, stopped: 0, cancelled: 0, held: 0, fenced: 0, messages: [],
  };
  const enrolled = await enrollScorecardFetches(now, sql);
  report.enrolled = enrolled.enrolled;
  report.reconciled = enrolled.reconciled;
  const jobs = await loadDue(sql, now);
  const byId = new Map(jobs.map(j => [j.id, j]));
  const plan = planDue(jobs, now, opts.maxSyncs ?? MAX_SYNCS_PER_RUN);
  report.due = jobs.length;
  report.held = plan.held.length;
  const sync: SyncFn = opts.sync ?? (async (userId, matricula, accountId, source, budget, leaseToken) => {
    const t0 = Date.now();
    try {
      const result = source === "app" && matricula
        ? await syncAppLink(userId, matricula, { budgetMs: budget, leaseToken })
        : await syncAccount(accountId!, undefined, budget, undefined, leaseToken ? { token: leaseToken } : undefined);
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
        const wrote = await saveIfIdle(sql, updated);
        if (!wrote) { report.fenced++; continue; }
        if (action.kind === "defer") report.deferred++;
        else if (action.kind === "credentials") report.needs_credentials++;
        else report.stopped++;
      }
      continue;
    }
    if (action.kind !== "sync" && action.kind !== "reuse") continue;
    const work = action;
    if (Date.now() - started > budgetMs) { report.held += work.jobIds.length; report.messages.push("Se cortó por tiempo. El próximo ciclo sigue."); continue; }
    const group = work.jobIds.map(id => byId.get(id)).filter((j): j is FetchJob => !!j);
    let read: SyncResult = { ok: true, new_rounds: 0, updated: 0, pending: 0, message: "" };
    const leaseToken = newLeaseToken();
    const lease = await claimLoginLease(sql, work.key, leaseToken, work.userId, work.jobIds[0] ?? null);
    if (lease === "unavailable") throw new ScorecardSchemaError();
    if (lease === "held") { report.deferred += work.jobIds.length; continue; }
    const jobToken = newLeaseToken();
    try {
      const observed = group.filter(job => job.version > 0);
      report.fenced += group.length - observed.length;
      const claimed = await claimJobs(sql, observed, jobToken, now);
      report.fenced += observed.length - claimed.length;
      if (!claimed.length) continue;
      const current = await reloadAccounts(sql, claimed);
      const fresh: FetchJob[] = [];
      for (const job of current) {
        if (syncKey(job) !== work.key || !(await targetAgrees(sql, job, now))) {
          await releaseJobs(sql, [job.id], jobToken);
          report.fenced++;
          continue;
        }
        const how = syncDisposition(job, now);
        if (how !== "sync" && how !== "reuse") {
          const attempt: Attempt = how === "defer" ? { type: "defer", message: SYNC_BUSY_MESSAGE }
            : how === "credentials" ? { type: "credentials", message: job.hasPassword ? "No hay una cuenta vinculada de ese club para buscar la tarjeta." : "Sin contraseña guardada: no podemos buscar la tarjeta." }
            : how === "stop" ? { type: "stopped", message: "Dejamos de buscar esta tarjeta automáticamente. Podés actualizar desde la app." }
            : { type: "defer", message: SYNC_BUSY_MESSAGE };
          if (how === "skip") { await releaseJobs(sql, [job.id], jobToken); report.fenced++; continue; }
          const wrote = await saveOwned(sql, applyAttempt(job, now, attempt), jobToken);
          if (!wrote) report.fenced++;
          else if (how === "defer") report.deferred++;
          else if (how === "credentials") report.needs_credentials++;
          else report.stopped++;
          continue;
        }
        fresh.push(job);
      }
      if (!fresh.length) continue;
      const syncing = fresh.some(job => syncDisposition(job, now) === "sync");
      if (syncing) {
        const lead = fresh.find(job => syncDisposition(job, now) === "sync")!;
        const remaining = Math.max(15_000, budgetMs - (Date.now() - started));
        read = await sync(lead.userId, lead.matricula, lead.accountId, lead.source === "app" ? "app" : "site", Math.min(70_000, remaining), leaseToken);
        if (read.busy) {
          await releaseJobs(sql, fresh.map(job => job.id), jobToken);
          report.deferred += fresh.length;
          continue;
        }
        report.synced++;
      } else report.reused++;
      const rounds = await roundsFor(sql, [...new Set(fresh.map(j => j.userId))], [...new Set(fresh.map(j => j.date))]);
      for (const job of fresh) await finishJob(sql, job, rounds, read, now, report, jobToken);
    } finally {
      await releaseLoginLease(sql, work.key, leaseToken);
    }
  }
  return report;
}

async function finishJob(sql: Sql, job: FetchJob, rounds: RoundHit[], read: { ok: boolean; message: string }, now: Date, report: ScorecardRunReport, token: string) {
  const updated = applyAttempt(job, now, outcomeAfterRead(job, rounds, read));
  const wrote = await saveOwned(sql, updated, token);
  if (!wrote) { report.fenced++; return; }
  if (updated.status === "complete") report.completed++;
  else if (updated.status === "awaiting_card") report.waiting++;
  else if (updated.status === "error") report.errors++;
  else if (updated.status === "stopped") report.stopped++;
  else if (updated.status === "cancelled") report.cancelled++;
  if (updated.lastError && updated.status === "error") report.messages.push(`${job.clubName || job.clubCode || "club"}: ${updated.lastError}`.slice(0, 240));
}

export async function listScorecardFetches(userId: string, now = new Date(), sql: Sql = wrapSql()) {
  const rows = await sql(`select f.id, f.tee_time_id, f.live_round_id, f.date::text date, f.time, f.club_code, f.course_label,
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
