import { handle, json } from "@/lib/http";
import { requireAdmin } from "@/lib/admin";
import { summary } from "@/lib/admin-metrics";

export const maxDuration = 60;
/** Dashboard numbers + time series. ?test=1 includes test accounts (@example.com). */
export const GET = handle(async (req: Request) => {
  await requireAdmin(req);
  return json(await summary(new URL(req.url).searchParams.get("test") === "1"));
});
