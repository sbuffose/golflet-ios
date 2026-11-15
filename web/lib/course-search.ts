/** Pure catalog search for «Empezar ronda». Rows come from the existing ViewMaster list.
 *  Matching does not create a membership and does not invent a course. */
import { slug } from "./viewmaster-parse";
import { courseLabel, clubDisplayName, type ClubNameSources } from "./course-names";

export type CatalogRow = { club_code: string; club: string; vm_course: string; lat?: number | null; lng?: number | null };
export type CatalogHit = CatalogRow & { course_id: string; club_name: string; course_label: string };

/** Every catalog row with a real club name (directory, then Golflet, then a non-placeholder ViewMaster name). */
export function namedCatalog(rows: CatalogRow[], names?: Map<string, ClubNameSources>): CatalogHit[] {
  const seen = new Set<string>();
  const unique: CatalogRow[] = [];
  const siblings = new Map<string, string[]>();
  for (const r of rows) {
    const code = String(r.club_code || "").trim();
    const vm = String(r.vm_course || "").trim();
    if (!/^\d{1,5}$/.test(code) || !vm) continue;
    const id = slug(code, vm);
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push({ club_code: code, club: String(r.club || "").trim(), vm_course: vm, lat: r.lat ?? null, lng: r.lng ?? null });
    const list = siblings.get(code) || [];
    list.push(vm);
    siblings.set(code, list);
  }
  return unique.map(r => {
    const src = names?.get(r.club_code);
    const clubName = clubDisplayName(r.club_code, { directory: src?.directory, golflet: src?.golflet, golfistics: r.club });
    const label = courseLabel(r.vm_course, siblings.get(r.club_code) || [r.vm_course], clubName);
    return { ...r, course_id: slug(r.club_code, r.vm_course), club_name: clubName, course_label: label };
  });
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

export function matchCatalog(rows: CatalogRow[], query: string, limit = 12, names?: Map<string, ClubNameSources>): { hits: CatalogHit[]; catalog: number; clubs: number; truncated: boolean; reason: "short" | "ok" } {
  const named = namedCatalog(rows, names);
  const clubs = new Set(named.map(r => r.club_code)).size;
  const q = fold(query);
  const tokens = q.split(" ").filter(t => t.length >= 2);
  if (q.length < 2 || !tokens.length) return { hits: [], catalog: named.length, clubs, truncated: false, reason: "short" };
  const scored = named.flatMap(r => {
    const hay = fold(`${r.club_name} ${r.club} ${r.course_label} ${r.vm_course}`);
    if (!tokens.every(t => hay.includes(t))) return [];
    const courseHit = tokens.every(t => fold(`${r.course_label} ${r.vm_course}`).includes(t));
    return [{ ...r, courseHit }];
  });
  scored.sort((a, b) => Number(b.courseHit) - Number(a.courseHit) || a.club_name.localeCompare(b.club_name, "es") || a.course_label.localeCompare(b.course_label, "es"));
  const cap = Math.max(1, Math.min(30, limit));
  const hits = scored.slice(0, cap).map(({ courseHit: _courseHit, ...h }) => h);
  return { hits, catalog: named.length, clubs, truncated: scored.length > cap, reason: "ok" };
}
