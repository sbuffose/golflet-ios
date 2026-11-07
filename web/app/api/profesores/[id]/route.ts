import { handle, json, requireUser, HttpError } from "@/lib/http";
import { setPerms, unlinkProfesor } from "@/lib/profesores";
type C = { params: Promise<{ id: string }> };
/** PATCH { can_view_metrics?, can_hear_audio? } (player only, audited). DELETE → unlink. */
export const PATCH = handle(async (req: Request, ctx: C) => {
  const u = await requireUser(req); const { id } = await ctx.params; let b: any; try { b = await req.json(); } catch { throw new HttpError(400, "JSON inválido"); }
  return json({ profesor: await setPerms(u.id, id, b) });
});
export const DELETE = handle(async (req: Request, ctx: C) => { const u = await requireUser(req); const { id } = await ctx.params; return json(await unlinkProfesor(u.id, id)); });
