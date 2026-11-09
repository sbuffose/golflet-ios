import { handle, json, requireUser } from "@/lib/http";
import { body } from "@/lib/accounts";
import { applyIronSetFor } from "@/lib/bag-equipment";

/** Preview (confirm false) or apply the 4-iron–PW brand to clubs this user already has. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req);
  return json(await applyIronSetFor(user.id, await body<any>(req)));
});
