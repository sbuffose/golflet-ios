import { handle, json, requireUser, HttpError } from "@/lib/http";
import { getCourseMap } from "@/lib/course-map";

/** t171u: GET /api/course-maps/:club/:course[?hole=N][&wind_from=deg&wind_kmh=N] → detailed holes (+ wind per hole). API_v5 §60. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ club: string; course: string }> }) => {
  await requireUser(req);
  const { club, course } = await ctx.params;
  if (!/^\d{1,6}$/.test(club) || !/^[\p{L}\d ._-]{1,40}$/u.test(decodeURIComponent(course))) throw new HttpError(400, "Cancha inválida");
  const u = new URL(req.url), n = (k: string) => { const v = u.searchParams.get(k); if (v == null || v === "") return null; const x = Number(v); if (!Number.isFinite(x)) throw new HttpError(400, `${k} inválido`); return x; };
  const hole = n("hole"), windFrom = n("wind_from"), windKmh = n("wind_kmh");
  if (hole != null && (!Number.isInteger(hole) || hole < 1 || hole > 36)) throw new HttpError(400, "Hoyo inválido");
  if ((windFrom == null) !== (windKmh == null)) throw new HttpError(400, "Mandá wind_from y wind_kmh juntos");
  if (windKmh != null && (windKmh < 0 || windKmh > 200)) throw new HttpError(400, "wind_kmh inválido");
  const m = await getCourseMap(club, decodeURIComponent(course), { hole, windFrom, windKmh });
  if (!m) throw new HttpError(404, "Todavía no tenemos el mapa detallado de esta cancha");
  if (hole != null && !m.holes.length) throw new HttpError(404, "Hoyo no encontrado");
  return json(m);
});
