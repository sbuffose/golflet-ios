import { handle, json, requireUser, HttpError } from "@/lib/http";
import { teeOptions } from "@/lib/tee-times";

/** ?club_key=&course_id=&tee= → tees of that course with the player's course/playing handicap (empty when we have no slope/rating). */
export const GET = handle(async (req: Request) => {
  const user = await requireUser(req); const u = new URL(req.url);
  const ck = u.searchParams.get("club_key") || ""; if (!/^[a-z0-9-]{2,60}$/.test(ck)) throw new HttpError(400, "club_key inválido");
  const cidRaw = u.searchParams.get("course_id"), cid = cidRaw ? Number(cidRaw) : null; if (cid != null && !(Number.isInteger(cid) && cid > 0)) throw new HttpError(400, "course_id inválido");
  return json(await teeOptions(user.id, ck, cid, u.searchParams.get("tee")));
});
