/**
 * Human-readable club and course names for GPS course lists (iOS "Jugar", web Cancha/GPS, admin).
 * Golfistics ViewMaster only gives "Club 118" + "JOCKEY COLORADA"; we turn that into club "Jockey Club Argentino" + course "Colorada".
 * Club name priority: ar_club_directory (by AAG code) → Golflet club → Golfistics (if it isn't the "Club NNN" placeholder) → "Club NNN".
 */
import { q } from "./db";

const LOWER = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "en", "a", "al"]);
const UPPER = new Set(["GC", "CC", "CG", "AAG", "YPF", "UADE", "SA", "II", "III", "IV", "VI", "VII", "VIII", "IX", "XI", "XII", "USA", "UK"]);

/** "CLUB AT. ESTUDIANTES DE LA PLATA" → "Club At. Estudiantes de La Plata". Keeps accents; never adds one. */
export function titleCase(s: string | null | undefined): string {
  if (!s) return "";
  const words = s.trim().replace(/\s+/g, " ").split(" ");
  return words.map((w, i) => w.split(/([-/])/).map(part => {
    if (part === "-" || part === "/") return part;
    const up = part.toLocaleUpperCase("es-AR"), lo = part.toLocaleLowerCase("es-AR");
    if (UPPER.has(up.replace(/\./g, ""))) return up;
    if (i > 0 && LOWER.has(lo) && words.length > 1) return lo === "la" || lo === "las" || lo === "los" || lo === "el" ? (isPlaceArticle(words, i) ? cap(lo) : lo) : lo;
    if (/^\d/.test(part)) return lo;
    return cap(lo);
  }).join("")).join(" ");
}
const cap = (w: string) => w ? w.charAt(0).toLocaleUpperCase("es-AR") + w.slice(1) : w;
/** "de La Plata", "de Los Andes": an article right after "de"/"del" begins a place name. */
const isPlaceArticle = (words: string[], i: number) => i > 0 && /^(de|del)$/i.test(words[i - 1]);

export const isPlaceholderClub = (s: string | null | undefined) => !s || /^club\s*\d+$/i.test(s.trim());

/** Words shared at the start of every course name of one club ("JOCKEY", "MAR DEL PLATA"); only when the club has 2+ courses. */
export function commonPrefix(names: string[]): string[] {
  if (names.length < 2) return [];
  const split = names.map(n => n.trim().toUpperCase().split(/\s+/));
  const out: string[] = [];
  for (let i = 0; ; i++) {
    const w = split[0][i]; if (!w || split.some(s => s[i] !== w || s.length <= i + 1)) break;
    out.push(w);
  }
  while (out.length && /^(CANCHA|RECORRIDO|COURSE)$/.test(out[out.length - 1])) out.pop();   // "Cancha Vieja", not "Vieja"
  return out;
}

/**
 * Course label within its club. Single-course club → the club name. Multi-course → the distinguishing part
 * ("JOCKEY COLORADA" → "Colorada", "MAR DEL PLATA CANCHA VIEJA" → "Cancha Vieja"); a Golflet course name wins when we have one.
 */
export function courseLabel(vm: string, siblings: string[], clubName: string, ours?: string | null): string {
  if (ours && ours.trim() && siblings.length > 1) return titleCase(ours) === ours.toUpperCase() ? titleCase(ours) : ours.trim();
  if (siblings.length <= 1) return clubName;
  const pre = commonPrefix(siblings);
  const rest = vm.trim().split(/\s+/).slice(pre.length).join(" ");
  return titleCase(rest || vm);
}

export type ClubNameSources = { directory?: string | null; golflet?: string | null; golfistics?: string | null };
export function clubDisplayName(code: string, s: ClubNameSources): string {
  if (s.directory && s.directory.trim()) return titleCase(s.directory);
  if (s.golflet && s.golflet.trim()) return s.golflet.trim();
  if (!isPlaceholderClub(s.golfistics)) return titleCase(s.golfistics!);
  return `Club ${code}`;
}

/** Club names for many AAG codes at once (directory → Golflet club → Golfistics name given by the caller). */
export async function clubNames(codes: string[]): Promise<Map<string, ClubNameSources>> {
  const out = new Map<string, ClubNameSources>();
  if (!codes.length) return out;
  const [dir, ours] = await Promise.all([
    q(`select aag_code, name from ar_club_directory where aag_code = any($1)`, [codes]).catch(() => []),
    q(`select code, name from club where code = any($1)`, [codes]),
  ]);
  for (const c of codes) out.set(c, {});
  for (const r of dir as any[]) out.get(r.aag_code)!.directory = r.name;
  for (const r of ours as any[]) out.get(r.code)!.golflet = r.name;
  return out;
}

/** The naming fields added to every GPS course item. */
export function namingFields(code: string, vm: string, siblings: string[], src: ClubNameSources, ours?: string | null) {
  const club_name = clubDisplayName(code, src);
  const course_label = courseLabel(vm, siblings, club_name, ours);
  const single = siblings.length <= 1;
  return { club_code: code, club_name, course_label, club_course_count: Math.max(1, siblings.length), display_name: single ? club_name : `${club_name} · ${course_label}` };
}
