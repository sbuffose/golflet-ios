import { handle, json, requireUser } from "@/lib/http";
import { listCourseMaps } from "@/lib/course-map";

/** t171u: which detailed course maps exist (open data). API_v5 §60. */
export const GET = handle(async (req: Request) => {
  await requireUser(req);
  return json({ maps: await listCourseMaps() });
});
