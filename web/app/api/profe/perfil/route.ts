import { handle, json, requireUser, HttpError } from "@/lib/http";
import { requireProfesor, updateMyProfile } from "@/lib/profesor-space";
/** Active profesor only. GET → { profile }. PATCH { display_name?, bio?, method?, locations?, availability?, levels?, price_min?, price_max?, formats?, phone? } */
export const GET = handle(async (req: Request) => { const u = await requireUser(req); return json({ profile: await requireProfesor(u.id) }); });
export const PATCH = handle(async (req: Request) => {
  const u = await requireUser(req); let b: any; try { b = await req.json(); } catch { throw new HttpError(400, "JSON inválido"); }
  return json({ profile: await updateMyProfile(u.id, b) });
});
