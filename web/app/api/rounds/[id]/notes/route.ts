import { handle, json, requireUser, HttpError } from "@/lib/http";
import { q } from "@/lib/db";
import { body } from "@/lib/accounts";
import { ownRound } from "@/lib/rounds";

const int = (v: unknown, max: number) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v); if (!Number.isInteger(n) || n < 0 || n > max) throw new HttpError(400, "Valor inválido");
  return n;
};

/** { putts, gir, fir, notes? } — user-owned, never overwritten by sync. Without a `notes` key the stored note is kept (the web no longer edits it). */
export const PUT = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req); const { id } = await ctx.params;
  await ownRound(user.id, id);
  const b = await body<any>(req);
  const hasNotes = Object.prototype.hasOwnProperty.call(b ?? {}, "notes");
  const notes = b.notes == null ? null : String(b.notes).slice(0, 10_000);
  const [n] = await q(`insert into round_note (round_id, user_id, putts, gir, fir, notes, updated_at) values ($1,$2,$3,$4,$5,$6,now())
    on conflict (round_id) do update set putts=excluded.putts, gir=excluded.gir, fir=excluded.fir, notes=case when $7 then excluded.notes else round_note.notes end, updated_at=now()
    returning putts, gir, fir, notes, updated_at`, [id, user.id, int(b.putts, 99), int(b.gir, 18), int(b.fir, 18), notes, hasNotes]);
  return json({ note: n });
});
