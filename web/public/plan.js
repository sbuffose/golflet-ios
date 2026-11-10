/* Golflet · Estrategia de juego (t176u/t177u/t179u/t180u, API_v5 §61). Private to the player. No modals, no italics.
   Routes: #/plan (list + new) · #/plan/nuevo?tee=<tee_time_id> (from the tee time view, prefilled) · #/plan/<id> (18 holes: ETA, wind, ±yd)
           #/plan/<id>/hoyo/<n>[?v=sat] (hole map Diseño/Satelital + shot planner; ends on the green, no putts).
   Maths: window.GolfletPlanCore (generated from lib/plan-core.ts). Diseño rule (t178u): numbers and symbols on the map, explanations in "Detalle". */
(function () {
  let H = null;                       // { api, esc, toast }
  const P = () => window.GolfletPlanCore;
  const MAPS = new Map();             // "club|course" → course map (session cache)
  let CLUBS = null, CLUBS_AT = 0;
  /* ---------- t243u «Jugar práctica»: live GPS on the hole view. Practice only: shots stay on this device, nothing goes to the club. ---------- */
  const PRK = 'golflet.prac', todayAR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const pracGet = () => { try { const v = JSON.parse(localStorage.getItem(PRK) || 'null'); return v && v.date === todayAR() ? v : null; } catch { return null; } };
  const pracSet = v => { try { v ? localStorage.setItem(PRK, JSON.stringify(v)) : localStorage.removeItem(PRK); } catch { /* private mode */ } };
  const logKey = (id, n) => `golflet.prac.log.${id}.${n}`;
  const logGet = (id, n) => { try { const v = JSON.parse(localStorage.getItem(logKey(id, n)) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
  const logSet = (id, n, L) => { try { localStorage.setItem(logKey(id, n), JSON.stringify(L)); } catch { /* full or private */ } };
  const GEO = { ll: null, acc: null, t: 0, err: null, id: null, subs: new Set() };
  function geoStart() {
    if (GEO.id != null) return; if (!navigator.geolocation) { GEO.err = 'nogeo'; return; }
    GEO.id = navigator.geolocation.watchPosition(p => { if (!GEO.ll) { try { localStorage.setItem(GEOK, '1'); } catch { /* private */ } } GEO.ll = [p.coords.longitude, p.coords.latitude]; GEO.acc = p.coords.accuracy; GEO.t = Date.now(); GEO.err = null; GEO.subs.forEach(f => { try { f(); } catch { /* view gone */ } }); },
      er => { GEO.err = er.code === 1 ? 'denied' : er.code === 3 ? 'timeout' : 'unavailable'; if (er.code === 1) { try { localStorage.removeItem(GEOK); } catch { /* private */ } } GEO.subs.forEach(f => { try { f(); } catch { /* view gone */ } }); }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
  }
  /* t256u: iOS Safari only asks for the location from a tap. On load we start by ourselves only when it is already allowed (Permissions API, or it worked before);
     otherwise the box shows «Activar GPS», which calls getCurrentPosition from the tap and then keeps watching. */
  const AUTOHK = 'golflet.prac.autoh', autoOn = () => { try { return localStorage.getItem(AUTOHK) !== '0'; } catch { return true; } }, autoSet = v => { try { localStorage.setItem(AUTOHK, v ? '1' : '0'); } catch { /* private */ } };
  const GEOK = 'golflet.geo.ok', geoNotify = () => GEO.subs.forEach(f => { try { f(); } catch { /* view gone */ } });
  function geoActivate() {
    if (!navigator.geolocation) { GEO.err = 'nogeo'; geoNotify(); return; }
    GEO.err = 'asking'; geoNotify();
    navigator.geolocation.getCurrentPosition(p => { GEO.ll = [p.coords.longitude, p.coords.latitude]; GEO.acc = p.coords.accuracy; GEO.t = Date.now(); GEO.err = null; try { localStorage.setItem(GEOK, '1'); } catch { /* private */ }
        if (GEO.id != null && navigator.geolocation) { navigator.geolocation.clearWatch(GEO.id); GEO.id = null; } geoStart(); geoNotify(); },
      er => { GEO.err = er.code === 1 ? 'denied' : er.code === 3 ? 'timeout' : 'unavailable'; geoNotify(); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  }
  async function geoAuto() {
    if (GEO.id != null) return; if (!navigator.geolocation) { GEO.err = 'nogeo'; return; }
    let st = null; try { st = (await navigator.permissions?.query({ name: 'geolocation' }))?.state || null; } catch { st = null; }
    let ok0 = false; try { ok0 = localStorage.getItem(GEOK) === '1'; } catch { /* private */ }
    if (st === 'granted' || (st !== 'denied' && ok0)) geoStart(); else { GEO.err = st === 'denied' ? 'denied' : 'idle'; geoNotify(); }
  }
  function geoStop() { if (GEO.id != null && navigator.geolocation) navigator.geolocation.clearWatch(GEO.id); GEO.id = null; GEO.ll = null; GEO.subs.clear(); }
  let WL = null, WXI = null;
  async function wakeOn() { try { if (navigator.wakeLock && !WL && document.visibilityState === 'visible') { WL = await navigator.wakeLock.request('screen'); WL.addEventListener?.('release', () => { WL = null; }); } } catch { WL = null; } }
  function wakeOff() { try { WL?.release(); } catch { /* already */ } WL = null; }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && pracGet() && /^#\/plan\/[0-9a-f-]{36}\/hoyo\//.test(location.hash)) wakeOn(); });
  async function practiceStart(el) {
    const S = await H.api('/api/plans/setup'); if (!live('gp')) return;
    const today = todayAR(), cs = (S.courses || []).filter(c => !c.guide_only), last = (() => { try { return localStorage.getItem(PRK + '.last'); } catch { return null; } })();
    const tt = (S.tee_times || []).find(t => t.date === today && cs.some(c => c.club_code === t.club_code));
    const ck = c => `${c.club_code}|${c.course}`;
    const def = (tt && (cs.find(c => c.club_code === tt.club_code && c.course === tt.course) || cs.find(c => c.club_code === tt.club_code))) || cs.find(c => ck(c) === last) || null;
    const go = async c => {
      el.innerHTML = spin; const cur = pracGet(); let id = cur && cur.ck === ck(c) ? cur.id : null;
      if (!id) { const now = new Date(Date.now() - 3 * 3600e3).toISOString().slice(11, 16);
        const r = await H.api('/api/plans', { method: 'POST', body: JSON.stringify({ club_code: c.club_code, course: c.course, date: today, tee_time: now }) }); id = r.plan.id; }
      pracSet({ id, date: today, ck: ck(c), ...(tt && tt.club_code === c.club_code && /^[0-9a-f-]{36}$/i.test(tt.id || '') ? { tee: tt.id } : {}) });   // t260u: the booking, for «Armar partido» from the map try { localStorage.setItem(PRK + '.last', ck(c)); } catch { /* private */ }
      geoStart(); wakeOn(); location.hash = `#/plan/${id}/hoyo/1`;
    };
    if (!cs.length) { el.innerHTML = `<div class="stitle">Jugar práctica</div><div class="card gp-empty"><b>Todavía no tenemos el mapa de tus canchas</b></div>`; return; }
    const order = def ? [def, ...cs.filter(c => c !== def)] : cs;
    el.innerHTML = `<div class="stitle">Jugar práctica</div><p class="lede">Mapa del hoyo con tu GPS: yardas a la entrada, medio y fondo desde donde estás, y anotás el palo de cada tiro. Queda en este teléfono; no se carga nada en el club.</p>
      <div class="list">${order.map((c, i) => `<button type="button" class="row gp-pick${i === 0 && def ? ' gp-pdef' : ''}" data-i="${cs.indexOf(c)}"><div class="body"><div class="t">${e(c.club_name)} · ${e(c.course)}</div>${i === 0 && def ? `<div class="s">${tt ? 'Tu reserva de hoy' : 'La última que usaste'}</div>` : ''}</div><span class="chev">›</span></button>`).join('')}</div>`;
    el.querySelectorAll('[data-i]').forEach(b => b.onclick = () => go(cs[+b.dataset.i]).catch(err => { el.innerHTML = errBox(err); }));
  }
  /* ---------- t244u «Marcar bandera»: your own flag positions per course, hole and date (server, per user; offline queue on the phone). Never sent to the club. ---------- */
  const FLS = new Map(), FLQK = 'golflet.flagq', FLDATE = {};          // "club|course|date" → { flags: {hole: {ll, acc_m, source}}, dates }
  const flk = (c, co, dt) => `${c}|${co}|${dt}`;
  const flCacheKey = k => `golflet.flags.${k}`;
  const flQGet = () => { try { const v = JSON.parse(localStorage.getItem(FLQK) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
  const flQSet = v => { try { v.length ? localStorage.setItem(FLQK, JSON.stringify(v)) : localStorage.removeItem(FLQK); } catch { /* private */ } };
  const flSave = (k, v) => { try { localStorage.setItem(flCacheKey(k), JSON.stringify(v)); } catch { /* private */ } };
  const flQs = o => `club=${encodeURIComponent(o.club_code)}&course=${encodeURIComponent(o.course)}&date=${o.date}`;
  async function flagsFlush() {
    let Q = flQGet(); while (Q.length) { const o = Q[0];
      try { if (o.op === 'put') await H.api('/api/flags', { method: 'PUT', body: JSON.stringify(o.b) }); else await H.api(`/api/flags?${flQs(o.b)}&hole=${o.b.hole}`, { method: 'DELETE' }); }
      catch (err) { if (!(err && err.status >= 400 && err.status < 500)) return false; }   // network: keep it for later; a rejected one is dropped
      Q = flQGet(); Q.shift(); flQSet(Q); }
    return true; }
  const flApplyQ = (k, v) => { for (const o of flQGet()) if (flk(o.b.club_code, o.b.course, o.b.date) === k) { if (o.op === 'put') v.flags[o.b.hole] = { ll: o.b.ll, acc_m: o.b.acc_m ?? null, source: o.b.source, pending: true }; else delete v.flags[o.b.hole]; } return v; };
  async function flagsLoad(c, co, dt, force) {
    const k = flk(c, co, dt); if (FLS.has(k) && !force) return FLS.get(k);
    let v; try { await flagsFlush(); const r = await H.api(`/api/flags?${flQs({ club_code: c, course: co, date: dt })}`);
      v = { flags: Object.fromEntries((r.flags || []).map(f => [f.hole, { ll: f.ll, acc_m: f.acc_m, source: f.source }])), dates: r.dates || [] }; flSave(k, v); }
    catch { try { v = JSON.parse(localStorage.getItem(flCacheKey(k)) || 'null'); } catch { v = null; } v = v || { flags: {}, dates: [], offline: true }; }
    flApplyQ(k, v); FLS.set(k, v); return v; }
  async function flagSet(c, co, dt, hole, f) {   // f = { ll, acc_m, source } | null (delete)
    const k = flk(c, co, dt), v = FLS.get(k) || { flags: {}, dates: [] };
    if (f) v.flags[hole] = { ...f, pending: true }; else delete v.flags[hole];
    const nH = Object.keys(v.flags).length, di = v.dates.findIndex(z => z.date === dt);
    if (nH && di < 0) v.dates = [{ date: dt, n: nH }, ...v.dates].sort((a, b) => b.date.localeCompare(a.date)); else if (di >= 0) { if (nH) v.dates[di].n = nH; else v.dates.splice(di, 1); }
    FLS.set(k, v); flSave(k, v);
    const b = { club_code: c, course: co, date: dt, hole, ...(f ? { ll: f.ll, source: f.source, ...(f.acc_m != null ? { acc_m: Math.round(f.acc_m * 10) / 10 } : {}) } : {}) };
    const Q = flQGet(); Q.push({ op: f ? 'put' : 'del', b }); flQSet(Q);
    const ok = await flagsFlush(); if (ok && v.flags[hole]) delete v.flags[hole].pending; flSave(k, v);
    if (!ok) H.toast('Sin señal: quedó en el teléfono y se sube sola'); return ok; }
  /* t245u: the wind right now (Open-Meteo, 15 min data) where you stand; refreshed every 10 min while you play */
  const WXL = { v: null, t: 0, busy: false, ll: null };
  async function wxNow(ll) {
    if (WXL.busy || (WXL.v && Date.now() - WXL.t < 600e3)) return WXL.v; WXL.busy = true;
    try { WXL.v = await H.api(`/api/weather/now?lat=${ll[1].toFixed(4)}&lng=${ll[0].toFixed(4)}`); WXL.t = Date.now(); WXL.ll = ll; } catch { /* keep the last one */ } finally { WXL.busy = false; }
    return WXL.v; }
  let MOPEN = null;                   // t270u: opens the match sheet for the live hole
  document.addEventListener('click', ev => { const b = ev.target.closest?.('#gpmt, #gpmap [data-mopen]'); if (!b || !MOPEN) return; ev.preventDefault(); MOPEN(b.dataset.mid || b.dataset.mopen); });
  let BDX = false;                    // t263u: full breakdown expanded (else one compact line)
  const BD = {};                      // t234u: "<plan>|<hole>" → which pill's breakdown is open ('1', '2', 'p0'…)
  let VMODE = { key: null, mode: null, g: false, cropY: null };   // t249u: live view: auto (null) | 'hoyo' | 'green' — back to auto on another hole
  let BDTAP = null, MAPTAP = null, FLAGDRAG = null;   // t250u: FLAGDRAG = drag the flag on the green
  const FLUNDO = {};   // "<plan>|<hole>|<date>" → previous flag positions (↶)   // t244u: MAPTAP = «tocá el mapa donde está la bandera»
  const PEND = {};                    // "<plan>|<hole>" → { club, to?, adjusted }
  const MKC = { rojo: '#B4553F', blanco: '#FFFFFF', azul: '#2F63C9', amarillo: '#E6C34A' };   // t227u: course marker colours
  const COL = { ink: '#0B2545', gold: '#C8102E', red: '#B4553F', cream: '#F6F7F9', celeste: '#75AADB', rough: '#DDE7D3', fair: '#A9D18E', fairE: '#8DBB73', green: '#6DBB5F', greenE: '#3F8F3C', sand: '#EEDDB0', sandE: '#C8102E', wood: '#8DB384', tree: '#5E8C5A', water: '#75AADB', waterE: '#4F86BC' };
  const spin = '<div style="padding:60px 0;text-align:center"><span class="spin"></span></div>';
  const e = s => H.esc(s == null ? '' : String(s));
  const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'], WD = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const dLong = d => { const x = new Date(d + 'T12:00:00Z'); return `${WD[x.getUTCDay()]} ${x.getUTCDate()} de ${MES[x.getUTCMonth()]}`; };
  const sgn = n => n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0';
  const ts = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ts')) || 1;
  const qs = h => new URLSearchParams((h.split('?')[1]) || '');
  const norm = p => p.map(x => String(x ?? '').split('?')[0]);

  /* ---------- router hooks ---------- */
  function label(h) { const p = norm(h.replace(/^#\/?/, '').split('/')); if (p[1] === 'cancha') return p[4] === 'hoyo' ? `Hoyo ${p[5]}` : 'Libreta de la cancha'; if (p[1] === 'subir') return 'Subir libreta'; if (p[1] === 'golpes') return 'Golpes detectados'; return p[2] === 'hoyo' ? (p[4] === 'detalle' ? `Detalle del hoyo ${p[3]}` : p[4] === 'green' ? `Green del hoyo ${p[3]}` : `Hoyo ${p[3]}`) : p[1] && p[1] !== 'nuevo' ? 'Estrategia de juego' : 'Estrategia de juego'; }
  function parent(h) {
    const p = norm(h.replace(/^#\/?/, '').split('/'));
    if (p[1] === 'cancha') return p[4] === 'hoyo' ? `#/plan/cancha/${p[2]}/${p[3]}` : '#/plan';
    if (p[1] === 'golpes') return `#/jugar/${p[2]}`;
    if (p[1] === 'subir') { const pl = qs(h).get('plan'); return pl ? `#/plan/${pl}` : `#/plan/cancha/${p[2]}/${p[3]}`; }
    if (p[2] === 'hoyo') return p[4] === 'detalle' || p[4] === 'green' ? `#/plan/${p[1]}/hoyo/${p[3]}${qs(h).get('v') === 'sat' ? '?v=sat' : ''}` : `#/plan/${p[1]}`;
    if (p[1] === 'nuevo') { const t = qs(h).get('tee'); return t ? `#/tee/${t}` : '#/plan'; }
    if (p[1]) return '#/plan';
    return '#/inicio';
  }
  // t217u: the hole view is one fixed screen (app.js toggles html.gp-fix); its «Detalle» scrolls as usual
  function fixed(h) { const p = norm(h.replace(/^#\/?/, '').split('/')); return p[0] === 'plan' && p[1] !== 'cancha' && p[2] === 'hoyo' && !p[4]; }
  // t259u: the live «Jugar práctica» hole view hides the app's tab bar (app.js toggles html.gp-live on every route change)
  function practiceLive(h) { if (!fixed(h)) return false; const p = norm(h.replace(/^#\/?/, '').split('/')), c = pracGet(); return !!c && c.id === p[1]; }
  function page(p) { const k = Array.isArray(p) ? norm(p)[1] : '', c = k === 'cancha'; if (k && !c && !['subir', 'golpes', 'nuevo', 'practica'].includes(k)) return `<div id="gp">${spin}</div>`; return `<div class="bar"><span class="overline">${k === 'subir' ? 'Subir libreta' : k === 'golpes' ? 'Golpes detectados' : c ? 'Libreta de la cancha' : 'Estrategia de juego'}</span></div><div id="gp">${spin}</div>`; }
  async function load(p, hash) {
    p = norm(p); const el = document.getElementById('gp'); if (!el) return;
    try {
      if (!p[1]) return await drawList(el);
      if (p[1] === 'cancha') return p[2] ? (p[4] === 'hoyo' ? await courseHoleView(el, dec(p[2]), dec(p[3]), +p[5]) : await courseBook(el, dec(p[2]), dec(p[3]))) : await courseFromKey(el, qs(hash).get('ck'));
      if (p[1] === 'golpes') return window.GolfletAuto ? await window.GolfletAuto.view(el, { H, live, id: dec(p[2]), hole: +qs(hash).get('h') || null }) : null;
      if (p[1] === 'subir') return window.GolfletSubir ? await window.GolfletSubir.view(el, { H, live, club: dec(p[2]), course: dec(p[3]), plan: qs(hash).get('plan') }) : null;
      if (p[1] === 'nuevo') return await fromTee(el, qs(hash).get('tee'));
      if (p[1] === 'practica') return await practiceStart(el);
      if (p[2] === 'hoyo') return await drawHole(el, p[1], +p[3], qs(hash).get('v') === 'sat', p[4] === 'detalle' || p[4] === 'green' ? p[4] : null);
      return await drawPlan(el, p[1]);
    } catch (err) { if (document.getElementById('gp')) el.innerHTML = errBox(err); }
  }
  const dec = x => { try { return decodeURIComponent(x); } catch { return x; } };
  const BOOKS = new Map();
  async function bookData(club, course) { const k = club + '|' + course; if (!BOOKS.has(k)) BOOKS.set(k, H.api(`/api/course-maps/${encodeURIComponent(club)}/${encodeURIComponent(course)}/libreta?as=json`)); return BOOKS.get(k); }
  const cbase = (club, course) => `#/plan/cancha/${encodeURIComponent(club)}/${encodeURIComponent(course)}`;
  const relevHtml = CP => `<div class="card gp-relev" role="status"><b>Cancha en relevamiento</b><span>Todavía no tenemos todos los datos de esta cancha (salidas, línea de juego, green, marcas y obstáculos) para imprimir la libreta ni calcular el ± yd por viento.</span>${CP?.missing?.length ? `<small>Falta: ${e(CP.missing.slice(0, 3).join(' · '))}</small>` : ''}</div>`;
  /* ---------- t201u: "Libreta de la cancha" (no tee time, no plan) ---------- */
  async function courseFromKey(el, ck) {
    const S = await H.api('/api/plans/setup'); if (!live('gp')) return;
    const raw = String(ck || ''), folded = raw.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    const name = raw.includes(':') ? raw.split(':').slice(1).join(':') : raw;
    const c = ck && S.courses.find(x => {
      const idk = `${x.club_id}:${x.course}`.toLowerCase(), codek = `${x.club_code}:${x.course}`.toLowerCase(), n = String(x.course).toLowerCase();
      const slug = `${x.club_code}-${n.replace(/\s+/g, '-')}`;
      return idk === raw.toLowerCase() || codek === raw.toLowerCase() || n === String(name).toLowerCase() || raw.toLowerCase() === slug;
    });
    if (c) { location.replace(cbase(c.club_code, c.course)); return; }
    if (folded.includes('cancha vieja') || folded.includes('cancha-vieja')) { location.replace(cbase('209', 'Cancha Vieja')); return; }
    el.innerHTML = `<div class="card gp-empty"><b>Todavía no tenemos la libreta de esta cancha</b><span>Estamos relevando las canchas de a una.</span></div>`;
  }
  async function courseBook(el, club, course) {
    const d = await bookData(club, course); if (!live('gp')) return;
    const CP = d.course.completeness, LB = window.GolfletLibreta, base = cbase(club, course);
    el.innerHTML = `<div class="stitle">Libreta de la cancha</div><p class="foot gp-sub">${e(d.course.club_name || '')} · ${e(d.course.course)}</p>
      <p class="lede">Diseño de cada hoyo, rumbo, marcas 50–250, obstáculos con distancia para pasarlos y greens con sus caídas. Sin reserva ni estrategia.</p>
      ${!CP.ready.libreta ? relevHtml(CP) : LB ? LB.printCard(d, { courseOnly: true, open: true }) : ''}
      ${CP.ready.libreta ? `<a class="btn ghost sb-go" href="#/plan/subir/${encodeURIComponent(club)}/${encodeURIComponent(course)}">Subir libreta</a><p class="foot">Después de la ronda: sacale fotos a las tarjetas que llenaste con lápiz.</p>` : ''}
      ${d.course.map === false && CP.ready.libreta ? '<p class="foot gp-warn">Guía del club: hoyos en esquema (rumbo s/d).</p>' : ''}
      <div class="gp-grid">${d.holes.map(x => `<a class="gp-tile" href="${base}/hoyo/${x.hole}" aria-label="Hoyo ${x.hole}"><span class="gp-n num">${x.hole}</span><span class="gp-par num">Par ${x.par ?? '—'}</span><span class="gp-eta num">${x.play_length_yd ?? '—'} yd</span>${x.relevamiento ? '<small class="gp-rv">en relev.</small>' : ''}</a>`).join('')}</div>
      <p class="foot">Para la libreta con tus golpes, horario y viento, armá una <a href="#/plan">estrategia de juego</a>.</p>`;
    if (LB && CP.ready.libreta) LB.bindPrint(el, d);
  }
  async function courseHoleView(el, club, course, n) {
    const d = await bookData(club, course); if (!live('gp')) return;
    const base = cbase(club, course), LB = window.GolfletLibreta;
    if (d.course.map === false) return LB ? LB.courseHole(el, { d, n, H, live, base }) : null;
    const m = await courseMap(club, course); if (!live('gp')) return;
    const h = m.holes.find(x => x.hole === n), x = d.holes.find(y => y.hole === n) || {}, i = d.holes.findIndex(y => y.hole === n), prev = d.holes[i - 1]?.hole, next = d.holes[i + 1]?.hole;
    const nav = `<nav class="gp-nav">${prev ? `<a href="${base}/hoyo/${prev}" aria-label="Hoyo ${prev}">‹ ${prev}</a>` : ''}${next ? `<a href="${base}/hoyo/${next}" aria-label="Hoyo ${next}">${next} ›</a>` : ''}</nav>`;
    if (!h || !h.line?.length || x.relevamiento) { el.innerHTML = `<div class="gp-hh"><div><div class="gp-ht">Hoyo ${n}</div></div>${nav}</div><div class="card gp-relev" role="status"><b>Hoyo en relevamiento</b><span>Todavía no tenemos todos los datos de este hoyo.</span></div>`; return; }
    const fr = holeFrame(h), start = h.tees?.[0]?.center || h.line[0], pxW = Math.min(el.clientWidth || 358, 640), b = h.bearing?.tee_to_green_true;
    const { svg } = holeSvg(h, fr, { ball: start, start, wind: null, eff: null, sat: false, pend: null, shots: [], hitIds: [], pxW, lk: {}, labels: true, others: m.holes });
    el.innerHTML = `<div class="gp-hh"><div><div class="gp-ht">Hoyo ${n}</div><div class="gp-hs num">${x.par ? `Par ${x.par} · ` : ''}${h.play_length_yd} yd${b != null ? ` · Rumbo ${Math.round(b)}° ${e(C16(b))}` : ''}</div></div>${nav}</div>
      <p class="foot lb-cmode">Libreta de la cancha · sin datos de estrategia</p>
      ${d.course.numbering_unconfirmed && x.par == null ? '<p class="foot gp-warn">Numeración a confirmar</p>' : ''}
      <div class="gp-mapw lb-wm" data-brand="Golflet">${svg}</div>
      <ul class="gp-hzl">${(h.hazards || []).filter(z => z.in_play || z.greenside).map(z => `<li>${e(z.text)}</li>`).join('') || '<li>Sin obstáculos mapeados cerca de la línea.</li>'}</ul>
      <p class="foot">Geometría © OpenStreetMap (ODbL).</p>`;
    if (LB) LB.swipe(el, prev ? `${base}/hoyo/${prev}` : null, next ? `${base}/hoyo/${next}` : null);
  }
  const errBox = err => `<div class="msg">${e(err?.message && err.message !== 'auth' ? err.message : 'No pudimos cargar la estrategia. Probá de nuevo en un rato.')}</div>`;
  const live = id => document.getElementById(id);

  /* ---------- data ---------- */
  async function courseMap(club, course) {
    const k = club + '|' + course; if (MAPS.has(k)) return MAPS.get(k);
    const m = await H.api(`/api/course-maps/${encodeURIComponent(club)}/${encodeURIComponent(course)}`); MAPS.set(k, m); return m;
  }
  async function clubs(force) { if (!CLUBS || force || Date.now() - CLUBS_AT > 300e3) { CLUBS = await H.api('/api/plans/clubs'); CLUBS_AT = Date.now(); } return CLUBS; }

  /* ---------- list + new ---------- */
  async function drawList(el) {
    const [S, L] = await Promise.all([H.api('/api/plans/setup'), H.api('/api/plans')]); if (!live('gp')) return;
    const up = L.plans.filter(x => x.date >= S.today), tees = S.tee_times.filter(t => t.has_map);
    el.innerHTML = `<div class="stitle">Estrategia de juego</div><p class="lede">Armala el día antes: el viento de cada hoyo a la hora que lo vas a jugar y dónde cae cada palo.</p>
      ${up.length ? `<div class="section"><h2>Tus estrategias</h2></div><div class="list">${up.map(x => `<a class="row" href="#/plan/${e(x.id)}"><div class="body"><div class="t">${e(x.course)} · ${e(dLong(x.date))}</div><div class="s">Salida ${e(x.tee_time)} · hoyo ${x.start_hole}${x.holes_planned ? ` · ${x.holes_planned} hoyos armados` : ''}</div></div><span class="chev">›</span></a>`).join('')}</div>` : ''}
      ${tees.length ? `<div class="section"><h2>Desde tus reservas</h2></div><div class="list">${tees.map(t => `<a class="row" href="#/plan/nuevo?tee=${e(t.id)}"><div class="body"><div class="t">${e(t.club_name)}${t.course_label ? ' · ' + e(t.course_label) : ''}</div><div class="s">${e(dLong(t.date))}${t.start_hole ? ` · hoyo ${t.start_hole}` : ''}</div></div><div class="score"><b class="num">${e(t.time)}</b><span>salida</span></div></a>`).join('')}</div>` : ''}
      ${S.courses.length ? `<div class="section"><h2>Libreta de la cancha</h2></div><div class="list">${S.courses.map(c => `<a class="row" href="${cbase(c.club_code, c.course)}"><div class="body"><div class="t">${e(c.course)}</div><div class="s">${e(c.club_name || '')} · guía de la cancha, sin estrategia</div></div><span class="chev">›</span></a>`).join('')}</div>` : ''}
      <div class="section"><h2>Sin reserva</h2></div>
      ${S.courses.length ? `<form class="card gp-form" id="gpnew" novalidate>
        <div class="gp-f"><span class="gp-l">Cancha</span><div class="seg" role="radiogroup" aria-label="Cancha">${S.courses.map((c, i) => `<button type="button" data-c="${e(c.club_code + '|' + c.course)}" class="${i === 0 ? 'on' : ''}" aria-pressed="${i === 0}">${e(c.course)}</button>`).join('')}</div><small class="gp-h">${e(S.courses[0].club_name || '')}</small></div>
        <div class="gp-row"><label class="gp-f">Día<input type="date" name="date" min="${S.today}" max="${addDays(S.today, S.max_days)}" value="${addDays(S.today, 1)}" required></label>
          <label class="gp-f">Salida<input type="time" name="time" value="09:00" step="300" required></label></div>
        <div class="gp-f"><span class="gp-l">Arranca en el hoyo</span><div class="seg" id="gpsh">${[1, 10].map(n => `<button type="button" data-h="${n}" class="${n === 1 ? 'on' : ''}" aria-pressed="${n === 1}">${n}</button>`).join('')}</div></div>
        <div id="gpmsg"></div><button class="btn" type="submit">Armar estrategia</button></form>`
        : `<div class="msg">Todavía no tenemos el mapa detallado de ninguna cancha de tus clubes.</div>`}
      <p class="foot">Solo la ves vos. El pronóstico llega hasta ${S.forecast_days} días.</p>`;
    const f = live('gpnew'); if (!f) return;
    let course = S.courses[0], sh = 1;
    f.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { course = S.courses.find(c => c.club_code + '|' + c.course === b.dataset.c); f.querySelectorAll('[data-c]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }); });
    f.querySelectorAll('[data-h]').forEach(b => b.onclick = () => { sh = +b.dataset.h; f.querySelectorAll('[data-h]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }); });
    f.onsubmit = async ev => { ev.preventDefault(); const btn = f.querySelector('.btn'); btn.disabled = true;
      try { const r = await H.api('/api/plans', { method: 'POST', body: JSON.stringify({ club_code: course.club_code, course: course.course, date: f.date.value, tee_time: f.time.value, start_hole: sh }) }); location.hash = `#/plan/${r.plan.id}`; }
      catch (err) { live('gpmsg').innerHTML = errBox(err); btn.disabled = false; } };
  }
  const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

  async function fromTee(el, teeId) {
    const S = await H.api('/api/plans/setup'); if (!live('gp')) return;
    const t = S.tee_times.find(x => x.id === teeId);
    if (!t) { el.innerHTML = `<div class="msg">No encontramos ese tee time entre tus próximas reservas.</div><a class="btn ghost" href="#/plan">Armar sin reserva</a>`; return; }
    const cs = S.courses.filter(c => c.club_code === t.club_code);
    if (!cs.length) { el.innerHTML = `<div class="stitle">Estrategia de juego</div><div class="card gp-empty"><b>Todavía no tenemos el mapa de esta cancha</b><span>${e(t.club_name)}: cuando esté el mapa detallado vas a poder armar la estrategia desde tu reserva.</span></div>`; return; }
    const go = async c => { el.innerHTML = spin; const r = await H.api('/api/plans', { method: 'POST', body: JSON.stringify({ club_code: c.club_code, course: c.course, date: t.date, tee_time: t.time, tee_time_id: t.id, ...(t.start_hole === 1 || t.start_hole === 10 ? { start_hole: t.start_hole } : {}) }) }); location.replace(`#/plan/${r.plan.id}`); };
    const known = t.course ? cs.find(c => c.course === t.course) : cs.length === 1 ? cs[0] : null;
    if (known) return go(known);
    el.innerHTML = `<div class="stitle">¿En qué cancha?</div><p class="lede">La reserva no dice la cancha.</p><div class="list">${cs.map((c, i) => `<button type="button" class="row gp-pick" data-i="${i}"><div class="body"><div class="t">Cancha ${e(c.course)}</div></div><span class="chev">›</span></button>`).join('')}</div>`;
    el.querySelectorAll('[data-i]').forEach(b => b.onclick = () => go(cs[+b.dataset.i]).catch(err => { el.innerHTML = errBox(err); }));
  }

  /* ---------- geometry helpers (hole-up frame) ---------- */
  function holeFrame(h) {
    const ref = h.tees?.[0]?.center || h.line[0], F = P().frame(ref), B = (h.bearing?.tee_to_green_true ?? 0) * Math.PI / 180, c = Math.cos(B), s = Math.sin(B);
    const R = ([x, y]) => [x * c - y * s, -(x * s + y * c)];                    // metres → svg (tee-up, y down)
    const Ri = ([X, Y]) => { const yy = -Y; return [X * c + yy * s, -X * s + yy * c]; };
    return { F, R, Ri, toS: ll => R(F.xy(ll)), fromS: S => F.ll(Ri(S)), B: h.bearing?.tee_to_green_true ?? 0 };
  }
  const pts = (poly, fr) => poly.map(p => fr.toS(p).map(v => v.toFixed(1)).join(',')).join(' ');
  const sd = (poly, fr) => window.GolfletSmooth ? window.GolfletSmooth.d(poly.map(p => fr.toS(p))) : 'M' + pts(poly, fr).replace(/ /g, ' L') + ' Z';   // t215u: smooth outlines
  /* t221u: tees from the club card (crosscheck.card.yards, real data only), placed on the map, and club names spelled out */
  const TEE_COL = { AZUL: '#2F6DB5', NEGRO: '#1A1A1A', BLANCO: '#FFFFFF', AMARILLO: '#E3B925', ROJO: '#C0392B', ROSA: '#E79AB8', VERDE: '#2E8B57', DORADO: '#C8102E', PLATEADO: '#B8BEC2', CELESTE: '#75AADB', NARANJA: '#E07B2E', VIOLETA: '#7A4FA0' };
  const teeName = k => String(k).charAt(0).toUpperCase() + String(k).slice(1).toLowerCase();
  function holeTees(h, x, d) {
    if (d.course.numbering_unconfirmed && x.par == null) return [];          // Azul 3–8 / 12–17: the card may be another hole
    const y = h.crosscheck?.card?.yards || {};
    return Object.entries(y).filter(([, v]) => Number.isFinite(+v) && +v > 0).map(([k, v]) => ({ key: String(k).toUpperCase(), name: teeName(k), yd: Math.round(+v), col: TEE_COL[String(k).toUpperCase()] || '#5D6F66' })).sort((a, b) => b.yd - a.yd);
  }
  // the tee point: a mapped tee box when its distance matches the card (±6 yd); else on the line of play at the card's yards from the green
  function teeSpot(h, fr, yd) {
    const C = P(), boxes = (h.tees || []).filter(t => t.center && Number.isFinite(t.to_green_yd)).map(t => ({ t, dd: Math.abs(t.to_green_yd - yd) })).sort((a, b) => a.dd - b.dd);
    if (boxes[0] && boxes[0].dd <= 6) return { ll: boxes[0].t.center, along: boxes[0].t.to_green_yd, box: true };
    const pth = playPath(h, fr); if (pth.length < 2) return null;
    let need = yd * C.YD;
    for (let i = pth.length - 1; i > 0; i--) { const a = pth[i], b = pth[i - 1], L = C.dist(a, b);
      if (need <= L || i === 1) { const k = need / (L || 1); return { ll: fr.F.ll([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]), along: yd, box: false }; }
      need -= L; }
    return null;
  }
  const teeKey = d => `golflet.tee.${d.course.club_code}|${String(d.course.course).toLowerCase()}`;
  const teeStored = d => { try { return localStorage.getItem(teeKey(d)); } catch { return null; } };
  const CLUBN = { DR: 'Driver', PT: 'Putter', PW: 'PW', GW: 'GW', AW: 'AW', SW: 'SW', LW: 'LW' };
  const clubName = c => { const s = String(c || '').trim(), u = s.toUpperCase(); if (CLUBN[u]) return CLUBN[u]; let m;
    if ((m = /^(\d{1,2})W$/.exec(u))) return `Madera ${m[1]}`; if ((m = /^(\d)H$/.exec(u))) return `Híbrido ${m[1]}`; if ((m = /^(\d)I$/.exec(u))) return `Hierro ${m[1]}`; if ((m = /^(\d{2})°?$/.exec(u))) return `Wedge ${m[1]}°`; return s; };
  // hazard numbers measured from the mapped tee, moved to the chosen tee (shift = chosen − mapped distance along the line)
  const hzShift = (z, sh) => !sh ? z : z.greenside ? { ...z, text: String(z.text || '').replace(/carry (\d+) desde la salida/, (_, a) => `carry ${+a + sh} desde la salida`) } : { ...z, carry_yd: z.carry_yd != null ? z.carry_yd + sh : z.carry_yd, reach_yd: z.reach_yd != null ? z.reach_yd + sh : z.reach_yd,
    text: String(z.text || '').replace(/a (\d+)–(\d+) yd de la salida/, (_, a, b) => `a ${+a + sh}–${+b + sh} yd de la salida`).replace(/a (\d+) yd de la salida/, (_, a) => `a ${+a + sh} yd de la salida`).replace(/\(carry (\d+)\)/, (_, a) => `(carry ${+a + sh})`).replace(/hasta (\d+) yd/, (_, a) => `hasta ${+a + sh} yd`) };
  const playPath = (h, fr) => { const gc = h.green?.center; const ln = (h.line || []).map(p => fr.F.xy(p)); if (gc) { ln.pop(); ln.push(fr.F.xy(gc)); } return ln; };
  function hazardsOf(h, fr) {
    let id = 0; const out = [];
    for (const b of h.bunkers || []) out.push({ id: id++, kind: 'bunker', poly: b.polygon.map(fr.F.xy) });
    for (const w of h.water || []) out.push({ id: id++, kind: 'agua', poly: w.polygon.map(fr.F.xy) });
    for (const w of h.trees?.wood_polygons || []) out.push({ id: id++, kind: 'bosque', poly: w.map(fr.F.xy) });
    return out;
  }
  const ICP = '<svg class="gp-ai" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z"/></svg>';
  const ICU = '<svg class="gp-ai" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13.5" r="3.5"/></svg>';
  const LOCK = '<svg class="gp-lk" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7.5" rx="1.6" fill="currentColor"/><path d="M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';
  const lockSvg = (x, y, r) => `<g class="gp-lock"><rect x="${x - r * .55}" y="${y - r * .1}" width="${r * 1.1}" height="${r * .85}" rx="${r * .18}" fill="${COL.ink}"/><path d="M${x - r * .32} ${y - r * .1} v${-r * .22} a${r * .32} ${r * .32} 0 0 1 ${r * .64} 0 v${r * .22}" fill="none" stroke="${COL.ink}" stroke-width="${r * .17}"/></g>`;
  const KIND = { bunker: 'Bunker', agua: 'Agua', bosque: 'Árboles', 'árboles': 'Árboles', 'límite': 'Límite' };

  /* hazard icon (symbol + optional number); r in svg metres */
  function icon(kind, x, y, r, inPlay, num, fs) {
    const ring = inPlay ? COL.red : '#5D6F66';
    let g = `<g class="gp-hz"><circle cx="${x}" cy="${y}" r="${r}" fill="#fff" stroke="${ring}" stroke-width="${r * .22}"/>`;
    if (kind === 'bunker') g += `<ellipse cx="${x}" cy="${y + r * .1}" rx="${r * .58}" ry="${r * .36}" fill="${COL.sand}" stroke="${COL.sandE}" stroke-width="${r * .1}"/><circle cx="${x - r * .15}" cy="${y}" r="${r * .09}" fill="${COL.sandE}"/><circle cx="${x + r * .2}" cy="${y + r * .15}" r="${r * .09}" fill="${COL.sandE}"/>`;
    else if (kind === 'agua') g += `<path d="M${x - r * .55} ${y - r * .1} q${r * .275} ${-r * .3} ${r * .55} 0 t${r * .55} 0 M${x - r * .55} ${y + r * .28} q${r * .275} ${-r * .3} ${r * .55} 0 t${r * .55} 0" fill="none" stroke="${COL.waterE}" stroke-width="${r * .17}" stroke-linecap="round"/>`;
    else if (kind === 'límite') g += `<text x="${x}" y="${y + r * .32}" font-size="${r * .8}" text-anchor="middle" font-weight="700" fill="${COL.red}">OB</text>`;
    else g += `<path d="M${x} ${y - r * .62} L${x + r * .5} ${y + r * .3} L${x - r * .5} ${y + r * .3} Z" fill="${COL.tree}"/><rect x="${x - r * .08}" y="${y + r * .3}" width="${r * .16}" height="${r * .3}" fill="#6B4F2E"/>`;
    g += '</g>';
    if (num != null) g += `<text x="${x + r * 1.25}" y="${y + fs * .36}" font-size="${fs}" font-weight="700" fill="${COL.ink}" paint-order="stroke" stroke="#fff" stroke-width="${fs * .28}" stroke-linejoin="round">${num}</text>`;
    return g;
  }
  /* wind arrow (blowing towards) in a badge + speed and ±yd */
  function windBadge(x, y, r, w, bearing, eff, fs, locked) {
    if (!w) return '';
    const a = ((w.from_deg + 180 - bearing) % 360 + 360) % 360;
    return `<g class="gp-wind"><circle cx="${x}" cy="${y}" r="${r}" fill="rgba(255,255,255,.94)" stroke="${COL.ink}" stroke-width="${r * .05}"/>
      <g transform="rotate(${a} ${x} ${y})"><path d="M${x} ${y + r * .62} L${x} ${y - r * .3}" stroke="${COL.ink}" stroke-width="${r * .14}" stroke-linecap="round"/><path d="M${x - r * .32} ${y - r * .18} L${x} ${y - r * .68} L${x + r * .32} ${y - r * .18} Z" fill="${COL.ink}"/></g>
      <text x="${x}" y="${y + r + fs * 1.05}" font-size="${fs * 1.1}" text-anchor="middle" font-weight="700" fill="${COL.ink}" paint-order="stroke" stroke="#fff" stroke-width="${fs * .3}">${Math.round(w.kmh)}</text>
      ${eff ? `<text x="${x}" y="${y + r + fs * 2.25}" font-size="${fs * .95}" text-anchor="middle" font-weight="700" fill="${eff.plays_like_yd > 0 ? COL.red : COL.ink}" paint-order="stroke" stroke="#fff" stroke-width="${fs * .3}">${sgn(eff.plays_like_yd)} yd</text>` : locked ? lockSvg(x, y + r + fs * 1.85, fs * .9) : ''}</g>`;
  }

  /* ---------- the hole SVG (Diseño / Satelital) ---------- */
  function holeSvg(h, fr, o) {
    const { ball, wind, eff, sat, pend, shots, hitIds, pxW, lk = {}, sug, labels, fit } = o;
    const gcS = o.target ? fr.toS(o.target) : h.green?.center ? fr.toS(h.green.center) : fr.toS(h.line[h.line.length - 1]);   // t244u: the flag, when you marked one
    const ballS = fr.toS(ball);
    const all = [...(h.fairways || []).flatMap(f => f.polygon), ...(h.green?.polygon || []), ...(h.tees || []).flatMap(t => t.polygon), ...h.line].map(fr.toS);
    let x0 = Math.min(...all.map(p => p[0])) - 30, x1 = Math.max(...all.map(p => p[0])) + 30;
    let yTop = Math.min(gcS[1], ...((h.green?.polygon || []).map(p => fr.toS(p)[1]))) - 28;
    let yBot = fit ? Math.max(ballS[1], ...all.map(p => p[1])) + 24 : ballS[1] + 30;   // t217u: the whole hole (tee at the bottom, green at the top)
    const FRm = o.frame; let CROP = false;   // t249u live framing: {bot} = from 5 yd behind you to the green; {pts, pad, min} = the green zoom
    if (FRm?.pts) { const fp = FRm.pts; x0 = Math.min(...fp.map(p => p[0])) - FRm.pad; x1 = Math.max(...fp.map(p => p[0])) + FRm.pad; yTop = Math.min(...fp.map(p => p[1])) - FRm.pad; yBot = Math.max(...fp.map(p => p[1])) + FRm.pad; }
    else if (FRm?.bot != null && FRm.bot < yBot) { const af = [...all.filter(p => p[1] <= FRm.bot), ...(FRm.me ? [FRm.me] : [])]; if (af.length) { x0 = Math.min(...af.map(p => p[0])) - 30; x1 = Math.max(...af.map(p => p[0])) + 30; } yBot = FRm.bot; CROP = true; }
    const minW = FRm?.min ?? 120, minH = FRm?.min ?? 90;
    let w = Math.max(x1 - x0, minW), hgt = Math.max(yBot - yTop, minH);
    if (fit) {   // t217u: one screen, no scroll: the viewBox takes the box's aspect and keeps the hole clear of the overlays (top toggle, bottom strip)
      const ah = Math.max(60, fit.H - fit.padT - fit.padB), k = Math.max(w / fit.W, hgt / ah), cx = (x0 + x1) / 2;
      yTop = CROP ? yBot - (fit.H - fit.padB) * k : yTop - fit.padT * k - (ah * k - hgt) / 2;   // t249u: cropped: the bottom edge (above the strip) stays 5 yd behind you
      w = fit.W * k; x0 = cx - w / 2; x1 = cx + w / 2; hgt = fit.H * k;
    } else if (hgt / w > 1.9) { const nw = hgt / 1.9, cx = (x0 + x1) / 2; x0 = cx - nw / 2; x1 = cx + nw / 2; w = nw; } else { const cx = (x0 + x1) / 2; x0 = cx - w / 2; x1 = cx + w / 2; }
    const vb = [x0, yTop, w, hgt], s = w / (fit ? fit.W : pxW), fs = 14 * ts() * s, r = 10.5 * ts() * s;
    const T = [];
    // base
    T.push(`<rect x="${x0 - 400}" y="${yTop - 400}" width="${w + 800}" height="${hgt + 800}" fill="${sat ? '#2F3B2C' : COL.rough}"/>`);   // t212u: dark under the photo, never a bright block
    if (sat) {
      const corners = [[x0, yTop], [x1, yTop], [x0, yTop + hgt], [x1, yTop + hgt]].map(fr.fromS);
      const lo = [Math.min(...corners.map(c => c[0])) - .0004, Math.min(...corners.map(c => c[1])) - .0004], hi = [Math.max(...corners.map(c => c[0])) + .0004, Math.max(...corners.map(c => c[1])) + .0004];
      const A = fr.F.xy(lo), Bq = fr.F.xy(hi), px = Math.min(1600, Math.round((Bq[0] - A[0]) / 0.35)), py = Math.min(1600, Math.round((Bq[1] - A[1]) / 0.35));
      const url = `https://imagenes.ign.gob.ar/geoserver/wms?service=WMS&version=1.1.1&request=GetMap&layers=ortomosaicos_fotogrametria:amba_3_2013&styles=&srs=EPSG:4326&bbox=${lo[0].toFixed(6)},${lo[1].toFixed(6)},${hi[0].toFixed(6)},${hi[1].toFixed(6)}&width=${px}&height=${py}&format=image/jpeg`;
      // t212u: never mask neighbouring terrain. The full-resolution IGN mosaic has no-data gaps that the server paints solid WHITE in JPEG:
      // a half-resolution copy (no gaps) goes underneath and the white no-data of the sharp copy is made transparent (SVG colour matrix).
      const lowUrl = url.replace(`&width=${px}&height=${py}`, `&width=${Math.max(64, Math.round(px / 2))}&height=${Math.max(64, Math.round(py / 2))}`), fid = `gpnd${h.hole}`;
      T.push(`<filter id="${fid}" color-interpolation-filters="sRGB" x="0" y="0" width="1" height="1"><feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 -40 -40 -40 0 113" result="m"/><feMorphology in="m" operator="erode" radius="${(1.6 * s).toFixed(2)}" result="e"/><feComposite in="SourceGraphic" in2="e" operator="in"/></filter>`);
      T.push(`<g transform="rotate(${-fr.B})"><image class="gp-sat-lo" href="${lowUrl}" x="${A[0]}" y="${-Bq[1]}" width="${Bq[0] - A[0]}" height="${Bq[1] - A[1]}" preserveAspectRatio="none"/>` +
        `<image class="gp-sat" href="${url}" x="${A[0]}" y="${-Bq[1]}" width="${Bq[0] - A[0]}" height="${Bq[1] - A[1]}" preserveAspectRatio="none" filter="url(#${fid})"/></g>`);
    } else {
      // t212u: the neighbouring holes stay visible (a ball can finish there): same colours, drawn under this hole, no mask and no dim
      const inView = q => q[0] > x0 - 120 && q[0] < x1 + 120 && q[1] > yTop - 120 && q[1] < yTop + hgt + 120;
      for (const oh of o.others || []) { if (oh.hole === h.hole || ![...(oh.line || []), ...(oh.green?.polygon || []), ...(oh.fairways || []).flatMap(f => f.polygon)].some(p => inView(fr.toS(p)))) continue;
        for (const wp of oh.trees?.wood_polygons || []) T.push(`<path d="${sd(wp, fr)}" fill="${COL.wood}"/>`);
        for (const f of oh.fairways || []) T.push(`<path d="${sd(f.polygon, fr)}" fill="${COL.fair}" stroke="${COL.fairE}" stroke-width="${.5 * s}"/>`);
        for (const wt of oh.water || []) T.push(`<path d="${sd(wt.polygon, fr)}" fill="${COL.water}" stroke="${COL.waterE}" stroke-width="${.5 * s}"/>`);
        for (const b of oh.bunkers || []) T.push(`<path d="${sd(b.polygon, fr)}" fill="${COL.sand}" stroke="${COL.sandE}" stroke-width="${.5 * s}"/>`);
        if (oh.green?.polygon) T.push(`<path d="${sd(oh.green.polygon, fr)}" fill="${COL.green}" stroke="${COL.greenE}" stroke-width="${.6 * s}"/>`);
        for (const t of oh.tees || []) T.push(`<polygon points="${pts(t.polygon, fr)}" fill="${COL.fairE}" stroke="${COL.ink}" stroke-width="${.4 * s}" opacity=".7"/>`); }
      for (const wp of h.trees?.wood_polygons || []) T.push(`<path d="${sd(wp, fr)}" fill="${COL.wood}"/>`);
      for (const p of h.trees?.points || []) { const q = fr.toS(p); T.push(`<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="4" fill="${COL.tree}"/>`); }
    }
    const lw = sat ? 1.2 * s : .6 * s;
    for (const f of h.fairways || []) T.push(`<path d="${sd(f.polygon, fr)}" fill="${sat ? 'none' : COL.fair}" stroke="${sat ? '#E6F5D8' : COL.fairE}" stroke-width="${lw}"/>`);
    for (const wt of h.water || []) T.push(`<path d="${sd(wt.polygon, fr)}" fill="${COL.water}" fill-opacity="${sat ? .55 : 1}" stroke="${COL.waterE}" stroke-width="${lw}"/>`);
    for (const b of h.bunkers || []) T.push(`<path d="${sd(b.polygon, fr)}" fill="${sat ? 'none' : COL.sand}" stroke="${sat ? '#FFF1C8' : COL.sandE}" stroke-width="${lw}"/>`);
    if (h.green?.polygon) T.push(`<path d="${sd(h.green.polygon, fr)}" fill="${sat ? 'none' : COL.green}" stroke="${sat ? '#F2FFE9' : COL.greenE}" stroke-width="${lw * 1.4}"/>`);
    for (const t of h.tees || []) T.push(`<polygon points="${pts(t.polygon, fr)}" fill="${sat ? 'none' : COL.ink}" stroke="${sat ? '#fff' : COL.ink}" stroke-width="${lw}"/>`);
    // hazard hit highlight
    for (const z of hitIds || []) { const poly = z.poly.map(p => fr.R(p)); T.push(`<polygon points="${poly.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')}" fill="${COL.red}" fill-opacity=".22" stroke="${COL.red}" stroke-width="${2.4 * s}"/>`); }
    // hole line
    T.push(`<polyline points="${h.line.map(p => fr.toS(p).map(v => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="#fff" stroke-width="${1.3 * s}" stroke-dasharray="${4 * s} ${4 * s}" opacity=".9"/>`);
    // yardage markers: short line + number
    const obs = [];                                                           // t221u: boxes the live labels must not cover (svg units)
    for (const m of lk.markers ? [] : h.markers || []) {
      if (o.teeYd && m.yd > o.teeYd - 15) continue;                           // t221u: no marker at or behind the chosen tee
      const [a, b] = m.across.map(fr.toS), right = a[0] > b[0] ? a : b; if (right[1] < yTop || right[1] > yTop + hgt) continue;
      T.push(`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#fff" stroke-width="${2 * s}" stroke-linecap="round"/>`);
      const tx = Math.min(right[0] + 5 * s, x1 - fs * (m.c ? 3.2 : 2.2)), bw = fs * 2.15, bh = fs * 1.45;
      obs.push([tx - 2 * s, right[1] - bh / 2 - 2 * s, tx + bw + 2 * s, right[1] + bh / 2 + 2 * s]);
      // t227u: the club's colour markers (MdP: measured to the entrance of the green) carry their colour as a dot in the pill
      const dc = m.c ? MKC[m.c] : null, dw = dc ? fs * .95 : 0, bw2 = bw + dw;
      if (dc) obs[obs.length - 1][2] += dw;
      T.push(`<rect x="${tx}" y="${right[1] - bh / 2}" width="${bw2}" height="${bh}" rx="${bh / 2}" fill="${COL.ink}" stroke="#fff" stroke-width="${.8 * s}"/>${dc ? `<circle cx="${tx + bh / 2}" cy="${right[1]}" r="${fs * .3}" fill="${dc}" stroke="#fff" stroke-width="${.6 * s}"/>` : ''}<text x="${tx + dw + bw / 2}" y="${right[1] + fs * .36}" font-size="${fs}" text-anchor="middle" font-weight="700" fill="#fff">${m.yd}</text>`);
    }
    // green front/centre/back
    for (const [k, c] of [['front', '#fff'], ['center', COL.gold], ['back', '#fff']]) if (h.green?.[k]) { const q = fr.toS(h.green[k]); T.push(`<circle class="gp-g${k[0]}" cx="${q[0]}" cy="${q[1]}" r="${2.6 * s}" fill="${c}" stroke="${COL.ink}" stroke-width="${.7 * s}"/>`); }
    // hazards: icons + carry number (in play + greenside), drawn after the course
    for (const z of o.hz || h.hazards || []) {
      if (!z.in_play && !z.greenside) continue;
      if (!z.greenside && z.carry_yd != null && z.carry_yd <= 0) continue;   // t221u: behind the chosen tee
      let [x, y] = fr.toS(z.center); x = Math.min(Math.max(x, x0 + r * 1.3), x1 - r * 3.4); y = Math.min(Math.max(y, yTop + r * 1.3), yTop + hgt - r * 1.3);
      if (y > ballS[1] + 5) continue;                                          // behind the ball: no longer in play
      const num = lk.hazard_carry ? null : z.greenside ? (z.side === 'frente' && z.carry_from_marker ? null : null) : (z.kind === 'bunker' || z.kind === 'agua' || z.kind === 'límite' ? z.carry_yd : null);
      T.push(icon(z.kind, +x.toFixed(1), +y.toFixed(1), r, z.in_play, num, fs * .95)); obs.push([x - r, y - r, x + r * (num != null ? 3.4 : 1), y + r]);
    }
    // per-leg wind effect on doglegs (small ±yd at each leg midpoint)
    if (eff?.legs?.length > 1) for (const [i, l] of eff.legs.entries()) { const sg = h.bearing.segments[i]; if (!sg) continue; const m = fr.toS([(sg.from[0] + sg.to[0]) / 2, (sg.from[1] + sg.to[1]) / 2]);
      obs.push([m[0] - 8 * s - fs * 2, m[1] - fs * .9, m[0] - 6 * s, m[1] + fs * .3]);
      T.push(`<text x="${m[0] - 8 * s}" y="${m[1]}" font-size="${fs * .85}" text-anchor="end" font-weight="700" fill="${l.plays_like_yd > 0 ? COL.red : COL.ink}" paint-order="stroke" stroke="#fff" stroke-width="${fs * .3}">${sgn(l.plays_like_yd)}</text>`); }
    // planned shots so far
    const chain = [fr.toS(o.start), ...shots.map(x => fr.toS(x.to))];
    if (chain.length > 1) { const pp = chain.map(p => p.join(',')).join(' ');
      T.push(`<polyline class="gp-sl0" points="${pp}" fill="none" stroke="rgba(10,30,22,.6)" stroke-width="${5.4 * s}" stroke-linecap="round" stroke-linejoin="round"/><polyline class="gp-sl" points="${pp}" fill="none" stroke="#fff" stroke-width="${2.8 * s}" stroke-linecap="round" stroke-linejoin="round"/>` + chain.slice(1, labels ? undefined : -1).map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="${(labels ? 4.2 : 3.6) * s}" fill="#fff" stroke="${COL.ink}" stroke-width="${1.4 * s}"/>`).join('')); }
    // t235u: every confirmed shot keeps its breakdown pill at the middle of its line (read-only; tap = breakdown), clear of markers and of each other
    if (o.pins?.length && !labels) { const band0 = [vb[1] + (fit ? fit.padT * s : 0), vb[1] + vb[3] - (fit ? fit.padB * s : 0)];
      o.pins.forEach((pn, i) => { if (!pn) return; const a = chain[i], b = chain[i + 1]; if (!a || !b) return; const { P: Lp, q } = placePill(pn.lines, fs, s, a, b, vb, band0, obs, chain.slice(1), .84);
        obs.push(q.box); T.push(`<g class="gp-lt gp-pin" data-bd="p${i}" role="button" aria-label="Golpe ${i + 1}: ${H.esc(pn.aria || pn.lines[0])}. Ver el detalle" transform="translate(${q.x.toFixed(1)} ${q.y.toFixed(1)})">${Lp.svg}</g>`); }); }
    if (labels) shots.forEach((x, i) => { const q = fr.toS(x.to); T.push(`<text x="${q[0] + 6 * s}" y="${q[1] + fs * .36}" font-size="${fs}" font-weight="700" fill="${COL.ink}" paint-order="stroke" stroke="#fff" stroke-width="${fs * .3}">${i + 1}·${H.esc(x.club)}</text>`); });
    // Qué conviene (prep): suggested landing ring + club chip, aim arrow at the ball
    if (sug && !pend) {
      const q = fr.R(sug.landing), cw = fs * (1.3 + .55 * sug.code.length), ch = fs * 1.5;
      T.push(`<line x1="${ballS[0]}" y1="${ballS[1]}" x2="${q[0]}" y2="${q[1]}" stroke="${COL.gold}" stroke-width="${1.6 * s}" stroke-dasharray="${3 * s} ${2.5 * s}"/><circle cx="${q[0]}" cy="${q[1]}" r="${6 * s}" fill="none" stroke="${COL.gold}" stroke-width="${2.2 * s}"/>`);
      T.push(`<g class="gp-sugc"><rect x="${q[0] + 8 * s}" y="${q[1] - ch / 2}" width="${cw}" height="${ch}" rx="${ch * .3}" fill="${COL.gold}" stroke="${COL.ink}" stroke-width="${.8 * s}"/><text x="${q[0] + 8 * s + cw / 2}" y="${q[1] + fs * .36}" font-size="${fs}" text-anchor="middle" font-weight="700" fill="${COL.ink}">${H.esc(sug.code)}</text></g>`);
      if (sug.aim_yd) { const dir = sug.aim_yd < 0 ? -1 : 1, ax = ballS[0], ay = ballS[1] - 12 * s, L = 16 * s;
        T.push(`<g class="gp-aim"><path d="M${ax} ${ay} h${dir * L}" stroke="${COL.ink}" stroke-width="${1.8 * s}" stroke-linecap="round"/><path d="M${ax + dir * (L + 4 * s)} ${ay} l${-dir * 5 * s} ${-3.6 * s} v${7.2 * s} z" fill="${COL.ink}"/>
          <text x="${ax + dir * (L + 7 * s)}" y="${ay + fs * .36}" font-size="${fs}" text-anchor="${dir < 0 ? 'end' : 'start'}" font-weight="700" fill="${COL.ink}" paint-order="stroke" stroke="#fff" stroke-width="${fs * .3}">${Math.abs(sug.aim_yd)} yd</text></g>`); }
    }
    // pending projection
    if (pend) {
      const nw = fr.R(pend.noWind), wd = fr.R(pend.withWind), to = pend.to ? fr.toS(pend.to) : wd;
      if (pend.ovalNo) T.push(ovalPath(pend.ovalNo, fr, `fill="none" stroke="#fff" stroke-width="${1.4 * s}" stroke-dasharray="${3 * s} ${2.5 * s}"`));
      if (pend.ovalW) T.push(ovalPath(pend.ovalW, fr, `fill="${COL.gold}" fill-opacity=".38" stroke="${COL.ink}" stroke-width="${1.1 * s}"`));
      // t221u: solid white shot lines with a dark outline (ball → point, point → green), readable on Diseño and Satelital
      const ln = (id, a, b) => `<line id="${id}o" class="gp-sl0" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="rgba(10,30,22,.6)" stroke-width="${5.4 * s}" stroke-linecap="round"/><line id="${id}" class="gp-sl" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#fff" stroke-width="${2.8 * s}" stroke-linecap="round"/>`;
      T.push(ln('gpl1', ballS, to)); if (pend.live) T.push(ln('gpl2', to, gcS));
      T.push(`<circle cx="${nw[0]}" cy="${nw[1]}" r="${3.6 * s}" fill="none" stroke="${COL.ink}" stroke-width="${1.2 * s}" stroke-dasharray="${2 * s} ${1.6 * s}"/>`);
      T.push(`<circle cx="${wd[0]}" cy="${wd[1]}" r="${3.8 * s}" fill="${COL.gold}" stroke="${COL.ink}" stroke-width="${1.2 * s}"/>`);
      if (pend.live) {   // t217u/t221u: draggable landing ring (white, Hole19-style) + two label pills (shot, what is left), updated while dragging
        const R0 = 16 * s;
        T.push(`<g id="gpring" class="gp-ring" transform="translate(${to[0].toFixed(1)} ${to[1].toFixed(1)})"><circle r="${R0}" fill="rgba(255,255,255,.16)" stroke="rgba(10,30,22,.6)" stroke-width="${5 * s}"/><circle id="gppt" r="${R0}" fill="none" stroke="#fff" stroke-width="${2.8 * s}"/><circle r="${2.6 * s}" fill="#fff" stroke="${COL.ink}" stroke-width="${1 * s}"/></g>`);
        const band = [vb[1] + (fit ? fit.padT * s : 0), vb[1] + vb[3] - (fit ? fit.padB * s : 0)];
        const { P: L1, q: q1 } = placePill(pend.live.l1, fs, s, ballS, to, vb, band, obs, [to]), { P: L2, q: q2 } = placePill(pend.live.l2, fs, s, to, gcS, vb, band, [...obs, q1.box], [to]);
        T.push(`<g id="gpt1" class="gp-lt" data-bd="1" role="button" aria-label="Ver el detalle del golpe" transform="translate(${q1.x.toFixed(1)} ${q1.y.toFixed(1)})">${L1.svg}</g><g id="gpt2" class="gp-lt" data-bd="2" role="button" aria-label="Ver el detalle de lo que queda" transform="translate(${q2.x.toFixed(1)} ${q2.y.toFixed(1)})">${L2.svg}</g>`);
      } else {
        if (pend.to) T.push(`<circle cx="${to[0]}" cy="${to[1]}" r="${4.4 * s}" fill="#fff" stroke="${COL.red}" stroke-width="${1.6 * s}"/>`);
        T.push(`<text x="${to[0] + 7 * s}" y="${to[1] - 6 * s}" font-size="${fs * 1.05}" font-weight="700" fill="${COL.ink}" paint-order="stroke" stroke="#fff" stroke-width="${fs * .3}">${Math.round(pend.yd)}</text>`);
      }
    }
    // ball
    T.push(`<circle class="gp-ball" cx="${ballS[0]}" cy="${ballS[1]}" r="${4 * s}" fill="#fff" stroke="${COL.ink}" stroke-width="${1.4 * s}"/>`);
    // wind badge (top-left) and north arrow (top-right)
    const wr = 17 * ts() * s, nr = 12 * ts() * s, nx = fit ? x1 - nr - 8 * s : x1 - nr * 1.5, ny = fit ? yTop + nr + 8 * s : yTop + nr * 1.5, na = -fr.B;
    // t217u: the Diseño/Satelital toggle sits top-left over the map, so the compass stays top-right and the wind goes under it
    if (!o.imm) T.push(fit ? windBadge(x1 - wr - 8 * s, ny + nr + 8 * s + wr, wr, wind, fr.B, eff, fs, lk.plays_like) : windBadge(x0 + wr * 1.35, yTop + wr * 1.35, wr, wind, fr.B, eff, fs, lk.plays_like));
    if (!o.imm) T.push(`<g><circle cx="${nx}" cy="${ny}" r="${nr}" fill="rgba(255,255,255,.94)" stroke="${COL.ink}" stroke-width="${.6 * s}"/><g transform="rotate(${na} ${nx} ${ny})"><path d="M${nx} ${ny - nr * .72} L${nx + nr * .32} ${ny + nr * .1} L${nx - nr * .32} ${ny + nr * .1} Z" fill="${COL.red}"/><text x="${nx}" y="${ny + nr * .7}" font-size="${nr * .62}" text-anchor="middle" font-weight="700" fill="${COL.ink}">N</text></g></g>`);
    // t221u: the chosen tee (its colour) under the ball
    if (o.tee && o.teeLL) { const q = fr.toS(o.teeLL); T.push(`<g class="gp-tee0"><circle cx="${q[0]}" cy="${q[1]}" r="${7.5 * s}" fill="${o.tee.col}" stroke="${COL.ink}" stroke-width="${1.6 * s}"/><circle cx="${q[0]}" cy="${q[1]}" r="${9.2 * s}" fill="none" stroke="#fff" stroke-width="${1.2 * s}"/></g>`); }
    if (o.tee && o.teeLL) T.push(`<circle class="gp-ball" cx="${ballS[0]}" cy="${ballS[1]}" r="${4 * s}" fill="#fff" stroke="${COL.ink}" stroke-width="${1.4 * s}"/>`);
    // t244u: the flag of the chosen day (pole + red flag) and, while marking on the map, the candidate (dashed)
    const flagG = (ll, cls, cand, drag) => { const q = fr.toS(ll), Hh = 22 * s; return `<g class="${cls}" transform="translate(${q[0].toFixed(1)} ${q[1].toFixed(1)})"${drag ? ` id="gpflagm" role="button" aria-label="Bandera: arrastrala para moverla"` : ''}>${drag ? `<circle class="gp-flaghit" cy="${-Hh / 2}" r="${Math.max(26 * s, Hh * 1.05)}" fill="rgba(0,0,0,0)"/>` : ''}<ellipse rx="${3.4 * s}" ry="${1.6 * s}" fill="rgba(10,30,22,.55)"/><path d="M0 0V${-Hh}" stroke="${COL.ink}" stroke-width="${3.4 * s}" stroke-linecap="round"/><path d="M0 0V${-Hh}" stroke="#fff" stroke-width="${1.6 * s}" stroke-linecap="round"/><path d="M${.8 * s} ${-Hh}l${11 * s} ${3.6 * s}l${-11 * s} ${3.6 * s}z" fill="${cand ? '#fff' : COL.red}" stroke="${COL.ink}" stroke-width="${.9 * s}"${cand ? ` stroke-dasharray="${1.6 * s} ${1.2 * s}"` : ''}/></g>`; };
    const flagL = (ll, txt, col) => { if (!txt) return ''; const q = fr.toS(ll); return `<text x="${(q[0] + 13 * s).toFixed(1)}" y="${(q[1] - 13 * s).toFixed(1)}" font-size="${fs * .8}" font-weight="700" fill="${col}" paint-order="stroke" stroke="#fff" stroke-width="${fs * .28}">${H.esc(txt)}</text>`; };
    if (o.ff) { const F0 = ffPoint(h, fr); if (F0) { const [ux, uy] = [F0.ends[1][0] - F0.ends[0][0], F0.ends[1][1] - F0.ends[0][1]], L = Math.hypot(ux, uy) || 1, a = fr.R([F0.xy[0] - ux / L * 9, F0.xy[1] - uy / L * 9]), b = fr.R([F0.xy[0] + ux / L * 9, F0.xy[1] + uy / L * 9]);
      T.push(`<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="#fff" stroke-width="${1.6 * s}" stroke-dasharray="${2.5 * s} ${2 * s}"/><text x="${(b[0] + 3 * s).toFixed(1)}" y="${(b[1] + fs * .3).toFixed(1)}" font-size="${fs * .75}" font-weight="700" fill="${COL.ink}" paint-order="stroke" stroke="#fff" stroke-width="${fs * .28}">Frente falso</text>`); } }
    if (o.flag2) { T.push(flagG(o.flag2.ll, 'gp-flag gp-flag2', false).replace(`fill="${COL.red}"`, `fill="${COL.gold}"`)); T.push(flagL(o.flag2.ll, o.flag2.label, COL.ink)); }
    if (o.flag) { T.push(flagG(o.flag, `gp-flag${o.flagDrag ? ' gp-flagm' : ''}`, false, o.flagDrag)); T.push(flagL(o.flag, o.flagLabel, COL.red).replace('<text ', '<text id="gpflagl" ')); }
    else if (o.flagGhost) T.push(flagG(o.flagGhost, 'gp-flag gp-flagm gp-flagg', true, true));   // t250u: no flag yet: a ghost at the middle you can drag onto the pin
    if (o.flagCand) T.push(flagG(o.flagCand, 'gp-flag gp-flagc', true));
    // t243u: the player (live GPS): blue dot + accuracy ring
    if (o.me) T.push(`<g id="gpme" transform="translate(${o.me.s[0].toFixed(1)} ${o.me.s[1].toFixed(1)})"><circle id="gpmea" r="${o.me.r.toFixed(1)}" fill="rgba(37,99,235,.14)" stroke="rgba(37,99,235,.5)" stroke-width="${.8 * s}"/><circle r="${5.2 * s}" fill="#2563EB" stroke="#fff" stroke-width="${1.8 * s}"/></g>`);
    return { obs, band: [vb[1] + (fit ? fit.padT * s : 0), vb[1] + vb[3] - (fit ? fit.padB * s : 0)], svg: `<svg class="gp-map" viewBox="${vb.map(v => v.toFixed(1)).join(' ')}" role="img" aria-label="Mapa del hoyo ${h.hole}" font-family="Geist, system-ui, sans-serif">${T.join('')}</svg>`, gc: gcS, vb };
  }
  /* t218u: the green's own shape (tee→green up) with front / centre / back dots; no slope drawn here */
  /* t227u: the false-front end on the map green: front + guide yards toward the back (frame metres), and a cross line for drawing */
  function ffPoint(h, fr) {
    const ff = h.green?.false_front, g = h.green; if (!ff || !g?.front || !(g.back || g.center)) return null;
    const f = fr.F.xy(g.front), b = fr.F.xy(g.back || g.center), dx = b[0] - f[0], dy = b[1] - f[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, d = ff.yd * 0.9144;
    const xy = [f[0] + ux * d, f[1] + uy * d]; return { xy, ff, ends: [[xy[0] - uy * 40, xy[1] + ux * 40], [xy[0] + uy * 40, xy[1] - ux * 40]] };
  }
  function greenShape(h, fr, y) {
    const poly = (h.green?.polygon || []).map(fr.toS); if (!poly.length) return '';
    const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const W = Math.max(x1 - x0, 8), Hh = Math.max(y1 - y0, 8), pad = Math.max(W, Hh) * .28, vb = [x0 - pad * 1.6, y0 - pad, W + pad * 3.2, Hh + pad * 2], s = vb[2] / 300, fs = 13 * ts() * s;
    const dot = (k, c, lab, v) => { if (!h.green?.[k]) return ''; const q = fr.toS(h.green[k]); return `<circle cx="${q[0]}" cy="${q[1]}" r="${3.2 * s}" fill="${c}" stroke="${COL.ink}" stroke-width="${.8 * s}"/>${v != null ? `<text x="${q[0] + 7 * s}" y="${q[1] + fs * .35}" font-size="${fs}" font-weight="700" fill="${COL.ink}" paint-order="stroke" stroke="#fff" stroke-width="${fs * .3}">${lab} ${v}</text>` : ''}`; };
    return `<svg class="gp-gsv" viewBox="${vb.map(v => v.toFixed(2)).join(' ')}" role="img" aria-label="Forma del green del hoyo ${h.hole}" font-family="Geist, system-ui, sans-serif"><rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="${COL.rough}"/>
      ${(h.bunkers || []).map(b => `<path d="${sd(b.polygon, fr)}" fill="${COL.sand}" stroke="${COL.sandE}" stroke-width="${.6 * s}"/>`).join('')}
      <path d="${sd(h.green.polygon, fr)}" fill="${COL.green}" stroke="${COL.greenE}" stroke-width="${1.2 * s}"/>
      ${(() => { const P = ffPoint(h, fr); if (!P) return ''; const [a, b] = P.ends.map(fr.R), q = fr.R(P.xy), cid = `gpffc${h.hole}`;   // t227u: where the false front ends (club guide)
        return `<clipPath id="${cid}"><path d="${sd(h.green.polygon, fr)}"/></clipPath><line clip-path="url(#${cid})" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${COL.ink}" stroke-width="${1.5 * s}" stroke-dasharray="${3.4 * s} ${2.4 * s}"/>${y?.FF != null ? `<text text-anchor="end" x="${q[0] - 9 * s}" y="${q[1] - fs * .45}" font-size="${fs * .92}" font-weight="700" fill="${COL.ink}" paint-order="stroke" stroke="#fff" stroke-width="${fs * .3}">FF ${y.FF}</text>` : ''}`; })()}
      ${dot('back', '#fff', 'F', y?.Bk)}${dot('center', COL.gold, 'C', y?.M)}${dot('front', '#fff', 'A', y?.F)}
      <text x="${vb[0] + vb[2] / 2}" y="${vb[1] + vb[3] - fs * .5}" font-size="${fs * .9}" text-anchor="middle" fill="${COL.ink}">↑ hacia donde jugás</text></svg>`;
  }
  /* t221u: a white label pill (big line + optional small «juega» line), drawn at its top-left origin; w/h in svg units */
  /* t234u: the second line can be segments: the normal distance (gold) then «(−6 ⟨icon⟩)» per factor, red when it takes yards off, green when it adds */
  const ADJ_IC = {
    viento: '<path d="M3 8.5h11a3 3 0 1 0-3-3M3 12.5h16a3 3 0 1 1-3 3M3 16.5h8" fill="none" stroke-width="2.3" stroke-linecap="round"/>',
    temp: '<path d="M10 4.5a2 2 0 0 1 4 0v9.3a4.2 4.2 0 1 1-4 0z" fill="none" stroke-width="2.1"/><circle cx="12" cy="17.4" r="2.1" stroke="none"/>',
    lluvia: '<path d="M12 3.2c-3 4.6-6 7.9-6 11.2a6 6 0 0 0 12 0c0-3.3-3-6.6-6-11.2z" stroke="none"/>',
    altura: '<path d="M7 3.5v15M4 7l3-3.5L10 7M4 15l3 3.5 3-3.5M13 11h8" fill="none" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>',   // off for now (ELEV_TERM)
    cancha: '<circle cx="15.5" cy="12" r="5.6" stroke="none"/><path d="M2.5 8.5h6M1.5 12h6M2.5 15.5h6" fill="none" stroke-width="2" stroke-linecap="round"/><path d="M2 20.5h20" fill="none" stroke-width="1.6" stroke-linecap="round"/>',   // t236u: a rolling ball (the roll)
  };
  const ADJ_COL = v => v < 0 ? COL.red : '#0B2545';
  const adjSegs = (N, terms) => [{ t: String(N), c: '#86672F' }, ...terms.flatMap(x => [{ t: ` (${x.yd < 0 ? '−' : '+'}${Math.abs(x.yd)}`, c: ADJ_COL(x.yd), b: 1 }, { ic: x.k, c: ADJ_COL(x.yd) }, { t: ')', c: ADJ_COL(x.yd), b: 1 }])];
  function pill(lines, fs, s, k = 1) {
    const f1 = fs * 1.08 * k, f2 = fs * .86 * k, padX = 7 * s * k, padY = 4.2 * s * k, cw = (t, f) => [...String(t)].reduce((a, c) => a + (/[0-9]/.test(c) ? .62 : /[ \u00a0·]/.test(c) ? .28 : /[()|.,:]/.test(c) ? .32 : /[+−-]/.test(c) ? .6 : /[A-ZÁÉÍÓÚÑ]/.test(c) ? .66 : .54), 0) * f, L2 = lines[1];
    const segs = Array.isArray(L2) ? L2 : null, sw = g => g.ic ? f2 * 1.22 : cw(g.t, f2) + (g.t[0] === ' ' ? f2 * .22 : 0);
    const w2 = !L2 ? 0 : segs ? segs.reduce((a, g) => a + sw(g), 0) : cw(L2, f2);
    const w = Math.max(cw(lines[0], f1), w2) + padX * 2, h = padY * 2 + f1 + (L2 ? f2 * 1.12 : 0), y2 = padY + f1 + f2 * .92;
    let l2 = '';
    if (segs) { let xx = (w - w2) / 2; for (const g of segs) { const gw = sw(g);
        l2 += g.ic ? `<g transform="translate(${(xx + f2 * .12).toFixed(1)} ${(y2 - f2 * .86).toFixed(1)}) scale(${(f2 / 24).toFixed(3)})" fill="${g.c}" stroke="${g.c}">${ADJ_IC[g.ic] || ''}</g>`
          : `<text x="${(xx + (g.t[0] === ' ' ? f2 * .5 : 0)).toFixed(1)}" y="${y2.toFixed(1)}" font-size="${f2.toFixed(2)}" font-weight="${g.b ? 750 : 650}" fill="${g.c}">${H.esc(g.t.trim())}</text>`;
        xx += gw; } }
    else if (L2) l2 = `<text x="${(w / 2).toFixed(1)}" y="${y2.toFixed(1)}" font-size="${f2.toFixed(2)}" text-anchor="middle" font-weight="650" fill="#86672F">${H.esc(L2)}</text>`;
    const svg = `<rect x="0" y="0" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${(Math.min(h / 2, 9 * s)).toFixed(1)}" fill="#fff" stroke="${COL.ink}" stroke-width="${1.2 * s}"/>` +
      `<text x="${(w / 2).toFixed(1)}" y="${(padY + f1 * .8).toFixed(1)}" font-size="${f1.toFixed(2)}" text-anchor="middle" font-weight="750" fill="${COL.ink}">${H.esc(lines[0])}</text>` + l2;
    return { svg, w, h };
  }
  /* t221u: where a pill goes for segment a→b: beside the line near its middle, inside the map band, not over markers, hazards, the ring or the other pill */
  /* t235u: place a pill; if it would sit on a marker, a ring or another pill (or it is wider than the map), shrink it and try again */
  function placePill(lines, fs, s, a, b, vb, band, obs, rings, k0 = 1) {
    let out = null;
    for (const k of [k0, k0 * .86, k0 * .74]) { let P = pill(lines, fs, s, k); const mx = vb[2] - 10 * s; if (P.w > mx) P = pill(lines, fs, s, k * mx / P.w);
      const q = pillPos(a, b, P, s, vb, band, obs, rings); if (!out || q.ov < out.q.ov - 1e-6) out = { P, q }; if (q.ov < P.w * P.h * .02) break; }
    return out;
  }
  function pillPos(a, b, P, s, vb, band, obs, rings) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, n = [-dy / L, dx / L], gap = 16 * s, x0 = vb[0] + 4 * s, x1 = vb[0] + vb[2] - 4 * s, y0 = band[0] + 2 * s, y1 = band[1] - 2 * s;
    const ob = [...obs, ...rings.map(r => [r[0] - 15 * s, r[1] - 15 * s, r[0] + 15 * s, r[1] + 15 * s]), [vb[0] + vb[2] - 48 * s * ts(), vb[1], vb[0] + vb[2], vb[1] + 112 * s * ts()]];
    const ovl = (bx) => ob.reduce((t, o) => t + Math.max(0, Math.min(bx[2], o[2]) - Math.max(bx[0], o[0])) * Math.max(0, Math.min(bx[3], o[3]) - Math.max(bx[1], o[1])), 0);
    let best = null;
    for (const t of [.5, .4, .6, .3, .7, .22, .78]) for (const side of [-1, 1]) for (const dv of [0, -1, 1, -2, 2]) {
      const m = [a[0] + dx * t, a[1] + dy * t], sx = side * (Math.abs(n[0]) > .2 ? Math.sign(n[0]) : 1);
      let x = sx < 0 ? m[0] - gap - P.w : m[0] + gap, y = m[1] - P.h / 2 + dv * P.h * .7;
      const clip = (x < x0 || x + P.w > x1 || y < y0 || y + P.h > y1);
      x = Math.min(Math.max(x, x0), x1 - P.w); y = Math.min(Math.max(y, y0), y1 - P.h);
      const box = [x - 2 * s, y - 2 * s, x + P.w + 2 * s, y + P.h + 2 * s], sc = ovl(box) + (clip ? P.w * P.h * .05 : 0) + (t !== .5 ? 1 : 0) * P.w * .01 + Math.abs(dv) * P.w * .02;
      if (!best || sc < best.sc) best = { x, y, box, sc, ov: ovl(box) };
      if (sc < 1e-6) return best;
    }
    return best;
  }
  function ovalPath(o, fr, attrs) {   // o: {from, aim, mean, cov} in frame metres/yd
    const C = P(), E = C.ellipse(o.cov), th = E.angle_deg * Math.PI / 180, N = 36, out = [];
    for (let i = 0; i < N; i++) { const t = (2 * Math.PI * i) / N, fa = Math.cos(t) * E.a_yd, lb = Math.sin(t) * E.b_yd;
      out.push(fr.R(C.offsetPoint(o.from, o.aim, o.mean.fwd + fa * Math.cos(th) - lb * Math.sin(th), o.mean.lat + fa * Math.sin(th) + lb * Math.cos(th)))); }
    return `<polygon points="${out.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')}" ${attrs}/>`;
  }

  /* ---------- 18-hole overview ---------- */
  /* Arrow points where the wind blows, rotated against the verified tee→green bearing. Same mark on the strategy tile and the cancha card. */
  function windAim(fromDeg, bearing) {
    if (fromDeg == null || bearing == null || !Number.isFinite(+fromDeg) || !Number.isFinite(+bearing)) return null;
    return ((+fromDeg + 180 - +bearing) % 360 + 360) % 360;
  }
  function windArrowGroup(cx, cy, aim) {
    if (aim == null) return '';
    return `<g transform="rotate(${Number(aim).toFixed(2)} ${cx} ${cy})"><path d="M${cx} ${cy + 8} L${cx} ${cy - 5}" stroke="${COL.ink}" stroke-width="2.2" stroke-linecap="round"/><path d="M${cx - 3.8} ${cy - 2.5} L${cx} ${cy - 8.5} L${cx + 3.8} ${cy - 2.5} Z" fill="${COL.ink}"/></g>`;
  }
  function miniIcon(h, w, bearing) {
    const fr = holeFrame(h), ln = h.line.map(fr.toS), g = h.green?.polygon?.map(fr.toS) || [];
    const all = [...ln, ...g], xs = all.map(p => p[0]), ys = all.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const k = Math.min(30 / Math.max(x1 - x0, 1), 66 / Math.max(y1 - y0, 1)), ox = 22 - ((x0 + x1) / 2) * k, oy = 40 - ((y0 + y1) / 2) * k, T = p => `${(p[0] * k + ox).toFixed(1)},${(p[1] * k + oy).toFixed(1)}`;
    const a = w ? windAim(w.from_deg, bearing) : null;
    return `<svg class="gp-mini" viewBox="0 0 44 80" aria-hidden="true"><polyline points="${ln.map(T).join(' ')}" fill="none" stroke="${COL.fair}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>${g.length ? `<polygon points="${g.map(T).join(' ')}" fill="${COL.green}" stroke="${COL.greenE}" stroke-width=".8"/>` : ''}<circle cx="${T(ln[0]).split(',')[0]}" cy="${T(ln[0]).split(',')[1]}" r="2.4" fill="${COL.ink}"/>
      ${windArrowGroup(33, 14, a)}</svg>`;
  }
  /* Compact hole wind for the cancha card. holes: {hole, bearing} from a verified tee and green. No bearing → no arrow. */
  function windTiles(holes, wind) {
    const rules = window.GolfletRules, from = wind && wind.from_deg, kmh = wind && wind.kmh;
    const list = Array.isArray(holes) ? holes : [];
    return `<div class="gp-grid tw-wind" aria-label="Viento por hoyo">${list.map(h => {
      const play = rules && rules.windPlay ? rules.windPlay(h.hole, from, h.bearing, kmh) : null;
      const ok = !!(play && play.relative && play.relative !== 'unavailable' && Number.isFinite(+h.bearing));
      const word = ok ? (play.relative === 'contra' ? 'en contra' : play.relative === 'favor' ? 'a favor' : 'cruzado') : '';
      const label = ok ? word : '<span>Sin rumbo</span><span>verificado</span>';
      const speed = ok && kmh != null && Number.isFinite(+kmh) ? `${Math.round(+kmh)} km/h` : '';
      const aim = ok ? windAim(from, h.bearing) : null;
      const spoken = ok ? `Hoyo ${h.hole}, ${word}, ${speed}` : `Hoyo ${h.hole}, Sin rumbo verificado`;
      return `<div class="gp-tile tw-wtile" data-hole="${h.hole}" data-wind="${ok ? play.relative : 'unavailable'}" aria-label="${spoken}"><span class="gp-n num">${h.hole}</span>${aim != null ? `<svg class="gp-mini" viewBox="0 0 44 44" aria-hidden="true">${windArrowGroup(22, 22, aim)}</svg>` : '<span class="gp-mini tw-noarrow" aria-hidden="true"></span>'}<span class="gp-w num">${speed}</span><span class="gp-eta">${label}</span></div>`;
    }).join('')}</div>`;
  }
  function fcNote(fc) {
    if (fc.status === 'ok') return '';
    const m = { too_far: `El pronóstico llega hasta 16 días. Volvé desde el ${fc.available_from ? fc.available_from.split('-').reverse().slice(0, 2).join('/') : ''} para ver el viento.`, unavailable: 'No pudimos traer el pronóstico. Probá de nuevo en un rato.', past: 'Esa fecha ya pasó.', no_location: 'No tenemos la ubicación de la cancha para el pronóstico.', no_map: 'Todavía no tenemos el mapa de esta cancha.' }[fc.status] || 'Sin pronóstico.';
    return `<div class="msg gp-fc">${e(m)}</div>`;
  }
  async function drawPlan(el, id) {
    const d = await H.api(`/api/plans/${encodeURIComponent(id)}`); if (!live('gp')) return;
    if (!d.course) { el.innerHTML = `<div class="card gp-empty"><b>Todavía no tenemos el mapa de esta cancha</b></div>`; return; }
    const m = d.course.map === false ? { holes: [] } : await courseMap(d.course.club_code, d.course.course); if (!live('gp')) return;
    const p = d.plan, byHole = n => m.holes.find(h => h.hole === n), LB = window.GolfletLibreta;
    const order = [...d.holes].sort((a, b) => a.order - b.order), TN = d.torneo || { active: false, locks: {} };
    const CP = d.course.completeness || { ready: { libreta: true, wind_yd: true }, holes_en_relevamiento: [] }, RV = new Set(CP.holes_en_relevamiento || []);
    const relevCard = () => `<div class="card gp-relev" role="status"><b>Cancha en relevamiento</b><span>Todavía no tenemos todos los datos de esta cancha (salidas, línea de juego, green, marcas y obstáculos) para imprimir la libreta ni calcular el ± yd por viento. Podés armar los hoyos por distancia.</span>${CP.missing?.length ? `<small>Falta: ${e(CP.missing.slice(0, 3).join(' · '))}</small>` : ''}</div>`;
    el.innerHTML = `<div class="stitle">${e(d.course.course)} · ${e(dLong(p.date))}</div><p class="foot gp-sub">${e(d.course.club_name || '')}</p>
      ${TN.active ? `<div class="gp-tn" role="status">${LOCK}<b>Modo torneo</b>${TN.no_distance_rule ? '<span>sin medidores</span>' : ''}</div>` : ''}
      ${!CP.ready.libreta ? relevCard() : `<div class="gp-acts">${LB ? LB.printCard(d) : `<a class="gp-act" href="/api/plans/${e(p.id)}/pdf" target="_blank" rel="noopener">${ICP}<b>Imprimir libreta</b><span>PDF</span></a>`}
        <a class="gp-act" href="#/plan/subir/${encodeURIComponent(d.course.club_code)}/${encodeURIComponent(d.course.course)}?plan=${encodeURIComponent(p.id)}">${ICU}<b>Subir libreta</b><span>Foto de lo que anotaste</span></a></div>`}
      <fieldset class="card gp-set" ${TN.active ? 'disabled' : ''}>
        <label class="gp-f"><span class="gp-l">Salida</span><input type="time" id="gptt" value="${e(p.tee_time)}" step="300"></label>
        <div class="gp-f"><span class="gp-l">Hoyo</span><div class="seg" id="gpsh">${[1, 10].map(n => `<button type="button" data-h="${n}" class="${p.start_hole === n ? 'on' : ''}" aria-pressed="${p.start_hole === n}">${n}</button>`).join('')}</div></div>
        <div class="gp-f"><span class="gp-l" title="${p.pace_source === 'propio' ? 'Tu ritmo de tus rondas con GPS' : p.pace_source === 'manual' ? 'Elegido por vos' : 'Estimado'}">Ritmo <small>min por hoyo</small></span><div class="gp-step"><button type="button" data-d="-0.5" aria-label="Menos minutos por hoyo">−</button><b class="num" id="gpmin">${String(p.min_per_hole).replace('.', ',')}</b><button type="button" data-d="0.5" aria-label="Más minutos por hoyo">+</button></div></div>
        <div class="gp-f"><span class="gp-l">Distancias</span><div class="seg" id="gpds">${[['libreto', 'Libreto'], ['gps', 'GPS']].map(([k, l]) => `<button type="button" data-s="${k}" class="${p.dist_source === k ? 'on' : ''}" aria-pressed="${p.dist_source === k}">${l}</button>`).join('')}</div></div>
      </fieldset>
      ${fcNote(d.forecast)}
      ${d.course.numbering_unconfirmed ? '<p class="gp-note">Numeración de la Azul a confirmar con el club.</p>' : ''}
      <div class="section gp-gh"><h2>Hoyo por hoyo</h2><span class="gp-key num">hora · <b>km/h</b>${CP.ready.wind_yd ? ` · ${TN.locks.plays_like && TN.active ? LOCK : ''}±yd` : ''}</span></div>
      ${d.course.map === false && CP.ready.libreta ? '<p class="gp-note">Cancha con la guía del club: hoyos en esquema, sin ± yd por viento (falta el rumbo de cada hoyo).</p>' : ''}
      ${CP.ready.libreta && RV.size ? `<p class="gp-note">Hoyos en relevamiento: ${[...RV].join(', ')}. En la libreta salen como «hoyo en relevamiento».</p>` : ''}
      <div class="gp-grid">${order.map(x => { const h = byHole(x.hole); if (!h && d.course.map !== false) return ''; const eff = x.effect?.plays_like_yd;
        return `<a class="gp-tile" href="#/plan/${e(p.id)}/hoyo/${x.hole}" aria-label="Hoyo ${x.hole}, ${x.eta}${x.wind ? `, viento ${Math.round(x.wind.kmh)} km/h` : ''}">
          <span class="gp-n num">${x.hole}</span>${h ? miniIcon(h, x.wind, x.bearing_true ?? 0) : `<span class="gp-par num">Par ${x.par ?? '—'}</span>`}
          <span class="gp-eta num">${e(x.eta)}</span>
          ${x.wind ? `<span class="gp-w num"><b>${Math.round(x.wind.kmh)}</b>${eff != null ? `<em class="${eff > 0 ? 'up' : ''}">${sgn(eff)}</em>` : ''}</span>` : '<span class="gp-w num">—</span>'}
          ${RV.has(x.hole) && CP.ready.libreta ? '<small class="gp-rv">en relev.</small>' : ''}${x.shots?.length ? '<i class="gp-done" aria-label="armado"></i>' : ''}</a>`; }).join('')}</div>
      <details class="gp-det"><summary>Detalle</summary>${TN.active ? '<p><b>Modo torneo</b> (Regla 4.3): durante la ronda tu estrategia queda como la armaste. Sin ± yd por viento, sugerencias, óvalos ni pendientes del green; el pronóstico, los obstáculos y tus palos se ven igual.</p>' : ''}<p>Libreta para imprimir: A4 horizontal en blanco y negro con 3 tarjetas por hoja (1 hoyo por tarjeta) para cortar y abrochar arriba: cómo vas a jugar cada hoyo, viento y hora, marcas y obstáculos; en doble faz, el dorso de cada tarjeta trae el green del hoyo que sigue (en blanco si es par 3: su green va en el frente). Por defecto la tarjeta mide 9,9 × 21 cm, sin tira para cortar; con «Torneo» (9,9 × 17,7 cm) los greens van a escala 1:480 o menor (Regla 4.3).</p><p>Hora estimada de cada hoyo: salida + ritmo (par 3 más rápido, par 5 más lento). Número grande: viento en km/h a esa hora; ± yardas: cuánto más largo (+) o más corto (−) juega el hoyo por el viento.</p><p>${e(d.wind_model.label)}</p><p>${e(d.forecast.note)}</p></details>`;
    if (LB) LB.bindPrint(el, d);
    const patch = async b => { try { await H.api(`/api/plans/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(b) }); drawPlan(el, id); } catch (err) { H.toast(err.message || 'No se pudo guardar'); } };
    live('gptt').onchange = ev => /^\d\d:\d\d$/.test(ev.target.value) && patch({ tee_time: ev.target.value });
    el.querySelectorAll('#gpsh [data-h]').forEach(b => b.onclick = () => patch({ start_hole: +b.dataset.h }));
    el.querySelectorAll('#gpds [data-s]').forEach(b => b.onclick = () => patch({ dist_source: b.dataset.s }));
    let mt; el.querySelectorAll('.gp-step [data-d]').forEach(b => b.onclick = () => { const v = Math.min(25, Math.max(6, Math.round((p.min_per_hole + +b.dataset.d) * 10) / 10)); p.min_per_hole = v; live('gpmin').textContent = String(v).replace('.', ','); clearTimeout(mt); mt = setTimeout(() => patch({ min_per_hole: v }), 600); });
  }

  /* ---------- hole + shot planner ---------- */
  function clubDist(c, src) {            // → { kind:'point'|'oval', yd, carry?, mean?, cov?, used, note? } or null
    const lib = c.libreto ? (c.libreto.total_yd ?? c.libreto.carry_yd) : null, gpsOk = c.gps?.ok;
    if (src === 'gps' && gpsOk) return { kind: 'oval', yd: c.gps.mean.fwd, mean: c.gps.mean, cov: c.gps.cov, used: 'gps', n: c.gps.used };
    if (src === 'gps' && lib != null) return { kind: 'point', yd: lib, carry: c.libreto.carry_yd, used: 'libreto', note: `Sin tiros GPS suficientes (${c.gps?.n || 0} de 5): uso tu libreto.` };
    if (lib != null) return { kind: 'point', yd: lib, carry: c.libreto.carry_yd, used: 'libreto' };
    if (gpsOk) return { kind: 'oval', yd: c.gps.mean.fwd, mean: c.gps.mean, cov: c.gps.cov, used: 'gps', n: c.gps.used, note: 'No cargaste este palo en el libreto: uso tus tiros GPS.' };
    return null;
  }
  // t181u: green slope viewer, lazy (script + data) and only for surveyed greens; nothing otherwise
  const GREENS = new Map(); let GV = null;
  const gvScript = () => window.GolfletGreen ? Promise.resolve() : (gvScript.p ||= new Promise((ok, ko) => { const sc = document.createElement('script'); sc.src = '/green-viewer.js'; sc.onload = ok; sc.onerror = ko; document.head.appendChild(sc); }));
  async function mountGreen(course, n, h) {
    const k = `${course.club_code}|${course.course}|${n}`;
    try {
      if (!GREENS.has(k)) GREENS.set(k, H.api(`/api/course-maps/${encodeURIComponent(course.club_code)}/${encodeURIComponent(course.course)}/greens/${n}`));
      const [s] = await Promise.all([GREENS.get(k), gvScript()]);
      const box = document.getElementById('gpgreen'); if (!box) return;
      GV?.destroy(); GV = window.GolfletGreen.mount(box, s, { bearing: h.bearing?.tee_to_green_true || 0 });
    } catch { GREENS.delete(k); const box = document.getElementById('gpgreen'); if (box) box.closest('.gp-green')?.remove(); }
  }
  // t190u: the club guide's green (shape, falls, levels) under the planner, when the course has one
  async function guideGreen(course, n) {
    try { const g = await H.api(`/api/course-maps/${encodeURIComponent(course.club_code)}/${encodeURIComponent(course.course)}/green-guide`), gg = g.greens_locked ? null : g.greens?.[n];
      const pl = document.getElementById('gpdx'); if (!gg || !pl || document.getElementById('lbgw')) return;
      const nf = (gg.falls || []).length;   // t230u: the guide's arrows are its slope data (single / double); none → still «sin datos»
      pl.insertAdjacentHTML('beforeend', `<section class="lb-gw" id="lbgw" data-falls="${nf}" aria-label="Green del hoyo ${n}"><div class="gp-gt">${nf ? 'Caídas' : 'Green'} <small>guía del club</small></div>${window.GolfletLibreta.greenSvg(gg, { id: n })}${window.GolfletLibreta.greenKey({ ff: gg.false_front, marks: gg.marks?.length, dbl: gg.falls?.some(f => f[3] === 2) })}</section>`); } catch { /* none or locked */ }
  }
  /* t217u: the hole is ONE screen with no scroll: compact header, map filling the rest (Diseño/Satelital top-left), one bottom strip.
     The point is dragged with pointer events (touch-action:none) and the map pinch-zooms by itself; the explanations live in «Detalle del hoyo». */
  const HOLEZ = {};                    // "<plan>|<hole>" → zoomed viewBox (session); none = whole hole
  let CURH = null, RSZ = null, RO = null;
  addEventListener('resize', () => { clearTimeout(RSZ); RSZ = setTimeout(() => { if (CURH && document.getElementById('gpmap')) CURH(); }, 160); });
  const INFO = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M10 9v5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle cx="10" cy="6" r="1.15" fill="currentColor"/></svg>';
  function fitBox(mw) {                // the map box and the room the overlays take (px)
    const R = mw.getBoundingClientRect(), tl = mw.querySelector('.gp-tl'), st = mw.querySelector('.gp-strip');
    return { W: Math.max(120, R.width), H: Math.max(160, R.height), padT: (tl ? tl.offsetTop + tl.offsetHeight : 0) + 8, padB: (st ? st.offsetHeight + 8 : 0) + 8 };
  }
  // one finger: drag the point (when there is a shot to place) or pan a zoomed map; two fingers: pinch zoom. Never scrolls the page.
  function mapGestures(mw, svgEl, base, key, drag) {
    let vb = HOLEZ[key] && HOLEZ[key][2] < base[2] ? [...HOLEZ[key]] : [...base];
    const zr = mw.querySelector('.gp-zr');
    const clamp = () => { vb[0] = Math.min(Math.max(vb[0], base[0]), base[0] + base[2] - vb[2]); vb[1] = Math.min(Math.max(vb[1], base[1]), base[1] + base[3] - vb[3]); };
    const apply = () => { clamp(); svgEl.setAttribute('viewBox', vb.map(v => v.toFixed(1)).join(' ')); const z = vb[2] < base[2] * .995; if (zr) zr.hidden = !z; HOLEZ[key] = z ? [...vb] : null; };
    const at = (cx, cy) => { const r = svgEl.getBoundingClientRect(); return [vb[0] + (cx - r.left) / r.width * vb[2], vb[1] + (cy - r.top) / r.height * vb[3]]; };
    const P = new Map(); let mode = null, g = null;
    const two = () => { const [a, b] = [...P.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; };
    let tap = null;
    svgEl.addEventListener('pointerdown', ev => {
      ev.preventDefault(); try { svgEl.setPointerCapture(ev.pointerId); } catch { /* synthetic */ }
      P.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (P.size === 1 && FLAGDRAG && ev.target.closest?.('#gpflagm')) { mode = 'flag'; FLAGDRAG.start(at(ev.clientX, ev.clientY)); return; }   // t250u: the flag's hit target wins over the ring and panning
      if (P.size === 1 && MAPTAP) { tap = { map: true, x: ev.clientX, y: ev.clientY }; mode = 'tap'; return; }
      const pb = P.size === 1 && BDTAP ? ev.target.closest?.('[data-bd]') : null;   // t234u: a tap on a pill opens its breakdown (no drag)
      if (pb) { tap = { id: pb.dataset.bd, x: ev.clientX, y: ev.clientY }; mode = 'tap'; return; }
      if (P.size === 1) { if (drag) { mode = 'drag'; drag.move(at(ev.clientX, ev.clientY)); } else { mode = 'pan'; g = { x: ev.clientX, y: ev.clientY, vb: [...vb] }; } }
      else if (P.size === 2) { if (mode === 'drag') drag.cancel(); if (mode === 'flag') FLAGDRAG?.cancel(); const t = two(); mode = 'pinch'; g = { ...t, vb: [...vb], p: at(t.mx, t.my) }; }
    });
    svgEl.addEventListener('pointermove', ev => {
      if (!P.has(ev.pointerId)) return; ev.preventDefault(); P.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      const r = svgEl.getBoundingClientRect();
      if (mode === 'tap' && tap && Math.hypot(ev.clientX - tap.x, ev.clientY - tap.y) > 10) { tap = null; mode = 'pan'; g = { x: ev.clientX, y: ev.clientY, vb: [...vb] }; }
      if (mode === 'flag') FLAGDRAG?.move(at(ev.clientX, ev.clientY));
      else if (mode === 'drag') drag.move(at(ev.clientX, ev.clientY));
      else if (mode === 'pan' && g) { vb[0] = g.vb[0] - (ev.clientX - g.x) / r.width * g.vb[2]; vb[1] = g.vb[1] - (ev.clientY - g.y) / r.height * g.vb[3]; apply(); }
      else if (mode === 'pinch' && P.size === 2) { const t = two(), wv = Math.min(base[2], Math.max(base[2] / 5, g.vb[2] * g.d / t.d)), hv = wv * base[3] / base[2];
        vb = [g.p[0] - (t.mx - r.left) / r.width * wv, g.p[1] - (t.my - r.top) / r.height * hv, wv, hv]; apply(); }
    });
    const up = ev => { if (!P.has(ev.pointerId)) return; P.delete(ev.pointerId);
      if (mode === 'tap' && P.size === 0) { mode = null; const t = tap; tap = null; if (t && t.map && MAPTAP && ev.type === 'pointerup') { MAPTAP(at(ev.clientX, ev.clientY)); return; } if (t && BDTAP && ev.type === 'pointerup') BDTAP(t.id); return; }
      if (mode === 'flag' && P.size === 0) { mode = null; if (ev.type === 'pointerup') FLAGDRAG?.end(); else FLAGDRAG?.cancel(); return; }
      if (mode === 'drag' && P.size === 0) { mode = null; drag.end(); return; }
      if (P.size === 0) mode = null; else if (mode === 'pinch') { mode = 'hold'; } };
    svgEl.addEventListener('pointerup', up); svgEl.addEventListener('pointercancel', up);
    mw.addEventListener('touchmove', ev => ev.preventDefault(), { passive: false });   // iOS: belt and braces, the page never moves
    if (zr) zr.onclick = () => { vb = [...base]; apply(); };
    apply();
  }
  async function drawHole(el, id, n, sat, det) {
    const d = await H.api(`/api/plans/${encodeURIComponent(id)}`); if (!live('gp')) return;
    if (!d.course) { el.innerHTML = `<div class="card gp-empty"><b>Todavía no tenemos el mapa de esta cancha</b></div>`; return; }
    if (d.course.map === false && window.GolfletLibreta) return window.GolfletLibreta.guideHole(el, { d, id, n, H, live });
    const TN = d.torneo || { active: false, locks: {} }, PRC = pracGet(), PR = !!PRC && PRC.id === id;
    // t243u: practice keeps the Rules' locks of a competition day (no plays-like, no advice) but lets you mark shots
    const LK = TN.active ? (PR ? { ...TN.locks, planner: false } : TN.locks) : {};
    if (PR) { geoAuto(); wakeOn(); if (!/[?&]v=dis/.test(location.hash)) sat = true; }
    MAPTAP = null; FLAGDRAG = null; clearInterval(WXI);
    const fdate = () => FLDATE[id] || (PR ? todayAR() : d.plan.date), FCC = d.course.club_code, FCO = d.course.course;
    const [m, CL, FL0] = await Promise.all([courseMap(d.course.club_code, d.course.course), LK.planner ? null : clubs().catch(err => { if (err?.status === 423) return { clubs: [], method: '', locked: true }; throw err; }), flagsLoad(FCC, FCO, fdate()).catch(() => ({ flags: {}, dates: [] }))]); if (!live('gp')) return;
    let FLV = FL0, FLUI = null, FLC = null, FLDEL = false, GM = false, FRAME = null, HSEL = false, AH = null, AHT = null, MENU = false, TG = { r1: null, r2: null };   // t244u: the flags of the chosen day · panel state · map-tap candidate · delete armed
    // t245u: live mode uses the wind measured right now (Open-Meteo 15 min) instead of the forecast at the ETA; Medal: shown, never applied (LK.plays_like)
    const applyWx = () => { const w = WXL.v; if (!PR || !w || Date.now() - WXL.t > 25 * 60e3) return false;
      x.wind = { kmh: w.kmh, gust_kmh: w.gust_kmh, from_deg: w.from_deg, now: true, at: w.at }; x.effect = null; if (w.temp_c != null) x.wx = { ...(x.wx || {}), temp_c: Math.round(w.temp_c * 10) / 10 }; return true; };
    const h = m.holes.find(x => x.hole === n), x = d.holes.find(y => y.hole === n);
    if (x) applyWx();
    if ((!h || !h.line?.length) && d.course.green_guide && window.GolfletLibreta) return window.GolfletLibreta.guideHole(el, { d, id, n, H, live });   // t221u: MdP 7/16 (no map yet): the club guide's hole
    if (!h || !h.line?.length) { el.innerHTML = `<div class="card gp-empty"><b>No tenemos el mapa de este hoyo</b><span>OpenStreetMap no tiene la línea de juego del hoyo ${n}.</span></div>`; return; }
    const C = P(), fr = holeFrame(h), path = playPath(h, fr), HZ = hazardsOf(h, fr);
    const gcG = h.green?.center || h.line[h.line.length - 1];
    let gc = gcG;   // t244u: what you aim at: the flag of the chosen day when there is one, else the middle of the green
    const otherDay = () => fdate() === todayAR() ? addDays(todayAR(), 1) : todayAR(), flag2 = () => (FLS.get(flk(FCC, FCO, otherDay()))?.flags || {})[n] || null;
    const dCap = dt => { const t = dt === todayAR() ? 'hoy' : dt === addDays(todayAR(), 1) ? 'mañana' : dt.slice(8) + '/' + dt.slice(5, 7); return t[0].toUpperCase() + t.slice(1); };
    if (PR) flagsLoad(FCC, FCO, otherDay()).then(() => { if (CURH && live('gplive')?.dataset.k === `${id}|${n}` && flag2()) CURH(); }).catch(() => {});
    const flagNow = () => FLV.flags[n] || null, syncT = () => { gc = flagNow()?.ll || gcG; }, toT = () => flagNow() ? 'a la bandera' : 'al centro';
    syncT();
    // t221u: tee de salida. Only the club card's tees for this hole; the choice is kept per course on this device; default: stored → your usual tee (your cards) → the mapped one
    const TEES = holeTees(h, x, d), mapYd = h.play_length_yd;
    const pickTee = () => { const st = teeStored(d), u = d.course.usual_tee ? String(d.course.usual_tee).toUpperCase() : null;
      return TEES.find(t => t.key === st) || TEES.find(t => t.key === u) || (TEES.length ? [...TEES].sort((a, b) => Math.abs(a.yd - mapYd) - Math.abs(b.yd - mapYd))[0] : null); };
    let teeStart = null, tee = null, teeLL = null, start = null, sub = '', subA = '', HZ2 = h.hazards || [], shift = 0;
    const setTee = t => {
      tee = t; const sp = t ? teeSpot(h, fr, t.yd) : null;
      teeLL = sp ? sp.ll : null; start = teeLL || h.tees?.[0]?.center || h.line[0]; teeStart = start;
      shift = sp && Number.isFinite(mapYd) ? Math.round(sp.along - mapYd) : 0; HZ2 = (h.hazards || []).map(z => hzShift(z, shift));
      const len = t ? t.yd : h.play_length_yd;
      sub = `${x.par ? `Par ${x.par} · ` : ''}${LK.distances ? '' : `${len} yd · `}${e(x.eta)}`;
      subA = [x.par ? `Par ${x.par}` : '', LK.distances ? '' : `${len} yd`].filter(Boolean).join(' · ');
    };
    setTee(pickTee());
    /* t243u practice: the log is «club X hit from here» ({ club, at, land }); the ball is your GPS once you walked away from the last hit, else that shot's estimated landing */
    const nextH = (() => { const ord0 = [...d.holes].sort((a, b) => a.order - b.order), k0 = ord0.findIndex(y => y.hole === n); return ord0[k0 + 1]?.hole ?? null; })();
    const gpsState = () => { if (!PR) return null;
      const GW = { idle: 'GPS sin activar', asking: 'Pidiendo permiso para el GPS…', denied: 'Ubicación bloqueada para Golflet', timeout: 'El GPS tardó demasiado' };
      if (GW[GEO.err] && !(GEO.ll && Date.now() - GEO.t < 30000)) return { ok: false, why: GW[GEO.err], act: GEO.err !== 'asking' }; if (GEO.err === 'nogeo') return { ok: false, why: 'Este navegador no da GPS' };
      if (!GEO.ll || Date.now() - GEO.t > 30000) return { ok: false, why: GEO.err ? 'Sin señal de GPS' : GEO.id == null ? 'GPS sin activar' : 'Buscando GPS…', act: !!GEO.err || GEO.id == null };
      const dG = C.dist(fr.F.xy(GEO.ll), fr.F.xy(gc)) / C.YD;
      if (GEO.acc > 25) return { ok: false, why: `GPS impreciso (±${Math.round(GEO.acc)} m)`, ll: GEO.ll, acc: GEO.acc };
      if (dG > 600) return { ok: false, why: `Estás lejos de este hoyo (${Math.round(dG)} yd)`, ll: GEO.ll, acc: GEO.acc };
      return { ok: true, ll: GEO.ll, acc: GEO.acc }; };
    const prSync = () => { const L = logGet(id, n), g = gpsState();
      if (!L.length) { start = g?.ok ? g.ll : teeStart; shots = []; return g; }
      start = L[0].at; shots = L.slice(1).map((z, i) => ({ club: L[i].club, to: z.at, adjusted: true }));
      const lt = L[L.length - 1], moved = g?.ok && C.dist(fr.F.xy(g.ll), fr.F.xy(lt.at)) / C.YD > 10;
      if (moved) shots.push({ club: lt.club, to: g.ll, adjusted: true, live: true }); else if (lt.land) shots.push({ club: lt.club, to: lt.land, adjusted: true, est: true });
      return g; };
    let PRL = '', LASTR = null, LASTT = 0, LASTOK = null, PRT = null;
    const dShort = dt => { const z = new Date(dt + 'T12:00:00Z'); return `${WD[z.getUTCDay()].slice(0, 3)} ${z.getUTCDate()}/${z.getUTCMonth() + 1}`; };
    const dName = dt => dt === todayAR() ? 'hoy' : dt === addDays(todayAR(), 1) ? 'mañana' : dShort(dt);
    // t245u: the wind now, relative to where you are hitting (arrow = where it blows to; up = toward the target)
    const windLine = o => { const w = x.wind; if (!w) return '';
      const b = C.bearingXY(fr.F.xy(o), fr.F.xy(gc)), c = C.windComp(b, w), a = ((w.from_deg + 180 - b) % 360 + 360) % 360, P0 = [];
      if (Math.abs(c.head_mph) >= 2) P0.push(c.head_mph > 0 ? 'en contra' : 'a favor');
      if (Math.abs(c.cross_mph) >= 2) P0.push(`cruzado de ${c.cross_mph > 0 ? 'derecha a izquierda' : 'izquierda a derecha'}`);
      const words = P0.length ? P0.join(', ') : 'casi sin efecto';
      return `<a class="gp-lvwd" href="${detHref}" aria-label="Viento ${w.now ? 'ahora' : 'pronosticado'}: ${Math.round(w.kmh)} kilómetros por hora${w.gust_kmh ? `, ráfagas ${Math.round(w.gust_kmh)}` : ''}, ${words}"><svg viewBox="0 0 20 20" aria-hidden="true"><g transform="rotate(${a.toFixed(0)} 10 10)"><path d="M10 17V5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M5 8.5L10 2.5l5 6z" fill="currentColor"/></g></svg><b class="num">${Math.round(w.kmh)} km/h</b>${w.gust_kmh ? `<span class="num">ráf. ${Math.round(w.gust_kmh)}</span>` : ''}<span class="gp-lvww">${words}</span><small>${w.now ? 'ahora' : `pron. ${e(x.eta)}`}${LK.plays_like ? ' · sin ajuste (torneo)' : ''}</small></a>`; };
    const flagGps = g => { if (!g?.ll || GEO.acc == null || Date.now() - GEO.t > 30000) return { ok: false, why: 'Esperando el GPS' };
      if (GEO.acc > 10) return { ok: false, why: `GPS ±${Math.round(GEO.acc)} m: esperá a que baje de 10 m o tocá el mapa` };
      const dg = C.dist(fr.F.xy(g.ll), fr.F.xy(gcG)) / C.YD; if (dg > 80) return { ok: false, why: `Estás a ${Math.round(dg)} yd del green: marcala parado en la bandera o tocá el mapa` };
      return { ok: true }; };
    const flagPanel = () => { const fd = fdate(), FLf = flagNow(), tdy = todayAR(), tmw = addDays(tdy, 1);
      if (FLUI === 'tap') return `<div class="gp-lvf" role="group" aria-label="Marcar la bandera en el mapa">${FLC ? `<span class="gp-lvft">¿Bandera acá? <b class="num">${Math.round(C.dist(fr.F.xy(FLC), fr.F.xy(gcG)) / C.YD)}</b> yd del medio</span><button type="button" class="gp-lvfo" id="gpflok">Confirmar</button>` : '<span class="gp-lvft">Tocá el mapa donde está la bandera</span>'}<button type="button" id="gpflno">Cancelar</button></div>`;
      if (FLUI === 'date') return `<div class="gp-lvf"><label class="gp-lvfd">Fecha <input type="date" id="gpfdi" value="${fd}"></label><button type="button" id="gpflno">Listo</button></div>`;
            const cnt = dt => (FLV.dates.find(z => z.date === dt) || {}).n;
      const G = flagGps(gpsState());
      return `<div class="gp-lvf" role="group" aria-label="Bandera del ${e(dName(fd))}">
        <button type="button" class="gp-lvfo" id="gpflgps"${G.ok ? '' : ' disabled'}>⚑ Marcar acá</button><button type="button" id="gpflmap">En el mapa</button>${FLf ? `<button type="button" id="gpfldel" class="${FLDEL ? 'gp-lvfx' : ''}">${FLDEL ? '¿Borrar? Tocá de nuevo' : 'Borrar'}</button>` : ''}
        <span class="gp-lvfd" role="radiogroup" aria-label="Día de la bandera">${[[tdy, 'Hoy'], [tmw, 'Mañana']].map(([dt, l]) => `<button type="button" role="radio" class="gp-lvdc${fd === dt ? ' on' : ''}" data-fday="${dt}" aria-checked="${fd === dt}">${l}${cnt(dt) ? ` <span class="num">${cnt(dt)}</span>` : ''}</button>`).join('')}${fd !== tdy && fd !== tmw ? `<button type="button" role="radio" class="gp-lvdc on" aria-checked="true" data-fday="otra">${e(dShort(fd))}</button>` : `<button type="button" class="gp-lvdc" data-fday="otra">Otro día</button>`}</span>
        <button type="button" class="gp-lvfc" id="gpflx" aria-label="Cerrar">✕</button>
        <small class="gp-lvft" id="gpflwhy">${G.ok ? (FLf ? `Bandera de ${e(dName(fd))}: ${FLf.source === 'gps' ? `GPS ±${Math.round(FLf.acc_m ?? 0)} m` : 'marcada en el mapa'}${FLf.pending ? ' · sin subir' : ''}` : `Parate en la bandera y tocá «Marcar acá» (${e(dName(fd))})`) : e(G.why)}</small></div>`; };
    const liveDyn = () => { if (PR) return liveDynPR(); syncT();
      const g = gpsState(), o = g?.ok ? g.ll : (shots.length ? shots[shots.length - 1].to : start), q = fr.F.xy(o);
      const yd = k => h.green?.[k] ? Math.round(C.dist(q, fr.F.xy(h.green[k])) / C.YD) : null, E = yd('front'), M = Math.round(C.dist(q, fr.F.xy(gcG)) / C.YD), F = yd('back');
      const FLf = flagNow(), Bd = FLf ? Math.round(C.dist(q, fr.F.xy(FLf.ll)) / C.YD) : null, fd = fdate();
      const nt = nextH && g?.ok ? (() => { const hh = m.holes.find(z => z.hole === nextH), tp = hh && (hh.tees?.[0]?.center || hh.line?.[0]); return tp && C.dist(fr.F.xy(g.ll), fr.F.xy(tp)) < 45; })() : false;
      const cell = (k, v) => `<a class="gp-lvc" href="${grHref}" aria-label="${k}: ${v ?? 'sin dato'} yardas"><small>${k}</small><b class="num">${v ?? '–'}</b></a>`;
      const fcell = FLf ? `<button type="button" class="gp-lvc gp-lvb" id="gpfl" aria-expanded="${!!FLUI}" aria-label="Bandera${fd !== todayAR() ? ` del ${dName(fd)}` : ''}: ${Bd} yardas. Cambiar"><small>⚑ ${fd !== todayAR() ? e(dName(fd)[0].toUpperCase() + dName(fd).slice(1)) : 'Bandera'}</small><b class="num">${Bd}</b></button>` : '';
      return `${LK.distances ? '<span class="gp-lvw">Regla local: sin medidores de distancia</span>' : `<div class="gp-lvr${FLf ? ' gp-lvr4' : ''}">${cell('Entrada', E)}${cell('Medio', M)}${cell('Fondo', F)}${fcell}</div>`}
        ${FLUI ? '' : windLine(o)}
        <div class="gp-lvs"><span class="${g?.ok ? 'gp-lvok' : 'gp-lvw'}">${g?.ok ? `GPS ±${Math.round(g.acc)} m` : `${e(g?.why || '')}${g?.act ? '' : ` · desde ${shots.length ? 'el último tiro' : 'la salida'}`}`}</span>${g?.act ? `<button type="button" class="gp-lvgo" id="gpgeo">${GEO.err === 'denied' || GEO.err === 'timeout' || GEO.err === 'unavailable' ? 'Reintentar GPS' : '◎ Activar GPS'}</button>` : ''}${PRL ? `<span class="gp-lvp num">${e(PRL)}</span>` : ''}${autoOn() ? `<button type="button" class="gp-lvfb gp-lva" id="gpauto" aria-label="Detección automática del hoyo: hoyo ${n}. Elegir hoyo">Auto · Hoyo ${n}</button>` : nt ? `<a class="gp-lvn" href="${hb(nextH)}">¿Hoyo ${nextH}?</a>` : ''}${FLf && !LK.distances ? '' : `<button type="button" class="gp-lvfb" id="gpfl" aria-expanded="${!!FLUI}">⚑ Bandera${fd !== todayAR() ? ` ${e(dName(fd))}` : ''}</button>`}${(FLUNDO[`${id}|${n}|${fd}`] || []).length ? '<button type="button" class="gp-lvfb gp-lvu" id="gpflu" aria-label="Deshacer el último movimiento de la bandera">↶ Bandera</button>' : ''}<button type="button" class="gp-lvx" id="gplvx">Salir</button></div>${GEO.err === 'denied' && !g?.ok ? '<p class="gp-lvgh">iPhone: Ajustes › Privacidad y seguridad › Localización › Sitios web de Safari › «Mientras se usa». O en Safari: «aA» › ajustes del sitio web › Ubicación › Permitir. Después, «Reintentar GPS».</p>' : GEO.err === 'timeout' && !g?.ok ? '<p class="gp-lvgh">Salí a cielo abierto unos segundos y tocá «Reintentar GPS».</p>' : ''}`; };
    const liveBoxHtml = () => `<div id="gplvd">${liveDyn()}</div>`;
    /* t258u: the live view is the map + two distance tags (left) + five buttons (right) + one menu; everything else lives in the menu sheet */
    const windBtn = o => { const w = x.wind; if (!w) return `<a class="gp-pvb gp-pvw" href="${detHref}" aria-label="Sin dato de viento"><small>Viento</small><b>–</b></a>`;
      const b = C.bearingXY(fr.F.xy(o), fr.F.xy(gc)), c = C.windComp(b, w), a = ((w.from_deg + 180 - b) % 360 + 360) % 360, P0 = [];
      if (Math.abs(c.head_mph) >= 2) P0.push(c.head_mph > 0 ? 'en contra' : 'a favor'); if (Math.abs(c.cross_mph) >= 2) P0.push(`cruzado de ${c.cross_mph > 0 ? 'derecha a izquierda' : 'izquierda a derecha'}`);
      return `<a class="gp-pvb gp-pvw" href="${detHref}" aria-label="Viento ${w.now ? 'ahora' : 'pronosticado'}: ${Math.round(w.kmh)} kilómetros por hora${w.gust_kmh ? `, ráfagas ${Math.round(w.gust_kmh)}` : ''}, ${P0.join(', ') || 'casi sin efecto'}${LK.plays_like ? ', sin ajuste en torneo' : ''}"><svg viewBox="0 0 20 20" aria-hidden="true"><g transform="rotate(${a.toFixed(0)} 10 10)"><path d="M10 17V5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M5 8.5L10 2.5l5 6z" fill="currentColor"/></g></svg><b class="num">${Math.round(w.kmh)}</b><small>km/h</small></a>`; };
    /* t270u: an open match today → one compact button with its live status; tap = the match sheet over the map (same map state underneath). */
    const matchInner = mid => { const st = window.GolfletMatch?.statusShort?.(mid); return `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="6.5" cy="7" r="3" fill="currentColor"/><circle cx="13.5" cy="13" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg><b class="num gp-mk-${st?.k || 'E'}">${e(st?.t || 'Partido')}</b>`; };
    const matchBtn = () => { const mid = window.GolfletMatch?.current?.(); if (!mid) return '';
      const st = window.GolfletMatch.statusShort?.(mid); return `<button type="button" class="gp-pvb gp-pvmt" id="gpmt" data-mid="${e(mid)}" aria-label="Partido en curso${st?.aria ? `: ${e(st.aria)}` : ''}. Ver y anotar el hoyo ${n}">${matchInner(mid)}</button>`; };
    const openMatch = mid => window.GolfletMatch?.openSheet?.(mid, n, { onChange: () => { const b = live('gpmt'); if (b) b.innerHTML = matchInner(mid); }, onClose: () => { const b = live('gpmt'); if (b) b.innerHTML = matchInner(mid); } });
    const liveDynPR = () => { syncT();
      const g = gpsState(), o = g?.ok ? g.ll : (shots.length ? shots[shots.length - 1].to : start), q = fr.F.xy(o);
      const yd = k => h.green?.[k] ? Math.round(C.dist(q, fr.F.xy(h.green[k])) / C.YD) : null, E = yd('front'), M = Math.round(C.dist(q, fr.F.xy(gcG)) / C.YD), F = yd('back');
      const FLf = flagNow(), fd = fdate(), dn = dName(fd), tgt = Math.round(C.dist(q, fr.F.xy(gc)) / C.YD);
      const tags = LK.distances ? '<span class="gp-pvst">Regla local: sin medidores</span>' : TG.r1 != null
        ? `<a class="gp-tg gp-tg2" href="${detHref}" aria-label="Del objetivo ${toT()}: ${TG.r2} yardas"><b class="num" id="gptg2">${TG.r2}</b><small>${FLf ? '⚑' : 'centro'}</small></a><a class="gp-tg gp-tg1" href="${detHref}" aria-label="Hasta el objetivo: ${TG.r1} yardas"><b class="num" id="gptg1">${TG.r1}</b><small>yd</small></a>`
        : `<a class="gp-tg gp-tg1" href="${detHref}" aria-label="${tgt} yardas ${toT()}"><b class="num" id="gptg1">${tgt}</b><small>${FLf ? '⚑' : 'centro'}</small></a>`;
      const fmb = LK.distances ? '' : `<a class="gp-pvb gp-pvg" href="${grHref}" aria-label="Green: entrada ${E ?? 'sin dato'}, medio ${M}, fondo ${F ?? 'sin dato'} yardas"><span><small>F</small><b class="num">${F ?? '–'}</b></span><span class="c"><small>M</small><b class="num">${M}</b></span><span><small>E</small><b class="num">${E ?? '–'}</b></span></a>`;
      const flb = LK.distances ? '' : `<button type="button" class="gp-pvb gp-pvf${FLf ? ' on' : ''}" id="gpfl" aria-expanded="${!!FLUI}" aria-label="Bandera de ${e(dn)}${FLf ? ': marcada' : ': sin marcar'}. Marcar o mover"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 18V2.5l10 3.5-10 3.5" fill="${FLf ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg><small>${e(dn[0].toUpperCase() + dn.slice(1))}</small></button>`;
      const vm = `<div class="gp-pvb gp-pvvm" role="radiogroup" aria-label="Encuadre${VMODE.mode ? '' : ', automático'}"><button type="button" role="radio" data-vm="hoyo" class="${GM ? '' : 'on'}" aria-checked="${!GM}">Hoyo</button><button type="button" role="radio" data-vm="green" class="${GM ? 'on' : ''}" aria-checked="${GM}">Green</button></div>`;
      const gps = g?.act ? `<div class="gp-pvgo"><button type="button" class="gp-lvgo" data-geo="1">${GEO.err === 'denied' || GEO.err === 'timeout' || GEO.err === 'unavailable' ? 'Reintentar GPS' : '◎ Activar GPS'}</button><span>${e(g.why)}</span>${GEO.err === 'denied' ? '<p class="gp-lvgh">iPhone: Ajustes › Privacidad y seguridad › Localización › Sitios web de Safari › «Mientras se usa». O en Safari: «aA» › ajustes del sitio web › Ubicación › Permitir.</p>' : GEO.err === 'timeout' ? '<p class="gp-lvgh">Salí a cielo abierto unos segundos y reintentá.</p>' : ''}</div>`
        : !g?.ok ? `<span class="gp-pvst">${e(g?.why || '')}</span>` : '';
      return `<button type="button" class="gp-pvx" data-exit="1" aria-label="Salir de Jugar práctica">✕</button><div class="gp-pvl">${tags}</div>${gps}<div class="gp-pvr">${windBtn(o)}${flb}${vm}${fmb}${matchBtn()}<button type="button" class="gp-pvb gp-pvmb${MENU ? ' on' : ''}" id="gpmenub" aria-expanded="${MENU}" aria-label="Más opciones"><svg viewBox="0 0 20 20" aria-hidden="true">${[4, 10, 16].map(cx => [4, 10, 16].map(cy => `<circle cx="${cx}" cy="${cy}" r="1.7" fill="currentColor"/>`).join('')).join('')}</svg></button></div>`; };
    const menuHtml = (undoShot, resetCalc) => { const g = gpsState(), uk = `${id}|${n}|${fdate()}`;
      const it = (attrs, label) => `<button type="button" ${attrs}>${label}</button>`;
      return `<div class="gp-pvm" id="gpmenu" role="group" aria-label="Más opciones"><span class="gp-pvms ${g?.ok ? 'gp-lvok' : 'gp-lvw'}">${g?.ok ? `GPS ±${Math.round(g.acc)} m` : e(g?.why || '')}</span>
        ${g?.ok ? '' : it('data-geo="1" class="gp-pvmo"', GEO.err && GEO.err !== 'idle' ? 'Reintentar GPS' : 'Activar GPS')}${it('id="gprec"', '◎ Recentrar')}${undoShot ? it('id="gpundo"', '↶ Deshacer tiro') : ''}${resetCalc ? it('id="gpreset"', '↺ Volver al cálculo') : ''}
        ${(FLUNDO[uk] || []).length ? it('id="gpflu"', '↶ Bandera') : ''}${LK.distances ? '' : it('id="gpfldt"', '⚑ Otra fecha')}${it(`id="gpauto2" aria-pressed="${autoOn()}"`, autoOn() ? 'Hoyo: auto ✓' : 'Hoyo: auto')}
        <a href="#/plan/${e(id)}/hoyo/${n}${sat ? '?v=dis' : '?v=sat'}">${sat ? 'Diseño' : 'Satelital'}</a>${teeChip()}${(() => { const mid = window.GolfletMatch?.current?.(); return mid ? `<button type="button" class="gp-pvmo" data-mopen="${e(mid)}">Partido · anotar hoyo ${n}</button>` : `<a href="#/partido/nuevo${PRC?.tee ? `?tee=${e(PRC.tee)}` : ''}" class="gp-pvmo">Armar partido</a>`; })()}<a href="${detHref}">Detalle del hoyo</a><a href="${grHref}">Green</a><a href="#/plan/${e(id)}">Estrategia</a>${it('id="gplvx" class="gp-pvmx"', 'Salir')}</div>`; };
    const bottomBar = () => `<div class="gp-bb">${prev ? `<a href="${hb(prev)}" aria-label="Hoyo ${prev}">‹</a>` : '<span></span>'}<button type="button" id="gphsel" aria-expanded="${HSEL}" aria-label="Hoyo ${n}${x.par ? `, par ${x.par}` : ''}${x.hcp ? `, índice ${x.hcp}` : ''}. Elegir hoyo"><b class="num">${n}</b><span class="num">${x.par ? `Par ${x.par}` : ''}${x.hcp ? ` · S.I. ${x.hcp}` : ''}</span>${autoOn() ? '<small>Auto</small>' : ''}${TN.active ? `<i class="gp-bbl" aria-label="Modo torneo">${LOCK}</i>` : ''}</button>${next ? `<a href="${hb(next)}" aria-label="Hoyo ${next}">›</a>` : '<span></span>'}</div>`;
    const meOf = (ll, acc) => { const q = fr.F.xy(ll), a = fr.R(q), b = fr.R([q[0] + Math.max(2, acc || 0), q[1]]); return { s: fr.toS(ll), r: Math.hypot(b[0] - a[0], b[1] - a[1]) }; };
    const flagAfter = () => { if (PEND[key]?.auto) delete PEND[key]; render(); };
    const bindLive = () => { const x0 = live('gplvx'); if (x0) x0.onclick = () => { pracSet(null); geoStop(); wakeOff(); MAPTAP = null; clearInterval(WXI); location.hash = '#/inicio'; };
      const ub = live('gpflu'); if (ub) ub.onclick = () => { const st = FLUNDO[`${id}|${n}|${fdate()}`] || []; if (!st.length) return; const pv = st.pop(); flagSet(FCC, FCO, fdate(), n, pv).then(() => { if (live('gplive')?.dataset.k === key) render(); }); flagAfter(); };
      const gg = live('gpgeo'); if (gg) gg.onclick = () => geoActivate();
      document.querySelectorAll('#gpmap [data-exit]').forEach(b => b.onclick = () => { pracSet(null); geoStop(); wakeOff(); MAPTAP = null; clearInterval(WXI); location.hash = '#/inicio'; });
      document.querySelectorAll('#gpmap [data-geo]').forEach(b => b.onclick = () => geoActivate());
      document.querySelectorAll('#gplive [data-vm]').forEach(b => b.onclick = () => { VMODE.mode = b.dataset.vm; if (b.dataset.vm === 'hoyo') { FLUI = FLUI === 'tap' ? null : FLUI; FLC = null; } render(); });
      MOPEN = mid => { if (MENU) { MENU = false; render(); } openMatch(mid); };   // t270u: delegated (the right column re-renders on GPS ticks)
      const mn = live('gpmenub'); if (mn) mn.onclick = () => { MENU = !MENU; if (MENU) { FLUI = null; HSEL = false; } render(); };
      const rc = live('gprec'); if (rc) rc.onclick = () => { delete HOLEZ[key]; VMODE.mode = null; VMODE.cropY = null; VMODE.sig = null; MENU = false; render(); };
      const fdt = live('gpfldt'); if (fdt) fdt.onclick = () => { MENU = false; FLUI = 'date'; render(); };
      const a2 = live('gpauto2'); if (a2) a2.onclick = () => { autoSet(!autoOn()); AH = null; render(); autoHole(); };
      const au = live('gpauto'); if (au) au.onclick = () => { HSEL = !HSEL; render(); };
      const t0 = live('gpfl'); if (t0) t0.onclick = () => { MENU = false; HSEL = false; FLUI = FLUI ? null : 'open'; FLC = null; MAPTAP = null; FLDEL = false; render(); };
      const cl = live('gpflx'); if (cl) cl.onclick = () => { FLUI = null; FLC = null; MAPTAP = null; FLDEL = false; render(); };
      const gb = live('gpflgps'); if (gb) gb.onclick = () => { const G = flagGps(gpsState()); if (!G.ok) return; flagSet(FCC, FCO, fdate(), n, { ll: [...GEO.ll], acc_m: GEO.acc, source: 'gps' }).then(() => { if (live('gplive')?.dataset.k === key) render(); }); FLUI = 'open'; H.toast(`Bandera de ${dName(fdate())} marcada en el hoyo ${n}`); flagAfter(); };   // t247u: the panel stays open so you can mark Hoy and Mañana in a row
      const mb = live('gpflmap'); if (mb) mb.onclick = () => { FLUI = 'tap'; FLC = null; MAPTAP = sp => { FLC = fr.fromS(sp); render(); }; render(); };
      const okb = live('gpflok'); if (okb) okb.onclick = () => { if (!FLC) return; flagSet(FCC, FCO, fdate(), n, { ll: FLC, acc_m: null, source: 'mapa' }).then(() => { if (live('gplive')?.dataset.k === key) render(); }); FLC = null; MAPTAP = null; FLUI = GM ? 'open' : null; flagAfter(); };
      const nb = live('gpflno'); if (nb) nb.onclick = () => { FLC = null; MAPTAP = null; FLUI = 'open'; render(); };
      const db = live('gpfldel'); if (db) db.onclick = () => { if (!FLDEL) { FLDEL = true; render(); return; } FLDEL = false; flagSet(FCC, FCO, fdate(), n, null); flagAfter(); };
      const setDay = async v => { if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return; FLDATE[id] = v; FLV = await flagsLoad(FCC, FCO, v).catch(() => FLV); FLUI = 'open'; flagAfter(); };
      document.querySelectorAll('#gpmap [data-fday]').forEach(b => b.onclick = () => { if (b.dataset.fday === 'otra') { FLUI = 'date'; render(); } else setDay(b.dataset.fday); });
      const fi = live('gpfdi'); if (fi) fi.onchange = () => setDay(fi.value); };
    const ord = [...d.holes].sort((a, b) => a.order - b.order), i = ord.findIndex(y => y.hole === n), prev = ord[i - 1]?.hole, next = ord[i + 1]?.hole;
    const key = `${id}|${n}`; let shots = PR ? [] : [...(x.shots || [])];
    const greenPoly = h.green?.polygon?.map(fr.F.xy) || null;
    const onGreen = ll => { const q = fr.F.xy(ll); return (greenPoly && C.inPoly(q, greenPoly)) || C.dist(q, fr.F.xy(gc)) / C.YD < 6; };
    const src = d.plan.dist_source;
    const hasGreen = Array.isArray(m.green_surfaces) && m.green_surfaces.includes(n);   // t181u: only greens with a REAL survey
    const vq = sat ? '?v=sat' : PR ? '?v=dis' : '', hb = k => `#/plan/${e(id)}/hoyo/${k}${vq}`, detHref = `#/plan/${e(id)}/hoyo/${n}/detalle${vq}`, grHref = `#/plan/${e(id)}/hoyo/${n}/green${vq}`;
    const head = () => PR ? '' : `<div class="gp-hx"><a class="gp-hb" href="#/plan/${e(id)}" aria-label="Volver a la estrategia de juego"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M8 1L3 6l5 5"/></svg></a>
        ${PR ? `<button type="button" class="gp-hm gp-hmb" id="gphsel" aria-expanded="${HSEL}" aria-label="Hoyo ${n}. Elegir otro hoyo"><b>Hoyo ${n} <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></b>${subA ? `<span class="num">${subA}</span>` : ''}</button>` : `<a class="gp-hm" href="${detHref}" aria-label="Hoyo ${n}, ${sub.replace(/ · /g, ', ')}${tee ? `, desde ${e(tee.name)}` : ''}. Ver el detalle"><b>Hoyo ${n}<small class="num"> · ${e(x.eta)}</small></b>${subA ? `<span class="num">${subA}</span>` : ''}</a>`}
        ${TN.active ? `<span class="gp-hl" role="img" aria-label="Modo torneo${TN.no_distance_rule ? ', sin medidores' : ''}">${LOCK}</span>` : ''}${d.course.numbering_unconfirmed && x.par == null ? '<span class="gp-hw">a confirmar</span>' : ''}
        <a class="gp-hi" href="${detHref}" aria-label="Detalle del hoyo ${n}">${INFO}</a>
        <nav class="gp-hn" aria-label="Hoyos">${prev ? `<a href="${hb(prev)}" aria-label="Hoyo ${prev}">‹${prev}</a>` : ''}${next ? `<a href="${hb(next)}" aria-label="Hoyo ${next}">${next}›</a>` : ''}</nav></div>`;
    const teeChip = () => !tee || LK.distances ? '' : TEES.length > 1
      ? `<label class="gp-tee"><i style="background:${tee.col}" aria-hidden="true"></i><span class="num">${e(tee.name)} ${tee.yd}</span><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3"/></svg><select id="gptee" aria-label="Salida: ${e(tee.name)}, ${tee.yd} yardas. Cambiar salida">${TEES.map(t => `<option value="${e(t.key)}"${t.key === tee.key ? ' selected' : ''}>${e(t.name)} · ${t.yd} yd</option>`).join('')}</select></label>`
      : `<span class="gp-tee one" aria-label="Salida ${e(tee.name)}, ${tee.yd} yardas"><i style="background:${tee.col}" aria-hidden="true"></i><span class="num">${e(tee.name)} ${tee.yd}</span></span>`;
    const holeStrip = () => `<div class="gp-hsel" role="group" aria-label="Elegir hoyo"><button type="button" id="gphauto" class="gp-hsa${autoOn() ? ' on' : ''}" aria-pressed="${autoOn()}">Auto</button>${[...d.holes].sort((a, b) => a.hole - b.hole).map(y => `<a href="${hb(y.hole)}" data-hpick="${y.hole}" class="num${y.hole === n ? ' on' : ''}"${y.hole === n ? ' aria-current="true"' : ''}>${y.hole}</a>`).join('')}</div>`;
    const tl = () => PR ? `<div class="gp-pv" id="gplive" role="region" aria-label="En vivo">${liveBoxHtml()}</div>` : `<div class="gp-tl">${PR && HSEL ? holeStrip() : ''}${PR ? `<div class="gp-live" id="gplive" role="status" aria-live="polite">${liveBoxHtml()}</div>` : ''}<div class="gp-vo" role="tablist" aria-label="Vista"><a role="tab" href="#/plan/${e(id)}/hoyo/${n}" class="${sat ? '' : 'on'}" aria-selected="${!sat}">Diseño</a><a role="tab" href="#/plan/${e(id)}/hoyo/${n}?v=sat" class="${sat ? 'on' : ''}" aria-selected="${sat}">Satelital</a></div>
        ${d.forecast?.status !== 'ok' && !x.wind ? `<a class="gp-fcx" href="${detHref}">Sin viento</a>` : ''}<button type="button" class="gp-zr" hidden>Ver todo</button>
        ${PR ? `<div class="gp-vo gp-vm" role="radiogroup" aria-label="Encuadre"><button type="button" role="radio" data-vm="hoyo" class="${GM ? '' : 'on'}" aria-checked="${!GM}">Hoyo</button><button type="button" role="radio" data-vm="green" class="${GM ? 'on' : ''}" aria-checked="${GM}">Green</button>${VMODE.mode ? '' : '<small>auto</small>'}</div>` : `<a class="gp-grb" href="${grHref}" aria-label="Ver el green del hoyo ${n}"><svg viewBox="0 0 20 20" aria-hidden="true"><ellipse cx="10" cy="11" rx="8" ry="6" fill="currentColor" opacity=".25" stroke="currentColor" stroke-width="1.5"/><path d="M10 11V2.5l5 2-5 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>Green</a>`}${PR && GM ? '' : teeChip()}</div>`;
    const detBody = extra => `<section class="card gp-dt">
          ${TN.active ? `<p><b>Modo torneo</b> (Regla 4.3${TN.source === 'manual' ? ', activado por vos' : TN.source ? ', automático por tu torneo' : ''}). Durante la ronda tu estrategia queda como la armaste: sin ± yd por viento, sin sugerencias, sin óvalos de dispersión ni pendientes del green.${TN.no_distance_rule ? ' Regla local sin medidores de distancia: tampoco se muestran yardas.' : ''} Se ven el pronóstico, los obstáculos y tus palos.</p>` : ''}
          ${x.wind ? `<p><b>Viento</b> ${Math.round(x.wind.kmh)} km/h${x.wind.gust_kmh ? `, ráfagas ${Math.round(x.wind.gust_kmh)}` : ''}, viene del ${e(C16(x.wind.from_deg))} (${x.wind.from_deg}°) ${x.wind.now ? `ahora (Open-Meteo, dato de 15 min${x.wind.at ? ` de las ${e(String(x.wind.at).slice(11, 16))}` : ''}; se actualiza cada 10 min)` : `a las ${e(x.eta)} (pronóstico)`}. La flecha indica hacia dónde sopla.${x.effect && !LK.plays_like ? ` El hoyo juega ${sgn(x.effect.plays_like_yd)} yd${x.effect.legs.length > 1 ? ` (${x.effect.legs.map((l, k) => `tramo ${k + 1}: ${sgn(l.plays_like_yd)}`).join(', ')})` : ''}.` : ''}</p>` : ''}
          ${extra || ''}
          ${tee ? `<p><b>Salida</b> ${e(tee.name)}: ${tee.yd} yd según la tarjeta del club. Todas las distancias se miden desde ahí${teeLL && !teeSpot(h, fr, tee.yd)?.box ? ' (punto ubicado sobre la línea de juego a esas yardas del green)' : ''}.</p>` : ''}
          <p><b>Obstáculos</b></p><ul class="gp-hzl">${HZ2.filter(z => (z.in_play || z.greenside) && (z.greenside || z.carry_yd == null || z.carry_yd > 0)).map(z => `<li>${e(LK.hazard_carry ? KIND[z.kind] || z.kind : z.text)}</li>`).join('') || '<li>Sin obstáculos mapeados cerca de la línea.</li>'}</ul>
          <p>${e(d.wind_model.label)}${CL ? ' ' + e(CL.method) : ''}</p>
          <p class="foot">${(h.coverage_notes || []).map(e).join(' ')}</p>
          <p class="foot">Geometría © OpenStreetMap (ODbL)${sat ? ' · Imagen © IGN, AMBA 2013' : ''} · Viento: Open-Meteo.</p></section>`;
    const usable = LK.planner ? [] : CL.clubs.map(c => ({ c, dd: clubDist(c, src) })).filter(u => u.dd);
    /* t234u: what moves today's distance, only from real data: wind + temperature + rain (forecast at the hole's ETA), slope (the map's 30 m
       elevation model along the hole line), course firmness (the player's own setting, roll only). Torneo locks: none of them. */
    const firmKey = `golflet.firm.${id}`;
    let FIRM = (() => { try { return localStorage.getItem(firmKey) || 'normal'; } catch { return 'normal'; } })();
    const sOn = q => { let best = { s: 0, dd: Infinity }, acc = 0; for (let k = 0; k < path.length - 1; k++) { const a = path[k], b = path[k + 1], L = C.dist(a, b) || 1e-9, t = Math.max(0, Math.min(1, ((q[0] - a[0]) * (b[0] - a[0]) + (q[1] - a[1]) * (b[1] - a[1])) / (L * L))), pp = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], dd = C.dist(pp, q); if (dd < best.dd) best = { s: acc + t * L, dd }; acc += L; } return best.s; };
    // t237u: the uphill/downhill term (30 m elevation model) waits for the real course mapping: off until then, code kept
    const ELEV_TERM = false;
    const ELV = !ELEV_TERM ? null : (() => { const v = h.elevation; if (!v || v.tee_m == null || v.green_m == null) return null;
      const pts = [[0, v.tee_m], ...(v.landing_point && v.landing_m != null ? [[sOn(fr.F.xy(v.landing_point)), v.landing_m]] : []), [sOn(fr.F.xy(gc)), v.green_m]].sort((a, b) => a[0] - b[0]);
      return q => { const t = sOn(q); if (t <= pts[0][0]) return pts[0][1]; for (let k = 1; k < pts.length; k++) if (t <= pts[k][0]) { const [s0, e0] = pts[k - 1], [s1, e1] = pts[k]; return e0 + (e1 - e0) * (s1 > s0 ? (t - s0) / (s1 - s0) : 0); } return pts[pts.length - 1][1]; }; })();
    const adjIn = (a, b, dd, yd) => { if (LK.plays_like) return {};
      const comp = x.wind ? C.windComp(C.bearingXY(a, b), x.wind) : null, rise = ELV ? ELV(b) - ELV(a) : null;
      return { head_mph: comp ? comp.head_mph : null, kmh: x.wind ? x.wind.kmh : null, temp_c: x.wx?.temp_c ?? null, precip_mm: x.wx?.precip_mm ?? null,
        rise_m: rise != null && Math.abs(rise) >= 1.5 ? Math.round(rise * 10) / 10 : null,   // the 30 m model is ±1–2 m: smaller rises are noise
        roll_yd: dd && dd.kind === 'point' && dd.carry != null && dd.yd > dd.carry ? (dd.yd - dd.carry) * (yd / dd.yd) : null, firm: FIRM }; };
    const origDD = code => usable.find(z => z.c.code === code)?.dd || null;
    // everything the view needs for the current ball (shared by the hole and its «Detalle»)
    const calc = () => {
      const ball = shots.length ? shots[shots.length - 1].to : start, done = shots.length && onGreen(ball);
      const bXY = fr.F.xy(ball), gXY = fr.F.xy(gc), remain = Math.round(C.dist(bXY, gXY) / C.YD);
      const pend = LK.planner ? null : PEND[key]; let proj = null, hit = [], ovHits = [], u = null;
      const adj = usable.map(z => { const dd = C.fitDD(z.dd, remain), aim = C.aimPoint(path, bXY, dd.yd * C.YD), A = dd.partial ? null : C.shotAdjust(dd.yd, adjIn(bXY, aim, dd, dd.yd)); return { ...z, dd, A, adj: A ? A.total : dd.yd }; });
      // t184u Qué conviene (prep only; an estimate). Nothing without the player's own distances, nothing when locked.
      const sug = !done && usable.length && !LK.recommendations ? C.suggestShot({ ball: bXY, green: gXY, path, clubs: usable.map(z => ({ code: z.c.code, dd: z.dd })), wind: x.wind || null, hz: HZ, first: shots.length === 0 }) : null;
      if (!done && pend) {
        u = adj.find(z => z.c.code === pend.club);
        if (u) {
          const dd = u.dd, aimYd = pend.aim_yd || 0, aim = C.aimPoint(path, bXY, dd.yd * C.YD), comp = x.wind ? C.windComp(C.bearingXY(bXY, aim), x.wind) : null;
          const baseLat = (dd.kind === 'oval' ? dd.mean.lat : 0) + aimYd, wp = comp ? C.applyWind({ fwd: dd.yd, lat: baseLat }, comp) : { fwd: dd.yd, lat: baseLat };
          // t234u: the landing is today's estimate (normal + every rounded factor), so the map, the pill and the chips agree; partial swings: what is left
          const A = dd.partial ? null : C.shotAdjust(dd.yd, adjIn(bXY, aim, dd, dd.yd)), fwd = A ? A.total : dd.yd;
          proj = { noWind: C.offsetPoint(bXY, aim, dd.yd, baseLat), withWind: PR ? C.offsetPoint(bXY, gXY, fwd, 0) : C.offsetPoint(bXY, aim, fwd, wp.lat), yd: fwd, comp, aim, to: pend.to || null, dd, A };
          if (dd.kind === 'oval' && !LK.ovals) { const pr = C.projectDispersion({ mean: dd.mean, cov: dd.cov }, comp), mo = { fwd: dd.mean.fwd, lat: dd.mean.lat + aimYd }, mw = { fwd: pr.mean.fwd, lat: pr.mean.lat + aimYd };
            proj.ovalNo = { from: bXY, aim, mean: mo, cov: dd.cov }; proj.ovalW = { from: bXY, aim, mean: mw, cov: pr.cov };
            ovHits = C.ovalHits(bXY, aim, mw, pr.cov, HZ); }
          const landing = pend.to ? fr.F.xy(pend.to) : proj.withWind;
          const tests = [landing]; if (!pend.to && dd.kind === 'point' && dd.carry != null && dd.carry < dd.yd) { const cw = comp ? C.applyWind({ fwd: dd.carry, lat: aimYd }, comp) : { fwd: dd.carry, lat: aimYd }; tests.push(C.offsetPoint(bXY, aim, cw.fwd, cw.lat)); }
          const ids = new Set(); for (const t of tests) for (const z of C.hitsAt(t, HZ)) ids.add(z.id);
          for (const z of ovHits) ids.add(z.id); hit = HZ.filter(z => ids.has(z.id));
          if (pend.to) proj.yd = C.dist(bXY, landing) / C.YD;
          proj.landing = landing;
        }
      }
      return { ball, done, bXY, gXY, remain, pend, proj, hit, ovHits, u, adj, sug };
    };
    // live numbers for a point (frame metres): the shot from the ball and what is left to the centre of the green; t234u: the shot = normal + rounded factors; what is left «juega» = the normal club yards it needs
    const liveNums = (bXY, gXY, q, club, A0, ddFit) => {
      const d1 = C.dist(bXY, q) / C.YD, d2 = C.dist(q, gXY) / C.YD, r2 = Math.round(d2), cn = clubName(club), od = origDD(club);
      const dd = ddFit || (od ? C.fitDD(od, Math.round(C.dist(bXY, gXY) / C.YD)) : null), inn = dd && !dd.partial ? adjIn(bXY, q, dd, d1) : null;
      // the shot: as calculated (normal → today) or, for a dragged point, the normal distance that reaches it
      const B = dd?.partial ? { partial: true, total: Math.round(d1), normal: od ? Math.round(od.yd) : null, terms: [] } : A0 ? { ...A0, inn: adjIn(bXY, C.aimPoint(path, bXY, A0.normal * C.YD), dd, A0.normal), dragged: false } : { ...C.shotReverse(d1, inn || {}), inn, dragged: true };
      const r1 = B.total;
      // what is left: the yards to the centre and what they play like (the same factors, from that point)
      const in2 = r2 > 3 ? adjIn(q, gXY, null, d2) : null, t2s = in2 ? C.adjTerms(r2, in2) : [], p2v = r2 - t2s.reduce((a, b) => a + b.yd, 0), p2 = in2 && Math.abs(p2v - r2) >= 2 ? p2v : null;
      const gF = h.green?.front ? fr.F.xy(h.green.front) : null, rf = gF ? Math.round(C.dist(q, gF) / C.YD) : null, ent = rf != null && rf < r2 && r2 > 3 ? rf : null;
      const seg = B.partial ? (B.normal ? `a medias · normal ${B.normal}` : 'a medias') : B.terms.length ? adjSegs(B.normal, B.terms) : null;
      return { r1, r2, p1: null, p2, rf: ent, B, B2: { r2, ent, p2: p2v, terms: t2s, inn: in2 },
        t1: `${cn} · ${r1} yd${B.terms.length ? ` (normal ${B.normal})` : ''}`, t2: `${r2} ${toT()}${ent != null ? ` · ${ent} entrada` : ''}${p2 != null ? ` · juega ${p2}` : ''}`,
        l1: [`${cn} · ${r1} yd`, seg], l2: [`${r2} ${toT()}`, [ent != null ? `${ent} entrada` : null, p2 != null ? `juega ${p2}` : null].filter(Boolean).join(' · ') || null] };
    };
    // t234u: the inline breakdown (tap on a pill): one line per factor with its rule
    const ADJ_NAME = { viento: 'Viento', temp: 'Temperatura', lluvia: 'Lluvia', altura: 'Altura', cancha: 'Cancha (rodado)' };
    const fmtY = v => `${v < 0 ? '−' : '+'}${Math.abs(v)} yd`, dec = v => String(v).replace('.', ',');
    const termNote = (t, inn) => t.k === 'viento' ? `${Math.round(inn.kmh)} km/h, ${inn.head_mph > 0 ? `${dec(Math.abs(inn.head_mph).toFixed(0))} mph en contra · 1% por mph` : `${dec(Math.abs(inn.head_mph).toFixed(0))} mph a favor · 0,5% por mph`} (${x.wind?.now ? 'medido ahora, Open-Meteo' : `pronóstico ${e(x.eta)}`})`
      : t.k === 'temp' ? `${dec(inn.temp_c)} °C ${x.wind?.now ? 'ahora' : `a las ${e(x.eta)}`} · 0,18% por °C respecto de 20 °C`
      : t.k === 'lluvia' ? `${dec(inn.precip_mm)} mm/h pronosticados · −1,5% desde 0,2 mm/h, −3% desde 1 mm/h`
      : t.k === 'altura' ? `la caída está ${dec(Math.abs(inn.rise_m))} m más ${inn.rise_m > 0 ? 'alta' : 'baja'} · 1 yd por yd de desnivel entre la pelota y la caída (modelo de elevación de 30 m, aproximado; no es la pendiente del fairway ni del green)`
      : t.k === 'cancha' ? `cancha ${inn.firm} (tu ajuste) · ${inn.firm === 'dura' ? '+' : '−'}50% del rodado (${Math.round(inn.roll_yd)} yd)` : '';
    const missing = inn => { if (LK.plays_like) return 'Modo torneo: sin ajustes por viento ni clima.'; const m = [];
      if (!x.wind) m.push('viento'); if (x.wx?.temp_c == null) m.push('temperatura'); if (x.wx?.precip_mm == null) m.push('lluvia'); if (ELEV_TERM && !ELV) m.push('altura');
      return `${m.length ? `Sin dato para esta hora o este hoyo: ${m.join(', ')}. ` : ''}Dureza de los greens: no cambia la distancia del golpe (cambia cuánto frena), no la sumo.`; };
    const firmRow = () => `<div class="gp-bdf" role="radiogroup" aria-label="Cómo está la cancha (tu ajuste)"><span>Cancha</span>${['blanda', 'normal', 'dura'].map(f => `<button type="button" role="radio" data-firm="${f}" aria-checked="${FIRM === f}" class="${FIRM === f ? 'on' : ''}">${f[0].toUpperCase() + f.slice(1)}</button>`).join('')}</div>`;
    /* t263u: the breakdown opens as ONE compact line (tap → the full detail, which scrolls inside the strip). */
    const ADJ_SH = { viento: 'viento', temp: 'temp.', lluvia: 'lluvia', altura: 'altura', cancha: 'rodado' };
    const bdHtml = (L, which, title) => {
      if (!L) return ''; if (which !== '2' && L.B?.partial) return bdFull(L, which, title);
      if (!BDX) { const sum = which === '2' ? `<b>Te quedan ${L.B2.r2}</b>${L.B2.terms.length ? ` · juega <b>${L.B2.p2}</b>` : ''}`
          : `${L.B.normal}${L.B.terms.map(t => ` <span style="color:${ADJ_COL(t.yd)}">${t.yd < 0 ? '−' : '+'}${Math.abs(t.yd)} ${ADJ_SH[t.k] || ''}</span>`).join('')} = <b>${L.B.total} yd</b>`;
        return `<div class="gp-bd gp-bdc" id="gpbd"><button type="button" class="gp-bdl num" data-bdx aria-expanded="false" aria-label="Ver el detalle del cálculo"><span class="gp-bdls">${sum}</span><span class="gp-bdlm">Detalle ▾</span></button></div>`; }
      return bdFull(L, which, title).replace('<div class="gp-bd" id="gpbd">', '<div class="gp-bd gp-bdx" id="gpbd"><button type="button" class="gp-bdlc" data-bdx aria-expanded="true">Cerrar detalle ▴</button>'); };
    const bdFull = (L, which, title) => {
      if (!L) return '';
      if (which === '2') { const b = L.B2; return `<div class="gp-bd" id="gpbd"><p class="gp-bdh"><b>Te quedan ${b.r2} ${toT()}</b>${b.ent != null ? ` · ${b.ent} a la entrada` : ''}</p>${b.terms.length ? `<ul>${b.terms.map(t => `<li><i style="color:${ADJ_COL(-t.yd)}">${fmtY(-t.yd)}</i> ${ADJ_NAME[t.k]}: ${termNote(t, b.inn)}</li>`).join('')}</ul><p class="gp-bdt"><b>Juega ${b.p2}</b>: las yardas normales de tu palo que necesitás para llegar ${flagNow() ? 'a la bandera' : 'al centro'}.</p>` : '<p class="gp-bdt">Sin ajustes: juega lo que mide.</p>'}<p class="gp-bdm">${missing()}</p></div>`; }
      const B = L.B; if (B.partial) return `<div class="gp-bd" id="gpbd"><p class="gp-bdh"><b>${e(title)}</b></p><p class="gp-bdt">Tiro a medias: te quedan ${B.total} yd y tu palo va${B.normal ? ` ${B.normal} normales` : ' más lejos'}. Sin desglose: no es un golpe completo. Cargá un palo más corto en <a href="#/bolsa">Mi bolsa</a>.</p></div>`;
      return `<div class="gp-bd" id="gpbd"><p class="gp-bdh"><b>${e(title)}</b></p><ul><li><i>${B.normal} yd</i> ${B.dragged ? 'normales para llegar hasta ahí' : 'normal (Mi bolsa)'}</li>${B.terms.map(t => `<li><i style="color:${ADJ_COL(t.yd)}">${fmtY(t.yd)}</i> ${ADJ_NAME[t.k]}: ${termNote(t, B.inn)}</li>`).join('')}</ul>
        <p class="gp-bdt"><b>= ${B.total} yd</b> estimadas hoy${B.terms.length ? ' (cada factor redondeado; la suma da justo)' : ''}.</p>${which === 'pin' ? '' : firmRow()}<p class="gp-bdm">${missing()}</p></div>`; };
    const hitText = (hit, ovHits) => hit.length ? [...new Set(hit.map(z => KIND[z.kind]))].map(k => { const o = ovHits.filter(z => KIND[z.kind] === k).reduce((a, b) => a + b.pct, 0); return `${k}${o ? ` ${o}%` : ''}`; }).join(' · ') : '';
    const aimTxt = a => a ? `${a < 0 ? '←' : ''}${Math.abs(a)}${a > 0 ? '→' : ''}` : '';
    const sugExplain = sug => sug ? `<p><b>Qué conviene</b> (estimación): ${e(sug.code)}${sug.partial ? ' a media distancia' : ''}. ${e(sug.reason.text)}${sug.alternatives.length ? ` Otras: ${sug.alternatives.map(a => `${e(a.code)} → ${a.after_yd} yd${a.risk_pct ? ` (${a.risk_pct}% en obstáculo)` : ''}`).join(', ')}.` : ''} Cuenta: yardas que te quedan + riesgo (1% de caída en bunker ≈ 0,4 yd; árboles ≈ 0,6 yd; agua u OB ≈ 2 yd). Tocá la sugerencia para usarla o elegí otro palo.</p>` : '';
    const legend = `<p><b>En el mapa</b> ${h.markers_source === 'guia_club' ? 'Las marcas de la cancha (punto de color), en yardas a la entrada del green, como dice la guía del club.' : h.markers_ref === 'entrada' ? 'Marcas 50/100/150/200/250 yd a la entrada del green (en esta cancha las marcas miden a la entrada).' : 'Marcas 50/100/150/200/250 yd al centro del green.'} Cartel blanco: yardas al centro del green y, abajo, a la entrada.${h.green?.false_front ? ` Frente falso: termina a ${h.green.false_front.yd} yd de la entrada (guía del club).` : ''} <b>Punto hueco</b>: sin viento. <b>Punto dorado</b>: con el viento pronosticado. <b>Círculo blanco</b>: dónde cae tu golpe; arrastralo y los carteles blancos muestran el palo con las yardas del golpe (desde la pelota) y las yardas que te quedan al green. <b>Debajo del palo</b>: tu distancia normal (Mi bolsa) y, entre paréntesis, lo que suma (verde) o resta (rojo) cada factor de hoy: viento, temperatura, lluvia y, si lo marcás, cancha blanda o dura (rodado). Arriba, la suma: lo que estimamos que vas a pegar. <b>Juega</b> en el cartel de lo que queda: las yardas normales de palo que necesitás para llegar. Tocá un cartel para ver la cuenta. Los golpes confirmados conservan su cartel. <b>Salida</b>: arriba a la izquierda elegís desde qué tee jugás (yardas de la tarjeta del club); cambian todas las distancias. «Juega»: cuánto juega con el viento pronosticado. <b>Anillo dorado</b>: caída sugerida.${src === 'gps' ? ' <b>Óvalo</b>: 68% de tus tiros GPS de ese palo (sin viento, punteado; con viento, dorado).' : ''} Dos dedos: zoom.</p>`;

    /* ---------- t218u «Green»: shape + front/centre/back yards from the ball; slopes ONLY from real data (survey or club guide) ---------- */
    if (det === 'green') {
      CURH = null; const S = LK.planner ? null : calc(), ball = S ? S.ball : (shots.length ? shots[shots.length - 1].to : start), bXY = fr.F.xy(ball);
      const yd = k => h.green?.[k] ? Math.round(C.dist(bXY, fr.F.xy(h.green[k])) / C.YD) : null, F = yd('front'), M = yd('center') ?? Math.round(C.dist(bXY, fr.F.xy(gc)) / C.YD), Bk = yd('back');
      const FFP = ffPoint(h, fr), FF = FFP && F != null ? F + FFP.ff.yd : null;   // t229u: playing yd = to the entrance + the guide's yd from the entrance
      // t227u: also from where the planned shot lands (the dragged point), when there is one
      const land = S?.proj?.landing || null, ydL = k => land && h.green?.[k] ? Math.round(C.dist(land, fr.F.xy(h.green[k])) / C.YD) : null;
      const LN = land ? { F: ydL('front'), M: ydL('center') ?? Math.round(C.dist(land, fr.F.xy(gc)) / C.YD), Bk: ydL('back') } : null;
      if (LN) LN.FF = FFP && LN.F != null ? LN.F + FFP.ff.yd : null;
      // t229u: every number the club guide writes on this green (yd from the entrance) → yd to play from the tee/ball and from where the shot lands
      const GG = h.green?.guide, MKL = { borde: u => `Borde ${u < 0 ? 'izq.' : 'der.'}`, nivel: () => 'Cambio de nivel', punto: () => 'Punto marcado' };
      const pts = GG ? [{ l: 'Entrada', yd: 0 }, ...(h.green.false_front ? [{ l: 'Fin del frente falso', yd: h.green.false_front.yd, ff: 1 }] : []), ...GG.marks.map(k => ({ l: MKL[k.kind] ? MKL[k.kind](k.u) : 'Punto', yd: k.yd })), { l: 'Fondo (guía)', yd: GG.depth_yd }].sort((a, b) => a.yd - b.yd) : [];
      const ptsTbl = pts.length > 2 && F != null ? `<section class="card gp-gpts" aria-label="Puntos del green según la guía del club"><div class="gp-gt">Puntos del green <small>guía del club</small></div>
        <table class="num"><thead><tr><th></th><th>desde la entrada</th><th>${shots.length ? 'desde tu pelota' : 'desde la salida'}</th>${LN?.F != null ? '<th>desde el golpe</th>' : ''}</tr></thead><tbody>${pts.map(p => `<tr${p.ff ? ' class="ff"' : ''}><th>${e(p.l)}</th><td>${p.yd}</td><td><b>${F + p.yd}</b></td>${LN?.F != null ? `<td><b>${LN.F + p.yd}</b></td>` : ''}</tr>`).join('')}</tbody></table>
        <p class="foot">Los números de la guía miden desde la entrada del green; para jugar se suman a las yardas a la entrada.</p></section>` : '';
      const fcb = (v, lab) => `<div class="gp-fcb${v.FF != null ? ' gp-fcb4' : ''}" aria-label="${lab}"><span><small>Entrada</small><b class="num">${v.F ?? '—'}</b></span>${v.FF != null ? `<span class="ff"><small>Frente falso</small><b class="num">${v.FF}</b></span>` : ''}<span class="c"><small>Centro</small><b class="num">${v.M}</b></span><span><small>Fondo</small><b class="num">${v.Bk ?? '—'}</b></span></div>`;
      const ffNote = FFP ? `<p class="foot gp-fcf">Frente falso: termina a ${FFP.ff.yd} yd de la entrada (número de la guía del club${FFP.ff.conf === 'alta' ? '' : ', a confirmar en la cancha'}).${m.marker_ref?.to === 'entrada' ? ' Las marcas de esta cancha miden a la entrada del green.' : ''}</p>` : (m.marker_ref?.to === 'entrada' ? '<p class="foot gp-fcf">Las marcas de esta cancha miden a la entrada del green.</p>' : '');
      const slopesLocked = !!LK.green_slopes, real = hasGreen && !slopesLocked;
      el.innerHTML = `<div class="gp-hh"><div><div class="gp-ht">Green · hoyo ${n}</div><div class="gp-hs num">${sub}</div></div><a class="btn sm ghost gp-gbk" href="${hb(n)}">Volver al hoyo</a></div>
        ${LK.distances ? '' : `<p class="gp-fch">${shots.length ? 'Desde tu pelota' : `Desde la salida${tee ? ` · ${e(tee.name)}` : ''}`}</p>${fcb({ F, FF, M, Bk }, shots.length ? 'Yardas desde tu pelota' : 'Yardas desde la salida')}
        ${LN && !ptsTbl ? `<p class="gp-fch">Desde donde cae el golpe</p>${fcb(LN, 'Yardas desde donde cae el golpe armado')}` : ''}
        ${ffNote}${ptsTbl}`}
        ${h.green?.polygon ? `<section class="card gp-gshape" aria-label="Forma del green">${greenShape(h, fr, LK.distances ? null : { F, FF, M, Bk })}</section>` : '<p class="msg">Todavía no tenemos la forma de este green en el mapa.</p>'}
        ${real ? '<section class="gp-green" aria-label="Pendientes del green"><div class="gp-gt">Caídas</div><div id="gpgreen"></div></section>' : ''}
        <div id="gpdx"></div>
        ${real ? '' : `<p class="msg gp-nod" id="gpnod">${slopesLocked ? `${LOCK} Caídas del green bloqueadas en modo torneo.` : 'Sin datos de caídas para este green: mostramos la forma y las yardas adelante, centro y fondo.'}</p>`}`;
      if (real) mountGreen(d.course, n, h);
      else if (d.course.green_guide && !slopesLocked) guideGreen(d.course, n).then(() => { const w = document.getElementById('lbgw'), nd = document.getElementById('gpnod'); if (!w || !nd) return;
        if (+w.dataset.falls) nd.remove(); else nd.textContent = 'Sin datos de caídas para este green: la guía del club no marca flechas. Mostramos la forma y las yardas.'; });
      return;
    }
    /* ---------- «Detalle del hoyo»: its own screen (no modal) ---------- */
    if (det) {
      CURH = null; const S = LK.planner ? null : calc();
      el.innerHTML = `<div class="gp-hh"><div><div class="gp-ht">Hoyo ${n}</div><div class="gp-hs num">${sub}</div></div></div>
        ${TN.active ? `<div class="gp-tn" role="status">${LOCK}<b>Modo torneo</b>${TN.no_distance_rule ? '<span>sin medidores</span>' : ''}</div>` : ''}
        ${fcNote(d.forecast)}
        ${detBody(`${S ? sugExplain(S.sug) : ''}${LK.planner ? '' : legend}`)}
        ${hasGreen && !LK.planner && !LK.green_slopes ? '<section class="gp-green" aria-label="Pendientes del green"><div class="gp-gt">Green</div><div id="gpgreen"></div></section>' : ''}
        <div id="gpdx"></div>
        <a class="btn gp-back" href="${hb(n)}">Volver al hoyo ${n}</a>`;
      if (hasGreen && !LK.planner && !LK.green_slopes) mountGreen(d.course, n, h);
      if (d.course.green_guide && !LK.green_slopes) guideGreen(d.course, n);
      return;
    }

    /* ---------- the hole: one screen ---------- */
    const mount = (stripHtml, svgOpts, after) => {
      el.innerHTML = `${head()}<div class="gp-mapw gp-fitw${PR && (FLUI || GM) ? ' gp-flmode' : ''}${PR ? ' gp-prl' : ''}${PR && GM ? ' gp-gm' : ''}" id="gpmap">${tl()}<div class="gp-strip" id="gpstrip">${stripHtml}</div></div>`;
      const mw = live('gpmap');
      { const st0 = mw.querySelector('.gp-strip'), tl0 = mw.querySelector('.gp-tl'); if (st0 && !PR) { const top = tl0 ? tl0.offsetTop + tl0.offsetHeight : 0; st0.style.maxHeight = `${Math.max(120, Math.min(mw.clientHeight - top - 16, Math.round(mw.clientHeight * 0.66)))}px`; } }   // t263u: the strip never outgrows the map box
      const fit = fitBox(mw);
      // re-fit when the box or the overlays change size (rotation, text size applied after load, the URL bar)
      RO?.disconnect(); if (window.ResizeObserver) { const els = [mw, mw.querySelector('.gp-strip'), mw.querySelector('.gp-tl')].filter(Boolean), z0 = els.map(x => [x.offsetWidth, x.offsetHeight]);
        RO = new ResizeObserver(() => { if (els.some((x, k) => Math.abs(x.offsetWidth - z0[k][0]) > 2 || Math.abs(x.offsetHeight - z0[k][1]) > 2)) { clearTimeout(RSZ); RSZ = setTimeout(() => { if (CURH && live('gpmap') === mw && !mw.classList.contains('dragging')) CURH(); }, 120); } });
        els.forEach(x => RO.observe(x)); }
      const { svg, vb, obs, band } = holeSvg(h, fr, { ...svgOpts, pxW: fit.W, fit, others: m.holes, tee, teeLL, teeYd: tee ? tee.yd : null, hz: HZ2 });
      mw.insertAdjacentHTML('afterbegin', svg);
      if (window.GolfletLibreta) window.GolfletLibreta.swipe(el, prev ? hb(prev).replace(/&amp;/g, '&') : null, next ? hb(next).replace(/&amp;/g, '&') : null);
      const ts0 = live('gptee'); if (ts0) ts0.onchange = () => { const t = TEES.find(z => z.key === ts0.value); if (!t) return; try { localStorage.setItem(teeKey(d), t.key); } catch { /* private mode */ }
        setTee(t); if (PEND[key]) delete PEND[key].to; delete HOLEZ[key]; if (CURH) CURH(); };
      if (PR) { const st = mw.querySelector('.gp-strip'); mw.style.setProperty('--gpsb', `${(st ? st.offsetHeight : 0) + 12}px`); mw.classList.add('gp-imm'); el.classList.add('gp-immv'); document.documentElement.classList.add('gp-live'); }
      after(mw, mw.querySelector('svg.gp-map'), vb, obs, band);
    };
    if (LK.planner) {   // Modo torneo during the round: the plan as prepared, read-only (pinch zoom only)
      const ball = shots.length ? shots[shots.length - 1].to : start;
      CURH = () => mount(`<div class="gp-sr"><span class="gp-shs num">${shots.length ? shots.map((s, k) => `<span>${k + 1}·${e(s.club)}</span>`).join('') : '<span>Sin golpes armados</span>'}</span></div>
          <div class="gp-locks" aria-label="Bloqueado en modo torneo">${['±yd', 'Palo', 'Óvalo', ...(hasGreen ? ['Green'] : [])].map(t => `<span>${LOCK}${t}</span>`).join('')}</div>`,
        { ball, start, wind: x.wind, eff: null, sat, pend: null, shots, hitIds: [], lk: LK, labels: true, flag: flagNow()?.ll || null },
        (mw, svgEl, vb) => mapGestures(mw, svgEl, vb, key, null));
      CURH(); return;
    }
    const render = () => {
      // t222u: open with a club already chosen (the suggestion, else the club that best covers what is left) so the ring and the labels show at once
      syncT(); const G0 = PR ? prSync() : null;
      if (PR) { const VK = `${id}|${n}`; if (VMODE.key !== VK) { VMODE = { key: VK, mode: null, g: false, cropY: null }; }
        const meXY = G0?.ok ? fr.F.xy(G0.ll) : null, dG = meXY ? C.dist(meXY, fr.F.xy(gcG)) / C.YD : null, inG = meXY && greenPoly && C.inPoly(meXY, greenPoly);
        if (meXY) VMODE.g = VMODE.g ? (dG <= 42 || inG) : (dG <= 30 || inG);   // hysteresis: in at 30 yd, out at 42
        const wasGM = GM; GM = VMODE.mode ? VMODE.mode === 'green' : VMODE.g;
        if (GM && !wasGM && !FLUI) FLUI = 'open';
        if (GM) { const gp = (h.green?.polygon || []).map(fr.toS), c0 = fr.toS(gcG), fl = [flagNow()?.ll, flag2()?.ll].filter(Boolean).map(fr.toS).filter(q => Math.hypot(q[0] - c0[0], q[1] - c0[1]) < 60);
          const pts0 = [...(gp.length ? gp : [[c0[0] - 14, c0[1] - 14], [c0[0] + 14, c0[1] + 14]]), ...fl, ...(meXY && dG < 45 ? [fr.toS(G0.ll)] : [])];
          FRAME = { pts: pts0, pad: 9, min: 42 }; VMODE.cropY = null; }
        else if (meXY && !VMODE.mode || (meXY && VMODE.mode === 'hoyo')) { const cy = fr.toS(G0.ll)[1] + 5 * C.YD;
          if (VMODE.cropY == null || Math.abs(cy - VMODE.cropY) > 9) VMODE.cropY = cy;   // hysteresis: re-frame every ~10 yd walked
          FRAME = { bot: VMODE.cropY, me: fr.toS(G0.ll) }; }
        else FRAME = null;
        const sig = JSON.stringify(FRAME && (FRAME.pts ? 'g' : Math.round(FRAME.bot))); if (sig !== VMODE.sig) { VMODE.sig = sig; delete HOLEZ[key]; }
        if (GM && FLUI !== 'date') MAPTAP = sp => { FLC = fr.fromS(sp); FLUI = 'tap'; render(); }; else if (FLUI !== 'tap') MAPTAP = null; }
      const lastLog = PR ? logGet(id, n).at(-1) : null, justHit = PR && G0?.ok && lastLog && !(shots.length && shots[shots.length - 1].live);
      if (PR && PEND[key]?.auto && PEND[key].at) { const b0 = fr.F.xy(shots.length ? shots[shots.length - 1].to : start); if (C.dist(b0, PEND[key].at) / C.YD > 8) delete PEND[key]; }   // t244u: you walked: pick again from here
      if (!LK.planner && !PEND[key] && usable.length && !(PR && (LK.recommendations || justHit))) { const S0 = calc();
        // t235u: never auto-pick a club that would be a partial swing (a bag with only the Driver showed «Driver 125» next to the green)
        if (!S0.done) { const best = S0.sug ? null : [...S0.adj].filter(z => !z.dd.partial).sort((a, b) => Math.abs(a.adj - S0.remain) - Math.abs(b.adj - S0.remain))[0];
          PEND[key] = S0.sug ? { club: S0.sug.code, aim_yd: S0.sug.aim_yd || 0, suggested: true, auto: true, at: S0.bXY } : best ? { club: best.c.code, auto: true, at: S0.bXY } : undefined; if (!PEND[key]) delete PEND[key]; } }
      const S = calc(), { done, bXY, gXY, remain, pend, proj, hit, ovHits, adj, sug } = S;
      const club = pend?.club || '', q0 = proj ? proj.landing : null, L0 = proj ? liveNums(bXY, gXY, q0, club, pend.to ? null : proj.A, proj.dd) : null;
      if (proj) proj.live = L0;
      if (PR) { PRL = L0 && !LK.distances ? `${clubName(club)} ${L0.r1}${L0.B?.terms?.length ? ` (normal ${L0.B.normal})` : ''}` : ''; LASTR = G0?.ok ? fr.F.xy(G0.ll) : null; LASTT = Date.now(); LASTOK = !!G0?.ok; }
      // t235u: the confirmed shots' pills (recomputed from the club and the two points, as they were shown)
      const pinL = shots.map((sh, i) => { const a = fr.F.xy(i ? shots[i - 1].to : start), b = fr.F.xy(sh.to), od = origDD(sh.club);
        if (!od) return { lines: [`${clubName(sh.club)} · ${Math.round(C.dist(a, b) / C.YD)} yd`, null] };
        const dd = C.fitDD(od, Math.round(C.dist(a, gXY) / C.YD)), A = !sh.adjusted && !dd.partial ? C.shotAdjust(dd.yd, adjIn(a, C.aimPoint(path, a, dd.yd * C.YD), dd, dd.yd)) : null;
        return liveNums(a, gXY, b, sh.club, A, dd); });
      const bdId = BD[key], bdL = bdId === '1' || bdId === '2' ? L0 : bdId && bdId[0] === 'p' ? pinL[+bdId.slice(1)] : null;
      const bdBox = bdL ? bdHtml(bdL, bdId === '2' ? '2' : bdId[0] === 'p' ? 'pin' : '1', bdId[0] === 'p' ? `Golpe ${+bdId.slice(1) + 1}: ${clubName(shots[+bdId.slice(1)]?.club)} · ${bdL.r1} yd` : `${clubName(club)} · ${bdL.r1} yd`) : '';
      const hitTxt = hitText(hit, ovHits);
      const clubsRow = !done && usable.length ? `<div class="gp-clubs gp-cr" role="radiogroup" aria-label="Palo">${adj.map(z => `<button type="button" role="radio" data-club="${e(z.c.code)}" aria-checked="${pend?.club === z.c.code}" aria-label="${e(clubName(z.c.code))}, ${Math.round(z.adj)} yardas" class="${pend?.club === z.c.code ? 'on' : ''}${sug && sug.code === z.c.code ? ' fit' : ''}"><b>${e(clubName(z.c.code))}</b><span class="num">${z.dd.partial ? '≈' : ''}${Math.round(z.adj)}</span>${z.dd.kind === 'oval' ? '<i class="gp-ov" aria-label="GPS"></i>' : ''}</button>`).join('')}</div>` : '';
      const undo = shots.length ? `<button type="button" class="gp-ib" id="gpundo" aria-label="Deshacer el último golpe" title="Deshacer">↶</button>` : '';
      let row;
      if (done) row = `<div class="gp-sr"><b class="gp-st">En el green</b><span class="num gp-sn">${shots.length} ${shots.length === 1 ? 'tiro' : 'tiros'}</span>${undo}${next ? `<a class="btn sm gp-go" href="${hb(next)}">Hoyo ${next} ›</a>` : ''}</div>`;
      else if (!usable.length) row = `<div class="gp-sr"><a class="gp-rm" href="${detHref}"><b class="num">${remain}</b> ${toT()}</a><span class="gp-msg">Cargá tus distancias en <a href="#/bolsa">Mi bolsa</a></span>${undo}</div>`;
      else if (proj) row = `<div class="gp-sr"><a class="gp-sdv num" href="${detHref}" aria-label="Golpe estimado"><b id="gpsd"><span class="gp-cn">${e(clubName(club))} · </span>${L0.r1}</b></a><a class="gp-lf num" href="${detHref}" aria-label="Te quedan al green">→ <b id="gplf">${L0.r2}</b></a>${hitTxt ? `<a class="gp-hit" href="${detHref}">${e(hitTxt)}</a>` : ''}<span class="gp-sp"></span>${pend.to ? '<button type="button" class="gp-ib" id="gpreset" aria-label="Volver al cálculo" title="Volver al cálculo">↺</button>' : ''}${undo}<button class="btn sm gp-okb" id="gpok">${PR ? 'Tiro' : 'Confirmar'}</button></div>`;
      else row = `<div class="gp-sr"><a class="gp-rm" href="${detHref}"><b class="num">${remain}</b> ${toT()}</a>${sug ? `<button type="button" class="gp-sug" id="gpsug" aria-label="Usar la sugerencia (estimación): ${e(sug.code)}${sug.aim_yd ? `, apuntando ${Math.abs(sug.aim_yd)} yardas a la ${sug.aim_yd < 0 ? 'izquierda' : 'derecha'}` : ''}, te quedan ${sug.after_yd}"><b>${e(clubName(sug.code))}</b>${sug.aim_yd ? `<span class="num gp-aimx">${aimTxt(sug.aim_yd)}</span>` : ''}<span class="num">→ ${sug.after_yd}</span>${sug.risk_pct ? `<span class="gp-sr2 num">${sug.risk[0].pct}%</span>` : ''}<small>estim.</small></button>` : adj.length && adj.every(z => z.dd.partial) ? '<span class="gp-msg">Ningún palo entra completo: <a href="#/bolsa">cargá palos cortos</a></span>' : '<span class="gp-msg">Elegí un palo</span>'}<span class="gp-sp"></span>${undo}</div>`;
      BDTAP = k => { BD[key] = BD[key] === k ? null : k; BDX = false; render(); };
      if (PR) { TG = proj && L0 && !done ? { r1: L0.r1, r2: L0.r2 } : { r1: null, r2: null };
        const sheet = HSEL ? holeStrip() : FLUI ? `<div id="gplvf">${flagPanel()}</div>` : MENU ? menuHtml(!!shots.length, !!pend?.to) : '';
        const prow = done || !usable.length || !proj ? row.replace(/<button type="button" class="gp-ib" id="gpundo"[^>]*>↶<\/button>/, '') : `<div class="gp-sr gp-srp">${clubsRow}<button class="btn sm gp-okb" id="gpok" aria-label="Registrar el tiro con ${e(clubName(club))}">Tiro</button></div>`;
        row = sheet ? `${sheet}${bottomBar()}` : `${proj && !done ? '' : clubsRow}${prow}${bdBox}${bottomBar()}`; }
      mount(PR ? row : `${clubsRow}${row}${bdBox}`, { ball: S.ball, start, wind: x.wind, eff: LK.plays_like ? null : x.effect, sat, pend: proj, shots, pins: pinL.map(L => ({ lines: L.l1, aria: L.t1 })), me: PR && G0?.ll ? meOf(G0.ll, G0.acc) : null, target: flagNow()?.ll || null, flag: flagNow()?.ll || null, flagCand: FLC, frame: PR ? FRAME : null, imm: PR, ff: PR && GM, flagDrag: PR && !LK.distances, flagGhost: PR && !LK.distances && !flagNow() ? gcG : null, flagLabel: PR && GM && flagNow() ? dCap(fdate()) : null, flag2: PR && flag2() ? { ll: flag2().ll, label: dCap(otherDay()) } : null, hitIds: hit, sug, lk: LK }, (mw, svgEl, vb, obs, band) => {
        let drag = null;
        if (!done && proj) {
          const rg = live('gpring'), ls = ['gpl1', 'gpl1o'].map(live), l2s = ['gpl2', 'gpl2o'].map(live).filter(Boolean), t1 = live('gpt1'), t2 = live('gpt2'), sd = live('gpsd'), lf = live('gplf'), s = vb[2] / fitBox(mw).W, fs = 14 * ts() * s;
          const bS = fr.toS(S.ball), gS = fr.toS(gc); let last = null;
          const place = q => {
            const ll = fr.fromS(q), Lv = liveNums(bXY, gXY, fr.F.xy(ll), club, null, proj.dd); last = q;
            if (rg) rg.setAttribute('transform', `translate(${q[0].toFixed(1)} ${q[1].toFixed(1)})`);
            for (const l of ls) if (l) { l.setAttribute('x2', q[0]); l.setAttribute('y2', q[1]); }
            for (const l of l2s) { l.setAttribute('x1', q[0]); l.setAttribute('y1', q[1]); }
            let prevBox = null;
            for (const [t, a, b, lines] of [[t1, bS, q, Lv.l1], [t2, q, gS, Lv.l2]]) { if (!t) continue; const { P: Pl, q: p } = placePill(lines, fs, s, a, b, vb, band, prevBox ? [...obs, prevBox] : obs, [q]); prevBox = p.box;
              t.innerHTML = Pl.svg; t.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`); }
            if (sd) sd.innerHTML = `<span class="gp-cn">${e(clubName(club))} · </span>${Lv.r1}`; if (lf) lf.textContent = Lv.r2;
            mw.dataset.d1 = Lv.r1; mw.dataset.d2 = Lv.r2; const g1 = live('gptg1'), g2 = live('gptg2'); if (g1) g1.textContent = Lv.r1; if (g2) g2.textContent = Lv.r2;
          };
          const q0s = fr.toS(fr.F.ll(q0));
          mw.dataset.d1 = L0.r1; mw.dataset.d2 = L0.r2;
          drag = { move: q => { mw.classList.add('dragging'); place(q); }, cancel: () => { mw.classList.remove('dragging'); place(q0s); last = null; },
            end: () => { mw.classList.remove('dragging'); if (!last) return; PEND[key].to = fr.fromS(last); render(); } };
        }
        // t250u: drag the flag (or the ghost at the middle) on the green before hitting; clamped to the green (+8 m) or 28 m around the middle
        if (PR && !LK.distances && svgEl.querySelector('#gpflagm')) { const fg = svgEl.querySelector('#gpflagm'), c0 = fr.F.xy(gcG), base0 = fr.toS(flagNow()?.ll || gcG);
          const Rmax = greenPoly ? Math.max(...greenPoly.map(p => C.dist(p, c0))) + 8 : 28; let off = null, cur = null;
          const clampS = sp => { let q = fr.F.xy(fr.fromS(sp)); const d0 = C.dist(q, c0); if (d0 > Rmax) q = [c0[0] + (q[0] - c0[0]) * Rmax / d0, c0[1] + (q[1] - c0[1]) * Rmax / d0]; return fr.R(q); };
          const fromXY = fr.F.xy(G0?.ok ? G0.ll : S.ball), bc = live('gpfl')?.querySelector('b');
          FLAGDRAG = { start: sp => { off = [base0[0] - sp[0], base0[1] - sp[1]]; cur = null; mw.classList.add('dragging'); live('gpflagl')?.setAttribute('opacity', '0'); },
            move: sp => { if (!off) return; cur = clampS([sp[0] + off[0], sp[1] + off[1]]); fg.setAttribute('transform', `translate(${cur[0].toFixed(1)} ${cur[1].toFixed(1)})`); fg.classList.remove('gp-flagg');
              if (bc) bc.textContent = Math.round(C.dist(fromXY, fr.F.xy(fr.fromS(cur))) / C.YD); },
            end: () => { mw.classList.remove('dragging'); off = null; if (!cur) { render(); return; } const ll = fr.fromS(cur), uk = `${id}|${n}|${fdate()}`, prev = flagNow(); cur = null;
              (FLUNDO[uk] = FLUNDO[uk] || []).push(prev ? { ll: prev.ll, acc_m: prev.acc_m ?? null, source: prev.source } : null);
              flagSet(FCC, FCO, fdate(), n, { ll, acc_m: null, source: 'mapa' }).then(() => { if (live('gplive')?.dataset.k === key) render(); }); flagAfter(); },
            cancel: () => { mw.classList.remove('dragging'); off = null; cur = null; render(); } };
        } else FLAGDRAG = null;
        mapGestures(mw, svgEl, vb, key, drag);
      });
      el.querySelectorAll('[data-club]').forEach(b => b.onclick = () => { PEND[key] = { club: b.dataset.club }; render(); });
      el.querySelectorAll('[data-bdx]').forEach(b => b.onclick = () => { BDX = !BDX; render(); });
      el.querySelectorAll('[data-firm]').forEach(b => b.onclick = () => { try { localStorage.setItem(firmKey, b.dataset.firm); } catch { /* private mode */ } FIRM = b.dataset.firm; render(); });
      const sel = el.querySelector('.gp-clubs .on'); if (sel) sel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const sb = live('gpsug'); if (sb) sb.onclick = () => { PEND[key] = { club: sug.code, aim_yd: sug.aim_yd || 0, suggested: true }; render(); };
      const save = async () => { try { await H.api(`/api/plans/${encodeURIComponent(id)}/holes/${n}`, { method: 'PUT', body: JSON.stringify({ shots }) }); } catch (err) { H.toast(err.message || 'No se pudo guardar'); } };
      if (PR) { const hs = live('gphsel'); if (hs) hs.onclick = () => { HSEL = !HSEL; render(); };
        const ha = live('gphauto'); if (ha) ha.onclick = () => { autoSet(!autoOn()); HSEL = false; AH = null; render(); autoHole(); };
        if (HSEL) MENU = false;
        el.querySelectorAll('[data-hpick]').forEach(a => a.onclick = () => { autoSet(false); });
        bindLive(); const lb = live('gplive'); if (lb) lb.dataset.k = key; el.querySelectorAll('[data-vm]').forEach(b => b.onclick = () => { VMODE.mode = b.dataset.vm; if (b.dataset.vm === 'hoyo') { FLUI = FLUI === 'tap' ? null : FLUI; FLC = null; } render(); }); }
      const ok0 = live('gpok'); if (ok0 && PR) ok0.onclick = () => { const L = logGet(id, n), land = pend.to || fr.F.ll(proj.withWind);
        L.push({ club: pend.club, at: S.ball, land, t: Date.now() }); logSet(id, n, L); delete PEND[key]; BD[key] = null; render(); };
      const ok = PR ? null : live('gpok'); if (ok) ok.onclick = async () => { const to = pend.to || fr.F.ll(proj.withWind); if (BD[key] === '1' || BD[key] === '2') BD[key] = null; shots.push({ club: pend.club, source: S.u.dd.used, to, adjusted: !!pend.to, ...(pend.suggested && !pend.to ? { suggested: true } : {}), ...(pend.aim_yd ? { aim_yd: pend.aim_yd } : {}) }); delete PEND[key]; render(); await save(); };
      const rs = live('gpreset'); if (rs) rs.onclick = () => { delete PEND[key].to; render(); };
      const un0 = PR ? live('gpundo') : null; if (un0) un0.onclick = () => { const L = logGet(id, n); L.pop(); logSet(id, n, L); delete PEND[key]; BD[key] = null; render(); };
      const un = PR ? null : live('gpundo'); if (un) un.onclick = async () => { shots.pop(); delete PEND[key]; BD[key] = null; render(); await save(); };
    };
    CURH = render; render();
    // t243u: live GPS → the box and the blue dot follow you; the shot view re-draws when you moved ≥ 5 m (at most every 4 s) or the GPS got good/bad
    // t245u: the wind now, every ~10 min while you play (and whenever the GPS moves, the cache decides)
    /* t256u: auto-detect the hole: nearest tee→green line; switch when another hole is ≥ 25 yd closer for ~10 s (good fix only) */
    const holeLines = m.holes.filter(hh => hh.line?.length).map(hh => ({ hole: hh.hole, pts: [hh.tees?.[0]?.center, ...hh.line, hh.green?.center].filter(Boolean).map(fr.F.xy) }));
    const segD = (q, P0) => { let b = Infinity; for (let k = 0; k < P0.length - 1; k++) { const a = P0[k], c = P0[k + 1], L2 = (c[0] - a[0]) ** 2 + (c[1] - a[1]) ** 2 || 1e-9, t = Math.max(0, Math.min(1, ((q[0] - a[0]) * (c[0] - a[0]) + (q[1] - a[1]) * (c[1] - a[1])) / L2)); b = Math.min(b, Math.hypot(a[0] + t * (c[0] - a[0]) - q[0], a[1] + t * (c[1] - a[1]) - q[1])); } return P0.length === 1 ? Math.hypot(P0[0][0] - q[0], P0[0][1] - q[1]) : b; };
    function autoHole() {
      if (!PR || det || !autoOn() || !GEO.ll || GEO.acc == null || GEO.acc > 20 || Date.now() - GEO.t > 30000 || live('gplive')?.dataset.k !== key) { AH = null; return; }
      const q = fr.F.xy(GEO.ll); let best = null, cur = Infinity;
      for (const L of holeLines) { const dd = segD(q, L.pts); if (L.hole === n) cur = dd; if (!best || dd < best.d) best = { hole: L.hole, d: dd }; }
      if (best && best.hole !== n && best.d < 70 && best.d + 25 * C.YD < cur) {
        if (!AH || AH.hole !== best.hole) { AH = { hole: best.hole, since: Date.now() }; clearTimeout(AHT); AHT = setTimeout(autoHole, 10500); }
        else if (window.GolfletMatch?.sheetOpen?.()) { clearTimeout(AHT); AHT = setTimeout(autoHole, 5000); }   // t270u: never switch hole under the open match sheet
        else if (Date.now() - AH.since >= 10000) { AH = null; H.toast(`Auto: hoyo ${best.hole}`); location.hash = `#/plan/${id}/hoyo/${best.hole}${sat ? '?v=sat' : ''}`; }
      } else { AH = null; clearTimeout(AHT); } }
    const wxTick = () => { if (!PR) return; if (!live('gplive')) { clearInterval(WXI); return; } const t0 = WXL.t; wxNow(GEO.ll || gcG).then(() => { if (WXL.t !== t0 && live('gplive')?.dataset.k === key && !live('gpmap')?.classList.contains('dragging') && applyWx()) render(); }); };
    if (PR && !det) { wxTick(); WXI = setInterval(wxTick, 60e3);
      GEO.subs.clear();
      const sub = () => { const box = live('gplive'); if (!box || box.dataset.k !== key) { GEO.subs.delete(sub); return; }
        const g = gpsState(), mw = live('gpmap');
        if (mw?.classList.contains('dragging')) return; autoHole();
        if (!!g?.ok !== LASTOK) { render(); return; }
        if (g?.ok && (!LASTR || C.dist(fr.F.xy(g.ll), LASTR) > 5)) { const w = 4000 - (Date.now() - LASTT); if (w <= 0) { render(); return; }
          clearTimeout(PRT); PRT = setTimeout(() => { const b2 = live('gplive'); if (b2 && b2.dataset.k === key && !live('gpmap')?.classList.contains('dragging')) render(); }, w); }
        const dv = live('gplvd'); if (dv) dv.innerHTML = liveDyn(); else box.innerHTML = liveBoxHtml();
        const gb = live('gpflgps'), why = live('gpflwhy'); if (gb && why && FLUI === 'open') { const G = flagGps(g); gb.disabled = !G.ok; if (!G.ok) why.textContent = G.why; }
        bindLive(); wxTick();
        const me = live('gpme'); if (me && g?.ll) { const o = meOf(g.ll, g.acc); me.setAttribute('transform', `translate(${o.s[0].toFixed(1)} ${o.s[1].toFixed(1)})`); me.querySelector('#gpmea')?.setAttribute('r', o.r.toFixed(1)); } };
      GEO.subs.add(sub); }
  }
  const C16 = d => ['norte', 'nornoreste', 'noreste', 'estenoreste', 'este', 'estesudeste', 'sudeste', 'sudsudeste', 'sur', 'sudsudoeste', 'sudoeste', 'oestesudoeste', 'oeste', 'oestenoroeste', 'noroeste', 'nornoroeste'][Math.round(d / 22.5) % 16];

  window.GolfletPlan = { init: h => { H = h; }, page, load, label, parent, fixed, invalidateClubs: () => { CLUBS = null; }, practiceLive, windTiles };
})();
