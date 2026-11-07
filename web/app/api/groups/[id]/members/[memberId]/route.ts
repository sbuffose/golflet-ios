import { handle, json, requireUser, HttpError } from "@/lib/http";
import { removeMember, setRole } from "@/lib/groups";
type C = { params: Promise<{ id: string; memberId: string }> };
/** DELETE (admins) → removes a member or revokes a pending invitation. */
export const DELETE = handle(async (req: Request, ctx: C) => {
  const u = await requireUser(req); const { id, memberId } = await ctx.params; return json(await removeMember(u.id, id, memberId));
});
/** PATCH { role: "admin" | "member" } (admins) → make admin / remove admin status. The group always keeps ≥1 admin. */
export const PATCH = handle(async (req: Request, ctx: C) => {
  const u = await requireUser(req); const { id, memberId } = await ctx.params; let b: any; try { b = await req.json(); } catch { throw new HttpError(400, "JSON inválido"); }
  return json(await setRole(u.id, id, memberId, b?.role));
});
