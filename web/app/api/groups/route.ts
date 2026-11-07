import { handle, json, requireUser, HttpError } from "@/lib/http";
import { createGroup, listGroups } from "@/lib/groups";

/** GET → { groups (accepted), invitations (incoming), outgoing (pending invites you sent) }. */
export const GET = handle(async (req: Request) => json(await listGroups((await requireUser(req)).id)));
/** POST { name, matriculas: ["12345", …] } → creates a group (you are its owner) and invites them. */
export const POST = handle(async (req: Request) => {
  const u = await requireUser(req); let b: any; try { b = await req.json(); } catch { throw new HttpError(400, "JSON inválido"); }
  return json(await createGroup(u.id, b?.name, b?.matriculas, req.headers.get("idempotency-key")), 201);
});
