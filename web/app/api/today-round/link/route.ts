import { handle, json, requireUser, HttpError } from "@/lib/http";
import { body } from "@/lib/accounts";
import { confirmProvisionalLink } from "@/lib/provisional-round";

/** The player picked which provisional belongs to which card. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req);
  const b = await body<{ live_id?: string; round_id?: string }>(req);
  if (!b.live_id || !b.round_id) throw new HttpError(400, "Elegí la vuelta y la tarjeta.");
  const linked = await confirmProvisionalLink(user.id, String(b.live_id), String(b.round_id));
  return json(linked);
});
