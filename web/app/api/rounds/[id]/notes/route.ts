import { handle, json, requireUser } from "@/lib/http";
import { withTransaction } from "@/lib/db";
import { body } from "@/lib/accounts";
import { ownRound } from "@/lib/rounds";
import { cardHoles, notePatch, writeAuthoritativeNote } from "@/lib/quick-stats";

/** The text is the client's. Putts, greens and fairways come from the stored holes when those holes can decide them. */
export const PUT = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const round = await ownRound(user.id, id);
  const patch = notePatch(await body<Record<string, unknown>>(req));
  const note = await withTransaction(run => writeAuthoritativeNote(run, {
    roundId: id,
    userId: user.id,
    card: cardHoles(round.holes),
    client: patch,
  }));
  return json({ note });
});
