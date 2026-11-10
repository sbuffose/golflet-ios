/** TEST-ONLY. Home entry and hole camera. Fixture coordinates only. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import test from "node:test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { COLORADA_GREEN_AXIS, VIEJA_GREEN_AXIS } from "../lib/golfistics-axis";
import { coloradaOsmHole } from "../lib/colorada-osm";

const CHROME = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find(p => existsSync(p));
const ROOT = new URL("../public/", import.meta.url);
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".png": "image/png" };
const hole = (n: number, tee: { lat: number; lng: number } | null, flag: { lat: number; lng: number } | null, par = 4, yards = 380) => ({
  hole: n, par, yards, ...(tee ? { tee } : {}), ...(flag ? { green: { center: flag } } : {}),
});

test("the home entry is a compact control and opens hole 1 on the map", { timeout: 60_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const calls: string[] = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (body: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname.startsWith("/api/")) {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      calls.push(`${req.method} ${url.pathname}`);
      if (url.pathname === "/api/data") return json({
        user: { name: "TEST-ONLY", first_name: "TEST-ONLY", pending_first_sync: false },
        player: { name: "TEST-ONLY", handicap_index: 8 }, hi_history: [],
        clubs: [{ id: "acc", club_name: "Club Fixture", rounds: 1, last_sync_status: "ok", last_sync_at: "2026-11-07T12:00:00Z", password_saved: true, source: "site" }],
        courses: [], rounds: [],
      });
      if (url.pathname === "/api/scorecard-fetches") return json({ fetches: [
        { status: "complete", heading: "Ya está", club_name: "Mar del Plata Golf Club", date: "2026-11-07", time: "12:20", label: "La tarjeta ya está." },
        { status: "error", heading: "Sin confirmar", club_name: "Jockey Club", course_label: "Azul", date: "2026-11-09", time: "08:00", label: "No pudimos leer el club." },
      ] });
      if (url.pathname === "/api/tee-times/check") return json({ fresh: false, message: "TEST-ONLY", tee_times: [] });
      if (url.pathname === "/api/tee-times") return json({ tee_times: [], clubs: [] });
      if (url.pathname === "/api/gps/courses") return json({ courses: [{ course_id: "209-cancha-vieja", club_name: "Mar del Plata Golf Club", club_code: "209", course: "Cancha Vieja", label: "Cancha Vieja" }] });
      if (url.pathname === "/api/gps/courses/209-cancha-vieja") return json({ course: { holes: [hole(1, { lat: -38.037, lng: -57.5382 }, { lat: -38.033812, lng: -57.538187 }, 4, 445)] } });
      if (url.pathname === "/api/reconstructions" && req.method === "GET") return json({ rounds: [], reconstructions: calls.some(c => c.startsWith("POST /api/reconstructions")) ? [{ id: "live-new", current_hole: 1, club_code: "209", vm_course: "Cancha Vieja", course: "Cancha Vieja", round_id: null }] : [] });
      if (url.pathname === "/api/reconstructions" && req.method === "POST") return json({ live_round: { id: "live-new" } }, 201);
      if (url.pathname === "/api/reconstructions/live-new/shots") return json({ shots: [] });
      return json({});
    }
    const file = url.pathname === "/" ? "/index.html" : url.pathname;
    try { const buf = await readFile(new URL(file.slice(1), ROOT)); res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" }); res.end(buf); }
    catch { res.writeHead(404); res.end("missing"); }
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    await page.setRequestInterception(true);
    page.on("request", req => {
      const host = new URL(req.url()).hostname;
      if (host !== "127.0.0.1" && host !== "localhost") req.abort();
      else req.continue();
    });
    await page.goto(`http://127.0.0.1:${port}/#/inicio`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#recon-start");
    await page.waitForFunction(() => (document.body.innerText || "").includes("No pudimos leer el club."));
    assert.equal((await page.evaluate(() => document.body.innerText)).includes("Ya está"), false);
    assert.equal((await page.evaluate(() => document.body.innerText)).includes("La tarjeta ya está."), false);
    const box = await page.$eval("#recon-start", el => {
      const node = el as HTMLElement;
      const r = node.getBoundingClientRect();
      const s = getComputedStyle(node);
      return { text: node.innerText, display: s.display, bg: s.backgroundColor, h: r.height, left: r.left, right: r.right, vw: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    const bring = await page.$eval("#bring-card", el => ({ text: el.textContent || "", top: el.getBoundingClientRect().top }));
    const entryBottom = await page.$eval("#recon-start", el => el.getBoundingClientRect().bottom);
    assert.equal(box.display, "flex");
    assert.equal(box.bg, "rgb(11, 37, 69)");
    assert.equal(box.text.includes("Cargar una vuelta ya jugada"), true);
    assert.equal(box.text.includes("Marcá cada golpe"), false);
    assert.ok(box.h >= 48 && box.h <= 96, `height ${box.h}`);
    assert.ok(box.left >= 0 && box.right <= box.vw + 1);
    assert.equal(box.overflow, false);
    assert.equal(bring.text.trim(), "Traer última tarjeta");
    assert.ok(bring.top >= entryBottom - 1);
    await page.click("#recon-start");
    await page.waitForSelector("#rc-course");
    await page.waitForFunction(() => (document.querySelector("#rc-course") as HTMLSelectElement | null)?.value === "209-cancha-vieja");
    assert.equal(calls.filter(c => c.startsWith("POST /api/reconstructions")).length, 0);
    await page.click("#rc-start");
    await page.waitForSelector("#tkmap");
    await page.waitForFunction(() => document.documentElement.classList.contains("rc-map"));
    const map = await page.evaluate(() => {
      const el = document.querySelector("#tkmap");
      const r = el?.getBoundingClientRect();
      return {
        hole: document.querySelector(".tk-hn b")?.textContent || "",
        frame: el?.getAttribute("data-frame") || "",
        aim: el?.getAttribute("data-aim-lat") || "",
      ball: el?.getAttribute("data-ball-lat") || "",
        tile: Number(el?.getAttribute("data-tile-z") || 0),
        w: r?.width || 0, h: r?.height || 0, vw: innerWidth, vh: innerHeight,
        hit: !!document.querySelector("#play-hit"),
        cancel: document.querySelector("#play-cancel"),
      };
    });
    assert.equal(map.hole, "Hoyo 1");
    assert.equal(map.frame, "play");
    assert.ok(map.ball.startsWith("-38.037"), map.ball);
    assert.ok(Number(map.aim) < -38.034 && Number(map.aim) > -38.037, map.aim);
    assert.ok(map.tile <= 17);
    assert.ok(map.w >= map.vw - 2 && map.h >= map.vh - 2);
    assert.equal(map.hit, true);
    assert.equal(map.cancel, null);
    assert.equal((await page.evaluate(() => document.body.innerText)).includes("Arrastrá para confirmar la salida"), false);
    assert.equal((await page.evaluate(() => document.body.innerText)).includes("[object Object]"), false);
  } finally {
    await browser.close();
    await new Promise<void>(r => server.close(() => r()));
  }
});

test("an existing hole is kept, the next hole uses its own tee, and a bad hole is not invented", { timeout: 60_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const holes = [
    hole(1, { lat: -34.6, lng: -58.4 }, { lat: -34.601, lng: -58.401 }),
    hole(2, { lat: -34.7, lng: -58.5 }, { lat: -34.7015, lng: -58.501 }),
    hole(3, null, null),
    hole(4, { lat: -34.6, lng: -58.4 }, { lat: -36.6, lng: -58.4 }),
  ];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (body: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname.startsWith("/api/")) {
      for await (const chunk of req) void chunk;
      if (url.pathname === "/api/data") return json({ user: { name: "TEST-ONLY", pending_first_sync: false }, player: { name: "TEST-ONLY" }, hi_history: [], clubs: [{ id: "a", club_name: "Club Fixture", rounds: 1, last_sync_status: "ok", password_saved: false, source: "site" }], courses: [], rounds: [] });
      if (url.pathname === "/api/gps/courses/209-cancha-vieja") return json({ course: { holes } });
      if (url.pathname === "/api/reconstructions" && req.method === "GET") return json({ rounds: [], reconstructions: [
        { id: "live-keep", current_hole: 2, club_code: "209", vm_course: "Cancha Vieja", course: "Cancha Vieja", round_id: null },
        { id: "live-shot", current_hole: 2, club_code: "209", vm_course: "Cancha Vieja", course: "Cancha Vieja", round_id: null },
      ] });
      if (url.pathname === "/api/reconstructions/live-shot/shots") return json({ shots: [{ id: "s2", hole: 2, club: "7i", end_lat: -34.701, end_lng: -58.5005, penalty_strokes: 0 }] });
      if (url.pathname.endsWith("/shots")) return json({ shots: [] });
      return json({});
    }
    const file = url.pathname === "/" ? "/index.html" : url.pathname;
    try { const buf = await readFile(new URL(file.slice(1), ROOT)); res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" }); res.end(buf); }
    catch { res.writeHead(404); res.end("missing"); }
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
  try {
    const page = await browser.newPage();
    const read = () => page.evaluate(() => ({
      hole: document.querySelector("#tk-hole b")?.textContent || document.querySelector(".tk-hn b")?.textContent || "",
      frame: document.querySelector("#tkmap")?.getAttribute("data-frame") || "",
      aim: document.querySelector("#tkmap")?.getAttribute("data-aim-lat") || "",
      ball: document.querySelector("#tkmap")?.getAttribute("data-ball-lat") || "",
      bearing: document.querySelector("#tkmap")?.getAttribute("data-bearing") || "",
      note: document.querySelector("#rc-nogeo")?.textContent || "",
    }));
    await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true });
    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-keep`, { waitUntil: "networkidle0" });
    await page.waitForSelector(".tk-hn");
    let seen = await read();
    assert.equal(seen.hole, "Hoyo 2");
    assert.equal(seen.frame, "play");
    assert.equal(Number(seen.ball), -34.7);
    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-keep?hole=1`, { waitUntil: "networkidle0" });
    await page.waitForSelector(".tk-hn");
    seen = await read();
    assert.equal(seen.hole, "Hoyo 1");
    assert.equal(Number(seen.ball), -34.6);
    await page.waitForFunction(() => {
      const map = document.querySelector("#tkmap") as HTMLElement | null;
      const next = document.querySelector("#tknext");
      return !!next && map?.dataset.moving === "0" && (map.dataset.cmap === "0" || map.dataset.cmap === "1");
    });
    await page.click("#tknext");
    await page.waitForFunction(() => document.querySelector(".tk-hn b")?.textContent === "Hoyo 2");
    seen = await read();
    assert.equal(seen.frame, "play");
    assert.equal(Number(seen.ball), -34.7);
    assert.notEqual(seen.bearing, "");
    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-keep?hole=3`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#rc-nogeo");
    seen = await read();
    assert.equal(seen.hole, "Hoyo 3");
    assert.match(seen.note, /no tiene geometría/);
    assert.equal(await page.$("#tkmap"), null);
    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-keep?hole=4`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#tkmap");
    await page.waitForSelector("#rc-nogeo");
    seen = await read();
    assert.match(seen.note, /No marco un rumbo/);
    assert.equal(seen.bearing, "");
    assert.equal(Number(seen.aim).toFixed(1), "-36.6");
    assert.equal(await page.$eval("#play-set", el => (el as HTMLButtonElement).disabled), true);
    assert.equal(await page.$eval("#tkmap", el => el.getAttribute("data-span")), "0");
    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-shot`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#play-hit");
    seen = await read();
    assert.equal(seen.hole, "Hoyo 2");
    assert.equal(await page.$("#play-set"), null);
    assert.equal(seen.frame, "play");
  } finally {
    await browser.close();
    await new Promise<void>(r => server.close(() => r()));
  }
});

test("Cancha Vieja muestra el green verificado cuando la salida no cierra", { timeout: 90_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const open = VIEJA_GREEN_AXIS.slice(0, 2).map(h => ({ hole: h.hole, par: h.hole === 1 ? 4 : 3, yards: h.hole === 1 ? 445 : 195, green: { front: h.front, center: h.center, back: h.back } }));
  const bad = open.map(h => ({ ...h, tee: { lat: h.green.center.lat - 2, lng: h.green.center.lng } }));
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (body: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname.startsWith("/api/")) {
      for await (const chunk of req) void chunk;
      if (url.pathname === "/api/data") return json({ user: { name: "TEST-ONLY", pending_first_sync: false }, player: { name: "TEST-ONLY" }, hi_history: [], clubs: [], courses: [], rounds: [] });
      if (url.pathname === "/api/gps/courses/209-cancha-vieja") return json({ course: { club_code: "209", course: "Cancha Vieja", holes: open } });
      if (url.pathname === "/api/gps/courses/118-colorada") return json({ course: { club_code: "118", course: "Colorada", holes: COLORADA_GREEN_AXIS.map(h => {
        const osm = coloradaOsmHole(h.hole);
        return { hole: h.hole, par: 4, hcp: h.hole, yards: 380, tee: osm?.tee || null, line: osm?.line || null, green: { front: h.front, center: h.center, back: h.back } };
      }) } });
      if (url.pathname === "/api/gps/courses/209-cancha-vieja-mala") return json({ course: { club_code: "209", course: "Cancha Vieja Mala", holes: bad } });
      if (url.pathname === "/api/reconstructions" && req.method === "GET") return json({ rounds: [], reconstructions: [
        { id: "live-open", current_hole: 1, club_code: "209", vm_course: "Cancha Vieja", course: "Cancha Vieja", round_id: null },
        { id: "live-bad", current_hole: 1, club_code: "209", vm_course: "Cancha Vieja Mala", course: "Cancha Vieja Mala", round_id: null },
        { id: "live-colorada", current_hole: 1, club_code: "118", vm_course: "Colorada", course: "Colorada", round_id: null },
      ] });
      if (url.pathname.endsWith("/shots")) return json({ shots: [] });
      return json({});
    }
    const file = url.pathname === "/" ? "/index.html" : url.pathname;
    try { const buf = await readFile(new URL(file.slice(1), ROOT)); res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" }); res.end(buf); }
    catch { res.writeHead(404); res.end("missing"); }
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
  const art = "/opt/cursor/artifacts";
  mkdirSync(art, { recursive: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const visit = async (id: string, holeN: number, file: string) => {
      await page.goto(`http://127.0.0.1:${port}/#/reconstruir/${id}?hole=${holeN}`, { waitUntil: "networkidle0" });
      await page.waitForSelector("#tkmap");
      await page.waitForFunction(() => {
        const map = document.querySelector("#tkmap");
        return map?.getAttribute("data-drawn") === "1" && map?.getAttribute("data-moving") === "0";
      }, { timeout: 25000 });
      const state = await page.evaluate(() => {
        const map = document.querySelector("#tkmap");
        return {
          aim: map?.getAttribute("data-aim-lat") || "",
          bearing: map?.getAttribute("data-bearing") || "",
          span: map?.getAttribute("data-span") || "",
          note: document.querySelector("#rc-nogeo")?.textContent || "",
          axis: document.querySelector(".tk-axisnote")?.textContent || "",
          empty: !!document.querySelector(".tk-empty"),
        };
      });
      await page.screenshot({ path: join(art, file) });
      return state;
    };
    const h1 = await visit("live-open", 1, "vieja-h1-green-390.png");
    assert.equal(h1.empty, false);
    assert.equal(h1.note, "");
    assert.equal(h1.bearing, "");
    assert.ok(Math.abs(Number(h1.aim) - VIEJA_GREEN_AXIS[0].center.lat) < 1e-6);
    assert.match(h1.axis, /Eje verificado del green/);
    assert.match(await page.$eval("#tkro", el => el.textContent || ""), /Arrastrá para confirmar la salida/);
    assert.equal(await page.$eval("#play-set", el => (el as HTMLButtonElement).disabled), false);
    assert.equal(await page.$eval("#play-cancel", el => el.textContent || ""), "CANCEL");
    await page.screenshot({ path: join(art, "vieja-h1-confirm-390.png") });
    await page.click("#play-set");
    await page.waitForFunction(() => document.querySelector("#tkmap")?.getAttribute("data-tee-source") === "jugador");
    assert.match(await page.$eval("#tk-player", el => el.textContent || ""), /No es una medida/);
    const colorada = await visit("live-colorada", 1, "colorada-h1-frame-390.png");
    assert.equal(colorada.span, "1");
    assert.notEqual(colorada.bearing, "");
    const tee = coloradaOsmHole(1);
    assert.ok(tee);
    assert.ok(Math.abs(Number(await page.$eval("#tkmap", el => el.getAttribute("data-ball-lat"))) - tee.tee.lat) < 1e-5);
    await page.click("#play-club-tile");
    await page.waitForSelector("#play-club-list button");
    const bar = await page.evaluate(() => {
      const tile = document.querySelector("#play-club-tile") as HTMLElement;
      const hit = document.querySelector("#play-hit") as HTMLElement;
      const list = document.querySelector("#play-club-list") as HTMLElement;
      return {
        tile: tile.getBoundingClientRect().width,
        hit: hit.getBoundingClientRect().width,
        hitBg: getComputedStyle(hit).backgroundColor,
        list: list.hidden,
        clubs: list.innerText,
      };
    });
    assert.ok(bar.tile <= 72 && bar.hit <= 72, JSON.stringify(bar));
    assert.equal(bar.hitBg, "rgb(11, 37, 69)");
    assert.equal(bar.list, false);
    assert.match(bar.clubs, /Driver|Dr/);
    await page.screenshot({ path: join(art, "track-390-club-list.png") });
    const h2 = await visit("live-open", 2, "vieja-h2-green-390.png");
    assert.equal(h2.empty, false);
    assert.ok(Math.abs(Number(h2.aim) - VIEJA_GREEN_AXIS[1].center.lat) < 1e-6);
    const bad1 = await visit("live-bad", 1, "vieja-h1-unclosed-390.png");
    assert.equal(bad1.empty, false);
    assert.equal(bad1.bearing, "");
    assert.equal(bad1.span, "0");
    assert.match(bad1.note, /No marco un rumbo/);
    assert.ok(Math.abs(Number(bad1.aim) - VIEJA_GREEN_AXIS[0].center.lat) < 1e-6);
    const bad2 = await visit("live-bad", 2, "vieja-h2-unclosed-390.png");
    assert.equal(bad2.span, "0");
    assert.equal(bad2.bearing, "");
    assert.ok(Math.abs(Number(bad2.aim) - VIEJA_GREEN_AXIS[1].center.lat) < 1e-6);
  } finally {
    await browser.close();
    await new Promise<void>(r => server.close(() => r()));
  }
});
