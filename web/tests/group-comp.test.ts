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

test("la competencia del grupo reemplaza la tabla y compara el período anterior", { timeout: 90_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  mkdirSync(ART, { recursive: true });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (data: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(data)); };
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
    assert.match(week, /Tu posición/);
    assert.match(week, /Semana del 1 ene/);
    assert.match(week, /1 tarjeta/);
    assert.match(week, /Ver tabla completa/);
    assert.match(week, /\+2 sobre Luis/);
    assert.match(week, /Por ronda/);
    assert.match(week, /1 ronda esta semana/);
    assert.match(week, /Pocas tarjetas/);
    assert.equal(await page.$eval('.gg-rng a[aria-selected="true"]', el => el.textContent), "Sem");
    assert.equal(await page.$eval('.gg-rng a[aria-selected="true"]', el => el.getAttribute("aria-label")), "Semana");
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
    assert.match(hist, /Tu posición · .+ · 8 tarj\./);
    assert.match(hist, /Histórico/);
    assert.equal(await page.$eval('.gg-rng a[aria-selected="true"]', el => el.textContent), "Todo");
    assert.equal(await page.$eval('.gg-rng a[aria-selected="true"]', el => el.getAttribute("aria-label")), "Histórico");
    assert.equal((await page.$$eval(".gg-rng a", els => [...new Set(els.map(e => Math.round(e.getBoundingClientRect().top)))])).length, 1);
    assert.ok(await page.$(".gg-lb img.gg-img"));
    const leaders = await page.$$eval(".gg-leaders button", els => els.length >= 3 && els[1].getBoundingClientRect().left < window.innerWidth && Math.abs(els[1].getBoundingClientRect().top - els[0].getBoundingClientRect().top) < 2);
    assert.equal(leaders, true);
    await shot("grupo-2-historico-390");
    await open("g1", "12y");
    const year = await page.evaluate(() => document.querySelector("#view")?.textContent || "");
    assert.match(year, /20 rondas este año/);
    assert.match(year, /Pocas tarjetas/);
    assert.match(year, /Temporada 2026/);
    assert.match(year, /Tu posición · 1 · \+20 sobre Luis · 8 tarj\./);
    assert.equal(await page.$eval('.gg-rng a[aria-selected="true"]', el => el.textContent), "Año");
    await shot("grupo-2-anio-390");
    await open("g4", "all");
    assert.equal(await rowsOf(), 4);
    assert.match(await page.evaluate(() => document.querySelector("#view")?.textContent || ""), /Mateo Ruiz/);
    await shot("grupo-4-historico-390");
    await open("g4", "12y");
    assert.equal(await page.$eval('.gg-rng a[aria-selected="true"]', el => el.textContent), "Año");
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
      const row = el.getBoundingClientRect();
      const course = el.querySelector(".gg-course summary")?.getBoundingClientRect();
      const pills = [...el.querySelectorAll(".gg-rng a")].map(a => a.getBoundingClientRect());
      const last = pills[pills.length - 1];
      return {
        courseInside: !!course && !!last && course.right <= row.right + 1 && course.left >= last.right - 1 && course.top >= row.top - 1 && course.bottom <= row.bottom + 1,
        oneRow: new Set(pills.map(p => Math.round(p.top))).size === 1,
      };
    });
    assert.equal(fit.courseInside, true);
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
  } finally {
    await browser.close();
    server.close();
  }
});
