import { handle, json, requireUser } from "@/lib/http";
import { createClubRequest, myClubRequests } from "@/lib/club-requests";

/** POST { club, mensaje? } → 201 { request, message: "Gracias, lo vamos a revisar" }. 5 per day per user (429). GET → the user's own requests. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req);
  return json(await createClubRequest(user, await req.json().catch(() => null)), 201);
});
export const GET = handle(async (req: Request) => { const user = await requireUser(req); return json({ requests: await myClubRequests(user.id) }); });
