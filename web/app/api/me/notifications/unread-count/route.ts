import { handle, json, requireUser } from "@/lib/http";
import { unreadCount } from "@/lib/notifications";
import { badgeLabel } from "@/lib/notifications-core";
/** t154u: GET → { unread_count, badge } (badge: "" | "1".."9" | "9+"). Cheap: for the avatar badge. */
export const GET = handle(async (req: Request) => { const u = await requireUser(req); const n = await unreadCount(u.id); return json({ unread_count: n, badge: badgeLabel(n) }); });
