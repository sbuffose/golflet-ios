import { handle, json, requireUser, HttpError } from "@/lib/http";
import { addSession } from "@/lib/profesor-sessions";
/** Profesor logs a class: { date: YYYY-MM-DD, worked_on, recommendations? }. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const u = await requireUser(req); const { id } = await ctx.params; let b: any; try { b = await req.json(); } catch { throw new HttpError(400, "JSON inválido"); }
  return json({ session: await addSession(u.id, id, b) }, 201);
});
