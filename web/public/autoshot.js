/* t204u/t205u "Golpes detectados": the live GPS track stays ON THE PHONE (localStorage, per round) and is turned into shot candidates by
   window.GolfletPlanCore.autoHole (stops anywhere on the hole + Ya pegué taps + wearable swings). The player reviews each hole (drag the spot,
   change the club, delete/add), confirms it, and only confirmed holes are saved to POST /api/shotlog (source gps|watch|garmin). Estimates are labelled.
   Works only while the app is open with GPS (iOS background location is for the native port, t206u). API_v5 §67.
   Route: #/plan/golpes/<live_round_id>[?h=<hole>]. Wearable input: GolfletAuto.feed(id, [{t, lat, lng, acc?, hole, src:'watch'|'garmin', kind?:'fix'|'swing'}]). */
(() => {
  const C = () => window.GolfletPlanCore;
  const KEY = id => `golflet.track.${id}`, MAXP = 12000, SRC = ['gps', 'watch', 'garmin'];
  const on = () => localStorage.getItem('golflet.auto') !== '0';
  const LIE = { tee: 'salida', fairway: 'fairway', rough: 'rough', bunker: 'bunker', agua: 'agua', bosque: 'bosque', green: 'green' };
  const FROM = { tee: 'salida', tap: 'Ya pegué', swing: 'reloj', parada: 'parada', manual: 'agregado' };
  function load(id) { try { return JSON.parse(localStorage.getItem(KEY(id)) || '{"p":[],"e":[]}'); } catch { return { p: [], e: [] }; } }
  function store(id, d) { if (d.p.length > MAXP) d.p = d.p.slice(-MAXP); try { localStorage.setItem(KEY(id), JSON.stringify(d)); } catch { d.p = d.p.slice(-Math.floor(MAXP / 2)); try { localStorage.setItem(KEY(id), JSON.stringify(d)); } catch {} } }
  const last = {};
  /** one fix from navigator.geolocation (the jugar screen). Kept ≥ 2 s apart, accuracy ≤ 30 m. Compact: [t, lat, lng, acc, hole, src]. */
  function rec(id, fix, hole) { if (!on() || !fix || !id || !(fix.accuracy_m <= 30)) return; const t = fix.t || Date.now(); if (last[id] && t - last[id] < 2000) return; last[id] = t;
    const d = load(id); d.p.push([t, +fix.lat.toFixed(7), +fix.lng.toFixed(7), Math.round(fix.accuracy_m), hole, 0]); store(id, d); }
  /** wearable samples (Apple Watch / Garmin, t206u): same pipeline, the device is kept with every sample. */
  function feed(id, samples) { const d = load(id);
    for (const s of samples || []) { const src = Math.max(0, SRC.indexOf(s.src)); if (!Number.isFinite(s.t) || !Number.isInteger(s.hole)) continue;
      if (s.kind === 'swing') d.e.push([s.t, s.lat ?? null, s.lng ?? null, s.hole, src]); else if (Number.isFinite(s.lat) && Number.isFinite(s.lng)) d.p.push([s.t, s.lat, s.lng, s.acc ?? 10, s.hole, src]); }
    d.p.sort((a, b) => a[0] - b[0]); store(id, d); }
  const holesWithTrack = id => [...new Set(load(id).p.map(x => x[4]))].sort((a, b) => a - b);
  function clear(id, holes) { const d = load(id); if (!holes) { localStorage.removeItem(KEY(id)); return; } d.p = d.p.filter(x => !holes.includes(x[4])); d.e = d.e.filter(x => !holes.includes(x[3])); store(id, d); }

  /* ---------- hole drawing (tee at the bottom, green up), draggable spots ---------- */
  function frame(geo, shots) {
    const line = geo.line?.length ? geo.line : shots.map(s => s.ll), o = line[0] || shots[0]?.ll || [0, 0], g = line[line.length - 1] || o;
    const k = Math.cos(o[1] * Math.PI / 180) * 111320, toM = p => [(p[0] - o[0]) * k, (p[1] - o[1]) * 111320], gm = toM(g), a = Math.atan2(gm[0], gm[1]);
    const rot = ([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
    const fwd = p => { const [x, y] = rot(toM(p)); return [x, -y]; }, back = ([X, Y]) => { const x = X, y = -Y, ca = Math.cos(-a), sa = Math.sin(-a), mx = x * ca - y * sa, my = x * sa + y * ca; return [o[0] + mx / k, o[1] + my / 111320]; };
    const all = [...line, ...(geo.green || []), ...(geo.fairways || []).flat(), ...shots.map(s => s.ll)].map(fwd), xs = all.map(p => p[0]), ys = all.map(p => p[1]);
    const pad = 22, x0 = Math.min(...xs, -40) - pad, x1 = Math.max(...xs, 40) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
    return { fwd, back, vb: [x0, y0, x1 - x0, y1 - y0] };
  }
  const f1 = v => (Math.round(v * 10) / 10).toString();
  function holeSvg(geo, h, F) {
    const P = poly => poly.map(F.fwd).map(p => p.map(f1).join(',')).join(' ');
    let s = `<svg class="as-map" id="asmap" viewBox="${F.vb.map(f1).join(' ')}" role="img" aria-label="Hoyo ${h.hole} con tus golpes">`;
    for (const w of geo.woods || []) s += `<polygon points="${P(w)}" class="as-wood"/>`;
    for (const f of geo.fairways || []) s += `<polygon points="${P(f)}" class="as-fw"/>`;
    for (const w of geo.water || []) s += `<polygon points="${P(w)}" class="as-water"/>`;
    for (const b of geo.bunkers || []) s += `<polygon points="${P(b)}" class="as-sand"/>`;
    for (const t of geo.tees || []) s += `<polygon points="${P(t)}" class="as-tee"/>`;
    if (geo.green) s += `<polygon points="${P(geo.green)}" class="as-green"/>`;
    if (geo.line?.length) s += `<polyline points="${P(geo.line)}" class="as-line"/>`;
    const end = h.green_in || geo.greenCenter, pts = h.shots.map(x => F.fwd(x.ll)).concat(end ? [F.fwd(end)] : []);
    if (pts.length > 1) s += `<polyline points="${pts.map(p => p.map(f1).join(',')).join(' ')}" class="as-path"/>`;
    h.shots.forEach((x, i) => { const [cx, cy] = F.fwd(x.ll); s += `<g class="as-dot${x.from === 'parada' ? ' est' : ''}" data-i="${i}" transform="translate(${f1(cx)},${f1(cy)})"><circle r="9"/><text y="3.6">${i + 1}</text></g>`; });
    return s + '</svg>';
  }

  async function view(el, o) {
    const { H, live, id } = o, e = s => H.esc(s == null ? '' : String(s));
    const R = await H.api(`/api/live-rounds/${encodeURIComponent(id)}`), L = R.live_round, HS = (await H.api(`/api/live-rounds/${encodeURIComponent(id)}/holes`)).holes || [];
    if (!live('gp')) return;
    const club = String(L.club_code || ''), course = String(L.course || ''), date = String(L.date).slice(0, 10), T = R.torneo || {};
    if (T.active && T.no_distance_rule && !L.ended_at) { el.innerHTML = `<div class="stitle">Golpes detectados</div><div class="card gp-relev" role="status"><b>Regla local: sin medidores de distancia</b><span>Revisá tus golpes cuando termine la ronda.</span></div>`; return; }
    const [map, CL, PL, SV] = await Promise.all([
      H.api(`/api/course-maps/${encodeURIComponent(club)}/${encodeURIComponent(course)}`).catch(() => null), H.api('/api/plans/clubs').catch(() => ({ clubs: [] })),
      H.api('/api/plans').catch(() => ({ plans: [] })), H.api(`/api/shotlog?club_code=${encodeURIComponent(club)}&course=${encodeURIComponent(course)}&date=${date}`).catch(() => ({ holes: [] }))]);
    const plan = (PL.plans || []).find(p => p.date === date && p.course && p.course.toLowerCase() === course.toLowerCase());
    const PD = plan ? await H.api(`/api/plans/${encodeURIComponent(plan.id)}`).catch(() => null) : null;
    if (!live('gp')) return;
    const bag = (CL.clubs || []).map(c => ({ code: c.code, yd: c.gps_median_yd ?? c.libreto?.total_yd ?? c.libreto?.carry_yd ?? null }));
    const codes = [...new Set([...(CL.clubs || []).map(c => c.code), ...((PD?.holes || []).flatMap(x => (x.shots || []).map(s => s.club)))])].filter(Boolean);
    const tr = load(id), track = tr.p.map(x => ({ t: x[0], lat: x[1], lng: x[2], acc: x[3], hole: x[4], src: SRC[x[5]] || 'gps' }));
    const swings = tr.e.map(x => ({ t: x[0], lat: x[1], lng: x[2], hole: x[3], kind: 'swing', src: SRC[x[4]] || 'watch' }));
    const saved = new Set((SV.holes || []).filter(x => x.source !== 'libreta').map(x => x.hole));
    const S = { cur: null, holes: {}, msg: '', add: false, sel: null };
    const geoOf = n => map ? C().geoFromMap((map.holes || []).find(x => x.hole === n)) : {};
    const ids = [...new Set([...track.map(p => p.hole), ...(R.shots || []).map(s => s.hole)])].filter(n => n >= 1 && n <= 18).sort((a, b) => a - b);
    for (const n of ids) {
      const taps = (R.shots || []).filter(s => s.hole === n && s.lie !== 'green' && !/^(pt|putter)$/i.test(s.club || '')).sort((a, b) => a.shot_number - b.shot_number);
      const ev = [...taps.map(s => ({ t: +new Date(s.taken_at), lat: s.lat, lng: s.lng, hole: n, kind: 'tap', src: 'gps' })), ...swings.filter(x => x.hole === n)];
      const h = C().autoHole({ hole: n, par: HS[n - 1]?.par ?? null, geo: geoOf(n), track: track.filter(p => p.hole === n), events: ev,
        planClubs: (PD?.holes || []).find(x => x.hole === n)?.shots?.map(s => s.club), bag, tapClubs: taps.map(s => s.club || null) });
      if (h.shots.length) S.holes[n] = { ...h, confirmed: false, putts: HS[n - 1]?.putts ?? null };
    }
    S.cur = o.hole && S.holes[o.hole] ? o.hole : Object.keys(S.holes).map(Number).find(n => !saved.has(n)) ?? null;
    const relay = h => { const g = geoOf(h.hole), r = C().relayHole(h, g); Object.assign(h, r); h.confirmed = false; };
    function tile(n) { const h = S.holes[n], st = h?.confirmed ? 'ok' : saved.has(n) ? 'sv' : h ? 'rev' : '';
      return `<button type="button" class="sb-t ${st} ${S.cur === n ? 'cur' : ''}" data-h="${n}" ${h || saved.has(n) ? '' : 'disabled'} aria-label="Hoyo ${n}"><b class="num">${n}</b><small>${st === 'ok' ? '✓' : st === 'sv' ? 'listo' : h ? h.shots.length + ' golpes' : '—'}</small></button>`; }
    function review(h) {
      const g = geoOf(h.hole), F = frame(g, h.shots), hasMap = !!(g.line?.length || g.green);
      const rows = h.shots.map((x, i) => `<div class="as-row ${S.sel === i ? 'sel' : ''}"><button type="button" class="as-n" data-sel="${i}" aria-label="Elegir golpe ${i + 1}">${i + 1}</button>
        <div class="as-b"><div class="as-l"><b>${x.yd_est != null ? `~${x.yd_est} yd` : 's/d'}</b><span>desde ${e(LIE[x.lie] || x.lie)}</span></div><small>${e(FROM[x.from] || x.from)}${x.dwell_s ? ` · ${x.dwell_s} s` : ''}${x.club_from === 'bolsa' ? ' · palo sugerido por tu bolsa' : x.club_from === 'plan' ? ' · palo de tu estrategia' : ''}</small></div>
        <label class="as-c"><span class="sr">Palo del golpe ${i + 1}</span><select data-club="${i}"><option value="">Palo</option>${codes.map(c => `<option ${c === x.club ? 'selected' : ''}>${e(c)}</option>`).join('')}</select></label>
        ${i ? `<button type="button" class="as-x" data-del="${i}" aria-label="Borrar golpe ${i + 1}">×</button>` : '<span class="as-x"></span>'}</div>`).join('');
      const fw = h.par >= 4 ? (h.fairway === 'centro' ? 'Fairway ✓' : h.fairway ? `Fairway ${h.fairway === 'izq' ? '← izq.' : 'der. →'}${h.fw_lie && h.fw_lie !== 'rough' ? ` (${LIE[h.fw_lie]})` : ''}` : 'Fairway s/d') : 'Par 3';
      return `<section class="card sb-rv" aria-label="Hoyo ${h.hole}"><div class="sb-hd"><b>Hoyo ${h.hole}</b><span>${h.par ? `Par ${h.par} · ` : ''}${h.shots.length} golpes hasta el green · estimado</span></div>
        ${hasMap ? `<div class="as-wrap">${holeSvg(g, h, F)}</div><p class="foot">Arrastrá cada punto a donde estaba la pelota.${S.add ? ' <b>Tocá el mapa donde pegaste.</b>' : ''}</p>` : '<p class="foot gp-warn">Sin mapa de este hoyo: no podemos decir dónde cayó cada golpe.</p>'}
        <div class="as-list">${rows}</div>
        ${hasMap ? `<button type="button" class="btn ghost sm" id="asadd">${S.add ? 'Cancelar' : 'Agregar un golpe'}</button>` : ''}
        <div class="as-sum"><span>${e(fw)}</span><span>GIR ${h.gir == null ? 's/d' : h.gir ? 'sí' : 'no'}</span>${h.bunker ? '<span>Bunker</span>' : ''}${h.penalty ? '<span>Agua</span>' : ''}${(() => { const k = h.dropped.pausa + h.dropped.path + h.dropped.fuera; return k ? `<span class="as-dr">${k} parada${k > 1 ? 's' : ''} descartada${k > 1 ? 's' : ''} (pausas o camino)</span>` : ''; })()}</div>
        <button type="button" class="btn" id="asok">${h.confirmed ? 'Confirmado ✓' : `Confirmar hoyo ${h.hole}`}</button></section>`;
    }
    function draw() {
      if (!live('gp')) return; const h = S.cur != null ? S.holes[S.cur] : null, n = Object.values(S.holes).filter(x => x.confirmed).length, any = Object.keys(S.holes).length;
      el.innerHTML = `<div class="stitle">Golpes detectados</div><p class="foot gp-sub">${e(course)} · ${e(date)}</p>
        <p class="lede">Los detectamos con el GPS mientras la app estaba abierta: paradas en cualquier parte del hoyo y tus “Ya pegué”. Son estimados: revisá, corregí y confirmá cada hoyo.</p>
        ${S.msg ? `<p class="msg" role="status">${S.msg}</p>` : ''}
        ${any || saved.size ? `<div class="sb-grid" role="group" aria-label="Hoyos">${Array.from({ length: 18 }, (_, i) => tile(i + 1)).join('')}</div>` : `<div class="card gp-empty"><b>Todavía no hay golpes detectados</b><span>Se detectan durante la ronda con GPS, con la app abierta.</span></div>`}
        ${h ? review(h) : ''}
        ${any ? `<div class="sb-save"><button type="button" class="btn" id="assave" ${n ? '' : 'disabled'}>${n ? `Guardar ${n} hoyo${n > 1 ? 's' : ''} confirmado${n > 1 ? 's' : ''}` : 'Confirmá al menos un hoyo'}</button>
          <p class="foot">Privado: solo lo ves vos. El recorrido queda en tu teléfono; guardamos solo los golpes que confirmes.</p></div>` : ''}
        ${tr.p.length ? '<button type="button" class="linkb" id="asclr">Borrar el recorrido de este teléfono</button>' : ''}`;
      bind();
    }
    function bind() {
      const $ = s => el.querySelector(s), h = S.cur != null ? S.holes[S.cur] : null;
      el.querySelectorAll('.sb-t').forEach(b => b.onclick = () => { const k = +b.dataset.h; if (S.holes[k]) { S.cur = k; S.sel = null; S.add = false; draw(); } });
      $('#assave') && ($('#assave').onclick = save);
      $('#asclr') && ($('#asclr').onclick = () => { clear(id); tr.p = []; tr.e = []; S.msg = 'Borramos el recorrido de este teléfono.'; draw(); });
      if (!h) return; const g = geoOf(h.hole);
      el.querySelectorAll('[data-club]').forEach(s => s.onchange = () => { h.shots[+s.dataset.club].club = s.value || null; h.shots[+s.dataset.club].club_from = s.value ? 'manual' : null; h.confirmed = false; draw(); });
      el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { h.shots.splice(+b.dataset.del, 1); relay(h); S.sel = null; draw(); });
      el.querySelectorAll('[data-sel]').forEach(b => b.onclick = () => { S.sel = S.sel === +b.dataset.sel ? null : +b.dataset.sel; draw(); });
      $('#asadd') && ($('#asadd').onclick = () => { S.add = !S.add; draw(); });
      $('#asok').onclick = () => { h.confirmed = true; const nx = Object.keys(S.holes).map(Number).find(k => !S.holes[k].confirmed && !saved.has(k)); S.cur = nx ?? h.hole; S.sel = null; draw(); };
      const svg = $('#asmap'); if (!svg) return; const F = frame(g, h.shots);
      const toLL = ev => { const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; const q = pt.matrixTransform(svg.getScreenCTM().inverse()); return F.back([q.x, q.y]); };
      let drag = null;
      svg.querySelectorAll('.as-dot').forEach(d => d.onpointerdown = ev => { ev.preventDefault(); drag = { i: +d.dataset.i, el: d }; svg.setPointerCapture(ev.pointerId); });
      svg.onpointermove = ev => { if (!drag) return; const ll = toLL(ev), [x, y] = F.fwd(ll); drag.el.setAttribute('transform', `translate(${f1(x)},${f1(y)})`); drag.ll = ll; };
      svg.onpointerup = ev => { if (drag) { if (drag.ll) { h.shots[drag.i].ll = drag.ll; relay(h); } drag = null; draw(); return; }
        if (S.add) { const ll = toLL(ev), at = S.sel != null ? S.sel + 1 : h.shots.length; h.shots.splice(at, 0, { n: at + 1, ll, lie: 'rough', from: 'manual', t: null, yd_est: null, club: null, club_from: null, src: 'gps' }); S.add = false; relay(h); draw(); } };
    }
    async function save() {
      const hs = Object.values(S.holes).filter(x => x.confirmed), b = el.querySelector('#assave'); b.disabled = true; b.textContent = 'Guardando…';
      try { const by = {}; for (const h of hs) { const body = C().autoToLog(h, h.putts, geoOf(h.hole)); (by[body.device] ||= []).push(body); }
        let r = null; for (const [src, holes] of Object.entries(by)) r = await H.api('/api/shotlog', { method: 'POST', body: JSON.stringify({ club_code: club, course, date, plan_id: plan?.id || null, source: src, holes }) });
        for (const h of hs) { saved.add(h.hole); delete S.holes[h.hole]; } clear(id, hs.map(h => h.hole)); tr.p = tr.p.filter(x => !hs.some(h => h.hole === x[4]));
        const s = r?.stats || {}, L2 = s.lies || {};
        S.msg = `Guardamos ${hs.length} hoyo${hs.length > 1 ? 's' : ''}. Fairways ${s.fairway_pct ?? '—'}% (${s.fairway_miss?.izq ?? 0} a la izq., ${s.fairway_miss?.der ?? 0} a la der.) · GIR ${s.gir_pct ?? '—'}%` +
          (Object.keys(L2).length ? ` · Dónde quedó la pelota: ${Object.entries(L2).map(([k, v]) => `${LIE[k] || k} ${v}`).join(', ')}` : '') + '. Distancias estimadas.';
        S.cur = Object.keys(S.holes).map(Number)[0] ?? null; draw();
      } catch (err) { b.disabled = false; b.textContent = 'Reintentar'; S.msg = e(err.message || 'No pudimos guardar'); draw(); }
    }
    draw();
  }
  window.GolfletAuto = { rec, feed, view, clear, holesWithTrack, enabled: on, setEnabled: v => localStorage.setItem('golflet.auto', v ? '1' : '0') };
})();
