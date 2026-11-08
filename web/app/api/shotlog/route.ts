import { handle, json, requireUser } from "@/lib/http";
import { saveShotLog, listShotLog, shotLogSummary, deleteShotLog } from "@/lib/shotlog";

/** t202u: own shot log. GET ?club_code&course&date → { holes, summary } · POST { club_code, course, date, plan_id?, source: libreta|gps, holes: [LogHole + confirmed:true] }
 *  · DELETE ?club_code&course&date[&source]. Private (owner only). Unconfirmed holes are rejected (400). API_v5 §66. */
export const GET = handle(async (req: Request) => { const u = await requireUser(req), sp = new URL(req.url).searchParams;
  const o = { club_code: sp.get("club_code") || undefined, course: sp.get("course") || undefined, date: sp.get("date") || undefined };
  return json({ holes: await listShotLog(u.id, o), summary: await shotLogSummary(u.id, o) }); });
export const POST = handle(async (req: Request) => { const u = await requireUser(req); return json(await saveShotLog(u.id, await req.json().catch(() => ({}))), 201); });
export const DELETE = handle(async (req: Request) => { const u = await requireUser(req), sp = new URL(req.url).searchParams;
  return json(await deleteShotLog(u.id, { club_code: sp.get("club_code") || "", course: sp.get("course") || "", date: sp.get("date") || "", source: sp.get("source") || undefined })); });
