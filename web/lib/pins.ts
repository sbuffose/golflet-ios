/** t162u: collaborative daily pins: DB side. Rules in pins-core.ts; API_v5 §57. */
import { q } from "./db";
import { HttpError } from "./http-error";
import { applyGreenOverride } from "./course-override";
import { artToday, onGreen, parseZone, pickFlag, pinAction, publicPin, reporterTag, validPinDate, ZONE_LABEL, type LL, type PinRow } from "./pins-core";
import { validLatLng } from "./geo";

export type Green = { front: LL | null; center: LL | null; back: LL | null };
const PIN_COLS = `id, club_code, vm_course, hole, date::text date, lat, lng, zone, source, set_by`;
const toPin = (r: any): PinRow & { club_code: string; vm_course: string } => ({ ...r, lat: Number(r.lat), lng: Number(r.lng) });
export const courseLabel = (vm: string) => vm.toLowerCase().replace(/(^|[\s-])\S/g, s => s.toUpperCase());

/** Green front/center/back per hole: club GPS map + Golflet admin corrections. */
export async function effectiveGreens(clubCode: string | null, vmCourse: string | null): Promise<Map<number, Green>> {
  if (!clubCode || !vmCourse) return new Map();
  const [r] = await q(`select holes, green_override from vm_course where club_code=$1 and vm_course=$2`, [clubCode, vmCourse]);
  const hs = applyGreenOverride((r?.holes || []).filter((h: any) => h.center), r?.green_override);
  return new Map(hs.map((h: any) => [Number(h.hole), { front: h.front ?? null, center: h.center ?? null, back: h.back ?? null }]));
}
export async function dayPins(clubCode: string, vmCourse: string, date: string) {
  const rows = await q(`select ${PIN_COLS} from course_pin where club_code=$1 and vm_course=$2 and date=$3::date`, [clubCode, vmCourse, date]);
  return new Map(rows.map((r: any) => [Number(r.hole), toPin(r)]));
}

/** Per live round: which flag each hole uses (club > own marked > other player's pin of the day). Center fallback is applied by the callers. */
export async function flagsForLive(lv: { id: string; club_code: string | null; vm_course: string | null; date: string }[], own: Map<string, Record<number, LL>>) {
  const keys = [...new Set(lv.filter(l => l.club_code && l.vm_course).map(l => `${l.club_code}|${l.vm_course}|${l.date}`))];
  const pins = new Map<string, PinRow>();
  if (keys.length) {
    const rows = await q(`select ${PIN_COLS} from course_pin where (club_code||'|'||vm_course||'|'||date::text) = any($1::text[])`, [keys]);
    for (const r of rows) pins.set(`${r.club_code}|${r.vm_course}|${r.date}|${r.hole}`, toPin(r));
  }
  const out = new Map<string, Record<number, { lat: number; lng: number; source: "club" | "player_marked" | "day_pin" }>>();
  for (const l of lv) { const o: Record<number, any> = {};
    for (let h = 1; h <= 18; h++) { const f = pickFlag(pins.get(`${l.club_code}|${l.vm_course}|${l.date}|${h}`) ?? null, own.get(l.id)?.[h] ?? null, null);
      if (f.flag && f.source) o[h] = { lat: f.flag.lat, lng: f.flag.lng, source: f.source }; }
    out.set(l.id, o); }
  return out;
}

/* ---------- players ---------- */
type Live = { id: string; user_id?: string; club_code: string | null; vm_course: string | null; date: string };
function needCourse(l: Live) { if (!l.club_code || !l.vm_course) throw new HttpError(400, "Esta ronda no tiene cancha con mapa de greens"); }
function needToday(l: Live) { if (String(l.date).slice(0, 10) !== artToday()) throw new HttpError(400, "La bandera se marca el mismo día que jugás"); }
function fix(b: any) { const p = validLatLng(b?.lat, b?.lng); if (!p) throw new HttpError(400, "Posición inválida");
  const acc = b.accuracy_m == null ? null : Number(b.accuracy_m); if (acc != null && (!Number.isFinite(acc) || acc < 0 || acc > 5000)) throw new HttpError(400, "Precisión inválida");
  return { ...p, accuracy_m: acc }; }

/** Hole info for the live round screen: day pin (public shape) + what the button does. */
export async function pinStateFor(l: Live, me: string) {
  if (!l.club_code || !l.vm_course) return new Map<number, { day_pin: any; pin_action: string }>();
  const date = String(l.date).slice(0, 10), pins = await dayPins(l.club_code, l.vm_course, date);
  const rep = new Set((await q(`select hole from pin_report where user_id=$1 and club_code=$2 and vm_course=$3 and date=$4::date`, [me, l.club_code, l.vm_course, date])).map((r: any) => Number(r.hole)));
  const today = date === artToday();
  return new Map(Array.from({ length: 18 }, (_, i) => i + 1).map(h => { const p = pins.get(h) ?? null;
    return [h, { day_pin: publicPin(p, me), pin_action: today ? pinAction(p, me, rep.has(h)) : "none" }]; }));
}

/** "Estoy en la bandera" + Adelante/Medio/Fondo. First player of the day sets it for everyone; the setter can correct it; otherwise 409. */
export async function markDayPin(me: string, l: Live, hole: number, b: any) {
  needCourse(l); needToday(l);
  const p = fix(b), zone = parseZone(b?.zone);
  if (p.accuracy_m != null && p.accuracy_m > 40) throw new HttpError(400, "La señal GPS es débil (±" + Math.round(p.accuracy_m) + " m). Esperá unos segundos y probá de nuevo.");
  const g = (await effectiveGreens(l.club_code, l.vm_course)).get(hole) ?? null;
  if (!onGreen(p, g)) throw new HttpError(400, "Estás lejos del green de este hoyo. Marcá la bandera parado al lado del hoyo.");
  const date = artToday();
  const [ins] = await q(`insert into course_pin (club_code, vm_course, hole, date, lat, lng, accuracy_m, zone, source, set_by) values ($1,$2,$3,$4::date,$5,$6,$7,$8,'player',$9)
    on conflict (club_code, vm_course, hole, date) do nothing returning ${PIN_COLS}`, [l.club_code, l.vm_course, hole, date, p.lat, p.lng, p.accuracy_m, zone, me]);
  let pin = ins ? toPin(ins) : null;
  if (!pin) {
    const [cur] = await q(`select ${PIN_COLS} from course_pin where club_code=$1 and vm_course=$2 and hole=$3 and date=$4::date`, [l.club_code, l.vm_course, hole, date]);
    if (cur.source === "club") throw new HttpError(409, "La bandera de hoy la cargó el club");
    if (cur.set_by !== me) throw Object.assign(new HttpError(409, "Otro jugador ya marcó la bandera de hoy en este hoyo"), { pin: publicPin(toPin(cur), me) });
    const [up] = await q(`update course_pin set lat=$2, lng=$3, accuracy_m=$4, zone=$5, updated_at=now() where id=$1 returning ${PIN_COLS}`, [cur.id, p.lat, p.lng, p.accuracy_m, zone]);
    pin = toPin(up);
  }
  await q(`insert into live_hole (live_round_id, hole, pin_lat, pin_lng, pin_accuracy_m, pin_at) values ($1,$2,$3,$4,$5,now())
    on conflict (live_round_id, hole) do update set pin_lat=excluded.pin_lat, pin_lng=excluded.pin_lng, pin_accuracy_m=excluded.pin_accuracy_m, pin_at=now(), updated_at=now()`, [l.id, hole, p.lat, p.lng, p.accuracy_m]);
  return publicPin(pin, me);
}

/** "Bandera mal registrada": one report per player per hole per day; only for another player's pin (club pins can't be reported). */
export async function reportDayPin(me: string, l: Live, hole: number, b: any) {
  needCourse(l); needToday(l); const p = fix(b), date = artToday();
  const [cur] = await q(`select ${PIN_COLS} from course_pin where club_code=$1 and vm_course=$2 and hole=$3 and date=$4::date`, [l.club_code, l.vm_course, hole, date]);
  if (!cur) throw new HttpError(404, "Todavía no hay bandera de hoy en este hoyo");
  if (cur.source === "club") throw new HttpError(409, "La bandera de hoy la cargó el club");
  if (cur.set_by === me) throw new HttpError(400, "La marcaste vos: podés volver a marcarla");
  const [r] = await q(`insert into pin_report (club_code, vm_course, hole, date, pin_id, user_id, lat, lng, accuracy_m, pin_lat, pin_lng, pin_zone, pin_source)
    values ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10,$11,$12,$13) on conflict (user_id, club_code, vm_course, hole, date) do nothing returning id`,
    [l.club_code, l.vm_course, hole, date, cur.id, me, p.lat, p.lng, p.accuracy_m, cur.lat, cur.lng, cur.zone, cur.source]);
  if (!r) throw new HttpError(429, "Ya reportaste la bandera de este hoyo hoy");
  return { ok: true, report_id: r.id };
}

/* ---------- clubs (role 'club') and Golflet admins ---------- */
export async function staffCourses(clubCode: string | null) {
  const rows = await q(`select v.club_code, v.vm_course, c.name club_name, jsonb_array_length(v.holes) n from vm_course v left join club c on c.code=v.club_code
    ${clubCode ? "where v.club_code=$1" : ""} order by c.name nulls last, v.vm_course`, clubCode ? [clubCode] : []);
  return rows.map((r: any) => ({ club_code: r.club_code, vm_course: r.vm_course, course_label: courseLabel(r.vm_course), club_name: r.club_name, holes: Number(r.n) || 0 }));
}
function canClub(staff: { role: string; club_code: string | null }, clubCode: string) {
  if (staff.role !== "admin" && staff.club_code !== clubCode) throw new HttpError(403, "Solo podés cargar banderas de tu club");
}
/** Club day view: green map per hole + whether a pin exists. Player pins show only "cargada por un jugador" + zone, never where the player stood. */
export async function clubDay(staff: { role: string; club_code: string | null }, clubCode: string, vm: string, date: string) {
  canClub(staff, clubCode); const [ok] = await q(`select 1 from vm_course where club_code=$1 and vm_course=$2`, [clubCode, vm]); if (!ok) throw new HttpError(404, "Cancha no encontrada");
  const greens = await effectiveGreens(clubCode, vm), pins = await dayPins(clubCode, vm, date);
  return { club_code: clubCode, vm_course: vm, course_label: courseLabel(vm), date, today: artToday(),
    holes: Array.from({ length: 18 }, (_, i) => i + 1).map(h => { const p = pins.get(h);
      return { hole: h, green: greens.get(h) ?? null, pin: !p ? null : p.source === "club" ? { source: "club", lat: p.lat, lng: p.lng, zone: p.zone, zone_label: ZONE_LABEL[p.zone] }
        : { source: "player", zone: p.zone, zone_label: ZONE_LABEL[p.zone] } }; }) };
}
export async function setClubPin(staff: { id: string; role: string; club_code: string | null }, b: any) {
  const clubCode = String(b?.club_code || ""), vm = String(b?.vm_course || ""), hole = Number(b?.hole);
  canClub(staff, clubCode); const date = validPinDate(b?.date);
  if (!Number.isInteger(hole) || hole < 1 || hole > 18) throw new HttpError(400, "Hoyo inválido");
  const p = validLatLng(b?.lat, b?.lng); if (!p) throw new HttpError(400, "Posición inválida"); const zone = parseZone(b?.zone);
  const g = (await effectiveGreens(clubCode, vm)).get(hole); if (!g) throw new HttpError(404, "No tenemos el green de ese hoyo");
  if (!onGreen(p, g)) throw new HttpError(400, "La bandera tiene que quedar sobre el green");
  const [r] = await q(`insert into course_pin (club_code, vm_course, hole, date, lat, lng, zone, source, set_by) values ($1,$2,$3,$4::date,$5,$6,$7,'club',$8)
    on conflict (club_code, vm_course, hole, date) do update set lat=excluded.lat, lng=excluded.lng, accuracy_m=null, zone=excluded.zone, source='club', set_by=excluded.set_by, moved_by_admin=false, updated_at=now()
    returning id`, [clubCode, vm, hole, date, p.lat, p.lng, zone, staff.id]);
  await q(`update pin_report set status='moved', resolved_by=$2, resolved_at=now() where pin_id=$1 and status='open'`, [r.id, staff.id]);   // the club pin replaces the reported one
  return { ok: true, id: r.id };
}
export async function deleteClubPin(staff: { role: string; club_code: string | null }, b: any) {
  const clubCode = String(b?.club_code || ""); canClub(staff, clubCode); const date = validPinDate(b?.date);
  const [r] = await q(`delete from course_pin where club_code=$1 and vm_course=$2 and hole=$3 and date=$4::date and source='club' returning id`, [clubCode, String(b?.vm_course || ""), Number(b?.hole), date]);
  if (!r) throw new HttpError(404, "No hay bandera del club en ese hoyo ese día"); return { ok: true };
}

/* ---------- Golflet admin: reports ---------- */
const REP_COLS = `r.id, r.club_code, r.vm_course, r.hole, r.date::text date, r.pin_id, r.user_id, r.lat, r.lng, r.accuracy_m, r.pin_lat, r.pin_lng, r.pin_zone, r.pin_source, r.status, r.resolved_at, r.created_at`;
const shapeRep = (r: any) => ({ id: r.id, club_code: r.club_code, vm_course: r.vm_course, course_label: courseLabel(r.vm_course), club_name: r.club_name ?? null, hole: r.hole, date: r.date, status: r.status,
  created_at: r.created_at, resolved_at: r.resolved_at, reporter: reporterTag(r.user_id), reporter_reports: r.reporter_reports ?? null,
  reporter_position: r.lat == null ? null : { lat: Number(r.lat), lng: Number(r.lng), accuracy_m: r.accuracy_m },
  reported_pin: r.pin_lat == null ? null : { lat: Number(r.pin_lat), lng: Number(r.pin_lng), zone: r.pin_zone, zone_label: ZONE_LABEL[r.pin_zone as keyof typeof ZONE_LABEL] ?? null, source: r.pin_source } });
export async function adminReports(status: string | null) {
  const rows = await q(`select ${REP_COLS}, c.name club_name, (select count(*)::int from pin_report x where x.user_id=r.user_id) reporter_reports
    from pin_report r left join club c on c.code=r.club_code ${status ? "where r.status=$1" : ""} order by (r.status='open') desc, r.created_at desc limit 300`, status ? [status] : []);
  return { reports: rows.map(shapeRep), open: (await q(`select count(*)::int n from pin_report where status='open'`))[0].n };
}
export async function adminReport(id: string) {
  const [r] = await q(`select ${REP_COLS}, c.name club_name, (select count(*)::int from pin_report x where x.user_id=r.user_id) reporter_reports
    from pin_report r left join club c on c.code=r.club_code where r.id=$1`, [id]);
  if (!r) throw new HttpError(404, "Reporte no encontrado");
  const g = (await effectiveGreens(r.club_code, r.vm_course)).get(r.hole) ?? null, cur = (await dayPins(r.club_code, r.vm_course, r.date)).get(r.hole) ?? null;
  const others = await q(`select count(*)::int n from pin_report where pin_id=$1 and id<>$2`, [r.pin_id, id]);
  return { report: shapeRep(r), green: g, current_pin: cur ? { lat: cur.lat, lng: cur.lng, zone: cur.zone, zone_label: ZONE_LABEL[cur.zone], source: cur.source, same_as_reported: cur.id === r.pin_id } : null,
    other_reports: others[0].n };
}
/** clear = delete the player pin (others can mark again) · move = put it where the admin says · dismiss = the pin was fine. */
export async function adminResolve(adminId: string, id: string, b: any) {
  const { report, current_pin } = await adminReport(id); const [r] = await q(`select pin_id from pin_report where id=$1`, [id]);
  const action = String(b?.action || "");
  if (action === "dismiss") { await q(`update pin_report set status='dismissed', resolved_by=$2, resolved_at=now() where id=$1`, [id, adminId]); return { ok: true }; }
  if (!r.pin_id || !current_pin) throw new HttpError(409, "Esa bandera ya no existe");
  if (current_pin.source === "club") throw new HttpError(409, "La bandera de ese hoyo ahora la cargó el club");
  if (action === "clear") {
    await q(`delete from course_pin where id=$1 and source='player'`, [r.pin_id]);
    await q(`update pin_report set status='cleared', resolved_by=$2, resolved_at=now() where (id=$1 or pin_id is null and club_code=$3 and vm_course=$4 and hole=$5 and date=$6::date) and status='open'`,
      [id, adminId, report.club_code, report.vm_course, report.hole, report.date]);
    return { ok: true };
  }
  if (action === "move") {
    const p = validLatLng(b?.lat, b?.lng); if (!p) throw new HttpError(400, "Posición inválida"); const zone = parseZone(b?.zone);
    const g = (await effectiveGreens(report.club_code, report.vm_course)).get(report.hole) ?? null; if (!onGreen(p, g)) throw new HttpError(400, "La bandera tiene que quedar sobre el green");
    await q(`update course_pin set lat=$2, lng=$3, zone=$4, accuracy_m=null, moved_by_admin=true, updated_at=now() where id=$1`, [r.pin_id, p.lat, p.lng, zone]);
    await q(`update pin_report set status='moved', resolved_by=$2, resolved_at=now() where pin_id=$1 and status='open'`, [r.pin_id, adminId]);
    return { ok: true };
  }
  throw new HttpError(400, "Acción inválida");
}
/** Only on purpose (button + audit): who reported. */
export async function adminReporter(id: string) {
  const [r] = await q(`select u.name, u.email from pin_report r join "user" u on u.id=r.user_id where r.id=$1`, [id]);
  if (!r) throw new HttpError(404, "Reporte no encontrado"); return r;
}
