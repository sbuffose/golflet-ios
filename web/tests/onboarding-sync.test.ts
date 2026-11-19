/** Onboarding wait, reading screen and plan. Fixtures only. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import test from "node:test";

const CHROME = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find(p => existsSync(p));
const ROOT = new URL("../public/", import.meta.url);
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".png": "image/png", ".svg": "image/svg+xml" };
const SHOTS = "/opt/cursor/artifacts";
try { mkdirSync(SHOTS, { recursive: true }); } catch { /* keep going */ }

const card = (course: string, club: string, hole: number, strokes: number, par: number) => ({
  date: "2025-11-01", course, club, gross: 79, par: 72,
  holes: [{ hole, par, strokes }, { hole: hole + 1, par: 4, strokes: 4 }],
});

test("la espera dice una sola frase y el dibujo queda abajo", { timeout: 60_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const hosts: string[] = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    hosts.push(req.headers.host || "");
    if (url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`<!doctype html><meta charset="utf-8"><meta name="golflet-sync" content="booklet"><link rel="stylesheet" href="/fonts/fonts.css"><link rel="stylesheet" href="/tokens.css"><link rel="stylesheet" href="/style.css"><style>html,body,#host{margin:0;height:100%;background:#F5F5F5}body{font-family:var(--font-ui)}</style><div id="host"></div><script src="/sync-anim.js"></script><script src="/sync-live.js"></script><script src="/sync-kit.js"></script><script src="/sync-booklet.js"></script>`);
      return;
    }
    const file = new URL(url.pathname.slice(1), ROOT);
    if (!file.pathname.startsWith(ROOT.pathname)) { res.writeHead(404); res.end(); return; }
    const body = await readFile(file).catch(() => null);
    if (!body) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": MIME[extname(url.pathname)] || "application/octet-stream" });
    res.end(body);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2 });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle0" });
    const early = await page.evaluate(async () => {
      const G = (window as unknown as { GolfletSync: { syncFrame: (p: unknown) => { phrase: string; done: string[]; fraction: number }; mount: (el: Element, o: unknown) => { setProgress: (p: unknown) => void } } }).GolfletSync;
      const none = G.syncFrame(null);
      const cards = G.syncFrame({ stage: "cards", done: 4, total: 12 });
      const named = G.syncFrame({ stage: "connect", club: "Jockey" });
      const handicap = G.syncFrame({ stage: "handicap", cards_total: 12, stats: { rounds: 12 } });
      const anim = G.mount(document.querySelector("#host")!, { club: "tus clubes", style: "booklet", theme: "paper" });
      (window as unknown as { anim: typeof anim }).anim = anim;
      await (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready;
      const phraseEl = document.querySelector(".sx-phrase")!;
      const phrase = phraseEl.getAttribute("aria-label") || "";
      const words = [...phraseEl.querySelectorAll("span")].map(el => el.getBoundingClientRect());
      const wordGap = words.length > 1 ? words[1].left - words[0].right : 0;
      const skel = document.querySelectorAll(".sx-skel").length;
      const scene = document.querySelector(".sx-scene")!.getBoundingClientRect();
      const arrivals = document.querySelector(".sx-arrivals")!.getBoundingClientRect();
      const body = document.querySelector(".sx-body")!.getBoundingClientRect().top;
      return {
        none, cards, named, handicap, phrase, skel,
        sceneBelow: scene.top > body,
        band: scene.top - arrivals.bottom,
        wordGap,
        font: getComputedStyle(phraseEl).fontFamily,
      };
    });
    assert.equal(early.none.phrase, "Estoy entrando a tu club.");
    assert.deepEqual(early.none.done, []);
    assert.equal(early.cards.phrase, "Leí 4 de 12.");
    assert.deepEqual(early.cards.done, ["login"]);
    assert.ok(early.cards.fraction > 0.48 && early.cards.fraction < 0.78);
    assert.equal(early.named.phrase, "Conectando con Jockey.");
    assert.deepEqual(early.named.done, []);
    assert.deepEqual(early.handicap.done, ["login", "cards"]);
    assert.equal(early.phrase, "Conectando con tu club.");
    assert.equal(early.skel, 3);
    assert.equal(early.sceneBelow, true);
    assert.ok(early.band < 40, `banda ${early.band}`);
    assert.ok(early.wordGap > 2 && early.wordGap < 12, `espacio ${early.wordGap}`);
    assert.match(early.font, /Geist/);
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 450)));
    await page.screenshot({ path: `${SHOTS}/web-375-onboarding-sync-inicio.png` });

    const mid = await page.evaluate((row) => {
      (window as unknown as { anim: { setProgress: (p: unknown) => void } }).anim.setProgress({
        stage: "cards", club: "Jockey Club Buenos Aires", club_code: "118", club_index: 1, club_count: 2,
        done: 4, total: 12, cards_total: 12,
        stats: { rounds: 4, eagles: 0, birdies: 3, pars: 8, bogeys: 2, doubles_plus: 1, last_card: row },
      });
      return {
        phrase: document.querySelector(".sx-phrase")?.getAttribute("aria-label"),
        birds: document.querySelector(".sx-birds")?.textContent,
        rows: document.querySelectorAll(".sx-cardrow").length,
        crest: document.querySelector(".sx-crest img")?.getAttribute("src") || "",
      };
    }, card("Colorada", "Jockey Club Buenos Aires", 2, 3, 4));
    assert.equal(mid.phrase, "Leí 4 de 12.");
    assert.equal(mid.birds, "3 birdies encontrados");
    assert.equal(mid.rows, 1);
    assert.match(mid.crest, /118/);
    assert.match(mid.phrase || "", /de 12/);
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 450)));
    await page.screenshot({ path: `${SHOTS}/web-375-leyendo-tarjetas.png` });

    const next = await page.evaluate((row) => {
      (window as unknown as { anim: { setProgress: (p: unknown) => void } }).anim.setProgress({
        stage: "cards", club: "Mar del Plata Golf Club", club_code: "209", club_index: 2, club_count: 2,
        done: 2, total: 12, stats: { rounds: 6, eagles: 1, birdies: 5, pars: 10, bogeys: 3, doubles_plus: 1, last_card: row },
      });
      return {
        crest: document.querySelector(".sx-crest img")?.getAttribute("src") || "",
        rows: document.querySelectorAll(".sx-cardrow").length,
        over: document.querySelector(".sx-over")?.textContent,
      };
    }, card("Cancha Vieja", "Mar del Plata Golf Club", 7, 3, 4));
    assert.match(next.crest, /209/);
    assert.equal(next.rows, 2);
    assert.match(next.over || "", /2 de 2/);
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 450)));
    await page.screenshot({ path: `${SHOTS}/web-375-leyendo-club.png` });

    await page.evaluate(() => {
      document.querySelector("#host")!.innerHTML = `<div class="ob-plan"><img class="sx-caddie" src="/brand/caddie.png" alt=""><h1 id="ob-plan-title">Jugador, armé tu inicio.</h1><ol><li id="ob-plan-card-1"><span class="n">1</span><div><b>Tu índice</b><small>Desde este número vemos dónde se te escapan los golpes.</small></div><strong class="ob-hi">3,1</strong></li><li id="ob-plan-card-2"><span class="n">2</span><div><b>Tu club</b><small>Ahí miramos lo que más te cuesta esta semana.</small></div><img class="ob-crest" src="/clubs/118@2x.png" alt=""></li><li id="ob-plan-card-3"><span class="n">3</span><div><b>Tus amigos</b><small>Un grupo para salir juntos.</small></div><span class="ob-faces"><span>JD</span><span>AP</span></span></li></ol><button class="btn" id="ob-done" type="button">Entrar a Golflet</button></div>`;
    });
    const plan = await page.evaluate(() => {
      const cards = [...document.querySelectorAll(".ob-plan li")].map(el => el.getBoundingClientRect());
      return {
        title: document.querySelector("#ob-plan-title")?.textContent,
        n: getComputedStyle(document.querySelector(".n")!).backgroundColor,
        font: getComputedStyle(document.querySelector("#ob-plan-title")!).fontFamily,
        cards: cards.length,
        gap: cards[1].top - cards[0].bottom,
        hi: document.querySelector(".ob-hi")?.textContent,
        crest: document.querySelector(".ob-crest")?.getAttribute("src"),
        sub: document.querySelector("#ob-plan-card-1 small")?.textContent,
      };
    });
    assert.equal(plan.title, "Jugador, armé tu inicio.");
    assert.equal(plan.cards, 3);
    assert.ok(plan.gap >= 12 && plan.gap <= 16, `separación ${plan.gap}`);
    assert.equal(plan.hi, "3,1");
    assert.match(plan.crest || "", /118/);
    assert.match(plan.sub || "", /dónde se te escapan/);
    assert.match(plan.font, /Geist/);
    assert.match(plan.n, /11,\s*37,\s*69|rgb\(11,\s*37,\s*69\)/);
    await page.screenshot({ path: `${SHOTS}/web-375-arme-tu-inicio.png` });
    assert.ok(hosts.every(host => host.startsWith("127.0.0.1")));
  } finally {
    await browser.close();
    server.close();
  }
});
