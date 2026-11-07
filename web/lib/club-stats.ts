/** Per-club error metrics (Garmin Golf / Arccos style) from GPS shots + launch-monitor samples. Pure. */
import { countsForClub, isPutter, type ClubDef, type ShotOut } from "./shots-calc";
import { toYards } from "./geo";

export type Sample = { club: string; source: string; carry_m: number | null; total_m: number | null; side_m: number | null; mishit: boolean; taken_at: string | Date };
const APPROACH_MAX_M = 220;                       // within this of the green center = shot at the green (incl. par-3 tee shots)
const isWood = (c: string) => /^(dr|driver|\d+w|madera)/i.test(c);
const r0 = (x: number | null) => (x == null ? null : Math.round(x));
const yd = (m: number | null) => (m == null ? null : Math.round(toYards(m)));
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);
const quant = (s: number[], q: number) => { if (!s.length) return null; const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };

/** Tukey fences (1.5×IQR) once there are ≥ 5 values; fewer values are kept as is. */
export function trimOutliers(v: number[]): { kept: number[]; trimmed: number } {
  if (v.length < 5) return { kept: v.slice(), trimmed: 0 };
  const s = v.slice().sort((a, b) => a - b), q1 = quant(s, 0.25)!, q3 = quant(s, 0.75)!, k = 1.5 * (q3 - q1);
  const kept = s.filter(x => x >= q1 - k && x <= q3 + k);
  return { kept, trimmed: s.length - kept.length };
}
export function distanceStats(values: number[]) {
  const { kept, trimmed } = trimOutliers(values); const s = kept.slice().sort((a, b) => a - b);
  if (!s.length) return null;
  const avg = s.reduce((a, b) => a + b, 0) / s.length, sd = Math.sqrt(s.reduce((a, b) => a + (b - avg) ** 2, 0) / s.length);
  const p25 = quant(s, 0.25)!, p75 = quant(s, 0.75)!, med = quant(s, 0.5)!;
  return { n: s.length, trimmed, avg_m: r0(avg), median_m: r0(med), max_m: r0(s[s.length - 1]), min_m: r0(s[0]), range_m: [r0(p25), r0(p75)] as [number | null, number | null], spread_m: r0(sd),
    avg_yd: yd(avg), median_yd: yd(med), max_yd: yd(s[s.length - 1]), range_yd: [yd(p25), yd(p75)] as [number | null, number | null], spread_yd: yd(sd) };
}
export const isApproach = (x: ShotOut) => !isPutter(x.club) && x.lie !== "green" && (x.intent === "green" || (x.intent !== "layup" && x.to_green_m != null && x.to_green_m <= APPROACH_MAX_M));
export const isTeeShot = (x: ShotOut) => (x.lie === "tee" || (x.lie == null && x.shot_number === 1)) && (x.to_green_m == null || x.to_green_m > APPROACH_MAX_M);

const article = (label: string) => (/^madera/i.test(label) ? "la" : "el");
/** "Con el Hierro 7 te vas 62% a la derecha y quedás corto (55%)." Needs ≥ 3 tagged shots per dimension. */
export function tendency(label: string, dir: { left: number; center: number; right: number; n: number }, len: { short: number; on: number; long: number; n: number }) {
  const parts: string[] = [];
  if (dir.n >= 3) {
    const side = dir.left >= dir.right ? ["izquierda", dir.left] as const : ["derecha", dir.right] as const;
    if ((side[1] as number) >= 40 && (side[1] as number) > dir.center) parts.push(`te vas ${side[1]}% a la ${side[0]}`);
    else if (dir.center >= 50 || dir.center >= dir.left + dir.right) parts.push(`salís derecho al centro el ${dir.center}% de las veces`);
    else parts.push(`la dispersión es pareja (${dir.left}% izquierda, ${dir.right}% derecha)`);
  }
  if (len.n >= 3) {
    if (len.short >= 40 && len.short >= len.long) parts.push(`quedás corto (${len.short}%)`);
    else if (len.long >= 40) parts.push(`te pasás largo (${len.long}%)`);
    else if (len.on >= 50) parts.push(`le pegás a la distancia justa (${len.on}%)`);
  }
  if (!parts.length) return dir.n + len.n ? "Pocos golpes marcados todavía para ver una tendencia." : null;
  return `Con ${article(label)} ${label} ${parts.join(" y ")}.`;
}

const withFairways = (t: string | null, fwPct: number | null) =>
  !t || fwPct == null || t.startsWith("Pocos") ? t : `${t.slice(0, -1)}; fairway en el ${fwPct}% de las salidas.`;

export function clubDetail(code: string, clubs: ClubDef[], shots: ShotOut[], samples: Sample[] = []) {
  const label = clubs.find(c => c.code === code)?.label || code;
  const mine = shots.filter(s => s.club === code);
  const dist = distanceStats(mine.filter(countsForClub).map(s => s.distance_m!));
  const dirT = mine.filter(s => s.direction), lenT = mine.filter(s => isApproach(s) && s.length);
  const cnt = <T,>(a: T[], f: (x: T) => boolean) => a.filter(f).length;
  const dir = { left: pct(cnt(dirT, s => s.direction === "left"), dirT.length) ?? 0, center: pct(cnt(dirT, s => s.direction === "center"), dirT.length) ?? 0, right: pct(cnt(dirT, s => s.direction === "right"), dirT.length) ?? 0, n: dirT.length };
  const len = { short: pct(cnt(lenT, s => s.length === "short"), lenT.length) ?? 0, on: pct(cnt(lenT, s => s.length === "on"), lenT.length) ?? 0, long: pct(cnt(lenT, s => s.length === "long"), lenT.length) ?? 0, n: lenT.length };
  const appr = mine.filter(s => isApproach(s) && s.result), gir = cnt(appr, s => s.result === "green" || s.result === "holed");
  const tee = isWood(code) || /driver/i.test(label) ? mine.filter(s => isTeeShot(s) && s.result && s.result !== "green") : [];
  const fw = cnt(tee, s => s.result === "fairway");
  const lm = samples.filter(s => s.club === code);
  const lmDist = distanceStats(lm.filter(s => !s.mishit && (s.carry_m ?? s.total_m) != null).map(s => (s.carry_m ?? s.total_m)!));
  const lmSide = lm.filter(s => s.side_m != null), lmLeft = cnt(lmSide, s => s.side_m! < -5), lmRight = cnt(lmSide, s => s.side_m! > 5);
  const sources = [...new Set([...(mine.length ? ["gps"] : []), ...lm.map(s => s.source)])];
  return {
    club: code, label, source: sources.length > 1 ? "mixed" : sources[0] || null, sources,
    shots: mine.length, shots_measured: dist?.n ?? 0, outliers_trimmed: dist?.trimmed ?? 0,
    distance: dist,                                                            // GPS, consecutive points
    direction: { ...dir },                                                     // % of shots with a direction tag
    length_on_approach: { ...len },                                            // % of approach shots with a length tag
    greens_hit: appr.length ? { pct: pct(gir, appr.length), hit: gir, of: appr.length } : null,
    fairways_hit: tee.length ? { pct: pct(fw, tee.length), hit: fw, of: tee.length } : null,
    mishit: { pct: pct(cnt(mine, s => !!s.mishit), mine.length), count: cnt(mine, s => !!s.mishit), of: mine.length },
    tendency: withFairways(tendency(label, dir, len), tee.length >= 3 ? pct(fw, tee.length) : null),
    launch_monitor: lm.length ? { shots: lm.length, sources: [...new Set(lm.map(s => s.source))], carry: lmDist,
      side: lmSide.length ? { left: pct(lmLeft, lmSide.length), center: pct(lmSide.length - lmLeft - lmRight, lmSide.length), right: pct(lmRight, lmSide.length), n: lmSide.length } : null,
      mishit_pct: pct(cnt(lm, s => s.mishit), lm.length) } : null,
  };
}

export function allClubStats(clubs: ClubDef[], shots: ShotOut[], samples: Sample[] = []) {
  const codes = [...new Set([...shots.map(s => s.club).filter((c): c is string => !!c && !isPutter(c)), ...samples.map(s => s.club)])];
  const order = new Map(clubs.map((c, i) => [c.code, i]));
  return codes.map(c => clubDetail(c, clubs, shots, samples)).sort((a, b) => (order.get(a.club) ?? 99) - (order.get(b.club) ?? 99) || (b.distance?.median_m ?? 0) - (a.distance?.median_m ?? 0));
}
