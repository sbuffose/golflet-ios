import { handle, json, requireUser } from "@/lib/http";
import { ScorecardSchemaError, listScorecardFetches } from "@/lib/scorecard-fetch";

/** The same rows the cron writes. Web and iOS only display this. Neither one schedules the read. */
export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  try {
    return json({ fetches: await listScorecardFetches(user.id) });
  } catch (e) {
    if (e instanceof ScorecardSchemaError) return json({ error: e.message }, 503);
    throw e;
  }
});
