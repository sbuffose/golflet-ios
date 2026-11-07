import { handle, json, requireUser } from "@/lib/http";
import { q } from "@/lib/db";
import { body } from "@/lib/accounts";
import { editRecap, ownRecap, shape } from "@/lib/recap";

export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req); const { id } = await ctx.params;
  return json({ recap: shape(await ownRecap(user.id, id)) });
});
/** { transcript?, summary?, mistakes?:[{category,hole,text}], positives?:[{hole,text}], restructure?: bool } */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req); const { id } = await ctx.params;
  return json({ recap: await editRecap(user.id, id, await body(req)) });
});
export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req); const { id } = await ctx.params;
  await ownRecap(user.id, id); await q(`delete from round_recap where id=$1 and user_id=$2`, [id, user.id]);
  return json({ ok: true });
});
