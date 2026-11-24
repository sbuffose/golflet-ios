import { handle, json, requireUser } from "@/lib/http";
import { body } from "@/lib/accounts";
import { ReconstructSchemaError } from "@/lib/reconstruct";
import { openTodayRound } from "@/lib/provisional-round";

/** Start or continue today's provisional round. The club card can arrive later. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req);
  const b = await body<{ course?: string; tee_id?: string }>(req);
  try {
    const opened = await openTodayRound(user.id, { course: b.course || null, teeId: b.tee_id || null });
    return json(opened, opened.live_round ? 201 : 200);
  } catch (e) {
    if (e instanceof ReconstructSchemaError) return json({ error: e.message }, 503);
    throw e;
  }
});
