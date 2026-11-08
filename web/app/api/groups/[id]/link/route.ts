import { handle, json, requireUser, HttpError } from "@/lib/http";
import { loadGroup, setLink } from "@/lib/groups";
import { linkInfo } from "@/lib/group-share";
type C = { params: Promise<{ id: string }> };
/** GET (admins) → { link: { url, enabled, expires_at, expired, whatsapp_url } } */
export const GET = handle(async (req: Request, ctx: C) => {
  const u = await requireUser(req); const { id } = await ctx.params; const { group } = await loadGroup(id, u.id, "admin"); return json({ link: linkInfo(group) });
});
/** POST { action: "regenerate" | "disable" | "enable" | "expiry", expires_days?: 1..365 | null } (admins). Regenerating kills the old link. */
export const POST = handle(async (req: Request, ctx: C) => {
  const u = await requireUser(req); const { id } = await ctx.params; let b: any; try { b = await req.json(); } catch { throw new HttpError(400, "JSON inválido"); }
  return json(await setLink(u.id, id, b));
});
