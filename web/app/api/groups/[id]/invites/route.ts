import { handle, json, requireUser, HttpError } from "@/lib/http";
import { invite } from "@/lib/groups";
/** POST { matricula } (owner) → invites a player; a matrícula that isn't on Golflet yet stays pending until their first sign-in. 20/day. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const u = await requireUser(req); const { id } = await ctx.params; let b: any; try { b = await req.json(); } catch { throw new HttpError(400, "JSON inválido"); }
  return json(await invite(u.id, id, b?.matricula), 201);
});
