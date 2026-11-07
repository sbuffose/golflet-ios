import { handle, json, requireUser, HttpError } from "@/lib/http";
import { markSeen } from "@/lib/profesor-sessions";
/** Student marks assigned content as seen: { ids: uuid[] }. */
export const POST = handle(async (req: Request) => { const u = await requireUser(req); let b: any; try { b = await req.json(); } catch { throw new HttpError(400, "JSON inválido"); } return json(await markSeen(u.id, b?.ids)); });
