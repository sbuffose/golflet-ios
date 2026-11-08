/** Reservation read. A visit and the explicit "Actualizar reserva" button both use the stored clave.
 *  They do not use the 20-hour card throttle and they do not start a scorecard sync.
 *  Overlapping calls for the same player share one read. A later visit starts another.
 *  checked_at moves only inside syncBookings after misreservas.php was actually read.
 *  The explicit button re-reads the line (players). A visit does not, so a stale partner list is not relabeled as fresh. */
import { q } from "./db";
import { decryptSecret } from "./crypto";
import { Golfistics, GolfisticsError } from "./golfistics";
import { GolfisticsApp } from "./golfistics-app";
import { syncBookings } from "./club-extras";
import { nowAR } from "./tee-times-core";
import { shareFlight, diffSnaps, companionMode, type BookingSnap } from "./booking-refresh";
import { claimLoginLease, newLeaseToken, releaseLoginLease, SYNC_BUSY_MESSAGE } from "./scorecard-lease";
import { enrollScorecardFetches } from "./scorecard-fetch";

export type CheckOpts = { players?: boolean; teeId?: string };

export type CheckResult = {
  status: "checked" | "error" | "no_account" | "busy";
  fresh: boolean;
  players_read: boolean;
  checked_at: string | null;
  last_checked_at: string | null;
  new: string[];
  changed: string[];
  gone: string[];
  failed: number;
  message: string | null;
};

const flights = new Map<string, Promise<CheckResult>>();

const empty = (p: Partial<CheckResult>): CheckResult => ({
  status: "error", fresh: false, players_read: false, checked_at: null, last_checked_at: null,
  new: [], changed: [], gone: [], failed: 0, message: null, ...p,
});

async function lastChecked(userId: string): Promise<string | null> {
  const [r] = await q(`select max(s.checked_at) at from club_page_status s
    join club_account a on a.id=s.club_account_id
    where a.user_id=$1 and s.page='bookings' and s.status in ('ok','empty')`, [userId]);
  return r?.at ? new Date(r.at).toISOString() : null;
}

async function snap(userId: string): Promise<BookingSnap[]> {
  const { date, time } = nowAR();
  const rows = await q(`select id, user_id, date::text date, time, course_label, companions::text companions, gone_at is not null gone from tee_time
    where user_id=$1 and source='club' and (date > $2::date or (date = $2::date and time >= $3))`, [userId, date, time]);
  return rows.map((r: any) => ({
    id: String(r.id), userId: String(r.user_id), date: String(r.date), time: String(r.time).slice(0, 5),
    course: r.course_label ? String(r.course_label) : null, gone: r.gone === true || r.gone === "t",
  }));
}

const coursesOf = async (clubId: number) => (await q(`select name from course where club_id=$1`, [clubId])).map((c: any) => c.name as string);

async function readAccount(userId: string, a: any, light: boolean): Promise<"ok" | "empty" | "error" | "busy"> {
  const key = a.source === "app" ? `app:${userId}:${a.matricula}` : `site:${a.id}`;
  const token = newLeaseToken();
  const lease = await claimLoginLease(q, key, token, userId, null);
  if (lease === "held") return "busy";
  const release = lease === "acquired" ? () => releaseLoginLease(q, key, token) : async () => {};
  try {
    const courses = await coursesOf(a.club_id);
    if (a.source === "app") {
      const A = await new GolfisticsApp(a.matricula, decryptSecret(a.password_enc)).login();
      await A.listClubs();
      if (!a.club_code || !A.clubs.some((c: { cc: string }) => c.cc === a.club_code)) return "error";
      const g = await A.openClub(a.club_code, { gender: a.gender });
      return await syncBookings(userId, a, g, courses, { light });
    }
    const g = await new Golfistics(a.base_url, a.matricula, decryptSecret(a.password_enc)).login();
    return await syncBookings(userId, a, g, courses, { light });
  } catch (e) {
    if (!(e instanceof GolfisticsError)) console.error("booking check", e instanceof Error ? e.name : "unknown");
    return "error";
  } finally {
    await release();
  }
}

async function run(userId: string, o: CheckOpts): Promise<CheckResult> {
  const previous = await lastChecked(userId);
  let accs = await q(`select a.id, a.club_id, a.matricula, a.source, a.password_enc, a.gender, c.base_url, c.code club_code
    from club_account a join club c on c.id=a.club_id where a.user_id=$1 and a.password_enc is not null`, [userId]);
  if (o.teeId) {
    const [tee] = await q(`select club_account_id from tee_time where id=$1 and user_id=$2 and source='club'`, [o.teeId, userId]);
    if (!tee) return empty({ last_checked_at: previous, message: "Tee time no encontrado" });
    accs = accs.filter((a: any) => String(a.id) === String(tee.club_account_id));
    if (!accs.length) return empty({ last_checked_at: previous, message: "No hay una clave guardada para leer esta reserva." });
  }
  if (!accs.length) return empty({ status: "no_account", last_checked_at: previous, message: "No hay una matrícula vinculada para leer reservas." });
  const light = companionMode(o.players ? "players" : "visit").light;
  const before = await snap(userId);
  let ok = 0, failed = 0, busy = 0;
  const seen = new Set<string>();
  for (const a of accs) {
    const group = a.source === "app" ? `app:${a.matricula}` : `site:${a.id}`;
    if (a.source === "app" && seen.has(group)) continue;
    if (a.source === "app") {
      seen.add(group);
      const mates = accs.filter((x: any) => x.source === "app" && x.matricula === a.matricula);
      const token = newLeaseToken();
      const lease = await claimLoginLease(q, `app:${userId}:${a.matricula}`, token, userId, null);
      if (lease === "held") { busy += mates.length; continue; }
      try {
        const A = await new GolfisticsApp(a.matricula, decryptSecret(a.password_enc)).login();
        await A.listClubs();
        for (const mate of mates) {
          if (!mate.club_code || !A.clubs.some((c: { cc: string }) => c.cc === mate.club_code)) { failed++; continue; }
          try {
            const g = await A.openClub(mate.club_code, { gender: mate.gender });
            const st = await syncBookings(userId, mate, g, await coursesOf(mate.club_id), { light });
            if (st === "error") failed++; else ok++;
          } catch { failed++; }
        }
      } catch (e) {
        failed += mates.length;
        if (!(e instanceof GolfisticsError)) console.error("booking check: app", e instanceof Error ? e.name : "unknown");
      } finally {
        if (lease === "acquired") await releaseLoginLease(q, `app:${userId}:${a.matricula}`, token);
      }
      continue;
    }
    const st = await readAccount(userId, a, light);
    if (st === "busy") busy++;
    else if (st === "error") failed++;
    else ok++;
  }
  if (!ok) {
    return empty({
      status: busy && !failed ? "busy" : "error",
      players_read: false,
      last_checked_at: previous,
      failed,
      message: busy && !failed ? "Hay una lectura del club en curso." : (SYNC_BUSY_MESSAGE && failed ? "No pudimos verificar las reservas." : "No pudimos verificar las reservas."),
    });
  }
  const after = await snap(userId);
  const delta = diffSnaps(before, after, userId);
  try { await enrollScorecardFetches(); } catch (e) { console.error("booking reconcile", e instanceof Error ? e.name : "unknown"); }
  const checked = await lastChecked(userId);
  return {
    status: "checked", fresh: true, players_read: !light, checked_at: checked, last_checked_at: previous,
    ...delta, failed, message: null,
  };
}

export function checkBookings(userId: string, o: CheckOpts = {}): Promise<CheckResult> {
  const key = `${userId}:${o.players ? "players" : "visit"}:${o.teeId || "*"}`;
  return shareFlight(flights, key, () => run(userId, o));
}
