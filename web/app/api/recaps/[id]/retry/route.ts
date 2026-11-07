import { handle, json, requireUser, HttpError } from "@/lib/http";
import { serverAiEnabled } from "@/lib/ai";
import { ownRecap, processRecap, target } from "@/lib/recap";

export const maxDuration = 120;
/** Re-run transcription + structuring on the stored audio (after status pending_ai / error). */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req); const { id } = await ctx.params;
  const r = await ownRecap(user.id, id);
  if (!serverAiEnabled()) throw new HttpError(409, "La transcripción se hace en la app de iPhone. Abrí la ronda en la app o escribí cómo te fue.");
  const t = r.round_id ? await target(user.id, { round_id: r.round_id }) : null;
  return json({ recap: await processRecap(user.id, id, undefined, undefined, t?.context) });
});
