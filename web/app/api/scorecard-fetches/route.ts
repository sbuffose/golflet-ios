import { handle, json, requireUser } from "@/lib/http";
import { ScorecardSchemaError, listScorecardFetches } from "@/lib/scorecard-fetch";

/** The same rows the cron writes. Web and iOS only display this. Neither one schedules the read. */
export async function scorecardFetchesResponse(userId: string, list: (userId: string) => Promise<unknown> = listScorecardFetches) {
  try {
    return json({ fetches: await list(userId) });
  } catch (e) {
    if (e instanceof ScorecardSchemaError) return json({ error: e.message }, 503);
    throw e;
  }
}

export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  return scorecardFetchesResponse(user.id);
});
