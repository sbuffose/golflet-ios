/* Golflet admin shell: sidebar router + dashboard, metric drill-downs, users, roles, clubs, course cards, GPS greens, settings, audit.
   Every number links to the list behind it. Nothing here ever shows claves, cookies or session tokens (the API never sends them). */
(() => {
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const TZ = 'America/Argentina/Buenos_Aires';
const nf = new Intl.NumberFormat('es-AR');
const fmtN = v => v == null || v === '' ? '—' : typeof v === 'number' ? nf.format(v) : esc(v);
const fmtDT = t => t ? new Date(t).toLocaleString('es-AR', { timeZone: TZ, day:'numeric', month:'short', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
const fmtD = t => { if (!t) return '—'; const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t); const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)) : new Date(t); return d.toLocaleDateString('es-AR', { timeZone: m ? 'UTC' : TZ, day:'numeric', month:'short', year:'numeric' }); };
const CHIP = { ok:['ok','OK'], error:['error','Con error'], running:['draft','En curso'], admin:['admin','Admin'], editor:['editor','Editor'], ios:['ios','iPhone'], web:['web','Web'], otro:['','Otro'],
  link:['','Vínculo'], manual:['','Actualizar'], cron:['','Diaria'], none:['','Sin cargar'], draft:['draft','Borrador'], partial:['partial','Publicado en parte'], changed:['changed','Cambios sin publicar'], published:['published','Completo'],
  ready:['ok','Listo'], processing:['draft','Procesando'], pending_ai:['draft','Pendiente'], bolsa:['','Bolsa'], palos:['','Palos'], monitor:['','Launch monitor'] };
const chipH = v => { if (v == null || v === '') return '<span class="chip">Jugador</span>'; const [c, l] = CHIP[v] || ['', v]; return `<span class="chip ${c}">${esc(l)}</span>`; };
const yes = v => v ? '<span class="yes">Sí</span>' : '<span class="no">No</span>';

async function api(path, opt = {}) {
  const r = await fetch(path, { credentials:'same-origin', ...opt, headers:{ 'Content-Type':'application/json' } });
  if (r.status === 401) { location.href = '/admin/login?next=' + encodeURIComponent(location.pathname + location.search); throw new Error('auth'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'No se pudo completar');
  return j;
}
function toast(t, err) { const el = $('#toast'); el.className = err ? 'err' : ''; el.textContent = t; el.style.opacity = 1; clearTimeout(toast.t); toast.t = setTimeout(() => el.style.opacity = 0, 3600); }
const title = (t, crumb) => { $('#title').textContent = t; $('#crumb').textContent = crumb || 'Golflet · Admin'; document.title = `${t} · Golflet Admin`; $('#savestate').textContent = ''; };
const main = h => { $('#main').innerHTML = h; };
const fill = (tpl, row) => tpl.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(row[k] ?? ''));

/* ---------- me + nav ---------- */
let ME = null;
const NAV = [
  [null, [['dashboard', '/admin', 'Métricas']]],
  ['Plataforma', [['users', '/admin/users', 'Usuarios'], ['roles', '/admin/roles', 'Accesos y roles'], ['access', '/admin/access', 'Usuarios del panel'], ['profesores', '/admin/profesores', 'Profesores'], ['requests', '/admin/pedidos', 'Pedidos de club'], ['leadsp', '/admin/profesores-interesados', 'Profesores interesados'], ['leadsm', '/admin/marcas', 'Contactos de marcas'], ['leadsc', '/admin/contactos', 'Contactos'], ['feedback', '/admin/feedback', 'Feedback'], ['sorteos', '/admin/sorteos', 'Sorteos'], ['clubmsgs', '/admin/mensajes', 'Mensajes de clubes'], ['clubs', '/admin/clubs', 'Clubes y escudos'], ['arclubs', '/admin/ar-clubs', 'Clubes de Argentina']]],
  ['Canchas', [['courses', '/admin/cards', 'Tarjetas: hoyos, par y yardas'], ['gps', '/admin/gps', 'Greens GPS'], ['trazos', '/admin/trazos', 'Trazos sobre satélite'], ['strategy', '/admin/strategy', 'Cómo jugar la cancha'], ['pace', '/admin/ritmo', 'Ritmo de juego'], ['pins', '/admin/banderas/cargar', 'Banderas del día'], ['pinstaff', '/admin/banderas', 'Banderas: reportes y clubes']]],
  ['Sistema', [['settings', '/admin/settings', 'Ajustes y flags'], ['videos', '/admin/videos', 'Videos explicativos'], ['audit', '/admin/audit', 'Registro de cambios']]],
];
function nav(active) {
  const can = new Set(ME.sections);
  $('#nav').innerHTML = `<div class="brand"><div><b>Golflet</b><br><span>Admin</span></div></div>` + NAV.map(([g, items]) => { const v = items.filter(i => can.has(i[0])); if (!v.length) return '';
    return (g ? `<div class="grp">${g}</div>` : '') + v.map(([k, h, l]) => `<a data-nav href="${h}" class="${k === active ? 'on' : ''}">${l}</a>`).join(''); }).join('')
    + `<div class="me"><b>${esc(ME.user.name || ME.user.email)}</b>${esc(ME.user.email)}<br>${ME.user.role === 'admin' ? 'Admin' : ME.user.role === 'club' ? `Club${ME.club_name ? ' · ' + esc(ME.club_name) : ''} (solo banderas)` : 'Editor (solo canchas)'}<br><a href="/">Volver a Golflet</a></div><div class="me-acts"><a data-nav href="/admin/password" class="${active === 'password' ? 'on' : ''}">Cambiar contraseña</a><button type="button" class="btn ghost sm" id="logout">Salir del panel</button></div>`;
  const on = $('#nav a.on'); if (on && matchMedia('(max-width:860px)').matches) on.scrollIntoView({ inline: 'center', block: 'nearest' });
  $('#logout').onclick = async () => { await fetch('/api/admin/auth/logout', { method:'POST', credentials:'same-origin', headers:{ 'Content-Type':'application/json' }, body:'{}' }).catch(() => {}); location.replace('/admin/login'); };
}

/* ---------- router ---------- */
const ROUTES = [
  [/^\/admin\/?$/, 'dashboard', () => dashboard()],
  [/^\/admin\/metrics\/([a-z_]+)$/, 'dashboard', m => metricView(m[1])],
  [/^\/admin\/users\/?$/, 'users', () => usersView()],
  [/^\/admin\/users\/([A-Za-z0-9_-]+)$/, 'users', m => userView(m[1])],
  [/^\/admin\/roles\/?$/, 'roles', () => rolesView()],
  [/^\/admin\/access\/?$/, 'access', () => accessView()],
  [/^\/admin\/access\/([A-Za-z0-9_-]+)$/, 'access', m => accessEditView(m[1])],
  [/^\/admin\/password\/?$/, 'password', () => passwordView()],
  [/^\/admin\/clubs\/?$/, 'clubs', () => clubsView()],
  [/^\/admin\/ar-clubs\/?$/, 'arclubs', () => window.GArClubs.list()],
  [/^\/admin\/ar-clubs\/mapa$/, 'arclubs', () => window.GArClubs.list('map')],
  [/^\/admin\/ar-clubs\/([a-z0-9-]{3,64})$/, 'arclubs', m => window.GArClubs.detail(m[1])],
  [/^\/admin\/cards\/?$/, 'courses', () => cardsView()],
  [/^\/admin\/cards\/(\d+)\/(.+)$/, 'courses', m => cardView(+m[1], decodeURIComponent(m[2]))],
  [/^\/admin\/trazos\/?$/, 'trazos', () => trazosView()],
  [/^\/admin\/trazos\/(\d+)\/([^/]+)(?:\/(\d{1,2}))?$/, 'trazos', m => trazosHole(m[1], decodeURIComponent(m[2]), m[3] ? +m[3] : 0)],
  [/^\/admin\/gps\/?$/, 'gps', () => gpsView()],
  [/^\/admin\/gps\/([a-z0-9-]+)$/, 'gps', m => gpsCourseView(m[1])],
  [/^\/admin\/gps\/([a-z0-9-]+)\/lecturas$/, 'gps', m => gpsRunsView(m[1])],
  [/^\/admin\/strategy\/?$/, 'strategy', () => { title('Cómo jugar la cancha', 'Canchas'); return window.GStrategy.list().then(() => { $('#title').textContent = 'Cómo jugar la cancha'; $('#crumb').textContent = 'Canchas'; }); }],
  [/^\/admin\/courses\/([a-z0-9-]+)(?:\/(\d{1,2}))?$/, 'strategy', m => window.GStrategy.open(m[1], m[2]).then(() => { $('#crumb').textContent = 'Canchas · Cómo jugar la cancha'; })],
  [/^\/admin\/pedidos\/?$/, 'requests', () => requestsView()],
  [/^\/admin\/pedidos\/([0-9a-f-]{36})$/, 'requests', m => requestView(m[1])],
  [/^\/admin\/profesores\/?$/, 'profesores', () => profesoresView()],
  [/^\/admin\/profesores-interesados\/?$/, 'leadsp', () => leadsView('profesor')],
  [/^\/admin\/profesores-interesados\/([0-9a-f-]{36})$/, 'leadsp', m => leadView('profesor', m[1])],
  [/^\/admin\/marcas\/?$/, 'leadsm', () => leadsView('marca')],
  [/^\/admin\/marcas\/([0-9a-f-]{36})$/, 'leadsm', m => leadView('marca', m[1])],
  [/^\/admin\/contactos\/?$/, 'leadsc', () => leadsView('contacto')],
  [/^\/admin\/contactos\/([0-9a-f-]{36})$/, 'leadsc', m => leadView('contacto', m[1])],
  [/^\/admin\/feedback\/?$/, 'feedback', () => feedbackView()],
  [/^\/admin\/ritmo\/?$/, 'pace', () => paceView()],
  [/^\/admin\/ritmo\/defecto$/, 'pace', () => paceEdit(null, null)],
  [/^\/admin\/ritmo\/(\d+)(?:\/(.+))?$/, 'pace', m => paceEdit(+m[1], m[2] ? decodeURIComponent(m[2]) : null)],
  [/^\/admin\/feedback\/([0-9a-f-]{36})$/, 'feedback', m => feedbackItem(m[1])],
  [/^\/admin\/mensajes\/?$/, 'clubmsgs', () => clubMsgsView()],
  [/^\/admin\/banderas\/cargar\/?$/, 'pins', () => pinsLoadView()],
  [/^\/admin\/banderas\/clubes\/?$/, 'pinstaff', () => clubStaffView()],
  [/^\/admin\/banderas\/?$/, 'pinstaff', () => pinReportsView()],
  [/^\/admin\/banderas\/([0-9a-f-]{36})$/, 'pinstaff', m => pinReportView(m[1])],
  [/^\/admin\/mensajes\/nuevo$/, 'clubmsgs', () => clubMsgForm()],
  [/^\/admin\/mensajes\/([0-9a-f-]{36})$/, 'clubmsgs', m => clubMsgView(m[1])],
  [/^\/admin\/sorteos\/?$/, 'sorteos', () => sorteosView()],
  [/^\/admin\/sorteos\/nuevo$/, 'sorteos', () => sorteoForm(null)],
  [/^\/admin\/sorteos\/([0-9a-f-]{36})$/, 'sorteos', m => sorteoView(m[1])],
  [/^\/admin\/sorteos\/([0-9a-f-]{36})\/editar$/, 'sorteos', m => sorteoForm(m[1])],
  [/^\/admin\/videos\/?$/, 'videos', () => videosView()],
  [/^\/admin\/videos\/([a-z0-9_]+)$/, 'videos', m => videoEdit(m[1])],
  [/^\/admin\/settings\/?$/, 'settings', () => settingsView()],
  [/^\/admin\/audit\/?$/, 'audit', () => auditView()],
];
async function route() {
  const p = location.pathname;
  const hit = ROUTES.map(([re, k, fn]) => [p.match(re), k, fn]).find(x => x[0]);
  if (!hit) { title('No encontrado'); return main('<div class="card empty">Esa sección no existe.</div>'); }
  const [m, key, fn] = hit;
  if (ME.user.must_change && key !== 'password') { history.replaceState(null, '', '/admin/password'); return route(); }
  if (p.replace(/\/$/, '') === '/admin' && !ME.sections.includes('dashboard')) { history.replaceState(null, '', ME.user.role === 'club' ? '/admin/banderas/cargar' : '/admin/strategy'); return route(); }
  if (key !== 'password' && !ME.sections.includes(key)) { nav(key); title('Sin acceso'); return main(`<div class="card"><h2>No tenés acceso a esta sección</h2><p class="meta">${ME.user.role === 'club' ? 'Tu cuenta de club solo carga las banderas del día de tus canchas.' : 'Tu rol es editor: podés editar tarjetas, greens GPS y Cómo jugar la cancha, y ver Clubes de Argentina.'}</p>${ME.user.role === 'club' ? '<a class="btn sm" data-nav href="/admin/banderas/cargar" style="text-decoration:none">Ir a Banderas del día</a>' : '<a class="btn sm" data-nav href="/admin/strategy" style="text-decoration:none">Ir a Cómo jugar la cancha</a>'}</div>`); }
  nav(key); main('<div class="empty">Cargando…</div>');
  try { await fn(m); } catch (e) { if (e.message !== 'auth') main(`<div class="card"><h2>No se pudo cargar</h2><p class="meta">${esc(e.message)}</p></div>`); }
}
async function go(path) { if (window.GStrategy?.dirty) await window.GStrategy.save(); history.pushState(null, '', path); window.scrollTo(0, 0); route(); }
window.addEventListener('popstate', route);
document.addEventListener('click', e => {
  const a = e.target.closest('a[data-nav]'); if (a && !e.metaKey && !e.ctrlKey) { e.preventDefault(); return go(a.getAttribute('href')); }
  const tr = e.target.closest('tr[data-href]'); if (tr && !e.target.closest('a,button,input,select')) return go(tr.dataset.href);
});

/* ---------- shared: table ---------- */
function cell(c, r) {
  const v = r[c.k];
  let h = c.kind === 'datetime' ? fmtDT(v) : c.kind === 'date' ? fmtD(v) : c.kind === 'bool' ? yes(v) : c.kind === 'chip' ? chipH(v) : fmtN(v);
  if (c.link && v != null && v !== '') h = `<a data-nav href="${fill(c.link, r)}">${h}</a>`;
  return `<td class="${c.num ? 'n' : ''}${c.kind === 'date' || c.kind === 'datetime' ? ' nw' : ''}" data-l="${esc(c.l)}">${h}</td>`;
}
function table(cols, rows, opt = {}) {
  if (!rows.length) return `<div class="empty">${opt.empty || 'Todavía no hay datos.'}</div>`;
  const rowLink = opt.rowLink;
  return `<div class="tscroll"><table class="tbl" data-sortable><thead><tr>${cols.map((c, i) => `<th class="${c.num ? 'n' : ''}" data-i="${i}">${esc(c.l)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr ${rowLink ? `class="rl" data-href="${fill(rowLink, r)}"` : ''}>${cols.map(c => cell(c, r)).join('')}</tr>`).join('')}</tbody></table></div>`;
}
document.addEventListener('click', e => {   // client-side sort on header click
  const th = e.target.closest('table[data-sortable] th'); if (!th) return;
  const tb = th.closest('table').tBodies[0], i = +th.dataset.i, dir = th.dataset.dir === 'asc' ? 'desc' : 'asc';
  th.closest('tr').querySelectorAll('th').forEach(x => delete x.dataset.dir); th.dataset.dir = dir;
  const key = td => { const t = td.textContent.trim(); const n = Number(t.replace(/\./g, '').replace(',', '.')); return t === '—' ? null : Number.isFinite(n) && t !== '' ? n : t.toLowerCase(); };
  [...tb.rows].sort((a, b) => { const x = key(a.cells[i]), y = key(b.cells[i]); if (x == null) return 1; if (y == null) return -1; return (x > y ? 1 : x < y ? -1 : 0) * (dir === 'asc' ? 1 : -1); }).forEach(r => tb.appendChild(r));
});

/* ---------- shared: bar chart (every bar opens its list) ---------- */
function bars(data, o) {
  const W = 640, H = 190, pl = 30, pb = 26, pt = 12, n = data.length; if (!n) return '<div class="empty">Sin datos.</div>';
  const vals = data.map(d => o.stack ? o.stack.reduce((s, k) => s + (d[k] || 0), 0) : d.v || 0), max = Math.max(1, ...vals);
  if (vals.every(v => !v)) return `<div class="empty" style="padding:30px 0">${o.empty || 'Sin datos en este período.'}</div>`;
  const bw = (W - pl - 6) / n, ticks = [0, Math.ceil(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
  const y = v => H - pb - (v / max) * (H - pb - pt);
  let s = ticks.map(t => `<line x1="${pl}" x2="${W}" y1="${y(t)}" y2="${y(t)}" stroke="#E6E2D8"/><text x="${pl - 6}" y="${y(t) + 4}" text-anchor="end" font-size="10.5" fill="#9AA09B" font-family="Geist" style="font-variant-numeric:tabular-nums">${t}</text>`).join('');
  data.forEach((d, i) => {
    const x = pl + i * bw + bw * .15, w = Math.max(2, bw * .7); let acc = 0, rects = '';
    for (const [k, col] of (o.stack || [['v', '#0F3D2E']]).map((k, j) => Array.isArray(k) ? k : [k, o.colors?.[j] || '#0F3D2E'])) {
      const v = d[k] || 0; if (!v) continue; const y0 = y(acc), y1 = y(acc + v); rects += `<rect class="${k === 'v' ? 'b' : ''}" x="${x}" y="${y1}" width="${w}" height="${Math.max(1, y0 - y1)}" rx="2" fill="${col}"/>`; acc += v;
    }
    const lab = o.label(d, i);
    s += `<g class="bar-hit" data-href="${esc(o.href(d))}"><title>${esc(o.tip(d))}</title><rect x="${pl + i * bw}" y="${pt}" width="${bw}" height="${H - pt - pb}" fill="transparent"/>${rects}${lab ? `<text x="${x + w / 2}" y="${H - 8}" text-anchor="middle" font-size="10.5" fill="#5E6560" font-family="Geist">${esc(lab)}</text>` : ''}</g>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img">${s}</svg>`;
}
document.addEventListener('click', e => { const g = e.target.closest('.bar-hit[data-href]'); if (g) go(g.dataset.href); });

/* ---------- dashboard ---------- */
let TEST = false;
const MON = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const tq = () => TEST ? '&test=1' : '';
const tile = (href, l, v, s, cls = '') => `<a class="tile ${cls}" data-nav href="${href}"><div class="l">${l}</div><div class="v ${!v ? 'zero' : ''}">${fmtN(v)}</div><div class="s">${s}</div></a>`;
async function dashboard() {
  title('Métricas de la plataforma');
  const d = await api('/api/admin/metrics' + (TEST ? '?test=1' : ''));
  const u = d.users, l = d.links, r = d.rounds, sy = d.syncs, st = d.strategy, P = d.platform;
  const pubHoles = st.reduce((s, c) => s + c.published_holes, 0), holesTot = st.reduce((s, c) => s + (c.holes || 18), 0);
  const t = (p) => p + (p.includes('?') ? tq() : (TEST ? '?test=1' : ''));
  const fails = (await api('/api/admin/gps/runs?status=failed&days=2').catch(() => ({ runs: [] }))).runs;
  const failBanner = fails.length ? `<div class="card fail-banner"><b>Falló la lectura de greens</b> en ${[...new Set(fails.map(f => f.vm_course))].length} cancha(s) en las últimas 48 h. ${fails.slice(0, 3).map(f => `<a data-nav href="/admin/gps/${esc(f.course_id)}/lecturas">${esc(f.vm_course)} · ${fmtDT(f.started_at)}</a>`).join(' · ')}</div>` : '';
  main(failBanner + `
  <div class="filters" style="justify-content:space-between"><div class="meta">Datos reales de la base, al ${fmtDT(d.generated_at)} (hora Argentina).${u.test_accounts ? ` ${TEST ? 'Incluye' : 'Sin contar'} ${u.test_accounts} cuenta${u.test_accounts > 1 ? 's' : ''} de prueba (@example.com).` : ''}</div>
    ${u.test_accounts ? `<label class="chk"><input type="checkbox" id="testchk" ${TEST ? 'checked' : ''}> Incluir cuentas de prueba</label>` : ''}</div>
  <div class="sec" style="margin-top:4px"><h2>Usuarios</h2></div>
  <div class="tiles">
    ${tile(t('/admin/metrics/users'), 'Usuarios', u.total, `${fmtN(u.new30)} nuevos en 30 días`, 'gold')}
    ${tile(t('/admin/metrics/active?days=7'), 'Activos · 7 días', u.active7, u.total ? `${Math.round(u.active7 * 100 / u.total)}% del total` : 'Sin usuarios')}
    ${tile(t('/admin/metrics/active?days=30'), 'Activos · 30 días', u.active30, u.total ? `${Math.round(u.active30 * 100 / u.total)}% del total` : 'Sin usuarios')}
    ${tile(t('/admin/metrics/signups?days=7'), 'Altas · 7 días', u.new7, `${fmtN(u.new30)} en 30 días`)}
    ${tile(t('/admin/metrics/sessions?platform=web'), 'Sesiones web', P.web.sessions, P.web.users ? `${fmtN(P.web.users)} usuario${P.web.users > 1 ? 's' : ''}` : 'Nadie con sesión web abierta')}
    ${tile(t('/admin/metrics/sessions?platform=ios'), 'Sesiones iPhone', P.ios.sessions, P.ios.users ? `${fmtN(P.ios.users)} usuario${P.ios.users > 1 ? 's' : ''}` : 'Nadie con sesión en la app')}
  </div>
  <div class="sec"><h2>Golfistics</h2></div>
  <div class="tiles">
    ${tile(t('/admin/metrics/links'), 'Clubes vinculados', l.accounts, `${fmtN(l.users_linked)} usuario${l.users_linked === 1 ? '' : 's'} · ${fmtN(l.clubs)} club${l.clubs === 1 ? '' : 'es'} · ${fmtN(l.saved_clave)} con clave guardada`)}
    ${tile(t('/admin/metrics/links?status=ok'), 'Vínculos al día', l.ok, 'Última sincronización OK')}
    ${tile(t('/admin/metrics/links?status=error'), 'Vínculos con error', l.error, l.error ? 'La última lectura falló' : 'Ninguno falló')}
    ${tile(t('/admin/metrics/syncs'), 'Sincronizaciones', sy.runs, sy.runs ? `${fmtN(sy.ok)} OK · ${fmtN(sy.fail)} con error · ${fmtN(sy.new_rounds)} rondas nuevas` : 'Se registran desde hoy: todavía no hubo')}
    ${tile(t('/admin/metrics/syncs?status=fail'), 'Sincronizaciones fallidas', sy.fail, sy.runs ? `${Math.round(sy.fail * 100 / sy.runs)}% del total` : 'Sin corridas registradas')}
  </div>
  <div class="sec"><h2>Juego</h2></div>
  <div class="tiles">
    ${tile(t('/admin/metrics/rounds'), 'Rondas sincronizadas', r.visible, `${fmtN(r.stored)} guardadas (con copias entre clubes) · ${fmtN(r.with_holes)} hoyo por hoyo`, 'gold')}
    ${tile(t('/admin/metrics/courses'), 'Canchas jugadas', r.courses_played, 'Rondas por club y cancha')}
    ${tile(t('/admin/metrics/live_rounds'), 'Rondas con GPS', d.live.rounds, d.live.rounds ? `${fmtN(d.live.finished)} terminadas · ${fmtN(d.live.users)} usuarios` : 'Todavía nadie jugó con el GPS')}
    ${tile(t('/admin/metrics/shots'), 'Golpes registrados', d.live.shots, d.live.shots ? `${fmtN(d.live.shots_with_club)} con palo` : 'Sin golpes cargados')}
    ${tile(t('/admin/metrics/recaps'), 'Audios post ronda', d.recaps.total, d.recaps.total ? `${fmtN(d.recaps.on_device)} en el iPhone · ${fmtN(d.recaps.web_mic || 0)} con el mic de la compu` : 'Todavía no hay audios')}
    ${tile(t('/admin/metrics/notes'), 'Notas de ronda', d.content.notes, 'Putts, GIR y FIR cargados')}
    ${tile(t('/admin/metrics/bags'), 'Bolsas configuradas', d.content.bags, `${fmtN(d.content.player_clubs)} con palos detectados · ${fmtN(d.content.samples)} tiros de launch monitor`)}
    ${tile(t('/admin/metrics/strategy'), 'Hoyos con estrategia', pubHoles, `publicados de ${fmtN(holesTot)} en ${st.length} canchas`)}
  </div>
  <div class="sec"><h2>En el tiempo</h2><span class="meta">Tocá una barra para ver el detalle.</span></div>
  <div class="charts">
    <div class="card chart"><h3 style="margin-top:0">Altas por semana</h3>${bars(d.series.signups_weekly, { href: x => t(`/admin/metrics/signups?from=${x.d}&to=${addDays(x.d, 6)}`), tip: x => `Semana del ${fmtD(x.d)}: ${x.v}`, label: (x, i) => i % 4 === 0 ? `${+x.d.slice(8)} ${MON[+x.d.slice(5, 7) - 1]}` : '' })}</div>
    <div class="card chart"><h3 style="margin-top:0">Usuarios con actividad por día</h3>${bars(d.series.active_daily, { href: () => t('/admin/metrics/active?days=30'), tip: x => `${fmtD(x.d)}: ${x.v}`, label: (x, i) => i % 5 === 0 ? `${+x.d.slice(8)}/${+x.d.slice(5, 7)}` : '' })}</div>
    <div class="card chart"><h3 style="margin-top:0">Rondas por mes (fecha de juego)</h3>${bars(d.series.rounds_monthly, { href: x => t(`/admin/metrics/rounds?month=${x.d.slice(0, 7)}`), tip: x => `${MON[+x.d.slice(5, 7) - 1]} ${x.d.slice(0, 4)}: ${x.v} guardadas`, label: (x, i) => i % 3 === 0 ? `${MON[+x.d.slice(5, 7) - 1]} ${x.d.slice(2, 4)}` : '' })}</div>
    <div class="card chart"><h3 style="margin-top:0">Sincronizaciones por día</h3>${bars(d.series.syncs_daily, { stack: [['ok', '#0F3D2E'], ['fail', '#B5543C']], href: x => t(`/admin/metrics/syncs?from=${x.d}&to=${x.d}`), tip: x => `${fmtD(x.d)}: ${x.ok} OK, ${x.fail} con error`, label: (x, i) => i % 5 === 0 ? `${+x.d.slice(8)}/${+x.d.slice(5, 7)}` : '', empty: 'Todavía no hay sincronizaciones registradas: se guardan desde esta versión.' })}</div>
  </div>
  <div class="sec"><h2>Detalle</h2></div>
  <div class="two">
    <div class="card"><h3 style="margin-top:0">Rondas por club (leídas desde)</h3>${table([{ k:'name', l:'Club' }, { k:'rounds', l:'Rondas guardadas', num:true }], r.by_club, { rowLink: t('/admin/metrics/rounds?club={id}') })}</div>
    <div class="card"><h3 style="margin-top:0">Canchas más jugadas</h3>${table([{ k:'course', l:'Cancha' }, { k:'club', l:'Club' }, { k:'rounds', l:'Rondas', num:true }], r.by_course, { rowLink: t('/admin/metrics/rounds?course={course}') })}<div style="margin-top:8px"><a class="meta" data-nav href="${t('/admin/metrics/courses')}">Ver todas las canchas →</a></div></div>
    <div class="card"><h3 style="margin-top:0">Cómo jugar la cancha · cobertura</h3>${table([{ k:'vm_course', l:'Cancha' }, { k:'status', l:'Estado', kind:'chip' }, { k:'published_holes', l:'Publicados', num:true }, { k:'pending_holes', l:'Borradores', num:true }], st, { rowLink: '/admin/courses/{course_id}', empty: 'No hay canchas con GPS todavía.' })}</div>
    <div class="card"><h3 style="margin-top:0">Web vs iPhone</h3>${table([{ k:'p', l:'Plataforma', kind:'chip' }, { k:'sessions', l:'Sesiones abiertas', num:true }, { k:'users', l:'Usuarios', num:true }, { k:'last_at', l:'Último uso', kind:'datetime' }], ['web', 'ios', 'otro'].map(p => ({ p, ...P[p] })), { rowLink: t('/admin/metrics/sessions?platform={p}') })}
      <p class="meta" style="margin:8px 0 0">Según el navegador o la app de cada sesión abierta. "Otro" son pruebas por línea de comandos.</p></div>
  </div>`);
  const c = $('#testchk'); if (c) c.onchange = () => { TEST = c.checked; dashboard(); };
}

/* ---------- metric drill-down ---------- */
async function metricView(metric) {
  const sp = new URLSearchParams(location.search); TEST = sp.get('test') === '1' || TEST;
  if (TEST) sp.set('test', '1');
  const d = await api(`/api/admin/metrics/${metric}?${sp}`);
  title(d.title, 'Métricas');
  const sel = f => `<div><label>${esc(f.l)}</label><select data-f="${f.k}">${f.options.map(([v, l]) => `<option value="${esc(v)}" ${String(sp.get(f.k) ?? '') === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
  const range = sp.get('from') || sp.get('to') || sp.get('month') ? `<div class="chk"><span class="chip draft">${sp.get('month') ? 'Mes ' + esc(sp.get('month')) : `${esc(fmtD(sp.get('from')))} → ${esc(fmtD(sp.get('to')))}`}</span> <a href="#" data-a="clearrange" class="meta">Quitar</a></div>` : '';
  main(`<div class="crumbs"><a data-nav href="/admin${TEST ? '' : ''}">← Métricas</a></div>
    ${d.subtitle ? `<p class="meta" style="margin:0 0 12px">${esc(d.subtitle)}</p>` : ''}${d.note ? `<div class="note">${esc(d.note)}</div>` : ''}
    <div class="filters">${d.filters.map(sel).join('')}${range}<label class="chk"><input type="checkbox" data-f="test" ${TEST ? 'checked' : ''}> Incluir cuentas de prueba</label></div>
    <div class="card"><div class="ov" style="margin-bottom:8px"><div class="overline num">${fmtN(d.rows.length)} fila${d.rows.length === 1 ? '' : 's'}</div><span class="meta sort-hint">Tocá un encabezado para ordenar</span></div>
    ${table(d.columns, d.rows, { empty: 'No hay datos para estos filtros.' })}</div>`);
  $$('.filters [data-f]').forEach(el => el.onchange = () => {
    const q = new URLSearchParams(location.search);
    if (el.type === 'checkbox') { TEST = el.checked; TEST ? q.set('test', '1') : q.delete('test'); } else if (el.value) q.set(el.dataset.f, el.value); else q.delete(el.dataset.f);
    history.replaceState(null, '', `${location.pathname}?${q}`); metricView(metric);
  });
  const cr = $('[data-a="clearrange"]'); if (cr) cr.onclick = e => { e.preventDefault(); const q = new URLSearchParams(location.search); ['from', 'to', 'month'].forEach(k => q.delete(k)); history.replaceState(null, '', `${location.pathname}?${q}`); metricView(metric); };
}

/* ---------- users ---------- */
/* ---------- shared: compact rows (mobile-first lists that open their own page) ---------- */
const ini = n => String(n || '').trim().split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '·';
const ago = t => { if (!t) return '—'; const m = (Date.now() - new Date(t)) / 60000; return m < 60 ? 'recién' : m < 1440 ? `hace ${Math.round(m / 60)} h` : m < 1440 * 30 ? `hace ${Math.round(m / 1440)} d` : fmtD(t); };
const VB = '<span class="vb" title="Verificado"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 2.8l2.3 1.7 2.9-.1.9 2.7 2.4 1.7-.9 2.7.9 2.7-2.4 1.7-.9 2.7-2.9-.1L12 21.2l-2.3-1.7-2.9.1-.9-2.7-2.4-1.7.9-2.7-.9-2.7 2.4-1.7.9-2.7 2.9.1z" fill="#1D9BF0"/><path d="M8.3 12.2l2.5 2.4 4.9-5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Verificado</span>';
const KIND = { admin:['admin','Admin'], editor:['editor','Editor'], profesor:['prof','Profesor'], prueba:['test','Prueba'], jugador:['','Jugador'] };
const kindChip = u => { const [c, l] = KIND[u.kind] || KIND.jugador; return `<span class="chip ${c}">${l}</span>` + (u.profesor ? (u.profesor.verified ? ' ' + VB + '' : '') + (u.profesor.status === 'pending' ? ' <span class="chip draft">Pendiente</span>' : '') : ''); };
const arow = (href, av, main, sub, side) => `<a class="arow2" data-nav href="${href}"><span class="aav">${esc(av)}</span><span class="am"><span class="at">${main}</span><span class="as">${sub}</span></span>${side ? `<span class="asd">${side}</span>` : ''}<span class="achev" aria-hidden="true">›</span></a>`;
const fchips = (opts, cur, attr) => `<div class="fchips" role="group">${opts.map(([k, l, n]) => `<button type="button" class="fchip ${k === cur ? 'on' : ''}" ${attr}="${k}" aria-pressed="${k === cur}">${l}${n != null ? ` <span class="num">${n}</span>` : ''}</button>`).join('')}</div>`;
const setQS = (k, v, dflt) => { const q = new URLSearchParams(location.search); !v || v === dflt ? q.delete(k) : q.set(k, v); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '')); };
async function usersView() {
  title('Usuarios', 'Plataforma');
  const sp = new URLSearchParams(location.search); let kind = sp.get('rol') || 'todos', qv = sp.get('q') || '';
  const d = await api(`/api/admin/users?test=1`); const all = d.users;
  const norm = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const count = k => k === 'todos' ? all.filter(u => u.kind !== 'prueba').length : all.filter(u => k === 'admin' ? (u.kind === 'admin' || u.kind === 'editor') : u.kind === k).length;
  main(`<div class="lsearch"><input type="search" id="uq" value="${esc(qv)}" placeholder="Buscar por nombre o email" aria-label="Buscar usuarios" autocomplete="off"></div>
    <div id="uchips"></div><div id="ulist"></div>`);
  const draw = () => {
    $('#uchips').innerHTML = fchips([['todos','Todos',count('todos')],['admin','Admin',count('admin')],['jugador','Jugador',count('jugador')],['profesor','Profesor',count('profesor')],['prueba','Prueba',count('prueba')]], kind, 'data-k');
    $$('#uchips [data-k]').forEach(b => b.onclick = () => { kind = b.dataset.k; setQS('rol', kind, 'todos'); draw(); });
    const n = norm(qv), rows = all.filter(u => (kind === 'todos' ? u.kind !== 'prueba' : kind === 'admin' ? (u.kind === 'admin' || u.kind === 'editor') : u.kind === kind)
      && (!n || norm(u.name).includes(n) || norm(u.email).includes(n) || norm(u.clubs).includes(n)));
    const short = c => (c || '').replace(/Jockey Club Argentino/g, 'Jockey').replace(/Mar del Plata Golf Club/g, 'Mar del Plata');
    $('#ulist').innerHTML = rows.length ? `<div class="card rows">${rows.map(u => arow(`/admin/users/${u.id}`, ini(u.name || u.email), `${esc(u.name || 'Sin nombre')} ${kindChip(u)}`,
        `${u.email ? esc(u.email) : '<span class="sindato">Sin email</span>'}${u.clubs ? ' · ' + esc(short(u.clubs)) : ''}`,
        u.kind === 'profesor' && !u.rounds_stored ? (u.last_seen ? `<small>${ago(u.last_seen)}</small>` : '') : `<b class="num">${fmtN(u.rounds_stored)}</b><small>${u.rounds_stored === 1 ? 'ronda' : 'rondas'}</small><small>${ago(u.last_seen)}</small>`)).join('')}</div>
      <p class="muted lfoot">${rows.length} de ${all.length} usuarios</p>` : `<div class="card empty">No hay usuarios${qv ? ` con “${esc(qv)}”` : ''}${kind !== 'todos' ? ' en este filtro' : ''}.</div>`;
  };
  draw(); let t; $('#uq').oninput = e => { clearTimeout(t); t = setTimeout(() => { qv = e.target.value.trim(); setQS('q', qv, ''); draw(); }, 150); };
}
async function userView(id) {
  const d = await api(`/api/admin/users/${id}`); const u = d.user, c = d.counts, self = u.id === ME.user.id;
  title(u.name || u.email, 'Usuarios');
  const uq = `user=${encodeURIComponent(u.id)}&test=1`;
  const pf = d.profesor, PST = { pending:'Pendiente', active:'Activo' };
  const profCard = pf ? `<div class="card"><h2>Profesor</h2><dl class="kv"><dt>Estado</dt><dd><span class="chip ${pf.status === 'active' ? 'ok' : 'draft'}">${PST[pf.status] || esc(pf.status)}</span>${pf.status === 'pending' ? ' <span class="meta">sin email ni contraseña hasta que la reclame</span>' : ''}</dd>
      <dt>Verificado</dt><dd><label class="tgl"><input type="checkbox" data-pf="verified" ${pf.verified ? 'checked' : ''}><span></span>${pf.verified ? 'Sí' : 'No'}</label>${pf.verified ? ' ' + VB : ''}${pf.verified_by ? ` <span class="meta">por ${esc(pf.verified_by)}</span>` : ''}</dd>
      <dt>Visible</dt><dd><label class="tgl"><input type="checkbox" data-pf="active" ${pf.active ? 'checked' : ''}><span></span>${pf.active ? 'Aparece en la búsqueda' : 'Oculto para los jugadores'}</label></dd>
      <dt>Matrícula AAG</dt><dd>${esc(pf.aag_matricula || '—')}</dd><dt>Lugares</dt><dd>${pf.locations?.length ? esc(pf.locations.join(' · ')) : '—'}</dd>
      <dt>Alumnos</dt><dd class="num">${pf.players} <span class="meta">(${pf.sharing} comparten métricas)</span></dd><dt>Origen</dt><dd>${({ admin:'Creado en el panel', lead:'Profesor interesado aprobado', signup:'Se registró' })[pf.created_via] || esc(pf.created_via || '—')}</dd></dl></div>` : '';
  main(`<div class="crumbs"><a data-nav href="${pf ? '/admin/profesores' : '/admin/users'}">← ${pf ? 'Profesores' : 'Usuarios'}</a></div>
  <div class="two">
    <div class="card"><h2>Perfil</h2><dl class="kv"><dt>Nombre</dt><dd>${esc(u.name || pf?.display_name || '—')}</dd><dt>Email</dt><dd>${u.email ? esc(u.email) : '<span class="sindato">Sin email</span>'}</dd><dt>Alta</dt><dd>${fmtDT(u.created_at)}</dd>
      <dt>Jugador</dt><dd>${esc(d.accounts[0]?.player_name || '—')}</dd><dt>Hándicap</dt><dd class="num">${d.last_hi ? `${String(d.last_hi.hi).replace('.', ',')} <span class="muted">(${fmtD(d.last_hi.date)})</span>` : '—'}</dd></dl></div>
    ${pf ? profCard : `<div class="card"><h2>Acceso al panel</h2><dl class="kv"><dt>Rol</dt><dd>${chipH(u.role)}</dd>${u.role ? `<dt>Desde</dt><dd>${fmtDT(u.granted_at)}${u.granted_by ? ' · por ' + esc(u.granted_by) : ''}</dd>` : ''}</dl>
      <div class="acts" style="margin-top:12px">${self ? '<span class="meta">Es tu cuenta: no podés quitarte el rol de admin.</span>' : `
        ${u.role !== 'admin' ? `<button class="btn sm" data-a="grant" data-role="admin">Hacer admin</button>` : ''}${u.role !== 'editor' ? `<button class="btn gold sm" data-a="grant" data-role="editor">Hacer editor</button>` : ''}${u.role ? `<button class="btn neg sm" data-a="revoke">Quitar acceso</button>` : ''}`}</div></div>`}
  </div>
  ${pf?.status === 'pending' ? `<p class="meta" style="margin-top:14px">Sin actividad: es un profesor pendiente (sin email ni contraseña). Va a poder entrar cuando activemos las cuentas de profesor.</p>` : `<div class="sec"><h2>Actividad</h2></div>
  <div class="tiles">
    ${tile(`/admin/metrics/rounds?${uq}`, 'Rondas', c.rounds_visible, `${fmtN(c.rounds_stored)} guardadas`)}
    ${tile(`/admin/metrics/live_rounds?${uq}`, 'Rondas con GPS', c.live_rounds, 'Jugadas con Golflet')}
    ${tile(`/admin/metrics/shots?${uq}`, 'Golpes', c.shots, 'Registrados con GPS')}
    ${tile(`/admin/metrics/recaps?${uq}`, 'Audios', c.recaps, 'Post ronda')}
    ${tile(`/admin/metrics/notes?${uq}`, 'Notas', c.notes, 'Putts, GIR, FIR')}
    ${tile(`/admin/metrics/bags?${uq}`, 'Bolsa', c.bag_items, c.player_clubs ? `${c.player_clubs.length} palos detectados` : 'Palos por defecto')}
  </div>
  <div class="card" style="margin-bottom:14px"><h3 style="margin-top:0">Clubes vinculados</h3>${table([{ k:'club_name', l:'Club' }, { k:'source', l:'Origen' }, { k:'matricula', l:'Matrícula' }, { k:'player_name', l:'Jugador' }, { k:'handicap_index', l:'HI', num:true },
    { k:'clave_guardada', l:'Clave guardada', kind:'bool' }, { k:'last_sync_status', l:'Estado', kind:'chip' }, { k:'last_sync_at', l:'Última sinc.', kind:'datetime' }, { k:'last_sync_message', l:'Mensaje' }, { k:'rounds_visible', l:'Rondas', num:true }, { k:'rounds_with_holes', l:'Hoyo por hoyo', num:true }],
    d.accounts, { empty: 'Todavía no vinculó Golfistics.' })}</div>
  <div class="two">
    <div class="card"><h3 style="margin-top:0">Rondas por cancha</h3>${table([{ k:'course', l:'Cancha', link: `/admin/metrics/rounds?${uq}&course={course}` }, { k:'club_played', l:'Club' }, { k:'rounds', l:'Rondas', num:true }, { k:'best', l:'Mejor gross', num:true }, { k:'last', l:'Última', kind:'date' }], d.rounds_by_course)}</div>
    <div class="card"><h3 style="margin-top:0">Sesiones abiertas</h3>${table([{ k:'platform', l:'Plataforma', kind:'chip' }, { k:'app_build', l:'Build' }, { k:'created_at', l:'Ingresó', kind:'datetime' }, { k:'last_seen', l:'Último uso', kind:'datetime' }, { k:'expires_at', l:'Vence', kind:'date' }], d.sessions, { empty: 'Sin sesiones abiertas.' })}
      <p class="meta" style="margin:8px 0 0">Sin tokens ni IP.</p></div>
    <div class="card"><h3 style="margin-top:0">Sincronizaciones</h3>${table([{ k:'created_at', l:'Cuándo', kind:'datetime' }, { k:'trigger', l:'Origen', kind:'chip' }, { k:'ok', l:'OK', kind:'bool' }, { k:'new_rounds', l:'Nuevas', num:true }, { k:'message', l:'Mensaje' }], d.syncs, { empty: 'Sin sincronizaciones registradas todavía (se guardan desde esta versión).' })}</div>
    <div class="card"><h3 style="margin-top:0">Cambios de acceso</h3>${table([{ k:'created_at', l:'Cuándo', kind:'datetime' }, { k:'actor_email', l:'Quién' }, { k:'summary', l:'Qué' }], d.audit, { empty: 'Sin cambios registrados.' })}</div>
  </div>`}`);
  $$('[data-pf]').forEach(c => c.onchange = async () => { c.disabled = true;
    try { await api(`/api/admin/profesores/${encodeURIComponent(u.id)}`, { method:'PATCH', body: JSON.stringify({ [c.dataset.pf]: c.checked }) }); toast(c.dataset.pf === 'verified' ? (c.checked ? 'Marcado como verificado.' : 'Ya no figura como verificado.') : (c.checked ? 'Visible para los jugadores.' : 'Oculto para los jugadores.')); userView(id); }
    catch (e) { c.checked = !c.checked; c.disabled = false; toast(e.message, 1); } });
  $$('[data-a="grant"]').forEach(b => b.onclick = async () => { if (!(await askInline(b, `Se le da el rol ${b.dataset.role} a ${u.email}.`, 'Sí, dar el rol'))) return;
    try { await api('/api/admin/roles', { method:'PUT', body: JSON.stringify({ user_id: u.id, role: b.dataset.role }) }); toast('Rol actualizado.'); userView(id); } catch (e) { toast(e.message, 1); } });
  const rv = $('[data-a="revoke"]'); if (rv) rv.onclick = async () => { if (!(await askInline(rv, `Se le quita el acceso al panel a ${u.email}.`, 'Sí, quitar acceso'))) return;
    try { await api(`/api/admin/roles/${u.id}`, { method:'DELETE', body: '{}' }); toast('Acceso quitado.'); userView(id); } catch (e) { toast(e.message, 1); } };
}

/* ---------- roles ---------- */
async function rolesView() {
  title('Accesos y roles', 'Plataforma');
  const d = await api('/api/admin/roles');
  main(`<div class="two">
    <div class="card"><h2>Quién entra al panel</h2>
      ${table([{ k:'name', l:'Nombre', link:'/admin/users/{user_id}' }, { k:'email', l:'Email' }, { k:'role', l:'Rol', kind:'chip' }, { k:'granted_at', l:'Desde', kind:'datetime' }, { k:'granted_by', l:'Lo dio' }], d.roles)}
      <div class="acts" style="margin-top:12px">${d.roles.filter(r => r.user_id !== d.me).map(r => `<button class="btn neg sm" data-a="rev" data-id="${esc(r.user_id)}" data-email="${esc(r.email)}">Quitar a ${esc(r.email)}</button>`).join('')}</div>
      <p class="meta">Tu propio rol de admin no se puede quitar desde acá, y siempre tiene que quedar al menos un admin.</p></div>
    <div class="card"><h2>Dar acceso</h2>
      <label>Email de la cuenta de Golflet</label><input type="text" id="remail" placeholder="nombre@ejemplo.com" autocomplete="off">
      <label>Rol</label><select id="rrole"><option value="editor">Editor: solo canchas (tarjetas, greens GPS y Cómo jugar la cancha)</option><option value="admin">Admin: todo (métricas, usuarios, accesos, clubes, ajustes)</option></select>
      <div class="acts" style="margin-top:12px"><button class="btn" id="rgo">Dar acceso</button></div>
      <h3>Qué puede hacer cada rol</h3>
      <table class="tbl"><thead><tr><th>Sección</th><th>Admin</th><th>Editor</th></tr></thead><tbody>
        ${[['Métricas', 1, 0], ['Usuarios', 1, 0], ['Accesos y roles', 1, 0], ['Clubes y escudos', 1, 0], ['Tarjetas: hoyos, par y yardas', 1, 1], ['Greens GPS', 1, 1], ['Cómo jugar la cancha', 1, 1], ['Ajustes y flags (solo lectura)', 1, 0], ['Registro de cambios', 1, 0]]
          .map(([s, a, e]) => `<tr><td>${s}</td><td data-l="Admin">${yes(a)}</td><td data-l="Editor">${yes(e)}</td></tr>`).join('')}</tbody></table>
      <p class="meta">La persona tiene que haber creado su cuenta en Golflet antes. Todo cambio queda en el registro.</p></div></div>`);
  $('#rgo').onclick = async () => { const email = $('#remail').value.trim(), role = $('#rrole').value; if (!email) return toast('Escribí un email.', 1);
    if (!(await askInline($('#rgo'), `Se le da el rol ${role} a ${email}.`, 'Sí, dar el rol'))) return;
    try { const r = await api('/api/admin/roles', { method:'PUT', body: JSON.stringify({ email, role }) }); toast(r.changed ? 'Acceso dado.' : 'Ya tenía ese rol.'); rolesView(); } catch (e) { toast(e.message, 1); } };
  $$('[data-a="rev"]').forEach(b => b.onclick = async () => { if (!(await askInline(b, `Se le quita el acceso a ${b.dataset.email}.`, 'Sí, quitar acceso'))) return;
    try { await api(`/api/admin/roles/${b.dataset.id}`, { method:'DELETE', body: '{}' }); toast('Acceso quitado.'); rolesView(); } catch (e) { toast(e.message, 1); } });
}

/* ---------- clubs ---------- */
const crest = c => c.logo ? `<div class="crest"><img src="${esc(c.logo)}" alt=""></div>` : `<div class="crest mono">${esc(c.initials)}</div>`;
async function clubsView() {
  title('Clubes y escudos', 'Plataforma');
  const { clubs } = await api('/api/admin/clubs');
  main(`<p class="meta" style="margin:0 0 14px">Los clubes aparecen solos cuando alguien vincula Golfistics. Acá podés corregir el nombre que se muestra y el escudo (PNG, JPG o WebP, hasta 600 KB, idealmente cuadrado y con fondo transparente).</p>
  <div class="clubs">${clubs.map(c => `<div class="card" data-club="${c.id}">
    <div class="clubhead">${crest(c)}<div style="flex:1;min-width:0"><div class="overline">${c.code ? 'Golfistics ' + esc(c.code) : 'Sin código'} · escudo ${esc(c.logo_source)}</div>
      <input type="text" data-a="name" value="${esc(c.name)}" style="margin-top:6px;font-weight:600"></div></div>
    <div class="minis">
      <a data-nav href="/admin/metrics/links?club=${c.id}"><b>${fmtN(c.links)}</b><span>vínculos</span></a>
      <a data-nav href="/admin/metrics/rounds?club=${c.id}"><b>${fmtN(c.rounds)}</b><span>rondas</span></a>
      <a data-nav href="/admin/cards"><b>${fmtN(c.courses)}</b><span>canchas</span></a>
      <a data-nav href="/admin/gps"><b>${fmtN(c.gps_courses)}</b><span>con GPS</span></a></div>
    <div class="acts" style="margin-top:12px"><button class="btn sm" data-a="save">Guardar nombre</button>
      ${c.code ? `<label class="btn ghost sm" style="margin:0;color:var(--color-ink);font-size:13px">Subir escudo<input type="file" accept="image/png,image/jpeg,image/webp" data-a="logo" hidden></label>` : ''}
      ${c.logo_source === 'subido' ? `<button class="btn ghost sm" data-a="reset">Volver al original</button>` : ''}</div>
    <div class="meta" style="margin-top:8px">${esc(c.base_url)}</div></div>`).join('')}</div>`);
  $$('[data-club]').forEach(card => { const id = card.dataset.club;
    card.querySelector('[data-a="save"]').onclick = async () => { try { const r = await api(`/api/admin/clubs/${id}`, { method:'PATCH', body: JSON.stringify({ name: card.querySelector('[data-a="name"]').value }) }); toast(r.changed ? 'Nombre guardado.' : 'Sin cambios.'); clubsView(); } catch (e) { toast(e.message, 1); } };
    const f = card.querySelector('[data-a="logo"]'); if (f) f.onchange = () => { const file = f.files[0]; if (!file) return; if (file.size > 600000) return toast('La imagen pesa más de 600 KB.', 1);
      const rd = new FileReader(); rd.onload = async () => { try { await api(`/api/admin/clubs/${id}/logo`, { method:'PUT', body: JSON.stringify({ data_url: rd.result }) }); toast('Escudo actualizado.'); clubsView(); } catch (e) { toast(e.message, 1); } }; rd.readAsDataURL(file); };
    const rs = card.querySelector('[data-a="reset"]'); if (rs) rs.onclick = async () => { if (!(await askInline(rs, 'Vuelve al escudo original.', 'Sí, volver'))) return; try { await api(`/api/admin/clubs/${id}/logo`, { method:'DELETE', body: '{}' }); toast('Listo.'); clubsView(); } catch (e) { toast(e.message, 1); } };
  });
}

/* ---------- course cards ---------- */
async function cardsView() {
  title('Tarjetas: hoyos, par y yardas', 'Canchas');
  const { courses } = await api('/api/admin/courses');
  main(`<p class="meta" style="margin:0 0 14px">Los datos vienen de la tarjeta más reciente de Golfistics. Si alguno está mal (por ejemplo yardas y par cruzados entre hoyos), corregilo acá: la corrección se guarda aparte y la sincronización no la pisa.</p>
  <div class="card">${table([{ k:'name', l:'Cancha' }, { k:'club_name', l:'Club' }, { k:'par', l:'Par', num:true }, { k:'holes', l:'Hoyos', num:true }, { k:'warnings', l:'A revisar', num:true }, { k:'corrected_holes', l:'Corregidos', num:true }, { k:'as_of', l:'Tarjeta del', kind:'date' }, { k:'override_at', l:'Última corrección', kind:'datetime' }],
    courses, { rowLink: '/admin/cards/{club_id}/{name}', empty: 'Todavía no hay canchas: aparecen con la primera sincronización.' })}</div>`);
}
async function cardView(clubId, name) {
  const d = await api(`/api/admin/courses/${clubId}/${encodeURIComponent(name)}`);
  title(`${d.name} · ${d.club_name}`, 'Canchas · Tarjeta');
  const tees = Object.keys(d.holes[0]?.synced.yards || {});
  const inp = (h, f, v, orig, extra = '') => `<input type="number" data-h="${h.hole}" data-f="${f}" value="${v ?? ''}" data-orig="${orig ?? ''}" class="${String(v ?? '') !== String(orig ?? '') ? 'chg' : ''}" ${extra}>${String(v ?? '') !== String(orig ?? '') ? `<span class="orig">Golfistics: ${orig ?? '—'}</span>` : ''}`;
  main(`<div class="crumbs"><a data-nav href="/admin/cards">← Tarjetas</a>${d.gps_course_id ? ` · <a data-nav href="/admin/gps/${d.gps_course_id}">Greens GPS</a> · <a data-nav href="/admin/courses/${d.gps_course_id}">Cómo jugar la cancha</a>` : ''}</div>
  <div class="note">Rojo a la izquierda: la yarda no parece coincidir con el par. Dorado: hoyo corregido. ${esc(d.gps_note)}</div>
  <div class="card">
    <div class="toolbar"><b class="num">Par ${d.par ?? '—'}</b>${d.par !== d.synced_par ? `<span class="muted num">(Golfistics: ${d.synced_par})</span>` : ''}<span class="sp" style="flex:1"></span>
      <span class="meta">Intercambiar</span><select id="swf"><option value="yards">yardas</option><option value="par">par</option><option value="hcp">hándicap</option><option value="all">todo</option></select>
      <span class="meta">del hoyo</span><select id="swa">${d.holes.map(h => `<option>${h.hole}</option>`).join('')}</select><span class="meta">con el</span><select id="swb">${d.holes.map(h => `<option ${h.hole === 2 ? 'selected' : ''}>${h.hole}</option>`).join('')}</select>
      <button class="btn ghost sm" id="swgo">Intercambiar</button></div>
    <div class="tscroll"><table class="tbl ed"><thead><tr><th>Hoyo</th><th class="n">Par</th><th class="n">Hcp</th>${tees.map(t => `<th class="n">${esc(t)}</th>`).join('')}<th class="n">GPS yd</th><th>Estado</th></tr></thead><tbody>
    ${d.holes.map(h => `<tr class="${h.warning ? 'warn' : h.override ? 'fixed' : ''}"><td><b class="num">${h.hole}</b></td>
      <td class="n">${inp(h, 'par', h.effective.par, h.synced.par, 'min="3" max="6"')}</td><td class="n">${inp(h, 'hcp', h.effective.hcp, h.synced.hcp, 'min="1" max="18"')}</td>
      ${tees.map(t => `<td class="n">${inp(h, 'y:' + t, h.effective.yards[t], h.synced.yards[t], 'min="50" max="750"')}</td>`).join('')}
      <td class="n num">${h.gps_tee_to_center_yd ?? '—'}</td><td>${h.warning ? `<span class="chip changed">${esc(h.warning)}</span>` : h.override ? '<span class="chip draft">Corregido</span>' : '<span class="chip published">OK</span>'}</td></tr>`).join('')}
    </tbody></table></div>
    <label>Nota de la corrección (se ve en el registro)</label><input type="text" id="cnote" value="${esc(d.override_note || '')}" placeholder="Ej.: la tarjeta de Golfistics tiene cruzadas las yardas del 7 y el 16">
    <div class="acts" style="margin-top:12px"><button class="btn" id="csave">Guardar corrección</button>${d.holes.some(h => h.override) ? '<button class="btn ghost" id="creset">Volver a los datos de Golfistics</button>' : ''}
      <span class="meta" style="align-self:center">${d.override_at ? `Última corrección ${fmtDT(d.override_at)}${d.override_by ? ' por ' + esc(d.override_by) : ''}` : 'Sin correcciones'}</span></div>
  </div>`);
  const warnOf = (par, ys) => { ys = ys.filter(Boolean); if (!par || !ys.length) return null; const y = Math.max(...ys); return (par === 3 && y > 260) || (par === 4 && (y < 200 || y > 500)) || (par === 5 && y < 380) ? 'La yarda y el par no parecen coincidir' : null; };
  const recheck = tr => { const v = f => +(tr.querySelector(`input[data-f="${f}"]`)?.value || 0); const w = warnOf(v('par'), tees.map(t => v('y:' + t))), chg = [...tr.querySelectorAll('input')].some(x => x.value !== x.dataset.orig);
    tr.className = w ? 'warn' : chg ? 'fixed' : ''; tr.lastElementChild.innerHTML = w ? `<span class="chip changed">${w}</span>` : chg ? '<span class="chip draft">Sin guardar</span>' : '<span class="chip published">OK</span>'; };
  const mark = el => { el.classList.toggle('chg', el.value !== el.dataset.orig); recheck(el.closest('tr')); };
  $$('.ed input').forEach(el => el.oninput = () => mark(el));
  $('#swgo').onclick = () => { const a = $('#swa').value, b = $('#swb').value, f = $('#swf').value; if (a === b) return toast('Elegí dos hoyos distintos.', 1);
    const fields = f === 'all' ? null : f === 'yards' ? tees.map(t => 'y:' + t) : [f];
    $$(`.ed input[data-h="${a}"]`).forEach(x => { if (fields && !fields.includes(x.dataset.f)) return; const y = $(`.ed input[data-h="${b}"][data-f="${x.dataset.f}"]`); [x.value, y.value] = [y.value, x.value]; mark(x); mark(y); });
    toast(`Intercambiado: hoyo ${a} ↔ hoyo ${b}. Revisá y guardá.`); };
  const collect = () => d.holes.map(h => { const o = { hole: h.hole, yards: {} }; $$(`.ed input[data-h="${h.hole}"]`).forEach(x => { if (x.dataset.f.startsWith('y:')) o.yards[x.dataset.f.slice(2)] = x.value === '' ? null : +x.value; else o[x.dataset.f] = x.value === '' ? null : +x.value; }); return o; });
  $('#csave').onclick = async () => { try { await api(`/api/admin/courses/${clubId}/${encodeURIComponent(name)}`, { method:'PUT', body: JSON.stringify({ holes: collect(), note: $('#cnote').value }) }); toast('Corrección guardada. Ya la ven la web y el iPhone.'); cardView(clubId, name); } catch (e) { toast(e.message, 1); } };
  const rs = $('#creset'); if (rs) rs.onclick = async () => { if (!(await askInline(rs, 'Se borran todas las correcciones y vuelve la tarjeta de Golfistics.', 'Sí, borrar correcciones'))) return;
    try { await api(`/api/admin/courses/${clubId}/${encodeURIComponent(name)}`, { method:'PUT', body: JSON.stringify({ holes: [], note: null }) }); toast('Volvió a los datos de Golfistics.'); cardView(clubId, name); } catch (e) { toast(e.message, 1); } };
}

/* ---------- GPS greens ---------- */
async function gpsView() {
  title('Greens GPS', 'Canchas');
  const { courses } = await api('/api/admin/gps');
  main(`<p class="meta" style="margin:0 0 14px">Frente, centro y fondo de cada green vienen de Golfistics (solo lectura, cache de 7 días). Si un punto está mal, corregilo acá: la app usa tu corrección y Golfistics no se toca.</p>
  <div class="card">${table([{ k:'course_label', l:'Cancha' }, { k:'club_name', l:'Club' }, { k:'holes', l:'Hoyos', num:true }, { k:'warnings', l:'Puntos repetidos', num:true }, { k:'overridden_holes', l:'Corregidos', num:true }, { k:'has_osm', l:'Tees OSM', kind:'bool' }, { k:'daily_read', l:'Lectura diaria 6:00', kind:'bool' }, { k:'last_run_at', l:'Última lectura', kind:'datetime' }, { k:'result', l:'Resultado' }, { k:'fetched_at', l:'Leído de Golfistics', kind:'datetime' }],
    courses.map(c => ({ ...c, result: runLabel(c.last_run_status, c.last_run_changed) + (c.review_holes ? ` · ${c.review_holes} a revisar` : '') })), { rowLink: '/admin/gps/{course_id}', empty: 'Todavía no se leyó ninguna cancha: aparecen cuando alguien abre el GPS o la estrategia.' })}</div>`);
}
const runLabel = (st, n) => !st ? '—' : st === 'failed' ? 'Falló' : st === 'changed' ? `Cambiaron ${n} hoyo${n === 1 ? '' : 's'}` : st === 'skipped' ? 'Sin leer (reciente)' : st === 'running' ? 'En curso' : 'OK';
const runChip = (st, n) => `<span class="chip ${st === 'failed' ? 'changed' : st === 'changed' ? 'draft' : 'published'}">${runLabel(st, n)}</span>`;
function greenSvg(h) {
  const pts = [h.effective.front, h.effective.center, h.effective.back, ...(h.override ? [h.golfistics.front, h.golfistics.center, h.golfistics.back] : [])];
  const c = h.effective.center, k = Math.cos(c.lat * Math.PI / 180) * 111320, kl = 110540;
  const xy = p => [(p.lng - c.lng) * k, -(p.lat - c.lat) * kl]; const R = Math.max(25, ...pts.map(p => Math.hypot(...xy(p)))) * 1.25;
  const P = p => { const [x, y] = xy(p); return [60 + x / R * 55, 60 + y / R * 55]; };
  let s = `<rect width="120" height="120" rx="12" fill="#E7EFDF"/><circle cx="60" cy="60" r="${Math.max(10, 14 / R * 55 * 1.4)}" fill="#8DBE73"/>`;
  if (h.override) for (const p of [h.golfistics.front, h.golfistics.center, h.golfistics.back]) { const [x, y] = P(p); s += `<circle cx="${x}" cy="${y}" r="3" fill="none" stroke="#9AA09B" stroke-width="1.2"/>`; }
  [['front', '#F7F5F0'], ['center', '#0F3D2E'], ['back', '#C8A86A']].forEach(([kk, col]) => { const [x, y] = P(h.effective[kk]); s += `<circle cx="${x}" cy="${y}" r="4" fill="${col}" stroke="#0F3D2E" stroke-width="1"/>`; });
  return `<svg viewBox="0 0 120 120" width="72" height="72" aria-label="Green hoyo ${h.hole}">${s}</svg>`;
}
async function gpsCourseView(id) {
  const d = await api(`/api/admin/gps/${id}`);
  title(d.course_label || d.vm_course, `Canchas · Greens GPS${d.club_name && d.club_name !== d.course_label ? ' · ' + d.club_name : ''}`);
  const ll = p => `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`;
  main(`<div class="crumbs"><a data-nav href="/admin/gps">← Greens GPS</a> · <a data-nav href="/admin/courses/${id}">Cómo jugar la cancha</a></div>
  <div class="toolbar"><span class="meta">Leído de Golfistics ${fmtDT(d.fetched_at)}. Escribí "lat, lng" (podés copiarlo de Google Maps u OpenStreetMap). Puntos: blanco frente, verde centro, dorado fondo; gris = original de Golfistics.</span><span style="flex:1"></span><button class="btn ghost sm" id="grf">Volver a leer de Golfistics</button></div>
  <div class="card daily-card"><div class="ov"><div><div class="overline">Lectura diaria 6:00</div>
      <p class="meta" style="margin:6px 0 0">Todos los días a las 06:00 (hora Argentina) se vuelve a leer esta cancha de Golfistics, igual que el botón. Solo lectura. Tus correcciones nunca se pisan: si Golfistics mueve un punto que corregiste, el hoyo queda marcado para revisar.${d.daily_global ? '' : ' <b>El interruptor general está apagado en Ajustes</b>, así que hoy no corre.'}</p></div>
      <label class="switch"><input type="checkbox" id="gdaily" ${d.daily_read ? 'checked' : ''}><span>${d.daily_read ? 'Activada' : 'Apagada'}</span></label></div>
    <dl class="kv" style="margin-top:12px"><dt>Última lectura</dt><dd>${d.last_run ? `${fmtDT(d.last_run.started_at)} · ${d.last_run.trigger === 'cron' ? 'automática' : 'manual'} · ${runChip(d.last_run.status, d.last_run.changed_holes)}${d.last_run.message ? `<div class="meta">${esc(d.last_run.message)}</div>` : ''}` : 'Todavía no hay lecturas registradas.'}</dd></dl>
    <a data-nav href="/admin/gps/${id}/lecturas" class="btn ghost sm" style="text-decoration:none;display:inline-flex;margin-top:10px">Ver historial de lecturas</a></div>
  ${Object.keys(d.review || {}).length ? `<div class="card review-card"><h3 style="margin-top:0">Para revisar</h3><p class="meta">Golfistics movió puntos que tenían corrección manual. Se sigue usando tu corrección.</p>${Object.entries(d.review).map(([h, r]) => `<div class="rv-row"><span>Hoyo <b class="num">${h}</b> · ${r.points.map(p => ({ front:'frente', center:'centro', back:'fondo' })[p] || p).join(', ')} · ${fmtDT(r.at)}</span><button class="btn ghost sm" data-rv="${h}">Marcar revisado</button></div>`).join('')}</div>` : ''}
  <div class="card"><div class="tscroll"><table class="tbl ed gpsrow"><thead><tr><th>Hoyo</th><th></th><th>Frente</th><th>Centro</th><th>Fondo</th><th class="n">Prof. (m)</th><th>Estado</th><th></th></tr></thead><tbody>
  ${d.holes.map(h => `<tr data-hole="${h.hole}" class="${h.override ? 'fixed' : h.warning ? 'warn' : ''}"><td><b class="num">${h.hole}</b></td><td>${greenSvg(h)}</td>
    ${['front', 'center', 'back'].map(k => `<td><input type="text" data-k="${k}" value="${ll(h.effective[k])}" data-orig="${ll(h.golfistics[k])}" class="${h.override?.[k] ? 'chg' : ''}" style="width:190px">${h.override?.[k] ? `<span class="orig" style="text-align:left">Golfistics: ${ll(h.golfistics[k])}</span>` : ''}</td>`).join('')}
    <td class="n num">${h.depth_m}</td><td>${h.override ? '<span class="chip draft">Corregido</span>' : h.warning ? `<span class="chip changed">${esc(h.warning.replace(/^Hoyo \d+: /, ''))}</span>` : '<span class="chip published">OK</span>'}</td>
    <td><div class="acts"><button class="btn sm" data-a="gsave">Guardar</button>${h.override ? '<button class="btn ghost sm" data-a="greset">Restaurar</button>' : ''}<a class="btn ghost sm" style="text-decoration:none" target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=${h.effective.center.lat}&mlon=${h.effective.center.lng}#map=19/${h.effective.center.lat}/${h.effective.center.lng}">Mapa</a></div></td></tr>`).join('')}
  </tbody></table></div></div>`);
  const parse = v => { const m = String(v).trim().match(/^(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)$/); return m ? { lat: +m[1], lng: +m[2] } : null; };
  $$('tr[data-hole]').forEach(tr => { const hole = tr.dataset.hole;
    tr.querySelectorAll('input').forEach(i => i.oninput = () => i.classList.toggle('chg', i.value.trim() !== i.dataset.orig));
    tr.querySelector('[data-a="gsave"]').onclick = async () => { const b = {}; for (const i of tr.querySelectorAll('input')) { const p = parse(i.value); if (!p) return toast(`Hoyo ${hole}: coordenada inválida. Usá "lat, lng".`, 1); b[i.dataset.k] = p; }
      try { await api(`/api/admin/gps/${id}/holes/${hole}`, { method:'PUT', body: JSON.stringify(b) }); toast(`Hoyo ${hole} guardado.`); gpsCourseView(id); } catch (e) { toast(e.message, 1); } };
    const r = tr.querySelector('[data-a="greset"]'); if (r) r.onclick = async () => { if (!(await askInline(r, `El hoyo ${hole} vuelve a los puntos de Golfistics.`, 'Sí, volver'))) return;
      try { await api(`/api/admin/gps/${id}/holes/${hole}`, { method:'DELETE', body: '{}' }); toast('Restaurado.'); gpsCourseView(id); } catch (e) { toast(e.message, 1); } };
  });
  $('#gdaily').onchange = async e => { try { await api(`/api/admin/gps/${id}/daily`, { method:'PUT', body: JSON.stringify({ enabled: e.target.checked }) }); toast(e.target.checked ? 'Lectura diaria activada.' : 'Lectura diaria apagada.'); gpsCourseView(id); } catch (err) { toast(err.message, 1); e.target.checked = !e.target.checked; } };
  $$('[data-rv]').forEach(b => b.onclick = async () => { try { await api(`/api/admin/gps/${id}/review`, { method:'DELETE', body: JSON.stringify({ hole: +b.dataset.rv }) }); toast('Marcado como revisado.'); gpsCourseView(id); } catch (err) { toast(err.message, 1); } });
  $('#grf').onclick = async e => { e.target.disabled = true; try { await api(`/api/admin/gps/${id}/refresh`, { method:'POST', body: '{}' }); toast('Greens leídos de nuevo. Tus correcciones siguen.'); gpsCourseView(id); } catch (err) { toast(err.message, 1); e.target.disabled = false; } };
}

async function trazosView() {
  title('Trazos sobre satélite', 'Canchas');
  const d = await api('/api/admin/trazos');
  const chip = (n, l) => `<span class="chip ${n ? 'draft' : 'published'}">${n} ${l}</span>`;
  main(`<p class="meta" style="margin:0 0 14px">${esc(d.scope)} La foto es el satélite que ya usa TRACK, hasta el zoom 17. Un hoyo sin coordenada no se centra en un punto inventado.</p>
  ${d.courses.map(c => `<div class="card"><div class="ov"><div><b>${esc(c.title)}</b><div class="meta">${esc(c.source)} · ${esc(c.note)}</div></div><div>${chip(c.listo, 'listos')} ${chip(c.revisar, 'a revisar')} ${chip(c.ayuda, 'necesito una mano')}</div></div>
    <div class="hgrid" style="margin-top:12px">${c.holes.map(h => `<a class="hbtn ${h.state === 'listo' ? 'club' : h.state === 'revisar' ? '' : 'player'}" data-nav href="/admin/trazos/${c.club_code}/${encodeURIComponent(c.course)}/${h.hole}"><b class="num">${h.hole}</b><small>${h.state === 'listo' ? 'listo' : h.state === 'revisar' ? 'revisar' : 'ayuda'}</small></a>`).join('')}</div></div>`).join('')}
  <div class="card"><h3 style="margin-top:0">Hoyos en los que hace falta una mano</h3>
  ${d.ayuda.length ? d.ayuda.map(h => `<p class="meta"><a data-nav href="/admin/trazos/${h.club_code}/${encodeURIComponent(h.course)}/${h.hole}">${esc(h.title)} · hoyo ${h.hole}</a> — ${esc(h.detail)}</p>`).join('') : '<p class="meta">Ninguno.</p>'}</div>`);
}
async function trazosHole(club, course, hole) {
  const d = await api(`/api/admin/trazos/${club}/${encodeURIComponent(course)}`);
  const h = d.course.holes.find(x => x.hole === hole) || d.course.holes[0];
  title(`${d.course.course} · hoyo ${h.hole}`, 'Canchas · Trazos');
  const canDraw = !(h.polygon && h.polygon.length >= 3) && !!h.anchor;
  main(`<div class="crumbs"><a data-nav href="/admin/trazos">← Trazos</a></div>
  <p class="meta">${esc(h.detail)}</p>
  <div id="trhost"></div>
  <label class="meta" for="trnotein">Nota de procedencia</label>
  <textarea id="trnotein" maxlength="400" placeholder="Qué estás viendo en la foto y qué no se puede afirmar."></textarea>
  <div class="acts" style="margin-top:10px"><button class="btn ghost sm" id="trprev">Vista previa</button>${canDraw ? '<button class="btn sm" id="trsave">Guardar trazado</button>' : ''}<button class="btn ghost sm" id="trhelp">Dejar para revisión</button></div>
  <div id="trmsg" class="meta"></div>`);
  const view = window.GolfletTrace.mount($('#trhost'), { anchor: h.anchor, tee: h.tee, polygon: h.polygon, axis: h.axis, canDraw, detail: h.detail, credit: d.imagery.attribution });
  const parent = h.confidence === 'openstreetmap' ? 'openstreetmap' : h.axis ? 'golfistics_axis' : 'none';
  const say = (t, err) => { $('#trmsg').textContent = t; if (err) $('#trmsg').style.color = '#8C2F2F'; };
  async function send(status, confirm) {
    const draft = view.draft() || { tee: null, green: [] };
    const body = { confirm, status, parent, tee: draft.tee, green: draft.green, note: $('#trnotein').value };
    const r = await api(`/api/admin/trazos/${club}/${encodeURIComponent(course)}/${h.hole}`, { method: 'PUT', body: JSON.stringify(body) });
    say(r.saved ? 'Guardado. TRACK solo usa un trazado aceptado, y no pisa un contorno que ya existía.' : `Vista previa: ${r.preview.track_lie ? 'TRACK podría detectar el green con este anillo.' : 'TRACK no va a detectar el green con esto.'} ${r.preview.note || ''}`);
  }
  $('#trprev').onclick = () => send(canDraw ? 'draft' : 'needs_review', false).catch(e => say(e.message, 1));
  const save = $('#trsave'); if (save) save.onclick = () => send('accepted', true).catch(e => say(e.message, 1));
  $('#trhelp').onclick = () => send('needs_review', true).catch(e => say(e.message, 1));
}
async function gpsRunsView(id) {
  const [c, d] = await Promise.all([api(`/api/admin/gps/${id}`), api(`/api/admin/gps/runs?course=${encodeURIComponent(id)}&days=90`)]);
  title(`Lecturas · ${c.course_label || c.vm_course}`, `Canchas · Greens GPS${c.club_name && c.club_name !== c.course_label ? ' · ' + c.club_name : ''}`);
  main(`<div class="crumbs"><a data-nav href="/admin/gps/${id}">← ${esc(c.course_label || c.vm_course)}</a></div>
  <div class="card">${table([{ k:'started_at', l:'Cuándo', kind:'datetime' }, { k:'how', l:'Cómo' }, { k:'res', l:'Resultado' }, { k:'holes', l:'Hoyos que cambiaron' }, { k:'conflicts', l:'A revisar', num:true }, { k:'message', l:'Detalle' }],
    d.runs.map(r => ({ ...r, how: r.trigger === 'cron' ? 'Automática 6:00' : `Manual${r.actor_email ? ' · ' + r.actor_email : ''}`, res: runLabel(r.status, r.changed_holes), holes: (r.detail?.changed || []).map(x => `${x.hole} (${x.max_m} m)`).join(', ') || '—' })),
    { empty: 'Todavía no hay lecturas registradas. Aparecen al usar “Volver a leer” o con la lectura diaria.' })}</div>`);
}

/* ---------- settings ---------- */
async function settingsView() {
  title('Ajustes y flags', 'Sistema');
  const d = await api('/api/admin/settings');
  const sw = d.switches || {};
  main(`<div class="card" style="margin-bottom:14px"><div class="ov"><div><div class="overline">Greens GPS</div><h2 style="margin:6px 0 0">Lectura diaria 6:00</h2></div>
      <label class="switch"><input type="checkbox" id="swgps" ${sw.gps_daily_read ? 'checked' : ''}><span>${sw.gps_daily_read ? 'Encendida' : 'Apagada'}</span></label></div>
    <p class="meta" style="margin:10px 0 0">Interruptor general. Cuando está encendido, todos los días a las 06:00 (hora Argentina; Vercel Cron 09:00 UTC) se releen de Golfistics solo las canchas que tengan activada la lectura diaria en Greens GPS. Solo lectura; las correcciones manuales nunca se pisan.</p></div>
  <div class="note">Los flags de abajo son de solo lectura. Se cambian en Vercel (variables de entorno) y requieren un nuevo deploy; las claves y secretos nunca se muestran acá.</div>
  <div class="two">${d.flags.map(f => `<div class="card"><div class="ov"><div><div class="overline">${esc(f.key)}</div><h2 style="margin:6px 0 0">${esc(f.label)}</h2></div><span class="chip ${f.on ? 'ok' : ''}">${f.on ? 'Encendido' : 'Apagado'}</span></div><p class="meta" style="margin:10px 0 0">${esc(f.help)}</p></div>`).join('')}</div>
  <div class="card" style="margin-top:14px"><h2>Configuración fija</h2><dl class="kv" style="grid-template-columns:260px minmax(0,1fr);gap:12px 16px">${d.fixed.map(x => `<dt>${esc(x.label)}</dt><dd><b style="font-weight:600">${esc(x.value)}</b>${x.help ? `<div class="meta">${esc(x.help)}</div>` : ''}</dd>`).join('')}</dl></div>`);
  $('#swgps').onchange = async e => { try { const r = await api('/api/admin/settings', { method:'PUT', body: JSON.stringify({ gps_daily_read: e.target.checked }) }); toast(r.switches.gps_daily_read ? 'Lectura diaria encendida.' : 'Lectura diaria apagada.'); settingsView(); } catch (err) { toast(err.message, 1); e.target.checked = !e.target.checked; } };
}

/* ---------- pedidos de club ("Tengo otro club y no aparece") ---------- */
const fmtS = s => new Date(s).toLocaleString('es-AR', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
async function requestsView() {
  title('Pedidos de club', 'Plataforma');
  const st = new URLSearchParams(location.search).get('status') || 'nuevo';
  const d = await api(`/api/admin/club-requests${st === 'todos' ? '' : '?status=' + st}`);
  main(`${fchips([['nuevo','Nuevos'],['resuelto','Resueltos'],['todos','Todos']], st, 'data-st')}
    ${d.requests.length ? `<div class="card rows">${d.requests.map(r => arow(`/admin/pedidos/${r.id}`, ini(r.club), `<b>${esc(r.club)}</b> ${r.status === 'resuelto' ? '<span class="chip ok">Resuelto</span>' : '<span class="chip draft">Nuevo</span>'}`,
        `${esc(r.nombre || 'Sin nombre')}${r.matricula ? ' · Mat. ' + esc(r.matricula) : ''}${r.mensaje ? ' · ' + esc(r.mensaje.slice(0, 80)) : ''}`, `<small>${fmtS(r.created_at)}</small>`)).join('')}</div>`
      : `<div class="card empty">${st === 'nuevo' ? 'No hay pedidos nuevos.' : 'Todavía no hay pedidos.'}</div>`}
    <p class="muted lfoot">Llegan desde “Tengo otro club y no aparece” (web e iPhone). Hasta 5 por día por usuario. Sin aviso por email: no hay casilla de administración configurada.</p>`);
  $$('[data-st]').forEach(b => b.onclick = () => { setQS('status', b.dataset.st, 'nuevo'); requestsView(); });
}
async function requestView(id) {
  const r = (await api('/api/admin/club-requests')).requests.find(x => x.id === id); title('Pedido de club', 'Plataforma · Pedidos de club');
  if (!r) return main(`<div class="crumbs"><a data-nav href="/admin/pedidos">← Pedidos de club</a></div><div class="card empty">Ese pedido no existe.</div>`);
  main(`<div class="crumbs"><a data-nav href="/admin/pedidos">← Pedidos de club</a></div>
    <div class="card"><h2>${esc(r.club)}</h2><dl class="kv"><dt>Estado</dt><dd>${r.status === 'resuelto' ? `<span class="chip ok">Resuelto</span> <span class="meta">${r.resolved_at ? fmtS(r.resolved_at) : ''}${r.resolved_by ? ' · ' + esc(r.resolved_by) : ''}</span>` : '<span class="chip draft">Nuevo</span>'}</dd>
      <dt>Jugador</dt><dd><a data-nav href="/admin/users/${encodeURIComponent(r.user_id)}">${esc(r.nombre || 'Sin nombre')}</a></dd><dt>Matrícula</dt><dd class="num">${esc(r.matricula || '—')}</dd><dt>Fecha</dt><dd>${fmtDT(r.created_at)}</dd>
      <dt>Mensaje</dt><dd style="white-space:pre-wrap">${esc(r.mensaje || '—')}</dd></dl>
      <div class="acts" style="margin-top:14px">${r.status === 'resuelto' ? `<button class="btn ghost sm" data-to="nuevo">Reabrir</button>` : `<button class="btn sm" data-to="resuelto">Marcar resuelto</button>`}</div></div>`);
  $$('[data-to]').forEach(b => b.onclick = async () => { b.disabled = true; try { await api(`/api/admin/club-requests/${id}`, { method: 'PATCH', body: JSON.stringify({ status: b.dataset.to }) }); toast('Listo.'); requestView(id); } catch (e) { b.disabled = false; toast(e.message, true); } });
}

/* ---------- t154u club messages (the club systems expose no member messages: Golflet admins write them per club) ---------- */
let CMSGS = null;
async function clubMsgsView() {
  title('Mensajes de clubes', 'Plataforma');
  const d = await api('/api/admin/club-messages'); CMSGS = d.messages;
  main(`<div class="acts" style="margin-bottom:12px"><a class="btn sm" data-nav href="/admin/mensajes/nuevo" style="text-decoration:none">Nuevo mensaje</a></div>
    ${d.messages.length ? `<div class="card rows">${d.messages.map(x => arow(`/admin/mensajes/${x.id}`, ini(x.club_name), `${esc(x.title)}${x.withdrawn_at ? ' <span class="chip">Retirado</span>' : ''}`, `${esc(x.club_name)} · ${fmtS(x.created_at)}`, `<small class="num">${x.reads}/${x.recipients} leídos</small>`)).join('')}</div>`
      : '<div class="card empty">Todavía no hay mensajes.</div>'}
    <p class="muted lfoot">Los sistemas de los clubes (Jockey, Mar del Plata) no publican mensajes a socios, así que se escriben acá. Cada mensaje le llega a todos los jugadores vinculados a ese club, en Notificaciones (con aviso en su avatar).</p>`);
}
async function clubMsgForm() {
  title('Nuevo mensaje', 'Plataforma · Mensajes de clubes');
  const { clubs } = await api('/api/admin/clubs'); const cs = clubs.filter(c => c.links > 0).sort((a, b) => a.name.localeCompare(b.name));
  main(`<div class="crumbs"><a data-nav href="/admin/mensajes">← Mensajes de clubes</a></div>
    <form class="card" id="cmf"><label class="fl">Club<select name="club_id" required><option value="">Elegí un club</option>${cs.map(c => `<option value="${c.id}">${esc(c.name)} (${c.users} jugadores)</option>`).join('')}</select></label>
      <label class="fl">Título<input type="text" name="title" maxlength="120" required placeholder="Cancha cerrada el sábado por mantenimiento"></label>
      <label class="fl">Mensaje (opcional)<textarea name="body" maxlength="4000" style="min-height:160px"></textarea></label>
      <p class="meta">Se envía apenas lo creás a todos los jugadores vinculados a ese club. Después se puede retirar, pero no editar.</p>
      <div class="acts" style="margin-top:14px"><button class="btn" type="submit">Enviar a los socios</button></div></form>`);
  $('#cmf').onsubmit = async e => { e.preventDefault(); const f = new FormData(e.target), btn = e.target.querySelector('[type=submit]'); btn.disabled = true;
    try { const r = await api('/api/admin/club-messages', { method: 'POST', body: JSON.stringify({ club_id: Number(f.get('club_id')), title: f.get('title') || '', body: f.get('body') || '' }) }); toast('Mensaje enviado.'); go(`/admin/mensajes/${r.message.id}`); }
    catch (err) { btn.disabled = false; toast(err.message, true); } };
}
async function clubMsgView(id) {
  const d = await api('/api/admin/club-messages'), x = d.messages.find(m => m.id === id);
  if (!x) { main('<div class="card empty">No encontramos ese mensaje.</div>'); return; }
  title(x.title, 'Plataforma · Mensajes de clubes');
  main(`<div class="crumbs"><a data-nav href="/admin/mensajes">← Mensajes de clubes</a></div>
    <div class="card"><p class="meta">${esc(x.club_name)} · ${fmtS(x.created_at)}${x.withdrawn_at ? ` · retirado ${fmtS(x.withdrawn_at)}` : ''}</p><h3 style="margin:6px 0 10px">${esc(x.title)}</h3><div style="white-space:pre-wrap">${esc(x.body || '')}</div>
      <p class="meta" style="margin-top:12px"><span class="num">${x.reads}</span> de <span class="num">${x.recipients}</span> jugadores lo leyeron.</p>
      ${x.withdrawn_at ? '' : '<div class="acts" style="margin-top:14px"><button class="btn ghost sm" type="button" id="cmw">Retirar</button></div>'}</div>`);
  const w = $('#cmw'); if (w) w.onclick = async () => { if (!confirmInline(w, 'Tocá de nuevo para retirarlo')) return; w.disabled = true;
    try { await api(`/api/admin/club-messages/${id}`, { method: 'DELETE' }); toast('Mensaje retirado.'); clubMsgView(id); } catch (err) { w.disabled = false; toast(err.message, true); } };
}
/* ---------- t74u sorteos (admin-run; players enter after accepting bases y condiciones) ---------- */
const SOST = { borrador: ['draft','Borrador'], abierto: ['ok','Abierto'], proximo: ['draft','Programado'], cerrado: ['','Cerrado'], sorteado: ['prof','Sorteado'], cancelado: ['','Cancelado'] };
const dIn = t => t ? new Date(t).toLocaleString('sv-SE', { timeZone: TZ }).slice(0, 16).replace(' ', 'T') : '';
async function sorteosView() {
  title('Sorteos', 'Plataforma');
  const d = await api('/api/admin/sorteos');
  main(`<div class="acts" style="margin-bottom:12px"><a class="btn sm" data-nav href="/admin/sorteos/nuevo" style="text-decoration:none">Nuevo sorteo</a></div>
    ${d.sorteos.length ? `<div class="card rows">${d.sorteos.map(x => { const [c, l] = SOST[x.eff_status] || ['', x.eff_status];
      return arow(`/admin/sorteos/${x.id}`, ini(x.title), `${esc(x.title)} <span class="chip ${c}">${l}</span>`, `${esc(x.prize)} · cierra ${fmtS(x.ends_at)}${x.winner_name ? ' · ganó ' + esc(x.winner_name) : ''}`, `<small class="num">${x.entries} part.</small>`); }).join('')}</div>`
      : '<div class="card empty">Todavía no hay sorteos.</div>'}
    <p class="muted lfoot">Los jugadores participan desde Tu cuenta › Sorteos (y una tarjeta en Inicio) después de aceptar las bases y condiciones. Las bases quedan fijas apenas alguien participa.</p>`);
}
async function sorteoForm(id) {
  const x = id ? (await api(`/api/admin/sorteos/${id}`)).sorteo : null, n = x ? (await api(`/api/admin/sorteos/${id}`)).entries.length : 0;
  title(x ? 'Editar sorteo' : 'Nuevo sorteo', 'Plataforma · Sorteos');
  main(`<div class="crumbs"><a data-nav href="${x ? '/admin/sorteos/' + id : '/admin/sorteos'}">← ${x ? esc(x.title) : 'Sorteos'}</a></div>
    <form class="card" id="sf"><label class="fl">Título<input type="text" name="title" maxlength="90" required value="${esc(x?.title || '')}" placeholder="Sorteo de primavera"></label>
      <label class="fl">Premio<input type="text" name="prize" maxlength="140" required value="${esc(x?.prize || '')}" placeholder="Una docena de pelotas"></label>
      <label class="fl">Sponsor (opcional)<input type="text" name="sponsor" maxlength="80" value="${esc(x?.sponsor || '')}"></label>
      <label class="fl">Descripción (opcional)<textarea name="description" maxlength="1200">${esc(x?.description || '')}</textarea></label>
      <label class="fl">Empieza (opcional)<input type="datetime-local" name="starts_at" value="${dIn(x?.starts_at)}"></label>
      <label class="fl">Cierra<input type="datetime-local" name="ends_at" required value="${dIn(x?.ends_at)}"></label>
      <label class="fl">Bases y condiciones<textarea name="bases" maxlength="20000" required style="min-height:220px" ${n ? 'disabled' : ''}>${esc(x?.bases || '')}</textarea></label>
      ${n ? `<p class="meta">Ya hay ${n} participantes que aceptaron estas bases: no se pueden cambiar.</p>` : '<p class="meta">Escribí las bases completas; los jugadores las tienen que aceptar para participar.</p>'}
      <div class="acts" style="margin-top:14px"><button class="btn" type="submit">${x ? 'Guardar' : 'Crear como borrador'}</button></div></form>`);
  $('#sf').onsubmit = async e => { e.preventDefault(); const f = new FormData(e.target), b = {};
    for (const k of ['title','prize','sponsor','description']) b[k] = f.get(k) || '';
    for (const k of ['starts_at','ends_at']) { const v = f.get(k); b[k] = v ? new Date(v).toISOString() : null; }
    if (!n) b.bases = f.get('bases') || '';
    const btn = e.target.querySelector('[type=submit]'); btn.disabled = true;
    try { const r = await api(x ? `/api/admin/sorteos/${id}` : '/api/admin/sorteos', { method: x ? 'PATCH' : 'POST', body: JSON.stringify(b) }); toast('Guardado.'); go(`/admin/sorteos/${r.sorteo.id}`); }
    catch (err) { btn.disabled = false; toast(err.message, true); } };
}
async function sorteoView(id) {
  const d = await api(`/api/admin/sorteos/${id}`), x = d.sorteo, [c, l] = SOST[x.eff_status] || ['', x.eff_status];
  title(x.title, 'Plataforma · Sorteos');
  const can = { abrir: x.status === 'borrador' || x.status === 'cerrado', cerrar: x.status === 'abierto', cancelar: ['borrador','abierto','cerrado'].includes(x.status), sortear: x.eff_status === 'cerrado' && d.entries.length > 0, editar: !['sorteado','cancelado'].includes(x.status) };
  main(`<div class="crumbs"><a data-nav href="/admin/sorteos">← Sorteos</a></div>
    <div class="card"><h2>${esc(x.title)} <span class="chip ${c}">${l}</span></h2><dl class="kv"><dt>Premio</dt><dd>${esc(x.prize)}</dd>${x.sponsor ? `<dt>Sponsor</dt><dd>${esc(x.sponsor)}</dd>` : ''}
      <dt>Empieza</dt><dd>${x.starts_at ? fmtDT(x.starts_at) : 'Al abrirlo'}</dd><dt>Cierra</dt><dd>${fmtDT(x.ends_at)}</dd><dt>Bases</dt><dd class="num">v. ${esc(x.bases_version)} · ${x.bases.length} caracteres</dd>
      <dt>Participantes</dt><dd class="num">${d.entries.length}</dd>
      ${x.winner_user_id ? `<dt>Ganador</dt><dd><a data-nav href="/admin/users/${encodeURIComponent(x.winner_user_id)}"><b>${esc(x.winner_name || 'Jugador')}</b></a>${x.winner_email && !/\.invalid$/.test(x.winner_email) ? ' · ' + esc(x.winner_email) : ''} <span class="meta">${fmtDT(x.drawn_at)} · por ${esc(x.drawn_by || '—')} · entre ${x.draw_info?.entries ?? '—'}</span></dd>` : ''}</dl>
      <div class="acts" style="margin-top:14px">${can.editar ? `<a class="btn ghost sm" data-nav href="/admin/sorteos/${id}/editar" style="text-decoration:none">Editar</a>` : ''}${can.abrir ? `<button class="btn sm" data-to="abierto">${x.status === 'cerrado' ? 'Reabrir' : 'Abrir'}</button>` : ''}${can.cerrar ? `<button class="btn ghost sm" data-to="cerrado">Cerrar</button>` : ''}${can.sortear ? `<button class="btn sm" data-draw>Sortear ganador</button>` : ''}${can.cancelar ? `<button class="btn neg sm" data-to="cancelado">Cancelar</button>` : ''}</div>
      ${x.status === 'abierto' && x.eff_status === 'cerrado' ? '<p class="meta" style="margin:10px 0 0">Ya pasó la fecha de cierre: no entra nadie más. Podés sortear.</p>' : ''}</div>
    <div class="card"><h2>Participantes</h2>${d.entries.length ? `<div class="rows">${d.entries.map(e => arow(`/admin/users/${encodeURIComponent(e.user_id)}`, ini(e.name), esc(e.name), `${e.matricula ? 'Mat. ' + esc(e.matricula) + ' · ' : ''}aceptó ${fmtS(e.accepted_at)}`, e.user_id === x.winner_user_id ? '<span class="chip prof">Ganó</span>' : '')).join('')}</div>` : '<p class="meta">Todavía nadie.</p>'}</div>
    <div class="card"><h2>Bases y condiciones</h2><div style="white-space:pre-wrap;font-size:13.5px;line-height:1.5;color:var(--color-ink2)">${esc(x.bases)}</div></div>`);
  $$('[data-to]').forEach(b => b.onclick = async () => { if (b.dataset.to === 'cancelado' && !confirmInline(b)) return; b.disabled = true; try { await api(`/api/admin/sorteos/${id}`, { method: 'PATCH', body: JSON.stringify({ status: b.dataset.to }) }); toast('Listo.'); sorteoView(id); } catch (e) { b.disabled = false; toast(e.message, true); } });
  const dr = $('[data-draw]'); if (dr) dr.onclick = async () => { if (!confirmInline(dr, 'Tocá de nuevo para sortear')) return; dr.disabled = true; try { await api(`/api/admin/sorteos/${id}/sortear`, { method: 'POST', body: '{}' }); toast('Sorteado.'); sorteoView(id); } catch (e) { dr.disabled = false; toast(e.message, true); } };
}
/* no pop-ups: destructive buttons ask for a second tap */
function confirmInline(b, txt = 'Tocá de nuevo para confirmar') { if (b.dataset.armed) return true; b.dataset.armed = '1'; b.dataset.orig = b.textContent; b.textContent = txt; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = b.dataset.orig; } }, 4000); return false; }
/* ---------- t130u/t131u "Ver video" links on explainers ---------- */
async function videosView() {
  title('Videos explicativos', 'Sistema'); const d = await api('/api/admin/explainer-videos');
  main(`<div class="card rows">${d.explainers.map(e => { const set = d.networks.filter(n => e.urls[n.key]);
      return arow(`/admin/videos/${e.key}`, '▶', `${esc(e.label)} ${set.length ? `<span class="chip ok">${set.length} ${set.length === 1 ? 'red' : 'redes'}</span>` : '<span class="chip">Oculto</span>'}`, `${esc(e.where)}${set.length ? ' · ' + set.map(n => n.label).join(', ') : ''}`, ''); }).join('')}</div>
    <p class="muted lfoot">Cada explicación de la app muestra “Ver video” con un link por red (Instagram, TikTok, YouTube, X). Si no cargás ningún link, el botón no aparece.</p>`);
}
async function videoEdit(key) {
  const d = await api('/api/admin/explainer-videos'), e = d.explainers.find(x => x.key === key);
  title(e ? e.label : 'Video', 'Sistema · Videos explicativos');
  const back = `<div class="crumbs"><a data-nav href="/admin/videos">← Videos explicativos</a></div>`;
  if (!e) return main(back + '<div class="card empty">Esa explicación no existe.</div>');
  main(`${back}<form class="card" id="vf"><h2>${esc(e.label)}</h2><p class="meta">Aparece en: ${esc(e.where)}</p>
    ${d.networks.map(n => `<label class="fl">${n.label}<input type="text" inputmode="url" name="${n.key}" maxlength="400" value="${esc(e.urls[n.key] || '')}" placeholder="https://${n.hosts[0]}/…"></label>`).join('')}
    <p class="meta">Solo links https de cada red. Dejalo vacío para no mostrarlo.${e.updated_at ? ` Último cambio: ${fmtDT(e.updated_at)} · ${esc(e.updated_by || '—')}.` : ''}</p>
    <div class="acts" style="margin-top:14px"><button class="btn" type="submit">Guardar</button></div></form>`);
  $('#vf').onsubmit = async ev => { ev.preventDefault(); const f = new FormData(ev.target), b = {}; d.networks.forEach(n => b[n.key] = f.get(n.key) || '');
    const btn = ev.target.querySelector('[type=submit]'); btn.disabled = true;
    try { await api(`/api/admin/explainer-videos/${key}`, { method: 'PUT', body: JSON.stringify(b) }); toast('Guardado.'); go('/admin/videos'); } catch (err) { btn.disabled = false; toast(err.message, true); } };
}
/* ---------- pace of play (t142u): ESTIMATES per club/course × modality × players ---------- */
const PMODS = [['medal','Medal (stroke play)'],['stableford','Stableford'],['match','Match play'],['fourball','Fourball / parejas']];
const hm = m => { const t = Math.round(m); return `${Math.floor(t / 60)}h${String(t % 60).padStart(2, '0')}`; };
async function paceView() {
  title('Ritmo de juego', 'Canchas'); const d = await api('/api/admin/pace'), dv = d.defaults.values;
  main(`<div class="card"><p class="meta" style="margin:0">Minutos por hoyo <b>estimados</b> por Golflet (no son datos oficiales del club), según modalidad y cantidad de jugadores. La app calcula con esto el tiempo esperado en cada hoyo y avisa al llegar al 10 si el jugador va más de 10 minutos atrás. Cada cancha hereda los valores por defecto hasta que la edites.</p></div>
    <div class="card rows">${arow('/admin/ritmo/defecto', 'DF', 'Valores por defecto <span class="chip draft">Estimado</span>', `Medal 4 jugadores: ${dv.medal[4].min_per_hole} min/hoyo · ${hm(dv.medal[4].total_18_min)} en 18`, '')}
      ${d.courses.map(c => arow(`/admin/ritmo/${c.club_id}/${encodeURIComponent(c.course)}`, ini(c.course), `${esc(c.course)} <small class="muted">${esc(c.club_name)}</small>`, c.overrides ? `${c.overrides} valores propios` : 'Usa los valores por defecto', c.overrides ? '<span class="chip ok">Editada</span>' : '')).join('')}</div>`);
}
async function paceEdit(clubId, course) {
  const qs = clubId == null ? '' : `?club_id=${clubId}${course ? '&course=' + encodeURIComponent(course) : ''}`;
  const d = await api('/api/admin/pace/table' + qs), own = new Map(d.own.map(o => [`${o.modality}:${o.players}`, o]));
  const name = clubId == null ? 'Valores por defecto' : `${course || 'Todo el club'} · ${d.club_name || ''}`;
  title(name, 'Canchas · Ritmo de juego'); const isDef = clubId == null;
  main(`<div class="crumbs"><a data-nav href="/admin/ritmo">← Ritmo de juego</a></div>
    <div class="card"><h2>${esc(name)} <span class="chip draft">Estimado</span></h2>
      <p class="meta">Minutos por hoyo. ${isDef ? 'Base de todas las canchas.' : 'Vacío = hereda (se ve en gris). Guardá un número para fijarlo en esta cancha.'} ${d.has_pars ? 'El tiempo por hoyo se reparte según el par (par 3 más corto, par 5 más largo).' : 'Sin pares cargados: mismo tiempo en cada hoyo.'}</p>
      <form id="pf"><div class="pace-grid"><span></span>${[1,2,3,4].map(p => `<b class="pg-h">${p} ${p === 1 ? 'jugador' : 'jugadores'}</b>`).join('')}
        ${PMODS.map(([m, l]) => `<b class="pg-l">${l}</b>${[1,2,3,4].map(p => { const v = d.values[m][p], o = own.get(`${m}:${p}`);
          return `<label class="pg-c"><input inputmode="decimal" name="${m}:${p}" value="${o ? String(o.min_per_hole).replace('.', ',') : ''}" placeholder="${v ? String(v.min_per_hole).replace('.', ',') : ''}" aria-label="${l}, ${p} jugadores"><small data-t="${m}:${p}">${v ? hm(v.min_per_hole * 18) : ''}</small></label>`; }).join('')}`).join('')}</div>
        <div class="acts" style="margin-top:14px"><button class="btn" type="submit">Guardar</button>${isDef ? '' : '<button class="btn ghost sm" type="button" data-clear>Volver a los valores por defecto</button>'}</div></form></div>`);
  const f = $('#pf');
  f.querySelectorAll('input').forEach(i => i.oninput = () => { const x = Number((i.value || i.placeholder).replace(',', '.')); const t = f.querySelector(`[data-t="${i.name}"]`); if (t) t.textContent = x >= 4 && x <= 30 ? hm(x * 18) : '—'; });
  const save = async values => { try { await api('/api/admin/pace', { method: 'PUT', body: JSON.stringify({ club_id: clubId, course, values }) }); toast('Guardado.'); paceEdit(clubId, course); } catch (e) { toast(e.message, true); } };
  f.onsubmit = e => { e.preventDefault(); const values = {};
    f.querySelectorAll('input').forEach(i => { const [m, p] = i.name.split(':'); const had = own.has(i.name), v = i.value.trim();
      if (v || had) (values[m] ||= {})[p] = v ? v.replace(',', '.') : null; });
    if (isDef) for (const m in values) for (const p in values[m]) if (values[m][p] == null) delete values[m][p];
    save(values); };
  const cl = $('[data-clear]'); if (cl) cl.onclick = () => { const values = {}; for (const k of own.keys()) { const [m, p] = k.split(':'); (values[m] ||= {})[p] = null; } save(values); };
}
/* ---------- anonymous feedback (t135u): no sender fields exist ---------- */
const FBC = { no_funciono: 'Algo que no funcionó', idea: 'Una idea', me_encanto: 'Algo que me encantó', otro: 'Otra cosa' };
const FBS = { nuevo: ['draft','Nuevo'], leido: ['ok','Leído'], archivado: ['','Archivado'] };
async function feedbackView() {
  title('Feedback', 'Plataforma'); const st = new URLSearchParams(location.search).get('status') || 'nuevo';
  const d = await api(`/api/admin/feedback${st === 'todos' ? '' : '?status=' + st}`);
  main(`${fchips([['nuevo','Nuevos'],['leido','Leídos'],['archivado','Archivados'],['todos','Todos']], st, 'data-st')}
    ${d.feedback.length ? `<div class="card rows">${d.feedback.map(r => { const [c, l] = FBS[r.status] || ['', r.status];
        return arow(`/admin/feedback/${r.id}`, r.category === 'no_funciono' ? '!' : r.category === 'idea' ? 'ID' : r.category === 'me_encanto' ? '♥' : '·', `${esc(FBC[r.category] || 'Sin tipo')} <span class="chip ${c}">${l}</span>`, esc((r.texto || '').slice(0, 90)), `<small>${fmtS(r.created_at)}</small>`); }).join('')}</div>`
      : `<div class="card empty">${st === 'nuevo' ? 'No hay feedback nuevo.' : 'No hay feedback en este filtro.'}</div>`}
    <p class="muted lfoot">Llega desde “Feedback”, al pie de Inicio. Es anónimo: no se guarda usuario, email ni IP; la hora se redondea a la hora.</p>`);
  $$('[data-st]').forEach(b => b.onclick = () => { setQS('status', b.dataset.st, 'nuevo'); feedbackView(); });
}
async function feedbackItem(id) {
  const back = `<div class="crumbs"><a data-nav href="/admin/feedback">← Feedback</a></div>`;
  const r = (await api('/api/admin/feedback')).feedback.find(x => x.id === id); title(r ? (FBC[r.category] || 'Feedback') : 'Feedback', 'Plataforma · Feedback');
  if (!r) return main(back + '<div class="card empty">Ese comentario no existe.</div>');
  const [c, l] = FBS[r.status] || ['', r.status];
  main(`${back}<div class="card"><h2>${esc(FBC[r.category] || 'Sin tipo')} <span class="chip ${c}">${l}</span></h2>
    <p style="white-space:pre-wrap;font-size:15px;line-height:1.5;margin:10px 0 14px">${esc(r.texto)}</p>
    <dl class="kv"><dt>Llegó</dt><dd>${fmtDT(r.created_at)} <small class="muted">(redondeado a la hora)</small></dd><dt>Quién</dt><dd>Anónimo</dd>${r.updated_by ? `<dt>Último cambio</dt><dd>${esc(r.updated_by)}</dd>` : ''}</dl>
    <div class="acts" style="margin-top:14px">${r.status !== 'leido' ? `<button class="btn sm" data-to="leido">Marcar leído</button>` : ''}${r.status !== 'archivado' ? `<button class="btn ghost sm" data-to="archivado">Archivar</button>` : `<button class="btn ghost sm" data-to="nuevo">Reabrir</button>`}</div></div>`);
  $$('[data-to]').forEach(b => b.onclick = async () => { b.disabled = true; try { await api(`/api/admin/feedback/${id}`, { method: 'PATCH', body: JSON.stringify({ status: b.dataset.to }) }); toast('Listo.'); feedbackItem(id); } catch (e) { b.disabled = false; toast(e.message, true); } });
}
/* ---------- contact leads ("¿Sos profesor?" / "¿Sponsor o marca?") ---------- */
const LST = { nuevo: ['draft','Nuevo'], contactado: ['ok','Contactado'], descartado: ['','Descartado'], convertido: ['prof','Aprobado'] };
const leadBase = kind => kind === 'profesor' ? '/admin/profesores-interesados' : kind === 'contacto' ? '/admin/contactos' : '/admin/marcas';
const leadTitle = kind => kind === 'profesor' ? 'Profesores interesados' : kind === 'contacto' ? 'Contactos' : 'Contactos de marcas';
async function leadsView(kind) {
  const prof = kind === 'profesor'; title(leadTitle(kind), 'Plataforma');
  const st = new URLSearchParams(location.search).get('status') || 'nuevo';
  const d = await api(`/api/admin/leads?kind=${kind}${st === 'todos' ? '' : '&status=' + st}`);
  main(`${fchips([['nuevo','Nuevos'],['contactado','Contactados'], ...(prof ? [['convertido','Aprobados']] : []), ['descartado','Descartados'],['todos','Todos']], st, 'data-st')}
    ${d.leads.length ? `<div class="card rows">${d.leads.map(r => { const [c, l] = LST[r.status] || ['', r.status];
        return arow(`${leadBase(kind)}/${r.id}`, ini(r.nombre), `${esc(r.nombre)} <span class="chip ${c}">${l}</span>`, prof ? `${esc(r.lugar || 'Sin lugar')}${r.matricula_aag ? ' · AAG ' + esc(r.matricula_aag) : ''} · ${esc(r.telefono)}` : kind === 'contacto' ? `${esc(r.telefono)} · ${esc((r.motivo || '').slice(0, 70))}` : `${esc(r.empresa || 'Sin empresa')} · ${esc((r.motivo || '').slice(0, 70))}`, `<small>${fmtS(r.created_at)}</small>`); }).join('')}</div>`
      : `<div class="card empty">${st === 'nuevo' ? 'No hay contactos nuevos.' : 'No hay contactos en este filtro.'}</div>`}
    <p class="muted lfoot">${kind === 'contacto' ? 'Llegan desde “Contactar”, al pie de Inicio (con sesión).' : `Llegan desde ${prof ? '“¿Sos profesor?”' : '“¿Sponsor o marca?”'}, en la pantalla de ingreso.`} Hasta 5 por día por conexión.${prof ? ' Abrí uno para aprobarlo como profesor.' : ''}</p>`);
  $$('[data-st]').forEach(b => b.onclick = () => { setQS('status', b.dataset.st, 'nuevo'); leadsView(kind); });
}
async function leadView(kind, id) {
  const prof = kind === 'profesor', back = `<div class="crumbs"><a data-nav href="${leadBase(kind)}">← ${leadTitle(kind)}</a></div>`;
  const r = (await api(`/api/admin/leads?kind=${kind}`)).leads.find(x => x.id === id); title(r ? r.nombre : 'Contacto', `Plataforma · ${leadTitle(kind)}`);
  if (!r) return main(back + '<div class="card empty">Ese contacto no existe.</div>');
  const [c, l] = LST[r.status] || ['', r.status], tel = r.telefono.replace(/[^\d+]/g, '');
  main(`${back}<div class="card"><h2>${esc(r.nombre)} <span class="chip ${c}">${l}</span></h2><dl class="kv">
      <dt>Teléfono</dt><dd class="num"><a href="tel:${esc(tel)}">${esc(r.telefono)}</a> · <a href="https://wa.me/${esc(tel.replace(/^\+/, ''))}" target="_blank" rel="noopener">WhatsApp</a></dd>
      ${prof ? `<dt>Dónde da clases</dt><dd>${esc(r.lugar || '—')}</dd><dt>Matrícula Pro AAG</dt><dd class="num">${esc(r.matricula_aag || '—')}</dd>` : `${kind === 'marca' ? `<dt>Empresa</dt><dd>${esc(r.empresa || '—')}</dd>` : ''}<dt>Motivo</dt><dd style="white-space:pre-wrap">${esc(r.motivo || '—')}</dd>`}
      <dt>Llegó</dt><dd>${fmtDT(r.created_at)}</dd>${r.user_id ? `<dt>Usuario</dt><dd><a data-nav href="/admin/users/${encodeURIComponent(r.user_id)}">Ver en Golflet</a></dd>` : ''}${r.updated_by ? `<dt>Último cambio</dt><dd>${esc(r.updated_by)}</dd>` : ''}</dl>
    <div class="acts" style="margin-top:14px">
      ${prof && !r.profesor_user_id && r.status !== 'descartado' ? `<button class="btn" data-conv>Aprobar como profesor</button>` : ''}
      ${prof && !r.profesor_user_id && r.status !== 'descartado' ? `<button class="btn ghost" data-linkp>Vincular a profesor existente</button>` : ''}
      ${r.profesor_user_id ? `<a class="btn sm" data-nav href="/admin/users/${encodeURIComponent(r.profesor_user_id)}" style="text-decoration:none">Ver profesor</a>` : ''}
      ${!r.profesor_user_id && r.status === 'nuevo' ? `<button class="btn ghost sm" data-to="contactado">Marcar contactado</button>` : ''}
      ${!r.profesor_user_id ? (r.status !== 'descartado' ? `<button class="btn neg sm" data-to="descartado">Descartar</button>` : `<button class="btn ghost sm" data-to="nuevo">Reabrir</button>`) : ''}</div>
    <div id="lkp"></div>
    ${prof && !r.profesor_user_id ? `<p class="meta" style="margin:12px 0 0">Aprobar crea un profesor <b>pendiente</b> con estos datos (nombre, teléfono, lugar y matrícula AAG). Después lo podés marcar como verificado en su ficha. Va a poder entrar cuando activemos las cuentas de profesor. Si ya existe (por ejemplo, lo creaste a mano), usá <b>Vincular a profesor existente</b>: no se duplica.</p>` : ''}</div>`);
  const lb = $('[data-linkp]'); if (lb) lb.onclick = async () => {
    const box = $('#lkp'); box.innerHTML = '<p class="meta">Cargando profesores…</p>';
    const { profesores: ps } = await api('/api/admin/profesores'); const n = String(r.nombre).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const sorted = ps.slice().sort((a, b) => (String(b.display_name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === n) - (String(a.display_name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === n));
    box.innerHTML = `<div class="lkp"><label for="lkps">Profesor existente</label><select id="lkps"><option value="">Elegí un profesor</option>${sorted.map(p => `<option value="${esc(p.user_id)}">${esc(p.display_name)}${p.verified ? ' · verificado' : ''}${p.account_status === 'pending' ? ' · pendiente' : ''}</option>`).join('')}</select><div id="lkplan"></div></div>`;
    const ACT = { fill: ['ok','Se completa'], merge: ['ok','Se agrega'], same: ['','Ya lo tiene'], keep: ['draft','Ya tiene otro: se mantiene'], replace: ['changed','Se reemplaza'], none: ['','Sin dato'] };
    const plan = async (overwrite = []) => { const id = $('#lkps').value, pl = $('#lkplan'); if (!id) return pl.innerHTML = '';
      try { const x = await api(`/api/admin/leads/${r.id}/link`, { method: 'POST', body: JSON.stringify({ profesor_id: id, dry_run: true, overwrite }) });
        pl.innerHTML = `<dl class="kv lkv">${x.plan.map(f => { const [c, l] = ACT[f.action]; return `<dt>${esc(f.label)}</dt><dd><span class="chip ${c}">${l}</span>${f.action === 'keep' || f.action === 'replace' ? `<br><span class="meta">Actual: ${esc(f.current)} · Del formulario: ${esc(f.incoming)}</span><br><label class="chk" style="display:inline-flex;gap:6px;margin:4px 0 0"><input type="checkbox" data-ow="${f.field}" ${f.action === 'replace' ? 'checked' : ''}> Reemplazar con el del formulario</label>` : ''}</dd>`; }).join('')}</dl>
          <button class="btn" type="button" id="lkgo">Vincular a ${esc(x.profesor.name)}</button><p class="meta" style="margin:8px 0 0">El contacto queda como Aprobado y no se crea otro profesor.</p>`;
        $$('[data-ow]').forEach(c => c.onchange = () => plan($$('[data-ow]:checked').map(i => i.dataset.ow)));
        $('#lkgo').onclick = async e => { e.target.disabled = true;
          try { const y = await api(`/api/admin/leads/${r.id}/link`, { method: 'POST', body: JSON.stringify({ profesor_id: id, overwrite: $$('[data-ow]:checked').map(i => i.dataset.ow) }) }); toast(`Vinculado a ${y.profesor.name}.`); go(`/admin/users/${encodeURIComponent(y.profesor.id)}`); }
          catch (err) { e.target.disabled = false; toast(err.message, true); } };
      } catch (err) { pl.innerHTML = `<p class="meta">${esc(err.message)}</p>`; } };
    $('#lkps').onchange = () => plan(); if (sorted[0] && String(sorted[0].display_name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === n) { $('#lkps').value = sorted[0].user_id; plan(); }
  };
  const cv = $('[data-conv]'); if (cv) cv.onclick = async () => { if (!(await askInline(cv, `Se crea a ${r.nombre} como profesor pendiente.`, 'Sí, aprobar'))) return;
    try { const x = await api(`/api/admin/leads/${id}/convert`, { method: 'POST', body: '{}' }); toast('Aprobado como profesor.'); go(`/admin/users/${encodeURIComponent(x.profesor_id)}`); } catch (e) { toast(e.message, true); } };
  $$('[data-to]').forEach(b => b.onclick = async () => { b.disabled = true; try { await api(`/api/admin/leads/${id}`, { method: 'PATCH', body: JSON.stringify({ status: b.dataset.to }) }); toast('Listo.'); leadView(kind, id); } catch (e) { b.disabled = false; toast(e.message, true); } });
}

/* ---------- profesores ---------- */
async function profesoresView() {
  title('Profesores', 'Plataforma');
  const { profesores: ps } = await api('/api/admin/profesores');
  main(`<form class="card newprof" id="npf"><label for="npn">Nuevo profesor</label><div class="npr"><input type="text" id="npn" maxlength="80" placeholder="Nombre y apellido" autocomplete="off">
      <label class="chk"><input type="checkbox" id="npv"> Verificado</label><button class="btn sm" type="submit">Crear</button></div>
      <p class="meta" style="margin:8px 0 0">Solo el nombre: sin email ni contraseña. Queda pendiente hasta que lo reclame.</p></form>
    ${ps.length ? `<div class="card rows">${ps.map(p => arow(`/admin/users/${encodeURIComponent(p.user_id)}`, ini(p.display_name), `${esc(p.display_name)} ${p.verified ? VB : ''} <span class="chip ${p.account_status === 'active' ? 'prof' : 'draft'}">${p.account_status === 'active' ? 'Activo' : 'Pendiente'}</span>${p.active ? '' : ' <span class="chip">Oculto</span>'}`,
        `${p.locations?.length ? esc(p.locations.join(' · ')) : 'Sin lugares'}${p.no_email ? ' · <span class="sindato">Sin email</span>' : ''}`, `<b class="num">${p.sharing}</b><small>${p.sharing === 1 ? 'alumno' : 'alumnos'}</small>`)).join('')}</div>` : '<div class="card empty">Todavía no hay profesores.</div>'}`);
  $('#npf').onsubmit = async e => { e.preventDefault(); const n = $('#npn').value.trim(); if (n.length < 3) return toast('Escribí nombre y apellido.', true);
    try { const x = await api('/api/admin/profesores', { method: 'POST', body: JSON.stringify({ display_name: n, verified: $('#npv').checked }) }); toast('Profesor creado.'); go(`/admin/users/${encodeURIComponent(x.profesor_id)}`); } catch (err) { toast(err.message, true); } };
}

/* ---------- audit ---------- */
const ACTIONS = [['', 'Todo'], ['admin.', 'Ingresos al panel'], ['role.', 'Accesos'], ['course.', 'Tarjetas'], ['green.', 'Greens GPS'], ['club.', 'Clubes'], ['ar_club.', 'Clubes de Argentina'], ['strategy.', 'Cómo jugar la cancha']];
const ACTION_L = { 'role.grant':'Acceso dado', 'role.change':'Rol cambiado', 'role.revoke':'Acceso quitado', 'course.override':'Tarjeta corregida', 'course.override_clear':'Tarjeta restaurada',
  'green.override':'Green corregido', 'green.override_clear':'Green restaurado', 'green.refresh':'Greens releídos', 'green.read':'Greens leídos (manual)', 'green.daily_read':'Lectura diaria de greens', 'green.daily_toggle':'Lectura diaria cambiada', 'green.review_done':'Green revisado', 'trace.save':'Trazado de hoyo', 'settings.gps_daily_read':'Ajuste: lectura diaria', 'admin.login.ok':'Ingreso al panel', 'admin.login.fail':'Ingreso rechazado', 'admin.logout':'Salió del panel', 'admin.password.change':'Contraseña cambiada', 'admin.password.fail':'Cambio de contraseña rechazado', 'admin.credential.set':'Credenciales asignadas', 'admin.credential.delete':'Credenciales quitadas', 'club.update':'Club renombrado', 'club.logo':'Escudo subido', 'club.logo_reset':'Escudo restaurado', 'ar_club.override':'Club AR corregido', 'ar_club.override_clear':'Club AR restaurado', 'ar_club.logo':'Logo AR subido', 'ar_club.logo_reset':'Logo AR restaurado',
  'strategy.draft':'Estrategia: borrador', 'strategy.overview':'Estrategia: resumen', 'strategy.publish':'Estrategia publicada', 'strategy.unpublish':'Estrategia despublicada', 'strategy.discard':'Estrategia: cambios descartados', 'strategy.prefill':'Estrategia: peligros precargados' };
async function auditView() {
  title('Registro de cambios', 'Sistema');
  const sp = new URLSearchParams(location.search);
  const d = await api(`/api/admin/audit?${sp}`);
  const link = r => r.target_type === 'user' ? `/admin/users/${r.target_id}` : r.target_type === 'course' ? `/admin/courses/${r.target_id}` : r.target_type === 'gps_course' ? `/admin/gps/${r.target_id}`
    : r.target_type === 'course_card' ? `/admin/cards/${String(r.target_id).split(':')[0]}/${encodeURIComponent(String(r.target_id).split(':').slice(1).join(':'))}` : r.target_type === 'club' ? '/admin/clubs' : r.target_type === 'ar_club' ? `/admin/ar-clubs/${r.target_id}` : '';
  main(`<div class="filters"><div><label>Tipo</label><select data-f="action">${ACTIONS.map(([v, l]) => `<option value="${v}" ${sp.get('action') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div><label>Quién</label><select data-f="actor"><option value="">Todos</option>${d.actors.map(a => `<option ${sp.get('actor') === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></div>
    <div><label>Período</label><select data-f="days">${[['', 'Todo'], ['1', 'Hoy'], ['7', '7 días'], ['30', '30 días']].map(([v, l]) => `<option value="${v}" ${sp.get('days') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
  <div class="card">${table([{ k:'created_at', l:'Cuándo', kind:'datetime' }, { k:'actor_email', l:'Quién' }, { k:'what', l:'Tipo' }, { k:'summary', l:'Qué cambió' }], d.rows.map(r => ({ ...r, what: ACTION_L[r.action] || r.action, _l: link(r) })), { rowLink: '{_l}', empty: 'Todavía no hay cambios registrados.' }).replace(/data-href="([^"]*)"/g, (m, h) => `data-href="${decodeURIComponent(h)}"`)}</div>`);
  $$('.filters [data-f]').forEach(el => el.onchange = () => { const q = new URLSearchParams(location.search); el.value ? q.set(el.dataset.f, el.value) : q.delete(el.dataset.f); history.replaceState(null, '', `/admin/audit?${q}`); auditView(); });
}

window.GA = { api, esc, title, main, go, toast, fmtN, fmtD, fmtDT, me: () => ME, $, $$ };

/* ---------- panel sign-in: change your password, and (admins) credentials for staff — each its own page ---------- */
function passwordView() {
  title('Cambiar contraseña', 'Tu acceso al panel');
  main(`<div class="card narrow">${ME.user.must_change ? '<div class="note-warn">Te asignaron una contraseña temporal. Elegí una propia para seguir.</div>' : ''}
    <form id="pwf" autocomplete="on">
      <input type="text" name="username" autocomplete="username" value="${esc(ME.user.username || '')}" hidden>
      <label class="fl">Contraseña actual<input type="password" name="current" autocomplete="current-password" required></label>
      <label class="fl">Nueva contraseña<input type="password" name="password" autocomplete="new-password" minlength="12" required></label>
      <label class="fl">Repetila<input type="password" name="again" autocomplete="new-password" minlength="12" required></label>
      <p class="meta">Mínimo 12 caracteres, sin incluir tu usuario. Al cambiarla se cierran tus otras sesiones del panel.</p>
      <div id="pwmsg"></div>
      <div class="acts"><button class="btn" type="submit">Guardar contraseña</button>${ME.user.must_change ? '' : '<a class="btn ghost" data-nav href="/admin" style="text-decoration:none">Cancelar</a>'}</div>
    </form></div>`);
  $('#pwf').onsubmit = async e => { e.preventDefault(); const f = e.target, m = $('#pwmsg');
    if (f.password.value !== f.again.value) { m.innerHTML = '<p class="err-line">Las contraseñas nuevas no coinciden.</p>'; return; }
    try { await api('/api/admin/auth/password', { method:'PUT', body: JSON.stringify({ current: f.current.value, password: f.password.value }) });
      f.reset(); ME.user.must_change = false; toast('Contraseña actualizada.'); go('/admin'); }
    catch (err) { m.innerHTML = '<p class="err-line"></p>'; m.firstChild.textContent = err.message; } };
}
async function accessView() {
  const d = await api('/api/admin/credentials');
  title('Usuarios del panel', 'Plataforma');
  main(`<p class="lede">Para entrar a /admin hace falta un rol (admin o editor) y además usuario y contraseña propios del panel. Acá se asignan.</p>
    <div class="card">${table([{ k:'name', l:'Nombre' }, { k:'email', l:'Email' }, { k:'role', l:'Rol', kind:'chip' }, { k:'username', l:'Usuario' }, { k:'state', l:'Estado' }, { k:'last_login_at', l:'Último ingreso', kind:'datetime' }],
      d.staff.map(s => ({ ...s, username: s.username || '—', state: !s.username ? 'Sin credenciales' : s.locked ? 'Bloqueado' : s.must_change ? 'Debe cambiarla' : 'Activo' })), { rowLink: '/admin/access/{user_id}', empty: 'No hay personas con rol.' })}</div>`);
}
async function accessEditView(id) {
  const d = await api('/api/admin/credentials'), s = d.staff.find(x => x.user_id === id);
  title(s ? (s.name || s.email) : 'Persona', 'Usuarios del panel');
  if (!s) return main('<div class="card empty">Esa persona no tiene rol en el panel.</div>');
  const self = id === ME.user.id;
  main(`<nav class="crumbline"><a data-nav href="/admin/access">‹ Usuarios del panel</a></nav>
    <div class="card narrow"><dl class="kv"><dt>Email</dt><dd>${esc(s.email)}</dd><dt>Rol</dt><dd>${chipH(s.role)}</dd><dt>Usuario</dt><dd>${esc(s.username || 'Sin credenciales')}</dd><dt>Último ingreso</dt><dd>${s.last_login_at ? fmtDT(s.last_login_at) : '—'}</dd></dl>
    <form id="crf" autocomplete="off">
      <label class="fl">Usuario<input name="username" value="${esc(s.username || '')}" autocomplete="off" required pattern="[A-Za-z0-9._@-]{3,64}"></label>
      <label class="fl">${s.username ? 'Nueva contraseña' : 'Contraseña'}<input type="password" name="password" autocomplete="new-password" minlength="12" required></label>
      <p class="meta">${self ? 'Es tu propio acceso: se cierran tus otras sesiones del panel.' : 'Es temporal: en el primer ingreso le vamos a pedir que elija una propia. Se cierran sus sesiones abiertas del panel.'} Mínimo 12 caracteres.</p>
      <div id="crmsg"></div>
      <div class="acts"><button class="btn" type="submit">${s.username ? 'Cambiar credenciales' : 'Crear credenciales'}</button>${s.username && !self ? '<button class="btn neg" type="button" id="crdel">Quitar credenciales</button>' : ''}</div>
    </form></div>`);
  $('#crf').onsubmit = async e => { e.preventDefault(); const f = e.target;
    try { await api('/api/admin/credentials', { method:'PUT', body: JSON.stringify({ user_id: id, username: f.username.value.trim(), password: f.password.value }) }); toast('Credenciales guardadas.'); go('/admin/access'); }
    catch (err) { $('#crmsg').innerHTML = '<p class="err-line"></p>'; $('#crmsg').firstChild.textContent = err.message; } };
  const del = $('#crdel'); if (del) del.onclick = async () => { if (!(await askInline(del, `${s.email} no va a poder entrar al panel hasta que le asignes credenciales de nuevo.`, 'Sí, quitar credenciales'))) return;
    try { await api('/api/admin/credentials', { method:'DELETE', body: JSON.stringify({ user_id: id }) }); toast('Credenciales quitadas.'); go('/admin/access'); } catch (err) { toast(err.message, 1); } };
}

/* ---------- t162u: Banderas del día (club accounts + Golflet admins), reports and club accounts (admins) ---------- */
const ZL = { front: 'Adelante', middle: 'Medio', back: 'Fondo' };
const STL = { open: 'Sin revisar', cleared: 'Bandera borrada', moved: 'Bandera movida', dismissed: 'Descartado' };
const artDay = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
/* Schematic green from the club GPS map (front / center / back), oriented with the front at the bottom (as seen from the fairway). */
function gmFrame(g) {
  const c = g.center, k = 111320, cos = Math.cos(c.lat * Math.PI / 180), toXY = p => ({ x: (p.lng - c.lng) * k * cos, y: (p.lat - c.lat) * k });
  let u = { x: 0, y: 1 }; if (g.front && g.back) { const f = toXY(g.front), b = toXY(g.back), L = Math.hypot(b.x - f.x, b.y - f.y) || 1; u = { x: (b.x - f.x) / L, y: (b.y - f.y) / L }; }
  const r = { x: u.y, y: -u.x };
  const fwd = p => { const v = toXY(p); return { X: v.x * r.x + v.y * r.y, Y: v.x * u.x + v.y * u.y }; };
  const inv = (X, Y) => { const x = X * r.x + Y * u.x, y = X * r.y + Y * u.y; return { lat: c.lat + y / k, lng: c.lng + x / (k * cos) }; };
  const F = g.front ? fwd(g.front) : { X: 0, Y: -12 }, B = g.back ? fwd(g.back) : { X: 0, Y: 12 }, depth = Math.max(8, B.Y - F.Y);
  const R = Math.max(24, depth * 0.85 + 8), S = 150 / R;
  return { fwd, inv, F, B, depth, S, sx: p => 160 + fwd(p).X * S, sy: p => 160 - fwd(p).Y * S,
    zoneOf: p => { const y = fwd(p).Y; return y < F.Y + depth / 3 ? 'front' : y > B.Y - depth / 3 ? 'back' : 'middle'; } };
}
function greenMap(g, marks) {
  if (!g?.center) return '<div class="card empty">No tenemos el mapa GPS de este green.</div>';
  const f = gmFrame(g), cy = 160 - ((f.F.Y + f.B.Y) / 2) * f.S, ry = (f.depth / 2 + 4) * f.S, rx = ry * 0.85;
  const dot = (p, cls, lab) => p ? `<circle cx="${f.sx(p).toFixed(1)}" cy="${f.sy(p).toFixed(1)}" r="4" class="${cls}"/>${lab ? `<text x="${(f.sx(p) + 7).toFixed(1)}" y="${(f.sy(p) + 4).toFixed(1)}" class="gm-l">${lab}</text>` : ''}` : '';
  const flag = (p, cls) => { if (!p) return ''; const x = f.sx(p), y = f.sy(p); return `<g class="${cls}"><line x1="${x}" y1="${y}" x2="${x}" y2="${y - 22}"/><path d="M${x} ${y - 22}l12 4l-12 4z"/><circle cx="${x}" cy="${y}" r="3"/></g>`; };
  return `<svg class="gmap" viewBox="0 0 320 320" role="img" aria-label="Esquema del green"><rect width="320" height="320" rx="14" class="gm-bg"/>
    <ellipse cx="160" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" class="gm-green"/>
    ${dot(g.front, 'gm-p', 'Frente')}${dot(g.center, 'gm-p', 'Centro')}${dot(g.back, 'gm-p', 'Fondo')}
    ${(marks || []).map(m => m.kind === 'flag' ? flag(m.p, m.cls) : dot(m.p, m.cls, m.label)).join('')}
    <text x="160" y="312" text-anchor="middle" class="gm-l">↑ hacia el fondo · desde el fairway</text></svg>`;
}
function bindGreenPick(svg, g, onPick) {
  const f = gmFrame(g);
  svg.style.cursor = 'crosshair';
  svg.onclick = e => { const b = svg.getBoundingClientRect(), vx = (e.clientX - b.left) * 320 / b.width, vy = (e.clientY - b.top) * 320 / b.height;
    const p = f.inv((vx - 160) / f.S, (160 - vy) / f.S); onPick(p, f.zoneOf(p)); };
}
const zoneSeg = (cur, attr = 'data-z') => `<div class="seg zseg" role="radiogroup" aria-label="Dónde está la bandera">${Object.entries(ZL).map(([k, l]) => `<button type="button" ${attr}="${k}" class="${cur === k ? 'on' : ''}" aria-pressed="${cur === k}">${l}</button>`).join('')}</div>`;

/* Load pins: one course, one day, hole by hole. Club accounts see only their club. */
async function pinsLoadView() {
  const sp = new URLSearchParams(location.search), d = await api('/api/admin/pins/courses');
  title('Banderas del día', ME.club_name ? `Canchas · ${ME.club_name}` : 'Canchas');
  if (!d.courses.length) return main('<div class="card empty">Tu club todavía no tiene canchas con mapa GPS de greens.</div>');
  const ck = sp.get('c') || `${d.courses[0].club_code}|${d.courses[0].vm_course}`, [club, vm] = ck.split('|'), date = sp.get('d') || d.today, hole = Math.min(18, Math.max(1, +sp.get('h') || 1));
  const D = await api(`/api/admin/pins/day?club_code=${encodeURIComponent(club)}&vm_course=${encodeURIComponent(vm)}&date=${date}`), H = D.holes[hole - 1];
  const max = new Date(Date.parse(d.today + 'T12:00:00Z') + 60 * 864e5).toISOString().slice(0, 10);
  const q = o => { const s = new URLSearchParams({ c: ck, d: date, h: hole, ...o }); return `/admin/banderas/cargar?${s}`; };
  let pick = null, zone = H.pin?.source === 'club' ? H.pin.zone : null;
  const draw = () => {
    const marks = [...(H.pin?.source === 'club' && !pick ? [{ kind: 'flag', p: H.pin, cls: 'gm-flag' }] : []), ...(pick ? [{ kind: 'flag', p: pick, cls: 'gm-new' }] : [])];
    main(`<div class="toolbar pins-tb"><label class="fl">Cancha<select id="pc">${d.courses.map(c => `<option value="${esc(c.club_code + '|' + c.vm_course)}" ${c.club_code + '|' + c.vm_course === ck ? 'selected' : ''}>${esc(c.course_label)}${d.role === 'admin' ? ' · ' + esc(c.club_name || c.club_code) : ''}</option>`).join('')}</select></label>
      <label class="fl">Día<input type="date" id="pd" value="${date}" min="${d.today}" max="${max}"></label>${date > d.today ? '<span class="chip draft">Programada</span>' : '<span class="chip published">Hoy</span>'}</div>
      <div class="card"><div class="hgrid">${D.holes.map(x => `<a data-nav href="${q({ h: x.hole })}" class="hbtn ${x.hole === hole ? 'on' : ''} ${x.pin ? (x.pin.source === 'club' ? 'club' : 'player') : ''}" aria-label="Hoyo ${x.hole}${x.pin ? ', con bandera ' + (x.pin.source === 'club' ? 'del club' : 'de un jugador') : ''}"><b class="num">${x.hole}</b><small>${x.pin ? (x.pin.source === 'club' ? 'Club' : 'Jugador') : '—'}</small></a>`).join('')}</div>
        <p class="meta">Club: la cargó el club (manda sobre todo). Jugador: la marcó el primer jugador del día (no mostramos dónde estaba parado ni quién es). —: sin bandera.</p></div>
      <div class="card pin-card"><h3 style="margin-top:0">Hoyo ${hole} · ${esc(D.course_label)} · ${date.split('-').reverse().join('/')}</h3>
        <p class="meta">${H.pin ? (H.pin.source === 'club' ? `Bandera del club: <b>${ZL[H.pin.zone]}</b>. Los jugadores la ven como “Bandera de hoy · cargada por el club” y no pueden marcar ni reportar.` : `Hay bandera de un jugador (${ZL[H.pin.zone]}). Si cargás la del club, la reemplaza.`) : 'Sin bandera. Tocá el green donde está la bandera.'}</p>
        <div id="gmw">${greenMap(H.green, marks)}</div>
        <div class="fl" style="margin-top:12px">Dónde está la bandera${zoneSeg(zone)}</div>
        <div class="acts" style="margin-top:14px"><button class="btn" id="psave" ${pick && zone ? '' : 'disabled'}>Guardar bandera del club</button>${H.pin?.source === 'club' ? '<button class="btn ghost" id="pdel">Borrar bandera del club</button>' : ''}</div>
        <p class="meta">${pick ? `Nueva posición: ${pick.lat.toFixed(6)}, ${pick.lng.toFixed(6)}` : 'Tocá el esquema para ubicar la bandera. Se puede programar hasta 60 días adelante.'}</p></div>`);
    $('#pc').onchange = e => go(`/admin/banderas/cargar?${new URLSearchParams({ c: e.target.value, d: date, h: 1 })}`);
    $('#pd').onchange = e => go(`/admin/banderas/cargar?${new URLSearchParams({ c: ck, d: e.target.value || d.today, h: hole })}`);
    const svg = $('#gmw svg'); if (svg && H.green?.center) bindGreenPick(svg, H.green, (p, z) => { pick = p; zone = zone && pick ? zone : z; draw(); });
    $$('[data-z]').forEach(b => b.onclick = () => { zone = b.dataset.z; draw(); });
    $('#psave').onclick = async e => { e.target.disabled = true; try { await api('/api/admin/pins', { method: 'PUT', body: JSON.stringify({ club_code: club, vm_course: vm, date, hole, lat: pick.lat, lng: pick.lng, zone }) }); toast(`Hoyo ${hole}: bandera del club guardada.`); go(q({ h: Math.min(18, hole + 1) })); } catch (err) { toast(err.message, 1); e.target.disabled = false; } };
    const del = $('#pdel'); if (del) del.onclick = async () => { if (!(await askInline(del, `Se borra la bandera del club del hoyo ${hole}. Los jugadores vuelven a poder marcarla.`, 'Sí, borrar'))) return;
      try { await api('/api/admin/pins', { method: 'DELETE', body: JSON.stringify({ club_code: club, vm_course: vm, date, hole }) }); toast('Bandera borrada.'); go(q({})); } catch (err) { toast(err.message, 1); } };
  };
  draw();
}
async function pinReportsView() {
  title('Banderas: reportes', 'Canchas');
  const d = await api('/api/admin/pin-reports');
  main(`<div class="acts" style="margin-bottom:12px"><a class="btn sm" data-nav href="/admin/banderas/cargar" style="text-decoration:none">Cargar banderas</a><a class="btn ghost sm" data-nav href="/admin/banderas/clubes" style="text-decoration:none">Cuentas de club</a></div>
    ${d.reports.length ? `<div class="card rows">${d.reports.map(x => arow(`/admin/banderas/${x.id}`, String(x.hole), `Bandera mal registrada · ${esc(x.course_label)} hoyo ${x.hole} ${x.status === 'open' ? '<span class="chip changed">Sin revisar</span>' : `<span class="chip">${STL[x.status]}</span>`}`, `${esc(x.club_name || x.club_code)} · ${x.date.split('-').reverse().join('/')} · ${esc(x.reporter)} · ${fmtS(x.created_at)}`, '')).join('')}</div>`
      : '<div class="card empty">No hay reportes de banderas.</div>'}
    <p class="muted lfoot">Cuando un jugador toca “Bandera mal registrada” sobre la bandera que marcó otro jugador ese día, llega acá y a tus Notificaciones en Golflet. Un reporte por jugador, hoyo y día.</p>`);
}
async function pinReportView(id) {
  const d = await api(`/api/admin/pin-reports/${id}`), r = d.report; title(`Hoyo ${r.hole} · ${r.course_label}`, 'Canchas · Banderas: reportes');
  const cp = d.current_pin, rp = r.reported_pin, changed = !!cp && (!rp || Math.abs(cp.lat - rp.lat) > 1e-7 || Math.abs(cp.lng - rp.lng) > 1e-7 || cp.zone !== rp.zone);
  let pick = null, zone = null;
  const draw = () => {
    const marks = [...(r.reported_pin ? [{ kind: 'flag', p: r.reported_pin, cls: 'gm-rep' }] : []), ...(changed ? [{ kind: 'flag', p: cp, cls: 'gm-flag' }] : []),
      ...(r.reporter_position ? [{ p: r.reporter_position, cls: 'gm-who', label: 'Reportó acá' }] : []), ...(pick ? [{ kind: 'flag', p: pick, cls: 'gm-new' }] : [])];
    main(`<div class="crumbs"><a data-nav href="/admin/banderas">← Banderas: reportes</a></div>
      <div class="card"><dl class="kv"><dt>Estado</dt><dd>${STL[r.status]}${r.resolved_at ? ' · ' + fmtDT(r.resolved_at) : ''}</dd><dt>Cancha</dt><dd>${esc(r.course_label)} · ${esc(r.club_name || r.club_code)}</dd><dt>Hoyo · día</dt><dd>${r.hole} · ${r.date.split('-').reverse().join('/')}</dd>
        <dt>Bandera reportada</dt><dd>${r.reported_pin ? `${ZL[r.reported_pin.zone] || '—'} · ${r.reported_pin.source === 'club' ? 'del club' : 'de un jugador'}` : '—'}</dd>
        <dt>Bandera ahora</dt><dd>${d.current_pin ? `${d.current_pin.zone_label} · ${d.current_pin.source === 'club' ? 'del club' : 'de un jugador'}${changed ? ' (cambió)' : ''}` : 'Sin bandera'}</dd>
        <dt>Reportó</dt><dd>${esc(r.reporter)} · ${r.reporter_reports} ${r.reporter_reports === 1 ? 'reporte' : 'reportes'} en total${r.reporter_position ? ` · GPS ±${Math.round(r.reporter_position.accuracy_m ?? 0)} m` : ''} <button class="btn ghost sm" id="who">Ver quién es</button><span id="whov"></span></dd>
        <dt>Otros reportes</dt><dd>${d.other_reports} sobre la misma bandera</dd></dl></div>
      <div class="card pin-card"><div id="gmw">${greenMap(d.green, marks)}</div>
        <p class="meta"><span class="lg rep"></span>Bandera reportada <span class="lg who"></span>Dónde estaba el jugador que reportó${changed ? ' <span class="lg cur"></span>Bandera actual' : ''}${pick ? ' <span class="lg new"></span>Nueva posición' : ''}</p>
        ${r.status === 'open' && d.current_pin?.source === 'player' ? `<div class="fl" style="margin-top:8px">Mover: tocá el esquema y elegí la zona${zoneSeg(zone)}</div>
        <div class="acts" style="margin-top:14px"><button class="btn" id="rmove" ${pick && zone ? '' : 'disabled'}>Mover la bandera</button><button class="btn ghost" id="rclear">Borrar la bandera</button><button class="btn ghost" id="rdis">Estaba bien: descartar</button></div>
        <p class="meta">Borrar: los jugadores vuelven a poder marcarla. Mover: queda donde la pongas, para todos los que juegan hoy.</p>`
        : r.status === 'open' ? `<div class="acts" style="margin-top:14px"><button class="btn ghost" id="rdis">Descartar</button></div>` : ''}</div>`);
    const svg = $('#gmw svg'); if (svg && r.status === 'open' && d.current_pin?.source === 'player' && d.green?.center) bindGreenPick(svg, d.green, (p, z) => { pick = p; zone = zone || z; draw(); });
    $$('[data-z]').forEach(b => b.onclick = () => { zone = b.dataset.z; draw(); });
    const act = async (body, msg) => { try { await api(`/api/admin/pin-reports/${id}`, { method: 'POST', body: JSON.stringify(body) }); toast(msg); pinReportView(id); } catch (e) { toast(e.message, 1); } };
    const mv = $('#rmove'); if (mv) mv.onclick = () => act({ action: 'move', lat: pick.lat, lng: pick.lng, zone }, 'Bandera movida.');
    const cl = $('#rclear'); if (cl) cl.onclick = async () => { if (await askInline(cl, 'Se borra la bandera de hoy de ese hoyo.', 'Sí, borrar')) act({ action: 'clear' }, 'Bandera borrada.'); };
    const ds = $('#rdis'); if (ds) ds.onclick = () => act({ action: 'dismiss' }, 'Reporte descartado.');
    $('#who').onclick = async e => { e.target.disabled = true; try { const w = await api(`/api/admin/pin-reports/${id}/reporter`); $('#whov').textContent = ` ${w.reporter.name} · ${w.reporter.email} (queda registrado en Registro de cambios)`; } catch (err) { toast(err.message, 1); } };
  };
  draw();
}
async function clubStaffView() {
  title('Cuentas de club', 'Canchas · Banderas');
  const d = await api('/api/admin/club-staff');
  main(`<div class="crumbs"><a data-nav href="/admin/banderas">← Banderas: reportes</a></div>
    ${d.staff.length ? `<div class="card rows">${d.staff.map(x => `<div class="arow2"><span class="aav">${esc(ini(x.club_name))}</span><span class="am"><span class="at">${esc(x.name)} · ${esc(x.club_name || x.club_code)}</span><span class="as">Usuario ${esc(x.username || '—')} · ${esc(x.email)} · ${x.last_login_at ? 'último ingreso ' + fmtS(x.last_login_at) : 'todavía no entró'}${x.must_change ? ' · debe cambiar la contraseña' : ''}</span></span><button class="btn ghost sm" data-del="${esc(x.user_id)}">Quitar</button></div>`).join('')}</div>` : '<div class="card empty">Todavía no hay cuentas de club.</div>'}
    <form class="card" id="csf"><h3 style="margin-top:0">Nueva cuenta de club</h3>
      <label class="fl">Club<select name="club_code" required><option value="">Elegí un club</option>${d.clubs.map(c => `<option value="${esc(c.code)}">${esc(c.name)}</option>`).join('')}</select></label>
      <label class="fl">Nombre<input name="name" required maxlength="80" placeholder="Nombre de quien carga las banderas"></label>
      <label class="fl">Email<input name="email" type="email" required maxlength="120"></label>
      <label class="fl">Usuario<input name="username" required maxlength="64" autocomplete="off"></label>
      <label class="fl">Contraseña inicial<input name="password" type="password" required autocomplete="new-password"></label>
      <p class="meta">Entra en /admin/login y solo puede cargar banderas de las canchas de ese club. Tiene que cambiar la contraseña al entrar por primera vez. No ve jugadores, ni sus posiciones, ni reportes.</p>
      <div class="acts" style="margin-top:12px"><button class="btn" type="submit">Crear cuenta</button></div></form>`);
  $('#csf').onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const b = e.target.querySelector('[type=submit]'); b.disabled = true;
    try { await api('/api/admin/club-staff', { method: 'POST', body: JSON.stringify(f) }); toast('Cuenta creada.'); clubStaffView(); } catch (err) { toast(err.message, 1); b.disabled = false; } };
  $$('[data-del]').forEach(b => b.onclick = async () => { if (!(await askInline(b, 'Se borra la cuenta y deja de poder entrar. Las banderas que cargó quedan.', 'Sí, quitar'))) return;
    try { await api(`/api/admin/club-staff/${encodeURIComponent(b.dataset.del)}`, { method: 'DELETE', body: '{}' }); toast('Cuenta quitada.'); clubStaffView(); } catch (err) { toast(err.message, 1); } });
}

/* ---------- boot ---------- */
(async () => {
  try { ME = await api('/api/admin/me'); }
  catch (e) { if (e.message !== 'auth') main(`<div class="card"><h2>No tenés acceso</h2><p class="meta">${esc(e.message)}</p></div>`); return; }
  if (location.pathname.replace(/\/$/, '') === '/admin' && !ME.sections.includes('dashboard')) history.replaceState(null, '', ME.user.role === 'club' ? '/admin/banderas/cargar' : '/admin/strategy');
  route();
})();
})();
