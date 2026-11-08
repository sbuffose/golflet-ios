/* Golflet SW: offline shell only. Never caches /api (private data) or auth. */
const CACHE = 'golflet-v96';
const SHELL = ['/', '/login', '/style.css', '/tokens.css', '/quick-stats.js', '/app.js', '/reconstruct.js', '/groups.js', '/recap-rules.js', '/smooth-path.js', '/plan-core.js', '/match-core.js', '/match.js', '/plan.js', '/libreta.js', '/subir.js', '/autoshot.js', '/play-rules.js', '/track.js', '/sync-anim.js', '/sync-live.js', '/sync-kit.js', '/sync-tracer.js', '/sync-booklet.js', '/fonts/fonts.css', '/fonts/Geist-400.woff2', '/fonts/Geist-500.woff2', '/fonts/Geist-600.woff2', '/manifest.webmanifest', '/icons/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname.startsWith('/g/') || u.pathname === '/sw.js') return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); } return r; })
    .catch(() => caches.match(e.request)));
});
