/* Golflet · hole marking: the satellite moves under a fixed cursor. Tee, then flag, then each shot. */
(function () {
  const TILE = (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
  const R = () => window.GolfletRules;
  const hav = (a, b) => {
    if (!a || !b) return null;
    const Re = 6371000, t = x => x * Math.PI / 180, dLa = t(b.lat - a.lat), dLo = t(b.lng - a.lng);
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLo / 2) ** 2;
    return 2 * Re * Math.asin(Math.sqrt(h));
  };
  const yd = m => m == null ? null : Math.round(m / 0.9144);
  const bearing = (a, b) => {
    if (!a || !b) return 0;
    const t = x => x * Math.PI / 180, dLo = t(b.lng - a.lng);
    const y = Math.sin(dLo) * Math.cos(t(b.lat));
    const x = Math.cos(t(a.lat)) * Math.sin(t(b.lat)) - Math.sin(t(a.lat)) * Math.cos(t(b.lat)) * Math.cos(dLo);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  };
  const proj = (lat, lng) => {
    const x = (lng + 180) / 360;
    const s = Math.sin(lat * Math.PI / 180);
    const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI));
    return [x, y];
  };
  const unproj = (x, y) => {
    const lng = x * 360 - 180;
    const n = Math.PI - 2 * Math.PI * y;
    const lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return { lat, lng };
  };
  const pip = (pt, ring) => {
    if (!ring || ring.length < 3) return false;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i].lng, yi = ring[i].lat, xj = ring[j].lng, yj = ring[j].lat;
      if (((yi > pt.lat) !== (yj > pt.lat)) && (pt.lng < (xj - xi) * (pt.lat - yi) / ((yj - yi) || 1e-12) + xi)) inside = !inside;
    }
    return inside;
  };
  const CLUBN = { DR: 'Driver', PT: 'Putter', PW: 'PW', GW: 'GW', AW: 'AW', SW: 'SW', LW: 'LW' };
  const clubLabel = c => {
    const s = String(c || '').trim(), u = s.toUpperCase();
    if (!s) return '';
    if (CLUBN[u]) return CLUBN[u];
    let m; if ((m = /^(\d{1,2})W$/.exec(u))) return `Madera ${m[1]}`;
    if ((m = /^(\d)H$/.exec(u))) return `Híbrido ${m[1]}`;
    if ((m = /^(\d)I$/.exec(u))) return `Hierro ${m[1]}`;
    return s;
  };
  const PROMPT = { confirmTee: 'Arrastrá el mapa para confirmar el tee', confirmFlag: 'Arrastrá el mapa para marcar la bandera', tracking: 'Arrastrá el mapa hasta donde terminó el golpe', penaltyWhere: 'Penalidad: ¿adónde fue?', relief: 'Penalidad. Elegí otra vez o drop', drop: 'Arrastrá el mapa hasta el drop' };

  let INST = null;

  function mount(el, opt) {
    if (!el) return;
    if (INST) { INST.destroy(); INST = null; }
    if (!R()) { el.innerHTML = '<p class="msg">No se cargaron las reglas de juego.</p>'; return; }
    const H = opt, esc = H.esc, api = H.api, toast = H.toast, cid = H.cid;
    const S = {
      id: H.id, live: H.live, shots: H.shots || [], holes: H.holes || [], hole: H.live?.current_hole || 1,
      pos: null, acc: null, course: null, cmap: null, wind: null, strat: null, bag: H.bag || [],
      busy: false, watch: null, panned: false, club: '', penaltyShotId: null, msg: '',
      track: R().trackNew(), cam: { z: 17, cx: 0.5, cy: 0.5, hdg: 0 },
    };

    const holeRec = () => S.holes.find(h => h.hole === S.hole || h.number === S.hole) || S.holes[S.hole - 1] || {};
    const gpsHole = () => (S.course?.holes || []).find(h => h.number === S.hole || h.hole === S.hole) || null;
    const asLL = p => {
      if (!p) return null;
      if (Array.isArray(p) && p.length >= 2 && Number.isFinite(+p[0]) && Number.isFinite(+p[1])) return { lat: +p[0], lng: +p[1] };
      if (Number.isFinite(+p.lat) && Number.isFinite(+p.lng)) return { lat: +p.lat, lng: +p.lng };
      return null;
    };
    const pinCoord = () => {
      const rec = holeRec(), g = rec.green || gpsHole()?.green || {};
      return asLL(rec.day_pin) || asLL(g.center) || asLL(g.front);
    };
    const teeCoord = () => S.track.tee || asLL(gpsHole()?.tee) || asLL(holeRec().tee) || pinCoord();
    const cupLL = () => S.track.flag || pinCoord();
    const cmapHole = () => (S.cmap?.holes || []).find(h => h.hole === S.hole) || null;
    const lieAt = pt => {
      const h = cmapHole();
      if (!h || !pt) return null;
      if ((h.green?.polygon || []).length && pip(pt, (h.green.polygon || []).map(asLL).filter(Boolean))) return 'green';
      for (const b of h.bunkers || []) if ((b.polygon || []).length && pip(pt, b.polygon.map(asLL).filter(Boolean))) return 'bunker';
      for (const w of h.water || []) if ((w.polygon || []).length && pip(pt, w.polygon.map(asLL).filter(Boolean))) return 'water';
      for (const f of h.fairways || []) if ((f.polygon || []).length && pip(pt, f.polygon.map(asLL).filter(Boolean))) return 'fairway';
      return null;
    };

    const fitCam = () => {
      const tee = teeCoord(), pin = pinCoord() || tee;
      if (!tee || !pin) return;
      const mid = { lat: (tee.lat + pin.lat) / 2, lng: (tee.lng + pin.lng) / 2 };
      const [cx, cy] = proj(mid.lat, mid.lng);
      const m = hav(tee, pin) || 180;
      const z = Math.max(16, Math.min(19.2, Math.log2(400 / Math.max(m, 80)) + 17.2));
      S.cam = { z, cx, cy, hdg: bearing(tee, pin) };
    };

    const mapBox = () => el.querySelector('#tkmap');
    const fromCenter = () => {
      const map = mapBox();
      const W = map?.clientWidth || innerWidth, H = map?.clientHeight || innerHeight;
      const dx = 0, dy = 0;
      const n = 2 ** S.cam.z;
      return unproj(S.cam.cx + dx / (n * 256), S.cam.cy + dy / (n * 256));
    };
    const toScreen = (ll, W, H) => {
      if (!ll) return null;
      const [x, y] = proj(ll.lat, ll.lng);
      const n = 2 ** S.cam.z;
      const px = (x - S.cam.cx) * n * 256, py = (y - S.cam.cy) * n * 256;
      const rad = -S.cam.hdg * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
      return [W / 2 + px * c - py * s, H * 0.42 + px * s + py * c];
    };
    const tilesHTML = () => {
      const z = Math.round(S.cam.z);
      const n = 2 ** z;
      const cx = S.cam.cx * n, cy = S.cam.cy * n;
      const pad = 4;
      const x0 = Math.floor(cx - pad), x1 = Math.ceil(cx + pad), y0 = Math.floor(cy - pad), y1 = Math.ceil(cy + pad);
      let html = '';
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        const wx = ((tx % n) + n) % n, wy = Math.min(n - 1, Math.max(0, ty));
        html += `<img class="tk-tile" alt="" decoding="async" src="${TILE(z, wx, wy)}" style="left:${(tx - cx) * 256}px;top:${(ty - cy) * 256}px;width:256px;height:256px">`;
      }
      return html;
    };
    const polyAttr = (pts, W, H) => pts.map(p => { const s = toScreen(asLL(p) || p, W, H); return s ? s.map(v => v.toFixed(1)).join(',') : ''; }).filter(Boolean).join(' ');
    const overlaySVG = (W, H) => {
      const h = cmapHole() || {};
      let o = '';
      const stroke = (pts, cls) => { const p = polyAttr(pts, W, H); if (p) o += `<polygon class="${cls}" points="${p}"/>`; };
      for (const f of h.fairways || []) stroke(f.polygon, 'tk-f');
      for (const b of h.bunkers || []) stroke(b.polygon, 'tk-b');
      for (const w of h.water || []) stroke(w.polygon, 'tk-w');
      if (h.green?.polygon) stroke(h.green.polygon, 'tk-g');
      const pin = cupLL(), tee = S.track.tee;
      const mark = (ll, cls) => { const s = toScreen(ll, W, H); if (s) o += `<circle class="${cls}" cx="${s[0]}" cy="${s[1]}" r="7"/>`; };
      if (tee) mark(tee, 'tk-pl');
      if (pin) mark(pin, 'tk-pin');
      const played = S.track.marks.filter(m => !m.penalty).map(m => ({ lat: m.lat, lng: m.lng }));
      if (tee && played.length) o += `<polyline class="tk-sh" points="${polyAttr([tee, ...played], W, H)}"/>`;
      return o;
    };

    const cursorRead = here => {
      const phase = S.track.phase;
      const cup = cupLL();
      const meters = here && cup ? hav(here, cup) : null;
      const feet = meters == null ? null : R().puttFeet(meters);
      const cupOn = meters != null && R().onCup(meters);
      const ball = S.track.ball || S.track.tee;
      const flown = here && ball ? yd(hav(ball, here)) : null;
      if (phase === 'confirmTee' || phase === 'confirmFlag' || phase === 'drop' || phase === 'penaltyWhere' || phase === 'relief') {
        return `<b>${esc(PROMPT[phase])}</b>${meters != null && phase !== 'confirmTee' ? `<small class="num">${feet != null ? feet + ' ft' : (yd(meters) ?? '—') + ' yd'} al hoyo</small>` : ''}`;
      }
      if (cupOn) return `<b>En el hoyo</b><small>ENTER confirma el hoyo</small>`;
      if (feet != null) return `<b class="num">${feet} ft</b><small>al hoyo</small>`;
      return `<b class="num">${flown ?? '—'} yd</b><small>${meters == null ? '' : (yd(meters) + ' yd al hoyo')}</small>`;
    };

    const windChip = () => {
      if (!S.wind || S.wind.kmh == null) return '';
      const b = S.track.tee && S.track.flag ? R().bearingDeg(S.track.tee, S.track.flag) : null;
      const play = R().windPlay(S.hole, S.wind.from_deg, b, S.wind.kmh);
      return `<span class="tk-chip">${esc(play.text)}</span>`;
    };

    const render = () => {
      const rec = holeRec(), par = rec.par || gpsHole()?.par, hcp = rec.hcp || gpsHole()?.hcp;
      const yards = rec.yards || (gpsHole()?.yards && Object.values(gpsHole().yards).filter(n => +n > 0).sort((a, b) => b - a)[0]);
      const phase = S.track.phase;
      const pen = phase === 'penaltyWhere' || phase === 'relief' || phase === 'drop';
      const setPhase = phase === 'confirmTee' || phase === 'confirmFlag' || phase === 'drop';
      const marks = S.track.marks.length ? S.track.marks : S.shots.filter(s => s.hole === S.hole).map((s, i) => ({ id: s.id || i, club: s.club, countsStroke: s.result !== 'penalty', holed: s.result === 'holed', penalty: s.result === 'penalty' || s.result === 'water', drop: false }));
      const clubs = (S.bag || []).map(c => c.code || c.name).filter(Boolean);
      const hs = S.strat?.holes?.find(x => x.hole === S.hole);
      const here = fromCenter();
      el.innerHTML = `<div class="tk" id="play-track">
        <div class="tk-map" id="tkmap"></div>
        <div class="tk-ret on ${pen ? 'pen' : ''}" id="play-reticle" aria-hidden="true"><i></i></div>
        <div class="tk-shots-rail" aria-label="Golpes">${marks.map((m, i) => `<span id="play-shot-${i}">${m.drop ? 'Drop' : m.penalty ? 'P' : m.holed ? 'Hoyo' : (m.club ? esc(clubLabel(m.club)) : (i + 1))}</span>`).join('')}</div>
        <div class="tk-top">
          <a class="tk-ib" href="#/inicio" aria-label="Inicio">⌂</a>
          <b class="tk-cn">${esc(S.live?.course || S.live?.vm_course || S.course?.course || 'Golflet')}</b>
        </div>
        <div class="tk-chips">${windChip()}</div>
        <div class="tk-ro" id="tkro">${cursorRead(here)}</div>
        ${hs ? `<a class="tk-strat" id="strategy-compact" href="#/estrategia/${encodeURIComponent(S.strat.course_key || S.course?.course_key || '')}">${esc(hs.plan_title || 'Plan del hoyo')}</a>` : ''}
        <div class="tk-dock">
          <div class="tk-nav">
            <button type="button" id="tkprev" ${S.hole <= 1 ? 'disabled' : ''} aria-label="Hoyo anterior">‹</button>
            <div class="tk-hn"><b>Hoyo ${S.hole}</b><span>Par ${par || '—'} · ${yards || '—'} yd${hcp ? ` · Hcp ${hcp}` : ''}</span></div>
            <button type="button" id="tknext" ${S.hole >= 18 ? 'disabled' : ''} aria-label="Hoyo siguiente">›</button>
          </div>
          ${S.msg ? `<p class="tk-msg">${esc(S.msg)}</p>` : ''}
          <div class="tk-acts">
            ${phase === 'tracking' ? `<label class="tk-club">Palo<select id="play-club" aria-label="Palo"><option value="">Después</option>${clubs.map(c => `<option value="${esc(c)}" ${S.club === c ? 'selected' : ''}>${esc(clubLabel(c))}</option>`).join('')}</select></label>` : ''}
            ${phase === 'tracking' ? `<button type="button" class="tk-ghost" id="play-penalty" aria-label="Penalidad">P</button>` : ''}
            ${phase === 'relief' ? `<button type="button" class="tk-ghost" id="play-reload">Otra vez</button><button type="button" class="tk-ghost" id="play-drop">Drop</button>` : ''}
            ${phase === 'penaltyWhere' || phase === 'relief' || phase === 'drop' ? `<button type="button" class="tk-ghost" id="play-cancel">Cancelar</button>` : ''}
            ${setPhase ? `<button type="button" class="tk-enter" id="play-set">SET</button>` : phase === 'relief' ? '' : `<button type="button" class="tk-enter" id="play-hit" ${S.live?.ended_at ? 'disabled' : ''}>ENTER</button>`}
          </div>
        </div>
      </div>`;
      paintMap();
      wire();
    };

    const paintMap = () => {
      const map = mapBox(); if (!map) return;
      const W = map.clientWidth || innerWidth, Hh = map.clientHeight || innerHeight;
      const scale = 2 ** (S.cam.z - Math.round(S.cam.z));
      map.innerHTML = `<div class="tk-tiles" style="transform:translate(${W / 2}px,${Hh * 0.42}px) scale(${scale}) rotate(${-S.cam.hdg}deg);transform-origin:0 0">${tilesHTML()}</div><svg class="tk-svg" viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none">${overlaySVG(W, Hh)}</svg>`;
    };
    const paintRead = () => {
      const ro = el.querySelector('#tkro'); if (ro) ro.innerHTML = cursorRead(fromCenter());
    };

    const postShot = async (land, result) => {
      const body = { client_id: cid(), hole: S.hole, lat: land.lat, lng: land.lng, accuracy_m: S.acc };
      if (result) body.result = result;
      if (S.club && result !== 'penalty') body.club = String(S.club).slice(0, 8);
      const lie = lieAt(land);
      if (lie && ['tee', 'fairway', 'rough', 'bunker', 'green'].includes(lie)) body.lie = lie;
      const r = await api(`/api/live-rounds/${encodeURIComponent(S.id)}/shots`, { method: 'POST', body: JSON.stringify(body) });
      S.shots = r.shots || S.shots;
      const rows = (S.shots || []).filter(s => s.hole === S.hole);
      return rows[rows.length - 1]?.id || null;
    };

    const commit = async () => {
      if (S.busy || S.live?.ended_at) return;
      const here = fromCenter();
      if (!here || !Number.isFinite(here.lat)) { S.msg = 'No hay un punto para marcar.'; render(); return; }
      const phase = S.track.phase;
      if (phase === 'confirmTee' || phase === 'confirmFlag' || phase === 'drop') {
        S.track = R().trackSet(S.track, here);
        S.msg = '';
        render();
        return;
      }
      const cup = cupLL();
      const meters = cup ? hav(here, cup) : null;
      const cupOn = meters != null && R().onCup(meters);
      const out = R().trackEnter(S.track, here, S.club || null, phase === 'tracking' && cupOn);
      if (!out.recorded) return;
      S.busy = true;
      try {
        const id = await postShot(out.holed && S.track.flag ? S.track.flag : here, out.holed ? 'holed' : (phase === 'penaltyWhere' ? 'penalty' : null));
        S.track = out.state;
        if (phase === 'penaltyWhere') S.penaltyShotId = id;
        S.msg = out.holed ? 'En el hoyo.' : '';
      } catch (e) { S.msg = e.message || 'No se pudo marcar.'; }
      S.busy = false;
      render();
    };

    const goHole = async n => {
      if (n < 1 || n > 18 || S.busy) return;
      S.busy = true;
      try {
        const r = await api(`/api/live-rounds/${encodeURIComponent(S.id)}`, { method: 'PATCH', body: JSON.stringify({ current_hole: n }) });
        S.live = r.live_round || S.live;
      } catch (e) { /* the local hole still moves */ }
      S.hole = n; S.track = R().trackNew(); S.panned = false; S.msg = ''; S.penaltyShotId = null;
      fitCam(); S.busy = false; render();
    };

    const cancelRelief = async () => {
      const phase = S.track.phase;
      S.track = R().trackCancel(S.track);
      if ((phase === 'relief' || phase === 'drop') && S.penaltyShotId) {
        try {
          const r = await api(`/api/shots/${encodeURIComponent(S.penaltyShotId)}`, { method: 'DELETE' });
          S.shots = r.shots || S.shots.filter(s => s.id !== S.penaltyShotId);
        } catch (e) { S.msg = e.message || 'No se pudo deshacer la penalidad.'; }
        S.penaltyShotId = null;
      }
      render();
    };

    const wire = () => {
      const map = mapBox();
      const club = el.querySelector('#play-club');
      if (club) club.onchange = () => { S.club = club.value; };
      el.querySelector('#tkprev').onclick = () => goHole(S.hole - 1);
      el.querySelector('#tknext').onclick = () => goHole(S.hole + 1);
      const set = el.querySelector('#play-set'); if (set) set.onclick = () => commit();
      const hit = el.querySelector('#play-hit'); if (hit) hit.onclick = () => commit();
      const pen = el.querySelector('#play-penalty'); if (pen) pen.onclick = () => { S.track = R().trackPenalty(S.track); render(); };
      const rel = el.querySelector('#play-reload'); if (rel) rel.onclick = () => { S.track = R().trackReload(S.track); S.msg = ''; render(); };
      const drop = el.querySelector('#play-drop'); if (drop) drop.onclick = () => { S.track = R().trackDrop(S.track); render(); };
      const cancel = el.querySelector('#play-cancel'); if (cancel) cancel.onclick = () => cancelRelief();
      if (!map) return;
      let drag = null, last = null;
      map.onpointerdown = e => {
        if (e.button) return;
        drag = 'pan'; last = { x: e.clientX, y: e.clientY }; map.setPointerCapture(e.pointerId);
      };
      map.onpointermove = e => {
        if (!drag) return;
        const dx = e.clientX - last.x, dy = e.clientY - last.y; last = { x: e.clientX, y: e.clientY };
        const rad = S.cam.hdg * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
        const px = -dx * c + dy * s, py = -dx * s - dy * c;
        const n = 2 ** S.cam.z;
        S.cam.cx += px / (n * 256); S.cam.cy += py / (n * 256);
        S.panned = true;
        paintMap(); paintRead();
      };
      map.onpointerup = map.onpointercancel = () => { drag = null; last = null; };
    };

    const watch = () => {
      if (!navigator.geolocation || S.watch != null) return;
      S.watch = navigator.geolocation.watchPosition(p => {
        S.pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        S.acc = Math.round(p.coords.accuracy || 0);
      }, () => {}, { enableHighAccuracy: true, maximumAge: 4000 });
    };

    const loadExtras = async () => {
      const cid0 = S.live?.course_id;
      try { if (cid0) { const C = await api(`/api/gps/courses/${encodeURIComponent(cid0)}`); S.course = C.course || C; } } catch (e) {}
      try {
        const club = S.course?.club_code || S.live?.club_code, course = S.course?.course || S.live?.course || S.live?.vm_course;
        if (club && course) S.cmap = await api(`/api/course-maps/${encodeURIComponent(club)}/${encodeURIComponent(course)}`);
      } catch (e) {}
      try {
        const q = S.course?.course_id || cid0 ? `course_id=${encodeURIComponent(S.course?.course_id || cid0)}` : '';
        if (q) S.strat = await api('/api/strategy?' + q);
      } catch (e) {}
      try {
        const pin = teeCoord() || S.pos;
        if (pin) S.wind = await api(`/api/weather/now?lat=${pin.lat}&lng=${pin.lng}`);
      } catch (e) {}
      if (!S.panned) fitCam();
      render();
    };

    fitCam(); render(); watch(); loadExtras();
    const onResize = () => paintMap();
    addEventListener('resize', onResize);
    INST = {
      destroy() {
        removeEventListener('resize', onResize);
        if (S.watch != null && navigator.geolocation) navigator.geolocation.clearWatch(S.watch);
        S.watch = null;
      }
    };
  }

  window.GolfletTrack = { mount, destroy() { INST?.destroy(); INST = null; } };
})();
