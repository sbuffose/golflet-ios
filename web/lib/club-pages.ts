/** Parsers for the player's own club pages on the Golfistics platform (same paths on every club host: <host>/golf/<page>.php).
 *  Pure, no I/O. Pages: misreservas.php (bookings), misjugadoresporlinea.php (companions), torneoshabilitadosparareservas.php
 *  (date/course/modality of each bookable event), calculadorahcpjuego.php (official playing handicap; compute-only). */
const clean = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&nbsp;|\u00a0/g, " ").replace(/&aacute;/g, "á").replace(/&eacute;/g, "é").replace(/&iacute;/g, "í").replace(/&oacute;/g, "ó").replace(/&uacute;/g, "ú").replace(/&ntilde;/g, "ñ").replace(/&amp;/g, "&").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
const WD: Record<string, number> = { dom: 0, lun: 1, mar: 2, mie: 3, mié: 3, jue: 4, vie: 5, sab: 6, sáb: 6 };

export type BookingRow = { torneo_id: string; player_id: string; weekday: number | null; day: number | null; time: string; start_hole: number | null; raw: string };
/** misreservas.php → bookings + the player name in the header (to drop them from the companions). `none` = the page says there are none. */
export function parseBookings(html: string) {
  const none = /No hay Reservas Registradas/i.test(html);
  const header = (html.match(/Pr[oó]ximas Reservas[\s\S]*?<font[^>]*>([^<]+)<\/font>/i) || [])[1]?.trim() || null;
  const rows: BookingRow[] = []; const seen = new Set<string>();
  for (const m of html.matchAll(/<a href="misjugadoresporlinea\.php\?TorneoID=(\d+)&(?:amp;)?PlayerID=(\d+)"[^>]*>([\s\S]*?)<\/td>/gi)) {
    const text = clean(m[3]); if (!text) continue;
    const t = text.match(/(?:^|\s)([A-Za-zÁÉÍÓÚáéíóú]{3})\w*\.?\s+(\d{1,2})\s+(\d{1,2}):(\d{2})(?:\s+Hoyo\s+(\d{1,2}))?/i);
    if (!t) continue;
    const key = `${m[1]}|${t[3]}:${t[4]}`; if (seen.has(key)) continue; seen.add(key);
    rows.push({ torneo_id: m[1], player_id: m[2], weekday: WD[t[1].toLowerCase()] ?? null, day: +t[2], time: `${t[3].padStart(2, "0")}:${t[4]}`, start_hole: t[5] ? +t[5] : null, raw: text });
  }
  return { none, player_header: header, rows, recognized: none || rows.length > 0 || /Pr[oó]ximas Reservas/i.test(html) };
}

/** misjugadoresporlinea.php → the players in that line (name + HCP index as shown). */
export function parseCompanions(html: string) {
  const out: { name: string; hcp: number | null }[] = [];
  const i = html.search(/Jugadores de la L[ií]nea/i); if (i < 0) return { recognized: false, players: out };
  for (const m of html.slice(i).matchAll(/<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi)) {
    const name = clean(m[1]), h = clean(m[2]).replace(",", ".");
    if (!name || /^nombre$/i.test(name)) continue;
    out.push({ name, hcp: /^[+-]?\d+(\.\d+)?$/.test(h) ? +h : null });
  }
  return { recognized: true, players: out };
}

/** torneoshabilitadosparareservas.php → TorneoID → { date, event, modality }. Rows are anchored on reservas('ID'). */
export function parseEvents(html: string) {
  const map = new Map<string, { date: string | null; event: string | null; modality: string | null; venue: string | null }>();
  const parts = html.split(/(?=<td[^>]*>\s*<div[^>]*>\s*<a[^>]*href=javascript:reservas\(['"]\d+['"]\))/i);
  for (const p of parts) {
    const id = (p.match(/reservas\(['"](\d+)['"]\)/) || [])[1]; if (!id || map.has(id)) continue;
    const cells = p.split(/<td/i).slice(1).map(c => clean(c.replace(/^[^>]*>/, "")));
    const di = cells.findIndex(c => /^\d{2}\/\d{2}\/\d{2}$/.test(c)); if (di < 0) continue;
    const [d, mo, y] = cells[di].split("/");
    map.set(id, { date: `20${y}-${mo}-${d}`, venue: cells[di + 1] || null, event: cells[di + 2] || null, modality: cells[di + 3] || null });
  }
  return map;
}

const foldCourse = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** The course is the one the reservation source names exactly (the venue or an explicit course cell).
 *  The tournament title is not a course: no 4-letter prefix and no color square. */
export function verifiedCourse(source: { venue?: string | null; course?: string | null }, courses: string[]): { course: string | null; how: "fuente" | null } {
  const want = new Map(courses.map(c => c.trim()).filter(Boolean).map(c => [foldCourse(c), c]));
  for (const raw of [source.course, source.venue]) {
    const key = foldCourse(raw || "");
    if (key && want.has(key)) return { course: want.get(key)!, how: "fuente" };
  }
  return { course: null, how: null };
}

/** Kept for callers that still pass the tournament title. It does not infer a course from that title. */
export function courseFromEvent(_event: string | null | undefined, _courses: string[]): { course: null; how: null } {
  return { course: null, how: null };
}

/** Event date when the events page doesn't list it: the next date (from `today`, up to ~70 days) with that weekday + day of month. */
export function inferDate(weekday: number | null, day: number | null, today: string): string | null {
  if (day == null) return null;
  const t = new Date(today + "T12:00:00Z");
  for (let i = 0; i <= 70; i++) { const d = new Date(t.getTime() + i * 864e5); if (d.getUTCDate() === day && (weekday == null || d.getUTCDay() === weekday)) return d.toISOString().slice(0, 10); }
  return null;
}

export type CalcOption = { id: string; course: string; tee: string; gender: "C" | "D" | null };
/** calculadorahcpjuego.php → course/tee options + modality list + the player field default (J1). */
export function parseCalcForm(html: string) {
  const sel = (html.match(/<select name="CanchaSalida"[\s\S]*?<\/select>/i) || [""])[0];
  const seen = new Set<string>(), options: CalcOption[] = [];
  for (const m of sel.matchAll(/<option[^>]*value="([^"]+)"[^>]*>([^<]+)<\/option>/gi)) {
    const t = clean(m[2]).match(/^(.+?)\s*->\s*Tee:\s*(.+?)\s*\((Caballeros|Damas)\)/i); if (!t || seen.has(m[1] + t[1])) continue; seen.add(m[1] + t[1]);
    options.push({ id: m[1], course: t[1].trim(), tee: t[2].trim(), gender: /cab/i.test(t[3]) ? "C" : "D" });
  }
  const msel = (html.match(/<select name="modalidad"[\s\S]*?<\/select>/i) || [""])[0];
  const modalities = [...msel.matchAll(/<option[^>]*value="([^"]+)"[^>]*>([^<]+)<\/option>/gi)].map(m => ({ key: m[1], label: clean(m[2]) }));
  return { options, modalities, j1: (html.match(/name="J1"[^>]*value="([^"]*)"/i) || [])[1] ?? null, recognized: options.length > 0 && /HANDICAP DE JUEGO|CALCULO DE HANDICAP/i.test(html) };
}
/** Calculator result: playing handicap + the tee figures it used. */
export function parseCalcResult(html: string) {
  const ph = html.match(/HANDICAP DE JUEGO\s*:\s*([+-]?\d+)/i);
  const tb = html.match(/id="tabladiferen"[\s\S]*?<\/tr>\s*<tr[^>]*>\s*<td[^>]*>[^<]*<\/td>\s*<td[^>]*>\s*(\d+)\s*<\/td>\s*<td[^>]*>\s*([\d.]+)\s*<\/td>\s*<td[^>]*>\s*(\d+)\s*<\/td>/i);
  const hi = html.match(/\(\s*([+-]?\d+(?:\.\d+)?)\s*\)\s*<\/td>\s*<\/tr>\s*<tr[^>]*>\s*<td[^>]*>\s*HANDICAP DE JUEGO/i);
  return { playing_hcp: ph ? (ph[1].startsWith("+") ? -parseInt(ph[1].slice(1), 10) : parseInt(ph[1], 10)) : null,   // "+2" (plus handicap) → -2
    slope: tb ? +tb[1] : null, course_rating: tb ? +tb[2] : null, par: tb ? +tb[3] : null, hi: hi ? +hi[1] : null };
}
/** Individual modalities we precompute (pair/team ones need a partner's index). */
export const CALC_MODALITIES = ["medal18", "stableford18", "medal9ida", "medal9vta"] as const;   // "match" needs a rival: the calculator returns nothing for it
export const MODALITY_LABEL: Record<string, string> = { medal18: "Medal 18 hoyos", stableford18: "Stableford 18 hoyos", medal9ida: "Medal 9 hoyos ida", medal9vta: "Medal 9 hoyos vuelta" };
/** Booking modality text → calculator key (null for pair/team formats). */
export function modalityKey(text: string | null): string | null {
  const s = (text || "").toLowerCase();
  if (!s) return null;
  if (/four|foursome|chapman|laguneada|americano/.test(s)) return null;
  if (/stableford/.test(s)) return /9/.test(s) ? null : "stableford18";
  if (/match/.test(s)) return null;
  if (/medal|stroke/.test(s)) return /\b9\b/.test(s) ? null : "medal18";
  return null;
}
