import { handle, json, requireUser } from "@/lib/http";
import { studentAudios } from "@/lib/profesor-space";
/** Post-round audios (date, course, duration) only with "Puede escuchar mis audios post juego". No transcripts. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => { const u = await requireUser(req); const { id } = await ctx.params; return json({ audios: await studentAudios(u.id, id) }); });
