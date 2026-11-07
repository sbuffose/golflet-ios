/** Sync history for the admin metrics (sync_progress is pruned after a day). Only user-facing messages are stored; never claves or cookies. */
import { q } from "./db";

type R = { ok: boolean; new_rounds?: number; updated?: number; pending?: number; message?: string; clubs?: { club_name?: string; ok: boolean; new_rounds: number; message?: string }[] };
export async function logSync(userId: string, trigger: "link" | "manual" | "cron", r: R | null, t0: number, failMessage?: string) {
  try {
    await q(`insert into sync_log (user_id, trigger, ok, new_rounds, updated, pending, clubs, message, duration_ms) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [userId, trigger, !!r?.ok, r?.new_rounds ?? 0, r?.updated ?? 0, r?.pending ?? 0,
        JSON.stringify((r?.clubs || []).map(c => ({ club_name: c.club_name ?? null, ok: c.ok, new_rounds: c.new_rounds, message: String(c.message ?? "").slice(0, 200) }))),
        String(r?.message ?? failMessage ?? "").slice(0, 400), Date.now() - t0]);
  } catch (e) { console.error("sync_log failed", e instanceof Error ? e.message : "unknown"); }
}
