/* Golflet · sync style B "Yardage book premium": overhead illustrated hole, camera flies the hole while
   gold arcs draw in; flag lifts, ball drops, page turns into Inicio. Canvas2D only. Spec: design/sync_animation_v2.md
   The hole is an illustration (not a real course map); distances are generic yardage-book marks. */
(function(){
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ease = { inOut: t => t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3)/2, out: t => 1 - Math.pow(1 - t, 3), sin: t => .5 - .5 * Math.cos(Math.PI * t) };
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const A = a => a.toFixed(3);

/* ---------- hole geometry, meters: x right, y up the hole (tee y=0) ---------- */
const cx = y => -6 + 20 * sstep(110, 330, y) + 3 * Math.sin(y / 37);
const hw = y => y < 60 ? 0 : (15 + 3.5 * Math.sin(y / 41 + .6)) * Math.sqrt(sstep(60, 84, y)) * (1 - .22 * sstep(255, 300, y) + .22 * sstep(300, 352, y)) * Math.sqrt(1 - sstep(346, 378, y));
const G = { x: cx(396) + 2, y: 396, rx: 14.5, ry: 17, rot: .18 }, PIN = [G.x + 2.6, G.y + 4];
const FAIR = (() => { const L = [], R = []; for (let y = 60; y <= 378; y += 2){ L.push([cx(y) - hw(y), y]); R.push([cx(y) + hw(y), y]); } return L.concat(R.reverse()); })();
const BUNKERS = [
  { x: cx(242) + 21, y: 242, rx: 9, ry: 4.6, rot: -.5, lobes: [[-4, 1.5, 3.5], [4, -1, 3.2]] },
  { x: G.x - 17.5, y: G.y - 2, rx: 4.6, ry: 9.5, rot: .25, lobes: [[0, 5, 3.6]] },
  { x: G.x + 13, y: G.y - 15, rx: 7.5, ry: 3.6, rot: -.6, lobes: [[3, 1, 2.8]] },
  { x: cx(205) - 22, y: 205, rx: 6, ry: 3.4, rot: .4, lobes: [] },
];
const POND = { x: cx(150) - 44, y: 152, rx: 17, ry: 30, rot: .12 };
const TREES = []; (function(){
  for (let y = -40; y < 480; y += 3.5 + rnd() * 4) for (const s of [-1, 1]) for (let row = 0; row < 3; row++){
    if (rnd() < .3 + row * .18) continue; const w = y > 372 ? 30 : Math.max(hw(y), 12);
    let x = cx(y) + s * (w + 22 + row * 11 + rnd() * 9); if (Math.hypot(x - POND.x, (y - POND.y) * .7) < 30) continue;
    TREES.push({ x, y: y + rnd() * 3, r: 3.8 + rnd() * 3.6, t: rnd() }); }
  TREES.sort((a, b) => b.y - a.y); })();
const BOUNDS = { x0: -95, x1: 105, y0: -40, y1: 470 };

/* palette (muted yardage-book greens on paper) */
const P = { paper: '#F4F0E6', rough: '#DCE2CF', semi: '#CED8BF', fwA: '#B6CCA6', fwB: '#ABC49B', fringe: '#A1BE92', green: '#93B886', greenB: '#8AB17D',
  sand: '#EEE3CA', water: '#C3D6D2', tree: '#5D7E66', treeD: '#45664F', treeL: '#86A38A', ink: '#0B2545', gold: '#C8102E' };

/* shots: drive / approach / putt. Heights only shape the drawing; the scene shows no claimed stats. */
const VARIANTS = [
  { land: [cx(232) - 3, 232], roll: [cx(246) - 2, 246], hD: 30, cD: -7, land2: [PIN[0] - 1.5, PIN[1] - 6], rest2: [PIN[0] - 1.1, PIN[1] - 2.8], hA: 22, cA: 4, club: 'Hierro 8' },
  { land: [cx(226) + 4, 226], roll: [cx(240) + 4, 240], hD: 28, cD: 6, land2: [PIN[0] + 1.8, PIN[1] - 6.5], rest2: [PIN[0] + 1.2, PIN[1] - 3], hA: 21, cA: -4, club: 'Hierro 9' },
];
const TIMES = { drive: 2600, droll: 600, cam1: 800, appr: 2200, aroll: 500, cam2: 700, putt: 1800, hold: 700, out: 700 };
const shotPos = (s, e, h, c, u) => { const v = Math.pow(u, 1.25), dx = e[0] - s[0], dy = e[1] - s[1], L = Math.hypot(dx, dy) || 1, lat = c * 4 * (u - u*u);
  return [lerp(s[0], e[0], u) + dy / L * lat, lerp(s[1], e[1], u) - dx / L * lat, h * Math.sin(Math.PI * v)]; };
const tU = t => t * (1.3 - .3 * t);

/* ---------- offscreen map ---------- */
function ellipse(c, e, grow = 0){ c.beginPath(); c.ellipse(e.x, e.y, e.rx + grow, e.ry + grow, e.rot, 0, Math.PI * 2); }
function bunkerPath(c, b, grow = 0){ c.beginPath(); c.ellipse(b.x, b.y, b.rx + grow, b.ry + grow, b.rot, 0, Math.PI * 2);
  for (const [dx, dy, r] of b.lobes){ const ca = Math.cos(b.rot), sa = Math.sin(b.rot); c.moveTo(b.x + dx * ca - dy * sa + r + grow, b.y + dx * sa + dy * ca); c.arc(b.x + dx * ca - dy * sa, b.y + dx * sa + dy * ca, r + grow, 0, Math.PI * 2); } }
function polyPath(c, pts){ c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); }
function renderMap(S, region){ // S px per meter; region in meters
  const w = Math.ceil((region.x1 - region.x0) * S), h = Math.ceil((region.y1 - region.y0) * S);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d');
  c.setTransform(S, 0, 0, -S, -region.x0 * S, region.y1 * S); // world → map px (y up)
  const lw = 1 / S; seed = 23;
  c.fillStyle = P.paper; c.fillRect(region.x0, region.y0, region.x1 - region.x0, region.y1 - region.y0);
  // rough: soft band around the playing corridor
  // rough: feathered band around the playing corridor (layered fills, no canvas filter → Safari-safe)
  for (let k = 7; k >= 0; k--){ c.globalAlpha = k ? .16 : 1; c.fillStyle = P.rough; c.beginPath(); const gW = y => Math.max(hw(y), y > 360 ? 30 : 14) + 30 + k * 2.2 + 3 * Math.sin(y / 23 + k);
    for (let y = -24 - k * 2; y <= 444 + k * 2; y += 4){ const W = gW(y); y === -24 - k * 2 ? c.moveTo(cx(y) - W, y) : c.lineTo(cx(y) - W, y); }
    for (let y = 444 + k * 2; y >= -24 - k * 2; y -= 4) c.lineTo(cx(y) + gW(y), y); c.closePath(); c.fill(); } c.globalAlpha = 1;
  // fine paper tooth + rough mottling
  for (let i = 0; i < (region.x1 - region.x0) * (region.y1 - region.y0) * .06; i++){ const x = region.x0 + rnd() * (region.x1 - region.x0), y = region.y0 + rnd() * (region.y1 - region.y0);
    c.fillStyle = rnd() < .5 ? 'rgba(15,61,46,.035)' : 'rgba(255,255,255,.18)'; c.fillRect(x, y, .5 + rnd() * .6, .5 + rnd() * .6); }
  // pond
  c.save(); ellipse(c, POND); const wg = c.createLinearGradient(POND.x - 20, POND.y + 30, POND.x + 20, POND.y - 30); wg.addColorStop(0, '#B3CCC8'); wg.addColorStop(1, '#D3E2DE'); c.fillStyle = wg; c.fill();
  c.clip(); c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = .35; for (let k = 0; k < 9; k++){ const yy = POND.y - 22 + k * 5.5; c.beginPath(); c.moveTo(POND.x - 9 + (k % 3) * 3, yy); c.quadraticCurveTo(POND.x, yy + 1.2, POND.x + 7 - (k % 2) * 4, yy); c.stroke(); }
  c.restore(); ellipse(c, POND); c.strokeStyle = 'rgba(15,61,46,.32)'; c.lineWidth = .3; c.stroke();
  // cart path
  c.setLineDash([2.2, 1.6]); c.strokeStyle = 'rgba(15,61,46,.16)'; c.lineWidth = 1.3; c.beginPath(); for (let y = 8; y <= 380; y += 4){ const x = cx(y) + Math.max(hw(y), 14) + 15 + 3 * Math.sin(y / 50); y === 8 ? c.moveTo(x, y) : c.lineTo(x, y); } c.stroke(); c.setLineDash([]);
  // fairway: semi-rough cut, then fairway with gradient + diagonal mowing stripes, crisp ink edge
  const semi = FAIR.map(([x, y]) => [x + Math.sign(x - cx(y)) * 3.2, y]); polyPath(c, semi); c.fillStyle = P.semi; c.fill();
  c.save(); polyPath(c, FAIR); c.shadowColor = 'rgba(15,61,46,.18)'; c.shadowBlur = S * 2.2; c.shadowOffsetY = S * .8; c.fillStyle = P.fwA; c.fill(); c.restore();
  c.save(); polyPath(c, FAIR); c.clip();
  c.fillStyle = P.fwB; for (let k = -60; k < 80; k++){ c.beginPath(); const y = k * 9; c.moveTo(-120, y); c.lineTo(140, y + 150); c.lineTo(140, y + 154.5); c.lineTo(-120, y + 4.5); c.closePath(); c.fill(); }
  const lg = c.createLinearGradient(-60, 0, 60, 0); lg.addColorStop(0, 'rgba(15,61,46,.07)'); lg.addColorStop(.45, 'rgba(255,255,255,.08)'); lg.addColorStop(1, 'rgba(15,61,46,.10)'); c.fillStyle = lg; c.fillRect(-120, 0, 260, 460);
  c.restore(); polyPath(c, FAIR); c.strokeStyle = 'rgba(15,61,46,.38)'; c.lineWidth = Math.max(.22, lw * 1.1); c.stroke();
  // tee boxes
  for (const [dy, w] of [[-8, 7], [0, 8], [9, 7]]){ c.save(); c.shadowColor = 'rgba(15,61,46,.18)'; c.shadowBlur = S * 1.2; c.shadowOffsetY = S * .5;
    c.fillStyle = P.fwA; c.beginPath(); c.roundRect(cx(dy) - w / 2, dy - 2.6, w, 5.2, 1.6); c.fill(); c.restore(); c.strokeStyle = 'rgba(15,61,46,.35)'; c.lineWidth = Math.max(.2, lw); c.stroke(); }
  // green complex: fringe, green with radial light + cross-cut stripes
  c.save(); ellipse(c, G, 3.2); c.shadowColor = 'rgba(15,61,46,.2)'; c.shadowBlur = S * 2.5; c.shadowOffsetY = S * .8; c.fillStyle = P.fringe; c.fill(); c.restore();
  c.save(); ellipse(c, G); const gg = c.createRadialGradient(G.x - 4, G.y + 6, 1, G.x, G.y, 20); gg.addColorStop(0, '#A3C597'); gg.addColorStop(1, P.greenB); c.fillStyle = gg; c.fill(); c.clip();
  c.fillStyle = 'rgba(255,255,255,.07)'; for (let k = -6; k < 6; k++){ c.save(); c.translate(G.x, G.y); c.rotate(.5); c.fillRect(k * 4, -30, 2, 60); c.restore(); }
  c.restore(); ellipse(c, G); c.strokeStyle = 'rgba(15,61,46,.42)'; c.lineWidth = Math.max(.2, lw * 1.1); c.stroke();
  // bunkers: lip shadow, sand gradient + speckle, inner shadow
  for (const b of BUNKERS){
    c.save(); bunkerPath(c, b, .9); c.fillStyle = 'rgba(15,61,46,.10)'; c.fill(); c.restore();
    c.save(); bunkerPath(c, b); const sg = c.createLinearGradient(b.x - b.rx, b.y + b.ry, b.x + b.rx, b.y - b.ry); sg.addColorStop(0, '#F3EAD5'); sg.addColorStop(1, '#E4D6B6'); c.fillStyle = sg; c.fill(); c.clip();
    for (let i = 0; i < b.rx * b.ry * 9; i++){ const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()); c.fillStyle = rnd() < .5 ? 'rgba(120,96,52,.20)' : 'rgba(255,255,255,.55)'; c.fillRect(b.x + Math.cos(a) * r * (b.rx + 4), b.y + Math.sin(a) * r * (b.ry + 4), .14, .14); }
    const ig = c.createLinearGradient(b.x, b.y + b.ry + 3, b.x, b.y - b.ry); ig.addColorStop(0, 'rgba(110,84,40,.30)'); ig.addColorStop(.35, 'rgba(110,84,40,0)'); c.fillStyle = ig; c.fillRect(b.x - b.rx - 8, b.y - b.ry - 8, b.rx * 2 + 16, b.ry * 2 + 16);
    c.lineWidth = .9; c.strokeStyle = 'rgba(110,84,40,.22)'; bunkerPath(c, b); c.stroke();
    c.restore(); bunkerPath(c, b); c.strokeStyle = 'rgba(15,61,46,.40)'; c.lineWidth = Math.max(.2, lw); c.stroke(); }
  // trees: soft cast shadow (south-east), canopy with light from north-west, ink edge
  const soft = document.createElement('canvas'); soft.width = soft.height = 64; { const sc = soft.getContext('2d'), rg = sc.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(15,61,46,.30)'); rg.addColorStop(.55, 'rgba(15,61,46,.22)'); rg.addColorStop(1, 'rgba(15,61,46,0)'); sc.fillStyle = rg; sc.fillRect(0, 0, 64, 64); }
  for (const t of TREES){ const R = t.r * 1.45; c.drawImage(soft, t.x + t.r * .6 - R, t.y - t.r * .6 - R, R * 2, R * 2); }
  for (const t of TREES){ const tg = c.createRadialGradient(t.x - t.r * .38, t.y + t.r * .4, t.r * .1, t.x, t.y, t.r * 1.05);
    tg.addColorStop(0, P.treeL); tg.addColorStop(.55, t.t < .5 ? P.tree : '#58785F'); tg.addColorStop(1, P.treeD); c.fillStyle = tg;
    c.beginPath(); for (let k = 0; k < 9; k++){ const a = k / 9 * Math.PI * 2, rr = t.r * (.9 + .12 * Math.sin(k * 2.3 + t.t * 9)); const x = t.x + Math.cos(a) * rr, y = t.y + Math.sin(a) * rr; k ? c.lineTo(x, y) : c.moveTo(x, y); } c.closePath(); c.fill();
    c.strokeStyle = 'rgba(15,61,46,.35)'; c.lineWidth = Math.max(.15, lw * .8); c.stroke(); }
  return { cv, S, region };
}

function mount(container, opts, kit){
  const { shell, Clock, RM } = kit;
  const sh = shell(container, { club: opts.club, theme: 'paper', title: opts.title });
  const sheet = container.closest('.sheet'); sheet?.classList.add('sx-sheet-paper');
  sh.scene.innerHTML = `<canvas></canvas><div class="bk-cap"><span class="bk-cap-l"></span><span class="bk-cap-r num"></span></div><div class="bk-corner">Libro de yardas</div>`;
  const cv = sh.scene.querySelector('canvas'), ctx = cv.getContext('2d', { alpha: false });
  const capL = sh.scene.querySelector('.bk-cap-l'), capR = sh.scene.querySelector('.bk-cap-r');
  let W = 0, H = 0, DPR = 1;
  const base = renderMap(4, BOUNDS), hi = renderMap(22, { x0: G.x - 34, x1: G.x + 34, y0: G.y - 34, y1: G.y + 34 });
  function resize(){ const r = sh.scene.getBoundingClientRect(); W = Math.max(200, r.width); H = Math.max(200, r.height);
    DPR = Math.min(3, window.devicePixelRatio || 1); cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
  resize(); const ro = new ResizeObserver(() => { resize(); if (RM() && rmReady) render(); }); let rmReady = false; ro.observe(sh.scene);

  /* caption = live progress in small caps */
  const CAP = { connect: 'Conectando', list: 'Buscando tarjetas', cards: 'Leyendo tarjetas', handicap: 'Historial de hándicap', save: 'Guardando rondas', done: 'Listo' };
  const setProgress = p => { sh.setProgress(p); if (!p) return; capL.textContent = CAP[p.stage] || ''; capR.textContent = (p.stage === 'cards' || p.stage === 'save') && p.total ? `${p.done || 0} / ${p.total}` : ''; };
  setProgress({ stage: 'connect' });

  /* camera: critically damped spring toward a target (x, y, zoom px/m, rot) */
  const cam = { x: cx(40), y: 40, z: 2.2, r: 0 }, vel = { x: 0, y: 0, z: 0, r: 0 }; let tgt = { ...cam };
  function spring(dt){ const w = 3.4, d = dt / 1000; for (const k of ['x','y','z','r']){ const f = w * w * (tgt[k] - cam[k]) - 2 * w * vel[k]; vel[k] += f * d; cam[k] += vel[k] * d; } }
  const toS = (x, y) => { const c = Math.cos(cam.r), s = Math.sin(cam.r), dx = x - cam.x, dy = y - cam.y; return [W / 2 + (dx * c - dy * s) * cam.z, H * .56 - (dx * s + dy * c) * cam.z]; };
  const dirAt = y => -Math.atan((cx(y + 20) - cx(y - 20)) / 40) * .6;

  /* state */
  let vi = 0, phase = '', pStart = 0, vt = 0, speed = 1, tPrev = null, finishing = false, onDone = null, holedT = null, flag = 0, fadeA = 0;
  let V = null, arcs = [], ball = [0, 0, 0], notes = [], sparks = [];
  const start = n => { phase = n; pStart = vt; };
  function newHole(){ V = VARIANTS[vi++ % VARIANTS.length]; arcs = []; notes = []; ball = [cx(0), 0, 0];
    V.tee = [cx(0), 0]; start('drive'); }
  function update(dt){
    if (finishing) speed = phase === 'putt' && V.holes || phase === 'holed' ? 1 : 2.4;
    vt += dt * speed; const t = vt - pStart; flag += dt;
    if (phase === 'drive' || phase === 'appr'){
      const D = TIMES[phase], tau = clamp(t / D, 0, 1), u = tU(tau);
      const [s, e, h, c] = phase === 'drive' ? [V.tee, V.land, V.hD, V.cD] : [V.roll, V.land2, V.hA, V.cA];
      arcs[phase === 'drive' ? 0 : 1] = { s, e, h, c, u, a: 1 }; ball = shotPos(s, e, h, c, u);
      const look = phase === 'drive' ? lerp(.35, .7, ease.sin(tau)) : .7;
      const fx = lerp(s[0], e[0], look), fy = lerp(s[1], e[1], look);
      tgt = phase === 'drive' ? { x: fx, y: fy, z: lerp(2.0, 1.25, ease.sin(clamp(tau * 1.3, 0, 1))), r: dirAt(fy) } : { x: fx, y: fy, z: lerp(1.6, 2.6, ease.sin(tau)), r: dirAt(fy) * .5 };
      if (tau >= 1){ notes.push({ at: e, txt: phase === 'drive' ? 'Driver' : V.club, d: Math.round(Math.hypot(e[0] - s[0], e[1] - s[1])), t: vt }); start(phase === 'drive' ? 'droll' : 'aroll'); }
    } else if (phase === 'droll' || phase === 'aroll'){
      const D = TIMES[phase], k = ease.out(clamp(t / D, 0, 1)), [e, r] = phase === 'droll' ? [V.land, V.roll] : [V.land2, V.rest2];
      ball = [lerp(e[0], r[0], k), lerp(e[1], r[1], k), 0];
      if (t >= D) start(phase === 'droll' ? 'cam1' : 'cam2');
    } else if (phase === 'cam1'){ tgt = { x: lerp(V.roll[0], G.x, .45), y: lerp(V.roll[1], G.y, .45), z: 1.9, r: dirAt(300) * .5 }; if (t >= TIMES.cam1) start('appr'); }
    else if (phase === 'cam2'){ tgt = { x: PIN[0] - 1, y: PIN[1] - 3, z: 4.6, r: 0 }; if (t >= TIMES.cam2){ V.holes = finishing; start('putt'); } }
    else if (phase === 'putt'){
      const D = TIMES.putt, k = ease.out(clamp(t / D, 0, 1)), end = V.holes ? PIN : [PIN[0] + .25, PIN[1] + .3];
      const brk = Math.sin(Math.PI * k) * .5 * Math.sign(V.cA);
      ball = [lerp(V.rest2[0], end[0], k) + brk, lerp(V.rest2[1], end[1], k), 0]; arcs[2] = { putt: true, s: V.rest2, e: end, k, a: 1 };
      tgt = { x: PIN[0], y: PIN[1] - 1.2, z: V.holes ? 5.6 : 5, r: 0 };
      if (t >= D){ if (V.holes){ holedT = vt; burst(); start('holed'); } else start('hold'); }
    } else if (phase === 'hold'){ if (t >= TIMES.hold) start('out'); }
    else if (phase === 'out'){ fadeA = ease.inOut(clamp(t / TIMES.out, 0, 1)); tgt = { x: cx(40), y: 40, z: 2.2, r: 0 };
      if (t >= TIMES.out){ Object.assign(cam, tgt); for (const k in vel) vel[k] = 0; newHole(); } }
    else if (phase === 'holed'){ if (t > 1500 && onDone){ const f = onDone; onDone = null; f(); } }
    if (phase !== 'out') fadeA = Math.max(0, fadeA - dt / 400);
    spring(dt);
    for (const p of sparks){ p.life -= dt; p.x += p.vx * dt / 1000; p.y += p.vy * dt / 1000; p.vx *= .97; p.vy *= .97; }
    sparks = sparks.filter(p => p.life > 0);
  }
  function burst(){ seed = 99; for (let i = 0; i < 26; i++){ const a = rnd() * Math.PI * 2, v = 1.2 + rnd() * 3.4; sparks.push({ x: PIN[0], y: PIN[1], vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 700 + rnd() * 700, s: .5 + rnd(), ph: rnd() * 6 }); } }

  /* ---------- draw ---------- */
  function blit(m){ const c = Math.cos(cam.r), s = Math.sin(cam.r), k = cam.z / m.S;
    // world point (x,y) of map pixel (u,v): x = x0 + u/S, y = y1 - v/S. Screen: X = W/2 + ((x-cx)c - (y-cy)s) z, Y = H*.56 - ((x-cx)s + (y-cy)c) z
    const a = c * k, b = -s * k, cc = s * k, d = c * k; // dX/du = c k ; dY/du = -s k ; dX/dv = s k ; dY/dv = c k
    const ox = m.region.x0 - cam.x, oy = m.region.y1 - cam.y;
    const e = W / 2 + (ox * c - oy * s) * cam.z, f = H * .56 - (ox * s + oy * c) * cam.z;
    ctx.setTransform(DPR * a, DPR * b, DPR * cc, DPR * d, DPR * e, DPR * f); ctx.drawImage(m.cv, 0, 0); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); }
  const gold = (w, a) => { ctx.lineWidth = w; ctx.strokeStyle = `rgba(200,168,106,${A(a)})`; };
  function arcPts(ar, n = 48){ const pts = []; for (let i = 0; i <= n; i++){ const u = ar.u * i / n; pts.push(shotPos(ar.s, ar.e, ar.h, ar.c, u)); } return pts; }
  const lift = (p) => { const q = toS(p[0], p[1]); const hz = p[2] * clamp(cam.z, 1, 2.4) * .95; return [q[0] - hz * .92, q[1] - hz * .38]; };
  function render(){
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.fillStyle = P.paper; ctx.fillRect(0, 0, W, H);
    blit(base); if (cam.z > 3.2){ ctx.globalAlpha = clamp((cam.z - 3.2) / 1.5, 0, 1); blit(hi); ctx.globalAlpha = 1; }
    // yardage rules to the green centre (thin gold, hand-set labels)
    ctx.font = '600 9px Geist, system-ui'; ctx.textBaseline = 'middle';
    for (const m of [250, 200, 150, 100]){ const y = G.y - m, w = hw(y) + 3; const a = toS(cx(y) - w, y), b = toS(cx(y) + w, y);
      gold(.8, .85); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.fillStyle = 'rgba(200,168,106,.95)'; for (const q of [a, b]){ ctx.beginPath(); ctx.arc(q[0], q[1], 1.6, 0, Math.PI * 2); ctx.fill(); }
      const l = toS(cx(y) + w + 7, y); ctx.fillStyle = 'rgba(15,61,46,.78)'; ctx.textAlign = 'left'; ctx.letterSpacing = '1px'; ctx.fillText(String(m), l[0], l[1]); }
    // front / back of green marks
    { const f = toS(G.x - 24, G.y - G.ry), b = toS(G.x - 24, G.y + G.ry); gold(.7, .7); ctx.beginPath(); ctx.moveTo(f[0], f[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      for (const q of [f, b]){ ctx.beginPath(); ctx.moveTo(q[0] - 3, q[1]); ctx.lineTo(q[0] + 3, q[1]); ctx.stroke(); }
      const mid = toS(G.x - 27, G.y); ctx.save(); ctx.translate(mid[0], mid[1]); ctx.rotate(-Math.PI / 2 - cam.r * 0); ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(15,61,46,.7)'; ctx.fillText(`${Math.round(G.ry * 2)} M`, 0, 0); ctx.restore(); }
    // ground tracks (dashed) + flights (glowing gold)
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const ar of arcs){ if (!ar) continue;
      if (ar.putt){ const n = 20, pts = []; for (let i = 0; i <= n; i++){ const k = ar.k * i / n; pts.push(toS(lerp(ar.s[0], ar.e[0], k) + Math.sin(Math.PI * k) * .5 * Math.sign(V.cA), lerp(ar.s[1], ar.e[1], k))); }
        for (const [w, a] of [[6, .14], [2.4, .5], [1, 1]]){ gold(w, a * ar.a); if (w === 1) ctx.strokeStyle = `rgba(255,246,222,${A(ar.a)})`; ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke(); } continue; }
      const pts = arcPts(ar);
      ctx.setLineDash([2, 3]); ctx.lineWidth = 1; ctx.strokeStyle = `rgba(15,61,46,${A(.32 * ar.a)})`; ctx.beginPath(); pts.forEach((p, i) => { const q = toS(p[0], p[1]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.stroke(); ctx.setLineDash([]);
      const sp = pts.map(lift);
      for (const [w, a, col] of [[16, .07, '200,168,106'], [8, .16, '200,168,106'], [3.2, .55, '200,168,106'], [1.8, 1, '176,138,72'], [.8, .95, '255,248,228']]){
        ctx.lineWidth = w; ctx.strokeStyle = `rgba(${col},${A(a * ar.a)})`; ctx.beginPath(); sp.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke(); } }
    // pin + flag (lifts out on holed)
    const lifted = holedT != null ? ease.inOut(clamp((vt - holedT) / 700, 0, 1)) : 0;
    { const q = toS(PIN[0], PIN[1]), z = clamp(cam.z, 1.2, 9), hgt = 9 + z * 3.2, up = lifted * hgt * .9;
      ctx.fillStyle = 'rgba(15,61,46,.75)'; ctx.beginPath(); ctx.ellipse(q[0], q[1], 1 + z * .3, .7 + z * .2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1 - lifted * .9;
      ctx.strokeStyle = 'rgba(15,61,46,.22)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(q[0] + hgt * .5, q[1] + hgt * .18); ctx.stroke();
      const top = [q[0], q[1] - hgt - up]; ctx.strokeStyle = P.ink; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(q[0], q[1] - up); ctx.lineTo(top[0], top[1]); ctx.stroke();
      const fw = 5 + z * 1.2, fh = 3.4 + z * .75, wv = Math.sin(flag / 330) * .22; ctx.fillStyle = P.gold;
      ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.quadraticCurveTo(top[0] + fw * .5, top[1] + fh * (.12 + wv), top[0] + fw, top[1] + fh * .5); ctx.quadraticCurveTo(top[0] + fw * .5, top[1] + fh * (.88 + wv), top[0], top[1] + fh); ctx.fill(); ctx.globalAlpha = 1; }
    // shot notes (hand-set distance annotations)
    ctx.font = '600 8.5px Geist, system-ui'; ctx.letterSpacing = '1.4px';
    for (const n of notes){ const a = clamp((vt - n.t) / 450, 0, 1) * (1 - fadeA); if (a <= 0) continue; const q = toS(n.at[0], n.at[1]);
      const ex = q[0] + 30, ey = q[1] - 22; ctx.strokeStyle = `rgba(200,168,106,${A(a)})`; ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo(q[0] + 3, q[1] - 2); ctx.lineTo(ex, ey); ctx.lineTo(ex + 52 * ease.out(a), ey); ctx.stroke();
      ctx.textAlign = 'left'; ctx.fillStyle = `rgba(15,61,46,${A(.8 * a)})`; ctx.fillText(n.txt.toUpperCase(), ex + 2, ey - 7); ctx.font = '600 12px Geist, system-ui'; ctx.letterSpacing = '0px';
      ctx.fillStyle = `rgba(15,61,46,${A(a)})`; ctx.fillText(`${n.d} m`, ex + 2, ey + 8); ctx.font = '600 8.5px Geist, system-ui'; ctx.letterSpacing = '1.4px'; }
    ctx.letterSpacing = '0px';
    // ball + shadow
    const drop = holedT != null ? clamp((vt - holedT) / 260, 0, 1) : 0;
    if (drop < 1){ const g = toS(ball[0], ball[1]), q = lift(ball), r = clamp(1.1 + cam.z * .2, 1.6, 3.2) * (1 + ball[2] * .012) * (1 - drop);
      ctx.fillStyle = 'rgba(15,61,46,.28)'; ctx.beginPath(); ctx.ellipse(g[0] + 1, g[1] + .6, r * 1.1, r * .7, 0, 0, Math.PI * 2); ctx.fill();
      const rg = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], r * 6); rg.addColorStop(0, 'rgba(232,200,140,.5)'); rg.addColorStop(1, 'rgba(232,200,140,0)'); ctx.fillStyle = rg; ctx.fillRect(q[0] - r * 6, q[1] - r * 6, r * 12, r * 12);
      ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = 'rgba(15,61,46,.5)'; ctx.lineWidth = .6; ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    // holed: ripple + twinkling gold sparks
    if (holedT != null){ const k = clamp((vt - holedT - 120) / 1300, 0, 1), q = toS(PIN[0], PIN[1]);
      for (const d of [0, .18, .36]){ const kk = clamp(k - d, 0, 1); if (kk <= 0 || kk >= 1) continue; gold(1.1, .8 * (1 - kk)); ctx.beginPath(); ctx.ellipse(q[0], q[1], ease.out(kk) * 60, ease.out(kk) * 48, 0, 0, Math.PI * 2); ctx.stroke(); }
      for (const p of sparks){ const s = toS(p.x, p.y), a = clamp(p.life / 600, 0, 1), tw = .6 + .4 * Math.sin(vt / 60 + p.ph), R = (2.5 + p.s * 3) * tw;
        ctx.fillStyle = `rgba(200,168,106,${A(a)})`; ctx.beginPath(); ctx.moveTo(s[0], s[1] - R); ctx.quadraticCurveTo(s[0], s[1], s[0] + R * .6, s[1]); ctx.quadraticCurveTo(s[0], s[1], s[0], s[1] + R); ctx.quadraticCurveTo(s[0], s[1], s[0] - R * .6, s[1]); ctx.quadraticCurveTo(s[0], s[1], s[0], s[1] - R); ctx.fill(); } }
    // page edges: paper header wash + soft foot like a printed book
    { const hg = ctx.createLinearGradient(0, 0, 0, 84); hg.addColorStop(0, 'rgba(244,240,230,.88)'); hg.addColorStop(1, 'rgba(244,240,230,0)'); ctx.fillStyle = hg; ctx.fillRect(0, 0, W, 84); }
    const vg = ctx.createLinearGradient(0, 0, 0, H); vg.addColorStop(0, 'rgba(244,240,230,.0)'); vg.addColorStop(.8, 'rgba(244,240,230,0)'); vg.addColorStop(1, 'rgba(247,245,240,1)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    // compass + scale bar (screen-fixed, rotate with the map)
    { const ox = W - 26, oy = 30; ctx.save(); ctx.translate(ox, oy); ctx.rotate(-cam.r); ctx.strokeStyle = 'rgba(15,61,46,.55)'; ctx.lineWidth = .8; ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = P.gold; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(2.6, 0); ctx.lineTo(-2.6, 0); ctx.closePath(); ctx.fill(); ctx.fillStyle = 'rgba(15,61,46,.5)'; ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(2.6, 0); ctx.lineTo(-2.6, 0); ctx.closePath(); ctx.fill(); ctx.restore();
      const m = cam.z > 5 ? 5 : cam.z > 2 ? 20 : 50, L = m * cam.z; ctx.strokeStyle = 'rgba(15,61,46,.6)'; ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo(W - 18 - L, 56); ctx.lineTo(W - 18, 56); ctx.moveTo(W - 18 - L, 53); ctx.lineTo(W - 18 - L, 59); ctx.moveTo(W - 18, 53); ctx.lineTo(W - 18, 59); ctx.stroke();
      ctx.font = '600 8px Geist, system-ui'; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(15,61,46,.65)'; ctx.letterSpacing = '1px'; ctx.fillText(`${m} M`, W - 18, 66); ctx.letterSpacing = '0px'; }
    if (fadeA > 0){ ctx.fillStyle = `rgba(244,240,230,${A(fadeA)})`; ctx.fillRect(0, 0, W, H); }
  }

  function still(){ V = VARIANTS[0]; V.tee = [cx(0), 0]; arcs = [{ s: V.tee, e: V.land, h: V.hD, c: V.cD, u: 1, a: 1 }, { s: V.roll, e: V.land2, h: V.hA, c: V.cA, u: 1, a: 1 }];
    notes = [{ at: V.land, txt: 'Driver', d: Math.round(Math.hypot(V.land[0] - V.tee[0], V.land[1])), t: -1e6 }]; ball = [V.rest2[0], V.rest2[1], 0];
    Object.assign(cam, { x: cx(230), y: 215, z: Math.min(W / 150, H / 470) * .98, r: 0 }); tgt = { ...cam }; rmReady = true; render(); }

  let off = null;
  const fontsReady = (document.fonts?.load ? Promise.all([document.fonts.load('600 9px Geist'), document.fonts.load('600 12px Geist')]) : Promise.resolve()).catch(() => {});
  if (RM()) fontsReady.then(still);
  else { newHole(); off = Clock.add(now => { if (tPrev == null) tPrev = now; const dt = Math.min(50, now - tPrev); tPrev = now; update(dt); render(); }); }

  return {
    setProgress,
    finish(summary){
      sh.complete({ list_total: summary?.list_total }, summary?.title || 'Listo'); capL.textContent = 'Listo'; capR.textContent = summary?.total != null ? `${summary.total} tarjetas` : '';
      return new Promise(res => { if (RM()){ setTimeout(res, 600); return; } finishing = true; onDone = res; });
    },
    fail(msg){ sh.fail(msg); capL.textContent = 'No se pudo actualizar'; capR.textContent = ''; },
    leave(sheetEl){ return new Promise(res => { const s = sheetEl || sheet; if (RM() || !s){ res(); return; }
      s.classList.add('sx-turn'); setTimeout(res, 950); }); },
    destroy(){ off?.(); ro.disconnect(); sh.destroy(); sheet?.classList.remove('sx-sheet-paper', 'sx-turn'); },
  };
}
(window.GolfletSync.styles = window.GolfletSync.styles || {}).booklet = mount;
})();
