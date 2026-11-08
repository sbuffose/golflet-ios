import { handle, json } from "@/lib/http";
import { requireAdmin } from "@/lib/admin";
import { listUsers } from "@/lib/admin-content";

export const GET = handle(async (req: Request) => {
  await requireAdmin(req); const sp = new URL(req.url).searchParams;
  return json({ users: await listUsers(sp.get("q"), sp.get("test") === "1") });
});
