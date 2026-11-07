import { handle, json, requireUser } from "@/lib/http";
import { listMatches } from "@/lib/matches";

/** t260u/t261u: the player's own matches (newest first) + history (head-to-head, fourball pairs, partners). Owner only. */
export const GET = handle(async (req: Request) => { const u = await requireUser(req); return json(await listMatches(u.id)); });
