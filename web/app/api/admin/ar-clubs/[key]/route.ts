import { handle, json } from "@/lib/http";
import { adminBody, requireAdmin, requireEditor } from "@/lib/admin";
import { arClubDetail, setArOverride } from "@/lib/ar-clubs";

export const GET = handle(async (req: Request, ctx: { params: Promise<{ key: string }> }) => { await requireEditor(req); const { key } = await ctx.params; return json(await arClubDetail(key)); });
/** Solo admin. { field, value } guarda una corrección; { field, reset:true } vuelve al dato importado. */
export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ key: string }> }) => {
  const u = await requireAdmin(req); const { key } = await ctx.params; return json(await setArOverride(u, key, await adminBody(req)));
});
