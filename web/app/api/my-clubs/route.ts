import { handle, json, requireUser, HttpError } from "@/lib/http";
import { q } from "@/lib/db";
import { body } from "@/lib/accounts";
import { userClubs } from "@/lib/live";
import { DEFAULT_CLUBS, normalizeClubs } from "@/lib/shots-calc";
import { mergeEquipment } from "@/lib/bag-core";

export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  return json({ clubs: await userClubs(user.id), defaults: DEFAULT_CLUBS });
});
/** { clubs: [{ code, label, enabled }] } (max 30, codes unique, order = display order) */
export const PUT = handle(async (req: Request) => {
  const user = await requireUser(req); const b = await body<any>(req);
  let clubs; try { clubs = normalizeClubs(b.clubs); } catch { throw new HttpError(400, "Lista de palos inválida"); }
  clubs = mergeEquipment(clubs, await userClubs(user.id));   // items without "brand" keep the stored brand/model
  await q(`insert into player_clubs (user_id, clubs, updated_at) values ($1,$2,now()) on conflict (user_id) do update set clubs=excluded.clubs, updated_at=now()`, [user.id, JSON.stringify(clubs)]);
  return json({ clubs });
});
