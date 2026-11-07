/** Tee times: the player's own bookings read from each linked club (misreservas.php). No manual entries. See API_v5 §20. */
import { q } from "./db";
import { HttpError } from "./http-error";
import { titleCase, commonPrefix } from "./course-names";
import { nowAR, teeHandicaps } from "./tee-times-core";
import { modalityKey, CALC_MODALITIES, MODALITY_LABEL } from "./club-pages";
import { buildData } from "./data";

const COLS = `t.id, t.date::text date, t.time, t.club_key, t.course_id, t.club_name, t.course_label, t.companions, t.source, t.club_account_id, t.start_hole, t.modality, t.event_name, t.course_how, t.seen_at, t.created_at, t.updated_at`;
const out = (r: any) => ({ ...r, display_name: r.course_label ? `${r.club_name} · ${r.course_label}` : r.club_name, starts_at: `${r.date}T${r.time}:00-03:00` });

/** Directory for the picker: clubs (effective name, title-cased) with their courses; the player's clubs first. Read-only. */
export async function teeDirectory(userId: string) {
  const [clubs, courses, ovs, mine] = await Promise.all([
    q(`select key, name, fields, city, province, golflet_club_id from ar_club_directory`),
    q(`select id, club_key, name, holes from ar_course_directory order by name`),
    q(`select club_key, value from ar_club_override where field='name'`).catch(() => []),
    q(`select distinct club_id from club_account where user_id=$1`, [userId]),
  ]);
  const ovName = new Map((ovs as any[]).map(o => [o.club_key, typeof o.value === "string" ? o.value : o.value?.value ?? null]));
  const my = new Set(mine.map((m: any) => m.club_id));
  const byClub = new Map<string, any[]>(); for (const c of courses) byClub.set(c.club_key, [...(byClub.get(c.club_key) || []), c]);
  return clubs.map((c: any) => {
    const name = ovName.get(c.key) || c.name; if (!name) return null;
    const club_name = titleCase(name), cs = byClub.get(c.key) || [], pre = commonPrefix(cs.map((x: any) => x.name));
    return { club_key: c.key, club_name, city: c.city ? titleCase(c.city) : null, province: c.province ?? null, mine: my.has(c.golflet_club_id),
      courses: cs.length > 1 ? cs.map((x: any) => ({ id: x.id, label: titleCase(x.name.trim().split(/\s+/).slice(pre.length).join(" ") || x.name), holes: x.holes })) : [] };
  }).filter(Boolean).sort((a: any, b: any) => Number(b.mine) - Number(a.mine) || a.club_name.localeCompare(b.club_name, "es"));
}
/** Tee data (slope, rating, par, stroke index) for a directory club/course, from the Golflet course synced from the club's cards. Null when we don't have it. */
export async function courseTeeData(clubKey: string, courseId: number | null) {
  let row: any = null;
  if (courseId != null) { const [d] = await q(`select golflet_club_id, golflet_course_name from ar_course_directory where id=$1 and club_key=$2`, [courseId, clubKey]);
    if (d?.golflet_club_id && d.golflet_course_name) [row] = await q(`select club_id, name, par, tees, holes from course where club_id=$1 and lower(name)=lower($2)`, [d.golflet_club_id, d.golflet_course_name]); }
  else { const [c] = await q(`select golflet_club_id from ar_club_directory where key=$1`, [clubKey]);
    if (c?.golflet_club_id) { const cs = await q(`select club_id, name, par, tees, holes from course where club_id=$1`, [c.golflet_club_id]); if (cs.length === 1) row = cs[0]; } }
  if (!row || !row.tees || !Object.keys(row.tees).length) return null;
  return { golflet_course_key: `${row.club_id}:${row.name}`, par: row.par ?? null, tees: row.tees as Record<string, any>, holes: (row.holes || []).map((h: any) => ({ hole: h.hole, hcp: h.hcp, par: h.par ?? null })) };
}
export async function playerHI(userId: string) { const D: any = await buildData(userId); const v = D.player?.handicap_index ?? (D.hi_history || []).at(-1)?.hi ?? null; return v == null ? null : Number(v); }
export async function teeOptions(userId: string, clubKey: string, courseId: number | null, selected?: string | null) {
  const [td, hi] = await Promise.all([courseTeeData(clubKey, courseId), playerHI(userId)]);
  return { hi, golflet_course_key: td?.golflet_course_key ?? null, par: td?.par ?? null, data_source: td ? "Slope y course rating de las tarjetas del club" : null,
    tees: td ? teeHandicaps(hi, td.par, td.tees, td.holes, selected) : [],
    note: td ? (hi == null ? "Sin Hándicap Index no podemos calcular el hándicap de cancha." : null) : "No tenemos slope ni course rating de esta cancha: elegí la salida a mano." };
}
export async function listTeeTimes(userId: string, scope: string, limit: number) {
  const n = nowAR();
  const cond = scope === "past" ? `(t.date < $2::date or (t.date = $2::date and t.time < $3))` : scope === "all" ? "($2::date is not null or $3::text is not null)" : `(t.date > $2::date or (t.date = $2::date and t.time >= $3))`;
  const rows = await q(`select ${COLS} from tee_time t where t.user_id=$1 and t.source='club' and t.gone_at is null and ${cond} order by t.date ${scope === "past" ? "desc" : "asc"}, t.time ${scope === "past" ? "desc" : "asc"} limit $4`, [userId, n.date, n.time, limit]);
  return rows.map(out);
}
export async function getTeeTime(userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "Tee time no encontrado");
  const [r] = await q(`select ${COLS} from tee_time t where t.id=$1 and t.user_id=$2 and t.source='club'`, [id, userId]);
  if (!r) throw new HttpError(404, "Tee time no encontrado");
  return out(r);
}
/** Per linked club: what each club page gave on the last sync (bookings, companions, hi_history, calculator). */
export async function clubSources(userId: string) {
  const rows = await q(`select a.id club_account_id, c.name club, s.page, s.status, s.message, s.items, s.checked_at
    from club_account a join club c on c.id=a.club_id left join club_page_status s on s.club_account_id=a.id where a.user_id=$1 and (s.page is null or s.page <> 'booking_check') order by c.name, s.page`, [userId]);
  const by = new Map<string, any>();
  for (const r of rows) { const k = r.club_account_id; if (!by.has(k)) by.set(k, { club_account_id: k, club_name: r.club, pages: {} as any });
    if (r.page) by.get(k).pages[r.page] = { status: r.status, message: r.message, items: r.items, checked_at: r.checked_at }; }
  return [...by.values()];
}

/** Official playing handicap from the club's calculator for this course: tee → { modality → value }. */
export async function officialTees(accountId: string | null, course: string | null) {
  if (!accountId || !course) return null;
  const rows = await q(`select tee, gender, modality, playing_hcp, slope, course_rating, par, hi, fetched_at from playing_hcp where club_account_id=$1 and lower(course)=lower($2)`, [accountId, course]);
  if (!rows.length) return null;
  const by = new Map<string, any>();
  for (const r of rows) { const k = `${r.tee}|${r.gender || ""}`; const t = by.get(k) || { tee: r.tee, gender: r.gender, slope: null, course_rating: null, par: null, hi: r.hi, fetched_at: r.fetched_at, modalities: {} as Record<string, number> };
    t.modalities[r.modality] = r.playing_hcp; if (r.modality === "medal18") { t.slope = r.slope; t.course_rating = r.course_rating; t.par = r.par; } by.set(k, t); }
  return [...by.values()];
}
const strokesFor = (ph: number | null, holes: { hole: number; hcp?: number | null }[]) => {
  const idx = holes.filter(h => Number.isInteger(h.hcp) && h.hcp! >= 1 && h.hcp! <= 18);
  if (ph == null || idx.length !== 18) return null;
  return idx.slice().sort((a, b) => a.hole - b.hole).map(h => ph < 0 ? { hole: h.hole, strokes: h.hcp! > 18 + ph ? -1 : 0 } : { hole: h.hole, strokes: Math.floor(ph / 18) + (h.hcp! <= ph % 18 ? 1 : 0) });
};

export const CURRENT_WINDOW_H = 3;
/** The tee time starting within ±3 h of now (closest first) + its course's tees with the player's handicap per tee. */
export async function currentTeeTime(userId: string, o: { tee?: string | null; modality?: string | null } = {}) {
  const [r] = await q(`select ${COLS} from tee_time t where t.user_id=$1 and t.source='club' and t.gone_at is null
      and ((t.date + t.time::time) at time zone 'America/Argentina/Buenos_Aires') between now() - interval '${CURRENT_WINDOW_H} hours' and now() + interval '${CURRENT_WINDOW_H} hours'
    order by abs(extract(epoch from ((t.date + t.time::time) at time zone 'America/Argentina/Buenos_Aires') - now())) limit 1`, [userId]);
  const base = { window_hours: CURRENT_WINDOW_H, display_only: true, note_official: "Solo para mostrar en esta ronda: las métricas oficiales salen únicamente de las tarjetas presentadas." };
  if (!r) return { ...base, tee_time: null };
  const t = out(r);
  return { ...base, tee_time: t, ...(await teesFor(userId, t, o)) };
}
/** Tees of a booking's course with the playing handicap: official (club calculator) when available, else our WHS formula marked estimated. */
export async function teesFor(userId: string, t: any, o: { tee?: string | null; modality?: string | null } = {}) {
  const fromBooking = modalityKey(t.modality);
  const modality = o.modality && (CALC_MODALITIES as readonly string[]).includes(o.modality) ? o.modality : fromBooking ?? "medal18";
  const modality_source = o.modality && modality === o.modality ? "elegida" : fromBooking ? "reserva" : "por defecto";
  const td = t.club_key ? await courseTeeData(t.club_key, t.course_id) : null, holes = td?.holes || [];
  const off = await officialTees(t.club_account_id, t.course_label);
  const course = { club_key: t.club_key, course_id: t.course_id, display_name: t.display_name, course_label: t.course_label, golflet_course_key: td?.golflet_course_key ?? null, par: td?.par ?? off?.[0]?.par ?? null };
  const sel = (tee: string) => !!o.tee && o.tee.toLowerCase() === tee.toLowerCase();
  const modalities = CALC_MODALITIES.map(k => ({ key: k, label: MODALITY_LABEL[k] }));
  const mInfo = { modality, modality_label: MODALITY_LABEL[modality], modality_source, booking_modality: t.modality ?? null, modalities };
  if (off) {
    const tees = off.map(x => { const ph = x.modalities[modality] ?? null;
      return { tee: x.tee, gender: x.gender, slope: x.slope, course_rating: x.course_rating, par: x.par, playing_handicap: ph, modalities: x.modalities, source: "club", estimated: false, missing: ph == null ? ["modality"] : [],
        strokes_by_hole: modality.startsWith("medal9") ? null : strokesFor(ph, holes), selected: sel(x.tee), hi: x.hi, fetched_at: x.fetched_at }; })
      .sort((a, b) => (b.course_rating ?? 0) - (a.course_rating ?? 0));
    return { hi: off[0].hi, course, tees, ...mInfo, source: "club", data_source: "Calculadora de hándicap de juego de tu club (oficial)", note: fromBooking == null && t.modality ? `La reserva es ${t.modality}: ese formato depende del compañero, mostramos ${MODALITY_LABEL[modality]}.` : null };
  }
  const o2 = t.club_key ? await teeOptions(userId, t.club_key, t.course_id, o.tee) : { hi: null, tees: [], note: "No sabemos en qué cancha es esta reserva.", golflet_course_key: null, par: null };
  return { hi: o2.hi, course, tees: o2.tees.map((x: any) => ({ ...x, source: "estimado", estimated: true })), ...mInfo, modality: "medal18", modality_label: MODALITY_LABEL.medal18, source: o2.tees.length ? "estimado" : null,
    data_source: o2.tees.length ? "Estimado con la fórmula WHS (slope y course rating de las tarjetas del club): la calculadora del club no estaba disponible" : null, note: o2.note };
}
