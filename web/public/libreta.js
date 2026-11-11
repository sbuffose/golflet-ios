/* t189u/t190u/t191u Libreta: print options (holes + format + rules), booklet swipe between holes, the club guide's green (colour, screen)
   and the schematic hole planner for courses that only have the club guide (no map geometry yet). window.GolfletLibreta. API_v5 §63. */
(() => {
  const C = () => window.GolfletPlanCore;
  const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const K = { g: '#0B2545', gold: '#C8102E', red: '#C8102E', cel: '#C8A86A' };
  const f1 = v => (Math.round(v * 10) / 10).toString();
  const C16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'], c16 = d => C16[Math.round(((d % 360) + 360) % 360 / 22.5) % 16];
  const BRAND = () => (document.documentElement.dataset.brand || 'Golflet');   // t200u: white-label later via <html data-brand>
  const LOCK = '<svg class="gp-lk" viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="5.2" width="8" height="5.8" rx="1.2" fill="currentColor"/><path d="M3.8 5.2V3.9a2.2 2.2 0 0 1 4.4 0v1.3" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';

  /* t215u: smooth closed outlines (public/smooth-path.js); straight polygon fallback */
  const SMD = a => window.GolfletSmooth ? window.GolfletSmooth.d(a) : (a.length ? 'M' + a.map(q => q.join(',')).join(' L') + ' Z' : '');
  const PN = q => String(q).split(',').map(Number);
  /* ---------- green (club guide), colour ---------- */
  function arrow(x, y, dir, L) { const r = dir * Math.PI / 180, dx = Math.sin(r), dy = -Math.cos(r), ax = x - dx * L / 2, ay = y - dy * L / 2, bx = x + dx * L / 2, by = y + dy * L / 2, h = L * .32;
    return `<line x1="${f1(ax)}" y1="${f1(ay)}" x2="${f1(bx)}" y2="${f1(by)}"/><path d="M${f1(bx - dx * h - dy * h * .7)},${f1(by - dy * h + dx * h * .7)} L${f1(bx)},${f1(by)} L${f1(bx - dx * h + dy * h * .7)},${f1(by - dy * h - dx * h * .7)}"/>`; }
  /* t230u: double arrow = the guide's «more slope» (two shafts, bigger head) */
  function arrow2(x, y, dir, L) { const r = dir * Math.PI / 180, dx = Math.sin(r), dy = -Math.cos(r), px = -dy * .42, py = dx * .42, ax = x - dx * L / 2, ay = y - dy * L / 2, bx = x + dx * L / 2, by = y + dy * L / 2, h = L * .36;
    return `<line x1="${f1(ax + px)}" y1="${f1(ay + py)}" x2="${f1(bx + px - dx * .6)}" y2="${f1(by + py - dy * .6)}"/><line x1="${f1(ax - px)}" y1="${f1(ay - py)}" x2="${f1(bx - px - dx * .6)}" y2="${f1(by - py - dy * .6)}"/><path d="M${f1(bx - dx * h - dy * h * .8)},${f1(by - dy * h + dx * h * .8)} L${f1(bx)},${f1(by)} L${f1(bx - dx * h + dy * h * .8)},${f1(by - dy * h - dx * h * .8)}"/>`; }
  function greenSvg(g, o = {}) {
    const G = C().greenGeom(g), [x0, y0, x1, y1] = C().greenBox(G), pad = 5, px = 12, W = x1 - x0 + 2 * px, H = y1 - y0 + 2 * pad + 13;
    const X = x => x - x0 + px, Y = y => y1 - y + pad + 5, pts = a => a.map(([x, y]) => `${f1(X(x))},${f1(Y(y))}`).join(' '), sd = a => SMD(a.map(([x, y]) => [X(x), Y(y)]));   // t215u: smooth outlines
    let s = `<svg class="lb-green" viewBox="0 0 ${f1(W)} ${f1(H)}" role="img" aria-label="${e(o.label || 'Green')}">`;
    s += `<g stroke="${K.g}" stroke-width=".45" opacity=".55">${G.banks.flat().map(([a, b]) => `<line x1="${f1(X(a[0]))}" y1="${f1(Y(a[1]))}" x2="${f1(X(b[0]))}" y2="${f1(Y(b[1]))}"/>`).join('')}</g>`;
    s += G.bunkers.map(b => `<path d="${sd(b.poly)}" fill="${K.gold}" stroke="#a88b4f" stroke-width=".3"/>`).join('');
    s += `<path d="${sd(G.outline)}" fill="rgba(15,61,46,.12)" stroke="${K.g}" stroke-width="1"/>`;
    s += `<clipPath id="lbc${o.id || ''}"><path d="${sd(G.outline)}"/></clipPath><g clip-path="url(#lbc${o.id || ''})">` + G.tiers.map(t => {
      const p = t.pts.map(([x, y]) => [X(x), Y(y)]);
      if (t.kind === 'nivel') return `<polyline points="${p.map(q => q.map(f1).join(',')).join(' ')}" fill="none" stroke="${K.g}" stroke-width=".6" stroke-dasharray="1.6 1"/>`;
      let ticks = ''; for (let i = 0; i < p.length - 1; i++) { const [a, b] = [p[i], p[i + 1]], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
        for (let d = 1; d < L; d += 1.6) { const m = [a[0] + ux * d, a[1] + uy * d]; ticks += `<line x1="${f1(m[0])}" y1="${f1(m[1])}" x2="${f1(m[0] - uy * 1.8)}" y2="${f1(m[1] + ux * 1.8)}"/>`; } }
      return `<g stroke="${K.red}" stroke-width=".45"><polyline points="${p.map(q => q.map(f1).join(',')).join(' ')}" fill="none" stroke-width=".8"/>${ticks}</g>`; }).join('') + '</g>';
    if (G.false_front) { const ff = G.false_front, yy = Y(ff.yd), xl = X(-ff.half[0]), xr = X(ff.half[1]);   // t227u: where the false front ends + its number (club guide)
      if (ff.kind !== 'pendiente') s += `<g clip-path="url(#lbc${o.id || ''})"><line class="lb-ff" x1="${f1(xl - 2)}" y1="${f1(yy)}" x2="${f1(xr + 2)}" y2="${f1(yy)}" stroke="${K.g}" stroke-width=".8" stroke-dasharray="1.8 1.1"/></g>`;
      s += `<text x="${f1(xr + 2.8)}" y="${f1(yy + 1.2)}" class="lb-gn lb-ffn">${ff.yd}</text>`; }
    for (const k of G.marks || []) { const x = X(k.at[0]), y = Y(k.at[1]), inw = k.kind === 'borde' ? (k.at[0] < 0 ? 1 : -1) : 0;   // t229u: the guide's numbers = yd from the entrance to that spot
      s += `<circle cx="${f1(x)}" cy="${f1(y)}" r=".55" fill="${K.g}"/><text x="${f1(x + inw * 1.2 + (inw ? 0 : 1.1))}" y="${f1(y + (k.kind === 'nivel' ? -0.8 : 0.9))}" text-anchor="${inw > 0 ? 'start' : inw < 0 ? 'end' : 'start'}" class="lb-gn lb-mk">${k.yd}</text>`; }
    s += `<g stroke="${K.g}" stroke-width=".55" fill="none" stroke-linecap="round">${G.falls.map(f => f.strength === 2 ? arrow2(X(f.at[0]), Y(f.at[1]), f.dir, 4.4) : arrow(X(f.at[0]), Y(f.at[1]), f.dir, 4.2)).join('')}</g>`;
    const top = Math.min(...G.outline.map(p => Y(p[1]))), mid = X(0);
    s += `<text x="${f1(mid)}" y="${f1(top + 4.2)}" text-anchor="middle" class="lb-gt">${G.depth}</text>`;
    s += G.bunkers.filter(b => b.nums?.length).map(b => `<text x="${f1(X(b.label[0]))}" y="${f1(Y(b.label[1]) + 1)}" text-anchor="${b.side === 'L' ? 'end' : 'start'}" class="lb-gn">${b.nums.join('/')}</text>`).join('');
    for (const z of G.ob || []) { if (z.side === 'B') s += `<line x1="1" y1="${f1(top - 3)}" x2="${f1(W - 1)}" y2="${f1(top - 3)}" stroke="${K.red}" stroke-width=".5" stroke-dasharray="3 1 .6 1"/>`;
      else { const x = z.side === 'R' ? W - 1.2 : 1.2; s += `<line x1="${f1(x)}" y1="2" x2="${f1(x)}" y2="${f1(H - 6)}" stroke="${K.red}" stroke-width=".5" stroke-dasharray="3 1 .6 1"/>`; } }
    const fy = Y(0); s += `<path d="M${f1(mid - 1.6)},${f1(fy + 4)} L${f1(mid)},${f1(fy + 2)} L${f1(mid + 1.6)},${f1(fy + 4)}" fill="${K.g}"/><text x="${f1(mid)}" y="${f1(Math.max(fy + 7.4, H - 1.2))}" text-anchor="middle" class="lb-gn">entrada</text>`;
    return s + '</svg>';
  }
  const greenKey = (o = {}) => `<p class="lb-key"><span><svg viewBox="0 0 12 6" aria-hidden="true"><g stroke="${K.g}" stroke-width="1" fill="none">${arrow(6, 3, 90, 9)}</g></svg>${o.dbl ? 'cae menos' : 'cae hacia'}</span>${o.dbl ? `<span><svg viewBox="0 0 12 6" aria-hidden="true"><g stroke="${K.g}" stroke-width=".8" fill="none">${arrow2(6, 3, 90, 9)}</g></svg>cae más</span>` : ''}<span><i style="border-top:1.5px dashed ${K.g}"></i>cambio de nivel</span><span><i style="border-top:2px solid ${K.red}"></i>pendiente</span>${o.ff && o.ff.kind !== 'pendiente' ? `<span><i style="border-top:1.5px dashed ${K.g}"></i>fin del frente falso</span>` : ''}${o.ff || o.marks ? '<span>números: yd desde la entrada</span>' : ''}<span><i class="lb-b"></i>bunker</span></p>`;

  /* ---------- print options (t189u) ---------- */
  // t201u: two booklets — "Con mi estrategia" (plan: shots, times, wind, ± yd) and "De la cancha" (plain course guide, no plan data)
  function printCard(d, o = {}) {
    const ord = [...d.holes].sort((a, b) => a.order - b.order), TN = d.torneo || {}, only = !!o.courseOnly || !d.plan?.id;
    const rules = TN.on || TN.active ? 'torneo' : 'normal';   // t208u/t209u: full-length 21 cm card by default; torneo (17,7 cm + strip) when chosen or in a competition
    return `<details class="card lb-print" id="lbp" ${o.open ? 'open' : ''}><summary><svg class="gp-ai" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z"/></svg><b>${only ? 'Libreta de la cancha' : 'Imprimir libreta'}</b><span>A4 · 3 tarjetas por hoja</span></summary>
      ${only ? '' : `<div class="lb-row lb-kind"><span class="gp-l">Libreta</span><div class="seg" id="lbkind" role="radiogroup" aria-label="Qué libreta"><button type="button" data-k="estrategia" class="on" aria-pressed="true">Con mi estrategia</button><button type="button" data-k="cancha" aria-pressed="false">De la cancha</button></div></div>
      <p class="foot lb-kinds" id="lbkd"></p>`}
      <div class="lb-row"><span class="gp-l">Hoyos</span><button type="button" class="linkb" id="lball">Todos</button><button type="button" class="linkb" id="lbnone">Ninguno</button></div>
      <div class="lb-holes" role="group" aria-label="Hoyos a imprimir">${ord.map(x => `<button type="button" class="on" aria-pressed="true" data-lh="${x.hole}"><b class="num">${x.hole}</b>${x.par === 3 ? '<small>par 3</small>' : ''}</button>`).join('')}</div>
      <div class="lb-row"><span class="gp-l">Formato</span><div class="seg" id="lbfmt"><button type="button" data-f="duplex" class="on" aria-pressed="true">Doble faz</button><button type="button" data-f="simplex" aria-pressed="false">Una cara</button></div></div>
      <div class="lb-row"><span class="gp-l">Tarjeta</span><div class="seg" id="lbrul"><button type="button" data-r="normal" class="${rules === 'normal' ? 'on' : ''}" aria-pressed="${rules === 'normal'}" ${TN.on || TN.active ? 'disabled' : ''}>Normal</button><button type="button" data-r="torneo" class="${rules === 'torneo' ? 'on' : ''}" aria-pressed="${rules === 'torneo'}">Torneo</button></div></div>
      ${only ? `<div class="lb-row lb-wx"><span class="gp-l">Viento</span><input type="date" id="lbdate" aria-label="Día de juego (pronóstico de viento)" value="${e(d.plan?.date || '')}"><input type="time" id="lbtime" step="600" aria-label="Hora de salida" value="${e(d.plan?.tee_time || '09:00')}"></div>
      <p class="foot" id="lbwx"></p>` : ''}
      <div class="lb-go"><a class="btn" id="lbgo" target="_blank" rel="noopener" href="#">Descargar PDF</a><button type="button" class="btn ghost" id="lbshare">Compartir</button></div>
      ${d.course.map !== false && !only ? `<a class="btn ghost gp-pdf" id="lba4" href="/api/plans/${e(d.plan.id)}/pdf" target="_blank" rel="noopener">Mapas A4 vertical (sin cortar)</a>` : ''}
      <p class="foot" id="lbhow"></p></details>`;
  }
  function bindPrint(el, d) {
    const only = !d.plan?.id, S = { holes: new Set(d.holes.map(x => x.hole)), f: 'duplex', r: d.torneo?.on || d.torneo?.active ? 'torneo' : 'normal', k: only ? 'cancha' : 'estrategia' }, $ = s => el.querySelector(s);
    const cUrl = `/api/course-maps/${encodeURIComponent(d.course.club_code)}/${encodeURIComponent(d.course.course)}/libreta`;
    const upd = () => { const hs = [...S.holes].sort((a, b) => a - b), go = $('#lbgo'); if (!go) return;
      const q = `holes=${hs.join(',')}&format=${S.f}&rules=${S.r}`;
      const dt = only ? ($('#lbdate')?.value || '') : (d.plan?.date || ''), tm = only ? ($('#lbtime')?.value || '') : (d.plan?.tee_time || '');   // t214u: forecast wind in the course libreta
      const wx = dt ? `&date=${encodeURIComponent(dt)}${tm ? `&time=${encodeURIComponent(tm)}` : ''}` : '';
      const wl = $('#lbwx'); if (wl) wl.textContent = dt ? `Viento pronosticado (Open-Meteo) para cada hoyo desde la salida de las ${tm || '—'}: flecha, km/h y ráfagas. Hasta 16 días antes.` : 'Sin día elegido: la libreta sale sin viento (lo dice en la carátula).';
      go.href = S.k === 'cancha' ? `${cUrl}?${q}${wx}` : `/api/plans/${encodeURIComponent(d.plan.id)}/yardbook?${q}`;
      go.textContent = 'Descargar PDF';
      const kd = $('#lbkd'); if (kd) kd.textContent = S.k === 'cancha' ? 'Guía de la cancha: diseño de cada hoyo, rumbo, marcas 50–250, obstáculos con distancia para pasarlos y greens con sus caídas. Sin tus golpes, horario ni viento.'
        : 'Tu estrategia: golpes planificados, hora y viento de cada hoyo, ± yd por viento y carátula con fecha, salida y pronóstico.';
      const a4 = $('#lba4'); if (a4) a4.hidden = S.k === 'cancha'; go.classList.toggle('off', !hs.length); go.setAttribute('aria-disabled', String(!hs.length));
      const size = S.r === 'torneo' ? '9,9 × 17,7 cm' : '9,9 × 21 cm';
      $('#lbhow').textContent = (S.f === 'duplex' ? 'Imprimí en A4 horizontal, doble faz, girar en el borde largo, tamaño real (100%). Cortá por las líneas punteadas, ordená por el número de arriba (FRENTE) y abrochá arriba: al levantar cada tarjeta ves el green del hoyo que sigue.'
        : 'Imprimí en A4 horizontal, una cara, tamaño real (100%). Cortá por las líneas punteadas; cada tarjeta trae su green arriba.')
        + ` Tarjetas de ${size}.` + (S.r === 'torneo' ? ' Cortá también la tira de abajo. Greens a escala 1:480 o menor: sirve para torneo (Regla 4.3).' : ' Tarjeta larga, sin tira para cortar, con el dibujo del hoyo más grande y greens ampliados: no sirve para torneo (para torneo elegí «Torneo»: 9,9 × 17,7 cm).'); };
    el.querySelectorAll('[data-lh]').forEach(b => b.onclick = () => { const n = +b.dataset.lh, on = !S.holes.has(n); on ? S.holes.add(n) : S.holes.delete(n); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); upd(); });
    const all = on => { el.querySelectorAll('[data-lh]').forEach(b => { const n = +b.dataset.lh; on ? S.holes.add(n) : S.holes.delete(n); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); upd(); };
    const a = $('#lball'), z = $('#lbnone'); if (a) a.onclick = () => all(true); if (z) z.onclick = () => all(false);
    const seg = (sel, k, attr) => el.querySelectorAll(`${sel} [${attr}]`).forEach(b => b.onclick = () => { if (b.disabled) return; S[k] = b.getAttribute(attr); el.querySelectorAll(`${sel} [${attr}]`).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); }); upd(); });
    ['#lbdate', '#lbtime'].forEach(k => { const i = $(k); if (i) i.addEventListener('input', upd); });
    seg('#lbfmt', 'f', 'data-f'); seg('#lbrul', 'r', 'data-r'); seg('#lbkind', 'k', 'data-k');
    const sh = $('#lbshare');
    if (sh) sh.onclick = async () => {
      const url = go.href; if (!url || url.endsWith('#')) return;
      try {
        const r = await fetch(url, { credentials: 'same-origin' });
        if (!r.ok) throw new Error('No se pudo armar el PDF');
        const blob = await r.blob();
        const file = new File([blob], 'libreta-golflet.pdf', { type: blob.type || 'application/pdf' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: 'Libreta Golflet' });
        else if (navigator.share) await navigator.share({ title: 'Libreta Golflet', url });
        else go.click();
      } catch (err) { if (err && err.name !== 'AbortError') go.click(); }
    };
    const go = $('#lbgo'); if (go) go.addEventListener('click', ev => { if (!S.holes.size) ev.preventDefault(); });
    upd();
  }

  /* ---------- booklet: swipe hole by hole (t191u) ---------- */
  function swipe(el, prevHref, nextHref) {
    let x0 = null, y0 = 0, t0 = 0;
    el.ontouchstart = ev => { if (ev.touches.length !== 1 || ev.target.closest('.gp-clubs,.lb-clubs,input,select,.gp-map')) { x0 = null; return; } x0 = ev.touches[0].clientX; y0 = ev.touches[0].clientY; t0 = Date.now(); };
    el.ontouchend = ev => { if (x0 == null) return; const t = ev.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0; x0 = null;
      if (Math.abs(dx) > 64 && Math.abs(dy) < 48 && Date.now() - t0 < 700) { const h = dx < 0 ? nextHref : prevHref; if (h) location.hash = h; } };
  }

  /* ---------- schematic hole (club guide only, no map geometry) ---------- */
  function holeSvg(hg, g, shots, pend) {
    const depth = g?.depth_yd ?? 30, len = hg.yd, front = len - depth / 2, W = 100, Hh = 190, k = (Hh - 14) / (len + depth / 2 + 10), cx = W / 2, teeY = Hh - 6, Y = yd => teeY - yd * k, lat = 24;
    let s = `<svg class="gp-map lb-hole" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Esquema del hoyo según la guía del club">`;
    for (const z of hg.hazards) { const sd = z.side.startsWith('izq') ? -1 : z.side.startsWith('der') ? 1 : 0;
      if (z.kind === 'límite') { s += z.side === 'atrás' ? `<line x1="6" x2="94" y1="${f1(Y(len + depth / 2 + 4))}" y2="${f1(Y(len + depth / 2 + 4))}" stroke="${K.red}" stroke-width=".6" stroke-dasharray="4 1.5 1 1.5"/>` : `<line x1="${cx + sd * 46}" x2="${cx + sd * 46}" y1="4" y2="${Hh - 4}" stroke="${K.red}" stroke-width=".6" stroke-dasharray="4 1.5 1 1.5"/>`; continue; }
      if (z.kind === 'árboles') { for (let i = 0; i < 5; i++) s += `<circle cx="${cx + sd * 38}" cy="${f1(Y(len * (.25 + i * .12)))}" r="3" fill="rgba(15,61,46,.25)"/>`; continue; }
      let a, b; if (z.to_green?.length) { a = front - Math.max(...z.to_green); b = front - Math.min(...z.to_green); if (a === b) { a -= 4; b += 4; } } else if (z.reach != null || z.carry != null) { a = z.reach ?? z.carry - 12; b = z.carry ?? z.reach + 12; } else continue;
      const ccx = sd ? cx + sd * lat : cx, rx = sd ? 7 : 22, ry = Math.max(2, (Y(a) - Y(b)) / 2), cy = (Y(a) + Y(b)) / 2;
      s += z.kind === 'bunker de pasto' ? `<ellipse cx="${ccx}" cy="${f1(cy)}" rx="${rx}" ry="${f1(ry)}" fill="none" stroke="${K.g}" stroke-dasharray="1 1" stroke-width=".5"/>`
        : `<ellipse cx="${ccx}" cy="${f1(cy)}" rx="${rx}" ry="${f1(ry)}" fill="${K.gold}"/><text x="${sd <= 0 ? ccx - rx - 1 : ccx + rx + 1}" y="${f1(cy + 1.4)}" text-anchor="${sd <= 0 ? 'end' : 'start'}" class="lb-hz">${z.to_green?.length ? z.to_green.join('-') + ' g' : z.reach != null && z.carry != null ? `${z.reach}-${z.carry}` : (z.carry ?? z.reach)}</text>`; }
    s += `<line x1="${cx}" x2="${cx}" y1="${teeY}" y2="${f1(Y(len))}" stroke="${K.g}" stroke-width=".5" stroke-dasharray="1.5 1.2"/>`;
    if (g) { const G = C().greenGeom(g), P = ([x, y]) => `${f1(cx + x * k)},${f1(Y(front + y))}`;
      s += G.bunkers.map(b => `<path d="${SMD(b.poly.map(P).map(PN))}" fill="${K.gold}"/>`).join('') + `<path d="${SMD(G.outline.map(P).map(PN))}" fill="rgba(15,61,46,.18)" stroke="${K.g}" stroke-width=".8"/>`; }
    s += `<rect x="${cx - 3}" y="${teeY - 2}" width="6" height="4" fill="${K.g}"/>`;
    const MC = { rojo: K.red, azul: K.cel, amarillo: K.gold, blanco: '#fff' };
    for (const m of hg.markers) { const yy = Y(front - m.to_green); s += `<circle cx="${cx}" cy="${f1(yy)}" r="1.8" fill="${MC[m.c] || '#fff'}" stroke="${K.g}" stroke-width=".4"/><text x="${cx + 3}" y="${f1(yy + 1.4)}" class="lb-mk">${m.to_green}</text>`; }
    let acc = 0; shots.forEach((sh, i) => { acc = sh.yd_from_tee ?? acc; const yy = Y(Math.min(acc, len));
      s += `<circle cx="${cx}" cy="${f1(yy)}" r="2.4" fill="${K.g}" stroke="#fff" stroke-width=".6"/><text x="${cx - 4}" y="${f1(yy + 1.4)}" text-anchor="end" class="lb-sh">${i + 1} ${e(sh.club)}</text>`; });
    if (pend != null) { const yy = Y(Math.min(pend, len)); s += `<circle cx="${cx}" cy="${f1(yy)}" r="3.2" fill="none" stroke="${K.gold}" stroke-width="1"/>`; }
    return s + '</svg>';
  }
  async function guideHole(el, o) {
    const { d, id, n, H, live } = o, x = d.holes.find(y => y.hole === n), TN = d.torneo || { active: false, locks: {} }, LK = TN.active ? TN.locks : {};
    const ord = [...d.holes].sort((a, b) => a.order - b.order), i = ord.findIndex(y => y.hole === n), prev = ord[i - 1]?.hole, next = ord[i + 1]?.hole;
    let gd = null, lockedGuide = false; try { gd = await H.api(`/api/course-maps/${encodeURIComponent(d.course.club_code)}/${encodeURIComponent(d.course.course)}/green-guide`); } catch (err) { lockedGuide = err?.status === 423; }
    if (gd?.greens_locked) lockedGuide = true;
    const CL = LK.planner ? null : await H.api('/api/plans/clubs').catch(() => null); if (!live('gp')) return;
    const hg = gd?.holes?.[n], g = gd?.greens?.[n];
    const lib = (CL?.clubs || []).map(c => ({ code: c.code, yd: c.libreto?.total_yd ?? c.libreto?.carry_yd ?? (c.gps?.ok ? Math.round(c.gps.mean.fwd) : null), carry: c.libreto?.carry_yd ?? null })).filter(c => c.yd);
    let shots = [...(x.shots || [])];
    const save = async () => { try { await H.api(`/api/plans/${encodeURIComponent(id)}/holes/${n}`, { method: 'PUT', body: JSON.stringify({ shots }) }); } catch (err) { H.toast(err.message || 'No se pudo guardar'); } };
    const render = () => {
      const len = hg?.yd ?? x.play_length_yd ?? 0, at = shots.length ? shots[shots.length - 1].yd_from_tee : 0, remain = Math.max(0, Math.round(len - at)), done = shots.length && remain <= 6;
      const YD = C().YD, sug = !LK.planner && !done && lib.length && len ? C().suggestShot({ ball: [0, at * YD], green: [0, len * YD], path: [[0, 0], [0, len * YD]], clubs: lib.map(c => ({ code: c.code, dd: { kind: 'point', yd: c.yd, carry: c.carry } })), wind: null, hz: [], first: shots.length === 0 }) : null;
      const sugYd = sug ? Math.round(sug.landing[1] / YD) : null;
      el.innerHTML = `<div class="gp-hh"><div><div class="gp-ht">Hoyo ${n}</div><div class="gp-hs num">${x.par ? `Par ${x.par} · ` : ''}${LK.distances ? '' : `${x.play_length_yd ?? len} yd · `}${e(x.eta)}</div></div>
          <nav class="gp-nav">${prev ? `<a href="#/plan/${e(id)}/hoyo/${prev}" aria-label="Hoyo ${prev}">‹ ${prev}</a>` : ''}${next ? `<a href="#/plan/${e(id)}/hoyo/${next}" aria-label="Hoyo ${next}">${next} ›</a>` : ''}</nav></div>
        ${TN.active ? `<div class="gp-tn" role="status">${LOCK}<b>Modo torneo</b></div>` : ''}
        ${x.wind ? `<p class="lb-wind num"><b>${Math.round(x.wind.kmh)}</b> km/h${x.wind.gust_kmh ? ` <small>ráf. ${Math.round(x.wind.gust_kmh)}</small>` : ''} · viene del ${c16(x.wind.from_deg)} · flecha: hacia dónde sopla <span class="lb-sd">${d.course.completeness && !d.course.completeness.ready.wind_yd ? 'cancha en relevamiento' : '± s/d'}</span></p>` : ''}
        ${g && !lockedGuide ? `<section class="lb-gw lb-wm" data-brand="${e(BRAND())}" aria-label="Green del hoyo ${n}">${greenSvg(g, { id: n, label: `Green del hoyo ${n}: forma, caídas y niveles según la guía del club` })}${greenKey({ ff: g.false_front, marks: g.marks?.length, dbl: g.falls?.some(f => f[3] === 2) })}</section>` : lockedGuide ? `<p class="foot">${LOCK} Modo torneo: la guía de greens no se muestra durante la ronda.</p>` : ''}
        <div class="gp-mapw${hg ? ' lb-wm' : ''}" data-brand="${e(BRAND())}">${hg ? holeSvg(hg, g, shots, sugYd) : '<div class="msg">Sin esquema de este hoyo.</div>'}</div>
        <div class="gp-pl card">
          ${LK.planner ? `<div class="gp-shots gp-static">${shots.length ? shots.map((s, k) => `<span class="num">${k + 1}·${e(s.club)}</span>`).join('') : '<span>Sin golpes armados</span>'}</div>`
          : `${done ? `<div class="gp-done-c"><b>En el green</b><span>${shots.length} ${shots.length === 1 ? 'golpe' : 'golpes'}</span></div>` : `<div class="gp-rem"><b class="num">${remain}</b><span>yd al centro</span></div>`}
          ${sug && !done ? `<div class="gp-sugr"><button type="button" class="gp-sug" id="lbsug"><b>${e(sug.code)}</b><span class="num">→ ${sug.after_yd}</span></button><span class="gp-est">estimación</span></div>` : ''}
          ${!done ? (lib.length ? `<div class="gp-clubs lb-clubs" role="group" aria-label="Palo">${lib.map(c => `<button type="button" data-c="${e(c.code)}" class="${sug?.code === c.code ? 'fit' : ''}"><b>${e(c.code)}</b><span class="num">${Math.min(c.yd, remain + 15) < c.yd ? '≈' + remain : c.yd}</span></button>`).join('')}</div>` : '<div class="msg">Cargá tus distancias en <a href="#/bolsa">Mi bolsa</a> para armar el hoyo.</div>') : ''}
          ${shots.length ? `<div class="gp-shots">${shots.map((s, k) => `<span class="num">${k + 1}·${e(s.club)}${s.suggested ? '<i class="gp-sd" aria-label="sugerido"></i>' : ''}</span>`).join('')}<button type="button" class="gp-undo" id="lbundo">Deshacer</button></div>` : ''}
          ${done && next ? `<a class="btn" href="#/plan/${e(id)}/hoyo/${next}">Hoyo ${next}</a>` : ''}`}
        </div>
        <details class="gp-det"><summary>Detalle del hoyo</summary>
          <p>Esquema según la guía de campo del club: distancias reales de la guía (marcas a la entrada del green, obstáculos desde la salida); la posición a los costados es aproximada. Todavía no tenemos el rumbo del hoyo, así que no calculamos el ± yd por viento.</p>
          ${hg?.card_diff ? `<p>${e(hg.card_diff)}</p>` : ''}
          ${sug ? `<p><b>Qué conviene</b> (estimación, solo por distancia): ${e(sug.code)}. ${e(sug.reason.text)}</p>` : ''}
          <p>Green: forma, caídas, cambios de nivel y bunkers de la guía (datos generales, no un relevamiento). Flechas: hacia dónde cae.</p>
          <p class="foot">${e(gd?.source?.title || '')} · Viento: Open-Meteo.</p></details>`;
      const add = (code, sugd) => { const c = lib.find(z => z.code === code); if (!c) return; const yd = Math.min(at + Math.min(c.yd, remain + 15 < c.yd ? remain : c.yd), len);
        shots.push({ club: code, source: 'libreto', yd_from_tee: Math.round(yd), adjusted: false, ...(sugd ? { suggested: true } : {}) }); render(); save(); };
      el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => add(b.dataset.c, false));
      const sb = live('lbsug'); if (sb) sb.onclick = () => { shots.push({ club: sug.code, source: 'libreto', yd_from_tee: Math.min(sugYd, len), adjusted: false, suggested: true }); render(); save(); };
      const un = live('lbundo'); if (un) un.onclick = () => { shots.pop(); render(); save(); };
      swipe(el, prev ? `#/plan/${id}/hoyo/${prev}` : null, next ? `#/plan/${id}/hoyo/${next}` : null);
    };
    render();
  }
  /* ---------- t201u: course-only booklet hole (club guide schematic, no plan data) ---------- */
  async function courseHole(el, { d, n, H, live, base }) {
    const x = d.holes.find(y => y.hole === n) || { hole: n }, i = d.holes.findIndex(y => y.hole === n), prev = d.holes[i - 1]?.hole, next = d.holes[i + 1]?.hole;
    let gd = null, locked = false; try { gd = await H.api(`/api/course-maps/${encodeURIComponent(d.course.club_code)}/${encodeURIComponent(d.course.course)}/green-guide`); } catch (err) { gd = null; }
    if (gd?.greens_locked) locked = true; if (!live('gp')) return;
    const hg = gd?.holes?.[n], g = gd?.greens?.[n];
    el.innerHTML = `<div class="gp-hh"><div><div class="gp-ht">Hoyo ${n}</div><div class="gp-hs num">${x.par ? `Par ${x.par} · ` : ''}${x.play_length_yd ?? hg?.yd ?? '—'} yd · Rumbo s/d</div></div>
        <nav class="gp-nav">${prev ? `<a href="${base}/hoyo/${prev}" aria-label="Hoyo ${prev}">‹ ${prev}</a>` : ''}${next ? `<a href="${base}/hoyo/${next}" aria-label="Hoyo ${next}">${next} ›</a>` : ''}</nav></div>
      <p class="foot lb-cmode">Libreta de la cancha · sin datos de estrategia</p>
      ${x.relevamiento ? '<div class="card gp-relev" role="status"><b>Hoyo en relevamiento</b><span>Todavía no tenemos todos los datos de este hoyo.</span></div>' : ''}
      ${g && !locked ? `<section class="lb-gw lb-wm" data-brand="${e(BRAND())}" aria-label="Green del hoyo ${n}">${greenSvg(g, { id: n, label: `Green del hoyo ${n}: forma, caídas y niveles según la guía del club` })}${greenKey({ ff: g.false_front, marks: g.marks?.length, dbl: g.falls?.some(f => f[3] === 2) })}</section>` : locked ? `<p class="foot">${LOCK} Modo torneo: la guía de greens no se muestra durante la ronda.</p>` : ''}
      <div class="gp-mapw${hg ? ' lb-wm' : ''}" data-brand="${e(BRAND())}">${hg ? holeSvg(hg, g, [], null) : '<div class="msg">Sin esquema de este hoyo.</div>'}</div>
      ${hg?.hazards?.length ? `<ul class="gp-hzl">${hg.hazards.filter(z => z.kind !== 'límite').map(z => `<li>${e(z.kind)} ${e(z.side)}${z.reach != null && z.carry != null ? `: lo alcanzás a ${z.reach} y lo pasás con ${z.carry} yd` : z.carry != null ? `: lo pasás con ${z.carry} yd` : z.to_green?.length ? `: a ${z.to_green.join('-')} yd del green` : ''}</li>`).join('')}</ul>` : ''}
      <p class="foot">Esquema según la guía de campo del club: distancias reales de la guía; la posición a los costados es aproximada. ${e(gd?.source?.title || '')}</p>`;
    swipe(el, prev ? `${base}/hoyo/${prev}` : null, next ? `${base}/hoyo/${next}` : null);
  }
  window.GolfletLibreta = { greenSvg, greenKey, printCard, bindPrint, swipe, guideHole, courseHole };
})();
