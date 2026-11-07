import { handle, json } from "@/lib/http";
import { adminBody, requireAdmin } from "@/lib/admin";
import { grantRole, listRoles } from "@/lib/admin-content";

export const GET = handle(async (req: Request) => { const u = await requireAdmin(req); return json({ roles: await listRoles(), me: u.id }); });
/** { email | user_id, role: "admin" | "editor" } */
export const PUT = handle(async (req: Request) => {
  const u = await requireAdmin(req);
  const r = await grantRole(u, await adminBody(req));
  return json({ ...r, roles: await listRoles() });
});
