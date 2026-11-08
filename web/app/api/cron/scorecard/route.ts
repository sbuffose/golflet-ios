import { timingSafeEqual } from "node:crypto";
import { ScorecardSchemaError, runScorecardFetches } from "@/lib/scorecard-fetch";

export const maxDuration = 300;

/** Every 15 minutes. Each booking is still read on its own clock: tee time + 5 hours, then hourly, then daily.
 *  This does not replace the 06:00 account refresh and it does not use that job's 20-hour skip. */
export async function GET(req: Request) {
  const want = `Bearer ${process.env.CRON_SECRET ?? ""}`, got = req.headers.get("authorization") ?? "";
  if (!process.env.CRON_SECRET || want.length !== got.length || !timingSafeEqual(Buffer.from(want), Buffer.from(got)))
    return Response.json({ error: "No autorizado" }, { status: 401 });
  try {
    const report = await runScorecardFetches();
    return Response.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ScorecardSchemaError) return Response.json({ ok: false, error: e.message }, { status: 503 });
    console.error("scorecard cron", e instanceof Error ? e.message : "unknown");
    return Response.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
