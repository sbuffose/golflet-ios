/** Owner-only guard for PRIVATE metrics. The session user is the ONLY subject: any attempt to name another
 *  subject (user_id, player, alumno, group, share token…) is refused with 404, so these routes can never be
 *  used to read someone else's data. No caching anywhere. */
import { HttpError } from "./http-error";
const FORBIDDEN = /^(user|user_id|uid|player|player_id|alumno|alumno_id|student|member|group|group_id|token|share|as|for|of|id|matricula)$/i;
export function assertOwnerOnly(req: Request) {
  for (const k of new URL(req.url).searchParams.keys()) if (FORBIDDEN.test(k)) throw new HttpError(404, "No encontrado");
  if (req.headers.get("x-golflet-as-user") || req.headers.get("x-share-token")) throw new HttpError(404, "No encontrado");
}
export const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "Vary": "Cookie, Authorization" };
