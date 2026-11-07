import { handle, json, requireUser } from "@/lib/http";
import { findMatches } from "@/lib/profesor-match";
/** → { matches: [{ profesor_id, name, verified, pending, locations, price_min, price_max, formats, linked, score, reasons[] }] } (top 5, real profesores only). */
export const GET = handle(async (req: Request) => { const u = await requireUser(req); return json({ matches: await findMatches(u.id) }); });
