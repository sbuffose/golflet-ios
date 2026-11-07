import { handle, json, requireUser } from "@/lib/http";
import { markRead } from "@/lib/notifications";
/** t154u: POST { ids: ["club_message:<uuid>", "group_invite:<uuid>"] } or { all: true } → { ok, marked, unread_count }. Idempotent. */
export const POST = handle(async (req: Request) => { const u = await requireUser(req); return json(await markRead(u.id, await req.json().catch(() => null))); });
