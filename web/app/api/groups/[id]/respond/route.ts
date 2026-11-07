import { handle, json, requireUser, HttpError } from "@/lib/http";
import { respond } from "@/lib/groups";
/** POST { accept: true|false } (invitee). Nothing is shared until you accept. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const u = await requireUser(req); const { id } = await ctx.params; let b: any; try { b = await req.json(); } catch { throw new HttpError(400, "JSON inválido"); }
  return json(await respond(u.id, id, b?.accept === true));
});
