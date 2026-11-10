import { q } from "./db";
import { HttpError } from "./http-error";
import { userClubs } from "./live";
import { addClub, editClub, sortBag, bagLabel, type Club } from "./bag-core";
import { planIronSet } from "./club-face";
import { DEFAULT_BAG } from "./data";

async function save(userId: string, clubs: Club[]) {
  await q(`insert into player_clubs (user_id, clubs, updated_at) values ($1,$2,now()) on conflict (user_id) do update set clubs=excluded.clubs, updated_at=now()`, [userId, JSON.stringify(clubs)]);
}
async function bagRows(userId: string) { const [b] = await q(`select clubs from bag where user_id=$1`, [userId]); return { had: !!b, rows: (b?.clubs || DEFAULT_BAG) as any[] }; }
async function saveBag(userId: string, rows: any[]) {
  await q(`insert into bag (user_id, clubs, updated_at) values ($1,$2,now()) on conflict (user_id) do update set clubs=excluded.clubs, updated_at=now()`, [userId, JSON.stringify(rows.slice(0, 20))]);
}
const find = (list: Club[], code: string) => { const c = list.find(x => x.code.toLowerCase() === code.toLowerCase()); if (!c) throw new HttpError(404, "Ese palo no está en tu bolsa"); return c; };

export async function listEquipment(userId: string) { return sortBag((await userClubs(userId)) as Club[]); }
export async function getEquipment(userId: string, code: string) { return find(await listEquipment(userId), code); }

export async function createEquipment(userId: string, raw: any) {
  const list = await listEquipment(userId); const c = addClub(list, raw);
  await save(userId, sortBag([...list, c]));
  const lab = bagLabel(c);                               // yardage table gets an empty row for the new club
  if (lab) { const b = await bagRows(userId); if (!b.rows.some(r => r.club === lab) && b.rows.length < 20) await saveBag(userId, [...b.rows, { club: lab, carry: null, total: null }]); }
  return c;
}
export async function updateEquipment(userId: string, code: string, raw: any) {
  const list = await listEquipment(userId); const c = editClub(find(list, code), raw);
  await save(userId, list.map(x => (x.code === c.code ? c : x))); return c;
}
/** One write of the owner's club list. confirm false previews and does not write. */
export async function applyIronSetFor(userId: string, raw: any) {
  const list = await listEquipment(userId);
  const plan = planIronSet(list, raw || {});
  if (raw?.confirm !== true) return { saved: false as const, rows: plan.rows };
  if (plan.rows.some(r => r.overwrite || r.modelCleared) && raw.ack !== true) {
    throw new HttpError(409, "Hay palos con otra marca o con un modelo que no entra. Revisá la vista previa y confirmá el reemplazo.");
  }
  await save(userId, sortBag(plan.clubs));
  return { saved: true as const, rows: plan.rows, clubs: sortBag(plan.clubs) };
}
export async function deleteEquipment(userId: string, code: string) {
  const list = await listEquipment(userId); const c = find(list, code);
  if (list.length <= 1) throw new HttpError(400, "La bolsa necesita al menos un palo.");
  await save(userId, list.filter(x => x.code !== c.code));
  const lab = bagLabel(c);                               // and its yardage row goes with it
  if (lab) { const b = await bagRows(userId); if (b.rows.some(r => r.club === lab)) await saveBag(userId, b.rows.filter(r => r.club !== lab)); }
  return { deleted: c.code };
}
