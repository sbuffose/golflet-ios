/* t260u/t261u «Armar partido»: setup (fourball / mano a mano / metralleta, hándicap o gross, % ajustable), hole-by-hole scores, live status, history.
   Maths in match-core.js (shared with the server). Private: the matches live in the player's account; nothing goes to the club. No modals. */
(() => {
  'use strict';
  let H = null; const MC = () => window.GolfletMatchCore;
  const e = s => H ? H.esc(s) : String(s ?? '');
  const live = id => document.getElementById(id);
  const f1 = x => x == null ? '—' : (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
  const todayAR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
  const MOD = { fourball: 'Match fourball', single: 'Mano a mano', metralleta: 'Metralleta' };
  const MODS = { fourball: '2 contra 2 · mejor bola neta de la pareja', single: '1 contra 1', metralleta: 'todos contra todos · un match por cada par' };
  const LS = { get: (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private */ } } };
  const QK = 'golflet.matchq', MK = id => `golflet.match.${id}`, CUR = 'golflet.match.cur';
  const qs = () => new URLSearchParams((location.hash.split('?')[1] || ''));
  const spin = '<div class="msg">Cargando…</div>';
  /* t264u/t265u: index → playing handicap per player, and the strokes grid (two 9-hole blocks: Hoyo / Par / S.I. + one row per player). */
  const phTxt = (def, p) => { const ph = MC().playingHcp(def, p); if (ph.source === 'course') return `Índice ${f1(ph.index)} → juega <b class="num">${ph.course_handicap}</b> · ${e(ph.tee)}`;
    if (ph.source === 'index') return `Índice <b class="num">${f1(ph.index)}</b>${ph.note ? ` <span class="gm-warn2">${e(ph.note)}</span>` : ''}`; return '<span class="gm-warn2">sin hándicap</span>'; };
  function gridHtml(def, E, short, cur) {
    if (!E || def.scoring !== 'hcp') return '';
    const ids = def.players.map(p => p.id), hs = E.hole_strokes, pars = def.pars || [], si = def.si || [];
    const ts = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ts')) || 1, BK = innerWidth * 1 / ts < 330 ? 6 : 9;   // t264u: 6-hole blocks when narrow / big text
    const block = (a) => { const hh = Array.from({ length: BK }, (_, k) => a + k);
      const tdc = h => h === cur ? ' class="cur"' : '';
      return `<table class="gm-gt num"><thead><tr><th scope="row">Hoyo</th>${hh.map(h => `<th${tdc(h)}>${h + 1}</th>`).join('')}</tr></thead><tbody>
        <tr class="gm-gm"><th scope="row">Par</th>${hh.map(h => `<td${tdc(h)}>${pars[h] ?? '–'}</td>`).join('')}</tr>
        <tr class="gm-gm"><th scope="row">S.I.</th>${hh.map(h => `<td${tdc(h)}>${si[h] ?? '–'}</td>`).join('')}</tr>
        ${ids.map(i => `<tr><th scope="row">${e(short(i))} <small>${E.strokes[i] || 0}</small></th>${hh.map(h => { const v = hs[i]?.[h] || 0; return `<td${tdc(h)}>${v ? `<span class="gm-gd" aria-label="${v} ${v === 1 ? 'golpe' : 'golpes'}">${'●'.repeat(Math.min(v, 3))}</span>` : ''}</td>`; }).join('')}</tr>`).join('')}</tbody></table>`; };
    return `<div class="card gm-grid" aria-label="Golpes por hoyo"><div class="gm-gh"><b>Golpes por hoyo</b><small>● = 1 golpe · por S.I.${def.modality === 'metralleta' ? ' · contra el más bajo (en cada par, la diferencia)' : ''}</small></div>${Array.from({ length: 18 / BK }, (_, k) => block(k * BK)).join('')}
      <p class="foot gm-gtot">${ids.map(i => `${e(short(i))}: ${E.strokes[i] || 0}`).join(' · ')}</p></div>`;
  }

  /* ---------- offline queue (like the flags): last body per match, flushed whenever we can ---------- */
  let FLUSHING = false;
  async function flush() {
    if (FLUSHING) return; FLUSHING = true;
    try { const Q = LS.get(QK, {});
      for (const id of Object.keys(Q)) { try { const r = await H.api(`/api/matches/${id}`, { method: 'PUT', body: JSON.stringify(Q[id]) }); LS.set(MK(id), r); const Q2 = LS.get(QK, {}); if (Q2[id] && JSON.stringify(Q2[id]) === JSON.stringify(Q[id])) { delete Q2[id]; LS.set(QK, Q2); } }
        catch (err) { if (err?.status === 409 || err?.status === 400 || err?.status === 404) { const Q2 = LS.get(QK, {}); delete Q2[id]; LS.set(QK, Q2); if (err.status !== 409) H.toast(err.message || 'No se pudo guardar el partido'); } else break; } }
    } finally { FLUSHING = false; }
  }
  addEventListener('online', () => flush());
  const save = (m, finish) => { const body = { date: m.date, course_label: m.course_label, tee_time_id: m.tee_time_id, def: m.def, scores: m.scores, ...(finish ? { finish: true } : {}) };
    const Q = LS.get(QK, {}); Q[m.id] = body; LS.set(QK, Q); LS.set(MK(m.id), m); return flush(); };
  const pending = id => !!LS.get(QK, {})[id];

  /* ---------- routes: #/partido/nuevo?tee= · #/partido/<id>[?hoyo=N] · #/partidos[?p=<jugador>] ---------- */
  function page() { return `<div id="gm" class="gm">${spin}</div>`; }
  function label(h) { return /#\/partidos/.test(h) ? 'Partidos' : 'Partido'; }
  function parent(h) { return /#\/partido\/nuevo/.test(h) ? (qs().get('tee') ? `#/tee/${qs().get('tee')}` : '#/inicio') : /#\/partido\//.test(h) ? '#/partidos' : '#/inicio'; }
  async function load(p) {
    const el = live('gm'); if (!el) return; flush();
    const k = (p[1] || '').split('?')[0];
    try {
      if (p[0] === 'partidos') return await drawHistory(el);
      if (k === 'nuevo') return await drawSetup(el, qs().get('tee'));
      return await drawMatch(el, k);
    } catch (err) { el.innerHTML = `<div class="msg err">${e(err?.message || 'No se pudo cargar')}</div>`; }
  }

  /* ---------- setup ---------- */
  async function drawSetup(el, tee) {
    const DK = `golflet.match.draft.${tee || 'libre'}`;
    let base = null; if (tee) base = await H.api(`/api/matches/setup?tee=${encodeURIComponent(tee)}`).catch(() => null);
    if (!live('gm')) return;
    const S = LS.get(DK, null) || { players: base?.players?.map(p => ({ id: p.id, name: p.name, hcp: p.hcp, me: !!p.me, tee: p.tee ?? null, gender: p.gender || 'C' })) || [{ id: 'me', name: 'Yo', hcp: null, me: true }], modality: null, scoring: 'hcp', allowance: null, sides: null, opp: null };
    const TEES = base?.tees || [], TN = [...new Set(TEES.map(t => t.tee))], GEN = (base?.genders || []).includes('D');
    S.players.forEach(p => { if (p.tee === undefined) p.tee = base?.default_tee ?? null; if (!p.gender) p.gender = 'C'; });
    if (!S.modality) S.modality = S.players.length === 4 ? 'fourball' : S.players.length === 2 ? 'single' : S.players.length >= 3 ? 'metralleta' : 'single';
    const si = base?.si || Array(18).fill(null), start = base?.tee_time?.start_hole || 1;
    let addOpen = false, err = '';
    const al = () => S.allowance ?? MC().DEFAULT_ALLOWANCE[S.modality];
    const draw = () => { const ids = S.players.map(p => p.id); for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; } S.sides = [ids.slice(0, 2), ids.slice(2, 4)]; };
    const okSides = () => S.sides && S.sides.flat().length === 4 && S.sides.flat().every(id => S.players.some(p => p.id === id)) && new Set(S.sides.flat()).size === 4;
    const defOf = () => { const sel = S.modality === 'single' ? [S.players.find(p => p.me) || S.players[0], S.players.find(p => p.id === S.opp) || S.players.find(p => !p.me)].filter(Boolean) : S.players;
      return { modality: S.modality, scoring: S.scoring, allowance: al(), players: sel.map(p => ({ id: p.id, name: p.name, hcp: p.hcp == null || p.hcp === '' ? null : +p.hcp, ...(p.manual ? { manual: true } : {}), ...(TEES.length && p.tee ? { tee: p.tee, gender: p.gender || 'C' } : {}) })), ...(S.modality === 'fourball' ? { sides: S.sides } : {}), si, start_hole: start, ...(TEES.length ? { tees: TEES } : {}), ...(base?.pars ? { pars: base.pars } : {}) }; };
    const nm = id => S.players.find(p => p.id === id)?.name || id;
    const render = () => {
      LS.set(DK, S);
      const n = S.players.length, can = { fourball: n === 4, single: n >= 2, metralleta: n >= 3 && n <= 8 };
      if (!can[S.modality]) S.modality = can.fourball ? 'fourball' : can.metralleta ? 'metralleta' : 'single';
      if (S.modality === 'fourball' && !okSides()) draw();
      if (S.modality === 'single' && (!S.opp || !S.players.some(p => p.id === S.opp && !p.me))) S.opp = S.players.find(p => !p.me)?.id || null;
      const def = defOf(), missing = S.scoring === 'hcp' && def.players.some(p => p.hcp == null || !isFinite(p.hcp));
      const E = !missing && def.players.length >= 2 && (S.modality !== 'fourball' || okSides()) ? MC().evaluate(def, {}) : null;
      const dots = id => { const hs = E?.hole_strokes?.[id]; if (!hs || !hs.some(Boolean)) return ''; return `<span class="gm-dots num" aria-label="Golpes en los hoyos ${hs.map((v, i) => v ? `${i + 1}${v > 1 ? ` (${v})` : ''}` : null).filter(Boolean).join(', ')}">${hs.map((v, i) => v ? `<i>${i + 1}${'•'.repeat(v)}</i>` : '').join('')}</span>`; };
      const recv = id => E ? (E.strokes[id] ?? 0) : null;
      el.innerHTML = `<div class="gm-hd"><h1>Armar partido</h1>${base?.tee_time ? `<p class="foot">${e(base.tee_time.course_label)} · ${e(base.tee_time.date.split('-').reverse().slice(0, 2).join('/'))} ${e(base.tee_time.time)}${start === 10 ? ' · sale del 10' : ''}</p>` : ''}</div>
        <div class="section"><h2>Jugadores</h2><span class="foot">HCP = índice de la reserva${TEES.length ? ' · salida = de dónde sale' : ''}</span></div>
        <div class="list gm-pl">${S.players.map((p, k) => `<div class="row"><div class="body"><div class="t">${e(p.name)}${p.me ? ' <small class="gm-me">vos</small>' : ''}${p.manual ? ' <small class="gm-me">a mano</small>' : ''}</div>${E && S.scoring === 'hcp' && def.players.some(x => x.id === p.id) && S.modality !== 'metralleta' ? `<div class="s">${recv(p.id) ? `Recibe <b class="num">${recv(p.id)}</b> ${recv(p.id) === 1 ? 'golpe' : 'golpes'}` : 'Juega en cero'}</div>` : ''}
            ${S.scoring === 'hcp' && TEES.length ? `<div class="gm-tee"><select data-tee="${k}" aria-label="Salida de ${e(p.name)}">${TN.map(t => `<option value="${e(t)}"${p.tee === t ? ' selected' : ''}>${e(t)}</option>`).join('')}<option value=""${!p.tee ? ' selected' : ''}>Sin salida (índice)</option></select>${GEN ? `<span class="gm-gen" role="radiogroup" aria-label="Rating">${[['C', 'H'], ['D', 'M']].map(([g, l]) => `<button type="button" role="radio" data-gen="${k}" data-g="${g}" aria-checked="${(p.gender || 'C') === g}" class="${(p.gender || 'C') === g ? 'on' : ''}">${l}</button>`).join('')}</span>` : ''}</div>
            <div class="s gm-ph">${p.hcp == null ? '' : phTxt(defOf(), { ...p, hcp: +p.hcp, tee: p.tee, gender: p.gender })}</div>` : ''}</div>
          <label class="gm-hcp"><span>HCP</span><input type="text" inputmode="decimal" data-hcp="${k}" value="${p.hcp == null ? '' : f1(p.hcp)}" aria-label="HCP de ${e(p.name)}"></label>${p.me ? '' : `<button type="button" class="gm-x" data-rm="${k}" aria-label="Quitar a ${e(p.name)}">✕</button>`}</div>`).join('')}
          ${addOpen ? `<div class="row gm-add"><input type="text" id="gmnn" placeholder="Nombre y apellido" maxlength="60" autocomplete="off"><input type="text" id="gmnh" inputmode="decimal" placeholder="HCP"><button type="button" class="btn sm" id="gmadd2">Agregar</button></div>` : `<button type="button" class="row gm-addb" id="gmadd">＋ Agregar jugador</button>`}</div>
        <div class="section"><h2>Modalidad</h2></div>
        <div class="gm-mods" role="radiogroup">${Object.keys(MOD).map(m => `<button type="button" role="radio" data-mod="${m}" aria-checked="${S.modality === m}" class="${S.modality === m ? 'on' : ''}"${can[m] ? '' : ' disabled'}><b>${MOD[m]}</b><small>${m === 'fourball' && !can[m] ? 'necesita 4 jugadores' : m === 'metralleta' && !can[m] ? 'de 3 a 8 jugadores' : MODS[m]}</small></button>`).join('')}</div>
        ${S.modality === 'fourball' && okSides() ? `<div class="gm-sides">${S.sides.map((sd, k) => `<div class="gm-side"><small>Pareja ${k + 1}</small>${sd.map(id => `<button type="button" data-swap="${e(id)}" aria-label="Pasar a ${e(nm(id))} a la otra pareja">${e(nm(id))}</button>`).join('')}</div>`).join('<span class="gm-vs">vs</span>')}</div>
          <div class="gm-row"><button type="button" class="btn ghost sm" id="gmdraw">🎲 ${S.drawn ? 'Sortear de nuevo' : 'Sortear'}</button><span class="foot">Tocá un nombre para cambiarlo de pareja</span></div>` : ''}
        ${S.modality === 'single' && n > 2 ? `<div class="gm-row"><span class="foot">Contra:</span>${S.players.filter(p => !p.me).map(p => `<button type="button" class="gm-chip${S.opp === p.id ? ' on' : ''}" data-opp="${e(p.id)}">${e(p.name)}</button>`).join('')}</div>` : ''}
        <div class="section"><h2>Cómo se juega</h2></div>
        <div class="seg gm-seg" role="radiogroup"><button type="button" role="radio" data-sc="hcp" class="${S.scoring === 'hcp' ? 'on' : ''}" aria-checked="${S.scoring === 'hcp'}">Con hándicap</button><button type="button" role="radio" data-sc="gross" class="${S.scoring === 'gross' ? 'on' : ''}" aria-checked="${S.scoring === 'gross'}">Gross</button></div>
        ${S.scoring === 'hcp' ? `<div class="card gm-al"><div class="gm-alr"><span>Porcentaje del hándicap</span><div class="gm-step"><button type="button" data-al="-5" aria-label="Bajar 5%">−</button><input type="text" inputmode="numeric" id="gmal" value="${al()}" aria-label="Porcentaje"><span>%</span><button type="button" data-al="5" aria-label="Subir 5%">+</button></div></div>
          <p class="foot">Por defecto ${MC().DEFAULT_ALLOWANCE[S.modality]}% (${S.modality === 'fourball' ? 'fourball' : 'match individual'}). El más bajo ${S.modality === 'metralleta' ? 'de cada par ' : ''}juega en cero; los demás reciben (su HCP − el más bajo) × ${al()}%, redondeado (0,5 sube a 1). Los golpes van por el S.I. de cada hoyo.</p>
          <p class="foot">${TEES.length ? `Base: hándicap de cancha de cada uno según su salida (WHS: índice × slope/113 + course rating − par, redondeado). Salida inicial: ${e(base.tee_source || '—')}.` : 'Base: el índice (no tenemos slope ni course rating de esta cancha).'}</p>
          ${base?.si_source ? '' : '<p class="foot gm-warn">No tenemos el índice (S.I.) de los hoyos de esta cancha: los golpes se dan del hoyo 1 en adelante.</p>'}
          ${missing ? '<p class="msg err">Con hándicap, todos necesitan su HCP: completalo arriba o jugá gross.</p>' : ''}
          ${E && S.modality === 'metralleta' ? `<div class="gm-mx"><small>Golpes por par</small>${E.pairs.map(pr => { const g = pr.strokes[pr.a] ? pr.a : pr.b, v = pr.strokes[g]; return `<div class="gm-mxr"><span>${e(nm(pr.a))} vs ${e(nm(pr.b))}</span><b class="num">${v ? `${e(nm(g).split(' ')[0])} recibe ${v}` : 'parejos'}</b></div>`; }).join('')}</div>` : ''}</div>` : ''}
        ${S.scoring === 'hcp' && E && S.modality !== 'metralleta' ? gridHtml(def, E, i => { const s0 = nm(i).split(' '); return S.players.find(p => p.id === i)?.me ? 'Vos' : s0.length > 1 ? `${s0[0]} ${s0[1][0]}.` : s0[0]; }, -1) : S.scoring === 'hcp' && E ? gridHtml(def, E, i => S.players.find(p => p.id === i)?.me ? 'Vos' : nm(i).split(' ')[0], -1) : ''}
        ${err ? `<p class="msg err">${e(err)}</p>` : ''}
        <button type="button" class="btn gm-go" id="gmgo"${E ? '' : ' disabled'}>Empezar partido</button>
        <p class="foot">El partido queda en tu cuenta, privado. No cuenta para tus tarjetas ni tu hándicap. No se manda nada al club.</p>`;
      bind();
    };
    const bind = () => {
      el.querySelectorAll('[data-hcp]').forEach(i => i.onchange = () => { const v = i.value.trim().replace(',', '.'); const p = S.players[+i.dataset.hcp]; p.hcp = v === '' ? null : isFinite(+v) && +v >= -10 && +v <= 54 ? Math.round(+v * 10) / 10 : p.hcp; render(); });
      el.querySelectorAll('[data-tee]').forEach(i => i.onchange = () => { S.players[+i.dataset.tee].tee = i.value || null; render(); });
      el.querySelectorAll('[data-gen]').forEach(b => b.onclick = () => { S.players[+b.dataset.gen].gender = b.dataset.g; render(); });
      el.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { S.players.splice(+b.dataset.rm, 1); S.sides = null; render(); });
      const a = live('gmadd'); if (a) a.onclick = () => { addOpen = true; render(); live('gmnn')?.focus(); };
      const a2 = live('gmadd2'); if (a2) a2.onclick = () => { const name = (live('gmnn').value || '').replace(/\s+/g, ' ').trim().slice(0, 60), hv = (live('gmnh').value || '').trim().replace(',', '.');
        if (!name) { live('gmnn').focus(); return; } const id = `n:${MC().normName(name)}`;
        if (S.players.some(p => p.id === id)) { err = `${name} ya está en el partido`; render(); return; }
        if (S.players.length >= 8) { err = 'Máximo 8 jugadores'; render(); return; }
        S.players.push({ id, name, hcp: hv === '' || !isFinite(+hv) ? null : Math.round(+hv * 10) / 10, manual: true, tee: base?.default_tee ?? null, gender: 'C' }); S.sides = null; addOpen = false; err = ''; render(); };
      el.querySelectorAll('[data-mod]').forEach(b => b.onclick = () => { S.modality = b.dataset.mod; S.allowance = null; render(); });
      el.querySelectorAll('[data-sc]').forEach(b => b.onclick = () => { S.scoring = b.dataset.sc; render(); });
      el.querySelectorAll('[data-al]').forEach(b => b.onclick = () => { S.allowance = Math.max(0, Math.min(100, al() + +b.dataset.al)); render(); });
      const ai = live('gmal'); if (ai) ai.onchange = () => { const v = +ai.value.replace(',', '.'); if (isFinite(v) && v >= 0 && v <= 100) S.allowance = Math.round(v * 10) / 10; render(); };
      const dr = live('gmdraw'); if (dr) dr.onclick = () => { draw(); S.drawn = true; render(); };
      el.querySelectorAll('[data-swap]').forEach(b => b.onclick = () => { const id = b.dataset.swap, k = S.sides[0].includes(id) ? 0 : 1, o = 1 - k;
        const sel = S.swapSel; if (sel && sel !== id && S.sides[o].includes(sel)) { S.sides[k][S.sides[k].indexOf(id)] = sel; S.sides[o][S.sides[o].indexOf(sel)] = id; S.swapSel = null; }
        else if (sel === id) S.swapSel = null; else { const j = S.sides[o][0]; S.sides[k][S.sides[k].indexOf(id)] = j; S.sides[o][0] = id; } render(); });
      el.querySelectorAll('[data-opp]').forEach(b => b.onclick = () => { S.opp = b.dataset.opp; render(); });
      const go = live('gmgo'); if (go) go.onclick = async () => { const def = defOf();
        const m = { id: uuid(), date: base?.tee_time?.date || todayAR(), course_label: base?.tee_time?.course_label || null, tee_time_id: tee || null, status: 'open', def, scores: Object.fromEntries(def.players.map(p => [p.id, Array(18).fill(null)])) };
        go.disabled = true; LS.set(CUR, { id: m.id, date: m.date }); await save(m); try { localStorage.removeItem(DK); } catch { /* private */ } location.hash = `#/partido/${m.id}`; };
    };
    render();
  }

  /* ---------- the match: scores hole by hole + live status ---------- */
  async function drawMatch(el, id, opt = {}) {   // t270u: opt.embed → the in-play sheet over the map (opt.hole = live hole, opt.onChange)
    let m = LS.get(MK(id), null);
    if (!pending(id)) { const r = await H.api(`/api/matches/${encodeURIComponent(id)}`).catch(err => { if (!m) throw err; return null; }); if (r) { m = r; LS.set(MK(id), r); } }
    if (!opt.embed && !live('gm')) return; if (opt.embed && !el.isConnected) return; if (!m) throw new Error('Partido no encontrado');
    const def = m.def, ids = def.players.map(p => p.id), nm = i => def.players.find(p => p.id === i)?.name || i, short = i => { const s = nm(i).split(' '); return i === 'me' ? 'Vos' : s.length > 1 ? `${s[0]} ${s[1][0]}.` : s[0]; };
    const order = MC().playOrder(def.start_hole || 1);
    const MK2 = () => { const x = m.scores._m = m.scores._m || {}; x.conc = Array.isArray(x.conc) ? x.conc : Array(18).fill(null); return x; };
    const concOf = h => { const c = m.scores._m?.conc?.[h]; return c === 0 || c === 1 ? c : null; };
    const entered = (i, h) => m.scores[i]?.[h] != null, anyIn = h => ids.some(i => entered(i, h));
    const holeDone = h => concOf(h) != null || ids.every(i => entered(i, h)) || (!!m.scores._m?.done?.[h] && anyIn(h));
    const closeHole = h => { if (h == null || !anyIn(h) || ids.every(i => entered(i, h))) return false; const x = MK2(); x.done = Array.isArray(x.done) ? x.done : Array(18).fill(false); if (x.done[h]) return false; x.done[h] = true; return true; };   // t266u: moving on closes a partial hole
    const firstOpen = () => order.find(h => !holeDone(h)) ?? order[order.length - 1];
    let cur = (() => { const q = opt.embed ? +opt.hole : +qs().get('hoyo'); return q >= 1 && q <= 18 ? q - 1 : firstOpen(); })(), abandonArm = false, finishArm = false;
    const ro = () => m.status !== 'open';
    const render = () => {
      const E = MC().evaluate(def, m.scores), hs = E.hole_strokes, si = def.si[cur];
      const side = k => (E.sides[k] || []).map(short).join(' / ');
      const head = E.main ? (() => { const s = E.main; const lead = s.up > 0 ? side(0) : s.up < 0 ? side(1) : ''; return `<div class="gm-st${s.finished ? ' fin' : ''}"><div class="gm-stv"><span>${e(side(0))}</span><small>vs</small><span>${e(side(1))}</span></div><b class="num">${s.up === 0 ? e(s.text) : `${e(lead)} ${e(s.text)}`}</b><small class="num">${s.played} jugados${s.finished ? '' : ` · quedan ${s.remaining}`}</small></div>`; })()
        : `<div class="gm-st${E.finished ? ' fin' : ''}"><b>${e(E.summary)}</b></div>`;
      const hr = E.main?.holes.find(x => x.hole === cur + 1);
      const holeRes = E.main ? (hr ? `<p class="gm-hr">${hr.w === 'H' ? 'Hoyo empatado' : `Hoyo para ${e(side(hr.w === 'A' ? 0 : 1))}`}${hr.dado ? ' <span class="gm-dt">· hoyo dado</span>' : hr.a != null && hr.b != null ? ` <span class="num">(${hr.a} vs ${hr.b} neto)</span>` : hr.a == null && hr.b == null ? ' · nadie terminó' : ` <span class="num">(${hr.a != null ? `${hr.a} neto` : 'no terminó'} vs ${hr.b != null ? `${hr.b} neto` : 'no terminó'})</span>`}</p>` : '') : '';
      const partHint = !ro() && concOf(cur) == null && anyIn(cur) && !holeDone(cur) ? '<p class="foot gm-pth">Podés seguir sin anotarle a todos: al pasar de hoyo se cierra con los scores cargados.</p>' : '';
      const recvNow = def.scoring === 'hcp' ? ids.filter(i => (hs[i]?.[cur] || 0) > 0) : [];
      const holeStk = def.scoring !== 'hcp' ? '' : `<p class="gm-hk">${recvNow.length ? recvNow.map(i => `<b>${e(short(i))}</b> recibe ${hs[i][cur]} ${hs[i][cur] === 1 ? 'golpe' : 'golpes'}`).join(' · ') + ' en este hoyo' : 'Nadie recibe golpe en este hoyo'}${si ? ` <span class="num">(S.I. ${si})</span>` : ''}${def.modality === 'metralleta' ? ' · contra el más bajo' : ''}</p>`;
      const cc = concOf(cur), concRow = E.main && !ro() ? `<div class="gm-hd2"><span>Hoyo dado</span>${[0, 1].map(k => `<button type="button" data-conc="${k}" class="${cc === k ? 'on' : ''}" aria-pressed="${cc === k}">Gana ${e(side(k))}</button>`).join('')}</div>` : '';
      const strip = `<div class="gm-hs" role="group" aria-label="Hoyo">${order.map(h => { const done = holeDone(h), part = !done && anyIn(h), w = E.main?.holes.find(x => x.hole === h + 1)?.w; return `<button type="button" data-h="${h}" class="num${h === cur ? ' on' : ''}${done ? ' ok' : ''}${part ? ' pt' : ''}${w === 'A' ? ' wa' : w === 'B' ? ' wb' : ''}" aria-label="Hoyo ${h + 1}${done ? ', cargado' : ''}">${h + 1}</button>`; }).join('')}</div>`;
      const rows = ids.map(i => { const v = m.scores[i]?.[cur], st = hs[i]?.[cur] || 0, net = v ? v - st : null;
        return `<div class="gm-pr"><div class="gm-pn"><b>${e(short(i))}</b>${st ? `<span class="gm-pd" aria-label="Recibe ${st} en este hoyo">${'•'.repeat(st)}</span>` : ''}${v != null ? `<small class="num">${v === 0 ? 'no terminó' : st ? `neto ${net}` : ''}</small>` : ''}</div>
          ${ro() ? `<b class="gm-pv num">${v == null ? '–' : v === 0 ? 'X' : v}</b>` : `<div class="gm-pk" role="group" aria-label="Golpes de ${e(nm(i))}">${[3, 4, 5, 6, 7].map(n => `<button type="button" data-p="${e(i)}" data-v="${n}" class="num${v === n ? ' on' : ''}">${n}</button>`).join('')}<button type="button" data-p="${e(i)}" data-v="${v != null && v > 7 ? v + 1 : 8}" class="num${v != null && v > 7 ? ' on' : ''}" aria-label="8 o más">${v != null && v > 7 ? v : '8+'}</button><button type="button" data-p="${e(i)}" data-v="${v === 2 ? 1 : 2}" class="num${v === 2 || v === 1 ? ' on' : ''}" aria-label="2 o 1">${v === 1 ? 1 : 2}</button><button type="button" data-p="${e(i)}" data-v="0" class="gm-pu${v === 0 ? ' on' : ''}" aria-label="No terminó">X</button></div>`}</div>`; }).join('');
      const table = def.modality === 'metralleta' ? `<div class="section"><h2>Tabla</h2></div><div class="card gm-tb"><table class="num"><thead><tr><th></th><th>G</th><th>E</th><th>P</th><th>Hoyos</th></tr></thead><tbody>${E.table.map(t => `<tr><th>${e(short(t.id))}</th><td>${t.won}</td><td>${t.tied}</td><td>${t.lost}</td><td>${t.holes_up > 0 ? '+' : ''}${t.holes_up}</td></tr>`).join('')}</tbody></table>
        <div class="gm-prs">${E.pairs.map(pr => { const s = pr.state, l = s.up > 0 ? short(pr.a) : s.up < 0 ? short(pr.b) : ''; return `<div class="gm-prr"><span>${e(short(pr.a))} vs ${e(short(pr.b))}</span><b class="num">${s.up === 0 ? e(s.text) : `${e(l)} ${e(s.text)}`}</b></div>`; }).join('')}</div></div>` : '';
      const pr = (() => { try { const v = JSON.parse(localStorage.getItem('golflet.prac') || 'null'); return v && v.date === todayAR() ? v : null; } catch { return null; } })();
      const holeCard = `<div class="card gm-hole"><div class="gm-hh"><b class="num">Hoyo ${cur + 1}</b>${si ? `<span class="num">S.I. ${si}</span>` : ''}${def.pars?.[cur] ? `<span class="num">Par ${def.pars[cur]}</span>` : ''}${ro() ? '<span class="gm-ro">Terminado · solo lectura</span>' : ''}</div>${holeStk}${rows}${concRow}${holeRes}${partHint}${ro() ? '' : `<p class="foot gm-lg">No hace falta anotarle a todos · X = no terminó (no suma golpes${def.modality === 'fourball' ? '; cuenta la bola del compañero' : ''})</p>`}
          ${ro() ? '' : `<div class="gm-nav">${order.indexOf(cur) > 0 ? `<button type="button" class="btn ghost sm" data-h="${order[order.indexOf(cur) - 1]}">‹ Hoyo ${order[order.indexOf(cur) - 1] + 1}</button>` : '<span></span>'}${order.indexOf(cur) < 17 ? `<button type="button" class="btn sm" data-h="${order[order.indexOf(cur) + 1]}">Hoyo ${order[order.indexOf(cur) + 1] + 1} ›</button>` : ''}</div>`}</div>`;
      if (opt.embed) el.innerHTML = `<div class="gm-shh" data-drag="1"><span class="gm-grab" aria-hidden="true"></span><div><b>${MOD[def.modality]}</b><small>${def.scoring === 'hcp' ? `Con hándicap al ${String(def.allowance).replace('.', ',')}%` : 'Gross'} · No cuenta para tus tarjetas${pending(id) ? ' · sin subir' : ''}</small></div><button type="button" class="gm-shx" data-close="1" aria-label="Cerrar el partido y volver al mapa">✕</button></div>
        <div class="gm-shb">${head}${holeCard}${table}${gridHtml(def, E, short, cur)}${def.scoring === 'hcp' ? `<p class="foot gm-sk">${def.players.map(p => `${e(short(p.id))}: ${phTxt(def, p)}`).join(' · ')}</p>` : ''}<a class="gm-shf" href="#/partido/${e(id)}?hoyo=${cur + 1}">Ver el partido completo ›</a></div>`;
      else el.innerHTML = `<div class="gm-hd"><h1>${MOD[def.modality]}</h1><p class="foot">${def.scoring === 'hcp' ? `Con hándicap al ${String(def.allowance).replace('.', ',')}%` : 'Gross'}${m.course_label ? ` · ${e(m.course_label)}` : ''}${pending(id) ? ' · sin subir (se sube sola)' : ''}</p><p class="gm-nc">No cuenta para tus tarjetas</p></div>
        ${head}
        ${strip}
        ${holeCard}
        ${table}
        ${gridHtml(def, E, short, cur)}
        ${def.scoring === 'hcp' ? `<p class="foot gm-sk">${def.players.map(p => `${e(short(p.id))}: ${phTxt(def, p)}`).join(' · ')}</p>` : ''}
        ${pr ? `<a class="btn ghost sm gm-map" href="#/plan/${e(pr.id)}/hoyo/${cur + 1}">Volver al mapa del hoyo ${cur + 1}</a>` : ''}
        ${ro() ? '<a class="btn ghost" href="#/partidos">Ver historial</a>' : `<div class="gm-end"><button type="button" class="btn ${E.finished ? '' : 'ghost'} sm" id="gmfin">${finishArm ? '¿Terminar? Tocá de nuevo' : E.finished ? 'Guardar resultado' : 'Terminar acá'}</button><button type="button" class="btn ghost sm gm-ab" id="gmab">${abandonArm ? '¿Abandonar? Tocá de nuevo' : 'Abandonar'}</button></div>`}`;
      el.querySelectorAll('[data-h]').forEach(b => b.onclick = () => { if (!ro() && +b.dataset.h !== cur && closeHole(cur)) { m.result = MC().evaluate(def, m.scores); save(m); opt.onChange?.(m); } cur = +b.dataset.h; abandonArm = finishArm = false; render(); });
      el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { const i = b.dataset.p, v = +b.dataset.v; m.scores[i] = m.scores[i] || Array(18).fill(null); m.scores[i][cur] = m.scores[i][cur] === v && v !== 0 && v <= 7 ? null : v; order.slice(0, order.indexOf(cur)).forEach(h => closeHole(h));   // t270u: scoring a later hole closes earlier partial ones
        const E2 = MC().evaluate(def, m.scores); m.result = E2; save(m); render(); opt.onChange?.(m); });
      el.querySelectorAll('[data-conc]').forEach(b => b.onclick = () => { const k = +b.dataset.conc, x = MK2(); x.conc[cur] = x.conc[cur] === k ? null : k; m.result = MC().evaluate(def, m.scores); save(m); render(); opt.onChange?.(m); });
      el.querySelectorAll('[data-close]').forEach(b => b.onclick = () => opt.onClose?.());   // t270u: closing the sheet does NOT close a partial hole (partners may still be putting)
      const fb = live('gmfin'); if (fb) fb.onclick = async () => { if (closeHole(cur)) m.result = MC().evaluate(def, m.scores); if (!finishArm && !MC().evaluate(def, m.scores).finished) { finishArm = true; render(); return; } m.status = 'done'; await save(m, true); const c = LS.get(CUR, null); if (c?.id === id) localStorage.removeItem(CUR); render(); H.toast('Partido guardado'); };
      const ab = live('gmab'); if (ab) ab.onclick = async () => { if (!abandonArm) { abandonArm = true; render(); return; }
        const Q = LS.get(QK, {}); delete Q[id]; LS.set(QK, Q); try { await H.api(`/api/matches/${id}`, { method: 'DELETE' }); } catch { /* never saved */ } localStorage.removeItem(MK(id)); const c = LS.get(CUR, null); if (c?.id === id) localStorage.removeItem(CUR); location.hash = '#/partidos'; };
    };
    render();
  }

  /* ---------- history (t264u redesign): hero record, rivals, partners, pairs, matches with result badges. Every card opens its detail. ---------- */
  const ICON = { fourball: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="8" r="2.6"/><circle cx="11" cy="8" r="2.6"/><circle cx="14" cy="16" r="2.6" class="o"/><circle cx="19" cy="16" r="2.6" class="o"/></svg>',
    single: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="7" cy="9" r="3"/><circle cx="17" cy="15" r="3" class="o"/></svg>',
    metralleta: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="7" r="2.4"/><circle cx="18" cy="7" r="2.4" class="o"/><circle cx="6" cy="17" r="2.4" class="o"/><circle cx="18" cy="17" r="2.4" class="o"/><path d="M8 7h8M6 9v6M18 9v6M8 17h8M8 9l8 6M16 9l-8 6" class="l"/></svg>' };
  const RESL = { G: 'Ganado', E: 'Empatado', P: 'Perdido' };
  const ini = n => { const w = String(n || '?').replace(/^Vos$/, 'Vos').split(/\s+/).filter(Boolean); return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] || '?').slice(0, 2)).toUpperCase(); };
  const sum = (...rs) => rs.reduce((a, r) => ({ w: a.w + r.w, t: a.t + r.t, l: a.l + r.l, holes: a.holes + r.holes, n: a.n + r.n, form: [...a.form, ...(r.form || [])].slice(-8) }), { w: 0, t: 0, l: 0, holes: 0, n: 0, form: [] });
  const dots = (f, big) => f && f.length ? `<span class="gh-form${big ? ' big' : ''}" aria-label="Últimos: ${f.map(x => RESL[x]).join(', ')}">${f.map(x => `<i class="${x}">${x}</i>`).join('')}</span>` : '';
  const score = r => `<span class="gh-sc num" aria-label="${r.w} ganados, ${r.t} empatados, ${r.l} perdidos"><b class="G">${r.w}</b><span>–</span><b class="E">${r.t}</b><span>–</span><b class="P">${r.l}</b></span>`;
  const holesTxt = r => r.n ? `<span class="gh-hu num ${r.holes > 0 ? 'G' : r.holes < 0 ? 'P' : ''}">${r.holes > 0 ? '+' : ''}${r.holes} hoyos</span>` : '';
  const ddmm = d => d ? d.split('-').reverse().slice(0, 2).join('/') : '';
  async function drawHistory(el) {
    const d = await H.api('/api/matches'); if (!live('gm')) return;
    const Hs = d.history, N = Hs.names, nm = i => i === 'me' ? 'Vos' : (N[i] || d.matches.flatMap(x => x.players).find(p => p.id === i)?.name || i.replace(/^[a-z]:/, ''));
    const Q = qs(), focus = Q.get('p'), fm = Q.get('m');
    const open = d.matches.filter(x => x.status === 'open'), done = d.matches.filter(x => x.status === 'done');
    const ov = Hs.overall || sum(), pct = ov.n ? Math.round((ov.w + ov.t / 2) / ov.n * 100) : 0;
    const ring = (p, lbl) => `<svg class="gh-ring" viewBox="0 0 44 44" role="img" aria-label="${lbl}"><circle cx="22" cy="22" r="18" class="bg"/><circle cx="22" cy="22" r="18" class="fg" stroke-dasharray="${(p / 100 * 113.1).toFixed(1)} 113.1" transform="rotate(-90 22 22)"/><text x="22" y="26" text-anchor="middle">${p}%</text></svg>`;
    const mcard = x => { const o = x.mine || {}, cls = o.res || (x.status === 'open' ? 'O' : 'E');
      const who = x.modality === 'fourball' && x.sides ? x.sides.map(s => s.map(nm).map(n => e(n.split(' ')[0])).join(' / ')).join(' <small>vs</small> ') : x.players.map(p => e(nm(p.id).split(' ')[0])).join(x.modality === 'single' ? ' <small>vs</small> ' : ', ');
      return `<a class="gh-m" href="#/partido/${e(x.id)}"><span class="gh-ic ${e(x.modality)}">${ICON[x.modality] || ''}</span><span class="gh-mb"><b>${who}</b><small>${MOD[x.modality] || ''} · ${ddmm(x.date)}${x.course_label ? ` · ${e(x.course_label.split(' · ').slice(-1)[0])}` : ''}</small></span>
        <span class="gh-bd ${cls}"><b class="num">${e(x.status === 'open' ? 'En curso' : o.text || x.summary || '')}</b>${o.res ? `<small>${RESL[o.res]}</small>` : ''}</span></a>`; };
    const rivals = Hs.h2h.filter(h => h.a === 'me');
    const others = Hs.h2h.filter(h => h.a !== 'me');
    let html;
    if (focus) {
      const h = Hs.h2h.find(x => (x.a === 'me' && x.b === focus)), r = h ? sum(h.individual, h.fourball_opp) : sum(), pt = Hs.partners.find(x => x.partner === focus);
      const list = done.concat(open).filter(x => x.players.some(p => p.id === focus));
      html = `<div class="gm-hd"><h1>${e(nm(focus))}</h1><p class="foot"><a href="#/partidos">‹ Todos los partidos</a></p></div>
        <div class="gh-hero"><div class="gh-vs"><span class="gh-av me">VOS</span><span class="gh-x">vs</span><span class="gh-av">${e(ini(nm(focus)))}</span></div>
          <div class="gh-hr">${score(r)}<small>${r.n ? `${r.n} ${r.n === 1 ? 'partido' : 'partidos'} en contra · ${holesTxt(r)}` : 'Todavía no jugaron en contra'}</small>${dots(r.form, true)}</div></div>
        ${h ? `<div class="gh-split">${[['Mano a mano', h.individual], ['Fourball, rivales', h.fourball_opp], ['Fourball, compañeros', h.fourball_partner]].map(([l, x]) => `<div class="gh-sp"><small>${l}</small>${x.n ? score(x) : '<b class="num">–</b>'}${holesTxt(x)}</div>`).join('')}</div>` : ''}
        ${pt ? `<p class="foot">Juntos: ${pt.rec.w}-${pt.rec.t}-${pt.rec.l} (${pt.rec.n ? Math.round(pt.rec.w / pt.rec.n * 100) : 0}% ganados)</p>` : ''}
        <div class="section"><h2>Partidos con ${e(nm(focus).split(' ')[0])}</h2></div><div class="gh-ml">${list.map(mcard).join('') || '<p class="foot">Sin partidos.</p>'}</div>`;
    } else {
      const mods = ['fourball', 'single', 'metralleta'].filter(m => Hs.by_modality?.[m]?.n);
      const list = (fm ? done.filter(x => x.modality === fm) : done);
      html = `<div class="gm-hd"><h1>Partidos</h1><p class="foot">Solo vos ves esto</p><span class="gm-nc">No cuenta para tus tarjetas</span></div>
        <a class="gh-hero" href="#/partidos${fm ? '' : '?m=' + (mods[0] || 'fourball')}" aria-label="Tu récord">${ring(pct, `${pct}% de puntos ganados`)}
          <div class="gh-hr"><small>Tu récord · ${ov.n} ${ov.n === 1 ? 'match' : 'matches'}</small>${score(ov)}<small>${holesTxt(ov) || 'Sin partidos terminados'}</small>${dots(ov.form, true)}</div></a>
        ${mods.length ? `<div class="gh-chips">${mods.map(m => { const r = Hs.by_modality[m]; return `<a class="gh-chip${fm === m ? ' on' : ''}" href="#/partidos${fm === m ? '' : `?m=${m}`}"><span class="gh-ic ${m}">${ICON[m]}</span><span><b>${MOD[m]}</b><small class="num">${r.w}-${r.t}-${r.l}</small></span></a>`; }).join('')}</div>` : ''}
        ${open.length ? `<div class="section"><h2>En curso</h2></div><div class="gh-ml">${open.map(mcard).join('')}</div>` : ''}
        ${rivals.length ? `<div class="section"><h2>Rivales</h2><span class="foot">G–E–P</span></div><div class="gh-cards">${rivals.map(h => { const r = sum(h.individual, h.fourball_opp), any = r.n ? r : h.fourball_partner;
          return `<a class="gh-card" href="#/partidos?p=${encodeURIComponent(h.b)}"><span class="gh-av">${e(ini(nm(h.b)))}</span><span class="gh-cb"><b>${e(nm(h.b))}</b>${r.n ? `<span class="gh-cl">${score(r)}${holesTxt(r)}</span>${dots(r.form)}` : `<small>Solo compañeros · ${any.w}-${any.t}-${any.l}</small>`}${h.last ? `<small class="gh-last">Último: ${e(h.last.text)} · ${ddmm(h.last.date)}</small>` : ''}</span><span class="gh-chev" aria-hidden="true">›</span></a>`; }).join('')}</div>` : ''}
        ${Hs.partners.length ? `<div class="section"><h2>Compañeros</h2><span class="foot">química en fourball</span></div><div class="gh-cards two">${Hs.partners.map(p => { const r = p.rec, w = r.n ? Math.round(r.w / r.n * 100) : 0;
          return `<a class="gh-pc" href="#/partidos?p=${encodeURIComponent(p.partner)}"><span class="gh-avs"><span class="gh-av me sm">VOS</span><span class="gh-av sm">${e(ini(nm(p.partner)))}</span></span><b>${e(nm(p.partner).split(' ').slice(0, 2).join(' '))}</b>${score(r)}<span class="gh-bar" aria-label="${w}% ganados juntos"><i style="width:${w}%"></i></span><small class="num">${w}% ganados · ${r.holes > 0 ? '+' : ''}${r.holes} hoyos</small></a>`; }).join('')}</div>` : ''}
        ${Hs.pairs.length ? `<div class="section"><h2>Parejas</h2></div><div class="gh-ml">${Hs.pairs.map(p => `<a class="gh-pv" href="#/partidos?p=${encodeURIComponent(p.vs[0])}"><span class="gh-pp">${p.pair.map(nm).map(n => `<b>${e(n.split(' ')[0])}</b>`).join('')}</span>${score(p.rec)}<span class="gh-pp r">${p.vs.map(nm).map(n => `<b>${e(n.split(' ')[0])}</b>`).join('')}</span></a>`).join('')}</div>` : ''}
        <div class="section"><h2>${fm ? MOD[fm] : 'Todos los partidos'}</h2>${fm ? '<a class="link" href="#/partidos">ver todos</a>' : ''}</div><div class="gh-ml">${list.map(mcard).join('') || '<p class="foot">Todavía no hay partidos terminados. Armá uno desde «Jugás con» en una reserva.</p>'}</div>
        ${others.length ? `<div class="section"><h2>Entre los demás</h2></div><div class="list gm-hl">${others.map(h => { const r = sum(h.individual, h.fourball_opp); return `<a class="row" href="#/partidos?p=${encodeURIComponent(h.a)}"><div class="body"><div class="t">${e(nm(h.a))} vs ${e(nm(h.b))}</div>${h.last ? `<div class="s">Último: ${e(h.last.text)}</div>` : ''}</div>${r.n ? score(r) : `<small>compañeros ${h.fourball_partner.w}-${h.fourball_partner.t}-${h.fourball_partner.l}</small>`}</a>`; }).join('')}</div>` : ''}`;
    }
    el.innerHTML = html;
  }

  /* t270u: the in-play match button + sheet (over the live map; not a modal, browser back closes it). */
  function statusShort(id) {
    const m = LS.get(MK(id), null); if (!m?.def) return null;
    try { const E = MC().evaluate(m.def, m.scores || {}); const meS = E.main ? (E.sides[0]?.includes('me') ? 1 : E.sides[1]?.includes('me') ? -1 : 0) : 0;
      if (E.main) { const s = E.main, u = s.up * (meS || 1); if (s.finished) return { t: s.up === 0 ? 'Emp.' : s.text, k: u > 0 ? 'G' : u < 0 ? 'P' : 'E', aria: E.summary };
        return { t: s.up === 0 ? 'AS' : `${u > 0 ? '+' : '−'}${Math.abs(s.up)}`, k: u > 0 ? 'G' : u < 0 ? 'P' : 'E', aria: `${E.summary}${s.dormie ? ' · dormie' : ''} · quedan ${s.remaining}` }; }
      const r = E.table.find(x => x.id === 'me'); return r ? { t: `${r.won}-${r.lost}`, k: r.won > r.lost ? 'G' : r.won < r.lost ? 'P' : 'E', aria: `Metralleta: ${r.won} ganados, ${r.lost} perdidos` } : { t: '', k: 'E', aria: E.summary };
    } catch { return null; }
  }
  let SHEET = null;
  function closeSheet(fromPop) { if (!SHEET) return; const s = SHEET; SHEET = null; s.el.remove(); document.documentElement.classList.remove('gm-sheet-open'); if (!fromPop && history.state && history.state.gmsheet) history.back(); s.onClose?.(); }
  addEventListener('popstate', () => { if (SHEET && !(history.state && history.state.gmsheet)) closeSheet(true); });
  addEventListener('hashchange', () => { if (SHEET) { const s = SHEET; SHEET = null; s.el.remove(); document.documentElement.classList.remove('gm-sheet-open'); s.onClose?.(); } });
  function openSheet(id, hole, o = {}) {
    if (SHEET) closeSheet(true);
    const el = document.createElement('section'); el.className = 'gm-sheet'; el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Partido en curso');
    document.body.appendChild(el); document.documentElement.classList.add('gm-sheet-open');
    SHEET = { el, onClose: o.onClose }; history.pushState({ ...(history.state || {}), gmsheet: 1 }, '', location.href);
    el.innerHTML = spin;
    drawMatch(el, id, { embed: true, hole, onChange: o.onChange, onClose: () => closeSheet(false) }).catch(err => { el.innerHTML = `<div class="gm-shh"><div><b>Partido</b></div><button type="button" class="gm-shx" data-close="1" aria-label="Cerrar">✕</button></div><div class="msg err">${e(err?.message || 'No se pudo cargar')}</div>`; el.querySelector('[data-close]').onclick = () => closeSheet(false); });
    // swipe down on the header closes
    let y0 = null; el.addEventListener('touchstart', ev => { y0 = ev.target.closest?.('[data-drag]') ? ev.touches[0].clientY : null; }, { passive: true });
    el.addEventListener('touchmove', ev => { if (y0 == null) return; const dy = ev.touches[0].clientY - y0; el.style.transform = dy > 0 ? `translateY(${dy}px)` : ''; }, { passive: true });
    el.addEventListener('touchend', ev => { if (y0 == null) return; const dy = (ev.changedTouches[0]?.clientY ?? y0) - y0; y0 = null; el.style.transform = ''; if (dy > 90) closeSheet(false); });
  }
  window.GolfletMatch = { init: h => { H = h; flush(); }, page, load, label, parent, statusShort, openSheet, closeSheet: () => closeSheet(false), sheetOpen: () => !!SHEET, current: () => { const c = LS.get(CUR, null); return c && c.date === todayAR() ? c.id : null; } };
})();
