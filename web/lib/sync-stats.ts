import type { CardDetail, CardRow } from "./golfistics";

/** Live counters streamed to /api/sync-progress while a sync reads scorecards (accumulated across every club of the link). */
export type LiveCard = {
  date: string; course: string | null; club: string | null; gross: number | null; par: number | null;
  other_course: boolean; holes: { hole: number; par: number | null; strokes: number | null }[];
};
export type SyncStats = {
  rounds: number; rounds_with_holes: number; holes: number;
  eagles: number; birdies: number; pars: number; bogeys: number; doubles_plus: number;
  days: number; best_gross: number | null; best_gross_date: string | null; best_gross_course: string | null;
  months: { month: string; rounds: number }[];   // last 12 months with play (YYYY-MM), oldest first
  last_card: LiveCard | null;
};

type Seen = { holes: boolean };

export class StatsTracker {
  private s = { rounds: 0, rounds_with_holes: 0, holes: 0, eagles: 0, birdies: 0, pars: 0, bogeys: 0, doubles_plus: 0 };
  private dates = new Set<string>();
  private seen = new Map<string, Seen>();
  private best: { gross: number; date: string; course: string | null } | null = null;
  private last: LiveCard | null = null;

  /**
   * Count one card. `d` = hole-by-hole detail (null for totals-only cards such as rounds at other courses).
   * The same round can show up twice (other-course row at club A, local card at club B): keyed by date + gross,
   * it is counted once and its hole detail is added when it arrives.
   */
  add(r: CardRow, d: CardDetail | null, o: { other?: boolean; club?: string | null; parFallback?: (hole: number) => number | null } = {}) {
    if (!r.date) return;
    const key = r.gross ? `${r.date}|${r.gross}` : `t:${r.torneo_id ?? r.date}|${r.club_played ?? ""}`;
    const holes = !o.other && d && d.strokes.some(x => x != null)
      ? d.holes.map((h, i) => ({ hole: h, par: d.par[i] ?? o.parFallback?.(h) ?? null, strokes: d.strokes[i] ?? null }))
      : [];
    const prev = this.seen.get(key);
    if (prev && (prev.holes || !holes.length)) return;
    if (!prev) {
      this.s.rounds++;
      this.dates.add(r.date);
      const played = holes.filter(h => h.strokes).length;
      const full = holes.length ? played >= 18 : !(r.course_rating != null && r.course_rating > 0 && r.course_rating < 50);
      if (r.gross && full && (r.card_status == null || r.card_status === "OK") && (!this.best || r.gross < this.best.gross || (r.gross === this.best.gross && r.date > this.best.date)))
        this.best = { gross: r.gross, date: r.date, course: r.course ?? null };
    }
    if (holes.length) {
      this.s.rounds_with_holes++;
      for (const h of holes) {
        if (!h.strokes || !h.par) continue;
        this.s.holes++;
        const v = h.strokes - h.par;
        if (v <= -2) this.s.eagles++; else if (v === -1) this.s.birdies++; else if (v === 0) this.s.pars++; else if (v === 1) this.s.bogeys++; else this.s.doubles_plus++;
      }
    }
    this.seen.set(key, { holes: holes.length > 0 });
    const par = holes.length && holes.every(h => h.par) ? holes.reduce((a, h) => a + (h.par as number), 0) : null;
    this.last = { date: r.date, course: r.course ?? null, club: o.club ?? r.club_played ?? null, gross: r.gross ?? null, par, other_course: !!o.other, holes };
  }

  snapshot(): SyncStats {
    const byMonth = new Map<string, number>();
    for (const d of this.dates) { const m = d.slice(0, 7); byMonth.set(m, (byMonth.get(m) ?? 0) + 1); }
    const latest = [...byMonth.keys()].sort().pop();
    const months: SyncStats["months"] = [];
    if (latest) {
      let [y, m] = latest.split("-").map(Number);
      for (let i = 0; i < 12; i++) { const k = `${y}-${String(m).padStart(2, "0")}`; months.unshift({ month: k, rounds: byMonth.get(k) ?? 0 }); if (--m === 0) { m = 12; y--; } }
    }
    return { ...this.s, days: this.dates.size, best_gross: this.best?.gross ?? null, best_gross_date: this.best?.date ?? null,
      best_gross_course: this.best?.course ?? null, months, last_card: this.last };
  }
}
