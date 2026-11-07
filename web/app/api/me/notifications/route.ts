import { handle, json, requireUser } from "@/lib/http";
import { listNotifications } from "@/lib/notifications";
/** t154u: GET → { unread_count, items: [{ id, kind, title, body, created_at, read, group?, club? }] } newest first (max 50). */
export const GET = handle(async (req: Request) => { const u = await requireUser(req); return json(await listNotifications(u.id)); });
