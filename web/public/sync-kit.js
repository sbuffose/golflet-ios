/* Golflet · sync kit: style flag, shared clock, real-progress steps, sourced facts.
   Styles: 'classic' (sync-anim.js), 'tracer' (sync-tracer.js), 'booklet' (sync-booklet.js).
   Flag: ?sync=<style> (saved to localStorage 'golflet:sync'), else <meta name="golflet-sync">, else 'classic'. */
(function(){
const G = window.GolfletSync; if (!G) return;
const classic = G.mount;
const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function styleFlag(){
  try { const q = new URLSearchParams(location.search).get('sync'); if (q) localStorage.setItem('golflet:sync', q); } catch (_) {}
  let s = null; try { s = localStorage.getItem('golflet:sync'); } catch (_) {}
  s = s || document.querySelector('meta[name="golflet-sync"]')?.content || 'classic';
  return (s === 'tracer' || s === 'booklet') && G.styles[s] ? s : 'classic';
}

/* one clock for everything (rAF live; manual in recording mode) */
const Clock = { rec: false, t: 0, subs: new Set(), raf: 0,
  now(){ return this.rec ? this.t : performance.now(); },
  add(fn){ this.subs.add(fn); if (!this.rec && !this.raf) this.loop(); return () => this.subs.delete(fn); },
  loop(){ const f = () => { if (!this.subs.size){ this.raf = 0; return; } const n = performance.now(); this.subs.forEach(s => s(n)); this.raf = requestAnimationFrame(f); }; this.raf = requestAnimationFrame(f); },
  step(t){ this.t = t; this.subs.forEach(s => s(t)); } };
window.__golfletFrame = t => Clock.step(t);           // used only by the recording harness
window.__golfletRec = () => { Clock.rec = true; cancelAnimationFrame(Clock.raf); Clock.raf = 0; };

const STEPS = ['connect','list','cards','handicap','save'];
/* v3 live panel (crest + counters + last card): on unless ?live=0 (saved like the style flag) */
function LIVE(){ try { const q = new URLSearchParams(location.search).get('live'); if (q != null) localStorage.setItem('golflet:live', q); return localStorage.getItem('golflet:live') !== '0'; } catch (_) { return true; } }
function label(k, p, club, st, cardsN){
  const d = p?.done ?? 0, n = p?.total ?? 0, lt = p?.list_total;
  if (k === 'connect') { const c = (!club || club === 'Golfistics App') ? null : club; return st === 'done' ? `Conectado con ${c || 'tus clubes'}` : (c && c !== 'tu club' && c !== 'tus clubes' ? `Conectando con ${c}.` : 'Estoy entrando a tu club.'); }
  if (k === 'list') return st === 'done' ? (lt != null ? `El club lista ${lt} tarjetas.` : 'Tarjetas encontradas') : 'Traigo las tarjetas que el club tenga.';
  if (k === 'cards') return st === 'done' ? (cardsN ? `Leí ${cardsN} tarjetas nuevas.` : 'Sin tarjetas nuevas') : (n ? `Leí ${d} de ${n}.` : 'Estoy leyendo tarjetas.');
  if (k === 'handicap') return st === 'done' ? 'Historial de hándicap al día' : 'Busco tu hándicap y tu club.';
  return st === 'done' ? 'Listo. Te muestro la ficha.' : 'Cuando entren, armo tu ficha.';
}

/** Shared chrome: scene host + live steps + facts. theme: 'night' | 'paper' */
function shell(container, { club: club0, theme, title }){
  let club = club0;
  const v3 = !!G.live && LIVE();
  container.innerHTML = `<div class="sx sx-${theme}${RM() ? ' rm' : ''}${v3 ? ' sx-v3' : ''}">
    <div class="sx-scene"></div>
    <div class="sx-body">
      <div class="sx-head">${v3 ? '<div class="sx-crest"></div>' : ''}<div class="sx-hd"><div class="sx-over">${esc(club)}</div><div class="sx-title" aria-live="polite">${esc(title || 'Leyendo tus tarjetas')}</div></div></div>
      ${v3 ? '<div class="sx-now"><span class="sx-now-l"></span><span class="sx-now-n num"></span></div>' : ''}
      <ol class="sx-steps">${STEPS.map(k => `<li data-s="${k}" class="todo"><span class="sx-ic"></span><span class="sx-lbl">${esc(label(k, null, club, 'todo'))}</span><span class="sx-num num"></span><span class="sx-bar"><span></span></span></li>`).join('')}</ol>
      ${v3 ? '<div class="lv"></div>' : ''}
      <figure class="sx-fact"><span class="sx-rule"></span><figcaption class="sx-fover">Sabías que</figcaption><blockquote></blockquote><cite></cite></figure>
    </div></div>`;
  const root = container.firstElementChild;
  let cardsN = 0, done = false;
  const lv = v3 ? G.live(root, { Clock, RM }) : null;
  /* Golfistics App syncs several clubs in a row: the server tags progress with club / club_index / club_count */
  function setClub(p){
    if (!p.club) return;
    const over = p.club_count > 1 ? `${p.club} · ${p.club_index} de ${p.club_count}` : p.club;
    if (p.club !== club) { club = p.club; cardsN = 0; }
    const el = root.querySelector('.sx-over'); if (el.textContent !== over) el.textContent = over;
  }
  function setProgress(p){
    if (!p || done) return;
    setClub(p); lv?.update(p);
    const cur = STEPS.indexOf(p.stage === 'done' ? 'save' : p.stage);
    if (p.stage === 'cards') cardsN = p.total || 0;
    root.querySelectorAll('.sx-steps li').forEach((li, i) => {
      const k = li.dataset.s, st = p.stage === 'done' || i < cur ? 'done' : i === cur ? 'active' : 'todo';
      li.className = st;
      li.querySelector('.sx-lbl').textContent = label(k, i === cur ? p : { list_total: p.list_total }, club, st, cardsN);
      const showN = st === 'active' && p.total && (k === 'cards' || k === 'save');
      li.querySelector('.sx-num').textContent = showN ? `${p.done || 0} / ${p.total}` : '';
      li.querySelector('.sx-bar > span').style.transform = `scaleX(${showN ? Math.min(1, (p.done || 0) / p.total) : st === 'done' ? 1 : 0})`;
      li.classList.toggle('bar', !!showN);
      if (v3 && st === 'active'){ root.querySelector('.sx-now-l').textContent = li.querySelector('.sx-lbl').textContent; root.querySelector('.sx-now-n').textContent = li.querySelector('.sx-num').textContent; }
    });
    if (v3 && p.stage === 'done'){ root.querySelector('.sx-now-l').textContent = 'Rondas guardadas'; const n = lv?.rounds() || p.list_total; root.querySelector('.sx-now-n').textContent = n ? `${n} tarjetas` : ''; }
  }
  setProgress({ stage: 'connect', club });
  /* facts: 7 s each, JS-driven fade on the shared clock (works in recordings too) */
  const fact = root.querySelector('.sx-fact'), FACTS = G.FACTS; let fi = -1, t0 = null;
  const offFacts = Clock.add(now => {
    if (t0 == null) t0 = now;
    const k = Math.floor((now - t0) / 7000), ph = (now - t0) % 7000;
    if (k !== fi){ fi = k; const [t, s] = FACTS[(k + 3) % FACTS.length]; fact.querySelector('blockquote').textContent = t; fact.querySelector('cite').textContent = s; }
    const a = RM() ? 1 : Math.min(1, ph / 500, (7000 - ph) / 450);
    fact.style.opacity = a; fact.style.transform = `translateY(${(1 - a) * 6}px)`;
  });
  return {
    root, scene: root.querySelector('.sx-scene'), setProgress,
    complete(p, t){ setProgress({ ...p, stage: 'done' }); done = true; if (t) root.querySelector('.sx-title').textContent = t; },
    fail(msg){ done = true; root.classList.add('failed'); root.querySelector('.sx-title').textContent = 'No se pudo actualizar';
      const li = root.querySelector('.sx-steps li.active'); if (li){ li.className = 'err'; li.querySelector('.sx-lbl').textContent = msg; li.querySelector('.sx-num').textContent = ''; }
      if (v3){ root.querySelector('.sx-now').classList.add('err'); root.querySelector('.sx-now-l').textContent = msg; root.querySelector('.sx-now-n').textContent = ''; } },
    destroy(){ offFacts(); lv?.destroy(); },
  };
}

/** Dispatcher: same API as classic: setProgress, finish(summary)->Promise, fail, destroy, leave(sheet)->Promise */
function mount(container, opts = {}){
  const style = opts.style || styleFlag();
  if (style === 'classic') return classic(container, opts);
  return G.styles[style](container, { ...opts, club: opts.club || 'tu club' }, { shell, Clock, RM });
}
G.styles = G.styles || {};
G.mount = mount; G.classic = classic; G.styleFlag = styleFlag; G.Clock = Clock; G.kit = { shell, Clock, RM };
})();
