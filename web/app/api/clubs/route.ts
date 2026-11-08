import { handle, json, requireUser } from "@/lib/http";
import { q } from "@/lib/db";

export const GET = handle(async (req: Request) => {
  await requireUser(req);
  return json({ clubs: await q(`select id, name, base_url, code, direct_login from club where seeded or direct_login order by id`) });
});
