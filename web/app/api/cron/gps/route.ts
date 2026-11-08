import { timingSafeEqual } from "node:crypto";
import { runDaily } from "@/lib/gps-daily";

export const maxDuration = 300;

/**
 * Daily Vercel Cron (09:00 UTC = 06:00 ART): re-reads greens (read-only) for courses with "Lectura diaria 6:00" on,
 * only when the global switch in Ajustes is on. `?course=<course_id>` limits it to one enabled course (manual test).
 */
export async function GET(req: Request) {
  const want = `Bearer ${process.env.CRON_SECRET ?? ""}`, got = req.headers.get("authorization") ?? "";
  if (!process.env.CRON_SECRET || want.length !== got.length || !timingSafeEqual(Buffer.from(want), Buffer.from(got)))
    return Response.json({ error: "No autorizado" }, { status: 401 });
  const only = new URL(req.url).searchParams.get("course");
  if (only && !/^\d{1,5}-[a-z0-9-]{1,80}$/.test(only)) return Response.json({ error: "Cancha inválida" }, { status: 400 });
  const r = await runDaily({ only });
  return Response.json({ ok: true, ...r }, { headers: { "Cache-Control": "no-store" } });
}
