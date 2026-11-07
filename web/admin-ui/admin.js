/* Golflet admin: course strategy editor (Cómo jugar la cancha). Drafts autosave; publishing is always an explicit click. */
(() => {
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const HZ = { agua:'Agua', bunker:'Bunker', ob:'OB', arboles:'Árboles', pendiente:'Pendiente', green_elevado:'Green elevado', rough_alto:'Rough alto', otro:'Otro' };
const SIDE = { izquierda:'Izquierda', derecha:'Derecha', centro:'Centro', ambos_lados:'Ambos lados', frente_green:'Frente al green', detras_green:'Detrás del green' };
const MISS = { izquierda:'A la izquierda', derecha:'A la derecha', corto:'Corto', largo:'Largo' };
const LEVELS = [['scratch','Scratch (0–5)'],['medio','Hándicap medio (6–18)'],['alto','Hándicap alto (19+)']];
const STATUS = { none:['','Sin cargar'], draft:['draft','Borrador'], published:['published','Publicado'], changed:['changed','Cambios sin publicar'] };
const CLUBS = ['Driver','Madera 3','Madera 5','Híbrido','Hierro 4','Hierro 5','Hierro 6','Hierro 7','Hierro 8','Hierro 9','Pitching wedge','Gap wedge','Sand wedge','Lob wedge'];
const YD = 1 / 0.9144;

async function api(path, opt = {}) {
  const r = await fetch(path, { credentials:'same-origin', ...opt, headers:{ 'Content-Type':'application/json' } });
  if (r.status === 401) { location.href = '/admin/login?next=' + encodeURIComponent(location.pathname + location.search); throw new Error('auth'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'No se pudo completar');
  return j;
}
function toast(t, err) { const el = $('#toast'); el.className = err ? 'err' : ''; el.textContent = t; el.style.opacity = 1; clearTimeout(toast.t); toast.t = setTimeout(() => el.style.opacity = 0, 3600); }
const chip = st => { const [c, l] = STATUS[st] || STATUS.none; return `<span class="chip ${c}">${l}</span>`; };
const opts = (map, cur, empty) => (empty != null ? `<option value="">${empty}</option>` : '') + Object.entries(map).map(([k, l]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${l}</option>`).join('');
const ago = t => t ? new Date(t).toLocaleString('es-AR', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : '—';

let S = null, cur = 1, dirty = false, saveT = null, saving = null;
const setSave = (t, d) => { const el = $('#savestate'); el.textContent = t; el.className = 'save' + (d ? ' dirty' : ''); };

/* routing lives in shell.js (sidebar router); this file exposes the strategy views. */
/* ---------- course list ---------- */
async function courseList() {
  $('#title').textContent = 'Cómo jugar la cancha'; setSave('');
  const { courses } = await api('/api/admin/strategy');
  $('#main').innerHTML = `<p class="meta" style="margin:0 0 14px">Elegí una cancha. Lo que cargues queda como borrador hasta que toques Publicar; los jugadores ven solo lo publicado.</p>
  <div class="list">${courses.map(c => `<a class="card course" data-nav href="/admin/courses/${c.course_id}"><div class="overline">${esc(c.club_name || '')}</div><div class="ov"><div class="k">${esc(c.label)}</div>${c.published_holes >= 18 && !c.draft_holes ? chip('published') : c.published_holes ? `<span class="chip published">Publicado en parte</span>` : c.draft_holes || c.overview_published ? chip('draft') : chip('none')}</div>
    <div class="bar"><i style="width:${Math.round(c.published_holes * 100 / 18)}%"></i></div>
    <div class="meta num">${c.published_holes}/18 hoyos publicados · ${c.draft_holes} con borrador${c.overview_published ? ' · resumen publicado' : ''}<br>${c.has_osm ? 'Mapa con tees y peligros (OpenStreetMap)' : 'Mapa: solo greens'}${c.updated_at ? ' · editado ' + ago(c.updated_at) : ''}</div></a>`).join('')}</div>`;
}

/* ---------- course editor ---------- */
async function openCourse(id) {
  if (!S || S.course.course_id !== id) { $('#main').innerHTML = '<div class="empty">Cargando cancha…</div>'; S = await api(`/api/admin/strategy/${id}`); }
  $('#title').textContent = `${S.course.course || S.course.vm_course}${S.course.club_name ? ' · ' + S.course.club_name : ''}`;
  draw();
}
const H = () => S.holes.find(h => h.hole === cur) || S.holes[0];
function draw() {
  const h = H(); const d = h.draft;
  $('#main').innerHTML = `<div style="margin-bottom:14px"><a class="meta" data-nav href="/admin/strategy" style="text-decoration:none">← Todas las canchas</a></div>
  <div class="grid">
    <div class="card holes" id="holes">${holeList()}</div>
    <div>
      <div class="card" id="overview" style="margin-bottom:16px">${overviewBox()}</div>
      <div class="card" id="form">
        <div class="ov"><div><div class="overline">Hoyo ${h.hole} · Par ${h.par ?? '—'} · Handicap ${h.hcp ?? '—'}${Object.values(h.yards || {})[0] ? ' · ' + Object.values(h.yards)[0] + ' yd' : ''}</div><h2 style="margin:4px 0 0">Plan recomendado</h2></div><span id="hstat">${chip(h.status)}</span></div>
        <label>Título corto</label><input type="text" data-f="plan_title" maxlength="90" value="${esc(d.plan_title)}" placeholder="Ej.: Híbrido al centro y wedge al green">
        <label>Plan</label><textarea data-f="plan_text" placeholder="Cómo encarar el hoyo, golpe por golpe.">${esc(d.plan_text)}</textarea>
        <h3>Salida</h3>
        <div class="row2"><div><label>Palo recomendado</label><input type="text" data-f="tee_club" list="clubs" value="${esc(d.tee_club)}" placeholder="Ej.: Híbrido"></div>
          <div><label>Objetivo</label><input type="text" data-f="tee_target" value="${esc(d.tee_target)}" placeholder="Ej.: borde izquierdo del bunker del fairway"></div></div>
        <div class="meta" style="margin-top:6px">Punto objetivo: ${d.target ? `<b class="num">${d.target.lat.toFixed(5)}, ${d.target.lng.toFixed(5)}</b> <button class="btn ghost sm" data-act="cleartarget" style="margin-left:6px">Quitar</button>` : 'tocá el mapa para marcarlo (opcional).'}</div>
        <h3>Peligros</h3>
        <div id="hzlist">${hazardRows(d.hazards)}</div>
        <div class="acts" style="margin-top:10px"><button class="btn ghost sm" data-act="addhz">Agregar peligro</button><button class="btn ghost sm" data-act="prefill">Precargar peligros desde el mapa</button></div>
        <h3>Por qué</h3>
        <textarea data-f="why" placeholder="La razón del plan: qué castiga el hoyo y qué se gana jugándolo así.">${esc(d.why)}</textarea>
        <h3>Si errás</h3>
        <div class="row2"><div><label>Mejor lado para errar</label><select data-f="miss_side">${opts(MISS, d.miss_side, 'Sin indicar')}</select></div>
          <div><label>Nota</label><input type="text" data-f="miss_note" value="${esc(d.miss_note)}" placeholder="Ej.: si errás, que sea a la izquierda: desde ahí tenés green abierto"></div></div>
        <h3>Green</h3>
        <div class="row2"><div><label>Pendiente</label><input type="text" data-f="green_slope" value="${esc(d.green_slope)}" placeholder="Ej.: cae fuerte de atrás hacia adelante"></div>
          <div><label>Dónde dejarla</label><input type="text" data-f="green_leave" value="${esc(d.green_leave)}" placeholder="Ej.: abajo del hoyo, nunca pasada"></div></div>
        <label>Notas del green</label><textarea data-f="green_notes" style="min-height:60px">${esc(d.green_notes)}</textarea>
        <h3>Variantes por nivel <span style="text-transform:none;font-weight:500;color:var(--color-ink3)">(opcional)</span></h3>
        <div class="levels">${LEVELS.map(([k, l]) => `<div class="card"><b style="font-size:13.5px">${l}</b><label>Palo de salida</label><input type="text" list="clubs" data-v="${k}" data-vf="tee_club" value="${esc(d.variants?.[k]?.tee_club)}"><label>Plan</label><textarea data-v="${k}" data-vf="plan" style="min-height:70px">${esc(d.variants?.[k]?.plan)}</textarea></div>`).join('')}</div>
        <datalist id="clubs">${CLUBS.map(c => `<option value="${c}">`).join('')}</datalist>
      </div>
    </div>
    <div class="side">
      <div class="card" style="padding:10px"><div class="map" id="map">${mapSvg(h)}</div>
        <div class="legend"><span><i style="background:#8DBE73"></i>Green</span><span><i style="background:#EFE3C6;border:1px solid #d8c69a"></i>Bunker</span><span><i style="background:#BBD7DE"></i>Agua</span><span><i style="background:#C8A86A;border-radius:50%"></i>Peligro cargado</span><span><i style="background:#0F3D2E;border-radius:50%"></i>Objetivo</span></div>
        <div class="meta" style="margin-top:6px">${h.geo.tee ? 'Tee y línea de juego de OpenStreetMap.' : 'Sin salida mapeada: se muestra solo el green.'} ${esc(S.course.attribution || '')}</div></div>
      <div class="card"><div class="acts">
        <button class="btn" data-act="publish">Publicar hoyo ${h.hole}</button>
        ${h.published ? '<button class="btn neg" data-act="unpublish">Despublicar</button>' : ''}
        ${h.status === 'changed' ? '<button class="btn ghost" data-act="discard">Descartar cambios</button>' : ''}
      </div>
      <div class="meta" style="margin-top:10px">${h.updated_at ? `Borrador guardado ${ago(h.updated_at)}${h.updated_by ? ' por ' + esc(h.updated_by) : ''}` : 'Sin borrador'}<br>${h.published_at ? 'Publicado ' + ago(h.published_at) : 'No publicado'}</div>
      <div class="acts" style="margin-top:12px;border-top:1px solid var(--color-hairline);padding-top:12px"><button class="btn ghost sm" data-act="prefillall">Precargar peligros en los 18 hoyos</button><button class="btn gold sm" data-act="publishall">Publicar todo lo cargado</button></div></div>
    </div>
  </div>`;
  bind();
}
function holeList() {
  return S.holes.map(h => `<button class="hrow ${h.hole === cur ? 'on' : ''}" data-hole="${h.hole}"><b class="num">${h.hole}</b><span class="t">Par ${h.par ?? '—'}<span>${esc(h.draft.plan_title || (h.draft.hazards.length ? h.draft.hazards.length + ' peligros' : 'Sin cargar'))}</span></span>${chip(h.status)}</button>`).join('');
}
function overviewBox() {
  const o = S.overview;
  return `<div class="ov"><h2 style="margin:0">Resumen de la cancha</h2>${chip(o.status)}</div>
    <textarea id="ovtext" placeholder="Cómo encarar la cancha en general: viento, greens, dónde se gana y dónde se pierde." style="margin-top:10px">${esc(o.draft)}</textarea>
    <div class="acts" style="margin-top:8px"><button class="btn ghost sm" data-act="ovsave">Guardar borrador</button><button class="btn sm" data-act="ovpublish">Publicar resumen</button>${o.published != null ? '<button class="btn neg sm" data-act="ovunpublish">Despublicar</button>' : ''}<span class="meta" style="align-self:center">${o.published_at ? 'Publicado ' + ago(o.published_at) : ''}</span></div>`;
}
function hazardRows(list) {
  if (!list.length) return '<div class="empty">Sin peligros cargados. Agregalos a mano o precargalos desde el mapa.</div>';
  return `<div class="hzh"><span></span><span>Tipo</span><span>Lado</span><span>Desde (yd)</span><span>Carry (yd)</span><span class="note">Nota</span><span></span></div>` +
    list.map((z, i) => `<div class="hz" data-i="${i}"><span class="n ${z.at ? '' : 'off'}" title="${z.at ? 'En el mapa' : 'Sin ubicación'}">${i + 1}</span>
      <select data-h="type">${opts(HZ, z.type)}</select><select data-h="side">${opts(SIDE, z.side, 'Lado…')}</select>
      <input type="number" data-h="from_yd" class="num" min="0" max="700" value="${z.from_yd ?? ''}" placeholder="Desde (yd)" aria-label="Desde (yd)"><input type="number" data-h="carry_yd" class="num" min="0" max="700" value="${z.carry_yd ?? ''}" placeholder="Carry (yd)" aria-label="Carry (yd)">
      <span class="note"><input type="text" data-h="note" value="${esc(z.note)}" placeholder="Nota">${z.source === 'mapa' ? '<span class="src">del mapa · revisar</span>' : ''}</span><button class="x" data-act="delhz" aria-label="Quitar">×</button></div>`).join('');
}

/* ---------- map preview: tee at the bottom, green at the top, click = target ---------- */
let MAPT = null;
function mapSvg(h) {
  const g = h.geo, d = h.draft, W = 340, Hh = 460, pad = 26;
  const A = g.tee || g.green.front, B = g.tee ? g.green.center : g.green.back;
  const lat0 = A.lat, k = Math.cos(lat0 * Math.PI / 180) * 111320, kl = 110540;
  const xy = p => [(p.lng - A.lng) * k, (p.lat - A.lat) * kl];
  const [bx, by] = xy(B); const L = Math.hypot(bx, by) || 1, ux = bx / L, uy = by / L;
  const fr = p => { const [x, y] = xy(p); return [x * uy - y * ux, x * ux + y * uy]; };   // [side (right +), along]
  const pts = [g.green.front, g.green.center, g.green.back, ...(g.tee ? [g.tee] : []), ...(g.line || []), ...g.hazards.flatMap(z => z.polygon || []), ...d.hazards.filter(z => z.at).map(z => z.at), ...(d.target ? [d.target] : [])].map(fr);
  let minS = Math.min(...pts.map(p => p[0])), maxS = Math.max(...pts.map(p => p[0])), minA = Math.min(...pts.map(p => p[1])), maxA = Math.max(...pts.map(p => p[1]));
  if (!g.tee) { minA -= 60; maxA += 40; minS -= 50; maxS += 50; }
  const sc = Math.min((W - 2 * pad) / Math.max(60, maxS - minS), (Hh - 2 * pad) / Math.max(60, maxA - minA));
  const cx = W / 2 - ((minS + maxS) / 2) * sc, cy = Hh / 2 + ((minA + maxA) / 2) * sc;
  const P = p => { const [s, a] = fr(p); return [cx + s * sc, cy - a * sc]; };
  MAPT = { inv: (X, Y) => { const s = (X - cx) / sc, a = (cy - Y) / sc; const x = s * uy + a * ux, y = -s * ux + a * uy; return { lat: A.lat + y / kl, lng: A.lng + x / k }; } };
  const path = arr => arr.map((p, i) => { const [x, y] = P(p); return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`; }).join('');
  let s = `<rect width="${W}" height="${Hh}" fill="#E7EFDF"/>`;
  if (g.line) s += `<path d="${path(g.line)}" fill="none" stroke="#C9DDB6" stroke-width="${Math.max(18, 40 * sc)}" stroke-linecap="round" stroke-linejoin="round"/><path d="${path(g.line)}" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="1.3" stroke-dasharray="4 5"/>`;
  if (g.tee) { const [tx, ty] = P(g.tee); for (const yd of [100, 150, 200, 250, 300]) { const m = yd / YD; if (m > (maxA - 10)) continue; const y = ty - m * sc; s += `<line x1="${pad / 2}" x2="${W - pad / 2}" y1="${y}" y2="${y}" stroke="#0F3D2E" stroke-opacity=".08"/><text x="${W - 8}" y="${y - 3}" text-anchor="end" font-family="Geist" font-size="10.5" font-weight="600" fill="#5E6560">${yd}</text>`; } }
  for (const z of g.hazards) if (z.polygon?.length) s += `<path d="${path(z.polygon)}Z" fill="${z.type === 'water' ? '#BBD7DE' : '#EFE3C6'}" stroke="${z.type === 'water' ? '#8fb6c0' : '#d8c69a'}" stroke-width="1"/>`;
  const [gx, gy] = P(g.green.center), [fx, fy] = P(g.green.front), [bkx, bky] = P(g.green.back);
  const gr = Math.max(7, Math.hypot(bkx - fx, bky - fy) / 2 + 3);
  s += `<circle cx="${gx}" cy="${gy}" r="${gr + 6}" fill="#C3DDAE"/><circle cx="${gx}" cy="${gy}" r="${gr}" fill="#8DBE73"/><circle cx="${fx}" cy="${fy}" r="2.2" fill="#fff"/><circle cx="${bkx}" cy="${bky}" r="2.2" fill="#fff"/><line x1="${gx}" y1="${gy}" x2="${gx}" y2="${gy - 16}" stroke="#121614" stroke-width="1.4"/><path d="M${gx},${gy - 16} l10,3.5 -10,3.5z" fill="#C8A86A"/>`;
  if (g.tee) { const [tx, ty] = P(g.tee); s += `<rect x="${tx - 9}" y="${ty - 5}" width="18" height="10" rx="5" fill="#2D5BA8"/><text x="${tx}" y="${ty + 20}" text-anchor="middle" font-family="Geist" font-size="11" font-weight="600" fill="#121614">Tee</text>`; }
  d.hazards.forEach((z, i) => { if (!z.at) return; const [x, y] = P(z.at); s += `<circle cx="${x}" cy="${y}" r="9" fill="#C8A86A" stroke="#fff" stroke-width="1.5"/><text x="${x}" y="${y + 3.8}" text-anchor="middle" font-family="Geist" font-size="10.5" font-weight="700" fill="#1d1a12">${i + 1}</text>`; });
  if (d.target) { const [x, y] = P(d.target); s += `<circle cx="${x}" cy="${y}" r="11" fill="none" stroke="#0F3D2E" stroke-width="2"/><circle cx="${x}" cy="${y}" r="3" fill="#0F3D2E"/>`;
    if (g.tee) { const [tx, ty] = P(g.tee); const m = Math.hypot(x - tx, y - ty) / sc; s += `<path d="M${tx},${ty} L${x},${y}" stroke="#0F3D2E" stroke-width="1.4" stroke-dasharray="3 4"/><g transform="translate(${x + 14},${y - 10})"><rect width="54" height="20" rx="10" fill="#0F3D2E"/><text x="27" y="14" text-anchor="middle" font-family="Geist" font-size="11" font-weight="600" fill="#F7F5F0">${Math.round(m * YD)} yd</text></g>`; } }
  return `<svg viewBox="0 0 ${W} ${Hh}" id="mapsvg" role="img" aria-label="Mapa del hoyo ${h.hole}">${s}</svg>`;
}

/* ---------- form state ---------- */
function collect() {
  const h = H(), d = JSON.parse(JSON.stringify(h.draft));
  $$('#form [data-f]').forEach(el => d[el.dataset.f] = el.value || (el.tagName === 'SELECT' ? null : ''));
  d.variants = {}; for (const [k] of LEVELS) { const c = $(`#form input[data-v="${k}"]`).value, p = $(`#form textarea[data-v="${k}"]`).value; if (c || p) d.variants[k] = { tee_club: c, plan: p }; }
  d.hazards = $$('#hzlist .hz').map(r => { const i = +r.dataset.i, z = { ...h.draft.hazards[i] }; r.querySelectorAll('[data-h]').forEach(el => { const f = el.dataset.h; z[f] = el.type === 'number' ? (el.value === '' ? null : +el.value) : (el.value || (f === 'side' ? null : '')); }); return z; });
  return d;
}
function markDirty() { dirty = true; setSave('Cambios sin guardar…', true); clearTimeout(saveT); saveT = setTimeout(saveDraft, 1200); }
async function saveDraft() {
  clearTimeout(saveT); if (!dirty) return saving; dirty = false;
  const h = H(), body = collect(); h.draft = body; setSave('Guardando borrador…', true);
  saving = api(`/api/admin/strategy/${S.course.course_id}/holes/${h.hole}`, { method:'PUT', body: JSON.stringify(body) })
    .then(r => { Object.assign(h, r.hole); setSave('Borrador guardado'); $('#hstat').innerHTML = chip(h.status); $('#holes').innerHTML = holeList(); })
    .catch(e => { dirty = true; setSave('No se pudo guardar', true); toast(e.message, 1); });
  return saving;
}
async function reload(keepHole) { const id = S.course.course_id; S = await api(`/api/admin/strategy/${id}`); if (keepHole) cur = keepHole; draw(); }
function bind() {
  $('#form').addEventListener('input', markDirty); $('#form').addEventListener('change', markDirty);
  $('#holes').onclick = async e => { const b = e.target.closest('[data-hole]'); if (!b) return; await saveDraft(); cur = +b.dataset.hole; history.replaceState(null, '', `/admin/courses/${S.course.course_id}/${cur}`); draw(); };
  $('#mapsvg').onclick = e => { const r = e.currentTarget.getBoundingClientRect(), vb = e.currentTarget.viewBox.baseVal;
    const p = MAPT.inv((e.clientX - r.left) * vb.width / r.width, (e.clientY - r.top) * vb.height / r.height);
    const h = H(); h.draft = collect(); h.draft.target = { lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) }; dirty = true; draw(); markDirty(); };
  document.querySelector('.wrap').onclick = async e => {
    const b = e.target.closest('[data-act]'); if (!b) return; const act = b.dataset.act, h = H(), id = S.course.course_id;
    try {
      if (act === 'addhz') { h.draft = collect(); h.draft.hazards.push({ type:'bunker', side:null, from_yd:null, carry_yd:null, note:'', at:null, source:'manual' }); draw(); return markDirty(); }
      if (act === 'delhz') { h.draft = collect(); h.draft.hazards.splice(+b.closest('.hz').dataset.i, 1); draw(); return markDirty(); }
      if (act === 'cleartarget') { h.draft = collect(); h.draft.target = null; draw(); return markDirty(); }
      if (act === 'prefill' || act === 'prefillall') { await saveDraft(); b.disabled = true;
        const r = await api(`/api/admin/strategy/${id}/prefill`, { method:'POST', body: JSON.stringify(act === 'prefill' ? { holes:[h.hole] } : {}) });
        await reload(h.hole); return toast(r.total_added ? `${r.total_added} peligros agregados como borrador. Revisalos antes de publicar.` : 'No hay peligros nuevos en el mapa para agregar.'); }
      if (act === 'publish') { await saveDraft(); const r = await api(`/api/admin/strategy/${id}/publish`, { method:'POST', body: JSON.stringify({ holes:[h.hole] }) });
        await reload(h.hole); return toast(r.published_holes.length ? `Hoyo ${h.hole} publicado.` : 'El hoyo está vacío: cargá algo antes de publicar.', !r.published_holes.length); }
      if (act === 'publishall') { await saveDraft(); const n = S.holes.filter(x => x.status === 'draft' || x.status === 'changed').length;
        if (!(await askInline(b, `Se publican ${n} hoyo(s) con cambios y el resumen. Los jugadores lo van a ver.`, 'Sí, publicar todo'))) return;
        const r = await api(`/api/admin/strategy/${id}/publish`, { method:'POST', body: JSON.stringify({ holes:'all' }) }); await reload(h.hole); return toast(`${r.published_holes.length} hoyos publicados.`); }
      if (act === 'unpublish') { if (!(await askInline(b, `Se despublica el hoyo ${h.hole}. El borrador queda guardado.`, 'Sí, despublicar'))) return; await api(`/api/admin/strategy/${id}/unpublish`, { method:'POST', body: JSON.stringify({ holes:[h.hole] }) }); await reload(h.hole); return toast('Despublicado.'); }
      if (act === 'discard') { if (!(await askInline(b, 'Se descartan los cambios y vuelve a lo publicado.', 'Sí, descartar'))) return; dirty = false; await api(`/api/admin/strategy/${id}/holes/${h.hole}`, { method:'DELETE' }); await reload(h.hole); return toast('Cambios descartados.'); }
      if (act === 'ovsave' || act === 'ovpublish') { await api(`/api/admin/strategy/${id}`, { method:'PUT', body: JSON.stringify({ overview: $('#ovtext').value }) });
        if (act === 'ovpublish') { const r = await api(`/api/admin/strategy/${id}/publish`, { method:'POST', body: JSON.stringify({ holes:[], overview:true }) }); if (!r.overview_published) toast('El resumen está vacío.', 1); else toast('Resumen publicado.'); } else toast('Resumen guardado como borrador.');
        await saveDraft(); return reload(h.hole); }
      if (act === 'ovunpublish') { await api(`/api/admin/strategy/${id}/unpublish`, { method:'POST', body: JSON.stringify({ holes:[], overview:true }) }); await reload(h.hole); return toast('Resumen despublicado.'); }
    } catch (err) { toast(err.message, 1); b.disabled = false; }
  };
}
window.addEventListener('beforeunload', e => { if (dirty) { saveDraft(); e.preventDefault(); } });
window.GStrategy = { list: courseList, open: async (id, hole) => { cur = +(hole || 1); await openCourse(id); }, save: () => saveDraft(), get dirty() { return dirty; } };
})();
