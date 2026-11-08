/** WHS net double bogey ("outliers") — pure. Max hole score for handicap = par + 2 + strokes received on that hole. */
export type HoleDef = { hole: number; par: number; hcp: number | null };
/** Strokes received on a hole with stroke index `si` for handicap `ph` (plus handicaps give strokes back on the easiest holes). */
export function strokesOn(ph: number, si: number): number {
  if (ph < 0) return si > 18 + ph ? -1 : 0;
  return Math.floor(ph / 18) + (si <= ph % 18 ? 1 : 0);
}
export const capFor = (par: number, strokes: number) => par + 2 + strokes;
const okSI = (h: HoleDef) => Number.isInteger(h.hcp) && h.hcp! >= 1 && h.hcp! <= 18;

/** A real hole where the player receives exactly 1 stroke; par 4 first, then par 5, then par 3; lowest hole number. Null if none. */
export function pickExampleHole(holes: HoleDef[], ph: number) {
  if (holes.filter(okSI).length !== 18) return null;
  const c = holes.filter(okSI).map(h => ({ ...h, strokes: strokesOn(ph, h.hcp!) })).filter(h => h.strokes === 1);
  const rank = (p: number) => (p === 4 ? 0 : p === 5 ? 1 : 2);
  c.sort((a, b) => rank(a.par) - rank(b.par) || a.hole - b.hole);
  const h = c[0]; if (!h) return null;
  const cap = capFor(h.par, 1);
  return { hole: h.hole, par: h.par, stroke_index: h.hcp!, strokes_received: 1, cap, if_scored: cap + 3 };
}

/** Newest real card where a hole went over the cap. The card's own handicap is gross − net (strokes it gave). */
export function findCappedCard(rounds: any[], holesFor: (r: any) => HoleDef[] | null) {
  for (const r of rounds) {
    if (!r.valid_card || r.is_9_holes || !r.holes?.length || r.gross == null || r.net == null) continue;
    const defs = holesFor(r); if (!defs || defs.filter(okSI).length !== 18) continue;
    const ph = r.gross - r.net; let worst: any = null;
    for (const [hole, par, strokes] of r.holes) {
      const d = defs.find(x => x.hole === hole); if (!d || !okSI(d) || par == null || strokes == null) continue;
      const s = strokesOn(ph, d.hcp!), cap = capFor(par, s);
      if (strokes > cap && (!worst || strokes - cap > worst.over)) worst = { hole, par, stroke_index: d.hcp, strokes_received: s, scored: strokes, cap, over: strokes - cap };
    }
    if (worst) return { round_id: r.round_id, date: r.date, course_label: r.course_label || r.course, tee: r.tee ?? null, gross: r.gross, playing_handicap: ph, ...worst,
      adjusted_gross: r.gross - r.holes.reduce((t: number, [hole, par, st]: any) => { const d = defs.find(x => x.hole === hole); if (!d || !okSI(d) || par == null || st == null) return t; const cap = capFor(par, strokesOn(ph, d.hcp!)); return t + Math.max(0, st - cap); }, 0) };
  }
  return null;
}
