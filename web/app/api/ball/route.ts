import { handle, json, requireUser } from "@/lib/http";
import { getBall, setBall, clearBall } from "@/lib/ball";
/** t74u pelota. GET → { ball|null, catalog[] }; PUT { brand, model? } (catalog-normalized; unknown = custom); DELETE clears it. */
export const GET = handle(async (req: Request) => json(await getBall((await requireUser(req)).id)));
export const PUT = handle(async (req: Request) => { const u = await requireUser(req); return json(await setBall(u.id, await req.json().catch(() => null))); });
export const DELETE = handle(async (req: Request) => json(await clearBall((await requireUser(req)).id)));
