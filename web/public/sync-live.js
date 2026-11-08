/* Golflet · sync v3 "live card": club crest, running counters (águilas, birdies, pares…), mini drawing of the
   card just read and a 12-month "días de juego" strip. Fed by /api/sync-progress (stats, club_code, club_logo).
   Mounted by sync-kit.js shell(); works with every animation style. Never italic. */
(function(){
const G = window.GolfletSync; if (!G) return;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
/* mirror of lib/club-logos.ts (the API also sends club_logo; this covers the club name arriving before the code) */
const LOGOS = { '118': '/clubs/118@2x.png', '209': '/clubs/209@2x.png' };
const STOP = new Set(['de','del','la','las','los','el','y','e','club','golf','country','the','and','cc','gc','g','c','asociacion','asociación','sociedad','sa']);
function initials(name){ const w = String(name || '').replace(/[()·.,]/g, ' ').split(/\s+/).filter(Boolean);
  const s = w.filter(x => !STOP.has(x.toLowerCase())); return ((s.length ? s : w).slice(0, 2).map(x => x[0]).join('') || 'G').toUpperCase(); }
const isApp = name => !name || name === 'Golfistics App' || name === 'tus clubes' || name === 'tu club';
function crest(p){
  const logo = p.club_logo || (p.club_code && LOGOS[p.club_code]);
  if (logo) return `<img src="${esc(logo)}" alt="Escudo de ${esc(p.club)}" draggable="false">`;
  if (isApp(p.club)) return `<span class="cr-scan" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M10 19V5l7 2.8-7 2.8"/><path d="M6.5 19.5h9"/></svg></span>`;
  return `<span class="cr-mono" aria-label="${esc(p.club)}">${esc(p.club_initials || initials(p.club))}</span>`;
}
const MES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'], INI = ['E','F','M','A','M','J','J','A','S','O','N','D'];
const fdate = iso => { const [y, m, d] = String(iso || '').split('-').map(Number); return y ? `${d} ${MES[m - 1]} ${y}` : ''; };
const sgn = v => v > 0 ? `+${v}` : v < 0 ? `−${-v}` : 'E';

/* scorecard convention: eagle ◎, birdie ○, par plain, bogey □, double+ ⧈ */
function mark(v, x, y){
  const c = 'class="mk', r = 9.2;
  if (v <= -2) return `<circle ${c} mk-b" cx="${x}" cy="${y}" r="${r}"/><circle ${c} mk-b" cx="${x}" cy="${y}" r="${r - 3}"/>`;
  if (v === -1) return `<circle ${c} mk-b" cx="${x}" cy="${y}" r="${r}"/>`;
  if (v === 1) return `<rect ${c} mk-o" x="${x - 8.5}" y="${y - 8.5}" width="17" height="17" rx="1.5"/>`;
  if (v >= 2) return `<rect ${c} mk-o" x="${x - 9.5}" y="${y - 9.5}" width="19" height="19" rx="1.5"/><rect ${c} mk-o" x="${x - 6.5}" y="${y - 6.5}" width="13" height="13" rx="1"/>`;
  return '';
}
function cardSVG(card){
  const H = card.holes || [];
  if (!H.length) return `<div class="lc-nohole"><span>Otra cancha</span>Sin detalle hoyo por hoyo · cuenta en rondas, días y mejor gross</div>`;
  const W = 340, L = 34, T = 44, cw = (W - L - T) / 9, rows = [];
  const blocks = H.length > 9 ? [H.slice(0, 9), H.slice(9, 18)] : [H.slice(0, 9)];
  let y = 0, k = 0;
  blocks.forEach((b, bi) => {
    const sum = f => b.reduce((a, h) => a + (h[f] || 0), 0);
    rows.push(`<text class="lc-h" x="2" y="${y + 9}">HOYO</text><text class="lc-h" x="2" y="${y + 47}">PAR</text>`);
    rows.push(`<line class="lc-rule" x1="0" x2="${W}" y1="${y + 15}" y2="${y + 15}"/><line class="lc-rule" x1="0" x2="${W}" y1="${y + 38}" y2="${y + 38}"/>`);
    b.forEach((h, i) => { const x = L + cw * i + cw / 2, cy = y + 26.5, v = h.strokes && h.par ? h.strokes - h.par : 0;
      rows.push(`<g class="lc-cell" style="--d:${(k++) * 38}ms"><text class="lc-n" x="${x}" y="${y + 9}">${h.hole}</text>${h.strokes && h.par ? mark(v, x, cy) : ''}<text class="lc-s${v < 0 ? ' b' : ''}" x="${x}" y="${cy + 4.3}">${h.strokes ?? '·'}</text><text class="lc-p" x="${x}" y="${y + 47}">${h.par ?? ''}</text></g>`); });
    const tx = W - T / 2;
    rows.push(`<text class="lc-h c" x="${tx}" y="${y + 9}">${blocks.length > 1 ? (bi ? 'VUELTA' : 'IDA') : 'TOTAL'}</text><text class="lc-t" x="${tx}" y="${y + 31}">${sum('strokes') || ''}</text><text class="lc-p" x="${tx}" y="${y + 47}">${sum('par') || ''}</text>`);
    y += 58;
  });
  return `<svg class="lc-svg" viewBox="-2 -2 ${W + 4} ${y - 4}" role="img" aria-label="Tarjeta hoyo por hoyo">${rows.join('')}</svg>`;
}

const KEYS = [['eagles', 'Águilas', 'e'], ['birdies', 'Birdies', 'b'], ['pars', 'Pares', 'p'], ['bogeys', 'Bogeys', 'o'], ['doubles_plus', 'Dobles+', 'd']];
const GLYPH = { e: '<svg viewBox="0 0 14 14"><circle cx="7" cy="7" r="6"/><circle cx="7" cy="7" r="3.6"/></svg>', b: '<svg viewBox="0 0 14 14"><circle cx="7" cy="7" r="6"/></svg>',
  p: '<svg viewBox="0 0 14 14"><path d="M3 7h8"/></svg>', o: '<svg viewBox="0 0 14 14"><rect x="1.5" y="1.5" width="11" height="11" rx="1"/></svg>',
  d: '<svg viewBox="0 0 14 14"><rect x="1" y="1" width="12" height="12" rx="1"/><rect x="3.6" y="3.6" width="6.8" height="6.8" rx=".6"/></svg>' };

/** Panel inside the shell. host: element to fill; head: element that receives the crest. */
function live(root, { Clock, RM }){
  const panel = root.querySelector('.lv'), crestEl = root.querySelector('.sx-crest');
  panel.innerHTML = `
    <div class="lv-counts">${KEYS.map(([k, l, g]) => `<div class="lv-c lv-${g}" data-k="${k}"><span class="lv-g">${GLYPH[g]}</span><b class="num">0</b><span class="lv-l">${l}</span></div>`).join('')}</div>
    <div class="lc"><div class="lc-head"><div><div class="lc-over">Última tarjeta leída</div><div class="lc-meta"></div></div><div class="lc-gross"><b class="num"></b><span class="num"></span></div></div><div class="lc-body"></div></div>
    <div class="lv-foot">
      <div class="lv-kpis"><div><b class="num" data-k="rounds">0</b><span>Rondas</span></div><div><b class="num" data-k="days">0</b><span>Días de juego</span></div><div><b class="num" data-best>–</b><span>Mejor gross</span></div></div>
      <div class="lv-strip" aria-label="Días de juego por mes"></div>
    </div>`;
  let crestKey = null, lastCard = null, best = null;
  const shown = {}, target = {};
  const numEls = [...panel.querySelectorAll('[data-k]')].map(el => [el.dataset.k, el.tagName === 'B' ? el : el.querySelector('b')]);
  function setCrest(p){
    const key = (p.club_logo || p.club_code || '') + '|' + (p.club || '');
    if (key === crestKey) return; crestKey = key;
    crestEl.classList.toggle('mono', !(p.club_logo || (p.club_code && LOGOS[p.club_code])) && !isApp(p.club));
    crestEl.classList.toggle('scan', isApp(p.club));
    crestEl.innerHTML = crest(p);
    if (!RM()) { crestEl.classList.remove('in'); void crestEl.offsetWidth; crestEl.classList.add('in'); }
  }
  /* counters ease toward their targets on the shared clock; each step up pulses the number gold */
  let tPrev = null;
  const off = Clock.add(now => { const dt = tPrev == null ? 16 : Math.min(64, now - tPrev); tPrev = now;
    for (const [k, el] of numEls){ const t = target[k] ?? 0, s = shown[k] ?? 0; if (s === t) continue;
      const n = RM() ? t : s + Math.sign(t - s) * Math.max(1, Math.round(Math.abs(t - s) * Math.min(1, dt / 140)));
      shown[k] = Math.abs(n - t) < 1 ? t : n; const v = Math.round(shown[k]); if (el.textContent !== String(v)){ el.textContent = v;
        if (!RM()) { const c = el.closest('.lv-c') || el.parentElement; c.classList.remove('up'); void c.offsetWidth; c.classList.add('up'); } } } });
  function strip(months){
    const el = panel.querySelector('.lv-strip'); if (!months?.length){ el.innerHTML = ''; return; }
    const mx = Math.max(1, ...months.map(m => m.rounds));
    el.innerHTML = months.map(m => { const mi = +m.month.slice(5) - 1, h = m.rounds ? 4 + 22 * m.rounds / mx : 2;
      return `<span title="${MES[mi]}: ${m.rounds}"><i style="height:${h.toFixed(1)}px" class="${m.rounds ? 'on' : ''}"></i><em>${INI[mi]}</em></span>`; }).join('');
  }
  let rounds = 0;
  function update(p){
    if (p.club) setCrest(p);
    const s = p.stats; if (!s || !s.rounds) return;
    rounds = s.rounds;
    root.classList.add('has-stats');
    for (const [k] of KEYS) target[k] = s[k] || 0;
    target.rounds = s.rounds; target.days = s.days;
    panel.querySelector('.lv-e').classList.toggle('zero', !s.eagles);
    if (s.best_gross !== best){ best = s.best_gross; const b = panel.querySelector('[data-best]'); b.textContent = best ?? '–';
      if (!RM()) { b.parentElement.classList.remove('up'); void b.offsetWidth; b.parentElement.classList.add('up'); } }
    strip(s.months);
    const c = s.last_card, key = c && `${c.date}|${c.course}|${c.gross}|${c.holes?.length}`;
    if (c && key !== lastCard){ lastCard = key;
      const lc = panel.querySelector('.lc');
      lc.querySelector('.lc-meta').textContent = [fdate(c.date), c.course, c.other_course && c.club ? c.club : null].filter(Boolean).join(' · ');
      lc.querySelector('.lc-gross b').textContent = c.gross ?? '';
      lc.querySelector('.lc-gross span').textContent = c.gross && c.par ? sgn(c.gross - c.par) : '';
      lc.querySelector('.lc-body').innerHTML = cardSVG(c);
      if (!RM()) { lc.classList.remove('flip'); void lc.offsetWidth; lc.classList.add('flip'); }
    }
  }
  return { update, setCrest, rounds: () => rounds, destroy(){ off(); } };
}
G.live = live; G.crestFor = crest; G.initials = initials;
})();
