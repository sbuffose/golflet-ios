/** t202u: pencil shot log on the printed hole cards — layout (shared by the PDF and the phone reader), card id code, and an OMR reader
 *  for a photo of one card (pure: grayscale array in, marks out; runs on the phone, photos never leave the device). API_v5 §66.
 *  Coordinates: points, origin = card top-left, y down. Card W = 280.63 pt (99 mm); H = 501.7 pt (torneo, 177 mm) or 595.28 pt (210 mm). */

export type Box = { key: string; x: number; y: number; w: number; h: number; label?: string };
export type Ring = { key: string; cx: number; cy: number; r: number; label: string };
export const CARD_W = 841.89 / 3;
export const FID = 8;                      // fiducial square side
export const LOG_H = 58;                    // pencil log block height
export const ID_BITS = 16, ID_CELL = 5.4, ID_GAP = 1;
export const FIRST_PUTT = [{ key: "fp_lt1", label: "<1" }, { key: "fp_1_3", label: "1–3" }, { key: "fp_3_6", label: "3–6" }, { key: "fp_6p", label: "6+" }] as const;

/** Layout of the log + reading aids on a hole FRONT. `clubs` = planned clubs (strategy mode: one checkbox each, max 5). */
export function cardLayout(o: { H: number; par: number | null; mode: "cancha" | "estrategia"; clubs?: string[] }) {
  const W = CARD_W, H = o.H, PAD = 16;
  const fid = { tl: [PAD + FID / 2, 15 + FID / 2], tr: [W - PAD - FID / 2, 15 + FID / 2], bl: [PAD + FID / 2, H - 15 - FID / 2], br: [W - PAD - FID / 2, H - 15 - FID / 2] } as Record<"tl" | "tr" | "bl" | "br", [number, number]>;
  const idY = H - 15 - FID / 2 - ID_CELL / 2, idX0 = PAD + FID + 8;
  const id = Array.from({ length: ID_BITS + 2 }, (_, i) => ({ x: idX0 + i * (ID_CELL + ID_GAP), y: idY, w: ID_CELL, h: ID_CELL }));   // [start=1][16 bits][stop=1]
  const top = H - 15 - FID - 6 - LOG_H, x0 = PAD, boxes: Box[] = [], rings: Ring[] = [], S = 7;
  const r1 = top + 10, r2 = top + 25, r3 = top + 40;
  const clubs = (o.clubs || []).slice(0, 5);
  if (o.mode === "estrategia" && clubs.length) clubs.forEach((c, i) => boxes.push({ key: `club_${i}`, x: x0 + 52 + i * 39, y: r1 - S + 1.5, w: S, h: S, label: `${i + 1} ${c}` }));
  if (o.par !== 3) [["fw_l", "izq."], ["fw_c", "fairway"], ["fw_r", "der."]].forEach(([k, l], i) => boxes.push({ key: k, x: x0 + 34 + i * 20, y: r2 - S + 1.5, w: S, h: S, label: l }));
  boxes.push({ key: "gir", x: x0 + 112, y: r2 - S + 1.5, w: S, h: S, label: "GIR" });
  boxes.push({ key: "bunker", x: x0 + 160, y: r2 - S + 1.5, w: S, h: S, label: "Bunker" });
  boxes.push({ key: "penal", x: x0 + 208, y: r2 - S + 1.5, w: S, h: S, label: "Penal." });
  [1, 2, 3, 4].forEach((n, i) => rings.push({ key: `putts_${n}`, cx: x0 + 36 + i * 15, cy: r3 - 2.4, r: 5.2, label: n === 4 ? "4+" : String(n) }));
  FIRST_PUTT.forEach((f, i) => boxes.push({ key: f.key, x: x0 + 140 + i * 26, y: r3 - S + 1.5, w: S, h: S, label: f.label }));
  return { W, H, fid, id, boxes, rings, top, rows: { r1, r2, r3, hint: top + LOG_H - 3 }, x0, clubs, mapBottom: top - 4 };
}
export type CardLayout = ReturnType<typeof cardLayout>;

/* ---------------- card id: 16 bits = hole(5) mode(1) torneo(1) course(5) check(4) ---------------- */
export function courseHash5(club: string, course: string) { let h = 2166136261; for (const ch of `${club}|${course.toLowerCase()}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h % 31 + 1; }
const check4 = (v: number) => { let c = 0b1011; for (let i = 0; i < 12; i++) if ((v >> i) & 1) c = ((c << 1) | (c >> 3)) & 15 ^ (i + 1 & 15); return c; };
export function encodeCardId(o: { hole: number; mode: "cancha" | "estrategia"; torneo: boolean; club: string; course: string }) {
  const v = (o.hole & 31) | (o.mode === "estrategia" ? 32 : 0) | (o.torneo ? 64 : 0) | (courseHash5(o.club, o.course) << 7);
  const full = v | (check4(v) << 12); return Array.from({ length: ID_BITS }, (_, i) => (full >> i) & 1);
}
export function decodeCardId(bits: number[]) {
  if (bits.length !== ID_BITS) return null;
  const full = bits.reduce((a, b, i) => a | (b << i), 0), v = full & 4095;
  if (((full >> 12) & 15) !== check4(v)) return null;
  const hole = v & 31; if (hole < 1 || hole > 18) return null;
  return { hole, mode: (v & 32 ? "estrategia" : "cancha") as "cancha" | "estrategia", torneo: !!(v & 64), course_hash: (v >> 7) & 31 };
}

/* ---------------- geometry: homography card pt → image px ---------------- */
export type Mat3 = number[];
export function homography(src: [number, number][], dst: [number, number][]): Mat3 {
  // solve 8x8 (h33 = 1)
  const A: number[][] = [], b: number[] = [];
  for (let i = 0; i < 4; i++) { const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u); A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v); }
  for (let c = 0; c < 8; c++) { let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < 8; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; } }
  return [...A.map((row, i) => b[i] / row[i]), 1];
}
export const project = (H: Mat3, x: number, y: number): [number, number] => { const w = H[6] * x + H[7] * y + H[8]; return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w]; };

/* ---------------- OMR ---------------- */
export type Gray = { w: number; h: number; d: Uint8Array | Uint8ClampedArray };
function otsu(g: Gray) { const hist = new Array(256).fill(0); for (let i = 0; i < g.d.length; i += 3) hist[g.d[i]]++;
  const n = hist.reduce((a, b) => a + b, 0); let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sB = 0, wB = 0, best = 0, th = 128; for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = n - wB; if (!wF) break; sB += t * hist[t];
    const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; th = t; } } return th; }
/** Dark square blobs (fiducial candidates): centre, side, fill ratio. */
export function findSquares(g: Gray, th = otsu(g)) {
  const { w, h, d } = g, lab = new Int32Array(w * h), out: { cx: number; cy: number; side: number; fill: number }[] = []; let id = 0;
  const st: number[] = [];
  for (let p = 0; p < w * h; p++) { if (lab[p] || d[p] > th) continue; id++; let n = 0, sx = 0, sy = 0, x0 = w, x1 = 0, y0 = h, y1 = 0; st.push(p); lab[p] = id;
    while (st.length) { const q = st.pop()!, x = q % w, y = (q - x) / w; n++; sx += x; sy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const r of [q - 1, q + 1, q - w, q + w]) if (r >= 0 && r < w * h && !lab[r] && d[r] <= th && Math.abs((r % w) - x) <= 1) { lab[r] = id; st.push(r); } }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, fill = n / (bw * bh);
    if (n >= 16 && fill > 0.78 && bw / bh > 0.7 && bh / bw > 0.7) out.push({ cx: sx / n, cy: sy / n, side: Math.sqrt(n), fill }); }
  return out;
}
/** Pick the 4 fiducials: the 4 squares closest to the image corners among blobs of similar size (largest consistent group). */
export function pickFiducials(sq: ReturnType<typeof findSquares>, w: number, h: number) {
  if (sq.length < 4) return null;
  const sides = sq.map(s => s.side).sort((a, b) => b - a);
  let best: any = null;
  for (const ref of sides.slice(0, 12)) {
    const S = sq.filter(s => s.side > ref * 0.7 && s.side < ref * 1.35); if (S.length < 4) continue;
    const pick = (f: (s: any) => number) => S.reduce((a, s) => f(s) < f(a) ? s : a, S[0]);
    const tl = pick(s => s.cx + s.cy), br = pick(s => -(s.cx + s.cy)), tr = pick(s => -(s.cx - s.cy)), bl = pick(s => s.cx - s.cy);
    if (new Set([tl, tr, bl, br]).size < 4) continue;
    const area = Math.abs((tr.cx - tl.cx) * (bl.cy - tl.cy) - (tr.cy - tl.cy) * (bl.cx - tl.cx));
    if (!best || area > best.area) best = { tl, tr, bl, br, area };
  }
  return best;
}
const meanDark = (g: Gray, H: Mat3, x: number, y: number, ww: number, hh: number, inset = 0.22, paper = 230) => {
  let s = 0, n = 0; const N = 7;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const px = x + ww * (inset + (1 - 2 * inset) * (i + .5) / N), py = y + hh * (inset + (1 - 2 * inset) * (j + .5) / N);
    const [u, v] = project(H, px, py), X = Math.round(u), Y = Math.round(v); if (X < 0 || Y < 0 || X >= g.w || Y >= g.h) continue; s += Math.max(0, paper - g.d[Y * g.w + X]) / paper; n++; }
  return n ? s / n : 0; };
const ringDark = (g: Gray, H: Mat3, cx: number, cy: number, r0: number, r1: number, paper = 230) => {
  let s = 0, n = 0; for (let a = 0; a < 48; a++) for (const r of [r0, (r0 + r1) / 2, r1]) { const t = a / 48 * 2 * Math.PI, [u, v] = project(H, cx + r * Math.cos(t), cy + r * Math.sin(t));
    const X = Math.round(u), Y = Math.round(v); if (X < 0 || Y < 0 || X >= g.w || Y >= g.h) continue; s += Math.max(0, paper - g.d[Y * g.w + X]) / paper; n++; } return n ? s / n : 0; };

export type CardRead = {
  ok: boolean; reason?: string; id: ReturnType<typeof decodeCardId>; H: Mat3 | null;
  marks: Record<string, { score: number; on: boolean; unsure: boolean }>;
  putts: number | null; putts_unsure: boolean; first_putt: string | null; fairway: "izq" | "centro" | "der" | null; clubs_played: number[];
};
/** Read one card photo (grayscale). `layoutFor(id)` returns the layout for the decoded id (needs par/clubs from the app). */
export function readCard(g: Gray, layoutFor: (id: NonNullable<ReturnType<typeof decodeCardId>>, torneoH: number) => CardLayout): CardRead {
  const empty: CardRead = { ok: false, id: null, H: null, marks: {}, putts: null, putts_unsure: false, first_putt: null, fairway: null, clubs_played: [] };
  const th = otsu(g), f = pickFiducials(findSquares(g, th), g.w, g.h); if (!f) return { ...empty, reason: "no encontramos las 4 marcas de las esquinas" };
  const paper = Math.min(250, th + (255 - th) * 0.6);
  // the card height is encoded in the id; read the id with both candidate heights and keep the one with a valid checksum
  for (const Hc of [501.73, 595.28]) {
    const L0 = cardLayout({ H: Hc, par: 4, mode: "cancha" });
    const H = homography([L0.fid.tl, L0.fid.tr, L0.fid.bl, L0.fid.br], [[f.tl.cx, f.tl.cy], [f.tr.cx, f.tr.cy], [f.bl.cx, f.bl.cy], [f.br.cx, f.br.cy]]);
    const cells = L0.id.map(c => meanDark(g, H, c.x, c.y, c.w, c.h, 0.25, paper));
    if (cells[0] < 0.35 || cells[ID_BITS + 1] < 0.35) continue;
    const bits = cells.slice(1, ID_BITS + 1).map(v => v > 0.35 ? 1 : 0), id = decodeCardId(bits);
    if (!id || (id.torneo ? 501.73 : 595.28) !== Hc) continue;
    const L = layoutFor(id, Hc), marks: CardRead["marks"] = {};
    for (const b of L.boxes) { const s = meanDark(g, H, b.x, b.y, b.w, b.h, 0.22, paper); marks[b.key] = { score: Math.round(s * 100) / 100, on: s > 0.22, unsure: s > 0.12 && s < 0.32 }; }
    for (const r of L.rings) { const s = ringDark(g, H, r.cx, r.cy, r.r + 0.6, r.r + 2.6, paper); marks[r.key] = { score: Math.round(s * 100) / 100, on: s > 0.14, unsure: s > 0.07 && s < 0.22 }; }
    const pOn = [1, 2, 3, 4].filter(n => marks[`putts_${n}`]?.on), fp = FIRST_PUTT.filter(x => marks[x.key]?.on), fw = (["fw_l", "fw_c", "fw_r"] as const).filter(k => marks[k]?.on);
    return { ok: true, id, H, marks, putts: pOn.length === 1 ? pOn[0] : null, putts_unsure: pOn.length !== 1 || [1, 2, 3, 4].some(n => marks[`putts_${n}`]?.unsure),
      first_putt: fp.length === 1 ? fp[0].key : null, fairway: fw.length === 1 ? ({ fw_l: "izq", fw_c: "centro", fw_r: "der" } as const)[fw[0]] : null,
      clubs_played: L.boxes.filter(b => b.key.startsWith("club_") && marks[b.key].on).map(b => +b.key.slice(5)) };
  }
  return { ...empty, reason: "no pudimos leer el código de la tarjeta" };
}

/* ---------------- confirmed hole entry (what the app saves) ---------------- */
export type LogHole = { hole: number; clubs: (string | null)[]; fairway: "izq" | "centro" | "der" | null; gir: boolean | null; bunker: boolean | null; penalty: boolean | null;
  putts: number | null; first_putt: string | null; marks: { n: number; x: number; y: number; yd_est: number | null; ll?: [number, number]; lie?: string; from?: string }[];
  read: "foto" | "manual" | "gps"; device?: string; confirmed: true };
export const LIES = ["tee", "fairway", "rough", "bunker", "agua", "bosque", "green"];
export const DEVICES = ["gps", "watch", "garmin"];   // t206u: wearables feed the same pipeline
export function cleanLogHole(h: any): LogHole {
  const hole = Number(h?.hole); if (!Number.isInteger(hole) || hole < 1 || hole > 18) throw new Error("Hoyo inválido");
  if (h?.confirmed !== true) throw new Error(`Confirmá el hoyo ${hole} antes de guardarlo`);
  const tri = (v: any) => v === true ? true : v === false ? false : null;
  const putts = h.putts == null ? null : Number(h.putts); if (putts != null && (!Number.isInteger(putts) || putts < 0 || putts > 6)) throw new Error(`Putts inválidos en el hoyo ${hole}`);
  const fp = h.first_putt == null ? null : String(h.first_putt); if (fp && !FIRST_PUTT.some(x => x.key === fp)) throw new Error(`1er putt inválido en el hoyo ${hole}`);
  const clubs = (Array.isArray(h.clubs) ? h.clubs : []).slice(0, 10).map((c: any) => c == null || c === "" ? null : String(c).slice(0, 8));
  const marks = (Array.isArray(h.marks) ? h.marks : []).slice(0, 10).map((m: any, i: number) => ({ n: Number(m.n) || i + 1, x: Math.max(0, Math.min(1, Number(m.x) || 0)), y: Math.max(0, Math.min(1, Number(m.y) || 0)),
    yd_est: m.yd_est == null || !Number.isFinite(Number(m.yd_est)) ? null : Math.max(0, Math.min(700, Math.round(Number(m.yd_est)))),
    // t204u: GPS/wearable positions (where the ball finished) with their lie from the course map
    ...(Array.isArray(m.ll) && m.ll.length === 2 && m.ll.every((v: any) => Number.isFinite(Number(v)) && Math.abs(Number(v)) <= 180) ? { ll: [Math.round(Number(m.ll[0]) * 1e7) / 1e7, Math.round(Number(m.ll[1]) * 1e7) / 1e7] as [number, number] } : {}),
    ...(LIES.includes(m.lie) ? { lie: m.lie as string } : {}), ...(["tap", "swing", "parada", "manual"].includes(m.from) ? { from: m.from as string } : {}) }));
  return { hole, clubs, fairway: ["izq", "centro", "der"].includes(h.fairway) ? h.fairway : null, gir: tri(h.gir), bunker: tri(h.bunker), penalty: tri(h.penalty), putts, first_putt: fp, marks,
    read: h.read === "foto" ? "foto" : h.read === "gps" ? "gps" : "manual", ...(DEVICES.includes(h.device) ? { device: h.device } : {}), confirmed: true };
}
/** Per-club distance estimates from consecutive marks (yd from tee along the line): shot k = mark k − mark k−1. Labeled estimates. */
export function clubEstimates(holes: LogHole[]) {
  const by: Record<string, number[]> = {};
  for (const h of holes) { let prev = 0; h.marks.slice().sort((a, b) => a.n - b.n).forEach((m, i) => { const c = h.clubs[i]; if (m.yd_est == null) return; const d = m.yd_est - prev; prev = m.yd_est; if (c && d > 20) (by[c] ||= []).push(d); }); }
  return Object.entries(by).map(([club, v]) => { const s = v.slice().sort((a, b) => a - b); return { club, n: s.length, median_yd: s[Math.floor(s.length / 2)], estimate: true }; });
}
export function logStats(holes: LogHole[]) {
  const fw = holes.filter(h => h.fairway), gir = holes.filter(h => h.gir != null), pu = holes.filter(h => h.putts != null);
  return { holes: holes.length, fairway_pct: fw.length ? Math.round(100 * fw.filter(h => h.fairway === "centro").length / fw.length) : null,
    fairway_miss: { izq: fw.filter(h => h.fairway === "izq").length, der: fw.filter(h => h.fairway === "der").length },
    gir_pct: gir.length ? Math.round(100 * gir.filter(h => h.gir).length / gir.length) : null, putts_avg: pu.length ? Math.round(10 * pu.reduce((a, h) => a + h.putts!, 0) / pu.length) / 10 : null,
    bunkers: holes.filter(h => h.bunker).length, penalties: holes.filter(h => h.penalty).length,
    lies: holes.flatMap(h => h.marks).reduce((a: Record<string, number>, m) => { if (m.lie) a[m.lie] = (a[m.lie] || 0) + 1; return a; }, {}),   // t205u: where the ball finished
    tee_lies: holes.filter(h => h.marks[0]?.lie && h.fairway != null).reduce((a: Record<string, number>, h) => { a[h.marks[0].lie!] = (a[h.marks[0].lie!] || 0) + 1; return a; }, {}) };
}
