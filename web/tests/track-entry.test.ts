/** TEST-ONLY. Home entry and hole camera. Fixture coordinates only. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import test from "node:test";
import { existsSync } from "node:fs";

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
        { status: "complete", club_name: "Mar del Plata Golf Club", date: "2026-11-07", time: "12:20", label: "La tarjeta ya está." },
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
    await page.waitForFunction(() => (document.body.innerText || "").includes("Ya está"));
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
    await page.waitForSelector("#tknext");
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
    await page.waitForSelector("#rc-nogeo");
    seen = await read();
    assert.match(seen.note, /No invento el rumbo/);
    assert.equal(await page.$("#play-set"), null);
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
