import { handle, json, requireUser } from "@/lib/http";
import { q } from "@/lib/db";
import { body } from "@/lib/accounts";
import { ownRound } from "@/lib/rounds";
import { notePatch, NOTE_UPSERT } from "@/lib/quick-stats";

/** Present keys replace that column in one statement. A missing key is not read and is not written back. */
export const PUT = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  await ownRound(user.id, id);
  const patch = notePatch(await body<Record<string, unknown>>(req));
  const [n] = await q(NOTE_UPSERT, [
    id, user.id, patch.putts, patch.gir, patch.fir, patch.notes,
    patch.puttsPresent, patch.girPresent, patch.firPresent, patch.notesPresent,
  ]);
  return json({ note: n });
});
