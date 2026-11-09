import { handle, json, requireUser, HttpError } from "@/lib/http";
import { groupCompare, deleteGroup, renameGroup } from "@/lib/groups";

type C = { params: Promise<{ id: string }> };
const list = (v: string | null) => (v ? v.split(",").filter(x => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 12) : null);
/** GET ?range=1m|3m|6m|12m|all&year=2026&course=<course_key>&members=<id,id> → leaderboard + trend + par types + putting + shared clubs
 *  (accepted members only; each member's "Qué comparto" applied: hidden metrics are omitted and listed in member.hidden). */
export const GET = handle(async (req: Request, ctx: C) => {
  const u = await requireUser(req); const { id } = await ctx.params; const s = new URL(req.url).searchParams;
  const year = s.get("year"); if (year && !/^\d{4}$/.test(year)) throw new HttpError(400, "Año inválido");
  const range = s.get("range"); if (range && !["1m", "3m", "6m", "12m", "all"].includes(range)) throw new HttpError(400, "range inválido (1m, 3m, 6m, 12m o all)");
  // range / course omitted → the member's saved view (GET/PUT /api/groups/:id/view); course=all → every course
  return json(await groupCompare(id, u.id, { year, range: s.has("range") ? range : undefined, course: s.has("course") ? s.get("course")!.slice(0, 200) : undefined, members: list(s.get("members")) }));
});
/** PATCH { name } (admins). */
export const PATCH = handle(async (req: Request, ctx: C) => {
  const u = await requireUser(req); const { id } = await ctx.params; let b: any; try { b = await req.json(); } catch { throw new HttpError(400, "JSON inválido"); }
  return json(await renameGroup(u.id, id, b?.name));
});
/** DELETE answers 409. A group stays; each player leaves. */
export const DELETE = handle(async (req: Request, ctx: C) => {
  const u = await requireUser(req); const { id } = await ctx.params;
  return json(await deleteGroup(u.id, id));
});
