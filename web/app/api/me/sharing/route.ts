import { handle, json, requireUser, HttpError } from "@/lib/http";
import { ALWAYS_PRIVATE, SHARE_CATS, getSharePrefs, setSharePrefs } from "@/lib/group-share";
/** GET → "Qué comparto" (global for all my groups): { prefs, categories, always_private, customized } */
export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  return json({ ...(await getSharePrefs(u.id)), categories: SHARE_CATS, always_private: ALWAYS_PRIVATE });
});
/** PUT { prefs: { scores?: bool, handicap?: bool, … } } → merges and saves. */
export const PUT = handle(async (req: Request) => {
  const u = await requireUser(req); let b: any; try { b = await req.json(); } catch { throw new HttpError(400, "JSON inválido"); }
  return json(await setSharePrefs(u.id, b));
});
