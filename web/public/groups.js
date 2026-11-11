/* Golflet · Amigos (comparison groups). Every view is its own routed page; filters live in the query string. No italics.
   Routes: #/amigos · #/amigos/nuevo · #/grupo/:id[?range=&year=&course=&members=] · #/grupo/:id/m/:metric · #/grupo/:id/hoyos?course= ·
           #/grupo/:id/hoyo/:n?course= · #/grupo/:id/miembros · #/grupo/:id/vs/:a/:b · #/grupo/:id/vista (my own view) ·
           #/grupo/:id/ajustes (admins: name, photo, invite link) · #/unirse/:token (share-link invite) · #/compartir (Qué comparto) ·
           t163u: #/grupo/:id/comparativo/semana|mes[?off=N] · #/grupo/:id/comparativo/semana|mes/:stat[?off=N] · #/grupo/:id/jugador/:memberId · #/grupo/:id/jugador/:memberId/ronda/:roundId */
(function () {
  let H = null;   // helpers from app.js: { api, esc, f1, view, toast }
  const MET = [
    ['rounds', 'Rondas', 'n', false], ['avg_gross', 'Promedio gross', 'f', true], ['best_gross', 'Mejor gross', 'i', true],
    ['avg_net', 'Promedio neto', 'f', true], ['best_net', 'Mejor neto', 'i', true], ['handicap', 'Hándicap', 'h', true],
    ['eagles', 'Águilas', 't', false], ['aces', 'Hoyos en uno', 't', false], ['birdies', 'Birdies', 't', false], ['max_birdies', 'Máximo de birdies', 't', false], ['pars', 'Pares', 't', false], ['bogeys', 'Bogeys', 't', true], ['doubles', 'Doble bogey o peor', 't', true],
    ['par3', 'Promedio en par 3', 'p', true], ['par4', 'Promedio en par 4', 'p', true], ['par5', 'Promedio en par 5', 'p', true],
    ['putts', 'Putts por ronda', 'u', true], ['gir', 'Greens en regulación', 'g', false], ['fir', 'Fairways', 'r', false],
  ];
  const MT = Object.fromEntries(MET.map(m => [m[0], m]));
  const SECTIONS = [['table', 'Tabla'], ['trend', 'Evolución'], ['holes', 'Hoyo por hoyo'], ['vs', 'Mano a mano'], ['clubs', 'Distancias por palo']];
  const RANGES = [['1w', 'Sem', 'Semana'], ['1m', 'Mes', 'Mes'], ['3q', 'Trim', 'Trimestre'], ['6s', '6m', 'Semestre'], ['12y', 'Año', 'Año'], ['all', 'Todo', 'Histórico']];
  const placesOf = rows => { const out = []; rows.forEach((x, i) => out.push(i && x.v === rows[i - 1].v ? out[i - 1] : i + 1)); return out; };
  const MIN_FALLBACK = { '1w': 1, '1m': 2, '3q': 3, '6s': 4, '12y': 4, all: 3 };
  /* which "Qué comparto" category hides each metric */
  const CAT = k => { const t = MT[k][2]; return t === 't' ? 'score_types' : t === 'p' ? 'holes' : t === 'u' ? 'putting' : t === 'g' || t === 'r' ? 'gir_fir' : t === 'h' ? 'handicap' : 'scores'; };
  const hid = (m, k) => (m.hidden || []).includes(CAT(k));
  const NS = '<span class="gg-ns">No compartido</span>';
  const photo = (g, cls = 'gg-av') => g.photo_url ? `<img class="${cls} gg-img" src="${H.esc(g.photo_url)}" alt="">` : `<div class="${cls}">${H.esc((g.name || '?').slice(0, 1).toUpperCase())}</div>`;
  const val = (m, k) => { const t = MT[k][2]; if (t === 'h') return m.handicap_index ?? null;
    if (t === 't') return m.types?.[k]?.total ?? null; if (t === 'p') return m.par?.[k]?.avg ?? null;
    if (t === 'u') return m.putting?.avg_putts ?? null; if (t === 'g') return m.putting?.avg_gir ?? null; if (t === 'r') return m.putting?.avg_fir ?? null; return m[k] ?? null; };
  const per = (m, k) => MT[k][2] === 't' ? m.types?.[k]?.per_round ?? null : null;
  const fmt = (k, v) => v == null ? '—' : ['n', 'i', 't'].includes(MT[k][2]) ? String(v) : H.f1(v);
  const qsOf = h => new URLSearchParams((h.split('?')[1]) || '');
  const keepQs = (qs, extra = {}) => { const o = new URLSearchParams(); for (const k of ['range', 'year', 'course', 'members']) if (qs.get(k)) o.set(k, qs.get(k)); for (const [k, v] of Object.entries(extra)) v == null || v === '' ? o.delete(k) : o.set(k, v); const s = o.toString(); return s ? '?' + s : ''; };
  const dot = c => `<i class="gg-dot" style="background:${c}"></i>`;
  const leaders = (ms, k) => { const vs = ms.map(m => val(m, k)).filter(v => v != null); if (ms.length < 2 || !vs.length) return []; const lowBest = MT[k][3]; const b = lowBest ? Math.min(...vs) : Math.max(...vs); return b === 0 && !lowBest ? [] : ms.filter(m => val(m, k) === b).map(m => m.member_id); };
  const spin = '<div class="gg-load"><img class="cad sm" src="/brand/caddie.png" alt=""><span class="spin"></span></div>';
  const bar = (label, overline = 'Amigos') => `<div class="bar"><span class="overline">${H.esc(overline)}</span></div><div class="stitle">${H.esc(label)}</div>`;

  /* ---------- pages (html first, data loads into #gg) ---------- */
  const norm = p => p.map(x => String(x ?? '').split('?')[0]);
  function page(p, hash) {
    p = norm(p);
    if (p[0] === 'unirse') return `<div id="gg" data-token="${H.esc(p[1] || '')}">${spin}</div>`;
    if (p[0] === 'compartir') return bar('Qué comparto', 'Tu cuenta') + `<p class="gg-lede">Elegí qué ven de vos los jugadores de tus grupos: si pueden abrir tu perfil, qué números entran en la tabla y el comparativo, y si ven tus tarjetas. Vale para todos tus grupos; en cada grupo podés cambiarlo desde “Personalizar”.</p><div id="gg">${spin}</div>`;
    if (p[0] === 'amigos' && p[1] === 'nuevo') return bar('Nuevo grupo') + `<p class="gg-lede">Ponele nombre y, si querés, una foto. Después compartís el link por WhatsApp o invitás por matrícula. Nadie ve nada hasta que cada uno acepta.</p>
      <form class="card gg-form ng-form" id="ggnew" novalidate>
        <div class="ng-top"><label class="ng-photo" for="ngph" aria-label="Elegir foto del grupo (opcional)"><span class="ng-ph-img" id="ngprev"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.2-1.6c.3-.4.8-.6 1.3-.6h2.8c.5 0 1 .2 1.3.6L15.9 6h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12.4" r="3.3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></span><span class="ng-ph-l" id="ngphl">Agregar foto</span><input id="ngph" name="photo" type="file" accept="image/*" class="sr"></label>
          <label class="ng-name">Nombre del grupo<input name="name" maxlength="40" required placeholder="Los del sábado" autocomplete="off"></label></div>
        <div class="ng-field"><label for="ngmi">Invitar por matrícula <small>(opcional)</small></label>
          <div class="ng-chips" id="ngchips"><input id="ngmi" inputmode="numeric" autocomplete="off" enterkeyhint="done" placeholder="Escribí una matrícula" aria-describedby="nghelp"><button type="button" class="ng-add" id="ngadd" disabled>Agregar</button></div>
          <p class="foot" id="nghelp">Se agrega sola cuando dejás de escribir, o tocá Agregar (en la compu también con espacio, coma o Enter). Si alguien todavía no usa Golflet, le aparece la invitación cuando entre por primera vez.</p></div>
        <div id="ggmsg"></div>
        <button class="btn" type="submit">Crear grupo</button></form>`;
    if (p[0] === 'amigos') return bar('Amigos') + `<p class="gg-lede">Compará tus números con amigos en grupos. Solo se comparten promedios y conteos; nunca audios, notas ni estrategia.</p><div id="gg">${spin}</div>`;
    return `<div id="gg">${spin}</div>`;
  }
  async function load(p, hash) {
    p = norm(p);
    const el = document.getElementById('gg'), f = document.getElementById('ggnew');
    if (f) return bindNew(f);
    if (!el) return;
    try {
      if (p[0] === 'amigos') return drawList(el, await H.api('/api/groups'));
      if (p[0] === 'unirse') return drawJoin(el, p[1]);
      if (p[0] === 'compartir') return drawSharing(el, await H.api('/api/me/sharing'));
      const id = p[1], qs = qsOf(hash);
      if (p[2] === 'comparativo') { const kind = p[3] === 'mes' ? 'mes' : 'semana', off = Math.max(0, parseInt(qs.get('off') || '0', 10) || 0);
        const d = await H.api(`/api/groups/${id}/period?kind=${kind}&off=${off}`); return p[4] ? drawPStat(el, id, d, kind, p[4]) : drawPeriod(el, id, d, kind); }
      if (p[2] === 'jugador') { const mid = encodeURIComponent(p[3] || '');
        if (p[4] === 'ronda') return drawCard(el, id, await H.api(`/api/groups/${id}/members/${mid}/rounds/${encodeURIComponent(p[5] || '')}`));
        return drawProfile(el, id, await H.api(`/api/groups/${id}/members/${mid}/profile`)); }
      if (p[2] === 'miembros') return drawMembers(el, id, await H.api(`/api/groups/${id}`));
      if (p[2] === 'vista') { const [g, v, sh] = await Promise.all([H.api(`/api/groups/${id}?range=all&course=all`), H.api(`/api/groups/${id}/view`), H.api('/api/me/sharing')]); return drawView(el, id, g, v, sh); }
      if (p[2] === 'ajustes') return drawSettings(el, id, await H.api(`/api/groups/${id}`), qs);
      if (p[2] === 'hoyos' || p[2] === 'hoyo') {
        const c = qs.get('course'); if (!c) { el.innerHTML = '<p class="msg">Elegí una cancha.</p>'; return; }
        const d = await H.api(`/api/groups/${id}/holes${keepQs(qs)}`);
        return p[2] === 'hoyos' ? drawHeat(el, id, d, qs) : drawHole(el, id, d, +(p[3] || 1).toString().split('?')[0], qs);
      }
      if (p[2] === 'vs') { qs.set('members', [p[3], (p[4] || '').split('?')[0]].join(',')); }
      const d = await H.api(`/api/groups/${id}${keepQs(qs)}`);
      if (p[2] === 'm') return drawMetric(el, id, d, (p[3] || '').split('?')[0], qs);
      return drawGroup(el, id, d, qs, p[2] === 'vs');
    } catch (e) { el.innerHTML = `<div class="msg err">${H.esc(e.message)}</div>`; }
  }

  function bindNew(f) {
    const box = document.getElementById('ngchips'), inp = document.getElementById('ngmi'), chips = [];   // {matricula, status, name}
    const addBtn = document.getElementById('ngadd');   // t151u: numeric keyboards (iPhone) have no space/comma/Enter → explicit Agregar
    const ph = document.getElementById('ngph'), prev = document.getElementById('ngprev'), phl = document.getElementById('ngphl');
    let cropped = null;
    ph.onchange = async () => { const file = ph.files?.[0]; ph.value = ''; if (!file) return;
      try { const blob = await window.GolfletCrop.open(file); if (!blob) return; cropped = new File([blob], 'foto.jpg', { type: 'image/jpeg' });
        prev.innerHTML = `<img src="${URL.createObjectURL(blob)}" alt="">`; prev.classList.add('has'); phl.textContent = 'Cambiar foto'; }
      catch (e) { H.toast(e.message); } };
    const draw = () => {
      box.querySelectorAll('.ng-chip').forEach(c => c.remove());
      chips.forEach((c, i) => { const el = document.createElement('span'); el.className = 'ng-chip ' + c.status;
        el.innerHTML = `<span class="ng-cn">${c.status === 'user' ? `<b>${H.esc(c.name || 'Jugador')}</b><small class="num">${H.esc(c.matricula)}</small>` : c.status === 'loading' ? `<b class="num">${H.esc(c.matricula)}</b><small>Buscando…</small>` : `<b class="num">${H.esc(c.matricula)}</b><small>Todavía no usa Golflet</small>`}</span><button type="button" aria-label="Quitar ${H.esc(c.matricula)}" data-i="${i}">×</button>`;
        box.insertBefore(el, inp); });
      box.querySelectorAll('.ng-chip button').forEach(b => b.onclick = () => { chips.splice(+b.dataset.i, 1); draw(); inp.focus(); });
      inp.placeholder = chips.length ? '' : 'Escribí una matrícula'; addBtn.disabled = !inp.value.trim();
    };
    const msg = t => { const m = document.getElementById('ggmsg'); m.innerHTML = t ? `<div class="msg err">${H.esc(t)}</div>` : ''; };
    const add = async raw => {
      const vals = raw.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean); if (!vals.length) return;
      const errs = [], fresh = [];
      for (const v of vals) {
        if (!/^\d{3,9}$/.test(v)) { errs.push(`“${v}” no es una matrícula (solo números)`); continue; }
        if (chips.some(c => c.matricula === v) || fresh.includes(v)) { errs.push(`${v} ya está en la lista`); continue; }
        if (chips.length + fresh.length >= 11) { errs.push('Un grupo puede tener hasta 12 jugadores'); break; }
        fresh.push(v);
      }
      fresh.forEach(v => chips.push({ matricula: v, status: 'loading', name: null })); draw(); msg(errs[0] || '');
      if (!fresh.length) return;
      try { const { results } = await H.api('/api/groups/lookup', { method: 'POST', body: JSON.stringify({ matriculas: fresh }) });
        for (const r of results) { const i = chips.findIndex(c => c.matricula === r.matricula); if (i < 0) continue;
          if (r.status === 'self') { chips.splice(i, 1); msg('Esa es tu matrícula.'); } else if (r.status === 'invalid') { chips.splice(i, 1); } else chips[i] = r; }
      } catch (e) { chips.forEach(c => { if (c.status === 'loading') c.status = 'unknown'; }); if (e.status === 429) msg(e.message); }
      draw();
    };
    inp.addEventListener('keydown', e => {
      if ([' ', ',', 'Enter', ';'].includes(e.key)) { e.preventDefault(); const v = inp.value; inp.value = ''; add(v); }
      else if (e.key === 'Backspace' && !inp.value && chips.length) { chips.pop(); draw(); }
    });
    inp.addEventListener('input', () => { if (/[\s,;]/.test(inp.value)) { const v = inp.value; inp.value = ''; add(v); } });   // mobile keyboards, paste
    // t152u: auto-commit after 2 s idle, only if the number resolves (real player, or a valid matrícula to invite); otherwise a subtle hint
    let idleT = null; const hint = t => { let h = document.getElementById('nghint'); if (!h) { h = document.createElement('p'); h.id = 'nghint'; h.className = 'ng-hint'; h.setAttribute('aria-live', 'polite'); box.after(h); } h.textContent = t || ''; };
    const autoCommit = async () => { const v = inp.value.trim(); if (!v) return;
      if (!/^\d{3,9}$/.test(v)) { hint('No encontramos esa matrícula'); return; }
      if (chips.some(c => c.matricula === v)) { inp.value = ''; addBtn.disabled = true; hint(''); return; }
      let st = 'unknown'; try { const { results } = await H.api('/api/groups/lookup', { method: 'POST', body: JSON.stringify({ matriculas: [v] }) }); st = results?.[0]?.status || 'unknown'; } catch (e) {}
      if (inp.value.trim() !== v) return;   // kept typing meanwhile
      if (st === 'invalid' || st === 'self') { hint(st === 'self' ? 'Esa es tu matrícula.' : 'No encontramos esa matrícula'); return; }
      inp.value = ''; addBtn.disabled = true; hint(''); add(v); };
    inp.addEventListener('input', () => { addBtn.disabled = !inp.value.trim(); hint(''); clearTimeout(idleT); if (inp.value.trim()) idleT = setTimeout(autoCommit, 2000); });
    addBtn.addEventListener('pointerdown', e => e.preventDefault());   // keep the keyboard open (no blur) for the next matrícula
    addBtn.onclick = () => { clearTimeout(idleT); hint(''); const v = inp.value; inp.value = ''; addBtn.disabled = true; if (v.trim()) add(v); inp.focus(); };
    inp.addEventListener('paste', e => { const t = (e.clipboardData || window.clipboardData)?.getData('text'); if (t) { e.preventDefault(); add((inp.value + ' ' + t)); inp.value = ''; } });
    inp.addEventListener('blur', () => { if (inp.value.trim()) { const v = inp.value; inp.value = ''; add(v); } });
    box.onclick = e => { if (e.target === box) inp.focus(); };
    f.onsubmit = async e => { e.preventDefault(); msg('');
      if (!f.name.value.trim()) { msg('Ponele un nombre al grupo.'); f.name.focus(); return; }
      if (inp.value.trim()) { const v = inp.value; inp.value = ''; await add(v); }
      const mats = chips.map(c => c.matricula);   // t151u: include chips still being looked up (tapping the button blurs the field first)
      const file = cropped;
      const btn = f.querySelector('button[type=submit]'); if (btn.disabled) return; btn.disabled = true;
      if (!f.dataset.idem) f.dataset.idem = (crypto.randomUUID ? crypto.randomUUID() : 'k' + Date.now().toString(36));
      try { const r = await H.api('/api/groups', { method: 'POST', headers: { 'Idempotency-Key': f.dataset.idem }, body: JSON.stringify({ name: f.name.value, matriculas: mats }) });
        const bad = (r.invited || []).filter(x => x.error); if (bad.length) H.toast(`No se pudo invitar a ${bad.map(b => b.matricula).join(', ')}: ${bad[0].error}`);
        if (file) await uploadPhoto(r.id, file).catch(e => H.toast('El grupo se creó, pero la foto no: ' + e.message));
        location.hash = `#/grupo/${r.id}/ajustes?nuevo=1`; }
      catch (err) { btn.disabled = false; msg(err.message); } };
  }

  function drawList(el, d) {
    el.innerHTML = `${d.invitations.length ? `<div class="section"><h2>Te invitaron</h2></div>${d.invitations.map(i => `<div class="card gg-inv" data-g="${i.group_id}"><div class="gg-invh">${photo(i)}<div><b>${H.esc(i.name)}</b><span>${H.esc(i.invited_by)} te invitó · ${i.members} jugador${i.members === 1 ? '' : 'es'}</span></div></div>
        <p class="foot">Si aceptás, los miembros ven lo que elegiste en <a class="link" href="#/compartir">Qué comparto</a>. Nunca tus audios, notas ni estrategia.</p>
        <div class="gg-acts"><button class="btn" data-acc="1">Aceptar</button><button class="btn ghost" data-acc="0">Rechazar</button></div></div>`).join('')}` : ''}
      <div class="section"><h2>Tus grupos</h2><a class="badge gold" href="#/amigos/nuevo">+ Nuevo grupo</a></div>
      ${d.groups.length ? `<div class="card gg-list">${d.groups.map(g => `<a class="row" href="#/grupo/${g.id}">${photo(g)}<div class="gg-t"><b>${H.esc(g.name)}</b><span>${g.accepted} jugador${g.accepted === 1 ? '' : 'es'}${g.pending ? ` · ${g.pending} invitación${g.pending === 1 ? '' : 'es'} pendiente${g.pending === 1 ? '' : 's'}` : ''}${g.is_admin ? ' · sos admin' : ''}</span></div><svg class="chev" viewBox="0 0 8 14" width="8" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 1l6 6-6 6"/></svg></a>`).join('')}</div>`
        : `<a class="card gg-empty" href="#/amigos/nuevo"><b>Creá tu primer grupo</b><span>Invitá a tus amigos por matrícula y compará rondas, promedios y hoyo por hoyo.</span></a>`}
      ${d.outgoing.length ? `<div class="section"><h2>Invitaciones enviadas</h2></div><div class="card gg-list">${d.outgoing.map(o => `<div class="row"><div class="gg-t"><b class="num">Matrícula ${H.esc(o.matricula)}</b><span>${H.esc(o.group_name)} · ${o.is_user ? 'esperando respuesta' : 'todavía no usa Golflet'}</span></div><button class="btn ghost sm" data-rev="${o.group_id}|${o.member_id}">Revocar</button></div>`).join('')}</div>` : ''}`;
    el.querySelectorAll('.gg-inv [data-acc]').forEach(b => b.onclick = async () => { const g = b.closest('.gg-inv').dataset.g;
      try { await H.api(`/api/groups/${g}/respond`, { method: 'POST', body: JSON.stringify({ accept: b.dataset.acc === '1' }) }); if (b.dataset.acc === '1') location.hash = `#/grupo/${g}`; else load(['amigos'], location.hash); } catch (e) { H.toast(e.message); } });
    el.querySelectorAll('[data-rev]').forEach(b => b.onclick = async () => { const [g, m] = b.dataset.rev.split('|');
      if (!(await H.ask(b, 'La invitación deja de valer.', 'Sí, revocar'))) return;
      try { await H.api(`/api/groups/${g}/members/${m}`, { method: 'DELETE' }); load(['amigos'], location.hash); } catch (e) { H.toast(e.message); } });
  }

  function filters(id, d, qs, base) {
    const y = d.filters.year || '', c = d.filters.course || '', r = y ? '' : (d.filters.range || 'all');
    const yr = `<div class="seg vx-seg rng-seg gg-rng" role="tablist" aria-label="Período">${RANGES.map(([v, short, full]) => `<a role="tab" aria-selected="${v === r}" aria-label="${full}" class="${v === r ? 'on' : ''}" href="${base}${keepQs(qs, { range: v, year: null })}">${short}</a>`).join('')}${y ? `<a class="on" href="${base}${keepQs(qs, { year: null, range: 'all' })}" aria-label="${y}">${y} ✕</a>` : ''}</div>`;
    const courses = d.filters.courses || [];
    const current = courses.find(x => x.key === c);
    const opts = [['all', 'Todas las canchas'], ...courses.map(x => [x.key, x.label])];
    const cs = courses.length ? `<details class="gg-course"><summary>${H.esc(current ? current.label : 'Canchas')} ▾</summary><div>${opts.map(([v, l]) => `<a class="${v === (c || 'all') ? 'on' : ''}" href="${base}${keepQs(qs, { course: v })}">${H.esc(l)}</a>`).join('')}</div></details>` : '';
    return `<div class="gg-filters">${yr}${cs}</div>`;
  }
  function trendSvg(ms, link) {
    const pts = ms.flatMap(m => (m.trend || []).map(t => ({ m, ...t })).filter(t => t.avg_gross != null));
    if (pts.length < 2) return '<p class="foot">Con más rondas aparece la evolución mes a mes.</p>';
    const months = [...new Set(pts.map(p => p.month))].sort(), W = 640, Hh = 200, P = 28;
    const ys = pts.map(p => p.avg_gross), mn = Math.floor(Math.min(...ys) - 1), mx = Math.ceil(Math.max(...ys) + 1);
    const X = mo => P + (months.length === 1 ? (W - 2 * P) / 2 : months.indexOf(mo) / (months.length - 1) * (W - 2 * P)), Y = v => P / 2 + (v - mn) / (mx - mn) * (Hh - P * 1.5);
    let s = `<line x1="${P}" x2="${W - P}" y1="${Hh - P}" y2="${Hh - P}" stroke="#E6E2D8"/>`;
    for (const v of [mn, Math.round((mn + mx) / 2), mx]) s += `<text x="4" y="${Y(v) + 4}" class="gg-ax">${v}</text>`;
    s += `<text x="${P}" y="${Hh - 6}" class="gg-ax">${months[0]}</text><text x="${W - P}" y="${Hh - 6}" class="gg-ax" text-anchor="end">${months[months.length - 1]}</text>`;
    for (const m of ms) { const t = (m.trend || []).filter(x => x.avg_gross != null); if (!t.length) continue;
      s += `<polyline fill="none" stroke="${m.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" points="${t.map(x => `${X(x.month)},${Y(x.avg_gross)}`).join(' ')}"/>`;
      s += t.map(x => `<a href="${link}"><circle cx="${X(x.month)}" cy="${Y(x.avg_gross)}" r="5" fill="${m.color}" stroke="#F6F7F9" stroke-width="2"><title>${H.esc(m.name)} · ${x.month}: ${H.f1(x.avg_gross)} (${x.rounds} ronda${x.rounds === 1 ? '' : 's'})</title></circle></a>`).join(''); }
    return `<svg class="gg-chart" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Promedio gross por mes; más arriba es mejor">${s}</svg><p class="foot">Promedio gross por mes. Más arriba es mejor (menos golpes).</p>`;
  }
  function legend(ms) { return `<div class="gg-legend">${ms.map(m => `<span>${dot(m.color)}${H.esc(m.name)}${m.is_me ? ' (vos)' : ''}${m.is_admin ? '<span class="gg-adm">admin</span>' : ''}</span>`).join('')}</div>`; }

  const CHEV = '<svg class="chev" viewBox="0 0 8 14" width="8" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 1l6 6-6 6"/></svg>';
  const SEAL = '<span class="gg-seal" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M9 3h5l2 7 2-7h5l-4 12H13z" fill="#0B2545"/><circle cx="16" cy="21" r="8" fill="#C8A86A"/><circle cx="16" cy="21" r="3.5" fill="none" stroke="#0B2545" stroke-width="1.4"/></svg></span>';
  function drawGroup(el, id, d, qs, isVs) {
    const ms = d.members, base = isVs ? location.hash.split('?')[0] : `#/grupo/${id}`, V = d.view || {};
    const order = (V.metrics && V.metrics.length ? V.metrics : MET.map(m => m[0])).filter(k => MT[k]);
    const rows = order.map(k => MT[k]).filter(([k]) => ms.some(m => val(m, k) != null || hid(m, k)));
    const shared = d.filters.courses.filter(c => c.shared);
    const sec = {
      table: () => `<div class="section"><h2>Tabla</h2><span class="badge">${ms.length} jugador${ms.length === 1 ? '' : 'es'}</span></div>
      <div class="card gg-board"><div class="tscroll"><table class="gg-t"><thead><tr><th>Métrica</th>${ms.map(m => `<th>${dot(m.color)}<span>${H.esc(m.name.split(' ')[0])}</span></th>`).join('')}</tr></thead><tbody>
      ${rows.map(([k, l]) => { const lead = leaders(ms, k); return `<tr><th><a href="#/grupo/${id}/m/${k}${keepQs(qs)}">${l}</a></th>${ms.map(m => `<td class="${lead.includes(m.member_id) ? 'lead' : ''}"><a href="#/grupo/${id}/m/${k}${keepQs(qs)}">${hid(m, k) ? NS : `<b class="num">${fmt(k, val(m, k))}</b>${per(m, k) != null ? `<small class="num">${H.f1(per(m, k))}/r</small>` : ''}`}</a></td>`).join('')}</tr>`; }).join('')}
      </tbody></table></div><p class="foot">Dorado: el mejor de cada fila, solo entre quienes la comparten. Tocá cualquier número para ver el detalle.</p></div>`,
      trend: () => `<div class="section"><h2>Evolución</h2></div><a class="card gg-chartcard" href="#/grupo/${id}/m/avg_gross${keepQs(qs)}">${trendSvg(ms, `#/grupo/${id}/m/avg_gross${keepQs(qs)}`)}</a>`,
      holes: () => `<div class="section"><h2>Hoyo por hoyo</h2></div>
      ${shared.length ? `<div class="card gg-list">${shared.map(c => `<a class="row" href="#/grupo/${id}/hoyos${keepQs(qs, { course: c.key })}"><div class="gg-t"><b>${H.esc(c.label)}</b><span>${c.members} jugadores con tarjetas · quién hace más birdies y pares en cada hoyo</span></div>${CHEV}</a>`).join('')}</div>`
        : `<p class="foot">Cuando al menos dos jugadores tengan tarjetas en la misma cancha, acá aparece la comparación hoyo por hoyo.</p>`}`,
      clubs: () => d.clubs.length ? `<div class="section"><h2>Distancias por palo (GPS)</h2></div><div class="card gg-board"><div class="tscroll"><table class="gg-t"><thead><tr><th>Palo</th>${ms.map(m => `<th>${dot(m.color)}<span>${H.esc(m.name.split(' ')[0])}</span></th>`).join('')}</tr></thead><tbody>
        ${d.clubs.map(c => `<tr><th>${H.esc(c.label)}</th>${ms.map(m => { const x = c.members.find(y => y.member_id === m.member_id); return `<td>${(m.hidden || []).includes('gps') ? NS : x ? `<b class="num">${x.median_m} m</b><small class="num">${x.shots} golpes</small>` : '<span class="muted">—</span>'}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div><p class="foot">Mediana con GPS, solo palos que al menos dos jugadores registraron.</p></div>` : '',
      vs: () => !isVs && ms.length > 2 ? `<div class="section"><h2>Mano a mano</h2></div><div class="card gg-vs">${ms.filter(m => !m.is_me).map(m => { const me = ms.find(x => x.is_me); return me ? `<a class="vx-chip" href="#/grupo/${id}/vs/${me.member_id}/${m.member_id}${keepQs(qs, { members: null })}">${dot(m.color)}Vos vs ${H.esc(m.name)}</a>` : ''; }).join('')}</div>` : '',
    };
    const gear = !isVs ? `<details class="gg-gear"><summary aria-label="Ajustes del grupo"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></summary><div><a href="#/grupo/${id}/vista">Personalizar mi vista</a>${d.group.is_admin ? `<a href="#/grupo/${id}/ajustes">Cambiar foto</a><a href="#/grupo/${id}/ajustes">Ajustes y link de invitación</a>` : ''}</div></details>` : '';
    const cardsLine = m => { const eighteen = Number(m.cards_18 ?? m.rounds ?? 0), nine = Number(m.cards_9 || 0), total = eighteen + nine; if (!total) return ''; return nine ? `${total} tarjetas (${eighteen} de 18 y ${nine} de 9)` : (total === 1 ? '1 tarjeta' : `${total} tarjetas`); };
    const shortCards = m => { const total = Number(m.cards_18 ?? m.rounds ?? 0) + Number(m.cards_9 || 0); if (!total) return ''; return total === 1 ? '1 tarjeta' : `${total} tarjetas`; };
    const rankOf = (key, title) => {
      const rows = ms.map(m => ({ m, v: val(m, key), hidden: hid(m, key) })).filter(x => !x.hidden && x.v != null);
      rows.sort((a, b) => (MT[key][3] ? a.v - b.v : b.v - a.v));
      if (!rows.length) return `<section class="gg-rank" id="gg-${key}"><h2>${title}</h2><p class="foot">Sin tarjetas compartidas para este número.</p></section>`;
      const pod = rows.slice(0, 3).map((x, i) => `<a class="gg-pod" href="#/grupo/${id}/m/${key}${keepQs(qs)}"><i class="num">${i + 1}</i>${photo(x.m, 'gg-av')}<b>${H.esc(x.m.name)}</b><span class="num">${fmt(key, x.v)}</span><small>${H.esc(String(x.m.cards_18 ?? x.m.rounds ?? ''))}</small></a>`).join('');
      const rest = rows.slice(3).map(x => `<a class="gg-rankrow" href="#/grupo/${id}/m/${key}${keepQs(qs)}"><span>${H.esc(x.m.name)}</span><b class="num">${fmt(key, x.v)}</b><small>${H.esc(String(x.m.cards_18 ?? x.m.rounds ?? ''))}</small></a>`).join('');
      const rate = rows[0] && per(rows[0].m, key) != null ? `<p class="foot">El primero: ${H.f1(per(rows[0].m, key))} por ronda de 18. Una tarjeta de 9 entra por hoyo, no en el promedio de golpes.</p>` : `<p class="foot">Una tarjeta de 9 entra por hoyo. El promedio de golpes usa solo las de 18.</p>`;
      return `<section class="gg-rank" id="gg-${key}"><h2>${title}</h2><div class="gg-podium">${pod}</div>${rest ? `<div class="gg-rest">${rest}</div>` : ''}${rate}</section>`;
    };
    const extraRank = (title, rows, href) => {
      const live = rows.filter(x => x.v != null);
      if (!live.length) return '';
      live.sort((a, b) => a.low ? a.v - b.v : b.v - a.v);
      const n = Math.min(live.length, 3);
      const order = n >= 3 ? [1, 0, 2] : n === 2 ? [1, 0] : [0];
      const places = placesOf(live);
      const pod = order.map(i => { const x = live[i], place = places[i], face = place === 1 ? 1 : place === 2 ? 2 : 3; return `<a class="gg-step p${face}" href="${href}"><span class="gg-place">${place}º</span>${i === 0 ? SEAL : ''}${photo(x.m, 'gg-av')}<b>${H.esc(x.m.name)}</b><span class="num">${x.text}</span><small>${x.n} tarjetas</small></a>`; }).join('');
      return `<section class="gg-rank"><h2>${title}</h2><div class="gg-steps n${n}">${pod}</div><p class="foot">${xNote(title)}</p></section>`;
    };
    const xNote = t => t.startsWith('Consistencia') ? 'Desvío del gross en tarjetas de 18. Menos es más parejo. Hacen falta 3.' : 'Rondas de 18 seguidas en el par o mejor. Una de 9 no corta ni suma la racha.';
    const consist = extraRank('Consistencia', ms.filter(m => !(m.hidden || []).includes('scores')).map(m => ({ m, v: m.consistency?.sd ?? null, n: m.consistency?.n || 0, text: m.consistency?.sd == null ? '' : String(m.consistency.sd).replace('.', ','), low: true })), `#/grupo/${id}/m/avg_gross${keepQs(qs)}`);
    const racha = extraRank('Racha en el par', ms.filter(m => !(m.hidden || []).includes('scores')).map(m => ({ m, v: m.streak ?? null, n: (m.cards_18 ?? m.rounds) || 0, text: m.streak == null ? '' : String(m.streak), low: false })), `#/grupo/${id}/m/pars${keepQs(qs)}`);
    const worst = !isVs && Array.isArray(d.worst_holes) && d.worst_holes.length ? `<section class="gg-rank"><h2>Peores hoyos</h2><div class="gg-rest">${d.worst_holes.map(h => `<a class="gg-rankrow" href="#/grupo/${id}/hoyo/${h.hole}${keepQs(qs)}"><span>Hoyo ${h.hole}${h.par ? ` · par ${h.par}` : ''}</span><b class="num">${(h.avg_to_par > 0 ? '+' : '') + String(h.avg_to_par).replace('.', ',')}</b><small>${h.n} veces</small></a>`).join('')}</div><p class="foot">Promedio sobre el par en esta cancha, con al menos dos scores. No mezcla canchas.</p></section>` : (!isVs && !d.filters.course ? `<section class="gg-rank"><h2>Peores hoyos</h2><p class="foot">Elegí una cancha. Los hoyos de canchas distintas no se rankean juntos.</p></section>` : '');
    const minN = d.filters.min || MIN_FALLBACK[d.filters.range] || 3;
    const ranked = key => ms.map(m => ({ m, v: val(m, key), n: m.cards_18 ?? m.rounds ?? 0 })).filter(x => !hid(x.m, key) && x.v != null).sort((a, b) => (MT[key][3] ? a.v - b.v : b.v - a.v) || b.n - a.n);
    const shy = (key, row) => ['avg_gross', 'avg_net', 'par3', 'par4', 'par5', 'putts', 'gir', 'fir'].includes(key) && row.n < minN;
    const meter = pct => `<span class="gg-bar" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, pct))}%"><b></b></i></span>`;
    const firstOf = name => String(name || '').trim().split(/\s+/)[0] || '';
    const numTxt = n => String(Math.round(Number(n) * 10) / 10).replace('.', ',');
    const gapLine = (key, rows) => {
      const live = rows.filter(x => !shy(key, x));
      if (live.length < 2) return '';
      if (live[0].v === live[1].v) return 'Empate en la punta.';
      const dlt = lowOf(key) ? live[1].v - live[0].v : live[0].v - live[1].v;
      return `+${numTxt(dlt)} sobre ${firstOf(live[1].m.name)}`;
    };
    const MON = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const sinceDate = () => {
      const raw = d.filters.since;
      if (!raw) return null;
      const dt = new Date(`${String(raw).slice(0, 10)}T12:00:00`);
      return Number.isNaN(dt.getTime()) ? null : dt;
    };
    const seasonYear = () => {
      const listed = d.filters.years && d.filters.years[0];
      if (listed) return String(listed);
      const dt = sinceDate();
      return dt ? String(dt.getFullYear()) : '';
    };
    const periodLine = () => {
      const range = d.filters.range || 'all';
      const dt = sinceDate();
      const year = seasonYear();
      if (range === '1w') return dt ? `Semana del ${dt.getDate()} ${MON[dt.getMonth()]}` : 'Esta semana';
      if (range === '1m') return dt ? `${MESES[dt.getMonth()]} ${dt.getFullYear()}` : 'Este mes';
      if (range === '3q') return year ? `Trimestre ${year}` : 'Trimestre';
      if (range === '6s') return year ? `Semestre ${year}` : 'Semestre';
      if (range === '12y') return year ? `Temporada ${year}` : 'Temporada';
      return 'Histórico';
    };
    const lowOf = key => key === 'regular' || key === 'best_net' || !!MT[key]?.[3];
    const boardRows = key => {
      if (key === 'regular') return ms.filter(m => !(m.hidden || []).includes('scores') && m.consistency?.sd != null).map(m => ({ m, v: m.consistency.sd, n: m.consistency.n || 0, low: true, rate: null, text: String(m.consistency.sd).replace('.', ',') }));
      if (key === 'racha') return ms.filter(m => !(m.hidden || []).includes('scores') && m.streak != null).map(m => ({ m, v: Number(m.streak), n: Number(m.cards_18 ?? m.rounds ?? 0), low: false, rate: null, text: String(m.streak) }));
      return ms.map(m => ({ m, v: val(m, key), n: Number(m.cards_18 ?? m.rounds ?? 0), low: lowOf(key), rate: per(m, key), text: null })).filter(x => !hid(x.m, key) && x.v != null).sort((a, b) => lowOf(key) ? a.v - b.v : b.v - a.v);
    };
    const shown = (key, row) => row.text || (MT[key] ? fmt(key, row.v) : String(row.v).replace('.', ','));
    const hrefOf = key => `#/grupo/${id}/m/${key === 'regular' ? 'avg_gross' : key === 'racha' ? 'pars' : key}${keepQs(qs)}`;
    const emptyBoard = key => {
      const text = key === 'regular' ? 'Hacen falta 3 tarjetas de 18 para ver quién es más regular.' : key === 'racha' ? 'Todavía no hay una racha de rondas en el par o mejor.' : 'Sin tarjetas compartidas para este número.';
      return `<p class="gg-emptyline" id="gg-${key}">${text}</p>`;
    };
    const cardN = m => Number(m.cards_18 ?? m.rounds ?? 0) + Number(m.cards_9 || 0);
    const posToken = (place, places) => `${places.filter(p => p === place).length > 1 ? 'T' : ''}${place}`;
    const moveMap = (key, rows, places) => {
      const field = { birdies: 'birdies', pars: 'pars', eagles: 'eagles', rounds: 'rounds', best_net: 'best_net' }[key];
      const out = new Map();
      if (!field) return out;
      const prev = rows.filter(x => x.m.prev && x.m.prev[field] != null).map(x => ({ id: x.m.member_id, v: x.m.prev[field] }));
      if (prev.length < 2) return out;
      prev.sort((a, b) => rows[0].low ? a.v - b.v : b.v - a.v);
      const before = placesOf(prev);
      prev.forEach((x, i) => {
        const cur = rows.findIndex(r => r.m.member_id === x.id);
        if (cur < 0) return;
        const delta = before[i] - places[cur];
        if (delta) out.set(x.id, delta);
      });
      return out;
    };
    const moveMark = delta => {
      if (!delta) return '';
      const up = delta > 0;
      const path = up ? 'M4 0 8 8H0z' : 'M0 0h8L4 8z';
      return `<span class="gg-move ${up ? 'up' : 'dn'}" aria-label="${up ? 'subió' : 'bajó'} ${Math.abs(delta)}"><svg viewBox="0 0 8 8" aria-hidden="true"><path d="${path}"/></svg>${Math.abs(delta)}</span>`;
    };
    const youLine = (key, rows, places) => {
      const meAt = rows.findIndex(x => x.m.is_me);
      if (meAt < 0) return '';
      const place = places[meAt];
      let gap = '';
      if (rows.length > 1) {
        if (place === 1 && places.filter(p => p === 1).length > 1) gap = 'Empate en la punta.';
        else if (place === 1) gap = gapLine(key, rows);
        else {
          let ahead = meAt - 1;
          while (ahead > 0 && places[ahead] === place) ahead -= 1;
          const dlt = rows[meAt].low ? rows[meAt].v - rows[ahead].v : rows[ahead].v - rows[meAt].v;
          gap = `a ${numTxt(dlt)} de ${firstOf(rows[ahead].m.name)}`;
        }
      }
      const bits = ['Tu posición', posToken(place, places), gap, cardsLine(rows[meAt].m)].filter(Boolean);
      return `<caption class="gg-you">${H.esc(bits.join(' · '))}</caption>`;
    };
    const rateCell = x => x.n < 3 ? 'Pocas tarjetas' : (x.rate != null ? H.f1(x.rate) : '—');
    const leaderChip = (key, label) => {
      const rows = boardRows(key);
      if (!rows.length) return '';
      rows.sort((a, b) => (a.low ? a.v - b.v : b.v - a.v));
      const places = placesOf(rows);
      const tops = rows.filter((_, i) => places[i] === 1);
      const who = tops.length > 1 ? `T1 · ${firstOf(tops[0].m.name)}` : firstOf(tops[0].m.name);
      return `<button type="button" data-cat="${key}"><span>${H.esc(label)}</span><b>${H.esc(who)} ${H.esc(shown(key, tops[0]))}</b></button>`;
    };
    const boardTable = key => {
      const rows = boardRows(key);
      if (!rows.length) return emptyBoard(key);
      rows.sort((a, b) => (a.low ? a.v - b.v : b.v - a.v));
      const places = placesOf(rows);
      const moved = moveMap(key, rows, places);
      const body = rows.map((x, i) => {
        const place = places[i];
        const lead = place === 1 ? ' lead' : '';
        return `<tr class="${x.m.is_me ? 'me' : ''}"><td class="pos"><b>${posToken(place, places)}</b>${moveMark(moved.get(x.m.member_id) || 0)}</td><td class="who"><a href="${hrefOf(key)}">${photo(x.m, 'gg-av')}<span>${H.esc(x.m.name)}</span></a></td><td class="tot${lead}">${H.esc(shown(key, x))}</td><td class="rate${x.n < 3 ? ' few' : ''}">${H.esc(rateCell(x))}</td><td class="cards">${cardN(x.m) || '—'}</td></tr>`;
      }).join('');
      return `<table class="gg-lb" id="gg-${key}">${youLine(key, rows, places)}<thead><tr><th class="pos">Pos</th><th class="who">Jugador</th><th>Total</th><th>Por ronda</th><th>Tarj.</th></tr></thead><tbody>${body}</tbody></table>`;
    };
    const GOALS = { '1w': [1, '1 ronda esta semana'], '1m': [3, '3 rondas este mes'], '3q': [6, '6 rondas este trimestre'], '6s': [12, '12 rondas este semestre'], '12y': [20, '20 rondas este año'] };
    const goal = GOALS[d.filters.range || ''];
    const me = ms.find(m => m.is_me);
    const challenge = !isVs && goal && me && !(me.hidden || []).includes('scores') ? `<section class="gg-rank gg-goal"><h2>${goal[1]}</h2>${meter(Math.round(Math.min(1, (me.cards_18 ?? 0) / goal[0]) * 100))}<p class="foot">${me.cards_18 ?? 0} de ${goal[0]} tarjetas de 18. Una de 9 no cuenta como ronda completa.</p></section>` : '';
    const secs = (V.sections && V.sections.length ? V.sections : SECTIONS.map(x => x[0])).filter(k => sec[k]);
    const CATS = [['birdies', 'Birdies'], ['pars', 'Pares'], ['eagles', 'Águilas'], ['best_net', 'Mejor neto'], ['regular', 'Regularidad'], ['rounds', 'Rondas'], ['racha', 'Rachas']];
    if (ms.some(m => !hid(m, 'aces') && Number(val(m, 'aces')) > 0)) CATS.push(['aces', 'Hoyos en uno']);
    const leaderStrip = !isVs ? `<div class="gg-leaders" aria-label="Líderes">${[['birdies', 'Birdies'], ['pars', 'Pares'], ['best_net', 'Mejor neto'], ['rounds', 'Rondas']].map(([k, label]) => leaderChip(k, label)).join('')}</div>` : '';
    const tabs = !isVs ? `<div class="gg-tabs" role="tablist" aria-label="Categoría">${CATS.map(([k, t], i) => `<button type="button" role="tab" data-cat="${k}" aria-selected="${i ? 'false' : 'true'}" class="${i ? '' : 'on'}">${H.esc(t)}</button>`).join('')}</div>` : '';
    const slides = !isVs ? `<div class="gg-stages">${CATS.map(([k], i) => `<div class="gg-stage" data-cat="${k}"${i ? ' hidden' : ''}>${boardTable(k)}</div>`).join('')}</div>` : '';
    const fullTable = !isVs && secs.includes('table') ? `<details class="gg-full"><summary>Ver tabla completa</summary>${sec.table()}</details>` : '';
    const mast = !isVs ? `<header class="gg-mast"><div class="gg-mast-row"><div><p class="gg-event">Clasificación</p><h1>${H.esc(d.group.name)}</h1><p class="gg-meet">${H.esc(periodLine())}</p></div>${gear}</div></header>` : bar(ms.map(m => m.name).join(' vs '), 'Mano a mano');
    el.innerHTML = `${mast}
      ${filters(id, d, qs, base)}
      ${leaderStrip}${tabs}${slides}${challenge}
      ${!isVs ? worst : ''}
      ${fullTable}
      ${ms.length < 2 ? `<div class="msg"><img class="cad" src="/brand/caddie.png" alt="">Todavía sos el único en el grupo. ${d.group.is_admin ? `<a class="link" href="#/grupo/${id}/ajustes">Compartí el link por WhatsApp</a> o invitá por matrícula.` : 'Cuando alguien más se sume, acá ves la comparación.'}</div>` : ''}
      ${secs.filter(k => k !== 'table').map(k => sec[k]()).join('')}
      ${!isVs ? `<div class="section"><h2>Jugadores</h2></div><a class="card gg-list row" href="#/grupo/${id}/miembros"><div class="gg-t"><b>${d.group.is_admin ? 'Jugadores, admins e invitaciones' : 'Ver jugadores y salir del grupo'}</b><span>${ms.length} en el grupo · ${d.group.admins} admin${d.group.admins === 1 ? '' : 's'}${d.pending.length ? ` · ${d.pending.length} pendiente${d.pending.length === 1 ? '' : 's'}` : ''}</span></div>${CHEV}</a>` : ''}`;
    const selectCat = cat => {
      el.querySelectorAll('.gg-tabs button').forEach(x => { const on = x.dataset.cat === cat; x.classList.toggle('on', on); x.setAttribute('aria-selected', on ? 'true' : 'false'); });
      el.querySelectorAll('.gg-leaders button').forEach(x => x.classList.toggle('on', x.dataset.cat === cat));
      el.querySelectorAll('.gg-stage').forEach(s => { s.hidden = s.dataset.cat !== cat; });
    };
    el.querySelectorAll('.gg-tabs button, .gg-leaders button').forEach(b => { b.onclick = () => selectCat(b.dataset.cat); });
  }

  function drawMetric(el, id, d, k, qs) {
    const def = MT[k]; if (!def) { el.innerHTML = '<p class="msg">Métrica desconocida.</p>'; return; }
    const ms = d.members.slice().sort((a, b) => { const va = val(a, k), vb = val(b, k); if (va == null) return 1; if (vb == null) return -1; return def[3] ? va - vb : vb - va; });
    const vs = ms.map(m => val(m, k)).filter(v => v != null), mx = Math.max(...vs, 1), mn = Math.min(...vs, 0);
    const w = v => v == null ? 0 : def[3] && ['avg_gross', 'best_gross', 'avg_net', 'best_net', 'par3', 'par4', 'par5', 'putts'].includes(k) ? 30 + 70 * (mx - v) / Math.max(1, mx - mn) : 8 + 92 * v / mx;
    el.innerHTML = `${bar(def[1], d.group.name)}${legend(d.members)}${filters(id, d, qs, `#/grupo/${id}/m/${k}`)}
      <div class="card gg-bars">${ms.map((m, i) => `<div class="gg-br"><span class="gg-rk num">${val(m, k) == null ? '—' : placesOf(ms.filter(x => val(x, k) != null).map(x => ({ v: val(x, k) })))[ms.filter(x => val(x, k) != null).indexOf(m)]}</span><span class="gg-nm">${dot(m.color)}${H.esc(m.name)}</span><span class="gg-track"><i style="width:${w(val(m, k))}%;background:${m.color}"></i></span>${hid(m, k) ? NS : `<b class="num">${fmt(k, val(m, k))}</b>`}</div>`).join('')}
      <p class="foot">${def[3] ? 'Menos es mejor.' : 'Más es mejor.'}${ms.some(m => hid(m, k)) ? ' Quien no comparte esta métrica no entra en el ranking.' : ''}${def[2] === 't' ? ' Total en el período; abajo, por ronda.' : ''}</p></div>
      ${def[2] === 't' ? `<div class="section"><h2>Por ronda</h2></div><div class="card gg-bars">${ms.map(m => `<div class="gg-br"><span class="gg-nm">${dot(m.color)}${H.esc(m.name)}</span>${hid(m, k) ? NS : `<b class="num">${H.f1(per(m, k))}</b>`}</div>`).join('')}</div>` : ''}
      ${k === 'avg_gross' ? `<div class="section"><h2>Mes a mes</h2></div><div class="card">${trendSvg(d.members, location.hash)}</div>` : ''}
      <div class="section"><h2>Rondas por año</h2></div><div class="card gg-board"><div class="tscroll"><table class="gg-t"><thead><tr><th>Año</th>${d.members.map(m => `<th>${dot(m.color)}<span>${H.esc(m.name.split(' ')[0])}</span></th>`).join('')}</tr></thead><tbody>
        ${d.filters.years.map(y => `<tr><th><a href="#/grupo/${id}/m/${k}${keepQs(qs, { year: y })}">${y}</a></th>${d.members.map(m => `<td>${m.by_year ? `<span class="num">${m.by_year.find(x => x.year === y)?.rounds ?? 0}</span>` : NS}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>
      <div class="section"><h2>Rondas por cancha</h2></div><div class="card gg-board"><div class="tscroll"><table class="gg-t"><thead><tr><th>Cancha</th>${d.members.map(m => `<th>${dot(m.color)}<span>${H.esc(m.name.split(' ')[0])}</span></th>`).join('')}</tr></thead><tbody>
        ${d.filters.courses.map(c => `<tr><th><a href="#/grupo/${id}/m/${k}${keepQs(qs, { course: c.key })}">${H.esc(c.label)}</a></th>${d.members.map(m => `<td>${m.by_course ? `<span class="num">${m.by_course.find(x => x.key === c.key)?.rounds ?? 0}</span>` : NS}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  }

  const heatCol = tp => tp == null ? '#F1EEE6' : tp <= -0.25 ? '#C8102E' : tp <= 0.15 ? '#0B2545' : tp <= 0.6 ? '#5E8C6A' : tp <= 1.1 ? '#DCD6C8' : '#C8102E';
  const heatInk = tp => tp == null ? '#9AA09B' : (tp <= 0.6 && tp > -0.25) ? '#F6F7F9' : tp <= -0.25 ? '#1d1a12' : tp > 1.1 ? '#FFFFFF' : '#121614';
  const sgn = x => x == null ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '±') + H.f1(Math.abs(x)).replace(/^—$/, '0');
  function drawHeat(el, id, d, qs) {
    const ms = d.members.filter(m => m.rounds);
    const cnt = k => Object.fromEntries(ms.map(m => [m.member_id, d.holes.filter(h => h.leaders[k].includes(m.member_id)).length]));
    const cb = cnt('birdies'), cp = cnt('pars'), ca = cnt('avg');
    const nsh = d.members.filter(m => (m.hidden || []).includes('holes'));
    el.innerHTML = `${bar(d.course.label, 'Hoyo por hoyo')}${legend(d.members)}${nsh.length ? `<p class="foot">${nsh.map(m => H.esc(m.name)).join(', ')}: resultados por hoyo no compartidos.</p>` : ''}
      ${!d.shared ? '<div class="msg">Necesitamos tarjetas de al menos dos jugadores en esta cancha.</div>' : ''}
      <div class="card gg-sum"><div class="tscroll"><table class="gg-t"><thead><tr><th></th>${ms.map(m => `<th>${dot(m.color)}<span>${H.esc(m.name.split(' ')[0])}</span></th>`).join('')}</tr></thead><tbody>
        <tr><th>Rondas acá</th>${ms.map(m => `<td><b class="num">${m.rounds}</b></td>`).join('')}</tr>
        <tr><th>Hoyos con mejor promedio</th>${ms.map(m => `<td><b class="num">${ca[m.member_id]}</b></td>`).join('')}</tr>
        <tr><th>Hoyos con más birdies</th>${ms.map(m => `<td><b class="num">${cb[m.member_id]}</b></td>`).join('')}</tr>
        <tr><th>Hoyos con más pares</th>${ms.map(m => `<td><b class="num">${cp[m.member_id]}</b></td>`).join('')}</tr></tbody></table></div></div>
      <div class="section"><h2>Mapa de calor</h2><span class="badge">promedio vs par</span></div>
      <div class="card gg-heat" style="--n:${ms.length}"><div class="gg-hrow gg-hh"><span>Hoyo</span>${ms.map(m => `<span title="${H.esc(m.name)}">${dot(m.color)}${H.esc(m.name.split(' ')[0])}</span>`).join('')}</div>
        ${d.holes.map(h => `<a class="gg-hrow" href="#/grupo/${id}/hoyo/${h.hole}${keepQs(qs)}"><span class="gg-hn"><b class="num">${h.hole}</b><small>Par ${h.par ?? '—'}</small></span>${ms.map(m => { const x = h.members.find(y => y.member_id === m.member_id) || {}; const best = h.leaders.avg.includes(m.member_id);
          return `<span class="gg-cell${best ? ' best' : ''}" style="background:${heatCol(x.avg_to_par)};color:${heatInk(x.avg_to_par)}"><b class="num">${x.n ? sgn(x.avg_to_par) : '—'}</b>${x.n ? `<small class="num">${x.birdies}b · ${x.pars}p</small>` : ''}</span>`; }).join('')}</a>`).join('')}
        <div class="gg-key"><span><i style="background:#C8102E"></i>bajo par</span><span><i style="background:#0B2545"></i>par</span><span><i style="background:#5E8C6A"></i>hasta +0,6</span><span><i style="background:#DCD6C8"></i>bogey</span><span><i style="background:#C8102E"></i>más de +1</span><span>Borde dorado: mejor promedio del hoyo</span></div></div>`;
  }
  function drawHole(el, id, d, n, qs) {
    const h = d.holes.find(x => x.hole === n); if (!h) { el.innerHTML = '<p class="msg">Hoyo no encontrado.</p>'; return; }
    const ms = d.members.filter(m => m.rounds), nav = (k) => d.holes.find(x => x.hole === n + k);
    el.innerHTML = `<div class="bar"><span class="overline">${H.esc(d.course.label)}</span><span class="gg-hnav">${nav(-1) ? `<a class="close" href="#/grupo/${id}/hoyo/${n - 1}${keepQs(qs)}" aria-label="Hoyo anterior">‹</a>` : ''}${nav(1) ? `<a class="close" href="#/grupo/${id}/hoyo/${n + 1}${keepQs(qs)}" aria-label="Hoyo siguiente">›</a>` : ''}</span></div>
      <div class="stitle">Hoyo ${n}</div><div class="chips"><span class="badge">Par ${h.par ?? '—'}</span>${h.hcp ? `<span class="badge">Hcp ${h.hcp}</span>` : ''}</div>${legend(ms)}
      <div class="card gg-board"><div class="tscroll"><table class="gg-t"><thead><tr><th></th>${ms.map(m => `<th>${dot(m.color)}<span>${H.esc(m.name.split(' ')[0])}</span></th>`).join('')}</tr></thead><tbody>
      ${[['n', 'Veces jugado'], ['avg', 'Promedio'], ['avg_to_par', 'Vs par'], ['best', 'Mejor'], ['eagles', 'Águilas'], ['birdies', 'Birdies'], ['pars', 'Pares'], ['bogeys', 'Bogeys'], ['doubles', 'Doble o peor']].map(([k, l]) => {
        const xs = ms.map(m => h.members.find(y => y.member_id === m.member_id) || {}); const lead = k === 'avg_to_par' ? h.leaders.avg : k === 'birdies' ? h.leaders.birdies : k === 'pars' ? h.leaders.pars : [];
        return `<tr><th>${l}</th>${xs.map(x => `<td class="${lead.includes(x.member_id) ? 'lead' : ''}"><b class="num">${x.n ? (k === 'avg' ? H.f1(x.avg) : k === 'avg_to_par' ? sgn(x.avg_to_par) : x[k] ?? '—') : '—'}</b></td>`).join('')}</tr>`; }).join('')}
      </tbody></table></div></div>
      <div class="section"><h2>Cómo terminó cada uno</h2></div><div class="card gg-bars">${ms.map(m => { const x = h.members.find(y => y.member_id === m.member_id) || { n: 0 }; const tot = x.n || 1;
        return `<div class="gg-dist"><span class="gg-nm">${dot(m.color)}${H.esc(m.name)}</span><span class="vx-split">${[['eagles', '#C4A36A'], ['birdies', '#C8102E'], ['pars', '#0B2545'], ['bogeys', '#DCD6C8'], ['doubles', '#C8102E']].map(([k, c]) => x[k] ? `<span style="flex:${x[k]};background:${c}" title="${k}: ${x[k]}"></span>` : '').join('') || '<span style="flex:1;background:#F1EEE6"></span>'}</span><small class="num">${x.n} vez${x.n === 1 ? '' : 'es'}</small></div>`; }).join('')}
      <div class="gg-key"><span><i style="background:#C8102E"></i>birdie o mejor</span><span><i style="background:#0B2545"></i>par</span><span><i style="background:#DCD6C8"></i>bogey</span><span><i style="background:#C8102E"></i>doble o peor</span></div></div>`;
  }

  function drawMembers(el, id, d) {
    const adm = d.group.is_admin, admins = d.members.filter(m => m.is_admin).length;
    el.innerHTML = `${bar('Jugadores', d.group.name)}
      <div class="card gg-list">${d.members.map(m => `<div class="row gg-mrow"><div class="gg-av" style="background:${m.color}">${H.esc(m.name.slice(0, 1))}</div><a class="gg-t gp-mlink" href="#/grupo/${id}/jugador/${m.member_id}"><b>${H.esc(m.name)}${m.is_me ? ' (vos)' : ''}</b><span>${m.is_admin ? 'Admin del grupo' : 'Miembro'} · Ver perfil</span></a>
        ${adm && !m.is_me ? `<div class="gg-macts">${m.is_admin ? `<button class="btn ghost sm" data-role="member" data-mid="${m.member_id}" data-nm="${H.esc(m.name)}">Quitar admin</button>` : `<button class="btn ghost sm" data-role="admin" data-mid="${m.member_id}" data-nm="${H.esc(m.name)}">Hacer admin</button>`}<button class="btn ghost sm" data-rm="${m.member_id}" data-nm="${H.esc(m.name)}">Sacar</button></div>`
          : adm && m.is_me && m.is_admin && admins > 1 ? `<button class="btn ghost sm" data-role="member" data-mid="${m.member_id}" data-nm="vos">Dejar de ser admin</button>` : ''}</div>`).join('')}</div>
      <p class="foot">Los admins cambian el nombre y la foto, manejan el link de invitación, hacen admin a otros y sacan jugadores. Siempre queda al menos un admin.</p>
      ${d.pending.length ? `<div class="section"><h2>Pendientes</h2></div><div class="card gg-list">${d.pending.map(p => `<div class="row"><div class="gg-t"><b class="num">${p.matricula ? 'Matrícula ' + H.esc(p.matricula) : 'Invitación pendiente'}</b><span>${p.matricula ? (p.is_user ? 'Esperando respuesta' : 'Todavía no usa Golflet: la ve cuando entre') : 'Esperando respuesta'}</span></div>${adm ? `<button class="btn ghost sm" data-rm="${p.member_id}" data-pend="1">Revocar</button>` : ''}</div>`).join('')}</div>` : ''}
      ${adm ? `<div class="section"><h2>Invitar por matrícula</h2></div><form class="card gg-form gg-inline" id="ggi"><label>Matrícula<input name="mat" inputmode="numeric" pattern="[0-9]{3,9}" required placeholder="123456"></label><button class="btn" type="submit">Invitar</button><div id="ggimsg"></div></form>
        <p class="foot"><a class="link" href="#/grupo/${id}/ajustes">Link de invitación, nombre y foto</a></p>` : ''}
      <div class="section"><h2>Salir del grupo</h2></div><div class="card"><p class="foot" style="margin-top:0">Salís del grupo. El grupo y las tarjetas de los demás se quedan. ${d.group.is_admin && admins === 1 && d.members.length > 1 ? 'Sos el único admin: el jugador más antiguo pasa a ser admin.' : ''} Si eras el último, el grupo queda dormido.</p><button class="btn ghost danger" id="ggleave">Salir del grupo</button></div>`;
    el.querySelectorAll('[data-role]').forEach(b => b.onclick = async () => {
      try { await H.api(`/api/groups/${id}/members/${b.dataset.mid}`, { method: 'PATCH', body: JSON.stringify({ role: b.dataset.role }) }); H.toast(b.dataset.role === 'admin' ? `${b.dataset.nm} ahora es admin.` : 'Listo.'); load(['grupo', id, 'miembros'], location.hash); } catch (e) { H.toast(e.message); } });
    el.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => {
      if (!(await H.ask(b, b.dataset.pend ? 'La invitación deja de valer.' : `${b.dataset.nm} deja de ver el grupo y el grupo deja de verlo.`, b.dataset.pend ? 'Sí, revocar' : 'Sí, sacar'))) return;
      try { await H.api(`/api/groups/${id}/members/${b.dataset.rm}`, { method: 'DELETE' }); load(['grupo', id, 'miembros'], location.hash); } catch (e) { H.toast(e.message); } });
    const fi = document.getElementById('ggi'); if (fi) fi.onsubmit = async e => { e.preventDefault(); const m = document.getElementById('ggimsg');
      try { const r = await H.api(`/api/groups/${id}/invites`, { method: 'POST', body: JSON.stringify({ matricula: fi.mat.value.trim() }) }); H.toast(r.is_user ? 'Invitación enviada.' : 'Invitación guardada: la ve cuando entre a Golflet.'); load(['grupo', id, 'miembros'], location.hash); }
      catch (err) { m.innerHTML = '<div class="msg err"></div>'; m.firstChild.textContent = err.message; } };
    const lv = document.getElementById('ggleave'); lv.onclick = async () => {
      if (!(await H.ask(lv, 'Salís del grupo.', 'Sí, salir'))) return;
      try { await H.api(`/api/groups/${id}/leave`, { method: 'POST' }); location.hash = '#/amigos'; } catch (e) { H.toast(e.message); } };
  }

  function looksLikeImage(file) {
    const type = String(file && file.type || '').toLowerCase();
    const name = String(file && file.name || '').toLowerCase();
    return type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif|bmp|tiff?)$/.test(name);
  }
  async function decodePhoto(file) {
    if (typeof createImageBitmap === 'function') {
      try { return await createImageBitmap(file); } catch (_) {}
    }
    return await new Promise((resolve, reject) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
      img.src = url;
    });
  }
  async function photoJpeg(file) {
    if (!file) throw new Error('Elegí una foto.');
    if (!looksLikeImage(file)) throw new Error('Solo imágenes. Elegí un JPG, PNG o HEIC.');
    if (file.size > 12 * 1024 * 1024) throw new Error('La foto pesa más de 12 MB. Elegí una más chica. La anterior sigue igual.');
    let bmp;
    try { bmp = await decodePhoto(file); } catch (_) { throw new Error('No pudimos leer esta foto en el navegador. Probá con un JPG o PNG. La anterior sigue igual.'); }
    const w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight;
    if (!w || !h) throw new Error('No pudimos leer esta foto. La anterior sigue igual.');
    const scale = Math.min(1, 512 / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale)); canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No pudimos preparar la foto. La anterior sigue igual.');
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    if (bmp.close) bmp.close();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob || !blob.size) throw new Error('No pudimos preparar la foto. La anterior sigue igual.');
    return blob;
  }
  async function uploadPhoto(id, file) {
    const jpeg = await photoJpeg(file);
    let r;
    try { r = await fetch(`/api/groups/${id}/photo`, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'image/jpeg' }, body: jpeg }); }
    catch (_) { throw new Error('No se pudo enviar la foto. La anterior sigue igual.'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || (r.status === 413 ? 'La foto es demasiado pesada para enviarla. La anterior sigue igual.' : r.status === 401 ? 'La sesión no está confirmada. La foto no se cambió.' : 'No se pudo subir la foto. La anterior sigue igual.'));
    return j;
  }

  /* admins: name, photo, invite link */
  function drawSettings(el, id, d, qs) {
    if (!d.group.is_admin) { el.innerHTML = `${bar('Ajustes', d.group.name)}<div class="msg">Solo los admins del grupo cambian estos ajustes.</div>`; return; }
    const L = d.group.link || {}, nuevo = qs.get('nuevo') === '1';
    const exp = L.expires_at ? `Vence el ${new Date(L.expires_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'No vence';
    el.innerHTML = `${bar(nuevo ? '¡Grupo creado!' : 'Ajustes del grupo', d.group.name)}
      ${nuevo ? '<p class="gg-lede">Mandales el link a tus amigos. Cada uno entra con su matrícula y acepta.</p>' : ''}
      <div class="section"><h2>Link de invitación</h2><span class="badge ${L.enabled && !L.expired ? 'pos' : ''}">${!L.url ? 'Sin link' : !L.enabled ? 'Desactivado' : L.expired ? 'Vencido' : 'Activo'}</span></div>
      <div class="card gg-link">${L.url && L.enabled && !L.expired ? `<div class="gg-url"><input readonly value="${H.esc(L.url)}" aria-label="Link de invitación" id="gglink"><button class="btn ghost sm" id="ggcopy">Copiar</button></div>
        <a class="btn gg-wa" href="${H.esc(L.whatsapp_url)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z"/></svg>Compartir por WhatsApp</a>
        <p class="foot">${exp}. Quien abre el link ve el nombre, la foto, quién lo creó y cuántos son; entra con su matrícula y acepta.</p>` : `<p class="foot" style="margin-top:0">${L.url ? (L.expired ? 'El link venció.' : 'El link está desactivado: nadie puede entrar con él.') : 'Este grupo todavía no tiene link.'}</p>`}
        <div class="gg-linkacts">${L.url && L.enabled ? `<button class="btn ghost sm" data-link="regenerate">Generar uno nuevo</button><button class="btn ghost sm" data-link="disable">Desactivar</button>` : `<button class="btn sm" data-link="${L.url ? 'enable' : 'regenerate'}">Activar link</button>`}
          <label class="gg-exp">Vencimiento<select id="ggexp"><option value="">No vence</option><option value="1">1 día</option><option value="7">7 días</option><option value="30">30 días</option></select></label></div>
        <div id="gglmsg"></div></div>
      <div class="section"><h2>Foto</h2></div>
      <div class="card gg-photo">${photo(d.group, 'gg-hph')}<div><label class="btn ghost sm gg-file">Elegir foto<input type="file" accept="image/*" id="ggph" hidden></label>${d.group.photo_url ? '<button class="btn ghost sm" id="ggphrm">Quitar</button>' : ''}<p class="foot">Solo imágenes. La achicamos a 512 px.</p><div id="ggpmsg"></div></div></div>
      <div class="section"><h2>Nombre</h2></div><form class="card gg-form gg-inline" id="ggr"><label>Nombre del grupo<input name="name" maxlength="40" value="${H.esc(d.group.name)}" required></label><button class="btn ghost" type="submit">Guardar</button></form>
      <p class="foot">Un grupo no se borra. Cada jugador sale por su cuenta y las tarjetas de los demás siguen.</p>
      ${nuevo ? `<p style="margin-top:18px"><a class="btn ghost" href="#/grupo/${id}">Ir al grupo</a></p>` : ''}`;
    const msg = (sel, t, err) => { const m = document.getElementById(sel); m.innerHTML = `<div class="msg ${err ? 'err' : ''}"></div>`; m.firstChild.textContent = t; };
    const cp = document.getElementById('ggcopy'); if (cp) cp.onclick = async () => { try { await navigator.clipboard.writeText(L.url); H.toast('Link copiado.'); } catch (_) { document.getElementById('gglink').select(); } };
    const ex = document.getElementById('ggexp'); ex.onchange = async () => { try { await H.api(`/api/groups/${id}/link`, { method: 'POST', body: JSON.stringify({ action: 'expiry', expires_days: ex.value ? +ex.value : null }) }); H.toast(ex.value ? `El link vence en ${ex.value} día${ex.value === '1' ? '' : 's'}.` : 'El link no vence.'); load(['grupo', id, 'ajustes'], location.hash); } catch (e) { msg('gglmsg', e.message, 1); } };
    el.querySelectorAll('[data-link]').forEach(b => b.onclick = async () => {
      const a = b.dataset.link;
      if (a === 'regenerate' && L.url && !(await H.ask(b, 'El link anterior deja de funcionar.', 'Sí, generar uno nuevo'))) return;
      if (a === 'disable' && !(await H.ask(b, 'Nadie más puede entrar con este link hasta que lo actives.', 'Sí, desactivar'))) return;
      try { await H.api(`/api/groups/${id}/link`, { method: 'POST', body: JSON.stringify({ action: a }) }); load(['grupo', id, 'ajustes'], location.hash); } catch (e) { msg('gglmsg', e.message, 1); } });
    const ph = document.getElementById('ggph'); ph.onchange = async () => { const f = ph.files && ph.files[0]; ph.value = ''; if (!f) return;
      let blob; try { blob = await window.GolfletCrop.open(f); } catch (e) { msg('ggpmsg', e.message, 1); return; }
      if (!blob) { msg('ggpmsg', 'Cancelaste. La anterior sigue igual.'); return; }
      msg('ggpmsg', 'Subiendo…');
      try { await uploadPhoto(id, new File([blob], 'foto.jpg', { type: 'image/jpeg' })); H.toast('Foto guardada.'); load(['grupo', id, 'ajustes'], location.hash); } catch (e) { msg('ggpmsg', e.message, 1); } };
    const pr = document.getElementById('ggphrm'); if (pr) pr.onclick = async () => { try { await H.api(`/api/groups/${id}/photo`, { method: 'DELETE' }); load(['grupo', id, 'ajustes'], location.hash); } catch (e) { msg('ggpmsg', e.message, 1); } };
    const fr = document.getElementById('ggr'); fr.onsubmit = async e => { e.preventDefault(); try { await H.api(`/api/groups/${id}`, { method: 'PATCH', body: JSON.stringify({ name: fr.name.value }) }); H.toast('Nombre guardado.'); } catch (err) { H.toast(err.message); } };
  }

  /* my own view of the group (admins don't set other members' views) + optional per-group sharing */
  function drawView(el, id, d, v, sh) {
    let met = v.view.metrics.slice(), secs = v.view.sections.slice();
    const allM = MET.map(m => m[0]).filter(k => v.options.metrics.includes(k)), allS = SECTIONS.map(x => x[0]);
    const list = (cur, all, lab, attr) => [...cur, ...all.filter(k => !cur.includes(k))].map((k, i, arr) => `<div class="gg-vrow"><label class="check"><input type="checkbox" data-${attr}="${k}" ${cur.includes(k) ? 'checked' : ''}><span>${H.esc(lab(k))}</span></label>
      <span class="gg-ord"><button type="button" class="btn ghost sm" data-up="${attr}:${k}" ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button><button type="button" class="btn ghost sm" data-dn="${attr}:${k}" ${i === arr.length - 1 ? 'disabled' : ''} aria-label="Bajar">↓</button></span></div>`).join('');
    const ov = v.share_override;
    const me = (d.members || []).find(m => m.is_me);
    const mineSummary = () => {
      if (!me) return '';
      const n = Number(me.cards_18 ?? me.rounds ?? 0);
      if (n < 3) return `<section class="gg-mine"><h2>Tu resumen</h2><p>Pocas tarjetas</p><small>${n} tarjetas de 18 en este período. No armo promedios con menos de 3.</small></section>`;
      const keys = ['avg_gross', 'birdies', 'pars', 'putts', 'gir', 'fir'].filter(k => !hid(me, k) && val(me, k) != null);
      if (!keys.length) return `<section class="gg-mine"><h2>Tu resumen</h2><p>Sin números de tus tarjetas en este período.</p><small>${n} tarjetas</small></section>`;
      return `<section class="gg-mine"><h2>Tu resumen</h2>${keys.map(k => `<div><span>${MT[k][1]}</span><b class="num">${fmt(k, val(me, k))}</b><small>${n} tarjetas</small></div>`).join('')}</section>`;
    };
    const draw = () => {
      el.innerHTML = `${bar('Mi vista', d.group.name)}${mineSummary()}<p class="gg-lede">Solo tus tarjetas compartidas. Lo de abajo cambia lo que ves vos.</p>
      <div class="section"><h2>Período y cancha</h2></div><div class="card gg-form">
        <label>Período<select id="gvr">${RANGES.map(([k, l]) => `<option value="${k}" ${k === v.view.range ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Cancha<select id="gvc"><option value="">Todas las canchas</option>${d.filters.courses.map(c => `<option value="${H.esc(c.key)}" ${c.key === v.view.course ? 'selected' : ''}>${H.esc(c.label)}</option>`).join('')}</select></label></div>
      <div class="section"><h2>Secciones</h2><span class="badge">en este orden</span></div><div class="card gg-vlist" data-l="s">${list(secs, allS, k => SECTIONS.find(x => x[0] === k)[1], 's')}</div>
      <div class="section"><h2>Métricas de la tabla</h2><span class="badge">en este orden</span></div><div class="card gg-vlist" data-l="m">${list(met, allM, k => MT[k][1], 'm')}</div>
      <div class="gg-acts"><button class="btn" id="gvsave">Guardar mi vista</button><button class="btn ghost" id="gvreset">Volver a la vista original</button></div><div id="gvmsg"></div>
      <div class="section"><h2>Qué comparto en este grupo</h2></div><div class="card gg-form">
        <label class="check"><input type="checkbox" id="gvov" ${ov ? 'checked' : ''}><span>Compartir distinto que en mi perfil</span></label>
        <div id="gvovl" ${ov ? '' : 'hidden'}>${sh.categories.map(c => `<label class="check"><input type="checkbox" data-sc="${c.key}" ${(ov ? ov[c.key] ?? sh.prefs[c.key] : sh.prefs[c.key]) ? 'checked' : ''}><span>${H.esc(c.label)}</span></label>`).join('')}</div>
        <p class="foot">Si no lo marcás, vale <a class="link" href="#/compartir">Qué comparto</a> de tu perfil. Notas de voz, notas y estrategia nunca se comparten.</p>
        <button class="btn ghost" id="gvovsave">Guardar</button></div>`;
      el.querySelectorAll('[data-up],[data-dn]').forEach(b => b.onclick = () => { const [l, k] = (b.dataset.up || b.dataset.dn).split(':'), up = !!b.dataset.up;
        const arr = l === 'm' ? [...met, ...allM.filter(x => !met.includes(x))] : [...secs, ...allS.filter(x => !secs.includes(x))]; const i = arr.indexOf(k), j = up ? i - 1 : i + 1; if (j < 0 || j >= arr.length) return;
        [arr[i], arr[j]] = [arr[j], arr[i]]; const on = new Set(l === 'm' ? met : secs); const next = arr.filter(x => on.has(x)); if (l === 'm') met = next; else secs = next; sync(); draw(); });
      const sync = () => { met = met.filter(k => el.querySelector(`[data-m="${k}"]`)?.checked ?? true); secs = secs.filter(k => el.querySelector(`[data-s="${k}"]`)?.checked ?? true); };
      el.querySelectorAll('[data-m]').forEach(c => c.onchange = () => { const k = c.dataset.m; const arr = [...met, ...allM.filter(x => !met.includes(x))]; met = arr.filter(x => x === k ? c.checked : met.includes(x)); });
      el.querySelectorAll('[data-s]').forEach(c => c.onchange = () => { const k = c.dataset.s; const arr = [...secs, ...allS.filter(x => !secs.includes(x))]; secs = arr.filter(x => x === k ? c.checked : secs.includes(x)); });
      const m = document.getElementById('gvmsg');
      document.getElementById('gvsave').onclick = async () => { try { const r = await H.api(`/api/groups/${id}/view`, { method: 'PUT', body: JSON.stringify({ view: { metrics: met, sections: secs, range: document.getElementById('gvr').value, course: document.getElementById('gvc').value || null } }) }); v.view = r.view; H.toast('Vista guardada.'); location.hash = `#/grupo/${id}`; } catch (e) { m.innerHTML = '<div class="msg err"></div>'; m.firstChild.textContent = e.message; } };
      document.getElementById('gvreset').onclick = async () => { try { await H.api(`/api/groups/${id}/view`, { method: 'PUT', body: JSON.stringify({ reset: true }) }); H.toast('Volviste a la vista original.'); location.hash = `#/grupo/${id}`; } catch (e) { H.toast(e.message); } };
      const ovc = document.getElementById('gvov'); ovc.onchange = () => { document.getElementById('gvovl').hidden = !ovc.checked; };
      document.getElementById('gvovsave').onclick = async () => { const o = ovc.checked ? Object.fromEntries([...el.querySelectorAll('[data-sc]')].map(c => [c.dataset.sc, c.checked])) : null;
        try { await H.api(`/api/groups/${id}/view`, { method: 'PUT', body: JSON.stringify({ share_override: o }) }); H.toast(o ? 'En este grupo compartís lo que marcaste.' : 'En este grupo vale tu perfil.'); } catch (e) { H.toast(e.message); } };
    };
    draw();
  }

  /* "Qué comparto" (profile, global for every group) */
  function drawSharing(el, d) {
    el.innerHTML = `<div class="card gg-share">${d.categories.map(c => `<label class="gg-srow"><span><b>${H.esc(c.label)}</b><small>${H.esc(c.desc)}</small></span><span class="switch"><input type="checkbox" data-sk="${c.key}" ${d.prefs[c.key] ? 'checked' : ''}><i></i></span></label>`).join('')}</div>
      <p class="foot" id="gssaved">Se guarda solo.</p>
      <div class="section"><h2>Siempre privado</h2></div><div class="card"><p class="foot" style="margin-top:0">${d.always_private.map(H.esc).join(', ')}: nunca se comparten con nadie.</p></div>
      <p class="foot">Lo que no compartís no aparece en los grupos (dice “No compartido”) y no entrás en el ranking de esa métrica.</p>`;
    el.querySelectorAll('[data-sk]').forEach(c => c.onchange = async () => { const s = document.getElementById('gssaved'); s.textContent = 'Guardando…';
      try { await H.api('/api/me/sharing', { method: 'PUT', body: JSON.stringify({ prefs: { [c.dataset.sk]: c.checked } }) }); s.textContent = 'Guardado.'; } catch (e) { c.checked = !c.checked; s.textContent = e.message; } });
  }

  /* share-link invite: preview + Aceptar / Rechazar */
  async function drawJoin(el, token) {
    const forget = () => { try { localStorage.removeItem('gl_join'); localStorage.removeItem('gl_join_at'); } catch (_) {} };
    let d; try { d = await H.api(`/api/groups/join/${encodeURIComponent(token)}`); }
    catch (e) { forget(); el.innerHTML = `${bar('Invitación', 'Amigos')}<div class="msg err">${H.esc(e.message)}</div><p><a class="btn ghost" href="#/amigos">Ir a Amigos</a></p>`; return; }
    const g = d.group;
    if (d.status === 'accepted' && g.id) { forget(); location.replace(`#/grupo/${g.id}`); return; }
    el.innerHTML = `${bar('Te invitaron a un grupo', 'Amigos')}
      <div class="card gg-joinc">${photo(g, 'gg-hph')}<div><b class="gg-jt">${H.esc(g.name)}</b><span>Creado por ${H.esc(g.owner)} · ${g.members} jugador${g.members === 1 ? '' : 'es'}</span></div></div>
      <p class="foot">Si aceptás, los jugadores del grupo ven lo que elegiste en <a class="link" href="#/compartir">Qué comparto</a>. Nunca tus audios, notas ni estrategia. Podés salir cuando quieras.</p>
      ${d.full ? '<div class="msg">El grupo ya está completo.</div>' : `<div class="gg-acts"><button class="btn" data-j="1">Aceptar</button><button class="btn ghost" data-j="0">Rechazar</button></div>`}<div id="gjmsg"></div>`;
    el.querySelectorAll('[data-j]').forEach(b => b.onclick = async () => { el.querySelectorAll('[data-j]').forEach(x => x.disabled = true);
      try { const r = await H.api(`/api/groups/join/${encodeURIComponent(token)}`, { method: 'POST', body: JSON.stringify({ accept: b.dataset.j === '1' }) });
        forget(); if (r.status === 'accepted') { H.toast(`Te sumaste a ${g.name}.`); location.hash = `#/grupo/${r.group_id}`; } else { H.toast('Rechazaste la invitación.'); location.hash = '#/amigos'; } }
      catch (e) { el.querySelectorAll('[data-j]').forEach(x => x.disabled = false); const m = document.getElementById('gjmsg'); m.innerHTML = '<div class="msg err"></div>'; m.firstChild.textContent = e.message; } });
  }

  /* ---------- t163u: Comparativo (Semana | Mes), rankings per stat, member profiles and shared scorecards ---------- */
  const PST = { rounds: 'Rondas jugadas', best_net: 'Mejor neto vs par', best_gross: 'Mejor gross vs par', avg_gross: 'Promedio de golpes', hi_change: 'Cambio de hándicap', eagles: 'Águilas o mejor', birdies: 'Birdies', max_birdies: 'Máximo de birdies en una vuelta',
    birdie_pct: 'Birdie o mejor (% de hoyos)', pars: 'Pares', bogey_avoid: 'Bogey o peor (% de hoyos)', par3: 'Promedio en par 3', par4: 'Promedio en par 4', par5: 'Promedio en par 5',
    gir: 'Greens en regulación', fir: 'Fairways', scrambling: 'Scrambling', putts_round: 'Putts por ronda', putts_gir: 'Putts por green en regulación' };
  const PGROUPS = [['Scoring', ['avg_gross', 'best_gross', 'best_net', 'rounds', 'hi_change']], ['Birdies y pares', ['birdies', 'max_birdies', 'eagles', 'birdie_pct', 'pars', 'bogey_avoid']],
    ['Promedio por par', ['par3', 'par4', 'par5']], ['Greens, fairways y putts', ['gir', 'fir', 'scrambling', 'putts_round', 'putts_gir']]];
  const KINDS = [['semana', 'Semana'], ['mes', 'Mes']];
  const MINW = { r: ['ronda', 'rondas'], gh: ['hoyo con GIR', 'hoyos con GIR'], dr: ['salida medida', 'salidas medidas'], mg: ['green errado', 'greens errados'], pr: ['ronda con putts', 'rondas con putts'], gp: ['green en regulación con putts', 'greens en regulación con putts'] };
  const f2 = x => x == null ? '—' : (Math.round(x * 100) / 100).toFixed(2).replace('.', ',');
  const tpTxt = v => v == null ? '—' : v === 0 ? 'Par' : (v > 0 ? '+' : '−') + Math.abs(v);
  const pv = (def, x) => { if (!x || x.v == null) return '—'; const v = x.v;
    return def.fmt === 'n' ? String(v) : def.fmt === 'f' ? H.f1(v) : def.fmt === 'f2' ? f2(v) : def.fmt === 'p' ? `${H.f1(v).replace(/,0$/, '')} %` : def.fmt === 'tp' ? tpTxt(v) : def.fmt === 'hi' ? (v === 0 ? '0,0' : (v > 0 ? '+' : '−') + H.f1(Math.abs(v))) : String(v); };
  const nOf = (n, w) => `${n} ${n === 1 ? w[0] : w[1]}`;
  const sample = (def, x) => { if (!x || x.hidden || x.v == null) return '';
    const e = x.extra || {};
    if (def.key === 'best_net' || def.key === 'best_gross') return `${e.score} en ${H.esc(e.course || '')} · ${dmy(e.date)}`;
    if (def.key === 'avg_gross') return `${nOf(x.n, ['ronda', 'rondas'])}${e.to_par != null ? ` · ${e.to_par > 0 ? '+' : e.to_par < 0 ? '−' : ''}${H.f1(Math.abs(e.to_par))} vs par` : ''}`;
    if (def.key === 'hi_change') return `${H.f1(e.from)} → ${H.f1(e.to)}`;
    if (def.key === 'max_birdies') return nOf(x.n, ['vuelta con hoyos', 'vueltas con hoyos']);
    if (['eagles', 'birdies', 'pars'].includes(def.key)) return e.per_round != null ? `${H.f1(e.per_round)} por ronda` : '';
    if (def.key === 'birdie_pct' || def.key === 'bogey_avoid') return `${e.count} de ${x.n} hoyos`;
    if (/^par\d$/.test(def.key)) return `${nOf(x.n, ['hoyo', 'hoyos'])}${e.to_par != null ? ` · ${e.to_par > 0 ? '+' : e.to_par < 0 ? '−' : ''}${f2(Math.abs(e.to_par))} vs par` : ''}`;
    if (def.key === 'gir') return `${e.hit} de ${x.n} hoyos`;
    if (def.key === 'fir') return `${e.hit} de ${x.n} salidas`;
    if (def.key === 'scrambling') return `${e.saved} de ${nOf(x.n, ['green errado', 'greens errados'])}`;
    if (def.key === 'putts_round') return nOf(x.n, ['ronda', 'rondas']);
    if (def.key === 'putts_gir') return nOf(x.n, ['green', 'greens']);
    if (def.key === 'rounds') return '';
    return ''; };
  const dmy = s => { if (!s) return ''; const [y, m, d] = String(s).slice(0, 10).split('-'); return `${+d} ${['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][+m - 1]}${y !== String(new Date().getFullYear()) ? ' ' + y : ''}`; };
  const LOCK = '<svg class="gp-lk" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="2" fill="currentColor"/><path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
  const av = (m, cls = 'gg-av') => `<span class="${cls}" style="background:${m.color}" aria-hidden="true">${H.esc((m.name || '?').slice(0, 1))}</span>`;
  const who = (id, m) => m.profile === false && !m.is_me ? `<span class="gp-who">${H.esc(m.name)}${m.is_me ? ' (vos)' : ''}<span class="gp-lockt">${LOCK}</span></span>` : `<a class="gp-who" href="#/grupo/${id}/jugador/${m.member_id}">${H.esc(m.name)}${m.is_me ? ' (vos)' : ''}</a>`;
  const pq = off => off ? `?off=${off}` : '';
  function periodHead(id, d, kind, tail) {
    const P = d.period, base = k => `#/grupo/${id}/comparativo/${k}${tail ? '/' + tail : ''}`;
    return `<div class="seg vx-seg rng-seg gp-kind" role="tablist" aria-label="Período">${KINDS.map(([k, l]) => `<a role="tab" aria-selected="${k === kind}" class="${k === kind ? 'on' : ''}" href="${base(k)}">${l}</a>`).join('')}</div>
      <div class="gp-nav"><a class="gp-arr ${P.prev_off == null ? 'off' : ''}" ${P.prev_off == null ? 'aria-disabled="true"' : `href="${base(kind)}${pq(P.prev_off)}"`} aria-label="${kind === 'semana' ? 'Semana anterior' : 'Mes anterior'}">‹</a>
        <div class="gp-per"><b>${H.esc(P.short)}</b><span>${H.esc(P.label)}${P.in_progress ? ' · en curso' : ''}</span></div>
        <a class="gp-arr ${P.next_off == null ? 'off' : ''}" ${P.next_off == null ? 'aria-disabled="true"' : `href="${base(kind)}${pq(P.next_off)}"`} aria-label="${kind === 'semana' ? 'Semana siguiente' : 'Mes siguiente'}">›</a></div>`;
  }
  const minTxt = (d, def) => def.min ? `Para entrar en el ranking: ${nOf(d.mins[def.min], MINW[def.min])} en ${d.period.kind === 'semana' ? 'la semana' : 'el mes'}.` : '';
  function drawPeriod(el, id, d, kind) {
    const M = new Map(d.members.map(m => [m.member_id, m])), SD = Object.fromEntries(d.stats.map(s => [s.key, s])), P = d.period, off = P.off;
    const statHref = k => `#/grupo/${id}/comparativo/${kind}/${k}${pq(off)}`;
    const L = d.leaderboard, anyRounds = L.rows.length > 0;
    const lb = anyRounds ? `<div class="card gg-list gp-lb">${L.rows.map(r => { const m = M.get(r.member_id), s = m.stats;
        const subs = [s.rounds?.v != null ? nOf(s.rounds.v, ['ronda', 'rondas']) : null, s.avg_gross?.v != null ? `prom. ${H.f1(s.avg_gross.v)}` : null, s.hi_change?.v != null ? `HI ${pv(SD.hi_change, s.hi_change)}` : null].filter(Boolean).join(' · ');
        return `<div class="row gp-lr ${d.leaderboard.rows[0].pos === r.pos ? 'lead' : ''}"><span class="gp-pos num">${r.pos}</span>${av(m)}<div class="gg-t">${who(id, m)}<span>${subs}</span></div>
          <a class="gp-lv" href="${statHref(s.best_net?.v != null ? 'best_net' : 'best_gross')}"><b class="num">${s.best_net?.v != null ? tpTxt(s.best_net.v) : s.best_gross?.v != null ? tpTxt(s.best_gross.v) : '—'}</b><small>${s.best_net?.v != null ? 'mejor neto' : 'mejor gross'}</small></a></div>`; }).join('')}
        ${L.rest.map(r => { const m = M.get(r.member_id); return `<div class="row gp-lr gp-out"><span class="gp-pos">—</span>${av(m)}<div class="gg-t">${who(id, m)}<span>${r.state === 'hidden' ? 'No comparte sus scores' : `Sin tarjetas ${P.off ? 'en el período' : kind === 'semana' ? 'esta semana' : 'este mes'}`}</span></div></div>`; }).join('')}</div>
        <p class="foot">Ordenado por mejor neto vs par; si empatan, mejor gross y después promedio. Tocá un jugador para ver su perfil (si lo comparte) o el número para ver el ranking.</p>`
      : `<div class="empty-card"><b>Nadie cargó tarjetas ${P.off ? 'en ' + (kind === 'semana' ? 'esa semana' : 'ese mes') : kind === 'semana' ? 'esta semana' : 'este mes'}</b>Las tarjetas llegan solas cuando sincroniza tu club. ${P.prev_off != null ? `<a class="link" href="#/grupo/${id}/comparativo/${kind}${pq(P.prev_off)}">Ver ${kind === 'semana' ? 'la semana anterior' : 'el mes anterior'}</a>` : ''}</div>`;
    const tile = k => { const def = SD[k], b = d.boards[k], top = b.leaders.map(x => M.get(x)), v = top[0]?.stats[k];
      const anyData = d.members.some(m => m.stats[k] && !m.stats[k].hidden && m.stats[k].v != null);
      return `<a class="card stat vx-tap gp-tile" href="${statHref(k)}"><div class="k">${H.esc(def.short)}</div><div class="v num">${top.length ? pv(def, v) : '—'}</div>
        <div class="d">${top.length ? `${top.slice(0, 2).map(m => H.esc(m.name.split(' ')[0])).join(', ')}${top.length > 2 ? ` y ${top.length - 2} más` : ''}` : anyData ? (b.ranked ? 'Sin líder' : 'Nadie llega al mínimo') : 'Sin datos'}</div></a>`; };
    const gpsEmpty = !d.data.gps_or_cards_any;
    el.innerHTML = `${bar('Comparativo', d.group.name)}${periodHead(id, d, kind, '')}
      <div class="section"><h2>Leaderboard</h2>${anyRounds ? `<span class="badge">${nOf(L.rows.length, ['jugador', 'jugadores'])}</span>` : ''}</div>${lb}
      ${PGROUPS.map(([t, ks]) => t === 'Greens, fairways y putts' && gpsEmpty
        ? `<div class="section"><h2>${t}</h2></div><div class="empty-card gp-gps"><b>Sin datos de greens, fairways ni putts ${P.off ? 'en el período' : kind === 'semana' ? 'esta semana' : 'este mes'}</b>Las tarjetas del club traen solo los golpes por hoyo. Estos números salen de las rondas jugadas con el GPS de Golflet (Ronda con GPS) o de los putts, greens y fairways que cada uno carga en su tarjeta. ${ks.map(k => `<a class="vx-chip" href="${statHref(k)}">${H.esc(SD[k].short)}</a>`).join('')}</div>`
        : `<div class="section"><h2>${t}</h2></div><div class="grid2 gp-grid">${ks.map(tile).join('')}</div>`).join('')}
      <p class="foot">Solo cuentan tarjetas reales de 18 hoyos y rondas con GPS ${kind === 'semana' ? 'de lunes a domingo' : 'del mes calendario'}. Promedios y porcentajes piden un mínimo: ${nOf(d.mins.r, MINW.r)}, ${nOf(d.mins.gh, MINW.gh)} para GIR, ${nOf(d.mins.dr, MINW.dr)} para fairways. Quien no comparte una métrica no aparece en ese ranking. <a class="link" href="#/compartir">Qué comparto</a></p>`;
  }
  function drawPStat(el, id, d, kind, k) {
    const def = d.stats.find(s => s.key === k); if (!def) { el.innerHTML = `${bar('Ranking', d.group.name)}<p class="msg">Métrica desconocida.</p>`; return; }
    const M = new Map(d.members.map(m => [m.member_id, m])), b = d.boards[k];
    const vals = b.rows.filter(r => r.state === 'ranked').map(r => M.get(r.member_id).stats[k].v), mx = Math.max(...vals.map(Math.abs), 0), mn = Math.min(...vals, 0);
    const w = v => { if (v == null || !vals.length) return 0; if (def.low) { const hi = Math.max(...vals), lo = Math.min(...vals); return hi === lo ? 100 : 30 + 70 * (hi - v) / (hi - lo); } return mx ? 8 + 92 * Math.max(0, v) / mx : 8; };
    void mn;
    el.innerHTML = `${bar(def.label, d.group.name)}${periodHead(id, d, kind, k)}
      <p class="gg-lede">${H.esc(def.desc)}</p>
      <div class="card gg-bars gp-bars">${b.rows.map(r => { const m = M.get(r.member_id), x = m.stats[k] || {};
        const right = r.state === 'hidden' ? NS : `<b class="num">${pv(def, x)}</b>`;
        const sub = r.state === 'ranked' ? sample(def, x) : r.state === 'below_min' ? `Necesita ${nOf(x.need, MINW[def.min] || ['', ''])} (tiene ${x.have})` : r.state === 'no_data' ? (def.gps ? 'Sin datos de GPS ni de tarjeta' : 'Sin datos en el período') : 'No comparte esta métrica';
        return `<div class="gp-br ${r.state !== 'ranked' ? 'gp-out' : ''} ${b.leaders.includes(r.member_id) ? 'lead' : ''}"><span class="gg-rk num">${r.pos ?? '—'}</span><span class="gp-nmw">${av(m, 'gg-av gp-avs')}<span class="gp-nmc">${who(id, m)}<small>${sub}</small></span></span>
          ${r.state === 'ranked' ? `<span class="gg-track"><i style="width:${w(x.v)}%;background:${m.color}"></i></span>` : '<span></span>'}${right}</div>`; }).join('')}</div>
      <p class="foot">${def.low ? 'Menos es mejor.' : 'Más es mejor.'} ${minTxt(d, def)} ${def.gps ? 'Sale de las rondas con GPS de Golflet y de lo que cada uno carga en su tarjeta (una ronda vinculada cuenta una sola vez).' : 'Sale de las tarjetas del club.'} Empates comparten el puesto.</p>
      <div class="section"><h2>Otras métricas</h2></div><div class="vx-chips gp-more">${d.stats.filter(s => s.key !== k).map(s => `<a class="vx-chip" href="#/grupo/${id}/comparativo/${kind}/${s.key}${pq(d.period.off)}">${H.esc(s.short)}</a>`).join('')}</div>`;
  }
  function drawProfile(el, id, d) {
    const m = d.member;
    const head = `<div class="bar"><span class="overline">${H.esc(d.group.name)}</span></div><div class="gp-ph">${av(m, 'gg-av gp-pav')}<div><div class="stitle">${H.esc(m.name)}${m.is_me ? ' (vos)' : ''}</div>${!d.locked && d.clubs?.length ? `<div class="gp-clubs">${d.clubs.map(H.esc).join(' · ')}</div>` : ''}</div></div>`;
    if (d.locked) { el.innerHTML = `${head}<div class="card gp-locked">${LOCK}<div><b>${m.is_me ? 'Así te ven: tu perfil está cerrado' : `${H.esc(m.name.split(' ')[0])} no comparte su perfil`}</b><p>${m.is_me ? 'Los jugadores de tus grupos solo ven tu nombre. Podés abrirlo en Qué comparto.' : 'Solo ves su nombre. Sus números que comparta siguen apareciendo en la tabla y el comparativo del grupo.'}</p>${m.is_me ? '<a class="btn sm" href="#/compartir">Ir a Qué comparto</a>' : ''}</div></div>`; return; }
    const Y = d.year || {}, S = d.shares, ml = k => `#/grupo/${id}/m/${k}?range=12m`;
    const t = (k, l, v, sub) => `<a class="card stat vx-tap" href="${ml(k)}"><div class="k">${l}</div><div class="v num">${v}</div>${sub ? `<div class="d">${sub}</div>` : ''}</a>`;
    const hidden = [['scores', 'Rondas y scores'], ['handicap', 'Hándicap'], ['score_types', 'Águilas, birdies, pares y bogeys'], ['holes', 'Promedios por par'], ['gir_fir', 'Greens y fairways'], ['putting', 'Putts'], ['rounds_detail', 'Tarjetas hoyo por hoyo']].filter(([k]) => !S[k]).map(x => x[1]);
    const hh = d.hi_history || [];
    el.innerHTML = `${head}
      ${m.is_me ? `<div class="msg gp-me">Así te ven los jugadores de este grupo. <a class="link" href="#/compartir">Cambiar en Qué comparto</a></div>` : ''}
      <div class="section"><h2>Últimos 12 meses</h2></div>
      ${S.scores || S.handicap ? `<div class="grid2">${S.scores ? t('rounds', 'Rondas', Y.rounds ?? 0) + t('avg_gross', 'Promedio gross', H.f1(Y.avg_gross), Y.best_gross ? `Mejor ${Y.best_gross}` : '') + t('avg_net', 'Promedio neto', H.f1(Y.avg_net), Y.best_net ? `Mejor ${Y.best_net}` : '') : ''}
        ${S.handicap ? t('handicap', 'Hándicap Index', H.f1(Y.handicap_index), hh.length >= 2 ? `Hace un año ${H.f1(hh[0].hi)}` : '') : ''}</div>` : ''}
      ${S.score_types && Y.types ? `<div class="section"><h2>Por ronda</h2></div><div class="grid2">${[['eagles', 'Águilas'], ['birdies', 'Birdies'], ['pars', 'Pares'], ['bogeys', 'Bogeys']].map(([k, l]) => t(k, l, H.f1(Y.types[k]?.per_round), `${Y.types[k]?.total ?? 0} en total`)).join('')}</div>` : ''}
      ${S.holes && Y.par ? `<div class="section"><h2>Promedio por par</h2></div><div class="grid2">${[3, 4, 5].map(p => t('par' + p, `Par ${p}`, f2(Y.par['par' + p]?.avg), Y.par['par' + p]?.n ? `${Y.par['par' + p].n} hoyos` : 'Sin hoyos')).join('')}</div>` : ''}
      ${(S.putting || S.gir_fir) && Y.putting && (Y.putting.rounds || Y.putting.rounds_gir || Y.putting.rounds_fir) ? `<div class="section"><h2>Cargado en la tarjeta</h2></div><div class="grid2">${S.putting && Y.putting.rounds ? t('putts', 'Putts por ronda', H.f1(Y.putting.avg_putts), nOf(Y.putting.rounds, ['ronda', 'rondas'])) : ''}${S.gir_fir && Y.putting.rounds_gir ? t('gir', 'Greens por ronda', H.f1(Y.putting.avg_gir), nOf(Y.putting.rounds_gir, ['ronda', 'rondas'])) : ''}${S.gir_fir && Y.putting.rounds_fir ? t('fir', 'Fairways por ronda', H.f1(Y.putting.avg_fir), nOf(Y.putting.rounds_fir, ['ronda', 'rondas'])) : ''}</div>` : ''}
      <div class="section"><h2>Tarjetas</h2>${d.rounds ? `<span class="badge">${d.rounds.length}</span>` : ''}</div>
      ${d.rounds ? (d.rounds.length ? `<div class="card gg-list">${d.rounds.map(r => `<a class="row" href="#/grupo/${id}/jugador/${m.member_id}/ronda/${encodeURIComponent(r.round_id)}"><div class="gg-t"><b>${dmy(r.date)} · ${H.esc(r.course_label || '')}</b><span>Gross ${r.gross ?? '—'}${r.net != null ? ` · neto ${r.net}` : ''}${r.to_par != null ? ` · ${tpTxt(r.to_par)}` : ''}</span></div>${CHEV}</a>`).join('')}</div><p class="foot">Las últimas 20.</p>` : '<p class="foot">Todavía no tiene tarjetas.</p>')
        : `<div class="card gp-locked">${LOCK}<div><b>${m.is_me ? 'Tus tarjetas no se comparten' : 'No comparte sus tarjetas hoyo por hoyo'}</b><p>${m.is_me ? 'Si querés que tus grupos abran cada ronda, activá “Mis tarjetas hoyo por hoyo” en Qué comparto.' : 'Ves sus promedios, no cada ronda.'}</p></div></div>`}
      ${hidden.length ? `<p class="foot">${m.is_me ? 'No compartís' : 'No comparte'}: ${hidden.join(', ')}. Nunca se comparten notas, audios, estrategia ni salidas reservadas.</p>` : '<p class="foot">Nunca se comparten notas, audios, estrategia ni salidas reservadas.</p>'}`;
  }
  function drawCard(el, id, d) {
    const c = d.card, m = d.member, hs = c.holes;
    const cell = h => { const tp = h.score && h.par ? h.score - h.par : null; return `<td style="background:${heatCol(tp)};color:${heatInk(tp)}"><b class="num">${h.score ?? '—'}</b></td>`; };
    const nine = (a, lab) => !a.length ? '' : `<div class="card gg-board gp-cardt"><div class="tscroll"><table class="gg-t"><thead><tr><th>${lab}</th>${a.map(h => `<th class="num">${h.hole}</th>`).join('')}<th>Tot</th></tr></thead><tbody>
      <tr><th>Par</th>${a.map(h => `<td class="num">${h.par ?? '—'}</td>`).join('')}<td class="num">${a.reduce((s, h) => s + (h.par || 0), 0) || '—'}</td></tr>
      <tr><th>Golpes</th>${a.map(cell).join('')}<td class="num"><b>${a.reduce((s, h) => s + (h.score || 0), 0) || '—'}</b></td></tr></tbody></table></div></div>`;
    el.innerHTML = `<div class="bar"><span class="overline">${H.esc(m.name)}${m.is_me ? ' (vos)' : ''}</span></div><div class="stitle">${dmy(c.date)} · ${H.esc(c.course_label || '')}</div>
      <div class="pills"><div class="pill dark"><b class="num">${c.gross ?? '—'}</b><span>Gross</span></div><div class="pill"><b class="num">${c.net ?? '—'}</b><span>Neto</span></div><div class="pill"><b class="num">${tpTxt(c.to_par)}</b><span>vs par</span></div></div>
      <div class="section"><h2>Hoyo por hoyo</h2></div>${nine(hs.filter(h => h.hole <= 9), 'Ida')}${nine(hs.filter(h => h.hole > 9), 'Vuelta')}
      <div class="gg-key"><span><i style="background:#C8102E"></i>birdie o mejor</span><span><i style="background:#0B2545"></i>par</span><span><i style="background:#DCD6C8"></i>bogey</span><span><i style="background:#C8102E"></i>doble o peor</span></div>
      ${c.putts != null || c.gir != null || c.fir != null ? `<div class="section"><h2>Cargado en la tarjeta</h2></div><div class="pills">${c.putts != null ? `<div class="pill"><b class="num">${c.putts}</b><span>Putts</span></div>` : ''}${c.gir != null ? `<div class="pill"><b class="num">${c.gir}</b><span>Greens</span></div>` : ''}${c.fir != null ? `<div class="pill"><b class="num">${c.fir}</b><span>Fairways</span></div>` : ''}</div>` : ''}
      <p class="foot">${m.is_me ? 'Así ven tu tarjeta los jugadores del grupo.' : `${H.esc(m.name.split(' ')[0])} comparte sus tarjetas con el grupo.`} Las notas de la ronda nunca se comparten.</p>`;
  }

  const label = h => { const p = h.replace(/^#\/?/, '').split('?')[0].split('/'); if (p[0] === 'amigos') return p[1] === 'nuevo' ? 'Nuevo grupo' : 'Amigos';
    if (p[0] === 'unirse') return 'Invitación'; if (p[0] === 'compartir') return 'Qué comparto';
    if (p[2] === 'comparativo') return p[4] ? (PST[p[4]] || 'Ranking') : 'Comparativo';
    if (p[2] === 'jugador') return p[4] === 'ronda' ? 'Tarjeta' : 'Perfil';
    return p[2] === 'm' ? (MT[p[3]]?.[1] || 'Métrica') : p[2] === 'hoyos' ? 'Hoyo por hoyo' : p[2] === 'hoyo' ? `Hoyo ${p[3]}` : p[2] === 'miembros' ? 'Jugadores' : p[2] === 'vs' ? 'Mano a mano' : p[2] === 'vista' ? 'Mi vista' : p[2] === 'ajustes' ? 'Ajustes' : 'Grupo'; };
  const parent = h => { const p = h.replace(/^#\/?/, '').split('?')[0].split('/'), qs = h.includes('?') ? '?' + h.split('?')[1] : '';
    if (p[0] === 'amigos') return p[1] ? '#/amigos' : '#/inicio';
    if (p[0] === 'unirse') return '#/amigos'; if (p[0] === 'compartir') return '#/cuenta';
    if (!p[2]) return '#/amigos';
    if (p[2] === 'comparativo') { const off = new URLSearchParams(qs.slice(1)).get('off'); return p[4] ? `#/grupo/${p[1]}/comparativo/${p[3] || 'semana'}${off ? '?off=' + off : ''}` : `#/grupo/${p[1]}`; }
    if (p[2] === 'jugador') return p[4] === 'ronda' ? `#/grupo/${p[1]}/jugador/${p[3]}` : `#/grupo/${p[1]}`;
    if (p[2] === 'hoyo') return `#/grupo/${p[1]}/hoyos${qs}`; return `#/grupo/${p[1]}${p[2] === 'hoyos' ? new URLSearchParams(qs.slice(1)).has('year') ? '?year=' + new URLSearchParams(qs.slice(1)).get('year') : '' : ''}`; };
  window.GolfletGroups = { init: h => { H = h; }, page, load, label, parent };
})();
