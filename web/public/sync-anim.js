/* Golflet · sync animation (yardage-book hole, self-drawing gold ball flights). Pure SVG + rAF, no libs.
   Spec: /workspace/golflet/design/sync_animation.md. Upright type only. */
(function(){
const NS = 'http://www.w3.org/2000/svg';
const INK = '#0B2545', GOLD = '#C8102E';
const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---- geometry (drawing space 320×230; visible viewBox 74 10 220 212) ---- */
const TEE = [157, 208], CUP = [216, 44];
const PX_PER_YD = 0.45;                       // 400-yd hole ≈ 180 px tee→cup
const VARIANTS = [                             // drive land/rest, approach land/rest, putt break, putt stop (short of cup while looping)
  { name:'draw',     L1:[168,112], R1:[171,103], bow1: 10, L2:[207,52], R2:[209,50], bow2: 6, brk: 3 },
  { name:'fade',     L1:[157,124], R1:[159,116], bow1: -9, L2:[223,39], R2:[221,41], bow2:-5, brk:-3 },
  { name:'straight', L1:[160,119], R1:[163,110], bow1:  3, L2:[208,40], R2:[207,43], bow2: 2, brk: 2 },
];
const T = { drive:1400, droll:520, gap:300, appr:1150, aroll:420, putt:1500, hold:750, fade:520 };
const H = { drive: 46, appr: 34 };            // apparent apex height (px, screen-up)

const ease = { out: t => 1 - Math.pow(1 - t, 3), inOut: t => t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2, flight: t => t*(1.12 - .12*t) };
const lerp = (a, b, t) => [a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t];
/* ground track: chord + lateral bow (shot shape); air point = ground − sin(πt)·h (screen-up) */
function ground(a, b, bow, t){ const [x,y] = lerp(a,b,t), dx=b[0]-a[0], dy=b[1]-a[1], L=Math.hypot(dx,dy)||1, k=Math.sin(Math.PI*t)*bow; return [x + (-dy/L)*k, y + (dx/L)*k]; }
/* top-down tracer: apex height is drawn as extra lateral lift (LIFT·h) on the shot's curve side, plus a slight screen-up lift; the shadow keeps the ground track */
const LIFT = 0.42;
const air = (a, b, bow, h, t) => { const dir = bow < 0 ? -1 : 1; const g = ground(a, b, bow + dir*h*LIFT, t); return [g[0], g[1] - Math.sin(Math.PI*t)*h*0.18]; };
function pathOf(fn, n = 36){ let d = ''; for (let i = 0; i <= n; i++){ const p = fn(i/n); d += (i ? ' L' : 'M') + p[0].toFixed(2) + ',' + p[1].toFixed(2); } return d; }

function holeSVG(){
  const rings = [100,150,200,250].map(y => { const r = y*PX_PER_YD;
    return `<circle cx="${CUP[0]}" cy="${CUP[1]}" r="${r}" class="ga-ring"/>
      <text x="${CUP[0] - r*0.70710678 - 3}" y="${CUP[1] + r*0.70710678 + 3}" class="ga-yd" text-anchor="end">${y}</text>`; }).join('');
  const trees = [[112,176,9],[104,160,7],[118,146,8],[208,182,9],[218,166,7],[200,152,6],[244,92,8],[252,76,7],[142,64,7],[132,80,8]]
    .map(([x,y,r]) => `<circle cx="${x}" cy="${y}" r="${r}" class="ga-tree"/><circle cx="${x+r*.25}" cy="${y-r*.2}" r="${r*.45}" class="ga-tree2"/>`).join('');
  return `<svg class="ga-svg" viewBox="74 10 220 212" role="img" aria-label="Hoyo de golf: la bola vuela del tee al green">
  <defs>
    <pattern id="ga-sand" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".55" fill="${INK}" fill-opacity=".35"/></pattern>
    <radialGradient id="ga-green" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="${INK}" stop-opacity=".16"/><stop offset="1" stop-color="${INK}" stop-opacity=".09"/></radialGradient>
      </defs>
  <g class="ga-map">
    ${trees}
    <path class="ga-fair" d="M140,204 C128,172 131,142 145,119 C158,97 169,85 181,75 C192,67 205,70 207,81 C209,93 197,104 187,118 C173,138 167,166 170,204 Z"/>
    <path class="ga-bunker" d="M187,140 c5,-6 13,-5 14,1 c1,6 -6,10 -11,8 c-4,-1 -5,-6 -3,-9 z"/>
    <path class="ga-bunker" d="M183,55 c2,-7 9,-9 12,-5 c2,3 -1,6 -4,8 c-3,3 -2,8 -6,8 c-4,0 -3,-7 -2,-11 z"/>
    <ellipse class="ga-fringe" cx="214" cy="45" rx="29" ry="21" transform="rotate(-14 214 45)"/>
    <ellipse class="ga-greenshape" cx="214" cy="45" rx="24" ry="16.5" transform="rotate(-14 214 45)"/>
    <rect class="ga-tee" x="146" y="204" width="22" height="9" rx="3"/>
    ${rings}
  </g>
  <g class="ga-traces"></g>
  <ellipse class="ga-cup" cx="${CUP[0]}" cy="${CUP[1]}" rx="2.7" ry="1.9"/>
  <circle class="ga-ripple" cx="${CUP[0]}" cy="${CUP[1]}" r="3"/>
  <ellipse class="ga-shadow" cx="0" cy="0" rx="2.6" ry="1.3"/>
  <circle class="ga-ball" cx="0" cy="0" r="2.6"/>
  <line class="ga-pole" x1="${CUP[0]}" y1="${CUP[1]}" x2="${CUP[0]}" y2="${CUP[1]-21}"/>
  <path class="ga-pennant" d="M${CUP[0]},${CUP[1]-21} L${CUP[0]+13},${CUP[1]-17} L${CUP[0]},${CUP[1]-13} Z"/>
</svg>`;
}

/* real, sourced facts only */
const FACTS = [
  ['El hoyo mide 108 mm de diámetro y al menos 101,6 mm de profundidad.', 'Reglas de Golf · R&A / USGA, Definiciones'],
  ['Podés llevar como máximo 14 palos durante la vuelta.', 'Reglas de Golf · Regla 4.1b'],
  ['Tenés 3 minutos para buscar una bola antes de que se considere perdida.', 'Reglas de Golf · Regla 18.2a'],
  ['La bola no puede pesar más de 45,93 g ni medir menos de 42,67 mm.', 'R&A / USGA · Reglas de Equipamiento'],
  ['Tu Handicap Index es el promedio de los 8 mejores diferenciales de tus últimas 20 tarjetas.', 'World Handicap System · Regla 5.2'],
  ['Un Slope de 113 corresponde a una cancha de dificultad estándar.', 'World Handicap System'],
  ['Roberto De Vicenzo ganó The Open en 1967, en Royal Liverpool (Hoylake).', 'The Open · Campeones'],
  ['Ángel Cabrera ganó el US Open 2007 en Oakmont y el Masters 2009.', 'USGA · Augusta National'],
];

const STEPS = ['connect','list','cards','handicap','save'];
function stepText(k, p, club, state){
  const d = p?.done ?? 0, n = p?.total ?? 0, lt = p?.list_total;
  const A = {
    connect: [`Conectando con ${club}`, `Conectado con ${club}`],
    list: ['Buscando tus tarjetas', lt != null ? `${lt} tarjetas en tu club` : 'Tarjetas encontradas'],
    cards: [n ? `Leyendo tarjetas · ${d} de ${n}` : 'Buscando tarjetas nuevas', null],
    handicap: ['Leyendo tu historial de hándicap', 'Historial de hándicap al día'],
    save: [n ? `Guardando rondas · ${d} de ${n}` : 'Guardando rondas', 'Rondas guardadas'],
  }[k];
  if (k === 'cards' && state === 'done') return CARDS_DONE.n ? `${CARDS_DONE.n} tarjetas nuevas leídas` : 'Sin tarjetas nuevas';
  return state === 'done' ? A[1] : A[0];
}
const CARDS_DONE = { n: 0 };

function mount(container, opts = {}){
  let club = opts.club || 'tu club';
  container.innerHTML = `<div class="ga ${RM() ? 'rm' : ''}">
    <div class="ga-stage">${holeSVG()}</div>
    <div class="ga-head"><div class="overline">${esc(club)}</div><div class="stitle ga-title" aria-live="polite">${esc(opts.title || 'Leyendo tus tarjetas')}</div></div>
    <ol class="ga-steps">${STEPS.map(k => `<li data-s="${k}" class="todo"><span class="ga-ic"></span><span class="ga-lbl">${esc(stepText(k, null, club, 'todo'))}</span><span class="ga-bar"><span></span></span></li>`).join('')}</ol>
    <div class="ga-fact"><p></p><small></small></div>
  </div>`;
  const root = container.firstElementChild, svg = root.querySelector('svg');
  const $ = s => svg.querySelector(s);
  const traces = $('.ga-traces'), ball = $('.ga-ball'), shadow = $('.ga-shadow'), ripple = $('.ga-ripple');
  let raf = 0, alive = true, finishing = null, vi = 0, speed = 1, done = false;
  const place = (p, scale = 1, sh = null, op = 1) => {
    ball.setAttribute('transform', `translate(${p[0].toFixed(2)} ${p[1].toFixed(2)}) scale(${scale.toFixed(3)})`); ball.style.opacity = op;
    const s = sh || p; shadow.setAttribute('transform', `translate(${s[0].toFixed(2)} ${(s[1]+.6).toFixed(2)})`); shadow.style.opacity = sh ? .22 : 0;
  };
  const trace = (d, cls) => { const el = document.createElementNS(NS, 'path'); el.setAttribute('d', d); el.setAttribute('class', cls); traces.appendChild(el);
    const L = el.getTotalLength(); el.style.strokeDasharray = cls === 'ga-putt' ? '1.2 3' : `${L} ${L}`; if (cls !== 'ga-putt') el.style.strokeDashoffset = L; el._L = L; return el; };
  const wait = ms => new Promise(r => setTimeout(r, ms / speed));
  /* one tween on rAF; dt scaled by `speed` so a pending finish fast-forwards smoothly */
  const tween = (ms, fn) => new Promise(res => { let t = 0, last = performance.now();
    const step = now => { if (!alive) return res(); t += (now - last) * speed; last = now; const k = Math.min(1, t / ms); fn(k); if (k < 1) raf = requestAnimationFrame(step); else res(); };
    raf = requestAnimationFrame(step); });

  async function flight(a, b, bow, h, ms){
    const el = trace(pathOf(t => air(a,b,bow,h,t)), 'ga-arc');
    await tween(ms, k => { const t = ease.flight(k); place(air(a,b,bow,h,t), 1 + .75*Math.sin(Math.PI*t), ground(a,b,bow,t)); el.style.strokeDashoffset = el._L * (1 - t); });
    el.classList.add('landed');
  }
  const roll = (a, b, ms) => tween(ms, k => place(lerp(a, b, ease.out(k)), 1, lerp(a, b, ease.out(k))));
  async function putt(a, holed, brk, ms){
    const end = holed ? CUP : lerp(a, CUP, .82);
    const fn = t => ground(a, end, brk, t);
    const el = trace(pathOf(fn, 20), 'ga-putt'); el.style.opacity = 0;
    await tween(ms, k => { const t = ease.out(k); place(fn(t), 1, fn(t)); el.style.opacity = Math.min(1, k*3) * .9; });
    return end;
  }
  async function sink(){
    await tween(300, k => { place([CUP[0], CUP[1] + k*2.2], 1 - .35*k, null, 1); });
    ball.style.opacity = 0; ripple.classList.add('go'); root.classList.add('holed');
  }
  async function loop(){
    while (alive){
      const v = VARIANTS[vi++ % VARIANTS.length];
      place(TEE, 1, TEE); traces.querySelectorAll('path').forEach(p => p.remove());
      await wait(T.gap); if (!alive) return;
      await flight(TEE, v.L1, v.bow1, H.drive, T.drive); await roll(v.L1, v.R1, T.droll); await wait(T.gap); if (!alive) return;
      await flight(v.R1, v.L2, v.bow2, H.appr, T.appr); await roll(v.L2, v.R2, T.aroll); await wait(T.gap); if (!alive) return;
      const holed = !!finishing;
      await putt(v.R2, holed, v.brk, T.putt);
      if (holed){ speed = 1; await sink(); finishing(); return; }
      await wait(T.hold); if (!alive) return;
      await tween(T.fade, k => { traces.style.opacity = 1 - k; ball.style.opacity = 1 - k; }); traces.style.opacity = 1;
    }
  }
  function staticScene(){ const v = VARIANTS[0];
    trace(pathOf(t => air(TEE, v.L1, v.bow1, H.drive, t)), 'ga-arc landed').style.strokeDashoffset = 0;
    trace(pathOf(t => air(v.R1, v.L2, v.bow2, H.appr, t)), 'ga-arc landed').style.strokeDashoffset = 0;
    place(v.R2, 1, v.R2); }
  if (RM()) staticScene(); else loop();

  /* facts */
  let fi = Math.floor(Math.random() * FACTS.length); const fact = root.querySelector('.ga-fact');
  const showFact = () => { const [t, s] = FACTS[fi++ % FACTS.length]; fact.classList.remove('in');
    setTimeout(() => { fact.querySelector('p').textContent = t; fact.querySelector('small').textContent = 'Fuente: ' + s; fact.classList.add('in'); }, RM() ? 0 : 260); };
  showFact(); const ft = setInterval(showFact, 7000);

  function setProgress(p){
    if (!p || done) return;
    if (p.club){ const over = p.club_count > 1 ? `${p.club} · ${p.club_index} de ${p.club_count}` : p.club;
      if (p.club !== club){ club = p.club; CARDS_DONE.n = 0; } const el = root.querySelector('.ga-head .overline'); if (el && el.textContent !== over) el.textContent = over; }
    const cur = STEPS.indexOf(p.stage === 'done' ? 'save' : p.stage);
    if (p.stage === 'cards') CARDS_DONE.n = p.total || 0;
    root.querySelectorAll('.ga-steps li').forEach((li, i) => {
      const k = li.dataset.s, st = p.stage === 'done' || i < cur ? 'done' : i === cur ? 'active' : 'todo';
      li.className = st;
      const pp = i === cur ? p : (k === 'list' || k === 'cards') ? { list_total: p.list_total, total: CARDS_DONE.n, done: CARDS_DONE.n } : null;
      li.querySelector('.ga-lbl').textContent = stepText(k, pp, club, st);
      const bar = li.querySelector('.ga-bar > span');
      bar.style.transform = `scaleX(${i === cur && p.total ? Math.min(1, (p.done||0) / p.total) : st === 'done' ? 1 : 0})`;
      li.classList.toggle('bar', i === cur && !!p.total && p.stage !== 'done');
    });
  }
  CARDS_DONE.n = 0; setProgress({ stage: 'connect' });

  return {
    setProgress,
    /** success: steps complete, next putt drops (fast-forwards the current shot), then resolves */
    finish(summary){
      done = false; setProgress({ stage: 'done', list_total: summary?.list_total }); done = true;
      root.querySelector('.ga-title').textContent = summary?.title || 'Listo';
      return new Promise(res => {
        const end = () => { clearInterval(ft); setTimeout(res, RM() ? 400 : 900); };
        if (RM()){ ball.style.transition = 'opacity .3s'; ball.style.opacity = 0; root.classList.add('holed'); end(); return; }
        finishing = end; speed = 2.6;
      });
    },
    fail(msg){ done = true; alive = false; cancelAnimationFrame(raf); clearInterval(ft); root.classList.add('failed');
      root.querySelector('.ga-title').textContent = 'No se pudo actualizar'; const li = root.querySelector('.ga-steps li.active'); if (li){ li.className = 'err'; li.querySelector('.ga-lbl').textContent = msg; } },
    destroy(){ alive = false; cancelAnimationFrame(raf); clearInterval(ft); },
  };
}

/** Poll real progress for a sync started with { progress_id }. */
function poll(id, onP){
  let stop = false, t;
  const tick = async () => { if (stop) return;
    try { const r = await fetch('/api/sync-progress/' + id, { credentials: 'same-origin' }); if (r.ok){ const j = await r.json(); onP(j.progress); } } catch (_) {}
    if (!stop) t = setTimeout(tick, 700); };
  t = setTimeout(tick, 350);
  return () => { stop = true; clearTimeout(t); };
}
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = crypto.getRandomValues(new Uint8Array(1))[0] & 15; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));

window.GolfletSync = { mount, poll, uuid, FACTS, VARIANTS, T, H };
})();
