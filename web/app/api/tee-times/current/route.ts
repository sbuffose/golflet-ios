import { handle, json, requireUser } from "@/lib/http";
import { currentTeeTime } from "@/lib/tee-times";

/** The booking whose start is within ±3 h of now (or tee_time:null) + course + tees with the playing handicap
 *  (official from the club calculator, else estimated). ?modality=medal18|stableford18|match|medal9ida|medal9vta &tee=<name> (display only). */
export const GET = handle(async (req: Request) => {
  const user = await requireUser(req); const u = new URL(req.url);
  return json(await currentTeeTime(user.id, { tee: u.searchParams.get("tee")?.slice(0, 30) || null, modality: u.searchParams.get("modality") }));
});
