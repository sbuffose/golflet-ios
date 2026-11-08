import { handle, json, requireUser, HttpError } from "@/lib/http";
import { q } from "@/lib/db";
import { body } from "@/lib/accounts";
import { ownRound } from "@/lib/rounds";
import { isUndefinedTable } from "@/lib/scorecard-lease";
import { applyMark, type StoredMark } from "@/lib/quick-stats";

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

/** Marks for this round on the account. Does not read or write round totals. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  await ownRound(user.id, id);
  try {
    const rows = await q(`select hole, putts, gir, drive, rev from round_hole_mark where round_id=$1 and user_id=$2 order by hole`, [id, user.id]);
    return json({ marks: rows.map(rowMark) });
  } catch (e) { unavailable(e); }
});

/** One hole. A lower rev is stored as a no-op. Totals live on round_note and are not written here. */
export const PUT = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  await ownRound(user.id, id);
  const incoming = await body<Record<string, unknown>>(req);
  const hole = Number(incoming.hole);
  if (!Number.isInteger(hole) || hole < 1 || hole > 18) throw new HttpError(400, "Hoyo inválido");
  try {
    const [cur] = await q(`select hole, putts, gir, drive, rev from round_hole_mark where round_id=$1 and hole=$2`, [id, hole]);
    const result = applyMark(cur ? rowMark(cur) : null, incoming);
    if (!result.applied) return json({ mark: result.mark, applied: false });
    const mark = result.mark;
    if (mark.putts == null && mark.gir == null && mark.drive == null) {
      await q(`delete from round_hole_mark where round_id=$1 and hole=$2 and rev <= $3`, [id, mark.hole, mark.rev]);
      const [kept] = await q(`select hole, putts, gir, drive, rev from round_hole_mark where round_id=$1 and hole=$2`, [id, mark.hole]);
      return json({ mark: kept ? rowMark(kept) : mark, applied: !kept });
    }
    const [row] = await q(`insert into round_hole_mark (round_id, user_id, hole, putts, gir, drive, rev, updated_at)
      values ($1,$2,$3,$4,$5,$6,$7,now())
      on conflict (round_id, hole) do update set putts=excluded.putts, gir=excluded.gir, drive=excluded.drive, rev=excluded.rev, user_id=excluded.user_id, updated_at=now()
      where round_hole_mark.rev <= excluded.rev
      returning hole, putts, gir, drive, rev`, [id, user.id, mark.hole, mark.putts, mark.gir, mark.drive, mark.rev]);
    if (!row) {
      const [kept] = await q(`select hole, putts, gir, drive, rev from round_hole_mark where round_id=$1 and hole=$2`, [id, mark.hole]);
      return json({ mark: kept ? rowMark(kept) : mark, applied: false });
    }
    return json({ mark: rowMark(row), applied: true });
  } catch (e) { unavailable(e); }
});
