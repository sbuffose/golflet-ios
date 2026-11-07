import { q } from "@/lib/db";
import { syncAccount, syncAppLink } from "@/lib/sync";
import { timingSafeEqual } from "node:crypto";
import { logSync } from "@/lib/sync-log";

export const maxDuration = 300;

/** Daily Vercel Cron: refresh every saved link (App links sync all their clubs), oldest first, within the time budget. */
export async function GET(req: Request) {
  const want = `Bearer ${process.env.CRON_SECRET ?? ""}`, got = req.headers.get("authorization") ?? "";
  if (!process.env.CRON_SECRET || want.length !== got.length || !timingSafeEqual(Buffer.from(want), Buffer.from(got)))
    return Response.json({ error: "No autorizado" }, { status: 401 });
  const t0 = Date.now();
  // one job per Golfistics App link (user + matrícula: every club in one login); legacy site accounts upgrade to the App inside syncAccount
  const accts = await q(`select min(id::text) as id, source, user_id, matricula from club_account
    where user_id is not null and password_enc is not null
    group by case when source='app' then 'app:' || user_id || ':' || matricula else 'site:' || id::text end, source, user_id, matricula
    having bool_or(last_sync_at is null) or min(last_sync_at) < now() - interval '20 hours'
    order by bool_or(last_sync_at is null) desc, min(last_sync_at) limit 50`);
  let done = 0, failed = 0;
  for (const a of accts) {
    if (Date.now() - t0 > 230_000) break;
    const budgetMs = Math.max(20_000, 230_000 - (Date.now() - t0));
    const t1 = Date.now();
    try {
      const r = a.source === "app" ? await syncAppLink(a.user_id, a.matricula, { budgetMs }) : await syncAccount(a.id, undefined, budgetMs);
      r.ok ? done++ : failed++;
      await logSync(a.user_id, "cron", r, t1);
    } catch { failed++; await logSync(a.user_id, "cron", null, t1, "Error interno"); }
  }
  return Response.json({ candidates: accts.length, done, failed });
}
