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
      await page.waitForSelector(".gg-steps");
      await page.waitForFunction(() => [...document.querySelectorAll(".gg-hero .gg-count, .gg-stage:not([hidden]) .gg-count")].every(n => (n as HTMLElement).textContent === String(Math.round(Number((n as HTMLElement).dataset.n)))));
    };
    const shot = async (name: string) => {
      await page.evaluate(() => {
        const steps = document.querySelector(".gg-stage:not([hidden]) .gg-steps");
        const bar = document.querySelector("#tabbar");
        if (!steps || !bar) return;
        const room = bar.getBoundingClientRect().top - 12;
        const box = steps.getBoundingClientRect();
        if (box.bottom > room) window.scrollBy(0, box.bottom - room);
      });
      await page.screenshot({ path: `${ART}/${name}.png` });
    };
    await open("g1", "1w");
    const week = await page.evaluate(() => document.querySelector("#view")?.textContent || "");
    assert.match(week, /Tu puesto/);
    assert.match(week, /3 birdies/);
    assert.match(week, /1 tarjeta/);
    assert.match(week, /Ver tabla completa/);
    assert.match(week, /\+2 sobre Luis Gómez/);
    assert.match(week, /1 ronda esta semana/);
    assert.match(week, /Rey del birdie/);
    assert.equal(await page.$eval('.gg-rng a[aria-selected="true"]', el => el.textContent), "Sem");
    assert.equal(await page.$eval('.gg-rng a[aria-selected="true"]', el => el.getAttribute("aria-label")), "Semana");
    assert.equal((await page.$$eval(".gg-rng a", els => [...new Set(els.map(e => Math.round(e.getBoundingClientRect().top)))])).length, 1);
    assert.equal(await page.$$eval(".gg-stage:not([hidden]) .gg-step", els => els.length), 2);
    assert.equal(await page.$(".gg-step .cad"), null);
    const tableHidden = await page.$eval(".gg-full", el => (el as HTMLDetailsElement).open);
    assert.equal(tableHidden, false);
    await shot("grupo-semana-390");
    await open("g1", "all");
    const hist = await page.evaluate(() => document.querySelector("#view")?.textContent || "");
    assert.match(hist, /8 tarjetas \(6 de 18 y 2 de 9\)/);
    assert.equal(await page.$eval('.gg-rng a[aria-selected="true"]', el => el.textContent), "Todo");
    assert.equal(await page.$eval('.gg-rng a[aria-selected="true"]', el => el.getAttribute("aria-label")), "Histórico");
    assert.equal((await page.$$eval(".gg-rng a", els => [...new Set(els.map(e => Math.round(e.getBoundingClientRect().top)))])).length, 1);
    assert.ok(await page.$(".gg-step.p1 img.gg-img"));
    const peek = await page.$$eval(".gg-trophy", els => els.length >= 2 && els[1].getBoundingClientRect().left < window.innerWidth);
    assert.equal(peek, true);
    await shot("grupo-2-historico-390");
    await open("g1", "12y");
    const year = await page.evaluate(() => document.querySelector("#view")?.textContent || "");
    assert.match(year, /20 rondas este año/);
    assert.match(year, /Pocas tarjetas/);
    assert.match(year, /Rey del birdie/);
    assert.match(year, /8 tarjetas \(6 de 18 y 2 de 9\)/);
    assert.equal(await page.$eval('.gg-rng a[aria-selected="true"]', el => el.textContent), "Año");
    await shot("grupo-2-anio-390");
    await open("g4", "all");
    assert.equal(await page.$$eval(".gg-stage:not([hidden]) .gg-step", els => els.length), 3);
    assert.match(await page.evaluate(() => document.querySelector("#view")?.textContent || ""), /Mateo Ruiz/);
    await shot("grupo-4-historico-390");
    await open("g4", "12y");
    assert.equal(await page.$eval('.gg-rng a[aria-selected="true"]', el => el.textContent), "Año");
    assert.equal(await page.$$eval(".gg-stage:not([hidden]) .gg-step", els => els.length), 3);
    await shot("grupo-4-anio-390");
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    const board = async (name: string) => {
      await page.evaluate(() => document.querySelector(".gg-filters")?.scrollIntoView({ block: "start" }));
      await page.screenshot({ path: `${ART}/${name}.png` });
    };
    await open("gT", "all");
    const tied = await page.$$eval(".gg-stage:not([hidden]) .gg-step", els => els.map(el => {
      const box = el.getBoundingClientRect();
      return { place: el.querySelector(".gg-place")?.textContent, h: Math.round(box.height), p1: el.classList.contains("p1"), mid: (box.left + box.right) / 2, left: box.left };
    }));
    assert.equal(tied.filter(s => s.place === "1º" && s.p1).length, 2);
    assert.equal(tied[0].h, tied[1].h);
    assert.ok(tied[2].h < tied[0].h);
    assert.ok(tied[2].left > tied[1].mid);
    const pairMid = (tied[0].mid + tied[1].mid) / 2;
    assert.ok(Math.abs(pairMid - 195) < 24, `el par de 1º quedó en ${pairMid}`);
    assert.match(await page.evaluate(() => document.querySelector("#view")?.textContent || ""), /3º/);
    await board("grupos3-empate-390");
    await open("g1", "1w");
    const fit = await page.$eval(".gg-filters", el => {
      const row = el.getBoundingClientRect();
      const course = el.querySelector(".gg-course summary").getBoundingClientRect();
      const pills = [...el.querySelectorAll(".gg-rng a")].map(a => a.getBoundingClientRect());
      const last = pills[pills.length - 1];
      const first = [...el.querySelectorAll(".gg-stage:not([hidden]) .gg-step")];
      return {
        courseInside: course.right <= row.right + 1 && course.left >= last.right - 1 && course.top >= row.top - 1 && course.bottom <= row.bottom + 1,
        oneRow: new Set(pills.map(p => Math.round(p.top))).size === 1,
        steps: first.length,
      };
    });
    assert.equal(fit.courseInside, true);
    assert.equal(fit.oneRow, true);
    const centered = await page.$$eval(".gg-stage:not([hidden]) .gg-step", els => {
      const mid = window.innerWidth / 2;
      const lead = els.find(el => el.classList.contains("p1"));
      const side = els.find(el => el.classList.contains("p2"));
      const box = lead.getBoundingClientRect();
      return { delta: Math.abs((box.left + box.right) / 2 - mid), sideLeft: side.getBoundingClientRect().right <= box.left + 2 };
    });
    assert.ok(centered.delta < 28, `el 1º quedó a ${centered.delta}px del centro`);
    assert.equal(centered.sideLeft, true);
    assert.match(await page.evaluate(() => document.querySelector("#view")?.textContent || ""), /Pocas tarjetas/);
    await board("grupos3-semana-390");
    await open("g1", "12y");
    await board("grupos3-anio-390");
  } finally {
    await browser.close();
    server.close();
  }
});
