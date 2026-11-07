/** t244u «Marcar bandera»: the player's own pin positions (per course, hole and date). Private; nothing goes to the club. */
import { q } from "./db";
import { HttpError } from "./http-error";

const D = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown, n = 40) => { const s = typeof v === "string" ? v.trim() : ""; if (!s || s.length > n) throw new HttpError(400, "Datos inválidos"); return s; };
const day = (v: unknown) => { const s = str(v, 10); if (!D.test(s) || isNaN(Date.parse(s + "T12:00:00Z"))) throw new HttpError(400, "Fecha inválida"); return s; };
const holeN = (v: unknown) => { const n = Number(v); if (!Number.isInteger(n) || n < 1 || n > 27) throw new HttpError(400, "Hoyo inválido"); return n; };

export type FlagPin = { hole: number; ll: [number, number]; acc_m: number | null; source: "gps" | "mapa"; updated_at: string };

/** GET: the flags of one date + the dates that have flags (newest first, up to 60). */
export async function listFlags(userId: string, p: { club?: unknown; course?: unknown; date?: unknown }) {
  const club = str(p.club), course = str(p.course), date = day(p.date);
  const rows = await q<any>(`select hole, lng, lat, acc_m, source, updated_at from flag_pin where user_id = $1 and club_code = $2 and course = $3 and date = $4 and deleted_at is null order by hole`, [userId, club, course, date]);
  const ds = await q<any>(`select to_char(date, 'YYYY-MM-DD') d, count(*)::int n from flag_pin where user_id = $1 and club_code = $2 and course = $3 and deleted_at is null group by date order by date desc limit 60`, [userId, club, course]);
  return { club_code: club, course, date, flags: rows.map(r => ({ hole: r.hole, ll: [r.lng, r.lat], acc_m: r.acc_m == null ? null : Math.round(r.acc_m * 10) / 10, source: r.source, updated_at: r.updated_at })) as FlagPin[], dates: ds.map(r => ({ date: r.d, n: r.n })) };
}

/** PUT: set (or move) the flag of one hole on one date. GPS marks need accuracy ≤ 15 m. */
export async function putFlag(userId: string, b: any) {
  const club = str(b?.club_code), course = str(b?.course), date = day(b?.date), hole = holeN(b?.hole);
  const ll = b?.ll, lng = Number(ll?.[0]), lat = Number(ll?.[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) throw new HttpError(400, "Posición inválida");
  const source = b?.source === "gps" ? "gps" : b?.source === "mapa" ? "mapa" : null; if (!source) throw new HttpError(400, "Origen inválido");
  let acc: number | null = null;
  if (source === "gps") { acc = Number(b?.acc_m); if (!Number.isFinite(acc) || acc < 0 || acc > 15) throw new HttpError(400, "GPS impreciso: acercate y esperá a que mejore"); }
  const known = await q(`select 1 from course_map where club_code = $1 and course = $2 limit 1`, [club, course]).catch(() => [1]);
  if (!known.length) throw new HttpError(404, "Cancha desconocida");
  await q(`insert into flag_pin (user_id, club_code, course, hole, date, lng, lat, acc_m, source) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    on conflict (user_id, club_code, course, hole, date) do update set lng = excluded.lng, lat = excluded.lat, acc_m = excluded.acc_m, source = excluded.source, deleted_at = null, updated_at = now()`,
    [userId, club, course, hole, date, lng, lat, acc, source]);
  return listFlags(userId, { club, course, date });
}

/** DELETE: remove the flag of one hole on one date (soft). */
export async function deleteFlag(userId: string, p: { club?: unknown; course?: unknown; date?: unknown; hole?: unknown }) {
  const club = str(p.club), course = str(p.course), date = day(p.date), hole = holeN(p.hole);
  await q(`update flag_pin set deleted_at = now(), updated_at = now() where user_id = $1 and club_code = $2 and course = $3 and hole = $4 and date = $5 and deleted_at is null`, [userId, club, course, hole, date]);
  return listFlags(userId, { club, course, date });
}
