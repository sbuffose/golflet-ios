import { handle, json, requireUser, HttpError } from "@/lib/http";
import { listAccounts } from "@/lib/data";
import { getRole } from "@/lib/admin";
import { q } from "@/lib/db";
import { callName } from "@/lib/person-name";

async function me(user: { id: string; name: string; email: string }) {
  const [role, pref, acc] = await Promise.all([getRole(user.id), q(`select call_name from user_pref where user_id=$1`, [user.id]), listAccounts(user.id)]);
  const call_name = pref[0]?.call_name ?? null;
  const golfistics = (acc as any[]).find(a => a.player_name)?.player_name ?? null;
  return { user: { ...user, is_admin: role === "admin", role, call_name, first_name: callName({ chosen: call_name, accountName: user.name, golfistics }) }, accounts: acc };
}
export const GET = handle(async (req: Request) => json(await me(await requireUser(req))));

/** PATCH { call_name: "Seba" | null } → "Cómo te llamamos" (null/empty = back to the name from Golfistics). */
export const PATCH = handle(async (req: Request) => {
  const user = await requireUser(req);
  let b: any; try { b = await req.json(); } catch { throw new HttpError(400, "JSON inválido"); }
  const v = b?.call_name == null ? "" : String(b.call_name).trim().replace(/\s+/g, " ");
  if (v.length > 40 || /[<>{}\[\]\\]/.test(v)) throw new HttpError(400, "Usá hasta 40 letras.");
  await q(`insert into user_pref (user_id, call_name, updated_at) values ($1,$2,now()) on conflict (user_id) do update set call_name=excluded.call_name, updated_at=now()`, [user.id, v || null]);
  return json(await me(user));
});
