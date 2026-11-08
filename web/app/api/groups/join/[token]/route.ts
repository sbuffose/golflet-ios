import { handle, json, requireUser, HttpError } from "@/lib/http";
import { auth } from "@/lib/auth";
import { previewByToken, respondByToken } from "@/lib/groups";
import { linkRateLimit, validToken } from "@/lib/group-share";
type C = { params: Promise<{ token: string }> };
/** GET (no session needed, rate-limited) → { group:{name, photo_url, owner, members, expires_at}, signed_in, status, full } */
export const GET = handle(async (req: Request, ctx: C) => {
  const { token } = await ctx.params; if (!validToken(token)) throw new HttpError(404, "Link inválido");
  await linkRateLimit(req);
  const s = await auth.api.getSession({ headers: req.headers }).catch(() => null);
  return json(await previewByToken(token, s?.user?.id ?? null));
});
/** POST { accept: true | false } (session required) → joins the group as a member. Audited. */
export const POST = handle(async (req: Request, ctx: C) => {
  const u = await requireUser(req); const { token } = await ctx.params; if (!validToken(token)) throw new HttpError(404, "Link inválido");
  await linkRateLimit(req);
  let b: any; try { b = await req.json(); } catch { throw new HttpError(400, "JSON inválido"); }
  if (typeof b?.accept !== "boolean") throw new HttpError(400, "accept tiene que ser true o false");
  return json(await respondByToken(token, u.id, b.accept));
});
