import { handle, json, requireUser } from "@/lib/http";
import { recurringFor } from "@/lib/recap";

/** ?last=10 (1..50): recurring mistake categories across the last N rounds with a ready recap. */
export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  const n = Math.min(50, Math.max(1, Number(new URL(req.url).searchParams.get("last")) || 10));
  return json(await recurringFor(user.id, n));
});
