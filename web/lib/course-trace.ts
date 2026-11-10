/** Admin save for a satellite trace. Migration 0046 is prepared and not applied.
 *  Preview does not write. A missing table is 503 and stores nothing. */
import { q } from "./db";
import { HttpError } from "./http-error";
import { isUndefinedTable } from "./scorecard-lease";
import { courseEvidence, publicTrace, validateTrace, type CourseCoverage } from "./trace-review";

export function missingTraceTable(err: unknown): boolean {
  return isUndefinedTable(err, "course_trace");
}

const UNAVAILABLE = "El trazado necesita la migración 0046, que todavía no está aplicada. No se guardó nada.";

export async function readAcceptedTraces(club: string, course: string) {
  try {
    return await q(`select hole, status, tee, green, note from course_trace where club_code=$1 and lower(course)=lower($2) and status='accepted'`, [club, course]);
  } catch (e) {
    if (missingTraceTable(e)) return [];
    throw e;
  }
}

export function mergeTrace(hole: any, trace: { status: string; tee: any; green: any; note: string } | null) {
  const next = publicTrace(hole, trace);
  if (next.used !== "satellite_visual") return hole;
  return { ...hole, line: hole.line?.length ? hole.line : (next.tee ? [next.tee] : hole.line), green: { ...(hole.green || {}), ...next.green } };
}

export async function saveTrace(userId: string, coverage: CourseCoverage, hole: number, raw: unknown) {
  const evidence = coverage.holes.find(h => h.hole === hole);
  if (!evidence) throw new HttpError(404, "Ese hoyo no está en esta cancha.");
  const verdict = validateTrace(evidence, (raw || {}) as any);
  if (!verdict.ok) throw new HttpError(400, verdict.errors[0]);
  if ((raw as any)?.confirm !== true) return { saved: false as const, preview: verdict.draft };
  try {
    await q(`insert into course_trace (club_code, course, hole, status, confidence, parent, tee, green, note, edited_by, updated_at)
      values ($1,$2,$3,$4,'satellite_visual',$5,$6,$7,$8,$9,now())
      on conflict (club_code, course, hole) do update set status=excluded.status, parent=excluded.parent, tee=excluded.tee, green=excluded.green, note=excluded.note, edited_by=excluded.edited_by, updated_at=now()`,
      [coverage.club_code, coverage.course, hole, verdict.draft.status, verdict.draft.parent, verdict.draft.tee ? JSON.stringify(verdict.draft.tee) : null, verdict.draft.green ? JSON.stringify(verdict.draft.green) : null, verdict.draft.note, userId]);
  } catch (e) {
    if (missingTraceTable(e)) throw new HttpError(503, UNAVAILABLE);
    throw e;
  }
  return { saved: true as const, preview: verdict.draft };
}
