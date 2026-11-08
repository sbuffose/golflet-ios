import { handle, json, HttpError } from "@/lib/http";
import { audit, requireAdmin } from "@/lib/admin";
import { q } from "@/lib/db";
/** DELETE → removes a club account (its sessions, credentials and role go with it). The pins it loaded stay (set_by becomes null). */
export const DELETE = handle(async (req: Request, ctx: { params: Promise<{ userId: string }> }) => {
  const me = await requireAdmin(req); const { userId } = await ctx.params;
  const [r] = await q(`select cs.user_id, u.email from club_staff cs join "user" u on u.id=cs.user_id where cs.user_id=$1`, [userId]);
  if (!r) throw new HttpError(404, "Cuenta de club no encontrada");
  await q(`delete from "user" where id=$1 and id like 'club-%'`, [userId]);
  await audit(me, "club_staff.delete", { type: "user", id: userId }, `Cuenta de club borrada (${r.email})`);
  return json({ ok: true });
});
