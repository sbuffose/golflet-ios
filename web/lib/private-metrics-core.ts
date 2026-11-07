/** PRIVATE metrics (t136u/t137u), pure. Only ever computed for the owner's own session. */
export const BANDS = [["manana", "Mañana", 0, 11], ["mediodia", "Mediodía", 11, 14], ["tarde", "Tarde", 14, 24]] as const;
export const MIN_PERF = 3;    // average shown only with ≥3 matched rounds
export function hourBand(time: string | null | undefined) {
  const m = /^(\d{2}):(\d{2})$/.exec(time || ""); if (!m) return null;
  const h = +m[1] + +m[2] / 60; return BANDS.find(([, , a, b]) => h >= a && h < b)?.[0] ?? null;
}
export const partnerKey = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
export type PastTee = { id: string; date: string; time: string; club_name: string | null; course_label: string | null; companions: { name: string }[]; round_id: string | null; differential: number | null; gross: number | null };
const mean = (a: number[]) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 10) / 10 : null;
export function privateMetrics(tees: PastTee[]) {
  const bands = BANDS.map(([k, label]) => {
    const g = tees.filter(t => hourBand(t.time) === k), m = g.filter(t => t.differential != null);
    return { key: k, label, played: g.length, matched: m.length, avg_diff: m.length >= MIN_PERF ? mean(m.map(t => t.differential!)) : null };
  });
  const pm = new Map<string, { key: string; name: string; count: number; diffs: number[]; last: string }>();
  for (const t of tees) for (const c of t.companions || []) {
    const name = typeof c === "string" ? c : c?.name; if (!name) continue; const k = partnerKey(name); if (!k) continue;
    const e = pm.get(k) || { key: k, name, count: 0, diffs: [], last: t.date }; e.count++; if (t.differential != null) e.diffs.push(t.differential); if (t.date > e.last) e.last = t.date; pm.set(k, e);
  }
  const partners = [...pm.values()].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last) || a.name.localeCompare(b.name))
    .map(p => ({ key: p.key, name: p.name, count: p.count, matched: p.diffs.length, avg_diff: p.diffs.length >= MIN_PERF ? mean(p.diffs) : null, last_date: p.last }));
  const matched = tees.filter(t => t.differential != null);
  return { played: tees.length, matched: matched.length, overall_avg_diff: mean(matched.map(t => t.differential!)), min_perf: MIN_PERF, bands, partners };
}
