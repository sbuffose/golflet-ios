import { handle, json, requireUser, HttpError } from "@/lib/http";
import { getGreenSurface } from "@/lib/green-surface";
import { torneoNow } from "@/lib/torneo";

/** t181u: GET /api/course-maps/:club/:course/greens/:hole → green elevation grid (real survey only). 404 when the green has not been surveyed. API_v5 §60. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ club: string; course: string; hole: string }> }) => {
  const user = await requireUser(req);
  const { club, course, hole } = await ctx.params;
  const n = Number(hole), name = decodeURIComponent(course);
  if (!/^\d{1,6}$/.test(club) || !/^[\p{L}\d ._-]{1,40}$/u.test(name) || !Number.isInteger(n) || n < 1 || n > 36) throw new HttpError(400, "Green inválido");
  if ((await torneoNow(user.id)).locks.green_slopes) throw new HttpError(423, "Modo torneo: las pendientes del green no se pueden consultar durante la ronda (Regla 4.3).");
  const s = await getGreenSurface(club, name, n);
  if (!s) throw new HttpError(404, "Todavía no relevamos las pendientes de este green");
  return json(s);
});
