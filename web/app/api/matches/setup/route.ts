import { handle, json, requireUser } from "@/lib/http";
import { matchSetup } from "@/lib/matches";

/** t260u: «Armar partido» from a booking: GET ?tee=<tee_time id> → { tee_time, players (me + partners, HCP index), si (stroke index per hole), si_source, hcp_base }. Owner only. */
export const GET = handle(async (req: Request) => { const u = await requireUser(req); return json(await matchSetup(u.id, new URL(req.url).searchParams.get("tee") || "")); });
