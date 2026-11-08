import { auth } from "@/lib/auth";
import { HttpError } from "@/lib/http";
import { previewByToken } from "@/lib/groups";
import { BASE_URL, linkRateLimit, validToken } from "@/lib/group-share";

/** Public share-link landing (/g/<token>): group preview + Open Graph tags for WhatsApp. Opens the in-app invite (#/unirse/<token>);
 *  without a session it remembers the token (localStorage) through the matrícula login and first sync. iOS opens it via universal links. */
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const DESC = "Te invitaron a comparar métricas en Golflet";
function page(o: { title: string; ogTitle: string; image: string; url: string; body: string; status: number }) {
  return new Response(`<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow"><meta name="theme-color" content="#F7F5F0"><title>${esc(o.title)}</title>
<meta property="og:type" content="website"><meta property="og:site_name" content="Golflet"><meta property="og:title" content="${esc(o.ogTitle)}">
<meta property="og:description" content="${DESC}"><meta property="og:image" content="${esc(o.image)}"><meta property="og:url" content="${esc(o.url)}"><meta property="og:locale" content="es_AR">
<meta name="twitter:card" content="summary"><meta name="twitter:title" content="${esc(o.ogTitle)}"><meta name="twitter:description" content="${DESC}"><meta name="twitter:image" content="${esc(o.image)}">
<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png"><link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="stylesheet" href="/fonts/fonts.css"><link rel="stylesheet" href="/tokens.css"><link rel="stylesheet" href="/style.css"></head>
<body><main class="auth gj">${o.body}</main></body></html>`, { status: o.status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
}
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params; const url = `${BASE_URL}/g/${encodeURIComponent(token)}`, fallback = `${BASE_URL}/og-golflet.png`;
  const gone = (msg: string, status = 404) => page({ title: "Golflet · Invitación", ogTitle: "Invitación a Golflet", image: fallback, url, status,
    body: `<div class="brand"><img src="/icons/icon-192.png" alt=""><b>Golflet</b></div><h1 class="ltitle" style="font-size:30px">Este link no está disponible</h1><p class="foot gj-p">${esc(msg)}</p><a class="btn" href="/">Ir a Golflet</a>` });
  if (!validToken(token)) return gone("El link está mal copiado. Pedile uno nuevo a quien te invitó.");
  try { await linkRateLimit(req); } catch (e) { if (e instanceof HttpError && e.status === 429) return gone(e.message, 429); throw e; }
  const s = await auth.api.getSession({ headers: req.headers }).catch(() => null);
  let p; try { p = await previewByToken(token, s?.user?.id ?? null); } catch { return gone("Venció, lo desactivaron o lo cambiaron por uno nuevo. Pedile otro a quien te invitó."); }
  const g = p.group, img = g.photo_url ? `${BASE_URL}${g.photo_url}` : fallback, t = JSON.stringify(token);
  const cta = p.status === "accepted" ? `<a class="btn" href="/#/grupo/${g.id}">Abrir el grupo</a>`
    : p.signed_in ? `<a class="btn" href="/#/unirse/${encodeURIComponent(token)}">Ver invitación</a>`
    : `<a class="btn" id="go" href="/login">Entrar con tu matrícula</a><p class="foot gj-p" style="margin-top:12px">Entrás con tu matrícula y la contraseña de tu club. Después aceptás o rechazás la invitación: nada se comparte hasta que aceptes.</p>`;
  return page({ title: `${g.name} · Golflet`, ogTitle: g.name, image: img, url, status: 200,
    body: `<div class="brand"><img src="/icons/icon-192.png" alt=""><b>Golflet</b></div>
<div class="gj-card">${g.photo_url ? `<img class="gj-ph" src="${esc(g.photo_url)}" alt="">` : `<span class="gj-ph gj-ph0" aria-hidden="true">${esc(g.name.trim()[0]?.toUpperCase() || "G")}</span>`}
<div><div class="overline">Te invitaron a un grupo</div><h1 class="gj-t">${esc(g.name)}</h1><p class="gj-s">Creado por ${esc(g.owner)} · ${g.members} ${g.members === 1 ? "jugador" : "jugadores"}</p></div></div>
<p class="foot gj-p">${DESC}: tabla, evolución y hoyo por hoyo. Cada jugador elige qué comparte.</p>
${p.full ? `<div class="msg">El grupo ya está completo.</div>` : cta}
<script>try{localStorage.setItem('gl_join',${t});localStorage.setItem('gl_join_at',String(Date.now()))}catch(e){}</script>` });
}
