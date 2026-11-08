/** One expiring lease per Golfistics login, shared by the scorecard cron and by sync.ts.
 *  The token is the fence: a worker whose lease expired cannot release or extend it.
 *  If the table is not there yet, claim reports `unavailable` and the daily sync keeps its previous behavior.
 *  The scorecard cron treats that as "migration not applied" and does not start a second login. */
import { randomUUID } from "node:crypto";

export const LEASE_MS = 20 * 60 * 1000;
export const SYNC_BUSY_MESSAGE = "Hay una actualización en curso. Reintentamos en el próximo ciclo.";

export type Sql = (text: string, params?: unknown[]) => Promise<any[]>;

export function isUndefinedTable(e: unknown, relation: string): boolean {
  const err = e as { code?: string; message?: string };
  return err?.code === "42P01" && new RegExp(relation, "i").test(String(err?.message || ""));
}

export function isUndefinedColumn(e: unknown, column: string): boolean {
  const err = e as { code?: string; message?: string };
  return err?.code === "42703" && new RegExp(column, "i").test(String(err?.message || ""));
}

export function newLeaseToken(): string {
  return randomUUID();
}

export type LeaseClaim = "acquired" | "held" | "unavailable";

/** Takes the login lease, or steals it when it has already expired. A live lease returns `held` and changes nothing. */
export async function claimLoginLease(sql: Sql, key: string, token: string, userId: string, jobId: string | null): Promise<LeaseClaim> {
  try {
    const rows = await sql(
      `insert into scorecard_sync_lease (sync_key, token, user_id, job_id, acquired_at, expires_at)
       values ($1, $2, $3, $4, now(), now() + interval '20 minutes')
       on conflict (sync_key) do update
         set token = excluded.token, user_id = excluded.user_id, job_id = excluded.job_id,
             acquired_at = now(), expires_at = excluded.expires_at
         where scorecard_sync_lease.expires_at < now()
       returning token`,
      [key, token, userId, jobId],
    );
    if (!rows.length) return "held";
    return String(rows[0].token) === token ? "acquired" : "held";
  } catch (e) {
    if (isUndefinedTable(e, "scorecard_sync_lease")) return "unavailable";
    throw e;
  }
}

/** Deletes the row only when the token still matches. A stale worker deletes nothing. */
export async function releaseLoginLease(sql: Sql, key: string, token: string): Promise<boolean> {
  try {
    const rows = await sql(`delete from scorecard_sync_lease where sync_key=$1 and token=$2 returning sync_key`, [key, token]);
    return rows.length > 0;
  } catch (e) {
    if (isUndefinedTable(e, "scorecard_sync_lease")) return false;
    throw e;
  }
}
