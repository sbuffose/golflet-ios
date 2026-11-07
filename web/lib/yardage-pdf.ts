/** t185u/t186u: printable A4 "yardage book" of the player's own plan. Pure black and white (no grey, no colour): line weights,
 *  stipple (bunker), wave hatching (agua), circle hatching (árboles), solid/dashed lines. Cover + 3 holes per portrait page.
 *  Competition-safe: no green slope maps (Regla 4.3), no live data; wind and ± yd come from the forecast (prep). API_v5 §62. */
import { Doc, Page, textWidth, printBrand } from "./pdf-mini";
import { frame, norm360 } from "./plan-core";

type LL = [number, number];
const MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"], WD = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
export const dLong = (d: string) => { const x = new Date(d + "T12:00:00Z"); return `${WD[x.getUTCDay()]} ${x.getUTCDate()} de ${MES[x.getUTCMonth()]} de ${x.getUTCFullYear()}`; };
export const C16 = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
export const c16 = (d: number) => C16[Math.round(norm360(d) / 22.5) % 16];
export const sgn = (v: number) => v > 0 ? `+${v}` : v < 0 ? `-${-v}` : "0";
export const arTime = (iso: string) => { const t = new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString(); return `${t.slice(8, 10)}/${t.slice(5, 7)} ${t.slice(11, 16)}`; };

/* ---------- B/W patterns ---------- */
let VIEW: number[] | null = null;   // visible map box [x0,y0,x1,y1]: patterns are only generated inside it (keeps the PDF small)
const vis = (b: number[]) => VIEW ? [Math.max(b[0], VIEW[0]), Math.max(b[1], VIEW[1]), Math.min(b[2], VIEW[2]), Math.min(b[3], VIEW[3])] : b;
/** t227u: B&W glyph of a course marker colour (same code as the club-guide card: rojo ● · blanco ○ · azul ■ · amarillo □) */
export function markerDot(pg: Page, c: string, x: number, y: number) {
  if (c === "rojo") pg.fillBlack().circle(x, y, 2.6).fill();
  else if (c === "azul") pg.fillBlack().rect(x - 2.5, y - 2.5, 5, 5).fill();
  else if (c === "amarillo") { pg.fillWhite().rect(x - 2.5, y - 2.5, 5, 5).fill(); pg.black().lw(.9).rect(x - 2.5, y - 2.5, 5, 5).stroke(); }
  else { pg.fillWhite().circle(x, y, 2.6).fill(); pg.black().lw(.9).circle(x, y, 2.6).stroke(); }
  pg.fillBlack();
}
function bbox(pts: [number, number][]) { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }
export function stipple(pg: Page, poly: [number, number][]) {
  const [x0, y0, x1, y1] = vis(bbox(poly)); if (x1 <= x0 || y1 <= y0) return; pg.save().spoly(poly).clip(); pg.fillBlack();
  let row = 0; for (let y = y0 + .8; y <= y1; y += 2.1, row++) for (let x = x0 + (row % 2 ? 1.05 : 0); x <= x1; x += 2.1) pg.circle(x, y, .36).fill();
  pg.restore(); pg.black().lw(.6).dash().spoly(poly).stroke();
}
export function waves(pg: Page, poly: [number, number][]) {
  const [x0, y0, x1, y1] = vis(bbox(poly)); if (x1 <= x0 || y1 <= y0) return; pg.save().spoly(poly).clip(); pg.black().lw(.45).dash();
  for (let y = y0 + 1; y <= y1 + 1; y += 2.3) { pg.move(x0 - 2, y); for (let x = x0 - 2; x < x1 + 2; x += 3) pg.curve(x + .75, y - .7, x + 2.25, y + .7, x + 3, y); pg.stroke(); }
  pg.restore(); pg.black().lw(.8).dash().spoly(poly).stroke();
}
export function treesHatch(pg: Page, poly: [number, number][]) {
  const [x0, y0, x1, y1] = vis(bbox(poly)); if (x1 <= x0 || y1 <= y0) return; pg.save().spoly(poly).clip(); pg.black().lw(.4).dash();
  let row = 0; for (let y = y0 + 2; y <= y1 + 2; y += 4.2, row++) for (let x = x0 + (row % 2 ? 2.4 : 0); x <= x1 + 2; x += 4.8) pg.circle(x, y, 1.35).stroke();
  pg.restore(); pg.black().lw(.45).dash([1.2, 1.2]).spoly(poly).stroke(); pg.dash();
}
/** Text with a white knock-out box behind it (legible over any pattern). */
export function haloText(pg: Page, s: string, x: number, y: number, size: number, font: "R" | "B" = "B", align: "l" | "c" | "r" = "l") {
  const w = textWidth(s, font, size), xx = align === "c" ? x - w / 2 : align === "r" ? x - w : x;
  pg.fillWhite().rect(xx - 1.2, y - size * .78, w + 2.4, size * 1.02).fill(); pg.fillBlack().text(s, x, y, size, font, align);
}
export function windArrow(pg: Page, cx: number, cy: number, r: number, rel: number) {
  pg.black().lw(.7).dash().circle(cx, cy, r).stroke();
  pg.rotated(cx, cy, rel, () => { pg.lw(r * .16).cap(1).move(cx, cy + r * .6).line(cx, cy - r * .25).stroke(); pg.fillBlack().poly([[cx - r * .36, cy - r * .2], [cx, cy - r * .72], [cx + r * .36, cy - r * .2]]).fill(); pg.cap(0); });
}
export function northArrow(pg: Page, cx: number, cy: number, r: number, rot: number) {
  pg.fillWhite().circle(cx, cy, r).fill(); pg.black().lw(.6).dash().circle(cx, cy, r).stroke();
  pg.rotated(cx, cy, rot, () => { pg.fillBlack().poly([[cx, cy - r * .78], [cx + r * .34, cy + r * .05], [cx - r * .34, cy + r * .05]]).fill(); pg.text("N", cx, cy + r * .72, r * .62, "B", "c"); });
}

/* ---------- one hole column ---------- */
/** The hole map (tee at the bottom, N arrow): patterns, markers, carries, planned shots. */
export function drawHoleMap(pg: Page, h: any, x: any, bx: number, by: number, bw: number, bh: number, o: { pad?: [number, number, number, number] } = {}) {
  const fr = holeFrame(h), shots = x.shots || [];
  pg.black().lw(.6).dash().rect(bx, by, bw, bh).stroke();
  const pts: [number, number][] = [...(h.fairways || []).flatMap((f: any) => f.polygon), ...(h.green?.polygon || []), ...(h.tees || []).flatMap((t: any) => t.polygon), ...h.line].map(fr.toS);
  const [pl, pt, pr, pb] = o.pad ?? [22, 18, 22, 16]; let [x0, y0, x1, y1] = bbox(pts); x0 -= pl; x1 += pr; y0 -= pt; y1 += pb;
  const k = Math.min((bw - 8) / (x1 - x0), (bh - 8) / (y1 - y0)), ox = bx + bw / 2 - ((x0 + x1) / 2) * k, oy = by + bh / 2 - ((y0 + y1) / 2) * k;
  const P = (ll: LL): [number, number] => { const q = fr.toS(ll); return [q[0] * k + ox, q[1] * k + oy]; };
  const PP = (poly: LL[]) => poly.map(P);
  // t202u: the line of play in page pt with yards from the tee, so a pencil X on the card can be read back as an estimated distance
  let acc = 0; const ruler: [number, number, number][] = h.line.map((ll: LL, i: number) => { if (i) { const a = fr.toS(h.line[i - 1]), b = fr.toS(ll); acc += Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.9144; } const q = P(ll); return [q[0], q[1], Math.round(acc)]; });
  pg.save().rect(bx, by, bw, bh).clip(); VIEW = [bx, by, bx + bw, by + bh];
  for (const wpo of h.trees?.wood_polygons || []) treesHatch(pg, PP(wpo));
  pg.black().lw(.45).dash(); for (const p of h.trees?.points || []) { const q = P(p); pg.circle(q[0], q[1], 1.6).stroke(); }
  for (const f of h.fairways || []) pg.black().lw(.75).dash().spoly(PP(f.polygon)).stroke();
  for (const w of h.water || []) waves(pg, PP(w.polygon));
  for (const b of h.bunkers || []) stipple(pg, PP(b.polygon));
  if (h.green?.polygon) { const g = PP(h.green.polygon); pg.fillWhite().spoly(g).fill(); pg.black().lw(1.5).dash().spoly(g).stroke(); }
  if (h.green?.center) { const q = P(h.green.center); pg.black().lw(.6).move(q[0] - 2, q[1]).line(q[0] + 2, q[1]).move(q[0], q[1] - 2).line(q[0], q[1] + 2).stroke(); }
  for (const t of h.tees || []) pg.fillBlack().poly(PP(t.polygon)).fill();
  pg.black().lw(.6).dash([2, 1.8]).poly(h.line.map(P), false).stroke(); pg.dash();
  // markers: short line + black pill with the number
  for (const m of h.markers || []) {
    const [a, b] = m.across.map(P), right = a[0] > b[0] ? a : b;
    pg.black().lw(1.2).cap(1).move(a[0], a[1]).line(b[0], b[1]).stroke(); pg.cap(0);
    const s = String(m.yd), tw = textWidth(s, "B", 6.3) + 5, px = Math.min(right[0] + (m.c ? 8 : 2.5), bx + bw - tw - 2);
    pg.fillBlack().rrect(px, right[1] - 4.2, tw, 8.4, 4.2).fill(); pg.fillWhite().text(s, px + tw / 2, right[1] + 2.2, 6.3, "B", "c"); pg.fillBlack();
    if (m.c) markerDot(pg, m.c, px - 3.4, right[1]);   // t227u: the club's colour marker (B&W glyph)
  }
  // hazard carry numbers (in play): boxed
  for (const z of h.hazards || []) {
    if (!z.in_play || z.greenside || z.carry_yd == null || !["bunker", "agua", "límite"].includes(z.kind)) continue;
    const q = P(z.center), s = String(z.carry_yd), tw = textWidth(s, "B", 6.3) + 4, px = Math.min(Math.max(q[0] + 4, bx + 2), bx + bw - tw - 2), py = Math.min(Math.max(q[1], by + 6), by + bh - 6);
    pg.fillWhite().rect(px, py - 4.4, tw, 8.6).fill(); pg.black().lw(.6).rect(px, py - 4.4, tw, 8.6).stroke(); pg.fillBlack().text(s, px + tw / 2, py + 2.2, 6.3, "B", "c");
  }
  // the player's planned shots
  const start: LL = h.tees?.[0]?.center || h.line[0];
  if (shots.length) {
    const chain = [P(start), ...shots.map((s: any) => P(s.to))];
    pg.black().lw(1.1).dash().poly(chain, false).stroke();
    shots.forEach((s: any, i: number) => { const q = chain[i + 1]; pg.fillWhite().circle(q[0], q[1], 3.3).fill(); pg.fillBlack().circle(q[0], q[1], 2.5).fill();
      const lab = `${i + 1} ${s.club}`; haloText(pg, lab, q[0] + 5, q[1] + 2.4, 7, "B");
      if (s.aim_yd) { const ax = q[0] + 5 + textWidth(lab, "B", 7) + 3, num = String(Math.abs(s.aim_yd)), tw = textWidth(num, "B", 6.5), dir = s.aim_yd < 0 ? -1 : 1, W2 = tw + 10;
        pg.fillWhite().rect(ax - 1, q[1] - 4.6, W2 + 2, 8.4).fill(); pg.fillBlack();
        const tip = dir < 0 ? ax : ax + W2, base = tip - dir * 4; pg.poly([[tip, q[1] - .4], [base, q[1] - 3], [base, q[1] + 2.2]]).fill();
        pg.text(num, dir < 0 ? ax + 5 : ax, q[1] + 2.2, 6.5, "B"); } });
  }
  pg.restore(); VIEW = null;
  northArrow(pg, bx + bw - 10, by + 10, 7.5, -fr.B);
  return { ruler };
}


export function holeFrame(h: any) {
  const ref: LL = h.tees?.[0]?.center || h.line[0], F = frame(ref), Bdeg = h.bearing?.tee_to_green_true ?? 0, B = Bdeg * Math.PI / 180, c = Math.cos(B), s = Math.sin(B);
  const R = ([x, y]: number[]): [number, number] => [x * c - y * s, -(x * s + y * c)];
  return { toS: (ll: LL) => R(F.xy(ll)), B: Bdeg };
}
function drawHole(pg: Page, h: any, x: any, X: number, Y: number, W: number, Hh: number, o: { unconfirmed: boolean }) {
  const fr = holeFrame(h);
  // header
  pg.fillBlack().rect(X, Y, 30, 30).fill(); pg.fillWhite().text(String(h.hole), X + 15, Y + 21.5, 17, "B", "c"); pg.fillBlack();
  pg.text(`${x.par ? `Par ${x.par}` : o.unconfirmed ? "Par —" : "Par —"} · ${h.play_length_yd ?? "—"} yd`, X + 36, Y + 11, 9.5, "B");
  pg.text(`Hora ${x.eta} · Rumbo ${Math.round(fr.B)}°`, X + 36, Y + 22, 7.5, "R");
  if (o.unconfirmed && !x.par) pg.text("Nº a confirmar", X + 36, Y + 31, 6.5, "R");
  // wind (forecast)
  const wy = Y + 44;
  if (x.wind) {
    windArrow(pg, X + 9, wy, 8.5, norm360(x.wind.from_deg + 180 - fr.B));
    pg.text(`${Math.round(x.wind.kmh)} km/h`, X + 22, wy + 1, 9.5, "B");
    const gx = X + 22 + textWidth(`${Math.round(x.wind.kmh)} km/h`, "B", 9.5) + 4;
    if (x.wind.gust_kmh) pg.text(`ráf. ${Math.round(x.wind.gust_kmh)}`, gx, wy + 1, 7, "R");
    pg.text(`de ${c16(x.wind.from_deg)}`, X + 22, wy + 9.5, 6.5, "R");
    if (x.effect) { pg.text(`${sgn(x.effect.plays_like_yd)} yd`, X + W, wy + 3, 11, "B", "r"); pg.text("por viento", X + W, wy + 10.5, 6, "R", "r"); }
  } else pg.text("Viento: sin pronóstico", X, wy + 2, 7.5, "R");
  // map box
  const bx = X, by = Y + 60, bw = W, bh = Hh - 60 - 92;
  drawHoleMap(pg, h, x, bx, by, bw, bh);
  const shots = x.shots || [];
  // plan line + notes
  const ny = by + bh + 12;
  pg.fillBlack().text("Plan", X, ny, 7.5, "B");
  pg.text(shots.length ? shots.map((s: any, i: number) => `${i + 1} ${s.club}`).join(" · ") : "—", X + 22, ny, 8, shots.length ? "B" : "R");
  pg.text("Notas", X, ny + 14, 7.5, "B");
  pg.black().lw(.5).dash(); for (let i = 0; i < 5; i++) { const ly = ny + 28 + i * 12.5; pg.move(X, ly).line(X + W, ly).stroke(); }
}

/* ---------- document ---------- */
export function yardagePdf(d: any, map: any) {
  const doc = new Doc(), M = 30, W = doc.w - 2 * M, p = d.plan, order = [...d.holes].sort((a: any, b: any) => a.order - b.order);
  const byHole = (n: number) => map.holes.find((h: any) => h.hole === n);
  const holesN = order.filter((x: any) => byHole(x.hole)?.line?.length);
  const pagesTotal = 1 + Math.ceil(holesN.length / 3);
  const brand = printBrand();
  // t200u: outlined wordmark rotated in the right margin (1-bit safe: stroke only, no grey)
  const wm = (pg: Page) => pg.rotated(doc.w - 13, doc.h / 2, 90, () => pg.outlineText(brand, doc.w - 13, doc.h / 2 + 3.2, 10, "B", "c", 0.35));
  const footer = (pg: Page, i: number) => { wm(pg); pg.black().lw(.4).dash().move(M, doc.h - 26).line(doc.w - M, doc.h - 26).stroke();
    pg.fillBlack().text(`${brand} · Estrategia de juego · ${d.course.course} · ${p.date.split("-").reverse().join("/")}`, M, doc.h - 16, 7, "R"); pg.text(`${i}/${pagesTotal}`, doc.w - M, doc.h - 16, 7, "B", "r"); };
  // cover
  const c = doc.page(); let y = M + 26;
  c.fillBlack().text("Estrategia de juego", M, y, 26, "B"); y += 22;
  c.text(`${d.course.club_name || ""} · Cancha ${d.course.course}`, M, y, 13, "B"); y += 17;
  c.text(`${dLong(p.date)} · salida ${p.tee_time} · desde el hoyo ${p.start_hole}`, M, y, 11, "R"); y += 14;
  c.text(`Ritmo ${String(p.min_per_hole).replace(".", ",")} min/hoyo (${p.pace_source === "propio" ? "tu ritmo" : p.pace_source === "manual" ? "elegido" : "estimado"}) · distancias: ${p.dist_source === "gps" ? "GPS" : "libreto"}`, M, y, 9, "R"); y += 18;
  // forecast summary
  const ws = order.map((x: any) => x.wind).filter(Boolean);
  c.black().lw(1).dash().rect(M, y, W, 58).stroke();
  c.text("Viento pronosticado", M + 10, y + 15, 10, "B");
  if (ws.length) {
    const kmh = ws.map((w: any) => w.kmh), g = ws.map((w: any) => w.gust_kmh || 0), vx = ws.reduce((a: number, w: any) => a + w.kmh * Math.sin(w.from_deg * Math.PI / 180), 0), vy = ws.reduce((a: number, w: any) => a + w.kmh * Math.cos(w.from_deg * Math.PI / 180), 0);
    const dom = norm360(Math.atan2(vx, vy) * 180 / Math.PI);
    windArrow(c, M + W - 30, y + 29, 16, norm360(dom + 180));
    c.text(`${Math.round(Math.min(...kmh))}–${Math.round(Math.max(...kmh))} km/h · ráfagas hasta ${Math.round(Math.max(...g))} · viene del ${c16(dom)}`, M + 10, y + 31, 10, "B");
    c.text(`Entre las ${order[0].eta} y las ${order[order.length - 1].eta}. Open-Meteo${d.forecast.fetched_at ? `, consultado el ${arTime(d.forecast.fetched_at)}` : ""}. Flecha: hacia dónde sopla (arriba = norte).`, M + 10, y + 45, 7.5, "R");
  } else c.text(d.forecast.status === "too_far" ? "Todavía sin pronóstico: llega hasta 16 días antes." : "Sin pronóstico para esta fecha.", M + 10, y + 33, 9, "R");
  y += 72;
  // 18-hole table
  const cols = [["Hoyo", 34], ["Par", 26], ["yd", 34], ["Hora", 38], ["Viento", 70], ["± yd", 36], ["Plan", W - 238]] as const;
  c.text("Los 18 hoyos", M, y, 10, "B"); y += 8;
  const rowH = 17.2; let cx = M;
  c.black().lw(.9).dash().move(M, y + 12).line(M + W, y + 12).stroke();
  for (const [t, w] of cols) { c.text(t, cx + 3, y + 9, 7.5, "B"); cx += w; }
  y += 12;
  for (const x of order) {
    const h = byHole(x.hole); cx = M; const yy = y + rowH / 2 + 3;
    const cells: (string | null)[] = [String(x.hole), x.par ? String(x.par) : "—", h?.play_length_yd != null ? String(h.play_length_yd) : "—", x.eta, null, x.effect ? sgn(x.effect.plays_like_yd) : "—", (x.shots || []).map((s: any) => s.club).join(" · ") || "—"];
    cells.forEach((t, i) => { const w = cols[i][1];
      if (i === 4) { if (x.wind) { windArrow(c, cx + 9, y + rowH / 2, 6, norm360(x.wind.from_deg + 180 - (x.bearing_true ?? 0))); c.text(`${Math.round(x.wind.kmh)}${x.wind.gust_kmh ? ` (${Math.round(x.wind.gust_kmh)})` : ""}`, cx + 19, yy, 8.5, "B"); } else c.text("—", cx + 3, yy, 8.5, "R"); }
      else c.text(t!, cx + 3, yy, i === 0 ? 9 : 8.5, i === 0 || i === 5 ? "B" : "R"); cx += w; });
    y += rowH; c.black().lw(.35).move(M, y).line(M + W, y).stroke();
  }
  y += 10;
  c.text("Viento: flecha respecto del hoyo (arriba = hacia el green), km/h y ráfagas entre paréntesis. ± yd: cuánto más largo (+) o corto (-) juega el hoyo.", M, y, 7, "R"); y += 9;
  if (d.course.numbering_unconfirmed) { c.text("Numeración de la Azul a confirmar con el club: en esos hoyos no mostramos el par.", M, y, 7, "R"); y += 9; }
  // legend
  y += 6; c.text("Referencias", M, y, 10, "B"); y += 8;
  const L: [string, (pg: Page, x: number, y: number) => void][] = [
    ["Bunker", (pg, x, yy) => stipple(pg, [[x, yy], [x + 22, yy], [x + 22, yy + 11], [x, yy + 11]])],
    ["Agua", (pg, x, yy) => waves(pg, [[x, yy], [x + 22, yy], [x + 22, yy + 11], [x, yy + 11]])],
    ["Árboles", (pg, x, yy) => treesHatch(pg, [[x, yy], [x + 22, yy], [x + 22, yy + 11], [x, yy + 11]])],
    ["Fairway", (pg, x, yy) => { pg.black().lw(.75).dash().rrect(x, yy, 22, 11, 5).stroke(); }],
    ["Green", (pg, x, yy) => { pg.black().lw(1.5).dash().rrect(x + 2, yy, 18, 11, 5.5).stroke(); }],
    ["Salida", (pg, x, yy) => { pg.fillBlack().rect(x + 6, yy + 2, 10, 7).fill(); }],
    [map?.marker_ref?.to === "entrada" ? "Marca a la entrada del green (yd)" : "Marca al centro del green (yd)", (pg, x, yy) => { pg.black().lw(1.2).move(x, yy + 5.5).line(x + 8, yy + 5.5).stroke(); pg.fillBlack().rrect(x + 9, yy + 1.3, 16, 8.4, 4.2).fill(); pg.fillWhite().text("150", x + 17, yy + 7.7, 6.3, "B", "c"); pg.fillBlack(); }],
    ["Carry al obstáculo (yd)", (pg, x, yy) => { pg.black().lw(.6).rect(x + 4, yy + 1.2, 15, 8.6).stroke(); pg.fillBlack().text("212", x + 11.5, yy + 7.7, 6.3, "B", "c"); }],
    ["Apuntar: yd a izq./der. por viento", (pg, x, yy) => { pg.fillBlack().poly([[x + 2, yy + 5.5], [x + 6, yy + 2.9], [x + 6, yy + 8.1]]).fill(); pg.text("8", x + 8, yy + 8, 6.5, "B"); }],
    ["Tus golpes: número y palo", (pg, x, yy) => { pg.black().lw(1.1).move(x, yy + 9).line(x + 12, yy + 3).stroke(); pg.fillBlack().circle(x + 12, yy + 3, 2.5).fill(); }],
    ["Línea de juego", (pg, x, yy) => { pg.black().lw(.6).dash([2, 1.8]).move(x, yy + 5.5).line(x + 22, yy + 5.5).stroke(); pg.dash(); }],
    ["Viento: hacia dónde sopla", (pg, x, yy) => windArrow(pg, x + 11, yy + 5.5, 6, 45)],
    ["Norte", (pg, x, yy) => northArrow(pg, x + 11, yy + 5.5, 6, 0)],
  ];
  L.forEach(([t, f], i) => { const col = i % 3, row = Math.floor(i / 3), lx = M + col * (W / 3), ly = y + row * 17; f(c, lx, ly); c.fillBlack().text(t, lx + 30, ly + 8, 7.5, "R"); });
  y += Math.ceil(L.length / 3) * 17 + 8;
  c.black().lw(.6).dash().rect(M, y, W, 40).stroke();
  c.text("Preparado antes de la ronda. Viento y ± yd según el pronóstico (estimación), no medidos en la cancha.", M + 8, y + 13, 7.5, "B");
  c.text("Sin pendientes ni lectura del green (Regla 4.3). Uso personal, para llevar en la ronda.", M + 8, y + 24, 7.5, "R");
  c.text(d.wind_model?.label || "", M + 8, y + 34, 6.5, "R");
  footer(c, 1);
  // hole pages: 3 per page
  const gap = 14, cw = (W - 2 * gap) / 3, top = M, colH = doc.h - M - 36 - top;
  for (let i = 0; i < holesN.length; i += 3) {
    const pg = doc.page();
    holesN.slice(i, i + 3).forEach((x: any, j: number) => drawHole(pg, byHole(x.hole), x, M + j * (cw + gap), top, cw, colH, { unconfirmed: !!d.course.numbering_unconfirmed }));
    footer(pg, 2 + i / 3);
  }
  return doc.render({ title: `Estrategia de juego · ${d.course.course} · ${p.date}` });
}
