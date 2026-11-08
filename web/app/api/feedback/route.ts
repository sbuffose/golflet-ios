import { handle, json, HttpError } from "@/lib/http";
import { createFeedback } from "@/lib/feedback";
/** Public, ANONYMOUS: POST { category?: no_funciono|idea|me_encanto|otro, texto } → 201. Does not read the session; stores no user/IP. 8/day per connection. */
export const POST = handle(async (req: Request) => {
  let b: any; try { b = await req.json(); } catch { throw new HttpError(400, "JSON inválido"); }
  return json(await createFeedback(req, b), 201);
});
