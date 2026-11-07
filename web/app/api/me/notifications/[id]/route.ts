import { handle, json, requireUser, HttpError } from "@/lib/http";
import { getNotification } from "@/lib/notifications";
import { parseId } from "@/lib/notifications-core";
/** t154u: GET one item (for its own page). Does NOT mark it read; the client POSTs /read when it opens the page. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const u = await requireUser(req); const { id } = await ctx.params; const p = parseId(decodeURIComponent(id)); if (!p) throw new HttpError(404, "No encontrado");
  const n = await getNotification(u.id, `${p.kind}:${p.ref}`); if (!n) throw new HttpError(404, "No encontrado"); return json({ notification: n });
});
