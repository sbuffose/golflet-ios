import { handle, json, requireUser, HttpError } from "@/lib/http";
import { q } from "@/lib/db";
import { body } from "@/lib/accounts";
import { DEFAULT_BAG } from "@/lib/data";

export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  const [b] = await q(`select clubs from bag where user_id=$1`, [user.id]);
  return json({ bag: b?.clubs || DEFAULT_BAG });
});

/** { bag: [{ club, carry, total }] } in yards. */
export const PUT = handle(async (req: Request) => {
  const user = await requireUser(req);
  const { bag } = await body<{ bag: any[] }>(req);
  if (!Array.isArray(bag) || bag.length > 20) throw new HttpError(400, "Bolsa inválida");
  const y = (v: unknown) => (v == null || v === "" ? null : Number.isFinite(+v) && +v >= 0 && +v <= 450 ? Math.round(+v) : null);
  const clean = bag.map(b => ({ club: String(b.club ?? "").slice(0, 30), carry: y(b.carry), total: y(b.total) })).filter(b => b.club);
  await q(`insert into bag (user_id, clubs, updated_at) values ($1,$2,now()) on conflict (user_id) do update set clubs=excluded.clubs, updated_at=now()`, [user.id, JSON.stringify(clean)]);
  return json({ bag: clean });
});
