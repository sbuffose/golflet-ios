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
  const CLUBN = { DR: 'Driver', PT: 'Putter', PW: 'Pitching wedge', GW: 'Gap wedge', AW: 'Approach wedge', SW: 'Sand wedge', LW: 'Lob wedge' };
  const clubLabel = c => {
    const s = String(c || '').trim(), u = s.toUpperCase();
    if (!s) return '';
    if (CLUBN[u]) return CLUBN[u];
    let m; if ((m = /^(\d{1,2})W$/.exec(u))) return `Madera ${m[1]}`;
    if ((m = /^(\d)H$/.exec(u))) return `Híbrido ${m[1]}`;
    if ((m = /^(\d)I$/.exec(u))) return `Hierro ${m[1]}`;
    return s;
  };
  const gridName = c => {
    const label = clubLabel(c);
    if (!label) return '';
    const deg = label.match(/(\d+)\s*°/);
    if (deg) return `${deg[1]}°`;
    if (/^pw$/i.test(String(c || '').trim()) || /^pitching wedge$/i.test(label)) return 'PW';
    return label;
  };
  const clubIsPutt = club => {
    const raw = String(club || '').trim();
    if (!raw) return false;
    if (R().isPutterClub && R().isPutterClub(raw, clubLabel(raw))) return true;
    return /^putter\b/i.test(clubLabel(raw));
  };
  const sameClub = (code, option) => {
    const raw = String(code || '').trim();
    if (!raw || !option) return false;
    const id = String(option.id || '');
    const label = String(option.label || '');
    const named = clubLabel(raw);
    if (raw === id || raw === label || named === id || named === label || clubLabel(id) === named) return true;
    if (R().isDriverClub && R().isDriverClub(raw, named) && R().isDriverClub(id, label)) return true;
    if (R().isPutterClub && R().isPutterClub(raw, named) && R().isPutterClub(id, label)) return true;
    return false;
  };
  const PROMPT = { confirmTee: 'Arrastrá para confirmar la salida', confirmFlag: 'Arrastrá para ubicar el hoyo', tracking: 'Arrastrá hasta donde terminó el tiro', penaltyWhere: 'Penalidad: ¿dónde fue?', relief: 'Penalidad. Elegí otra vez o drop', drop: 'Arrastrá hasta el lugar del drop' };
  const shortClub = label => {
    const t = String(label || '').trim();
    if (!t) return '—';
    if (/putter|^pt$/i.test(t)) return 'Pt';
    const deg = t.match(/(\d+)\s*°/);
    if (deg) return `${deg[1]}°`;
    if (/^d(r|river)\b/i.test(t)) return 'Dr';
    const iron = t.match(/^hierro\s+(\d+)/i);
    if (iron) return `${iron[1]}i`;
    return t.length > 4 ? t.slice(0, 4) : t;
  };

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
      alive: true, done: false, reopen: false, editN: 0, pickClub: false, moveShot: false, editPoint: '', aimLL: null, askDel: false, suggestedTee: null, suggestedPin: null, flagKind: 'none', adjusted: false, clubChosen: false, cmapTried: false,
      playerLie: '', lieBall: null, holeIntent: false, clubAuto: '', clubBefore: '', puttDraft: '', moving: false, holdCam: false, undoing: false, tileCap: 0, greenTiles: true,
      driverTee: null, teeSource: '', teeName: '', moveTee: false, teeOpen: false, flagSource: '', wx: null, wxState: '', wxOpen: false, wxWhy: '', lostPair: null, provisionalNext: false, recovery: false, buenaPick: false, suggest: '', roundId: H.roundId || '',
    };

    const holeRec = () => S.holes.find(h => h.hole === S.hole || h.number === S.hole) || S.holes[S.hole - 1] || {};
    const gpsHole = () => (S.course?.holes || []).find(h => h.number === S.hole || h.hole === S.hole) || null;
    const asLL = p => {
      if (!p || !R()) return null;
      // course_map_hole stores [lng, lat], the same order the strategy map uses.
      if (Array.isArray(p)) return R().knownPoint(p[1], p[0]);
      return R().knownPoint(p.lat, p.lng);
    };
    const flagRead = () => {
      const rec = holeRec(), g = rec.green || gpsHole()?.green || {};
      const pin = asLL(rec.day_pin);
      if (pin) return { point: pin, kind: 'pin' };
      const mapGreen = cmapHole()?.green || {};
      const mapped = mapGreen.confidence === 'schematic' || mapGreen.confidence === 'satellite_visual_draft' ? null : (asLL(mapGreen.center) || asLL(mapGreen.front));
      if (mapped) return { point: mapped, kind: 'green' };
      const center = asLL(g.center) || asLL(g.front);
      return { point: center, kind: center ? 'green' : 'none' };
    };
    const pinCoord = () => flagRead().point;
    const spotOf = p => asLL(p && p.center ? p.center : p);
    const holeSpots = h => {
      const out = [];
      (h?.tees || []).forEach(t => { const p = spotOf(t); if (p) out.push(p); });
      const line = asLL(h?.line?.[0]); if (line) out.push(line);
      const tee = asLL(h?.tee); if (tee) out.push(tee);
      return out;
    };
    const verifiedTee = () => {
      const hole = cmapHole() || gpsHole() || {};
      const rec = holeRec();
      const yards = rec.yards != null ? rec.yards : (gpsHole()?.yards != null ? gpsHole().yards : hole.yards);
      const spots = holeSpots(hole);
      const gpsTee = asLL(gpsHole()?.tee); if (gpsTee) spots.push(gpsTee);
      const recTee = asLL(rec.tee); if (recTee) spots.push(recTee);
      const foreign = [];
      ((S.cmap && S.cmap.holes) || (S.course && S.course.holes) || []).forEach(h => {
        if (Number(h.hole || h.number) === Number(S.hole)) return;
        const flag = asLL(h.green && (h.green.center || h.green.front)) || asLL(h.green);
        if (!flag) return;
        const card = (S.holes || []).find(x => Number(x.hole) === Number(h.hole || h.number));
        const cardYards = card && card.yards != null ? card.yards : h.yards;
        holeSpots(h).forEach(p => foreign.push({ point: p, pin: flag, yards: cardYards }));
      });
      if (R().matchingTee) return R().matchingTee(verifiedFlag(), yards, spots, foreign);
      return spots[0] || null;
    };
    const verifiedFlag = () => pinCoord();
    const axis = () => R().holeSpan(verifiedTee(), verifiedFlag());
    const spanOk = () => !!(verifiedTee() && verifiedFlag() && axis());
    const mapOk = () => !!(verifiedTee() || verifiedFlag());
    const teeCoord = () => S.track.tee || verifiedTee() || null;
    const cupLL = () => S.track.flag || pinCoord();
    const cmapHole = () => (S.cmap?.holes || []).find(h => h.hole === S.hole) || null;
    const lieAt = pt => {
      const h = cmapHole();
      if (!h || !pt) return null;
      const g = h.green || {};
      const known = !g.confidence || g.confidence === 'openstreetmap' || g.confidence === 'satellite_visual' || g.confidence === 'measured';
      if (g.track_lie !== false && known && (g.polygon || []).length >= 3 && pip(pt, (g.polygon || []).map(asLL).filter(Boolean))) return 'green';
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
    const cupDistance = () => {
      const ball = ballLL();
      const cup = cupLL();
      if (!ball || !cup) return null;
      return hav(ball, cup);
    };
    const nearCup = () => {
      const d = cupDistance();
      return d != null && d <= 25;
    };
    const atCup = () => {
      const d = cupDistance();
      return d != null && d < 2;
    };
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

    const cameraEnds = () => {
      const flag = S.track.flag || verifiedFlag();
      const chosen = S.track.tee && flag && R().holeSpan(S.track.tee, flag) ? S.track.tee : null;
      const catalog = spanOk() ? verifiedTee() : null;
      return { tee: chosen || catalog || null, flag: flag || null, loose: verifiedTee() || null };
    };
    const tightenOpen = (frame, ends, W, Hh) => {
      if (!frame || ends.tee || !ends.flag || frame.bearing != null) return frame;
      const tight = R().frameHole(null, ends.flag, 'point', { width: W, height: Hh });
      if (!tight) return frame;
      return { ...frame, z: tight.z, cx: tight.cx, cy: tight.cy, bearing: null };
    };
    const fitCam = () => {
      const map = mapBox();
      const W = map?.clientWidth || innerWidth, Hh = map?.clientHeight || innerHeight;
      const ball = S.track.ball && R().knownPoint(S.track.ball.lat, S.track.ball.lng);
      const ends = cameraEnds();
      let frame = typeof targetFrame === 'function' ? targetFrame() : null;
      if (!frame) frame = R().frameHole(ends.tee, ends.flag, S.frame || 'overview', { width: W, height: Hh }, ball);
      if (!frame && (ends.flag || ends.loose)) frame = R().frameHole(ends.flag ? null : ends.loose, ends.flag, 'point', { width: W, height: Hh });
      frame = tightenOpen(frame, ends, W, Hh);
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
    const pointAt = (clientX, clientY) => {
      const map = mapBox();
      if (!map) return null;
      const rect = map.getBoundingClientRect();
      const W = rect.width || map.clientWidth || innerWidth;
      const H = rect.height || map.clientHeight || innerHeight;
      const dx = clientX - rect.left - W / 2;
      const dy = clientY - rect.top - H * 0.42;
      const rad = -S.cam.hdg * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
      const px = dx * c + dy * s, py = -dx * s + dy * c;
      const n = 2 ** S.cam.z;
      return unproj(S.cam.cx + px / (n * 256), S.cam.cy + py / (n * 256));
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
      const teeNeedsDrag = S.track.phase === 'confirmTee' && !S.panned && (!verifiedTee() || (!!verifiedFlag() && !spanOk()));
      for (const id of ['play-set', 'play-hit']) {
        const b = el.querySelector('#' + id);
        if (!b) continue;
        b.disabled = !allow || (id === 'play-hit' && !!S.live?.ended_at) || (id === 'play-set' && teeNeedsDrag);
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
      if (pin && R().knownPoint(pin.lat, pin.lng)) {
        const s = toScreen(pin, W, H);
        if (s) o += `<g class="tk-flagpin" transform="translate(${s[0].toFixed(1)},${s[1].toFixed(1)})"><line class="tk-flagpole" x1="0" y1="0" x2="0" y2="-24"/><path class="tk-flagcloth" d="M0 -24h16l-3.5 5.5 3.5 5.5H0z"/><circle class="tk-flagbase" cx="0" cy="0" r="3.6"/></g>`;
      }
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
      const dashed = [];
      if (tee && R().knownPoint(tee.lat, tee.lng)) played.push(tee);
      for (const m of known) {
        if (m.penalty || m.drop) continue;
        if (m.lost) {
          const prev = played[played.length - 1];
          if (prev) dashed.push([prev, m.at]);
          continue;
        }
        played.push(m.at);
      }
      if (played.length >= 2) line(played, 'tk-sh');
      for (const seg of dashed) line(seg, 'tk-lost-line');
      const here = fromCenter();
      const cursor = here && R().knownPoint(here.lat, here.lng);
      const phase = S.track.phase;
      const ball = S.track.ball && R().knownPoint(S.track.ball.lat, S.track.ball.lng);
      if (phase === 'tracking' && !S.done && cursor && ball && hav(ball, cursor) > 0.4) line([ball, cursor], 'tk-live');
      if ((phase === 'tracking' || phase === 'penaltyWhere') && !S.done && cursor && pin && hav(cursor, pin) > 1.5) line([cursor, pin], 'tk-toflag');
      const placed = [];
      const reserve = (x, y) => { placed.push([x, y]); };
      const nudge = (x, y) => {
        let nx = x, ny = y, n = 0;
        while (placed.some(p => Math.hypot(p[0] - nx, p[1] - ny) < 26) && n < 8) {
          const ang = Math.PI + n * (Math.PI / 4);
          nx = x + Math.cos(ang) * 28;
          ny = y + Math.sin(ang) * 28;
          n += 1;
        }
        placed.push([nx, ny]);
        return [nx, ny];
      };
      if (pin) { const ps = toScreen(pin, W, H); if (ps) reserve(ps[0], ps[1]); }
      if (ball && !S.done) {
        const s = toScreen(ball, W, H);
        const n = S.track.marks.filter(m => m.countsStroke).length + 1;
        const onCup = pin && hav(ball, pin) != null && hav(ball, pin) < 2;
        if (s && phase === 'tracking' && !onCup) {
          reserve(s[0], s[1]);
          o += `<g class="tk-origin" data-n="${n}" data-lat="${ball.lat}" data-lng="${ball.lng}"><circle cx="${s[0]}" cy="${s[1]}" r="11"/><text class="tk-aim-n" x="${s[0]}" y="${s[1] - 18}">${n}</text></g>`;
        } else if (s && !onCup) {
          reserve(s[0], s[1]);
          o += `<g class="tk-origin" data-lat="${ball.lat}" data-lng="${ball.lng}"><circle cx="${s[0]}" cy="${s[1]}" r="8"/></g>`;
        }
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
        const s = toScreen(m.at, W, H);
        if (!s) return;
        const [x, y] = s;
        o += `<g class="tk-drop-x"><line x1="${x - 7}" y1="${y - 7}" x2="${x + 7}" y2="${y + 7}"/><line x1="${x + 7}" y1="${y - 7}" x2="${x - 7}" y2="${y + 7}"/></g>`;
      });
      if (phase === 'drop' && cursor) {
        const lost = [...known].reverse().find(m => m.penalty);
        if (lost) line([lost.at, cursor], 'tk-drop-line');
      }
      const isPutt = m => m.countsStroke && !m.penalty && !m.lost && !m.drop && (m.putt || /putt|^pt$/i.test(String(m.club || '')));
      const drawStroke = (m, label) => {
        const s = toScreen(m.at, W, H);
        if (!s) return;
        const [x, y] = nudge(s[0], s[1]);
        const lost = m.lost ? ' tk-lost-shot' : '';
        const r = String(label).length > 2 ? 16 : 11;
        o += `<g class="tk-shot-mark${lost}" data-n="${m.n}" data-lost="${m.lost ? '1' : '0'}" data-lat="${m.at.lat}" data-lng="${m.at.lng}"><circle class="tk-dot" cx="${x}" cy="${y}" r="${r}"/><text class="tk-shot-n" x="${x}" y="${y}">${label}</text></g>`;
      };
      const shotPill = (x, y, m, from) => {
        const name = m.lost ? 'Perdida' : (clubLabel(m.club) || 'Golpe');
        let dist = '';
        if (from && m.at && !m.lost) {
          const meters = hav(from, m.at);
          const putt = clubIsPutt(m.club) || (from && lieAt(from) === 'green' && meters != null && meters <= 55);
          if (putt && meters != null && R().greenToHole) {
            const span = R().greenToHole(meters);
            dist = span && span.unit !== 'cup' ? span.text : '';
          } else if (meters != null) dist = `${yd(meters)} yd`;
        }
        const rest = [name, dist].filter(Boolean).join(' · ').slice(0, 28);
        const w = Math.max(86, Math.min(148, 34 + rest.length * 6.2));
        const flagAt = pin ? toScreen(pin, W, H) : null;
        const obstacles = S.done ? [[0, 46, 184, 248], [W / 2 - 146, 40, W / 2 + 146, 104], [0, H - 268, W, H], [W - 66, 64, W, H * 0.62]] : [];
        const clampX = qx => Math.min(W - 72 - w / 2, Math.max(8 + w / 2, qx));
        const besideFlag = flagAt && Math.hypot(flagAt[0] - x, flagAt[1] - y) < 78;
        let px = besideFlag ? clampX(flagAt[0] - w / 2 - 40) : clampX(x + 14 + w / 2);
        let py = besideFlag ? flagAt[1] + 28 : y;
        let n = 0;
        const hits = (qx, qy) => placed.some(p => Math.abs(p[0] - qx) < (w / 2 + 16) && Math.abs(p[1] - qy) < 18)
          || obstacles.some(([l, t, r, b]) => qx + w / 2 > l && qx - w / 2 < r && qy + 12 > t && qy - 12 < b)
          || qy < 40 || qy > H - 20;
        while ((hits(px, py) || (flagAt && Math.hypot(flagAt[0] - px, flagAt[1] - py) < 58)) && n < 16) {
          n += 1;
          py = (besideFlag ? flagAt[1] + 28 : y) + n * 24;
          px = besideFlag ? clampX(flagAt[0] - w / 2 - 40) : clampX(x + 14 + w / 2);
        }
        placed.push([px, py]);
        const left = Math.round(px - w / 2), top = Math.round(py - 11);
        o += `<g class="tk-mapill" transform="translate(${left},${top})"><rect width="${w.toFixed(0)}" height="22" rx="11" fill="#fff"/><circle cx="11" cy="11" r="9" fill="#C8102E"/><text class="tk-shot-n" x="11" y="11">${m.n}</text><text fill="#0B2545" font-size="11" font-weight="650" font-family="Geist,system-ui,sans-serif" x="24" y="15">${esc(rest)}</text></g>`;
      };
      if (S.aimLL && R().knownPoint(S.aimLL.lat, S.aimLL.lng)) {
        const s = toScreen(S.aimLL, W, H);
        if (s) o += `<circle class="tk-aimmark" cx="${s[0].toFixed(1)}" cy="${s[1].toFixed(1)}" r="8"/>`;
      }
      for (const m of known) {
        if (!m.penalty) continue;
        const s = toScreen(m.at, W, H);
        if (!s) continue;
        const [x, y] = nudge(s[0], s[1]);
        o += `<g class="tk-lost" data-lat="${m.at.lat}" data-lng="${m.at.lng}"><line x1="${x - 7}" y1="${y - 7}" x2="${x + 7}" y2="${y + 7}"/><line x1="${x + 7}" y1="${y - 7}" x2="${x - 7}" y2="${y + 7}"/></g>`;
      }
      const strokes = known.filter(m => m.countsStroke && !m.penalty);
      let pillFrom = tee && R().knownPoint(tee.lat, tee.lng);
      for (const m of strokes) {
        const from = pillFrom;
        const end = m.holed && pin ? pin : m.at;
        if (S.done) {
          const a = from ? toScreen(from, W, H) : null;
          const b = end ? toScreen(end, W, H) : null;
          if (a && b) shotPill((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, m, from);
          else if (b) shotPill(b[0], b[1] - 28, m, from);
        } else {
          drawStroke(m, String(m.n));
        }
        if (end) pillFrom = end;
      }
      return o;
    };

    const freshClub = () => {
      if (S.clubChosen) return;
      const par = holeRec().par || gpsHole()?.par;
      const fromTee = !((S.saved || []).some(s => Number(s.hole) === Number(S.hole)));
      S.club = R().teeClub ? R().teeClub(S.bag, par, '', fromTee) : '';
    };
    const salidaKey = () => `golflet.salida.${S.id || 'local'}.${S.hole}`;
    const teeChoices = () => {
      const rec = holeRec();
      const yards = rec.yards != null ? rec.yards : gpsHole()?.yards;
      const pin = cupLL();
      return R().teeBoxes ? R().teeBoxes(yards, cmapHole()?.tees, pin) : [];
    };
    const readSalida = () => {
      try {
        const raw = localStorage.getItem(salidaKey());
        if (!raw) return null;
        const j = JSON.parse(raw);
        const lat = Number(j && j.lat), lng = Number(j && j.lng);
        const name = String((j && j.name) || '');
        const source = j && j.source === 'tee' ? 'tee' : 'jugador';
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return name ? { lat: null, lng: null, name, source } : null;
        return { lat, lng, name, source };
      } catch { return null; }
    };
    const writeSalida = rec => {
      try { localStorage.setItem(salidaKey(), JSON.stringify({ lat: rec.lat, lng: rec.lng, name: rec.name || '', source: rec.source || 'jugador' })); } catch { /* this device keeps the choice when storage is available */ }
    };
    const applySalida = (lat, lng, name, source) => {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const point = { lat, lng };
      const hasStroke = (S.track.marks || []).some(m => m.countsStroke);
      let phase = S.track.phase;
      let flag = S.track.flag;
      const ball = hasStroke ? S.track.ball : point;
      if (!hasStroke && phase === 'confirmTee' && (flag || S.suggestedPin)) {
        flag = flag || (S.suggestedPin ? { ...S.suggestedPin } : flag);
        phase = 'tracking';
        S.frame = 'play';
      }
      S.track = { ...S.track, tee: point, ball, flag, phase };
      S.teeName = name || '';
      S.teeSource = source === 'tee' ? 'tee' : 'jugador';
      S.moveTee = false;
      writeSalida({ lat, lng, name: S.teeName, source: S.teeSource });
    };
    const restoreSalida = () => {
      const saved = readSalida();
      if (!saved) return;
      if (saved.lat == null || saved.lng == null) {
        S.teeName = saved.name;
        S.teeSource = saved.source;
        return;
      }
      applySalida(saved.lat, saved.lng, saved.name, saved.source);
    };
    const armRetro = () => {
      const teeRaw = verifiedTee();
      const read = flagRead();
      const pin = read.point;
      const tee = teeRaw && (!pin || R().holeSpan(teeRaw, pin)) ? teeRaw : null;
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
        restoreSalida();
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
          countsStroke: true, holed: s.result === 'holed', penalty, drop: false, lost: s.result === 'lost', recovery: s.intent === 'recovery', provisional: false,
        });
        if (penalty) afterPenalty = true;
        else if (end) play = { ...end };
      });
      saved.forEach((s, i) => {
        if (i < 2 || s.result) return;
        const pen = saved[i - 1], lost = saved[i - 2];
        const isPen = pen.result === 'penalty' || Number(pen.penalty_strokes) > 0;
        if (!isPen || lost.result !== 'lost') return;
        const m = marks.find(x => x.id === s.id);
        if (m) m.provisional = true;
      });
      const last = saved[saved.length - 1];
      const openPenalty = (last.result === 'penalty' || Number(last.penalty_strokes) > 0) && last.result !== 'holed';
      S.done = saved.some(s => s.result === 'holed') && !S.reopen;
      S.frame = S.done ? 'overview' : 'play';
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
      const known = remembered && options.find(c => sameClub(remembered.club, c));
      if (known) { S.club = known.id; S.clubChosen = true; }
      else if (remembered && R().isPutterClub && R().isPutterClub(String(remembered.club), String(remembered.club))) {
        S.club = 'Pt'; S.clubChosen = true; S.clubAuto = 'putt';
      }
      const landed = [...saved].reverse().find(s => s.result !== 'penalty' && !(Number(s.penalty_strokes) > 0));
      if (landed && landed.lie === 'green' && play) { S.playerLie = 'green'; S.lieBall = { ...play }; }
      S.clubAuto = S.clubAuto === 'putt' ? 'putt' : '';
      syncClubToOrigin();
      restoreSalida();
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
      const ball = S.track.ball || S.track.tee;
      const ballCup = ball && cup ? hav(ball, cup) : null;
      const inCup = (meters != null && R().inTheCup && R().inTheCup(meters)) || (ballCup != null && R().inTheCup && R().inTheCup(ballCup));
      const holeSpan = meters == null || !R().greenToHole ? null : R().greenToHole(meters);
      const flown = here && ball ? yd(hav(ball, here)) : null;
      if (S.moveTee) return `<b>Arrastrá la salida o tocala en el mapa</b>`;
      if (retro && phase === 'confirmTee') {
        if (S.suggestedTee && S.frame === 'tee') return `<b>Confirmá la salida</b>`;
        return `<b>Arrastrá para confirmar la salida</b><small>Sin salida verificada</small>`;
      }
      if (retro && phase === 'confirmFlag') {
        const fromT = S.track.tee || S.suggestedTee;
        const fromTee = here && fromT ? yd(hav(fromT, here)) : null;
        const dist = fromTee != null ? `<b class="num">${fromTee} yd</b><small> desde la salida</small>` : '';
        const kind = S.flagKind === 'pin' ? '' : '<small>Referencia del green, no un pin medido</small>';
        return S.suggestedPin
          ? `<b>Ajustá la bandera</b>${dist}${kind}`
          : `<b>Arrastrá para ubicar el hoyo</b>${dist}`;
      }
      if (retro && phase === 'tracking') {
        if (S.done) {
          const rows = (S.saved || []).filter(s => Number(s.hole) === Number(S.hole));
          const strokeN = rows.length ? rows.length : S.track.marks.filter(m => m.countsStroke).length;
          const puttSource = rows.length ? rows : (S.track.marks || []).filter(m => m.countsStroke).map(m => ({ club: m.club, lie: m.putt ? 'green' : null, intent: m.recovery ? 'recovery' : null, result: m.lost ? 'lost' : (m.penalty ? 'penalty' : null), originGreen: false }));
          let prevEnd = teeCoord();
          const puttFacts = puttSource.map(s => {
            const start = R().knownPoint(s.lat, s.lng) || prevEnd;
            const end = R().knownPoint(s.end_lat, s.end_lng) || R().knownPoint(s.lat, s.lng);
            const from = start || prevEnd;
            const meters = from && end ? hav(from, end) : null;
            const onGreen = s.lie === 'green' || lieAt(from) === 'green' || lieAt(prevEnd) === 'green';
            const short = meters == null || meters <= 55;
            if (end && s.result !== 'penalty') prevEnd = end;
            return { club: s.club, lie: onGreen && short ? 'green' : null, intent: s.intent, result: s.result, penalty: s.result === 'penalty' || Number(s.penalty_strokes) > 0, recovery: s.intent === 'recovery', originGreen: !!(onGreen && short && s.intent !== 'recovery') };
          });
          const counted = R().countedPutts ? R().countedPutts(puttFacts) : null;
          const knowPutts = counted != null;
          const puttN = counted || 0;
          const holedShot = rows.some(s => s.result === 'holed' || s.intent === 'conceded') || (S.track.marks || []).some(m => m.holed);
          const scored = R().scoredClose ? R().scoredClose(strokeN, knowPutts ? puttN : null, holedShot) : { strokes: strokeN, putts: knowPutts ? puttN : null };
          const close = R().holeCloseText ? R().holeCloseText(holeRec().par || null, scored.strokes, scored.putts) : { line: `${scored.strokes} golpes`, vs: null };
          return `<b>${esc(close.line)}${close.vs ? ` · ${esc(close.vs)}` : ''}</b>`;
        }
        if (inCup) return `<b class="tk-holeflash">En el hoyo</b>`;
        if (putting()) {
          if (!holeSpan || holeSpan.unit === 'cup') return `<b class="tk-holeflash">En el hoyo</b>`;
          return `<b class="num">${esc(holeSpan.text)}</b><small> al hoyo</small><small> estimada en el mapa</small>`;
        }
        const remain = here && cup ? hav(here, cup) : null;
        const travel = flown == null ? '' : `${flown} yd`;
        const left = yd(remain) == null ? '' : `${yd(remain)} yd al hoyo`;
        return aimChip(travel, left, here, cup);
      }
      if (phase === 'confirmTee' || phase === 'confirmFlag' || phase === 'drop' || phase === 'penaltyWhere' || phase === 'relief') {
        return `<b>${esc(PROMPT[phase])}</b>${meters != null && phase !== 'confirmTee' ? `<small class="num">${(yd(meters) ?? '—')} yd al hoyo</small>` : ''}`;
      }
      if (inCup) return `<b class="tk-holeflash">En el hoyo</b>`;
      return aimChip(flown == null ? '' : `${flown} yd`, meters == null ? '' : `${yd(meters)} yd al hoyo`, here, cup);
    };
    const aimChip = (travel, left, here, cup) => {
      return `<b class="num">${travel || '—'}</b>${left ? `<span class="tk-left">${left}</span>` : ''}${flightWind(here, cup)}`;
    };
    const flightWind = (from, to) => {
      const w = S.wind;
      const plan = window.GolfletPlanCore;
      if (!w || w.kmh == null || w.from_deg == null || !from || !to || !plan || !plan.windComp || !plan.playsLikeYd) return '';
      const bearing = R().bearingDeg(from, to);
      const yards = yd(hav(from, to));
      if (bearing == null || yards == null) return '';
      const comp = plan.windComp(bearing, { from_deg: Number(w.from_deg), kmh: Number(w.kmh) });
      const delta = plan.playsLikeYd(yards, comp.head_mph);
      if (!delta) return '';
      return `<small class="tk-wind">Juega ${yards + delta} yd</small>`;
    };

    const windChip = () => {
      if (!S.wind || S.wind.kmh == null) {
        if (S.wxState !== 'none') return '';
        const why = S.wxOpen ? `<div class="tk-wxwhy" id="play-wx-why"><p>${esc(S.wxWhy || 'Open-Meteo y MET Norway no devolvieron viento.')}</p><button type="button" id="play-wx-retry">Reintentar</button></div>` : '';
        return `<button type="button" class="tk-chip tk-wx" id="play-wx" aria-expanded="${S.wxOpen ? 'true' : 'false'}">–</button>${why}`;
      }
      const temp = S.wind.temp_c != null ? `${Math.round(Number(S.wind.temp_c))}°C` : '';
      const gust = S.wind.gust_kmh != null ? `ráfagas ${Math.round(Number(S.wind.gust_kmh))} km/h` : '';
      const rain = Number(S.wind.precip_mm) > 0 || S.wind.condition === 'lluvia' || S.wind.condition === 'tormenta' ? 'lluvia' : '';
      const flag = S.track.flag || verifiedFlag();
      const played = S.track.tee && flag && R().holeSpan && R().holeSpan(S.track.tee, flag) ? S.track.tee : null;
      const tee = played || (spanOk() ? verifiedTee() : null);
      const span = tee && flag && R().holeSpan ? R().holeSpan(tee, flag) : null;
      const bearing = span ? span.bearing : null;
      const abs = S.wind.from_deg != null && R().windAbsolute ? R().windAbsolute(S.wind.from_deg) : null;
      const turn = bearing != null && R().windArrow ? R().windArrow(S.wind.from_deg, bearing) : (abs ? abs.turn : null);
      const face = bearing != null && R().windFace ? (R().windFace(S.wind.from_deg, bearing) || '') : (abs ? abs.face : '');
      const note = bearing == null && abs ? 'Sin rumbo del hoyo' : '';
      const arrow = turn == null ? '' : `<svg class="tk-wxarr" viewBox="0 0 36 36" width="36" height="36" style="transform:rotate(${Math.round(turn)}deg)" aria-hidden="true"><path d="M18 30V12" fill="none" stroke="#E2B93B" stroke-width="3.2" stroke-linecap="round"/><path d="M10 16.5 18 6.5 26 16.5" fill="none" stroke="#E2B93B" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
      const bits = [`${Math.round(Number(S.wind.kmh))} km/h`, gust, temp, rain].filter(Boolean).join(' · ');
      const when = S.wind.hhmm || '';
      const src = S.wind.source ? `${S.wind.source}${when ? ` ${when}` : ''}${S.wind.stale ? ' · última lectura' : ''}` : when;
      return `<button type="button" class="tk-chip tk-wx" id="play-wx" data-wind="${bearing == null ? 'absoluto' : 'hoyo'}" data-turn="${turn == null ? '' : Math.round(turn)}">${arrow}<span class="tk-wxcopy">${face ? `<b class="tk-wxface">${esc(face)}</b>` : ''}<b class="num">${esc(bits)}</b>${src ? `<small>${esc(src)}</small>` : ''}${note ? `<small class="tk-wxnote">${esc(note)}</small>` : ''}</span></button>`;
    };

    const paintDriver = () => {
      const slot = el.querySelector('#tk-driver');
      if (!slot) return;
      const first = (S.track.marks || []).filter(m => m.countsStroke).length === 0 && S.track.phase === 'tracking' && !S.done;
      const show = !!(first && S.driverTee && R().isDriverClub(S.club, clubLabel(S.club)));
      slot.hidden = !show;
      slot.textContent = show ? `Historial del driver, primer tiro: ${S.driverTee.yd} yd · ${S.driverTee.n} ${S.driverTee.n === 1 ? 'tiro' : 'tiros'}` : '';
    };
    const loadDriverHistory = () => {
      api('/api/club-stats').then(d => {
        if (!S.alive) return;
        const rows = Array.isArray(d && d.clubs) ? d.clubs : [];
        const hit = rows.find(r => r && r.tee_shots && r.tee_shots.avg_yd != null && r.tee_shots.n >= 1 && R().isDriverClub(String(r.club || ''), String(r.label || '')));
        S.driverTee = hit ? { yd: Math.round(Number(hit.tee_shots.avg_yd)), n: Number(hit.tee_shots.n) } : null;
        paintDriver();
      }).catch(() => {});
    };
    const clubFace = (id, label) => {
      const raw = `${id} ${label}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      if (/(^|\s)(pt|putter|putt)($|\s)/.test(raw)) return 'putter';
      if (/(^|\s)(pw|gw|sw|lw|aw)($|\s)/.test(raw) || /\bwedge\b/.test(raw)) return 'wedge';
      if (/(^|\s)(dr|driver)($|\s)/.test(raw)) return 'driver';
      if (/(^|\s)\d+w($|\s)/.test(raw) || /\b(madera|fairway|wood)\b/.test(raw)) return 'fairway';
      if (/(^|\s)(hy|\dh)($|\s)/.test(raw) || /\b(hybrid|hibrido)\b/.test(raw)) return 'hybrid';
      return 'iron';
    };
    const faceOf = (id, label) => {
      const row = (S.bag || []).find(b => b && (b.id === id || b.code === id || b.club === id || b.label === id || b.name === id)) || {};
      const gear = window.GolfletGear;
      const stamped = /^(driver|fairway|hybrid|iron|wedge|putter)$/.test(String(row.category || '')) ? row.category : '';
      const face = stamped || clubFace(id, label);
      const thumb = gear && typeof gear.thumb === 'function' ? gear.thumb(row.brand || '', row.model || row.model_name || '', face) : { src: `/clubs/silhouettes/${face}.svg`, kind: 'silhouette' };
      const out = thumb && thumb.src ? thumb : { src: `/clubs/silhouettes/${face}.svg`, kind: 'silhouette' };
      return { src: out.src, kind: out.kind || '', face };
    };
    const faceSvg = face => {
      const shaft = 'M11 27c5-7 7-12 5-16';
      const heads = {
        driver: '<path d="M16 11c2-3 7-3 8 1s-4 5-8 3" fill="none" stroke="#0B2545" stroke-width="1.8"/>',
        fairway: '<path d="M16 12c2-2 6-2 7 1s-3 4-7 2" fill="none" stroke="#0B2545" stroke-width="1.8"/>',
        hybrid: '<path d="M15 13c2-2 6-1 6 2s-4 3-6 1" fill="none" stroke="#0B2545" stroke-width="1.8"/>',
        iron: '<path d="M16 12l5 2-1 5-4-1z" fill="none" stroke="#0B2545" stroke-width="1.8" stroke-linejoin="round"/>',
        wedge: '<path d="M15 13l6 1-2 5-4-1z" fill="none" stroke="#0B2545" stroke-width="1.8" stroke-linejoin="round"/>',
        putter: '<path d="M14 14h8v3h-8z" fill="none" stroke="#0B2545" stroke-width="1.8"/>',
      };
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="${shaft}" fill="none" stroke="#0B2545" stroke-width="1.8" stroke-linecap="round"/>${heads[face] || heads.iron}</svg>`;
      return `data:image/svg+xml,${encodeURIComponent(svg)}`;
    };
    const faceImg = (id, label) => {
      const thumb = faceOf(id, label);
      const face = thumb.face || clubFace(id, label);
      const sil = `/clubs/silhouettes/${face}.svg`;
      const fallback = thumb.kind === 'photo' ? sil : faceSvg(face);
      return `<img class="tk-clubface" src="${esc(thumb.src)}" alt="" data-kind="${esc(thumb.kind || '')}" data-face="${esc(face)}" data-fallback="${esc(fallback)}" data-last="${esc(faceSvg(face))}">`;
    };
    let clubChoices = [];
    const bagRow = id => (S.bag || []).find(b => b && (b.id === id || b.code === id || b.club === id || b.label === id));
    const carryOf = id => {
      const row = bagRow(id);
      const n = row && (row.total || row.carry);
      return n ? String(n) : '';
    };
    const tileYards = c => {
      if (!c) return '';
      if (R().isPutterClub && R().isPutterClub(c.id, c.label)) return '';
      const row = bagRow(c.id);
      const n = row && (row.carry || row.total);
      return n ? `${n} yd` : '';
    };
    const render = () => {
      stopCam();
      const rec = holeRec(), par = rec.par || gpsHole()?.par, hcp = rec.hcp || gpsHole()?.hcp;
      const yardNote = rec.yards_note || gpsHole()?.yards_note || '';
      const pickedTee = teeChoices().find(b => b.name && b.name === S.teeName);
      const cardYd = pickedTee && pickedTee.yards != null ? `${pickedTee.yards} yd` : (R().yardLabel ? R().yardLabel(rec.yards != null ? rec.yards : gpsHole()?.yards) : '');
      const phase = S.track.phase;
      const pen = phase === 'penaltyWhere' || phase === 'relief' || phase === 'drop';
      const setPhase = phase === 'confirmTee' || phase === 'confirmFlag' || phase === 'drop';
      const marks = S.track.marks.length ? S.track.marks : S.shots.filter(s => s.hole === S.hole).map((s, i) => ({ id: s.id || i, club: s.club, countsStroke: s.result !== 'penalty', holed: s.result === 'holed', penalty: s.result === 'penalty' || s.result === 'water', drop: false }));
      const bag = R().bagClubs ? R().bagClubs(S.bag) : [];
      const showClub = (retro ? phase === 'tracking' && !S.done : phase === 'tracking');
      clubChoices = [];
      if (showClub || S.editN || S.pickClub) {
        if (!(bag.some(c => R().isPutterClub && R().isPutterClub(c.id, c.label)))) clubChoices.push({ id: putterChoice(), label: 'Putter' });
        bag.forEach(c => clubChoices.push({ id: c.id, label: c.label }));
      }
      const clubBlank = S.club ? '' : '<option value="">Elegir palo</option>';
      const picked = clubChoices.find(c => c.id === S.club);
      S.suggest = '';
      if (showClub && !putting() && !S.done) {
        const aim = fromCenter();
        const cup = cupLL();
        const leftYd = aim && cup ? yd(hav(aim, cup)) : null;
        if (leftYd != null) {
          let best = '', gap = Infinity;
          for (const c of clubChoices) {
            if (/putter|^pt$/i.test(c.label)) continue;
            const carry = Number(carryOf(c.id));
            if (!Number.isFinite(carry) || carry <= 0) continue;
            const d = Math.abs(carry - leftYd);
            if (d < gap) { gap = d; best = c.id; }
          }
          if (best) S.suggest = best;
        }
      }
      const shownClub = picked || clubChoices.find(c => c.id === S.suggest);
      const clubCell = (c, extra) => {
        const yards = tileYards(c);
        const raw = String(extra || '');
        const ring = /\bon\b/.test(raw) ? 'on' : (/\bsug\b/.test(raw) ? 'sug' : '');
        return `<li><button type="button" data-club="${esc(c.id)}" class="${ring}" aria-label="${esc(clubLabel(c.label))}">${faceImg(c.id, c.label)}<b>${esc(gridName(c.label))}</b>${yards ? `<small>${esc(yards)}</small>` : ''}</button></li>`;
      };
      const tileName = shownClub ? gridName(shownClub.label) : 'Palo';
      const tileAria = shownClub ? clubLabel(shownClub.label) : 'Palo';
      const tileYd = shownClub ? tileYards(shownClub) : '';
      const editRow = S.editN ? (S.saved || []).filter(s => Number(s.hole) === Number(S.hole))[S.editN - 1] : null;
      const clubButtons = clubChoices.map(c => clubCell(c, (editRow ? sameClub(editRow.club, c) : c.id === S.club) ? 'on' : (!editRow && !S.club && c.id === S.suggest ? 'sug' : ''))).join('');
      // The sheet sits outside the dock. The dock ignores pointer events, and a fixed
      // child of that dock does not receive the finger on iPhone: the tap falls through
      // and the marked club never changes. Editing a shot, including A buena, uses this
      // same sheet. A second list inside the editor never saw the finger.
      const sheetTitle = S.buenaPick ? 'Palo del golpe a buena' : 'Palo';
      const clubSheet = (showClub || S.pickClub || S.buenaPick || S.editN) ? `<div class="tk-sheet" id="play-club-sheet" hidden role="dialog" aria-modal="true" aria-label="Palos"><div class="tk-sheetcard"><button type="button" class="tk-sheetx" id="play-club-close" aria-label="Cerrar">✕</button><p class="tk-sheetk">${esc(sheetTitle)}</p><ul class="tk-clublist" id="play-club-list" role="listbox" hidden>${clubButtons}</ul></div></div>` : '';
      const clubTile = showClub ? `<div class="tk-club"><button type="button" class="tk-clubtile" id="play-club-tile" aria-haspopup="dialog" aria-label="${esc(tileAria)}">${faceImg(shownClub ? shownClub.id : '', shownClub ? shownClub.label : '')}<span><b>${esc(tileName)}</b>${tileYd ? `<small>${esc(tileYd)}</small>` : ''}</span></button><select id="play-club" aria-label="Palo">${clubBlank}${clubChoices.map(c => `<option value="${esc(c.id)}" ${S.club === c.id ? 'selected' : ''}>${esc(clubLabel(c.label))}</option>`).join('')}</select></div>` : '';
      const hs = retro ? null : S.strat?.holes?.find(x => x.hole === S.hole);
      const here = fromCenter();
      const name = esc(S.live?.course || S.live?.vm_course || S.course?.course || 'Golflet');
      if (retro && !mapOk()) {
        const pts = [];
        (S.holes || []).forEach(h => { const t = asLL(h.tee), f = asLL(h.green) || asLL(h.flag) || asLL(h.pin); if (t) pts.push(t); if (f) pts.push(f); });
        const focus = pts.length ? { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length } : null;
        const sat = focus ? `<div class="tk-sat" id="hole-satellite" style="height:220px;border-radius:12px;background:#0B2545 center/cover no-repeat;background-image:url('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${focus.lng - 0.01},${focus.lat - 0.008},${focus.lng + 0.01},${focus.lat + 0.008}&bboxSR=4326&imageSR=4326&size=800,480&f=image')"></div>` : '';
        el.innerHTML = `<div class="tk" id="play-track">
          <div class="tk-top"><button type="button" class="tk-ib" id="rc-close" aria-label="Volver a la tarjeta">✕</button><b class="tk-cn">${name}</b>${H.unofficial ? `<span class="tk-unofficial">No oficial</span>` : ''}</div>
          ${sat}
          <p class="tk-empty" id="rc-nogeo">Este hoyo no tiene geometría verificada. No marco un punto inventado.</p>
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
        const finish = s.intent === 'conceded' ? 'Dada' : (s.result === 'holed' ? 'Embocado' : '');
        const fromGuess = R().knownPoint(s.lat, s.lng) || prevKnown;
        const endGuess = end || (finish ? cupLL() : null);
        const spanM = fromGuess && endGuess ? hav(fromGuess, endGuess) : null;
        const startedGreen = s.lie === 'green' || lieAt(fromGuess) === 'green' || lieAt(prevKnown) === 'green';
        const puttShot = !penalty && s.intent !== 'recovery' && (clubIsPutt(s.club) || ((startedGreen || !!finish) && (spanM == null || spanM <= 55)));
        const fromPoint = (i === 0 || puttShot) && prevKnown ? prevKnown : R().knownPoint(s.lat, s.lng);
        const holePoint = finish && !end ? cupLL() : null;
        const toPoint = end || holePoint;
        const label = R().shotDistanceLabel ? R().shotDistanceLabel({
          lat: fromPoint?.lat, lng: fromPoint?.lng, end_lat: toPoint?.lat, end_lng: toPoint?.lng,
          prev_lat: prevKnown?.lat, prev_lng: prevKnown?.lng, club: s.club,
          lie: puttShot ? 'green' : (s.lie === 'green' ? null : s.lie), distance_m: finish ? null : s.distance_m, distance_kind: finish ? null : s.distance_kind, penalty,
        }) : { text: ydOf(s.distance_m), kind: 'yards' };
        if (toPoint && !penalty) prevKnown = toPoint;
        else if (!penalty) {
          const landed = R().knownPoint(s.lat, s.lng);
          if (landed && prevKnown && hav(prevKnown, landed) > 3) prevKnown = landed;
        }
        const lost = s.result === 'lost';
        const recovery = s.intent === 'recovery';
        const distance = lost || penalty || !label.text || label.kind === 'penalty' || label.text === 'En el hoyo' ? '' : label.text;
        return { id: s.id, club: penalty ? 'Penalidad' : (lost ? 'Perdida' : (clubLabel(s.club) || s.club || '—')), yards: distance, unknown: !lost && !penalty && !finish && label.kind === 'missing', n: i + 1, abuenatag: recovery, finish };
      });
      const railSource = savedRail.length ? savedRail : S.track.marks.filter(m => m.countsStroke).map((m, i) => {
        const prev = playingPoint(S.track.marks.slice(0, S.track.marks.indexOf(m)));
        const meters = prev ? hav(prev, { lat: m.lat, lng: m.lng }) : null;
        const putt = !m.penalty && !m.lost && (m.putt || /putt/i.test(String(m.club || '')));
        const span = putt && !m.recovery && meters != null && R().greenToHole ? R().greenToHole(meters) : null;
        const dist = m.penalty || m.lost ? '' : (span ? (span.unit === 'cup' ? '' : span.text) : (meters == null ? '' : `${yd(meters)} yd`));
        return { id: m.id, club: m.lost ? 'Perdida' : m.penalty ? 'Penalidad +1' : (putt && !m.recovery ? `Putt ${i + 1}` : (clubLabel(m.club) || m.club || '—')), yards: dist, unknown: !m.penalty && !m.lost && !R().knownPoint(m.lat, m.lng), n: m.n || i + 1, abuenatag: !!m.recovery };
      });
      const railOpen = S.railHole === S.hole && !!S.railOpen;
      const railMany = !S.done && railSource.length > 3;
      const railKeep = railMany && !railOpen ? new Set(railSource.slice(-3).map(s => s.n)) : null;
      const railMore = railMany ? `<button type="button" class="tk-shot tk-more" id="play-shots-more">${railOpen ? 'Menos' : `+${railSource.length - 3}`}</button>` : '';
      const abuenatag = s => s.abuenatag ? '<span class="tk-abuena">A buena</span>' : '';
      const railBtn = s => `<button type="button" class="tk-shot${S.editN === s.n ? ' on' : ''}" id="play-shot-${s.n}" data-shot="${s.n}"${railKeep && !railKeep.has(s.n) ? ' hidden' : ''}>${s.n}. ${esc(s.club || '—')}${abuenatag(s)}${s.yards ? ` · ${esc(s.yards)}` : s.unknown ? ' · Sin ubicación' : ''}${s.finish ? ` · ${esc(s.finish)}` : ''}</button>`;
      const rail = retro && railSource.length ? `<div class="tk-shots-rail" id="rc-shots" aria-label="Golpes">${railMore}${railSource.map(railBtn).join('')}</div>` : (!retro ? `<div class="tk-shots-rail" aria-label="Golpes">${marks.map((m, i) => `<span id="play-shot-${i}">${m.drop ? 'Drop' : m.penalty ? 'P' : m.holed ? 'Hoyo' : (m.club ? esc(clubLabel(m.club)) : (i + 1))}${m.recovery ? '<span class="tk-abuena">A buena</span>' : ''}</span>`).join('')}</div>` : '');
      let saveBtn = '';
      if (retro && savedRows.length && R().trackHoleSummary) {
        // Strokes gained stays off this map. Broadie's published baselines are in
        // Golflet/Sources/Prototype/StrokesGained.swift (Mark Broadie, 2011, ShotLink).
        // A tracked shot does not carry a reliable start lie, so a number here would be invented.
        const facts = savedRows.map(s => {
          const end = R().knownPoint(s.end_lat, s.end_lng);
          const start = R().knownPoint(s.lat, s.lng);
          const penalty = s.result === 'penalty' || Number(s.penalty_strokes) > 0;
          const flown = start && end ? hav(start, end) : null;
          const recovery = s.intent === 'recovery';
          return { penalty, holed: !recovery && (s.result === 'holed' || s.intent === 'conceded'), putt: !recovery && s.intent === 'conceded', originGreen: !recovery && !penalty && s.intent !== 'conceded' && s.lie === 'green' && (flown == null || flown <= 50), endLie: recovery || penalty || s.intent === 'conceded' ? null : (lieAt(end) || null) };
        });
        const sum = R().trackHoleSummary(par || null, facts);
        S.derived = { putts: sum.putts, gir: sum.gir, fir: sum.fir };
        const canSave = sum.finished && typeof H.onStats === 'function' && R().emptyStatFill && R().emptyStatFill(S.storedMark || null, S.derived);
        saveBtn = canSave ? `<button type="button" class="tk-nextlink" id="play-stats" title="Guarda en la tarjeta los putts, el fairway y el green que todavía no están.">Guardar lo que falta</button>` : '';
      }
      const setup = retro && (phase === 'confirmTee' || phase === 'confirmFlag');
      const marking = retro && phase === 'tracking' && !S.done && phase !== 'relief';
      const ballSpot = S.track.ball;
      const cupSpot = cupLL();
      const ballToCup = ballSpot && cupSpot ? hav(ballSpot, cupSpot) : null;
      const offerFinish = putting() && ballToCup != null && R().shortPutt && R().shortPutt(ballToCup);
      const choices = teeChoices();
      const teeFace = (() => {
        const picked = choices.find(b => b.name === S.teeName);
        if (picked) return `${picked.name}${picked.yards != null ? ` · ${picked.yards} yd` : ''}`;
        return cardYd ? `Salida · ${cardYd}` : 'Salida';
      })();
      const teeList = S.teeOpen ? `<div class="tk-teelist" id="play-tee-list" role="listbox">${choices.length ? choices.map(b => `<button type="button" role="option" data-tee="${esc(b.name)}" class="${b.name === S.teeName ? 'on' : ''}">${esc(b.name)}${b.yards != null ? ` · ${b.yards} yd` : ''}</button>`).join('') : '<p>Esta cancha no tiene salidas con yardas.</p>'}</div>` : '';
      const teeBar = retro ? `<span class="tk-teechip">${teeList}<button type="button" class="tk-tee" id="play-tee" aria-expanded="${S.teeOpen ? 'true' : 'false'}" aria-label="Salida">${esc(teeFace)}</button><button type="button" id="play-move-tee" aria-pressed="${S.moveTee ? 'true' : 'false'}">${S.moveTee ? 'Listo' : 'Mover'}</button>${S.moveTee ? '<button type="button" id="play-tee-gps">Usar mi ubicación</button>' : ''}</span>` : '';
      const holeBits = [par ? `Par ${par}` : '', cardYd, verifiedFlag() && !verifiedTee() ? 'Sin salida verificada' : ''].filter(Boolean);
      const holeChip = retro ? `<div class="tk-hole" id="tk-hole"><b>Hoyo ${S.hole}</b>${H.unofficial ? `<span class="tk-unofficial">No oficial</span>` : ''}${holeBits.length ? `<span>${esc(holeBits.join(' · '))}</span>` : ''}</div>` : '';
      const read = cursorRead(here);
      const cursorKind = phase === 'penaltyWhere' ? 'penalty' : phase === 'drop' ? 'drop' : phase === 'confirmFlag' ? 'flag' : (phase === 'confirmTee' && S.frame === 'tee') ? 'tee' : 'shot';
      const nextStroke = S.track.marks.filter(m => m.countsStroke).length + 1;
      const holeShots = () => (S.saved || []).filter(s => Number(s.hole) === Number(S.hole));
      const editingShot = S.editN ? holeShots()[S.editN - 1] : null;
      const editBits = [`Golpe ${S.editN}`];
      if (editingShot) {
        const clubName = editingShot.result === 'penalty' ? 'Penalidad' : editingShot.result === 'lost' ? 'Perdida' : (clubLabel(editingShot.club) || editingShot.club || '');
        if (clubName) editBits.push(String(clubName));
        const meters = Number(editingShot.distance_m);
        const putt = (R().isPutterClub && R().isPutterClub(String(editingShot.club || ''), clubLabel(editingShot.club))) || (!editingShot.club && editingShot.lie === 'green');
        if (editingShot.result !== 'lost' && editingShot.result !== 'penalty' && Number.isFinite(meters) && meters > 0) {
          const span = putt && R().greenToHole ? R().greenToHole(meters) : null;
          editBits.push(span && span.unit !== 'cup' ? span.text : (putt ? 'En el hoyo' : `${Math.round(meters / 0.9144)} yd`));
        }
      }
      const pointWord = S.editPoint === 'start' ? 'el inicio' : S.editPoint === 'aim' ? 'el objetivo' : 'el punto final';
      const pointBtn = (kind, label) => {
        const saving = S.moveShot && S.editPoint === kind;
        const text = saving ? (kind === 'aim' ? 'Guardar objetivo' : 'Guardar punto') : label;
        return `<button type="button" id="play-edit-${kind === 'end' ? 'move' : kind}">${text}</button>`;
      };
      const buenaOn = editingShot && editingShot.intent === 'recovery';
      const shotEditor = editingShot ? `<div class="tk-edit" id="play-shot-editor" role="dialog" aria-label="Editar golpe"><b>${esc(editBits.join(' · '))}</b><button type="button" id="play-edit-club">Cambiar palo</button>${pointBtn('start', 'Punto de inicio')}${pointBtn('end', 'Punto final')}${pointBtn('aim', 'Objetivo')}<button type="button" id="play-edit-insert">Insertar tiro</button><button type="button" id="play-edit-buena" aria-pressed="${buenaOn ? 'true' : 'false'}">A buena${buenaOn ? ' · activo' : ''}</button><button type="button" id="play-edit-x">Cerrar</button><button type="button" id="play-edit-del">Borrar tiro</button>${S.askDel ? '<p>¿Borrar este tiro?</p><button type="button" id="play-edit-yes">Sí, borrar</button>' : ''}${S.moveShot ? `<p>Mové el mapa hasta ${pointWord}.</p>` : ''}</div>` : '';
      const editSheet = '';
      const painted = el.querySelector('.tk-tiles:not([data-pending])');
      const paintedHole = el.querySelector('#tkmap')?.dataset.hole || '';
      const paintedHTML = painted && paintedHole === String(S.hole) ? painted.outerHTML : '';
      el.innerHTML = `<div class="tk" id="play-track">
        <div class="tk-map" id="tkmap"></div>
        <div class="tk-maperr" id="tk-maperr" hidden><b>El mapa no cargó.</b><button type="button" id="tk-retry">Reintentar</button></div>
        <div class="tk-ret${S.done || (ballToCup != null && ballToCup < 2) ? '' : ' on'}${pen ? ' pen' : ''}" id="play-reticle" data-cursor="${cursorKind}" aria-hidden="true"><i></i>${cursorKind === 'drop' ? '<b class="tk-x">X</b>' : ''}</div>
        ${retro ? `<div class="tk-sidebtns"><button type="button" id="play-target" aria-label="Objetivo"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg></button>${cupLL() ? `<button type="button" id="play-flag" aria-label="Bandera"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 20V4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M6 5.2h9.2l-2 3 2 3H6" fill="#C8102E" stroke="#C8102E"/></svg></button>` : ''}<button type="button" id="play-gps" aria-label="GPS">GPS</button></div><div class="tk-zoom"><button type="button" id="play-zoom-in" aria-label="Acercar">+</button><button type="button" id="play-zoom-out" aria-label="Alejar">−</button></div>` : ''}
        ${rail}
        <div class="tk-top">
          ${retro ? `<button type="button" class="tk-ib" id="rc-close" aria-label="Volver a la tarjeta">✕</button>` : `<a class="tk-ib" href="#/inicio" aria-label="Inicio">⌂</a>`}
          <b class="tk-cn">${name}</b>${retro && H.unofficial ? `<span class="tk-unofficial">No oficial</span>` : ''}
        </div>
        ${setup ? holeChip : ''}
        <div class="tk-chips">${windChip()}</div>
        <div class="tk-notes"><p class="tk-driver" id="tk-driver" hidden></p></div>
        ${read ? `<div class="tk-ro${setup ? ' tk-setup' : ''}${retro && S.done ? ' tk-done' : ''}${!setup && !(retro && S.done) ? ' tk-live' : ''}" id="tkro">${read}</div>` : ''}
        ${hs ? `<a class="tk-strat" id="strategy-compact" href="#/estrategia/${encodeURIComponent(S.strat.course_key || S.course?.course_key || '')}">${esc(hs.plan_title || 'Plan del hoyo')}</a>` : ''}
        ${shotEditor}
        <div class="tk-dock">
          ${editSheet}
          ${retro && greenAxis() ? `<p class="tk-axisnote">Eje verificado del green. No es el contorno ni el pin.</p>` : ''}
          ${retro && verifiedTee() && verifiedFlag() && !spanOk() ? `<p class="tk-opennote" id="rc-nogeo">La salida no cierra. No marco un rumbo.</p>` : ''}
          ${retro && cmapHole()?.green?.source === 'openstreetmap' ? `<p class="tk-osmnote" title="Contorno © OpenStreetMap contributors (ODbL). No es el pin.">Contorno OSM. No es el pin.</p>` : ''}
          ${retro && cmapHole()?.green?.source === 'satellite_visual' ? `<p class="tk-osmnote" title="Contorno aceptado en el admin. No es un relevamiento ni el pin.">Contorno del admin. No es el pin.</p>` : ''}
          ${retro && S.done ? `<div class="tk-nextblock"><button type="button" class="tk-nextwide" id="play-next">Siguiente hoyo</button><button type="button" class="tk-nextghost" id="play-edit-hole">Editar hoyo</button>${saveBtn}</div>` : ''}
          <div class="tk-nav">
            <button type="button" id="tkprev" ${S.hole <= 1 ? 'disabled' : ''} aria-label="Hoyo anterior">‹</button>
            <div class="tk-hn"><b>Hoyo ${S.hole}</b><span>${`Par ${par || '—'}${cardYd ? ` · ${cardYd}` : ''}${hcp != null && hcp !== '' && Number.isFinite(Number(hcp)) ? ` · S.I. ${hcp}` : ''}`}</span></div>
            <b class="tk-score" id="play-score">${(savedRows.length || S.track.marks.filter(m => m.countsStroke).length) || '–'}</b>
            <button type="button" id="tknext" ${S.hole >= 18 ? 'disabled' : ''} aria-label="Hoyo siguiente">›</button>
          </div>
          ${yardNote ? `<p class="tk-yardnote" id="tk-yardnote">${esc(yardNote)}</p>` : ''}
          ${S.teeSource === 'jugador' ? `<p class="tk-player" id="tk-player">Salida confirmada por vos. No es una medida.</p>` : ''}
          ${S.flagSource === 'jugador' ? `<p class="tk-player" id="tk-flag-player">Hoyo confirmado por vos. No es una medida.</p>` : ''}
          ${S.msg ? `<p class="tk-msg" id="${S.msg.startsWith('Hoyo cerrado') ? 'play-conceded' : 'tk-msg'}">${esc(S.msg)}</p>` : ''}
          ${offerFinish ? `<div class="tk-finish"><button type="button" id="play-hole-out">Embocar (+1)</button><button type="button" id="play-concede">Dada</button></div>` : ''}
          <div class="tk-acts">
            <div class="tk-play">
              ${clubTile}
              ${setup ? `<button type="button" class="tk-cancel" id="play-cancel">CANCEL</button><button type="button" class="tk-enter" id="play-set" disabled>SET</button>` : ''}
              ${!setup && (phase === 'penaltyWhere' || phase === 'relief' || phase === 'drop') ? `<button type="button" class="tk-cancel" id="play-cancel">CANCEL</button>` : ''}
              ${(retro && phase === 'drop') || (!retro && setPhase) ? `<button type="button" class="tk-enter" id="play-set" disabled>SET</button>` : ''}
              ${!S.done && !setPhase && phase !== 'relief' ? `<button type="button" class="tk-enter" id="play-hit" disabled aria-label="ENTER">ENTER</button>` : ''}
            </div>
            <div class="tk-rounds">
              ${marking && S.track.marks.length ? `<button type="button" class="tk-round" id="play-undo" aria-label="Deshacer"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M8.5 7.5H4.5V3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 8.2A8 8 0 1 1 6.4 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>` : ''}
              ${(phase === 'tracking' || S.done) ? `<div class="tk-penwrap"><button type="button" class="tk-round tk-pen" id="play-penalty" aria-haspopup="menu" aria-expanded="false" aria-controls="play-pen-menu" aria-label="Penalidad">P+1</button><div class="tk-penmenu" id="play-pen-menu" role="menu" hidden><button type="button" id="play-pen-stroke" role="menuitem">Penalidad +1</button>${marking ? '<button type="button" id="play-lost" role="menuitem">Pelota perdida / fuera de límites</button><button type="button" id="play-lost-prov" role="menuitem">Pelota perdida · jugué la provisional</button>' : ''}</div></div>` : ''}
              ${(marking || (!retro && phase === 'tracking')) && !S.done ? `<button type="button" class="tk-round" id="play-good" aria-label="A buena, golpe de recuperación">A buena</button>` : ''}
              ${!retro && phase === 'relief' ? `<button type="button" class="tk-ghost" id="play-reload">Otra vez</button><button type="button" class="tk-ghost" id="play-drop">Drop</button>` : ''}
              ${retro && (phase === 'relief') ? `<button type="button" class="tk-ghost" id="play-reload">Otra vez</button><button type="button" class="tk-ghost" id="play-drop">Drop</button>` : ''}
              ${marking && !hasGreenPoly() && !originOnGreen() ? `<button type="button" class="tk-ghost tk-side" id="play-lie">En el green</button>` : ''}
              ${marking && (hasGreenPoly() || originOnGreen()) ? `<button type="button" class="tk-round" id="play-flag-chip">Bandera</button>` : ''}
              ${teeBar}
            </div>
          </div>
        </div>
        ${clubSheet}
      </div>`;
      const freshMap = el.querySelector('#tkmap');
      if (paintedHTML && freshMap) freshMap.insertAdjacentHTML('afterbegin', paintedHTML);
      paintMap();
      wire();
      paintDriver();
    };

    const paintMap = () => {
      const map = mapBox(); if (!map) return;
      const gen = ++S.mapGen;
      S.mapReady = false;
      const W = map.clientWidth || innerWidth, Hh = map.clientHeight || innerHeight;
      const tileCap = Math.min(19, Math.max(Number(R().IMAGERY_ZOOM_MAX) || 17, Number(S.tileCap) || 0));
      const tileZ = Math.max(0, Math.min(tileCap, Math.floor(S.cam.z)));
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
      map.querySelectorAll('.tk-svg').forEach(node => node.remove());
      const layer = document.createElement('div');
      layer.className = 'tk-tiles';
      layer.dataset.pending = '1';
      layer.style.transform = `translate(${W / 2}px,${Hh * 0.42}px) scale(${scale}) rotate(${-S.cam.hdg}deg)`;
      layer.style.transformOrigin = '0 0';
      tiles.forEach((t, i) => {
        const img = document.createElement('img');
        img.className = 'tk-tile';
        img.alt = '';
        img.decoding = 'async';
        img.dataset.i = String(i);
        img.style.left = `${t.left}px`;
        img.style.top = `${t.top}px`;
        img.style.width = '256px';
        img.style.height = '256px';
        layer.append(img);
      });
      map.append(layer);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'tk-svg');
      svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`);
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.innerHTML = overlaySVG(W, Hh);
      map.append(svg);
      map.dataset.cx = String(S.cam.cx);
      map.dataset.cy = String(S.cam.cy);
      map.dataset.z = String(S.cam.z);
      map.dataset.tileZ = String(tileZ);
      map.dataset.imagery = S.cam.z > tileZ + 0.05 ? 'scaled' : 'native';
      map.dataset.flagKind = S.flagKind || '';
      map.dataset.frame = S.axis?.mode || '';
      map.dataset.bearing = S.axis?.bearing == null ? '' : String(S.axis.bearing);
      map.dataset.span = spanOk() ? '1' : (verifiedTee() && verifiedFlag() ? '0' : '');
      map.dataset.aimLat = S.axis ? String(S.axis.aimLat) : '';
      map.dataset.aimLng = S.axis ? String(S.axis.aimLng) : '';
      map.dataset.hole = String(S.hole);
      map.dataset.ballLat = S.track.ball && Number.isFinite(S.track.ball.lat) ? String(S.track.ball.lat) : '';
      map.dataset.ballLng = S.track.ball && Number.isFinite(S.track.ball.lng) ? String(S.track.ball.lng) : '';
      const cursor = fromCenter();
      map.dataset.cursorLat = cursor && Number.isFinite(cursor.lat) ? String(cursor.lat) : '';
      map.dataset.cursorLng = cursor && Number.isFinite(cursor.lng) ? String(cursor.lng) : '';
      const pinHere = cupLL();
      map.dataset.flagLat = pinHere && Number.isFinite(pinHere.lat) ? String(pinHere.lat) : '';
      map.dataset.flagLng = pinHere && Number.isFinite(pinHere.lng) ? String(pinHere.lng) : '';
      map.dataset.phase = S.track.phase || '';
      map.dataset.teeSource = S.teeSource || '';
      map.dataset.teeName = S.teeName || '';
      map.dataset.teeLat = S.track.tee && Number.isFinite(S.track.tee.lat) ? String(S.track.tee.lat) : '';
      map.dataset.teeLng = S.track.tee && Number.isFinite(S.track.tee.lng) ? String(S.track.tee.lng) : '';
      map.dataset.flagSource = S.flagSource || '';
      map.dataset.lie = originOnGreen() ? 'green' : (lieAt(ballLL()) || '');
      map.dataset.cursorLie = lieAt(cursor) || '';
      map.dataset.putting = putting() ? '1' : '0';
      map.dataset.moving = '1';
      map.dataset.holeIntent = S.holeIntent ? '1' : '0';
      map.dataset.cmap = S.cmapTried ? (S.cmap ? '1' : '0') : '';
      map.dataset.map = 'loading';
      map.dataset.drawn = '0';
      const settled = !S.moving;
      setMapButtons(false);
      showMapBanner(false, false);
      const dropLayer = () => { if (layer.dataset.pending === '1') layer.remove(); };
      const finishMove = () => { if (gen === S.mapGen && settled) map.dataset.moving = '0'; };
      const failMap = (state, placeholder) => {
        if (gen !== S.mapGen) { dropLayer(); return; }
        if (state === 'blocked') {
          delete layer.dataset.pending;
          for (const node of [...map.querySelectorAll('.tk-tiles')]) if (node !== layer) node.remove();
        } else dropLayer();
        S.mapReady = false;
        map.dataset.map = state;
        map.dataset.drawn = '0';
        setMapButtons(false);
        showMapBanner(true, placeholder);
        finishMove();
      };
      const photoDrawn = img => {
        if (!img || !img.complete || img.naturalWidth < 32 || img.naturalHeight < 32) return false;
        const box = map.getBoundingClientRect();
        const tile = img.getBoundingClientRect();
        const ax = box.left + box.width / 2, ay = box.top + box.height * 0.42;
        if (!(tile.width > 8 && tile.height > 8 && tile.left <= ax && tile.right >= ax && tile.top <= ay && tile.bottom >= ay)) return false;
        const canvas = document.createElement('canvas');
        canvas.width = 8; canvas.height = 8;
        const g = canvas.getContext('2d', { willReadFrequently: true });
        if (!g) return false;
        try {
          g.drawImage(img, 0, 0, 8, 8);
          const data = g.getImageData(0, 0, 8, 8).data;
          let min = 765, max = 0;
          for (let i = 0; i < data.length; i += 4) {
            const v = data[i] + data[i + 1] + data[i + 2];
            if (v < min) min = v;
            if (v > max) max = v;
          }
          return max - min > 18;
        } catch { return false; }
      };
      const publish = (retry = true) => {
        if (gen !== S.mapGen) { dropLayer(); return; }
        const kinds = sampleUrls.map(url => S.tileCache.get(url)?.kind || '');
        if (!kinds.length || kinds.some(k => !k)) {
          S.mapReady = false;
          map.dataset.map = 'loading';
          map.dataset.drawn = '0';
          setMapButtons(false);
          showMapBanner(false, false);
          return;
        }
        if (!kinds.every(k => k === 'real')) {
          if (tileZ > Number(R().IMAGERY_ZOOM_MAX) && kinds.some(k => k === 'placeholder' || k === 'error')) {
            S.greenTiles = false;
            S.tileCap = Number(R().IMAGERY_ZOOM_MAX);
            S.cam.z = Number(R().IMAGERY_ZOOM_MAX);
            paintMap();
            return;
          }
          failMap('blocked', kinds.some(k => k === 'placeholder'));
          return;
        }
        const imgFor = url => [...layer.querySelectorAll('img')].find(img => img.dataset.url === url);
        const decoded = sampleUrls.every(url => {
          const img = imgFor(url);
          return !!(img && img.complete && img.naturalWidth > 0);
        });
        if (!decoded) {
          S.mapReady = false;
          map.dataset.map = 'loading';
          map.dataset.drawn = '0';
          setMapButtons(false);
          showMapBanner(false, false);
          return;
        }
        const aimImg = imgFor(aim);
        if (!photoDrawn(aimImg)) {
          if (retry) { requestAnimationFrame(() => { if (gen === S.mapGen) publish(false); }); return; }
          failMap('error', false);
          return;
        }
        delete layer.dataset.pending;
        for (const node of [...map.querySelectorAll('.tk-tiles')]) if (node !== layer) node.remove();
        S.mapReady = true;
        map.dataset.map = 'ready';
        map.dataset.drawn = '1';
        setMapButtons(true);
        showMapBanner(false, false);
        finishMove();
      };
      tiles.forEach((t, i) => {
        const img = layer.querySelector(`[data-i="${i}"]`);
        loadTile(t.url).then(rec => {
          if (gen !== S.mapGen) { dropLayer(); return; }
          if (img) img.dataset.url = t.url;
          const kick = () => { if (gen === S.mapGen) publish(); };
          if (img && rec.objectUrl && img.getAttribute('src') !== rec.objectUrl) {
            img.onload = kick;
            img.onerror = () => { if (gen === S.mapGen && (t.url === aim || sampleUrls.includes(t.url))) failMap('error', false); };
            img.src = rec.objectUrl;
            if (img.complete) kick();
          } else if (rec.kind === 'error' || !rec.objectUrl) kick();
          else kick();
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
    const postShot = async (land, result, from, club, intent) => {
      if (retro && typeof H.onSave === 'function') {
        const travel = from && land ? hav(from, land) : null;
        const lost = result === 'lost' || result === 'penalty';
        const puttShot = !lost && originOnGreen();
        const shots = await H.onSave({
          hole: S.hole,
          from: from || S.track.ball || S.track.tee,
          land,
          result: result || null,
          club: result === 'penalty' || result === 'lost' ? '' : (club || ''),
          penalty: result === 'penalty',
          lie: originOnGreen() ? 'green' : null,
          intent: intent || (S.recovery ? 'recovery' : null),
          distance_m: lost ? null : (travel != null ? Math.round(travel * 10) / 10 || null : null),
          distance_kind: lost ? 'unknown' : (travel != null ? (puttShot ? 'estimated' : 'estimated') : null),
        });
        if (!S.alive || shots == null) return false;
        if (Array.isArray(shots)) S.saved = shots;
        const rows = (Array.isArray(shots) ? shots : []).filter(s => Number(s.hole) === Number(S.hole));
        return rows[rows.length - 1]?.id || null;
      }
      const body = intent === 'conceded'
        ? { client_id: cid(), hole: S.hole, intent: 'conceded' }
        : { client_id: cid(), hole: S.hole, lat: land.lat, lng: land.lng, accuracy_m: S.acc };
      if (intent !== 'conceded' && result) body.result = result;
      if (intent !== 'conceded' && club && result !== 'penalty') body.club = String(club).slice(0, 8);
      if (intent !== 'conceded' && S.recovery) body.intent = 'recovery';
      else if (intent && intent !== 'conceded') body.intent = intent;
      const lie = lieAt(land);
      if (lie && ['tee', 'fairway', 'rough', 'bunker', 'green'].includes(lie)) body.lie = lie;
      const r = await api(`/api/live-rounds/${encodeURIComponent(S.id)}/shots`, { method: 'POST', body: JSON.stringify(body) });
      S.shots = r.shots || S.shots;
      const rows = (S.shots || []).filter(s => s.hole === S.hole);
      return rows[rows.length - 1]?.id || null;
    };
    const markRecovery = async () => {
      if (!S.alive || S.busy || S.live?.ended_at || S.done) return;
      const here = fromCenter();
      if (!here || !Number.isFinite(here.lat)) { S.msg = 'No hay un punto para marcar.'; render(); return; }
      const phase = S.track.phase;
      if (phase !== 'tracking') return;
      const from = S.track.ball || S.track.tee;
      const club = clubNow();
      const out = R().trackEnter(S.track, here, club || null, false, false);
      if (!out.recorded) return;
      const marked = {
        ...out.state,
        marks: out.state.marks.map((m, i, arr) => i === arr.length - 1 ? { ...m, recovery: true } : m),
      };
      S.busy = true;
      S.recovery = true;
      try {
        const id = await postShot(here, null, from, club);
        if (!S.alive || id === false) return;
        S.track = marked;
        S.done = false;
        S.msg = '';
        S.frame = 'play';
        S.panned = false;
        S.adjusted = false;
        syncClubToOrigin();
        const frame = targetFrame();
        S.busy = false;
        render();
        if (frame) await moveCam(frame);
      } catch (e) {
        if (!S.alive) return;
        S.msg = e.message || 'No se pudo marcar.';
        S.busy = false;
        render();
      } finally {
        S.recovery = false;
        if (S.alive) S.busy = false;
      }
    };

    const summaryFrame = (ends, W, Hh) => {
      const tee = ends.tee && R().knownPoint(ends.tee.lat, ends.tee.lng);
      const flag = ends.flag && R().knownPoint(ends.flag.lat, ends.flag.lng);
      if (!tee || !flag || !R().holeSpan(tee, flag)) return null;
      const [tx, ty] = proj(tee.lat, tee.lng);
      const [fx, fy] = proj(flag.lat, flag.lng);
      const dist = Math.hypot(tx - fx, ty - fy);
      const holeBearing = R().bearingDeg(tee, flag);
      if (!(dist > 0) || holeBearing == null) return null;
      const top = 132, bottom = 252, sideL = 176, sideR = 64;
      const safeH = Math.max(180, Hh - top - bottom);
      const z = Math.max(15, Math.min(Number(R().IMAGERY_ZOOM_MAX) || 17, Math.log2((safeH - 64) / (dist * 256))));
      const n = 2 ** z;
      const midX = (tx + fx) / 2, midY = (ty + fy) / 2;
      const dx = (sideL + (W - sideR)) / 2 - W / 2;
      const dy = (top + (Hh - bottom)) / 2 - Hh * 0.42;
      const rad = -holeBearing * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
      const px = dx * c + dy * s, py = -dx * s + dy * c;
      return { mode: 'overview', z, cx: midX - px / (n * 256), cy: midY - py / (n * 256), bearing: holeBearing, aimLat: flag.lat, aimLng: flag.lng };
    };
    const targetFrame = () => {
      const map = mapBox();
      const W = map?.clientWidth || innerWidth, Hh = map?.clientHeight || innerHeight;
      const ball = S.track.ball && R().knownPoint(S.track.ball.lat, S.track.ball.lng);
      const ends = cameraEnds();
      S.tileCap = Number(R().IMAGERY_ZOOM_MAX) || 17;
      if (S.done && ends.tee && ends.flag) {
        const fitted = summaryFrame(ends, W, Hh);
        if (fitted) return fitted;
      }
      if (!S.done && !S.panned && S.track.phase === 'tracking' && (putting() || nearCup())) {
        const cup = cupLL();
        const zoomed = cup && R().frameHole(null, cup, 'flag', { width: W, height: Hh });
        if (zoomed) {
          const z = S.greenTiles === false ? Number(R().IMAGERY_ZOOM_MAX) : 19;
          zoomed.z = z;
          S.tileCap = z;
          if (atCup()) {
            const n = 2 ** z;
            zoomed.cx -= 44 / (n * 256);
            zoomed.cy -= 58 / (n * 256);
          }
          return zoomed;
        }
      }
      const mode = S.done ? 'overview' : (S.frame || 'overview');
      return tightenOpen(R().frameHole(ends.tee, ends.flag, mode, { width: W, height: Hh }, ball)
        || ((ends.flag || ends.loose) ? R().frameHole(ends.flag ? null : ends.loose, ends.flag, 'point', { width: W, height: Hh }) : null), ends, W, Hh);
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
        paintRead();
        if (i < frames) setTimeout(step, 70);
        else { S.moving = false; resolve(); }
      };
      step();
    });
    const numbered = state => ({
      ...state,
      marks: state.marks.map((m, i, arr) => {
        if (m.drop || (Number.isInteger(m.n) && m.n > 0)) return m;
        const prior = arr.slice(0, i).reduce((max, x) => Math.max(max, Number(x.n) || 0), 0);
        return { ...m, n: prior + 1 };
      }),
    });
    const finishPutt = async intent => {
      if (!S.alive || S.busy || S.live?.ended_at || S.done) return;
      const from = S.track.ball || S.track.tee;
      const cup = cupLL();
      if (!from || !cup || S.track.phase !== 'tracking') return;
      const club = putterChoice();
      const out = R().trackEnter(S.track, cup, club, true, true);
      if (!out.recorded) return;
      S.busy = true;
      S.holdCam = true;
      try {
        const id = await postShot(cup, 'holed', from, club, intent);
        if (!S.alive || id === false) { S.busy = false; S.holdCam = false; return; }
        S.track = numbered(out.state);
        S.done = true;
        S.frame = 'overview';
        S.panned = false;
        S.adjusted = false;
        const strokes = (S.track.marks || []).filter(m => m.countsStroke).length;
        if (H.onHoleClosed && strokes > 0) H.onHoleClosed(S.hole, strokes);
        S.msg = '';
        S.busy = false;
        render();
        const framed = targetFrame();
        if (framed) await moveCam(framed);
      } catch (e) {
        if (!S.alive) return;
        S.msg = e.message || 'No se pudo cerrar el hoyo.';
        S.busy = false;
        render();
      }
      S.holdCam = false;
    };
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
        if (phase === 'confirmTee') S.teeSource = verifiedTee() ? 'catalogo' : 'jugador';
        if (phase === 'confirmFlag') S.flagSource = verifiedFlag() ? 'catalogo' : 'jugador';
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
      const inCup = meters != null && R().inTheCup && R().inTheCup(meters);
      S.puttMeters = null;
      const from = S.track.ball || S.track.tee;
      const club = clubNow();
      const holed = phase === 'tracking' && inCup && putting();
      const out = R().trackEnter(S.track, here, club || null, holed, inCup);
      if (!out.recorded) return;
      S.busy = true;
      S.holdCam = true;
      try {
        const land = inCup && out.holed && S.track.flag ? S.track.flag : here;
        const id = await postShot(land, out.holed ? 'holed' : (phase === 'penaltyWhere' ? 'penalty' : null), from, club);
        if (!S.alive || id === false) { S.busy = false; return; }
        S.track = numbered(out.state);
        if (out.holed) {
          S.done = true; S.frame = 'overview';
          const rows = (S.saved || []).filter(s => Number(s.hole) === Number(S.hole)).length;
          const marks = (S.track.marks || []).filter(m => m.countsStroke).length;
          const strokes = Math.max(rows, marks);
          if (H.onHoleClosed && strokes > 0) H.onHoleClosed(S.hole, strokes);
        }
        else if (phase === 'tracking') S.frame = 'play';
        if (phase === 'penaltyWhere') S.penaltyShotId = id;
        S.holeIntent = false;
        S.puttDraft = '';
        S.puttMeters = null;
        S.clubAuto = '';
        S.panned = false;
        S.adjusted = false;
        syncClubToOrigin();
        S.msg = '';
        const frame = targetFrame();
        S.busy = false;
        render();
        if (frame && phase === 'tracking') await moveCam(frame);
      } catch (e) { if (!S.alive) return; S.msg = e.message || 'No se pudo marcar.'; S.busy = false; render(); }
      if (!S.alive) return;
      S.busy = false;
      S.holdCam = false;
    };

    const goHole = async n => {
      if (n < 1 || n > 18 || S.busy) return;
      if (retro) {
        if (!S.alive) return;
        S.hole = n; S.panned = false; S.msg = ''; S.penaltyShotId = null; S.history = false; S.done = false; S.reopen = false; S.editN = 0; S.pickClub = false; S.buenaPick = false; S.moveShot = false; S.editPoint = ''; S.aimLL = null; S.askDel = false; S.teeSource = ''; S.teeName = ''; S.moveTee = false; S.teeOpen = false; S.flagSource = '';
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
      S.hole = n; S.track = R().trackNew(); S.panned = false; S.msg = ''; S.penaltyShotId = null; S.teeSource = ''; S.teeName = ''; S.moveTee = false; S.teeOpen = false; S.flagSource = '';
      restoreSalida();
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
      if (!S.alive || S.undoing || !S.track.marks.length) return;
      const last = S.track.marks[S.track.marks.length - 1];
      const prev = S.track.marks[S.track.marks.length - 2];
      const span = last.provisional ? 3 : (last.penalty && prev && prev.lost ? 2 : (last.lost ? 2 : 1));
      const marks = S.track.marks.slice(0, -span);
      const ball = playingPoint(marks);
      if (last.drop) {
        S.track = { ...S.track, marks, ball: ball ? { ...ball } : null, phase: 'relief' };
        S.done = false;
        render();
        return;
      }
      const apply = failed => {
        if (!S.alive) return;
        if (S.track.marks[S.track.marks.length - 1] !== last) return;
        S.msg = failed || '';
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
        render();
      };
      const ids = (S.saved || []).filter(s => Number(s.hole) === Number(S.hole)).slice(-span).map(s => s.id).filter(Boolean);
      if (!ids.length || typeof H.onUndo !== 'function') { apply(''); return; }
      S.undoing = true;
      try {
        let shots = null;
        for (const id of ids.slice().reverse()) {
          shots = await H.onUndo(id);
          if (!S.alive || shots == null) return;
          if (Array.isArray(shots)) S.saved = shots;
        }
        apply('');
      } catch (e) {
        if (!S.alive) return;
        apply(e.message || 'No se pudo deshacer el golpe.');
      } finally { S.undoing = false; }
    };

    const patchShot = async partial => {
      const rows = (S.saved || []).filter(s => Number(s.hole) === Number(S.hole));
      const s = rows[S.editN - 1];
      if (!s || !s.id || typeof H.onEdit !== 'function') { S.msg = 'Este golpe no se puede editar.'; render(); return; }
      S.busy = true;
      try {
        const end = partial.end || null;
        const start = partial.start || null;
        const has = key => Object.prototype.hasOwnProperty.call(partial, key);
        let lie = has('lie') ? partial.lie : (s.lie || null);
        const intent = has('intent') ? partial.intent : (s.intent || null);
        const club = partial.club != null ? partial.club : (s.club || null);
        if (partial.club != null && R().isPutterClub) {
          const nowPutt = R().isPutterClub(partial.club, clubLabel(partial.club));
          const wasPutt = R().isPutterClub(String(s.club || ''), clubLabel(s.club));
          if (nowPutt) lie = 'green';
          else if (wasPutt || s.lie === 'green') lie = null;
        }
        const shots = await H.onEdit({
          shot_id: s.id, hole: S.hole,
          club, result: s.result || null, lie, intent,
          lat: start ? start.lat : (s.lat ?? null), lng: start ? start.lng : (s.lng ?? null),
          end_lat: end ? end.lat : (s.end_lat ?? null), end_lng: end ? end.lng : (s.end_lng ?? null),
          penalty_strokes: s.penalty_strokes != null ? Number(s.penalty_strokes) : (s.result === 'penalty' ? 1 : 0),
          distance_m: s.distance_kind === 'manual' ? s.distance_m : null,
          distance_kind: s.distance_kind === 'manual' ? 'manual' : null,
        });
        if (!S.alive) return;
        if (Array.isArray(shots)) S.saved = shots;
        armRetro();
        S.pickClub = false; S.buenaPick = false; S.moveShot = false; S.editPoint = ''; S.msg = '';
      } catch (e) { if (S.alive) S.msg = e.message || 'No se pudo guardar el golpe.'; }
      S.busy = false;
      if (S.alive) render();
    };
    const wire = () => {
      el.querySelectorAll('.tk-clubface').forEach(img => {
        img.onerror = () => {
          const next = img.getAttribute('data-fallback') || '';
          const last = img.getAttribute('data-last') || '';
          const src = img.getAttribute('src') || '';
          if (next && src !== next) {
            img.dataset.kind = 'silhouette';
            img.setAttribute('src', next);
            return;
          }
          img.onerror = null;
          if (last && src !== last) {
            img.dataset.kind = 'silhouette';
            img.setAttribute('src', last);
          }
        };
      });
      const map = mapBox();
      const club = el.querySelector('#play-club');
      if (club) club.onchange = () => {
        S.club = club.value; S.clubChosen = true; S.clubAuto = 'chosen'; paintDriver();
        const picked = club.selectedOptions && club.selectedOptions[0];
        const label = picked ? picked.textContent : '';
        const img = el.querySelector('#play-club-tile img');
        const tileBtn = el.querySelector('#play-club-tile');
        if (img) { const thumb = faceOf(club.value, label); img.src = thumb.src; img.dataset.kind = thumb.kind || ''; }
        if (tileBtn) {
          tileBtn.setAttribute('aria-label', clubLabel(label) || 'Palo');
          const name = tileBtn.querySelector('b');
          const picked = clubChoices.find(c => c.id === club.value);
          const yd = picked ? tileYards(picked) : '';
          if (name) name.textContent = gridName(label) || 'Palo';
          const span = tileBtn.querySelector('span');
          let yards = tileBtn.querySelector('small');
          if (yd) {
            if (!yards && span) { yards = document.createElement('small'); span.appendChild(yards); }
            if (yards) yards.textContent = yd;
          } else if (yards) yards.remove();
        }
      };
      const tile = el.querySelector('#play-club-tile');
      const sheet = el.querySelector('#play-club-sheet');
      const bagList = sheet ? sheet.querySelector('.tk-clublist') : null;
      const list = el.querySelector('#play-club-list');
      let tileGuard = 0;
      const setSheet = open => {
        if (bagList) bagList.hidden = !open;
        if (sheet) sheet.hidden = !open;
      };
      const chooseClub = (id, via) => {
        tileGuard = Date.now() + 450;
        if (club) club.dataset.input = via;
        if (list) list.querySelectorAll('button').forEach(b => {
          const mine = b.getAttribute('data-club') === id;
          b.classList.toggle('on', mine);
          if (mine) b.classList.remove('sug');
        });
        const punch = S.buenaPick && !S.editN;
        S.buenaPick = false;
        S.pickClub = false;
        if (S.editN) { patchShot({ club: id }); return; }
        S.club = id;
        S.clubChosen = true;
        if (club) {
          club.value = id;
          try { if (club.onchange) club.onchange(); } catch (err) { /* the choice still stands */ }
        }
        setSheet(false);
        if (punch) markRecovery();
      };
      // iPhone drops the click when the page keeps touch-action:none. The finger
      // is the selection; the click only covers a mouse.
      const armPress = (btn, action) => {
        let fromTouch = false;
        let start = null;
        btn.addEventListener('touchstart', ev => {
          const t = ev.changedTouches && ev.changedTouches[0];
          start = t ? { x: t.clientX, y: t.clientY } : null;
        }, { passive: true });
        btn.addEventListener('touchend', ev => {
          if (ev.touches && ev.touches.length) return;
          const t = ev.changedTouches && ev.changedTouches[0];
          if (!t || !start || Math.hypot(t.clientX - start.x, t.clientY - start.y) > 12) return;
          ev.preventDefault();
          ev.stopPropagation();
          fromTouch = true;
          setTimeout(() => { fromTouch = false; }, 450);
          action('touch');
        }, { passive: false });
        btn.addEventListener('click', ev => {
          ev.preventDefault();
          ev.stopPropagation();
          if (fromTouch) { fromTouch = false; return; }
          action('click');
        });
      };
      if (tile && sheet) armPress(tile, () => { if (Date.now() < tileGuard) return; S.buenaPick = false; setSheet(sheet.hidden); });
      const shut = el.querySelector('#play-club-close');
      if (shut) armPress(shut, () => { S.buenaPick = false; S.pickClub = false; setSheet(false); });
      if ((S.pickClub || S.buenaPick) && bagList && sheet) setSheet(true);
      if (list) list.querySelectorAll('button').forEach(btn => armPress(btn, via => chooseClub(btn.getAttribute('data-club') || '', via)));
      const lieBtn = el.querySelector('#play-lie');
      if (lieBtn) lieBtn.onclick = () => {
        const ball = ballLL();
        if (!ball) return;
        S.playerLie = 'green';
        S.lieBall = { ...ball };
        S.clubAuto = '';
        syncClubToOrigin();
        S.frame = 'play';
        S.panned = false;
        S.adjusted = false;
        S.msg = '';
        const frame = targetFrame();
        render();
        if (frame) moveCam(frame);
      };
      const statsBtn = el.querySelector('#play-stats');
      if (statsBtn) statsBtn.onclick = async () => {
        if (!S.derived || typeof H.onStats !== 'function' || !R().emptyStatFill) return;
        const body = R().emptyStatFill(S.storedMark || null, S.derived);
        if (!body) { S.msg = 'La tarjeta ya tiene estos números.'; render(); return; }
        try {
          const saved = await H.onStats({ hole: S.hole, ...body });
          if (!S.alive || saved == null) return;
          S.storedMark = saved.mark || { ...(S.storedMark || {}), ...body, rev: body.rev };
          S.msg = 'Guardé solo lo que faltaba.';
        } catch (e) { if (!S.alive) return; S.msg = e.message || 'No se pudo guardar.'; }
        render();
      };
      const goodBtn = el.querySelector('#play-good');
      if (goodBtn) armPress(goodBtn, () => {
        if (S.club && S.clubChosen) { markRecovery(); return; }
        S.buenaPick = true;
        S.pickClub = true;
        render();
      });
      const postLost = async provisional => {
        const here = fromCenter();
        const from = S.track.ball || S.track.tee;
        const club = clubNow();
        if (!here || !from || !R().trackLost) return;
        S.busy = true;
        try {
          const ids = [];
          const keep = async (land, result, origin, used) => {
            const id = await postShot(land, result, origin, used);
            if (id) ids.push(id);
          };
          await keep(here, 'lost', from, club);
          await keep(from, 'penalty', from, null);
          if (provisional) await keep(here, null, from, club);
          S.track = R().trackLost(S.track, here, club || null);
          if (provisional && here) {
            S.track.ball = { lat: here.lat, lng: here.lng };
            S.track.marks.push({ id: S.track.nextID, lat: here.lat, lng: here.lng, club: club || null, countsStroke: true, holed: false, penalty: false, drop: false, provisional: true });
            S.track.nextID += 1;
          }
          S.lostPair = ids;
          S.msg = '';
          S.panned = false;
          S.adjusted = false;
          S.frame = 'play';
          fitCam();
        } catch (e) { if (S.alive) S.msg = e.message || 'No se pudo marcar la pelota perdida.'; }
        S.busy = false;
        if (S.alive) render();
      };
      const lostBtn = el.querySelector('#play-lost'); if (lostBtn) lostBtn.onclick = () => postLost(false);
      const provBtn = el.querySelector('#play-lost-prov'); if (provBtn) provBtn.onclick = () => postLost(true);
      const wxBtn = el.querySelector('#play-wx');
      if (wxBtn) wxBtn.onclick = () => { if (S.wxState !== 'none') return; S.wxOpen = !S.wxOpen; render(); };
      const wxRetry = el.querySelector('#play-wx-retry');
      if (wxRetry) wxRetry.onclick = () => { if (S.loadWx) S.loadWx(true); };
      const openFlag = () => { S.track = { ...S.track, phase: 'confirmFlag' }; S.frame = 'flag'; S.adjusted = false; S.panned = false; fitCam(); render(); };
      const flagBtn = el.querySelector('#play-flag');
      if (flagBtn) flagBtn.onclick = openFlag;
      const flagChip = el.querySelector('#play-flag-chip');
      if (flagChip) flagChip.onclick = openFlag;
      const targetBtn = el.querySelector('#play-target');
      if (targetBtn) targetBtn.onclick = () => { S.panned = false; S.adjusted = false; S.frame = S.done ? 'overview' : 'play'; fitCam(); };
      const gpsBtn = el.querySelector('#play-gps');
      if (gpsBtn) gpsBtn.onclick = () => {
        const focus = ll => {
          const p = proj(ll.lat, ll.lng);
          S.cam.cx = p[0]; S.cam.cy = p[1];
          S.panned = true; S.adjusted = true;
          paintMap(); paintRead();
        };
        if (S.pos && R().knownPoint(S.pos.lat, S.pos.lng)) { focus(S.pos); return; }
        if (!navigator.geolocation) { S.msg = 'No hay una ubicación del GPS.'; render(); return; }
        navigator.geolocation.getCurrentPosition(
          p => {
            const lat = p.coords.latitude, lng = p.coords.longitude;
            if (!S.alive || !R().knownPoint(lat, lng)) { if (S.alive) { S.msg = 'No hay una ubicación del GPS.'; render(); } return; }
            S.pos = { lat, lng };
            focus({ lat, lng });
          },
          () => { if (!S.alive) return; S.msg = 'No hay una ubicación del GPS.'; render(); },
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 },
        );
      };
      const prev = el.querySelector('#tkprev'); if (prev) prev.onclick = () => goHole(S.hole - 1);
      const next = el.querySelector('#tknext'); if (next) next.onclick = () => goHole(S.hole + 1);
      const set = el.querySelector('#play-set'); if (set) set.onclick = () => commit();
      const hit = el.querySelector('#play-hit'); if (hit) hit.onclick = () => commit();
      const holeOut = el.querySelector('#play-hole-out'); if (holeOut) holeOut.onclick = () => finishPutt(null);
      const concede = el.querySelector('#play-concede'); if (concede) concede.onclick = () => finishPutt('conceded');
      const pen = el.querySelector('#play-penalty');
      const penMenu = el.querySelector('#play-pen-menu');
      if (pen && penMenu) pen.onclick = ev => { ev.preventDefault(); penMenu.hidden = !penMenu.hidden; pen.setAttribute('aria-expanded', penMenu.hidden ? 'false' : 'true'); };
      const stroke = el.querySelector('#play-pen-stroke');
      if (stroke) stroke.onclick = () => { S.track = R().trackPenalty(S.track); render(); };
      const rel = el.querySelector('#play-reload'); if (rel) rel.onclick = () => { S.track = R().trackReload(S.track); S.msg = ''; render(); };
      const drop = el.querySelector('#play-drop'); if (drop) drop.onclick = () => { S.track = R().trackDrop(S.track); render(); };
      const cancel = el.querySelector('#play-cancel'); if (cancel) cancel.onclick = () => {
        if (retro && (S.track.phase === 'confirmTee' || S.track.phase === 'confirmFlag')) skipPrompt();
        else if (S.track.phase === 'drop') { S.track = { ...S.track, phase: 'relief' }; render(); }
        else cancelRelief();
      };
      const undo = el.querySelector('#play-undo'); if (undo) undo.onclick = () => undoLast();
      const editHole = el.querySelector('#play-edit-hole');
      if (editHole) editHole.onclick = () => { S.reopen = true; S.done = false; S.editN = 0; S.pickClub = false; S.buenaPick = false; S.moveShot = false; S.editPoint = ''; S.askDel = false; S.msg = ''; render(); };
      el.querySelectorAll('[data-shot]').forEach(b => { b.onclick = () => { S.editN = Number(b.getAttribute('data-shot')) || 0; S.askDel = false; S.moveShot = false; S.editPoint = ''; S.pickClub = false; render(); }; });
      const clubEdit = el.querySelector('#play-edit-club');
      if (clubEdit) armPress(clubEdit, () => { S.buenaPick = false; S.pickClub = true; S.askDel = false; render(); });
      const savePoint = kind => {
        if (!(S.moveShot && S.editPoint === kind)) { S.editPoint = kind; S.moveShot = true; S.askDel = false; render(); return; }
        const here = fromCenter();
        if (!here) { S.msg = 'No hay un punto en el mapa.'; render(); return; }
        if (kind === 'aim') { S.aimLL = here; S.moveShot = false; S.editPoint = ''; S.msg = ''; render(); return; }
        patchShot(kind === 'start' ? { start: here } : { end: here });
      };
      const startPt = el.querySelector('#play-edit-start'); if (startPt) startPt.onclick = () => savePoint('start');
      const move = el.querySelector('#play-edit-move'); if (move) move.onclick = () => savePoint('end');
      const aimPt = el.querySelector('#play-edit-aim'); if (aimPt) aimPt.onclick = () => savePoint('aim');
      const insert = el.querySelector('#play-edit-insert');
      if (insert) insert.onclick = () => {
        const here = fromCenter();
        if (!here) { S.msg = 'No hay un punto en el mapa.'; render(); return; }
        const from = S.track.ball || S.track.tee;
        S.busy = true;
        postShot(here, null, from, S.club || null).then(() => {
          if (!S.alive) return;
          S.reopen = true; S.done = false;
          armRetro();
          S.busy = false;
          render();
        }).catch(e => { if (!S.alive) return; S.busy = false; S.msg = e.message || 'No se pudo insertar el tiro.'; render(); });
      };
      const buena = el.querySelector('#play-edit-buena');
      if (buena) buena.onclick = () => {
        const rows = (S.saved || []).filter(s => Number(s.hole) === Number(S.hole));
        const s = rows[S.editN - 1];
        if (!s) return;
        patchShot({ intent: s.intent === 'recovery' ? null : 'recovery' });
      };
      const del = el.querySelector('#play-edit-del');
      if (del) del.onclick = () => { S.askDel = true; render(); };
      const yes = el.querySelector('#play-edit-yes');
      if (yes) yes.onclick = () => {
        const rows = (S.saved || []).filter(s => Number(s.hole) === Number(S.hole));
        const s = rows[S.editN - 1];
        if (!s || typeof H.onUndo !== 'function') return;
        S.busy = true;
        H.onUndo(s.id).then(shots => {
          if (!S.alive) return;
          if (Array.isArray(shots)) S.saved = shots;
          S.editN = 0; S.askDel = false; S.reopen = true;
          armRetro();
          S.busy = false;
          render();
        }).catch(e => { if (!S.alive) return; S.busy = false; S.msg = e.message || 'No se pudo borrar el golpe.'; render(); });
      };
      const shutEdit = el.querySelector('#play-edit-x');
      if (shutEdit) shutEdit.onclick = () => { S.editN = 0; S.pickClub = false; S.buenaPick = false; S.moveShot = false; S.editPoint = ''; S.askDel = false; render(); };
      const nextHole = el.querySelector('#play-next'); if (nextHole) nextHole.onclick = () => goHole(Math.min(18, S.hole + 1));
      const close = el.querySelector('#rc-close'); if (close) close.onclick = () => { if (H.back) location.hash = H.back; };
      const retry = el.querySelector('#tk-retry'); if (retry) retry.onclick = () => {
        for (const [url, rec] of S.tileCache) if (!rec || rec.kind !== 'real') S.tileCache.delete(url);
        paintMap();
      };
      const more = el.querySelector('#play-more'); if (more) more.onclick = () => { S.more = !S.more; render(); };
      const shotsMore = el.querySelector('#play-shots-more');
      if (shotsMore) shotsMore.onclick = () => { S.railOpen = !(S.railHole === S.hole && S.railOpen); S.railHole = S.hole; render(); };
      const hist = el.querySelector('#play-history'); if (hist) hist.onclick = () => { S.history = !S.history; render(); };
      const zoomBy = d => {
        stopCam();
        const cap = Number(R().VISUAL_ZOOM_MAX) || (R().IMAGERY_ZOOM_MAX + 2.15);
        S.tileCap = Number(R().IMAGERY_ZOOM_MAX) || 17;
        S.cam.z = Math.max(15, Math.min(cap, +(S.cam.z + d).toFixed(3)));
        S.adjusted = true;
        paintMap(); paintRead();
      };
      const zin = el.querySelector('#play-zoom-in'); if (zin) zin.onclick = () => zoomBy(0.4);
      const zout = el.querySelector('#play-zoom-out'); if (zout) zout.onclick = () => zoomBy(-0.4);
      const teeBtn = el.querySelector('#play-tee');
      if (teeBtn) teeBtn.onclick = () => { S.teeOpen = !S.teeOpen; render(); };
      el.querySelectorAll('[data-tee]').forEach(b => { b.onclick = () => {
        const name = b.getAttribute('data-tee') || '';
        const box = teeChoices().find(x => x.name === name);
        if (!box) return;
        S.teeOpen = false;
        if (box.lat != null && box.lng != null) {
          applySalida(box.lat, box.lng, box.name, 'tee');
          S.panned = false;
          fitCam();
        } else {
          S.teeName = box.name;
          S.teeSource = 'tee';
          S.moveTee = false;
          const tee = S.track.tee;
          if (tee && Number.isFinite(tee.lat) && Number.isFinite(tee.lng)) writeSalida({ lat: tee.lat, lng: tee.lng, name: box.name, source: 'tee' });
          else { try { localStorage.setItem(salidaKey(), JSON.stringify({ name: box.name, source: 'tee' })); } catch { /* the name stays for this hole on this device */ } }
        }
        render();
      }; });
      const moveTee = el.querySelector('#play-move-tee');
      if (moveTee) moveTee.onclick = () => {
        if (!S.moveTee) { S.moveTee = true; S.teeOpen = false; render(); return; }
        const here = fromCenter();
        if (!here || !Number.isFinite(here.lat)) { S.msg = 'No hay un punto en el mapa.'; render(); return; }
        applySalida(here.lat, here.lng, S.teeName, 'jugador');
        render();
      };
      const gpsTee = el.querySelector('#play-tee-gps');
      if (gpsTee) gpsTee.onclick = () => {
        const place = point => {
          if (!S.alive || !point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return;
          applySalida(point.lat, point.lng, S.teeName, 'jugador');
          S.panned = false;
          fitCam();
          render();
        };
        if (S.pos && Number.isFinite(S.pos.lat) && Number.isFinite(S.pos.lng)) { place(S.pos); return; }
        if (!navigator.geolocation) { S.msg = 'Este dispositivo no entrega la ubicación.'; render(); return; }
        navigator.geolocation.getCurrentPosition(
          p => place({ lat: p.coords.latitude, lng: p.coords.longitude }),
          () => { if (!S.alive) return; S.msg = 'No hay una ubicación del GPS.'; render(); },
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 4000 },
        );
      };
      el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
        const id = b.getAttribute('data-del');
        if (!id || typeof H.onUndo !== 'function') return;
        H.onUndo(id).then(shots => { if (!S.alive || shots == null) return; if (Array.isArray(shots)) S.saved = shots; S.msg = ''; render(); }).catch(e => { if (!S.alive) return; S.msg = e.message || 'No se pudo borrar el golpe.'; render(); });
      });
      if (!map) return;
      let drag = null, last = null, gesture = null;
      const pts = new Map();
      map.onpointerdown = e => {
        if (e.button) return;
        stopCam();
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        drag = pts.size >= 2 ? 'pinch' : 'pan';
        last = { x: e.clientX, y: e.clientY };
        gesture = { x: e.clientX, y: e.clientY, moved: 0 };
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
        if (gesture) gesture.moved += Math.hypot(dx, dy);
        const rad = S.cam.hdg * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
        const px = -dx * c + dy * s, py = -dx * s - dy * c;
        const n = 2 ** S.cam.z;
        S.cam.cx += px / (n * 256); S.cam.cy += py / (n * 256);
        S.panned = true;
        S.adjusted = true;
        if (S.moveTee) {
          const here = fromCenter();
          const hasStroke = (S.track.marks || []).some(m => m.countsStroke);
          if (here && Number.isFinite(here.lat)) {
            S.track = { ...S.track, tee: { lat: here.lat, lng: here.lng }, ball: hasStroke ? S.track.ball : { lat: here.lat, lng: here.lng } };
            S.teeSource = 'jugador';
          }
        }
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        paintMap(); paintRead();
      };
      map.onpointerup = map.onpointercancel = e => {
        const tap = gesture && gesture.moved < 8 && e && e.type !== 'pointercancel';
        const draggedTee = S.moveTee && gesture && gesture.moved >= 8;
        const dragged = !!(gesture && gesture.moved >= 8);
        if (e && e.pointerId != null) pts.delete(e.pointerId);
        if (pts.size >= 2) drag = 'pinch';
        else if (pts.size === 1) { drag = 'pan'; const only = [...pts.values()][0]; last = only ? { x: only.x, y: only.y } : last; }
        else { drag = null; last = null; gesture = null; }
        if (tap && S.moveTee && e) {
          const here = pointAt(e.clientX, e.clientY);
          if (here && Number.isFinite(here.lat)) {
            applySalida(here.lat, here.lng, S.teeName, 'jugador');
            render();
          }
        } else if (draggedTee && S.track.tee && Number.isFinite(S.track.tee.lat)) {
          writeSalida({ lat: S.track.tee.lat, lng: S.track.tee.lng, name: S.teeName, source: 'jugador' });
        }
        if (dragged && map.getAttribute('data-map') === 'ready') setMapButtons(true);
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

    const layoutQuery = () => {
      const day = String(S.live?.date || '').slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(day) ? `played_on=${encodeURIComponent(day)}` : 'layout=current';
    };

    const loadExtras = async () => {
      const cid0 = S.live?.course_id;
      try { if (cid0) { const C = await api(`/api/gps/courses/${encodeURIComponent(cid0)}?${layoutQuery()}`); S.course = C.course || C; } } catch (e) {}
      try {
        const club = S.course?.club_code || S.live?.club_code, course = S.course?.course || S.live?.course || S.live?.vm_course;
        if (club && course) S.cmap = await api(`/api/course-maps/${encodeURIComponent(club)}/${encodeURIComponent(course)}?${layoutQuery()}`);
      } catch (e) {}
      try {
        const q = S.course?.course_id || cid0 ? `course_id=${encodeURIComponent(S.course?.course_id || cid0)}` : '';
        if (q) S.strat = await api('/api/strategy?' + q);
      } catch (e) {}
      await loadRoundWx();
      if (!S.alive) return;
      if (!S.panned && !S.adjusted) fitCam();
      render();
    };

    const loadCourseMap = async () => {
      const club = S.course?.club_code || S.live?.club_code;
      const course = S.course?.course || S.live?.course || S.live?.vm_course;
      if (!club || !course || course === 'Golflet') return;
      try { S.cmap = await api(`/api/course-maps/${encodeURIComponent(club)}/${encodeURIComponent(course)}?${layoutQuery()}`); }
      catch (e) { S.cmap = null; }
      S.cmapTried = true;
      if (!S.alive || S.busy || S.holdCam) return;
      const fresh = !S.panned && !S.adjusted && S.teeSource !== 'jugador' && !(S.track.marks || []).some(m => m.countsStroke);
      if (S.moving && !fresh) return;
      if (fresh) armRetro();
      const clubKey = () => `${S.club}|${S.clubChosen ? 1 : 0}|${S.clubAuto}`;
      const prevClub = clubKey();
      if (S.clubAuto !== 'chosen') syncClubToOrigin();
      const keepFrame = S.panned || S.adjusted || (S.track.marks || []).some(m => m.countsStroke);
      const prevCam = { z: S.cam.z, cx: S.cam.cx, cy: S.cam.cy, hdg: S.cam.hdg || 0 };
      if (!keepFrame) fitCam();
      const camMoved = !keepFrame && (
        S.cam.z !== prevCam.z || Math.abs(S.cam.cx - prevCam.cx) > 1e-9 || Math.abs(S.cam.cy - prevCam.cy) > 1e-9 || (S.cam.hdg || 0) !== prevCam.hdg
      );
      const source = cmapHole()?.green?.source || '';
      if (fresh || clubKey() !== prevClub || camMoved || source === 'openstreetmap' || source === 'satellite_visual' || source === 'course_map') { render(); return; }
      const map = mapBox();
      if (!map) return;
      map.dataset.cmap = S.cmap ? '1' : '0';
      const svg = map.querySelector('.tk-svg');
      if (svg) svg.innerHTML = overlaySVG(map.clientWidth || innerWidth, map.clientHeight || innerHeight);
    };
    if (retro) {
      armRetro();
      if (S.track.phase === 'tracking' || S.track.phase === 'relief') S.frame = 'play';
      else if (S.track.phase === 'confirmFlag') S.frame = 'flag';
      else if (S.suggestedTee) S.frame = 'tee';
      else S.frame = 'seek';
    }
    document.documentElement.classList.add('rc-map');
    fitCam(); render();
    loadDriverHistory();
    const loadRoundWx = async (retry) => {
      const day = String(S.live?.date || '').slice(0, 10);
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
      const pin = (S.track && S.track.tee) || verifiedTee() || cupLL() || S.pos;
      const playingNow = day === today;
      if (playingNow) {
        if (pin && Number.isFinite(+pin.lat) && Number.isFinite(+pin.lng)) {
          try {
            const now = await api(`/api/weather/now?lat=${pin.lat}&lng=${pin.lng}${retry ? '&retry=1' : ''}`);
            if (now && now.kmh != null && now.from_deg != null) {
              S.wind = { kmh: now.kmh, from_deg: now.from_deg, source: now.source || 'Open-Meteo', temp_c: now.temp_c ?? null, gust_kmh: now.gust_kmh ?? null, precip_mm: now.precip_mm ?? null, hhmm: now.hhmm || '', at: now.at || '', stale: !!now.stale };
              S.wxState = 'now';
              S.wxWhy = '';
              if (S.alive) render();
              return;
            }
            S.wxWhy = 'Open-Meteo y MET Norway no devolvieron viento.';
          } catch (e) { S.wxWhy = (e && e.message) || 'Open-Meteo y MET Norway no devolvieron viento.'; }
        } else S.wxWhy = 'Este hoyo no tiene un punto para pedir el clima.';
      } else if (S.roundId) {
        try {
          const w = await api(`/api/rounds/${encodeURIComponent(S.roundId)}/weather${retry ? '?retry=1' : ''}`);
          const row = w && w.weather;
          if (row && row.wind_kmh != null) {
            S.wind = { kmh: row.wind_kmh, from_deg: row.wind_from_deg ?? row.from_deg ?? null, source: w.source || '', temp_c: row.temp_c ?? null, gust_kmh: row.gust_kmh ?? null, precip_mm: row.precip_mm ?? null, condition: row.condition ?? null, hhmm: '', stale: false };
            S.wxState = 'round';
            S.wxWhy = '';
            if (S.alive) render();
            return;
          }
          S.wxWhy = 'Esa vuelta no tiene viento guardado.';
        } catch (e) { S.wxWhy = (e && e.message) || 'No pudimos leer el clima de la vuelta.'; }
      } else S.wxWhy = 'Open-Meteo y MET Norway no devolvieron viento.';
      S.wind = null;
      S.wxState = 'none';
      if (S.alive) render();
    };
    S.loadWx = loadRoundWx;
    if (retro) loadCourseMap().finally(() => { if (S.alive) loadRoundWx(); });
    if (!retro) { watch(); loadExtras(); }
    const onResize = () => paintMap();
    addEventListener('resize', onResize);
    INST = {
      destroy() {
        removeEventListener('resize', onResize);
        S.alive = false;
        if (S.watch != null && navigator.geolocation) navigator.geolocation.clearWatch(S.watch);
        S.watch = null;
        document.documentElement.classList.remove('rc-map');
      }
    };
  }

  window.GolfletTrack = { mount, destroy() { INST?.destroy(); INST = null; } };
})();
