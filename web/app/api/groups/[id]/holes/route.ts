import { handle, json, requireUser, HttpError } from "@/lib/http";
import { groupHoles } from "@/lib/groups";
/** GET ?course=<course_key>&range=&year=&members= → 18-hole head-to-head (avg to par, birdies, pars per member + leaders). */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const u = await requireUser(req); const { id } = await ctx.params; const s = new URL(req.url).searchParams;
  const course = s.get("course"); if (!course || course.length > 200) throw new HttpError(400, "Elegí una cancha");
  const year = s.get("year"); if (year && !/^\d{4}$/.test(year)) throw new HttpError(400, "Año inválido");
  const members = s.get("members")?.split(",").filter(x => /^[0-9a-f-]{36}$/i.test(x)) || null;
  const range = s.get("range"); if (range && !["1m", "3m", "6m", "12m", "all"].includes(range)) throw new HttpError(400, "range inválido");
  return json(await groupHoles(id, u.id, course, year, members, s.has("range") ? range : undefined));
});
