/** PRIVATE metrics (t136u/t137u), pure. Only ever computed for the owner's own session. */
export const BANDS = [["manana", "Mañana", 0, 11], ["mediodia", "Mediodía", 11, 14], ["tarde", "Tarde", 14, 24]] as const;
export const MIN_PERF = 3;    // average shown only with ≥3 matched rounds
export function hourBand(time: string | null | undefined) {
  const m = /^(\d{2}):(\d{2})$/.exec(time || ""); if (!m) return null;
  const h = +m[1] + +m[2] / 60; return BANDS.find(([, , a, b]) => h >= a && h < b)?.[0] ?? null;
}
export const partnerKey = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
export type ScoreTally = { eagles: number | null; birdies: number; pars: number; bogeys: number; doubles: number; holes: number };
export type Companion = { name: string; player_id?: string | null; matricula?: string | null };
export type PastTee = { id: string; date: string; time: string; club_name: string | null; course_label: string | null; companions: Companion[] | string[]; round_id: string | null; differential: number | null; gross: number | null; scores?: ScoreTally | null };
const mean = (a: number[]) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 10) / 10 : null;

/** The stable id wins. Otherwise the whole source name. A shared token does not merge two people. */
export function companionKey(c: Companion | string): { key: string; name: string } | null {
  const name = typeof c === "string" ? c.trim() : String(c?.name || "").trim();
  if (!name) return null;
  const id = typeof c === "string" ? "" : String(c.player_id || c.matricula || "").trim();
  const key = id ? `id:${id}` : partnerKey(name);
  return key ? { key, name } : null;
}

function mix(rows: PastTee[]) {
  const scored = rows.filter(t => t.scores && t.scores.holes >= 9);
  if (scored.length < MIN_PERF) return null;
  const holes = scored.reduce((s, t) => s + (t.scores?.holes || 0), 0);
  const sum = (k: "birdies" | "pars" | "bogeys" | "doubles") => scored.reduce((s, t) => s + (t.scores?.[k] || 0), 0);
  const eagles = scored.every(t => t.scores?.eagles != null) ? scored.reduce((s, t) => s + (t.scores?.eagles || 0), 0) : null;
  const per18 = (n: number) => holes ? Math.round((n / holes) * 18 * 100) / 100 : null;
  return { cards: scored.length, holes, eagles: eagles == null ? null : per18(eagles), birdies: per18(sum("birdies")), pars: per18(sum("pars")), bogeys: per18(sum("bogeys")), doubles: per18(sum("doubles")) };
}

export function privateMetrics(tees: PastTee[]) {
  const bands = BANDS.map(([k, label]) => {
    const g = tees.filter(t => hourBand(t.time) === k), m = g.filter(t => t.differential != null);
    return { key: k, label, played: g.length, matched: m.length, avg_diff: m.length >= MIN_PERF ? mean(m.map(t => t.differential!)) : null, scores: mix(g) };
  });
  const pm = new Map<string, { key: string; name: string; count: number; diffs: number[]; last: string; rows: PastTee[] }>();
  for (const t of tees) for (const c of t.companions || []) {
    const who = companionKey(c as Companion | string); if (!who) continue;
    const e = pm.get(who.key) || { key: who.key, name: who.name, count: 0, diffs: [], last: t.date, rows: [] };
    e.count++; e.rows.push(t); if (t.differential != null) e.diffs.push(t.differential); if (t.date > e.last) e.last = t.date;
    if (who.name.length > e.name.length) e.name = who.name;
    pm.set(who.key, e);
  }
  const partners = [...pm.values()].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last) || a.name.localeCompare(b.name))
    .map(p => ({ key: p.key, name: p.name, count: p.count, matched: p.diffs.length, avg_diff: p.diffs.length >= MIN_PERF ? mean(p.diffs) : null, last_date: p.last, scores: mix(p.rows) }));
  const matched = tees.filter(t => t.differential != null);
  return { played: tees.length, matched: matched.length, overall_avg_diff: mean(matched.map(t => t.differential!)), min_perf: MIN_PERF, bands, partners, unit: "salidas" as const };
}
