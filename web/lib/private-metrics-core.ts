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
export type TimeSource = "reservation" | "card" | "track";
export type PastTee = { id: string; date: string; time: string; club_name: string | null; course_label: string | null; companions: Companion[] | string[]; round_id: string | null; differential: number | null; gross: number | null; scores?: ScoreTally | null; time_source?: TimeSource | null };

/** A real HH:MM. Anything else, including a tee color, is not a time. */
export function clockHHMM(value: unknown): string | null {
  const m = /^(\d{2}):(\d{2})/.exec(String(value ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${m[1]}:${m[2]}`;
}

/** Reservation, then a time stored on the card, then a TRACK start. Never a guess. */
export function cardClock(parts: { reservation?: unknown; card?: unknown; track?: unknown }): { time: string | null; source: TimeSource | null } {
  const reservation = clockHHMM(parts.reservation);
  if (reservation) return { time: reservation, source: "reservation" };
  const card = clockHHMM(parts.card);
  if (card) return { time: card, source: "card" };
  const track = clockHHMM(parts.track);
  if (track) return { time: track, source: "track" };
  return { time: null, source: null };
}

/** Group average minus the player's average. Negative means a lower differential. Needs ≥3 cards. */
export function scoreImpact(avg: number | null, overall: number | null, n: number): number | null {
  if (avg == null || overall == null || n < MIN_PERF) return null;
  return Math.round((avg - overall) * 10) / 10;
}
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

const sourceOf = (t: PastTee): TimeSource | null => t.time_source ?? (hourBand(t.time) ? "reservation" : null);

export function privateMetrics(tees: PastTee[]) {
  const timed = tees.filter(t => hourBand(t.time));
  const unknown = tees.length - timed.length;
  const sources = {
    reservation: tees.filter(t => sourceOf(t) === "reservation").length,
    card: tees.filter(t => sourceOf(t) === "card").length,
    track: tees.filter(t => sourceOf(t) === "track").length,
    unknown,
  };
  const overall = mean(tees.filter(t => t.differential != null).map(t => t.differential!));
  const bands = BANDS.map(([k, label]) => {
    const g = timed.filter(t => hourBand(t.time) === k), m = g.filter(t => t.differential != null);
    const avg = m.length >= MIN_PERF ? mean(m.map(t => t.differential!)) : null;
    return { key: k, label, played: g.length, matched: m.length, avg_diff: avg, impact: scoreImpact(avg, overall, m.length), scores: mix(g) };
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
    .map(p => {
      const avg = p.diffs.length >= MIN_PERF ? mean(p.diffs) : null;
      return { key: p.key, name: p.name, count: p.count, matched: p.diffs.length, avg_diff: avg, impact: scoreImpact(avg, overall, p.diffs.length), last_date: p.last, scores: mix(p.rows) };
    });
  const matched = timed.filter(t => t.differential != null);
  return { played: timed.length, cards: tees.length, unknown, sources, matched: matched.length, overall_avg_diff: overall, min_perf: MIN_PERF, bands, partners, unit: "salidas" as const };
}
