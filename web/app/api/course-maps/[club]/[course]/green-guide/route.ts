import { handle, requireUser } from "@/lib/http";
import { getGreenGuide } from "@/lib/green-guide";
import { torneoNow, TORNEO_LOCKED_MSG } from "@/lib/torneo";

type C = { params: Promise<{ club: string; course: string }> };
/** t190u: GET → the coarse green guide of a course (from the club's printed course guide: shape, falls, levels, banks, bunkers, OB) or 404.
 *  In modo torneo (Regla 4.3) the greens are removed (greens: {}, greens_locked: true) like the green slope viewer; the hole part (markers, hazards) stays. API_v5 §63. */
export const GET = handle(async (req: Request, ctx: C) => {
  const u = await requireUser(req);
  const { club, course } = await ctx.params;
  const g = getGreenGuide(decodeURIComponent(club), decodeURIComponent(course));
  if (!g) return Response.json({ error: "Sin guía de greens para esta cancha" }, { status: 404 });
  if ((await torneoNow(u.id)).locks.green_slopes) return Response.json({ ...g, greens: {}, greens_locked: true, note: TORNEO_LOCKED_MSG }, { headers: { "cache-control": "no-store" } });
  return Response.json(g, { headers: { "cache-control": "private, no-cache" } });
});
