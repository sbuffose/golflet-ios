/* Golflet · green slope viewer (t181u, API_v5 §60 "green surface").
   GolfletGreen.mount(el, surface, { bearing?, allowSynthetic? }) → { destroy() }
   - 2D: slope heatmap (% slope, blue flat → green → yellow → orange → red → magenta steep) + fall-direction arrows that MOVE, faster where it is steeper
     (static under prefers-reduced-motion). 3D: rotatable relief (three.js, loaded on demand), vertical exaggeration ×4.
   - Only real survey data is shown in the app. A surface marked `synthetic: true` is refused unless allowSynthetic (local QA preview only). */
(function () {
  const STOPS = [[0, [117, 170, 219]], [1, [64, 160, 224]], [1.5, [40, 170, 90]], [2.5, [244, 220, 40]], [3.5, [245, 150, 40]], [4.5, [220, 50, 40]], [6, [214, 40, 200]]];
  const LEG = [0, 1, 2, 3, 4, 5];
  const col = p => { for (let i = 1; i < STOPS.length; i++) if (p <= STOPS[i][0]) { const [a, ca] = STOPS[i - 1], [b, cb] = STOPS[i], k = (p - a) / (b - a); return ca.map((v, j) => Math.round(v + (cb[j] - v) * k)); } return STOPS[STOPS.length - 1][1]; };
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Slope (%) and fall direction per cell from the elevation grid (3×3 smoothing, central differences). */
  function analyse(s) {
    const { cols: W, rows: H, cell_m: c } = s, nd = s.nodata ?? null;
    const z0 = Float64Array.from(s.z, v => v == null || v === nd ? NaN : v), z = new Float64Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let a = 0, n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const v = z0[yy * W + xx]; if (!isNaN(v)) { a += v; n++; } } z[y * W + x] = isNaN(z0[y * W + x]) ? NaN : a / n; }
    const slope = new Float32Array(W * H), fx = new Float32Array(W * H), fy = new Float32Array(W * H);   // fx east, fy south (grid rows go north → south)
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? NaN : z[y * W + x];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (isNaN(z[i])) { slope[i] = NaN; continue; }
      const l = at(x - 1, y), r = at(x + 1, y), u = at(x, y - 1), d = at(x, y + 1);
      const gx = (!isNaN(l) && !isNaN(r)) ? (r - l) / (2 * c) : !isNaN(r) ? (r - z[i]) / c : !isNaN(l) ? (z[i] - l) / c : 0;
      const gy = (!isNaN(u) && !isNaN(d)) ? (d - u) / (2 * c) : !isNaN(d) ? (d - z[i]) / c : !isNaN(u) ? (z[i] - u) / c : 0;   // dz per metre southward
      const g = Math.hypot(gx, gy); slope[i] = 100 * g; fx[i] = g ? -gx / g : 0; fy[i] = g ? -gy / g : 0;
    }
    return { z, slope, fx, fy, W, H, c };
  }

  function mount(el, s, o = {}) {
    if (!s || s.format !== 'golflet.green-surface/v1' || !s.cols || !s.rows || s.z?.length !== s.cols * s.rows) { el.innerHTML = ''; return { destroy() {} }; }
    if (s.synthetic && !o.allowSynthetic) { el.innerHTML = ''; return { destroy() {} }; }
    const A = analyse(s), rot = -(o.bearing || 0) * Math.PI / 180;   // approach (tee → green bearing) points up the screen
    el.innerHTML = `<div class="gv"><div class="gv-seg" role="tablist" aria-label="Vista del green"><button type="button" data-m="2d" class="on" aria-selected="true">Plano</button><button type="button" data-m="3d" aria-selected="false">3D</button></div>
      <div class="gv-stage"><canvas class="gv-c" aria-label="Pendientes del green: colores por porcentaje de pendiente y flechas hacia donde cae"></canvas><div class="gv-3d" hidden></div></div>
      <div class="gv-leg" aria-label="Pendiente en porcentaje"><div class="gv-bar"></div><div class="gv-n">${LEG.map(v => `<span>${v}${v === 5 ? '+' : ''}</span>`).join('')}<span class="gv-u">%</span></div></div>
      ${s.synthetic ? '<div class="gv-syn">SUPERFICIE SINTÉTICA · SOLO PRUEBA</div>' : ''}</div>`;
    const bar = el.querySelector('.gv-bar'); bar.style.background = `linear-gradient(90deg, ${Array.from({ length: 13 }, (_, i) => { const p = i * 0.5; return `rgb(${col(p).join(',')}) ${(p / 6) * 100}%`; }).join(',')})`;
    const cv = el.querySelector('.gv-c'), ctx = cv.getContext('2d'), stage = el.querySelector('.gv-stage');
    // heatmap image (one pixel per cell, smoothed on scale-up)
    const img = document.createElement('canvas'); img.width = A.W; img.height = A.H; const ic = img.getContext('2d'), id = ic.createImageData(A.W, A.H);
    for (let i = 0; i < A.W * A.H; i++) { const p = A.slope[i]; if (isNaN(p)) { id.data[i * 4 + 3] = 0; continue; } const c = col(p); id.data.set([c[0], c[1], c[2], 255], i * 4); }
    ic.putImageData(id, 0, 0);
    // arrow seeds every ~1.2 m
    const step = Math.max(1, Math.round(1.2 / A.c)), seeds = [];
    for (let y = Math.floor(step / 2); y < A.H; y += step) for (let x = Math.floor(step / 2); x < A.W; x += step) { const i = y * A.W + x; if (!isNaN(A.slope[i]) && A.slope[i] > 0.15) seeds.push({ x, y, i, ph: Math.random() }); }
    let mode = '2d', raf = 0, dpr = 1, scale = 1, t0 = performance.now(), dead = false;
    const size = () => { dpr = Math.min(2, devicePixelRatio || 1); const w = stage.clientWidth || 320, cs = Math.abs(Math.cos(rot)), sn = Math.abs(Math.sin(rot)), bw = A.W * cs + A.H * sn, bh = A.W * sn + A.H * cs; scale = w / bw; const h = Math.round(bh * scale); cv.style.height = h + 'px'; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); };
    const draw = now => {
      if (dead) return; const t = (now - t0) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
      const w = cv.width / dpr, h = cv.height / dpr; ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(rot); ctx.translate(-A.W * scale / 2, -A.H * scale / 2);
      ctx.imageSmoothingEnabled = true; ctx.drawImage(img, 0, 0, A.W * scale, A.H * scale);
      const L = step * scale * 0.5; ctx.fillStyle = '#121614'; ctx.strokeStyle = '#121614'; ctx.lineWidth = Math.max(1.4, L * 0.17); ctx.lineCap = 'round';
      for (const sd of seeds) {
        const p = A.slope[sd.i], ux = A.fx[sd.i], uy = A.fy[sd.i];
        const travel = reduced() ? 0 : (((t * (0.25 + 0.35 * p)) + sd.ph) % 1 - 0.5) * step * scale * 0.7;   // faster where steeper
        const cx = (sd.x + 0.5) * scale + ux * travel, cy = (sd.y + 0.5) * scale + uy * travel, len = L * Math.min(1.25, 0.6 + p * 0.12);
        const tx = cx + ux * len / 2, ty = cy + uy * len / 2, bx = cx - ux * len / 2, by = cy - uy * len / 2, hw = len * 0.34;
        ctx.globalAlpha = reduced() ? 0.9 : 0.35 + 0.65 * Math.sin(Math.PI * (((t * (0.25 + 0.35 * p)) + sd.ph) % 1));
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx - ux * hw * .6, ty - uy * hw * .6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx - ux * hw - uy * hw * .7, ty - uy * hw + ux * hw * .7); ctx.lineTo(tx - ux * hw + uy * hw * .7, ty - uy * hw - ux * hw * .7); ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1; ctx.restore();
      if (!reduced() && mode === '2d') raf = requestAnimationFrame(draw);
    };
    size(); draw(performance.now());
    const ro = new ResizeObserver(() => { size(); if (reduced() && mode === '2d') draw(performance.now()); }); ro.observe(stage);
    const mq = matchMedia('(prefers-reduced-motion: reduce)'), onMq = () => { cancelAnimationFrame(raf); if (mode === '2d') draw(performance.now()); }; mq.addEventListener?.('change', onMq);
    // 3D (lazy)
    let three = null;
    async function show3d() {
      const box = el.querySelector('.gv-3d'); cancelAnimationFrame(raf); cv.hidden = true; box.hidden = false; if (three) { cancelAnimationFrame(three.raf); three.tick(); return; }
      box.innerHTML = '<div class="gv-load">…</div>';
      const T = await import('/vendor/three/three-green.min.js'); if (dead) return;
      const w = stage.clientWidth || 320, h = Math.round(w * 0.8), EX = 4;
      const r = new T.WebGLRenderer({ antialias: true, alpha: true }); r.setPixelRatio(Math.min(2, devicePixelRatio || 1)); r.setSize(w, h); box.innerHTML = ''; box.appendChild(r.domElement);
      const sc = new T.Scene(), cam = new T.PerspectiveCamera(40, w / h, 0.1, 1000);
      let zmin = Infinity; for (const v of A.z) if (!isNaN(v) && v < zmin) zmin = v;
      const pos = [], cols = [], idx = [], map = new Int32Array(A.W * A.H).fill(-1), cx = A.W * A.c / 2, cy = A.H * A.c / 2;
      for (let y = 0; y < A.H; y++) for (let x = 0; x < A.W; x++) { const i = y * A.W + x; if (isNaN(A.z[i])) continue; map[i] = pos.length / 3; pos.push(x * A.c - cx, (A.z[i] - zmin) * EX, y * A.c - cy); const c = col(A.slope[i]); cols.push(c[0] / 255, c[1] / 255, c[2] / 255); }
      for (let y = 0; y < A.H - 1; y++) for (let x = 0; x < A.W - 1; x++) { const a = map[y * A.W + x], b = map[y * A.W + x + 1], c2 = map[(y + 1) * A.W + x], d = map[(y + 1) * A.W + x + 1]; if (a < 0 || b < 0 || c2 < 0 || d < 0) continue; idx.push(a, c2, b, b, c2, d); }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(cols, 3)); g.setIndex(idx); g.computeVertexNormals();
      const mesh = new T.Mesh(g, new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide })); mesh.rotation.y = -rot; sc.add(mesh);
      sc.add(new T.AmbientLight(0xffffff, 0.95)); const dl = new T.DirectionalLight(0xffffff, 2.4); dl.position.set(-14, 16, 10); sc.add(dl);
      const R = Math.max(cx, cy) * 2.1; cam.position.set(0, R * 0.75, R * 1.15); cam.lookAt(0, 0, 0);
      const ctl = new T.OrbitControls(cam, r.domElement); ctl.enableDamping = !reduced(); ctl.autoRotate = !reduced(); ctl.autoRotateSpeed = 0.8; ctl.minPolarAngle = Math.PI * 0.08; ctl.maxPolarAngle = Math.PI * 0.4; ctl.minDistance = R * 0.4; ctl.maxDistance = R * 2.5;
      ctl.addEventListener('start', () => { ctl.autoRotate = false; });
      const tick = () => { if (dead || mode !== '3d') return; ctl.update(); r.render(sc, cam); three.raf = requestAnimationFrame(tick); };
      three = { r, raf: 0, tick }; tick();
      box.insertAdjacentHTML('beforeend', '<span class="gv-ex">relieve ×4</span>');
    }
    el.querySelectorAll('.gv-seg [data-m]').forEach(b => b.onclick = () => {
      el.querySelectorAll('.gv-seg [data-m]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
      mode = b.dataset.m;
      if (b.dataset.m === '3d') show3d().catch(() => { el.querySelector('.gv-3d').innerHTML = '<div class="gv-load">3D no disponible en este dispositivo</div>'; });
      else { if (three) cancelAnimationFrame(three.raf); cv.hidden = false; el.querySelector('.gv-3d').hidden = true; cancelAnimationFrame(raf); draw(performance.now()); }
    });
    return { destroy() { dead = true; cancelAnimationFrame(raf); if (three) { cancelAnimationFrame(three.raf); three.r.dispose(); } ro.disconnect(); mq.removeEventListener?.('change', onMq); } };
  }
  window.GolfletGreen = { mount, analyse, color: col };
})();
