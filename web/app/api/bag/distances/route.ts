import { handle, json, requireUser } from "@/lib/http";
import { bagDistances } from "@/lib/shot-samples";
/** Per club: total (manual until 5 GPS samples, then median of measured) + carry (manual or launch monitor; never from GPS), with source and n. */
export const GET = handle(async (req: Request) => { const u = await requireUser(req); return json(await bagDistances(u.id)); });
