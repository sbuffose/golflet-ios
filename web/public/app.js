/* Golflet v2 platform · data from /api (per-user, real Golfistics data only). No italics anywhere. */
(function(){
const $ = s => document.querySelector(s), view = $('#view'), sheetRoot = $('#sheet-root');
const MES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const TEE = {NEGRO:'#1E1E1E',AZUL:'#2D5BA8',BLANCO:'#FFFFFF',AMARILLO:'#E2B93B',ROJO:'#B83A2E',CELESTE:'#8CC3DF',VERDE:'#4F8A4B'};
const C = {primary:'#0B2545',primary2:'#13315C',accent:'#C8102E',ink:'#0E1B2C',ink2:'#3E4C62',ink3:'#5C687B',hair:'#DCE1E8',bogey:'#DCE1E8',dbl:'#3E4C62'};
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const dmy = d => { const [y,m,dd] = d.split('-'); return `${+dd} ${MES[m-1]} ${y}`; };
const f1 = x => x == null ? '—' : (Math.round(x*10)/10).toFixed(1).replace('.', ',');
const f2 = x => x == null ? '—' : x.toFixed(2).replace('.', ',');
const sg = (x,d=2) => x == null ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '±') + Math.abs(x).toFixed(d).replace('.', ',');
const pc = x => x == null ? '—' : Math.round(x) + '%';
const mean = a => a.length ? a.reduce((s,x)=>s+x,0)/a.length : null;
const title = s => (s||'').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu,'').replace(/\s+/g,' ').trim()
  .replace(/\b([A-ZÁÉÍÓÚÑ]{2,})\b/g, w => w[0] + w.slice(1).toLowerCase())
  .replace(/\b(De|La|Del|Y|El|Los)\b/g, (w,_,i) => i ? w.toLowerCase() : w);
const short = s => title(s).replace(/\b-?\d+([.,]\d+)?\s*-\s*\d+([.,]\d+)?\b/g,'').replace(/\b\d+\s*hmp\b/gi,'').replace(/\b20\d\d\b/g,'').replace(/\s+/g,' ').trim();
const store = { get: k => { try { return JSON.parse(localStorage.getItem('golflet:'+k)) } catch(e){ return null } },
                set: (k,v) => localStorage.setItem('golflet:'+k, JSON.stringify(v)) };
const ICON = {
  chev:'<svg class="chev" viewBox="0 0 8 14" width="8" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 1l6 6-6 6"/></svg>',
  x:'<svg viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11"/></svg>',
  green:'<svg viewBox="0 0 32 32"><ellipse cx="16" cy="17" rx="12" ry="9"/><path d="M8 15c3-2 6 2 9 0s5-2 7 0M9 20c3-2 6 2 9 0s4-1 6 0"/></svg>',
  target:'<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="11"/><circle cx="16" cy="16" r="6"/><circle cx="16" cy="16" r="1.5"/></svg>',
  pencil:'<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 14l1-4 8-8 3 3-8 8z"/></svg>',
};
ICON.refresh = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M13.5 8A5.5 5.5 0 1 1 11.8 4"/><path d="M12.5 1.5v3h-3"/></svg>';
const PALETTE = ['#B83A2E','#2D5BA8','#4F8A4B','#E2B93B','#8C5BB0','#1E1E1E'];
const NAMED = {azul:'#2D5BA8',colorada:'#B83A2E',roja:'#B83A2E',verde:'#4F8A4B',amarilla:'#E2B93B',negra:'#1E1E1E'};

/* ---------- API ---------- */
async function api(path, opt = {}){
  const timeoutMs = opt.timeoutMs;
  const rest = { ...opt };
  delete rest.timeoutMs;
  const method = String(rest.method || 'GET').toUpperCase();
  const ctrl = timeoutMs ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : 0;
  try {
    const r = await fetch(path, { credentials:'same-origin', ...rest, signal: rest.signal || (ctrl && ctrl.signal), headers:{'Content-Type':'application/json', ...(rest.headers||{})} });
    if (r.status === 401) {
      if (method !== 'GET' || path === '/api/data' || path.startsWith('/api/data?')) { location.replace('/login'); throw new Error('auth'); }
      throw Object.assign(new Error('No pudimos leer esto. No confirmamos si la sesión sigue abierta.'), { status: 401 });
    }
    const j = await r.json().catch(()=>({}));
    if (!r.ok) throw Object.assign(new Error(j.error || 'No se pudo completar'), { status:r.status, data:j });
    return j;
  } catch (e) {
    if (e && e.name === 'AbortError') throw Object.assign(new Error('La lectura tardó demasiado.'), { timeout: true });
    throw e;
  } finally { if (timer) clearTimeout(timer); }
}
const errText = (e, what) => (e && e.timeout) ? e.message : (e && e.status && e.status < 500 && e.message) ? e.message : `No pudimos cargar ${what || 'esta sección'}. Probá de nuevo en un rato.`;
const errBox = (e, what) => `<div class="msg err">${esc(errText(e, what))} <button type="button" class="btn ghost sm" data-retry>Reintentar</button></div>`;
document.addEventListener('click', ev => { if (ev.target.closest && ev.target.closest('[data-retry]')) { ev.preventDefault(); if (!G) { location.reload(); return; } render(true); } });
function toast(t, kind){ let el = $('#toast'); if(!el){ el=document.createElement('div'); el.id='toast'; document.body.appendChild(el); }
  el.className = 'toast '+(kind||''); el.textContent = t; el.style.opacity = 1; clearTimeout(toast.t); toast.t = setTimeout(()=>el.style.opacity=0, 3800); }
const ago = d => { if(!d) return 'nunca'; const s=(Date.now()-new Date(d))/1000; if(s<90) return 'recién'; if(s<3600) return `hace ${Math.round(s/60)} min`; if(s<86400) return `hace ${Math.round(s/3600)} h`; const n=Math.round(s/86400); return n===1?'ayer':`hace ${n} días`; };

/* ---------- state ---------- */
let G = null, rounds = [], valid = [], asc = [], idxSeries = [], IDX_ALL = [], CCOL = {}, VIEW_GEN = 0;
const course = k => G.courses.find(c => c.key === k);
/* period selector (Inicio / Resumen / Cancha / métricas): ?range=1m|3m|6m|12m|all, same rules as lib/metrics.ts rangeSince */
const RANGES = [['1m','Este mes'],['3m','3 meses'],['6m','6 meses'],['12m','Año'],['all','Histórico']], RKEYS = RANGES.map(x=>x[0]);
let RANGE = (() => { try { const v = sessionStorage.getItem('gl_range'); return RKEYS.includes(v) ? v : 'all'; } catch(e){ return 'all'; } })();
const rlabel = k => (RANGES.find(x=>x[0]===k)||RANGES[4])[1];
function rangeSince(k){ if (k==='all') return null; const n = new Date(), y = n.getFullYear(), m = n.getMonth(), d = n.getDate(), p2 = x => String(x).padStart(2,'0');
  if (k==='1m') return `${y}-${p2(m+1)}-01`; const b = k==='3m'?3:k==='6m'?6:12, t = new Date(y, m-b, 1), last = new Date(t.getFullYear(), t.getMonth()+1, 0).getDate();
  return `${t.getFullYear()}-${p2(t.getMonth()+1)}-${p2(Math.min(d,last))}`; }
const inR = r => { const s0 = rangeSince(RANGE); return !s0 || r.date >= s0; };
const rlink = (m, q={}) => mlink(m, RANGE==='all' ? q : { ...q, range: RANGE });
function setRange(k){ if (!RKEYS.includes(k)) return; RANGE = k; try { sessionStorage.setItem('gl_range', k); } catch(_){} }
function rangeSeg(n, attr='range'){
  return `<div class="rng"><div class="seg vx-seg rng-seg" role="tablist" aria-label="Período">${RANGES.map(([k,l])=>`<button type="button" role="tab" aria-selected="${k===RANGE}" class="${k===RANGE?'on':''}" data-${attr}="${k}">${l}</button>`).join('')}</div>
    <span class="rng-n"><b class="num">${n}</b> ${n===1?'ronda':'rondas'}${RANGE==='all'?'':` desde ${dmy(rangeSince(RANGE))}`}</span></div>`;
}
/* per-hole strokes over par from the rounds in the period (server stats cover all history) */
function holeStats(pool, ck){
  const o = {}; pool.filter(r=>r.course_key===ck && r.holes?.length).forEach(r=>r.holes.forEach(h=>{ if (h[1]==null||h[2]==null) return; const e = o[h[0]] ||= {n:0,over:0}; e.n++; e.over += h[2]-h[1]; }));
  Object.values(o).forEach(e=>e.avg_to_par = e.over/e.n); return o;
}
const hstat = (h, hs) => hs ? (hs[h.hole] || { n:0, avg_to_par:null }) : h.stats;
const clabel = k => course(k)?.label || (k||'').split(':').slice(1).join(':');
function derive(){
  rounds = G.rounds.slice().sort((a,b)=>a.date<b.date?1:-1);
  valid = rounds.filter(r => r.valid_card && r.gross && !r.is_9_holes);
  asc = valid.filter(r=>r.differential_computed!=null).slice().reverse();
  IDX_ALL = idxSeries = asc.map((r,i)=>{ if (i<19) return null; const w = asc.slice(i-19,i+1).map(x=>x.differential_computed).sort((a,b)=>a-b).slice(0,8); return {date:r.date, v:mean(w), i}; }).filter(Boolean);
  CCOL = {}; let pi = 0; G.courses.forEach(c => { CCOL[c.key] = NAMED[c.course.toLowerCase()] || PALETTE[pi++ % PALETTE.length]; });
}
const pname = () => G.player?.name || G.user?.name || '';
const firstName = () => G.user?.first_name || (G.user?.name||'').split(/\s+/)[0];   // server picks it (Cuenta › Cómo te llamamos → account name → Golfistics name)
const initials = () => { const n = pname().split(/\s+/).filter(Boolean); if(!n.length) return '·'; const f = n.find(w=>/^[A-Z][a-z]/.test(w)); return ((f||n[0])[0] + (f ? n[0][0] : (n[1]||' ')[0])).toUpperCase(); };

function smooth(pts){ if(pts.length<2) return ''; let d=`M${pts[0][0]},${pts[0][1]}`;
  for(let i=0;i<pts.length-1;i++){ const p0=pts[i-1]||pts[i], p1=pts[i], p2=pts[i+1], p3=pts[i+2]||p2;
    d+=` C${p1[0]+(p2[0]-p0[0])/6},${p1[1]+(p2[1]-p0[1])/6} ${p2[0]-(p3[0]-p1[0])/6},${p2[1]-(p3[1]-p1[1])/6} ${p2[0]},${p2[1]}`; } return d; }
/* date block for list rows: big day + short month. withYear: small year under the month for non-current years
   (non-date sorts and mixed-year lists); date-sorted Rondas use the sticky year pill instead. */
const curYear = () => String(new Date(Date.now() - 3*3600e3).getUTCFullYear());
const dateBlock = (iso, withYear) => { const [y, m, d] = String(iso).slice(0, 10).split('-'); const yr = withYear && y !== curYear();
  return `<div class="date${yr ? ' has-yr' : ''}"><b class="num">${+d}</b><span>${MES[+m-1]}</span>${yr ? `<small class="yr num">${y}</small>` : ''}</div>`; };
/* t130u/t131u: "Ver video" on explainers. Slots stay hidden unless admin set at least one URL for that explainer (never invented). */
const vidSlot = k => `<div class="vid-l" data-vk="${k}" hidden></div>`;
let VIDS = null; const NETL = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', x: 'X' };
function fillVids(){
  const slots = [...document.querySelectorAll('[data-vk]:not([data-vf])')]; if (!slots.length) return;
  (VIDS ||= fetch('/api/explainers/videos', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : { videos: {} }).catch(() => ({ videos: {} }))).then(d => slots.forEach(el => {
    el.dataset.vf = '1'; const v = d.videos?.[el.dataset.vk]; const ks = v ? Object.keys(NETL).filter(n => v[n]) : [];
    if (!ks.length) { el.hidden = true; return; }
    el.innerHTML = `<span class="vid-t"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M10 8.5v7l6-3.5z" fill="currentColor"/></svg>Ver video</span>${ks.map(n => `<a href="${esc(v[n])}" target="_blank" rel="noopener noreferrer">${NETL[n]}</a>`).join('')}`;
    el.hidden = false; }));
}
/* t224u: scrollable segmented rows (courses, periods) keep the selected chip visible and fade the edge that has more */
function segFit(){ document.querySelectorAll('#view .seg').forEach(g => { const ov = g.scrollWidth > g.clientWidth + 1; g.classList.toggle('seg-ov', ov); if (!ov) return;
  const edge = () => { g.classList.toggle('seg-end', g.scrollLeft + g.clientWidth >= g.scrollWidth - 2); g.classList.toggle('seg-mid', g.scrollLeft > 2); };
  if (!g.dataset.sf) { g.dataset.sf = 1; g.addEventListener('scroll', edge, { passive: true }); const on = g.querySelector('.on'); if (on && on.offsetLeft + on.offsetWidth > g.clientWidth) g.scrollLeft = on.offsetLeft + on.offsetWidth - g.clientWidth + 24; }
  edge(); }); }
addEventListener('resize', () => segFit());
new MutationObserver(() => { fillVids(); segFit(); }).observe(document.documentElement, { childList: true, subtree: true });
/* t129u: date-ordered lists that span years: sticky year pill at the left for every non-current year (same pattern as Rondas) */
function yrList(items, dateOf, row, cls = 'list'){
  const g = []; items.forEach((x, i) => { const y = String(dateOf(x) || '').slice(0, 4), l = g[g.length - 1]; if (l && l.y === y) l.a.push([x, i]); else g.push({ y, a: [[x, i]] }); });
  if (!g.some(x => x.y !== curYear())) return `<div class="${cls}">${items.map(row).join('')}</div>`;
  return g.map(({ y, a }) => { const cur = y === curYear();
    return `<section class="yrgrp yrlite${cur ? ' cur' : ''}">${cur ? '' : `<div class="yrpill" aria-hidden="true"><span class="num">${y}</span></div><div class="yrhd"><span class="sr">Año ${y}</span></div>`}<div class="${cls}">${a.map(([x, i]) => row(x, i)).join('')}</div></section>`; }).join('');
}
const minOr = a => a.length ? Math.min(...a) : '—';
const emptyData = (t) => `<div class="onboard"><h2>${t||'Todavía no hay tarjetas'}</h2><p>Vinculá tu matrícula y Golflet trae las tarjetas de todos tus clubes.</p><a class="btn" href="#/vincular">Vincular tu matrícula</a></div>`;

/* ---------- INICIO ---------- */
function clubsCard(){
  const rows = G.clubs.map(a => {
    const st = a.last_sync_status === 'error' ? `<span class="doterr"></span>${esc(a.last_sync_message||'Error al actualizar')}`
      : a.last_sync_status === 'running' ? `<span class="dotoff"></span>Actualizando…`
      : `<span class="dotok"></span>${a.rounds} tarjetas · ${ago(a.last_sync_at)}${a.source==='app'?' · con tu matrícula':''}`;
    return `<div class="acctrow"><a class="acct" href="#/club/${a.id}" style="flex:1;min-width:0"><div class="logo">${esc((a.club_name||'?').replace(/^(Club|Golf)\s+/i,'')[0])}</div>
      <div class="meta2"><div class="nm">${esc(a.club_name)}</div><div class="st">${st}</div></div></a>
      <button class="btn ghost sm" data-sync="${a.id}" aria-label="Actualizar">${ICON.refresh}Actualizar</button></div>`; }).join('');
  return `<div class="card" style="padding:4px 16px">${rows}
    ${G.clubs.length
      ? `<a class="acctrow" href="#/club-faltante" style="color:var(--color-ink2)"><div class="acct"><div class="add">?</div><div style="font-size:calc(15px*var(--ts,1));font-weight:var(--fw500,500)">Tengo otro club y no aparece<div style="font-size:calc(12.5px*var(--ts,1));color:var(--color-ink3);font-weight:var(--fw400,400);margin-top:2px">Contanos cuál y lo revisamos</div></div></div>${ICON.chev}</a>`
      : `<a class="acctrow" href="#/vincular" style="color:var(--color-ink2)"><div class="acct"><div class="add">+</div><div style="font-size:calc(15px*var(--ts,1));font-weight:var(--fw500,500)">Vincular tu matrícula<div style="font-size:calc(12.5px*var(--ts,1));color:var(--color-ink3);font-weight:var(--fw400,400);margin-top:2px">Matrícula y contraseña de tu club</div></div></div></a>`}</div>`;
}
/* t117u: discreet contact links at the bottom of Inicio (same page as on the login screen) */
/* t135u: signed-in footer. '¿Sos profesor?' / '¿Sponsor o marca?' stay only on the login (logged-out) screen. */
const CT_LINKS = `<nav class="ct-links" aria-label="Contacto"><a href="/feedback.html"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v10H9.5L5 19.5v-4H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 9.5h8M8 12.5h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>Feedback</a><a href="/contacto.html?tipo=contacto"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.5h3l1.5 4-2 1.3a10 10 0 0 0 6.1 6.1l1.3-2 4 1.5v3c0 1.1-.9 2-2 2A16.5 16.5 0 0 1 4.6 5.5c0-1.1.9-2 2-2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>Contactar</a></nav>`;
const reconEntry = () => `<a class="recon-entry" id="recon-start" href="#/reconstruir"><span class="rt-mark">TRACK</span><b>Cargar una vuelta ya jugada</b><span class="recon-go" aria-hidden="true">›</span></a>`;
function vInicio(){
  const top = `<div class="top"><span class="overline">${esc(G.clubs[0]?.club_name || 'Golflet')}${G.clubs.length>1?` +${G.clubs.length-1}`:''}</span><span class="tophead"><a class="avatar" href="#/cuenta" aria-label="Tu cuenta">${esc(initials())}${NBADGE}</a></span><a class="ttpill" id="ttpill" href="#/tees" hidden><span class="tp-l">Próximo tee time</span><span class="tp-v num"></span><span class="tp-c"></span></a></div>
  <h1 class="ltitle greet" id="greet"><span class="soft">Hola,</span> <span class="accent">${esc(firstName())}</span></h1>`;
  if (!valid.length) return top + revealCard() + (G.clubs.length ? `<div class="msg" style="margin-top:12px">Tus clubes están vinculados pero todavía no hay tarjetas válidas. Tocá Actualizar para traerlas.</div>` : emptyData('Empecemos por tu club')) +
    `<div id="tees"></div><div id="scorecards"></div>${reconEntry()}<div id="cardpull"></div><div id="sorteocard"></div>` + (G.clubs.length ? `<div class="section"><h2>Mis clubes</h2></div>${clubsCard()}` : '') + CT_LINKS;
  const hi = G.hi_history, d = hi.length>1 ? hi[hi.length-1].hi - hi[0].hi : null;
  const last = rounds[0], best = valid.slice().sort((a,b)=>a.gross-b.gross)[0];
  const pr = valid.filter(inR), prAll = rounds.filter(inR), bestR = pr.slice().sort((a,b)=>a.gross-b.gross)[0];
  const hiNow = window.GolfletRules ? window.GolfletRules.officialIndex(G.player?.handicap_index, (hi || []).filter(h => h.hi != null).map(h => ({ date: h.date, hi: +h.hi }))) : (hi.at(-1)?.hi ?? G.player?.handicap_index ?? null);
  return top + rangeSeg(prAll.length) + revealCard() + `<div class="cols"><div class="col-a"><div class="o1"><div class="hero">
    <div class="hi-avs"><div id="hiprofs" class="hi-profs nolab" hidden></div><div id="higroups" class="hi-grp" hidden></div><div class="hi-prac"><a class="hp-prac" href="#/jugar" aria-label="Jugar: mapa a pantalla completa para marcar el golpe"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/></svg><span>Jugar</span></a></div></div>
    <a class="vx-hlink" href="${rlink('handicap',{scope:'all'})}"><div class="overline">Handicap Index</div>
    <div class="big num">${f1(hiNow)}</div></a>${(hi||[]).filter(h=>h.hi!=null).slice().sort((a,b)=>a.date<b.date?-1:1).at(-1) ? `<span class="delta">${dmy((hi||[]).filter(h=>h.hi!=null).slice().sort((a,b)=>a.date<b.date?-1:1).at(-1).date)}</span>` : ''}${d!=null?`<span class="delta">${d<0?'↓':'↑'} ${f1(Math.abs(d))} desde ${MES[+hi[0].date.slice(5,7)-1]}. ${hi[0].date.slice(0,4)}</span>`:''}
    <a class="hi-ch-l" href="#/cambios">Cambios</a>
    <div class="meta"><a href="${rlink('rounds',{scope:'all',course:'all',sort:'date',order:'desc'})}">Tarjetas<b class="num">${prAll.length}</b></a><a href="${rlink('best-gross',{scope:'all',course:'all',sort:'gross',order:'asc'})}">Mejor gross<b class="num">${bestR?bestR.gross:'—'}</b></a><a href="${rlink('average',{scope:'all',course:'all',sort:'date',order:'desc'})}">Promedio<b class="num">${f1(mean(pr.map(r=>r.gross)))}</b></a><a id="hcpimp" class="hi-imp" href="#/impacto${RANGE==='all'?'':'?range='+RANGE}">Impacto HCP<b class="num">…</b></a></div>
  </div></div>
  <div class="o2"><div class="section"><h2>Última ronda</h2><a href="#/rondas">Ver todas</a></div>
  ${roundRow(last, true, true)}</div>
  <div class="o4"><div class="section"><h2>${rlabel(RANGE)}</h2></div>
  <div class="grid3">
    <a class="card mini stat vx-tap" href="${rlink('rounds',{scope:'all',course:'all',sort:'date',order:'desc'})}"><div class="k">Rondas</div><div class="v num">${prAll.length}</div></a>
    <a class="card mini stat vx-tap" href="${rlink('best-gross',{scope:'all',course:'all',sort:'gross',order:'asc'})}"><div class="k">Mejor</div><div class="v num">${minOr(pr.map(r=>r.gross))}</div></a>
    <a class="card mini stat vx-tap" href="${rlink('birdies',{scope:'all',course:'all',sort:'date',order:'desc'})}"><div class="k">Birdies</div><div class="v num">${prAll.reduce((s,r)=>s+(r.holes?.length?r.holes.filter(h=>h[1]!=null&&h[2]!=null&&h[2]-h[1]===-1).length:(r.summary_counts?.birdies||0)),0)}</div></a>
  </div>${perRoundCard(prAll)}</div></div>
  <div class="col-b"><div class="o3" id="teenow"></div><div class="o3" id="tees"></div><div class="o3" id="scorecards"></div><div class="o3">${reconEntry()}</div><div class="o3" id="cardpull"></div><div class="o3" id="sorteocard"></div><div class="o3" id="improve"></div><div class="o3" id="recur"></div>
  <div class="o3"><div class="section"><h2>Amigos</h2>${G.user?.group_invitations?`<span class="badge gold">${G.user.group_invitations} invitación${G.user.group_invitations===1?'':'es'}</span>`:''}</div><a class="card gg-home" href="#/amigos"><span class="gg-home-ic"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="9" r="3.2"/><circle cx="16.5" cy="10" r="2.6"/><path d="M3.5 19c.9-3 3-4.6 5.5-4.6s4.6 1.6 5.5 4.6M14.5 15c2.6-.3 4.8 1 5.8 3.8"/></svg></span><div><b>${G.user?.group_invitations?'Te invitaron a un grupo':'Comparar con amigos'}</b><p>Tabla, evolución y hoyo por hoyo con tus amigos. Solo si cada uno acepta.</p></div>${ICON.chev}</a></div>
  <div class="o5"><div class="section"><h2>Mis clubes</h2></div>${clubsCard()}</div></div></div>${CT_LINKS}`;
}
/* t144u: gold cup before the title of competition cards (is_competition from the club's Puesto/Jugadores; casual cards get nothing) */
const cup = r => r && r.is_competition ? '<svg class="cup" viewBox="0 0 24 24" aria-label="Torneo" role="img"><path fill="currentColor" d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.35A5 5 0 0 1 13 14.9V17h3v2H8v-2h3v-2.1A5 5 0 0 1 8.35 12H8a4 4 0 0 1-4-4V5h3V3Zm0 4H6v1a2 2 0 0 0 1.1 1.79A5 5 0 0 1 7 9V7Zm10 0v2c0 .27-.03.53-.1.79A2 2 0 0 0 18 8V7h-1ZM7 20h10v1.5H7V20Z"/></svg>' : '';
function roundRow(r, single, withYr){
  const tee = r.tee && TEE[r.tee.toUpperCase()] ? `<i class="tee" style="background:${TEE[r.tee.toUpperCase()]}"></i>` : '';
  const [y,m,d] = r.date.split('-');
  const sub = `${tee}${esc(r.course_label || clabel(r.course_key))}${r.tee?' · '+esc(r.tee):''}${r.position?` · ${r.position}º de ${r.field_size}`:''}`;
  const sc = r.valid_card && r.gross ? `<b class="num">${r.gross}</b><span>neto ${r.net??'—'}</span>` : `<span class="badge neg">${r.is_9_holes?'9 h · ':''}DES</span>`;
  const inner = `${dateBlock(r.date, withYr)}<div class="body"><div class="t">${cup(r)+esc(short(r.tournament)||'Ronda')}</div><div class="s">${sub}</div>${rchips(r)}</div><div class="score">${sc}</div>${ICON.chev}`;
  return single ? `<a class="list" href="#/ronda/${r.round_id}" style="display:block"><div class="row">${inner}</div></a>` : `<a class="row" href="#/ronda/${r.round_id}">${inner}</a>`;
}
/* TV-style chips per round (from /api/data: eagles, birdies, pars, bogeys, double_plus, putts_total) */
function rchips(r){
  if (r.birdies == null && r.putts_total == null && !r.manual_putts) return '';
  const c = (cls, n, l) => `<span class="rc ${cls}"><b class="num">${n}</b>${l}</span>`;
  return `<div class="rchips">${r.eagles?c('rc-e', r.eagles, r.eagles===1?' águila':' águilas'):''}${r.birdies!=null?c('rc-b', r.birdies, r.birdies===1?' birdie':' birdies')+c('rc-p', r.pars, ' pares')+c('rc-g', r.bogeys, r.bogeys===1?' bogey':' bogeys'):''}${r.putts_total!=null?c('rc-u', r.putts_total, r.putts_source==='gps'?' putts GPS':' putts'):''}${r.manual_putts?c('rc-u', r.manual_putts, ' putts a mano'):''}</div>`;
}
let sortL = 'date';
/* t224u: chips show the course name only (the club in the tooltip/aria) unless two clubs share a course name */
const segBtns = (cur, attr) => { const nm = c => c.course || clabel(c.key), dup = n => G.courses.filter(c => nm(c) === n).length > 1;
  return ['Todas',...G.courses.map(c=>c.key)].map(s=>{ const c = s==='Todas' ? null : course(s), t = !c ? s : dup(nm(c)) ? clabel(s) : nm(c);
    return `<button class="${s===cur?'on':''}" data-${attr}="${esc(s)}"${c?` title="${esc(clabel(s))}" aria-label="${esc(clabel(s))}"`:''}>${esc(t)}</button>`; }).join(''); };

/* ---------- RESUMEN ---------- */
let segR = 'Todas';
function trend(){
  const W=360,H=200,pl=4,pr=30,pt=14,pb=26, s0 = (() => { const i = asc.findIndex(inR); return i < 0 ? asc.length : i; })(), all = asc.slice(s0);
  const idxSeries = IDX_ALL.filter(p=>p.i>=s0).map(p=>({ ...p, i: p.i - s0 }));   // the index line inside the period
  if (all.length < 2) return '<p class="foot">Hacen falta más tarjetas para la tendencia.</p>';
  const ys = all.map(r=>r.differential_computed), ymin=Math.min(0, Math.floor(Math.min(...ys)/5)*5), ymax=Math.max(5, Math.ceil(Math.max(...ys)/5)*5);
  const X = i => pl + i*(W-pl-pr)/(all.length-1), Y = v => pt + (ymax-v)*(H-pt-pb)/(ymax-ymin);
  let g=''; for(let v=ymin; v<=ymax; v+=5) g+=`<line x1="${pl}" x2="${W-pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="${C.hair}" stroke-width="1"/><text x="${W-pr+8}" y="${Y(v)+4}" font-size="10.5" fill="${C.ink3}" font-family="Geist">${v}</text>`;
  let yr='',lx=-99; all.forEach((r,i)=>{ const y=r.date.slice(0,4); if(y!==yr){ yr=y; if(X(i)-lx>34){ lx=X(i); g+=`<text x="${X(i)}" y="${H-6}" font-size="10.5" fill="${C.ink3}" font-family="Geist">${y}</text>`; } }});
  const dots = all.map((r,i)=>`<circle cx="${X(i)}" cy="${Y(r.differential_computed)}" r="2.6" fill="${CCOL[r.course_key]||C.ink3}" fill-opacity="${segR==='Todas'||segR===r.course_key?.55:.08}"/>`).join('');
  if (!idxSeries.length) return `<svg class="chart" viewBox="0 0 ${W} ${H}">${g}${dots}</svg>`;
  const pts = idxSeries.map(p=>[X(p.i),Y(p.v)]), line = smooth(pts), lp = pts[pts.length-1];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="tg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${C.primary}" stop-opacity=".18"/><stop offset="1" stop-color="${C.primary}" stop-opacity="0"/></linearGradient></defs>
    ${g}${pts.length>1?`<path d="${line} L${lp[0]},${Y(ymin)} L${pts[0][0]},${Y(ymin)} Z" fill="url(#tg)"/>`:''}${dots}
    <path d="${line}" fill="none" stroke="${C.primary}" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="${lp[0]}" cy="${lp[1]}" r="5" fill="${C.primary}" stroke="#fff" stroke-width="2"/>
    <g transform="translate(${lp[0]-44},${lp[1]-34})"><rect width="40" height="22" rx="11" fill="${C.primary}"/><text x="20" y="15" text-anchor="middle" font-size="12" font-weight="600" fill="#FFFFFF" font-family="Geist">${f1(idxSeries[idxSeries.length-1].v)}</text></g>
  </svg>`;
}
/* "Con GPS: X de N rondas": club scorecards with GPS shots + Golflet live GPS rounds with data (shots, putts or pin).
   A live round linked to a scorecard of the period counts once (as that scorecard); unlinked ones add to X and N. */
let METLIVE = null;
function gpsCount(){ const pr = rounds.filter(inR), live = METLIVE && METLIVE.range === RANGE ? METLIVE.live : [];
  const ids = new Set(pr.map(r => r.round_id)), linked = new Set(live.filter(l => l.round_id && ids.has(l.round_id)).map(l => l.round_id));
  const extra = live.filter(l => !l.round_id || !ids.has(l.round_id)).length;
  return { gps: pr.filter(r => (r.gps_shots || 0) > 0 || linked.has(r.round_id)).length + extra, n: pr.length + extra }; }
const gpsLine = () => { const c = gpsCount(); return `Con GPS: <b class="num">${c.gps}</b> de <b class="num">${c.n}</b> ${c.n === 1 ? 'ronda' : 'rondas'}`; };
function paintGps(){ document.querySelectorAll('[data-gpsn]').forEach(e => e.innerHTML = gpsLine()); }
async function loadGpsLive(){ try { const M = await api(`/api/game-metrics?${rq()}`); METLIVE = { range: RANGE, live: M.live || [] }; paintGps(); } catch(e){} }
const metEntry = () => `<a class="card vx-tap met-entry" href="#/metricas"><div class="me-k">Métricas</div><div class="me-v">Tee, hierros, GIR y putting</div><div class="me-s" data-gpsn>${gpsLine()}</div><span class="me-ch" aria-hidden="true">›</span></a>`;
function vResumen(){
  if (!valid.length) return `<h1 class="ltitle">Resumen</h1>${emptyData()}`;
  if (segR!=='Todas' && !course(segR)) segR='Todas';
  const pool = valid.filter(r=>(segR==='Todas'||r.course_key===segR) && inR(r)), poolAll = rounds.filter(r=>(segR==='Todas'||r.course_key===segR) && inR(r)), ranged = RANGE!=='all';
  const yNow = new Date().getFullYear(), wSince = ranged ? (rangeSince(RANGE)||'') : String(yNow-5), rSince = String(yNow-1);
  if (!pool.length) return `<h1 class="ltitle">Resumen</h1>${G.courses.length>1?`<div class="seg">${segBtns(segR,'seg')}</div>`:''}${rangeSeg(poolAll.length)}${metEntry()}<div class="msg" style="margin-top:12px">No hay tarjetas válidas en este período. Probá con un período más largo.</div>`;
  const best = pool.slice().sort((a,b)=>a.gross-b.gross||a.net-b.net)[0];
  const worst = (pool.filter(r=>r.date>=wSince).length ? pool.filter(r=>r.date>=wSince) : pool).slice().sort((a,b)=>b.gross-a.gross)[0];
  const bd = pool.filter(r=>r.differential_computed!=null).sort((a,b)=>a.differential_computed-b.differential_computed)[0];
  const rec = pool.filter(r=>r.date>=rSince);
  const hard = G.courses.filter(c=>segR==='Todas'||c.key===segR).flatMap(c=>{ const hs = ranged ? holeStats(pool, c.key) : null; return c.holes.map(h=>({ck:c.key,cn:c.course,...h,stats:hstat(h,hs)})).filter(h=>h.stats.n); }).sort((a,b)=>b.stats.avg_to_par-a.stats.avg_to_par).slice(0,4);
  const cq = segR==='Todas'?'all':segR;
  const card = (r,k,href,tone) => r ? `<a class="card stat vx-tap tone-${tone}" href="${href}"><div class="k"><i class="tdot" aria-hidden="true"></i>${k}</div><div class="v num">${r.gross}<small>neto ${r.net??'—'}</small></div><div class="d">${dmy(r.date)} · ${esc(clabel(r.course_key))}</div></a>` : '';
  return `<div class="top"><span class="overline">${ranged ? `${rlabel(RANGE)} · desde ${dmy(rangeSince(RANGE))}` : `${rounds[rounds.length-1].date.slice(0,4)} – ${rounds[0].date.slice(0,4)}`}</span></div>
  <h1 class="ltitle">Resumen</h1>
  <button type="button" class="btn wx-jump" id="wx-jump">Ver cómo afecta el clima</button>
  ${G.courses.length>1?`<div class="seg">${segBtns(segR,'seg')}</div>`:''}
  ${rangeSeg(poolAll.length)}
  ${metEntry()}
  <div class="grid2">
    ${card(best,'Mejor ronda',rlink('best-gross',{scope:'all',course:cq,sort:'gross',order:'asc'}),'g')}${card(worst,ranged?'Peor ronda':`Peor (desde ${wSince})`,ranged?rlink('rounds',{scope:'all',course:cq,sort:'gross',order:'desc'}):mlink('rounds',{scope:'since',year:wSince,course:cq,sort:'gross',order:'desc'}),'r')}
    <a class="card stat vx-tap" href="${rlink('average',{scope:'all',course:cq,sort:'date',order:'desc'})}"><div class="k">Promedio gross</div><div class="v num">${f1(mean(pool.map(r=>r.gross)))}</div><div class="d">${pool.length} rondas · neto ${f1(mean(pool.filter(r=>r.net).map(r=>r.net)))}</div></a>
    ${ranged?`<a class="card stat vx-tap" href="${rlink('average',{scope:'all',course:cq,sort:'net',order:'asc'})}"><div class="k">Neto promedio</div><div class="v num">${f1(mean(pool.filter(r=>r.net).map(r=>r.net)))}</div><div class="d">${pool.length} rondas${bd?` · <span class="hl">mejor dif. ${f1(bd.differential_computed)}</span>`:''}</div></a>`
    :`<a class="card stat vx-tap" href="${mlink('average',{scope:'since',year:rSince,course:cq,sort:'date',order:'desc'})}"><div class="k">Desde ${rSince}</div><div class="v num">${f1(mean(rec.map(r=>r.gross)))}${(()=>{ if (rec.length<3) return ''; const dd = mean(rec.map(r=>r.gross)) - mean(pool.map(r=>r.gross)); return Math.abs(dd)<0.05 ? '' : `<small class="tdelta ${dd<0?'up':'dn'}">${dd<0?'↓':'↑'}${f1(Math.abs(dd))}</small>`; })()}</div><div class="d">${rec.length} rondas${bd?` · <span class="hl">mejor dif. ${f1(bd.differential_computed)}</span>`:''}</div></a>`}
  </div>
  <div class="cols"><div class="col-a"><div class="section"><h2>Tendencia <a class="info-i" href="#/outliers" aria-label="Cómo se calcula: outliers y mejores 8 de 20"><span>i</span></a></h2><span class="badge gold">Índice estimado</span></div>
  <div class="card" style="padding:16px 14px 14px">${trend()}
    <div class="legend"><span><i style="background:${C.primary}"></i>Índice (mejores 8 de 20)</span>${G.courses.map(c=>`<span><i style="background:${CCOL[c.key]};opacity:.6"></i>${esc(c.label)}</span>`).join('')}</div></div>
  <p class="foot">Cada punto es un diferencial calculado por Golflet (tu club no lo publica).${G.hi_history.length?` <a class="link" href="${mlink('handicap',{scope:'all'})}">HCP Index oficial: ${f1(G.hi_history[0]?.hi)} → ${f1(G.hi_history.at(-1)?.hi)}</a>.`:''}</p>
  </div><div class="col-b">  <div class="section"><h2>Resultados por hoyo</h2></div>
  ${holeResults(pool, cq)}
  ${hard.length?`<div class="section"><h2>Hoyos que más te cuestan</h2></div>
  <div class="list">${hard.map(h=>`<a class="row" href="#/hoyo/${encodeURIComponent(h.ck)}/${h.hole}"><div class="date"><b class="num">${h.hole}</b><span>${esc(h.cn.slice(0,3))}</span></div><div class="body"><div class="t">Par ${h.par} · Handicap ${h.hcp}</div><div class="s">Promedio ${f2(h.stats.avg)} en ${h.stats.n} vueltas</div></div><span class="badge neg num">${sg(h.stats.avg_to_par)}</span>${ICON.chev}</a>`).join('')}</div>`:''}
  <p class="foot">Sobre ${pool.length} tarjetas válidas de 18 hoyos${ranged?` (${rlabel(RANGE).toLowerCase()})`:""}; las DES y las de 9 hoyos no cuentan.</p><div id="puttcard"></div><div id="wxres"></div><div id="privres"></div></div></div>`;
}

/* ---------- RONDAS ---------- */
let segL = 'Todas';
function vRondas(){
  if (!rounds.length) return `<h1 class="ltitle">Rondas</h1>${emptyData()}`;
  if (segL!=='Todas' && !course(segL)) segL='Todas';
  const list = rounds.filter(r=>segL==='Todas'||r.course_key===segL), by = {};
  list.forEach(r=>(by[r.date.slice(0,4)] ||= []).push(r));
  return `<div class="top"><span class="overline">${rounds.length} tarjetas · ${G.clubs.length===1?esc(G.clubs[0].club_name):G.clubs.length+' clubes'}</span></div>
  <h1 class="ltitle">Rondas</h1>${G.courses.length>1?`<div class="seg">${segBtns(segL,'segl')}</div>`:''}
  <div class="rsort" role="radiogroup" aria-label="Ordenar"><span aria-hidden="true">Ordenar</span>${[['date','Fecha'],['gross','Mejor gross'],['net','Mejor neto']].map(([k,l])=>`<button type="button" role="radio" aria-checked="${sortL===k}" class="${sortL===k?'on':''}" data-sortl="${k}">${l}</button>`).join('')}</div>
  ${sortL==='gross' ? `<div class="list">${list.filter(r=>r.valid_card&&r.gross&&!r.is_9_holes).sort((a,b)=>a.gross-b.gross||(a.date<b.date?1:-1)).map(r=>roundRow(r, false, true)).join('')}</div><p class="foot">Solo tarjetas válidas de 18 hoyos, de la mejor a la peor.</p>` :
    sortL==='net' ? `<div class="list">${list.filter(r=>r.valid_card&&r.gross&&!r.is_9_holes).sort((a,b)=>(a.net==null)-(b.net==null)||(a.net??0)-(b.net??0)||(a.date<b.date?1:-1)).map(r=>roundRow(r, false, true)).join('')}</div><p class="foot">Solo tarjetas válidas de 18 hoyos, por neto de menor a mayor; las que no tienen neto van al final.</p>` :
  Object.keys(by).sort().reverse().map(y=>{ const v=by[y].filter(r=>r.valid_card&&r.gross&&!r.is_9_holes), cur = y === curYear();
    return `<section class="yrgrp${cur?' cur':''}">${cur ? '' : `<div class="yrpill" aria-hidden="true"><span class="num">${y}</span></div>`}<div class="yearhdr"><span>${cur ? 'Este año' : `<span class="sr">Año </span>${y}`}</span><span>${v.length?'prom. '+f1(mean(v.map(r=>r.gross))):''}</span></div><div class="list">${by[y].map(r=>roundRow(r)).join('')}</div></section>`; }).join('')}`;
}

/* ---------- RONDA (sheet) ---------- */
function cls(d){ if(d==null) return 'none'; return d<=-2?'eagle':d===-1?'birdie':d===0?'par':d===1?'bogey':'double'; }
function nine(r, c, from){
  const hs=r.holes.slice(from,from+9), ch=c?c.holes.slice(from,from+9):[], tk=(r.tee||'').toUpperCase();
  if (!hs.length) return '';
  const tot = a => a.some(x=>x!=null) ? a.reduce((s,x)=>s+(x||0),0) : '—';
  return `<div class="sc">
    <span class="lab">Hoyo</span>${hs.map(h=>`<span class="h">${h[0]}</span>`).join('')}<span class="h">${from?'VTA':'IDA'}</span>
    <span class="lab">Yds</span>${hs.map((h,i)=>{ const x=ch[i]; return `<span class="c yd" style="color:var(--color-ink3)">${x?.yards?.[tk]??''}${x?.data_warning?'<span class="warnmark">*</span>':''}</span>`; }).join('')}<span></span>
    <span class="lab">Par</span>${hs.map(h=>`<span class="c">${h[1]??''}</span>`).join('')}<span class="tot" style="color:var(--color-ink2);font-weight:var(--fw500,500)">${tot(hs.map(h=>h[1]))}</span>
    <span class="lab"></span>${hs.map(h=>`<span class="sc-s"><span class="b ${cls(h[2]==null||h[1]==null?null:h[2]-h[1])}">${h[2]??'·'}</span></span>`).join('')}<span class="tot">${tot(hs.map(h=>h[2]))}</span>
  </div>`;
}
const HOLE_MARK = {
  eagles: `<svg class="hr-ic" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path fill="#0B2545" d="M3 17.5c3.2-.4 6.2-4.6 9.4-4.6 1.6 0 2.6 1.4 4.8 1.6 2.6.2 4.4-2.2 7.2-2.4 1.2 2.6 1.6 4.8-.2 6.6-2.2 2.2-5.2 1.2-7.4 1.6-2.4.4-3.6 2.4-6.2 2.2-2.8-.2-4.6-2.6-7.6-2.2-1 .2-2 .8-3 1.2.2-1.4.6-2.8 1-4z"/><path fill="#C4A36A" d="M24.2 10.2c1.6-.2 3.2.2 4.4 1.2-1.4.6-2.6.4-3.8-.2-.4-.8-.6-1-.6-1z"/><circle cx="23.2" cy="12.2" r=".9" fill="#F6F7F9"/></svg>`,
  birdies: `<svg class="hr-ic" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path fill="#0B2545" d="M8 18.5c2.2-3.6 5.4-5.2 8.2-4.2 1.2.4 2.2 1.4 3.6 1.2 1.6-.2 2.4-1.8 4-1.6-.2 1.6-1.2 2.6-2.6 3.2 1.2.8 1.8 2 1.4 3.2-2.2.2-3.8-.6-5.2-1.4-1.6 1.6-4 2.4-6.4 1.6-2.2-.8-3.6-2.2-3-2z"/><path fill="#C8102E" d="M23.6 13.2l4.2.6-3.4 1.4z"/><circle cx="20.4" cy="15.2" r=".8" fill="#F6F7F9"/></svg>`,
  pars: `<svg class="hr-ic" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path fill="#0B2545" d="M15 6h2v16h-2z"/><path fill="#C8102E" d="M17 7.2h8.2l-1.6 3.2 1.6 3.2H17z"/><ellipse cx="16" cy="24.5" rx="6.2" ry="2.2" fill="#C4A36A"/></svg>`,
  bogeys: `<svg class="hr-ic" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><ellipse cx="18.5" cy="22.5" rx="7" ry="2.4" fill="none" stroke="#0B2545" stroke-width="1.8"/><circle cx="11" cy="13" r="5.2" fill="#F6F7F9" stroke="#0B2545" stroke-width="1.6"/><path fill="none" stroke="#C4A36A" stroke-width="1.2" d="M8.2 13.2c1.2-1.6 2.6-1.4 3.6.2"/></svg>`,
};
function holeResults(pool, cq){
  const keys = ['eagles', 'birdies', 'pars', 'bogeys'];
  return `<div class="hr-grid">${keys.map(k => {
    const n = pool.reduce((s, r) => s + (r.holes?.length ? r.holes.filter(h => h[1] != null && h[2] != null && (k === 'eagles' ? h[2] - h[1] <= -2 : k === 'birdies' ? h[2] - h[1] === -1 : k === 'pars' ? h[2] === h[1] : h[2] - h[1] === 1)).length : (k === 'eagles' ? 0 : (r.summary_counts?.[k] || 0))), 0);
    return `<a class="hr-card vx-tap hr-${k}" href="${rlink(k, { scope: 'all', course: cq, sort: 'date', order: 'desc' })}"><span class="hr-art" aria-hidden="true">${HOLE_MARK[k]}</span><span class="hr-copy"><span class="k">${MTITLE[k]}</span><span class="v num">${n}</span></span></a>`;
  }).join('')}</div>`;
}
function holeTally(r){
  const holes = r.holes || [], known = holes.filter(h => h[1] != null && h[2] != null);
  const c = { eagles: 0, birdies: 0, pars: 0, bogeys: 0, doubles: 0, known: known.length, holes: holes.length };
  known.forEach(h => { const d = h[2] - h[1]; if (d <= -2) c.eagles++; else if (d === -1) c.birdies++; else if (d === 0) c.pars++; else if (d === 1) c.bogeys++; else c.doubles++; });
  return c;
}
function scoreKey(c){
  if (!c.known) return '';
  const item = (cls, n, label, spoken) => `<span aria-label="${n} ${spoken}"><span class="b ${cls}" aria-hidden="true">${n}</span> ${label}</span> `;
  const scope = c.known < c.holes ? `<p class="foot">En ${c.known} hoyos con score. Un hoyo sin score no cuenta como par.</p>` : '';
  return `<div class="keyrow" id="scoreline">${item('eagle', c.eagles, 'Águilas', 'águilas')}${item('birdie', c.birdies, 'Birdies', 'birdies')}${item('par', c.pars, 'Pares', 'pares')}${item('bogey', c.bogeys, 'Bogeys', 'bogeys')}${item('double', c.doubles, 'Doble +', 'doble o peor')}</div>${scope}`;
}
function sRonda(id){
  const r = rounds.find(x=>x.round_id===id); if(!r) return '<p>Ronda no encontrada.</p>';
  const c = course(r.course_key), k = r.summary_counts||{};
  const warn = c ? c.holes.filter(h=>h.data_warning).map(h=>h.hole) : [];
  const has = r.putts!=null||r.gir!=null||r.fir!=null;
  const tc = r.tee && TEE[r.tee.toUpperCase()];
  return `<div class="bar"><span class="overline">${dmy(r.date)}</span><button class="close" data-close>${ICON.x}</button></div>
  <div class="stitle">${cup(r)+esc(short(r.tournament)||'Ronda')}</div><div style="font-size:calc(12.5px*var(--ts,1));color:var(--color-ink3);margin-top:2px">${esc(title(r.tournament))}</div>
  <div class="chips"><span class="badge">${esc(r.club_name)}</span>${r.course&&r.course!==r.club_name?`<span class="badge">${esc(r.course)}</span>`:''}${r.tee?`<span class="badge">${tc?`<i class="tee" style="background:${tc};margin-right:6px"></i>`:''}Tee ${esc(r.tee)}</span>`:''}${r.course_rating?`<span class="badge">${f1(r.course_rating)}${r.slope?' / '+r.slope:''}</span>`:''}</div>
  <div id="rwx"></div>
  ${r.valid_card?'':'<div class="note-warn">Tarjeta DES: no presentada, levantada o descalificada. No cuenta en promedios.</div>'}
  <div class="grid3 rstats" style="gap:8px;margin-top:16px">
    ${[['Gross',r.gross??'—'],['Neto',r.net??'—'],['Dif.*',f1(r.differential_computed)],['Puesto',r.position?r.position+'º':'—']].map(([kk,v],i)=>`<div class="card mini stat" style="padding:12px 10px;${i===0?'background:var(--color-primary);color:var(--color-onPrimary)':''}"><div class="k" style="${i===0?'color:rgba(247,245,240,.6)':''}">${kk}</div><div class="v num" style="font-size:calc(25px*var(--ts,1))">${v}</div></div>`).join('')}
  </div>
  ${r.holes?.length?`<div class="card" style="margin-top:12px;padding:14px 12px">${nine(r,c,0)}<div class="sc"><span class="div"></span></div>${nine(r,c,9)}
    ${scoreKey(holeTally(r))}</div>`:`<div class="msg" style="margin-top:12px">${r.other_course?`Tarjeta jugada en ${esc(r.club_name)}. Tu club solo comparte los totales de las canchas que no son de tus clubes, así que no cuenta para las estadísticas por hoyo.`:'Tu club no publica el detalle hoyo por hoyo de esta tarjeta.'}</div>`}
  <p class="foot" id="difnote">${r.position?`${r.position}º de ${r.field_size}. `:''}*Diferencial estimado por Golflet.${warn.length?` <span class="warnmark">*</span>Yardas a revisar en hoyos ${warn.join(', ')}.`:''}</p>
  <div id="hmap"></div>
  <div class="section"><h2>Tu juego</h2><span class="badge" id="gamebadge">${has?'Cargado':'Sin cargar'}</span></div>
  <a class="card row rt-track" id="round-track" href="#/reconstruir?ronda=${encodeURIComponent(r.round_id)}&amp;hole=1"><span class="rt-mark">TRACK</span><span class="body"><span class="t">Registrar mis tiros</span><span class="s">Cómo fueron los golpes en el mapa de esta vuelta, hoyo por hoyo. No cambia los putts, el drive ni el green.</span></span>${ICON.chev}</a>
  <div class="card qstat" id="qstat" data-rid="${esc(r.round_id)}"><div class="q-nav"><button type="button" class="btn ghost sm" data-qh="-1">Anterior</button><b id="qhole">Hoyo</b><button type="button" class="btn ghost sm" data-qh="1">Siguiente</button></div><p class="foot" id="qpar" style="margin-top:6px"></p><div class="q-lab">Putts</div><div class="q-row" id="qputts"></div><div id="qfwbox"><div class="q-lab">Dónde fue el drive</div><div class="q-row" id="qfw"></div></div><div class="q-lab">Green en regulación</div><div class="q-row" id="qgir"></div><p class="foot" id="qtot"></p><p class="foot" id="qmsg">Sin cargar</p><button type="button" class="btn ghost sm" id="qretry" hidden>Reintentar</button></div>
  <div class="fields">
    <label class="field"><span>Putts</span><input inputmode="numeric" data-k="putts" value="${r.putts??''}" placeholder="—"></label>
    <label class="field"><span>Greens</span><input inputmode="numeric" data-k="gir" value="${r.gir??''}" placeholder="—/18"></label>
    <label class="field"><span>Fairways</span><input inputmode="numeric" data-k="fir" value="${r.fir??''}" placeholder="—/14"></label>
  </div>
  <div class="saved" id="saved" style="margin:8px 4px 0">${ICON.pencil}<span>${r.notes_at?'Guardado en tu cuenta · '+ago(r.notes_at):'Se guarda en tu cuenta'}</span></div>
  ${recapBox(r.round_id)}
  ${r.gps_shots?`<div class="section"><h2>Golpes con GPS</h2><span class="badge">${r.gps_shots}</span></div><div id="rshots"><div style="padding:20px 0;text-align:center"><span class="spin"></span></div></div>`:''}`;
}

/* ---------- CANCHA ---------- */
let segC = null;
function vCancha(){
  if (!G.courses.length) return `<h1 class="ltitle">Cancha</h1>${emptyData()}`;
  if (!course(segC)) segC = G.courses[0].key;
  const c = course(segC), ranged = RANGE!=='all', hs = ranged ? holeStats(valid.filter(inR), c.key) : null, HS = h => hstat(h, hs);
  const top = c.holes.filter(h=>HS(h).n).slice().sort((a,b)=>HS(b).avg_to_par-HS(a).avg_to_par).slice(0,3).map(h=>h.hole);
  const v = valid.filter(r=>r.course_key===c.key && inR(r)), vAll = rounds.filter(r=>r.course_key===c.key && inR(r)), rSince = String(new Date().getFullYear()-1);
  const heat = x => x==null?'#DCD6C8':x<0.2?'#8DBE73':x<0.45?'#C8A86A':x<0.65?'#D58A5E':'#B5543C';
  return `<div class="top"><span class="overline">${esc(c.club_name)}</span></div>
  <h1 class="ltitle">Cancha</h1>
  ${G.courses.length>1?`<div class="seg">${G.courses.map(x=>`<button class="${x.key===segC?'on':''}" data-segc="${esc(x.key)}">${esc(x.label)}</button>`).join('')}</div>`:''}
  ${rangeSeg(vAll.length)}
  <p class="cn-scope">${esc(rlabel(RANGE))} · ${esc(c.course)}. Los promedios y los hoyos de esta vista son solo de esta cancha.</p>
  <div class="hero" style="padding:20px 22px">
    <div class="overline">Cancha ${esc(c.course)} · Par ${c.par}</div>
    <a class="vx-hlink" href="${rlink('average',{scope:'all',course:c.key,sort:'date',order:'desc'})}" style="display:flex;align-items:flex-end;gap:12px;margin-top:8px"><span class="big num" style="font-size:calc(60px*var(--tsb,1));margin:0">${f1(mean(v.map(r=>r.gross)))}</span><span class="cn-avg">gross promedio<br>en ${v.length} tarjetas</span></a>
    <div class="meta"><a href="${rlink('best-gross',{scope:'all',course:c.key,sort:'gross',order:'asc'})}">Mejor<b class="num">${minOr(v.map(r=>r.gross))}</b></a><a href="${rlink('average',{scope:'all',course:c.key,sort:'net',order:'asc'})}">Neto prom.<b class="num">${f1(mean(v.filter(r=>r.net).map(r=>r.net)))}</b></a>${ranged?`<a href="${rlink('rounds',{scope:'all',course:c.key,sort:'date',order:'desc'})}">Tarjetas<b class="num">${vAll.length}</b></a>`:`<a href="${mlink('average',{scope:'since',year:rSince,course:c.key,sort:'date',order:'desc'})}">Desde ${rSince}<b class="num">${f1(mean(v.filter(r=>r.date>=rSince).map(r=>r.gross)))}</b></a>`}</div>
  </div>
  <div class="teechips">${Object.entries(c.tees||{}).map(([t,x])=>`<span class="teechip"><i class="tee" style="background:${TEE[t.toUpperCase()]||'#ccc'}"></i>${esc(t)} <b class="num">${f1(x.course_rating)}</b>/${x.slope}</span>`).join('')}</div>
  <div id="stratcard" data-ck="${esc(c.key)}"></div>
  <div id="cancwx" data-ck="${esc(c.key)}" data-club="${esc(c.club_name||'')}"></div>
  <a class="lb-entry vx-tap" href="#/plan/cancha?ck=${encodeURIComponent(c.key)}" aria-label="Abrir la libreta de ${esc(c.course)}. Diseño, rumbo, marcas y greens para imprimir, sin reserva."><span class="lb-cover" aria-hidden="true"><svg class="lb-book" viewBox="0 0 32 40" fill="none"><path d="M6 4.5h16.5A3.5 3.5 0 0 1 26 8v26.5H9.5A3.5 3.5 0 0 0 6 38V4.5z" fill="#F7F4EE"/><path d="M6 4.5h16.5A3.5 3.5 0 0 1 26 8v26.5" stroke="#0B2545" stroke-width="1.6"/><path d="M6 8h3.2V36" stroke="#C8102E" stroke-width="2.2"/><path d="M11 12h10M11 17h10M11 22h7" stroke="#0B2545" stroke-width="1.3" stroke-linecap="round"/></svg></span><span class="lb-copy"><span class="lb-k">Libreta de la cancha</span><span class="lb-s">Diseño, rumbo, marcas y greens para imprimir. Sin reserva.</span></span><span class="lb-go">Abrir libreta ${ICON.chev}</span></a>
  <div id="bench" data-ck="${esc(c.key)}"></div>
  <div class="section"><h2>Hoyos</h2><span class="badge">golpes sobre el par</span></div>
  <div class="hgrid">${c.holes.map(h=>{ const st = HS(h), v = st.n ? st.avg_to_par : null, hard = top.includes(h.hole);
    const vc = v == null ? 'none' : v < 0 ? 'dn' : v < 0.2 ? 'flat' : v >= 0.45 ? 'up' : 'mid';
    return `<a class="hcell ${hard?'hard':''}" href="#/hoyo/${encodeURIComponent(c.key)}/${h.hole}" aria-label="Hoyo ${h.hole}, par ${h.par}, ${v==null?'sin datos':sg(v,1)+' sobre el par en promedio'}${hard?', de tus tres más difíciles':''}">
      <span class="hc-top"><b class="hc-n num">${h.hole}${h.data_warning?'<span class="warnmark">*</span>':''}</b><i class="hc-dot" style="background:${heat(v)}"></i></span>
      <span class="hc-par">Par ${h.par}</span><b class="hc-v num ${vc}">${v==null?'—':sg(v,1)}</b></a>`; }).join('')}</div>
  <div class="hc-legend" aria-label="Qué indica el punto de color"><span><i style="background:#8DBE73"></i>menos de +0,2</span><span><i style="background:#C8A86A"></i>+0,2 a +0,4</span><span><i style="background:#D58A5E"></i>+0,5 a +0,6</span><span><i style="background:#B5543C"></i>+0,7 o más</span><span><i style="background:#DCD6C8"></i>sin datos</span></div>
  <p class="foot">En verde oscuro, tus tres hoyos más difíciles. ${c.holes.some(h=>h.data_warning)?'<span class="warnmark">*</span>Datos del sitio a revisar.':''}</p>`;
}
/* ---------- HOYO (sheet) ---------- */
function sHoyo(ck, n){
  const c = course(ck), h = c && c.holes.find(x=>x.hole===+n); if(!h) return '<p>Hoyo no encontrado.</p>';
  const st=h.stats, d=st.dist, cp=h.compare||{}, gp=k=>cp[k]?.group_pct, N = st.n || 1;
  const rank = c.holes.slice().sort((a,b)=>(b.stats.avg_to_par??-9)-(a.stats.avg_to_par??-9)).findIndex(x=>x.hole===h.hole)+1;
  const me = [d.eagle_or_better+d.birdie, d.par, d.bogey, d.double+d.triple_plus].map(x=>x*100/N);
  const hasG = Object.keys(cp).length > 0;
  const grp = [(gp('Albatros')||0)+(gp('Eagle')||0)+(gp('Birdie')||0), gp('Par'), gp('Bogey'), gp('DobleBogeymas')];
  const col = [C.accent, C.primary2, C.bogey, C.dbl], names=['Birdie+','Par','Bogey','Doble+'];
  const bar = a => `<div class="stack">${a.map((x,i)=>x>0?`<i style="width:${x}%;background:${col[i]}"></i>`:'').join('')}</div>`;
  const tees = Object.entries(h.yards||{}).filter(([,y])=>y);
  const alt = String(h.par_raw??'').includes('/') ? String(h.par_raw).split('/')[1] : null;
  const bag = (G.bag||[]).filter(b=>b.carry);
  const nh = c.holes.length, prev = h.hole>1?h.hole-1:nh, next = h.hole<nh?h.hole+1:1, K = encodeURIComponent(c.key);
  return `<div class="bar"><span class="overline">Cancha ${esc(c.course)} · ${rank===1?'tu hoyo más difícil':'dificultad '+rank+'/'+nh}</span><button class="close" data-close>${ICON.x}</button></div>
  <div style="display:flex;justify-content:space-between;align-items:flex-end"><div class="ltitle" style="margin:2px 0 8px">Hoyo ${h.hole}</div>
    <div style="display:flex;gap:6px;margin-bottom:10px"><a class="close" href="#/hoyo/${K}/${prev}" aria-label="Anterior"><svg viewBox="0 0 12 12"><path d="M8 1L3 6l5 5" fill="none"/></svg></a><a class="close" href="#/hoyo/${K}/${next}" aria-label="Siguiente"><svg viewBox="0 0 12 12"><path d="M4 1l5 5-5 5" fill="none"/></svg></a></div></div>
  <div id="holegeo" data-ck="${esc(c.key)}" data-hole="${h.hole}"><div style="padding:18px 0;text-align:center"><span class="spin"></span></div></div>
  <div class="pills">
    <div class="pill dark"><b class="num">${h.hole}</b><span>Hoyo</span></div>
    <div class="pill"><b class="num">${h.par??'—'}</b><span>Par${alt?` · damas ${alt}`:''}</span></div>
    <div class="pill"><b class="num">${tees[0]?.[1]??'—'}</b><span>Yardas</span></div>
    <div class="pill"><b class="num">${h.hcp??'—'}</b><span>Handicap</span></div>
  </div>
  <div class="teechips">${tees.map(([t,y])=>`<span class="teechip"><i class="tee" style="background:${TEE[t]||'#ccc'}"></i>${t[0]+t.slice(1).toLowerCase()} <b class="num">${y}</b></span>`).join('')}</div>
  ${h.data_warning?`<div class="note-warn">⚠︎ ${esc(h.data_warning)}</div>`:''}
  <div class="section"><h2>Cómo jugarlo</h2><span class="badge gold" id="howbadge">Estrategia</span></div>
  <div id="howto" data-ck="${esc(c.key)}" data-hole="${h.hole}"><div style="padding:18px 0;text-align:center"><span class="spin"></span></div></div>
  <div class="section"><h2>Tu historial</h2><span style="font-size:calc(12.5px*var(--ts,1));color:var(--color-ink3)">${st.n} vueltas</span></div>
  <div class="card">
    <div style="display:flex;align-items:flex-end;justify-content:space-between">
      <div class="stat"><div class="k">Promedio</div><div class="v num" style="font-size:calc(44px*var(--tsb,1))">${f2(st.avg)}</div></div>
      <div style="text-align:right"><span class="badge ${st.avg_to_par>0.5?'neg':st.avg_to_par<0.15?'pos':'gold'} num" style="font-size:calc(13px*var(--ts,1))">${sg(st.avg_to_par)} vs par</span>
        <div style="font-size:calc(12.5px*var(--ts,1));color:var(--color-ink3);margin-top:8px">Últimas 16: <b class="num" style="color:var(--color-ink)">${f2(st.avg_last16)}</b> · ${st.best??'—'}–${st.worst??'—'}</div></div>
    </div>
    <div class="dist"><div class="lbl"><span>Vos</span></div>${bar(me)}${hasG?`<div class="lbl"><span>Todos los jugadores del club</span></div>${bar(grp.map(x=>x||0))}`:''}</div>
    <div class="dkey">${names.map((nm,i)=>`<div><i style="background:${col[i]}"></i>${nm}<b class="num">${pc(me[i])}</b>${hasG?`<span class="grp">todos ${pc(grp[i])}</span>`:''}</div>`).join('')}</div>
  </div>
  ${hasG?'':'<p class="foot" id="clubcmp">La comparación con todos los jugadores del club todavía no está cargada para esta cancha.</p>'}`;
}

/* ---------- CÓMO JUGAR LA CANCHA (estrategia publicada por el club / admin) ---------- */
const STRAT = {};
const READ_MS = 4000;
function stratFor(ck){
  const key = ck + '\n' + VIEW_GEN;
  if (STRAT[key]) return STRAT[key];
  for (const old of Object.keys(STRAT)) if (old.startsWith(ck + '\n') && old !== key) delete STRAT[old];
  return STRAT[key] = api('/api/strategy?' + new URLSearchParams({ course_key: ck }), { timeoutMs: READ_MS }).catch(e => { delete STRAT[key]; throw e; });
}
const CLUBCODE = { 'driver':'Dr','madera 3':'3W','madera 5':'5W','híbrido':'Hy','hibrido':'Hy','hierro 4':'4i','hierro 5':'5i','hierro 6':'6i','hierro 7':'7i','hierro 8':'8i','hierro 9':'9i','pitching wedge':'PW','pitching':'PW','gap wedge':'GW','sand wedge':'SW','lob wedge':'LW' };
const clubLink = label => { const c = CLUBCODE[String(label||'').toLowerCase().trim()]; return c ? `<a class="vx-chip on" href="#/palo/${c}">${esc(label)}</a>` : `<span class="vx-chip on">${esc(label)}</span>`; };
const MISSL = { izquierda:'Si errás, que sea a la izquierda', derecha:'Si errás, que sea a la derecha', corto:'Si errás, que sea corto', largo:'Si errás, que sea largo' };
const LVL = [['bajo','Hándicap bajo'],['medio','Hándicap medio']];
const myLevel = () => { const hi = G.player?.handicap_index; return hi == null ? null : hi <= 5 ? 'bajo' : hi <= 18 ? 'medio' : 'alto'; };
let HOWLVL = 'bajo';
function howtoHTML(hs){
  const sel = HOWLVL || '';
  const choice = window.GolfletRules ? window.GolfletRules.strategyChoice(hs.variants, sel, { plan: hs.plan_text, tee_club: hs.tee_club }) : { missing: false, plan: sel ? '' : (hs.plan_text || ''), club: sel ? '' : (hs.tee_club || '') };
  const alto = !!(hs.variants && hs.variants.alto);
  const sketch = (hs.hazards || []).filter(z => z.carry_yd != null || z.from_yd != null);
  const maxY = sketch.length ? Math.max(...sketch.map(z => z.carry_yd || z.from_yd || 1)) : 1;
  return `<div class="card vx-how">
    ${hs.plan_title?`<div class="vx-how-t">${esc(hs.plan_title)}</div>`:''}
    <div class="vx-chips" style="margin:10px 0 2px"><button type="button" class="vx-chip ${!sel?'on':''}" data-lvl="">General</button>${LVL.map(([k,l])=>`<button type="button" class="vx-chip ${sel===k?'on':''}" data-lvl="${k}">${l}${myLevel()===k?' · vos':''}</button>`).join('')}${alto?`<button type="button" class="vx-chip ${sel==='alto'?'on':''}" data-lvl="alto">Hándicap alto${myLevel()==='alto'?' · vos':''}</button>`:''}</div>
    ${choice.missing?`<p class="vx-how-p">${esc(choice.plan)}</p>`:`${choice.club||(!sel&&hs.tee_target)?`<div class="vx-how-tee"><span class="k">Salida</span>${choice.club?clubLink(choice.club):''}${!sel&&hs.tee_target?`<span class="vx-how-tgt">${esc(hs.tee_target)}</span>`:''}</div>`:''}${choice.plan?`<p class="vx-how-p">${esc(choice.plan)}</p>`:''}`}
    ${sketch.length?`<div class="vx-sketch" aria-hidden="true">${sketch.map(z=>`<i style="left:${Math.min(94, ((z.carry_yd || z.from_yd) / maxY) * 90)}%"></i>`).join('')}</div>`:''}
  </div>
  ${hs.hazards.length?`<div class="section" style="margin-top:16px"><h2 style="font-size:calc(17px*var(--ts,1))">Peligros</h2><span class="badge">${hs.hazards.length}</span></div>
    <div class="card vx-hz">${hs.hazards.map(z=>`<details class="vx-hzr"><summary><span class="vx-hz-i vx-hz-${z.type}"></span><span class="vx-hz-m"><b>${esc(z.type_label)}</b>${z.side_label?` · ${esc(z.side_label)}`:''}</span><span class="num vx-hz-d">${z.from_yd!=null&&z.carry_yd!=null?`${z.from_yd}–${z.carry_yd} yd`:z.carry_yd!=null?`carry ${z.carry_yd} yd`:z.from_yd!=null?`a ${z.from_yd} yd`:''}</span></summary>${z.note?`<p>${esc(z.note)}</p>`:''}${z.carry_yd!=null?`<p class="num" style="color:var(--color-ink3)">Para pasarlo: ${z.carry_yd} yd de carry (${z.carry_m} m).</p>`:''}</details>`).join('')}</div>`:''}
  ${hs.why?`<div class="section" style="margin-top:16px"><h2 style="font-size:calc(17px*var(--ts,1))">Por qué</h2></div><div class="card"><p class="vx-how-p" style="margin:0">${esc(hs.why)}</p></div>`:''}
  ${hs.miss_side||hs.miss_note?`<div class="vx-miss"><b>${esc(MISSL[hs.miss_side]||'Si errás')}</b>${hs.miss_note?`<span>${esc(hs.miss_note)}</span>`:''}</div>`:''}
  ${hs.green_slope||hs.green_leave||hs.green_notes?`<div class="section" style="margin-top:16px"><h2 style="font-size:calc(17px*var(--ts,1))">Green</h2></div><div class="card vx-green">
    ${hs.green_slope?`<div class="vx-lm"><span>Pendiente</span><b>${esc(hs.green_slope)}</b></div>`:''}${hs.green_leave?`<div class="vx-lm"><span>Dónde dejarla</span><b>${esc(hs.green_leave)}</b></div>`:''}${hs.green_notes?`<p class="vx-how-p" style="margin:8px 0 0">${esc(hs.green_notes)}</p>`:''}</div>`:''}`;
}
async function loadHowto(){
  const el = $('#howto'); if (!el) return; const ck = el.dataset.ck, n = +el.dataset.hole, gen = VIEW_GEN;
  let st; try { st = await stratFor(ck); } catch(e){ const box = $('#howto'); if (!box || gen !== VIEW_GEN || box.dataset.hole !== String(n)) return; box.innerHTML = `${errBox(e, 'la estrategia')}`; return; }
  const box = $('#howto'); if (!box || gen !== VIEW_GEN || box.dataset.hole !== String(n)) return;
  const hs = st.holes.find(x => x.hole === n);
  if (!hs) { box.innerHTML = `<div class="empty-card" style="text-align:left">${ICON.target}<b>Todavía sin estrategia para este hoyo</b>${st.holes.length?`Hay ${st.holes.length} hoyos cargados en esta cancha. <a class="link" href="#/estrategia/${encodeURIComponent(ck)}">Ver todos</a>`:'Cuando el club cargue cómo jugarlo, aparece acá: plan, peligros y por qué.'}</div>`; const b=$('#howbadge'); if (b) b.hidden = true; return; }
  const draw = () => { const cur = $('#howto'); if (!cur || cur.dataset.hole !== String(n)) return; cur.innerHTML = howtoHTML(hs) + `<a class="vx-how-all" href="#/estrategia/${encodeURIComponent(ck)}">Cómo jugar toda la cancha ${ICON.chev}</a>`;
    cur.querySelectorAll('[data-lvl]').forEach(b => b.onclick = () => { HOWLVL = b.dataset.lvl; draw(); }); };
  draw();
}
function finiteLL(p){
  if (!p || typeof p !== 'object' || p.lat == null || p.lng == null) return null;
  if (typeof p.lat === 'string' && p.lat.trim() === '') return null;
  if (typeof p.lng === 'string' && p.lng.trim() === '') return null;
  const lat = Number(p.lat), lng = Number(p.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}
function holeTraceSVG(hole){
  const tee = finiteLL(hole && hole.tee), center = finiteLL(hole && hole.green && hole.green.center);
  if (!tee || !center) return '';
  const linePts = Array.isArray(hole.line) ? hole.line.map(finiteLL).filter(Boolean) : [];
  const straight = !linePts.length;
  const pts = [tee, ...linePts, center];
  const lats = pts.map(p => p.lat), lngs = pts.map(p => p.lng);
  const minLa = Math.min(...lats), maxLa = Math.max(...lats), minLn = Math.min(...lngs), maxLn = Math.max(...lngs);
  const dLa = Math.max(1e-6, maxLa - minLa), dLn = Math.max(1e-6, maxLn - minLn);
  const W = 360, H = 470, pad = 36;
  const xy = p => [pad + ((p.lng - minLn) / dLn) * (W - pad * 2), pad + ((maxLa - p.lat) / dLa) * (H - pad * 2)];
  const d = pts.map((p, i) => { const [x, y] = xy(p); return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`; }).join(' ');
  const [tx, ty] = xy(tee), [gx, gy] = xy(center);
  const label = straight ? `Referencia recta del tee al green, hoyo ${hole.hole}. No es el trazado del hoyo.` : `Trazado con los puntos provistos del hoyo ${hole.hole}`;
  const note = straight ? `<p class="msg">Referencia recta del tee al centro del green. No es el trazado del hoyo.</p>` : '';
  return `<div class="holecard"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}"><path d="${d}" fill="none" stroke="#0F3D2E" stroke-width="3"/><circle cx="${tx}" cy="${ty}" r="6" fill="#C8A86A"/><circle cx="${gx}" cy="${gy}" r="8" fill="#0F3D2E"/></svg></div>${note}`;
}
async function loadHoleGeo(){
  const el = $('#holegeo'); if (!el) return;
  const ck = el.dataset.ck, n = +el.dataset.hole, gen = VIEW_GEN;
  const miss = () => { const box = $('#holegeo'); if (!box || gen !== VIEW_GEN || +box.dataset.hole !== n) return; box.innerHTML = '<p class="msg">No hay un trazado verificado para este hoyo.</p>'; };
  try {
    const geo = await gpsForCourse(ck);
    if (gen !== VIEW_GEN || !$('#holegeo') || +$('#holegeo').dataset.hole !== n) return;
    if (!geo) return miss();
    const hole = ((geo.course || geo).holes || []).find(h => h.hole === n);
    const svg = holeTraceSVG(hole);
    const box = $('#holegeo'); if (!box || gen !== VIEW_GEN) return;
    box.innerHTML = svg || '<p class="msg">No hay un trazado verificado para este hoyo.</p>';
  } catch (e) {
    const box = $('#holegeo'); if (!box || gen !== VIEW_GEN || +box.dataset.hole !== n) return;
    box.innerHTML = errBox(e, 'el trazado');
  }
}

/* ---------- POR RONDA: media y mediana (nunca media geométrica: hay rondas con cero) ---------- */
const PRK = [['eagles','Águilas'],['birdies','Birdies'],['pars','Pares'],['bogeys','Bogeys'],['doubles','Doble o peor']];
/* per-round score-type counts from the real card (18 holes with par + score, or the club's summary counts); null if not computable */
function rcounts(r){ if (r.is_9_holes) return null; const hs = (r.holes||[]).filter(h=>h[1]!=null&&h[2]!=null);
    if (hs.length === 18) { const c = { eagles:0, birdies:0, pars:0, bogeys:0, doubles:0 }; hs.forEach(h=>{ const d=h[2]-h[1]; d<=-2?c.eagles++:d===-1?c.birdies++:d===0?c.pars++:d===1?c.bogeys++:c.doubles++; }); return c; }
    const s = r.summary_counts; if (!s || r.holes?.length) return null; const c = { eagles:null, birdies:s.birdies||0, pars:s.pars||0, bogeys:s.bogeys||0, doubles:(s.double_bogeys||0)+(s.triple_bogeys||0)+(s.worse||0) };
    return c.birdies+c.pars+c.bogeys+c.doubles >= 17 ? c : null; }
function perRoundJS(rs){
  const cs = rs.map(r => { if (r.is_9_holes) return null; const hs = (r.holes||[]).filter(h=>h[1]!=null&&h[2]!=null);
    if (hs.length === 18) { const c = { eagles:0, birdies:0, pars:0, bogeys:0, doubles:0 }; hs.forEach(h=>{ const d=h[2]-h[1]; d<=-2?c.eagles++:d===-1?c.birdies++:d===0?c.pars++:d===1?c.bogeys++:c.doubles++; }); return c; }
    const s = r.summary_counts; if (!s || r.holes?.length) return null; const c = { eagles:null, birdies:s.birdies||0, pars:s.pars||0, bogeys:s.bogeys||0, doubles:(s.double_bogeys||0)+(s.triple_bogeys||0)+(s.worse||0) };
    return c.birdies+c.pars+c.bogeys+c.doubles >= 17 ? c : null; }).filter(Boolean);
  const med = a => { if (!a.length) return null; const x = a.slice().sort((p,q)=>p-q), m = x.length>>1; return x.length%2 ? x[m] : (x[m-1]+x[m])/2; };
  const out = { rounds: cs.length }; for (const [k] of PRK) { const v = cs.map(c=>c[k]).filter(x=>x!=null); out[k] = { mean: v.length ? v.reduce((a,b)=>a+b,0)/v.length : null, median: med(v), rounds: v.length }; }
  return out;
}
const medTxt = v => v == null ? '—' : Number.isInteger(v) ? String(v) : f1(v);
function perRoundBlock(d, metric, st){
  const p = d.per_round; if (!p || !p.rounds) return '';
  const m = p[metric], keep = { scope: st.scope||'all', year: st.year||'', course: st.course||'all', sort:'date', order:'desc', range: st.range||'' };
  return `<div class="section"><h2>Por ronda</h2><span class="badge">${p.rounds} tarjetas</span></div>
    <div class="card pr-card"><div class="pr-main"><div><b class="num">${m?.mean==null?'—':f2(m.mean)}</b><span>promedio</span></div><div><b class="num">${medTxt(m?.median)}</b><span>mediana</span></div></div>
    <div class="pr-others">${PRK.filter(([k])=>k!==metric).map(([k,l])=>`<a class="pr-o" href="${mlink(k, keep)}"><span>${l}</span><b class="num">${p[k].mean==null?'—':f1(p[k].mean)}</b><small class="num">med ${medTxt(p[k].median)}</small></a>`).join('')}</div>
    <p class="foot" style="margin:8px 2px 0">Promedio y mediana por tarjeta de 18 hoyos${d.range_label?` (${d.range_label.toLowerCase()})`:''}. La mediana es la ronda del medio: no la mueven las rondas excepcionales.</p></div>`;
}
function perRoundCard(rs){
  const p = perRoundJS(rs); if (!p.rounds) return '';
  return `<div class="section"><h2>Por ronda</h2><span class="badge">${p.rounds} tarjetas</span></div><div class="grid4 pr-grid">${PRK.slice(0,4).map(([k,l])=>`<a class="card mini stat vx-tap pr-t" href="${rlink(k,{scope:'all',course:'all',sort:'date',order:'desc'})}"><div class="k pr-k-${k}">${l}</div><div class="v num">${p[k].mean==null?'—':f1(p[k].mean)}</div><div class="d num">mediana ${medTxt(p[k].median)}</div></a>`).join('')}</div>`;
}

/* ---------- TEE TIMES (reservas leídas de cada club vinculado; solo lectura) ---------- */
const WD = ['dom','lun','mar','mié','jue','vie','sáb'], WDL = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const MESL = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const dU = s => new Date(s + 'T12:00:00Z');
const todayAR = () => new Date(Date.now() - 3*3600e3).toISOString().slice(0,10);
const daysTo = s => Math.round((dU(s) - dU(todayAR())) / 864e5);
const relDay = s => { const n = daysTo(s); return n === 0 ? 'Hoy' : n === 1 ? 'Mañana' : n > 1 && n < 7 ? `En ${n} días` : n < 0 ? `Hace ${-n} día${n===-1?'':'s'}` : `En ${n} días`; };
const teeDate = s => { const d = dU(s); return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MES[d.getUTCMonth()]}`; };
const compName = c => typeof c === 'string' ? c : (c && typeof c.name === 'string') ? c.name : '';
const comps = t => (Array.isArray(t?.companions) ? t.companions : []).map(c => ({ name: compName(c).trim(), hcp: c && typeof c === 'object' && c.hcp != null && isFinite(+c.hcp) ? +c.hcp : null })).filter(c => c.name);
const compInit = n => String(n || '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '·';
/* "Pérez, Juan Carlos" or "Juan Pérez" → "Juan"; list → "con Juan y Pedro +2" (empty when nobody) */
const firstN = n => { const s = String(n || '').trim(), p = s.includes(',') ? s.split(',')[1].trim() : s; return p.split(/\s+/)[0] || s; };
const withWho = t => { const n = comps(t).map(c => firstN(c.name)); if (!n.length) return ''; const sh = n.slice(0, 2); return ` · con ${sh.join(' y ')}${n.length > 2 ? ` +${n.length - 2}` : ''}`; };
const teeRow = t => { const d = dU(t.date);
  const card = t.scorecard_label ? `<div class="s">${esc(t.scorecard_label)}</div>` : '';
  return `<a class="row" href="#/tee/${t.id}">${dateBlock(t.date)}<div class="body"><div class="t">${esc(t.club_name)}</div><div class="s tt-s">${(() => { const r = relDay(t.date), sh = +t.start_hole; return [t.course_label ? esc(t.course_label) : '', r === 'Hoy' || r === 'Mañana' ? r : `${WD[d.getUTCDay()]} · ${r}`, sh === 1 || sh === 10 ? `Hoyo ${sh}` : ''].filter(Boolean).join(' · '); })()}${esc(withWho(t))}</div>${card}</div><div class="score"><b class="num">${esc(t.time)}</b><span>salida</span></div>${ICON.chev}</a>`; };
const PAGEL = { bookings:'reservas', companions:'jugadores de la línea', hi_history:'historial de hándicap', calculator:'calculadora de hándicap de juego' };
function sourcesNote(clubs){
  if (!clubs?.length) return '';
  return `<div class="tt-src">${clubs.map(c => { const b = c.pages.bookings; const bad = Object.entries(c.pages).filter(([,v]) => v.status==='missing' || v.status==='error');
    return `<div><b>${esc(c.club_name)}</b><span>${!b ? 'Todavía sin leer: se lee en la próxima actualización.' : b.status==='ok' ? `${b.items} ${b.items===1?'reserva':'reservas'} · leído ${ago(b.checked_at)}` : b.status==='empty' ? `Sin reservas próximas · leído ${ago(b.checked_at)}` : b.status==='missing' ? 'Este club no tiene la página de reservas.' : `No pudimos leer las reservas. La última lectura sigue siendo ${ago(b.checked_at)}.`}${bad.filter(([k])=>k!=='bookings').length ? ` · Falta: ${bad.filter(([k])=>k!=='bookings').map(([k])=>PAGEL[k]).join(', ')}` : ''}</span></div>`; }).join('')}</div>`;
}
/* t145u: "Hola, <Nombre>" never overlaps the PRÓXIMO TEE TIME tab and is never truncated.
   1) reserve = tab width (inside the content box) + 12px gap; 2) if the greeting fits on one line at 42px → leave it;
   3) else scale it down to fit (not below 28px); 4) still too long → tab drops to its own row under the greeting (flush right)
   and the greeting gets the full width (scaled ≥ 28px, wrapping only as a last resort). No tee time → full width, same 42→28 rule. */
function fitGreeting(){
  const h = $('#greet'); if (!h) return; const top = h.previousElementSibling, pill = $('#ttpill'), has = !!(pill && !pill.hidden);
  h.style.fontSize = ''; h.style.paddingRight = '0px'; h.style.whiteSpace = 'nowrap'; h.style.marginBottom = ''; h.style.minHeight = ''; h.classList.remove('tt-below'); if (pill) pill.style.top = '';
  const base = parseFloat(getComputedStyle(h).fontSize) || 42, MIN = 28, W = h.clientWidth; if (!W) return;
  const rg = document.createRange(); rg.selectNodeContents(h); const nat = rg.getBoundingClientRect().width + 2;
  const vp = parseFloat(getComputedStyle(view).paddingRight) || 18, reserve = has ? Math.max(0, pill.offsetWidth - vp) + 12 : 0, avail = W - reserve;
  if (nat <= avail) { h.style.paddingRight = reserve + 'px'; return; }
  const s = base * avail / nat * .98;
  if (has && s >= MIN) { h.style.fontSize = s.toFixed(1) + 'px'; h.style.paddingRight = reserve + 'px'; return; }
  const s2 = base * W / nat * .98; h.style.paddingRight = '0px';
  if (s2 < base) h.style.fontSize = Math.max(MIN, s2).toFixed(1) + 'px';
  if (s2 < MIN) h.style.whiteSpace = 'normal';
  if (!has) return;
  h.classList.add('tt-below'); h.style.minHeight = '0px';
  const tb = (() => { const r2 = document.createRange(); r2.selectNodeContents(h); return r2.getBoundingClientRect().bottom; })();
  const off = Math.max(h.getBoundingClientRect().bottom, tb) - top.getBoundingClientRect().top + 6;
  pill.style.top = off + 'px'; h.style.marginBottom = (pill.offsetHeight + 4 + 18) + 'px';
}
let fitT; addEventListener('resize', () => { clearTimeout(fitT); fitT = setTimeout(fitGreeting, 80); });
document.fonts?.addEventListener?.('loadingdone', () => fitGreeting());
async function loadTeeCard(fresh){
  const el = $('#tees'); if (!el) return;
  let d = fresh; if (!d) { try { d = await api('/api/tee-times?scope=upcoming&limit=4'); } catch(e){ el.innerHTML = ''; return; } }
  if (!$('#tees')) return; const ts = d.tee_times;
  const pill = $('#ttpill');                                     // next booking in the header → scroll to this card
  if (pill && ts.length) { const t = ts[0], wd = WD[dU(t.date).getUTCDay()];
    const when = `${wd[0].toUpperCase()+wd.slice(1,3)} ${+t.date.slice(8,10)} · ${t.time}`, where = t.course_label || '';
    pill.querySelector('.tp-v').textContent = when; const pc = pill.querySelector('.tp-c'); pc.textContent = where; pc.hidden = !where;
    pill.setAttribute('aria-label', `Próximo tee time: ${when}${where ? ', ' + where : ''}${t.club_name ? ', ' + t.club_name : ''}. Ir a Próximos tee times`); pill.hidden = false;
    pill.closest('.top')?.classList.add('has-tt');
    const vp = parseFloat(getComputedStyle(view).paddingRight) || 18; pill.style.right = `-${vp}px`;   /* t139u: tab flush with the screen's right edge */
    fitGreeting();
    pill.onclick = ev => { ev.preventDefault(); const sec = $('#tees'), c = sec?.querySelector('.tt-next') || sec; if (!c) return; sec.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash'); setTimeout(() => c.classList.remove('flash'), 1800); }; }
  el.innerHTML = `<div class="section"><h2>Próximos tee times</h2>${ts.length?`<a href="#/tees">Ver todos</a>`:''}</div><p class="foot" id="teenote">${esc(TEE_NOTE)}</p>` + (ts.length
    ? `${yrList(ts.slice(0,3), t => t.date, teeRow)}`.replace('<a class="row" href="#/tee/', '<a class="row tt-next" href="#/tee/')
    : `<div class="card tt-empty"><b>No tenés reservas próximas en tu club</b><span>Cuando reserves una salida en tu club, la vas a ver acá con fecha, hora, cancha y con quién jugás.</span></div>`);
  if (fresh) for (const id of [...(fresh.new || []), ...(fresh.changed || [])]) { const a = el.querySelector(`a[href="#/tee/${CSS.escape(id)}"]`); if (a) { a.classList.add('tt-in'); setTimeout(() => a.classList.remove('tt-in'), 2600); } }
  if (fresh) for (const id of fresh.new || []) { const sp = el.querySelector(`a[href="#/tee/${CSS.escape(id)}"] .score span`); if (sp) { sp.textContent = 'nueva'; sp.classList.add('tt-newb'); } }
  if (fresh && (fresh.new || []).length) el.insertAdjacentHTML('beforeend', `<span class="sr" role="status">${fresh.new.length === 1 ? 'Apareció una reserva nueva' : `Aparecieron ${fresh.new.length} reservas nuevas`}</span>`);
}
/* Every visible entry re-reads the booking list. Overlapping focus/pageshow/visibility share one request.
   A later entry, after that request finished, starts another. 150s does not skip it. */
let TCK = null, TEE_NOTE = '';
function teeNoteEl(){ return $('#teenote'); }
function paintTeeNote(){ const n = teeNoteEl(); if (n) n.textContent = TEE_NOTE; }
function checkNewTees(){
  if (document.hidden || !G) return refreshReservations(false);
  return refreshReservations(true);
}
function refreshReservations(online){
  if (TCK) return TCK;
  if (!online || navigator.onLine === false) { TEE_NOTE = 'Sin conexión: mostramos la última lectura.'; paintTeeNote(); return Promise.resolve(null); }
  TEE_NOTE = 'Revisando'; paintTeeNote();
  TCK = api('/api/tee-times/check?limit=50', { method:'POST', body:'{}' }).then(d => {
    TEE_NOTE = d.fresh ? 'Leídas del club.' : (d.message || 'No pudimos verificar las reservas.');
    paintTeeNote();
    if (d.fresh && $('#tees')) { loadTeeCard(d); loadCurrentTee(); }
    return d;
  }).catch(() => { TEE_NOTE = 'No pudimos verificar las reservas.'; paintTeeNote(); return null; }).finally(() => { TCK = null; });
  return TCK;
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkNewTees(); });
addEventListener('pageshow', () => checkNewTees()); addEventListener('focus', () => checkNewTees());
let CARD_FLIGHT = null, CARD_NOTE = '', BOOK_FLIGHT = null, BOOK_NOTE = '';
function paintCardPull(){
  const el = $('#cardpull'); if (!el) return;
  el.innerHTML = `<button type="button" class="btn ghost" id="bring-card">Traer última tarjeta</button><p class="foot" id="cardstat"></p>`;
  const stat = $('#cardstat'); if (stat) stat.textContent = CARD_NOTE;
  $('#bring-card').onclick = () => bringLatestCard($('#bring-card'));
}
function bringLatestCard(btn){
  if (CARD_FLIGHT) return CARD_FLIGHT;
  const clubs = (G.clubs || []).filter(a => a.password_saved);
  const stat = $('#cardstat');
  if (!clubs.length) { if (stat) stat.textContent = 'No hay una clave guardada para leer el club.'; return Promise.resolve(); }
  btn.disabled = true;
  if (stat) stat.textContent = 'Revisando';
  CARD_FLIGHT = (async () => {
    const results = [];
    const seen = new Set();
    for (const a of clubs) {
      const key = a.source === 'app' ? 'app:' + a.matricula : 'site:' + a.id;
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        const r = await api(`/api/accounts/${a.id}/sync`, { method:'POST', body: JSON.stringify({ _id: a.id }) });
        const rows = Array.isArray(r.sync?.clubs) && r.sync.clubs.length ? r.sync.clubs : [r.sync || {}];
        for (const c of rows) results.push({ club: c.club_name || a.club_name, ok: !!c.ok, newRounds: c.new_rounds || 0, message: c.message || '' });
      } catch (e) {
        const rows = Array.isArray(e.data?.sync?.clubs) ? e.data.sync.clubs : [];
        if (rows.length) { for (const c of rows) results.push({ club: c.club_name || a.club_name, ok: !!c.ok, newRounds: c.new_rounds || 0, message: c.message || '' }); }
        else results.push({ club: a.club_name, ok: false, newRounds: 0, message: e.data?.sync?.message || e.message || 'No pudimos leer el club.' });
      }
    }
    const added = results.filter(r => r.ok).reduce((s, r) => s + r.newRounds, 0);
    const bad = results.filter(r => !r.ok);
    const ok = results.some(r => r.ok);
    const fail = bad.map(r => `${r.club}: ${r.message || 'No pudimos leer el club.'}`).join(' ');
    CARD_NOTE = !ok ? (fail || 'No pudimos leer el club. La tarjeta en pantalla no cambió.') : bad.length ? `${added ? (added === 1 ? 'Llegó una tarjeta nueva.' : 'Llegaron ' + added + ' tarjetas nuevas.') : 'No hay una tarjeta nueva en los clubes que respondieron.'} ${fail}` : added ? (added === 1 ? 'Llegó una tarjeta nueva.' : `Llegaron ${added} tarjetas nuevas.`) : 'No hay una tarjeta nueva. La última sigue siendo la que ya ves.';
    if (stat) stat.textContent = CARD_NOTE;
    if (ok && added) { try { G = { ...G, ...(await api('/api/data')) }; derive(); render(true); } catch (e) { CARD_NOTE = 'La tarjeta llegó, pero no pudimos actualizar la lista.'; const s = $('#cardstat'); if (s) s.textContent = CARD_NOTE; } }
  })().finally(() => { CARD_FLIGHT = null; const b = $('#bring-card'); if (b) b.disabled = false; });
  return CARD_FLIGHT;
}
function refreshBooking(id, btn){
  if (BOOK_FLIGHT) return BOOK_FLIGHT;
  btn.disabled = true;
  BOOK_NOTE = 'Revisando';
  const stat = $('#bookstat'); if (stat) stat.textContent = BOOK_NOTE;
  BOOK_FLIGHT = api('/api/tee-times/check?limit=50', { method:'POST', body: JSON.stringify({ players: true, tee_id: id }) }).then(async d => {
    BOOK_NOTE = d.fresh && d.players_read ? 'Jugadores leídos del club.' : (d.fresh ? (d.message || 'La reserva se leyó. Los jugadores que ya estaban siguen en pantalla.') : (d.message || 'No pudimos verificar las reservas.'));
    await loadTee(id, { quiet: true });
  }).catch(e => { BOOK_NOTE = e.message || 'No pudimos verificar las reservas.'; const s = $('#bookstat'); if (s) s.textContent = BOOK_NOTE; }).finally(() => { BOOK_FLIGHT = null; const b = $('#refresh-booking'); if (b) b.disabled = false; });
  return BOOK_FLIGHT;
}
function sTees(){ return `<div class="bar"><span class="overline">Tee times</span></div><div id="teesall"><div style="padding:60px 0;text-align:center"><span class="spin"></span></div></div>`; }
async function loadScorecards(){
  const el = $('#scorecards'); if (!el) return;
  try {
    const d = await api('/api/scorecard-fetches');
    const rows = d.fetches || [];
    if (!rows.length) { el.innerHTML = ''; return; }
    const when = f => [f.date ? dmy(f.date) : '', f.time || ''].filter(Boolean).join(' · ');
    const block = (title, list) => list.length ? `<div class="section"><h2>${title}</h2><span class="badge">${list.length}</span></div><div class="list">${list.map(f => `<div class="row sc-job" data-bucket="${esc(f.presentation || '')}"><div class="body"><div class="t">${esc(f.club_name || 'Club')}</div>${f.course_label ? `<div class="s">${esc(f.course_label)}</div>` : ''}<div class="s num">${esc(when(f))}</div><div class="s">${esc(f.label || '')}</div></div></div>`).join('')}</div>` : '';
    const bucket = f => f.presentation || (f.status === 'complete' ? 'ready' : f.status === 'cancelled' ? 'cancelled' : 'pending');
    const groups = [
      ['En curso', rows.filter(f => bucket(f) === 'pending')],
      ['Próxima', rows.filter(f => bucket(f) === 'future')],
      ['No presentó', rows.filter(f => bucket(f) === 'absent')],
      ['Ya está', rows.filter(f => bucket(f) === 'ready')],
      ['Sin confirmar', rows.filter(f => bucket(f) === 'problem')],
      ['Otras', rows.filter(f => bucket(f) === 'cancelled')],
    ];
    const note = groups[2][1].length ? `<p class="foot">«No presentó» es la lectura de Golflet cuando el club contestó y no había tarjeta después del día de la salida. No es el estado de la AAG y no cambia el hándicap.</p>` : '';
    el.innerHTML = `<div class="section"><h2>Tarjeta del club</h2></div>${groups.map(([title, list]) => block(title, list)).join('')}${note}`;
  } catch(e){
    el.innerHTML = `<div class="section"><h2>Tarjeta del club</h2></div><div class="msg err">${esc(e.message || 'No pudimos leer la búsqueda de tarjetas.')}</div>`;
  }
}
async function loadTees(opts){
  const el = $('#teesall'); if (!el) return;
  try {
    const [u, p, cards] = await Promise.all([
      api('/api/tee-times?scope=upcoming&limit=200'),
      api('/api/tee-times?scope=past&limit=20'),
      api('/api/scorecard-fetches').catch(e => ({ fetches: [], error: e })),
    ]); if (!$('#teesall')) return;
    const byTee = {};
    for (const f of cards.fetches || []) if (f.tee_time_id) byTee[f.tee_time_id] = f.label;
    const mark = list => list.map(t => ({ ...t, scorecard_label: byTee[t.id] || '' }));
    const cardNote = cards.error ? `<div class="msg err">${esc(cards.error.message || 'No pudimos leer la búsqueda de tarjetas.')}</div>` : '';
    el.innerHTML = `<div class="stitle">Tee times</div>
      ${cardNote}
      <div class="section"><h2>Próximos</h2><span class="badge">${u.tee_times.length}</span></div>${u.tee_times.length?`${yrList(mark(u.tee_times), t => t.date, teeRow)}`:`<div class="msg">No tenés reservas próximas en tu club.</div>`}
      ${p.tee_times.length?`<div class="section"><h2>Pasados</h2></div>${yrList(mark(p.tee_times), t => t.date, teeRow, 'list tt-past')}`:''}
      <div class="section"><h2>De dónde salen</h2></div>${sourcesNote(u.clubs)}
      <p class="foot">Golflet lee tus reservas en el sitio de cada club con tu sesión, solo para mostrarlas: no reserva ni cancela nada. La tarjeta se busca sola a partir de cinco horas después de la salida. El servidor revisa cada quince minutos, así que la primera lectura puede llegar hasta un cuarto de hora más tarde, aunque la app esté cerrada.</p>`;
    if (!opts?.quiet) refreshReservations(navigator.onLine !== false).then(d => { if (d?.fresh && $('#teesall')) loadTees({ quiet: true }); });
  } catch(e){ el.innerHTML = errBox(e); }
}
function sTee(id){ return `<div class="bar"><span class="overline">Tee time</span></div><div id="tee" data-id="${esc(id)}"><div style="padding:60px 0;text-align:center"><span class="spin"></span></div></div>`; }
const hcpTxt = v => v == null ? '—' : v < 0 ? '+' + (-v) : String(v);
const teeKey = id => 'gl_tee_' + id;
const myTee = id => { try { return localStorage.getItem(teeKey(id)); } catch(_){ return null; } };
const setMyTee = (id, t) => { try { localStorage.setItem(teeKey(id), t); } catch(_){} };
const teeChip = (t, on) => `<button type="button" role="radio" aria-checked="${on}" class="tt-tee ${on?'on':''}" data-tee="${esc(t.tee)}"><span class="tt-tn"><i class="tee" style="background:${TEE[t.tee.toUpperCase()]||'#ccc'}"></i><b>${esc(t.tee)}</b>${t.gender==='D'?'<small class="tt-g">Damas</small>':''}</span><span class="num">${t.playing_handicap==null?'sin datos':`HJ ${hcpTxt(t.playing_handicap)}${t.estimated?' · estim.':''}`}</span><small class="num">${t.course_rating!=null?`CR ${String(t.course_rating).replace('.',',')} · `:''}${t.slope!=null?`slope ${t.slope}`:''}</small></button>`;
function strokesTxt(t){ if (!t?.strokes_by_hole) return ''; const g = t.strokes_by_hole.filter(h=>h.strokes>0).map(h=>h.hole), back = t.strokes_by_hole.filter(h=>h.strokes<0).map(h=>h.hole), two = t.strokes_by_hole.filter(h=>h.strokes>1).map(h=>h.hole);
  return back.length ? `Devolvés golpe en los hoyos ${back.join(', ')}.` : g.length ? `Recibís golpe en ${g.length===18?'todos los hoyos':'los hoyos '+g.join(', ')}${two.length?` (dos en ${two.join(', ')})`:''}.` : 'No recibís golpes.'; }
/* tee picker + modality for one booking (display only; the choice stays on this device) */
function teeBlock(d, id){
  const sel = d.tees.find(x => x.selected);
  return `${d.tees.length ? `<div class="tt-lab">Modalidad</div><div class="seg tt-seg tt-mods" role="radiogroup" aria-label="Modalidad">${d.modalities.map(m => `<button type="button" role="radio" aria-checked="${m.key===d.modality}" class="${m.key===d.modality?'on':''}" data-mod="${m.key}">${esc(m.label.replace(' hoyos',''))}</button>`).join('')}</div>
      <div class="tt-lab">Elegí tu salida${d.hi!=null?` · HI ${f1(d.hi)}`:''}</div><div class="tt-tees" role="radiogroup" aria-label="Salida">${d.tees.map(x => teeChip(x, x.selected)).join('')}</div>
      ${sel?`<p class="tt-str">${strokesTxt(sel)} Hándicap de juego ${hcpTxt(sel.playing_handicap)} en ${esc(d.modality_label)}${sel.estimated?' (estimado)':''}.</p>`:''}` : `<p class="foot">${esc(d.note||'')}</p>`}
    ${vidSlot('hcp_juego')}<p class="foot">${d.source==='club' ? 'Hándicap de juego oficial: calculadora de tu club.' : d.source==='estimado' ? 'Estimado con la fórmula WHS: la calculadora de tu club no estaba disponible.' : ''}${d.note && d.tees.length ? ' ' + esc(d.note) : ''} ${esc(d.note_official || 'Solo para mostrar en esta ronda: las métricas oficiales salen únicamente de las tarjetas presentadas.')}</p>`;
}
function bindTeeBlock(host, id, reload){
  host.querySelectorAll('[data-tee]').forEach(b => b.onclick = () => { setMyTee(id, b.dataset.tee); reload(); });
  host.querySelectorAll('[data-mod]').forEach(b => b.onclick = () => { try { localStorage.setItem('gl_mod_' + id, b.dataset.mod); } catch(_){} reload(); });
}
const teeQS = id => { const q = new URLSearchParams(); const t = myTee(id); if (t) q.set('tee', t); try { const m = localStorage.getItem('gl_mod_' + id); if (m) q.set('modality', m); } catch(_){} return q.toString(); };
async function loadCurrentTee(){
  const el = $('#teenow'); if (!el) return;
  let d; try { d = await api('/api/tee-times/current'); if (d.tee_time && (myTee(d.tee_time.id) || teeQS(d.tee_time.id))) d = await api('/api/tee-times/current?' + teeQS(d.tee_time.id)); } catch(e){ el.innerHTML = ''; return; }
  if (!$('#teenow')) return; if (!d.tee_time) { el.innerHTML = ''; return; }
  const t = d.tee_time;
  el.innerHTML = `<div class="section"><h2>Tu salida de ahora</h2><span class="badge gold">${esc(t.time)}</span></div><div class="card tt-now">
    <div class="tt-now-h"><b>${esc(t.display_name)}</b><span>${relDay(t.date)} · ${esc(t.time)}${t.start_hole?` · hoyo ${t.start_hole}`:''}</span></div>
    ${teeBlock(d, t.id)}<div class="tt-acts"><a class="btn ghost sm" href="#/tee/${t.id}">Ver la reserva</a></div></div>`;
  bindTeeBlock(el, t.id, loadCurrentTee);
}

const WDIR = ['norte','noreste','este','sudeste','sur','sudoeste','oeste','noroeste'];
const windFrom = deg => deg == null || deg === '' ? '' : WDIR[Math.floor((((Number(deg) % 360) + 360) % 360 + 22.5) / 45) % 8];
const foldN = s => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const CLUB_PINS = [
  { test: (n, k) => foldN(n).includes('mar del plata') || /209/.test(String(k || '')), title: 'Mar del Plata Golf Club', lat: -38.02999, lng: -57.53624, sat: true,
    courses: [{ name: 'Cancha Vieja', key: '7:Cancha Vieja' }, { name: 'Cancha Nueva', key: '7:Cancha Nueva' }] },
  { test: (n, k) => foldN(n).includes('jockey') || /118/.test(String(k || '')), title: 'Jockey Club', lat: -34.4866, lng: -58.5296, sat: true,
    courses: [{ name: 'Azul', key: '1:Azul' }, { name: 'Colorada', key: '1:Colorada' }] },
];
const pinFor = (club, key) => CLUB_PINS.find(p => p.test(club, key)) || null;
const satUrl = (lat, lng) => { const pad = 0.012; return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${lng-pad},${lat-pad*0.65},${lng+pad},${lat+pad*0.65}&bboxSR=4326&imageSR=3857&size=900,400&format=jpg&f=image`; };
function teeCoursePool(t){
  const club = t.club_name || '', known = pinFor(club, t.club_key)?.courses || [];
  const listed = (G.courses || []).filter(c => { const a = foldN(c.club_name), b = foldN(club); return a && b && (a === b || a.includes(b) || b.includes(a)); }).map(c => ({ name: c.course || c.label, key: c.key }));
  const all = known.slice();
  listed.forEach(c => { if (!all.some(x => foldN(x.key) === foldN(c.key) || foldN(x.name) === foldN(c.name))) all.push(c); });
  return { club, all, label: (t.course_label || '').trim() };
}
function pickCourse(pool, nameOrKey){
  if (!nameOrKey) return null;
  return pool.all.find(c => foldN(c.key) === foldN(nameOrKey) || foldN(c.name) === foldN(nameOrKey) || foldN(nameOrKey).includes(foldN(c.name)))
    || (G.courses || []).filter(c => foldN(c.course) === foldN(nameOrKey) || foldN(c.key) === foldN(nameOrKey)).map(c => ({ name: c.course || c.label, key: c.key }))[0]
    || { name: nameOrKey, key: nameOrKey };
}
function resolveTeeCourse(t){
  const o = teeCoursePool(t);
  if (o.label && foldN(o.label) !== foldN(o.club)) {
    const hit = pickCourse(o, o.label); if (hit && foldN(hit.name) !== foldN(o.club)) return { course: hit, choices: [], why: 'reserva' };
  }
  return { course: null, choices: [], why: 'vacío' };
}
function wxCardHTML(title, pin, now, fc, holes){
  const hours = (fc?.hours || []).slice(0, 6);
  const map = pin && pin.sat && finiteLL(pin) ? `<div class="tw-mapwrap"><img class="tw-map" alt="Vista de ${esc(pin.title)}" src="${satUrl(pin.lat, pin.lng)}"></div>` : (pin && !pin.sat ? `<p class="tw-miss">Sin vista satelital de esta cancha.</p>` : '');
  const h0 = hours[0];
  const from = now && now.from_deg != null ? now.from_deg : (h0 && h0.wind_from_deg != null ? h0.wind_from_deg : null);
  const kmh = now && now.kmh != null ? now.kmh : (h0 && h0.wind_kmh != null ? h0.wind_kmh : null);
  const temp = now && now.temp_c != null ? Math.round(now.temp_c) : (h0 && h0.temp_c != null ? h0.temp_c : null);
  const fact = kmh != null ? `${Math.round(kmh)} km/h${from != null ? `, viene del ${windFrom(from)}` : ''}${temp != null ? ` · ${temp}°` : ''}` : null;
  const rules = window.GolfletRules;
  const rows = rules && holes && holes.length ? holes.map(h => rules.windPlay(h.hole, from, h.bearing, kmh)) : [];
  const playable = rows.filter(p => p && p.relative && p.relative !== 'unavailable');
  const missing = rules && !rows.length ? rules.windPlay(0, from, null, kmh).text.replace(/^Hoyo 0 · /, '') : '';
  const wind = playable.length ? `<div class="tw-holes">${playable.map(p => `<div><span>${esc(p.text)}</span></div>`).join('')}</div>` : (rows.length ? `<p class="tw-miss">No hay rumbo verificado del tee al green. El viento no se clasifica por hoyo.</p>` : (missing ? `<p class="tw-miss">${esc(missing)}</p>` : ''));
  const driver = (typeof G !== 'undefined' && Array.isArray(G.bag) ? G.bag : []).find(b => /driver|^dr$/i.test(String(b.club || '')));
  const carry = driver && driver.carry != null && Number.isFinite(Number(driver.carry)) ? Math.round(Number(driver.carry)) : null;
  const bagLine = carry != null ? `<p class="foot">Driver cargado: ${carry} yd. No lo paso a metros y no elijo un palo por el viento o el frío.</p>` : '';
  return `<div class="card tw-card"><div class="overline">Clima en la cancha</div>
    ${map}
    ${fact ? `<p class="tw-now"><b>${esc(fact)}</b><span>${esc(title)}</span></p>` : `<p class="foot">No pude leer el viento de este horario.</p>`}
    ${wind}
    ${hours.length ? `<div class="tw-hrs">${hours.map(h => `<div><b class="num">${esc(String(h.at || '').slice(11, 16))}</b><span>${h.wind_kmh != null ? `${h.wind_kmh} km/h` : '—'}${h.wind_from ? ` ${esc(h.wind_from)}` : ''}</span><small>${h.temp_c != null ? `${h.temp_c}°` : ''}${h.rain_mm > 0 ? ` · ${h.rain_mm} mm` : ''}</small></div>`).join('')}</div>` : ''}
    ${fc?.shift ? `<p class="foot">${esc(fc.shift)}</p>` : ''}
    ${bagLine}
    <p class="foot">Pronóstico Open-Meteo. El viento se clasifica solo con el rumbo verificado del tee al green.</p></div>`;
}
const GPS_COURSE = new Map();
function gpsForCourse(courseKey){
  if (!courseKey) return Promise.resolve(null);
  if (GPS_COURSE.has(courseKey)) return GPS_COURSE.get(courseKey);
  const job = (async () => {
    const list = await api('/api/gps/courses?course_key=' + encodeURIComponent(courseKey), { timeoutMs: READ_MS });
    const hit = pickGpsCourse(list && list.courses, courseKey);
    if (!hit || !hit.course_id) return null;
    return api(`/api/gps/courses/${encodeURIComponent(hit.course_id)}`, { timeoutMs: READ_MS });
  })();
  GPS_COURSE.set(courseKey, job);
  job.then(geo => { if (!geo) GPS_COURSE.delete(courseKey); }, () => GPS_COURSE.delete(courseKey));
  return job;
}
async function holeBearings(courseKey){
  try {
    const geo = await gpsForCourse(courseKey);
    if (!geo) return [];
    const hs = (geo.course || geo).holes || [];
    return hs.map(h => ({ hole: h.hole, bearing: window.GolfletRules && finiteLL(h.tee) && finiteLL(h.green && h.green.center) ? window.GolfletRules.bearingDeg(h.tee, h.green.center) : null }));
  } catch (e) { return []; }
}
async function fillTeePrep(t, id){
  const box = $('#teeprep'); if (!box) return;
  const r = resolveTeeCourse(t);
  if (r.choices.length) {
    box.innerHTML = `<div class="section"><h2>¿Qué cancha jugás?</h2></div>
      <p class="lede">La reserva no dice cuál. Elegí una para ver el viento y el plan.</p>
      <div class="seg">${r.choices.map(c => `<button type="button" data-tck="${esc(c.key)}">${esc(c.name)}</button>`).join('')}</div>`;
    box.querySelectorAll('[data-tck]').forEach(b => b.onclick = () => { try { localStorage.setItem('gl_tee_course_' + id, b.dataset.tck); } catch (_){ } fillTeePrep(t, id); });
    return;
  }
  if (!r.course) {
    box.innerHTML = `<div class="section"><h2>Clima y estrategia</h2></div><div class="msg">La reserva no especifica la cancha.</div>`;
    return;
  }
  const pin = pinFor(t.club_name, r.course.key) || pinFor(t.club_name, t.club_key) || coursePin(r.course.key);
  const at = t.starts_at || `${t.date}T${t.time}:00-03:00`;
  const gen = VIEW_GEN;
  box.innerHTML = `<div class="section"><h2>${esc(r.course.name)}</h2>${r.why === 'última ronda' ? '<span class="badge">la última que jugaste acá</span>' : r.why === 'elegida' ? '<span class="badge">elegida</span>' : ''}</div>
    <div id="teewx"><div style="padding:20px 0;text-align:center"><span class="spin"></span></div></div>
    <div id="teest"></div>`;
  const wx = $('#teewx'), st = $('#teest');
  const weatherJob = (async () => {
    if (!pin) { if (wx) wx.innerHTML = `<p class="foot">No tenemos la ubicación de esta cancha para mostrar el viento.</p>`; return; }
    try {
      const holesP = holeBearings(r.course.key);
      const [now, fc, holes] = await Promise.all([
        api(`/api/weather/now?lat=${pin.lat}&lng=${pin.lng}`, { timeoutMs: READ_MS }),
        api(`/api/weather/forecast?lat=${pin.lat}&lng=${pin.lng}&at=${encodeURIComponent(at)}`, { timeoutMs: READ_MS }),
        holesP,
      ]);
      if (wx && gen === VIEW_GEN && $('#teewx') === wx) wx.innerHTML = wxCardHTML(pin.title, pin, now, fc, holes);
    } catch (e) { if (wx && gen === VIEW_GEN && $('#teewx') === wx) wx.innerHTML = errBox(e, 'el viento'); }
  })();
  const stratJob = (async () => {
    try {
      const S = await stratFor(r.course.key);
      if (st && gen === VIEW_GEN && $('#teest') === st) {
        if (!S.holes.length && !S.overview) st.innerHTML = `<div class="msg">Todavía no hay un plan publicado para ${esc(r.course.name)}.</div>`;
        else st.innerHTML = `<a class="card vx-stratc" href="#/estrategia/${encodeURIComponent(r.course.key)}"><div class="overline">Cómo jugarla</div>
          ${S.overview ? `<p>${esc(S.overview)}</p>` : ''}
          <div class="tw-holes">${S.holes.slice(0, 6).map(h => `<div><b class="num">${h.hole}</b><span>${esc(h.plan_title || 'Plan')}</span></div>`).join('')}${S.holes.length > 6 ? `<div><span>+${S.holes.length - 6} hoyos</span></div>` : ''}</div>
          <div class="vx-stratc-f"><b class="num">${S.holes.length}</b> de 18 hoyos con plan ${ICON.chev}</div></a>`;
      }
    } catch (e) { if (st && gen === VIEW_GEN && $('#teest') === st) st.innerHTML = errBox(e, 'la estrategia'); }
  })();
  await Promise.all([weatherJob, stratJob]);
}
function pickGpsCourse(rows, ck){
  const list = Array.isArray(rows) ? rows : [];
  const exact = list.filter(c => c && c.course_key && c.course_key === ck);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const ours = course(ck);
  if (!ours || !ours.club_name || !ours.course) return null;
  const same = list.filter(c => c && foldN(c.club_name || '') === foldN(ours.club_name) && (foldN(c.course || '') === foldN(ours.course) || foldN(c.course_label || '') === foldN(ours.course)) && (!c.course_key || c.course_key === ck));
  return same.length === 1 ? same[0] : null;
}
function coursePin(ck){
  const c = course(ck), p = finiteLL(c);
  if (!c || !p) return null;
  return { title: c.club_name || c.course || 'Cancha', lat: p.lat, lng: p.lng, sat: false };
}
async function loadCanchaWx(){
  const el = $('#cancwx'); if (!el) return;
  const pin = pinFor(el.dataset.club, el.dataset.ck) || coursePin(el.dataset.ck);
  const gen = VIEW_GEN;
  if (!pin) { el.innerHTML = '<p class="foot">No tenemos la ubicación de esta cancha para mostrar el viento.</p>'; return; }
  el.innerHTML = '<div class="card"><div style="padding:18px 0;text-align:center"><span class="spin"></span></div></div>';
  try {
    const holesP = el.dataset.ck ? holeBearings(el.dataset.ck) : Promise.resolve([]);
    const [now, fc, holes] = await Promise.all([
      api(`/api/weather/now?lat=${pin.lat}&lng=${pin.lng}`, { timeoutMs: READ_MS }),
      api(`/api/weather/forecast?lat=${pin.lat}&lng=${pin.lng}`, { timeoutMs: READ_MS }),
      holesP,
    ]);
    const box = $('#cancwx'); if (!box || gen !== VIEW_GEN || box.dataset.ck !== el.dataset.ck) return;
    if (!$('#cancwx') || gen !== VIEW_GEN) return;
    box.innerHTML = wxCardHTML(pin.title, pin, now, fc, holes);
  } catch (e) {
    const box = $('#cancwx'); if (!box || gen !== VIEW_GEN) return;
    box.innerHTML = errBox(e, 'el viento');
  }
}
async function loadTee(id, opts){
  const el = $('#tee'); if (!el) return;
  try {
    const d = await api(`/api/tee-times/${encodeURIComponent(id)}?${teeQS(id)}`); if (!$('#tee')) return;
    const t = d.tee_time, dd = dU(t.date), past = daysTo(t.date) < 0, minsTo = (Date.parse(t.starts_at || `${t.date}T${t.time}:00-03:00`) - Date.now()) / 60000;
    el.innerHTML = `<div class="tt-hero"><div class="overline">${past?'Ya jugado':relDay(t.date)}</div><div class="tt-when"><b class="num">${esc(t.time)}</b><span>${WDL[dd.getUTCDay()]} ${dd.getUTCDate()} de ${MESL[dd.getUTCMonth()]}${t.start_hole?` · sale del hoyo ${t.start_hole}`:''}</span></div>
        <div class="tt-where"><b>${esc(t.club_name)}</b>${t.course_label?`<span>Cancha ${esc(t.course_label)}</span>`:'<span>La reserva no especifica la cancha.</span>'}${t.modality?`<span>${esc(t.modality)}</span>`:''}</div></div>
      ${t.event_name?`<p class="foot" style="margin-top:8px">${esc(t.event_name)}</p>`:''}
      ${minsTo > 30 ? `<a class="btn gp-cta" href="#/plan/nuevo?tee=${esc(t.id)}">Preparar estrategia de juego</a>` : ''}
      <div class="section"><h2>Jugás con</h2><a class="link" href="#/partidos">Historial</a></div>${comps(t).length?`<div class="list">${comps(t).map(c=>`<a class="row gm-crow" href="#/partidos?p=${encodeURIComponent('n:' + (window.GolfletMatchCore ? window.GolfletMatchCore.normName(c.name) : c.name.toLowerCase()))}" aria-label="${esc(c.name)}${c.hcp!=null?`, HCP ${f1(c.hcp)}`:''}. Ver partidos con ${esc(c.name)}"><div class="avatar sm">${esc(compInit(c.name))}</div><div class="body"><div class="t">${esc(c.name)}</div></div>${c.hcp!=null?`<div class="score"><b class="num">${f1(c.hcp)}</b><span>HCP</span></div>`:''}</a>`).join('')}</div>`:'<p class="foot">Sin otros jugadores en la línea por ahora.</p>'}
      <a class="btn gm-cta" href="#/partido/nuevo?tee=${esc(t.id)}"><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M4 16L14 6M14 6h-5M14 6v5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="15.5" cy="15.5" r="2" fill="currentColor"/></svg>Armar partido</a>
      ${past ? '' : `<div class="section"><h2>Tu hándicap de juego</h2></div><div class="card tt-now">${teeBlock(d, t.id)}</div>`}
      <p class="foot">Última lectura guardada${t.seen_at?` · ${ago(t.seen_at)}`:''}. Golflet no reserva ni cancela: eso se hace en ${esc(t.club_name)}.</p>
      <button type="button" class="btn ghost" id="refresh-booking">Actualizar reserva</button><p class="foot" id="bookstat">${esc(BOOK_NOTE)}</p>`;
    const rb = $('#refresh-booking'); if (rb) rb.onclick = () => refreshBooking(id, rb);
    el.insertAdjacentHTML('beforeend', '<div id="teeprep"></div>');
    if (!opts?.quiet) refreshReservations(navigator.onLine !== false).then(d => { if (d?.fresh && $('#tee')?.dataset.id === id) loadTee(id, { quiet: true }); });
    bindTeeBlock(el, t.id, () => loadTee(id));
    fillTeePrep(t, id);
  } catch(e){ el.innerHTML = errBox(e, 'este tee time'); }
}

/* ---------- QUÉ TRABAJAR + PUTTING (por período; heurística transparente) ---------- */
const nf = (x, d=1) => x == null ? '—' : (Math.round(x*10**d)/10**d).toFixed(d).replace('.', ',');
const rq = () => `range=${RANGE}`;
const PM = { putts:'Putts por ronda', gir:'Putts por green en regulación', one:'1 putt', three:'3 putts', course:'Putts por cancha', hole:'Putts por hoyo', distance:'Distancia del primer putt' };
const evLink = v => { if (!v) return null; const [k, x] = v.split(':'); return k === 'putting' ? `#/putting/${x}` : k === 'trabajar' ? `#/trabajar/${x}` : k === 'recaps' ? `#/trabajar/${x === 'putt' ? 'putt' : x}` : null; };
const confBadge = c => `<span class="badge ${c==='alta'?'':'gold'}">confianza ${c}</span>`;
let IMP = null;
async function loadImproveCard(){
  const el = $('#improve'); if (!el) return; const r = RANGE;
  let d; try { d = await api(`/api/improve?${rq()}`); } catch(e){ el.innerHTML = ''; return; }
  if (!$('#improve') || r !== RANGE) return; IMP = d;
  el.innerHTML = `<div class="section"><h2>Qué trabajar</h2><a href="#/trabajar">Ver todo</a></div>` + (d.empty
    ? `<a class="card qt-empty" href="#/trabajar"><b>Todavía no hay una prioridad clara</b><span>Cargá putts y greens al final de cada ronda, grabá un recap o jugá con GPS y te decimos dónde se te van los golpes.</span></a>`
    : `<div class="list qt-list">${d.top.map((a,i)=>`<a class="row" href="#/trabajar/${a.key}"><div class="qt-n num">${i+1}</div><div class="body"><div class="t">${esc(a.label)}</div><div class="s">${esc(a.evidence[0]?.value||'')}</div></div><div class="score"><b class="num qt-lost">−${nf(a.strokes_per_round)}</b><span>golpes/ronda</span></div>${ICON.chev}</a>`).join('')}</div>
       <p class="foot">Estimación con reglas simples sobre tus datos (${rlabel(RANGE).toLowerCase()}). Tocá cada una para ver por qué.</p>`);
}
function sTrabajar(area){ return `<div class="bar"><span class="overline">Qué trabajar · ${esc(rlabel(RANGE))}</span></div><div id="trabajar" data-a="${esc(area||'')}"><div style="padding:60px 0;text-align:center"><span class="spin"></span></div></div>`; }
function asideTrabajar(area){
  const items = (IMP?.areas || []);
  return `<div class="mdl-h">Qué trabajar</div><a class="mdl-row ${!area?'on':''}" href="#/trabajar"><span class="mdl-t">Prioridades<small>${rlabel(RANGE)}</small></span></a>` + items.map(a => `<a class="mdl-row ${a.key===area?'on':''}" href="#/trabajar/${a.key}"><span class="mdl-t">${esc(a.label)}<small>${a.strokes_per_round>=0.05?`−${nf(a.strokes_per_round)} golpes/ronda`:'sin pérdida'}</small></span></a>`).join('')
    + `<a class="mdl-row" href="#/putting"><span class="mdl-t">Putting<small>Todas las métricas</small></span></a>`;
}
async function loadTrabajar(area){
  const el = $('#trabajar'); if (!el) return;
  try {
    if (!area){
      const d = IMP = await api(`/api/improve?${rq()}`); if (!$('#trabajar')) return;
      const srcs = `${d.sources.rounds} tarjetas · ${d.sources.rounds_with_notes} con putts/greens cargados · ${d.sources.gps_rounds} con GPS · ${d.sources.recaps} recaps`;
      el.innerHTML = `<div class="stitle">Qué trabajar</div><p class="lede">Dónde se te van más golpes por ronda, según tus datos. ${d.hi!=null?`Referencias para hándicap ${nf(d.hi)}.`:'Sin hándicap usamos referencias de hándicap 18.'}</p>
        ${d.empty ? `<div class="card qt-empty"><b>Todavía no hay una prioridad clara</b><span>Con lo que hay en este período no aparece nada que te cueste más de 0,1 golpes por ronda. Para afinar: cargá putts, greens y fairways al final de cada ronda, grabá un recap de voz o jugá con GPS en el iPhone.</span></div>` : ''}
        ${d.top.map((a,i)=>`<a class="card qt-top vx-tap" href="#/trabajar/${a.key}"><div class="qt-h"><span class="qt-n num">${i+1}</span><b>${esc(a.label)}</b><span class="qt-lost num">−${nf(a.strokes_per_round)}<small> golpes/ronda</small></span></div>
          <ul class="qt-ev">${a.evidence.map(e=>`<li><span>${esc(e.label)}</span><b class="num">${esc(e.value)}</b></li>`).join('')}</ul><div class="qt-f">${confBadge(a.confidence)}<span>${a.rounds} ronda${a.rounds===1?'':'s'} · ${esc(a.sources.map(x=>({notes:'putts y greens cargados',gps:'GPS',recaps:'recaps',tarjetas:'tus tarjetas'})[x]||x).join(' + '))}</span>${ICON.chev}</div></a>`).join('')}
        ${d.areas.length > d.top.length ? `<div class="section"><h2>El resto</h2></div><div class="list">${d.areas.slice(d.top.length).map(a=>`<a class="row" href="#/trabajar/${a.key}"><div class="body"><div class="t">${esc(a.label)}</div><div class="s">${esc(a.evidence[0]?.value||'')}</div></div><div class="score">${a.strokes_per_round>=0.05?`<b class="num">−${nf(a.strokes_per_round)}</b><span>golpes/ronda</span>`:`<b class="qt-ok">Sin pérdida</b><span>vs tu promedio</span>`}</div>${ICON.chev}</a>`).join('')}</div>` : ''}
        <div class="section"><h2>Cómo lo calculamos</h2></div><div class="card qt-how">
          <p>Cada área se estima en golpes perdidos por ronda con una regla simple, sin inteligencia artificial:</p>
          <ul><li><b>Putt:</b> putts por ronda menos una referencia según tu hándicap (29 + 0,12 × HI).</li><li><b>Approach:</b> greens en regulación que te faltan contra la referencia (12,5 − 0,42 × HI), × 0,5 golpes cada uno.</li>
          <li><b>Salida:</b> fairways que te faltan contra la referencia (9,5 − 0,15 × HI de 14), × 0,25 golpes.</li><li><b>Penalidades:</b> OB, agua y penalidades marcadas con GPS, 1 golpe cada una.</li>
          <li><b>Pares 3, 4 y 5:</b> cuánto peor jugás ese tipo de hoyo que tu promedio, por la cantidad de esos hoyos en una ronda (sale de tus tarjetas).</li><li><b>Recaps:</b> cuando no hay números, cada error que mencionaste cuenta 0,75 golpes (promedio de tus últimos 10 recaps).</li></ul>
          <p class="foot">Datos: ${srcs}. Son estimaciones para ordenar prioridades, no un cálculo exacto.</p></div>`;
      return;
    }
    if (area === 'putt'){ location.replace('#/putting'); return; }
    const d = await api(`/api/improve?${rq()}&area=${encodeURIComponent(area)}`); if (!$('#trabajar')) return;
    const sum = (IMP?.areas || []).find(a => a.key === area);
    let html = `<div class="stitle">${esc(d.label)}</div>`;
    if (sum) html += `<div class="pills"><div class="pill dark"><b class="num">−${nf(sum.strokes_per_round)}</b><span>golpes/ronda (estim.)</span></div><div class="pill"><b class="num">${sum.rounds}</b><span>rondas</span></div><div class="pill"><b>${esc(sum.confidence)}</b><span>confianza</span></div></div><p class="foot">Regla: ${esc(sum.how)}.</p>`;
    if (d.series?.length) html += `<div class="section"><h2>${area==='approach'?'Greens en regulación':'Fairways'} por ronda</h2><span class="badge gold">referencia ${nf(d.reference)}</span></div><div class="card ot-card">${lineChart(d.series.map(x=>({ v:x.value, label:dmy(x.date) })), d.reference, false)}</div>`;
    else if (area==='approach' || area==='salida') html += `<div class="msg">Todavía no cargaste ${area==='approach'?'greens':'fairways'} en tus rondas. Abrí una ronda y completalos al final.</div>`;
    if (d.by_distance?.some(b=>b.n)) html += `<div class="section"><h2>Tiros al green con GPS</h2></div><div class="list">${d.by_distance.filter(b=>b.n).map(b=>{ const er = [['corto',b.short],['largo',b.long],['izq.',b.left],['der.',b.right]].filter(x=>x[1]).map(x=>`${x[0]} ${x[1]}`).join(' · ');
      return `<div class="row"><div class="body"><div class="t num">${b.label}</div><div class="s">${b.n} tiros${er?` · errados: ${er}`:''}</div></div><div class="score"><b class="num">${b.green_pct}%</b><span>en el green</span></div></div>`; }).join('')}</div>`;
    if (d.tee_results?.n) { const t = d.tee_results, K = [['fairway','Fairway','#0F3D2E'],['rough','Rough','#9DB8A6'],['bunker','Bunker','#C8A86A'],['ob','OB','#B4553F'],['water','Agua','#B4553F'],['other','Otro','#DCD6C8']];
      html += `<div class="section"><h2>Salidas con GPS</h2><span class="badge">${t.n}</span></div><div class="card"><span class="bx-bar" style="height:18px">${K.map(([k,,c])=>t[k]?`<span style="flex:${t[k]};background:${c}"></span>`:'').join('')}</span><div class="gg-key">${K.filter(([k])=>t[k]).map(([k,l,c])=>`<span><i style="background:${c}"></i>${l} ${Math.round(t[k]/t.n*100)}%</span>`).join('')}</div></div>`; }
    if (d.list?.length) html += `<div class="section"><h2>Hoyos con penalidad</h2></div><div class="list">${d.list.map(x=>`<div class="row"><div class="date"><b class="num">${x.hole}</b><span>hoyo</span></div><div class="body"><div class="t">${esc(x.course_label)}</div><div class="s">${dmy(x.date)}</div></div><div class="score"><b class="num">${x.penalties}</b><span>golpe${x.penalties===1?'':'s'}</span></div></div>`).join('')}</div>`;
    if (d.outcomes?.n){ const o = d.outcomes, K = [['birdie_or_better','Birdie o mejor','#C8A86A'],['par','Par','#0F3D2E'],['bogey','Bogey','#9DB8A6'],['double_or_worse','Doble o peor','#B4553F']];
      html += `<div class="section"><h2>Cómo terminan</h2><span class="badge">${o.n} hoyos</span></div><div class="card"><span class="bx-bar" style="height:18px">${K.map(([k,,c])=>o[k]?`<span style="flex:${o[k]};background:${c}"></span>`:'').join('')}</span><div class="gg-key">${K.map(([k,l,c])=>`<span><i style="background:${c}"></i>${l} ${Math.round(o[k]/o.n*100)}%</span>`).join('')}</div></div>
        <div class="section"><h2>Hoyo por hoyo</h2></div><div class="list">${d.holes.map(h=>`<a class="row" href="#/hoyo/${encodeURIComponent(h.course_key)}/${h.hole}"><div class="date"><b class="num">${h.hole}</b><span>hoyo</span></div><div class="body"><div class="t">${esc(h.course_label)}</div><div class="s">${h.n} veces · ${h.double_or_worse} doble o peor</div></div><div class="score"><b class="num" style="color:${h.avg_over>1?'#B4553F':'var(--color-ink)'}">+${nf(h.avg_over,2)}</b><span>sobre el par</span></div>${ICON.chev}</a>`).join('')}</div>`; }
    if (d.recap_mentions?.length) html += `<div class="section"><h2>Lo que dijiste en tus recaps</h2><span class="badge">${d.recap_mentions.length} de ${d.recaps_considered} recaps</span></div><div class="list">${d.recap_mentions.map(m=>`<div class="row"><div class="date"><b class="num">${m.hole??'—'}</b><span>hoyo</span></div><div class="body"><div class="t">${esc(m.text)}</div><div class="s">${dmy(m.date)}</div></div></div>`).join('')}</div>`;
    el.innerHTML = html;
  } catch(e){ el.innerHTML = errBox(e); }
}
/* simple line chart: [{v,label}], optional reference line; lowerBetter only colours nothing (brand: green line) */
function lineChart(pts, ref, showAvg = true){
  if (!pts.length) return '';
  const W = 360, H = 170, pl = 8, pr = 34, pt = 12, pb = 24, vs = pts.map(p=>p.v).concat(ref!=null?[ref]:[]), lo = Math.floor(Math.min(...vs)-1), hi = Math.ceil(Math.max(...vs)+1);
  const X = i => pl + (pts.length===1 ? (W-pl-pr)/2 : i*(W-pl-pr)/(pts.length-1)), Y = v => pt + (hi-v)*(H-pt-pb)/(hi-lo || 1);
  let g = ''; const step = Math.max(1, Math.round((hi-lo)/4)); for (let v=lo; v<=hi; v+=step) g += `<line x1="${pl}" x2="${W-pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="${C.hair}"/><text x="${W-pr+6}" y="${Y(v)+4}" font-size="10.5" fill="${C.ink3}" font-family="Geist">${v}</text>`;
  const avg = pts.reduce((s,p)=>s+p.v,0)/pts.length;
  const path = pts.length>1 ? smooth(pts.map((p,i)=>[X(i),Y(p.v)])) : '';
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución">${g}
    ${ref!=null?`<line x1="${pl}" x2="${W-pr}" y1="${Y(ref)}" y2="${Y(ref)}" stroke="#C8A86A" stroke-width="1.6" stroke-dasharray="4 4"/>`:''}
    ${showAvg?`<line x1="${pl}" x2="${W-pr}" y1="${Y(avg)}" y2="${Y(avg)}" stroke="${C.ink3}" stroke-width="1" stroke-dasharray="2 4"/>`:''}
    ${path?`<path d="${path}" fill="none" stroke="#0F3D2E" stroke-width="2.4" stroke-linecap="round"/>`:''}
    ${pts.map((p,i)=>`<circle cx="${X(i)}" cy="${Y(p.v)}" r="3.2" fill="#0F3D2E"><title>${esc(p.label)}: ${p.v}</title></circle>`).join('')}
    <text x="${pl}" y="${H-6}" font-size="10.5" fill="${C.ink3}" font-family="Geist">${esc(pts[0].label)}</text><text x="${W-pr}" y="${H-6}" text-anchor="end" font-size="10.5" fill="${C.ink3}" font-family="Geist">${esc(pts.at(-1).label)}</text></svg>`;
}
let PUT = null;
async function loadPuttCard(){
  const el = $('#puttcard'); if (!el) return; const r = RANGE;
  let d; try { d = PUT = await api(`/api/putting?${rq()}`); } catch(e){ el.innerHTML = ''; return; }
  if (!$('#puttcard') || r !== RANGE) return;
  const has = d.sources.rounds_noted || d.sources.gps_holes;
  const t = (m, k, v, sub) => `<a class="card mini stat vx-tap" href="#/putting/${m}"><div class="k">${k}</div><div class="v num">${v}</div>${sub?`<div class="d">${sub}</div>`:''}</a>`;
  el.innerHTML = `<div class="section"><h2>Putting</h2><a href="#/putting">Ver todo</a></div>` + (has ? `<div class="grid2 pt-grid">
    ${t('putts','Putts por ronda', nf(d.per_round.avg), d.per_round.n ? `${d.per_round.n} ronda${d.per_round.n===1?'':'s'}${d.per_round.trend?` · ${d.per_round.trend.better?'<span class="up">mejorando</span>':d.per_round.trend.worse?'<span class="dn">empeorando</span>':'estable'}`:''}` : '')}
    ${t('gir','Putts por GIR', nf(d.per_gir.avg,2), d.per_gir.gir_holes ? `${d.per_gir.gir_holes} greens con GPS` : 'necesita GPS')}
    ${t('one','1 putt', d.one_putts.pct==null?'—':d.one_putts.pct+'%', d.one_putts.holes ? `${d.one_putts.count} de ${d.one_putts.holes} hoyos` : 'necesita GPS')}
    ${t('three','3 putts', d.three_putts.pct==null?'—':d.three_putts.pct+'%', d.three_putts.holes ? `${d.three_putts.count} de ${d.three_putts.holes} hoyos` : 'necesita GPS')}</div>`
    : `<a class="card qt-empty" href="#/putting"><b>Sin datos de putts todavía</b><span>Cargá los putts al final de cada ronda o jugá con GPS en el iPhone marcando cada putt.</span></a>`);
}
function sPutting(m){ return `<div class="bar"><span class="overline">Putting · ${esc(rlabel(RANGE))}</span></div><div id="putting" data-m="${esc(m||'')}"><div style="padding:60px 0;text-align:center"><span class="spin"></span></div></div>`; }
function asidePutting(m){ return `<div class="mdl-h">Putting</div><a class="mdl-row ${!m?'on':''}" href="#/putting"><span class="mdl-t">Resumen</span></a>` + Object.entries(PM).map(([k,l])=>`<a class="mdl-row ${k===m?'on':''}" href="#/putting/${k}"><span class="mdl-t">${l}</span></a>`).join(''); }
const NOGPS = `<div class="msg">Esto sale de las rondas con GPS: en el iPhone marcá cada putt con el putter. Todavía no hay hoyos con putts marcados en este período.</div>`;
const NONOTES = `<div class="msg">Todavía no cargaste putts. Abrí una ronda en Rondas y completá “Putts” al final.</div>`;
async function loadPutting(m){
  const el = $('#putting'); if (!el) return;
  let d; try { d = PUT = await api(`/api/putting?${rq()}`); } catch(e){ el.innerHTML = `${errBox(e)}`; return; }
  if (!$('#putting')) return;
  const src = `<p class="foot">Datos: ${d.sources.rounds_noted} ${d.sources.rounds_noted === 1 ? 'ronda' : 'rondas'} con putts cargados · ${d.sources.gps_holes} hoyos con GPS (${d.sources.gps_rounds} ${d.sources.gps_rounds === 1 ? 'ronda' : 'rondas'}). ${rlabel(RANGE)}.</p>`;
  const tile = (k, l, v, sub) => `<a class="card stat vx-tap" href="#/putting/${k}"><div class="k">${l}</div><div class="v num">${v}</div><div class="d">${sub}</div></a>`;
  let h;
  if (!m){
    h = `<div class="stitle">Putting</div><div class="grid2">
      ${tile('putts', PM.putts, nf(d.per_round.avg), d.per_round.n ? `${d.per_round.n} rondas · mejor ${d.per_round.best ?? '—'}` : 'sin datos')}
      ${tile('gir', 'Putts por GIR', nf(d.per_gir.avg,2), d.per_gir.gir_holes ? `${d.per_gir.gir_holes} greens en regulación` : 'necesita GPS')}
      ${tile('one', PM.one, d.one_putts.pct==null?'—':d.one_putts.pct+'%', d.one_putts.per_round!=null?`${nf(d.one_putts.per_round)} por ronda`:'necesita GPS')}
      ${tile('three', PM.three, d.three_putts.pct==null?'—':d.three_putts.pct+'%', d.three_putts.per_round!=null?`${nf(d.three_putts.per_round)} por ronda`:'necesita GPS')}
      ${tile('course', PM.course, d.by_course.length, 'canchas con datos')}
      ${tile('distance', 'Primer putt', d.distance.avg_yd==null?'—':nf(d.distance.avg_yd)+' yd', d.distance.holes_yd?`${d.distance.holes_yd} hoyos`:'necesita GPS')}</div>
      ${d.per_round.trend?`<div class="section"><h2>Tendencia</h2></div><a class="card ot-card vx-tap" href="#/putting/putts">${lineChart(d.per_round.series.map(x=>({ v:x.putts, label:dmy(x.date) })), null)}<p class="foot" style="margin:6px 2px 0">Primera mitad ${nf(d.per_round.trend.first_half)} · segunda mitad ${nf(d.per_round.trend.second_half)} putts por ronda.</p></a>`:''}${src}`;
  } else if (m === 'putts'){
    const s = d.per_round.series;
    h = `<div class="stitle">${PM.putts}</div>` + (!s.length ? (d.per_round.source==='gps' ? `<div class="pills"><div class="pill dark"><b class="num">${nf(d.per_round.avg)}</b><span>Por ronda (GPS)</span></div></div>` : NONOTES) :
      `<div class="pills"><div class="pill dark"><b class="num">${nf(d.per_round.avg)}</b><span>Promedio</span></div><div class="pill"><b class="num">${d.per_round.best}</b><span>Mejor</span></div><div class="pill"><b class="num">${s.length}</b><span>Rondas</span></div></div>
      ${d.per_round.trend?`<p class="lede">${d.per_round.trend.better?`<span class="up">Mejorando:</span> `:d.per_round.trend.worse?`<span class="dn">Empeorando:</span> `:''}de ${nf(d.per_round.trend.first_half)} a ${nf(d.per_round.trend.second_half)} putts por ronda (primera vs segunda mitad del período).</p>`:''}
      <div class="card ot-card">${lineChart(s.map(x=>({ v:x.putts, label:dmy(x.date) })), null)}<p class="foot" style="margin:6px 2px 0">La línea punteada gris es tu promedio. Menos es mejor.</p></div>
      <div class="section"><h2>Ronda por ronda</h2></div><div class="list">${s.slice().reverse().map(x=>`<a class="row" href="#/ronda/${x.round_id}"><div class="body"><div class="t">${esc(x.course)}</div><div class="s">${dmy(x.date)}</div></div><div class="score"><b class="num">${x.putts}</b><span>putts</span></div>${ICON.chev}</a>`).join('')}</div>`);
  } else if (m === 'gir'){
    h = `<div class="stitle">${PM.gir}</div>` + (!d.per_gir.gir_holes ? NOGPS : `<div class="pills"><div class="pill dark"><b class="num">${nf(d.per_gir.avg,2)}</b><span>En greens en regulación</span></div><div class="pill"><b class="num">${nf(d.per_gir.non_gir,2)}</b><span>Sin GIR</span></div><div class="pill"><b class="num">${nf(d.per_gir.per_hole_all,2)}</b><span>Todos los hoyos</span></div></div>
      <p class="lede">Putts promedio en los ${d.per_gir.gir_holes} hoyos donde llegaste al green en regulación (golpes antes del green ≤ par − 2). En GIR solés quedar más lejos, por eso suele dar más que en los hoyos sin GIR.</p>`);
  } else if (m === 'one' || m === 'three'){
    const o = m === 'one' ? d.one_putts : d.three_putts, k = m === 'one' ? 'one_putt_pct' : 'three_putt_pct';
    h = `<div class="stitle">${PM[m]}</div>` + (!o.holes ? NOGPS : `<div class="pills"><div class="pill dark"><b class="num">${o.pct}%</b><span>De los hoyos</span></div><div class="pill"><b class="num">${o.count}</b><span>Hoyos</span></div><div class="pill"><b class="num">${nf(o.per_round)}</b><span>Por ronda</span></div></div>
      ${d.distance.holes_yd?`<div class="section"><h2>Según la distancia del primer putt</h2></div><div class="card gg-bars">${d.distance.bins_yd.filter(b=>b.n).map(b=>`<div class="bx-dist"><span class="bx-dl">${b.label}<small class="num">${b.n} hoyos</small></span><span class="bx-bar"><span style="flex:${b[k]||0};background:${m==='one'?'#0F3D2E':'#B4553F'}"></span><span style="flex:${100-(b[k]||0)};background:#F1EEE6"></span></span><b class="num pt-pct">${b[k]}%</b></div>`).join('')}</div>`:''}
      ${m==='three' && o.list.length?`<div class="section"><h2>Últimos 3 putts</h2></div><div class="list">${o.list.map(x=>`<div class="row"><div class="date"><b class="num">${x.hole}</b><span>hoyo</span></div><div class="body"><div class="t">${esc(x.course_label)}</div><div class="s">${dmy(x.date)}${x.first_putt_yd!=null?` · primer putt a ${nf(x.first_putt_yd)} yd`:''}</div></div><div class="score"><b class="num">${x.putts}</b><span>putts</span></div></div>`).join('')}</div>`:''}`);
  } else if (m === 'course'){
    h = `<div class="stitle">${PM.course}</div>` + (!d.by_course.length ? NONOTES : `<div class="list">${d.by_course.map(c=>`<div class="row"><div class="body"><div class="t">${esc(c.course_label)}</div><div class="s">${c.rounds_noted} ronda${c.rounds_noted===1?'':'s'} con putts${c.gps_holes?` · ${nf(c.putts_per_hole,2)} putts por hoyo con GPS · 3 putts ${c.three_putt_pct}%`:''}</div></div><div class="score"><b class="num">${nf(c.avg_putts)}</b><span>putts/ronda</span></div></div>`).join('')}</div>
      ${d.by_course.some(c=>c.gps_holes)?`<p class="foot"><a class="link" href="#/putting/hole">Ver putts hoyo por hoyo</a></p>`:''}`);
  } else if (m === 'hole'){
    const cs = d.by_course.filter(c=>c.by_hole.length);
    h = `<div class="stitle">${PM.hole}</div>` + (!cs.length ? NOGPS : cs.map(c=>{ const mx = Math.max(3, ...c.by_hole.map(x=>x.avg_putts));
      return `<div class="section"><h2>${esc(c.course_label)}</h2><span class="badge">${c.gps_holes} hoyos</span></div><div class="card pt-holes">${c.by_hole.map(x=>`<a class="pt-hr" href="#/hoyo/${encodeURIComponent(c.course_key)}/${x.hole}"><span class="num pt-hn">${x.hole}</span><span class="pt-hb"><span style="width:${x.avg_putts/mx*100}%;background:${x.avg_putts>=2.2?'#B4553F':x.avg_putts<=1.6?'#0F3D2E':'#9DB8A6'}"></span></span><b class="num">${nf(x.avg_putts,2)}</b><small class="num">${x.three_putts?`${x.three_putts}× 3p`:''}</small></a>`).join('')}</div>`; }).join('') + `<p class="foot">Putts promedio por hoyo en tus rondas con GPS. Rojo: 2,2 o más; verde: 1,6 o menos.</p>`);
  } else if (m === 'distance'){
    h = `<div class="stitle">${PM.distance}</div>` + (!d.distance.holes_yd ? NOGPS : `<div class="pills"><div class="pill dark"><b class="num">${nf(d.distance.avg_yd)} yd</b><span>Promedio</span></div><div class="pill"><b class="num">${d.distance.holes_yd}</b><span>Hoyos</span></div><div class="pill"><b class="num">${d.distance.at_pin}</b><span>Con bandera</span></div></div>
      <div class="card"><table class="gg-t pt-bins"><thead><tr><th>Primer putt</th><th>Hoyos</th><th>Putts</th><th>1 putt</th><th>3 putts</th></tr></thead><tbody>${d.distance.bins_yd.map(b=>`<tr><th>${b.label}</th><td class="num">${b.n}</td><td class="num">${nf(b.avg_putts,2)}</td><td class="num">${b.one_putt_pct==null?'—':b.one_putt_pct+'%'}</td><td class="num">${b.three_putt_pct==null?'—':b.three_putt_pct+'%'}</td></tr>`).join('')}</tbody></table></div>`)
      + `<div class="section"><h2>Cómo se mide</h2></div><div class="card qt-how"><p>Es la distancia, en yardas, entre donde marcaste el primer putt con GPS y la <b>bandera de ese día</b>: la que cargó el club, la que marcaste vos con “Estoy en la bandera” o la que marcó otro jugador ese día.</p><p>Si nadie marcó la bandera de ese hoyo se mide al <b>centro del green</b>: con la bandera adelante o atrás puede errar varias yardas.</p></div>`;
  } else h = `<div class="msg err">Métrica desconocida.</div>`;
  el.innerHTML = h + (m ? src : '');
}

/* ---------- MÉTRICAS (t160u, API_v5 §55): tee → green → putts from the player's own GPS rounds. Own page #/metricas (+ /salida, /approach[/bucket]).
   Only real data: a section with nothing marked shows what it will show + how to get it. Distances in yards. ---------- */
const FLAGTXT = { club: 'bandera del club', day_pin: 'bandera de hoy', player_marked: 'bandera marcada', green_center: 'al centro del green' };
const MB = [['150-125','150–125'],['125-100','125–100'],['100-75','100–75'],['75-50','75–50'],['50-30','50–30']];
let MET = null, METR = null;
function metSrc(){ return `<div class="met-src" data-gpsn>${gpsLine()}</div>`; }
const metEmpty = (title, what) => `<div class="card met-empty"><div class="me-t">${title}</div><p>${what}</p><p class="me-how">Jugá una ronda con GPS para ver tus datos.</p><a class="btn sm" href="#/jugar">Empezar ronda con GPS</a></div>`;
const metTile = (h, k, v, s2) => `<a class="card stat vx-tap met-t" href="${h}"><div class="k">${k}</div><div class="v num">${v}</div><div class="d">${s2}</div></a>`;
const sideTxt = t => t === 'left' ? 'izquierda' : t === 'right' ? 'derecha' : '';
const missTxt = { short: 'corto', long: 'largo', left: 'a la izquierda', right: 'a la derecha' };
const outTxt = o => o === 'fairway' ? 'Fairway' : o === 'left' ? 'Izquierda' : o === 'right' ? 'Derecha' : 'Sin marcar';
const dotCls = v => v === true ? 'dfw' : v === false ? 'dms' : 'dun';
/* top-down fairway: x = yd left(−)/right(+) of the tee→green-center line, y = yd from the tee to the next shot */
function driveSvg(T, big){
  const D = T.shots.filter(d => d.lateral_yd != null && d.carry_yd != null && d.carry_yd > 0); if (!D.length) return '';
  const W = 300, H = big ? 340 : 230, sx = 3, lo = Math.max(0, Math.floor((Math.min(...D.map(d => d.carry_yd)) - 15) / 25) * 25), hi = Math.ceil((Math.max(...D.map(d => d.carry_yd)) + 15) / 25) * 25;
  const sy = (H - 40) / Math.max(25, hi - lo), X = x => W / 2 + x * sx, Y = y => H - 22 - (y - lo) * sy, band = T.band_yd;
  const dots = D.map(d => `<circle cx="${X(Math.max(-48, Math.min(48, d.lateral_yd))).toFixed(1)}" cy="${Y(d.carry_yd).toFixed(1)}" r="${big ? 5 : 4.2}" class="${dotCls(d.outcome == null ? null : d.outcome === 'fairway')}"/>`).join('');
  const ticks = []; for (let v = lo; v <= hi; v += 25) ticks.push(`<line x1="0" x2="${W}" y1="${Y(v)}" y2="${Y(v)}" class="tk"/><text x="6" y="${Y(v) - 4}" class="tl">${v}</text>`);
  const mean = T.avg_lateral_yd ?? 0;
  return `<svg class="met-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Dónde quedaron tus ${D.length} drives medidos: en promedio ${nf(Math.abs(mean), 0)} yardas a la ${mean >= 0 ? 'derecha' : 'izquierda'}">
    <rect x="0" y="0" width="${W}" height="${H}" rx="14" class="rough"/><rect x="${X(-band)}" y="0" width="${band * 2 * sx}" height="${H}" class="fw"/>${ticks.join('')}
    <line x1="${W / 2}" x2="${W / 2}" y1="0" y2="${H}" class="ctr"/><line x1="${X(mean)}" x2="${X(mean)}" y1="8" y2="${H - 8}" class="mean"/>${dots}
    <text x="${X(-band) / 2}" y="18" class="lab" text-anchor="middle">Izq.</text><text x="${(X(band) + W) / 2}" y="18" class="lab" text-anchor="middle">Der.</text></svg>`;
}
/* flag at the centre; up = long, down = short, left/right as seen from the shot. Rings every 10 yd. */
function greenSvg(list, big){
  const P = list.filter(a => a.long_yd != null && a.lateral_yd != null), W = big ? 300 : 150, c = W / 2, sc = (W / 2 - 8) / 34;
  const rings = [10, 20, 30].map(r => `<circle cx="${c}" cy="${c}" r="${r * sc}" class="rg"/>`).join('') + (big ? [10, 20, 30].map(r => `<text x="${c + r * sc * .71 + 3}" y="${c - r * sc * .71 - 3}" class="tl">${r}</text>`).join('') : '');
  const dots = P.map(p => { const x = Math.max(-33, Math.min(33, p.lateral_yd)), y = Math.max(-33, Math.min(33, p.long_yd)); return `<circle cx="${(c + x * sc).toFixed(1)}" cy="${(c - y * sc).toFixed(1)}" r="${big ? 5 : 3.4}" class="${dotCls(p.on_green)}"/>`; }).join('');
  return `<svg class="met-svg grn" viewBox="0 0 ${W} ${W}" role="img" aria-label="${P.length} approaches medidos alrededor de la bandera">
    <rect width="${W}" height="${W}" rx="${big ? 14 : 10}" class="rough"/>${rings}
    <line x1="${c}" x2="${c}" y1="${c}" y2="${c - (big ? 22 : 13)}" class="pin"/><path d="M${c} ${c - (big ? 22 : 13)}l${big ? 10 : 6} ${big ? 3.5 : 2.2}l-${big ? 10 : 6} ${big ? 3.5 : 2.2}z" class="flag"/>${dots}
    ${big ? `<text x="${c}" y="16" class="lab" text-anchor="middle">Largo</text><text x="${c}" y="${W - 8}" class="lab" text-anchor="middle">Corto</text><text x="10" y="${c + 4}" class="lab">Izq.</text><text x="${W - 10}" y="${c + 4}" class="lab" text-anchor="end">Der.</text>` : ''}</svg>`;
}
const MTABS = [['tee', 'Tee'], ['hierros', 'Hierros'], ['gir', 'GIR'], ['putting', 'Putting']];
const metTab = sub => ({ '': 'tee', salida: 'tee', approach: 'hierros' })[sub || ''] || (MTABS.some(t => t[0] === sub) ? sub : 'tee');
function sMetricas(sub, b){
  const pr = rounds.filter(inR).length, tab = metTab(sub), bucket = tab === 'hierros' && b, parv = tab === 'gir' && /^par[345]$/.test(b || '');
  if (parv) return `<div class="bar"><span class="overline">Métricas · GIR · ${esc(rlabel(RANGE))}</span></div><div class="stitle">GIR en par ${b.slice(3)}</div>${rangeSeg(pr, 'mrange')}
    <div id="metbody" data-sub="gir" data-b="${esc(b)}"><div style="padding:60px 0;text-align:center"><span class="spin"></span></div></div>`;
  const tabs = `<div class="seg vx-seg met-tabs" role="tablist" aria-label="Métrica">${MTABS.map(([k, l]) => `<a role="tab" aria-selected="${k === tab}" class="${k === tab ? 'on' : ''}" href="#/metricas/${k}">${l}</a>`).join('')}</div>`;
  if (bucket) return `<div class="bar"><span class="overline">Métricas · Hierros · ${esc(rlabel(RANGE))}</span></div><div class="stitle">Approach ${esc((MB.find(x => x[0] === b) || MB[0])[1])} yd</div>${rangeSeg(pr, 'mrange')}
    <div id="metbody" data-sub="hierros" data-b="${esc(b)}"><div style="padding:60px 0;text-align:center"><span class="spin"></span></div></div>`;
  return `<div class="bar"><span class="overline">Tu juego</span></div><div class="stitle">Métricas</div>${tabs}${rangeSeg(pr, 'mrange')}${metSrc()}
    <div id="metbody" data-sub="${tab}"><div style="padding:60px 0;text-align:center"><span class="spin"></span></div></div>`;
}
const pctv = v => v == null ? '—' : v + '%';
const missBars = (m, n) => { const L = [['short', 'Corto'], ['long', 'Largo'], ['left', 'Izquierda'], ['right', 'Derecha']], mx = Math.max(1, ...L.map(([k]) => m[k]));
  return `<div class="met-bars">${L.map(([k, l]) => `<div class="mb-r"><span>${l}</span><i><em style="width:${Math.round(m[k] / mx * 100)}%"></em></i><b class="num">${m[k]}${n ? ` <small>${Math.round(m[k] / n * 100)}%</small>` : ''}</b></div>`).join('')}</div>`; };
async function loadMetricas(sub, b){
  const el = $('#metbody'); if (!el) return; const tab = metTab(sub);
  let M, P;
  try { [M, P] = await Promise.all([api(`/api/game-metrics?${rq()}`), tab === 'putting' && !b ? api(`/api/putting?${rq()}`).catch(() => null) : Promise.resolve(null)]); }
  catch(e){ el.innerHTML = errBox(e); el.querySelector('[data-retry]')?.addEventListener('click', () => loadMetricas(sub, b)); return; }
  if (!$('#metbody')) return; MET = M; METLIVE = { range: RANGE, live: M.live || [] }; paintGps();
  const T = M.tee, A = M.approach, Gi = M.gir, pu = M.putts;
  const play = `<a class="btn ghost met-play" href="#/jugar">Empezar ronda con GPS</a>`;
  if (tab === 'tee') {
    if (M.empty.tee) { el.innerHTML = metEmpty('Tus drives', 'Qué porcentaje de fairways pegás, para qué lado errás, cuánto se abre tu drive y cuánto lo pegás, en los par 4 y par 5.'); return; }
    const tend = T.tendency === 'left' || T.tendency === 'right' ? `Errás más a la <b>${sideTxt(T.tendency)}</b> (<b class="num">${T.tendency === 'left' ? T.left_pct : T.right_pct}%</b> de los drives) que a la ${T.tendency === 'left' ? 'derecha' : 'izquierda'} (<b class="num">${T.tendency === 'left' ? T.right_pct : T.left_pct}%</b>).`
      : T.tendency === 'balanced' ? 'Tus errores se reparten parejo entre izquierda y derecha.' : `Con <b class="num">${T.known}</b> ${T.known === 1 ? 'drive' : 'drives'} todavía no hay una tendencia clara (hacen falta 5).`;
    el.innerHTML = `<div class="pills"><div class="pill dark"><b class="num">${pctv(T.fairway_pct)}</b><span>Fairways</span></div><div class="pill"><b class="num">${T.avg_carry_yd ?? '—'}</b><span>yd promedio</span></div><div class="pill"><b class="num">${T.drives}</b><span>Drives</span></div></div>
      <div class="met-split num" role="img" aria-label="Izquierda ${T.left_pct ?? 0}%, fairway ${T.fairway_pct ?? 0}%, derecha ${T.right_pct ?? 0}%"><span>Izq. <b>${pctv(T.left_pct)}</b></span><span>Fairway <b>${pctv(T.fairway_pct)}</b></span><span>Der. <b>${pctv(T.right_pct)}</b></span></div>
      ${T.measured ? `<div class="card met-card">${driveSvg(T, true)}<p class="foot">Vista desde arriba. Cada punto es un drive, donde marcaste el golpe siguiente. La línea dorada es tu promedio: <b class="num">${nf(Math.abs(T.avg_lateral_yd), 0)} yd</b> a la ${T.avg_lateral_yd >= 0 ? 'derecha' : 'izquierda'}. La franja verde es una referencia de ±${T.band_yd} yd, no el ancho real del fairway.</p></div>` : ''}
      <p class="lede">${tend}</p>
      <div class="section"><h2>Tus drives</h2><span class="badge">${T.drives}</span></div>
      <div class="card list met-list">${T.shots.slice().reverse().map(d => `<div class="row"><div><div class="t">${esc(dmy(d.date))} · Hoyo ${d.hole}</div><div class="s">${esc(d.course)} · par ${d.par}${d.carry_yd ? ` · <span class="num">${d.carry_yd}</span> yd` : ''}</div></div><div class="r"><b>${outTxt(d.outcome)}</b>${d.lateral_yd != null ? `<span class="s num">${nf(Math.abs(d.lateral_yd), 0)} yd ${d.lateral_yd >= 0 ? 'der.' : 'izq.'}</span>` : ''}</div></div>`).join('')}</div>
      <p class="foot">Fairway: lo que marcaste en el tee (izq. / fairway / der.) o, si no marcaste, si el golpe siguiente fue desde el fairway. Distancia y desvío: hasta donde marcaste el golpe siguiente, contra la línea del tee al centro del green; en hoyos con dogleg el desvío puede exagerarse.</p>${play}`;
    return;
  }
  if (tab === 'hierros' && b) {
    const k = MB.some(x => x[0] === b) ? b : '150-125', B = A.find(x => x.id === k), lab = MB.find(x => x[0] === k)[1];
    const bseg = `<div class="seg vx-seg met-bseg" role="tablist" aria-label="Distancia">${MB.map(([kk, l]) => `<a role="tab" aria-selected="${kk === k}" class="${kk === k ? 'on' : ''}" href="#/metricas/hierros/${kk}">${l}</a>`).join('')}</div>`;
    if (!B || !B.shots) { el.innerHTML = bseg + metEmpty(`Approach desde ${lab} yd`, 'Cuántas veces llegás al green desde esta distancia, a cuántas yardas de la bandera quedás y para dónde errás.'); return; }
    const centerN = B.shots - B.pin_marked;
    el.innerHTML = `${bseg}<div class="pills"><div class="pill dark"><b class="num">${pctv(B.green_pct)}</b><span>Al green</span></div><div class="pill"><b class="num">${B.avg_prox_yd == null ? '—' : B.avg_prox_yd + ' yd'}</b><span>A la bandera</span></div><div class="pill"><b class="num">${B.shots}</b><span>Golpes</span></div></div>
      ${B.list.some(a => a.long_yd != null) ? `<div class="card met-card">${greenSvg(B.list, true)}<p class="foot">La bandera está en el centro; arriba es largo, abajo corto; anillos cada 10 yd. Verde: llegó al green. Rojo: lo erraste. Gris: sin dato.${B.top_miss ? ` Cuando errás, errás más <b>${missTxt[B.top_miss]}</b>.` : ''}</p></div>` : ''}
      <div class="section"><h2>Golpes</h2><span class="badge">${B.shots}</span></div>
      <div class="card list met-list">${B.list.slice().reverse().map(a => `<div class="row"><div><div class="t">${esc(dmy(a.date))} · Hoyo ${a.hole}</div><div class="s">${esc(a.course)} · desde <span class="num">${a.from_yd}</span> yd${' · ' + (FLAGTXT[a.flag_source] || 'al centro del green')}</div></div><div class="r"><b>${a.on_green === true ? 'Green' : a.on_green === false ? 'Errado' : '—'}</b>${a.on_green === false && a.miss ? `<span class="s">${missTxt[a.miss]}</span>` : ''}${a.prox_yd != null ? `<span class="s num">${a.prox_yd} yd</span>` : ''}</div></div>`).join('')}</div>
      <p class="foot">Distancia a la bandera: a la bandera de ese día (la que cargó el club, la que marcaste vos o la que marcó otro jugador)${centerN ? `; en <b class="num">${centerN}</b> ${centerN === 1 ? 'golpe' : 'golpes'} no había bandera y se mide al centro del green` : ''}. Cuenta todo golpe que salió a entre 30 y 150 yd de la bandera.</p>`;
    return;
  }
  if (tab === 'hierros') {
    if (M.empty.approach) { el.innerHTML = metEmpty('Tus approaches de 150 a 30 yd', 'Por distancia: cuántas veces llegás al green, a cuántas yardas de la bandera quedás y para dónde errás.'); return; }
    const PX = A.filter(x => x.avg_prox_yd != null), proxN = PX.reduce((n, x) => n + x.prox_n, 0), prox = proxN ? Math.round(PX.reduce((s, x) => s + x.avg_prox_yd * x.prox_n, 0) / proxN) : null;
    const kn = A.reduce((n, x) => n + x.known, 0), on = A.reduce((n, x) => n + (x.green_pct == null ? 0 : Math.round(x.green_pct * x.known / 100)), 0), tot = A.reduce((n, x) => n + x.shots, 0);
    el.innerHTML = `<div class="pills"><div class="pill dark"><b class="num">${pctv(kn ? Math.round(on / kn * 100) : null)}</b><span>Al green</span></div><div class="pill"><b class="num">${prox == null ? '—' : prox + ' yd'}</b><span>A la bandera</span></div><div class="pill"><b class="num">${tot}</b><span>Golpes</span></div></div>
      <div class="met-grid">${MB.map(([k, l]) => { const B = A.find(x => x.id === k); return `<a class="card met-mini vx-tap" href="#/metricas/hierros/${k}">${greenSvg(B.list, false)}<div class="mm-t"><b class="num">${l}</b> yd</div><div class="mm-s num">${B.shots ? `${pctv(B.green_pct)} green · ${B.avg_prox_yd == null ? '—' : B.avg_prox_yd + ' yd'}` : 'Sin golpes todavía'}</div></a>`; }).join('')}</div>
      <p class="foot">Cada golpe que salió a entre 30 y 150 yd de la bandera. Distancia a la bandera de ese día (del club, tuya o de otro jugador); si no había, al centro del green. Tocá una distancia para ver el detalle.</p>${play}`;
    return;
  }
  if (tab === 'gir' && /^par[345]$/.test(b || '')) {
    const pp = +b.slice(3), x = Gi.by_par[pp], hl = (Gi.holes_list || []).filter(h => h.par === pp), ms = hl.filter(h => h.gir === false), mk = ms.filter(h => h.miss);
    const cnt = k => mk.filter(h => h.miss === k).length, miss = { short: cnt('short'), long: cnt('long'), left: cnt('left'), right: cnt('right') };
    const pseg = `<div class="seg vx-seg met-bseg" role="tablist" aria-label="Par">${[3, 4, 5].map(q => `<a role="tab" aria-selected="${q === pp}" class="${q === pp ? 'on' : ''}" href="#/metricas/gir/par${q}">Par ${q}</a>`).join('')}</div>`;
    if (!hl.length) { el.innerHTML = pseg + metEmpty(`Greens en regulación en par ${pp}`, `Qué porcentaje de greens tomás en regulación en los par ${pp}, para dónde errás y hoyo por hoyo.`); return; }
    el.innerHTML = `${pseg}<div class="pills"><div class="pill dark"><b class="num">${pctv(x.gir_pct)}</b><span>GIR par ${pp}</span></div><div class="pill"><b class="num">${hl.length}</b><span>Hoyos</span></div><div class="pill"><b class="num">${ms.length}</b><span>Errados</span></div></div>
      <div class="section"><h2>Dónde errás el green</h2><span class="badge">${ms.length}</span></div>
      ${mk.length ? `<div class="card met-card">${missBars(miss, mk.length)}</div>` : `<p class="foot">${ms.length ? 'Todavía no hay greens errados con el golpe siguiente marcado.' : 'No erraste ningún green en regulación en estos hoyos.'}</p>`}
      <div class="section"><h2>Hoyos</h2><span class="badge">${hl.length}</span></div>
      <div class="card list met-list">${hl.slice().reverse().map(h => `<div class="row"><div><div class="t">Hoyo ${h.hole}</div><div class="s">${esc(dmy(h.date))} · ${esc(h.course)}${h.putts != null ? ` · <span class="num">${h.putts}</span> ${h.putts === 1 ? 'putt' : 'putts'}` : ''}</div></div><div class="r"><b>${h.gir ? 'En regulación' : 'Errado'}</b>${!h.gir && h.miss ? `<span class="s">${missTxt[h.miss]}</span>` : ''}</div></div>`).join('')}</div>
      <p class="foot">GIR: llegaste al green en ${pp - 2} ${pp - 2 === 1 ? 'golpe' : 'golpes'} o menos. Dónde errás: el golpe de regulación contra la bandera (o el centro del green), según dónde marcaste el golpe siguiente.</p>`;
    return;
  }
  if (tab === 'gir') {
    if (M.empty.gir) { el.innerHTML = metEmpty('Greens en regulación', 'Qué porcentaje de greens tomás en regulación, en par 3, 4 y 5, cómo viene tu tendencia y para dónde errás los greens.'); return; }
    const parT = pp => { const x = Gi.by_par[pp]; return `<a class="card stat vx-tap met-t" href="#/metricas/gir/par${pp}"><div class="k">Par ${pp}</div><div class="v num">${pctv(x.gir_pct)}</div><div class="d">${x.holes} ${x.holes === 1 ? 'hoyo' : 'hoyos'}</div></a>`; };
    const tr = Gi.trend ? `<p class="lede">${Math.abs(Gi.trend.delta) < 3 ? 'Venís parejo' : Gi.trend.delta > 0 ? 'Venís mejorando' : 'Venís tomando menos greens'}: <b class="num">${Gi.trend.first_half}%</b> en tus primeras rondas del período y <b class="num">${Gi.trend.second_half}%</b> en las últimas.</p>`
      : `<p class="foot">La tendencia aparece con 4 rondas con GPS (tenés <b class="num">${Gi.rounds.length}</b>).</p>`;
    el.innerHTML = `<div class="pills"><div class="pill dark"><b class="num">${pctv(Gi.gir_pct)}</b><span>GIR</span></div><div class="pill"><b class="num">${Gi.holes}</b><span>Hoyos</span></div><div class="pill"><b class="num">${Gi.rounds.length}</b><span>${Gi.rounds.length === 1 ? 'Ronda' : 'Rondas'}</span></div></div>
      <div class="grid3 met-par">${parT(3)}${parT(4)}${parT(5)}</div>
      <div class="section"><h2>Tendencia</h2></div>${Gi.rounds.length ? `<div class="card list met-list">${Gi.rounds.slice().reverse().map(r => `<div class="row"><div><div class="t">${esc(dmy(r.date))}</div><div class="s"><span class="num">${r.holes}</span> hoyos</div></div><div class="r"><b class="num">${r.gir_pct}%</b></div></div>`).join('')}</div>` : ''}${tr}
      <div class="section"><h2>Dónde errás el green</h2><span class="badge">${Gi.missed}</span></div>
      ${Gi.miss_known ? `<div class="card met-card">${missBars(Gi.miss, Gi.miss_known)}</div>` : `<p class="foot">Todavía no hay greens errados con el golpe siguiente marcado.</p>`}
      <p class="foot">GIR: llegaste al green en par − 2 golpes o menos (lo marca el primer putt o el contador de putts). Dónde errás: el golpe de regulación contra la bandera (o el centro del green), según dónde marcaste el golpe siguiente.</p>${play}`;
    return;
  }
  // Putting
  const real = P && ((P.sources?.rounds_noted || 0) + (P.sources?.gps_holes || 0) > 0);
  if (!real && M.empty.putts) { el.innerHTML = metEmpty('Tus putts', 'Putts por ronda y por hoyo, qué porcentaje de hoyos hacés en 1 y en 3 putts, y desde qué distancia tirás el primer putt.'); return; }
  const fp = pu.first_putt;
  el.innerHTML = `<div class="grid2">${metTile('#/putting/putts', 'Putts por ronda', nf(pu.per_round ?? P?.per_round?.avg ?? pu.per_round_est), pu.per_round != null ? `${pu.rounds.length} ${pu.rounds.length === 1 ? 'ronda' : 'rondas'}` : P?.per_round?.avg != null ? `${P.per_round.n} rondas` : pu.per_round_est != null ? `estimado con ${pu.holes} hoyos` : '')}
      ${metTile('#/putting/hole', 'Putts por hoyo', nf(pu.per_hole, 2), `${pu.holes} ${pu.holes === 1 ? 'hoyo' : 'hoyos'}`)}${metTile('#/putting/one', '1 putt', pctv(pu.one_putt_pct), 'de los hoyos')}${metTile('#/putting/three', '3 putts', pctv(pu.three_putt_pct), 'de los hoyos')}</div>
    <div class="section"><h2>Primer putt</h2>${fp.holes ? `<span class="badge">${fp.holes}</span>` : ''}</div>
    ${fp.holes ? `<a class="card stat vx-tap met-t" href="#/putting/distance"><div class="k">Distancia promedio a la bandera</div><div class="v num">${nf(fp.avg_yd)} yd</div><div class="d">${fp.holes} ${fp.holes === 1 ? 'hoyo' : 'hoyos'} con el primer putt marcado</div></a>
      <div class="card list met-list">${fp.bins.map(x => `<div class="row"><div><div class="t num">${x.label}</div><div class="s"><span class="num">${x.holes}</span> ${x.holes === 1 ? 'hoyo' : 'hoyos'}</div></div><div class="r"><b class="num">${x.avg_putts == null ? '—' : nf(x.avg_putts, 2)}</b><span class="s">putts promedio</span></div></div>`).join('')}</div>
      <p class="foot">Desde donde marcaste el primer putt hasta la bandera que marcaste${fp.at_center ? `; en <b class="num">${fp.at_center}</b> ${fp.at_center === 1 ? 'hoyo' : 'hoyos'} sin bandera marcada, al centro del green` : ''}.</p>`
      : `<p class="foot">Marcá el primer putt con “Marcar putt con GPS” para ver desde qué distancia putteás.</p>`}
    <p class="foot">Putts: los que contás con + / − en cada hoyo; si no contaste, los putts marcados con GPS${P?.sources?.rounds_noted ? ' y los que cargaste después de la ronda' : ''}.</p>${play}`;
}
/* ---------- RONDA CON GPS EN VIVO (t160u, API_v5 §55). #/jugar = elegir cancha, #/jugar/<id> = hoyo por hoyo.
   "Ya pegué" marca el golpe donde estás parado; después del drive se puede marcar izq./centro/der.; en el green se cuentan los putts (+/−)
   y "Estoy en la bandera" guarda dónde estaba la bandera. Nada se inventa: sin GPS no se marca nada. ---------- */
let LV = null;
const hav = (a, b) => { const R = 6371000, t = x => x * Math.PI / 180, dLa = t(b.lat - a.lat), dLo = t(b.lng - a.lng), h = Math.sin(dLa / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const ydOf = m => Math.round(m / 0.9144);
const cid = () => (crypto.randomUUID ? crypto.randomUUID() : 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2));
const geoErr = m => Object.assign(new Error(m), { status: 400 });
/* Fresh fix for a tap: whichever comes first, the next watch update after the tap or a one-shot reading; if both stall, a watch fix from the last 20 s. */
function gpsFix(){ return new Promise((ok, ko) => { if (!navigator.geolocation) return ko(geoErr('Este navegador no tiene GPS.'));
  const t0 = Date.now(); let done = false; const fin = v => { if (done) return; done = true; clearInterval(iv); ok(v); };
  const iv = setInterval(() => { const f = LV?.fix; if (f && f.t > t0 - 1500) fin({ lat: f.lat, lng: f.lng, accuracy_m: f.accuracy_m }); }, 150);
  navigator.geolocation.getCurrentPosition(p => fin({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy_m: Math.round(p.coords.accuracy || 0) }),
    e => { const f = LV?.fix; if (f && Date.now() - f.t < 20000) return fin({ lat: f.lat, lng: f.lng, accuracy_m: f.accuracy_m });
      if (!done) { done = true; clearInterval(iv); ko(geoErr(e.code === 1 ? 'Activá la ubicación para Golflet en el navegador.' : 'No pudimos leer tu ubicación. Probá de nuevo.')); } },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }); }); }
function sJugar(id){ return id
  ? `<div id="jugbody" class="tk-host"><div style="padding:60px 0;text-align:center"><span class="spin"></span></div></div>`
  : `<div class="bar"><span class="overline">Ronda con GPS</span></div><div id="jugbody"><div style="padding:60px 0;text-align:center"><span class="spin"></span></div></div>`; }
async function loadJugar(id){
  const el = $('#jugbody'); if (!el) return;
  if (!id) {
    let C, L; try { [C, L] = await Promise.all([api('/api/gps/courses'), api('/api/live-rounds')]); } catch(e){ el.innerHTML = errBox(e); return; }
    if (!$('#jugbody')) return;
    const today = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10), open = (L.live_rounds || []).find(l => !l.ended_at && String(l.date).slice(0, 10) === today);
    const cs = (C.courses || []).filter(c => c.mine);
    const groups = window.GolfletRules ? window.GolfletRules.coursePickerGroups(cs) : [{ code: 'c', club: '', distance: null, rows: cs.map(c => ({ id: c.course_id, name: c.course_label || c.label })) }];
    el.innerHTML = `<div class="stitle">Empezar ronda</div>
      ${open ? `<a class="card row vx-tap jg-open" href="#/jugar/${esc(open.id)}"><div><div class="t">Seguir la ronda de hoy</div><div class="s">${esc(open.course || open.vm_course || 'Cancha')} · hoyo ${open.current_hole || 1}</div></div>${ICON.chev || '›'}</a>` : ''}
      <p class="lede">Elegí la cancha. En el hoyo confirmás el tee, después la bandera, y cada golpe con ENTER. El mapa se mueve bajo la mira.</p>
      ${cs.length ? groups.map((g, gi) => `<section class="jg-club" id="club-${esc(g.code)}"><div class="jg-club-h"><b>${esc(g.club)}</b>${g.distance ? `<span>${esc(g.distance)}</span>` : ''}</div>${g.rows.map((c, i) => `<label class="row jg-course" id="course-${esc(c.id)}"><input type="radio" name="jgc" value="${esc(c.id)}" ${gi === 0 && i === 0 ? 'checked' : ''}><span class="t">${esc(c.name)}</span><svg class="chev" viewBox="0 0 8 14" width="8" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 1l6 6-6 6"/></svg></label>`).join('')}</section>`).join('')
        : `<div class="msg">No encontramos canchas de tus clubes. Vinculá tu matrícula para elegir la cancha.</div>`}
      <div class="section"><h2>Jugadores en tu grupo</h2></div><div class="seg jg-pl" role="radiogroup" aria-label="Jugadores">${[1, 2, 3, 4].map(n => `<button type="button" data-pl="${n}" aria-pressed="false">${n}</button>`).join('')}</div>
      <p class="foot">Opcional: sirve para avisarte si van atrasados en el hoyo 10.</p>
      <button class="btn" id="jgstart" ${cs.length ? '' : 'disabled'}>Empezar ronda</button><div id="jgerr"></div>`;
    let pl = null; el.querySelectorAll('[data-pl]').forEach(b => b.onclick = () => { pl = +b.dataset.pl; el.querySelectorAll('[data-pl]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }); });
    $('#jgstart').onclick = async () => { const c = el.querySelector('input[name=jgc]:checked')?.value; if (!c) return; $('#jgstart').disabled = true;
      try { const r = await api('/api/live-rounds', { method: 'POST', body: JSON.stringify({ course_id: c, current_hole: 1, ...(pl ? { players: pl } : {}) }) }); location.hash = `#/jugar/${r.live_round.id}`; }
      catch(e){ $('#jgerr').innerHTML = errBox(e); $('#jgstart').disabled = false; } };
    return;
  }
  if (LV?.watch != null) navigator.geolocation.clearWatch(LV.watch);
  try { const [R, H] = await Promise.all([api(`/api/live-rounds/${encodeURIComponent(id)}`), api(`/api/live-rounds/${encodeURIComponent(id)}/holes`)]);
    LV = { id, live: R.live_round, shots: R.shots || [], holes: H.holes, hole: R.live_round.current_hole || 1, putts: {}, pos: null, pace: null, busy: false, torneo: R.torneo || null, plan: null }; }
  catch(e){ el.innerHTML = errBox(e); return; }
  if (!$('#jugbody')) return;
  if (window.GolfletTrack) {
    if (LV?.watch != null && navigator.geolocation) navigator.geolocation.clearWatch(LV.watch);
    window.GolfletTrack.mount(el, { id, live: R.live_round, shots: R.shots || [], holes: H.holes, api, esc, toast, cid, bag: G.bag || [] });
    return;
  }
  drawJugar(); jugPace(); jugWatch();
  try { const PL = await api('/api/plans'); const p = (PL.plans || []).find(x => x.date === String(LV.live.date).slice(0, 10) && x.course && LV.live.course && x.course.toLowerCase() === LV.live.course.toLowerCase());
    if (p && LV.id === id) { LV.plan = p.id; drawJugar(); } } catch(e){}
}
/* t183u Modo torneo (Regla 4.3): padlock + switch; the server decides what is locked (API_v5 §62). */
const LOCK = '<svg class="gp-lk" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7.5" rx="1.6" fill="currentColor"/><path d="M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';
const noDist = () => !!(LV?.torneo?.active && LV.torneo.no_distance_rule);
function jgTorneo(ended){ const T = LV.torneo; if (!T || ended) return '';
  const src = T.source === 'manual' ? (T.on ? 'Activado por vos' : 'Desactivado por vos') : T.auto ? 'Automático: tu reserva es de un torneo' : '';
  return `<div class="card jg-card jg-tn"><div class="jg-tnr"><span class="jg-tnl">${LOCK}<b>Modo torneo</b></span><button type="button" role="switch" class="jg-sw ${T.on ? 'on' : ''}" aria-checked="${T.on}" id="jgtn" aria-label="Modo torneo"><i></i></button></div>
    ${src ? `<p class="foot">${src}${T.source === 'manual' && T.on !== T.auto ? ' · <button type="button" class="linkb" id="jgtnauto">automático</button>' : ''}</p>` : ''}
    ${T.on ? `<label class="jg-nd"><input type="checkbox" id="jgnd" ${T.no_distance_rule ? 'checked' : ''}><span>Regla local: sin medidores de distancia</span></label>
    <details class="jg-tnd"><summary>Qué cambia</summary><p class="foot">Regla 4.3: durante la ronda no se usan ± yd por viento, sugerencias de palo, óvalos con viento ni pendientes del green. Se ven las distancias, las marcas, los obstáculos, el pronóstico y tu estrategia tal como la armaste.${T.no_distance_rule ? ' Con la regla local sin medidores, tampoco se muestran yardas.' : ''}</p></details>` : ''}</div>`; }
function jugWatch(){ if (!navigator.geolocation || LV.watch != null) return;
  LV.watch = navigator.geolocation.watchPosition(p => { if (!LV || !$('#jugbody')) { navigator.geolocation.clearWatch(LV?.watch); return; } LV.pos = { lat: p.coords.latitude, lng: p.coords.longitude }; LV.fix = { ...LV.pos, accuracy_m: Math.round(p.coords.accuracy || 0), t: Date.now() }; if (!LV.live?.ended_at) window.GolfletAuto?.rec(LV.id, LV.fix, LV.hole); drawDist(); }, () => {}, { enableHighAccuracy: true, maximumAge: 5000 }); }
function drawDist(){ const el = $('#jgdist'); if (!el || !LV) return; const H = LV.holes[LV.hole - 1], g = H?.green, p = LV.pos;
  if (noDist()) { el.innerHTML = `<div class="jg-d jg-dl" aria-label="Distancias bloqueadas">${['Adelante', 'Al centro', 'Fondo'].map((k, i) => `<div class="${i === 1 ? 'mid' : ''}"><span>${k}</span><b>${LOCK}</b></div>`).join('')}</div><p class="foot">Regla local: sin medidores de distancia.</p>`; return; }
  if (!g?.center) { el.innerHTML = `<p class="foot">No tenemos el mapa del green de este hoyo: los golpes se marcan igual.</p>`; return; }
  const v = k => g[k] && p ? ydOf(hav(p, g[k])) : '—', dp = H.day_pin;
  el.innerHTML = `${dp ? `<div class="jg-dp"><span class="jg-dp-k">Bandera de hoy</span> · ${esc(dp.zone_label)} · <span class="jg-dp-s">${esc(dp.source_label)}</span></div>` : ''}
    <div class="jg-d num"><div><span>Adelante</span><b>${v('front')}</b></div><div class="mid"><span>${dp ? 'A la bandera' : 'Al centro'}</span><b>${dp ? (p ? ydOf(hav(p, dp)) : '—') : v('center')}</b></div><div><span>Fondo</span><b>${v('back')}</b></div></div>
    <p class="foot">${p ? `Yardas desde donde estás${dp ? '' : ' (todavía no hay bandera de hoy en este hoyo)'}.` : 'Esperando tu ubicación…'}</p>`; }
/* Pin card: first player of the day marks it (+ Adelante/Medio/Fondo, required) for everyone; others can report it once; club pins have no button. */
function jgFlagCard(H, ended){
  const dp = H.day_pin, act = ended ? 'none' : H.pin_action, st = LV.pinUI?.[H.hole] || {};
  const head = dp ? `<div class="jg-fl-ok">Bandera de hoy · ${esc(dp.zone_label)}</div><div class="jg-fl-src">${dp.source === 'club' ? 'Cargada por el club' : dp.by_me ? 'La marcaste vos: la ven todos los que juegan hoy' : 'Cargada por un jugador'}</div>` : '';
  if (st.step === 'zone') return `${head}<div class="jg-fl-t">¿Dónde está la bandera en el green?</div>
    <div class="seg jg-zone" role="radiogroup" aria-label="Dónde está la bandera">${[['front', 'Adelante'], ['middle', 'Medio'], ['back', 'Fondo']].map(([k, l]) => `<button type="button" data-zone="${k}" aria-pressed="${st.zone === k}" class="${st.zone === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <p class="foot">GPS ±${st.fix?.accuracy_m ?? '—'} m. La ven todos los que juegan este hoyo hoy.</p>
    <button type="button" class="btn" id="jgpinsave" ${st.zone ? '' : 'disabled'}>Guardar bandera</button><button type="button" class="btn danger" id="jgpincancel">Cancelar</button>`;
  if (st.step === 'report') return `${head}<div class="jg-fl-t">¿La bandera no está donde dice?</div><p class="foot">Parate al lado de la bandera real y confirmá. Le avisamos a Golflet para que la revise; nadie ve quién reportó.</p>
    <button type="button" class="btn" id="jgrepok">Confirmar reporte</button><button type="button" class="btn danger" id="jgpincancel">Cancelar</button>`;
  if (act === 'mark') return `<div class="jg-fl-t">¿Embocaste? Parate al lado del hoyo y tocá:</div><button type="button" class="btn" id="jgflag">Estoy en la bandera</button>
    <p class="foot">Sos el primero en este hoyo hoy: la bandera que marques la usan todos los que juegan hoy, con yardas exactas.</p>`;
  if (act === 'remark') return `${head}<button type="button" class="btn ghost sm" id="jgflag">Volver a marcar la bandera</button>`;
  if (act === 'report') return `${head}<button type="button" class="btn ghost sm jg-rep" id="jgrep">Bandera mal registrada</button><p class="foot">Tus yardas y tus métricas de approach usan esta bandera.</p>`;
  if (act === 'reported') return `${head}<p class="foot jg-ok">Reportaste esta bandera. Gracias, la vamos a revisar.</p>`;
  return dp ? `${head}<p class="foot">Tus yardas y tus métricas de approach usan esta bandera.</p>` : `<p class="foot">Sin bandera de hoy en este hoyo: medimos al centro del green.</p>`;
}
async function jugPace(){ if (!LV) return; try { const P = await api(`/api/live-rounds/${encodeURIComponent(LV.id)}/pace`); LV.pace = P;
  const el = $('#jgpace'); if (el && P.check?.due && P.message) { el.innerHTML = `<div class="msg jg-pace" role="status"><b>Ritmo de juego</b><br>${esc(P.message)}</div>`;
    if (!P.check.already_alerted_at) api(`/api/live-rounds/${encodeURIComponent(LV.id)}/pace/alerted`, { method: 'POST', body: '{}' }).catch(() => {}); } } catch(e){} }
/* t204u: automatic shot detection (on the phone; review + confirm in #/plan/golpes/<id>). */
function jgAuto(h, ended){ const A = window.GolfletAuto; if (!A) return '';
  const done = A.holesWithTrack(LV.id).filter(n => ended || n < h), en = A.enabled(), nd = noDist() && !ended;
  return `<div class="card jg-card jg-auto"><div class="jg-tnr"><span><b>Detectar golpes</b></span><button type="button" role="switch" class="jg-sw ${en ? 'on' : ''}" aria-checked="${en}" id="jgauto" aria-label="Detectar golpes con el GPS"><i></i></button></div>
    <p class="foot">${en ? 'Con la app abierta y el GPS, detectamos dónde paraste a pegar en cualquier parte del hoyo. El recorrido queda en tu teléfono.' : 'Apagado: solo cuentan tus “Ya pegué”.'}</p>
    ${done.length && !nd ? `<a class="btn ghost sm" href="#/plan/golpes/${esc(LV.id)}?h=${ended ? done[0] : done[done.length - 1]}">Revisar golpes detectados${ended ? '' : ` · hoyo ${done[done.length - 1]}`}</a>` : done.length && nd ? '<p class="foot">Regla local sin medidores: los revisás al terminar la ronda.</p>' : ''}</div>`; }
function drawJugar(msg){
  const el = $('#jugbody'); if (!el || !LV) return;
  const h = LV.hole, H = LV.holes[h - 1] || {}, ss = LV.shots.filter(s => s.hole === h).sort((a, b) => a.shot_number - b.shot_number);
  const isP = s => /^(pt|putter)$/i.test(s.club || '') || s.lie === 'green', full = ss.filter(s => !isP(s)), gpsPutts = ss.filter(isP).length;
  const putts = LV.putts[h] ?? H.putts ?? (gpsPutts || null), tee = full[0] && full[0].shot_number === 1 ? full[0] : null, ended = !!LV.live.ended_at;
  const dirB = (v, l) => `<button type="button" data-dir="${v}" aria-pressed="${tee?.direction === v}" class="${tee?.direction === v ? 'on' : ''}">${l}</button>`;
  el.innerHTML = `<div class="jg-head"><button class="jg-nav" data-hole="${h - 1}" ${h <= 1 ? 'disabled' : ''} aria-label="Hoyo anterior">‹</button>
      <div class="jg-h"><div class="jg-n num">Hoyo ${h}</div><div class="jg-p">${H.par ? `Par ${H.par}` : 'Par sin dato'} · ${esc(LV.live.course || LV.live.vm_course || '')}</div></div>
      <button class="jg-nav" data-hole="${h + 1}" ${h >= 18 ? 'disabled' : ''} aria-label="Hoyo siguiente">›</button></div>
    ${jgTorneo(ended)}
    <div id="jgpace"></div>
    <div class="card jg-card" id="jgdist"></div>
    ${LV.plan ? `<a class="card row vx-tap jg-plan" href="#/plan/${esc(LV.plan)}/hoyo/${h}"><div><div class="t">Tu estrategia · hoyo ${h}</div>${LV.torneo?.active ? `<div class="s">${LOCK} como la armaste</div>` : ''}</div>${ICON.chev || '›'}</a>` : ''}
    ${ended ? `<div class="msg">Esta ronda ya terminó.</div>` : `<button class="btn jg-ya" id="jgya">Ya pegué</button>`}
    <div id="jgmsg" role="status">${msg ? `<p class="foot jg-ok">${msg}</p>` : ''}</div>
    ${ss.length ? `<div class="card list met-list jg-shots">${ss.map(s => `<div class="row"><div><div class="t">Golpe ${s.shot_number}${isP(s) ? ' · putt' : s.shot_number === 1 ? ' · salida' : ''}</div><div class="s">${s.noDist() ? LOCK : s.distance_yd != null ? `<span class="num">${s.distance_yd}</span> yd` : 'Distancia: con el golpe siguiente'}${s.accuracy_m ? ` · GPS ±${s.accuracy_m} m` : ''}</div></div>${s.direction ? `<div class="r"><b>${s.direction === 'left' ? 'Izq.' : s.direction === 'right' ? 'Der.' : 'Centro'}</b></div>` : ''}</div>`).join('')}</div>` : ''}
    ${tee && (H.par == null || H.par >= 4) ? `<div class="section"><h2>¿Cómo salió el drive?</h2></div><div class="seg jg-dir" role="radiogroup" aria-label="Dirección de la salida">${dirB('left', 'Izq.')}${dirB('center', 'Fairway')}${dirB('right', 'Der.')}</div><p class="foot">Opcional. Si no marcás, lo calculamos con tu golpe siguiente.</p>` : ''}
    ${jgAuto(h, ended)}
    <div class="section"><h2>En el green</h2></div>
    <div class="card jg-card jg-putts"><div class="jg-pt"><span>Putts</span><div class="jg-ctr"><button type="button" class="jg-pm" data-pd="-1" aria-label="Un putt menos" ${!putts ? 'disabled' : ''}>−</button><b class="num" id="jgpn" aria-live="polite">${putts ?? '—'}</b><button type="button" class="jg-pm" data-pd="1" aria-label="Un putt más">+</button></div></div>
      <p class="foot">Se guarda al pasar al hoyo siguiente.${gpsPutts ? ` Marcaste ${gpsPutts} ${gpsPutts === 1 ? 'putt' : 'putts'} con GPS.` : ''}</p>
      ${ended ? '' : `<button type="button" class="btn ghost sm" id="jgputt">Marcar putt con GPS</button>`}</div>
    <div class="card jg-card jg-flag" id="jgflagc">${jgFlagCard(H, ended)}</div>
    ${ended ? `<a class="btn" href="#/metricas">Ver mis métricas</a>` : h < 18 ? `<button class="btn" id="jgnext">Hoyo siguiente →</button>` : `<button class="btn" id="jgend">Terminar ronda</button>`}
    ${!ended && h < 18 ? `<button class="btn danger" id="jgend">Terminar ronda</button>` : ''}
    <div id="jgerr"></div>`;
  drawDist();
  const setT = b => lock(null, async () => { const r = await api(`/api/live-rounds/${encodeURIComponent(LV.id)}`, { method: 'PATCH', body: JSON.stringify(b) }); LV.live = r.live_round; LV.torneo = r.torneo; drawJugar(); });
  $('#jgtn') && ($('#jgtn').onclick = () => setT({ tournament_mode: !LV.torneo.on }));
  $('#jgauto') && ($('#jgauto').onclick = () => { window.GolfletAuto.setEnabled(!window.GolfletAuto.enabled()); drawJugar(); });
  $('#jgtnauto') && ($('#jgtnauto').onclick = () => setT({ tournament_mode: null }));
  $('#jgnd') && ($('#jgnd').onchange = ev => setT({ no_distance_rule: ev.target.checked }));
  const err = e => { const x = $('#jgerr'); if (x) x.innerHTML = `<div class="msg err">${esc(errText(e))}</div>`; };
  const lock = async (btn, fn) => { if (LV.busy) return; LV.busy = true; if (btn) btn.disabled = true; try { await fn(); } catch(e){ err(e); if (btn) btn.disabled = false; } finally { LV.busy = false; } };
  const refresh = async () => { const R = await api(`/api/live-rounds/${encodeURIComponent(LV.id)}`); LV.live = R.live_round; LV.shots = R.shots || []; };
  const mark = (extra, okMsg) => lock(extra.btn, async () => { const p = await gpsFix(); LV.pos = { lat: p.lat, lng: p.lng };
    const n = LV.shots.filter(s => s.hole === h).length;
    const r = await api(`/api/live-rounds/${encodeURIComponent(LV.id)}/shots`, { method: 'POST', body: JSON.stringify({ client_id: cid(), hole: h, ...p, ...(n === 0 ? { lie: 'tee' } : {}), ...extra.body }) });
    LV.shots = r.shots || LV.shots; drawJugar(okMsg(n + 1)); });
  $('#jgya') && ($('#jgya').onclick = e => mark({ btn: e.currentTarget, body: {} }, n => `Golpe ${n} marcado.`));
  $('#jgputt') && ($('#jgputt').onclick = e => mark({ btn: e.currentTarget, body: { club: 'Pt', lie: 'green' } }, () => 'Putt marcado.'));
  el.querySelectorAll('[data-dir]').forEach(b => b.onclick = () => lock(null, async () => { const v = tee.direction === b.dataset.dir ? null : b.dataset.dir;
    await api(`/api/shots/${encodeURIComponent(tee.id)}`, { method: 'PATCH', body: JSON.stringify({ direction: v }) }); tee.direction = v; drawJugar(v ? 'Salida guardada.' : ''); }));
  el.querySelectorAll('[data-pd]').forEach(b => b.onclick = () => { const cur = LV.putts[h] ?? H.putts ?? (gpsPutts || 0); LV.putts[h] = Math.max(0, Math.min(10, cur + +b.dataset.pd));
    $('#jgpn').textContent = LV.putts[h]; el.querySelector('[data-pd="-1"]').disabled = !LV.putts[h]; });
  LV.pinUI = LV.pinUI || {};
  const reloadHoles = async () => { const R2 = await api(`/api/live-rounds/${encodeURIComponent(LV.id)}/holes`); LV.holes = R2.holes; };
  const pinErr = async e => { if (e.status === 409 || e.status === 429) { await reloadHoles().catch(() => {}); delete LV.pinUI[h]; drawJugar(); } err(e); };
  $('#jgflag') && ($('#jgflag').onclick = e => lock(e.currentTarget, async () => { const p = await gpsFix(); LV.pinUI[h] = { step: 'zone', fix: p, zone: null }; drawJugar(); }));
  el.querySelectorAll('[data-zone]').forEach(b => b.onclick = () => { LV.pinUI[h].zone = b.dataset.zone; drawJugar(); });
  $('#jgpincancel') && ($('#jgpincancel').onclick = () => { delete LV.pinUI[h]; drawJugar(); });
  $('#jgpinsave') && ($('#jgpinsave').onclick = e => { const st = LV.pinUI[h]; if (!st?.zone) return; e.currentTarget.disabled = true;
    api(`/api/live-rounds/${encodeURIComponent(LV.id)}/holes/${h}/pin`, { method: 'POST', body: JSON.stringify({ ...st.fix, zone: st.zone }) })
      .then(r => { LV.holes[h - 1] = r.hole; delete LV.pinUI[h]; drawJugar('Bandera de hoy guardada: ya la ven todos los que juegan este hoyo.'); }).catch(pinErr); });
  $('#jgrep') && ($('#jgrep').onclick = () => { LV.pinUI[h] = { step: 'report' }; drawJugar(); });
  $('#jgrepok') && ($('#jgrepok').onclick = e => lock(e.currentTarget, async () => { try { const p = await gpsFix();
    const r = await api(`/api/live-rounds/${encodeURIComponent(LV.id)}/holes/${h}/pin-report`, { method: 'POST', body: JSON.stringify(p) }); LV.holes[h - 1] = r.hole; delete LV.pinUI[h]; drawJugar('Reporte enviado. Gracias.'); } catch(x){ await pinErr(x); } }));
  const savePutts = async () => { if (LV.putts[h] == null || LV.putts[h] === H.putts) return;
    const r = await api(`/api/live-rounds/${encodeURIComponent(LV.id)}/holes/${h}`, { method: 'PUT', body: JSON.stringify({ putts: LV.putts[h] }) }); LV.holes[h - 1] = r.hole; delete LV.putts[h]; };
  const go = to => lock(null, async () => { await savePutts(); const r = await api(`/api/live-rounds/${encodeURIComponent(LV.id)}`, { method: 'PATCH', body: JSON.stringify({ current_hole: to }) });
    LV.live = r.live_round; LV.hole = to; drawJugar(); scrollTo(0, 0); jugPace(); });
  el.querySelectorAll('[data-hole]').forEach(b => b.onclick = () => { const to = +b.dataset.hole; if (to >= 1 && to <= 18) go(to); });
  $('#jgnext') && ($('#jgnext').onclick = () => go(h + 1));
  el.querySelectorAll('#jgend').forEach(b => b.onclick = () => lock(b, async () => { await savePutts(); await api(`/api/live-rounds/${encodeURIComponent(LV.id)}`, { method: 'PATCH', body: JSON.stringify({ ended: true }) }); await refresh(); location.hash = '#/metricas'; }));
}
/* ---------- VS JUGADORES DE TU NIVEL (benchmark ±3 de hándicap, anónimo) ---------- */
const BGOOD = '#0F3D2E', BBAD = '#B4553F', BEVEN = '#DCD6C8';
const teeDot = t => `<i class="tee" style="background:${TEE[String(t||'').toUpperCase()]||'#ccc'}"></i>`;
const nivelLink = (ck, tee, m, h) => `#/nivel/${encodeURIComponent(ck)}?${new URLSearchParams({ tee: tee||'', m, ...(h?{ h }:{}) })}`;
let BENCH_TEE = {};
function diffTag(me, bench, unit=''){ if (me==null || bench==null) return ''; const d = Math.round((me-bench)*10)/10, ok = d < -0.05, bad = d > 0.05;
  return `<span class="bx-diff" style="color:${ok?BGOOD:bad?BBAD:'var(--color-ink2)'}">${ok?'▼ ':bad?'▲ ':''}${f1(Math.abs(d))}${unit} ${ok?'mejor':bad?'peor':'igual'}</span>`; }
async function loadBench(){
  const el = $('#bench'); if (!el) return; const ck = el.dataset.ck, tee = BENCH_TEE[ck] || '';
  let b; try { b = await api(`/api/benchmark?${new URLSearchParams({ course: ck, ...(tee?{ tee }:{}) })}`); } catch(e){ el.innerHTML = ''; return; }
  if (!$('#bench') || $('#bench').dataset.ck !== ck) return;
  const tees = b.tees.length > 1 ? `<div class="bx-tees" role="tablist" aria-label="Salida">${b.tees.map(t=>`<button type="button" role="tab" class="vx-chip ${t.tee===b.tee?'on':''}" aria-selected="${t.tee===b.tee}" data-btee="${esc(t.tee)}">${teeDot(t.tee)}${esc(t.tee)}<span class="num">${t.rounds}</span></button>`).join('')}</div>` : '';
  const band = b.band ? `HI ${f1(b.hi)} ± 3` : 'Sin hándicap';
  const head = `<div class="section"><h2>Vs jugadores de tu nivel</h2><span class="badge gold">${band}</span></div>`;
  const tile = (k, l, me, bv) => `<a class="card stat vx-tap bx-tile" href="${nivelLink(ck, b.tee, k)}"><div class="k">${l}</div><div class="bx-row"><div><b class="num bx-me">${f1(me)}</b><small>vos</small></div><div><b class="num bx-bv">${b.sufficient?f1(bv):'—'}</b><small>tu nivel</small></div></div>${b.sufficient?diffTag(me,bv):''}</a>`;
  let body;
  if (!b.sufficient){
    body = `<div class="card bx-insuf"><b>Muestra insuficiente (${b.sample.players} jugador${b.sample.players===1?'':'es'})</b>
      <p>${b.note ? esc(b.note) : `Para comparar hacen falta al menos ${b.min.players} jugadores y ${b.min.rounds} tarjetas de jugadores con hándicap entre ${f1(b.band[0])} y ${f1(b.band[1])} en ${esc(b.course.label)} desde salida ${esc(b.tee)}. Hoy hay ${b.sample.rounds} tarjeta${b.sample.rounds===1?'':'s'}.`}${b.sample.excluded_no_handicap?` ${b.sample.excluded_no_handicap} tarjeta${b.sample.excluded_no_handicap===1?'':'s'} sin hándicap no cuenta${b.sample.excluded_no_handicap===1?'':'n'}.`:''}</p>
      <div class="bx-mine">Tu promedio acá: <b class="num">${f1(b.me.avg_gross)}</b> gross · <b class="num">${f1(b.me.avg_net)}</b> neto en ${b.me.rounds} tarjeta${b.me.rounds===1?'':'s'}</div></div>`;
  } else {
    const bh = Object.fromEntries(b.bench.holes.map(h=>[h.hole,h]));
    const cells = b.me.holes.map(h => { const x = bh[h.hole]; const d = x && h.avg_to_par!=null && x.avg_to_par!=null ? Math.round((h.avg_to_par - x.avg_to_par)*10)/10 : null;   // colour follows the shown (1-decimal) value: ±0,1 = parecido
      const col = d==null ? '#F1EEE6' : d <= -0.2 ? BGOOD : d >= 0.2 ? BBAD : BEVEN, ink = d==null || Math.abs(d)<0.2 ? 'var(--color-ink)' : '#F7F5F0';
      return `<a class="bx-hc" href="${nivelLink(ck, b.tee, 'hole', h.hole)}" style="background:${col};color:${ink}" aria-label="Hoyo ${h.hole}"><b class="num">${h.hole}</b><small class="num">${d==null?'—':(d>0?'+':d<0?'−':'±')+f1(Math.abs(d))}</small></a>`; }).join('');
    body = `<div class="grid2">${tile('gross','Gross promedio',b.me.avg_gross,b.bench.avg_gross)}${tile('net','Neto promedio',b.me.avg_net,b.bench.avg_net)}</div>
      <div class="card bx-holes"><div class="bx-hh"><span>Por hoyo: tus golpes sobre el par menos los de tu nivel</span></div><div class="bx-grid">${cells}</div>
      <div class="gg-key"><span><i style="background:${BGOOD}"></i>mejor que tu nivel</span><span><i style="background:${BEVEN}"></i>parecido (±0,1)</span><span><i style="background:${BBAD}"></i>peor</span></div></div>`;
  }
  el.innerHTML = head + tees + body + `<p class="foot">Anónimo: ${b.sample.players} jugador${b.sample.players===1?'':'es'} y ${b.sample.rounds} tarjeta${b.sample.rounds===1?'':'s'} de otros jugadores con hándicap ${b.band?`entre ${f1(b.band[0])} y ${f1(b.band[1])}`:''} al momento de cada ronda, misma cancha y salida. Vos no contás.${b.sample.excluded_no_handicap&&b.sufficient?` ${b.sample.excluded_no_handicap} tarjeta${b.sample.excluded_no_handicap===1?'':'s'} sin hándicap no cuenta${b.sample.excluded_no_handicap===1?'':'n'}.`:''}</p>`;
  el.querySelectorAll('[data-btee]').forEach(x => x.onclick = () => { BENCH_TEE[ck] = x.dataset.btee; loadBench(); });
}
function sNivel(ck){ return `<div class="bar"><span class="overline">Vs jugadores de tu nivel</span></div><div id="nivel" data-ck="${esc(ck)}"><div style="padding:60px 0;text-align:center"><span class="spin"></span></div></div>`; }
async function loadNivel(ck){
  const el = $('#nivel'); if (!el) return; const qs = new URLSearchParams(location.hash.split('?')[1]||''), m = qs.get('m')||'gross', h = qs.get('h'), tee = qs.get('tee')||'';
  let b; try { b = await api(`/api/benchmark?${new URLSearchParams({ course: ck, ...(tee?{ tee }:{}), metric: m, ...(h?{ hole: h }:{}) })}`); } catch(e){ el.innerHTML = `${errBox(e)}`; return; }
  const title = m==='hole' ? `Hoyo ${h}` : m==='net' ? 'Neto promedio' : 'Gross promedio';
  const sub = `<div class="chips"><span class="badge">${esc(b.course.label)}</span><span class="badge">${teeDot(b.tee)} Salida ${esc(b.tee)}</span>${b.band?`<span class="badge gold">HI ${f1(b.hi)} ± 3</span>`:''}</div>`;
  const tabs = `<div class="seg vx-seg">${[['gross','Gross'],['net','Neto']].map(([k,l])=>`<a class="${k===m?'on':''}" href="${nivelLink(ck,b.tee,k)}">${l}</a>`).join('')}${m==='hole'?`<a class="on" href="${location.hash}">Hoyo ${h}</a>`:''}</div>`;
  if (!b.sufficient){ el.innerHTML = `<div class="stitle">${title}</div>${sub}<div class="card bx-insuf" style="margin-top:14px"><b>Muestra insuficiente (${b.sample.players} jugador${b.sample.players===1?'':'es'})</b><p>Hacen falta al menos ${b.min.players} jugadores y ${b.min.rounds} tarjetas para mostrar la distribución.</p></div>`; return; }
  const D = b.distribution; let html;
  if (m==='hole'){
    const K = [['eagle_or_better','Águila o mejor','#8C6A2F'],['birdie','Birdie','#C8A86A'],['par','Par','#0F3D2E'],['bogey','Bogey','#9DB8A6'],['double','Doble','#DCD6C8'],['triple_or_worse','Triple o peor',BBAD]];
    const row = (lab, o) => `<div class="bx-dist"><span class="bx-dl">${lab}<small class="num">${o.n} ${o.n===1?'vez':'veces'}</small></span><span class="bx-bar">${K.map(([k,,c])=>o[k]?`<span style="flex:${o[k]};background:${c}" title="${k}"></span>`:'').join('')||'<span style="flex:1;background:#F1EEE6"></span>'}</span></div>`;
    const pct = (o,k) => o.n ? Math.round(o[k]/o.n*100) : 0;
    html = `<div class="pills"><div class="pill dark"><b class="num">${D.me_avg_to_par==null?'—':(D.me_avg_to_par>0?'+':'')+f2(D.me_avg_to_par)}</b><span>Vos vs par</span></div><div class="pill"><b class="num">${D.bench_avg_to_par==null?'—':(D.bench_avg_to_par>0?'+':'')+f2(D.bench_avg_to_par)}</b><span>Tu nivel vs par</span></div><div class="pill"><b class="num">Par ${D.par??'—'}</b><span>Hoyo ${D.hole}</span></div></div>
      ${diffTag(D.me_avg_to_par, D.bench_avg_to_par)}
      <div class="section"><h2>Cómo terminan</h2></div><div class="card gg-bars">${row('Vos', D.me)}${row('Tu nivel', D.bench)}
      <div class="gg-key">${K.map(([,l,c])=>`<span><i style="background:${c}"></i>${l}</span>`).join('')}</div></div>
      <div class="card"><table class="gg-t bx-tab"><thead><tr><th></th><th>Vos</th><th>Tu nivel</th></tr></thead><tbody>${K.map(([k,l])=>`<tr><th>${l}</th><td class="num">${pct(D.me,k)}%</td><td class="num">${pct(D.bench,k)}%</td></tr>`).join('')}</tbody></table></div>`;
  } else {
    const bins = D.bins, mx = Math.max(...bins.map(x=>x.count),1), me = D.me_avg, W = 360, H = 170, pb = 24, pt = 14, bw = (W-20)/bins.length;
    const lo = bins[0].from, hi = bins.at(-1).to+1, X = v => 10 + (v-lo)/(hi-lo)*(W-20);
    const bars = bins.map((x,i)=>`<rect x="${10+i*bw+2}" y="${pt+(H-pt-pb)*(1-x.count/mx)}" width="${bw-4}" height="${(H-pt-pb)*x.count/mx}" rx="3" fill="#9DB8A6"><title>${x.from}–${x.to}: ${x.count} tarjetas</title></rect><text x="${10+i*bw+bw/2}" y="${H-8}" text-anchor="middle" font-size="9.5" fill="${C.ink3}" font-family="Geist">${x.from}</text>`).join('');
    const mk = me!=null ? `<line x1="${X(me)}" x2="${X(me)}" y1="${pt-4}" y2="${H-pb}" stroke="#C8A86A" stroke-width="2.5"/><text x="${X(me)}" y="${pt-5}" text-anchor="middle" font-size="10.5" font-weight="600" fill="#8C6A2F" font-family="Geist">vos ${f1(me)}</text>` : '';
    html = `<div class="pills"><div class="pill dark"><b class="num">${f1(m==='net'?b.me.avg_net:b.me.avg_gross)}</b><span>Vos</span></div><div class="pill"><b class="num">${f1(m==='net'?b.bench.avg_net:b.bench.avg_gross)}</b><span>Tu nivel</span></div><div class="pill"><b class="num">${D.better_than_pct??'—'}%</b><span>Mejor que</span></div></div>
      ${diffTag(m==='net'?b.me.avg_net:b.me.avg_gross, m==='net'?b.bench.avg_net:b.bench.avg_gross)}
      <div class="section"><h2>Distribución de tu nivel</h2><span class="badge">${b.sample.rounds} tarjetas</span></div>
      <div class="card ot-card"><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Distribución de ${m==='net'?'neto':'gross'} de jugadores de tu nivel">${bars}${mk}</svg>
      <p class="foot" style="margin:6px 2px 0">Cada barra junta 2 golpes. La línea dorada es tu promedio: tu promedio es mejor que el ${D.better_than_pct}% de las tarjetas de tu nivel. Menos es mejor.</p></div>`;
  }
  el.innerHTML = `<div class="stitle">${title}</div>${sub}${tabs}${html}<p class="foot">Anónimo: ${b.sample.players} jugadores y ${b.sample.rounds} tarjetas con hándicap entre ${f1(b.band[0])} y ${f1(b.band[1])} al momento de cada ronda. ${b.sample.excluded_no_handicap?`${b.sample.excluded_no_handicap} sin hándicap no cuentan.`:''}</p>`;
}
async function loadStratCard(){
  const el = $('#stratcard'); if (!el) return; const ck = el.dataset.ck, gen = VIEW_GEN;
  el.innerHTML = '<div class="card"><div style="padding:18px 0;text-align:center"><span class="spin"></span></div></div>';
  let st; try { st = await stratFor(ck); } catch (e) { const box = $('#stratcard'); if (!box || gen !== VIEW_GEN || box.dataset.ck !== ck) return; box.innerHTML = errBox(e, 'la estrategia'); return; }
  const box = $('#stratcard'); if (!box || gen !== VIEW_GEN || box.dataset.ck !== ck) return;
  if (!st.holes.length && !st.overview) { box.innerHTML = '<div class="msg">Todavía no hay un plan publicado para esta cancha.</div>'; return; }
  box.innerHTML = `<a class="card vx-stratc" href="#/estrategia/${encodeURIComponent(ck)}"><div class="overline">Cómo jugar la cancha</div>
    ${st.overview?`<p>${esc(st.overview.length>150?st.overview.slice(0,150).replace(/\s+\S*$/,'')+'…':st.overview)}</p>`:''}<div class="vx-stratc-f"><b class="num">${st.holes.length}</b> de 18 hoyos con plan ${ICON.chev}</div></a>`;
}
function sEstrategia(ck){ return `<div class="bar"><span class="overline">Cómo jugar la cancha</span><button class="close" data-close>${ICON.x}</button></div><div id="stratbody" data-ck="${esc(ck)}"><div style="padding:60px 0;text-align:center"><span class="spin"></span></div></div>`; }
async function loadEstrategia(ck){
  const el = $('#stratbody'); if (!el) return;
  const gen = VIEW_GEN;
  let st; try { st = await stratFor(ck); } catch(e){
    const stale = $('#stratbody'); if (!stale || gen !== VIEW_GEN || stale.dataset.ck !== ck) return;
    stale.innerHTML = `${errBox(e)}`; return;
  }
  const box = $('#stratbody'); if (!box || gen !== VIEW_GEN || box.dataset.ck !== ck) return;
  const c = course(ck);
  const by = n => st.holes.find(x => x.hole === n);
  box.innerHTML = `<div class="stitle">${esc(c?.course||'Cancha')}</div><div style="font-size:calc(13px*var(--ts,1));color:var(--color-ink3);margin-top:2px">${esc(c?.club_name||'')}${c?.par?` · Par ${c.par}`:''}</div>
    ${st.overview?`<div class="card" style="margin-top:14px"><p class="vx-how-p" style="margin:0">${esc(st.overview)}</p></div>`:''}
    <div class="section"><h2>Hoyo por hoyo</h2><span class="badge">${st.holes.length}/18</span></div>
    <div class="list">${((c?.holes && c.holes.length) ? c.holes : st.holes).map(h => { const hs = by(h.hole);
      return `<a class="row" href="#/hoyo/${encodeURIComponent(ck)}/${h.hole}"><div class="date"><b class="num">${h.hole}</b><span>Par ${h.par??'—'}</span></div><div class="body"><div class="t">${hs?esc(hs.plan_title||'Plan cargado'):'<span style="color:var(--color-ink3)">Sin estrategia todavía</span>'}</div>${hs?`<div class="s">${[hs.tee_club&&'Salida: '+hs.tee_club, hs.hazards.length&&hs.hazards.length+' peligros'].filter(Boolean).map(esc).join(' · ')}</div>`:''}</div>${ICON.chev}</a>`; }).join('')}</div>`;
}


/* ---------- MI BOLSA ---------- */
function vBolsa(){
  const bag = G.bag, filled = bag.filter(b=>b.carry||b.total).length;
  return `<div class="top"><span class="overline">Mis distancias</span></div>
  <h1 class="ltitle">Mi bolsa</h1>
  <div class="section"><h2>Mis palos</h2><span class="eq-adds"><a class="badge" href="#/equipo/juego">Configurar juego de hierros</a><a class="badge" href="#/equipo/nuevo">+ Agregar palo</a></span></div><div id="equip"><div style="padding:20px 0;text-align:center"><span class="spin"></span></div></div>
  <a class="card bagball" id="bagball" href="#/pelota"><span class="gi">${BALL_IC}</span><span class="bb-t">Pelota<small>&nbsp;</small></span>${ICON.chev}</a>
  <div class="section"><h2>Distancias</h2><span class="badge">yardas</span></div>
  <div class="card bagsum"><p class="bagsum-n num" id="bagcount">${filled} de ${bag.length}</p><div id="bagmsg" class="bagsum-d">${filled?'Palos con una distancia que cargaste vos.':'Todavía sin distancias. Cargá carry y total en yardas para que Golflet te sugiera el tiro en cada hoyo.'}</div><p class="bagsum-note">Lo que escribís y los tiros medidos por GPS se cuentan aparte. Un guion es un dato que no cargaste.</p></div>
  <div class="bagtable"><div class="baghdr" aria-hidden="true"><span>Palo</span><span>Carry</span><span>Total</span></div>
  <div class="list">${bag.map((b,i)=>{ const putt = /^(pt|putter)$/i.test(String(b.club||'').trim()); if (putt) return `<div class="bagrow bag-putt" data-club="${esc(b.club)}"><span class="n">${esc(b.club)}<small class="bsrc"></small></span><span class="bag-nodist">Sin distancia de vuelo</span></div>`; return `<div class="bagrow" data-club="${esc(b.club)}"><span class="n">${esc(b.club)}<small class="bsrc"></small></span><label class="bagyd"><input inputmode="numeric" data-i="${i}" data-k="carry" value="${b.carry??''}" placeholder="—" aria-label="Carry de ${esc(b.club)} en yardas${b.carry==null?', sin dato':''}"><span>yd</span></label><label class="bagyd"><input inputmode="numeric" data-i="${i}" data-k="total" value="${b.total??''}" placeholder="—" aria-label="Total de ${esc(b.club)} en yardas${b.total==null?', sin dato':''}"><span>yd</span></label><div class="bgps" hidden></div></div>`; }).join('')}</div></div>
  <p class="foot" id="bagsaved">Tu distancia es la que manda. Al lado, lo que mediste con GPS (total, no carry). Yardas, sin datos inventados.</p>
  <div class="section"><h2>Distancias por palo</h2><span class="badge gold">GPS</span></div><div id="cdist"><div style="padding:20px 0;text-align:center"><span class="spin"></span></div></div><div id="gpsrounds"></div>`;
}

/* t105u: source + n under each club (manual wins until 5 GPS-measured shots) */
async function loadBagSources(){
  try { const d = await api('/api/bag/distances'); const norm = x => String(x||'').trim().toLowerCase();
    const find = name => d.clubs.find(x => norm(x.club) === norm(name) || norm(x.code) === norm(name));
    document.querySelectorAll('.bagrow[data-club]').forEach(row => { const c = find(row.dataset.club), el = row.querySelector('.bsrc'), gb = row.querySelector('.bgps'); if (!el || !gb) return;
      const b = G.bag.find(x => norm(x.club) === norm(row.dataset.club)), man = !!(b && (b.carry || b.total)), g = c?.gps;
      el.textContent = man ? 'Definida por vos' : g ? 'Sin distancia cargada · hay tiros GPS' : ''; el.className = 'bsrc' + (man ? ' def' : g ? ' auto' : '');
      if (!g) { gb.hidden = true; gb.innerHTML = ''; return; }   /* t126u: GPS block only when there are measured shots */
      const href = f => `#/palo/${encodeURIComponent(c.code)}/${f}`;
      gb.innerHTML = `<span class="bg-l">GPS</span><a href="${href('promedio')}"><span>Prom.</span><b class="num">${g.avg_yd} yd</b></a><a href="${href('tiros')}"><b class="num">${g.n}</b><span>${g.n === 1 ? 'tiro' : 'tiros'}</span></a>${g.used >= 3 ? `<a href="${href('dispersion')}"><span>Rango</span><b class="num">${g.range_yd[0]}–${g.range_yd[1]}</b><span class="num">±${g.spread_yd}</span></a>` : ''}`;
      gb.hidden = false; });
    /* t75u/t126u header: a club has distance if it has a typed one OR GPS-measured shots */
    const bag = G.bag, st = bag.map(b => ({ man: !!(b.carry || b.total), gps: !!find(b.club)?.gps }));
    const man = st.filter(x => x.man).length, gps = st.filter(x => x.gps).length, tot = st.filter(x => x.man || x.gps).length;
    const cnt = $('#bagcount'), msg = $('#bagmsg'); if (!cnt || !msg) return;
    cnt.textContent = `${tot} de ${bag.length}`;
    msg.replaceChildren();
    if (!tot) msg.textContent = 'Todavía sin distancias. Cargá carry y total en yardas, o jugá con la app midiendo tiros, para que Golflet te sugiera el tiro en cada hoyo.';
    else {
      if (man) { const s = document.createElement('span'); s.textContent = `${man} ${man === 1 ? 'definida' : 'definidas'} por vos`; msg.appendChild(s); }
      if (gps) { const s = document.createElement('span'); s.className = 'gps'; s.textContent = `${gps} ${gps === 1 ? 'palo con tiros medidos por GPS' : 'palos con tiros medidos por GPS'}`; msg.appendChild(s); }
    }
  } catch(e){}
}
/* ---------- IMPACTO EN EL HÁNDICAP (por período; /api/metrics/hcp-impact) ---------- */
const sgn1 = v => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + f1(Math.abs(v));
const impTxt = h => h?.delta == null ? '—' : `${h.delta < 0 ? '↓' : h.delta > 0 ? '↑' : ''}${f1(Math.abs(h.delta))}`;
const impCls = h => h?.delta == null ? '' : h.delta < 0 ? 'dn' : h.delta > 0 ? 'up' : 'flat';
/* t125u: linked profesores on the Inicio HI card (max 3 + N; tap → profesor page, or Tu cuenta › Profesores if several) */
async function loadHiProfs(){
  /* t155u/t156u: 1 profesor → single avatar (→ its page); 2+ → stacked avatars + "N profes" (→ Mis profesores); none → empty celeste circle "Agregar profesor" (→ add/search page). Celeste ring = profesores, gold = groups. */
  const el = $('#hiprofs'); if (!el) return;
  const av = p => `<span class="hp-av">${p.photo_url ? `<img src="${esc(p.photo_url)}" alt="">` : esc(compInit(p.name))}${p.verified ? '<i class="hp-v" aria-hidden="true"><svg viewBox="0 0 12 12"><path d="M3.3 6.2l1.7 1.6 3.4-3.6" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></i>' : ''}</span>`;
  try { const ps = (await api('/api/profesores')).profesores; if (!$('#hiprofs')) return; PROFS = ps;
    if (!ps.length) {
      el.innerHTML = `<a class="hg-link hp-add" href="#/profesores/buscar" aria-label="Agregar profesor"><span class="hp-av hp-empty" aria-hidden="true"><svg viewBox="0 0 16 16"><circle cx="6.4" cy="5.4" r="2.4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2.2 13c.6-2.3 2.2-3.5 4.2-3.5s3.6 1.2 4.2 3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M12.6 4.2v4M10.6 6.2h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></span><span class="hg-n">Agregar profesor</span></a>`;
    } else if (ps.length === 1) {
      el.innerHTML = `<a class="hg-link" href="#/profesor/${encodeURIComponent(ps[0].profesor_id)}" aria-label="Tu profesor: ${esc(ps[0].name)}">${av(ps[0])}</a>`;
    } else {
      el.innerHTML = `<a class="hg-link" href="#/profesores" aria-label="Tus profesores: ${ps.length}">${ps.slice(0, 3).map(av).join('')}<span class="hg-n num">${ps.length} profes</span></a>`;
    }
    el.hidden = false; sizeHiAvs();
  } catch(e){ el.hidden = true; }
}
/* t147u/t148u/t149u: the player's groups on the HI card, as ONE element (stacked photos/initials + count) → #/amigos (list) → #/grupo/:id.
   No groups → gold "+" circle "Crear grupo" → #/amigos/nuevo. */
function sizeHiAvs(){ const a = document.querySelector('.hero .hi-avs'), h = a?.closest('.hero'); if (!h) return; h.classList.remove('avs-below');
  /* t155u: profesor on top, groups below, right-aligned. If the stack would touch the label's longest word or the big HI number, it moves to its own row above. */
  const w = [...a.children].some(c => !c.hidden) ? a.offsetWidth + 14 : 0; h.style.setProperty('--avw', w + 'px'); if (!w) return;
  const ov = h.querySelector('.vx-hlink .overline');
  if (ov) { const probe = document.createElement('span'); probe.textContent = 'HANDICAP'; probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap'; ov.appendChild(probe); const need = probe.offsetWidth; probe.remove(); if (ov.clientWidth - w < need) { h.classList.add('avs-below'); return; } }
  const big = h.querySelector('.big'); if (!big) return; const rg = document.createRange(); rg.selectNodeContents(big); const b = rg.getBoundingClientRect(), r = a.getBoundingClientRect();
  if (r.left < b.right + 10 && r.bottom > b.top + 6) h.classList.add('avs-below'); }
addEventListener('resize', () => sizeHiAvs());
async function loadHiGroups(){
  const el = $('#higroups'); if (!el) return;
  try { const gs = (await api('/api/groups')).groups || []; if (!$('#higroups')) return;
    if (!gs.length) { el.innerHTML = `<a class="hg-link hg-new" href="#/amigos/nuevo" aria-label="Crear grupo"><span class="hp-av hg-plus" aria-hidden="true"><svg viewBox="0 0 12 12"><path d="M6 2.2v7.6M2.2 6h7.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></span><span class="hg-n">Crear grupo</span></a>`; el.hidden = false; return; }
    const show = gs.slice(0, 3);
    el.innerHTML = `<a class="hg-link" href="#/amigos" aria-label="Tus grupos: ${gs.length}">${show.map(g => `<span class="hp-av">${g.photo_url ? `<img src="${esc(g.photo_url)}" alt="">` : esc((g.name || '?').trim().slice(0, 1).toUpperCase())}</span>`).join('')}<span class="hg-n num">${gs.length} grupo${gs.length === 1 ? '' : 's'}</span></a>`;
    el.hidden = false;
  } catch(e){ el.hidden = true; } finally { sizeHiAvs(); }
}
async function loadHcpImp(){
  const a = $('#hcpimp'); if (!a) return;
  try { const { hcp_impact: h } = await api(`/api/metrics/hcp-impact?range=${RANGE}`); if (!$('#hcpimp')) return;
    a.innerHTML = `Impacto HCP${h.delta != null && h.estimated ? ' <small>est.</small>' : ''}<b class="num ${impCls(h)}">${impTxt(h)}</b>`;
    a.setAttribute('aria-label', h.delta == null ? 'Impacto en el hándicap: sin historia suficiente' : `Impacto en el hándicap: ${h.delta < 0 ? 'bajó' : h.delta > 0 ? 'subió' : 'sin cambio'} ${f1(Math.abs(h.delta))}${h.estimated ? ', estimado' : ''}`);
  } catch(e){ a.querySelector('b').textContent = '—'; }
}
function sImpacto(){ return `<div class="bar"><span class="overline">Handicap Index</span></div><div id="impacto"><div style="padding:60px 0;text-align:center"><span class="spin"></span></div></div>`; }
async function loadImpacto(){
  const el = $('#impacto'); if (!el) return;
  const qs = new URLSearchParams(location.hash.split('?')[1] || ''), rg = RKEYS.includes(qs.get('range')) ? qs.get('range') : RANGE;
  if (rg !== RANGE) setRange(rg);
  try {
    const { hcp_impact: h } = await api(`/api/metrics/hcp-impact?range=${rg}`); if (!$('#impacto')) return;
    const dt = d => d ? dmy(d) : '—', est = h.estimated && h.delta != null;
    const chip = c => c.entered_best8 == null ? '<span class="hi-chip">Sin 20 tarjetas</span>' : c.entered_best8 ? '<span class="hi-chip in">Entró en las 8</span>' : '<span class="hi-chip">No entró</span>';
    el.innerHTML = `<div class="stitle">Impacto en el hándicap</div>${rangeSeg(h.cards_in_range, 'irange')}
      <div class="hi-hero"><div class="hi-col"><span>${h.since && !h.start_is_first_record ? 'Al empezar' : 'Primer registro'}</span><b class="num">${h.start ? f1(h.start.index) : '—'}</b><small>${h.start ? dt(h.start.date) : 'Sin historia suficiente'}</small></div>
        <div class="hi-arrow ${impCls(h)}"><b class="num">${impTxt(h)}</b><small>${h.delta == null ? '' : h.delta < 0 ? 'bajó' : h.delta > 0 ? 'subió' : 'igual'}</small></div>
        <div class="hi-col"><span>Ahora</span><b class="num">${h.now ? f1(h.now.index) : '—'}</b><small>${h.now ? dt(h.now.date) : ''}</small></div></div>
      <p class="foot">${h.source === 'official' ? 'Índice oficial que publica tu club.' : h.source === 'estimated' ? 'Estimado: mejores 8 de las últimas 20 con los diferenciales que calcula Golflet. El oficial no cubre el inicio del período.' : 'Hacen falta 20 tarjetas con diferencial (o el índice oficial al inicio del período) para medir el cambio.'}</p>
      <div class="grid4 hi-stats">
        <div class="card mini stat"><div class="k">Tarjetas</div><div class="v num">${h.cards_in_range}</div></div>
        <div class="card mini stat"><div class="k">Entraron en las 8</div><div class="v num">${h.entered_best8 ?? '—'}</div><div class="d">${h.entered_avg_differential != null ? 'dif. prom. ' + f1(h.entered_avg_differential) : ''}</div></div>
        <div class="card mini stat"><div class="k">Vs índice previo</div><div class="v num ${h.avg_vs_prev_index == null ? '' : h.avg_vs_prev_index < 0 ? 'dn' : h.avg_vs_prev_index > 0 ? 'up' : ''}">${sgn1(h.avg_vs_prev_index)}</div><div class="d">diferencial − índice</div></div>
        <div class="card mini stat"><div class="k">Cuentan hoy</div><div class="v num">${h.counts_now ?? '—'}</div><div class="d">de las mejores 8</div></div></div>
      ${vidSlot('impacto_hcp')}
      <div class="section"><h2>Tarjetas del período</h2><span class="badge">estimado</span></div>
      ${h.cards.length ? yrList(h.cards, c => c.date, c => `<a class="row hi-row" href="#/ronda/${esc(c.round_id)}">${dateBlock(c.date)}<div class="body"><div class="t">${esc(c.course_label || 'Ronda')} · ${c.gross ?? '—'}</div><div class="s">Índice previo ${c.prev_index == null ? '—' : f1(c.prev_index) + (c.prev_index_estimated ? ' est.' : '')}${c.counts_now ? ' · <b class="hi-now">cuenta hoy</b>' : ''}</div>${chip(c)}</div><div class="hi-dif"><b class="num">${f1(c.differential)}</b><small class="num ${c.vs_prev == null ? '' : c.vs_prev < 0 ? 'dn' : c.vs_prev > 0 ? 'up' : ''}">${c.vs_prev == null ? 'dif.' : sgn1(c.vs_prev)}</small></div>${ICON.chev}</a>`) : '<p class="foot">No jugaste tarjetas válidas con diferencial en este período.</p>'}
      <div class="section"><h2>Dejaron de contar</h2></div>
      ${h.dropped == null ? '<p class="foot">—  Hacen falta 20 tarjetas antes del período para saber cuáles salieron.</p>' : h.dropped.length ? `${yrList(h.dropped, c => c.date, c => `<a class="row hi-row" href="#/ronda/${esc(c.round_id)}">${dateBlock(c.date)}<div class="body"><div class="t">${esc(c.course_label || 'Ronda')} · ${c.gross ?? '—'}</div><div class="s">${c.reason === 'superada' ? 'La superó una tarjeta mejor' : 'Salió de las últimas 20'}</div></div><div class="hi-dif"><b class="num">${f1(c.differential)}</b><small>dif.</small></div>${ICON.chev}</a>`)}` : '<p class="foot">Ninguna: las mejores 8 del inicio siguen contando.</p>'}
      <p class="foot">${esc(h.note)}</p>`;
    el.querySelectorAll('[data-irange]').forEach(b => b.onclick = () => { setRange(b.dataset.irange); location.hash = '#/impacto' + (RANGE === 'all' ? '' : '?range=' + RANGE); });
  } catch(e){ el.innerHTML = errBox(e); }
}

/* ---------- CLUB FALTANTE ("Tengo otro club y no aparece"; página propia, sin pop-ups) ---------- */
function sClubFaltante(){
  return `<div class="bar"><span class="overline">Mis clubes</span></div><div id="cfal"><div class="stitle">Tengo otro club y no aparece</div>
    <p class="foot" style="margin-top:6px">Si jugás en un club que no ves en Golflet, decinos cuál. Lo revisamos y te avisamos cuando esté.</p>
    <form class="gg-form tt-form" id="cff" novalidate>
      <label class="tt-lab" for="cfc">Club</label><input id="cfc" name="club" type="text" maxlength="120" required autocomplete="organization" placeholder="Ej.: San Andrés Golf Club">
      <label class="tt-lab" for="cfm">Mensaje <small>(opcional)</small></label><textarea id="cfm" name="mensaje" maxlength="1000" rows="4" placeholder="Ciudad, desde cuándo sos socio o lo que nos quieras contar"></textarea>
      <div id="cfmsg" role="alert"></div>
      <div class="tt-acts"><button class="btn" type="submit">Enviar</button><a class="btn ghost" href="#/cuenta">Cancelar</a></div>
    </form></div>`;
}
function bindClubFaltante(){
  const f = $('#cff'); if (!f) return;
  f.onsubmit = async e => { e.preventDefault(); const msg = $('#cfmsg'); msg.innerHTML = '';
    const err = t => { msg.innerHTML = '<div class="msg err"></div>'; msg.firstChild.textContent = t; };
    if (f.club.value.trim().length < 2) { err('Escribí el nombre del club.'); f.club.focus(); return; }
    const btn = f.querySelector('[type=submit]'); btn.disabled = true;
    try { const r = await api('/api/club-requests', { method: 'POST', body: JSON.stringify({ club: f.club.value, mensaje: f.mensaje.value }) });
      $('#cfal').innerHTML = `<div class="cf-ok"><div class="cf-ic" aria-hidden="true">✓</div><div class="stitle">${esc(r.message || 'Gracias, lo vamos a revisar')}</div>
        <p class="foot">Recibimos tu pedido por <b>${esc(r.request.club)}</b>.</p><div class="tt-acts"><a class="btn" href="#/inicio">Volver al inicio</a><a class="btn ghost" href="#/club-faltante" data-again>Mandar otro</a></div></div>`;
      $('[data-again]').onclick = e2 => { e2.preventDefault(); render(true); };
    } catch(x){ err(x.message); btn.disabled = false; } };
}

/* ---------- MI BOLSA · PALOS (marca y modelo; lista de referencia + carga manual) ---------- */
let BCAT = null;
const bagCat = async () => BCAT || (BCAT = await api('/api/my-clubs/catalog'));
const CATL = { driver:'Driver', fairway:'Maderas', hybrid:'Híbridos', iron:'Hierros', wedge:'Wedges', putter:'Putter' };
const eqLine = c => c.brand ? `${esc(c.brand)}${c.model?' · '+esc(c.model):''}` : '<span class="eq-none">Sin marca ni modelo</span>';
const eqCode = c => encodeURIComponent(c.code);
async function loadEquipList(){
  const el = $('#equip'); if (!el) return;
  try {
    const [{ clubs }, cat] = await Promise.all([api('/api/my-clubs/items'), bagCat()]); if (!$('#equip')) return;
    const typ = code => cat.types.find(t => t.code.toLowerCase() === code.toLowerCase());
    const groups = {}; clubs.forEach(c => { const k = typ(c.code)?.category || 'otros'; (groups[k] ||= []).push(c); });
    const done = clubs.filter(c => c.brand).length, nm = x => String(x || '').trim().toLowerCase();
    const bagOf = c => { const ks = [typ(c.code)?.bag, c.label, c.code].filter(Boolean).map(nm); return (G.bag || []).find(b => ks.includes(nm(b.club))); };
    el.innerHTML = `<p class="foot" style="margin:0 0 10px">${clubs.length} palos · ${done ? `${done} con marca y modelo` : 'cargá marca y modelo de cada uno'}.</p>
      <div class="list">${[...Object.keys(CATL), 'otros'].filter(k => groups[k]).map(k => groups[k].map(c => { const b = bagOf(c), i = b ? G.bag.indexOf(b) : -1; return `<div class="row eq-row${c.enabled===false?' eq-off':''}"><a class="eq-a" href="#/equipo/${eqCode(c)}"><span class="eq-code num">${esc(c.code)}</span><div class="body"><div class="t">${esc(c.label)}${c.loft?` <span class="eq-loft num">${String(c.loft).replace('.',',')}°</span>`:''}</div><div class="s">${eqLine(c)}${c.enabled===false?' · oculto al marcar golpes':''}</div></div></a><label class="eq-yd" title="Carry en yardas"><input class="num" inputmode="numeric" pattern="[0-9]*" enterkeyhint="done" maxlength="3" data-eqc="${esc(c.code)}" value="${b?.carry ?? ''}" placeholder="—" aria-label="Carry de ${esc(c.label)} en yardas"><span>yd</span></label><a class="eq-ch" href="#/equipo/${eqCode(c)}" tabindex="-1" aria-hidden="true">${ICON.chev}</a></div>`; }).join('')).join('')}</div>`;
    /* t223u: the carry right on the row (the planner reads it from Mi bolsa: total if you typed one, else carry). Save on blur / Enter, no detail screen. */
    el.querySelectorAll('input[data-eqc]').forEach(inp => {
      inp.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); inp.blur(); } };
      inp.oninput = () => { inp.value = inp.value.replace(/\D/g, '').slice(0, 3); };
      inp.onchange = () => { const c = clubs.find(x => x.code === inp.dataset.eqc); if (!c) return; const v = inp.value === '' ? null : Math.min(450, +inp.value);
        let b = bagOf(c); if (!b) { if (v == null) return; if (G.bag.length >= 20) { toast('La bolsa admite hasta 20 palos con distancia'); return; } b = { club: typ(c.code)?.bag || c.label, carry: null, total: null }; G.bag.push(b); }
        b.carry = v; const lo = view.querySelector(`.bagrow input[data-i="${G.bag.indexOf(b)}"][data-k="carry"]`); if (lo) lo.value = v ?? '';
        inp.closest('.eq-row')?.classList.add('eq-saved'); setTimeout(() => inp.closest('.eq-row')?.classList.remove('eq-saved'), 1200);
        const f = $('#bagsaved'); if (f) f.textContent = 'Guardando…'; saveBag(); };
    });
  } catch(e){ el.innerHTML = errBox(e); }
}
function sEquipo(code, edit){ return `<div class="bar"><span class="overline">Mi bolsa</span></div><div id="equipo" data-code="${esc(code)}"><div style="padding:60px 0;text-align:center"><span class="spin"></span></div></div>`; }
async function loadEquipo(code, edit){
  const el = $('#equipo'); if (!el) return;
  try {
    const [cat, { clubs }] = await Promise.all([bagCat(), api('/api/my-clubs/items')]); if (!$('#equipo')) return;
    const cur = code === 'nuevo' ? null : clubs.find(c => c.code.toLowerCase() === code.toLowerCase());
    if (code !== 'nuevo' && !cur) { el.innerHTML = `<div class="msg err">Ese palo no está en tu bolsa.</div><a class="btn ghost" href="#/bolsa" style="margin-top:12px">Volver a Mi bolsa</a>`; return; }
    const typ = c => cat.types.find(t => t.code.toLowerCase() === c.toLowerCase());
    if (cur && !edit){
      const t = typ(cur.code), bl = t ? t.bag : cur.label, row = bl && (G.bag||[]).find(b => b.club === bl);
      el.innerHTML = `<div class="eq-hero"><div class="overline">${esc(CATL[t?.category] || 'Palo')}</div><div class="eq-name">${esc(cur.label)}</div>
          <div class="eq-bm">${cur.brand ? `<b>${esc(cur.brand)}</b>${cur.model ? `<span>${esc(cur.model)}</span>` : '<span>Modelo sin cargar</span>'}` : '<span>Sin marca ni modelo</span>'}</div>
          <div class="eq-tags">${cur.loft?`<span>Loft <b class="num">${String(cur.loft).replace('.',',')}°</b></span>`:''}<span>Código <b>${esc(cur.code)}</b></span>${cur.model_custom?'<span>Modelo escrito a mano</span>':''}</div></div>
        ${row ? `<div class="section"><h2>Distancias</h2><span class="badge">yardas</span></div><div class="grid3"><div class="card mini stat"><div class="k">Carry</div><div class="v num">${row.carry ?? '—'}</div></div><div class="card mini stat"><div class="k">Total</div><div class="v num">${row.total ?? '—'}</div></div><a class="card mini stat vx-tap" href="#/palo/${eqCode(cur)}"><div class="k">Con GPS</div><div class="v" style="font-size:calc(15px*var(--ts,1))">Ver golpes ›</div></a></div>` : ''}
        <div class="tt-acts"><a class="btn" href="#/equipo/${eqCode(cur)}/editar">Editar marca y modelo</a><button type="button" class="btn ghost danger" id="eqdel">Sacar de la bolsa</button></div>
        <p class="foot">${cur.enabled===false?'Oculto en la lista de palos al marcar golpes. ':''}Al sacarlo, también se va su fila de distancias. Los golpes con GPS que ya marcaste con este palo se conservan.</p>`;
      $('#eqdel').onclick = async e => { if (!(await askInline(e.currentTarget, `¿Sacar ${cur.label} de tu bolsa?`, 'Sí, sacarlo'))) return;
        try { await api(`/api/my-clubs/items/${eqCode(cur)}`, { method: 'DELETE' }); G.bag = (await api('/api/bag')).bag; toast('Palo eliminado'); location.hash = '#/bolsa'; } catch(err){ toast(err.message); } };
      return;
    }
    // form (nuevo / editar)
    const owned = new Set(clubs.map(c => c.code.toLowerCase()));
    let category = cur ? (typ(cur.code)?.category || null) : null, code0 = cur ? cur.code : null;
    let brand = cur?.brand || '', model = cur?.model || '', brandOther = false, modelOther = !!cur?.model_custom;
    const brandsIn = c => cat.brands.filter(b => b.categories[c]?.length).map(b => b.brand);
    const modelsIn = (b, c) => cat.brands.find(x => x.brand === b)?.categories[c] || [];
    if (cur && brand && category && !brandsIn(category).includes(brand)) brandOther = true;
    el.innerHTML = `<div class="stitle">${cur ? 'Editar ' + esc(cur.label) : 'Agregar palo'}</div>
      <form class="gg-form tt-form" id="eqf" novalidate>
        ${cur ? '' : `<div class="tt-lab">Tipo de palo</div><div class="seg tt-seg eq-cats" role="radiogroup" aria-label="Categoría">${Object.entries(CATL).map(([k,l]) => `<button type="button" role="radio" data-cat="${k}">${l}</button>`).join('')}</div><div id="eqtypes"></div>`}
        <div id="eqbrand"></div><div id="eqmodel"></div><div id="eqloft"></div>
        <div id="eqmsg" role="alert"></div>
        <div class="tt-acts"><button class="btn" type="submit">${cur ? 'Guardar cambios' : 'Agregar a la bolsa'}</button><a class="btn ghost" href="${cur ? '#/equipo/' + eqCode(cur) : '#/bolsa'}">Cancelar</a></div>
        <p class="foot">${esc(cat.note)}</p></form>`;
    const drawCats = () => el.querySelectorAll('[data-cat]').forEach(b => { const on = b.dataset.cat === category; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    const drawTypes = () => { const host = $('#eqtypes'); if (!host) return; if (!category) { host.innerHTML = ''; return; }
      const ts = cat.types.filter(t => t.category === category);
      host.innerHTML = `<div class="eq-types" role="radiogroup" aria-label="Palo">${ts.map(t => { const has = owned.has(t.code.toLowerCase()); return `<button type="button" role="radio" aria-checked="${t.code===code0}" class="eq-type ${t.code===code0?'on':''}" data-code="${esc(t.code)}" ${has?'disabled title="Ya está en tu bolsa"':''}>${esc(t.label.replace(/^(Hierro|Madera|Híbrido) /,''))}${has?' <small>en la bolsa</small>':''}</button>`; }).join('')}</div>`;
      host.querySelectorAll('[data-code]:not([disabled])').forEach(b => b.onclick = () => { code0 = b.dataset.code; drawTypes(); drawLoft(); }); };
    const drawBrand = () => { const host = $('#eqbrand'); if (!category) { host.innerHTML = ''; return; }
      const bs = brandsIn(category);
      host.innerHTML = `<label class="tt-lab" for="eqb">Marca</label><select id="eqb"><option value="">Elegí la marca</option>${bs.map(b => `<option ${b===brand&&!brandOther?'selected':''}>${esc(b)}</option>`).join('')}<option value="__other" ${brandOther?'selected':''}>Otra marca (escribirla)</option></select>
        ${brandOther ? `<input type="text" id="eqbo" maxlength="40" placeholder="Marca" value="${esc(brand)}" aria-label="Marca escrita a mano">` : ''}`;
      $('#eqb').onchange = e => { const v = e.target.value; brandOther = v === '__other'; brand = brandOther ? '' : v; model = ''; modelOther = brandOther; drawBrand(); drawModel(); if (brandOther) $('#eqbo')?.focus(); };
      const bo = $('#eqbo'); if (bo) bo.oninput = () => brand = bo.value; };
    const drawModel = () => { const host = $('#eqmodel'); if (!category || (!brand && !brandOther)) { host.innerHTML = ''; return; }
      const ms = brandOther ? [] : modelsIn(brand, category);
      host.innerHTML = `<label class="tt-lab" for="eqm">Modelo <small>(opcional)</small></label>${ms.length ? `<select id="eqm"><option value="">Elegí el modelo</option>${ms.map(m => `<option ${m===model&&!modelOther?'selected':''}>${esc(m)}</option>`).join('')}<option value="__other" ${modelOther?'selected':''}>Otro modelo (escribirlo)</option></select>` : ''}
        ${modelOther || !ms.length ? `<input type="text" id="eqmo" maxlength="60" placeholder="${ms.length ? 'Escribí el modelo' : 'Modelo'}" value="${esc(model)}" aria-label="Modelo escrito a mano">` : ''}`;
      const sel = $('#eqm'); if (sel) sel.onchange = e => { modelOther = e.target.value === '__other'; model = modelOther ? '' : e.target.value; drawModel(); if (modelOther) $('#eqmo')?.focus(); };
      const mo = $('#eqmo'); if (mo) mo.oninput = () => model = mo.value; };
    const drawLoft = () => { const host = $('#eqloft'); const t = code0 && typ(code0); const show = category && category !== 'putter';
      host.innerHTML = show ? `<label class="tt-lab" for="eql">Loft <small>(opcional, en grados)</small></label><input type="text" inputmode="decimal" id="eql" maxlength="5" placeholder="${t?.loft ? t.loft : 'Ej.: 10,5'}" value="${cur?.loft != null ? String(cur.loft).replace('.',',') : t?.loft ?? ''}">` : ''; };
    el.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { if (category !== b.dataset.cat) { category = b.dataset.cat; code0 = null; brand = ''; model = ''; brandOther = modelOther = false; } drawCats(); drawTypes(); drawBrand(); drawModel(); drawLoft(); });
    drawCats(); drawTypes(); drawBrand(); drawModel(); drawLoft();
    $('#eqf').onsubmit = async e => { e.preventDefault(); const msg = $('#eqmsg'); msg.innerHTML = '';
      const err = t => { msg.innerHTML = '<div class="msg err"></div>'; msg.firstChild.textContent = t; };
      if (!cur && !category) return err('Elegí el tipo de palo.'); if (!cur && !code0) return err('Elegí cuál ' + (category === 'putter' || category === 'driver' ? 'palo' : 'de los ' + CATL[category].toLowerCase()) + '.');
      if (brandOther && !brand.trim()) return err('Escribí la marca.');
      const body = { brand: brand.trim() || null, model: model.trim() || null, loft: $('#eql')?.value.trim().replace(',', '.') || null, ...(cur ? {} : { code: code0 }) };
      const btn = e.target.querySelector('[type=submit]'); btn.disabled = true;
      try { const r = await api(cur ? `/api/my-clubs/items/${eqCode(cur)}` : '/api/my-clubs/items', { method: cur ? 'PATCH' : 'POST', body: JSON.stringify(body) });
        if (!cur) G.bag = (await api('/api/bag')).bag;
        toast(cur ? 'Cambios guardados' : 'Palo agregado'); location.hash = '#/equipo/' + encodeURIComponent(r.club.code); }
      catch(x){ err(x.message); btn.disabled = false; } };
  } catch(e){ el.innerHTML = errBox(e); }
}

/* ---------- VINCULAR CLUB (sheet) ---------- */
function sVincular(){
  return `<div class="bar"><span class="overline">Tus clubes</span><button class="close" data-close>${ICON.x}</button></div>
  <div class="stitle">Vincular tu matrícula</div>
  <p class="foot" style="margin-top:6px">Con tu matrícula y tu contraseña, Golflet trae las tarjetas de todos tus clubes, incluidas las que jugaste en otras canchas. Solo lee: nunca cambia nada en tu cuenta.</p>
  <form class="form" id="lf" autocomplete="off">
    <label class="input"><span>Matrícula</span><input name="mat" inputmode="numeric" autocomplete="username" required placeholder="Tu matrícula de la AAG"></label>
    <label class="input"><span>Contraseña</span><input name="pw" type="password" autocomplete="current-password" required placeholder="La misma que para entrar a tu club"></label>
    <label class="check"><input type="checkbox" name="save" checked><span>Guardar mi contraseña (cifrada) para traer mis tarjetas nuevas todos los días. Si no, te la pido cada vez que actualices.</span></label>
    <div class="lclub" id="lclub" hidden>
      <label class="input"><span>Tu club</span><select name="club"><option value="">Todos mis clubes</option></select></label>
      <p class="foot">Algunos clubes, como San Isidro, no aparecen en la lista de todos. Elegí tu club y usá la clave con la que entrás al sitio del club. Golflet solo lee tus tarjetas.</p>
    </div>
    <div id="lmsg"></div>
    <button class="btn" id="lgo">Vincular y traer mis tarjetas</button>
    <button type="button" class="linkbtn" id="lclubtog">¿Tu club no aparece? Elegilo</button>
  </form>`;
}
function sClub(id){
  const a = G.clubs.find(x=>x.id===id); if(!a) return '<p>Club no encontrado.</p>';
  return `<div class="bar"><span class="overline">Mis clubes</span><button class="close" data-close>${ICON.x}</button></div>
  <div class="stitle">${esc(a.club_name)}</div>
  <div class="chips"><span class="badge">Matrícula ${esc(a.matricula)}</span><a class="badge" href="${mlink('rounds',{scope:'all',course:'all',sort:'date',order:'desc'})}">${a.rounds} tarjetas</a>${a.source==='app'?'<span class="badge gold">Todos tus clubes</span>':''}<span class="badge ${a.password_saved?'pos':''}">${a.password_saved?'Clave guardada':'Sin clave guardada'}</span></div>
  <div class="msg ${a.last_sync_status==='error'?'err':''}" style="margin-top:14px">Última actualización: ${ago(a.last_sync_at)}${a.last_sync_message?' · '+esc(a.last_sync_message):''}</div>
  <form class="form" id="sf">
    ${a.password_saved?'':`<label class="input"><span>Contraseña</span><input name="pw" type="password" autocomplete="current-password" required placeholder="La misma que para entrar a tu club"></label>
    <label class="check"><input type="checkbox" name="save"><span>Guardarla cifrada para actualizar todos los días.</span></label>`}
    <div id="smsg"></div>
    <button class="btn" id="sgo">${ICON.refresh}${a.source==='app'?'Actualizar todos mis clubes':'Actualizar tarjetas'}</button>
  </form>
  <div class="section"><h2>Ajustes</h2></div>
  ${a.password_saved?'<button class="btn ghost" data-forget>Olvidar la contraseña guardada</button>':''}
  <button class="btn danger" data-unlink>${a.source==='app'?'Desvincular mis clubes':'Desvincular club'}</button>
  <p class="foot">${a.source==='app'?'Este club entra con tu matrícula junto con tus otros clubes: la contraseña y la actualización son las mismas para todos. Desvincular borra de Golflet las tarjetas de todos esos clubes y tus notas sobre ellas.':'Desvincular borra de Golflet las tarjetas de este club y tus notas sobre ellas.'} Tu cuenta del club no se toca.</p>`;
}
/* t115u: nickname set → title shows it with a pencil; inline edit (no card, no modal) */
const PENCIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z M14 6l4 4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
const nickView = () => `<span class="nick-t">${esc(G.user.call_name)}</span><button type="button" class="nick-ed" data-nicked aria-label="Cambiar cómo te llamamos">${PENCIL}</button>`;
function bindNick(){
  const el = $('#nick'); if (!el) return;
  const b = el.querySelector('[data-nicked]'); if (!b) return;
  b.onclick = () => {
    el.innerHTML = `<form class="nick-f" id="nickf"><input name="cn" maxlength="40" autocomplete="given-name" value="${esc(G.user.call_name)}" aria-label="Cómo te llamamos"><button class="btn sm" type="submit">Guardar</button><button class="nick-x" type="button" data-nickx aria-label="Cancelar">×</button></form><p class="foot" id="nickmsg">Así te saludamos en Inicio. Si lo dejás vacío usamos el nombre de tu ficha del club.</p>`;
    const f = $('#nickf'), i = f.cn; i.focus(); i.select();
    const back = () => { el.innerHTML = nickView(); bindNick(); };
    el.querySelector('[data-nickx]').onclick = back;
    i.onkeydown = e => { if (e.key === 'Escape') back(); };
    f.onsubmit = async e => { e.preventDefault(); const m = $('#nickmsg');
      try { const r = await api('/api/me', { method:'PATCH', body: JSON.stringify({ call_name: i.value }) }); G.user.call_name = r.user.call_name; G.user.first_name = r.user.first_name;
        if (!G.user.call_name) { render(true); toast('Listo: usamos el nombre de tu ficha del club'); return; } back(); toast(`Listo: te saludamos como ${r.user.first_name}`); }
      catch (err) { m.textContent = errText(err); } };
  };
}
function sCuenta(){
  return `<div class="bar"><span class="overline">Tu cuenta</span><span class="bar-r">${G.user?.role?`<a class="staff-l" href="${G.user.role==='admin'?'/admin':'/admin/strategy'}">${G.user.role==='admin'?'Admin':'Editor'}</a>`:''}<button class="close" data-close>${ICON.x}</button></span></div>
  ${G.user?.call_name ? `<div class="stitle nick" id="nick">${nickView()}</div>` : `<div class="stitle">${esc(G.user?.name||'')}</div>`}<div style="font-size:calc(14px*var(--ts,1));color:var(--color-ink2);margin-top:4px">${esc(/@golfistics\.invalid$/.test(G.user?.email||'') ? 'Entrás con tu matrícula' : (G.user?.email||''))}</div>
  ${G.player?.name?`<div class="chips"><span class="badge">${esc(title(G.player.name))}</span>${G.player.handicap_index!=null?`<span class="badge gold">HI ${f1(G.player.handicap_index)}</span>`:''}</div>`:''}
  <a class="card gg-home nt-home" href="#/notificaciones"><span class="gg-home-ic">${NT_BELL}</span><div><b>Notificaciones</b><p>Invitaciones a grupos y mensajes de tus clubes.</p></div><span class="nt-home-r">${NBADGE}${ICON.chev}</span></a>
  ${G.user?.call_name ? '' : `<div class="section"><h2>Cómo te llamamos</h2></div>
  <form class="card vx-callname" id="cnf"><label for="cn">Nombre para el saludo</label><div class="vx-cn-row"><input id="cn" name="cn" maxlength="40" autocomplete="given-name" value="${esc(G.user?.call_name||'')}" placeholder="${esc(G.user?.first_name||'')}"><button class="btn" type="submit">Guardar</button></div><p class="foot" id="cnmsg">Así te saludamos en Inicio. Si lo dejás vacío usamos el nombre de tu ficha del club.</p></form>`}
  <div class="section"><h2>Clubes</h2></div>${clubsCard()}
  <div class="section"><h2>Tu juego</h2></div><div class="card" style="padding:4px 16px">
    <a class="acctrow gear" href="#/pelota"><div class="acct"><div class="add gi">${BALL_IC}</div><div class="gt">Mi pelota<small id="gearball">&nbsp;</small></div></div>${ICON.chev}</a>
    <a class="acctrow gear" href="#/sorteos"><div class="acct"><div class="add gi">${GIFT_IC}</div><div class="gt">Sorteos<small id="gearsort">&nbsp;</small></div></div>${ICON.chev}</a></div>
  <div class="section"><h2>Ronda con GPS</h2></div><div class="card pace-set" style="padding:4px 16px"><label class="gg-srow"><span><b>Aviso de ritmo de juego</b><small>Al llegar al hoyo 10, si vas más de 10 minutos atrás del ritmo estimado de la cancha, te avisamos. El ritmo es una estimación de Golflet, no del club.</small></span><span class="switch"><input type="checkbox" id="pacealert" checked disabled><i></i></span></label><p class="pace-msg" id="pacemsg" aria-live="polite"></p></div>
  <div class="section"><h2>Accesibilidad</h2></div><div class="card a11y-set" id="a11yset">
    <div class="a11y-row"><b>Tamaño del texto</b><div class="seg a11y-seg" role="group" aria-label="Tamaño del texto">${TS_OPTS.map(([v,l])=>`<button type="button" data-a11y="s:${v}">${l}</button>`).join('')}</div></div>
    <div class="a11y-row"><b>Grosor del texto</b><div class="seg a11y-seg" role="group" aria-label="Grosor del texto">${TW_OPTS.map(([v,l])=>`<button type="button" data-a11y="w:${v}">${l}</button>`).join('')}</div></div>
    <div class="a11y-prev" aria-hidden="true"><span class="overline">Vista previa</span><div class="a11y-pt">Hola, ${esc(firstName() || 'golfista')}</div>${(()=>{ const h=G?.player?.handicap_index ?? G?.hi_history?.at(-1)?.hi ?? null, lr=rounds[0]; if(h==null&&!lr) return '<div class="a11y-pn"><span>Así se ven los textos y los números de tus rondas.</span></div>'; return `<div class="a11y-pn">${h!=null?`<b class="num">${f1(h)}</b>`:''}<span>${h!=null?'Handicap Index':''}${lr?.gross!=null?`${h!=null?' · ':''}<b class="num">${lr.gross}</b> gross${lr.course?' en '+esc(lr.course):''}`:''}</span></div>`; })()}</div>
    <p class="foot" id="a11ymsg">Se aplica en toda la app y se guarda en tu cuenta.</p></div>
  ${PROFE?.account_status === 'active' ? `<div class="section"><h2>Espacio profesor</h2></div><a class="card gg-home" href="#/profe"><div><b>Tus alumnos y tu perfil</b><p>Ves solo a los jugadores que comparten sus métricas con vos.</p></div>${ICON.chev}</a>` : ''}
  <div class="section"><h2>Profesores</h2></div><div id="profs"><div class="card" style="text-align:center"><span class="spin"></span></div></div>
  <div class="section"><h2>Amigos</h2></div><a class="card gg-home" href="#/compartir"><div><b>Qué comparto</b><p>Elegí qué ven de vos los jugadores de tus grupos. Notas de voz, notas y estrategia nunca se comparten.</p></div>${ICON.chev}</a>
  <div style="height:18px"></div><button class="btn ghost" data-logout>Salir</button>`;
}

/* ---------- t74u: Mi pelota + Sorteos ---------- */
const ldate = t => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' });   // timestamps → local (ART) date for dmy()
const BALL_IC = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="9.5" cy="9" r="1" fill="currentColor"/><circle cx="13" cy="8" r="1" fill="currentColor"/><circle cx="11" cy="12" r="1" fill="currentColor"/><circle cx="14.6" cy="11.4" r="1" fill="currentColor"/><circle cx="12.8" cy="15" r="1" fill="currentColor"/></svg>';
const GIFT_IC = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3.5" y="9" width="17" height="11" rx="2"/><path d="M3.5 13h17M12 9v11M12 9c-1.8-3.8-6-3.6-5.4-1.2C7 9 12 9 12 9zm0 0c1.8-3.8 6-3.6 5.4-1.2C17 9 12 9 12 9z"/></svg>';
const ballTxt = b => b ? `${b.brand}${b.model ? ' ' + b.model : ''}` : '';
let BALL = null;
/* t150u: Tamaño / Grosor del texto — applied on <html> (data-ts / data-tw → CSS variables), cached for the next paint, saved per user. */
const TS_OPTS = [['normal','Normal'],['grande','Grande'],['muy_grande','Muy grande']], TW_OPTS = [['normal','Normal'],['marcado','Más marcado']];
function applyA11y(s, w){ const r = document.documentElement; if (s && s !== 'normal') r.dataset.ts = s; else delete r.dataset.ts; if (w === 'marcado') r.dataset.tw = 'marcado'; else delete r.dataset.tw;
  try { localStorage.setItem('golflet.a11y', JSON.stringify({ s: s || 'normal', w: w || 'normal' })); } catch(e){} if (typeof fitGreeting === 'function') fitGreeting(); }
async function syncA11y(){ try { const d = await api('/api/me/settings'); applyA11y(d.text_size, d.text_weight); return d; } catch(e){ return null; } }
function bindA11y(d){
  const box = $('#a11yset'); if (!box) return; const cur = { s: d?.text_size || document.documentElement.dataset.ts || 'normal', w: d?.text_weight || document.documentElement.dataset.tw || 'normal' };
  const paint = () => box.querySelectorAll('[data-a11y]').forEach(b => { const [k, v] = b.dataset.a11y.split(':'); const on = cur[k] === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  paint(); const msg = $('#a11ymsg');
  box.querySelectorAll('[data-a11y]').forEach(b => b.onclick = async () => { const [k, v] = b.dataset.a11y.split(':'); if (cur[k] === v) return; const prev = { ...cur }; cur[k] = v; applyA11y(cur.s, cur.w); paint();
    try { await api('/api/me/settings', { method: 'PATCH', body: JSON.stringify(k === 's' ? { text_size: v } : { text_weight: v }) }); if (msg) msg.textContent = 'Guardado.'; }
    catch(e){ Object.assign(cur, prev); applyA11y(cur.s, cur.w); paint(); if (msg) msg.textContent = 'No pudimos guardar. Probá de nuevo.'; } });
}
/* t150u: hide the bottom tab bar while typing (keyboard open), so it never floats over the form */
(() => { const r = document.documentElement, isField = el => el && (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && !/^(checkbox|radio|range|button|submit|reset|file|color)$/i.test(el.type)) || el.isContentEditable);
  document.addEventListener('focusin', e => { if (isField(e.target)) r.classList.add('kb-open'); });
  document.addEventListener('focusout', () => setTimeout(() => { if (!isField(document.activeElement)) r.classList.remove('kb-open'); }, 60));
  const vv = window.visualViewport; if (vv) vv.addEventListener('resize', () => { const open = vv.height < window.innerHeight * 0.78; if (open) r.classList.add('kb-open'); else if (!isField(document.activeElement)) r.classList.remove('kb-open');
    if (open && isField(document.activeElement)) { const f = document.activeElement.closest('form'), btn = f && f.querySelector('button[type=submit],.btn:not(.ghost)'); (btn || document.activeElement).scrollIntoView({ block: 'nearest' }); } });
})();
async function loadPaceSetting(){
  const cb = $('#pacealert'), msg = $('#pacemsg'); if (!cb) return;
  try { const d = await api('/api/me/settings'); cb.checked = !!d.pace_alert; cb.disabled = false; applyA11y(d.text_size, d.text_weight); bindA11y(d); } catch(e){ bindA11y(null); if (msg) msg.textContent = 'No pudimos cargar este ajuste.'; return; }
  cb.onchange = async () => { cb.disabled = true; const want = cb.checked;
    try { const d = await api('/api/me/settings', { method: 'PATCH', body: JSON.stringify({ pace_alert: want }) }); cb.checked = !!d.pace_alert; msg.textContent = d.pace_alert ? 'Aviso activado.' : 'Aviso desactivado.'; }
    catch(e){ cb.checked = !want; msg.textContent = errText(e, 'el ajuste'); } finally { cb.disabled = false; } };
}
async function loadGear(){
  loadPaceSetting();
  try { const [b, so] = await Promise.all([api('/api/ball'), api('/api/sorteos')]); BALL = b;
    const a = $('#gearball'), c = $('#gearsort'); if (a) a.textContent = b.ball ? ballTxt(b.ball) : 'Contanos con qué pelota jugás';
    if (c) c.textContent = so.open ? `${so.open} ${so.open === 1 ? 'abierto' : 'abiertos'}${so.sorteos.some(x => x.entered && x.status === 'abierto') ? ' · estás participando' : ''}` : so.sorteos.some(x => x.won) ? '¡Ganaste un sorteo!' : 'No hay sorteos abiertos';
  } catch(e){}
}
async function loadBagBall(){
  const el = $('#bagball'); if (!el) return;
  try { const b = await api('/api/ball'); BALL = b; const sm = el.querySelector('small'); if (sm) sm.textContent = b.ball ? ballTxt(b.ball) : 'Sin cargar'; } catch(e){ el.remove(); }
}
function sPelota(){ return `<div class="bar"><span class="overline">Tu juego</span><button class="close" data-close>${ICON.x}</button></div><div class="stitle">Mi pelota</div><div id="pelbody"><div style="padding:40px 0;text-align:center"><span class="spin"></span></div></div>`; }
async function loadPelota(){
  const el = $('#pelbody'); if (!el) return;
  let d; try { d = await api('/api/ball'); } catch(e){ el.innerHTML = errBox(e); return; }
  let brand = d.ball?.brand || '', model = d.ball?.model || '';
  const cat = () => d.catalog.find(x => x.brand === brand);
  const draw = () => { const c = cat(), other = brand && !c;
    el.innerHTML = `<p class="foot" style="margin:4px 0 14px">La pelota cambia el vuelo y el efecto. La mostramos en Mi bolsa${''} y, si lo elegís en Qué comparto, a tus grupos.</p>
      <div class="section" style="margin-top:0"><h2>Marca</h2></div><div class="pl-chips">${d.catalog.map(x => `<button type="button" class="${x.brand === brand ? 'on' : ''}" data-br="${esc(x.brand)}">${esc(x.brand)}</button>`).join('')}<button type="button" class="${other ? 'on' : ''}" data-br="__otra">Otra</button></div>
      ${other || brand === '__otra' ? `<label class="pl-l" for="plb">Marca</label><input class="pl-in" id="plb" maxlength="40" value="${esc(other ? brand : '')}" placeholder="Escribí la marca">` : ''}
      ${brand ? `<div class="section"><h2>Modelo</h2></div>${c ? `<div class="pl-chips">${c.models.map(m => `<button type="button" class="${m === model ? 'on' : ''}" data-md="${esc(m)}">${esc(m)}</button>`).join('')}</div>` : ''}
        <label class="pl-l" for="plm">${c ? 'Otro modelo' : 'Modelo'}</label><input class="pl-in" id="plm" maxlength="60" value="${esc(c && c.models.includes(model) ? '' : model)}" placeholder="Opcional">` : ''}
      <div class="tt-acts" style="margin-top:18px"><button class="btn" id="plsave" ${brand ? '' : 'disabled'}>Guardar</button>${d.ball ? '<button class="btn ghost" id="plclr">Quitar</button>' : ''}</div><p class="foot" id="plmsg"></p>`;
    el.querySelectorAll('[data-br]').forEach(b => b.onclick = () => { brand = b.dataset.br; model = ''; draw(); if (brand === '__otra') $('#plb')?.focus(); });
    el.querySelectorAll('[data-md]').forEach(b => b.onclick = () => { model = model === b.dataset.md ? '' : b.dataset.md; draw(); });
    $('#plb')?.addEventListener('input', e => { brand = e.target.value.trim() || '__otra'; const sv = $('#plsave'); if (sv) sv.disabled = !e.target.value.trim(); });
    $('#plm')?.addEventListener('input', e => { model = e.target.value.trim(); el.querySelectorAll('[data-md]').forEach(x => x.classList.remove('on')); });
    $('#plsave')?.addEventListener('click', async () => { const b = brand === '__otra' ? '' : brand; if (!b) return; const sv = $('#plsave'); sv.disabled = true;
      try { const r = await api('/api/ball', { method: 'PUT', body: JSON.stringify({ brand: b, model: model || null }) }); d.ball = r.ball; brand = r.ball.brand; model = r.ball.model || ''; toast('Pelota guardada'); draw(); }
      catch(e){ sv.disabled = false; $('#plmsg').textContent = errText(e); } });
    $('#plclr')?.addEventListener('click', async () => { try { await api('/api/ball', { method: 'DELETE' }); d.ball = null; brand = ''; model = ''; toast('Listo'); draw(); } catch(e){ $('#plmsg').textContent = errText(e); } });
  };
  draw();
}
const SST = { abierto: ['ok', 'Abierto'], proximo: ['', 'Próximamente'], cerrado: ['', 'Cerrado'], sorteado: ['gold', 'Sorteado'] };
const sortRow = x => { const [c, l] = SST[x.status] || ['', x.status]; return `<a class="row" href="#/sorteo/${x.id}"><div class="sr-ic">${GIFT_IC}</div><div class="body"><div class="t">${esc(x.title)}</div><div class="s">${esc(x.prize)} · ${x.status === 'abierto' ? 'cierra ' + dmy(ldate(x.ends_at)) : x.status === 'proximo' ? 'empieza ' + dmy(ldate(x.starts_at)) : dmy(ldate(x.ends_at))}</div></div><span class="badge ${x.won ? 'gold' : x.entered ? 'ok' : c}">${x.won ? '¡Ganaste!' : x.entered && x.status !== 'sorteado' ? 'Participás' : l}</span>${ICON.chev}</a>`; };
async function loadSorteoCard(){
  const el = $('#sorteocard'); if (!el) return;
  try { const d = await api('/api/sorteos'); if (!$('#sorteocard')) return;
    const won = d.sorteos.find(x => x.won), op = d.sorteos.find(x => x.status === 'abierto' && !x.entered);
    const x = won || op; if (!x) { el.innerHTML = ''; return; }
    el.innerHTML = `<a class="card sorteo-c${won ? ' won' : ''}" href="#/sorteo/${x.id}"><span class="sr-ic">${GIFT_IC}</span><span class="sc-t"><small>${won ? '¡Ganaste el sorteo!' : 'Sorteo abierto'}</small><b>${esc(x.prize)}</b><span>${won ? esc(x.title) : `Cierra ${dmy(ldate(x.ends_at))} · participá con un toque`}</span></span>${ICON.chev}</a>`;
  } catch(e){ el.innerHTML = ''; }
}
function sSorteos(){ return `<div class="bar"><span class="overline">Tu juego</span><button class="close" data-close>${ICON.x}</button></div><div class="stitle">Sorteos</div><div id="sortbody"><div style="padding:40px 0;text-align:center"><span class="spin"></span></div></div>`; }
async function loadSorteos(){
  const el = $('#sortbody'); if (!el) return;
  try { const d = await api('/api/sorteos'); if (!$('#sortbody')) return;
    el.innerHTML = d.sorteos.length ? `<div class="list" style="margin-top:14px">${d.sorteos.map(sortRow).join('')}</div><p class="foot">Para participar tenés que aceptar las bases y condiciones de cada sorteo. Los organiza Golflet.</p>`
      : `<div class="empty-card" style="margin-top:14px">${GIFT_IC}<b>No hay sorteos por ahora</b>Cuando haya uno abierto lo vas a ver acá y en Inicio.</div>`;
  } catch(e){ el.innerHTML = errBox(e); }
}
/* ---------- t154u Notificaciones (invitations to groups + club messages written in Admin). Own pages, no modals. ---------- */
let NUNREAD = null, NUNREAD_AT = 0;
const NBADGE = '<span class="nbadge" data-nbadge hidden></span>';
const NT_BELL = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/></svg>';
const ntLabel = n => !(n > 0) ? '' : n > 9 ? '9+' : String(n);
function applyNbadge(){
  document.querySelectorAll('[data-nbadge]').forEach(b => { const t = ntLabel(NUNREAD); b.textContent = t; b.hidden = !t; });
  const av = view.querySelector('.top a.avatar');
  if (av) { const n = NUNREAD || 0; av.href = n ? '#/notificaciones' : '#/cuenta'; av.setAttribute('aria-label', n ? `Notificaciones: ${n} sin leer` : 'Tu cuenta'); }
}
function setUnread(n){ if (typeof n === 'number') { NUNREAD = n; NUNREAD_AT = Date.now(); } applyNbadge(); }
async function loadNbadge(force){
  applyNbadge(); if (!force && NUNREAD != null && Date.now() - NUNREAD_AT < 15000) return;
  try { const d = await api('/api/me/notifications/unread-count'); setUnread(d.unread_count); } catch(_){}
}
const ntWhen = t => { const d = ldate(t), today = ldate(Date.now()), y = ldate(Date.now() - 864e5); return d === today ? 'Hoy' : d === y ? 'Ayer' : dmy(d); };
const NT_GROUP_IC = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="9" r="3.2"/><path d="M3.5 18.5c.9-2.7 3-4.2 5.5-4.2s4.6 1.5 5.5 4.2"/><circle cx="16.5" cy="8" r="2.6"/><path d="M16 13.2c2.1 0 3.8 1.2 4.5 3.4"/></svg>';
const ntIcon = n => n.kind === 'pin_report' ? `<span class="nt-ic club" aria-hidden="true">⚑</span>` : n.kind === 'group_invite' ? (n.group?.photo_url ? `<span class="nt-ic"><img src="${esc(n.group.photo_url)}" alt=""></span>` : `<span class="nt-ic">${NT_GROUP_IC}</span>`) : `<span class="nt-ic club">${esc(compInit(n.club?.name || 'Club'))}</span>`;
const ntSub = n => n.kind === 'group_invite' ? `Invitación a un grupo · ${n.group.members} ${n.group.members === 1 ? 'miembro' : 'miembros'} · ${ntWhen(n.created_at)}` : n.kind === 'pin_report' ? `Golflet Admin · ${ntWhen(n.created_at)}` : `${esc(n.club?.name || 'Tu club')} · ${ntWhen(n.created_at)}`;
const ntActs = n => n.kind === 'group_invite' ? `<div class="nt-acts" data-ntacts="${esc(n.id)}"><button class="btn sm" type="button" data-ntresp="1" data-g="${esc(n.group.id)}">Aceptar</button><button class="btn sm ghost" type="button" data-ntresp="0" data-g="${esc(n.group.id)}">Rechazar</button></div>` : '';
const ntRow = n => `<div class="nt${n.read ? '' : ' unread'}"><a class="nt-main" href="#/notificacion/${encodeURIComponent(n.id)}">${ntIcon(n)}<span class="nt-b"><span class="nt-t">${esc(n.title)}</span><span class="nt-s">${ntSub(n)}</span>${n.body ? `<span class="nt-p">${esc(n.body)}</span>` : ''}</span>${n.read ? '' : '<i class="nt-dot" aria-label="Sin leer"></i>'}</a>${ntActs(n)}</div>`;
function sNotifs(){ return `<div class="bar"><span class="overline">Tu cuenta</span><button class="close" data-close>${ICON.x}</button></div><div class="stitle">Notificaciones</div><div id="ntbody"><div style="padding:40px 0;text-align:center"><span class="spin"></span></div></div>`; }
function bindNtResp(root, after){
  root.querySelectorAll('[data-ntresp]').forEach(b => b.onclick = async () => {
    const row = b.closest('[data-ntacts]'), ok = b.dataset.ntresp === '1', gid = b.dataset.g; row.querySelectorAll('button').forEach(x => x.disabled = true);
    try { await api(`/api/groups/${encodeURIComponent(gid)}/respond`, { method:'POST', body: JSON.stringify({ accept: ok }) });
      row.outerHTML = ok ? `<div class="nt-done">Te sumaste al grupo. <a href="#/grupo/${encodeURIComponent(gid)}">Ver grupo</a></div>` : `<div class="nt-done">Rechazaste la invitación.</div>`;
      const it = b.closest('.nt'); if (it) { it.classList.remove('unread'); it.querySelector('.nt-dot')?.remove(); }
      await loadNbadge(true); if (after) after();
    } catch(e){ row.querySelectorAll('button').forEach(x => x.disabled = false); toast(errText(e)); }
  });
}
async function loadNotifs(){
  const el = $('#ntbody'); if (!el) return;
  try { const d = await api('/api/me/notifications'); if (!$('#ntbody')) return; setUnread(d.unread_count);
    el.innerHTML = d.items.length ? `${d.unread_count ? `<div class="nt-top"><span><b class="num">${d.unread_count}</b> sin leer</span><button type="button" class="linkbtn" id="ntall">Marcar todo como leído</button></div>` : ''}<div class="nt-list">${d.items.map(ntRow).join('')}</div>
      <p class="foot">Acá te llegan las invitaciones a grupos y los mensajes de tus clubes. <a href="#/cuenta">Ir a Tu cuenta</a></p>`
      : `<div class="empty-card" style="margin-top:14px"><b>No tenés notificaciones</b>Cuando alguien te invite a un grupo o tu club mande un mensaje, lo vas a ver acá.</div><p class="foot"><a href="#/cuenta">Ir a Tu cuenta</a></p>`;
    bindNtResp(el);
    const all = $('#ntall'); if (all) all.onclick = async () => { all.disabled = true; try { const r = await api('/api/me/notifications/read', { method:'POST', body: JSON.stringify({ all: true }) }); setUnread(r.unread_count); loadNotifs(); } catch(e){ all.disabled = false; toast(errText(e)); } };
  } catch(e){ el.innerHTML = errBox(e); }
}
function sNotif(){ return `<div class="bar"><span class="overline">Notificaciones</span><button class="close" data-close>${ICON.x}</button></div><div id="ntone"><div style="padding:40px 0;text-align:center"><span class="spin"></span></div></div>`; }
async function loadNotif(id){
  const el = $('#ntone'); if (!el) return;
  try { const { notification: n } = await api(`/api/me/notifications/${encodeURIComponent(id)}`); if (!$('#ntone')) return;
    el.innerHTML = `<div class="stitle">${esc(n.title)}</div><div class="nt-s nt-meta">${ntSub(n)}</div>
      ${n.kind === 'pin_report' ? `<div class="card nt-body">${esc(n.body || '')}${n.club?.name ? `<div class="muted" style="margin-top:8px">${esc(n.club.name)}</div>` : ''}<div class="nt-acts"><a class="btn sm" href="${esc(n.link || '/admin/banderas')}">Revisar en el panel</a></div></div><p class="foot">Solo lo ven los administradores de Golflet.</p>`
      : n.kind === 'club_message' ? `<div class="card nt-body">${n.body ? esc(n.body) : '<span class="muted">Sin texto adicional.</span>'}</div><p class="foot">Mensaje enviado por ${esc(n.club?.name || 'tu club')} a sus socios en Golflet.</p>`
        : `<div class="card nt-body">${esc(n.group.invited_by)} te invitó a comparar métricas en «${esc(n.group.name)}». Nada se comparte hasta que aceptás, y después elegís qué ven en Qué comparto.${ntActs(n)}</div>`}`;
    bindNtResp(el);
    if (!n.read) { const r = await api('/api/me/notifications/read', { method:'POST', body: JSON.stringify({ ids: [n.id] }) }); setUnread(r.unread_count); }
  } catch(e){ el.innerHTML = errBox(e); }
}
function sSorteo(id, bases){ return `<div class="bar"><span class="overline">${bases ? 'Sorteo' : 'Sorteos'}</span><button class="close" data-close>${ICON.x}</button></div><div id="sorbody"><div style="padding:40px 0;text-align:center"><span class="spin"></span></div></div>`; }
async function loadSorteo(id, bases){
  const el = $('#sorbody'); if (!el) return;
  let d; try { d = await api(`/api/sorteos/${encodeURIComponent(id)}`); } catch(e){ el.innerHTML = errBox(e); return; }
  const x = d.sorteo; if (!$('#sorbody')) return;
  if (bases) { el.innerHTML = `<div class="stitle">Bases y condiciones</div><div style="font-size:calc(13px*var(--ts,1));color:var(--color-ink3);margin-top:2px">${esc(x.title)}</div><div class="card bases-t">${esc(x.bases)}</div><p class="foot">Versión ${esc(x.bases_version)}.</p><a class="btn ghost" href="#/sorteo/${x.id}">Volver al sorteo</a>`; return; }
  const [c, l] = SST[x.status] || ['', x.status];
  const draw = () => { el.innerHTML = `<div class="stitle">${esc(x.title)}</div><div class="chips"><span class="badge ${c}">${l}</span>${x.sponsor ? `<span class="badge">Con ${esc(x.sponsor)}</span>` : ''}</div>
    <div class="card sorteo-p"><small>Premio</small><b>${esc(x.prize)}</b></div>
    ${x.description ? `<p style="font-size:calc(15px*var(--ts,1));line-height:1.5;color:var(--color-ink2);white-space:pre-wrap">${esc(x.description)}</p>` : ''}
    <dl class="sorteo-kv">${x.starts_at ? `<dt>Empieza</dt><dd class="num">${dmy(ldate(x.starts_at))}</dd>` : ''}<dt>Cierra</dt><dd class="num">${dmy(ldate(x.ends_at))}</dd><dt>Participantes</dt><dd class="num">${x.entries}</dd></dl>
    ${x.won ? `<div class="card sorteo-won"><b>¡Ganaste!</b> Te vamos a contactar para coordinar la entrega del premio.</div>`
      : x.status === 'sorteado' ? `<div class="msg">Este sorteo ya se hizo.${x.entered ? ' Esta vez no ganaste.' : ''}</div>`
      : x.entered ? `<div class="card sorteo-in"><span class="ct-check">✓</span><div><b>Estás participando</b><span>Aceptaste las bases el ${dmy(ldate(x.accepted_at))}.</span></div></div>${x.status === 'abierto' ? '<button class="btn ghost" id="srleave">Dejar de participar</button>' : ''}`
      : x.status === 'abierto' ? `<label class="sr-acc"><input type="checkbox" id="sracc">Leí y acepto las <a class="link" href="#/sorteo/${x.id}/bases">bases y condiciones</a></label><button class="btn" id="srgo" disabled>Participar</button>`
      : `<div class="msg">${x.status === 'proximo' ? 'Todavía no empezó.' : 'Este sorteo ya cerró.'}</div>`}
    <p class="foot"><a class="link" href="#/sorteo/${x.id}/bases">Leer las bases y condiciones</a></p><p class="foot" id="srmsg"></p>`;
    $('#sracc')?.addEventListener('change', e => { $('#srgo').disabled = !e.target.checked; });
    $('#srgo')?.addEventListener('click', async () => { const b = $('#srgo'); b.disabled = true; try { const r = await api(`/api/sorteos/${x.id}/participar`, { method: 'POST', body: JSON.stringify({ acepto_bases: true, bases_version: x.bases_version }) }); Object.assign(x, r.sorteo); toast('¡Listo! Estás participando'); draw(); } catch(e){ b.disabled = false; $('#srmsg').textContent = errText(e); } });
    $('#srleave')?.addEventListener('click', async () => { try { const r = await api(`/api/sorteos/${x.id}/participar`, { method: 'DELETE' }); Object.assign(x, r.sorteo); toast('Ya no participás'); draw(); } catch(e){ $('#srmsg').textContent = errText(e); } }); };
  draw();
}
/* ---------- MÉTRICAS (detalle de cada número) ---------- */
const MTITLE = { rounds:'Rondas', 'best-gross':'Mejor gross', average:'Promedio', handicap:'Hándicap', eagles:'Águilas', birdies:'Birdies', pars:'Pares', bogeys:'Bogeys', doubles:'Doble bogey o peor' };
const SCOREK = ['eagles','birdies','pars','bogeys','doubles'];
let MQ = {};   // metric -> {scope, year, course, sort, order}
const mlink = (metric, q={}) => { q = Object.fromEntries(Object.entries(q).filter(([,v])=>v!==''&&v!=null)); return `#/metrica/${metric}${Object.keys(q).length?'?'+new URLSearchParams(q):''}`; };
function mstate(metric, qs){
  const p = new URLSearchParams(qs||''), cur = MQ[metric] || {};
  const st = { scope: p.get('scope') || cur.scope || 'year', year: p.get('year') || cur.year || String(new Date().getFullYear()), course: p.get('course') || cur.course || 'all',
    sort: p.get('sort') || cur.sort || (metric==='best-gross'?'gross':'date'), order: p.get('order') || cur.order || (metric==='best-gross'?'asc':'desc'),
    range: qs ? (RKEYS.includes(p.get('range')) ? p.get('range') : '') : (cur.range || '') };
  if (qs) MQ[metric] = st; return MQ[metric] = MQ[metric] || st;
}
function sMetric(metric, qs){
  if (!MTITLE[metric]) return '<p>Métrica no encontrada.</p>';
  mstate(metric, qs);
  return `<div class="bar"><span class="overline">Detalle</span><button class="close" data-close>${ICON.x}</button></div>
  <div class="stitle">${MTITLE[metric]}</div>
  ${SCOREK.includes(metric)?`<div class="seg vx-seg" style="margin-top:14px">${SCOREK.map(k=>`<button class="${k===metric?'on':''}" data-mswitch="${k}">${k==='doubles'?'Doble+':MTITLE[k]}</button>`).join('')}</div>`:''}
  <div id="mbody"><div style="padding:60px 0;text-align:center"><span class="spin"></span></div></div>`;
}
async function loadMetric(metric){
  const el = $('#mbody'); if (!el) return;
  const st = MQ[metric]; const q = new URLSearchParams(Object.fromEntries(Object.entries(st).filter(([,v])=>v)));
  let d; try { d = await api(`/api/metrics/${metric}?${q}`); } catch(e){ el.innerHTML = `${errBox(e)}`; return; }
  if (!$('#mbody') || location.hash.indexOf('#/metrica/'+metric) !== 0) return;
  const yr = st.year, rg = st.range || '';
  const scopeSeg = `<div class="rng"><div class="seg vx-seg rng-seg" role="tablist" aria-label="Período">${RANGES.map(([k,l])=>`<button type="button" role="tab" aria-selected="${k===rg}" class="${k===rg?'on':''}" data-mset="range=${k}">${l}</button>`).join('')}${!rg?`<button type="button" class="on" data-mset="range=">${st.scope==='since'?'Desde '+yr:st.scope==='all'?'Todas':yr}</button>`:''}</div>
    <span class="rng-n"><b class="num">${metric==='handicap'?(d.history||[]).length:d.rounds_in_range}</b> ${metric==='handicap'?'registros':(d.rounds_in_range===1?'ronda':'rondas')}${d.since?` desde ${dmy(d.since)}`:''}</span></div>` + overTime(metric, d);
  const courseSeg = d.courses.length>2 ? `<div class="vx-chips">${d.courses.filter(c=>c.rounds||c.key==='all').map(c=>`<button class="vx-chip ${c.key===st.course?'on':''}" data-mset="course=${encodeURIComponent(c.key)}">${esc(c.label)}<span class="num">${c.rounds}</span></button>`).join('')}</div>` : '';
  let html = '';
  if (metric === 'handicap'){
    const h = d.history, pts = h.slice().reverse();
    const W=320,H=90, ys=pts.map(x=>x.hi), mn=Math.min(...ys)-.3, mx=Math.max(...ys)+.3;
    const line = pts.length>1 ? smooth(pts.map((x,i)=>[i*W/(pts.length-1), 6+(mx-x.hi)*(H-12)/(mx-mn)])) : '';
    html = scopeSeg + `<div class="pills"><div class="pill dark"><b class="num">${f1(d.current)}</b><span>Actual</span></div><div class="pill"><b class="num">${f1(d.low)}</b><span>Más bajo</span></div><div class="pill"><b class="num">${f1(d.high)}</b><span>Más alto</span></div><div class="pill"><b class="num">${d.change==null?'—':(d.change<0?'−':'+')+f1(Math.abs(d.change))}</b><span>Cambio</span></div></div>
      <div class="section"><h2>Historial</h2><span class="badge">${h.length} registros</span></div>
      ${h.length?yrList(h, x => x.date, (x,i)=>{ const prev=h[i+1]; const dd = prev? x.hi-prev.hi : null; return `<div class="row">${dateBlock(x.date)}<div class="body"><div class="t">${x.date.slice(0,4)}</div>${prev && dd ? `<div class="s">índice ${dd<0?'↓':'↑'} ${f1(Math.abs(dd))}</div>` : ''}${prev ? hiShiftHTML(x) : ''}</div><div class="score"><b class="num">${f1(x.hi)}</b></div></div>`; }):'<div class="msg">Sin historial para este período.</div>'}`;
  } else if (!SCOREK.includes(metric)){
    const s = d.summary;
    const sortSeg = `<div class="seg vx-seg"><button class="${st.sort==='date'?'on':''}" data-mset="sort=date&order=desc">Fecha</button><button class="${st.sort==='gross'?'on':''}" data-mset="sort=gross&order=${st.sort==='gross'&&st.order==='asc'?'desc':'asc'}">Gross ${st.sort==='gross'?(st.order==='asc'?'↑':'↓'):''}</button><button class="${st.sort==='net'?'on':''}" data-mset="sort=net&order=${st.sort==='net'&&st.order==='asc'?'desc':'asc'}">Neto ${st.sort==='net'?(st.order==='asc'?'↑':'↓'):''}</button></div>`;
    html = scopeSeg + courseSeg + `<div class="pills"><div class="pill dark"><b class="num">${metric==='best-gross'?(s.best_gross??'—'):metric==='average'?f1(s.average_gross):s.rounds}</b><span>${metric==='best-gross'?'Mejor':metric==='average'?'Gross prom.':'Rondas'}</span></div>
      <div class="pill"><b class="num">${metric==='average'?f1(s.average_net):f1(s.average_gross)}</b><span>${metric==='average'?'Neto prom.':'Promedio'}</span></div><div class="pill"><b class="num">${metric==='best-gross'?f1(s.average_gross):(s.best_gross??'—')}</b><span>${metric==='best-gross'?'Promedio':'Mejor'}</span></div><div class="pill"><b class="num">${s.worst_gross??'—'}</b><span>Peor</span></div></div>
      <p class="foot">${s.valid_rounds} tarjetas válidas de 18 hoyos${s.rounds>s.valid_rounds?` · ${s.rounds-s.valid_rounds} DES o de 9 hoyos no cuentan`:''}. ${st.sort!=='date'?(st.order==='asc'?'De la mejor a la peor.':'De la peor a la mejor.'):''}</p>
      ${sortSeg}
      ${d.rounds.length?(st.sort==='date' ? yrList(d.rounds, r => r.date, r => mrow(r, null, null, true)) : `<div class="list">${d.rounds.map((r,i)=>mrow(r, i+1)).join('')}</div>`):'<div class="msg">No hay rondas con este filtro.</div>'}`;
  } else {
    const sortSeg = `<div class="seg vx-seg"><button class="${st.sort==='date'?'on':''}" data-mset="sort=date&order=desc">Fecha</button><button class="${st.sort==='count'?'on':''}" data-mset="sort=count&order=desc">Más ${MTITLE[metric].toLowerCase()}</button></div>`;
    const byCourse = {}; d.per_hole.forEach(h => (byCourse[h.course_label] ||= []).push(h));
    html = scopeSeg + courseSeg + `<div class="pills"><div class="pill dark"><b class="num">${d.total}</b><span>Total</span></div><div class="pill"><b class="num">${d.rounds_with_any}</b><span>Rondas con</span></div><div class="pill"><b class="num">${d.per_round_metric?.mean==null?'—':f2(d.per_round_metric.mean)}</b><span>Por ronda</span></div></div>
      ${perRoundBlock(d, metric, st)}
      ${d.per_hole.length?`<div class="section"><h2>Por hoyo</h2></div>${Object.entries(byCourse).map(([cl,hs])=>{ const mxc=Math.max(...hs.map(h=>h.count)); return `<div class="card vx-tally"><div class="vx-tally-h">${esc(cl)}</div>${hs.slice().sort((a,b)=>a.hole-b.hole).map(h=>`<div class="vx-tr"><span class="num">Hoyo ${h.hole}</span><span class="vx-par">Par ${h.par??'—'}</span><i style="width:${Math.max(6,h.count/mxc*100)}%"></i><b class="num">${h.count}</b></div>`).join('')}</div>`; }).join('')}`:''}
      <div class="section"><h2>Rondas</h2><span class="badge">${d.rounds_with_any} de ${d.rounds_considered}</span></div>${sortSeg}
      ${d.rounds.length?((st?.sort||'date')==='date' ? yrList(d.rounds, r => r.date, r => mrow(r, null, r, true)) : `<div class="list">${d.rounds.map(r=>mrow(r, null, r)).join('')}</div>`):'<div class="msg">No hay rondas con este filtro.</div>'}
      ${d.rounds_with_hole_detail<d.rounds_considered?`<p class="foot">Las tarjetas sin detalle hoyo por hoyo cuentan por el total que publica tu club, sin hoyos.</p>`:''}`;
  }
  el.innerHTML = html;
  el.querySelectorAll('[data-mset]').forEach(b => b.onclick = () => { const p = new URLSearchParams(b.dataset.mset); const st = { ...MQ[metric] }; p.forEach((v,k)=>{ st[k] = decodeURIComponent(v); }); if (st.range) setRange(st.range); MQ[metric] = st; history.replaceState(null, '', mlink(metric, st)); loadMetric(metric); });
  const det = el.querySelector('#modetail'), sc = el.querySelector('#moscroll');
  el.querySelectorAll('[data-mo]').forEach(b => b.onclick = () => { if (!det) return; det.hidden = false; det.textContent = b.getAttribute('aria-label') || ''; });
  if (sc) sc.scrollLeft = sc.scrollWidth;
}
/* t106u: official HI over time — step line on a real time axis, dots only where the index changed (label = change, tap → #/hi-cambio/<date>),
   tight y-axis, and a per-month birdies/pars strip on the same axis. Null when there's no official history (caller falls back). */
const offHist = () => (G.hi_history||[]).filter(h=>h.hi!=null).map(h=>({ date:h.date, hi:+h.hi })).sort((a,b)=>a.date<b.date?-1:1);
const sgnD = x => (x>0?'+':x<0?'−':'±') + f1(Math.abs(x));
function hcpEvo(since, rangeLabel){
  const all = offHist(); if (all.length < 2) return null;
  const today = new Date(Date.now()-3*3600e3).toISOString().slice(0,10);
  const before = since ? [...all].reverse().find(h=>h.date<since) : null;
  let pts = all.filter(h=>!since || h.date>=since); if (before) pts = [{ date: since, hi: before.hi, carried: true }, ...pts];
  if (!pts.length) return null;
  const changes = pts.map((p,i)=>i && !p.carried && Math.abs(p.hi-pts[i-1].hi) >= .05 ? { ...p, d: Math.round((p.hi-pts[i-1].hi)*10)/10, prev: pts[i-1] } : null).filter(Boolean);
  const W=360, pl=30, pr=14, pt=26, ch=118, sh=44, gap=22, H=pt+ch+gap+sh+18;
  const t0 = Date.parse(pts[0].date), t1 = Math.max(Date.parse(today), Date.parse(pts.at(-1).date)+864e5), X = d => pl + (Date.parse(d)-t0)*(W-pl-pr)/Math.max(1,t1-t0);
  const vs = pts.map(p=>p.hi); let lo = Math.min(...vs), hi = Math.max(...vs); const pad = Math.max(.15, (hi-lo)*.18); lo -= pad; hi += pad; if (hi-lo < .6){ const m=(hi+lo)/2; lo=m-.3; hi=m+.3; }
  const Y = v => pt + (hi-v)*ch/(hi-lo);
  let g = ''; [lo+(hi-lo)*.1, (lo+hi)/2, hi-(hi-lo)*.1].forEach(v=>{ g += `<line x1="${pl}" x2="${W-pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="${C.hair}"/><text x="${pl-6}" y="${Y(v)+3.5}" text-anchor="end" font-size="10" fill="${C.ink3}" font-family="Geist">${f1(v)}</text>`; });
  let path = `M${X(pts[0].date)},${Y(pts[0].hi)}`; pts.slice(1).forEach(p=>{ path += ` H${X(p.date)} V${Y(p.hi)}`; }); path += ` H${X(today)}`;
  const dots = changes.map((c,i)=>{ const x = X(c.date), y = Y(c.hi), col = c.d<0 ? C.primary : '#B4553F', above = c.d<0 ? y+15 : y-8;
    const lx = Math.min(W-pr-2, Math.max(pl+12, x));
    return `<a href="#/hi-cambio/${c.date}" aria-label="${dmy(c.date)}: ${f1(c.prev.hi)} a ${f1(c.hi)}"><circle cx="${x}" cy="${y}" r="13" fill="transparent"/><circle cx="${x}" cy="${y}" r="4" fill="#fff" stroke="${col}" stroke-width="2.2"/>${changes.length<=10||Math.abs(c.d)>=.3?`<text x="${lx}" y="${above}" text-anchor="middle" font-size="10" font-weight="600" fill="${col}" font-family="Geist" style="font-variant-numeric:tabular-nums">${sgnD(c.d)}</text>`:''}</a>`; }).join('');
  // month strip (birdies + pars from that month's rounds, same time axis)
  let sy = pt+ch+gap; const months = []; { let d = new Date(pts[0].date.slice(0,7)+'-01T12:00:00Z'); while (d.toISOString().slice(0,10) <= today){ months.push(d.toISOString().slice(0,7)); d.setUTCMonth(d.getUTCMonth()+1); } }
  const agg = months.map(m=>{ const cs = rounds.filter(r=>r.date.slice(0,7)===m && (!since || r.date>=since)).map(rcounts).filter(Boolean); return { m, b: cs.reduce((t,c)=>t+c.birdies,0), p: cs.reduce((t,c)=>t+c.pars,0), n: cs.length }; });
  const hasBars = agg.some(a=>a.b+a.p>0), mxv = Math.max(1, ...agg.map(a=>a.p), ...agg.map(a=>a.b)), longR = months.length > 14;
  if (!hasBars) sy -= sh - 6; const HH = hasBars ? H : H - sh + 6;
  const xm = m => { const ms = Math.max(t0, Date.parse(m+'-01')), me = Math.min(t1, Date.parse(m+'-01') + 31*864e5); return { ms, me, cx: pl + ((ms+me)/2 - t0)*(W-pl-pr)/Math.max(1,t1-t0) }; };
  const cols = window.GolfletRules ? window.GolfletRules.monthColumns(agg.filter(a => a.n).map(a => ({ month: a.m, birdies: a.b, pars: a.p }))) : [];
  const mxb = Math.max(1, ...cols.map(c => Math.max(c.birdies, c.pars)));
  const monthHtml = cols.length ? `<div class="mo-scroll" id="moscroll">${cols.map(c => `<button type="button" class="mo-col" data-mo="${c.id}" aria-label="${esc(c.detail)}"><span class="mo-yr">${c.showsYear ? c.year : ''}</span><span class="mo-bars"><i class="b" style="height:${Math.max(2, c.birdies / mxb * 28)}px"></i><i class="p" style="height:${Math.max(2, c.pars / mxb * 28)}px"></i></span><span class="mo-l">${esc(c.shortLabel)}</span></button>`).join('')}</div><p class="mo-detail" id="modetail" hidden></p>` : '';
  const now = pts.at(-1).hi, delta = Math.round((now - pts[0].hi)*10)/10, dcls = delta<0?'dn':delta>0?'up':'flat';
  const lineH = pt + ch + 18;
  return `<div class="card ot-card evo"><div class="evo-h"><div><div class="ot-h">Evolución${rangeLabel?` · ${esc(rangeLabel)}`:''} <a class="info-i" href="#/outliers" aria-label="Cómo se calcula: outliers y mejores 8 de 20"><span>i</span></a></div><small>Índice oficial de tu club</small></div>
    <div class="evo-now"><b class="num">${f1(now)}</b>${pts.length>1?`<span class="evo-d ${dcls} num">${delta<0?'↓':delta>0?'↑':'='} ${f1(Math.abs(delta))}</span>`:''}</div></div>
    <a class="hi-ch-l" href="#/cambios">Ver cambios</a>
    <svg class="chart" viewBox="0 0 ${W} ${lineH}" role="img" aria-label="Hándicap Index oficial por fecha">${g}<path d="${path}" fill="none" stroke="${C.primary}" stroke-width="2.2" stroke-linejoin="round"/>${dots}</svg>
    ${monthHtml}
    <div class="legend"><span><i style="background:${C.primary};height:3px"></i>Índice</span>${changes.length?'<span><i class="ring"></i>Cambió (tocá para ver las tarjetas)</span>':''}${cols.length?`<span><i style="background:${C.primary}"></i>Birdies</span><span><i style="background:#CFC6B2"></i>Pares</span>`:''}</div>${cols.length?'':'<p class="foot evo-nb">Sin tarjetas con hoyo por hoyo en este período para mostrar birdies y pares.</p>'}</div>`;
}
/* #/hi-cambio/<date>: the cards between the previous official record and this one */
function hiChanges(){
  const all = offHist(), out = [];
  for (let i = 1; i < all.length; i++) {
    const d = Math.round((all[i].hi - all[i - 1].hi) * 10) / 10;
    if (Math.abs(d) >= .05) out.push({ date: all[i].date, hi: all[i].hi, prev: all[i - 1], d });
  }
  return out.reverse();
}
function sCambios(){ return `<div class="bar"><span class="overline">Handicap Index</span></div><div id="cambios"></div>`; }
function hiShiftHTML(move){
  const R = window.GolfletRules;
  if (!R || !move) return '';
  if (!move.verified) return `<p class="hi-why">${esc(R.HI_UNIDENTIFIED)}</p>`;
  const groups = [['Entró en las 8', move.enteredBest8 || move.entered_best8], ['Salió de las 8', move.leftBest8 || move.left_best8], ['Salió de las últimas 20', move.agedOut || move.aged_out], ['Entró en las últimas 20', move.enteredWindow || move.entered_window]].filter(([, xs]) => xs && xs.length);
  if (!groups.length) return '';
  return groups.map(([title, xs]) => xs.map(c => `<p class="hi-why"><b>${title}</b> · ${esc(R.hiCardLine(c))}</p>`).join('')).join('');
}
function loadCambios(){
  const el = $('#cambios'); if (!el) return;
  const ch = hiChanges(), now = window.GolfletRules ? window.GolfletRules.officialIndex(G.player?.handicap_index, offHist()) : (offHist().at(-1)?.hi ?? null);
  const when = offHist().at(-1);
  if (!ch.length) { el.innerHTML = `<div class="stitle">Cambios</div><div class="msg">Todavía no hay cambios de índice en tu historial oficial.</div>`; return; }
  el.innerHTML = `<div class="stitle">Cambios</div>
    <p class="foot">Índice oficial${now != null ? ` ${f1(now)}` : ''}${when ? ` · ${dmy(when.date)}` : ''}. Abajo, cada salto del índice. La tarjeta dice su diferencial, que no es el índice.</p>
    <ol class="hi-tl">${ch.map(c => { const move = window.GolfletRules ? window.GolfletRules.hiAttribution({ rounds }, c.prev.date, c.date) : null; return `<li><a href="#/hi-cambio/${c.date}"><i></i><time>${dmy(c.date)}</time><b class="num">${f1(c.prev.hi)} → ${f1(c.hi)}</b><span class="evo-d ${c.d < 0 ? 'dn' : c.d > 0 ? 'up' : 'flat'} num">índice ${c.d < 0 ? '↓' : '↑'} ${f1(Math.abs(c.d))}</span>${hiShiftHTML(move)}</a></li>`; }).join('')}</ol>`;
}
function sHiCambio(){ return `<div class="bar"><span class="overline">Handicap Index</span></div><div id="hicambio"></div>`; }
function loadHiCambio(date){
  const el = $('#hicambio'); if (!el) return; const all = offHist(), i = all.findIndex(h=>h.date===date);
  if (i < 1){ el.innerHTML = `<div class="msg">No encontramos ese cambio en el historial oficial.</div>`; return; }
  const cur = all[i], prev = all[i-1], d = Math.round((cur.hi-prev.hi)*10)/10;
  const cards = rounds.filter(r=>r.date>prev.date && r.date<=cur.date).sort((a,b)=>a.date<b.date?1:-1);
  const move = window.GolfletRules ? window.GolfletRules.hiAttribution({ rounds }, prev.date, cur.date) : null;
  el.innerHTML = `<div class="stitle num">${f1(prev.hi)} → ${f1(cur.hi)} <span class="evo-d ${d<0?'dn':d>0?'up':'flat'}">índice ${d<0?'↓':'↑'} ${f1(Math.abs(d))}</span></div>
    <p class="foot" style="margin-top:6px">El índice se actualizó el ${dmy(cur.date)}. El diferencial de abajo es de la tarjeta, no del índice.</p>
    ${hiShiftHTML(move)}
    <div class="section"><h2>Tarjetas de ese período</h2><span class="badge">${cards.length}</span></div>
    ${cards.length ? `${yrList(cards, r => r.date, r => roundRow(r, false, false))}<p class="foot">Diferencial de cada tarjeta según Golflet: ${cards.filter(r=>r.differential_computed!=null).map(r=>`${dmy(r.date)} ${f1(r.differential_computed)}`).join(' · ') || '—'}. Una tarjeta mueve el índice solo si entra entre tus 8 mejores de las últimas 20, o si saca una de las que estaban.</p>`
      : `<div class="msg">No hay tarjetas tuyas en Golflet entre esas fechas. El cambio puede venir de una tarjeta que todavía no trajimos o de un recálculo de tu club.</div>`}
    <a class="btn ghost" href="#/outliers" style="margin-top:14px">Cómo se calcula el índice</a>`;
}
/* t110u: Profesores (player side). Permissions default OFF; only the player toggles them; server enforces + audits. */
let PROFS = null;
const profSub = p => [p.locations?.slice(0,2).join(' · '), p.can_view_metrics ? 'Ve tus métricas' : 'No ve tus métricas', p.can_hear_audio ? 'escucha tus audios' : ''].filter(Boolean).join(' · ');
async function loadProfsCard(){
  const el = $('#profs'); if (!el) return;
  try { PROFS = (await api('/api/profesores')).profesores; } catch(e){ el.innerHTML = errBox(e, 'tus profesores'); return; } if (!$('#profs')) return;
  el.innerHTML = `<div class="card" style="padding-top:4px;padding-bottom:4px">${PROFS.map(p=>`<a class="acctrow" href="#/profesor/${encodeURIComponent(p.profesor_id)}"><span class="avatar sm">${esc(compInit(p.name))}</span><div class="meta2"><div class="nm">${esc(p.name)}${p.verified ? VBADGE : ''}</div><div class="st">${esc(profSub(p))}</div></div>${p.new_content ? `<span class="badge gold">${p.new_content} nuevo${p.new_content>1?'s':''}</span>` : ''}${ICON.chev}</a>`).join('')}
    <a class="acctrow" href="#/profesores/encontrar/1"><span class="avatar sm ghost"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/></svg></span><div class="meta2"><div class="nm">Encontrar un profesor</div><div class="st">5 preguntas y te mostramos los que mejor te quedan</div></div>${ICON.chev}</a>
    <a class="acctrow" href="#/profesores/buscar"><span class="avatar sm ghost">+</span><div class="meta2"><div class="nm">Agregar un profesor</div><div class="st">${PROF_LINKS ? 'Buscalo por nombre o matrícula, o mandale un link' : 'Buscalo por nombre o matrícula entre los profesores de Golflet'}</div></div>${ICON.chev}</a></div>
    ${PROFS.length ? '' : '<p class="foot">Tu profesor solo ve tus métricas si vos lo activás. Notas, estrategia y tee times nunca se comparten.</p>'}`;
}
function sMisProfes(){ return `<div class="bar"><span class="overline">Tu cuenta</span></div><div class="stitle">Mis profesores</div><div id="profs" style="margin-top:14px"><div class="card" style="text-align:center"><span class="spin"></span></div></div>`; }
function sProfBuscar(){ return `<div class="bar"><span class="overline">Profesores</span></div><div class="stitle">Agregar un profesor</div>
  <div class="card pac" style="margin-top:14px"><label class="tt-lab" for="pbq">Nombre o matrícula</label>
    <div class="pac-box"><input id="pbq" type="search" role="combobox" aria-expanded="false" aria-controls="pbl" aria-autocomplete="list" autocomplete="off" maxlength="60" placeholder="Empezá a escribir, por ejemplo Manu"><ul id="pbl" class="pac-list" role="listbox" hidden></ul></div>
    <p class="foot" id="pbh">Escribí al menos 2 letras. Tocá un profesor para agregarlo: no ve nada tuyo hasta que lo actives.</p></div>
  <div class="section"><h2>¿No sabés a quién elegir?</h2></div><div class="card" style="padding-top:4px;padding-bottom:4px"><a class="acctrow" href="#/profesores/encontrar/1"><span class="avatar sm ghost"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/></svg></span><div class="meta2"><div class="nm">Encontrar un profesor</div><div class="st">5 preguntas y te mostramos los profesores de Golflet que mejor te quedan</div></div>${ICON.chev}</a></div>
  ${PROF_LINKS ? `<div class="section"><h2>¿No está en Golflet?</h2></div><div class="card" id="pbinv"><p style="margin:0 0 12px">Mandale un link: cuando lo abra y active su cuenta de profesor, queda en tu lista. Vence en 14 días y sirve una sola vez.</p><button class="btn ghost" type="button" id="pbmk">Crear link para mi profesor</button></div>` : ''}`; }
const PROF_LINKS = false;   // invite links go live with the /p/<token> landing (needs profesor accounts with email)
const VBADGE = '<span class="vbadge" title="Profesor verificado por Golflet"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.3 1.7 2.9-.1.9 2.7 2.4 1.7-.9 2.7.9 2.7-2.4 1.7-.9 2.7-2.9-.1L12 21.2l-2.3-1.7-2.9.1-.9-2.7-2.4-1.7.9-2.7-.9-2.7 2.4-1.7.9-2.7 2.9.1z" fill="#1D9BF0"/><path d="M8.3 12.2l2.5 2.4 4.9-5" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="sr">Verificado</span></span>';
function bindProfBuscar(){
  const inp = $('#pbq'); if (!inp) return; const list = $('#pbl'), help = $('#pbh'); let t = 0, seq = 0, items = [], act = -1;
  const close = () => { list.hidden = true; inp.setAttribute('aria-expanded', 'false'); act = -1; };
  const paint = () => { list.querySelectorAll('[role=option]').forEach((li, k) => { li.setAttribute('aria-selected', k === act ? 'true' : 'false'); if (k === act) { inp.setAttribute('aria-activedescendant', li.id); li.scrollIntoView({ block: 'nearest' }); } }); };
  const pick = async k => { const p = items[k]; if (!p) return;
    if (p.linked) { location.hash = '#/profesor/' + encodeURIComponent(p.profesor_id); return; }
    const li = list.querySelector(`#pbo${k}`); if (li) li.classList.add('busy');
    try { await api('/api/profesores', { method:'POST', body: JSON.stringify({ profesor_id: p.profesor_id }) }); toast(`${p.name} quedó en tus profesores`); location.hash = '#/profesor/' + encodeURIComponent(p.profesor_id); }
    catch(err){ if (li) li.classList.remove('busy'); toast(errText(err)); } };
  const run = async () => { const qv = inp.value.trim(), my = ++seq;
    if (qv.length < 2) { close(); help.textContent = 'Escribí al menos 2 letras. Tocá un profesor para agregarlo: no ve nada tuyo hasta que lo actives.'; return; }
    let r; try { r = (await api(`/api/profesores/search?q=${encodeURIComponent(qv)}`)).profesores; } catch(err){ if (my === seq) help.textContent = errText(err, 'la búsqueda'); return; }
    if (my !== seq) return; items = r; act = r.length ? 0 : -1;
    list.innerHTML = r.length ? r.map((p, k) => `<li id="pbo${k}" role="option" aria-selected="false" data-k="${k}"><span class="avatar sm">${esc(compInit(p.name))}</span><span class="pac-t"><b>${esc(p.name)}${p.verified ? VBADGE : ''}</b><small>${esc(p.locations.join(' · ') || (p.pending ? 'Todavía no activó su cuenta' : 'Sin lugares cargados'))}</small></span><span class="pac-a">${p.linked ? 'Ya está' : 'Agregar'}</span></li>`).join('')
      : `<li class="pac-empty" role="presentation">No encontramos profesores con “${esc(qv)}”.</li>`;
    list.hidden = false; inp.setAttribute('aria-expanded', 'true'); paint();
    list.querySelectorAll('[role=option]').forEach(li => { li.onmousedown = e => e.preventDefault(); li.onclick = () => pick(+li.dataset.k); });
    help.textContent = r.length ? `${r.length} ${r.length === 1 ? 'profesor' : 'profesores'}` : 'Probá con otra parte del nombre o con su matrícula.'; };
  inp.oninput = () => { clearTimeout(t); t = setTimeout(run, 200); };
  inp.onkeydown = e => { if (list.hidden || !items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); act = (act + 1) % items.length; paint(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); act = (act - 1 + items.length) % items.length; paint(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (act >= 0) pick(act); }
    else if (e.key === 'Escape') close(); };
  inp.onblur = () => setTimeout(close, 150); inp.onfocus = () => { if (items.length && inp.value.trim().length >= 2) { list.hidden = false; inp.setAttribute('aria-expanded', 'true'); } };
  if (matchMedia("(pointer:fine)").matches) inp.focus();   // t155u: no auto keyboard on phones
  if ($('#pbmk')) $('#pbmk').onclick = async () => { const box = $('#pbinv'); try { const l = await api('/api/profesores/invite', { method:'POST' });
    box.innerHTML = `<p style="margin:0 0 8px">Link para tu profesor (vence el ${dmy(String(l.expires_at).slice(0,10))}):</p><input class="pb-url" readonly value="${esc(l.url)}" aria-label="Link"><div class="pb-acts"><button class="btn sm" type="button" id="pbcp">Copiar</button><a class="btn ghost sm" href="https://wa.me/?text=${encodeURIComponent(l.wa_text)}" target="_blank" rel="noopener">WhatsApp</a></div>`;
    $('#pbcp').onclick = () => { navigator.clipboard?.writeText(l.url).then(()=>toast('Link copiado')).catch(()=>{ const i=$('.pb-url'); i.select(); }); };
  } catch(err){ toast(errText(err)); } };
}
/* t112u phase D: classes + content (student side) */
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const clsRow = (x, del) => `<div class="card cl-row">${dateBlock(x.date)}<div class="cl-b"><b>${esc(x.worked_on)}</b>${x.recommendations ? `<p><span>Para practicar:</span> ${esc(x.recommendations)}</p>` : ''}</div>${del ? `<button class="cl-x" type="button" data-dels="${x.id}" aria-label="Borrar clase">×</button>` : ''}</div>`;
const ctRow = (c, del) => c.kind === 'link'
  ? `<a class="card ct-row" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer"><span class="ct-ic">${/youtube|youtu\.be|vimeo|instagram|tiktok/.test(c.url) ? '▶' : '↗'}</span><span class="ct-b"><b>${esc(c.title)}${!del && !c.seen_at ? ' <span class="badge gold">Nuevo</span>' : ''}</b><small>${esc(host(c.url))}${c.body ? ' · ' + esc(c.body) : ''}</small></span>${del ? `<button class="cl-x" type="button" data-delc="${c.id}" aria-label="Borrar">×</button>` : ICON.chev}</a>`
  : `<div class="card ct-row tip"><span class="ct-ic">✦</span><span class="ct-b"><b>${esc(c.title)}${!del && !c.seen_at ? ' <span class="badge gold">Nuevo</span>' : ''}</b><p>${esc(c.body || '')}</p></span>${del ? `<button class="cl-x" type="button" data-delc="${c.id}" aria-label="Borrar">×</button>` : ''}</div>`;
async function loadMyClasses(id, p){
  const el = $('#prcl'); if (!el) return;
  try { const d = await api(`/api/profesores/${encodeURIComponent(id)}/clases`); if (!$('#prcl')) return;
    if (!d.sessions.length && !d.content.length) { el.innerHTML = ''; return; }
    el.innerHTML = (d.content.length ? `<div class="section"><h2>Para practicar</h2><span class="badge">${d.content.length}</span></div>${d.content.map(c => ctRow(c)).join('')}` : '')
      + (d.sessions.length ? `<div class="section"><h2>Clases</h2><span class="badge">${d.sessions.length}</span></div>${yrList(d.sessions, x => x.date, x => clsRow(x), 'cl-list')}` : '');
    const unseen = d.content.filter(c => !c.seen_at).map(c => c.id); if (unseen.length) api('/api/profesores/clases/visto', { method:'POST', body: JSON.stringify({ ids: unseen }) }).catch(() => {});
  } catch(e){ el.innerHTML = errBox(e, 'tus clases'); }
}
function sProfesor(){ return `<div class="bar"><span class="overline">Profesores</span></div><div id="prof"><div style="padding:60px 0;text-align:center"><span class="spin"></span></div></div>
  <div class="section"><h2>Otros profesores</h2></div><div class="card" style="padding-top:4px;padding-bottom:4px"><a class="acctrow" href="#/profesores"><span class="avatar sm ghost"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="9" r="3.2"/><path d="M3.5 18.5c.9-2.7 3-4.2 5.5-4.2s4.6 1.5 5.5 4.2"/><circle cx="16.5" cy="8" r="2.6"/><path d="M16 13.2c2.1 0 3.8 1.2 4.5 3.4"/></svg></span><div class="meta2"><div class="nm">Mis profesores</div><div class="st">Podés tener más de un profesor</div></div>${ICON.chev}</a><a class="acctrow" href="#/profesores/buscar"><span class="avatar sm ghost">+</span><div class="meta2"><div class="nm">Agregar otro profesor</div><div class="st">Buscalo por nombre o matrícula, o encontrá uno</div></div>${ICON.chev}</a></div>`; }
async function loadProfesor(id){
  const el = $('#prof'); if (!el) return;
  try { const list = (await api('/api/profesores')).profesores, p = list.find(x=>x.profesor_id===id); if (!$('#prof')) return;
    if (!p){ el.innerHTML = `<div class="msg">Ese profesor no está en tu lista.</div><a class="btn ghost" href="#/profesores/buscar" style="margin-top:12px">Agregar un profesor</a>`; return; }
    const sw = (k, t, d) => `<label class="gg-srow"><span><b>${t}</b><small>${d}</small></span><span class="switch"><input type="checkbox" data-pp="${k}" ${p[k]?'checked':''}><i></i></span></label>`;
    el.innerHTML = `<div class="prof-h"><span class="avatar">${esc(compInit(p.name))}</span><div><div class="stitle">${esc(p.name)}${p.verified ? VBADGE : ''}</div>${p.locations.length?`<div class="s">${esc(p.locations.join(' · '))}</div>`:''}</div></div>
      ${p.pending ? `<div class="msg" style="margin-top:12px">Todavía no activó su cuenta de profesor. Cuando la active, va a ver solo lo que actives acá.</div>` : ''}
      ${p.bio?`<p class="prof-bio">${esc(p.bio)}</p>`:''}
      <div id="prcl"></div>
      <div class="section"><h2>Qué puede ver</h2></div><div class="card gg-share">
        ${sw('can_view_metrics','Puede ver mis métricas','Tus estadísticas y tarjetas, según lo que elegiste en Qué comparto.')}
        ${sw('can_hear_audio','Puede escuchar mis audios post juego','Solo los audios que grabás al terminar la ronda. Es la única excepción: tus notas de voz siguen siendo privadas para todos los demás.')}</div>
      <p class="foot">Tus notas, la estrategia de la cancha y tus tee times nunca se comparten. Podés cambiar esto cuando quieras. <a class="link" href="#/compartir">Qué comparto</a></p>
      <button class="btn ghost danger" type="button" id="prdel" style="margin-top:18px">Sacar de mis profesores</button>`;
    el.querySelectorAll('[data-pp]').forEach(i => i.onchange = async () => { i.disabled = true; try { await api(`/api/profesores/${encodeURIComponent(id)}`, { method:'PATCH', body: JSON.stringify({ [i.dataset.pp]: i.checked }) }); toast(i.checked ? 'Listo, activado' : 'Listo, desactivado'); } catch(err){ i.checked = !i.checked; toast(errText(err)); } i.disabled = false; });
    loadMyClasses(id, p);
    $('#prdel').onclick = async () => { const b = $('#prdel'); if (!(await askInline(b, `${p.name} deja de ver todo lo tuyo.`, 'Sí, sacarlo'))) return;
      try { await api(`/api/profesores/${encodeURIComponent(id)}`, { method:'DELETE' }); toast('Profesor eliminado'); location.hash = '#/cuenta'; } catch(err){ toast(errText(err)); } };
  } catch(e){ el.innerHTML = errBox(e, 'este profesor'); }
}
/* t112u: profesor space (active profesor accounts only; server enforces every read) */
let PROFE = null;
const DAYL = { lun:'Lun', mar:'Mar', mie:'Mié', jue:'Jue', vie:'Vie', sab:'Sáb', dom:'Dom' }, SLOTL = { m:'Mañana', t:'Tarde', n:'Noche' };
const FMTL = { individual:'Individual', grupal:'Grupal', en_cancha:'En la cancha', driving:'Driving range', online:'Online (videos)' };
const LEVELS = [[-10,0],[0,9],[9,18],[18,28],[28,54]], LEVL = l => l[0] < 0 ? '0 o menos' : l[1] >= 54 ? `${l[0]}+` : `${l[0]} a ${l[1]}`;
const money = n => n == null ? '' : '$' + Number(n).toLocaleString('es-AR');
function sProfe(){ return `<div class="bar"><span class="overline">Espacio profesor</span></div><div id="profe"><div style="padding:60px 0;text-align:center"><span class="spin"></span></div></div>`; }
async function loadProfe(){
  const el = $('#profe'); if (!el) return;
  try { const [{ alumnos }, { profile: me }] = await Promise.all([api('/api/profe/alumnos'), api('/api/profe/perfil')]); if (!$('#profe')) return;
    const done = [me.bio, me.method, me.locations.length, Object.keys(me.availability||{}).length, me.levels.length, me.price_min ?? me.price_max, me.formats.length].filter(Boolean).length;
    el.innerHTML = `<div class="stitle">${esc(me.display_name)}${me.verified ? VBADGE : ''}</div>
      <a class="card prof-me" href="#/profe/perfil"><div><b>Tu perfil</b><span>${done < 7 ? `Completo ${done} de 7: los jugadores te encuentran por dónde das clases, horarios y nivel.` : 'Completo. Tocá para editarlo.'}</span></div>${ICON.chev}</a>
      <div class="section"><h2>Tus alumnos</h2><span class="badge">${alumnos.length}</span></div>
      ${alumnos.length ? `<div class="list">${alumnos.map(a => `<a class="row" href="#/profe/alumno/${encodeURIComponent(a.player_id)}"><span class="avatar sm">${esc(compInit(a.name))}</span><div class="body"><div class="t">${esc(a.name)}</div><div class="s">Desde ${dmy(String(a.linked_at).slice(0,10))}${a.can_hear_audio ? ' · comparte audios post juego' : ''}</div></div>${ICON.chev}</a>`).join('')}</div>`
        : `<div class="card tt-empty"><b>Todavía ningún alumno compartió sus métricas</b><span>Cuando un jugador te agregue y active “Puede ver mis métricas”, aparece acá. Solo ves lo que cada uno elige compartir.</span></div>`}
      <p class="foot">Nunca ves notas, estrategia de la cancha ni tee times de tus alumnos.</p>`;
  } catch(e){ el.innerHTML = errBox(e, 'tu espacio de profesor'); }
}
function sProfePerfil(){ return `<div class="bar"><span class="overline">Espacio profesor</span></div><div class="stitle">Tu perfil</div><div id="profep"><div style="padding:60px 0;text-align:center"><span class="spin"></span></div></div>`; }
async function loadProfePerfil(){
  const el = $('#profep'); if (!el) return;
  try { const { profile: p } = await api('/api/profe/perfil'); if (!$('#profep')) return; const av = JSON.parse(JSON.stringify(p.availability || {}));
    const has = (l) => p.levels.some(x => x[0] === l[0] && x[1] === l[1]);
    el.innerHTML = `<form class="card gg-form pf-form" id="pff" novalidate>
      <label>Nombre<input name="display_name" maxlength="80" value="${esc(p.display_name)}" required></label>
      <label>Sobre vos <small>(historial, logros)</small><textarea name="bio" rows="4" maxlength="1500">${esc(p.bio||'')}</textarea></label>
      <label>Cómo das clases <small>(metodología)</small><textarea name="method" rows="4" maxlength="1500">${esc(p.method||'')}</textarea></label>
      <label>Dónde das clases <small>(separá con comas)</small><input name="locations" maxlength="400" value="${esc(p.locations.join(', '))}" placeholder="Capital, Driving Norte"></label>
      <fieldset class="pf-fs"><legend>Horarios disponibles</legend><div class="avgrid" role="group" aria-label="Disponibilidad">
        <span></span>${Object.values(SLOTL).map(l=>`<span class="avh">${l}</span>`).join('')}
        ${Object.keys(DAYL).map(d=>`<span class="avd">${DAYL[d]}</span>${Object.keys(SLOTL).map(sl=>`<button type="button" class="avc ${(av[d]||[]).includes(sl)?'on':''}" data-d="${d}" data-s="${sl}" aria-pressed="${(av[d]||[]).includes(sl)}" aria-label="${DAYL[d]} ${SLOTL[sl]}"></button>`).join('')}`).join('')}</div></fieldset>
      <fieldset class="pf-fs"><legend>Niveles (hándicap)</legend><div class="chips">${LEVELS.map((l,k)=>`<label class="chk"><input type="checkbox" name="lv" value="${k}" ${has(l)?'checked':''}><span>${LEVL(l)}</span></label>`).join('')}</div></fieldset>
      <fieldset class="pf-fs"><legend>Precio por clase (ARS)</legend><div class="pf-row"><label>Desde<input name="price_min" inputmode="numeric" value="${p.price_min ?? ''}"></label><label>Hasta<input name="price_max" inputmode="numeric" value="${p.price_max ?? ''}"></label></div></fieldset>
      <fieldset class="pf-fs"><legend>Formatos</legend><div class="chips">${Object.entries(FMTL).map(([k,l])=>`<label class="chk"><input type="checkbox" name="fmt" value="${k}" ${p.formats.includes(k)?'checked':''}><span>${l}</span></label>`).join('')}</div></fieldset>
      <div id="pfmsg"></div><button class="btn" type="submit">Guardar</button></form>`;
    el.querySelectorAll('.avc').forEach(b => b.onclick = () => { const d = b.dataset.d, sl = b.dataset.s, cur = av[d] || []; av[d] = cur.includes(sl) ? cur.filter(x=>x!==sl) : [...cur, sl]; b.classList.toggle('on'); b.setAttribute('aria-pressed', b.classList.contains('on')); });
    $('#pff').onsubmit = async e => { e.preventDefault(); const f = e.target, m = $('#pfmsg');
      const body = { display_name: f.display_name.value, bio: f.bio.value, method: f.method.value, locations: f.locations.value.split(',').map(x=>x.trim()).filter(Boolean), availability: av,
        levels: [...f.querySelectorAll('[name=lv]:checked')].map(c => LEVELS[+c.value]), price_min: f.price_min.value || null, price_max: f.price_max.value || null, formats: [...f.querySelectorAll('[name=fmt]:checked')].map(c=>c.value) };
      try { await api('/api/profe/perfil', { method:'PATCH', body: JSON.stringify(body) }); toast('Perfil guardado'); location.hash = '#/profe'; } catch(err){ m.innerHTML = `<div class="msg err">${esc(errText(err))}</div>`; } };
  } catch(e){ el.innerHTML = errBox(e, 'tu perfil'); }
}
async function loadPairClasses(id, name){
  const el = $('#profcl'); if (!el) return; const first = esc(String(name || '').split(' ')[0]);
  try { const d = await api(`/api/profe/alumnos/${encodeURIComponent(id)}/clases`); if (!$('#profcl')) return;
    el.innerHTML = `<div class="section"><h2>Clases</h2><a class="link" href="#/profe/alumno/${encodeURIComponent(id)}/clase">Registrar clase</a></div>
      ${d.sessions.length ? yrList(d.sessions, x => x.date, x => clsRow(x, true), 'cl-list') : `<p class="foot">Anotá qué trabajaron y qué tiene que practicar: ${first} lo ve en su app.</p>`}
      <div class="section"><h2>Contenido asignado</h2><a class="link" href="#/profe/alumno/${encodeURIComponent(id)}/contenido">Asignar</a></div>
      ${d.content.length ? d.content.map(c => ctRow(c, true)).join('') : `<p class="foot">Mandale videos (links), consejos o explicaciones.</p>`}
      <div class="card vid-gate"><b>Videos propios</b><span>${d.plan.video_upload ? 'Podés subir videos para este alumno.' : d.plan.premium ? 'La subida de videos todavía no está habilitada.' : `Para que subas videos tuyos, ${first} necesita Golflet Premium (lo paga el alumno). Todavía no está disponible.`}</span></div>`;
    el.querySelectorAll('[data-dels],[data-delc]').forEach(b => b.onclick = async e => { e.preventDefault(); e.stopPropagation(); const s_ = b.dataset.dels, c_ = b.dataset.delc;
      if (!(await askInline(b, s_ ? 'Se borra esta clase también para tu alumno.' : 'Se borra también para tu alumno.', 'Sí, borrar'))) return;
      try { await api(s_ ? `/api/profe/sesiones/${s_}` : `/api/profe/contenido/${c_}`, { method:'DELETE' }); toast('Borrado'); loadPairClasses(id, name); } catch(err){ toast(errText(err)); } });
  } catch(e){ el.innerHTML = errBox(e, 'las clases'); }
}
function sProfeClase(){ return `<div class="bar"><span class="overline">Espacio profesor</span></div><div class="stitle">Registrar clase</div>
  <form class="card gg-form" id="pcf" novalidate style="margin-top:14px"><label>Fecha<input name="date" type="date" required></label>
  <label>Qué trabajaron<textarea name="worked_on" rows="4" maxlength="2000" required placeholder="Ej.: postura en el address, salida de bunker"></textarea></label>
  <label>Para practicar <small>(opcional)</small><textarea name="recommendations" rows="4" maxlength="2000" placeholder="Ej.: 20 tiros por día con el hierro 7, foco en el tempo"></textarea></label>
  <div id="pcmsg"></div><button class="btn" type="submit">Guardar clase</button></form>`; }
function bindProfeClase(id){ const f = $('#pcf'); if (!f) return; const t = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10); f.date.value = t; f.date.max = t;
  f.onsubmit = async e => { e.preventDefault(); try { await api(`/api/profe/alumnos/${encodeURIComponent(id)}/sesiones`, { method:'POST', body: JSON.stringify({ date: f.date.value, worked_on: f.worked_on.value, recommendations: f.recommendations.value }) }); toast('Clase guardada'); location.hash = '#/profe/alumno/' + encodeURIComponent(id); }
    catch(err){ $('#pcmsg').innerHTML = `<div class="msg err">${esc(errText(err))}</div>`; } }; }
function sProfeContenido(){ return `<div class="bar"><span class="overline">Espacio profesor</span></div><div class="stitle">Asignar contenido</div><div id="pct"><div style="padding:40px 0;text-align:center"><span class="spin"></span></div></div>`; }
async function loadProfeContenido(id){
  const el = $('#pct'); if (!el) return; let kind = 'tip';
  let lib = [], plan = { video_upload: false, premium: false };
  try { [lib, plan] = await Promise.all([api('/api/profe/biblioteca').then(d => d.items), api(`/api/profe/alumnos/${encodeURIComponent(id)}/clases`).then(d => d.plan)]); } catch(e){ el.innerHTML = errBox(e, 'el contenido'); return; }
  const draw = () => { el.innerHTML = `<div class="seg pct-seg" role="tablist">${[['tip','Consejo'],['link','Link o video'],['video','Video propio']].map(([k,l]) => `<button type="button" role="tab" class="${k===kind?'on':''}" aria-selected="${k===kind}" data-k="${k}">${l}</button>`).join('')}</div>
    ${kind === 'video' ? `<div class="card vid-gate" style="margin-top:14px"><b>Subir un video tuyo</b><span>${plan.video_upload ? 'Disponible.' : plan.premium ? 'La subida de videos todavía no está habilitada.' : 'Solo si tu alumno tiene Golflet Premium (lo paga el alumno, no vos). Todavía no está disponible: mientras tanto, mandale un link de YouTube o Vimeo.'}</span></div>`
    : `<form class="card gg-form" id="pctf" novalidate style="margin-top:14px"><label>Título<input name="title" maxlength="120" required placeholder="${kind === 'tip' ? 'Ej.: Tempo en el backswing' : 'Ej.: Drill de putting a 1 metro'}"></label>
      ${kind === 'link' ? `<label>Link<input name="url" type="url" inputmode="url" required placeholder="https://youtu.be/…"></label><label>Nota <small>(opcional)</small><textarea name="body" rows="3" maxlength="3000"></textarea></label>` : `<label>Consejo<textarea name="body" rows="5" maxlength="3000" required></textarea></label>`}
      <div id="pctmsg"></div><button class="btn" type="submit">Asignar</button></form>
      ${lib.filter(x => x.kind === kind).length ? `<div class="section"><h2>Tu biblioteca</h2></div><p class="foot" style="margin-top:-4px">Lo que ya mandaste. Tocá para reusarlo.</p><div class="chips">${lib.filter(x => x.kind === kind).map((x, i) => `<button type="button" class="chip-b" data-lib="${lib.indexOf(x)}">${esc(x.title)}</button>`).join('')}</div>` : ''}`}`;
    el.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { kind = b.dataset.k; draw(); });
    el.querySelectorAll('[data-lib]').forEach(b => b.onclick = () => { const x = lib[+b.dataset.lib], f = $('#pctf'); f.title.value = x.title; if (f.url) f.url.value = x.url || ''; if (f.body) f.body.value = x.body || ''; });
    const f = $('#pctf'); if (f) f.onsubmit = async e => { e.preventDefault();
      try { await api(`/api/profe/alumnos/${encodeURIComponent(id)}/contenido`, { method:'POST', body: JSON.stringify({ kind, title: f.title.value, url: f.url?.value, body: f.body?.value }) }); toast('Asignado'); location.hash = '#/profe/alumno/' + encodeURIComponent(id); }
      catch(err){ $('#pctmsg').innerHTML = `<div class="msg err">${esc(errText(err))}</div>`; } };
  }; draw();
}
function sProfeAlumno(){ return `<div class="bar"><span class="overline">Alumno</span></div><div id="profea"><div style="padding:60px 0;text-align:center"><span class="spin"></span></div></div>`; }
async function loadProfeAlumno(id){
  const el = $('#profea'); if (!el) return;
  try { const { alumno: a } = await api(`/api/profe/alumnos/${encodeURIComponent(id)}`); if (!$('#profea')) return;
    const hid = new Set(a.hidden || []), no = k => hid.has(k) ? '<span class="badge">No compartido</span>' : '';
    const st = (k, v, href) => `<div class="card mini stat"><div class="k">${k}</div><div class="v num">${v ?? '—'}</div></div>`;
    let h = `<div class="prof-h"><span class="avatar">${esc(compInit(a.name))}</span><div><div class="stitle">${esc(a.name)}</div>${a.handicap_index != null ? `<div class="s">HCP Index <b class="num">${f1(a.handicap_index)}</b></div>` : ''}</div></div>`;
    h += `<div class="section"><h2>Rondas y scores</h2>${no('scores')}</div>` + (a.rounds != null ? `<div class="grid3">${st('Rondas', a.rounds)}${st('Gross prom.', f1(a.avg_gross))}${st('Mejor gross', a.best_gross)}${st('Neto prom.', f1(a.avg_net))}${st('Mejor neto', a.best_net)}</div>` : '');
    if (a.types) h += `<div class="section"><h2>Por ronda</h2></div><div class="grid3">${[['eagles','Águilas'],['birdies','Birdies'],['pars','Pares'],['bogeys','Bogeys'],['doubles','Doble o peor']].map(([k,l])=>st(l, f1(a.types[k]?.per_round))).join('')}</div>`;
    else h += `<div class="section"><h2>Águilas, birdies, pares y bogeys</h2>${no('score_types')}</div>`;
    if (a.par) h += `<div class="section"><h2>Promedio sobre el par</h2></div><div class="grid3">${[3,4,5].map(n=>st(`Par ${n}`, a.par['par'+n]?.avg_to_par == null ? '—' : (a.par['par'+n].avg_to_par > 0 ? '+' : '') + f1(a.par['par'+n].avg_to_par))).join('')}</div>`;
    else h += `<div class="section"><h2>Resultados por hoyo</h2>${no('holes')}</div>`;
    if (a.putting) h += `<div class="section"><h2>Putts, greens y fairways</h2></div><div class="grid3">${a.putting.avg_putts !== undefined ? st('Putts', f1(a.putting.avg_putts)) : ''}${a.putting.avg_gir !== undefined ? st('Greens', f1(a.putting.avg_gir)) : ''}${a.putting.avg_fir !== undefined ? st('Fairways', f1(a.putting.avg_fir)) : ''}</div>`;
    if (a.recent?.length) h += `<div class="section"><h2>Últimas tarjetas</h2></div>${yrList(a.recent, r => r.date, r=>`<div class="row">${dateBlock(r.date)}<div class="body"><div class="t">${esc(r.course_label||'')}</div></div><div class="score"><b class="num">${r.gross ?? '—'}</b><span>neto ${r.net ?? '—'}</span></div></div>`)}`;
    if (a.can_hear_audio) h += `<div class="section"><h2>Audios post juego</h2></div><div id="profaud"><div class="card" style="text-align:center"><span class="spin"></span></div></div>`;
    h += `<div id="profcl"></div>`;
    h += `<p class="foot">Ves solo lo que ${esc(a.name.split(' ')[0])} eligió compartir. Notas, estrategia y tee times son siempre privados.</p>`;
    el.innerHTML = h;
    loadPairClasses(id, a.name);
    if (a.can_hear_audio) { try { const { audios } = await api(`/api/profe/alumnos/${encodeURIComponent(id)}/audios`); const box = $('#profaud'); if (!box) return;
      box.innerHTML = audios.length ? `<div class="list">${audios.map(x=>`<div class="row aud"><div class="body"><div class="t">${dmy(x.date)}${x.course_label ? ' · ' + esc(x.course_label) : ''}</div><audio controls preload="none" src="/api/profe/alumnos/${encodeURIComponent(id)}/audios/${x.id}"></audio></div></div>`).join('')}</div>` : '<p class="foot">Todavía no grabó audios post juego.</p>';
    } catch(e){ const box = $('#profaud'); if (box) box.innerHTML = errBox(e, 'los audios'); } }
  } catch(e){ el.innerHTML = errBox(e, 'este alumno'); }
}
/* t111u: Encontrar un profesor — 5 steps (own pages, no modal) + results */
let MATCH = null;
const PFREQ = [['lt1m','Menos de 1 por mes'],['1_2m','1 o 2 por mes'],['semanal','Semanal'],['2sem','2 o más por semana']];
const BUDG = [['b1','Hasta $20.000'],['b2','$20.000 a $35.000'],['b3','$35.000 a $50.000'],['b4','Más de $50.000']];
const CFREQ = [['suelta','Clase suelta'],['semanal','Semanal'],['quincenal','Quincenal'],['mensual','Mensual']];
const MATCHQ = ['¿Cuándo podés tomar clases?', '¿Cuál es tu nivel?', '¿Cada cuánto jugás?', '¿Dónde te queda cómodo?', '¿Cuánto querés invertir?'];
function sMatch(step){ return `<div class="bar"><span class="overline">Encontrar un profesor</span></div><div id="mt"><div style="padding:60px 0;text-align:center"><span class="spin"></span></div></div>`; }
async function loadMatch(step){
  const el = $('#mt'); if (!el) return;
  try { if (!MATCH) { const d = await api('/api/profesores/match/answers'); MATCH = { a: d.answers || { availability:{}, hcp: d.suggested_hcp, play_freq:null, locations:[], budget:null, class_freq:null }, sug: d.suggested_hcp, locs: d.locations }; if (MATCH.a.hcp == null) MATCH.a.hcp = d.suggested_hcp; }
  } catch(e){ el.innerHTML = errBox(e, 'las preguntas'); return; }
  if (step === 'resultados') return loadMatchResults(el);
  const n = Math.min(5, Math.max(1, parseInt(step) || 1)), a = MATCH.a;
  const dots = `<div class="mt-dots" aria-label="Paso ${n} de 5">${[1,2,3,4,5].map(i=>`<span class="${i<n?'done':i===n?'on':''}"></span>`).join('')}</div>`;
  const chips = (opts, cur, attr) => `<div class="mt-opts">${opts.map(([k,l])=>`<button type="button" class="mt-opt ${ (Array.isArray(cur)?cur.includes(k):cur===k) ?'on':''}" ${attr}="${esc(k)}" aria-pressed="${Array.isArray(cur)?cur.includes(k):cur===k}">${esc(l)}</button>`).join('')}</div>`;
  let body = '';
  if (n === 1) body = `<p class="mt-help">Tocá los horarios que te sirven.</p><div class="avgrid mt-grid"><span></span>${Object.values(SLOTL).map(l=>`<span class="avh">${l}</span>`).join('')}${Object.keys(DAYL).map(d=>`<span class="avd">${DAYL[d]}</span>${Object.keys(SLOTL).map(sl=>`<button type="button" class="avc ${(a.availability[d]||[]).includes(sl)?'on':''}" data-d="${d}" data-s="${sl}" aria-pressed="${(a.availability[d]||[]).includes(sl)}" aria-label="${DAYL[d]} ${SLOTL[sl]}"></button>`).join('')}`).join('')}</div>`;
  if (n === 2) body = `<p class="mt-help">${MATCH.sug != null ? `Lo tomamos de tu índice oficial (${f1(MATCH.sug)}). Cambialo si querés.` : 'Si no tenés hándicap, poné uno aproximado.'}</p>
    <div class="mt-hcp"><button type="button" class="mt-step" data-h="-1" aria-label="Bajar">−</button><input id="mth" inputmode="decimal" value="${a.hcp == null ? '' : String(a.hcp).replace('.', ',')}" aria-label="Hándicap"><button type="button" class="mt-step" data-h="1" aria-label="Subir">+</button></div>`;
  if (n === 3) body = chips(PFREQ, a.play_freq, 'data-pf');
  if (n === 4) body = MATCH.locs.length ? `<p class="mt-help">Elegí uno o más. Son los lugares donde dan clases los profesores de Golflet.</p>${chips(MATCH.locs.map(l=>[l,l]), a.locations, 'data-loc')}`
    : `<div class="card tt-empty"><b>Todavía no hay lugares cargados</b><span>Ningún profesor cargó dónde da clases. Podés seguir igual: no filtramos por lugar.</span></div>`;
  if (n === 5) body = `<div class="mt-sub">Por clase</div>${chips(BUDG, a.budget, 'data-bd')}<div class="mt-sub">¿Cada cuánto?</div>${chips(CFREQ, a.class_freq, 'data-cf')}`;
  el.innerHTML = `${dots}<div class="mt-n">Paso ${n} de 5</div><h1 class="mt-q">${MATCHQ[n-1]}</h1>${body}
    <div class="mt-nav">${n > 1 ? `<a class="btn ghost" href="#/profesores/encontrar/${n-1}">Atrás</a>` : `<a class="btn ghost" href="#/cuenta">Cancelar</a>`}<button class="btn" type="button" id="mtgo">${n === 5 ? 'Ver profesores' : 'Siguiente'}</button></div><div id="mtmsg"></div>`;
  const save = async patch => { Object.assign(a, patch); try { await api('/api/profesores/match/answers', { method:'PUT', body: JSON.stringify(patch) }); return true; } catch(err){ $('#mtmsg').innerHTML = `<div class="msg err">${esc(errText(err))}</div>`; return false; } };
  const next = async () => { const patch = n === 1 ? { availability: a.availability } : n === 2 ? { hcp: $('#mth').value.trim() || null } : n === 3 ? { play_freq: a.play_freq } : n === 4 ? { locations: a.locations } : { budget: a.budget, class_freq: a.class_freq };
    if (await save(patch)) location.hash = n === 5 ? '#/profesores/encontrar/resultados' : `#/profesores/encontrar/${n+1}`; };
  $('#mtgo').onclick = next;
  el.querySelectorAll('.avc').forEach(b => b.onclick = () => { const d = b.dataset.d, sl = b.dataset.s, cur = a.availability[d] || []; a.availability[d] = cur.includes(sl) ? cur.filter(x=>x!==sl) : [...cur, sl]; if (!a.availability[d].length) delete a.availability[d]; b.classList.toggle('on'); b.setAttribute('aria-pressed', b.classList.contains('on')); });
  el.querySelectorAll('[data-h]').forEach(b => b.onclick = () => { const i = $('#mth'); const v = parseFloat(i.value.replace(',', '.')); const nv = Math.max(-10, Math.min(54, Math.round(((isFinite(v) ? v : 18) + +b.dataset.h) * 10) / 10)); i.value = String(nv).replace('.', ','); });
  const single = (attr, key, auto) => el.querySelectorAll(`[${attr}]`).forEach(b => b.onclick = () => { a[key] = b.getAttribute(attr); el.querySelectorAll(`[${attr}]`).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }); if (auto) setTimeout(next, 180); });
  single('data-pf', 'play_freq', true); single('data-bd', 'budget'); single('data-cf', 'class_freq');
  el.querySelectorAll('[data-loc]').forEach(b => b.onclick = () => { const l = b.dataset.loc; a.locations = a.locations.includes(l) ? a.locations.filter(x=>x!==l) : [...a.locations, l]; b.classList.toggle('on'); b.setAttribute('aria-pressed', b.classList.contains('on')); });
}
async function loadMatchResults(el){
  el.innerHTML = `<div style="padding:60px 0;text-align:center"><span class="spin"></span></div>`;
  try { const { matches } = await api('/api/profesores/match'); if (!$('#mt')) return;
    const price = m => m.price_min == null && m.price_max == null ? '' : ` · ${m.price_min != null && m.price_max != null && m.price_min !== m.price_max ? `${money(m.price_min)} a ${money(m.price_max)}` : money(m.price_min ?? m.price_max)} por clase`;
    el.innerHTML = `<h1 class="mt-q" style="margin-top:4px">${matches.length ? (matches.length === 1 ? 'Encontramos un profesor para vos' : `Encontramos ${matches.length} profesores para vos`) : 'Todavía no hay un profesor que coincida'}</h1>
      ${matches.length ? matches.map(m => `<div class="card mt-res"><div class="mt-rh"><span class="avatar">${esc(compInit(m.name))}</span><div><b>${esc(m.name)}${m.verified ? VBADGE : ''}</b><span>${esc(m.locations.join(' · ') || 'Sin lugares cargados')}${price(m)}</span></div></div>
          <ul class="mt-why">${m.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>${m.pending ? `<p class="foot" style="margin:0 0 10px">Todavía no activó su cuenta: lo agregás igual y ve tus datos solo cuando lo actives.</p>` : ''}
          ${m.linked ? `<a class="btn ghost" href="#/profesor/${encodeURIComponent(m.profesor_id)}">Ya está en tus profesores</a>` : `<button class="btn" type="button" data-add="${esc(m.profesor_id)}">Agregar</button>`}</div>`).join('')
        : `<div class="card tt-empty"><b>Probá con más horarios o lugares</b><span>Solo te mostramos profesores reales de Golflet. A medida que se sumen, van a aparecer acá.</span></div>`}
      <div class="mt-nav"><a class="btn ghost" href="#/profesores/encontrar/1">Editar respuestas</a></div><p class="foot">Tus respuestas son privadas: los profesores no las ven. Al agregar uno, “Puede ver mis métricas” queda apagado.</p>`;
    el.querySelectorAll('[data-add]').forEach(b => b.onclick = async () => { b.disabled = true;
      try { await api('/api/profesores', { method:'POST', body: JSON.stringify({ profesor_id: b.dataset.add, source: 'match' }) }); toast('Profesor agregado'); location.hash = '#/profesor/' + encodeURIComponent(b.dataset.add); } catch(err){ b.disabled = false; toast(errText(err)); } });
  } catch(e){ el.innerHTML = errBox(e, 'los profesores'); }
}
/* t107u: #/outliers — net double bogey, personalized */
function sOutliers(){ return `<div class="bar"><span class="overline">Cómo se calcula</span></div><div id="outliers"><div style="padding:60px 0;text-align:center"><span class="spin"></span></div></div>`; }
async function loadOutliers(){
  const el = $('#outliers'); if (!el) return;
  try { const o = await api('/api/handicap/outliers'); if (!$('#outliers')) return; const e = o.example, pc = o.past_card;
    el.innerHTML = `<div class="stitle">Los hoyos malos tienen tope</div>${vidSlot('calculo_hcp')}
      <div class="card ol-card"><p>${esc(o.rule)}</p>
      ${pc ? `<div class="ol-ex"><span class="overline">Te pasó el ${dmy(pc.date)}</span><p>En ${esc(pc.course_label)}, hoyo <b class="num">${pc.hole}</b> (par ${pc.par}, índice ${pc.stroke_index}) hiciste <b class="num">${pc.scored}</b>. Con tu hándicap de juego de esa tarjeta (<span class="num">${pc.playing_handicap}</span>) recibías ${pc.strokes_received} ${pc.strokes_received===1?'golpe':'golpes'}: para tu hándicap contó <b class="num">${pc.cap}</b>.</p><a class="link" href="#/ronda/${pc.round_id}">Ver la tarjeta</a></div>`
        : e ? `<div class="ol-ex"><span class="overline">Un ejemplo en ${esc(e.course_label)}${e.tee?` · ${esc(e.tee)}`:''}</span><p>Con tu hándicap de juego <b class="num">${o.playing_handicap}</b>${o.playing_handicap_source==='estimado'?' (estimado)':''}, en el hoyo <b class="num">${e.hole}</b> (par ${e.par}, índice ${e.stroke_index}) recibís 1 golpe: el máximo que cuenta es <b class="num">${e.cap}</b>. Si hiciste ${e.if_scored}, para tu hándicap cuenta ${e.cap}.</p></div>`
        : `<p class="foot">Todavía no tenemos los datos de tu cancha (índice de cada hoyo o tu hándicap de juego) para darte un ejemplo con números reales.</p>`}
      ${pc && e ? `<p class="foot">En ${esc(e.course_label)}, hoyo ${e.hole} (par ${e.par}, índice ${e.stroke_index}), con tu hándicap de juego ${o.playing_handicap} el tope es ${e.cap}.</p>` : ''}</div>
      ${vidSlot('outliers')}
      <div class="section"><h2>Una tarjeta mala no te hunde</h2></div><div class="card ol-card"><p>${esc(o.best8)}</p>${o.hi!=null?`<p class="foot">Tu índice hoy: <b class="num">${f1(o.hi)}</b>.</p>`:''}</div>${vidSlot('mejores_8')}
      ${o.note?`<p class="foot">${esc(o.note)}</p>`:''}`;
  } catch(e){ el.innerHTML = errBox(e, 'esta explicación'); }
}
/* chart over time for a metric, inside the selected period */
function overTime(metric, d){
  const W=360,H=150,pl=30,pr=10,pt=12,pb=24, S = d.series || [];
  if (S.length < 2) return S.length ? '' : `<div class="msg" style="margin-top:10px">Sin datos en este período.</div>`;
  const score = SCOREK.includes(metric), hcp = metric==='handicap';
  if (hcp){ const e = hcpEvo(d.since || null, d.range_label); if (e) return e; }
  const pts = score ? (d.monthly||[]).map(m=>({ x: m.month, v: m.rounds ? m.value/m.rounds : 0, n: m.rounds })) : S.map(x=>({ x: x.date, v: x.value }));
  if (pts.length < 2 && score) return `<p class="foot">${pts.length?`${f2(pts[0].v)} por ronda en ${pts[0].n} rondas.`:''}</p>`;
  const ys = pts.map(p=>p.v), lo = score ? 0 : Math.floor(Math.min(...ys)-1), hi = Math.ceil(Math.max(...ys)+ (score?0.2:1));
  const X = i => pl + i*(W-pl-pr)/Math.max(1,pts.length-1), Y = v => pt + (hi-v)*(H-pt-pb)/Math.max(.001,hi-lo);
  const lab = x => x.length===7 ? `${MES[+x.slice(5,7)-1]} ${x.slice(2,4)}` : dmy(x);
  let g = ''; [lo, (lo+hi)/2, hi].forEach(v=>{ g += `<line x1="${pl}" x2="${W-pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="${C.hair}"/><text x="${pl-6}" y="${Y(v)+4}" text-anchor="end" font-size="10" fill="${C.ink3}" font-family="Geist">${score?f1(v):Math.round(v*10)/10}</text>`; });
  g += `<text x="${pl}" y="${H-6}" font-size="10" fill="${C.ink3}" font-family="Geist">${lab(pts[0].x)}</text><text x="${W-pr}" y="${H-6}" text-anchor="end" font-size="10" fill="${C.ink3}" font-family="Geist">${lab(pts.at(-1).x)}</text>`;
  let body;
  if (score){ const bw = Math.max(4, Math.min(26, (W-pl-pr)/pts.length*.6));
    body = pts.map((p,i)=>`<rect x="${X(i)-bw/2}" y="${Y(p.v)}" width="${bw}" height="${Math.max(0,Y(lo)-Y(p.v))}" rx="3" fill="${C.primary}" opacity=".85"><title>${lab(p.x)}: ${f2(p.v)} por ronda (${p.n} rondas)</title></rect>`).join(''); }
  else { const line = smooth(pts.map((p,i)=>[X(i),Y(p.v)]));
    body = `<path d="${line}" fill="none" stroke="${C.primary}" stroke-width="2.2" stroke-linecap="round"/>` + (pts.length<=60 ? pts.map((p,i)=>`<circle cx="${X(i)}" cy="${Y(p.v)}" r="2.8" fill="${C.primary}"><title>${lab(p.x)}: ${p.v}</title></circle>`).join('') : ''); }
  const note = score ? `${MTITLE[metric]} por ronda, mes a mes.` : hcp ? 'Hándicap Index oficial. Más abajo es mejor.' : 'Gross de cada tarjeta válida. Más abajo es mejor.';
  return `<div class="card ot-card"><div class="ot-h">Evolución${d.range_label?` · ${esc(d.range_label)}`:''}</div><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(note)}">${g}${body}</svg><p class="foot" style="margin:6px 2px 0">${note}</p></div>`;
}
function mrow(r, rank, sc, noYr){
  const [y,m,d] = r.date.split('-');
  const sub = `${esc(r.course_label||r.course||'')}${r.tee?' · '+esc(r.tee):''}${sc?` · ${sc.holes_known?(sc.holes.length?'Hoyo'+(sc.holes.length>1?'s ':' ')+sc.holes.join(', '):''):'sin detalle por hoyo'}`:''}`;
  const right = sc ? `<b class="num">${sc.count}</b><span>${r.gross?'gross '+r.gross:''}</span>` : r.valid && r.gross ? `<b class="num">${r.gross}</b><span>neto ${r.net??'—'}</span>` : `<span class="badge neg">${r.is_9_holes?'9 h · ':''}DES</span>`;
  return `<a class="row" href="#/ronda/${r.round_id}">${rank?`<span class="vx-rank num">${rank}</span>`:''}${dateBlock(r.date, !noYr)}<div class="body"><div class="t">${cup(r)+esc(short(r.tournament)||'Ronda')}</div><div class="s">${sub}</div></div><div class="score">${right}</div>${ICON.chev}</a>`;
}

/* ---------- AUDIO DESPUÉS DE LA RONDA ---------- */
const CAT = { salida:'Salida', approach:'Approach', juego_corto:'Juego corto', bunker:'Bunker', putt:'Putt', estrategia:'Estrategia / mental', otro:'Otro' };
let REC = null;   // web mic session: {sr, id, t0, timer, final, interim, stopping}
const recapTarget = id => id.startsWith('live:') ? { live_round_id: id.slice(5) } : { round_id: id };
/* Voice recap on the web: only with the computer's microphone, transcribed by the browser (Web Speech API, es-AR) and
   structured here with the same keyword tagger as the server (public/recap-rules.js). No audio leaves the browser from Golflet. */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const mobileWeb = () => /iPhone|iPad|iPod|Android|Mobile|Silk|Kindle/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)) || matchMedia('(hover: none) and (pointer: coarse)').matches;
const micMode = () => mobileWeb() ? 'mobile' : (SR && window.isSecureContext && window.GolfletRecap) ? 'ok' : 'unsupported';
const MIC_SVG = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>';
const PHONE_SVG = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg>';
function recapBox(id){ return `<div class="section"><h2>Contá cómo te fue</h2><span class="badge gold" id="recapbadge">Nota</span></div><div class="card vx-recap" id="recap" data-rid="${esc(id)}"><div style="padding:18px 0;text-align:center"><span class="spin"></span></div></div>`; }
async function loadRecap(id){
  const el = $('#recap'); if (!el) return;
  const t = recapTarget(id);
  try { const { recap } = await api('/api/recaps?' + new URLSearchParams(t)); drawRecap(id, recap); }
  catch(e){ el.innerHTML = `${errBox(e)}`; }
}
/* store links (env IOS_APP_STORE_URL / ANDROID_PLAY_STORE_URL via /api/app-config); unset → nothing clickable, no fake links */
let APPCFG = {};
const uaOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'ios' : /Android/i.test(navigator.userAgent) ? 'android' : 'desktop';
const storeBadges = () => { const a = APPCFG.ios_app_store_url, g = APPCFG.android_play_store_url; if (!a && !g) return '';
  return `<div class="vx-stores">${a?`<a class="vx-store-b" href="${esc(a)}" target="_blank" rel="noopener">Descargar en App Store</a>`:''}${g?`<a class="vx-store-b" href="${esc(g)}" target="_blank" rel="noopener">Disponible en Google Play</a>`:''}</div>`; };
function micEmpty(){
  const m = micMode();
  if (m === 'ok') return `<div class="vx-rec-empty"><span class="vx-mic" aria-hidden="true">${MIC_SVG}</span>
      <div><b>Grabalo con el micrófono de la compu</b><p>Contá cómo te fue: el navegador lo pasa a texto en español, lo revisás y Golflet ordena tus errores en esta compu. No se guarda el audio.</p></div></div>
    <button class="btn" data-micstart>${MIC_SVG} Empezar a grabar</button>${storeBadges()}
    <p class="foot" style="margin-top:8px">${/Edg\//.test(navigator.userAgent)?'Edge':/Chrome\//.test(navigator.userAgent)?'Chrome':'Safari'} usa su servicio de dictado para pasar la voz a texto. En el iPhone, la app de Golflet lo hace en el teléfono.</p>`;
  if (m === 'mobile') { const os = uaOS(), url = os === 'ios' ? APPCFG.ios_app_store_url : os === 'android' ? APPCFG.android_play_store_url : null;
    const inner = `<span class="vx-mic vx-phone" aria-hidden="true">${PHONE_SVG}</span><div><b>Grabalo desde la app de iPhone</b><p>El audio se pasa a texto y se ordenan los errores en el mismo teléfono, sin mandar tu voz a ningún servidor.</p>${url?`<span class="vx-store-cta">${os==='ios'?'Bajala en el App Store':'Bajala en Google Play'} ›</span>`:''}</div>`;
    return url ? `<a class="vx-rec-empty vx-store" href="${esc(url)}" target="_blank" rel="noopener">${inner}</a>` : `<div class="vx-rec-empty">${inner}</div>`; }
  return `<div class="vx-rec-empty"><span class="vx-mic vx-phone" aria-hidden="true">${PHONE_SVG}</span>
      <div><b>Este navegador no pasa la voz a texto</b><p>Usá Chrome, Edge o Safari en la compu, o grabalo desde la app de iPhone.</p>${storeBadges()}</div></div>`;
}
function drawRecap(id, rc, editing){
  const el = $('#recap'); if (!el) return;
  const badge = $('#recapbadge');
  if (!rc || editing === 'new'){
    if (badge) badge.textContent = rc ? 'Grabar de nuevo' : 'Nuevo';
    el.innerHTML = micEmpty() + (rc ? '<div class="vx-actions" style="margin-top:10px"><button class="btn ghost sm" data-reccancel>Cancelar</button></div>' : '');
    return;
  }
  if (badge) badge.textContent = rc.status==='ready' ? (rc.source==='ios_on_device'?'Desde el iPhone':rc.source==='web_mic'?'Desde la compu':rc.source==='ai'?'Ordenado':'Guardado') : rc.status==='pending_ai' ? 'Audio guardado' : rc.status==='error' ? 'Revisar' : 'Procesando';
  const mistakes = rc.mistakes||[], pos = rc.positives||[];
  const groups = {}; mistakes.forEach(m => (groups[m.category] ||= []).push(m));
  el.innerHTML = `${rc.error?`<div class="msg ${rc.status==='error'?'err':''}" style="margin-bottom:12px">${esc(rc.error)}</div>`:''}
    ${rc.summary?`<p class="vx-sum">${esc(rc.summary)}</p>`:''}
    ${mistakes.length?`<div class="vx-h">Errores <span class="num">${mistakes.length}</span></div><div class="vx-errs">${Object.entries(groups).map(([c,ms])=>ms.map(m=>`<div class="vx-err"><span class="vx-cat vx-c-${c}">${CAT[c]||c}</span><span class="vx-t">${m.hole?`<b class="num">Hoyo ${m.hole}</b> · `:''}${esc(m.text)}</span></div>`).join('')).join('')}</div>`:''}
    ${pos.length?`<div class="vx-h">Lo que salió bien</div><div class="vx-errs">${pos.map(p=>`<div class="vx-err"><span class="vx-cat vx-c-pos">Bien</span><span class="vx-t">${p.hole?`<b class="num">Hoyo ${p.hole}</b> · `:''}${esc(p.text)}</span></div>`).join('')}</div>`:''}
    ${rc.audio?`<audio controls preload="none" src="${rc.audio.url}" class="vx-audio"></audio>`:''}
    ${editing==='edit' ? `<div class="vx-h">Texto</div><textarea class="notes" id="rectext" placeholder="Corregí lo que el dictado entendió mal…">${esc(rc.transcript||'')}</textarea>
      <div style="display:flex;gap:8px;margin-top:10px"><button class="btn" data-recedit style="flex:1">Guardar y ordenar errores</button><button class="btn ghost" data-reccancel style="flex:none;width:auto;padding:0 18px">Cancelar</button></div>`
      : rc.transcript ? `<details class="vx-tr-box"><summary>Lo que dijiste</summary><p>${esc(rc.transcript)}</p></details>` : ''}
    <div class="vx-actions">${rc.transcript && editing!=='edit'?'<button class="btn ghost sm" data-recopen>'+ICON.pencil+' Corregir texto</button>':''}${micMode()==='ok'?'<button class="btn ghost sm" data-recnew>'+MIC_SVG.replace(/width="24" height="24"/,'width="16" height="16"')+' Grabar de nuevo</button>':''}</div>
    <p class="foot" style="margin-top:8px">${rc.source==='ios_on_device'?'Transcripto y ordenado en tu iPhone':rc.source==='web_mic'?'Dictado con el micrófono de la compu y ordenado en el navegador':rc.source==='ai'?'Ordenado automáticamente':rc.source==='rules'?'Ordenado por palabras clave (sin IA)':rc.source==='manual'?'Corregido por vos':''}${rc.updated_at?` · ${ago(rc.updated_at)}`:''}</p>`;
  el._rc = rc;
}
/* structure in the browser (same rules as the server) and save as-is */
const structured = txt => { const s = window.GolfletRecap.tagByRules(txt); return { transcript: txt, summary: s.summary, mistakes: s.mistakes, positives: s.positives }; };
function bindRecap(id){
  const el = $('#recap'); if (!el) return;
  el.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    const busy = msg => { el.innerHTML = `<div style="padding:22px 0;text-align:center;color:var(--color-ink2)"><span class="spin"></span><div style="margin-top:10px;font-size:calc(14px*var(--ts,1))">${msg}</div></div>`; };
    try {
      if (b.matches('[data-micstart]')) return micStart(id);
      if (b.matches('[data-micstop]')) return micStop();
      if (b.matches('[data-miccancel]')) { micAbort(); return el._rc ? drawRecap(id, el._rc) : drawRecap(id, null); }
      if (b.matches('[data-micsave]')) {
        const txt = el.querySelector('#rectext').value.trim(); if (txt.length < 3) return toast('No se entendió nada todavía: grabá de nuevo', 'err');
        const dur = +el.querySelector('#rectext').dataset.dur || undefined;
        busy('Ordenando tus errores…');
        const { recap } = await api('/api/recaps', { method:'POST', body: JSON.stringify({ ...recapTarget(id), ...structured(txt), source: 'web_mic', duration_s: dur }) });
        drawRecap(id, recap); markRecap(id, recap); return;
      }
      if (b.matches('[data-recedit]')) {
        const txt = el.querySelector('#rectext').value.trim(); if (txt.length < 3) return toast('Contá un poco más', 'err');
        busy('Ordenando tus errores…');
        const body = window.GolfletRecap ? { ...structured(txt), source: 'manual' } : { transcript: txt, restructure: true };
        const { recap } = await api(`/api/recaps/${el._rc.id}`, { method:'PATCH', body: JSON.stringify(body) });
        drawRecap(id, recap); markRecap(id, recap); return;
      }
      if (b.matches('[data-recopen]')) return drawRecap(id, el._rc, 'edit');
      if (b.matches('[data-reccancel]')) return drawRecap(id, el._rc);
      if (b.matches('[data-recnew]')) { const keep = el._rc; drawRecap(id, keep, 'new'); el._rc = keep; return; }
    } catch(err){ toast(err.message, 'err'); loadRecap(id); }
  };
}
function markRecap(id, rc){ if (id.startsWith('live:')) return; const r = G.rounds.find(x=>x.round_id===id); if (r) r.recap_id = rc?.id || null; }
const MIC_ERR = { 'not-allowed':'Sin permiso para usar el micrófono. Habilitalo en el candado de la barra de direcciones.', 'service-not-allowed':'El dictado del navegador está desactivado. En Safari, activá Dictado en Ajustes del Sistema → Teclado, o probá con Chrome.',
  'audio-capture':'No encontramos un micrófono en esta compu.', 'network':'El servicio de dictado del navegador no responde (sin conexión o bloqueado, por ejemplo en Brave). Probá con Chrome o Safari.', 'language-not-supported':'Tu navegador no dicta en español de Argentina.' };
function micStart(id){
  if (micMode() !== 'ok') return toast('Este navegador no pasa la voz a texto', 'err');
  const el = $('#recap'); if (!el) return;
  const sr = new SR(); sr.lang = 'es-AR'; sr.continuous = true; sr.interimResults = true; sr.maxAlternatives = 1;
  REC = { sr, id, t0: Date.now(), final: '', interim: '', stopping: false, timer: null };
  el.innerHTML = `<div class="vx-live"><div class="vx-live-top"><span class="vx-dot" aria-hidden="true"></span><b>Grabando</b><span class="num" id="rectime">0:00</span></div>
    <div class="vx-live-text" id="livetext" aria-live="polite"><span class="ph">Hablá tranquilo: por ejemplo “en el hoyo 3 hice tres putts, en el 7 la salida se fue OB”.</span></div>
    <div style="display:flex;gap:8px;margin-top:12px"><button class="btn" data-micstop style="flex:1">Terminar</button><button class="btn ghost" data-miccancel style="flex:none;width:auto;padding:0 18px">Cancelar</button></div></div>`;
  const paint = () => { const lt = $('#livetext'); if (!lt) return; if (!REC.final && !REC.interim) return; lt.innerHTML = `${esc(REC.final)}<span class="int">${esc(REC.interim)}</span>`; lt.scrollTop = lt.scrollHeight; };
  sr.onresult = ev => { let interim = ''; for (let i = ev.resultIndex; i < ev.results.length; i++) { const r = ev.results[i]; if (r.isFinal) REC.final += (REC.final && !/\s$/.test(REC.final) ? ' ' : '') + (t => t.charAt(0).toUpperCase() + t.slice(1))(r[0].transcript.trim()) + '. '; else interim += r[0].transcript; } REC.interim = interim; paint(); };
  sr.onerror = ev => { if (ev.error === 'no-speech' || ev.error === 'aborted') return; const m = MIC_ERR[ev.error] || 'El dictado se cortó. Probá de nuevo.'; if (REC) REC.err = m; };
  sr.onend = () => { if (!REC || REC.sr !== sr) return; if (!REC.stopping && !REC.err && Date.now() - REC.t0 < 600000) { try { sr.start(); return; } catch(e){} } micDone(); };
  REC.timer = setInterval(() => { if (!REC) return; const s = Math.floor((Date.now()-REC.t0)/1000), tl = $('#rectime'); if (tl) tl.textContent = `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; if (s >= 600) micStop(); }, 250);
  try { sr.start(); } catch(e){ REC.err = 'No se pudo empezar a grabar.'; micDone(); }
}
function micStop(){ if (!REC) return; REC.stopping = true; try { REC.sr.stop(); } catch(e){ micDone(); } }
function micAbort(){ if (!REC) return; const r = REC; REC = null; clearInterval(r.timer); try { r.sr.onend = null; r.sr.abort(); } catch(e){} }
function micDone(){
  if (!REC) return; const r = REC; REC = null; clearInterval(r.timer);
  const el = $('#recap'); if (!el || el.dataset.rid !== r.id) return;
  const txt = (r.final + ' ' + r.interim).replace(/\s+/g, ' ').replace(/\s+\./g, '.').trim(), dur = Math.round((Date.now() - r.t0) / 1000);
  if (!txt){ if (r.err) toast(r.err, 'err'); else toast('No se escuchó nada. Revisá el micrófono y probá de nuevo.', 'err'); return el._rc ? drawRecap(r.id, el._rc) : drawRecap(r.id, null); }
  el.innerHTML = `${r.err?`<div class="msg err" style="margin-bottom:10px">${esc(r.err)}</div>`:''}<div class="vx-h">Revisá el texto</div>
    <textarea class="notes" id="rectext" data-dur="${dur}">${esc(txt)}</textarea>
    <p class="foot" style="margin:6px 0 0">Corregí lo que el dictado entendió mal (números de hoyo, palos) antes de guardar.</p>
    <div style="display:flex;gap:8px;margin-top:10px"><button class="btn" data-micsave style="flex:1">Guardar y ordenar errores</button><button class="btn ghost" data-miccancel style="flex:none;width:auto;padding:0 18px">Descartar</button></div>`;
}

/* ---------- GOLPES GPS ---------- */
const LIE = { tee:'Tee', fairway:'Fairway', rough:'Rough', bunker:'Bunker', green:'Green', fringe:'Antegreen', recovery:'Recuperación', other:'Otro' };
const RES = { fairway:'Fairway', green:'Green', rough:'Rough', bunker:'Bunker', water:'Agua', ob:'OB', penalty:'Penalidad', holed:'Embocada', other:'Otro' };
function shotsTable(shots){
  if (!shots.length) return '<div class="msg">Todavía no hay golpes registrados en esta ronda.</div>';
  const by = {}; shots.forEach(s => (by[s.hole] ||= []).push(s));
  return Object.entries(by).map(([h, ss]) => `<div class="card vx-shots"><div class="vx-shots-h"><b class="num">Hoyo ${h}</b><span>${ss.length} golpe${ss.length>1?'s':''}</span></div>
    ${ss.map(s => `<div class="vx-shot"><span class="vx-n num">${s.shot_number}</span><span class="vx-club">${esc(s.club||'—')}</span><span class="vx-meta">${[s.lie&&LIE[s.lie], s.result&&RES[s.result]].filter(Boolean).join(' → ')||'&nbsp;'}${quickTags(s)}</span><b class="num">${s.distance_yd!=null?s.distance_yd+' yd':'—'}</b></div>`).join('')}</div>`).join('') +
    `<p class="foot">Distancia hasta el golpe siguiente; el último antes del green, hasta el centro del green cuando lo marcaste en green. Yardas.</p>`;
}
async function loadRoundShots(id){
  const el = $('#rshots'); if (!el) return;
  try { const { live_rounds } = await api(`/api/rounds/${id}/shots`); el.innerHTML = live_rounds.map(l => shotsTable(l.shots)).join('') || '<div class="msg">Sin golpes GPS.</div>'; }
  catch(e){ el.innerHTML = `${errBox(e)}`; }
}
function sGps(id){ return `<div class="bar"><span class="overline">Ronda con GPS</span><button class="close" data-close>${ICON.x}</button></div><div id="gpsbody"><div style="padding:60px 0;text-align:center"><span class="spin"></span></div></div>`; }
async function loadGps(id){
  const el = $('#gpsbody'); if (!el) return;
  try {
    const { live_round: l, shots } = await api(`/api/live-rounds/${id}`);
    el.innerHTML = `<div class="stitle">${esc(l.course ? title(l.course) : 'Ronda Golflet')}</div><div style="font-size:calc(13px*var(--ts,1));color:var(--color-ink3);margin-top:2px">${dmy(l.date)}${l.vm_course?` · ${esc(title(l.vm_course))}`:''}${l.ended_at?'':' · en juego'}</div>
      ${l.round_id?`<a class="btn ghost" href="#/ronda/${l.round_id}" style="margin-top:14px">Ver la tarjeta del club</a>`:''}
      <div id="hmap"></div><div class="section"><h2>Golpes</h2><span class="badge">${shots.length}</span></div><div>${shotsTable(shots)}</div>${recapBox('live:'+id)}`;
    loadRecap('live:'+id); bindRecap('live:'+id); loadHoleMap(id);
  } catch(e){ el.innerHTML = errBox(e); }
}
/* ---------- t127u/t128u: hole map with every stroke (putts included) + "¿a cuánto la dejaste?" ---------- */
const HM = { hole: null, zoom: 'hoyo' };
const fm = m => m == null ? '—' : (m < 10 ? f1(m).replace('.', ',') : String(Math.round(m))) + ' m';
function hmPts(poly){ return (Array.isArray(poly) ? poly : []).map(p => Array.isArray(p) ? { lat: +p[0], lng: +p[1] } : p && p.lat != null ? { lat: +p.lat, lng: +p.lng } : null).filter(Boolean); }
function holeMapSvg(h, zoom){
  const o = h.flag || h.green?.center; if (!o) return '';
  const R = 6371000, k = Math.PI / 180, c0 = Math.cos(o.lat * k), xy = p => [ (p.lng - o.lng) * k * c0 * R, (p.lat - o.lat) * k * R ];
  const strokes = h.shots.map(x => ({ kind: x.kind, a: x.start, b: x.end || (x.holed ? o : null), n: x.order })).filter(x => x.a);
  h.points.forEach((p, i) => strokes.push({ kind: p.lie === 'green' ? 'putt' : 'full', a: p, b: h.points[i + 1] || (p.result === 'holed' ? o : null), n: p.shot_number }));
  const from = h.tee || strokes[0]?.a; let th = 0; if (from) { const [fx, fy] = xy(from); th = Math.atan2(-fx, -fy); }
  const rot = p => { const [x, y] = xy(p), u = x * Math.cos(th) - y * Math.sin(th), v = x * Math.sin(th) + y * Math.cos(th); return [u, -v]; };
  const all = []; const add = p => p && all.push(rot(p));
  if (zoom === 'green') { all.push([-22, -22], [22, 22]); strokes.filter(x => x.kind === 'putt').forEach(x => { add(x.a); add(x.b); }); }
  else { add(o); add(h.tee); add(h.green?.front); add(h.green?.back); strokes.forEach(x => { add(x.a); add(x.b); }); }
  if (!all.length) return '';
  let x0 = Math.min(...all.map(p => p[0])), x1 = Math.max(...all.map(p => p[0])), y0 = Math.min(...all.map(p => p[1])), y1 = Math.max(...all.map(p => p[1]));
  const minW = zoom === 'green' ? 44 : 80; if (x1 - x0 < minW) { const m = (x0 + x1) / 2; x0 = m - minW / 2; x1 = m + minW / 2; }
  if ((y1 - y0) < (x1 - x0) * 0.8) { const m = (y0 + y1) / 2, hh = (x1 - x0) * 0.4; y0 = m - hh; y1 = m + hh; }
  const pad = Math.max(x1 - x0, y1 - y0) * 0.1; x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
  const W = x1 - x0, H = y1 - y0, sc = W / Math.min(330, 480 * W / H), P = p => rot(p).map(v => +v.toFixed(2)).join(',');
  const inV = ([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const haz = (h.hazards || []).map(z => { const pts = hmPts(z.polygon); if (pts.length < 3) return ''; const rp = pts.map(rot); if (zoom === 'green' && !rp.some(inV)) return ''; return `<polygon points="${rp.map(q => q.map(v => v.toFixed(2)).join(',')).join(' ')}" class="hm-${/water/.test(z.type) ? 'water' : 'sand'}"/>`; }).join('');
  const gr = h.green?.front && h.green?.back ? Math.max(8, Math.hypot(...[0, 1].map(i => rot(h.green.front)[i] - rot(h.green.back)[i])) / 2) : 12;
  const gc = h.green?.center ? rot(h.green.center) : rot(o);
  const lines = strokes.map(x => x.b ? `<line x1="${rot(x.a)[0].toFixed(2)}" y1="${rot(x.a)[1].toFixed(2)}" x2="${rot(x.b)[0].toFixed(2)}" y2="${rot(x.b)[1].toFixed(2)}" class="hm-l ${x.kind === 'putt' ? 'putt' : ''}" vector-effect="non-scaling-stroke"/>` : '').join('');
  const dots = strokes.map(x => { const [a, b] = rot(x.a); return `<g class="hm-d ${x.kind === 'putt' ? 'putt' : ''}" transform="translate(${a.toFixed(2)},${b.toFixed(2)}) scale(${sc.toFixed(3)})"><circle r="8.5"/><text y="3.6">${x.n ?? ''}</text></g>`; }).join('');
  const [fx, fy] = rot(o);
  const flag = `<g transform="translate(${fx.toFixed(2)},${fy.toFixed(2)}) scale(${sc.toFixed(3)})" class="hm-flag"><path d="M0 0V-20" /><path d="M0 -20l11 4-11 4z" class="f"/><circle r="2.4"/></g>`;
  return `<svg class="hmap" viewBox="${x0.toFixed(1)} ${y0.toFixed(1)} ${W.toFixed(1)} ${H.toFixed(1)}" style="aspect-ratio:${(W / H).toFixed(3)}" role="img" aria-label="Mapa del hoyo ${h.hole} con tus golpes">
    <rect x="${x0}" y="${y0}" width="${W}" height="${H}" class="hm-bg"/>${haz}${h.green ? `<ellipse cx="${gc[0].toFixed(2)}" cy="${gc[1].toFixed(2)}" rx="${(gr * 0.85).toFixed(1)}" ry="${gr.toFixed(1)}" class="hm-green"/>` : ''}${lines}${flag}${dots}</svg>`;
}
async function loadHoleMap(roundId){
  const el = $('#hmap'); if (!el) return;
  let d; try { d = await api(`/api/rounds/${roundId}/shots/map`); } catch(e){ el.innerHTML = ''; return; }
  if (!$('#hmap')) return; if (!d.holes.length) { el.innerHTML = ''; return; }
  if (!d.holes.some(h => h.hole === HM.hole)) HM.hole = d.holes[0].hole;
  const draw = () => { const h = d.holes.find(x => x.hole === HM.hole), hasPutts = h.shots.some(x => x.kind === 'putt') || h.points.some(p => p.lie === 'green');
    const rows = [...h.shots.map(x => ({ n: x.order, kind: x.kind, club: x.club, dist: x.distance_m, left: x.left_to_flag_m, holed: x.holed })),
      ...h.points.map(p => ({ n: p.shot_number, kind: p.lie === 'green' ? 'putt' : 'full', club: p.club, dist: null, left: p.left_to_flag_m, holed: p.result === 'holed' }))];
    el.innerHTML = `<div class="section"><h2>Mapa del hoyo</h2><span class="badge">${d.holes.length} ${d.holes.length === 1 ? 'hoyo' : 'hoyos'}</span></div>
      <div class="hm-holes" role="tablist">${d.holes.map(x => `<button type="button" role="tab" aria-selected="${x.hole === HM.hole}" class="${x.hole === HM.hole ? 'on' : ''}" data-hmh="${x.hole}">${x.hole}</button>`).join('')}</div>
      <div class="card hm-card">${hasPutts ? `<div class="seg hm-z">${[['hoyo','Hoyo'],['green','Green']].map(([k,l]) => `<button class="${HM.zoom===k?'on':''}" data-hmz="${k}">${l}</button>`).join('')}</div>` : ''}
        ${holeMapSvg(h, hasPutts ? HM.zoom : 'hoyo') || '<div class="msg">No tenemos el green de este hoyo para dibujarlo.</div>'}
        <div class="hm-leg"><span><i class="l"></i>Golpe</span><span><i class="l putt"></i>Putt</span><span><i class="fl"></i>${h.flag_source === 'player_marked' ? 'Bandera (marcada)' : 'Centro del green'}</span></div>
        <div class="hm-rows">${rows.map(r => `<div class="hm-r"><span class="hm-n ${r.kind === 'putt' ? 'putt' : ''} num">${r.n ?? '·'}</span><span class="hm-c">${esc(r.kind === 'putt' ? 'Putt' : (r.club || 'Golpe'))}${r.dist != null ? ` <small class="num">${fm(r.dist)}</small>` : ''}</span><span class="hm-left num">${r.holed ? '<b>Embocada</b>' : r.left != null ? `la dejaste a <b>${fm(r.left)}</b>` : '<span class="mut">—</span>'}</span></div>`).join('')}</div>
        ${h.flag_note ? `<p class="foot" style="margin:10px 0 0">${esc(h.flag_note)}</p>` : ''}${vidSlot('a_cuanto')}</div>`;
    el.querySelectorAll('[data-hmh]').forEach(b => b.onclick = () => { HM.hole = +b.dataset.hmh; draw(); });
    el.querySelectorAll('[data-hmz]').forEach(b => b.onclick = () => { HM.zoom = b.dataset.hmz; draw(); }); };
  draw();
}
async function loadBagExtras(){
  const d = $('#cdist'), g = $('#gpsrounds'); if (!d) return;
  try {
    const [cd, lr] = await Promise.all([api('/api/club-stats'), api('/api/live-rounds')]);
    if (!$('#cdist')) return;
    d.innerHTML = cd.clubs.length ? `<div class="card vx-dist"><div class="vx-dist-h"><span>Palo</span><span>Golpes</span><span>Mediana</span><span>Prom.</span><span>Máx.</span></div>
      ${cd.clubs.map(c => `<a class="vx-dist-r" href="#/palo/${encodeURIComponent(c.club)}"><span>${esc(c.label)}${c.source&&c.source!=='gps'?' <i class="vx-src">'+(c.source==='mixed'?'GPS + LM':'LM')+'</i>':''}</span><span class="num">${c.shots||c.launch_monitor?.shots||0}</span><b class="num">${c.distance?.median_yd ?? c.launch_monitor?.carry?.median_yd ?? '—'}</b><span class="num">${c.distance?.avg_yd ?? c.launch_monitor?.carry?.avg_yd ?? '—'}</span><span class="num">${c.distance?.max_yd ?? c.launch_monitor?.carry?.max_yd ?? '—'}</span></a>`).join('')}</div>
      <p class="foot">Yardas, medidas por GPS entre cada golpe y el siguiente, sin putts, penalidades, OB, golpes pegados feo ni valores atípicos. Tocá un palo para ver hacia dónde se te va.</p>`
      : `<div class="empty-card">${ICON.target}<b>Todavía sin golpes registrados</b>En el iPhone, Golflet te muestra la distancia al green; después de pegar marcás el palo y acá se arma tu tabla real de distancias.</div>`;
    g.innerHTML = lr.live_rounds.length ? `<div class="section"><h2>Rondas con GPS</h2></div>${yrList(lr.live_rounds, l => l.date, l => { const [y,m,dd] = l.date.split('-'); return `<a class="row" href="#/gps/${l.id}">${dateBlock(l.date)}<div class="body"><div class="t">${esc(l.course?title(l.course):'Ronda Golflet')}</div><div class="s">${l.shots} golpes${l.recap_id?' · audio':''}${l.round_id?' · con tarjeta':''}</div></div>${ICON.chev}</a>`; })}` : '';
  } catch(e){ d.innerHTML = `${errBox(e)}`; }
}
async function loadRecurring(){
  const el = $('#recur'); if (!el) return;
  try {
    const d = await api('/api/recaps/recurring?last=10'); if (!$('#recur')) return;
    if (!d.rounds_considered){ el.innerHTML = `<div class="section"><h2>Errores que se repiten</h2></div><a class="card vx-recur-empty" href="${rounds[0]?'#/ronda/'+rounds[0].round_id:'#/rondas'}"><div class="vx-mic sm"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg></div><div><b>Contá cómo te fue</b><p>Al terminar una ronda grabá un audio. Con unas cuantas rondas, acá ves qué errores se repiten.</p></div>${ICON.chev}</a>`; return; }
    const items = d.items.slice(0, 4);
    el.innerHTML = `<div class="section"><h2>Errores que se repiten</h2><span class="badge">últimas ${d.rounds_considered}</span></div><div class="card vx-recur">${items.length ? items.map(i => `<div class="vx-rr"><span class="vx-cat vx-c-${i.category}">${esc(i.label)}</span><span class="vx-rr-t">en <b class="num">${i.rounds}</b> de <span class="num">${i.of}</span> rondas${i.holes.length?` · hoyo${i.holes.length>1?'s':''} ${i.holes.slice(0,3).map(h=>h.hole).join(', ')}`:''}</span><i style="--w:${Math.round(i.share*100)}%"></i></div>`).join('') : '<p class="foot" style="margin:0">Sin errores anotados en tus últimos audios. Bien ahí.</p>'}</div>`;
  } catch(e){ el.innerHTML = ''; }
}


/* ---------- PALO (detalle de errores por palo) ---------- */
const DIRL = { left:'Izquierda', center:'Centro', right:'Derecha' }, LENL = { short:'Corto', on:'Justo', long:'Largo' };
const quickTags = s => [s.direction&&`<i class="vx-q">${s.direction==='left'?'← Izq.':s.direction==='right'?'Der. →':'↑ Centro'}</i>`, s.length&&`<i class="vx-q">${LENL[s.length]}</i>`, s.mishit&&'<i class="vx-q neg">Pegado feo</i>'].filter(Boolean).join('');
let PQ = { course:'all', period:'all' };
function sPalo(code){ return `<div class="bar"><span class="overline">Distancias por palo</span><button class="close" data-close>${ICON.x}</button></div><div id="palobody" data-code="${esc(code)}"><div style="padding:60px 0;text-align:center"><span class="spin"></span></div></div>`; }
function split3(vals, labels, cls){ const tot = vals.reduce((a,b)=>a+b,0); if (!tot) return '<p class="foot" style="margin:6px 0 0">Sin golpes marcados.</p>';
  return `<div class="vx-split">${vals.map((v,i)=>v?`<span class="${cls[i]}" style="flex:${v}"></span>`:'').join('')}</div><div class="vx-split-l">${vals.map((v,i)=>`<span><b class="num">${v}%</b> ${labels[i]}</span>`).join('')}</div>`; }
async function loadPalo(code, focus){
  const el = $('#palobody'); if (!el) return;
  const q = new URLSearchParams(); if (PQ.course!=='all') q.set('course', PQ.course);
  const yr = new Date().getFullYear(); if (PQ.period==='year') q.set('from', `${yr}-01-01`); if (PQ.period==='90') q.set('days','90');
  let d; try { d = await api(`/api/club-stats/${encodeURIComponent(code)}?${q}`); } catch(e){ el.innerHTML = `${errBox(e)}`; return; }
  if (!$('#palobody')) return;
  const c = d.club, ds = c.distance, lm = c.launch_monitor;
  const tile = (k, v, sub) => `<div class="card mini stat" style="padding:12px 10px"><div class="k">${k}</div><div class="v num" style="font-size:calc(24px*var(--ts,1))">${v ?? '—'}</div>${sub?`<div class="d">${sub}</div>`:''}</div>`;
  el.innerHTML = `<div class="stitle">${esc(c.label)}</div><div style="font-size:calc(13px*var(--ts,1));color:var(--color-ink3);margin-top:2px">${c.shots} golpes con GPS${c.outliers_trimmed?` · ${c.outliers_trimmed} ${c.outliers_trimmed===1?'atípico':'atípicos'} fuera`:''}${lm?` · ${lm.shots} de launch monitor`:''}</div>
    <div class="seg vx-seg">${[['all','Todo'],['year',String(yr)],['90','90 días']].map(([k,l])=>`<button class="${PQ.period===k?'on':''}" data-pq="period=${k}">${l}</button>`).join('')}</div>
    ${G.courses.length?`<div class="vx-chips"><button class="vx-chip ${PQ.course==='all'?'on':''}" data-pq="course=all">Todas</button>${G.courses.map(x=>`<button class="vx-chip ${PQ.course===x.key?'on':''}" data-pq="course=${encodeURIComponent(x.key)}">${esc(x.course)}</button>`).join('')}</div>`:''}
    ${c.tendency?`<div class="vx-tend">${esc(c.tendency)}</div>`:''}
    <div class="grid3 rstats" style="gap:8px;margin-top:14px">${tile('Mediana', ds?.median_yd, 'yd')}${tile('Promedio', ds?.avg_yd, 'yd').replace('class="card','id="f-promedio" class="card')}${tile('Máx.', ds?.max_yd, 'yd')}${tile('Rango', ds?`${ds.range_yd[0]}–${ds.range_yd[1]}`:null, ds?`± ${ds.spread_yd} yd`:'').replace('class="card','id="f-dispersion" class="card')}</div>
    ${ds ? `<p class="foot" style="margin-top:6px">Rango = la mitad central de tus tiros (del 25% al 75%); ± es el desvío típico. ${ds.n} tiros medidos${ds.trimmed ? `, ${ds.trimmed} ${ds.trimmed === 1 ? 'atípico' : 'atípicos'} fuera` : ''}.</p>` : ''}${ds ? vidSlot('dispersion') : ''}
    <div class="section"><h2>Dirección</h2><span class="badge">${c.direction.n} marcados</span></div><div class="card">${split3([c.direction.left,c.direction.center,c.direction.right],['izquierda','centro','derecha'],['s-l','s-c','s-r'])}</div>
    <div class="section"><h2>Largo al green</h2><span class="badge">${c.length_on_approach.n} approaches</span></div><div class="card">${split3([c.length_on_approach.short,c.length_on_approach.on,c.length_on_approach.long],['corto','justo','largo'],['s-l','s-c','s-r'])}</div>
    <div class="grid3" style="gap:8px;margin-top:14px">${tile('Greens', c.greens_hit?c.greens_hit.pct+'%':null, c.greens_hit?`${c.greens_hit.hit} de ${c.greens_hit.of}`:'en approaches')}${tile('Fairways', c.fairways_hit?c.fairways_hit.pct+'%':null, c.fairways_hit?`${c.fairways_hit.hit} de ${c.fairways_hit.of}`:'salidas con madera')}${tile('Pegado feo', c.mishit.pct!=null?c.mishit.pct+'%':null, `${c.mishit.count} de ${c.mishit.of}`)}</div>
    ${lm?`<div class="section"><h2>Launch monitor</h2><span class="badge gold">${esc(lm.sources.join(', '))}</span></div><div class="card"><div class="vx-lm"><span>Carry mediano</span><b class="num">${lm.carry?.median_yd ?? '—'} yd</b></div><div class="vx-lm"><span>Rango</span><b class="num">${lm.carry?`${lm.carry.range_yd[0]}–${lm.carry.range_yd[1]} yd`:'—'}</b></div>${lm.side?`<div class="vx-lm"><span>Izq. / centro / der.</span><b class="num">${lm.side.left}% · ${lm.side.center}% · ${lm.side.right}%</b></div>`:''}</div>`:''}
    <div class="section" id="f-tiros"><h2>Últimos golpes</h2></div>${d.recent_shots.length?`<div class="card vx-shots">${d.recent_shots.map(s=>`<div class="vx-shot"><span class="vx-n num">${s.hole}</span><span class="vx-club num">${dmy(s.date).replace(/ \d{4}$/,'')}</span><span class="vx-meta">${[s.lie&&LIE[s.lie], s.result&&RES[s.result]].filter(Boolean).join(' → ')||'&nbsp;'}${quickTags(s)}</span><b class="num">${s.distance_yd!=null?s.distance_yd+' yd':'—'}</b></div>`).join('')}</div>`:'<div class="msg">Sin golpes con este filtro.</div>'}
    <p class="foot">Distancias GPS entre golpes consecutivos, sin putts ni penalidades, recortando valores atípicos. Dirección y largo salen de lo que marcás después de cada golpe.</p>`;
  el.querySelectorAll('[data-pq]').forEach(b => b.onclick = () => { const [k, v] = b.dataset.pq.split('='); PQ[k] = decodeURIComponent(v); loadPalo(code); });
  const fe = focus && $('#f-' + focus); if (fe) { fe.scrollIntoView({ behavior: 'smooth', block: 'center' }); fe.classList.add('ttflash'); setTimeout(() => fe.classList.remove('ttflash'), 1800); }
}

/* ---------- actions ---------- */
async function reload(msg){ G = { ...G, ...(await api('/api/data')) }; derive(); render(true); if (msg) toast(msg); goJoin(); }
/* sync with live progress + golf animation (shared by "Vincular" and "Actualizar") */
let JUST_SYNCED = null;
function revealCard(){
  if (!JUST_SYNCED) return '';
  const name = (typeof firstName === 'function' ? firstName() : (G.user?.first_name || '')).trim();
  const hi = G.player?.handicap_index ?? G.hi_history?.at(-1)?.hi;
  const club = G.clubs[0]?.club_name;
  const first = rounds.slice().sort((a, b) => a.date < b.date ? -1 : 1)[0];
  const ds = rounds.map(r => r.date).filter(Boolean).sort();
  let cadence = null;
  if (ds.length >= 3) {
    const span = Math.max((Date.parse(ds[ds.length - 1]) - Date.parse(ds[0])) / (365.25 * 864e5), 1 / 12);
    const per = ds.length / span;
    cadence = per >= 24 ? 'Jugás seguido, varias veces por mes.' : per >= 10 ? 'Salís algunas veces por mes.' : per >= 8 ? 'Jugás más o menos una vez por mes.' : 'Jugás cuando podés.';
  }
  const lines = [
    name ? `Hola, ${name}. Soy Roberto.` : 'Hola, soy Roberto.',
    club ? `Te veo en ${club}.` : (rounds.length || hi != null) ? 'Ya estuve en tu ficha.' : 'Todavía no hay tarjetas a tu nombre.',
  ];
  if (hi != null) lines.push(`Tu índice es ${f1(hi)}.`);
  if (first) lines.push(`La primera tarjeta es de ${MES[+first.date.slice(5, 7) - 1]} ${first.date.slice(0, 4)}.`);
  if (cadence) lines.push(cadence);
  lines.push(rounds.length ? 'Solo me faltan unos datos más' : 'Te pregunto lo justo para armar tu inicio.');
  return `<div class="rv-card" id="rvcard">${lines.map(l => `<p>${esc(l)}</p>`).join('')}</div>`;
}
async function runSync({ club, url, body, sheetEl, onFail }){
  const host = sheetEl || (() => { view.dataset.v = 'sync'; view.innerHTML = `<div class="pg"><nav class="crumbs"><span class="crumb-cur">Actualizando tarjetas</span></nav><div class="sheet inpage"><div class="ga-host"></div></div></div>`; window.scrollTo(0, 0); return view.querySelector('.ga-host'); })();
  const sheet = host.closest('.sheet');
  const pid = GolfletSync.uuid(), anim = GolfletSync.mount(host, { club });
  let lastP = null; const stop = GolfletSync.poll(pid, p => { lastP = p; anim.setProgress(p); });
  try {
    const r = await api(url, { method:'POST', body: JSON.stringify({ ...body, progress_id: pid }) });
    stop();
    if (!r.sync?.ok) throw new Error(r.sync?.message || 'No se pudo actualizar');
    const acc = (r.accounts||[]).find(a => a.id === (r.account_id || body._id)) || null;
    // Golfistics App syncs every club of the link: count them all (already deduped by the API)
    const appIds = new Set(r.account_ids || (acc?.source === 'app' ? (r.accounts||[]).filter(a => a.source === 'app' && a.matricula === acc.matricula).map(a => a.id) : []));
    const total = appIds.size ? (r.accounts||[]).filter(a => appIds.has(a.id)).reduce((s, a) => s + (a.rounds||0), 0) : (acc?.rounds ?? lastP?.list_total ?? null);
    await anim.finish({ total, list_total: lastP?.list_total, title: total != null ? `Listo · ${total} tarjetas` : 'Listo' });
    // load the fresh data first so Inicio is already up to date under the leaving sheet
    G = { ...G, ...(await api('/api/data').catch(() => ({}))) }; derive();
    JUST_SYNCED = { total, added: r.sync.new_rounds };
    const rm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (anim.leave) await anim.leave(sheet); else { sheet?.classList.add('ga-leave'); await new Promise(res => setTimeout(res, rm ? 0 : 480)); }
    anim.destroy();
    if (pendingJoin() && !G.user?.pending_first_sync) { location.hash = '#/unirse/' + pendingJoin(); }   // came from a /g/<token> link
    else if (location.hash !== '#/inicio') location.hash = '#/inicio'; else render();
    toast(r.sync.new_rounds ? `${r.sync.new_rounds} tarjetas nuevas · ${total} en total` : `Al día · ${total} tarjetas`);
  } catch(e){
    stop(); anim.fail(e.message);
    setTimeout(() => { anim.destroy(); onFail ? onFail(e) : (location.hash = '#/inicio', render(true), toast(e.message, 'err')); }, onFail ? 1600 : 2200);
  }
}
async function doSync(id, password, save){
  const a = G.clubs.find(x=>x.id===id);
  if (!a) return;
  if (!a.password_saved && !password){ location.hash = '#/club/'+id; return; }
  await runSync({ club: a.source==='app' ? 'tus clubes' : a.club_name, url: `/api/accounts/${id}/sync`, body: password ? { password, save_password: !!save, _id: id } : { _id: id },
    onFail: e => { location.hash = '#/club/'+id; render(true); const m = $('#smsg'); if (m){ m.innerHTML = '<div class="msg err"></div>'; m.firstChild.textContent = e.message; } } });
}
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(()=>fn(...a), ms); }; };
const noteSeen = new Map();
const notePending = new Map();
const noteTimers = new Map();
function shownRound() {
  const box = document.querySelector('#qstat');
  return box && box.isConnected ? (box.dataset.rid || '') : '';
}
function dropNoteEdits() {
  for (const [id, pending] of notePending) if (!pending || pending.viewGen !== VIEW_GEN) notePending.delete(id);
}
function roundNotePrevious(id) {
  if (noteSeen.has(id)) return noteSeen.get(id) || '';
  const found = rounds.find(x => x.round_id === id);
  return found && found.notes_at || '';
}
function acceptRoundNote(id, note) {
  const Q = window.GolfletQuick;
  const previous = roundNotePrevious(id);
  if (!Q || !note || !Q.noteIsNewer(previous, note.updated_at)) return false;
  const round = rounds.find(x => x.round_id === id);
  const before = { putts: round ? round.putts : null, gir: round ? round.gir : null, fir: round ? round.fir : null };
  noteSeen.set(id, note.updated_at || previous);
  const write = (target) => {
    if (!target) return;
    ['putts', 'gir', 'fir'].forEach(k => { if (k in note) target[k] = note[k]; });
    if (note.updated_at) target.notes_at = note.updated_at;
  };
  write(round);
  write(G.rounds.find(x => x.round_id === id));
  if (shownRound() !== id) return true;
  const pending = notePending.get(id);
  const pendingHere = pending && pending.viewGen === VIEW_GEN ? pending : null;
  ['putts', 'gir', 'fir'].forEach(k => {
    if (!(k in note)) return;
    const input = view.querySelector(`.fields input[data-k="${k}"]`);
    if (!input) return;
    const shown = note[k] == null ? '' : String(note[k]);
    const previousShown = before[k] == null ? '' : String(before[k]);
    const pendingValue = pendingHere && pendingHere.values ? pendingHere.values[k] : undefined;
    const inflight = pendingValue != null && input.value === String(pendingValue) && input.value !== previousShown && input.value !== shown;
    if (document.activeElement === input || inflight) return;
    if (input.value !== shown) input.value = shown;
  });
  return true;
}
function releaseNoteEdit(id, sent) {
  const round = rounds.find(x => x.round_id === id);
  if (!round || !sent || shownRound() !== id) return;
  ['putts', 'gir', 'fir'].forEach(k => {
    const input = view.querySelector(`.fields input[data-k="${k}"]`);
    if (!input) return;
    if (input.value.trim() !== String(sent[k] ?? '').trim()) return;
    const shown = round[k] == null ? '' : String(round[k]);
    if (input.value !== shown) input.value = shown;
  });
}
function bindQuick(id){
  const box = $('#qstat'); if (!box) return;
  const r = rounds.find(x => x.round_id === id); if (!r || !(r.holes || []).length) { box.hidden = true; return; }
  const key = 'gl_q_' + id;
  const Q = window.GolfletQuick;
  let rows = []; try { rows = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { rows = []; }
  if (!Array.isArray(rows)) rows = [];
  const holes = r.holes.filter(h => h[0] != null);
  const holeRefs = holes.map(h => ({ hole: h[0], par: h[1] == null ? null : h[1] }));
  let idx = 0, gen = 0, phase = 'idle', chain = Promise.resolve();
  let revs = {}, seeded = false, readFailed = false, accountBoard = [];
  const drafts = new Map();
  const visible = marks => (marks || []).filter(m => m.putts != null || m.gir === true || m.gir === false || m.drive).map(m => ({ hole: m.hole, putts: m.putts ?? null, gir: m.gir ?? null, drive: m.drive ?? null, rev: m.rev }));
  const row = () => rows.find(x => x.hole === holes[idx][0]) || { hole: holes[idx][0], putts: null, gir: null, drive: null };
  const remember = () => { if (!seeded) return; try { localStorage.setItem(key, JSON.stringify(rows)); } catch (e) {} };
  const syncBoard = () => {
    const projected = Q.projectBoard(accountBoard, [...drafts.values()]);
    revs = projected.revs;
    projected.rows.forEach(rowMark => {
      const draft = drafts.get(rowMark.hole);
      if (!draft) return;
      draft.putts = rowMark.putts;
      draft.gir = rowMark.gir;
      draft.drive = rowMark.drive;
    });
    rows = visible(projected.rows);
    return projected;
  };
  const applyAccount = (marks) => {
    accountBoard = (marks || []).map(m => ({ hole: m.hole, putts: m.putts ?? null, gir: m.gir ?? null, drive: m.drive ?? null, rev: Number(m.rev) || 0 }));
    syncBoard();
    seeded = true;
    readFailed = false;
  };
  const seedPromise = api(`/api/rounds/${encodeURIComponent(id)}/hole-marks`).then(d => {
    if (!d || !Array.isArray(d.marks) || !Q) throw new Error('marcas');
    applyAccount(d.marks);
    if (!drafts.size) phase = rows.length ? 'saved' : 'idle';
    remember();
    paint();
  }).catch(() => {
    seeded = false;
    readFailed = true;
    phase = 'error';
    if (box.isConnected) paint();
  });
  const reloadAccount = () => {
    phase = 'saving';
    readFailed = false;
    drafts.clear();
    const mine = ++gen;
    paint();
    api(`/api/rounds/${encodeURIComponent(id)}/hole-marks`).then(d => {
      if (mine !== gen || !d || !Array.isArray(d.marks) || !Q) return;
      applyAccount(d.marks);
      phase = rows.length ? 'saved' : 'idle';
      remember();
      paint();
    }).catch(() => { if (mine !== gen) return; seeded = false; readFailed = true; phase = 'error'; paint(); });
  };
  const retryLoad = () => {
    phase = 'saving';
    readFailed = false;
    const mine = ++gen;
    paint();
    api(`/api/rounds/${encodeURIComponent(id)}/hole-marks`).then(d => {
      if (mine !== gen || !d || !Array.isArray(d.marks) || !Q) return;
      applyAccount(d.marks);
      remember();
      if (drafts.size) send(mine);
      else { phase = rows.length ? 'saved' : 'idle'; paint(); }
    }).catch(() => { if (mine !== gen) return; seeded = false; readFailed = true; phase = 'error'; paint(); });
  };
  const send = (mine) => {
    chain = chain.then(async () => {
      if (mine !== gen) return;
      if (!Q) { phase = 'error'; paint(); return; }
      try {
        await seedPromise;
        if (mine !== gen) return;
        if (Q.sendDecision(seeded, box.isConnected) !== 'send') {
          if (!box.isConnected) return;
          readFailed = true;
          phase = 'error';
          paint();
          return;
        }
        for (const hole of [...drafts.keys()]) {
          if (mine !== gen) return;
          const draft = drafts.get(hole);
          if (!draft) continue;
          draft.rev = Q.planHoleSend(revs, draft.hole, draft.rev);
          const par = (holes.find(h => h[0] === draft.hole) || [])[1];
          const body = { hole: draft.hole, putts: draft.putts ?? null, gir: draft.gir ?? null, drive: par === 3 ? null : (draft.drive ?? null), rev: draft.rev };
          const saved = await api(`/api/rounds/${encodeURIComponent(id)}/hole-marks`, { method: 'PUT', body: JSON.stringify(body) });
          const outcome = Q.phaseAfter(body.rev, saved);
          if (outcome === 'saved') {
            const mark = saved.mark || body;
            accountBoard = Q.acceptSaved(accountBoard, { hole: body.hole, putts: mark.putts ?? null, gir: mark.gir ?? null, drive: mark.drive ?? null, rev: Number(mark.rev) });
            if (drafts.get(hole) && drafts.get(hole).rev === body.rev) drafts.delete(hole);
            syncBoard();
            if (saved.note && Q.noteIsNewer(roundNotePrevious(id), saved.note.updated_at)) acceptRoundNote(id, saved.note);
          }
          if (mine !== gen || !box.isConnected) return;
          if (outcome !== 'saved') { phase = 'conflict'; paint(); return; }
        }
        if (mine !== gen || !box.isConnected) return;
        phase = 'saved';
        readFailed = false;
        const b = $('#gamebadge'); if (b) b.textContent = rows.length ? 'Cargado' : 'Sin cargar';
        paint();
      } catch (e) {
        if (mine !== gen || !box.isConnected) return;
        phase = e && e.status === 409 ? 'conflict' : 'error';
        paint();
      }
    }).catch(() => { if (mine === gen && phase === 'saving' && box.isConnected) { phase = 'error'; paint(); } });
  };
  const put = (patch) => {
    if (phase === 'conflict' || readFailed) return;
    const holeNo = holes[idx][0];
    const cur = row();
    const prev = drafts.get(holeNo);
    const touched = { putts: !!(prev && prev.touched && prev.touched.putts), gir: !!(prev && prev.touched && prev.touched.gir), drive: !!(prev && prev.touched && prev.touched.drive) };
    if (Object.prototype.hasOwnProperty.call(patch, 'putts')) touched.putts = true;
    if (Object.prototype.hasOwnProperty.call(patch, 'gir')) touched.gir = true;
    if (Object.prototype.hasOwnProperty.call(patch, 'drive')) touched.drive = true;
    const next = Object.assign({ hole: holeNo, putts: null, gir: null, drive: null }, cur, patch);
    if (holes[idx][1] === 3) next.drive = null;
    if (next.putts == null && next.gir == null && !next.drive) rows = rows.filter(x => x.hole !== next.hole);
    else { const i = rows.findIndex(x => x.hole === next.hole); if (i < 0) rows.push(next); else rows[i] = next; }
    drafts.set(holeNo, { hole: holeNo, putts: next.putts ?? null, gir: next.gir ?? null, drive: next.drive || null, rev: 0, touched });
    phase = 'saving';
    const mine = ++gen;
    remember();
    paint();
    send(mine);
  };
  const btn = (label, on, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.className = on ? 'on' : ''; b.onclick = fn; return b; };
  const paint = () => {
    if (!box.isConnected) return;
    const h = holes[idx], par = h[1], cur = row();
    $('#qhole').textContent = `Hoyo ${h[0]}`;
    $('#qpar').textContent = par != null ? `Par ${par}` : 'Sin par';
    const pp = $('#qputts'); pp.replaceChildren();
    [0, 1, 2, 3, 4].forEach(n => pp.appendChild(btn(String(n), cur.putts === n, () => put({ putts: cur.putts === n ? null : n }))));
    if (cur.putts != null) pp.appendChild(btn('Borrar', false, () => put({ putts: null })));
    const fwBox = $('#qfwbox'); fwBox.hidden = par === 3;
    const fw = $('#qfw'); fw.replaceChildren();
    if (par !== 3) [['left', 'Izquierda'], ['fairway', 'Fairway'], ['right', 'Derecha'], ['other', 'Otro']].forEach(([k, l]) => fw.appendChild(btn(l, cur.drive === k, () => put({ drive: cur.drive === k ? null : k }))));
    const gg = $('#qgir'); gg.replaceChildren();
    gg.appendChild(btn('Sí', cur.gir === true, () => put({ gir: cur.gir === true ? null : true })));
    gg.appendChild(btn('No', cur.gir === false, () => put({ gir: cur.gir === false ? null : false })));
    if (cur.gir === true || cur.gir === false) gg.appendChild(btn('Borrar', false, () => put({ gir: null })));
    const puttH = rows.filter(x => x.putts != null), girH = rows.filter(x => x.gir === true || x.gir === false);
    const fwH = rows.filter(x => x.drive && (r.holes.find(h2 => h2[0] === x.hole) || [])[1] !== 3);
    const bits = [];
    if (puttH.length) bits.push(`${puttH.reduce((s, x) => s + x.putts, 0)} putts en ${puttH.length} hoyos`);
    if (girH.length) bits.push(`${girH.filter(x => x.gir).length} greens de ${girH.length}`);
    if (fwH.length) bits.push(`${fwH.filter(x => x.drive === 'fairway').length} fairways de ${fwH.length} salidas`);
    $('#qtot').textContent = bits.length ? `${bits.join(' · ')}. En los hoyos marcados. El total de la tarjeta queda igual hasta completar cada hoyo.` : '';
    const any = rows.some(x => x.putts != null || x.gir === true || x.gir === false || x.drive);
    const msg = $('#qmsg');
    if (msg) {
      if (readFailed && phase === 'error') msg.textContent = 'No se pudo leer la cuenta. Los totales de la tarjeta siguen igual.';
      else if (!seeded && phase === 'idle') msg.textContent = 'Leyendo la cuenta…';
      else if (phase === 'idle') msg.textContent = any ? 'Guardado en este dispositivo' : 'Sin cargar';
      else if (phase === 'saved') msg.textContent = any ? Q.saveMessage('saved') : 'Sin cargar';
      else msg.textContent = Q ? Q.saveMessage(phase) : 'No se pudo guardar. Lo que marcaste sigue acá.';
    }
    const retry = $('#qretry');
    if (retry) {
      retry.hidden = phase !== 'conflict' && phase !== 'error';
      retry.onclick = () => { if (phase === 'conflict') reloadAccount(); else retryLoad(); };
    }
    const b = $('#gamebadge'); if (b && !any && !(r.putts != null || r.gir != null || r.fir != null)) b.textContent = 'Sin cargar';
    const track = document.getElementById('round-track');
    if (track) track.setAttribute('href', `#/reconstruir?ronda=${encodeURIComponent(r.round_id)}&hole=${h[0]}`);
  };
  box.querySelectorAll('[data-qh]').forEach(b => b.onclick = () => { idx = (idx + holes.length + Number(b.dataset.qh)) % holes.length; paint(); });
  paint();
}
function queueNoteSave(id, sent, gen, viewGen) {
  clearTimeout(noteTimers.get(id));
  noteTimers.set(id, setTimeout(() => { noteTimers.delete(id); saveNote(id, sent, gen, viewGen); }, 700));
}
const saveNote = async (id, sent, gen, viewGen) => {
  const r = rounds.find(x=>x.round_id===id); if(!r || !sent) return;
  const here = () => shownRound() === id && VIEW_GEN === viewGen;
  const body = { putts: sent.putts, gir: sent.gir, fir: sent.fir };
  try { const { note } = await api(`/api/rounds/${id}/notes`, { method:'PUT', body: JSON.stringify(body) });
    acceptRoundNote(id, note);
    const pending = notePending.get(id);
    if (pending && pending.gen === gen && pending.viewGen === viewGen) notePending.delete(id);
    if (!here()) return;
    releaseNoteEdit(id, sent);
    const el = $('#saved span'); if (el) el.textContent = 'Guardado en tu cuenta';
    const gb = $('#gamebadge'); if (gb && (note.putts!=null||note.gir!=null||note.fir!=null)) gb.textContent = 'Cargado'; }
  catch(e){ if (!here()) return; const el = $('#saved span'); if (el) el.textContent = e.status===400 ? 'Revisá los números (putts 0–99, greens y fairways 0–18)' : 'No se pudo guardar: '+e.message; }
};
const saveBag = debounce(async () => {
  try { const { bag } = await api('/api/bag', { method:'PUT', body: JSON.stringify({ bag: G.bag }) }); G.bag = bag; window.GolfletPlan?.invalidateClubs?.(); const f = $('#bagsaved'); if (f) f.textContent = 'Guardado en tu cuenta.'; }
  catch(e){ toast('No se pudo guardar la bolsa', 'err'); }
}, 700);

/* ---------- router: every detail is its own page (no pop-ups); back link = where you came from ---------- */
let base = 'inicio';
const BACK = (() => { try { return JSON.parse(sessionStorage.getItem('gl_back') || '{}'); } catch(e){ return {}; } })();
/* ---------- t136u: weather per round (Open-Meteo archive) ---------- */
const WX_IC = {
  despejado: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="#C8A86A"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" stroke="#C8A86A" stroke-width="1.8" stroke-linecap="round"/></svg>',
  nublado: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18.5h10.2a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.3A3.4 3.4 0 0 0 7 18.5z" fill="none" stroke="#7C8A84" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  lluvia: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 14.5h10.2a3.8 3.8 0 0 0 .4-7.6A5.3 5.3 0 0 0 7.4 8.2 3.2 3.2 0 0 0 7 14.5z" fill="none" stroke="#3F6E8C" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.5 17.5l-1 2.5M12.5 17.5l-1 2.5M16.5 17.5l-1 2.5" stroke="#3F6E8C" stroke-width="1.8" stroke-linecap="round"/></svg>',
  tormenta: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 14h10.2a3.8 3.8 0 0 0 .4-7.6A5.3 5.3 0 0 0 7.4 7.7 3.2 3.2 0 0 0 7 14z" fill="none" stroke="#B4553F" stroke-width="1.8" stroke-linejoin="round"/><path d="M12.8 14.5l-2.3 3.6h2.6l-1.6 3.4" fill="none" stroke="#B4553F" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' };
const WX_L = { despejado: 'Despejado', nublado: 'Nublado', lluvia: 'Lluvia', tormenta: 'Tormenta' };
let WX = null, WXP = null;
const loadWX = () => WXP || (WXP = api('/api/weather/rounds').then(d => (WX = d)).catch(() => { WXP = null; return null; }));
const n1 = v => v == null ? '—' : String(Math.round(v * 10) / 10).replace('.', ',');
function decorateWx(){
  const rows = view.querySelectorAll('a[href^="#/ronda/"]:not([data-wx])'); if (!rows.length) return;
  loadWX().then(d => { if (!d) return; view.querySelectorAll('a[href^="#/ronda/"]:not([data-wx])').forEach(a => {
    a.dataset.wx = '1'; const w = d.rounds[a.getAttribute('href').split('/')[2]]; if (!w || !w.condition) return;
    const t = a.querySelector('.body .t') || a.querySelector('.t'); if (!t) return;
    t.insertAdjacentHTML('beforeend', ` <span class="wxi" title="${WX_L[w.condition]}${w.temp_c!=null?` · ${n1(w.temp_c)}°`:''}" aria-label="${WX_L[w.condition]}">${WX_IC[w.condition]}${w.temp_c!=null?`<b class="num">${Math.round(w.temp_c)}°</b>`:''}</span>`); }); });
}
async function loadRoundWx(id){
  const el = $('#rwx'); if (!el) return;
  let d; try { d = await api(`/api/rounds/${encodeURIComponent(id)}/weather`); } catch(e){ return; }
  if (!$('#rwx')) return; const w = d.weather;
  if (!w) { el.innerHTML = d.reason === 'no_course_location' ? '' : `<div class="card wx-card wx-none"><span class="overline">Clima</span><span>Todavía no tenemos el clima de ese día. Lo traemos en unos días.</span></div>`; return; }
  el.innerHTML = `<div class="card wx-card"><div class="wx-h"><span class="wx-ic">${WX_IC[w.condition]||''}</span><div><span class="overline">Clima ${w.basis==='tee_time'?'en tu salida':'durante el día'}</span><b>${WX_L[w.condition]||'—'}</b></div></div>
    <div class="wx-kv"><div><span>Temperatura</span><b class="num">${n1(w.temp_c)}°</b></div><div><span>Lluvia</span><b class="num">${n1(w.precip_mm)} mm</b></div><div><span>Viento</span><b class="num">${w.wind_kmh!=null?Math.round(w.wind_kmh):'—'} km/h</b></div><div><span>Ráfagas</span><b class="num">${w.gust_kmh!=null?Math.round(w.gust_kmh):'—'} km/h</b></div></div>
    <p class="wx-src">${w.window[0]} a ${w.window[1]} h · Open-Meteo (histórico)</p></div>`;
}
const dsg = v => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '±') + String(Math.abs(Math.round(v*10)/10)).replace('.', ',');
const DIMS = [['lluvia','Lluvia o seco'],['temperatura','Temperatura'],['viento','Viento']];
async function loadWxRes(){
  const el = $('#wxres'); if (!el) return;
  let d; try { d = await api('/api/metrics/weather'); } catch(e){ el.innerHTML = ''; return; }
  if (!$('#wxres')) return; const dims = DIMS.filter(([k]) => d[k]?.enough);
  if (!dims.length) { el.innerHTML = d.n ? `<div class="section"><h2>Clima y juego</h2></div><div class="card wx-empty">Con ${d.n} tarjetas con clima todavía no alcanza para comparar (hacen falta ${d.min_group} por grupo). Se arma a medida que juegues.</div>` : ''; return; }
  el.innerHTML = `<div class="section"><h2>Clima y juego</h2><a href="#/clima/lluvia">Ver detalle</a></div>
    <div class="list wx-list">${dims.map(([k, l]) => `<a class="row" href="#/clima/${k}"><div class="body"><div class="t">${l}</div><div class="s">${d[k].buckets.map(b => `${esc(b.label)} <b class="num">${n1(b.avg_diff)}</b>`).join(' · ')}</div></div>${ICON.chev}</a>`).join('')}</div>
    <p class="foot">Diferencial promedio por grupo (más bajo es mejor), sobre ${d.n} tarjetas válidas con clima. Grupos con al menos ${d.min_group} tarjetas.</p>`;
}
function sClima(){ return `<div class="bar"><span class="overline">Resumen</span><button class="close" data-close>${ICON.x}</button></div><div id="clima"><div style="padding:60px 0;text-align:center"><span class="spin"></span></div></div>`; }
async function loadClima(dim, bucket){
  const el = $('#clima'); if (!el) return;
  try {
    const d = await api(`/api/metrics/weather?dim=${encodeURIComponent(dim)}${bucket?`&bucket=${encodeURIComponent(bucket)}`:''}`); if (!$('#clima')) return;
    const g = d.group, rows = d.rounds.slice().sort((a, b) => b.date.localeCompare(a.date));
    el.innerHTML = `<div class="stitle">Clima y juego</div>
      <div class="seg wx-seg">${DIMS.map(([k, l]) => `<a href="#/clima/${k}" class="${k===dim?'on':''}">${l}</a>`).join('')}</div>
      ${g.enough ? `<div class="wx-bars">${g.buckets.map(b => `<a class="card wx-b${b.key===bucket?' on':''}" href="#/clima/${dim}${b.key===bucket?'':'/'+b.key}"><span>${esc(b.label)}</span><b class="num">${n1(b.avg_diff)}</b><small class="num ${b.vs_overall<0?'pos':b.vs_overall>0?'neg':''}">${dsg(b.vs_overall)} vs tu promedio</small><small class="num">${b.n} tarjetas</small></a>`).join('')}</div>`
        : `<div class="card wx-empty">Todavía no alcanza para comparar ${esc(DIMS.find(x=>x[0]===dim)?.[1].toLowerCase()||'')} (hacen falta ${3} tarjetas por grupo).</div>`}
      <p class="foot">Diferencial promedio (más bajo es mejor). Tu promedio con clima: <b class="num">${n1(d.overall_avg_diff)}</b>. ${vidSlot('clima')}</p>
      <div class="section"><h2>${bucket ? esc(g.buckets.find(b=>b.key===bucket)?.label || 'Tarjetas') : 'Tarjetas'}</h2><span class="badge">${rows.length}</span></div>
      ${yrList(rows, r => r.date, r => `<a class="row" href="#/ronda/${r.round_id}" data-wx="1">${dateBlock(r.date)}<div class="body"><div class="t">${esc(r.course||'Ronda')} <span class="wxi">${WX_IC[r.wx.condition]||''}</span></div><div class="s">${WX_L[r.wx.condition]||''} · ${n1(r.wx.temp_c)}° · ${n1(r.wx.precip_mm)} mm · ${r.wx.wind_kmh!=null?Math.round(r.wx.wind_kmh):'—'} km/h</div></div><div class="score"><b class="num">${n1(r.differential)}</b><span>dif.</span></div>${ICON.chev}</a>`)}
      <p class="foot">Clima de Open-Meteo (histórico) para la ubicación de la cancha: en tu horario de salida si lo tenemos, si no, de 10 a 16 h. Las canchas sin ubicación no tienen clima.</p>`;
  } catch(e){ el.innerHTML = errBox(e); }
}
/* ---------- t136u/t137u: PRIVATE (owner-only) by tee-time hour band and partners ---------- */
const LOCK_IC = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
const PRIV_EMPTY = 'Se arma a medida que juegues: usamos tus salidas reservadas en el club desde que vinculaste tu cuenta.';
async function loadPrivRes(){
  const el = $('#privres'); if (!el) return;
  let d; try { d = await api('/api/me/private-metrics'); } catch(e){ el.innerHTML = ''; return; }
  if (!$('#privres')) return; const top = d.partners.slice(0, 3);
  el.innerHTML = `<div class="section"><h2 class="priv-h">${LOCK_IC}Solo para vos</h2></div>
    <div class="list priv-list"><a class="row" href="#/privado/horario"><div class="body"><div class="t">Por horario</div><div class="s">${d.played ? d.bands.map(b => `${b.label} <b class="num">${b.played}</b>`).join(' · ') : 'Se arma a medida que juegues'}</div></div>${ICON.chev}</a>
    <a class="row" href="#/privado/companeros"><div class="body"><div class="t">Con quién jugás</div><div class="s">${top.length ? top.map(p => `${esc(p.name.split(' ')[0])} <b class="num">${p.count}</b>`).join(' · ') : 'Se arma a medida que juegues'}</div></div>${ICON.chev}</a></div>
    <p class="foot">Privado: solo lo ves vos. No aparece en grupos, profesores ni enlaces compartidos.</p>`;
}
function sPrivado(){ return `<div class="bar"><span class="overline">Solo para vos</span><button class="close" data-close>${ICON.x}</button></div><div id="privado"><div style="padding:60px 0;text-align:center"><span class="spin"></span></div></div>`; }
const teeRowP = t => `<${t.round_id?`a href="#/ronda/${t.round_id}"`:'div'} class="row">${dateBlock(t.date)}<div class="body"><div class="t">${esc(t.club_name||'')}${t.course_label?' · '+esc(t.course_label):''}</div><div class="s">${esc(t.time)} · ${t.companions.length?esc(t.companions.map(n=>n.split(' ')[0]).join(', ')):'sin compañeros leídos'}</div></div>${t.round_id?`<div class="score"><b class="num">${n1(t.differential)}</b><span>dif.</span></div>${ICON.chev}`:'<div class="score"><span>sin tarjeta</span></div>'}</${t.round_id?'a':'div'}>`;
async function loadPrivado(what, arg){
  const el = $('#privado'); if (!el) return;
  try {
    const priv = `<p class="foot priv-note">${LOCK_IC}Privado: solo lo ves vos.</p>`;
    if (what === 'franja' || what === 'companero') {
      const d = await api(what === 'franja' ? `/api/me/private-metrics/bands/${encodeURIComponent(arg)}` : `/api/me/private-metrics/partners/${encodeURIComponent(arg)}`); if (!$('#privado')) return;
      const h = what === 'franja' ? d.band : d.partner;
      el.innerHTML = `<div class="stitle">${esc(what === 'franja' ? h.label : h.name)}</div>
        <div class="grid3" style="grid-template-columns:repeat(2,1fr);gap:8px;margin-top:12px"><div class="card mini stat"><div class="k">${what==='franja'?'Veces que jugaste':'Salidas juntos'}</div><div class="v num">${what==='franja'?h.played:h.count}</div></div>
        <div class="card mini stat"><div class="k">Diferencial promedio</div><div class="v num">${n1(h.avg_diff)}</div></div></div>
        <p class="foot">${h.avg_diff==null?`El promedio aparece con al menos 3 salidas con tarjeta (hay ${h.matched}).`:`Sobre ${h.matched} salidas con tarjeta. Tu promedio general: ${n1(d.overall_avg_diff)}.`}</p>
        <div class="section"><h2>Salidas</h2><span class="badge">${d.tee_times.length}</span></div>${yrList(d.tee_times, t => t.date, teeRowP)}${priv}`;
      return;
    }
    const d = await api('/api/me/private-metrics'); if (!$('#privado')) return;
    if (d.empty) { el.innerHTML = `<div class="stitle">${what==='companeros'?'Con quién jugás':'Por horario'}</div><div class="card wx-empty" style="margin-top:14px">${PRIV_EMPTY}</div>${priv}`; return; }
    el.innerHTML = what === 'companeros'
      ? `<div class="stitle">Con quién jugás</div><p class="foot">Compañeros de línea que el club muestra en tus reservas, de más a menos salidas.</p>
         <div class="list">${d.partners.map((p, i) => `<a class="row" href="#/privado/companero/${encodeURIComponent(p.key)}"><div class="date"><b class="num">${i+1}</b></div><div class="body"><div class="t">${esc(p.name)}</div><div class="s">${p.count} ${p.count===1?'salida':'salidas'}${p.avg_diff!=null?` · dif. ${n1(p.avg_diff)}`:''}</div></div><span class="badge num">${p.count}</span>${ICON.chev}</a>`).join('') || `<div class="card wx-empty">Todavía no leímos compañeros en tus salidas.</div>`}</div>${priv}`
      : `<div class="stitle">Por horario</div><p class="foot">Salidas reservadas en el club que ya pasaron: ${d.played}, ${d.matched} con tarjeta.</p>
         <div class="list">${d.bands.map(b => `<a class="row" href="#/privado/franja/${b.key}"><div class="body"><div class="t">${b.label}</div><div class="s">${b.played} ${b.played===1?'vez':'veces'}${b.avg_diff!=null?` · dif. ${n1(b.avg_diff)}`:b.played?` · promedio con 3+ tarjetas`:''}</div></div><span class="badge num">${b.played}</span>${ICON.chev}</a>`).join('')}</div>
         <p class="foot">Mañana: antes de las 11 · Mediodía: 11 a 14 · Tarde: desde las 14.</p>${priv}`;
  } catch(e){ el.innerHTML = errBox(e); }
}
const DETAIL = ['reconstruir','jugar','metricas','notificaciones','notificacion','pelota','sorteos','sorteo','ronda','hoyo','vincular','club','cuenta','metrica','gps','palo','estrategia','amigos','grupo','unirse','compartir','nivel','trabajar','putting','tee','tees','equipo','impacto','club-faltante','hi-cambio','cambios','outliers','profesor','profesores','profe','clima','privado','plan','partido','partidos'];
const GROUPISH = k => ['amigos','grupo','unirse','compartir'].includes(k);
const GG = window.GolfletGroups;
const GM = window.GolfletMatch;   // t260u Armar partido (public/match.js)
const GP = window.GolfletPlan;   // t176u Estrategia de juego (public/plan.js)
const kind = h => (h || '').replace(/^#\/?/, '').split(/[/?]/)[0] || 'inicio';
const PARENT = { reconstruir:'#/rondas', jugar:'#/metricas', metricas:'#/resumen', notificaciones:'#/inicio', notificacion:'#/notificaciones', clima:'#/resumen', privado:'#/resumen', pelota:'#/cuenta', sorteos:'#/cuenta', sorteo:'#/sorteos', profe:'#/cuenta', profesor:'#/cuenta', profesores:'#/cuenta', 'hi-cambio':'#/inicio', cambios:'#/inicio', outliers:'#/resumen', 'club-faltante':'#/cuenta', impacto:'#/inicio', equipo:'#/bolsa', tee:'#/inicio', tees:'#/inicio', trabajar:'#/inicio', putting:'#/resumen', nivel:'#/cancha', ronda:'#/rondas', hoyo:'#/cancha', vincular:'#/cuenta', club:'#/cuenta', cuenta:'#/inicio', metrica:'#/resumen', gps:'#/bolsa', palo:'#/bolsa', estrategia:'#/cancha' };
function labelFor(h){
  const p = (h || '#/inicio').replace(/^#\/?/, '').split('/'), k = p[0].split('?')[0] || 'inicio';
  if (GROUPISH(k) && GG) return GG.label(h);
  if (k === 'plan' && GP) return GP.label(h);
  if ((k === 'partido' || k === 'partidos') && GM) return GM.label(h);
  if (k === 'metrica') return MTITLE[(p[1]||'').split('?')[0]] || 'Detalle';
  if (k === 'hoyo') return `Hoyo ${p[2]||''}`.trim();
  if (k === 'nivel') return 'Vs tu nivel';
  if (k === 'tees') return 'Tee times';
  if (k === 'impacto') return 'Impacto en el hándicap';
  if (k === 'hi-cambio') return 'Cambio de índice';
  if (k === 'cambios') return 'Cambios';
  if (k === 'outliers') return 'Cómo se calcula';
  if (k === 'profesores') return p[1] === 'buscar' ? 'Agregar un profesor' : p[1] === 'encontrar' ? 'Encontrar un profesor' : 'Mis profesores';
  if (k === 'profesor') return 'Profesores';
  if (k === 'profe') return 'Espacio profesor';
  if (k === 'club-faltante') return 'Club que no aparece';
  if (k === 'clima') return 'Clima y juego';
  if (k === 'privado') return p[1] === 'companeros' || p[1] === 'companero' ? 'Con quién jugás' : 'Por horario';
  if (k === 'pelota') return 'Mi pelota';
  if (k === 'sorteos') return 'Sorteos';
  if (k === 'notificaciones') return 'Notificaciones';
  if (k === 'jugar') return 'Ronda con GPS';
  if (k === 'metricas') return (p[1] === 'hierros' || p[1] === 'approach') && p[2] ? 'Approach' : p[1] === 'gir' && p[2] ? `GIR par ${String(p[2]).slice(3)}` : 'Métricas';
  if (k === 'notificacion') return 'Notificación';
  if (k === 'sorteo') return p[2] === 'bases' ? 'Bases y condiciones' : 'Sorteo';
  if (k === 'equipo') return p[1] === 'nuevo' ? 'Agregar palo' : p[2] === 'editar' ? 'Editar palo' : 'Palo';
  if (k === 'tee') return 'Tee time';
  if (k === 'trabajar') return p[1] ? (IMP?.areas?.find(a => a.key === p[1])?.label || 'Qué trabajar') : 'Qué trabajar';
  if (k === 'putting') return p[1] ? (PM[p[1].split('?')[0]] || 'Putting') : 'Putting';
  if (k === 'ronda') { const r = rounds.find(x => x.round_id === p[1]); return r ? short(r.tournament) || 'Ronda' : 'Ronda'; }
  if (k === 'club') return G.clubs.find(x => x.id === p[1])?.club_name || 'Club';
  return { inicio:'Inicio', resumen:'Resumen', rondas:'Rondas', cancha:'Cancha', bolsa:'Mi bolsa', cuenta:'Tu cuenta', vincular:'Vincular', estrategia:'Cómo jugar la cancha', gps:'Ronda con GPS', palo:'Distancias por palo', amigos:'Amigos' }[k] || 'Volver';
}
addEventListener('hashchange', e => {
  const from = '#' + (e.oldURL.split('#')[1] || '/inicio'), to = location.hash || '#/inicio', kt = kind(to), kf = kind(from);
  if (!DETAIL.includes(kt) || BACK[to]) return;
  BACK[to] = (kt === kf && BACK[from]) ? BACK[from] : from;     // switching inside the same kind of page keeps the original back target
  const keys = Object.keys(BACK); if (keys.length > 60) delete BACK[keys[0]];
  try { sessionStorage.setItem('gl_back', JSON.stringify(BACK)); } catch(_){}
});
/* left list (desktop/iPad) next to a detail */
function asideRounds(id){
  const list = rounds.filter(r => segL === 'Todas' || r.course_key === segL);
  return `<div class="mdl-h">Rondas <span class="num">${list.length}</span></div>` + list.map(r => { const [y,m,d] = r.date.split('-');
    return `<a class="mdl-row ${r.round_id===id?'on':''}" href="#/ronda/${r.round_id}"><span class="mdl-d num">${+d} ${MES[m-1]}<small>${y}</small></span><span class="mdl-t">${cup(r)+esc(short(r.tournament)||'Ronda')}<small>${esc(r.course_label || clabel(r.course_key))}</small></span><b class="num">${r.valid_card && r.gross ? r.gross : 'DES'}</b></a>`; }).join('');
}
function asideHoles(ck, n){
  const c = course(ck); if (!c) return '';
  return `<div class="mdl-h">${esc(c.label || c.course)}</div>` + c.holes.map(h => `<a class="mdl-row ${String(h.hole)===String(n)?'on':''}" href="#/hoyo/${encodeURIComponent(c.key)}/${h.hole}"><span class="mdl-d num">${h.hole}</span><span class="mdl-t">Par ${h.par}<small>Handicap ${h.hcp??'—'}</small></span><b class="num">${h.stats?.n ? sg(h.stats.avg_to_par) : '—'}</b></a>`).join('');
}
function asideMetrics(m){
  const st = MQ[m] || {}, keep = { scope: st.scope || 'year', year: st.year || String(new Date().getFullYear()), course: st.course || 'all', range: st.range || '' };
  const items = ['rounds','best-gross','average','handicap','eagles','birdies','pars','bogeys','doubles'];
  return `<div class="mdl-h">Métricas</div>` + items.map(k => `<a class="mdl-row ${k===m?'on':''}" href="${mlink(k, k==='handicap'?{scope:'all'}:{ ...keep, sort: SCOREK.includes(k)?'date':(k==='best-gross'?'gross':'date'), order: k==='best-gross'?'asc':'desc' })}"><span class="mdl-t">${MTITLE[k]}</span></a>`).join('');
}
function asideAccount(active){
  return `<div class="mdl-h">Tu cuenta</div><a class="mdl-row ${active==='cuenta'?'on':''}" href="#/cuenta"><span class="mdl-t">Perfil y sesión</span></a>`
    + G.clubs.map(a => `<a class="mdl-row ${active===a.id?'on':''}" href="#/club/${a.id}"><span class="mdl-t">${esc(a.club_name)}<small>${a.rounds} tarjetas</small></span></a>`).join('')
    + `<a class="mdl-row ${active==='vincular'?'on':''}" href="#/vincular"><span class="mdl-t">Vincular otra matrícula</span></a>`
    + `<a class="mdl-row ${active==='compartir'?'on':''}" href="#/compartir"><span class="mdl-t">Qué comparto<small>Con tus grupos de Amigos</small></span></a>`;
}
function render(keepScroll){
  if (!G) return;
  VIEW_GEN++;
  dropNoteEdits();
  if (REC && !location.hash.includes(REC.id.replace('live:',''))) micAbort();
  const p = (location.hash.replace(/^#\/?/,'') || 'inicio').split('/').map((x,i,a) => a[0]==='metrica' && i===1 ? x : decodeURIComponent(x));
  if (p.length === 1 && p[0].includes('?')) {            // #/resumen?range=3m — period lives in the URL
    const [k, qs] = p[0].split('?'); p[0] = k; const r = new URLSearchParams(qs).get('range'); if (RKEYS.includes(r)) setRange(r);
  } else if (p.length === 1 && ['inicio','resumen','cancha'].includes(p[0]) && RANGE !== 'all') history.replaceState(null, '', `#/${p[0]}?range=${RANGE}`);
  const playLive = p[0] === 'jugar' && !!p[1];
  document.documentElement.classList.remove('rc-map');
  window.GolfletTrack?.destroy?.();
  document.documentElement.classList.toggle('gp-fix', playLive || !!(GP && GP.fixed && GP.fixed(location.hash)));
  document.documentElement.classList.toggle('gp-live', playLive || !!(GP && GP.practiceLive && GP.practiceLive(location.hash))); setTabH();
  let detail = null, aside = null;
  if (p[0]==='ronda'){ detail = sRonda(p[1]); aside = asideRounds(p[1]); base = base==='inicio'||base==='resumen'?base:'rondas'; }
  else if (p[0]==='hoyo'){ detail = sHoyo(p[1],p[2]); aside = asideHoles(p[1], p[2]); if (base!=='resumen') base='cancha'; segC = p[1]; }
  else if (p[0]==='vincular'){ detail = sVincular(); aside = asideAccount('vincular'); }
  else if (p[0]==='club'){ detail = sClub(p[1]); aside = asideAccount(p[1]); }
  else if (p[0]==='cuenta'){ detail = sCuenta(); aside = asideAccount('cuenta'); }
  else if (p[0]==='metrica'){ const [m, qs] = (p[1]||'').split('?'); detail = sMetric(m, qs); aside = asideMetrics(m); }
  else if (p[0]==='gps'){ detail = sGps(p[1]); base = 'bolsa'; }
  else if (p[0]==='palo'){ detail = sPalo(p[1]); base = 'bolsa'; }
  else if (GROUPISH(p[0]) && GG){ detail = GG.page(p, location.hash); if (p[0]==='compartir') aside = asideAccount('compartir'); }
  else if (p[0]==='plan' && GP){ detail = GP.page(p); base = 'inicio'; }
  else if ((p[0]==='partido' || p[0]==='partidos') && GM){ detail = GM.page(p); base = 'inicio'; }
  else if (p[0]==='estrategia'){ const k = decodeURIComponent(p[1]||''); detail = sEstrategia(k); base = 'cancha'; segC = k; }
  else if (p[0]==='nivel'){ const k = (p[1]||'').split('?')[0]; detail = sNivel(k); base = 'cancha'; segC = k; }
  else if (p[0]==='tees'){ detail = sTees(); base = 'inicio'; }
  else if (p[0]==='club-faltante'){ detail = sClubFaltante(); base = 'inicio'; }
  else if (p[0]==='clima'){ detail = sClima(); base = 'resumen'; }
  else if (p[0]==='privado'){ detail = sPrivado(); base = 'resumen'; }
  else if (p[0]==='pelota'){ detail = sPelota(); base = 'cuenta'; }
  else if (p[0]==='sorteos'){ detail = sSorteos(); base = 'cuenta'; }
  else if (p[0]==='reconstruir'){ detail = `<div id="recon" data-id="${esc((p[1] || '').split('?')[0])}"></div>`; base = 'rondas'; }
  else if (p[0]==='jugar'){ detail = sJugar(p[1]); base = 'resumen'; }
  else if (p[0].split('?')[0]==='metricas'){ detail = sMetricas(p[1], p[2]); base = 'resumen'; }
  else if (p[0]==='notificaciones'){ detail = sNotifs(); base = 'inicio'; }
  else if (p[0]==='notificacion'){ detail = sNotif(); base = 'inicio'; }
  else if (p[0]==='sorteo'){ detail = sSorteo(p[1], p[2]==='bases'); base = 'cuenta'; }
  else if (p[0].split('?')[0]==='impacto'){ detail = sImpacto(); base = 'inicio'; }
  else if (p[0]==='cambios'){ detail = sCambios(); base = 'inicio'; }
  else if (p[0]==='hi-cambio'){ detail = sHiCambio(); base = 'inicio'; }
  else if (p[0]==='outliers'){ detail = sOutliers(); base = 'resumen'; }
  else if (p[0]==='profesores'){ detail = p[1]==='encontrar' ? sMatch(p[2]) : p[1] ? sProfBuscar() : sMisProfes(); base = 'cuenta'; }
  else if (p[0]==='profesor'){ detail = sProfesor(); base = 'cuenta'; }
  else if (p[0]==='profe'){ detail = p[1]==='perfil' ? sProfePerfil() : p[1]==='alumno' ? (p[3]==='clase' ? sProfeClase() : p[3]==='contenido' ? sProfeContenido() : sProfeAlumno()) : sProfe(); base = 'cuenta'; }
  else if (p[0]==='equipo'){ detail = sEquipo(decodeURIComponent(p[1]||'nuevo'), p[2]==='editar'); base = 'bolsa'; }
  else if (p[0]==='tee' && p[1] && p[1]!=='nuevo'){ detail = sTee(p[1]); base = 'inicio'; }
  else if (p[0]==='trabajar'){ const a = (p[1]||'').split('?')[0]; detail = sTrabajar(a); aside = asideTrabajar(a); base = 'inicio'; }
  else if (p[0]==='putting'){ const m = (p[1]||'').split('?')[0]; detail = sPutting(m); aside = asidePutting(m); base = 'resumen'; }
  else base = ['inicio','resumen','rondas','cancha','bolsa'].includes(p[0]) ? p[0] : 'inicio';
  const y = window.scrollY;
  if (detail){
    const here = location.hash || '#/inicio', back = (GROUPISH(p[0]) && GG) ? GG.parent(here) : (p[0] === 'plan' && GP) ? GP.parent(here) : ((p[0] === 'partido' || p[0] === 'partidos') && GM) ? GM.parent(here) : (p[0] === 'metricas' && p[2]) ? `#/metricas/${metTab(p[1])}` : (BACK[here] || PARENT[p[0]] || '#/inicio');
    detail = detail.replace(/<button class="close" data-close>[\s\S]*?<\/button>/g, '');
    view.dataset.v = 'd-' + p[0];
    view.innerHTML = `<div class="pg"><nav class="crumbs" aria-label="Volver"><a class="crumb-back" href="${esc(back)}"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M8 1L3 6l5 5"/></svg>${esc(labelFor(back))}</a></nav>
      <div class="md${aside ? ' has-aside' : ''}">${aside ? `<aside class="md-list">${aside}</aside>` : ''}<article class="md-detail">${detail}</article></div></div>`;
    window.scrollTo(0, 0);
    const on = view.querySelector('.md-list .on'); if (on) on.scrollIntoView({ block: 'nearest' });
  } else {
    const V = {inicio:vInicio,resumen:vResumen,rondas:vRondas,cancha:vCancha,bolsa:vBolsa}[base];
    view.dataset.v = base; try { view.innerHTML = V(); } catch (e) { console.error('view', base, e?.message); view.innerHTML = `<div class="pg">${errBox(e, 'esta pantalla')}<p class="foot"><a href="#/jugar">Jugar</a></p></div>`; }   // t254u: never a blank screen
    window.scrollTo(0, keepScroll ? y : 0);
  }
  sheetRoot.innerHTML = ''; document.body.classList.remove('sheet-open');
  document.querySelectorAll('#tabbar a[data-tab]').forEach(a=>a.classList.toggle('on', a.dataset.tab===(['cuenta','club','vincular','compartir','profesor','profesores','profe'].includes(p[0])?'cuenta':['amigos','grupo','unirse'].includes(p[0])?'amigos':base)));
  const na = document.querySelector('#tabbar .nav-admin'); if (na) { na.hidden = !(G.user?.role); na.href = G.user?.role==='admin' ? '/admin' : '/admin/strategy'; }
  bind(p, !!detail);
  if (JUST_SYNCED && base==='inicio' && !detail) countUp();
}
/* t217u: room the bottom tab bar takes (0 when it is the desktop sidebar), for the fixed hole view */
function setTabH(){ const t = document.getElementById('tabbar'); if (!t) return; const de = document.documentElement;
  // t222u: the height the user really SEES (iOS Safari with a minimized toolbar keeps position:fixed bottom:0 at the small viewport, leaving a gap):
  // max of innerHeight, the visual viewport and a 100dvh probe, never above 100lvh. The fixed hole view and the bottom tab bar are placed from the top with it.
  const vv = window.visualViewport, pr = (u) => { const d = document.createElement('div'); d.style.cssText = `position:fixed;top:0;left:-9px;width:1px;height:100${u};visibility:hidden;pointer-events:none`; document.body.appendChild(d); const hh = d.getBoundingClientRect().height; d.remove(); return hh || 0; };
  let H = Math.max(innerHeight, vv ? vv.height + vv.offsetTop : 0, CSS.supports && CSS.supports('height', '100dvh') ? pr('dvh') : 0); const L = CSS.supports && CSS.supports('height', '100lvh') ? pr('lvh') : 0; if (L) H = Math.min(H, L);
  H = Math.round(H); de.style.setProperty('--apph', H + 'px');
  const r = t.getBoundingClientRect(), bottomBar = !!(r.height && r.top > H / 2);
  de.classList.toggle('gp-tbb', bottomBar); de.style.setProperty('--tbh', bottomBar ? Math.ceil(t.offsetHeight) + 'px' : '0px');
  de.style.setProperty('--tabh', bottomBar ? Math.ceil(t.offsetHeight) + 'px' : '0px'); }
addEventListener('resize', setTabH); addEventListener('orientationchange', () => setTimeout(setTabH, 250)); addEventListener('pageshow', setTabH);
if (window.visualViewport) { let vt; visualViewport.addEventListener('resize', () => { clearTimeout(vt); vt = setTimeout(setTabH, 60); }); }
function countUp(){
  const n = JUST_SYNCED?.total; JUST_SYNCED = null; const el = view.querySelector('.hero .meta b'); if (!el || n == null) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches){ el.textContent = n; return; }
  const t0 = performance.now(), D = 900; el.classList.add('pop');
  const f = now => { const k = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(n * e); if (k < 1) requestAnimationFrame(f); };
  requestAnimationFrame(f);
}
/* inline confirmation row (no dialogs) */
if (window.GolfletRecon) window.GolfletRecon.init({ api: (u, o) => api(u, o), esc });
if (GG) GG.init({ api: (u, o) => api(u, o), esc, f1, toast: t => toast(t), ask: (b, m, y) => askInline(b, m, y) });
if (GP) GP.init({ api: (u, o) => api(u, o), esc, toast: t => toast(t) });
if (GM) GM.init({ api: (u, o) => api(u, o), esc, toast: t => toast(t) });
function askInline(btn, msg, yes = 'Sí, confirmar'){
  return new Promise(res => {
    btn.parentElement.querySelectorAll('.confirm-row').forEach(x => x.remove());
    const row = document.createElement('div'); row.className = 'confirm-row'; row.setAttribute('role', 'group');
    row.innerHTML = `<p></p><div class="confirm-acts"><button type="button" class="btn danger-solid" data-yes></button><button type="button" class="btn ghost" data-no>Cancelar</button></div>`;
    row.querySelector('p').textContent = msg; row.querySelector('[data-yes]').textContent = yes;
    btn.insertAdjacentElement('afterend', row); btn.hidden = true; row.querySelector('[data-no]').focus();
    const done = v => { row.remove(); btn.hidden = false; res(v); };
    row.querySelector('[data-yes]').onclick = () => done(true); row.querySelector('[data-no]').onclick = () => done(false);
  });
}
function bind(p, isDetail){
  view.querySelectorAll('[data-seg]').forEach(b=>b.onclick=()=>{ segR=b.dataset.seg; render(true); });
  view.querySelectorAll('[data-segl]').forEach(b=>b.onclick=()=>{ segL=b.dataset.segl; render(true); });
  view.querySelectorAll('[data-sortl]').forEach(b=>b.onclick=()=>{ sortL=b.dataset.sortl; render(true); });
  view.querySelectorAll('[data-segc]').forEach(b=>b.onclick=()=>{ segC=b.dataset.segc; render(true); });
  document.querySelectorAll('[data-sync]').forEach(b=>b.onclick=e=>{ e.preventDefault(); doSync(b.dataset.sync, null, false); });
  if (p[0]==='ronda') { loadHoleMap(p[1]); view.querySelectorAll('.fields input[data-k]').forEach(el=>el.oninput=()=>{ $('#saved span').textContent='Guardando…'; const id = p[1]; const gen = (notePending.get(id)?.gen || 0) + 1; const values = {}; view.querySelectorAll('.fields input[data-k]').forEach(inp => { values[inp.dataset.k] = inp.value.trim(); }); notePending.set(id, { gen, values, viewGen: VIEW_GEN }); queueNoteSave(id, values, gen, VIEW_GEN); }); loadRecap(p[1]); bindRecap(p[1]); loadRoundShots(p[1]); bindQuick(p[1]); }
  if (p[0]==='metrica') { const m = (p[1]||'').split('?')[0]; loadMetric(m); view.querySelectorAll('[data-mswitch]').forEach(b=>b.onclick=()=>{ const st = MQ[m]||{}; location.hash = mlink(b.dataset.mswitch, { scope: st.scope||'year', year: st.year||'', course: st.course||'all', sort: st.sort==='count'?'count':'date', order:'desc', range: st.range||'' }); }); }
  if (p[0]==='gps') loadGps(p[1]);
  if (p[0]==='palo') loadPalo(p[1], p[2]);
  if (p[0]==='clima') loadClima((p[1]||'lluvia').split('?')[0], p[2] ? decodeURIComponent(p[2]) : null);
  if (p[0]==='privado') loadPrivado(p[1] || 'horario', p[2] ? decodeURIComponent(p[2]) : null);
  if (p[0]==='ronda') loadRoundWx(p[1]);
  if (p[0]==='pelota') loadPelota();
  if (p[0]==='sorteos') loadSorteos();
  if (p[0]==='notificaciones') loadNotifs();
  if (p[0]==='jugar') loadJugar(p[1]);
  if (p[0]==='reconstruir') window.GolfletRecon?.open(document.getElementById('recon'));
  if (p[0].split('?')[0]==='metricas') { loadMetricas(p[1], p[2]); view.querySelectorAll('[data-mrange]').forEach(b=>b.onclick=()=>{ setRange(b.dataset.mrange); render(true); }); }
  if (p[0]==='notificacion') loadNotif(p[1]);
  loadNbadge();
  if ($('.met-entry')) loadGpsLive();
  if (p[0]==='sorteo') loadSorteo(p[1], p[2]==='bases');
  if (p[0]==='cuenta') loadGear();
  if (p[0]==='hoyo') { loadHoleGeo(); loadHowto(); }
  if (p[0]==='estrategia') loadEstrategia(decodeURIComponent(p[1]||''));
  if (p[0]==='nivel') loadNivel((p[1]||'').split('?')[0]);
  if (p[0]==='tees') loadTees();
  if (p[0].split('?')[0]==='impacto') loadImpacto();
  if (p[0]==='cambios') loadCambios();
  if (p[0]==='hi-cambio') loadHiCambio(p[1]);
  if (p[0]==='outliers') loadOutliers();
  if (p[0]==='profesores') { if (p[1]==='encontrar') loadMatch(p[2] || '1'); else if (p[1]) bindProfBuscar(); else loadProfsCard(); }
  if (p[0]==='profesor') loadProfesor(decodeURIComponent(p[1]||''));
  if (p[0]==='profe') { if (p[1]==='perfil') loadProfePerfil(); else if (p[1]==='alumno') { const sid = decodeURIComponent(p[2]||''); if (p[3]==='clase') bindProfeClase(sid); else if (p[3]==='contenido') loadProfeContenido(sid); else loadProfeAlumno(sid); } else loadProfe(); }
  if (p[0]==='cuenta') { loadProfsCard().then(() => { if (sessionStorage.getItem('goProfs')) { sessionStorage.removeItem('goProfs'); $('#profs')?.scrollIntoView({ behavior:'smooth', block:'start' }); } }); bindNick(); }
  if (p[0]==='club-faltante') bindClubFaltante();
  if (p[0]==='equipo') loadEquipo(decodeURIComponent((p[1]||'nuevo').split('?')[0]), (p[2]||'').startsWith('editar'));
  if (p[0]==='tee' && p[1] && p[1]!=='nuevo') loadTee(p[1]);
  if (p[0]==='trabajar') loadTrabajar((p[1]||'').split('?')[0]);
  if (p[0]==='putting') loadPutting((p[1]||'').split('?')[0]);
  if (GROUPISH(p[0]) && GG) GG.load(p, location.hash);
  if (p[0]==='plan' && GP) GP.load(p, location.hash);
  if ((p[0]==='partido' || p[0]==='partidos') && GM) GM.load(p, location.hash);
  if (!isDetail){
    if (base==='inicio') { fitGreeting(); document.fonts?.ready.then(fitGreeting); loadRecurring(); loadImproveCard(); paintCardPull(); loadTeeCard().then(() => checkNewTees()); loadScorecards(); loadCurrentTee(); loadHcpImp(); loadHiProfs(); loadHiGroups(); loadSorteoCard(); }
    if (base==='bolsa') loadBagBall();
    if (base==='resumen') { loadPuttCard(); loadWxRes(); loadPrivRes(); }
    decorateWx();
    if (base==='bolsa') { loadBagExtras(); loadEquipList(); loadBagSources(); }
    if (base==='cancha') { loadStratCard(); loadCanchaWx(); loadBench(); }
    if (base==='bolsa') view.querySelectorAll('[data-i]').forEach(el=>el.oninput=()=>{ G.bag[+el.dataset.i][el.dataset.k]=el.value?+el.value:null; $('#bagsaved').textContent='Guardando…'; saveBag(); });
  }
  if (p[0]==='vincular'){
    const f = $('#lf'); if (!f) return;
    // t166u: club picker for clubs that link on their own site (Golfistics App shows no clubs for them, e.g. San Isidro)
    const box = $('#lclub'), tog = $('#lclubtog');
    const fill = clubs => { const sel = f.club, cur = sel.value; sel.innerHTML = '<option value="">Todos mis clubes</option>' + (clubs||[]).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join(''); sel.value = cur; };
    const openPicker = clubs => { if (clubs) fill(clubs); box.hidden = false; tog.hidden = true; };
    tog.onclick = async () => { try { const r = await api('/api/clubs'); openPicker((r.clubs||[]).filter(c => c.direct_login)); } catch(e){ openPicker(null); } f.club.focus(); };
    try { const pend = JSON.parse(sessionStorage.getItem('gl_needs_club') || 'null'); if (pend) { sessionStorage.removeItem('gl_needs_club'); if (pend.matricula) f.mat.value = pend.matricula; openPicker(pend.clubs); const m = $('#lmsg'); m.innerHTML = '<div class="msg err"></div>'; m.firstChild.textContent = pend.error; } } catch(e){}
    f.onsubmit = e => { e.preventDefault();
      const cid = f.club.value, cname = cid ? f.club.selectedOptions[0].textContent : null;
      const body = { matricula: f.mat.value.trim(), password: f.pw.value, save_password: f.save.checked, ...(cid ? { club_id: +cid } : {}) }, club = cname || 'tus clubes';
      const sh = view.querySelector('.md-detail'), keep = [...sh.children];
      keep.forEach(c => c.hidden = true); const wrap = document.createElement('div'); wrap.className = 'sheet inpage'; const host = document.createElement('div'); host.className = 'ga-host'; wrap.appendChild(host); sh.appendChild(wrap); window.scrollTo(0, 0);
      runSync({ club, url: '/api/accounts', body, sheetEl: host, onFail: err => { wrap.remove(); keep.forEach(c => c.hidden = false);
        if (err.data?.code === 'NEEDS_CLUB') openPicker(err.data.clubs);
        const m = $('#lmsg'); m.innerHTML = '<div class="msg err"></div>'; m.firstChild.textContent = err.message; } });
    };
  }
  if (p[0]==='club'){
    const f = $('#sf'), id = p[1];
    if (f) f.onsubmit = e => { e.preventDefault(); doSync(id, f.pw?.value || null, f.save?.checked); };
    const fg = view.querySelector('[data-forget]'); if (fg) fg.onclick = async () => { if (!(await askInline(fg, 'Se borra la contraseña guardada. Para actualizar te la vamos a pedir cada vez.', 'Sí, olvidar la contraseña'))) return; await api(`/api/accounts/${id}`, { method:'PATCH', body: JSON.stringify({ forget_password:true }) }); await reload('Clave borrada'); };
    const ul = view.querySelector('[data-unlink]'); if (ul) ul.onclick = async () => { const app = G.clubs.find(x=>x.id===id)?.source==='app';
      if (!(await askInline(ul, app?'Se borran de Golflet las tarjetas de todos tus clubes y tus datos cargados en ellas.':'Se borran de Golflet las tarjetas de este club y tus datos cargados en ellas.', app?'Sí, desvincular mis clubes':'Sí, desvincular el club'))) return;
      await api(`/api/accounts/${id}`, { method:'DELETE' }); location.hash = '#/inicio'; await reload('Club desvinculado'); };
  }
  if (p[0]==='cuenta'){ const cf = $('#cnf'); if (cf) cf.onsubmit = async e => { e.preventDefault(); const m = $('#cnmsg');
      try { const r = await api('/api/me', { method:'PATCH', body: JSON.stringify({ call_name: cf.cn.value }) }); G.user.call_name = r.user.call_name; G.user.first_name = r.user.first_name; if (G.user.call_name) { toast(`Listo: te saludamos como ${r.user.first_name}`); render(true); return; } m.textContent = `Listo: te saludamos como ${r.user.first_name}.`; cf.cn.placeholder = r.user.first_name; }
      catch (err) { m.textContent = err.message; } }; }
  if (p[0]==='cuenta'){ const lo = view.querySelector('[data-logout]'); if (lo) lo.onclick = async () => { await fetch('/api/auth/sign-out', { method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:'{}' }); location.replace('/login'); }; }
}
addEventListener('hashchange', () => render());
document.addEventListener('click', ev => {
  const jump = ev.target && ev.target.closest && ev.target.closest('#wx-jump');
  if (jump) { ev.preventDefault(); const t = document.getElementById('wxres'); if (t) t.scrollIntoView({ block: 'start' }); return; }
  const b = ev.target && ev.target.closest && ev.target.closest('#view [data-range]');
  if (!b) return;
  const k = b.getAttribute('data-range');
  if (!RKEYS.includes(k) || k === RANGE) return;
  ev.preventDefault();
  setRange(k);
  const page = (location.hash.replace(/^#\/?/, '').split('/')[0] || base || 'inicio').split('?')[0];
  const next = `#/${page}?range=${k}`;
  if ((location.hash || '#/inicio') === next) render(true);
  else location.hash = next;
}, true);
document.addEventListener('click', ev => {
  const a = ev.target.closest && ev.target.closest('a[href="#/reconstruir"], a[href^="#/reconstruir/"]');
  if (!a) return;
  const href = a.getAttribute('href');
  if (!href || location.hash === href) return;
  ev.preventDefault();
  location.hash = href;
}, true);
view.innerHTML = '<div style="padding:40vh 0;text-align:center;color:var(--color-ink3)"><span class="spin"></span></div>';
// first sign-in with Golfistics: run the first sync (clubs + cards) with the usual sync screen
const firstSync = () => runSync({ club: 'tus clubes', url: '/api/accounts/first-sync', body: {},
  onFail: e => { if (e.data?.code === 'NEEDS_CLUB') { try { sessionStorage.setItem('gl_needs_club', JSON.stringify({ error: e.message, matricula: e.data.matricula, clubs: e.data.clubs })); } catch(x){} location.hash = '#/vincular'; render(true); return; }
    location.hash = '#/inicio'; render(true); toast(e.message + ' · Podés vincular tu matrícula desde Cuenta', 'err'); } });
/* a /g/<token> share link opened before signing in: land on the invite once data is there (after the first sync for new players) */
function pendingJoin(){ try { const t = localStorage.getItem('gl_join'), at = +localStorage.getItem('gl_join_at') || 0;
  if (t && /^[A-Za-z0-9_-]{16,40}$/.test(t) && Date.now() - at < 7*864e5) return t; localStorage.removeItem('gl_join'); } catch(e){} return null; }
function goJoin(){ const t = pendingJoin(); if (t && G && !G.user?.pending_first_sync && !location.hash.startsWith('#/unirse/')) location.hash = '#/unirse/' + t; }
api('/api/profe/me').then(d => { PROFE = d.profesor; if (PROFE?.account_status === 'active' && G) render(true); }).catch(() => {});
api('/api/app-config').then(c => { APPCFG = c || {}; if (G && (APPCFG.ios_app_store_url || APPCFG.android_play_store_url)) render(true); }).catch(() => {});
/* t134u: one silent retry on a transient boot failure (5xx / network) before showing the error box. */
const bootData = () => api('/api/data').catch(e => { if (e.message === 'auth' || (e.status && e.status < 500)) throw e; return new Promise(r => setTimeout(r, 900)).then(() => api('/api/data')); });
bootData().then(d => { G = d; derive(); syncA11y(); if (d.user?.pending_first_sync && location.hash.startsWith('#/unirse/')) history.replaceState(null, '', '#/inicio'); render(); if (d.user?.pending_first_sync) firstSync(); else goJoin(); }).catch(e => { if (e.message !== 'auth') { console.error('[boot]', e); view.innerHTML = `<div style="margin-top:40px">${errBox(e, 'tus datos')}</div>`; } });
})();
