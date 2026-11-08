import { handle, json, requireUser, HttpError } from "@/lib/http";
import { withTransaction } from "@/lib/db";
import { body } from "@/lib/accounts";
import { ownRound } from "@/lib/rounds";
import { isUndefinedTable } from "@/lib/scorecard-lease";
import { cardHoles, notePatch, writeAuthoritativeNote } from "@/lib/quick-stats";

function unavailable(e: unknown): never {
  if (isUndefinedTable(e, "round_hole_mark") || isUndefinedTable(e, "round_note")) {
    throw new HttpError(503, "Falta aplicar la migración de marcas por hoyo");
  }
  throw e;
}

/** The text is the client's. Putts, greens and fairways come from the stored holes when those holes can decide them. */
export const PUT = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const round = await ownRound(user.id, id);
  const patch = notePatch(await body<Record<string, unknown>>(req));
  try {
    const note = await withTransaction(run => writeAuthoritativeNote(run, {
      roundId: id,
      userId: user.id,
      card: cardHoles(round.holes),
      client: patch,
    }));
    return json({ note });
  } catch (e) { unavailable(e); }
});
