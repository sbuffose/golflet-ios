import { handle, json, requireUser } from "@/lib/http";
import { getForPlayer } from "@/lib/sorteos";
/** Player: one sorteo, including the full bases y condiciones and bases_version (send it back when entering). */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => json(await getForPlayer((await requireUser(req)).id, (await ctx.params).id)));
