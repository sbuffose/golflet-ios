import { handle, json, requireUser } from "@/lib/http";
import { paceFor, resolveRef } from "@/lib/pace";
/** GET ?course_id=118-jockey-azul | ?club_id=&course= [&modality=medal|stableford|match|fourball][&players=1..4] → estimate + per-hole timeline. ESTIMATES, not club-official. */
export const GET = handle(async (req: Request) => {
  await requireUser(req); const s = new URL(req.url).searchParams; const r = await resolveRef(s);
  return json(await paceFor(r.clubId, r.course, s.get("modality") ?? "medal", s.get("players") ?? 4));
});
