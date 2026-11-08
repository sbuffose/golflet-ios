import { q } from "./db";
import { HttpError } from "./http";

export async function ownAccount(userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "No encontrado");
  const [a] = await q(`select * from club_account where id=$1 and user_id=$2`, [id, userId]);
  if (!a) throw new HttpError(404, "No encontrado");
  return a;
}

export async function body<T = any>(req: Request): Promise<T> {
  try { return await req.json(); } catch { throw new HttpError(400, "JSON inválido"); }
}
