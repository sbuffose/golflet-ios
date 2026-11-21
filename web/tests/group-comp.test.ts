/** TEST-ONLY. Group competition screen. Fixture names only. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import test from "node:test";

const CHROME = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find(p => existsSync(p));
const ROOT = new URL("../public/", import.meta.url);
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".png": "image/png", ".jpg": "image/jpeg" };
const ART = "/opt/cursor/artifacts";

const types = (n: number, rounds: number) => ({ total: n, per_round: rounds ? Math.round((n / rounds) * 10) / 10 : null });
const member = (o: { id: string; name: string; me?: boolean; rounds: number; birdies: number; pars: number; net: number | null; avg: number | null; prev?: number | null; cards18?: number; cards9?: number; photo?: string }) => ({
  member_id: o.id, name: o.name, color: o.me ? "#0B2545" : "#C8102E", is_me: !!o.me, is_admin: !!o.me, photo_url: o.photo ?? null,
  rounds: o.rounds, cards_18: o.cards18 ?? o.rounds, cards_9: o.cards9 ?? 0, avg_gross: o.avg, best_gross: o.avg, avg_net: o.net, best_net: o.net, handicap_index: null,
  types: { birdies: types(o.birdies, o.rounds), pars: types(o.pars, o.rounds), eagles: types(0, o.rounds), aces: types(0, o.rounds), max_birdies: types(o.birdies ? 2 : 0, o.rounds), bogeys: types(1, o.rounds), doubles: types(0, o.rounds) },
  streak: o.rounds >= 2 ? 2 : null, consistency: o.rounds >= 3 ? { sd: 1.4, n: o.rounds } : null, trend: [],
  prev: o.prev == null ? null : { rounds: 1, birdies: o.prev, pars: 1, best_net: o.net, avg_gross: o.avg },
  hidden: [],
});

const payload = (range: string, min: number) => ({
  group: { id: "g1", name: "Grupo fixture", is_admin: true, admins: 1, photo_url: null },
  pending: [],
  view: { metrics: [], sections: ["table", "trend", "holes", "vs", "clubs"], range, course: null },
  filters: { year: null, range, since: "2026-01-01", until: null, min, course: null, years: ["2026"], courses: [{ key: "c1", label: "Cancha Fixture", shared: true, members: 2 }] },
  clubs: [],
  worst_holes: [],
  members: range === "1w"
    ? [member({ id: "a", name: "Ana Pérez", me: true, rounds: 1, birdies: 3, pars: 4, net: 74, avg: 80, prev: 1, photo: "/fixture-ana.jpg" }), member({ id: "b", name: "Luis Gómez", rounds: 1, birdies: 1, pars: 2, net: 78, avg: 84, prev: 2 })]
    : [member({ id: "a", name: "Ana Pérez", me: true, rounds: 8, birdies: 24, pars: 60, net: 74, avg: 80, prev: 10, cards18: 6, cards9: 2, photo: "/fixture-ana.jpg" }), member({ id: "b", name: "Luis Gómez", rounds: 2, birdies: 4, pars: 8, net: 79, avg: 86, prev: 6 })],
});

const four = (range: string, min: number) => ({
  ...payload(range, min),
  group: { id: "g4", name: "Grupo de cuatro", is_admin: true, admins: 1, photo_url: null },
  members: [
    member({ id: "a", name: "Ana Pérez", me: true, rounds: 8, birdies: 24, pars: 60, net: 72, avg: 78, cards18: 6, cards9: 2, photo: "/fixture-ana.jpg" }),
    member({ id: "b", name: "Luis Gómez", rounds: 6, birdies: 14, pars: 40, net: 75, avg: 82 }),
    member({ id: "c", name: "Carla Díaz", rounds: 5, birdies: 9, pars: 30, net: 77, avg: 84 }),
    member({ id: "d", name: "Mateo Ruiz", rounds: 4, birdies: 4, pars: 18, net: 80, avg: 88 }),
  ],
});

test("la competencia del grupo reemplaza la tabla y compara el período anterior", { timeout: 120_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  mkdirSync(ART, { recursive: true });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (data: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(data)); };
    if (url.pathname === "/fixture/tall.svg" || url.pathname === "/fixture/wide.svg") {
      const tall = url.pathname.endsWith("tall.svg");
      const w = tall ? 900 : 1600, h = tall ? 1600 : 700, fill = tall ? "#C8102E" : "#0B2545";
      res.writeHead(200, { "content-type": "image/svg+xml" });
      res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${fill}"/></svg>`);
      return;
    }
    if (url.pathname === "/api/groups") return json({
      groups: [
        { id: "g-scratch", name: "Scratch", is_admin: true, accepted: 1, pending: 0, photo_url: "/fixture/tall.svg", faces: [] },
        { id: "g-ancha", name: "Ancha", is_admin: false, accepted: 2, pending: 0, photo_url: "/fixture/wide.svg", faces: [] },
        { id: "g-roto", name: "Roto", is_admin: false, accepted: 1, pending: 0, photo_url: "/fixture/no-existe.jpg", faces: [] },
      ],
      invitations: [],
      outgoing: [],
    });
    if (url.pathname.startsWith("/api/groups/g-scratch")) return json({
      ...payload("3m", 1),
      group: { id: "g-scratch", name: "Scratch", is_admin: true, admins: 1, photo_url: "/fixture/tall.svg" },
      members: [member({ id: "a", name: "Test Uno", me: true, rounds: 9, birdies: 12, pars: 40, net: 71, avg: 78, cards18: 9 })],
      filters: { year: null, range: "3m", since: "2026-08-21", until: null, min: 1, course: null, years: ["2026"], courses: [] },
      view: { metrics: [], sections: ["table"], range: "3m", course: null },
    });
    if (url.pathname.startsWith("/api/groups/g5")) return json({
      ...payload("all", 3),
      group: { id: "g5", name: "Cinco", is_admin: true, admins: 1, photo_url: null },
      members: [
        member({ id: "a", name: "Ana Pérez", me: true, rounds: 8, birdies: 10, pars: 40, net: 74, avg: 80, cards18: 8 }),
        member({ id: "b", name: "Luis Gómez", rounds: 8, birdies: 10, pars: 36, net: 75, avg: 81, cards18: 8 }),
        member({ id: "c", name: "Carla Díaz", rounds: 6, birdies: 6, pars: 28, net: 77, avg: 83, cards18: 6 }),
        member({ id: "d", name: "Mateo Ruiz", rounds: 5, birdies: 4, pars: 20, net: 79, avg: 85, cards18: 5 }),
        member({ id: "e", name: "Sol Vidal", rounds: 4, birdies: 2, pars: 12, net: 82, avg: 88, cards18: 4 }),
      ],
    });
    if (url.pathname.startsWith("/api/groups/g4")) return json(four(url.searchParams.get("range") || "all", 4));
    if (url.pathname.startsWith("/api/groups/gT")) return json({
      ...payload("all", 3),
      group: { id: "gT", name: "Empate", is_admin: true, admins: 1, photo_url: null },
      members: [
        member({ id: "a", name: "Ana Pérez", me: true, rounds: 4, birdies: 4, pars: 20, net: 74, avg: 80, cards18: 4, photo: "/fixture-ana.jpg" }),
        member({ id: "b", name: "Luis Gómez", rounds: 4, birdies: 4, pars: 16, net: 76, avg: 82, cards18: 4 }),
        member({ id: "c", name: "Sol Díaz", rounds: 4, birdies: 1, pars: 10, net: 80, avg: 86, cards18: 4 }),
      ],
    });
    if (url.pathname.startsWith("/api/groups/g1")) return json(payload(url.searchParams.get("range") || "all", url.searchParams.get("range") === "1w" ? 1 : 4));
    if (url.pathname === "/api/data") return json({ user: { name: "TEST-ONLY", pending_first_sync: false }, player: { name: "TEST-ONLY" }, rounds: [], courses: [], clubs: [] });
    if (url.pathname.startsWith("/api/")) return json({});
    const file = url.pathname === "/" ? "/index.html" : url.pathname;
    try {
      const buf = await readFile(new URL(file.slice(1), ROOT));
      res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
      res.end(buf);
    } catch { res.writeHead(404); res.end("missing"); }
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    const open = async (id: string, range: string) => {
      await page.goto(`http://127.0.0.1:${port}/#/grupo/${id}?range=${range}`, { waitUntil: "networkidle0" });
      await page.waitForSelector(".gg-lb");
    };
    const rowsOf = () => page.$$eval(".gg-stage:not([hidden]) .gg-lb tbody tr", els => els.length);
    const placesOf = () => page.$$eval(".gg-stage:not([hidden]) .gg-lb td.pos b", els => els.map(el => el.textContent || ""));
    const shot = async (name: string) => {
      await page.evaluate(() => document.querySelector(".gg-mast")?.scrollIntoView({ block: "start" }));
      await page.screenshot({ path: `${ART}/${name}.png` });
    };
    await open("g1", "1w");
    const week = await page.evaluate(() => document.querySelector("#view")?.textContent || "");
    assert.match(week, /Estás 1º, \+2 sobre Luis/);
    assert.match(week, /Semana del 1 ene/);
    assert.match(week, /1 tarjeta/);
    assert.match(week, /Ver tabla completa/);
    assert.match(week, /\+2 sobre Luis/);
    assert.deepEqual(await page.$$eval(".gg-stage:not([hidden]) .gg-lb th", els => els.map(el => (el.textContent || "").trim())), ["Pos", "Jugador", "Total"]);
    assert.match(week, /por ronda/);
    assert.match(week, /1 ronda esta semana/);
    assert.match(week, /Pocas tarjetas/);
    assert.deepEqual(await page.$$eval(".gg-rng a", els => els.map(el => (el.textContent || "").trim())), ["3 meses", "6 meses", "12 meses", "Este año", "Histórico"]);
    assert.equal((await page.$$eval(".gg-rng a", els => [...new Set(els.map(e => Math.round(e.getBoundingClientRect().top)))])).length, 1);
    assert.equal(await rowsOf(), 2);
    assert.deepEqual(await placesOf(), ["1", "2"]);
    assert.ok(await page.$(".gg-stage:not([hidden]) .gg-move"));
    assert.equal(await page.$(".gg-lb .cad"), null);
    const tableHidden = await page.$eval(".gg-full", el => (el as HTMLDetailsElement).open);
    assert.equal(tableHidden, false);
    await shot("grupo-semana-390");
    await open("g1", "all");
    const hist = await page.evaluate(() => document.querySelector("#view")?.textContent || "");
    assert.match(hist, /Estás 1º, \+20 sobre Luis\. 8 tarjetas/);
    assert.match(hist, /Histórico/);
    assert.equal(await page.$eval('.gg-rng a[aria-selected="true"]', el => (el.textContent || "").trim()), "Histórico");
    assert.equal(await page.$eval('.gg-rng a[aria-selected="true"]', el => el.getAttribute("aria-label")), "Histórico");
    assert.equal((await page.$$eval(".gg-rng a", els => [...new Set(els.map(e => Math.round(e.getBoundingClientRect().top)))])).length, 1);
    assert.ok(await page.$(".gg-lb img.gg-img"));
    const leaders = await page.$$eval(".gg-leaders button", els => {
      if (els.length < 4) return false;
      const a = els[0].getBoundingClientRect();
      const b = els[1].getBoundingClientRect();
      const num = els[0].querySelector(".num")?.getBoundingClientRect().height || 0;
      return Math.abs(a.top - b.top) < 4 && b.left > a.right - 2 && num >= 24;
    });
    assert.equal(leaders, true);
    await shot("grupo-2-historico-390");
    await open("g1", "12y");
    const year = await page.evaluate(() => document.querySelector("#view")?.textContent || "");
    assert.match(year, /20 rondas este año/);
    assert.match(year, /Pocas tarjetas/);
    assert.match(year, /Este año/);
    assert.match(year, /Estás 1º, \+20 sobre Luis\. 8 tarjetas/);
    assert.equal(await page.$eval('.gg-rng a[aria-selected="true"]', el => (el.textContent || "").trim()), "Este año");
    await shot("grupo-2-anio-390");
    await open("g4", "all");
    assert.equal(await rowsOf(), 4);
    assert.match(await page.evaluate(() => document.querySelector("#view")?.textContent || ""), /Mateo Ruiz/);
    await shot("grupo-4-historico-390");
    await open("g4", "12y");
    assert.equal(await page.$eval('.gg-rng a[aria-selected="true"]', el => (el.textContent || "").trim()), "Este año");
    assert.equal(await rowsOf(), 4);
    await shot("grupo-4-anio-390");
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    const board = async (name: string) => {
      await page.evaluate(() => document.querySelector(".gg-mast")?.scrollIntoView({ block: "start" }));
      await page.screenshot({ path: `${ART}/${name}.png` });
    };
    const tableClearsNav = async () => {
      await page.evaluate(() => document.querySelector(".gg-stage:not([hidden]) .gg-lb tbody tr:last-child")?.scrollIntoView({ block: "end" }));
      return page.evaluate(() => {
        const bar = document.querySelector("#tabbar")?.getBoundingClientRect().top ?? window.innerHeight;
        const row = document.querySelector(".gg-stage:not([hidden]) .gg-lb tbody tr:last-child");
        return row ? bar - row.getBoundingClientRect().bottom : 0;
      });
    };
    await open("gT", "all");
    assert.deepEqual(await placesOf(), ["T1", "T1", "3"]);
    assert.match(await page.evaluate(() => document.querySelector(".gg-you")?.textContent || ""), /Empate en la punta/);
    const tieFits = await page.$eval(".gg-you", el => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return el.scrollWidth <= el.clientWidth + 1 && range.getClientRects().length <= 1;
    });
    assert.equal(tieFits, true);
    await board("grupos6-empate-390");
    await open("g1", "1w");
    const fit = await page.$eval(".gg-filters", el => {
      const course = el.querySelector(".gg-course-btn")?.getBoundingClientRect();
      const pills = [...el.querySelectorAll(".gg-rng a")].map(a => a.getBoundingClientRect());
      const last = pills[pills.length - 1];
      return {
        courseBelow: !!course && !!last && course.top + 1 >= Math.max(...pills.map(p => p.bottom)) && course.height >= 44,
        oneRow: new Set(pills.map(p => Math.round(p.top))).size === 1,
      };
    });
    assert.equal(fit.courseBelow, true);
    assert.equal(fit.oneRow, true);
    assert.match(await page.evaluate(() => document.querySelector("#view")?.textContent || ""), /Pocas tarjetas/);
    assert.ok(await tableClearsNav() >= 8, "la última fila queda detrás de la barra");
    const fits = await page.$eval(".gg-you", el => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return el.scrollWidth <= el.clientWidth + 1 && range.getClientRects().length <= 1;
    });
    assert.equal(fits, true);
    await board("grupos6-semana-390");
    await open("g1", "12y");
    const yearFits = await page.$eval(".gg-you", el => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return el.scrollWidth <= el.clientWidth + 1 && range.getClientRects().length <= 1;
    });
    assert.equal(yearFits, true);
    await board("grupos6-anio-390");
    await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2 });
    await open("g1", "all");
    const periods375 = await page.evaluate(() => {
      const links = [...document.querySelectorAll(".gg-filters .gg-rng a")];
      const parent = document.querySelector(".gg-filters")?.getBoundingClientRect();
      return {
        clipped: links.filter(el => el.scrollWidth > el.clientWidth + 1).map(el => `${el.textContent} ${el.scrollWidth}>${el.clientWidth}`),
        oneRow: new Set(links.map(el => Math.round(el.getBoundingClientRect().top))).size === 1,
        inside: !!parent && links.every(el => el.getBoundingClientRect().right <= parent.right + 1 && el.getBoundingClientRect().left >= parent.left - 1),
      };
    });
    assert.deepEqual(periods375.clipped, []);
    assert.equal(periods375.oneRow, true);
    assert.equal(periods375.inside, true);
    await page.goto(`http://127.0.0.1:${port}/#/amigos`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.body.innerText.includes("1 jugador · sos admin"));
    const avatars = await page.$$eval(".gg-list > a.row > .gg-av", els => els.map(el => {
      const box = el.getBoundingClientRect();
      const img = el.querySelector("img");
      const imgBox = img ? img.getBoundingClientRect() : null;
      const row = el.parentElement?.getBoundingClientRect();
      return { w: box.width, h: box.height, iw: imgBox?.width ?? 0, ih: imgBox?.height ?? 0, letter: (el.textContent || "").trim(), rowRight: row?.right ?? 0, view: window.innerWidth };
    }));
    assert.equal(avatars.length, 3);
    for (const av of avatars) {
      assert.ok(av.w >= 36 && av.w <= 40 && av.h >= 36 && av.h <= 40, JSON.stringify(av));
      assert.ok(av.rowRight <= av.view + 1, JSON.stringify(av));
    }
    assert.ok(avatars[0].iw <= 40 && avatars[0].ih <= 40 && avatars[0].iw > 20);
    assert.ok(avatars[1].iw <= 40 && avatars[1].ih <= 40);
    await page.waitForFunction(() => [...document.querySelectorAll(".gg-list > a.row > .gg-av")].some(el => {
      const img = el.querySelector("img");
      return (el.textContent || "").includes("R") && !!img && getComputedStyle(img).display === "none";
    }));
    assert.equal(avatars[0].letter.includes("S"), true);
    await page.screenshot({ path: `${ART}/web-375-grupo-foto.png` });
    await page.goto(`http://127.0.0.1:${port}/#/grupo/g-scratch?range=3m`, { waitUntil: "networkidle0" });
    await page.waitForSelector(".gg-you");
    const solo = await page.evaluate(() => document.body.innerText);
    assert.match(solo, /Sos el único del grupo/);
    assert.match(solo, /Todavía estás solo/);
    assert.match(solo, /No se inventan rivales/);
    assert.equal(await page.$$eval(".gg-stage:not([hidden]) .gg-lb tbody tr", els => els.length), 1);
    const invite = await page.$eval(".gg-solo .btn", el => {
      const box = el.getBoundingClientRect();
      const tab = document.querySelector("#tabbar")?.getBoundingClientRect().top ?? window.innerHeight;
      return box.top >= 0 && box.bottom <= tab - 8 && box.height >= 40;
    });
    assert.equal(invite, true);
    const mast = await page.$eval(".gg-mast-av", el => {
      const box = el.getBoundingClientRect();
      const img = el.querySelector("img");
      const ib = img ? img.getBoundingClientRect() : null;
      const cs = getComputedStyle(el);
      return { w: box.width, h: box.height, iw: ib?.width, ih: ib?.height, cssW: cs.width, cssH: cs.height, overflow: cs.overflow };
    });
    assert.ok(mast.w <= 60 && mast.h <= 60, JSON.stringify(mast));
    await page.evaluate(() => { const bar = document.querySelector("#tabbar"); if (bar) bar.style.display = "none"; });
    await page.screenshot({ path: `${ART}/web-375-clasificacion-1.png`, fullPage: true });
    await page.goto(`http://127.0.0.1:${port}/#/grupo/g5?range=all`, { waitUntil: "networkidle0" });
    await page.waitForSelector(".gg-lb");
    assert.deepEqual(await page.$$eval(".gg-stage:not([hidden]) .gg-lb td.pos b", els => els.map(el => el.textContent || "")), ["T1", "T1", "3", "4", "5"]);
    assert.match(await page.evaluate(() => document.querySelector(".gg-you")?.textContent || ""), /Empate en la punta/);
    await page.waitForFunction(() => document.querySelector(".gg-tabwrap")?.classList.contains("can-scroll"));
    await page.evaluate(() => { const bar = document.querySelector("#tabbar"); if (bar) bar.style.display = "none"; });
    await page.screenshot({ path: `${ART}/web-375-clasificacion-5.png`, fullPage: true });
    await page.evaluate(() => {
      const line = window.GolfletMatchCore.companionsLine(["Lavalle Joaquín", "Lavalle Augusto", "Mateo Ruiz"]);
      const host = document.createElement("div");
      host.id = "who-shot";
      host.innerHTML = `<div class="card tt-card" style="margin:16px"><a class="row"><div class="body"><div class="t">Jockey Club Argentino</div><div class="s tt-s">Azul · Mañana · Hoyo 1 · ${line}</div></div></a></div>`;
      document.body.prepend(host);
    });
    assert.match(await page.$eval("#who-shot", el => el.textContent || ""), /con Joaquín L\. y Augusto L\. \+1/);
    const card = await page.$("#who-shot");
    if (card) await card.screenshot({ path: `${ART}/web-375-companeros.png` });
  } finally {
    await browser.close();
    server.close();
  }
});
