import { handle, json, HttpError } from "@/lib/http";
import { adminBody, requireEditor } from "@/lib/admin";
import { courseCard, saveCourseCard } from "@/lib/admin-content";

type Ctx = { params: Promise<{ clubId: string; name: string }> };
const parse = async (ctx: Ctx) => { const { clubId, name } = await ctx.params; const id = Number(clubId); const n = decodeURIComponent(name);
  if (!Number.isInteger(id) || id < 1 || !n || n.length > 120) throw new HttpError(404, "Cancha no encontrada"); return { id, n }; };
export const GET = handle(async (req: Request, ctx: Ctx) => { await requireEditor(req); const { id, n } = await parse(ctx); return json(await courseCard(id, n)); });
/** { holes: [{hole, par, hcp, yards:{TEE:yds}}], note } — only differences with the synced card are stored. holes: [] restores Golfistics data. */
export const PUT = handle(async (req: Request, ctx: Ctx) => { const u = await requireEditor(req); const { id, n } = await parse(ctx); return json(await saveCourseCard(u, id, n, await adminBody(req))); });
