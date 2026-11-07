/* Golflet admin: Clubes de Argentina — lista con filtros, contadores que abren la lista filtrada, mapa OSM y ficha con fuente por campo.
   Correcciones (solo admin) se guardan como overrides con auditoría; un re-import no las pisa. */
(() => {
const G = () => window.GA;
const esc = s => G().esc(s);
const nf = new Intl.NumberFormat('es-AR');
const N = v => v == null || v === '' ? '' : typeof v === 'number' ? nf.format(v) : esc(v);
const SIN = '<span class="sindato">Sin dato</span>';
const SRC_L = { aag:'AAG', golfistics:'Golfistics', osm:'OSM', dgt:'DGT', golflet:'Golflet' };
const SRC_T = { aag:'Directorio AAG', golfistics:'Golfistics ViewMaster', osm:'OpenStreetMap', dgt:'DigitalGolfTour', golflet:'Vinculado a Golflet' };
const badges = srcs => `<span class="sbadges">${(srcs || []).map(s => `<span class="sb sb-${s}" title="${esc(SRC_T[s] || s)}">${SRC_L[s] || esc(s)}</span>`).join('')}</span>`;
const initials = n => String(n || '?').replace(/\b(club|golf|de|del|la|el|country|campo|s\.?a\.?)\b/gi, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '·';
const logoChip = (c, size = 40, v = '') => c.has_logo || c.url
  ? `<span class="lchip ${c.logo_tone === 'dark' || c.tone === 'dark' ? 'dark' : ''}" style="width:${size}px;height:${size}px"><img loading="lazy" alt="" src="${esc(c.url || `/api/admin/ar-clubs/${c.key}/logo${c.logo_v ? `?v=${c.logo_v}` : ''}`)}${v}"></span>`
  : `<span class="lchip mono" style="width:${size}px;height:${size}px;font-size:${Math.round(size / 2.9)}px">${esc(initials(c.name))}</span>`;
const isAdmin = () => G().me()?.user?.role === 'admin';
const MON = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const dshort = t => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t || ''); return m ? `${+m[3]} ${MON[+m[2] - 1]} ${m[1]}` : ''; };
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
const SRC_SHORT = s => !s ? '' : /^Golflet/.test(s) ? 'Golflet' : /^AAG/.test(s) ? 'AAG' : /Golfistics/.test(s) ? 'Golfistics' : /OpenStreetMap/.test(s) ? 'OSM' : /DigitalGolf/.test(s) ? 'DGT' : /Welcome/.test(s) ? 'Welcome Argentina'
  : /Nominatim reverse/.test(s) ? 'Nominatim (coord.)' : /Nominatim/.test(s) ? 'Nominatim' : /Sitio oficial/.test(s) ? 'Sitio oficial' : /Golflet/.test(s) ? 'Golflet' : s;
const srcLink = f => {
  if (!f) return '';
  if (f.override) return `<span class="srcl ov" title="Dato importado: ${esc(f.override.imported ?? 'Sin dato')}">Corregido · ${esc(f.override.by)} · ${dshort(f.override.at)}</span>`;
  if (f.value == null || !f.source) return '';
  const lab = `${esc(SRC_SHORT(f.source))}${f.fetched ? ` · ${dshort(f.fetched)}` : ''}`;
  return f.url ? `<a class="srcl" target="_blank" rel="noopener" href="${esc(f.url)}" title="${esc(f.source)}${f.note ? ' — ' + esc(f.note) : ''}">${lab}</a>` : `<span class="srcl" title="${esc(f.source)}">${lab}</span>`;
};

/* ---------------- list ---------------- */
let ALL = null, LOADED = 0;
async function load(force) { if (!ALL || force || Date.now() - LOADED > 120000) { ALL = (await G().api('/api/admin/ar-clubs')).clubs; LOADED = Date.now(); } return ALL; }
const FILTERS = ['q', 'prov', 'fed', 'logo', 'course', 'linked', 'precise', 'src', 'has', 'missing'];
const fold = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const filled = v => v != null && v !== '' && v !== false;
function applyF(rows, f) {
  const qq = f.q ? fold(f.q).trim() : '', b = v => v === '1' ? true : v === '0' ? false : null;
  return rows.filter(r => (!qq || fold(`${r.name} ${r.city} ${r.province} ${r.key}`).includes(qq))
    && (!f.prov || (f.prov === '_none' ? !r.province : r.province === f.prov)) && (!f.fed || (f.fed === '_none' ? !r.federation : r.federation === f.fed))
    && (b(f.logo) == null || r.has_logo === b(f.logo)) && (b(f.course) == null || r.has_course === b(f.course)) && (b(f.linked) == null || r.linked === b(f.linked))
    && (b(f.precise) == null || r.precise === b(f.precise)) && (!f.src || (r.sources || []).includes(f.src))
    && (!f.has || filled(r[f.has])) && (!f.missing || !filled(r[f.missing])));
}
const qs = f => { const p = new URLSearchParams(); for (const k of FILTERS) if (f[k]) p.set(k, f[k]); const s = p.toString(); return s ? '?' + s : ''; };
const HAS_L = { website:'con web', phone:'con teléfono', address:'con dirección', holes:'con hoyos', par:'con par', length_m:'con largo', designer:'con diseñador', founded:'con año de fundación', type:'con tipo', has_location:'con ubicación', edited:'con correcciones' };
const MISS_L = { website:'sin web', phone:'sin teléfono', address:'sin dirección', holes:'sin hoyos', par:'sin par', province:'sin provincia', federation:'sin federación', has_location:'sin ubicación' };
function describe(f) {
  const t = [];
  if (f.q) t.push(`“${esc(f.q)}”`); if (f.prov) t.push(f.prov === '_none' ? 'sin provincia' : esc(f.prov)); if (f.fed) t.push(f.fed === '_none' ? 'sin federación' : `Federación ${esc(f.fed)}`);
  if (f.logo) t.push(f.logo === '1' ? 'con logo' : 'sin logo'); if (f.course) t.push(f.course === '1' ? 'con datos de cancha' : 'sin datos de cancha');
  if (f.linked) t.push(f.linked === '1' ? 'vinculados a Golflet' : 'no vinculados'); if (f.precise) t.push(f.precise === '1' ? 'ubicación precisa' : 'ubicación aproximada');
  if (f.src) t.push(`fuente ${SRC_T[f.src] || esc(f.src)}`); if (f.has) t.push(HAS_L[f.has] || esc(f.has)); if (f.missing) t.push(MISS_L[f.missing] || esc(f.missing));
  return t.join(' · ');
}
function counters(all) {
  const c = (fn) => all.filter(fn).length, pct = n => all.length ? Math.round(100 * n / all.length) : 0;
  const T = (f, l, n, s) => `<a class="tile" data-nav href="/admin/ar-clubs${qs(f)}"><div class="l">${l}</div><div class="v ${!n ? 'zero' : ''}">${nf.format(n)}</div><div class="s">${s}</div></a>`;
  const nl = c(r => r.has_logo), np = c(r => r.precise), nw = c(r => filled(r.website)), nt = c(r => filled(r.phone)), nc = c(r => r.has_course), ng = c(r => r.linked), ne = c(r => r.edited);
  return `<div class="tiles arc">
    <a class="tile gold" data-nav href="/admin/ar-clubs"><div class="l">Clubes y canchas</div><div class="v">${nf.format(all.length)}</div><div class="s">${nf.format(c(r => (r.sources || []).includes('aag')))} afiliados a la AAG</div></a>
    ${T({ logo:'1' }, 'Con logo', nl, `${pct(nl)}% · ${nf.format(all.length - nl)} sin logo`)}
    ${T({ precise:'1' }, 'Ubicación precisa', np, `${pct(np)}% · ${nf.format(all.length - np)} aproximadas`)}
    ${T({ has:'website' }, 'Con sitio web', nw, `${pct(nw)}%`)}
    ${T({ has:'phone' }, 'Con teléfono', nt, `${pct(nt)}%`)}
    ${T({ course:'1' }, 'Con datos de cancha', nc, `${pct(nc)}% · hoyos, par o canchas`)}
    ${T({ linked:'1' }, 'Vinculados a Golflet', ng, 'mismo código AAG / Golfistics')}
    ${T({ has:'edited' }, 'Con correcciones', ne, 'editados desde el admin')}
  </div>`;
}
function provChips(all, f) {
  const m = new Map(); for (const r of all) m.set(r.province || '_none', (m.get(r.province || '_none') || 0) + 1);
  return `<div class="pchips">${[...m].sort((a, b) => b[1] - a[1]).map(([p, n]) => `<a data-nav class="pchip ${f.prov === p ? 'on' : ''}" href="/admin/ar-clubs${qs({ ...f, prov: f.prov === p ? '' : p })}">${p === '_none' ? 'Sin provincia' : esc(p)} <b class="num">${n}</b></a>`).join('')}</div>`;
}
const opt = (v, l, cur) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(l)}</option>`;
async function list(mode) {
  const isMap = mode === 'map';
  G().title('Clubes de Argentina', 'Plataforma');
  const all = await load();
  const sp = new URLSearchParams(location.search), f = {}; for (const k of FILTERS) if (sp.get(k)) f[k] = sp.get(k);
  const rows = applyF(all, f);
  const provs = [...new Set(all.map(r => r.province).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const feds = [...new Set(all.map(r => r.federation).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const base = isMap ? '/admin/ar-clubs/mapa' : '/admin/ar-clubs';
  const d = describe(f);
  G().main(`${counters(all)}
  ${provChips(all, f)}
  <div class="card arfil">
    <div class="filters">
      <div class="grow"><label>Buscar</label><input type="search" id="arq" placeholder="Nombre, localidad o provincia" value="${esc(f.q || '')}"></div>
      <div><label>Provincia</label><select data-f="prov">${opt('', 'Todas', f.prov || '')}${provs.map(p => opt(p, p, f.prov)).join('')}${opt('_none', 'Sin provincia', f.prov)}</select></div>
      <div><label>Federación</label><select data-f="fed">${opt('', 'Todas', f.fed || '')}${feds.map(p => opt(p, p, f.fed)).join('')}${opt('_none', 'Sin federación', f.fed)}</select></div>
      <div><label>Logo</label><select data-f="logo">${opt('', 'Todos', f.logo || '')}${opt('1', 'Con logo', f.logo)}${opt('0', 'Sin logo', f.logo)}</select></div>
      <div><label>Datos de cancha</label><select data-f="course">${opt('', 'Todos', f.course || '')}${opt('1', 'Con datos', f.course)}${opt('0', 'Sin datos', f.course)}</select></div>
      <div><label>Golflet</label><select data-f="linked">${opt('', 'Todos', f.linked || '')}${opt('1', 'Vinculados', f.linked)}${opt('0', 'No vinculados', f.linked)}</select></div>
      <div><label>Fuente</label><select data-f="src">${opt('', 'Todas', f.src || '')}${Object.keys(SRC_T).map(k => opt(k, SRC_T[k], f.src)).join('')}</select></div>
    </div>
    <div class="arbar"><div class="meta"><b class="num" style="color:var(--color-ink);font-weight:600">${nf.format(rows.length)}</b> de ${nf.format(all.length)}${d ? ` · ${d}` : ''}
      ${Object.keys(f).length ? ` · <a data-nav href="${base}">Limpiar filtros</a>` : ''}</div>
      <div class="seg"><a data-nav class="${isMap ? '' : 'on'}" href="/admin/ar-clubs${qs(f)}">Lista</a><a data-nav class="${isMap ? 'on' : ''}" href="/admin/ar-clubs/mapa${qs(f)}">Mapa</a></div></div>
  </div>
  ${isMap ? `<div class="card" style="padding:0;overflow:hidden"><div id="armap" class="osm big"></div></div>
     <p class="meta">Punto lleno: ubicación de la cancha (green del hoyo 1 de Golfistics o polígono de OSM). Punto con borde: centro de la localidad (aproximado). Dorado: vinculado a Golflet.</p>`
   : `<div class="arlist">${rows.length ? rows.map(r => `<a class="arrow" data-nav href="/admin/ar-clubs/${r.key}">
      ${logoChip(r)}
      <span class="t"><b>${r.name ? esc(r.name) : SIN}</b><span>${[r.city, r.province].filter(Boolean).map(esc).join(' · ') || 'Sin localidad'}${r.federation ? ` · Fed. ${esc(r.federation)}` : ''}</span></span>
      <span class="h num">${r.holes != null ? `<b>${N(r.holes)}</b> hoyos` : '<span class="no">— hoyos</span>'}</span>
      <span class="b">${badges(r.sources)}${r.edited ? '<span class="sb sb-ed">Editado</span>' : ''}</span></a>`).join('') : '<div class="card empty">No hay clubes con esos filtros.</div>'}</div>`}`);
  const set = (k, v) => { const q = new URLSearchParams(location.search); v ? q.set(k, v) : q.delete(k); G().go(`${base}${q.toString() ? '?' + q : ''}`); };
  document.querySelectorAll('.arfil [data-f]').forEach(el => el.onchange = () => set(el.dataset.f, el.value));
  const qi = document.getElementById('arq'); let t;
  qi.oninput = () => { clearTimeout(t); t = setTimeout(() => { const q = new URLSearchParams(location.search); qi.value ? q.set('q', qi.value) : q.delete('q'); history.replaceState(null, '', `${base}${q.toString() ? '?' + q : ''}`); list(mode).then(() => { const n = document.getElementById('arq'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }); }, 250); };
  if (isMap) osmMap(document.getElementById('armap'), rows.filter(r => r.lat != null).map(r => ({ lat: r.lat, lng: r.lng, key: r.key, name: r.name, sub: [r.city, r.province].filter(Boolean).join(' · '), precise: r.precise, linked: r.linked })));
}

/* ---------------- OSM map (raster tiles, sin librerías) ---------------- */
const TS = 256;
const lng2x = (lng, z) => (lng + 180) / 360 * TS * 2 ** z;
const lat2y = (lat, z) => { const s = Math.sin(lat * Math.PI / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TS * 2 ** z; };
function osmMap(el, pts, o = {}) {
  if (!el) return;
  el.innerHTML = `<div class="tl"></div><div class="pins"></div><div class="zoom"><button type="button" data-z="1" aria-label="Acercar">+</button><button type="button" data-z="-1" aria-label="Alejar">−</button></div>
    <div class="attr">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a></div><div class="pop" hidden></div>`;
  const W = () => el.clientWidth, H = () => el.clientHeight;
  let z, cx, cy;
  const fit = () => {
    if (o.center) { z = o.zoom || 14; cx = lng2x(o.center.lng, z); cy = lat2y(o.center.lat, z); return; }
    const la = pts.map(p => p.lat), ln = pts.map(p => p.lng);
    const b = pts.length ? [Math.min(...ln), Math.min(...la), Math.max(...ln), Math.max(...la)] : [-73, -55, -53, -21];
    for (z = 15; z > 2; z--) { if (lng2x(b[2], z) - lng2x(b[0], z) < W() - 60 && lat2y(b[1], z) - lat2y(b[3], z) < H() - 60) break; }
    cx = (lng2x(b[0], z) + lng2x(b[2], z)) / 2; cy = (lat2y(b[1], z) + lat2y(b[3], z)) / 2;
  };
  const tl = el.querySelector(".tl"), pl = el.querySelector('.pins'), pop = el.querySelector('.pop');
  const draw = () => {
    const x0 = cx - W() / 2, y0 = cy - H() / 2, n = 2 ** z; let h = '';
    for (let tx = Math.floor(x0 / TS); tx <= Math.floor((x0 + W()) / TS); tx++) for (let ty = Math.floor(y0 / TS); ty <= Math.floor((y0 + H()) / TS); ty++) {
      if (ty < 0 || ty >= n) continue; const wx = ((tx % n) + n) % n;
      h += `<img alt="" draggable="false" src="https://tile.openstreetmap.org/${z}/${wx}/${ty}.png" style="left:${Math.round(tx * TS - x0)}px;top:${Math.round(ty * TS - y0)}px">`;
    }
    tl.innerHTML = h;
    pl.innerHTML = pts.map((p, i) => { const x = lng2x(p.lng, z) - x0, y = lat2y(p.lat, z) - y0; if (x < -20 || y < -20 || x > W() + 20 || y > H() + 20) return '';
      return `<button type="button" class="pin ${p.precise ? '' : 'approx'} ${p.linked ? 'gold' : ''}" data-i="${i}" style="left:${x}px;top:${y}px" title="${esc(p.name || '')}" aria-label="${esc(p.name || 'Club')}"></button>`; }).join('');
    if (o.radius_m) { const mpp = 156543.03 * Math.cos(o.center.lat * Math.PI / 180) / 2 ** z, r = o.radius_m / mpp; pl.insertAdjacentHTML('afterbegin', `<span class="prec" style="left:${lng2x(o.center.lng, z) - x0}px;top:${lat2y(o.center.lat, z) - y0}px;width:${2 * r}px;height:${2 * r}px"></span>`); }
  };
  const zoomBy = (d, px = W() / 2, py = H() / 2) => { const nz = Math.max(3, Math.min(18, z + d)); if (nz === z) return; const k = 2 ** (nz - z); cx = (cx - W() / 2 + px) * k - px + W() / 2; cy = (cy - H() / 2 + py) * k - py + H() / 2; z = nz; pop.hidden = true; draw(); };
  el.querySelectorAll('[data-z]').forEach(b => b.onclick = () => zoomBy(+b.dataset.z));
  el.addEventListener('wheel', e => { if (!e.ctrlKey && !o.wheel) return; e.preventDefault(); const r = el.getBoundingClientRect(); zoomBy(e.deltaY < 0 ? 1 : -1, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  let drag = null, moved = false;
  el.addEventListener('pointerdown', e => { if (e.target.closest('.zoom,.pop,.attr')) return; drag = { x: e.clientX, y: e.clientY, cx, cy }; moved = false; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) moved = true; if (moved) { cx = drag.cx - dx; cy = drag.cy - dy; pop.hidden = true; draw(); } });
  el.addEventListener('pointerup', e => {
    const wasDrag = moved; drag = null; if (wasDrag) return;
    const pin = document.elementsFromPoint(e.clientX, e.clientY).find(n => n.classList?.contains('pin')); if (!pin || o.center) return;
    const p = pts[+pin.dataset.i], r = el.getBoundingClientRect();
    pop.innerHTML = `<b>${esc(p.name || 'Sin nombre')}</b><span>${esc(p.sub || '')}${p.precise ? '' : ' · ubicación aproximada'}</span><a data-nav href="/admin/ar-clubs/${p.key}">Ver ficha ›</a>`;
    pop.style.left = Math.min(W() - 230, Math.max(8, e.clientX - r.left - 110)) + 'px'; pop.style.top = Math.max(8, e.clientY - r.top - 92) + 'px'; pop.hidden = false;
  });
  el.addEventListener('dblclick', e => { const r = el.getBoundingClientRect(); zoomBy(1, e.clientX - r.left, e.clientY - r.top); });
  fit(); draw();
  const ro = new ResizeObserver(() => draw()); ro.observe(el);
}

/* ---------------- detail ---------------- */
const FL = { name:'Nombre', province:'Provincia', city:'Localidad', address:'Dirección', postcode:'Código postal', phone:'Teléfono', website:'Sitio web', email:'Email', federation:'Federación regional',
  holes:'Hoyos (club)', par:'Par', length_m:'Largo', designer:'Diseñador', founded:'Año de fundación', type:'Tipo', lat:'Latitud', lng:'Longitud', location_precision:'Precisión de la ubicación' };
const PREC = p => !p ? '' : /hole 1 green/i.test(p) ? 'Green del hoyo 1 (Golfistics)' : /centroide/i.test(p) ? 'Centro del polígono de la cancha (OSM)' : /localidad/i.test(p) ? 'Centro de la localidad (aproximado)' : p;
const fmtVal = (k, v) => {
  if (v == null || v === '') return SIN;
  if (k === 'website') return `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(host(v))}</a>`;
  if (k === 'email') return `<a href="mailto:${esc(v)}">${esc(v)}</a>`;
  if (k === 'phone') return esc(v);
  if (k === 'length_m') return `<span class="num">${nf.format(v)} m</span> <span class="meta">(${nf.format(Math.round(v / 0.9144))} yd)</span>`;
  if (k === 'type') return v === 'publico' ? 'Público' : v === 'privado' ? 'Privado' : esc(v);
  if (k === 'location_precision') return esc(PREC(v));
  if (typeof v === 'number') return `<span class="num">${k === 'lat' || k === 'lng' ? v.toFixed(5).replace('.', ',') : nf.format(v)}</span>`;
  return esc(v);
};
const raw = (k, v) => v == null ? '' : k === 'location_precision' ? PREC(v) : String(v);
function frow(k, f, label, editKey) {
  const ed = isAdmin() ? `<button type="button" class="edb" data-edit="${esc(editKey || k)}" data-raw="${esc(raw(k, f?.value))}" aria-label="Editar ${esc(label)}">Editar</button>` : '';
  return `<div class="frow" data-k="${esc(editKey || k)}"><dt>${esc(label)}</dt><dd><div class="fv">${fmtVal(k, f?.value)}</div><div class="fm">${srcLink(f)}${f?.override ? `<button type="button" class="lnk" data-reset="${esc(editKey || k)}">Volver al dato importado</button>` : ''}${ed}</div></dd></div>`;
}
async function detail(key) {
  const d = await G().api(`/api/admin/ar-clubs/${key}`);
  const F = d.fields, name = F.name.value || 'Sin nombre';
  G().title(name, 'Plataforma · Clubes de Argentina');
  const loc = F.lat.value != null ? { lat: F.lat.value, lng: F.lng.value } : null;
  const approx = /localidad/i.test(F.location_precision.value || '');
  const prec = PREC(F.location_precision.value);
  const head = `<div class="card arhead">
    ${logoChip({ ...d.logo, name, has_logo: !!d.logo }, 84)}
    <div class="t"><div class="overline">${d.aag_code ? `Código AAG ${esc(d.aag_code)}` : 'Sin código AAG'}</div><h2>${esc(name)}</h2>
      <div class="meta">${[F.city.value, F.province.value || F.country?.value].filter(Boolean).map(esc).join(' · ') || 'Sin localidad'}</div>
      <div style="margin-top:8px">${badges(d.sources_badges)}</div></div>
    <div class="acts">${d.golflet ? `<a class="btn sm" data-nav href="/admin/clubs" style="text-decoration:none">En Golflet: ${esc(d.golflet.name)} ›</a>` : '<span class="chip">No vinculado a Golflet</span>'}
      <a class="btn ghost sm" data-nav href="/admin/ar-clubs" style="text-decoration:none">‹ Todos los clubes</a></div></div>`;
  const logoCard = `<div class="card"><h3 style="margin-top:0">Logo</h3>
    ${d.logo ? `<div class="logobig">${logoChip({ ...d.logo, name, has_logo: true }, 120)}</div><div class="meta">${d.logo.uploaded ? `Subido desde el admin por ${esc(d.logo.by || 'admin')} · ${dshort(d.logo.fetched)}` : `${d.logo.source_url ? `<a class="srcl" target="_blank" rel="noopener" href="${esc(d.logo.source_url)}">Sitio oficial · ${dshort(d.logo.fetched)}</a>` : ''}`}
      · Fondo: ${d.logo.tone === 'dark' ? 'oscuro (logo claro)' : 'claro'}</div>` : `<div class="logobig">${logoChip({ name }, 120)}</div><div class="meta">${SIN} — ninguna fuente tiene el logo de este club.</div>`}
    ${isAdmin() ? `<div class="acts" style="margin-top:10px"><label class="btn ghost sm" style="margin:0;display:inline-block">Subir logo<input type="file" id="arlogo" accept="image/png,image/jpeg,image/webp" hidden></label>
      ${d.logo ? `<button type="button" class="btn ghost sm" id="artone">${d.logo.tone === 'dark' ? 'Usar fondo claro' : 'Usar fondo oscuro'}</button>` : ''}
      ${d.logo?.uploaded ? '<button type="button" class="btn neg sm" id="arlogoreset">Volver al logo importado</button>' : ''}</div><p class="meta">PNG, JPG o WebP de hasta 600 KB. Si el logo es blanco, usá fondo oscuro.</p>` : ''}</div>`;
  const mapCard = `<div class="card"><h3 style="margin-top:0">Ubicación</h3>${loc ? `<div id="ardmap" class="osm"></div>
      <div class="meta" style="margin-top:8px"><b style="color:var(--color-ink);font-weight:600">${esc(prec || 'Precisión sin dato')}</b>${approx ? ' — el punto es el centro de la localidad, no la cancha.' : ''}<br>
      <span class="num">${loc.lat.toFixed(5).replace('.', ',')}, ${loc.lng.toFixed(5).replace('.', ',')}</span> · ${srcLink(F.lat)} · <a target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lng}#map=${approx ? 13 : 16}/${loc.lat}/${loc.lng}">Abrir en OSM</a></div>` : `<div class="empty">${SIN}</div>`}</div>`;
  const grp = (t, ks) => `<div class="card"><h3 style="margin-top:0">${t}</h3><dl class="fl">${ks.map(k => frow(k, F[k], FL[k])).join('')}</dl></div>`;
  const social = F.social?.value?.length ? `<div class="frow"><dt>Redes</dt><dd><div class="fv">${F.social.value.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(host(u))}</a>`).join(' · ')}</div><div class="fm">${srcLink(F.social)}</div></dd></div>` : '';
  const courses = d.courses.length ? `<div class="tscroll"><table class="tbl crs"><thead><tr><th>Cancha</th><th class="n">Hoyos</th><th class="n">Par</th><th class="n">Largo</th><th>Diseñador</th><th class="n">Año</th></tr></thead><tbody>
    ${d.courses.map(c => { const cell = (k, cls = '') => { const f = c.fields[k], ek = `course:${c.name}:${k}`;
        return `<td class="${cls}" data-l="${esc({ holes:'Hoyos', par:'Par', length_m:'Largo', designer:'Diseñador', year:'Año' }[k])}"><div class="frow cell" data-k="${esc(ek)}"><div class="fv">${k === 'length_m' && f.value != null ? `<span class="num">${nf.format(f.value)} m</span>` : f.value == null ? SIN : typeof f.value === 'number' ? `<span class="num">${f.value}</span>` : esc(f.value)}</div>
          <div class="fm">${srcLink(f)}${f.override ? `<button type="button" class="lnk" data-reset="${esc(ek)}">Restaurar</button>` : ''}${isAdmin() ? `<button type="button" class="edb" data-edit="${esc(ek)}" data-raw="${esc(f.value ?? '')}">Editar</button>` : ''}</div></div></td>`; };
      return `<tr><td data-l="Cancha"><b style="font-weight:600">${esc(c.name)}</b>${c.golflet_course_name ? `<div class="meta"><a data-nav href="/admin/cards/${d.golflet.id}/${encodeURIComponent(c.golflet_course_name)}">Tarjeta en Golflet ›</a></div>` : ''}
        <div class="meta">${(c.sources || []).map(s => `<a class="srcl" target="_blank" rel="noopener" href="${esc(s.url)}">${esc(SRC_SHORT(s.source))} · ${dshort(s.fetched)}</a>`).join(' ')}</div></td>
        ${cell('holes', 'n')}${cell('par', 'n')}${cell('length_m', 'n')}${cell('designer')}${cell('year', 'n')}</tr>`; }).join('')}</tbody></table></div>`
    : `<div class="empty">${SIN}: ninguna fuente nombra las canchas de este club. Los datos generales están arriba.</div>`;
  G().main(`${head}
  <div class="argrid">
    <div class="col">
      ${grp('Contacto', ['address', 'postcode', 'city', 'province', 'phone', 'website', 'email']).replace('</dl>', social + '</dl>')}
      ${grp('Club y cancha', ['name', 'federation', 'holes', 'par', 'length_m', 'designer', 'founded', 'type'])}
      <div class="card"><h3 style="margin-top:0">Canchas</h3>${courses}</div>
    </div>
    <div class="col side2">
      ${logoCard}${mapCard}
      ${isAdmin() ? grp('Coordenadas', ['lat', 'lng', 'location_precision']) : ''}
      <div class="card"><h3 style="margin-top:0">Fuentes</h3><ul class="srcs">${(d.sources || []).map(s => `<li><a target="_blank" rel="noopener" href="${esc(s.url)}">${esc(s.source)}</a> <span class="meta">· ${dshort(s.fetched)}</span></li>`).join('')}</ul>
        ${d.notes.length ? `<div class="note" style="margin-top:10px">${d.notes.map(esc).join('<br>')}</div>` : ''}<p class="meta">Revisado por última vez el ${dshort(d.last_checked)}. Las correcciones del admin no se pisan al reimportar.</p></div>
      <div class="card"><h3 style="margin-top:0">Cambios</h3>${d.audit.length ? `<ul class="srcs">${d.audit.map(a => `<li>${esc(a.summary)}<div class="meta">${esc(a.actor_email)} · ${G().fmtDT(a.created_at)}</div></li>`).join('')}</ul>` : '<div class="empty">Sin correcciones todavía.</div>'}</div>
    </div>
  </div>`);
  if (loc) osmMap(document.getElementById('ardmap'), [{ ...loc, precise: !approx }], { center: loc, zoom: approx ? 12 : 15, radius_m: approx ? 3000 : 0 });
  wire(key);
}
function wire(key) {
  const save = async body => { try { await G().api(`/api/admin/ar-clubs/${key}`, { method:'PATCH', body: JSON.stringify(body) }); ALL = null; G().toast(body.reset ? 'Volvió al dato importado.' : 'Guardado. Queda como corrección del admin.'); await detail(key); } catch (e) { G().toast(e.message, 1); } };
  document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
    const row = b.closest('.frow'), k = b.dataset.edit, fv = row.querySelector('.fv'), fm = row.querySelector('.fm');
    const sel = k === 'type' ? `<select class="edi"><option value="">Sin dato</option><option value="privado">Privado</option><option value="publico">Público</option></select>` : `<input class="edi" type="text" value="${esc(b.dataset.raw)}">`;
    fv.innerHTML = sel; fm.innerHTML = `<button type="button" class="btn sm" data-a="ok">Guardar</button><button type="button" class="btn ghost sm" data-a="no">Cancelar</button><button type="button" class="lnk" data-a="nil">Marcar “Sin dato”</button>`;
    const inp = fv.querySelector('.edi'); if (k === 'type') inp.value = b.dataset.raw; inp.focus();
    fm.querySelector('[data-a="ok"]').onclick = () => save({ field: k, value: inp.value });
    fm.querySelector('[data-a="nil"]').onclick = () => save({ field: k, value: null });
    fm.querySelector('[data-a="no"]').onclick = () => detail(key);
    inp.onkeydown = e => { if (e.key === 'Enter') save({ field: k, value: inp.value }); if (e.key === 'Escape') detail(key); };
  });
  document.querySelectorAll('[data-reset]').forEach(b => b.onclick = async () => { if (await askInline(b, 'Vuelve al dato importado.', 'Sí, volver')) save({ field: b.dataset.reset, reset: true }); });
  const lf = document.getElementById('arlogo');
  if (lf) lf.onchange = () => { const file = lf.files[0]; if (!file) return; const rd = new FileReader();
    rd.onload = async () => { const tone = await askChoice(lf, '¿El logo es blanco o muy claro?', [['dark', 'Sí, mostrarlo sobre fondo oscuro'], ['light', 'No, va sobre fondo claro']]); if (!tone) { lf.value = ''; return; }
      try { await G().api(`/api/admin/ar-clubs/${key}/logo`, { method:'PUT', body: JSON.stringify({ data_url: rd.result, tone }) }); ALL = null; G().toast('Logo actualizado.'); detail(key); } catch (e) { G().toast(e.message, 1); } };
    rd.readAsDataURL(file); };
  const tb = document.getElementById('artone'); if (tb) tb.onclick = () => save({ field: 'logo_tone', value: tb.textContent.includes('oscuro') ? 'dark' : 'light' });
  const lr = document.getElementById('arlogoreset'); if (lr) lr.onclick = async () => { if (!(await askInline(lr, 'Vuelve al logo importado.', 'Sí, volver'))) return; try { await G().api(`/api/admin/ar-clubs/${key}/logo`, { method:'DELETE', body:'{}' }); ALL = null; detail(key); } catch (e) { G().toast(e.message, 1); } };
}
window.GArClubs = { list, detail };
})();
