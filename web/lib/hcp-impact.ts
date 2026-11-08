/** Handicap impact of a period (pure, over buildData() output). WHS: index = mean of the best 8 of the last 20 differentials.
 *  Official index (hi_history + player.handicap_index) is used for the change when it covers the range start; otherwise the
 *  estimated series from Golflet's differentials. Best-8 membership always uses Golflet's differentials → estimated. Never invents:
 *  null when there isn't enough history. */
import { officialIndex } from "./play-rules";
const r1 = (x: number) => Math.round(x * 10) / 10;
const avg = (a: number[]) => (a.length ? r1(a.reduce((s, x) => s + x, 0) / a.length) : null);
type Card = { round_id: string; date: string; differential: number; course_label: string | null; gross: number | null };

function best8(win: Card[]) {
  const s = win.map((c, i) => ({ c, i })).sort((a, b) => a.c.differential - b.c.differential || a.i - b.i).slice(0, 8);
  return { index: r1(s.reduce((t, x) => t + x.c.differential, 0) / s.length), ids: new Set(s.map(x => x.c.round_id)) };
}

export function hcpImpact(D: any, since: string | null) {
  const asc: Card[] = (D.rounds || [])
    .filter((r: any) => r.valid_card && r.gross && !r.is_9_holes && r.differential_computed != null)
    .map((r: any) => ({ round_id: r.round_id ?? r.id, date: r.date, differential: +r.differential_computed, course_label: r.course_label || r.course || null, gross: r.gross ?? null }))
    .sort((a: Card, b: Card) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const at = (k: number) => (k >= 20 ? best8(asc.slice(k - 20, k)) : null);            // index after the first k cards
  const k0 = since ? asc.filter(c => c.date < since).length : 0;
  const hh = [...(D.hi_history || [])].filter((h: any) => h.hi != null).sort((a: any, b: any) => (a.date < b.date ? -1 : 1));
  const hiNow = officialIndex(D.player?.handicap_index, hh);
  const offBefore = (d: string) => [...hh].reverse().find((h: any) => h.date < d) || null;

  // change of index over the range
  let source: "official" | "estimated" | null = null, start: { index: number; date: string | null } | null = null, now: { index: number; date: string | null } | null = null;
  // range start: last official record before it; if the history starts inside the range, its first record (same rule as the 'desde' chip)
  const before = since ? offBefore(since) : null, firstIn = hh.length > 1 ? (since ? hh.find((h: any) => h.date >= since) : hh[0]) || null : null;
  const offStart = before || (firstIn && firstIn !== hh.at(-1) ? firstIn : null);
  let startFirstRecord = false;
  if (hiNow != null && offStart) { source = "official"; startFirstRecord = !before; start = { index: +offStart.hi, date: offStart.date }; now = { index: +hiNow, date: hh.at(-1)?.date ?? null }; }
  else {
    const kS = since ? k0 : 20, s = at(kS), n = at(asc.length);
    if (s && n && asc.length > kS) { source = "estimated"; start = { index: s.index, date: asc[kS - 1].date }; now = { index: n.index, date: asc.at(-1)!.date }; }
  }
  const delta = start && now ? r1(now.index - start.index) : null;

  // cards played in the range
  const nowSet = at(asc.length)?.ids ?? null;
  const cards = asc.slice(k0).map((c, j) => {
    const k = k0 + j + 1, w = at(k), off = offBefore(c.date), est = at(k - 1);
    const prev = off ? { v: +off.hi, est: false } : est ? { v: est.index, est: true } : null;
    return { ...c, prev_index: prev?.v ?? null, prev_index_estimated: prev ? prev.est : null, vs_prev: prev ? r1(c.differential - prev.v) : null,
      entered_best8: w ? w.ids.has(c.round_id) : null, counts_now: nowSet ? nowSet.has(c.round_id) : null };
  }).reverse();                                                                          // newest first
  const entered = cards.filter(c => c.entered_best8 === true);

  // which best-8 cards from the range start are no longer counting
  let dropped: any[] | null = null;
  const startSet = since ? at(k0) : null;
  if (startSet && nowSet) {
    const last20 = new Set(asc.slice(-20).map(c => c.round_id));
    dropped = asc.filter(c => startSet.ids.has(c.round_id) && !nowSet.has(c.round_id))
      .map(c => ({ ...c, reason: last20.has(c.round_id) ? "superada" : "salio_de_las_20" })).reverse();
  }
  const vs = cards.filter(c => c.vs_prev != null).map(c => c.vs_prev as number);
  return {
    since, source, estimated: source !== "official", start, start_is_first_record: startFirstRecord, now, delta,
    direction: delta == null ? null : delta < 0 ? "down" : delta > 0 ? "up" : "flat",
    cards_in_range: cards.length, entered_best8: cards.some(c => c.entered_best8 != null) ? entered.length : null,
    entered_avg_differential: avg(entered.map(c => c.differential)), avg_differential: avg(cards.map(c => c.differential)),
    avg_vs_prev_index: avg(vs), counts_now: nowSet ? cards.filter(c => c.counts_now).length : null,
    cards, dropped, best8_estimated: true,
    note: "Mejores 8 de las últimas 20 según los diferenciales que calcula Golflet (slope y rating de cada tarjeta). El índice oficial lo publica tu club.",
  };
}
