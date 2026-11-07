import { handle, json, requireUser } from "@/lib/http";
import { q } from "@/lib/db";
import { body, ownAccount } from "@/lib/accounts";
import { listAccounts } from "@/lib/data";

/** { forget_password: true } removes the stored Golfistics password. */
export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req); const { id } = await ctx.params;
  const acc = await ownAccount(user.id, id);
  const b = await body<{ forget_password?: boolean }>(req);
  // App-source: the clave is shared by every club of the link
  if (b.forget_password) await q(acc.source === "app"
    ? `update club_account set password_enc=null where user_id=$2 and source='app' and matricula=(select matricula from club_account where id=$1)`
    : `update club_account set password_enc=null where id=$1 and user_id=$2`, [id, user.id]);
  return json({ accounts: await listAccounts(user.id) });
});

/** Unlink a club: removes its rounds and the notes on them. App-source: unlinks the whole Golfistics App link (every club), since the next sync would bring them back. */
export const DELETE = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req); const { id } = await ctx.params;
  const acc = await ownAccount(user.id, id);
  if (acc.source === "app") await q(`delete from club_account where user_id=$1 and source='app' and matricula=$2`, [user.id, acc.matricula]);
  else await q(`delete from club_account where id=$1 and user_id=$2`, [id, user.id]);
  return json({ accounts: await listAccounts(user.id) });
});
