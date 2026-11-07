/** t184u "Qué conviene" (prep only, before the round): club per shot from the hole line, forecast wind at ETA, the player's own
 *  distances (libreto point or GPS oval) and the mapped hazards. An ESTIMATE; the player accepts or overrides. API_v5 §62.
 *  Score = yards left to the green centre + risk penalty (yards per 1% of landings in a hazard: bunker 0.4, árboles 0.6, agua/OB 2,
 *  i.e. a sure bunker ≈ 40 yd ≈ ⅓–½ golpe, sure water/OB ≈ golpe y distancia). A club may land up to 15 yd past the centre.
 *  Aim offset cancels the forecast crosswind drift (+ = right of the line). Never suggests Driver after the tee shot; a club longer
 *  than what is left (+15 yd) becomes a partial swing to the green centre. */
import { YD, dist, bearingXY, windComp, applyWind, projectDispersion, offsetPoint, aimPoint, hitsAt, ovalHits, type XY, type Hz, type Wind } from "./plan-core";

export const RISK_YD: Record<string, number> = { bunker: 0.4, agua: 2, bosque: 0.6, "límite": 2 };
export const KIND_ES: Record<string, string> = { bunker: "el bunker", agua: "el agua", bosque: "los árboles", "límite": "el OB" };
export type DD = { kind: "point" | "oval"; yd: number; carry?: number | null; mean?: { fwd: number; lat: number }; cov?: number[][]; partial?: boolean };
export type Cand = { code: string; dd: DD };
export type Sug = { code: string; dd: DD; aim_yd: number; fwd: number; landing: XY; after_yd: number; risk: { kind: string; pct: number }[]; risk_pct: number; score: number; partial: boolean };

export function fitDD(dd: DD, remain: number): DD {
  if (dd.yd <= remain + 15) return dd;
  const k = remain / dd.yd;
  return dd.kind === "oval" && dd.mean && dd.cov ? { ...dd, yd: remain, mean: { fwd: remain, lat: dd.mean.lat * k }, cov: dd.cov.map(r => r.map(v => v * k * k)), partial: true } : { ...dd, yd: remain, carry: null, partial: true };
}
/** Evaluate one club from `ball` (no aim offset when `aim_yd` = 0, else aimed `aim_yd` off the line). */
export function evalShot(ball: XY, green: XY, path: XY[], c: Cand, wind: Wind | null, hz: Hz[], aimYd?: number): Sug {
  const remain = dist(ball, green) / YD, dd = fitDD(c.dd, remain), aim = aimPoint(path, ball, dd.yd * YD);
  const comp = wind ? windComp(bearingXY(ball, aim), wind) : null, baseLat = dd.kind === "oval" && dd.mean ? dd.mean.lat : 0;
  const wp = comp ? applyWind({ fwd: dd.yd, lat: baseLat }, comp) : { fwd: dd.yd, lat: baseLat };
  let a = aimYd ?? Math.round(-wp.lat); if (aimYd == null && Math.abs(a) < 3) a = 0;
  const landing = offsetPoint(ball, aim, wp.fwd, wp.lat + a), risk = new Map<string, number>();
  if (dd.kind === "oval" && dd.mean && dd.cov) {
    const pr = projectDispersion({ mean: dd.mean, cov: dd.cov }, comp);
    for (const h of ovalHits(ball, aim, { fwd: pr.mean.fwd, lat: pr.mean.lat + a }, pr.cov, hz)) risk.set(h.kind, Math.min(100, (risk.get(h.kind) || 0) + h.pct));
  } else {
    const pts: XY[] = [landing];
    if (dd.carry != null && dd.carry < dd.yd) { const cw = comp ? applyWind({ fwd: dd.carry, lat: 0 }, comp) : { fwd: dd.carry, lat: 0 }; pts.push(offsetPoint(ball, aim, cw.fwd, cw.lat + a)); }
    for (const p of pts) for (const h of hitsAt(p, hz)) risk.set(h.kind, 100);
  }
  const rs = [...risk.entries()].map(([kind, pct]) => ({ kind, pct })).sort((x, y) => y.pct - x.pct);
  const after = dist(landing, green) / YD, pen = rs.reduce((s, r) => s + r.pct * (RISK_YD[r.kind] ?? 1), 0);
  return { code: c.code, dd, aim_yd: a, fwd: Math.round(wp.fwd), landing, after_yd: Math.round(after), risk: rs, risk_pct: rs.reduce((s, r) => s + r.pct, 0), score: after + pen, partial: !!dd.partial };
}
const isDriver = (code: string) => /^(dr|driver)$/i.test(code);
/** Score penalty per yard taken off a full swing (partial shots). */
export const PARTIAL_PEN = 0.35;
/** Best club for the next shot + a short reason. Null when no club has a distance. */
export function suggestShot(o: { ball: XY; green: XY; path: XY[]; clubs: Cand[]; wind: Wind | null; hz: Hz[]; first: boolean }) {
  const remain = dist(o.ball, o.green) / YD;
  const all = o.clubs.filter(c => c.dd && c.dd.yd > 0 && (o.first || !isDriver(c.code))).map(c => {
    const s = evalShot(o.ball, o.green, o.path, c, o.wind, o.hz);
    // t190u: a partial swing is harder to control: penalise it by the yards taken off (else it always beats a full club that ends a few yd short)
    if (s.partial) return { ...s, score: s.score + PARTIAL_PEN * Math.max(0, c.dd.yd - s.fwd) };
    if (s.fwd <= remain + 15 || isDriver(c.code)) return s;
    // flies the centre by > 15 yd with the forecast wind: shorten it to the centre (partial swing)
    const k = remain / s.fwd, dd: DD = c.dd.kind === "oval" && c.dd.mean && c.dd.cov ? { ...c.dd, yd: c.dd.yd * k, mean: { fwd: c.dd.mean.fwd * k, lat: c.dd.mean.lat * k }, cov: c.dd.cov.map(r => r.map(v => v * k * k)), partial: true } : { kind: "point", yd: c.dd.yd * k, carry: null, partial: true };
    const e = evalShot(o.ball, o.green, o.path, { code: c.code, dd }, o.wind, o.hz);
    return { ...e, partial: true, score: e.score + PARTIAL_PEN * Math.max(0, s.fwd - e.fwd) };
  });
  // a club that flies the green centre by > 15 yd is out; never a partial Driver; keep at most one partial (the shortest club that has to be shortened)
  let cands = all.filter(s => s.partial ? !isDriver(s.code) : s.fwd <= remain + 15);
  const full = (s: Sug) => o.clubs.find(c => c.code === s.code)!.dd.yd;
  const parts = cands.filter(s => s.partial).sort((a, b) => full(a) - full(b));
  if (parts.length > 1) cands = cands.filter(s => !s.partial || s === parts[0]);
  if (!cands.length) return null;
  const best = [...cands].sort((a, b) => a.score - b.score || b.fwd - a.fwd)[0];
  const longer = cands.filter(s => s.fwd > best.fwd + 3 && s.risk_pct > best.risk_pct).sort((a, b) => b.fwd - a.fwd)[0];
  const shorter = cands.filter(s => s.fwd < best.fwd - 3 && s.risk_pct > best.risk_pct).sort((a, b) => b.fwd - a.fwd)[0];
  let type: "layup" | "carry" | "riesgo" | "max", text: string;
  if (longer) { type = "layup"; text = `Con ${longer.code}, ${longer.risk[0].pct}% cae en ${KIND_ES[longer.risk[0].kind] ?? longer.risk[0].kind}: te quedás antes con ${best.code}.`; }
  else if (shorter) { type = "carry"; text = `${best.code} pasa ${KIND_ES[shorter.risk[0].kind] ?? shorter.risk[0].kind} (con ${shorter.code} cae adentro).`; }
  else if (best.risk_pct > 0) { type = "riesgo"; text = `Ojo: ${best.risk[0].pct}% de la caída toca ${KIND_ES[best.risk[0].kind] ?? best.risk[0].kind}.`; }
  else { type = "max"; text = best.partial ? `Tiro a media distancia al green.` : `Llegás lo más cerca posible sin obstáculos en la caída.`; }
  const aim = best.aim_yd ? ` Apuntá ${Math.abs(best.aim_yd)} yd a la ${best.aim_yd < 0 ? "izquierda" : "derecha"} por el viento cruzado.` : "";
  return { ...best, reason: { type, text: text + aim }, alternatives: cands.filter(s => s !== best).sort((a, b) => a.score - b.score).slice(0, 2).map(s => ({ code: s.code, fwd: s.fwd, after_yd: s.after_yd, risk_pct: s.risk_pct })) };
}
