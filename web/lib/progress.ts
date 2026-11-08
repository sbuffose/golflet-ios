import { q } from "./db";
import type { OnProgress, Progress } from "./sync";

/**
 * Real sync progress, keyed by a client-generated UUID (so it works before the account exists).
 * Writes are throttled (~2/s) and serialized; stage changes always write.
 */
export function progressWriter(userId: string, id: unknown, club: string) {
  const ok = typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id);
  let last: Progress | null = null, lastAt = 0, chain: Promise<unknown> = Promise.resolve(), timer: ReturnType<typeof setTimeout> | null = null;
  const write = (p: Progress, finished = false, error: string | null = null) => {
    if (!ok) return chain;
    chain = chain.then(() => q(`update sync_progress set stage=$3, done=$4, total=$5, list_total=$6, finished=$7, error=$8,
      club=coalesce($9, club), club_index=coalesce($10, club_index), club_count=coalesce($11, club_count),
      club_code=case when $9::text is null then club_code else $12 end, stats=coalesce($13::jsonb, stats), updated_at=now()
      where id=$1 and user_id=$2`, [id, userId, p.stage, p.done ?? null, p.total ?? null, p.list_total ?? null, finished, error,
        p.club ?? null, p.club_index ?? null, p.club_count ?? null, p.club_code ?? null, p.stats ? JSON.stringify(p.stats) : null])).catch(() => {});
    lastAt = Date.now(); return chain;
  };
  const on: OnProgress = p => {
    const stageChange = !last || last.stage !== p.stage || last.club !== p.club; last = p;
    if (timer) { clearTimeout(timer); timer = null; }
    if (stageChange || Date.now() - lastAt > 450) write(p);
    else timer = setTimeout(() => last && write(last), 450);
  };
  return {
    async start() {
      if (!ok) return;
      await q(`delete from sync_progress where updated_at < now() - interval '1 day'`).catch(() => {});
      await q(`insert into sync_progress (id, user_id, club, stage) values ($1,$2,$3,'connect') on conflict (id) do nothing`, [id, userId, club]);
    },
    on,
    async finish(error?: string) { if (timer) clearTimeout(timer); await write(last ?? { stage: "done" }, true, error ?? null); },
  };
}
