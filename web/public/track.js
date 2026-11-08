/* Golflet · hole marking: the satellite moves under a fixed cursor. Tee, then flag, then each shot. */
(function () {
  const TILE = (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
  const R = () => window.GolfletRules;
  const hav = (a, b) => {
    if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(a.lng) || !Number.isFinite(b.lat) || !Number.isFinite(b.lng)) return null;
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
    const retro = !!H.retro;
    const S = {
      id: H.id, live: H.live, shots: H.shots || [], holes: H.holes || [], hole: H.live?.current_hole || 1,
      pos: null, acc: null, course: H.course || null, cmap: null, wind: null, strat: null, bag: H.bag || [],
      busy: false, watch: null, panned: false, club: '', penaltyShotId: null, msg: '',
      track: R().trackNew(), cam: { z: 17, cx: 0.5, cy: 0.5, hdg: 0 }, frame: 'overview', axis: null, mapDown: false,
      more: false, history: false, saved: H.shots || [],
      alive: true, done: false, suggestedTee: null, suggestedPin: null,
    };

    const holeRec = () => S.holes.find(h => h.hole === S.hole || h.number === S.hole) || S.holes[S.hole - 1] || {};
    const gpsHole = () => (S.course?.holes || []).find(h => h.number === S.hole || h.hole === S.hole) || null;
    const asLL = p => {
      if (!p || !R()) return null;
      if (Array.isArray(p)) return R().knownPoint(p[0], p[1]);
      return R().knownPoint(p.lat, p.lng);
    };
    const pinCoord = () => {
      const rec = holeRec(), g = rec.green || gpsHole()?.green || {};
      return asLL(rec.day_pin) || asLL(g.center) || asLL(g.front) || asLL(g);
    };
    const verifiedTee = () => asLL(gpsHole()?.tee) || asLL(holeRec().tee);
    const verifiedFlag = () => pinCoord();
    const axis = () => R().holeSpan(verifiedTee(), verifiedFlag());
    const mapOk = () => {
      const tee = verifiedTee(), flag = verifiedFlag();
      if (tee && flag) return !!axis();
      return !!(tee || flag);
    };
    const teeCoord = () => S.track.tee || verifiedTee() || null;
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
      const map = mapBox();
      const W = map?.clientWidth || innerWidth, Hh = map?.clientHeight || innerHeight;
      const ball = S.track.ball && R().knownPoint(S.track.ball.lat, S.track.ball.lng);
      const frame = R().frameHole(verifiedTee(), verifiedFlag(), S.frame || 'overview', { width: W, height: Hh }, ball);
      S.axis = frame;
      if (!frame) return false;
      S.cam = { z: frame.z, cx: frame.cx, cy: frame.cy, hdg: frame.bearing || 0 };
      return true;
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
      const z = Math.max(0, Math.min(R().IMAGERY_ZOOM_MAX, Math.floor(S.cam.z)));
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
      const played = [];
      let seq = 0;
      for (const m of S.track.marks) {
        if (m.drop) continue;
        const at = R().knownPoint(m.lat, m.lng);
        if (!at) continue;
        seq += 1;
        const n = Number.isInteger(m.n) && m.n > 0 ? m.n : seq;
        played.push({ ...m, at, n });
      }
      const trail = [];
      if (tee && R().knownPoint(tee.lat, tee.lng)) trail.push(tee);
      for (const m of played) trail.push(m.at);
      if (S.track.phase === 'tracking' && !S.done && trail.length) {
        const here = fromCenter();
        const cursor = here && R().knownPoint(here.lat, here.lng);
        if (cursor) trail.push(cursor);
      }
      if (trail.length >= 2) o += `<polyline class="tk-sh" points="${polyAttr(trail, W, H)}"/>`;
      for (const m of played) {
        const s = toScreen(m.at, W, H);
        if (!s) continue;
        o += `<g class="tk-shot-mark" data-n="${m.n}" data-lat="${m.at.lat}" data-lng="${m.at.lng}"><circle class="tk-dot" cx="${s[0]}" cy="${s[1]}" r="11"/><text class="tk-shot-n" x="${s[0]}" y="${s[1]}">${m.n}</text></g>`;
      }
      return o;
    };

    const armRetro = () => {
      const tee = asLL(gpsHole()?.tee) || asLL(holeRec().tee);
      const pin = pinCoord();
      S.suggestedTee = tee;
      S.suggestedPin = pin;
      const saved = (S.saved || []).filter(s => Number(s.hole) === Number(S.hole));
      const placed = [];
      saved.forEach((s, i) => {
        const end = R().knownPoint(s.end_lat, s.end_lng);
        if (end) placed.push({ ...s, end, n: i + 1 });
      });
      if (!saved.length) {
        S.done = false;
        S.track = R().trackNew();
        return;
      }
      const last = placed[placed.length - 1];
      S.done = saved.some(s => s.result === 'holed');
      S.track = {
        phase: 'tracking',
        tee: tee ? { ...tee } : null,
        flag: pin ? { ...pin } : null,
        ball: last ? { ...last.end } : (tee ? { ...tee } : null),
        marks: placed.map(s => ({
          id: s.id || s.n, n: s.n, lat: s.end.lat, lng: s.end.lng, club: s.club || null,
          countsStroke: s.result !== 'penalty', holed: s.result === 'holed',
          penalty: s.result === 'penalty' || Number(s.penalty_strokes) > 0, drop: false,
        })),
        nextID: placed.length + 1,
      };
    };
    const skipPrompt = () => {
      if (!S.alive) return;
      if (S.track.phase === 'confirmTee') {
        const tee = S.suggestedTee;
        S.track = { ...S.track, tee: tee ? { ...tee } : null, ball: tee ? { ...tee } : null, phase: 'confirmFlag' };
        S.frame = 'flag';
      } else if (S.track.phase === 'confirmFlag') {
        const pin = S.suggestedPin;
        const ball = S.track.ball || S.track.tee || S.suggestedTee;
        S.track = { ...S.track, flag: pin ? { ...pin } : S.track.flag, ball: ball ? { ...ball } : null, phase: 'tracking' };
        S.frame = 'play';
      }
      S.panned = false;
      fitCam();
      render();
    };
    const cursorRead = here => {
      const phase = S.track.phase;
      const cup = cupLL();
      const meters = here && cup ? hav(here, cup) : null;
      const feet = meters == null ? null : R().puttFeet(meters);
      const cupOn = meters != null && R().onCup(meters);
      const ball = S.track.ball || S.track.tee;
      const flown = here && ball ? yd(hav(ball, here)) : null;
      if (retro && phase === 'confirmTee') return S.frame === 'tee' ? `<b>Confirmá la salida</b>` : '';
      if (retro && phase === 'confirmFlag') {
        const fromT = S.track.tee || S.suggestedTee;
        const fromTee = here && fromT ? yd(hav(fromT, here)) : null;
        return `<b>Marcá el hoyo${fromTee != null ? ` · ${fromTee} yd` : ''}</b>`;
      }
      if (retro && phase === 'tracking') {
        if (S.done || cupOn) return `<b>En el hoyo</b><small>${S.done ? 'Siguiente hoyo' : 'ENTER confirma el hoyo'}</small>`;
        if (feet != null) return `<b class="num">${feet} ft</b><small>al hoyo</small><small>Arrastrá hasta donde terminó el golpe</small>`;
        return `<b class="num">${flown ?? '—'} yd</b><small>Arrastrá hasta donde terminó el golpe</small>${meters == null ? '' : `<small>${yd(meters)} yd al hoyo</small>`}`;
      }
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
      const clubOptions = clubs.map(c => `<option value="${esc(c)}" ${S.club === c ? 'selected' : ''}>${esc(clubLabel(c))}</option>`).join('');
      const hs = retro ? null : S.strat?.holes?.find(x => x.hole === S.hole);
      const here = fromCenter();
      const name = esc(S.live?.course || S.live?.vm_course || S.course?.course || 'Golflet');
      if (retro && !mapOk()) {
        const both = verifiedTee() && verifiedFlag();
        el.innerHTML = `<div class="tk" id="play-track">
          <div class="tk-top"><button type="button" class="tk-ib" id="rc-close" aria-label="Volver a la tarjeta">✕</button><b class="tk-cn">${name}</b></div>
          <p class="tk-empty" id="rc-nogeo">${both ? 'La salida y la bandera de este hoyo no cierran. No invento el rumbo.' : 'Este hoyo no tiene geometría verificada. No marco un punto inventado.'}</p>
          <div class="tk-dock"><div class="tk-nav">
            <button type="button" id="tkprev" ${S.hole <= 1 ? 'disabled' : ''} aria-label="Hoyo anterior">‹</button>
            <div class="tk-hn"><b>Hoyo ${S.hole}</b><span>Sin mapa verificado</span></div>
            <button type="button" id="tknext" ${S.hole >= 18 ? 'disabled' : ''} aria-label="Hoyo siguiente">›</button>
          </div></div></div>`;
        const close = el.querySelector('#rc-close');
        if (close) close.onclick = () => { if (H.back) location.hash = H.back; };
        const prev = el.querySelector('#tkprev'), next = el.querySelector('#tknext');
        if (prev) prev.onclick = () => goHole(S.hole - 1);
        if (next) next.onclick = () => goHole(S.hole + 1);
        return;
      }
      const ydOf = m => {
        if (m == null) return '';
        if (typeof m === 'string' && m.trim() === '') return '';
        const n = typeof m === 'number' ? m : Number(typeof m === 'string' ? m.trim() : NaN);
        return Number.isFinite(n) && n >= 0 ? `${Math.round(n / 0.9144)} yd` : '';
      };
      const savedRows = (S.saved || []).filter(s => Number(s.hole) === Number(S.hole));
      let prevKnown = R().knownPoint(S.track.tee?.lat, S.track.tee?.lng);
      const savedRail = savedRows.map((s, i) => {
        const end = R().knownPoint(s.end_lat, s.end_lng);
        let yards = ydOf(s.distance_m);
        if (!yards && end && prevKnown) {
          const meters = hav(prevKnown, end);
          if (meters != null) yards = `${yd(meters)} yd`;
        }
        if (end) prevKnown = end;
        return { id: s.id, club: clubLabel(s.club) || s.club, yards, unknown: !end && !yards, n: i + 1 };
      });
      const railSource = savedRail.length ? savedRail : S.track.marks.map((m, i) => {
        const prev = i ? { lat: S.track.marks[i - 1].lat, lng: S.track.marks[i - 1].lng } : S.track.tee;
        const meters = prev ? hav(prev, { lat: m.lat, lng: m.lng }) : null;
        return { id: m.id, club: clubLabel(m.club) || m.club, yards: meters == null ? '' : `${yd(meters)} yd`, unknown: false, n: i + 1 };
      });
      const rail = retro && railSource.length ? `<div class="tk-shots-rail" id="rc-shots" aria-label="Golpes">${railSource.map((s, i) => `<button type="button" class="tk-shot" id="play-shot-${i}">${s.n}. ${esc(s.club || '—')}${s.yards ? ` · ${esc(s.yards)}` : s.unknown ? ' · Sin ubicación' : ''}</button>`).join('')}</div>` : (!retro ? `<div class="tk-shots-rail" aria-label="Golpes">${marks.map((m, i) => `<span id="play-shot-${i}">${m.drop ? 'Drop' : m.penalty ? 'P' : m.holed ? 'Hoyo' : (m.club ? esc(clubLabel(m.club)) : (i + 1))}</span>`).join('')}</div>` : '');
      const setup = retro && (phase === 'confirmTee' || phase === 'confirmFlag');
      const marking = retro && phase === 'tracking' && !S.done && phase !== 'relief';
      const cardYd = rec.yards || (gpsHole()?.yards && Object.values(gpsHole().yards).filter(n => +n > 0).sort((a, b) => b - a)[0]);
      const holeBits = [par ? `Par ${par}` : '', cardYd ? `${cardYd} yd` : '', verifiedFlag() && !verifiedTee() ? 'Sin salida verificada' : ''].filter(Boolean);
      const holeChip = retro ? `<div class="tk-hole" id="tk-hole"><b>Hoyo ${S.hole}</b>${holeBits.length ? `<span>${esc(holeBits.join(' · '))}</span>` : ''}</div>` : '';
      const read = cursorRead(here);
      el.innerHTML = `<div class="tk" id="play-track">
        <div class="tk-map" id="tkmap"></div>
        <div class="tk-maperr" id="tk-maperr" hidden><b>El mapa no cargó.</b><button type="button" id="tk-retry">Reintentar</button></div>
        <div class="tk-ret on ${pen ? 'pen' : ''}" id="play-reticle" aria-hidden="true"><i></i></div>
        ${retro ? `<div class="tk-zoom"><button type="button" id="play-zoom-in" aria-label="Acercar">+</button><button type="button" id="play-zoom-out" aria-label="Alejar">−</button></div>` : ''}
        ${rail}
        <div class="tk-top">
          ${retro ? `<button type="button" class="tk-ib" id="rc-close" aria-label="Volver a la tarjeta">✕</button>` : `<a class="tk-ib" href="#/inicio" aria-label="Inicio">⌂</a>`}
          <b class="tk-cn">${name}</b>
        </div>
        ${setup ? holeChip : ''}
        <div class="tk-chips">${retro ? '' : windChip()}</div>
        ${read ? `<div class="tk-ro${setup ? ' tk-setup' : ''}" id="tkro">${read}</div>` : ''}
        ${hs ? `<a class="tk-strat" id="strategy-compact" href="#/estrategia/${encodeURIComponent(S.strat.course_key || S.course?.course_key || '')}">${esc(hs.plan_title || 'Plan del hoyo')}</a>` : ''}
        <div class="tk-dock">
          ${setup ? '' : `<div class="tk-nav">
            <button type="button" id="tkprev" ${S.hole <= 1 ? 'disabled' : ''} aria-label="Hoyo anterior">‹</button>
            <div class="tk-hn"><b>Hoyo ${S.hole}</b><span>${retro ? `Par ${par || '—'}${yards ? ` · ${yards} yd` : ''}${hcp ? ` · Hcp ${hcp}` : ''}` : `Par ${par || '—'} · ${yards || '—'} yd${hcp ? ` · Hcp ${hcp}` : ''}`}</span></div>
            <button type="button" id="tknext" ${S.hole >= 18 ? 'disabled' : ''} aria-label="Hoyo siguiente">›</button>
          </div>`}
          ${S.msg ? `<p class="tk-msg">${esc(S.msg)}</p>` : ''}
          <div class="tk-acts">
            ${setup ? `<button type="button" class="tk-cancel" id="play-cancel">Cancelar</button><button type="button" class="tk-enter" id="play-set">SET</button>` : ''}
            ${retro && S.done ? `<button type="button" class="tk-next" id="play-next">Siguiente hoyo</button>` : ''}
            ${marking && S.track.marks.length ? `<button type="button" class="tk-ghost tk-undo" id="play-undo" aria-label="Deshacer">↩</button>` : ''}
            ${(marking || (!retro && phase === 'tracking')) ? `<label class="tk-club">Palo<select id="play-club" aria-label="Palo"><option value="">Después</option>${clubOptions}</select></label>` : ''}
            ${(marking || (!retro && phase === 'tracking')) ? `<button type="button" class="tk-ghost" id="play-penalty" aria-label="Penalidad">P</button>` : ''}
            ${!retro && phase === 'relief' ? `<button type="button" class="tk-ghost" id="play-reload">Otra vez</button><button type="button" class="tk-ghost" id="play-drop">Drop</button>` : ''}
            ${!setup && (phase === 'penaltyWhere' || phase === 'relief' || phase === 'drop') ? `<button type="button" class="tk-ghost" id="play-cancel">Cancelar</button>` : ''}
            ${!retro && setPhase ? `<button type="button" class="tk-enter" id="play-set">SET</button>` : ''}
            ${!S.done && !setPhase && phase !== 'relief' ? `<button type="button" class="tk-enter" id="play-hit" ${S.live?.ended_at ? 'disabled' : ''}>ENTER</button>` : ''}
            ${retro && (phase === 'relief') ? `<button type="button" class="tk-ghost" id="play-reload">Otra vez</button><button type="button" class="tk-ghost" id="play-drop">Drop</button>` : ''}
          </div>
        </div>
      </div>`;
      paintMap();
      wire();
    };

    const paintMap = () => {
      const map = mapBox(); if (!map) return;
      const W = map.clientWidth || innerWidth, Hh = map.clientHeight || innerHeight;
      const tileZ = Math.max(0, Math.min(R().IMAGERY_ZOOM_MAX, Math.floor(S.cam.z)));
      const scale = 2 ** (S.cam.z - tileZ);
      map.innerHTML = `<div class="tk-tiles" style="transform:translate(${W / 2}px,${Hh * 0.42}px) scale(${scale}) rotate(${-S.cam.hdg}deg);transform-origin:0 0">${tilesHTML()}</div><svg class="tk-svg" viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none">${overlaySVG(W, Hh)}</svg>`;
      map.dataset.cx = String(S.cam.cx);
      map.dataset.cy = String(S.cam.cy);
      map.dataset.z = String(S.cam.z);
      map.dataset.tileZ = String(tileZ);
      map.dataset.frame = S.axis?.mode || '';
      map.dataset.bearing = S.axis?.bearing == null ? '' : String(S.axis.bearing);
      map.dataset.aimLat = S.axis ? String(S.axis.aimLat) : '';
      map.dataset.aimLng = S.axis ? String(S.axis.aimLng) : '';
      map.dataset.hole = String(S.hole);
      map.dataset.ballLat = S.track.ball && Number.isFinite(S.track.ball.lat) ? String(S.track.ball.lat) : '';
      map.dataset.ballLng = S.track.ball && Number.isFinite(S.track.ball.lng) ? String(S.track.ball.lng) : '';
      const imgs = [...map.querySelectorAll('.tk-tile')];
      let left = imgs.length, failed = 0;
      const finish = ok => {
        left -= 1; if (!ok) failed += 1;
        if (left > 0) return;
        S.mapDown = failed === imgs.length && imgs.length > 0;
        const ban = el.querySelector('#tk-maperr');
        if (ban) ban.hidden = !S.mapDown;
        for (const id of ['play-set', 'play-hit']) { const b = el.querySelector('#' + id); if (b) b.disabled = !!S.mapDown; }
      };
      imgs.forEach(img => {
        if (img.complete) finish(img.naturalWidth > 0);
        else { img.onload = () => finish(true); img.onerror = () => finish(false); }
      });
    };
    const paintRead = () => {
      const ro = el.querySelector('#tkro'); if (ro) ro.innerHTML = cursorRead(fromCenter());
    };

    const postShot = async (land, result, from) => {
      if (retro && typeof H.onSave === 'function') {
        const shots = await H.onSave({
          hole: S.hole,
          from: from || S.track.ball || S.track.tee,
          land,
          result: result || null,
          club: result === 'penalty' ? '' : (S.club || ''),
          penalty: result === 'penalty',
        });
        if (!S.alive || shots == null) return false;
        if (Array.isArray(shots)) S.saved = shots;
        const rows = (Array.isArray(shots) ? shots : []).filter(s => Number(s.hole) === Number(S.hole));
        return rows[rows.length - 1]?.id || null;
      }
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
      if (!S.alive || S.busy || S.live?.ended_at || S.done) return;
      const here = fromCenter();
      if (!here || !Number.isFinite(here.lat)) { S.msg = 'No hay un punto para marcar.'; render(); return; }
      const phase = S.track.phase;
      if (retro && S.frame !== 'tee' && phase === 'confirmTee') {
        S.frame = 'tee';
        S.panned = false;
        S.msg = '';
        fitCam();
        render();
        return;
      }
      if (phase === 'confirmTee' || phase === 'confirmFlag' || phase === 'drop') {
        if (phase === 'confirmTee') S.frame = 'flag';
        if (phase === 'confirmFlag') S.frame = 'play';
        S.panned = false;
        S.track = R().trackSet(S.track, here);
        fitCam();
        S.msg = '';
        render();
        return;
      }
      const cup = cupLL();
      const meters = cup ? hav(here, cup) : null;
      const cupOn = meters != null && R().onCup(meters);
      const from = S.track.ball || S.track.tee;
      const out = R().trackEnter(S.track, here, S.club || null, phase === 'tracking' && cupOn);
      if (!out.recorded) return;
      S.busy = true;
      try {
        const id = await postShot(out.holed && S.track.flag ? S.track.flag : here, out.holed ? 'holed' : (phase === 'penaltyWhere' ? 'penalty' : null), from);
        if (!S.alive || id === false) return;
        S.track = {
          ...out.state,
          marks: out.state.marks.map((m, i, arr) => {
            if (m.drop || (Number.isInteger(m.n) && m.n > 0)) return m;
            const prior = arr.slice(0, i).reduce((max, x) => Math.max(max, Number(x.n) || 0), 0);
            return { ...m, n: prior + 1 };
          }),
        };
        if (out.holed) S.done = true;
        if (phase === 'penaltyWhere') S.penaltyShotId = id;
        S.msg = out.holed ? 'En el hoyo.' : '';
      } catch (e) { if (!S.alive) return; S.msg = e.message || 'No se pudo marcar.'; }
      if (!S.alive) return;
      S.busy = false;
      render();
    };

    const goHole = async n => {
      if (n < 1 || n > 18 || S.busy) return;
      if (retro) {
        if (!S.alive) return;
        S.hole = n; S.panned = false; S.msg = ''; S.penaltyShotId = null; S.history = false; S.done = false;
        armRetro();
        S.frame = S.track.phase === 'tracking' ? 'play' : 'tee';
        fitCam();
        const hash = location.hash || '';
        const cut = hash.indexOf('?');
        const params = new URLSearchParams(cut >= 0 ? hash.slice(cut + 1) : '');
        params.set('hole', String(n));
        const next = `${cut >= 0 ? hash.slice(0, cut) : hash}?${params.toString()}`;
        if (next !== hash) history.replaceState(null, '', next);
        render(); return;
      }
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
      if (retro) {
        S.track = R().trackCancel(S.track);
        if ((phase === 'relief' || phase === 'drop') && S.penaltyShotId && typeof H.onUndo === 'function') {
          try {
            const shots = await H.onUndo(S.penaltyShotId);
            if (!S.alive || shots == null) return;
            if (Array.isArray(shots)) S.saved = shots;
          } catch (e) { if (!S.alive) return; S.msg = e.message || 'No se pudo deshacer la penalidad.'; }
        }
        if (!S.alive) return;
        S.penaltyShotId = null;
        render();
        return;
      }
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

    const undoLast = async () => {
      if (!S.alive || !S.track.marks.length) return;
      const marks = S.track.marks.slice(0, -1);
      const prev = marks[marks.length - 1];
      const ball = prev ? { lat: prev.lat, lng: prev.lng } : (S.track.tee || S.suggestedTee);
      S.track = { ...S.track, marks, ball: ball ? { ...ball } : null, phase: 'tracking' };
      S.done = marks.some(m => m.holed);
      const savedId = (S.saved || []).filter(s => Number(s.hole) === Number(S.hole)).slice(-1)[0]?.id;
      if (!savedId || typeof H.onUndo !== 'function') { render(); return; }
      try {
        const shots = await H.onUndo(savedId);
        if (!S.alive || shots == null) return;
        if (Array.isArray(shots)) S.saved = shots;
      } catch (e) { if (!S.alive) return; S.msg = e.message || 'No se pudo deshacer el golpe.'; }
      if (!S.alive) return;
      render();
    };

    const wire = () => {
      const map = mapBox();
      const club = el.querySelector('#play-club');
      if (club) club.onchange = () => { S.club = club.value; };
      const prev = el.querySelector('#tkprev'); if (prev) prev.onclick = () => goHole(S.hole - 1);
      const next = el.querySelector('#tknext'); if (next) next.onclick = () => goHole(S.hole + 1);
      const set = el.querySelector('#play-set'); if (set) set.onclick = () => commit();
      const hit = el.querySelector('#play-hit'); if (hit) hit.onclick = () => commit();
      const pen = el.querySelector('#play-penalty'); if (pen) pen.onclick = () => { S.track = R().trackPenalty(S.track); render(); };
      const rel = el.querySelector('#play-reload'); if (rel) rel.onclick = () => { S.track = R().trackReload(S.track); S.msg = ''; render(); };
      const drop = el.querySelector('#play-drop'); if (drop) drop.onclick = () => { S.track = R().trackDrop(S.track); render(); };
      const cancel = el.querySelector('#play-cancel'); if (cancel) cancel.onclick = () => { if (retro && (S.track.phase === 'confirmTee' || S.track.phase === 'confirmFlag')) skipPrompt(); else cancelRelief(); };
      const undo = el.querySelector('#play-undo'); if (undo) undo.onclick = () => undoLast();
      const nextHole = el.querySelector('#play-next'); if (nextHole) nextHole.onclick = () => goHole(Math.min(18, S.hole + 1));
      const close = el.querySelector('#rc-close'); if (close) close.onclick = () => { if (H.back) location.hash = H.back; };
      const retry = el.querySelector('#tk-retry'); if (retry) retry.onclick = () => { S.mapDown = false; paintMap(); };
      const more = el.querySelector('#play-more'); if (more) more.onclick = () => { S.more = !S.more; render(); };
      const hist = el.querySelector('#play-history'); if (hist) hist.onclick = () => { S.history = !S.history; render(); };
      const zoomBy = d => { S.cam.z = Math.max(15, Math.min(R().IMAGERY_ZOOM_MAX + 0.8, S.cam.z + d)); paintMap(); paintRead(); };
      const zin = el.querySelector('#play-zoom-in'); if (zin) zin.onclick = () => zoomBy(0.4);
      const zout = el.querySelector('#play-zoom-out'); if (zout) zout.onclick = () => zoomBy(-0.4);
      el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
        const id = b.getAttribute('data-del');
        if (!id || typeof H.onUndo !== 'function') return;
        H.onUndo(id).then(shots => { if (!S.alive || shots == null) return; if (Array.isArray(shots)) S.saved = shots; S.msg = ''; render(); }).catch(e => { if (!S.alive) return; S.msg = e.message || 'No se pudo borrar el golpe.'; render(); });
      });
      if (!map) return;
      let drag = null, last = null;
      const pts = new Map();
      map.onpointerdown = e => {
        if (e.button) return;
        if (retro) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        drag = retro && pts.size >= 2 ? 'pinch' : 'pan';
        last = { x: e.clientX, y: e.clientY };
        map.setPointerCapture(e.pointerId);
      };
      map.onpointermove = e => {
        if (!drag) return;
        if (retro && drag === 'pinch') {
          const prev = pts.get(e.pointerId);
          const other = [...pts.entries()].find(([id]) => id !== e.pointerId);
          if (!prev || !other) return;
          const d0 = Math.hypot(prev.x - other[1].x, prev.y - other[1].y);
          pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const now = pts.get(e.pointerId);
          const d1 = Math.hypot(now.x - other[1].x, now.y - other[1].y);
          if (d0 > 8 && d1 > 0) zoomBy(Math.log2(d1 / d0));
          return;
        }
        const dx = e.clientX - last.x, dy = e.clientY - last.y; last = { x: e.clientX, y: e.clientY };
        const rad = S.cam.hdg * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
        const px = -dx * c + dy * s, py = -dx * s - dy * c;
        const n = 2 ** S.cam.z;
        S.cam.cx += px / (n * 256); S.cam.cy += py / (n * 256);
        S.panned = true;
        if (retro) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        paintMap(); paintRead();
      };
      map.onpointerup = map.onpointercancel = e => {
        if (retro && e && e.pointerId != null) pts.delete(e.pointerId);
        if (retro && pts.size >= 2) drag = 'pinch';
        else if (retro && pts.size === 1) { drag = 'pan'; const only = [...pts.values()][0]; last = only ? { x: only.x, y: only.y } : last; }
        else { drag = null; last = null; }
      };
      if (retro) map.onwheel = e => { e.preventDefault(); zoomBy(e.deltaY > 0 ? -0.35 : 0.35); };
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
      if (!S.alive) return;
      if (!S.panned) fitCam();
      render();
    };

    if (retro) { armRetro(); S.frame = S.track.phase === 'tracking' ? 'play' : 'overview'; document.documentElement.classList.add('rc-map'); }
    fitCam(); render();
    if (!retro) { watch(); loadExtras(); }
    const onResize = () => paintMap();
    addEventListener('resize', onResize);
    INST = {
      destroy() {
        removeEventListener('resize', onResize);
        S.alive = false;
        if (S.watch != null && navigator.geolocation) navigator.geolocation.clearWatch(S.watch);
        S.watch = null;
        if (retro) document.documentElement.classList.remove('rc-map');
      }
    };
  }

  window.GolfletTrack = { mount, destroy() { INST?.destroy(); INST = null; } };
})();
