/** Pure catalog search for «Empezar ronda». Rows come from the existing ViewMaster list.
 *  Matching does not create a membership and does not invent a course. */
import { slug } from "./viewmaster-parse";
import { courseLabel, clubDisplayName } from "./course-names";

export type CatalogRow = { club_code: string; club: string; vm_course: string };
export type CatalogHit = CatalogRow & { course_id: string; club_name: string; course_label: string };

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

export function matchCatalog(rows: CatalogRow[], query: string, limit = 12): { hits: CatalogHit[]; catalog: number; clubs: number; truncated: boolean; reason: "short" | "ok" } {
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
    unique.push({ club_code: code, club: String(r.club || "").trim(), vm_course: vm });
    const list = siblings.get(code) || [];
    list.push(vm);
    siblings.set(code, list);
  }
  const clubs = new Set(unique.map(r => r.club_code)).size;
  const q = fold(query);
  const tokens = q.split(" ").filter(t => t.length >= 2);
  if (q.length < 2 || !tokens.length) return { hits: [], catalog: unique.length, clubs, truncated: false, reason: "short" };
  const scored = unique.flatMap(r => {
    const clubName = clubDisplayName(r.club_code, { golfistics: r.club });
    const label = courseLabel(r.vm_course, siblings.get(r.club_code) || [r.vm_course], clubName);
    const hay = fold(`${clubName} ${r.club} ${label} ${r.vm_course}`);
    if (!tokens.every(t => hay.includes(t))) return [];
    const courseHit = tokens.every(t => fold(`${label} ${r.vm_course}`).includes(t));
    return [{ ...r, course_id: slug(r.club_code, r.vm_course), club_name: clubName, course_label: label, courseHit }];
  });
  scored.sort((a, b) => Number(b.courseHit) - Number(a.courseHit) || a.club_name.localeCompare(b.club_name, "es") || a.course_label.localeCompare(b.course_label, "es"));
  const cap = Math.max(1, Math.min(30, limit));
  const hits = scored.slice(0, cap).map(h => ({ club_code: h.club_code, club: h.club, vm_course: h.vm_course, course_id: h.course_id, club_name: h.club_name, course_label: h.course_label }));
  return { hits, catalog: unique.length, clubs, truncated: scored.length > cap, reason: "ok" };
}
