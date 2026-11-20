import { handle, json, requireUser } from "@/lib/http";
import { chooseBookingCourse, matchSetup } from "@/lib/matches";

/** t260u: «Armar partido» from a booking: GET ?tee=<tee_time id> → { tee_time, players (me + partners, HCP index), si (stroke index per hole), si_source, hcp_base }. Owner only. */
export const GET = handle(async (req: Request) => { const u = await requireUser(req); return json(await matchSetup(u.id, new URL(req.url).searchParams.get("tee") || "")); });
/** The player answers «¿En qué cancha juegan?». Saved on the booking's existing course columns. */
export const POST = handle(async (req: Request) => {
  const u = await requireUser(req);
  const tee = new URL(req.url).searchParams.get("tee") || "";
  const b = await req.json().catch(() => ({}));
  return json(await chooseBookingCourse(u.id, tee, String((b as any)?.course || "")));
});
