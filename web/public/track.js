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
      track: R().trackNew(), cam: { z: 17, cx: 0.5, cy: 0.5, hdg: 0 }, frame: 'overview', axis: null, mapReady: false, mapGen: 0, tileCache: new Map(), tileFlight: new Map(),
      more: false, history: false, saved: H.shots || [],
      alive: true, done: false, suggestedTee: null, suggestedPin: null, flagKind: 'none', adjusted: false, clubChosen: false, cmapTried: false,
      playerLie: '', lieBall: null, holeIntent: false, clubAuto: '', clubBefore: '', puttDraft: '', moving: false,
    };

    const holeRec = () => S.holes.find(h => h.hole === S.hole || h.number === S.hole) || S.holes[S.hole - 1] || {};
    const gpsHole = () => (S.course?.holes || []).find(h => h.number === S.hole || h.hole === S.hole) || null;
    const asLL = p => {
      if (!p || !R()) return null;
      if (Array.isArray(p)) return R().knownPoint(p[0], p[1]);
      return R().knownPoint(p.lat, p.lng);
    };
    const flagRead = () => {
      const rec = holeRec(), g = rec.green || gpsHole()?.green || {};
      const pin = asLL(rec.day_pin);
      if (pin) return { point: pin, kind: 'pin' };
      const center = asLL(g.center) || asLL(g.front);
      return { point: center, kind: center ? 'green' : 'none' };
    };
    const pinCoord = () => flagRead().point;
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
    const hasGreenPoly = () => {
      const h = cmapHole();
      return !!((h?.green?.polygon || []).length);
    };
    const ballLL = () => {
      const b = S.track.ball || S.track.tee;
      return b && R().knownPoint(b.lat, b.lng);
    };
    const sameSpot = (a, b) => !!(a && b && hav(a, b) != null && hav(a, b) < 3);
    const originOnGreen = () => {
      const ball = ballLL();
      if (!ball) return false;
      if (lieAt(ball) === 'green') return true;
      return S.playerLie === 'green' && sameSpot(S.lieBall, ball);
    };
    const putting = () => S.track.phase === 'tracking' && !S.done && originOnGreen();
    const putterChoice = () => {
      const bag = R().bagClubs ? R().bagClubs(S.bag) : [];
      const hit = bag.find(c => R().isPutterClub && R().isPutterClub(c.id, c.label));
      return hit?.id || 'Pt';
    };
    const syncClubToOrigin = () => {
      if (S.clubAuto === 'chosen') return;
      if (originOnGreen()) {
        if (!R().isPutterClub || !R().isPutterClub(S.club, clubLabel(S.club))) {
          if (S.club && !(R().isPutterClub && R().isPutterClub(S.club, clubLabel(S.club)))) S.clubBefore = S.club;
          S.club = putterChoice();
          S.clubAuto = 'putt';
          S.clubChosen = true;
        }
      } else if (S.clubAuto === 'putt') {
        S.club = S.clubBefore && !(R().isPutterClub && R().isPutterClub(S.clubBefore, clubLabel(S.clubBefore))) ? S.clubBefore : '';
        S.clubChosen = !!S.club;
        S.clubAuto = '';
      }
    };
    const fmtM = n => `${(Math.round(Number(n) * 10) / 10).toFixed(1).replace('.', ',')}`;
    const greenAxis = () => {
      const g = gpsHole()?.green || holeRec().green || {};
      const pts = [asLL(g.front), asLL(g.center), asLL(g.back)].filter(Boolean);
      if (pts.length < 3) return null;
      const span = hav(pts[0], pts[2]);
      if (span == null || span < 2) return null;
      return pts;
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
    const sha256Hex = async buf => {
      const dig = await crypto.subtle.digest('SHA-256', buf);
      return [...new Uint8Array(dig)].map(b => b.toString(16).padStart(2, '0')).join('');
    };
    let plateSlots = 0;
    const plateWait = [];
    const blankPlate = async buf => {
      const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
      if (bytes.byteLength > 6000) return false;
      if (plateSlots >= 2) await new Promise(r => plateWait.push(r));
      plateSlots += 1;
      try {
        const blob = new Blob([bytes], { type: 'image/jpeg' });
        const bmp = await Promise.race([
          createImageBitmap(blob),
          new Promise((_, reject) => setTimeout(() => reject(new Error('decode')), 1200)),
        ]);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = bmp.width; canvas.height = bmp.height;
          const g = canvas.getContext('2d', { willReadFrequently: true });
          if (!g) return false;
          g.drawImage(bmp, 0, 0);
          const data = g.getImageData(0, 0, bmp.width, bmp.height).data;
          let n = 0, grey = 0, sum = 0;
          for (let i = 0; i < data.length; i += 16) {
            const r = data[i], gc = data[i + 1], b = data[i + 2];
            n += 1; sum += r + gc + b;
            if (Math.max(r, gc, b) - Math.min(r, gc, b) <= 8) grey += 1;
          }
          const mean = n ? sum / (n * 3) : 0;
          return n > 0 && grey / n > 0.97 && mean > 185 && mean < 225;
        } finally { bmp.close(); }
      } finally {
        plateSlots -= 1;
        const next = plateWait.shift();
        if (next) next();
      }
    };
    const kindByHash = new Map();
    const classifyTile = async bytes => {
      let hex = '';
      try { hex = await sha256Hex(bytes.slice().buffer); } catch { hex = ''; }
      if (hex && kindByHash.has(hex)) return kindByHash.get(hex);
      let kind = 'real';
      if (hex && hex === R().ESRI_BLANK_TILE_SHA256) kind = 'placeholder';
      else {
        try { if (await blankPlate(bytes)) kind = 'placeholder'; }
        catch { kind = 'error'; }
      }
      if (hex) kindByHash.set(hex, kind);
      return kind;
    };
    const loadTile = url => {
      const hit = S.tileCache.get(url);
      if (hit) return Promise.resolve(hit);
      const flight = S.tileFlight.get(url);
      if (flight) return flight;
      const job = (async () => {
        try {
          const res = await fetch(url, { mode: 'cors' });
          if (!res.ok) return { kind: 'error', objectUrl: '' };
          const bytes = new Uint8Array(await res.arrayBuffer());
          const kind = await classifyTile(bytes);
          return { kind, objectUrl: URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' })) };
        } catch { return { kind: 'error', objectUrl: '' }; }
      })().then(rec => { S.tileCache.set(url, rec); S.tileFlight.delete(url); return rec; });
      S.tileFlight.set(url, job);
      return job;
    };
    const setMapButtons = on => {
      const allow = !!on && !S.busy && !S.moving;
      for (const id of ['play-set', 'play-hit']) {
        const b = el.querySelector('#' + id);
        if (!b) continue;
        b.disabled = !allow || (id === 'play-hit' && !!S.live?.ended_at);
      }
    };
    const showMapBanner = (on, placeholder) => {
      const ban = el.querySelector('#tk-maperr');
      if (!ban) return;
      ban.hidden = !on;
      const title = ban.querySelector('b');
      if (title) title.textContent = placeholder ? 'Esta vista no tiene imagen de la cancha.' : 'El mapa no cargó.';
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
      if (tee && R().knownPoint(tee.lat, tee.lng)) mark(tee, 'tk-pl');
      if (pin && R().knownPoint(pin.lat, pin.lng)) mark(pin, 'tk-pin');
      const known = [];
      let shotNo = 0;
      for (const m of S.track.marks) {
        const at = R().knownPoint(m.lat, m.lng);
        if (!at) continue;
        const row = { ...m, at };
        if (row.countsStroke) { shotNo += 1; row.n = Number.isInteger(m.n) && m.n > 0 ? m.n : shotNo; }
        known.push(row);
      }
      const line = (pts, cls) => { const p = polyAttr(pts, W, H); if (p && pts.length >= 2) o += `<polyline class="${cls}" points="${p}"/>`; };
      const axis = greenAxis();
      if (axis) line(axis, 'tk-gaxis');
      const played = [];
      if (tee && R().knownPoint(tee.lat, tee.lng)) played.push(tee);
      for (const m of known) if (!m.penalty && !m.drop) played.push(m.at);
      if (played.length >= 2) line(played, 'tk-sh');
      const here = fromCenter();
      const cursor = here && R().knownPoint(here.lat, here.lng);
      const phase = S.track.phase;
      const ball = S.track.ball && R().knownPoint(S.track.ball.lat, S.track.ball.lng);
      if (phase === 'tracking' && !S.done && cursor && ball && hav(ball, cursor) > 0.4) line([ball, cursor], 'tk-live');
      if (ball) {
        const s = toScreen(ball, W, H);
        const n = S.track.marks.filter(m => m.countsStroke).length + 1;
        if (s && phase === 'tracking' && !S.done) o += `<g class="tk-origin" data-n="${n}" data-lat="${ball.lat}" data-lng="${ball.lng}"><circle cx="${s[0]}" cy="${s[1]}" r="11"/><text class="tk-aim-n" x="${s[0]}" y="${s[1] - 18}">${n}</text></g>`;
        else if (s) o += `<g class="tk-origin" data-lat="${ball.lat}" data-lng="${ball.lng}"><circle cx="${s[0]}" cy="${s[1]}" r="8"/></g>`;
      }
      if (phase === 'penaltyWhere' && cursor) {
        const from = S.track.ball && R().knownPoint(S.track.ball.lat, S.track.ball.lng) || (tee && R().knownPoint(tee.lat, tee.lng));
        if (from) line([from, cursor], 'tk-lost-line');
      }
      const lostOf = before => [...known.slice(0, before)].reverse().find(m => m.penalty);
      known.forEach((m, i) => {
        if (!m.drop) return;
        const lost = lostOf(i);
        if (lost) line([lost.at, m.at], 'tk-drop-line');
      });
      if (phase === 'drop' && cursor) {
        const lost = [...known].reverse().find(m => m.penalty);
        if (lost) line([lost.at, cursor], 'tk-drop-line');
      }
      for (const m of known) {
        const s = toScreen(m.at, W, H);
        if (!s) continue;
        if (m.penalty) {
          o += `<g class="tk-lost" data-lat="${m.at.lat}" data-lng="${m.at.lng}"><line x1="${s[0] - 7}" y1="${s[1] - 7}" x2="${s[0] + 7}" y2="${s[1] + 7}"/><line x1="${s[0] + 7}" y1="${s[1] - 7}" x2="${s[0] - 7}" y2="${s[1] + 7}"/></g>`;
        } else if (m.countsStroke) {
          o += `<g class="tk-shot-mark" data-n="${m.n}" data-lat="${m.at.lat}" data-lng="${m.at.lng}"><circle class="tk-dot" cx="${s[0]}" cy="${s[1]}" r="11"/><text class="tk-shot-n" x="${s[0]}" y="${s[1]}">${m.n}</text></g>`;
        }
      }
      return o;
    };

    const freshClub = () => {
      if (S.clubChosen) return;
      const par = holeRec().par || gpsHole()?.par;
      const fromTee = !((S.saved || []).some(s => Number(s.hole) === Number(S.hole)));
      S.club = R().teeClub ? R().teeClub(S.bag, par, '', fromTee) : '';
    };
    const armRetro = () => {
      const tee = asLL(gpsHole()?.tee) || asLL(holeRec().tee);
      const read = flagRead();
      const pin = read.point;
      S.suggestedTee = tee;
      S.suggestedPin = pin;
      S.flagKind = read.kind;
      const saved = (S.saved || []).filter(s => Number(s.hole) === Number(S.hole));
      if (!saved.length) {
        S.done = false;
        if (tee && pin) {
          S.track = { phase: 'tracking', tee: { ...tee }, flag: { ...pin }, ball: { ...tee }, marks: [], nextID: 1 };
          S.frame = 'play';
          freshClub();
        } else if (tee) {
          S.track = { ...R().trackNew(), phase: 'confirmFlag', tee: { ...tee }, ball: { ...tee } };
          S.frame = 'flag';
        } else {
          S.track = R().trackNew();
          S.frame = 'seek';
          S.flagKind = pin ? read.kind : 'none';
        }
        return;
      }
      const marks = [];
      let play = tee ? { ...tee } : null;
      let afterPenalty = false;
      saved.forEach((s, i) => {
        const end = R().knownPoint(s.end_lat, s.end_lng);
        const start = R().knownPoint(s.lat, s.lng);
        const penalty = s.result === 'penalty' || Number(s.penalty_strokes) > 0;
        if (afterPenalty && start && (!play || hav(play, start) > 2)) {
          marks.push({ id: `drop-${s.id || i}`, lat: start.lat, lng: start.lng, club: null, countsStroke: false, holed: false, penalty: false, drop: true });
          play = { ...start };
        }
        afterPenalty = false;
        marks.push({
          id: s.id || i, n: i + 1, lat: end ? end.lat : null, lng: end ? end.lng : null, club: penalty ? null : (s.club || null),
          countsStroke: true, holed: s.result === 'holed', penalty, drop: false,
        });
        if (penalty) afterPenalty = true;
        else if (end) play = { ...end };
      });
      const last = saved[saved.length - 1];
      const openPenalty = (last.result === 'penalty' || Number(last.penalty_strokes) > 0) && last.result !== 'holed';
      S.done = saved.some(s => s.result === 'holed');
      S.track = {
        phase: openPenalty && !S.done ? 'relief' : 'tracking',
        tee: tee ? { ...tee } : null,
        flag: pin ? { ...pin } : null,
        ball: play ? { ...play } : null,
        marks,
        nextID: marks.length + 1,
      };
      const remembered = [...saved].reverse().find(s => s.club && s.result !== 'penalty' && !(Number(s.penalty_strokes) > 0));
      const options = R().bagClubs ? R().bagClubs(S.bag) : [];
      const known = remembered && options.find(c => c.id === String(remembered.club) || c.label === String(remembered.club));
      if (known) { S.club = known.id; S.clubChosen = true; }
      else if (remembered && R().isPutterClub && R().isPutterClub(String(remembered.club), String(remembered.club))) {
        S.club = 'Pt'; S.clubChosen = true; S.clubAuto = 'putt';
      }
      const landed = [...saved].reverse().find(s => s.result !== 'penalty' && !(Number(s.penalty_strokes) > 0));
      if (landed && landed.lie === 'green' && play) { S.playerLie = 'green'; S.lieBall = { ...play }; }
      S.clubAuto = S.clubAuto === 'putt' ? 'putt' : '';
      syncClubToOrigin();
    };
    const playingPoint = marks => {
      for (let i = marks.length - 1; i >= 0; i--) {
        const m = marks[i];
        if (m.drop || (m.countsStroke && !m.penalty)) {
          const at = R().knownPoint(m.lat, m.lng);
          if (at) return at;
        }
      }
      return S.track.tee || S.suggestedTee || null;
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
      if (retro && phase === 'confirmTee') {
        if (S.suggestedTee && S.frame === 'tee') return `<b>Confirmá la salida</b>`;
        return `<b>Sin salida verificada</b><small>Arrastrá hasta el tee</small>`;
      }
      if (retro && phase === 'confirmFlag') {
        const fromT = S.track.tee || S.suggestedTee;
        const fromTee = here && fromT ? yd(hav(fromT, here)) : null;
        const kind = S.flagKind === 'pin' ? '' : '<small>Referencia del green, no un pin medido</small>';
        return S.suggestedPin
          ? `<b>Ajustá la bandera${fromTee != null ? ` · ${fromTee} yd` : ''}</b>${kind}`
          : `<b>Sin bandera verificada</b><small>Arrastrá hasta el hoyo${fromTee != null ? ` · ${fromTee} yd` : ''}</small>`;
      }
      if (retro && phase === 'tracking') {
        if (S.done) return `<b>En el hoyo</b>`;
        if (S.holeIntent) return `<b>En el hoyo</b><small>ENTER confirma</small>`;
        if (putting()) {
          const ball = ballLL();
          const travelM = here && ball ? hav(ball, here) : null;
          const manual = S.puttDraft && R().puttMeters ? R().puttMeters(S.puttDraft) : null;
          const left = meters == null ? '' : `${fmtM(meters)} m a la referencia`;
          if (manual != null) {
            const map = travelM == null ? '' : `<small class="num">mapa ${fmtM(travelM)} m</small>`;
            return `<b class="num">${fmtM(manual)} m</b><small>a mano</small>${map}${left ? `<small class="num">${left}</small>` : ''}`;
          }
          const travel = travelM == null ? '' : `${fmtM(travelM)} m`;
          return `<b class="num">${travel || '—'}</b>${travel ? '<small>recorrido</small>' : ''}${left ? `<small class="num">${left}</small>` : ''}<small>estimada en el mapa</small>`;
        }
        if (S.flagKind === 'pin' && cupOn) return `<b>En el hoyo</b><small>ENTER confirma</small>`;
        const travel = flown == null ? '' : `${flown} yd`;
        const left = yd(meters) == null ? '' : `${yd(meters)} yd`;
        return `<b class="num">${travel || '—'}</b>${travel ? '<small>recorrido</small>' : ''}${left ? `<small class="num">${left} al hoyo</small>` : ''}`;
      }
      if (phase === 'confirmTee' || phase === 'confirmFlag' || phase === 'drop' || phase === 'penaltyWhere' || phase === 'relief') {
        return `<b>${esc(PROMPT[phase])}</b>${meters != null && phase !== 'confirmTee' ? `<small class="num">${(yd(meters) ?? '—')} yd al hoyo</small>` : ''}`;
      }
      if (S.flagKind === 'pin' && cupOn) return `<b>En el hoyo</b><small>ENTER confirma</small>`;
      return `<b class="num">${flown ?? '—'} yd</b><small>${meters == null ? '' : (yd(meters) + ' yd al hoyo')}</small>`;
    };

    const windChip = () => {
      if (!S.wind || S.wind.kmh == null) return '';
      const b = S.track.tee && S.track.flag ? R().bearingDeg(S.track.tee, S.track.flag) : null;
      const play = R().windPlay(S.hole, S.wind.from_deg, b, S.wind.kmh);
      return `<span class="tk-chip">${esc(play.text)}</span>`;
    };

    const render = () => {
      stopCam();
      const rec = holeRec(), par = rec.par || gpsHole()?.par, hcp = rec.hcp || gpsHole()?.hcp;
      const cardYd = R().yardLabel ? R().yardLabel(rec.yards != null ? rec.yards : gpsHole()?.yards) : '';
      const phase = S.track.phase;
      const pen = phase === 'penaltyWhere' || phase === 'relief' || phase === 'drop';
      const setPhase = phase === 'confirmTee' || phase === 'confirmFlag' || phase === 'drop';
      const marks = S.track.marks.length ? S.track.marks : S.shots.filter(s => s.hole === S.hole).map((s, i) => ({ id: s.id || i, club: s.club, countsStroke: s.result !== 'penalty', holed: s.result === 'holed', penalty: s.result === 'penalty' || s.result === 'water', drop: false }));
      const bag = R().bagClubs ? R().bagClubs(S.bag) : [];
      const clubOptions = bag.map(c => `<option value="${esc(c.id)}" ${S.club === c.id ? 'selected' : ''}>${esc(c.label)}</option>`).join('');
      const clubBlank = S.club ? '' : '<option value="">Elegir palo</option>';
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
        const penalty = s.result === 'penalty' || Number(s.penalty_strokes) > 0;
        const putt = (R().isPutterClub && R().isPutterClub(String(s.club || ''), clubLabel(s.club))) || s.lie === 'green' || s.distance_kind === 'manual';
        let yards = '';
        if (putt && s.distance_kind === 'manual' && s.distance_m != null && s.distance_m !== '') yards = `${fmtM(s.distance_m)} m a mano`;
        else if (putt && s.distance_m != null && s.distance_m !== '' && Number(s.distance_m) > 0) yards = `${fmtM(s.distance_m)} m estimada`;
        else if (putt && end && prevKnown && hav(prevKnown, end) != null) yards = `${fmtM(hav(prevKnown, end))} m estimada`;
        else yards = ydOf(s.distance_m);
        if (!yards && !putt && end && prevKnown) {
          const meters = hav(prevKnown, end);
          if (meters != null) yards = `${yd(meters)} yd`;
        }
        if (end && !penalty) prevKnown = end;
        return { id: s.id, club: penalty ? 'Penalidad' : (clubLabel(s.club) || s.club), yards, unknown: !end && !yards, n: i + 1 };
      });
      const railSource = savedRail.length ? savedRail : S.track.marks.filter(m => m.countsStroke).map((m, i) => {
        const prev = playingPoint(S.track.marks.slice(0, S.track.marks.indexOf(m)));
        const meters = prev ? hav(prev, { lat: m.lat, lng: m.lng }) : null;
        return { id: m.id, club: m.penalty ? 'Penalidad' : (clubLabel(m.club) || m.club), yards: meters == null ? '' : `${yd(meters)} yd`, unknown: !R().knownPoint(m.lat, m.lng), n: m.n || i + 1 };
      });
      const rail = retro && railSource.length ? `<div class="tk-shots-rail" id="rc-shots" aria-label="Golpes">${railSource.map((s, i) => `<button type="button" class="tk-shot" id="play-shot-${i}">${s.n}. ${esc(s.club || '—')}${s.yards ? ` · ${esc(s.yards)}` : s.unknown ? ' · Sin ubicación' : ''}</button>`).join('')}</div>` : (!retro ? `<div class="tk-shots-rail" aria-label="Golpes">${marks.map((m, i) => `<span id="play-shot-${i}">${m.drop ? 'Drop' : m.penalty ? 'P' : m.holed ? 'Hoyo' : (m.club ? esc(clubLabel(m.club)) : (i + 1))}</span>`).join('')}</div>` : '');
      const setup = retro && (phase === 'confirmTee' || phase === 'confirmFlag');
      const marking = retro && phase === 'tracking' && !S.done && phase !== 'relief';
      const holeBits = [par ? `Par ${par}` : '', cardYd, verifiedFlag() && !verifiedTee() ? 'Sin salida verificada' : ''].filter(Boolean);
      const holeChip = retro ? `<div class="tk-hole" id="tk-hole"><b>Hoyo ${S.hole}</b>${holeBits.length ? `<span>${esc(holeBits.join(' · '))}</span>` : ''}</div>` : '';
      const read = cursorRead(here);
      const cursorKind = phase === 'penaltyWhere' ? 'penalty' : phase === 'drop' ? 'drop' : phase === 'confirmFlag' ? 'flag' : (phase === 'confirmTee' && S.frame === 'tee') ? 'tee' : 'shot';
      const nextStroke = S.track.marks.filter(m => m.countsStroke).length + 1;
      el.innerHTML = `<div class="tk" id="play-track">
        <div class="tk-map" id="tkmap"></div>
        <div class="tk-maperr" id="tk-maperr" hidden><b>El mapa no cargó.</b><button type="button" id="tk-retry">Reintentar</button></div>
        <div class="tk-ret on ${pen ? 'pen' : ''}" id="play-reticle" data-cursor="${cursorKind}" aria-hidden="true"><i></i>${cursorKind === 'drop' ? `<b>${nextStroke}</b>` : ''}</div>
        ${retro ? `<div class="tk-zoom"><button type="button" id="play-zoom-in" aria-label="Acercar">+</button><button type="button" id="play-zoom-out" aria-label="Alejar">−</button></div>${S.cam.z > R().IMAGERY_ZOOM_MAX + 0.05 ? `<p class="tk-scale">Imagen ampliada. El satélite real llega al zoom 17.</p>` : ''}${greenAxis() ? `<p class="tk-axisnote">Eje verificado del green. No es el contorno ni el pin.</p>` : ''}` : ''}
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
            <div class="tk-hn"><b>Hoyo ${S.hole}</b><span>${`Par ${par || '—'}${cardYd ? ` · ${cardYd}` : ''}${hcp != null && hcp !== '' && Number.isFinite(Number(hcp)) ? ` · Hcp ${hcp}` : ''}`}</span></div>
            <button type="button" id="tknext" ${S.hole >= 18 ? 'disabled' : ''} aria-label="Hoyo siguiente">›</button>
          </div>`}
          ${S.msg ? `<p class="tk-msg">${esc(S.msg)}</p>` : ''}
          <div class="tk-acts">
            ${setup ? `<button type="button" class="tk-cancel" id="play-cancel">Cancelar</button><button type="button" class="tk-enter" id="play-set" disabled>SET</button>` : ''}
            ${retro && S.done ? `<button type="button" class="tk-next" id="play-next">Siguiente hoyo</button>` : ''}
            ${marking && S.track.marks.length ? `<button type="button" class="tk-ghost tk-undo" id="play-undo" aria-label="Deshacer">↩</button>` : ''}
            ${(marking || (!retro && phase === 'tracking')) ? `<label class="tk-club">Palo<select id="play-club" aria-label="Palo">${clubBlank}${putting() && !bag.some(c => c.id === putterChoice()) ? `<option value="${esc(putterChoice())}" ${S.club === putterChoice() ? 'selected' : ''}>Putter</option>` : ''}${clubOptions}</select></label>` : ''}
            ${marking && putting() ? `<label class="tk-putt">A mano (m)<input id="play-putt-m" inputmode="decimal" autocomplete="off" aria-label="Distancia del putt en metros" placeholder="2,4" value="${esc(S.puttDraft)}"></label>` : ''}
            ${marking && !hasGreenPoly() && !originOnGreen() ? `<button type="button" class="tk-ghost" id="play-lie">En el green</button>` : ''}
            ${marking && !S.holeIntent && (originOnGreen() || S.flagKind === 'pin') ? `<button type="button" class="tk-ghost" id="play-hole">Embocar</button>` : ''}
            ${retro && phase === 'tracking' && S.track.flag ? `<button type="button" class="tk-ghost" id="play-flag">Bandera</button>` : ''}
            ${(marking || (!retro && phase === 'tracking')) ? `<button type="button" class="tk-ghost" id="play-penalty" aria-label="Penalidad">P</button>` : ''}
            ${!retro && phase === 'relief' ? `<button type="button" class="tk-ghost" id="play-reload">Otra vez</button><button type="button" class="tk-ghost" id="play-drop">Drop</button>` : ''}
            ${!setup && (phase === 'penaltyWhere' || phase === 'relief' || phase === 'drop') ? `<button type="button" class="tk-ghost" id="play-cancel">Cancelar</button>` : ''}
            ${(retro && phase === 'drop') || (!retro && setPhase) ? `<button type="button" class="tk-enter" id="play-set" disabled>SET</button>` : ''}
            ${!S.done && !setPhase && phase !== 'relief' ? `<button type="button" class="tk-enter" id="play-hit" disabled>ENTER</button>` : ''}
            ${retro && (phase === 'relief') ? `<button type="button" class="tk-ghost" id="play-reload">Otra vez</button><button type="button" class="tk-ghost" id="play-drop">Drop</button>` : ''}
          </div>
        </div>
      </div>`;
      paintMap();
      wire();
    };

    const paintMap = () => {
      const map = mapBox(); if (!map) return;
      const gen = ++S.mapGen;
      S.mapReady = false;
      const W = map.clientWidth || innerWidth, Hh = map.clientHeight || innerHeight;
      const tileZ = Math.max(0, Math.min(R().IMAGERY_ZOOM_MAX, Math.floor(S.cam.z)));
      const scale = 2 ** (S.cam.z - tileZ);
      const n = 2 ** tileZ;
      const cx = S.cam.cx * n, cy = S.cam.cy * n;
      const pad = 4;
      const x0 = Math.floor(cx - pad), x1 = Math.ceil(cx + pad), y0 = Math.floor(cy - pad), y1 = Math.ceil(cy + pad);
      const tiles = [];
      const seen = new Set();
      const addTile = (tx, ty) => {
        const wx = ((tx % n) + n) % n, wy = Math.min(n - 1, Math.max(0, ty));
        const url = TILE(tileZ, wx, wy);
        if (seen.has(url)) return;
        seen.add(url);
        tiles.push({ url, left: (tx - cx) * 256, top: (ty - cy) * 256 });
      };
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) addTile(tx, ty);
      const urlAt = (sx, sy) => {
        const dx = sx - W / 2, dy = sy - Hh * 0.42;
        const c0 = Math.cos(-S.cam.hdg * Math.PI / 180), s0 = Math.sin(-S.cam.hdg * Math.PI / 180);
        const px = dx * c0 + dy * s0, py = -dx * s0 + dy * c0;
        const nVis = 2 ** S.cam.z;
        const mercX = S.cam.cx + px / (nVis * 256), mercY = S.cam.cy + py / (nVis * 256);
        const tx = Math.floor(mercX * n), ty = Math.floor(mercY * n);
        const wx = ((tx % n) + n) % n, wy = Math.min(n - 1, Math.max(0, ty));
        return TILE(tileZ, wx, wy);
      };
      const sampleUrls = [];
      for (let y = 8; y < Hh; y += 64) for (let x = 8; x < W; x += 64) {
        const url = urlAt(Math.min(W - 2, Math.max(1, x)), Math.min(Hh - 2, Math.max(1, y)));
        if (!sampleUrls.includes(url)) sampleUrls.push(url);
      }
      const aim = urlAt(W / 2, Hh * 0.42);
      if (!sampleUrls.includes(aim)) sampleUrls.push(aim);
      for (const url of sampleUrls) if (!seen.has(url)) {
        const m = /\/tile\/(\d+)\/(\d+)\/(\d+)$/.exec(url);
        if (m) addTile(Number(m[3]), Number(m[2]));
      }
      map.innerHTML = `<div class="tk-tiles" style="transform:translate(${W / 2}px,${Hh * 0.42}px) scale(${scale}) rotate(${-S.cam.hdg}deg);transform-origin:0 0">${tiles.map((t, i) => `<img class="tk-tile" data-i="${i}" alt="" decoding="async" style="left:${t.left}px;top:${t.top}px;width:256px;height:256px">`).join('')}</div><svg class="tk-svg" viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none">${overlaySVG(W, Hh)}</svg>`;
      map.dataset.cx = String(S.cam.cx);
      map.dataset.cy = String(S.cam.cy);
      map.dataset.z = String(S.cam.z);
      map.dataset.tileZ = String(tileZ);
      map.dataset.imagery = S.cam.z > R().IMAGERY_ZOOM_MAX + 0.05 ? 'scaled' : 'native';
      map.dataset.flagKind = S.flagKind || '';
      map.dataset.frame = S.axis?.mode || '';
      map.dataset.bearing = S.axis?.bearing == null ? '' : String(S.axis.bearing);
      map.dataset.aimLat = S.axis ? String(S.axis.aimLat) : '';
      map.dataset.aimLng = S.axis ? String(S.axis.aimLng) : '';
      map.dataset.hole = String(S.hole);
      map.dataset.ballLat = S.track.ball && Number.isFinite(S.track.ball.lat) ? String(S.track.ball.lat) : '';
      map.dataset.ballLng = S.track.ball && Number.isFinite(S.track.ball.lng) ? String(S.track.ball.lng) : '';
      const cursor = fromCenter();
      map.dataset.cursorLat = cursor && Number.isFinite(cursor.lat) ? String(cursor.lat) : '';
      map.dataset.cursorLng = cursor && Number.isFinite(cursor.lng) ? String(cursor.lng) : '';
      map.dataset.phase = S.track.phase || '';
      map.dataset.lie = originOnGreen() ? 'green' : (lieAt(ballLL()) || '');
      map.dataset.cursorLie = lieAt(cursor) || '';
      map.dataset.putting = putting() ? '1' : '0';
      map.dataset.moving = S.moving ? '1' : '0';
      map.dataset.holeIntent = S.holeIntent ? '1' : '0';
      map.dataset.cmap = S.cmapTried ? (S.cmap ? '1' : '0') : '';
      map.dataset.map = 'loading';
      setMapButtons(false);
      showMapBanner(false, false);
      const publish = () => {
        if (gen !== S.mapGen) return;
        const kinds = sampleUrls.map(url => S.tileCache.get(url)?.kind || '');
        if (!kinds.length || kinds.some(k => !k)) {
          S.mapReady = false;
          map.dataset.map = 'loading';
          setMapButtons(false);
          showMapBanner(false, false);
          return;
        }
        const ready = kinds.every(k => k === 'real');
        S.mapReady = ready;
        map.dataset.map = ready ? 'ready' : 'blocked';
        setMapButtons(ready);
        showMapBanner(!ready, kinds.some(k => k === 'placeholder'));
      };
      tiles.forEach((t, i) => {
        const img = map.querySelector(`[data-i="${i}"]`);
        loadTile(t.url).then(rec => {
          if (gen !== S.mapGen) return;
          if (img && rec.objectUrl) img.src = rec.objectUrl;
          publish();
        });
      });
      publish();
    };
    const paintRead = () => {
      const ro = el.querySelector('#tkro'); if (ro) ro.innerHTML = cursorRead(fromCenter());
    };

    const clubNow = () => {
      if (putting()) return S.club || putterChoice();
      return S.club || '';
    };
    const postShot = async (land, result, from, club) => {
      if (retro && typeof H.onSave === 'function') {
        const shots = await H.onSave({
          hole: S.hole,
          from: from || S.track.ball || S.track.tee,
          land,
          result: result || null,
          club: result === 'penalty' ? '' : (club || ''),
          penalty: result === 'penalty',
          lie: originOnGreen() ? 'green' : (lieAt(land) || null),
          distance_m: S.puttMeters || null,
          distance_kind: S.puttMeters != null ? 'manual' : null,
        });
        if (!S.alive || shots == null) return false;
        if (Array.isArray(shots)) S.saved = shots;
        const rows = (Array.isArray(shots) ? shots : []).filter(s => Number(s.hole) === Number(S.hole));
        return rows[rows.length - 1]?.id || null;
      }
      const body = { client_id: cid(), hole: S.hole, lat: land.lat, lng: land.lng, accuracy_m: S.acc };
      if (result) body.result = result;
      if (club && result !== 'penalty') body.club = String(club).slice(0, 8);
      const lie = lieAt(land);
      if (lie && ['tee', 'fairway', 'rough', 'bunker', 'green'].includes(lie)) body.lie = lie;
      const r = await api(`/api/live-rounds/${encodeURIComponent(S.id)}/shots`, { method: 'POST', body: JSON.stringify(body) });
      S.shots = r.shots || S.shots;
      const rows = (S.shots || []).filter(s => s.hole === S.hole);
      return rows[rows.length - 1]?.id || null;
    };

    const targetFrame = () => {
      const map = mapBox();
      const W = map?.clientWidth || innerWidth, Hh = map?.clientHeight || innerHeight;
      const ball = S.track.ball && R().knownPoint(S.track.ball.lat, S.track.ball.lng);
      const mode = S.done ? 'overview' : (S.frame || 'overview');
      return R().frameHole(verifiedTee(), verifiedFlag(), mode, { width: W, height: Hh }, ball);
    };
    const lerpH = (a, b, t) => {
      const d = ((b - a + 540) % 360) - 180;
      return (a + d * t + 360) % 360;
    };
    let camToken = 0;
    const stopCam = () => { camToken += 1; S.moving = false; };
    const moveCam = frame => new Promise(resolve => {
      if (!frame) { resolve(); return; }
      const token = ++camToken;
      const from = { z: S.cam.z, cx: S.cam.cx, cy: S.cam.cy, hdg: S.cam.hdg || 0 };
      const to = { z: frame.z, cx: frame.cx, cy: frame.cy, hdg: frame.bearing || 0 };
      S.axis = frame;
      const frames = 6;
      let i = 0;
      const step = () => {
        if (!S.alive || token !== camToken) { if (S.moving && token === camToken) S.moving = false; resolve(); return; }
        i += 1;
        const e = i / frames;
        S.cam = {
          z: from.z + (to.z - from.z) * e,
          cx: from.cx + (to.cx - from.cx) * e,
          cy: from.cy + (to.cy - from.cy) * e,
          hdg: lerpH(from.hdg, to.hdg, e),
        };
        S.moving = i < frames;
        paintMap();
        if (i < frames) setTimeout(step, 70);
        else { S.moving = false; resolve(); }
      };
      step();
    });
    const commit = async () => {
      if (!S.alive || S.busy || S.live?.ended_at || S.done || !S.mapReady) return;
      const here = fromCenter();
      if (!here || !Number.isFinite(here.lat)) { S.msg = 'No hay un punto para marcar.'; render(); return; }
      const phase = S.track.phase;
      if (retro && S.suggestedTee && S.frame !== 'tee' && phase === 'confirmTee') {
        S.frame = 'tee';
        S.panned = false;
        S.adjusted = false;
        S.msg = '';
        fitCam();
        render();
        return;
      }
      if (phase === 'confirmTee' || phase === 'confirmFlag' || phase === 'drop') {
        const placed = R().trackSet(S.track, here);
        if (phase === 'confirmTee' && S.suggestedPin) {
          S.track = { ...placed, flag: { ...S.suggestedPin }, phase: 'tracking' };
          S.frame = 'play';
          if (!S.clubChosen) freshClub();
        } else {
          S.track = placed;
          if (phase === 'confirmTee') S.frame = 'flag';
          if (phase === 'confirmFlag') { S.frame = 'play'; S.flagKind = 'player'; }
        }
        S.panned = false;
        S.adjusted = false;
        fitCam();
        S.msg = '';
        render();
        return;
      }
      if (phase === 'tracking' && !clubNow()) {
        S.msg = 'Elegí un palo.';
        render();
        return;
      }
      const cup = cupLL();
      const meters = cup ? hav(here, cup) : null;
      const exactPin = S.flagKind === 'pin' && meters != null && R().onCup(meters);
      const manual = putting() && S.puttDraft ? (R().puttMeters ? R().puttMeters(S.puttDraft) : null) : null;
      if (putting() && S.puttDraft && manual == null) {
        S.msg = 'El putt va en metros, por ejemplo 2,4.';
        render();
        return;
      }
      S.puttMeters = manual;
      const from = S.track.ball || S.track.tee;
      const club = clubNow();
      const holed = phase === 'tracking' && (S.holeIntent || exactPin);
      const out = R().trackEnter(S.track, here, club || null, holed, exactPin);
      if (!out.recorded) return;
      S.busy = true;
      try {
        const land = exactPin && out.holed && S.track.flag ? S.track.flag : here;
        const id = await postShot(land, out.holed ? 'holed' : (phase === 'penaltyWhere' ? 'penalty' : null), from, club);
        if (!S.alive || id === false) { S.busy = false; return; }
        S.track = {
          ...out.state,
          marks: out.state.marks.map((m, i, arr) => {
            if (m.drop || (Number.isInteger(m.n) && m.n > 0)) return m;
            const prior = arr.slice(0, i).reduce((max, x) => Math.max(max, Number(x.n) || 0), 0);
            return { ...m, n: prior + 1 };
          }),
        };
        if (out.holed) { S.done = true; S.frame = 'overview'; }
        else if (phase === 'tracking') S.frame = 'play';
        if (phase === 'penaltyWhere') S.penaltyShotId = id;
        S.holeIntent = false;
        S.puttDraft = '';
        S.puttMeters = null;
        S.clubAuto = '';
        S.panned = false;
        S.adjusted = false;
        syncClubToOrigin();
        S.msg = out.holed ? 'En el hoyo.' : '';
        const frame = targetFrame();
        S.busy = false;
        render();
        if (frame && phase === 'tracking') await moveCam(frame);
      } catch (e) { if (!S.alive) return; S.msg = e.message || 'No se pudo marcar.'; S.busy = false; render(); }
      if (!S.alive) return;
      S.busy = false;
    };

    const goHole = async n => {
      if (n < 1 || n > 18 || S.busy) return;
      if (retro) {
        if (!S.alive) return;
        S.hole = n; S.panned = false; S.msg = ''; S.penaltyShotId = null; S.history = false; S.done = false;
        S.clubChosen = false;
        S.club = '';
        S.playerLie = ''; S.lieBall = null; S.holeIntent = false; S.puttDraft = ''; S.clubAuto = ''; S.clubBefore = '';
        armRetro();
        S.adjusted = false;
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
      const last = S.track.marks[S.track.marks.length - 1];
      const marks = S.track.marks.slice(0, -1);
      const ball = playingPoint(marks);
      if (last.drop) {
        S.track = { ...S.track, marks, ball: ball ? { ...ball } : null, phase: 'relief' };
        S.done = false;
        render();
        return;
      }
      S.track = { ...S.track, marks, ball: ball ? { ...ball } : null, phase: 'tracking' };
      S.done = marks.some(m => m.holed);
      S.holeIntent = false;
      S.puttDraft = '';
      S.clubAuto = '';
      if (!originOnGreen()) { S.playerLie = ''; S.lieBall = null; }
      syncClubToOrigin();
      S.panned = false;
      S.adjusted = false;
      fitCam();
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
      if (club) club.onchange = () => { S.club = club.value; S.clubChosen = true; S.clubAuto = 'chosen'; };
      const putt = el.querySelector('#play-putt-m');
      if (putt) putt.oninput = () => { S.puttDraft = putt.value; paintRead(); };
      const lieBtn = el.querySelector('#play-lie');
      if (lieBtn) lieBtn.onclick = () => {
        const ball = ballLL();
        if (!ball) return;
        S.playerLie = 'green';
        S.lieBall = { ...ball };
        S.clubAuto = '';
        syncClubToOrigin();
        S.msg = '';
        render();
      };
      const holeBtn = el.querySelector('#play-hole');
      if (holeBtn) holeBtn.onclick = () => { S.holeIntent = true; S.msg = ''; render(); };
      const flagBtn = el.querySelector('#play-flag');
      if (flagBtn) flagBtn.onclick = () => { S.track = { ...S.track, phase: 'confirmFlag' }; S.frame = 'flag'; S.adjusted = false; S.panned = false; fitCam(); render(); };
      const prev = el.querySelector('#tkprev'); if (prev) prev.onclick = () => goHole(S.hole - 1);
      const next = el.querySelector('#tknext'); if (next) next.onclick = () => goHole(S.hole + 1);
      const set = el.querySelector('#play-set'); if (set) set.onclick = () => commit();
      const hit = el.querySelector('#play-hit'); if (hit) hit.onclick = () => commit();
      const pen = el.querySelector('#play-penalty'); if (pen) pen.onclick = () => { S.track = R().trackPenalty(S.track); render(); };
      const rel = el.querySelector('#play-reload'); if (rel) rel.onclick = () => { S.track = R().trackReload(S.track); S.msg = ''; render(); };
      const drop = el.querySelector('#play-drop'); if (drop) drop.onclick = () => { S.track = R().trackDrop(S.track); render(); };
      const cancel = el.querySelector('#play-cancel'); if (cancel) cancel.onclick = () => {
        if (retro && (S.track.phase === 'confirmTee' || S.track.phase === 'confirmFlag')) skipPrompt();
        else if (S.track.phase === 'drop') { S.track = { ...S.track, phase: 'relief' }; render(); }
        else cancelRelief();
      };
      const undo = el.querySelector('#play-undo'); if (undo) undo.onclick = () => undoLast();
      const nextHole = el.querySelector('#play-next'); if (nextHole) nextHole.onclick = () => goHole(Math.min(18, S.hole + 1));
      const close = el.querySelector('#rc-close'); if (close) close.onclick = () => { if (H.back) location.hash = H.back; };
      const retry = el.querySelector('#tk-retry'); if (retry) retry.onclick = () => {
        for (const [url, rec] of S.tileCache) if (!rec || rec.kind !== 'real') S.tileCache.delete(url);
        paintMap();
      };
      const more = el.querySelector('#play-more'); if (more) more.onclick = () => { S.more = !S.more; render(); };
      const hist = el.querySelector('#play-history'); if (hist) hist.onclick = () => { S.history = !S.history; render(); };
      const zoomBy = d => {
        stopCam();
        const cap = Number(R().VISUAL_ZOOM_MAX) || (R().IMAGERY_ZOOM_MAX + 2.15);
        S.cam.z = Math.max(15, Math.min(cap, +(S.cam.z + d).toFixed(3)));
        S.adjusted = true;
        paintMap(); paintRead();
      };
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
        stopCam();
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        drag = pts.size >= 2 ? 'pinch' : 'pan';
        last = { x: e.clientX, y: e.clientY };
        try { map.setPointerCapture(e.pointerId); } catch (err) {}
      };
      map.onpointermove = e => {
        if (!drag) return;
        if (drag === 'pinch') {
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
        S.adjusted = true;
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        paintMap(); paintRead();
      };
      map.onpointerup = map.onpointercancel = e => {
        if (e && e.pointerId != null) pts.delete(e.pointerId);
        if (pts.size >= 2) drag = 'pinch';
        else if (pts.size === 1) { drag = 'pan'; const only = [...pts.values()][0]; last = only ? { x: only.x, y: only.y } : last; }
        else { drag = null; last = null; }
      };
      map.onwheel = e => { e.preventDefault(); zoomBy(e.deltaY > 0 ? -0.35 : 0.35); };
      map.oncontextmenu = e => e.preventDefault();
      el.oncontextmenu = e => {
        const t = e.target;
        if (t && t.closest && t.closest('input, textarea')) return;
        e.preventDefault();
      };
      map.ontouchmove = e => { if (e.cancelable) e.preventDefault(); };
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
      if (!S.panned && !S.adjusted) fitCam();
      render();
    };

    const loadCourseMap = async () => {
      const club = S.course?.club_code || S.live?.club_code;
      const course = S.course?.course || S.live?.course || S.live?.vm_course;
      if (!club || !course || course === 'Golflet') return;
      try { S.cmap = await api(`/api/course-maps/${encodeURIComponent(club)}/${encodeURIComponent(course)}`); }
      catch (e) { S.cmap = null; }
      S.cmapTried = true;
      if (!S.alive || S.busy || S.panned) return;
      if (S.clubAuto !== 'chosen') syncClubToOrigin();
      render();
    };
    if (retro) {
      armRetro();
      if (S.track.phase === 'tracking' || S.track.phase === 'relief') S.frame = 'play';
      else if (S.track.phase === 'confirmFlag') S.frame = 'flag';
      else if (S.suggestedTee) S.frame = 'tee';
      else S.frame = 'seek';
      document.documentElement.classList.add('rc-map');
    }
    fitCam(); render();
    if (retro) loadCourseMap();
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
