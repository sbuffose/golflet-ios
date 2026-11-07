import { handle } from "@/lib/http";
import { auditAuth } from "@/lib/admin";
import { clearCookie, endSession, getAdminSession, sameOrigin } from "@/lib/admin-auth";

/** POST /api/admin/auth/logout → ends this admin session (the player session is untouched). */
export const POST = handle(async (req: Request) => {
  sameOrigin(req);
  const s = await getAdminSession(req);
  await endSession(req);
  if (s) await auditAuth("admin.logout", { id: s.user_id, email: s.email }, "Salió del panel");
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store", "Set-Cookie": clearCookie() } });
});
