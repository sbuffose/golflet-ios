/** t242u: light «¿reserva nueva?» check, run when the player opens Inicio. Bookings ONLY (no cards, HI or calculator).
 *  READ-ONLY against the club with the player's own stored session: login + misreservas.php (+ the events page, + the line page of a NEW booking).
 *  Polite: at most once per CHECK_EVERY_S per linked account, claimed atomically in club_page_status (dedupes concurrent calls and instances);
 *  skipped while a full sync of that account is running. Never logs cookies, claves or sessions. */
import { q } from "./db";
import { decryptSecret } from "./crypto";
import { Golfistics, GolfisticsError } from "./golfistics";
import { GolfisticsApp } from "./golfistics-app";
import { syncBookings } from "./club-extras";
import { nowAR } from "./tee-times-core";

export const CHECK_EVERY_S = 150;
const PAGE = "booking_check";

type Snap = Map<string, { date: string; time: string; course_label: string | null; start_hole: number | null; companions: string; gone: boolean }>;
async function snap(userId: string): Promise<Snap> {
  const { date, time } = nowAR();
  const rows = await q(`select id, date::text date, time, course_label, start_hole, companions::text companions, gone_at is not null gone from tee_time
    where user_id=$1 and source='club' and (date > $2::date or (date = $2::date and time >= $3))`, [userId, date, time]);
  return new Map(rows.map((r: any) => [r.id, r]));
}
/** Atomic claim: returns the accounts whose last check is older than CHECK_EVERY_S (and marks them as checked now). */
async function claim(userId: string) {
  const accs = await q(`select a.id, a.club_id, a.matricula, a.source, a.password_enc, a.gender, a.last_sync_status, c.base_url, c.code club_code
    from club_account a join club c on c.id=a.club_id where a.user_id=$1 and a.password_enc is not null`, [userId]);
  const got: any[] = []; let wait = 0;
  for (const a of accs) {
    if (a.last_sync_status === "running") continue;   // a full sync is reading the same pages right now
    const r = await q(`insert into club_page_status (club_account_id, page, status, message, items, checked_at) values ($1,$2,'ok',null,null,now())
      on conflict (club_account_id, page) do update set checked_at=now() where club_page_status.checked_at < now() - ($3 || ' seconds')::interval returning 1`, [a.id, PAGE, String(CHECK_EVERY_S)]);
    if (r.length) got.push(a);
    else { const [s] = await q(`select extract(epoch from (checked_at + ($3 || ' seconds')::interval - now()))::int w from club_page_status where club_account_id=$1 and page=$2`, [a.id, PAGE, String(CHECK_EVERY_S)]); wait = Math.max(wait, s?.w ?? 0); }
  }
  return { accs, got, wait };
}
const coursesOf = async (clubId: number) => (await q(`select name from course where club_id=$1`, [clubId])).map((c: any) => c.name as string);

export async function checkBookings(userId: string) {
  const { accs, got, wait } = await claim(userId);
  if (!accs.length) return { status: "no_account" as const, new: [], changed: [], gone: [], next_in_s: null };
  if (!got.length) return { status: "throttled" as const, new: [], changed: [], gone: [], next_in_s: Math.max(1, wait) };
  const before = await snap(userId); let ok = 0, failed = 0;
  // App-linked accounts: one App login per matrícula, then only the clubs already linked
  const app = got.filter(a => a.source === "app"), site = got.filter(a => a.source !== "app");
  for (const m of [...new Set(app.map(a => a.matricula as string))]) {
    const list = app.filter(a => a.matricula === m);
    try {
      const A = await new GolfisticsApp(m, decryptSecret(list[0].password_enc)).login(); await A.listClubs();
      for (const a of list) {
        if (!a.club_code || !A.clubs.some(c => c.cc === a.club_code)) continue;
        try { const g = await A.openClub(a.club_code, { gender: a.gender }); await syncBookings(userId, a, g, await coursesOf(a.club_id), { light: true }); ok++; } catch { failed++; }
      }
    } catch (e) { failed += list.length; if (!(e instanceof GolfisticsError)) console.error("booking check: app", e instanceof Error ? e.name : "unknown"); }
  }
  for (const a of site) {
    try { const g = await new Golfistics(a.base_url, a.matricula, decryptSecret(a.password_enc)).login(); await syncBookings(userId, a, g, await coursesOf(a.club_id), { light: true }); ok++; }
    catch (e) { failed++; if (!(e instanceof GolfisticsError)) console.error("booking check: site", e instanceof Error ? e.name : "unknown"); }
  }
  const after = await snap(userId), nw: string[] = [], ch: string[] = [], gone: string[] = [];
  for (const [id, r] of after) { const b = before.get(id);
    if (r.gone) { if (b && !b.gone) gone.push(id); continue; }
    if (!b || b.gone) nw.push(id);
    else if (b.date !== r.date || b.time !== r.time || b.course_label !== r.course_label || b.start_hole !== r.start_hole || b.companions !== r.companions) ch.push(id); }
  return { status: ok ? "checked" as const : "error" as const, new: nw, changed: ch, gone, next_in_s: CHECK_EVERY_S, failed };
}
