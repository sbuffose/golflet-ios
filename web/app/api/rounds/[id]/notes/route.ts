import { handle, json, requireUser } from "@/lib/http";
import { q } from "@/lib/db";
import { body } from "@/lib/accounts";
import { ownRound } from "@/lib/rounds";
import { mergeNote } from "@/lib/quick-stats";

const num = (v: unknown) => (v == null || v === "" ? null : Number(v));

/** Present keys replace that total. A missing putts, gir, or fir key keeps the stored value. */
export const PUT = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req); const { id } = await ctx.params;
  await ownRound(user.id, id);
  const b = await body<Record<string, unknown>>(req);
  const [cur] = await q(`select putts, gir, fir, notes from round_note where round_id=$1`, [id]);
  const merged = mergeNote({
    putts: num(cur?.putts), gir: num(cur?.gir), fir: num(cur?.fir), notes: cur?.notes ?? null,
  }, b);
  const [n] = await q(`insert into round_note (round_id, user_id, putts, gir, fir, notes, updated_at) values ($1,$2,$3,$4,$5,$6,now())
    on conflict (round_id) do update set putts=excluded.putts, gir=excluded.gir, fir=excluded.fir, notes=excluded.notes, updated_at=now()
    returning putts, gir, fir, notes, updated_at`, [id, user.id, merged.putts, merged.gir, merged.fir, merged.notes]);
  return json({ note: n });
});
