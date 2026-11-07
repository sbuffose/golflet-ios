/* t202u "Subir libreta": photos of the pencil shot log are read ON THE PHONE (window.GolfletPlanCore.readCard; photos never leave the device),
   then the player reviews every hole and confirms it. Only confirmed holes are saved (POST /api/shotlog). Manual entry by tapping is the fallback.
   X marks: the player taps them on the photo → estimated distance from the tee (card ruler). No score (it comes from the club card). API_v5 §66.
   Route: #/plan/subir/<club>/<course>[?plan=<id>]. window.GolfletSubir. */
(() => {
  const C = () => window.GolfletPlanCore;
  const FP = [['fp_lt1', '<1 m'], ['fp_1_3', '1–3 m'], ['fp_3_6', '3–6 m'], ['fp_6p', '6+ m']];
  const today = () => { const d = new Date(Date.now() - 3 * 3600e3); return d.toISOString().slice(0, 10); };   // Argentina (UTC−3)
  const on = (b, v) => `class="${v ? 'on' : ''}" aria-pressed="${!!v}"`;

  // nearest point on the card ruler (polyline [x, y, yd] in card pt) → yards from the tee
  function ydOnRuler(R, x, y) {
    if (!R || R.length < 2) return null; let best = null;
    for (let i = 0; i < R.length - 1; i++) { const [ax, ay, ad] = R[i], [bx, by, bd] = R[i + 1], vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1;
      const t = Math.max(-.15, Math.min(1.1, ((x - ax) * vx + (y - ay) * vy) / L2)), px = ax + vx * t, py = ay + vy * t, dd = Math.hypot(x - px, y - py);
      if (!best || dd < best.d) best = { d: dd, yd: ad + (bd - ad) * t }; }
    return best ? Math.max(0, Math.round(best.yd)) : null;
  }
  async function toGray(file) {
    const url = URL.createObjectURL(file);
    try { const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('No pudimos abrir la foto')); i.src = url; });
      const w = 1000, h = Math.round(img.naturalHeight * w / img.naturalWidth), cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0, w, h);
      const px = cx.getImageData(0, 0, w, h).data, d = new Uint8Array(w * h);
      for (let i = 0, j = 0; i < d.length; i++, j += 4) d[i] = (px[j] * 77 + px[j + 1] * 150 + px[j + 2] * 29) >> 8;
      return { g: { w, h, d }, src: cv.toDataURL('image/jpeg', .82) };   // kept in memory only, never uploaded
    } finally { URL.revokeObjectURL(url); }
  }

  async function view(el, o) {
    const { H, live, club, course, plan } = o, e = s => H.esc(s == null ? '' : String(s));
    const [M, CL] = await Promise.all([
      H.api(plan ? `/api/plans/${encodeURIComponent(plan)}/yardbook?as=cards` : `/api/course-maps/${encodeURIComponent(club)}/${encodeURIComponent(course)}/libreta?as=cards`),
      H.api('/api/plans/clubs').catch(() => ({ clubs: [] }))]);
    if (!live('gp')) return;
    const bag = (CL.clubs || []).map(c => c.code), hash = C().courseHash5(String(M.course.club_code), String(M.course.course));
    const S = { date: M.date || today(), fmt: 'duplex', holes: {}, cur: null, saved: new Set(), msg: '' };
    const metaFor = (torneo, hole) => (M.cards[`${torneo ? 'torneo' : 'normal'}|${S.fmt}`] || {}).holes?.[hole] || null;
    const cardPt = torneo => M.cards[`${torneo ? 'torneo' : 'normal'}|${S.fmt}`]?.card_pt || [280.63, torneo ? 501.73 : 595.28];
    const allHoles = Object.keys(M.cards['torneo|duplex'].holes).map(Number).sort((a, b) => a - b);
    const blank = (hole, read) => { const m = metaFor(true, hole) || {}; return { hole, par: m.par ?? null, planned: m.clubs || [], clubs: [], fairway: null, gir: false, bunker: false, penalty: false,
      putts: null, first_putt: null, marks: [], read, confirmed: false, unsure: [], torneo: true }; };

    async function loadSaved() {
      try { const r = await H.api(`/api/shotlog?club_code=${encodeURIComponent(M.course.club_code)}&course=${encodeURIComponent(M.course.course)}&date=${S.date}`);
        S.saved = new Set(r.holes.filter(x => x.source === 'libreta').map(x => x.hole)); } catch { S.saved = new Set(); }
    }
    async function addPhotos(files) {
      const out = [];
      for (const f of files) {
        try { const { g, src } = await toGray(f);
          const r = C().readCard(g, (id, Hc) => { const m = metaFor(id.torneo, id.hole); return C().cardLayout({ H: Hc, par: m?.par ?? 4, mode: id.mode, clubs: m?.clubs || [] }); });
          if (!r.ok) { out.push(`${e(f.name || 'Foto')}: ${e(r.reason)}. Sacala de frente, con las 4 marcas negras de las esquinas a la vista.`); continue; }
          if (r.id.course_hash !== hash || r.id.mode !== M.mode) { out.push(`Una foto es del hoyo ${r.id.hole} de otra cancha o de otra libreta: no la usamos.`); continue; }
          const h = blank(r.id.hole, 'foto'), K = r.marks, [cw, ch] = cardPt(r.id.torneo);
          h.torneo = r.id.torneo; h.src = src; h.H = r.H; h.w = g.w; h.h = g.h; h.cw = cw; h.ch = ch;
          h.clubs = h.planned.length ? r.clubs_played.map(i => h.planned[i]).filter(Boolean) : [];
          h.fairway = r.fairway; h.gir = !!K.gir?.on; h.bunker = !!K.bunker?.on; h.penalty = !!K.penal?.on; h.putts = r.putts; h.first_putt = r.first_putt;
          h.unsure = Object.entries(K).filter(([, v]) => v.unsure).map(([k]) => k); if (r.putts_unsure) h.unsure.push('putts');
          S.holes[h.hole] = h; if (S.cur == null) S.cur = h.hole;
        } catch (err) { out.push(e(err.message || 'No pudimos leer la foto')); }
      }
      S.msg = out.join('<br>'); draw();
    }
    const tile = n => { const h = S.holes[n], st = h?.confirmed ? 'ok' : h ? 'rev' : S.saved.has(n) ? 'sv' : '';
      return `<button type="button" class="sb-t ${st} ${S.cur === n ? 'cur' : ''}" data-h="${n}" aria-label="Hoyo ${n}${st === 'ok' ? ', confirmado' : st === 'rev' ? ', para revisar' : st === 'sv' ? ', ya guardado' : ''}"><b class="num">${n}</b><small>${st === 'ok' ? '✓' : st === 'rev' ? 'ver' : st === 'sv' ? 'listo' : '—'}</small></button>`; };
    function photoHtml(h) {
      if (!h.src) return '';
      const inv = C().homography([[0, 0], [h.cw, 0], [0, h.ch], [h.cw, h.ch]].map(([x, y]) => C().project(h.H, x, y)), [[0, 0], [h.cw, 0], [0, h.ch], [h.cw, h.ch]]);
      h.inv = inv; const fw = C().project(h.H, 0, 0);
      const dots = h.marks.map(m => { const [px, py] = C().project(h.H, m.x * h.cw, m.y * h.ch); return `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="11"/><text x="${(px + 14).toFixed(1)}" y="${(py - 10).toFixed(1)}">${m.n}</text>`; }).join('');
      void fw;
      return `<div class="sb-ph"><img src="${h.src}" alt="Foto de la tarjeta del hoyo ${h.hole}"><svg viewBox="0 0 ${h.w} ${h.h}" id="sbtap" aria-hidden="true">${dots}</svg></div>
        <p class="foot">Tocá en la foto cada X que marcaste, en orden (1, 2, 3…). La distancia es estimada.${h.marks.length ? ` <button type="button" class="linkb" id="sbundo">Borrar la última</button>` : ''}</p>`;
    }
    function review(h) {
      const u = k => h.unsure.includes(k) ? ' sb-u' : '', m = metaFor(h.torneo, h.hole), opts = [...new Set([...h.planned, ...bag])];
      const shots = h.clubs.map((c, i) => `<span class="sb-shot"><b class="num">${i + 1}</b>${e(c)}${h.marks[i]?.yd_est != null ? ` <small class="num">~${h.marks[i].yd_est} yd</small>` : ''}</span>`).join('');
      return `<section class="card sb-rv" aria-label="Hoyo ${h.hole}">
        <div class="sb-hd"><b>Hoyo ${h.hole}</b><span>${h.par ? `Par ${h.par}` : ''} · ${h.read === 'foto' ? 'leído de la foto' : 'a mano'}</span></div>
        ${h.unsure.length ? '<p class="foot gp-warn">Lo marcado en amarillo no se leyó claro: revisalo.</p>' : ''}
        ${photoHtml(h)}
        <div class="sb-f${u('club_0')}${u('club_1')}${u('club_2')}"><span class="gp-l">Palos</span>
          <div class="sb-shots">${shots || '<span class="foot">Tocá los palos en el orden en que pegaste</span>'}${h.clubs.length ? '<button type="button" class="linkb" id="sbcx">Borrar el último</button>' : ''}</div>
          <div class="sb-chips">${opts.map(c => `<button type="button" data-c="${e(c)}" class="${h.planned.includes(c) ? 'pl' : ''}">${e(c)}</button>`).join('')}</div></div>
        ${h.par !== 3 ? `<div class="sb-f${u('fw_l')}${u('fw_c')}${u('fw_r')}"><span class="gp-l">Fairway</span><div class="seg" id="sbfw">${[['izq', '← Izq.'], ['centro', '✓ Sí'], ['der', 'Der. →']].map(([k, l]) => `<button type="button" data-v="${k}" ${on(0, h.fairway === k)}>${l}</button>`).join('')}</div></div>` : ''}
        <div class="sb-f"><span class="gp-l">Marcas</span><div class="sb-tg">${[['gir', 'GIR'], ['bunker', 'Bunker'], ['penalty', 'Penal.']].map(([k, l]) => `<button type="button" data-t="${k}" ${on(0, h[k])} class="${h[k] ? 'on' : ''}${u(k === 'penalty' ? 'penal' : k)}">${l}</button>`).join('')}</div></div>
        <div class="sb-f${u('putts')}"><span class="gp-l">Putts</span><div class="seg" id="sbpt">${[0, 1, 2, 3, 4].map(n => `<button type="button" data-v="${n}" ${on(0, h.putts === n)}>${n === 4 ? '4+' : n}</button>`).join('')}</div></div>
        <div class="sb-f"><span class="gp-l">1er putt</span><div class="seg" id="sbfp">${FP.map(([k, l]) => `<button type="button" data-v="${k}" ${on(0, h.first_putt === k)}>${l}</button>`).join('')}</div></div>
        ${!m?.ruler && h.src ? '<p class="foot">Este hoyo no tiene línea de juego en la libreta: las X quedan guardadas sin distancia.</p>' : ''}
        <button type="button" class="btn" id="sbok">${h.confirmed ? 'Confirmado ✓' : `Confirmar hoyo ${h.hole}`}</button>
      </section>`;
    }
    function draw() {
      if (!live('gp')) return; const h = S.cur != null ? S.holes[S.cur] : null, n = Object.values(S.holes).filter(x => x.confirmed).length;
      el.innerHTML = `<div class="stitle">Subir libreta</div><p class="foot gp-sub">${e(M.course.course)}${M.mode === 'estrategia' ? ' · con tu estrategia' : ' · libreta de la cancha'}</p>
        <p class="lede">Sacale una foto al frente de cada tarjeta, con las 4 marcas negras de las esquinas a la vista. Las fotos se leen en tu teléfono y no se suben. Revisá y confirmá cada hoyo.</p>
        <div class="card sb-set">
          <label class="gp-f">Fecha<input type="date" id="sbdate" value="${e(S.date)}" ${M.date ? 'disabled' : ''}></label>
          <div class="gp-f"><span class="gp-l">La imprimiste</span><div class="seg" id="sbfmt">${[['duplex', 'Doble faz'], ['simplex', 'Una cara']].map(([k, l]) => `<button type="button" data-f="${k}" ${on(0, S.fmt === k)}>${l}</button>`).join('')}</div></div>
          <label class="btn sb-up">Sacar o elegir fotos<input type="file" id="sbfile" accept="image/*" capture="environment" multiple hidden></label>
          <button type="button" class="btn ghost" id="sbman">Cargar a mano</button>
        </div>
        ${S.msg ? `<p class="msg err" role="status">${S.msg}</p>` : ''}
        <div class="sb-grid" role="group" aria-label="Hoyos">${allHoles.map(tile).join('')}</div>
        ${h ? review(h) : ''}
        <div class="sb-save"><button type="button" class="btn" id="sbsave" ${n ? '' : 'disabled'}>${n ? `Guardar ${n} hoyo${n > 1 ? 's' : ''} confirmado${n > 1 ? 's' : ''}` : 'Confirmá al menos un hoyo'}</button>
          <p class="foot">Sin score: el score sale de la tarjeta del club. Es privado: solo lo ves vos.</p></div>
        <div id="sbres"></div>`;
      bind();
    }
    function bind() {
      const $ = s => el.querySelector(s), h = S.cur != null ? S.holes[S.cur] : null;
      $('#sbfile').onchange = ev => { const f = [...ev.target.files]; ev.target.value = ''; if (f.length) { el.querySelector('.sb-up').textContent = 'Leyendo…'; addPhotos(f); } };
      $('#sbman').onclick = () => { const n = allHoles.find(x => !S.holes[x]) ?? allHoles[0]; if (!S.holes[n]) S.holes[n] = blank(n, 'manual'); S.cur = n; draw(); };
      $('#sbdate').onchange = async ev => { S.date = ev.target.value || today(); await loadSaved(); draw(); };
      el.querySelectorAll('#sbfmt button').forEach(b => b.onclick = () => { S.fmt = b.dataset.f; draw(); });
      el.querySelectorAll('.sb-t').forEach(b => b.onclick = () => { const n = +b.dataset.h; if (!S.holes[n]) S.holes[n] = blank(n, 'manual'); S.cur = n; draw(); });
      $('#sbsave').onclick = save;
      if (!h) return; const redraw = () => { h.confirmed = false; draw(); };
      el.querySelectorAll('.sb-chips button').forEach(b => b.onclick = () => { if (h.clubs.length < 10) h.clubs.push(b.dataset.c); redraw(); });
      if ($('#sbcx')) $('#sbcx').onclick = () => { h.clubs.pop(); redraw(); };
      el.querySelectorAll('#sbfw button').forEach(b => b.onclick = () => { h.fairway = h.fairway === b.dataset.v ? null : b.dataset.v; redraw(); });
      el.querySelectorAll('.sb-tg button').forEach(b => b.onclick = () => { h[b.dataset.t] = !h[b.dataset.t]; redraw(); });
      el.querySelectorAll('#sbpt button').forEach(b => b.onclick = () => { h.putts = h.putts === +b.dataset.v ? null : +b.dataset.v; redraw(); });
      el.querySelectorAll('#sbfp button').forEach(b => b.onclick = () => { h.first_putt = h.first_putt === b.dataset.v ? null : b.dataset.v; redraw(); });
      const tap = $('#sbtap'); if (tap) tap.onclick = ev => { if (h.marks.length >= 10) return; const r = tap.getBoundingClientRect(), px = (ev.clientX - r.left) / r.width * h.w, py = (ev.clientY - r.top) / r.height * h.h;
        const [x, y] = C().project(h.inv, px, py); if (x < 0 || y < 0 || x > h.cw || y > h.ch) return;
        h.marks.push({ n: h.marks.length + 1, x: +(x / h.cw).toFixed(4), y: +(y / h.ch).toFixed(4), yd_est: ydOnRuler(metaFor(h.torneo, h.hole)?.ruler, x, y) }); redraw(); };
      if ($('#sbundo')) $('#sbundo').onclick = () => { h.marks.pop(); redraw(); };
      $('#sbok').onclick = () => { h.confirmed = true; h.unsure = []; const nx = allHoles.find(x => S.holes[x] && !S.holes[x].confirmed); S.cur = nx ?? h.hole; draw(); };
    }
    async function save() {
      const hs = Object.values(S.holes).filter(x => x.confirmed).map(x => ({ hole: x.hole, confirmed: true, read: x.read, clubs: x.clubs, fairway: x.par === 3 ? null : x.fairway,
        gir: x.gir, bunker: x.bunker, penalty: x.penalty, putts: x.putts, first_putt: x.first_putt, marks: x.marks }));
      const b = el.querySelector('#sbsave'); b.disabled = true; b.textContent = 'Guardando…';
      try { const r = await H.api('/api/shotlog', { method: 'POST', body: JSON.stringify({ club_code: M.course.club_code, course: M.course.course, date: S.date, plan_id: plan || null, source: 'libreta', holes: hs }) });
        for (const x of hs) { S.saved.add(x.hole); delete S.holes[x.hole]; } S.cur = null; draw();
        const s = r.stats || {}, est = r.club_estimates || [];
        el.querySelector('#sbres').innerHTML = `<section class="card sb-done" role="status"><b>Guardamos ${r.saved} hoyo${r.saved > 1 ? 's' : ''}</b>
          <div class="sb-st">${[['Fairways', s.fairway_pct != null ? s.fairway_pct + '%' : '—'], ['GIR', s.gir_pct != null ? s.gir_pct + '%' : '—'], ['Putts', s.putts_avg ?? '—'], ['Bunkers', s.bunkers ?? 0]].map(([l, v]) => `<span><small>${l}</small><b class="num">${v}</b></span>`).join('')}</div>
          ${est.length ? `<p class="foot">Distancias por palo (estimadas desde tus X): ${est.map(x => `${e(x.club)} ~${x.median_yd} yd (${x.n})`).join(' · ')}</p>` : ''}</section>`;
      } catch (err) { b.disabled = false; b.textContent = 'Reintentar'; S.msg = e(err.message || 'No pudimos guardar'); }
    }
    await loadSaved(); draw();
  }
  window.GolfletSubir = { view, ydOnRuler };
})();
