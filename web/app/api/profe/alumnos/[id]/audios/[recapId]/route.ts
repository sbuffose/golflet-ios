import { handle, requireUser } from "@/lib/http";
import { studentAudio } from "@/lib/profesor-space";
/** The audio itself (private, no-store), same permission. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string; recapId: string }> }) => {
  const u = await requireUser(req); const { id, recapId } = await ctx.params; const a = await studentAudio(u.id, id, recapId);
  return new Response(new Uint8Array(a.data), { headers: { "Content-Type": a.audio_mime || "audio/mp4", "Cache-Control": "private, no-store" } });
});
