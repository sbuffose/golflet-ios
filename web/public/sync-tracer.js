/* Golflet · sync style A "Tracer": night fairway in perspective, glowing ball-flight tracer, live shot data.
   Canvas2D only. Spec: design/sync_animation_v2.md */
(function(){
const GOLD = [200,168,106];
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ease = { inOut: t => t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3)/2, out: t => 1 - Math.pow(1 - t, 3), out2: t => 1 - (1-t)*(1-t) };
const mix = (c1, c2, t) => `rgb(${Math.round(lerp(c1[0],c2[0],t))},${Math.round(lerp(c1[1],c2[1],t))},${Math.round(lerp(c1[2],c2[2],t))})`;
const hex = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
/* deterministic random */
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

/* ---------- world (meters): x lateral (+ right), y up, z downrange ---------- */
const cx = z => 7 * Math.sin(z / 130) - 4 * Math.sin(z / 47) * Math.min(1, z / 200);
const hw = z => 16 + 3 * Math.sin(z / 60 + 1);
const GZ = 392, GX = cx(GZ), GR = 15, PIN = [GX + 2, GZ + 1];
const C = { sky0: hex('#020B07'), sky1: hex('#08261B'), fog: hex('#0D3326'), rough0: hex('#06190F'), rough1: hex('#0A2A1E'),
  stripeA: hex('#18614A'), stripeB: hex('#124F3B'), green: hex('#1F7656'), fringe: hex('#166048'), tree: hex('#031109') };

const TREES = []; (function(){ for (let z = 18; z < 560; z += 9 + rnd()*9) for (const side of [-1, 1]) {
  if (rnd() < .18) continue; const off = hw(z) + 12 + rnd() * 26; const h = 11 + rnd() * 10;
  TREES.push({ x: cx(z) + side * off, z: z + rnd()*6, h, r: 4 + rnd() * 3.5, tone: rnd() }); } })();
TREES.sort((a, b) => b.z - a.z);

/* shot variants: [carry m, apex m, curve m (+ = curves right / "der")], display in yd/m as Toptracer does */
const VARIANTS = [
  { drive: { carry: 226, apex: 31, curve: -4, end: 0 }, appr: { club: 'Hierro 8', apex: 26, curve: 2 }, putt: { brk: .5 } },
  { drive: { carry: 231, apex: 29, curve: 3,  end: 0 }, appr: { club: 'Hierro 9', apex: 27, curve: -2 }, putt: { brk: -.6 } },
  { drive: { carry: 218, apex: 33, curve: -6, end: 0 }, appr: { club: 'Hierro 7', apex: 24, curve: 3 }, putt: { brk: .4 } },
];
const TIMES = { drive: 3000, droll: 800, cam1: 1400, appr: 2400, aroll: 650, cam2: 1250, putt: 2300, hold: 700, out: 600 };

function flightPos(sh, u){
  const v = Math.pow(u, 1.357);                                  // apex at ~60% of carry, steeper descent
  const x = lerp(sh.s[0], sh.e[0], u), z = lerp(sh.s[1], sh.e[1], u);
  const dx = sh.e[0] - sh.s[0], dz = sh.e[1] - sh.s[1], L = Math.hypot(dx, dz) || 1;
  const lat = -sh.curve * 4 * (u - u*u);                          // starts opposite, curves back onto the target
  return [x + (dz / L) * lat, sh.apex * Math.sin(Math.PI * v), z - (dx / L) * lat];
}
const timeToU = tau => tau * (1.35 - .35 * tau);                  // ball decelerates (drag)

function mount(container, opts, kit){
  const { shell, Clock, RM } = kit;
  const sh = shell(container, { club: opts.club, theme: 'night', title: opts.title });
  const sheet = container.closest('.sheet'); sheet?.classList.add('sx-sheet-night');
  sh.scene.innerHTML = `<canvas></canvas>
    <div class="tx-hud"><div class="tx-club"></div>
      <div class="tx-data"><div><b class="num" data-k="carry">0</b><span data-k="carryl">Carry · yd</span></div><div><b class="num" data-k="apex">0</b><span>Apex · m</span></div><div><b class="num" data-k="curve">0</b><span data-k="curvel">Curva · m</span></div></div></div>
    <div class="tx-count"><b class="num">0</b><span>tarjetas</span></div>`;
  const cv = sh.scene.querySelector('canvas'), ctx = cv.getContext('2d', { alpha: false });
  const hud = { club: sh.scene.querySelector('.tx-club'), carry: sh.scene.querySelector('[data-k=carry]'), apex: sh.scene.querySelector('[data-k=apex]'),
    curve: sh.scene.querySelector('[data-k=curve]'), curvel: sh.scene.querySelector('[data-k=curvel]'), carryl: sh.scene.querySelector('[data-k=carryl]'), box: sh.scene.querySelector('.tx-data') };
  const countEl = sh.scene.querySelector('.tx-count');
  let W = 0, H = 0, DPR = 1, F = 0, HOR = 0, grain = null, vign = null, glow = null;

  function resize(){
    const r = sh.scene.getBoundingClientRect(); W = Math.max(200, r.width); H = Math.max(200, r.height);
    DPR = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    cv.style.width = W + 'px'; cv.style.height = H + 'px'; F = W; HOR = H * .60;
    // grain tile
    grain = document.createElement('canvas'); grain.width = grain.height = 160; const g = grain.getContext('2d'), id = g.createImageData(160, 160);
    for (let i = 0; i < id.data.length; i += 4){ const v = Math.random() * 255; id.data[i] = id.data[i+1] = id.data[i+2] = v; id.data[i+3] = 22; }
    g.putImageData(id, 0, 0);
    vign = document.createElement('canvas'); vign.width = cv.width; vign.height = cv.height; const v = vign.getContext('2d');
    const rg = v.createRadialGradient(cv.width/2, cv.height*.46, cv.height*.2, cv.width/2, cv.height*.5, cv.height*.85);
    rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(0,6,3,.62)'); v.fillStyle = rg; v.fillRect(0, 0, vign.width, vign.height);
    glow = document.createElement('canvas'); glow.width = glow.height = 96; const gg = glow.getContext('2d'), gr = gg.createRadialGradient(48,48,0,48,48,48);
    gr.addColorStop(0, 'rgba(255,240,205,1)'); gr.addColorStop(.18, 'rgba(232,200,140,.75)'); gr.addColorStop(.5, 'rgba(200,168,106,.18)'); gr.addColorStop(1, 'rgba(200,168,106,0)');
    gg.fillStyle = gr; gg.fillRect(0, 0, 96, 96);
  }
  resize(); const ro = new ResizeObserver(() => { resize(); if (RM() && rmReady) render(); }); let rmReady = false; ro.observe(sh.scene);

  /* ---------- camera ---------- */
  const cam = { x: 0, y: 2.6, z: -9, yaw: 0, tilt: 0, f: 1 };
  const camAt = (x, z, h, back, lookX, lookZ, f = 1, side = 0) => { let yaw = Math.atan2(lookX - x, lookZ - z);
    const px = x - Math.sin(yaw) * back + Math.cos(yaw) * side, pz = z - Math.cos(yaw) * back - Math.sin(yaw) * side;
    if (side) yaw = Math.atan2(lookX - px, lookZ - pz) - side * .016; return { x: px, z: pz, y: h, yaw, tilt: 0, f }; };
  function toCam(x, y, z){ const dx = x - cam.x, dz = z - cam.z, c = Math.cos(cam.yaw), s = Math.sin(cam.yaw); return [dx * c - dz * s, y - cam.y, dx * s + dz * c]; }
  const NEAR = .6;
  const proj = p => { const k = F * cam.f / p[2]; return [W/2 + p[0] * k, HOR + cam.tilt - p[1] * k, k]; };
  function P(x, y, z){ const p = toCam(x, y, z); return p[2] < NEAR ? null : proj(p); }
  function poly(pts){ // ground polygon with near-plane clipping (Sutherland–Hodgman)
    const c = pts.map(([x, z]) => toCam(x, 0, z)), out = [];
    for (let i = 0; i < c.length; i++){ const a = c[i], b = c[(i+1) % c.length], ai = a[2] >= NEAR, bi = b[2] >= NEAR;
      if (ai) out.push(a);
      if (ai !== bi){ const t = (NEAR - a[2]) / (b[2] - a[2]); out.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t), NEAR]); } }
    if (out.length < 3) return false;
    ctx.beginPath(); out.forEach((p, i) => { const q = proj(p); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath(); return true;
  }
  const fogK = z => clamp((z - cam.z) / 520, 0, 1);

  /* ---------- state machine ---------- */
  let vi = 0, phase = null, pStart = 0, tracers = [], ball = [0, 0, 0], finishing = false, onHoled = null, parts = [], speed = 1, tPrev = null, vt = 0, holed = false, holedT = 0, countT = null, countN = 0;
  let shot = null, camFrom = null, camTo = null, data = { carry: 0, apex: 0, curve: 0 }, flag = 0;
  const TEE = [cx(0), 0];
  function start(name){ phase = name; pStart = vt; }
  function newHole(){
    const V = VARIANTS[vi++ % VARIANTS.length]; tracers = []; holed = false;
    const d = V.drive, land = [cx(d.carry) - d.curve * .2, d.carry];
    const roll = [land[0] + (land[0] - TEE[0]) * .05, d.carry + 14];
    const appLand = [PIN[0] + 1.1, PIN[1] - 5.2], appRest = [PIN[0] + .8, PIN[1] - 2.6];
    shot = { V, d: { s: TEE, e: land, apex: d.apex, curve: d.curve, roll, club: 'Driver' },
             a: { s: roll, e: appLand, apex: V.appr.apex, curve: V.appr.curve, roll: appRest, club: V.appr.club } };
    Object.assign(cam, camAt(TEE[0], TEE[1], 1.7, 20, cx(150), 150, 1.6, 6)); ball = [TEE[0], 0, TEE[1]];
    setClub('Driver · Tiro 1'); data = { carry: 0, apex: 0, curve: 0 }; start('drive');
  }
  function setClub(t){ hud.club.textContent = t; }
  const carryYd = (s, p) => Math.hypot(p[0] - s[0], p[2] - s[1]) * 1.0936;

  function update(dt){
    if (finishing) speed = (phase === 'putt' && shot.p?.holed) || phase === 'holed' ? 1 : 2.4;
    vt += dt * speed; const t = vt - pStart;
    if (phase === 'drive' || phase === 'appr'){
      const S = phase === 'drive' ? shot.d : shot.a, D = TIMES[phase], tau = clamp(t / D, 0, 1), u = timeToU(tau);
      const n = 44, pts = []; for (let i = 0; i <= n; i++){ const uu = u * i / n; pts.push(flightPos(S, uu)); }
      ball = pts[n]; tracers[phase === 'drive' ? 0 : 1] = { pts, a: 1 };
      data.carry = carryYd(S.s, ball); data.apex = Math.max(data.apex, ball[1]);
      data.curve = S.curve * u * u;                                  // displayed curve grows to its final value
      if (phase === 'drive'){ // camera: gentle dolly + yaw follow
        const base = camAt(TEE[0], TEE[1], 1.7, 20, cx(150), 150, 1.6, 6); const e = ease.inOut(tau);
        cam.z = base.z + e * 7; cam.x = base.x + (ball[0] - base.x) * .08 * e; cam.yaw = base.yaw + Math.atan2(ball[0] - cam.x, Math.max(20, ball[2] - cam.z)) * .25; cam.y = 1.8 + e * .7; cam.f = 1.6 - e * .1;
      } else { const e = ease.inOut(tau); cam.z = camTo.z + e * 6; }
      if (tau >= 1) start(phase === 'drive' ? 'droll' : 'aroll');
    } else if (phase === 'droll' || phase === 'aroll'){
      const S = phase === 'droll' ? shot.d : shot.a, D = TIMES[phase], k = ease.out(clamp(t / D, 0, 1));
      ball = [lerp(S.e[0], S.roll[0], k), 0, lerp(S.e[1], S.roll[1], k)];
      if (t >= D){ camFrom = { ...cam };
        if (phase === 'droll'){ camTo = camAt(S.roll[0], S.roll[1], 2.2, 14, PIN[0], PIN[1], 1.45, -6); start('cam1'); }
        else { camTo = camAt(S.roll[0], S.roll[1], 1.25, 5.5, PIN[0], PIN[1], .95); start('cam2'); } }
    } else if (phase === 'cam1' || phase === 'cam2'){
      const D = TIMES[phase], e = ease.inOut(clamp(t / D, 0, 1));
      for (const k of ['x','y','z','f']) cam[k] = lerp(camFrom[k], camTo[k], e);
      cam.yaw = lerp(camFrom.yaw, camTo.yaw, e); cam.tilt = Math.sin(Math.PI * e) * -14;
      tracers.forEach(tr => { if (tr) tr.a = Math.max(phase === 'cam2' ? 0 : .42, tr.a - dt / 700); });
      if (t >= D){ if (phase === 'cam1'){ data = { carry: 0, apex: 0, curve: 0 }; setClub(`${shot.a.club} · Tiro 2`); start('appr'); }
        else { setClub('Putt · Tiro 3'); shot.p = { s: shot.a.roll, holed: finishing }; start('putt'); } }
    } else if (phase === 'putt'){
      const D = TIMES.putt, k = ease.out(clamp(t / D, 0, 1)), P0 = shot.p.s;
      const end = shot.p.holed ? PIN : [PIN[0] + .22, PIN[1] - .28];
      const brk = shot.V.putt.brk * Math.sin(Math.PI * k);
      ball = [lerp(P0[0], end[0], k) + brk * .35, 0, lerp(P0[1], end[1], k)];
      data.carry = carryYd(P0, ball) / 1.0936; data.apex = 0; data.curve = 0;
      tracers[2] = { pts: Array.from({ length: 24 }, (_, i) => { const kk = k * i / 23; return [lerp(P0[0], end[0], kk) + shot.V.putt.brk * Math.sin(Math.PI * kk) * .35, .02, lerp(P0[1], end[1], kk)]; }), a: 1, ground: true };
      if (t >= D){ if (shot.p.holed){ holed = true; holedT = vt; burst(); start('holed'); } else start('hold'); }
    } else if (phase === 'hold'){ if (t >= TIMES.hold) start('out'); }
    else if (phase === 'out'){ if (t >= TIMES.out) newHole(); }
    else if (phase === 'holed'){
      if (countT == null && t > 380) countT = vt;
      if (t > 1900 && onHoled){ const f = onHoled; onHoled = null; f(); }
    }
    flag += dt;
    if (phase === 'putt' || phase === 'holed' || phase === 'hold') for (const i of [0, 1]) if (tracers[i]) tracers[i].a = Math.max(0, tracers[i].a - dt / 500);
    // particles
    for (const p of parts){ p.life -= dt; p.px = p.x; p.py = p.y; p.vy += 210 * dt / 1000; p.vx *= .985; p.vy *= .985; p.x += p.vx * dt / 1000; p.y += p.vy * dt / 1000; }
    parts = parts.filter(p => p.life > 0);
  }
  function burst(){ const q = P(PIN[0], .05, PIN[1]); if (!q) return;
    for (let i = 0; i < 70; i++){ const a = -Math.PI/2 + (rnd() - .5) * Math.PI * .9, v = 70 + rnd() * 200;
      parts.push({ x: q[0], y: q[1], px: q[0], py: q[1], vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 700 + rnd() * 900, max: 1600, s: .8 + rnd() * 1.8 }); } }

  /* ---------- render ---------- */
  function render(){
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const hor = HOR + cam.tilt;
    // sky
    let g = ctx.createLinearGradient(0, 0, 0, hor); g.addColorStop(0, mix(C.sky0, C.sky0, 0)); g.addColorStop(1, mix(C.sky1, C.sky1, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, hor + 1);
    g = ctx.createLinearGradient(0, hor - 60, 0, hor + 4); g.addColorStop(0, 'rgba(200,168,106,0)'); g.addColorStop(1, 'rgba(200,168,106,.16)');
    ctx.fillStyle = g; ctx.fillRect(0, hor - 60, W, 64);
    // far ridge (parallax with yaw)
    ctx.fillStyle = '#04150E'; ctx.beginPath(); ctx.moveTo(0, hor + 1);
    const off = cam.yaw * F * .9 + cam.x * 1.2;
    for (let x = 0; x <= W + 8; x += 8){ const wx = x + off; const yy = hor - 10 - 7 * Math.sin(wx / 37) - 5 * Math.sin(wx / 13 + 1) - 3 * Math.sin(wx / 5.3); ctx.lineTo(x, yy); }
    ctx.lineTo(W, hor + 1); ctx.closePath(); ctx.fill();
    // ground base
    g = ctx.createLinearGradient(0, hor, 0, H); g.addColorStop(0, mix(C.fog, C.fog, 0)); g.addColorStop(.25, mix(C.rough1, C.rough1, 0)); g.addColorStop(1, mix(C.rough0, C.rough0, 0));
    ctx.fillStyle = g; ctx.fillRect(0, hor, W, H - hor);
    // fairway mown stripes (world-anchored bands)
    const STEP = 11, z0 = Math.floor((cam.z + 1) / STEP) * STEP;
    for (let z = Math.min(GZ - 18, 470); z >= z0; z -= STEP){
      const za = Math.max(z, cam.z + NEAR + .1), zb = Math.min(z + STEP, GZ - 14); if (zb <= za) continue;
      if (!poly([[cx(za) - hw(za), za], [cx(za) + hw(za), za], [cx(zb) + hw(zb), zb], [cx(zb) - hw(zb), zb]])) continue;
      const f = fogK((za + zb) / 2); ctx.fillStyle = mix(Math.floor(z / STEP) % 2 ? C.stripeA : C.stripeB, C.fog, f * .9); ctx.fill();
    }
    // fringe + green
    const circle = (r, n = 36) => Array.from({ length: n }, (_, i) => [GX + Math.cos(i / n * Math.PI * 2) * r, GZ + Math.sin(i / n * Math.PI * 2) * r * 1.1]);
    if (poly(circle(GR + 3.5))){ ctx.fillStyle = mix(C.fringe, C.fog, fogK(GZ) * .85); ctx.fill(); }
    if (poly(circle(GR))){ const f = fogK(GZ) * .8; ctx.fillStyle = mix(C.green, C.fog, f); ctx.fill();
      const q = P(PIN[0], 0, PIN[1]); if (q){ const rg = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], Math.max(8, q[2] * 18)); rg.addColorStop(0, 'rgba(255,236,190,.20)'); rg.addColorStop(1, 'rgba(255,236,190,0)'); ctx.fillStyle = rg; ctx.fill(); } }
    // stadium light pool on the landing zone
    const lp = P(ball[0], 0, ball[2]) || P(cx(cam.z + 60), 0, cam.z + 60);
    if (lp){ ctx.globalCompositeOperation = 'lighter'; const r = Math.max(60, lp[2] * 70); const rg = ctx.createRadialGradient(lp[0], lp[1], 0, lp[0], lp[1], r);
      rg.addColorStop(0, 'rgba(120,170,120,.10)'); rg.addColorStop(1, 'rgba(120,170,120,0)'); ctx.fillStyle = rg; ctx.fillRect(lp[0] - r, lp[1] - r, r * 2, r * 2); ctx.globalCompositeOperation = 'source-over'; }
    // horizon fog
    g = ctx.createLinearGradient(0, hor, 0, hor + H * .16); g.addColorStop(0, 'rgba(13,51,38,.85)'); g.addColorStop(1, 'rgba(13,51,38,0)'); ctx.fillStyle = g; ctx.fillRect(0, hor, W, H * .16);
    // trees (far → near), rim-lit
    for (const tr of TREES){
      const b = P(tr.x, 0, tr.z); if (!b) continue; const top = P(tr.x, tr.h, tr.z); if (!top) continue;
      const rx = tr.r * b[2], ry = (tr.h * .55) * b[2], cyy = lerp(b[1], top[1], .58);
      if (b[0] + rx < -20 || b[0] - rx > W + 20 || rx < .6) continue;
      const f = fogK(tr.z);
      ctx.fillStyle = mix(C.tree, C.fog, f * .75); ctx.beginPath(); ctx.ellipse(b[0], cyy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(b[0] - rx * .08, cyy, rx * .16, b[1] - cyy);
      if (rx > 3){ ctx.strokeStyle = `rgba(200,168,106,${(.10 * (1 - f)).toFixed(3)})`; ctx.lineWidth = Math.min(2, rx * .06); ctx.beginPath(); ctx.ellipse(b[0], cyy, rx, ry, 0, -Math.PI * .85, -Math.PI * .35); ctx.stroke(); }
    }
    // pin + flag
    const pb = P(PIN[0], 0, PIN[1]), pt = P(PIN[0], 2.2, PIN[1]);
    if (pb && pt){ ctx.strokeStyle = 'rgba(247,245,240,.85)'; ctx.lineWidth = Math.max(.8, pb[2] * .05); ctx.beginPath(); ctx.moveTo(pb[0], pb[1]); ctx.lineTo(pt[0], pt[1]); ctx.stroke();
      const fw = Math.max(5, pb[2] * .6), fh = Math.max(3.4, pb[2] * .36), wv = Math.sin(flag / 380) * .25;
      ctx.fillStyle = '#C8102E'; ctx.beginPath(); ctx.moveTo(pt[0], pt[1]); ctx.quadraticCurveTo(pt[0] + fw * .5, pt[1] + fh * (.15 + wv), pt[0] + fw, pt[1] + fh * .5); ctx.quadraticCurveTo(pt[0] + fw * .5, pt[1] + fh * (.85 + wv), pt[0], pt[1] + fh); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.ellipse(pb[0], pb[1], Math.max(1.2, pb[2] * .07), Math.max(.6, pb[2] * .025), 0, 0, Math.PI * 2); ctx.fill(); }
    // tracers
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalCompositeOperation = 'lighter';
    for (const tr of tracers){ if (!tr || tr.a < .01) continue;
      const sp = tr.pts.map(p => P(p[0], p[1], p[2])).filter(Boolean); if (sp.length < 2) continue;
      // ground shadow track
      if (!tr.ground){ ctx.strokeStyle = `rgba(0,0,0,${(.22 * tr.a).toFixed(3)})`; ctx.lineWidth = 1.2; ctx.beginPath(); tr.pts.forEach((p, i) => { const q = P(p[0], 0, p[2]); if (q) (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); }); ctx.globalCompositeOperation = 'source-over'; ctx.stroke(); ctx.globalCompositeOperation = 'lighter'; }
      const CH = 6, per = Math.ceil((sp.length - 1) / CH);
      for (const [w, a, col] of tr.ground ? [[5, .10, GOLD], [2.2, .35, GOLD], [.9, .9, [255,243,214]]] : [[16, .055, GOLD], [8, .12, GOLD], [3.4, .42, [232,200,140]], [1.5, .95, [255,243,214]]]){
        for (let c = 0; c < sp.length - 1; c += per){ const seg = sp.slice(c, c + per + 1); const k = clamp(seg[0][2] / 12, .35, 1.4);
          ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${(a * tr.a).toFixed(3)})`; ctx.lineWidth = w * k; ctx.beginPath(); seg.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke(); } }
    }
    // ball + head glow
    if (!holed){ const q = P(ball[0], Math.max(.04, ball[1]), ball[2]); if (q){ const s = clamp(q[2] * .9, 6, 46) * (ball[1] > .3 ? 1.6 : 1);
      ctx.drawImage(glow, q[0] - s, q[1] - s, s * 2, s * 2); ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#FFFDF6'; ctx.beginPath(); ctx.arc(q[0], q[1], clamp(q[2] * .022, .9, 3.2), 0, Math.PI * 2); ctx.fill(); ctx.globalCompositeOperation = 'lighter'; } }
    // particles
    if (holed){ const k = clamp((vt - holedT) / 1400, 0, 1), q = P(PIN[0], 0, PIN[1]);
      if (q) for (const [d, w] of [[0, 1.6], [.22, 1]]){ const kk = clamp(k - d, 0, 1); if (kk <= 0 || kk >= 1) continue; const r = ease.out(kk) * q[2] * 3.2;
        ctx.strokeStyle = `rgba(232,200,140,${(.75 * (1 - kk)).toFixed(3)})`; ctx.lineWidth = w; ctx.beginPath(); ctx.ellipse(q[0], q[1], r, r * .28, 0, 0, Math.PI * 2); ctx.stroke(); }
      if (q && k < 1){ const s = q[2] * 1.6 * (1 - k) + 8; ctx.globalAlpha = 1 - k; ctx.drawImage(glow, q[0] - s, q[1] - s, s * 2, s * 2); ctx.globalAlpha = 1; } }
    for (const p of parts){ const a = clamp(p.life / 1100, 0, 1), s = p.s * 5;
      ctx.globalAlpha = a * .8; ctx.drawImage(glow, p.x - s, p.y - s, s * 2, s * 2); ctx.globalAlpha = 1;
      ctx.fillStyle = `rgba(255,240,205,${a.toFixed(3)})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * .55, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalCompositeOperation = 'source-over';
    // fade between holes
    if (phase === 'out'){ ctx.fillStyle = `rgba(2,11,7,${ease.inOut(clamp((vt - pStart) / TIMES.out, 0, 1)).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
    if (phase === 'drive' && vt - pStart < 500 && vi > 1){ ctx.fillStyle = `rgba(2,11,7,${(1 - (vt - pStart) / 500).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
    // vignette + grain
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(vign, 0, 0);
    if (!RM()){ ctx.globalAlpha = .5; ctx.globalCompositeOperation = 'overlay'; const pat = ctx.createPattern(grain, 'repeat'); ctx.translate((rnd() * 160) | 0, (rnd() * 160) | 0); ctx.fillStyle = pat; ctx.fillRect(-160, -160, cv.width + 160, cv.height + 160); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    // HUD
    hud.carry.textContent = Math.round(data.carry); hud.apex.textContent = Math.round(data.apex);
    hud.curve.textContent = Math.abs(Math.round(data.curve)); hud.curvel.textContent = data.curve < -.5 ? 'Curva · m izq' : data.curve > .5 ? 'Curva · m der' : 'Curva · m';
    const isPutt = phase === 'putt' || phase === 'hold' || phase === 'holed'; hud.box.classList.toggle('putt', isPutt); hud.carryl.textContent = isPutt ? 'Putt · m' : 'Carry · yd';
    if (countT != null){ const k = clamp((vt - countT) / 1100, 0, 1); countEl.classList.add('on'); sh.root.classList.add('counting'); countEl.querySelector('b').textContent = Math.round(countN * ease.out(k)); }
  }

  /* reduced motion: one composed still frame */
  function still(){ newHole(); vt = 0; phase = 'still'; const S = shot.d; S.carry = shot.V.drive.carry; tracers[0] = { pts: Array.from({ length: 45 }, (_, i) => flightPos(S, i / 44)), a: 1 };
    ball = flightPos(S, 1); data = { carry: S.carry * 1.0936, apex: S.apex, curve: S.curve }; Object.assign(cam, camAt(TEE[0], TEE[1], 1.7, 20, cx(150), 150, 1.5, 6)); rmReady = true; render(); }

  let off = null;
  if (RM()) still();
  else { newHole(); off = Clock.add(now => { if (tPrev == null) tPrev = now; const dt = Math.min(50, now - tPrev); tPrev = now; update(dt); render(); }); }

  return {
    setProgress: sh.setProgress,
    finish(summary){
      const n = summary?.total ?? summary?.list_total ?? 0; countN = n;
      sh.complete({ list_total: summary?.list_total }, summary?.title || 'Listo');
      return new Promise(res => {
        if (RM()){ countEl.classList.add('on'); countEl.querySelector('b').textContent = n; setTimeout(res, 600); return; }
        finishing = true; onHoled = res;
      });
    },
    fail(msg){ sh.fail(msg); off?.(); off = null; },
    leave(sheetEl){ return new Promise(res => { if (RM()){ res(); return; } (sheetEl || sheet)?.classList.add('sx-leave-night'); setTimeout(res, 560); }); },
    destroy(){ off?.(); ro.disconnect(); sh.destroy(); sheet?.classList.remove('sx-sheet-night'); },
  };
}
(window.GolfletSync.styles = window.GolfletSync.styles || {}).tracer = mount;
})();
