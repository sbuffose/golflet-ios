/** Pace of play (t142u), pure. Values are ESTIMATES (not club-official). */
export const PACE_MODS = ["medal", "stableford", "match", "fourball"] as const;
export type PaceMod = typeof PACE_MODS[number];
export const PACE_MOD_LABEL: Record<PaceMod, string> = { medal: "Medal (stroke play)", stableford: "Stableford", match: "Match play", fourball: "Fourball / parejas" };
export const ALERT_HOLE = 10, ALERT_BEHIND_MIN = 10;
/** Booking/modality text (club pages, CALC_MODALITIES keys) → pace family. Unknown → medal (the slowest individual format). */
export function paceModality(text: string | null | undefined): PaceMod {
  const s = (text || "").toLowerCase();
  if (/four|foursome|chapman|laguneada|americano|pareja|scramble/.test(s)) return "fourball";
  if (/stableford/.test(s)) return "stableford";
  if (/match/.test(s)) return "match";
  return "medal";
}
export const cleanMod = (v: unknown): PaceMod | null => (PACE_MODS as readonly string[]).includes(String(v)) ? (v as PaceMod) : null;
export const cleanPlayers = (v: unknown): number | null => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 4 ? n : null; };
/** Par weighting: par 3 is quicker, par 5 slower. Normalized so the round total = min_per_hole × holes. */
const W: Record<number, number> = { 3: 0.8, 4: 1, 5: 1.25 };
export function timeline(minPerHole: number, pars: (number | null)[]) {
  const n = pars.length || 18, ps = pars.length ? pars : Array(18).fill(null);
  const w = ps.map(p => W[p as number] ?? 1), k = (minPerHole * n) / w.reduce((a, b) => a + b, 0);
  let acc = 0;
  return ps.map((p, i) => { const m = w[i] * k; acc += m; return { hole: i + 1, par: p, minutes: Math.round(m * 10) / 10, expected_end_min: Math.round(acc * 10) / 10 }; });
}
/** Rule: checked only when the player REACHES hole 10 (i.e. finished 9 holes). Alert if elapsed > expected(end of 9) + 10 min. */
export function paceCheck(o: { startedAt: Date; now: Date; currentHole: number | null; tl: { expected_end_min: number }[]; enabled: boolean; alreadyAt: Date | null }) {
  const elapsed = Math.round((o.now.getTime() - o.startedAt.getTime()) / 6000) / 10;
  const expected9 = o.tl[ALERT_HOLE - 2]?.expected_end_min ?? null;
  const atCheck = o.currentHole === ALERT_HOLE;
  const behind = expected9 == null ? null : Math.round((elapsed - expected9) * 10) / 10;
  const due = o.enabled && atCheck && behind != null && behind > ALERT_BEHIND_MIN && !o.alreadyAt;
  return { check_hole: ALERT_HOLE, threshold_min: ALERT_BEHIND_MIN, enabled: o.enabled, at_check_hole: atCheck, elapsed_min: elapsed, expected_min_at_check: expected9, behind_min: atCheck ? behind : null, due, already_alerted_at: o.alreadyAt?.toISOString() ?? null };
}
export function alertText(behind: number) { return `Vas ${Math.round(behind)} min atrás del ritmo estimado. Si podés, apurá un poco el paso.`; }
