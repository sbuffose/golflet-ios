import { handle, json } from "@/lib/http";
import { requireAdmin, audit } from "@/lib/admin";
import { adminListClubMessages, adminCreateClubMessage } from "@/lib/notifications";
import { parseClubMessage } from "@/lib/notifications-core";
/** t154u admin: GET list (with recipients/reads); POST { club_id, title, body } → sent to every player linked to that club. */
export const GET = handle(async (req: Request) => { await requireAdmin(req); return json(await adminListClubMessages()); });
export const POST = handle(async (req: Request) => {
  const u = await requireAdmin(req); const r = await adminCreateClubMessage(u.id, parseClubMessage(await req.json().catch(() => null)));
  await audit(u as any, "club_message.create", { type: "club_message", id: r.message.id }, `Mensaje de club: ${r.message.title}`); return json(r, 201);
});
