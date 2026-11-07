import { handle, json, requireUser } from "@/lib/http";
import { body } from "@/lib/accounts";
import { getEquipment, updateEquipment, deleteEquipment } from "@/lib/bag-equipment";

type Ctx = { params: Promise<{ code: string }> };
const code = async (ctx: Ctx) => decodeURIComponent((await ctx.params).code).slice(0, 8);
export const GET = handle(async (req: Request, ctx: Ctx) => { const user = await requireUser(req); return json({ club: await getEquipment(user.id, await code(ctx)) }); });
/** { brand?, model?, loft?, enabled? } — the club type (code) doesn't change; delete and add for that. */
export const PATCH = handle(async (req: Request, ctx: Ctx) => { const user = await requireUser(req); return json({ club: await updateEquipment(user.id, await code(ctx), await body<any>(req)) }); });
export const DELETE = handle(async (req: Request, ctx: Ctx) => { const user = await requireUser(req); return json(await deleteEquipment(user.id, await code(ctx))); });
