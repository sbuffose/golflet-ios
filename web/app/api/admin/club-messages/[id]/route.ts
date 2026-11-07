import { handle, json, HttpError } from "@/lib/http";
import { requireAdmin, audit } from "@/lib/admin";
import { adminWithdrawClubMessage } from "@/lib/notifications";
/** t154u admin: DELETE = "Retirar" (players stop seeing it; the row stays for the audit). */
export const DELETE = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const u = await requireAdmin(req); const { id } = await ctx.params; if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "No encontrado");
  const m = await adminWithdrawClubMessage(id); if (!m) throw new HttpError(404, "No encontrado");
  await audit(u as any, "club_message.withdraw", { type: "club_message", id }, `Mensaje retirado: ${m.title}`); return json({ ok: true, message: m });
});
