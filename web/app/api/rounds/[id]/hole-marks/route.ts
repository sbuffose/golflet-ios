import { handle, json, requireUser, HttpError } from "@/lib/http";
import { q } from "@/lib/db";
import { body } from "@/lib/accounts";
import { ownRound } from "@/lib/rounds";
import { isUndefinedTable } from "@/lib/scorecard-lease";
import { cardHoles, writeHoleMark, type MarkConflict, type StoredMark } from "@/lib/quick-stats";
import { withTransaction } from "@/lib/db";

function unavailable(e: unknown): never {
  if (isUndefinedTable(e, "round_hole_mark")) throw new HttpError(503, "Falta aplicar la migración de marcas por hoyo");
  throw e;
}

function rowMark(row: { hole: unknown; putts: unknown; gir: unknown; drive: unknown; rev: unknown }): StoredMark {
  return {
    hole: Number(row.hole),
    putts: row.putts == null ? null : Number(row.putts),
    gir: row.gir == null ? null : row.gir === true,
    drive: row.drive == null ? null : String(row.drive),
    rev: Number(row.rev),
  };
}

function conflict(mark: StoredMark, kind: MarkConflict) {
  return json({
    error: "Otra edición llegó antes.",
    conflict: kind,
    applied: false,
    idempotent: false,
    mark,
  }, 409);
}

/** Marks for this round, including a cleared hole. The null row is the rev that blocks an older write. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  await ownRound(user.id, id);
  try {
    const rows = await q(`select hole, putts, gir, drive, rev from round_hole_mark where round_id=$1 and user_id=$2 order by hole`, [id, user.id]);
    return json({ marks: rows.map(rowMark) });
  } catch (e) { unavailable(e); }
});

/** One hole, then the round total from the marks this transaction can see. The client's board is not the total. */
export const PUT = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const round = await ownRound(user.id, id);
  const incoming = await body<Record<string, unknown>>(req);
  const card = cardHoles(round.holes);
  const hole = Number(incoming.hole);
  if (!card.some(h => h.hole === hole)) {
    if (!Number.isInteger(hole) || hole < 1 || hole > 18) throw new HttpError(400, "Hoyo inválido");
    throw new HttpError(404, "Ese hoyo no está en la tarjeta");
  }
  try {
    const decision = await withTransaction(run => writeHoleMark(run, { roundId: id, userId: user.id, incoming, card }));
    if (decision.conflict) return conflict(decision.mark, decision.conflict);
    return json({ mark: decision.mark, applied: true, conflict: null, idempotent: decision.idempotent, note: decision.note });
  } catch (e) { unavailable(e); }
});
