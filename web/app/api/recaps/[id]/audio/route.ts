import { handle, requireUser, HttpError } from "@/lib/http";
import { q } from "@/lib/db";

/** The original audio, owner only. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req); const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "No encontrado");
  const [a] = await q(`select a.data, r.audio_mime from recap_audio a join round_recap r on r.id=a.recap_id where a.recap_id=$1 and r.user_id=$2`, [id, user.id]);
  if (!a) throw new HttpError(404, "No encontrado");
  return new Response(new Uint8Array(a.data), { headers: { "Content-Type": a.audio_mime || "application/octet-stream", "Cache-Control": "private, no-store" } });
});
