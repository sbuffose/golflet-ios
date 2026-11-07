import { handle, json, requireUser } from "@/lib/http";
import { auth } from "@/lib/auth";
import { previewInvite, acceptInvite } from "@/lib/profesores";
import { linkRateLimit } from "@/lib/group-share";
type C = { params: Promise<{ token: string }> };
/** GET (rate-limited, no session needed) → { player_first_name, state, signed_in, is_profesor }. POST (profesor session) → link. */
export const GET = handle(async (req: Request, ctx: C) => {
  const { token } = await ctx.params; await linkRateLimit(req);
  const s = await auth.api.getSession({ headers: req.headers }).catch(() => null);
  return json(await previewInvite(token, s?.user?.id ?? null));
});
export const POST = handle(async (req: Request, ctx: C) => { const u = await requireUser(req); const { token } = await ctx.params; await linkRateLimit(req); return json(await acceptInvite(token, u.id)); });
