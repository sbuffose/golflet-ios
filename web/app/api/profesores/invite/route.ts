import { handle, json, requireUser } from "@/lib/http";
import { createInvite } from "@/lib/profesores";
/** POST → { token, url, expires_at, wa_text }: a 14-day single-use link for a profesor to link with you. */
export const POST = handle(async (req: Request) => { const u = await requireUser(req); return json(await createInvite(u.id), 201); });
