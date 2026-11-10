import { handle, json } from "@/lib/http";
import { requireEditor } from "@/lib/admin";
import { priorityCourses, TRACE_IMAGERY } from "@/lib/trace-review";

/** The three courses already in the repo. Not a world list. Tracking does not wait for the rest. */
export const GET = handle(async (req: Request) => {
  await requireEditor(req);
  const courses = priorityCourses();
  return json({
    imagery: TRACE_IMAGERY,
    scope: "Solo estas canchas de Argentina. El resto se suma cuando haya una fuente, no antes.",
    courses,
    ayuda: courses.flatMap(c => c.holes.filter(h => h.state === "necesito_una_mano").map(h => ({ club_code: c.club_code, course: c.course, title: c.title, hole: h.hole, detail: h.detail, audience: h.audience }))),
  });
});
