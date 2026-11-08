import { handle, json, requireUser, HttpError } from "@/lib/http";
import { courseBenchmark } from "@/lib/benchmark";
/** GET ?course=<course_key>[&tee=Azul][&metric=gross|net|hole&hole=N] → anonymous benchmark vs players within ±3 of your HI (same course + tee).
 *  ≥5 players and ≥20 rounds required (else sufficient:false + sample counts). metric adds a binned distribution. */
export const GET = handle(async (req: Request) => {
  const u = await requireUser(req); const s = new URL(req.url).searchParams;
  const course = s.get("course"); if (!course) throw new HttpError(400, "Falta course");
  const metric = s.get("metric"), hole = s.get("hole") ? Number(s.get("hole")) : null;
  if (hole != null && (!Number.isInteger(hole) || hole < 1 || hole > 18)) throw new HttpError(400, "hole inválido");
  return json(await courseBenchmark(u.id, u.email, course, s.get("tee")?.slice(0, 40) || null, metric ? { metric, hole } : undefined));
});
