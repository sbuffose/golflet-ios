import { handle, json, requireUser } from "@/lib/http";
import { listFlags, putFlag, deleteFlag } from "@/lib/flags";

/** t244u: the player's own flag (pin) positions. GET ?club=&course=&date= · PUT {club_code, course, hole, date, ll:[lng,lat], source:'gps'|'mapa', acc_m?} · DELETE ?club=&course=&hole=&date=. Owner only. */
const qp = (req: Request) => Object.fromEntries(new URL(req.url).searchParams);
export const GET = handle(async (req: Request) => { const u = await requireUser(req); return json(await listFlags(u.id, qp(req))); });
export const PUT = handle(async (req: Request) => { const u = await requireUser(req); return json(await putFlag(u.id, await req.json().catch(() => ({})))); });
export const DELETE = handle(async (req: Request) => { const u = await requireUser(req); return json(await deleteFlag(u.id, qp(req))); });
