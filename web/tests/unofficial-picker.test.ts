/** Last round first, then the rest, plus a cardless round marked unofficial. Fixture only. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import test from "node:test";

const CHROME = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find(p => existsSync(p));
const ROOT = new URL("../public/", import.meta.url);
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml" };
const SHOTS = "/opt/cursor/artifacts";
let saveShots = false;
try { mkdirSync(SHOTS, { recursive: true }); saveShots = true; } catch { saveShots = false; }

const rounds = [
  { id: "card-new", date: "2026-11-08", course: "Cancha Vieja", tee: "Azul", gross: 82, club_name: "Mar del Plata Golf Club", club_code: "209", tracked: false, official: true },
  { id: "card-old", date: "2026-10-04", course: "Azul", tee: "Blanco", gross: 76, club_name: "Club Fixture", club_code: "118", tracked: true, official: true },
];

test("cargar una vuelta ofrece la última tarjeta, el resto y una vuelta no oficial", { timeout: 120_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const posts: unknown[] = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const json = (data: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(data)); };
    if (url.pathname.startsWith("/api/")) {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      if (url.pathname === "/api/data") return json({
        user: { name: "TEST-ONLY", first_name: "Test", pending_first_sync: false, role: null },
        player: { name: "TEST-ONLY", handicap_index: 12 },
        hi_history: [], bag: [],
        clubs: [{ id: "c1", club_name: "Club Fixture", rounds: 2 }],
        courses: [{ key: "118:Azul", course: "Azul", label: "Azul", holes: [] }],
        rounds: [{
          round_id: "card-new", date: "2026-11-08", tournament: "Copa", course: "Cancha Vieja", course_key: "209:Vieja",
          course_label: "Cancha Vieja", tee: "Azul", club_name: "Mar del Plata Golf Club", valid_card: true, gross: 82, net: 78,
          is_9_holes: false, holes: [], summary_counts: { birdies: 1, pars: 10, bogeys: 5, double_bogeys: 0 },
        }],
        unofficial_rounds: [{ id: "live-loose", date: "2026-11-02", course: "Cancha Vieja", tee: "Blanco", club_code: "209", official: false }],
      });
      if (url.pathname === "/api/gps/courses") return json({ courses: [{ course_id: "209-cancha-vieja", club_name: "Mar del Plata Golf Club", club_code: "209", course: "Cancha Vieja", label: "Cancha Vieja" }] });
      if (url.pathname === "/api/gps/courses/209-cancha-vieja") return json({ course: {
        course_id: "209-cancha-vieja", club_code: "209", course: "Cancha Vieja",
        holes: [
          { number: 1, par: 4, tee: { lat: -38.037468, lng: -57.538187 }, green: { center: { lat: -38.033812, lng: -57.538187 } } },
          { number: 2, par: 4 },
        ],
      } });
      if (url.pathname === "/api/reconstructions" && req.method === "GET") return json({
        rounds,
        reconstructions: [{ id: "live-loose", date: "2026-11-02", course: "Cancha Vieja", tee: "Blanco", club_code: "209", vm_course: "Cancha Vieja", round_id: null, official: false, tracked: false, current_hole: 1 }],
      });
      if (url.pathname === "/api/reconstructions" && req.method === "POST") {
        const body = raw ? JSON.parse(raw) : {};
        posts.push(body);
        return json({ live_round: { id: "live-manual", official: false, round_id: body.round_id || null, tee: body.tee || null } }, 201);
      }
      if (url.pathname.startsWith("/api/reconstructions/")) return json({ shots: [] });
      if (url.pathname === "/api/weather/rounds") return json({ rounds: {} });
      if (url.pathname === "/api/scorecard-fetches") return json({ fetches: [] });
      if (url.pathname === "/api/tee-times") return json({ tee_times: [], clubs: [] });
      return json({});
    }
    const file = url.pathname === "/" ? "/index.html" : url.pathname;
    try { const buf = await readFile(new URL(file.slice(1), ROOT)); res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" }); res.end(buf); }
    catch { res.writeHead(404); res.end("missing"); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", req => {
      const host = new URL(req.url()).hostname;
      if (host !== "127.0.0.1" && host !== "localhost" && host !== "server.arcgisonline.com") req.abort();
      else req.continue();
    });
    for (const width of [375, 430]) {
      await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
      await page.goto(`http://127.0.0.1:${port}/#/reconstruir`, { waitUntil: "networkidle0" });
      await page.waitForSelector("#rc-last");
      const text = await page.$eval("#rc-pick", el => (el as HTMLElement).innerText);
      assert.match(text, /Última ronda/i);
      assert.match(text, /8 nov 2026/);
      assert.match(text, /Cancha Vieja/);
      assert.match(text, /Tee Azul/);
      assert.match(text, /82/);
      assert.match(text, /Sin golpes/);
      assert.match(text, /4 oct 2026/);
      assert.match(text, /Golpes cargados/);
      assert.match(text, /Sin tarjeta del club/);
      assert.match(text, /No oficial/);
      const order = await page.evaluate(() => {
        const rows = [...document.querySelectorAll("#rc-rest .rc-row")].map(el => ({
          text: (el as HTMLElement).innerText,
          top: el.getBoundingClientRect().top,
        }));
        const manual = document.querySelector("#rc-manual") as HTMLDetailsElement;
        const course = document.querySelector("#rc-course") as HTMLElement;
        const feat = getComputedStyle(document.querySelector(".rc-feat") as Element).backgroundColor;
        return {
          rows,
          lastBottom: document.querySelector("#rc-last")!.getBoundingClientRect().bottom,
          manualTop: manual.getBoundingClientRect().top,
          formOpen: manual.open,
          courseH: course.checkVisibility() ? course.getBoundingClientRect().height : 0,
          feat,
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
        };
      });
      assert.equal(order.formOpen, false);
      assert.equal(order.courseH, 0);
      assert.equal(order.rows.length, 2);
      assert.match(order.rows[0].text, /2 nov 2026/);
      assert.match(order.rows[0].text, /No oficial/);
      assert.match(order.rows[1].text, /4 oct 2026/);
      assert.ok(order.lastBottom <= order.rows[0].top + 1, JSON.stringify(order));
      assert.ok(order.rows[1].top < order.manualTop, JSON.stringify(order));
      assert.equal(order.feat, "rgb(11, 37, 69)");
      assert.equal(order.overflow, false);
      if (saveShots) await page.screenshot({ path: `${SHOTS}/web-${width}-cargar-vuelta.png`, fullPage: true });
      await page.goto(`http://127.0.0.1:${port}/#/ronda/card-new`, { waitUntil: "networkidle0" });
      await page.waitForSelector("#track-shots");
      const shots = await page.$eval("#track-shots", el => {
        const node = el as HTMLElement;
        const nav = node.closest(".crumbs") as HTMLElement;
        const back = nav.querySelector(".crumb-back") as HTMLElement;
        const s = getComputedStyle(node);
        return {
          text: node.innerText.trim(),
          bg: s.backgroundColor,
          left: node.getBoundingClientRect().left,
          backRight: back.getBoundingClientRect().right,
          top: node.getBoundingClientRect().top,
          backTop: back.getBoundingClientRect().top,
        };
      });
      assert.equal(shots.text, "Track Shots");
      assert.equal(shots.bg, "rgb(11, 37, 69)");
      assert.ok(shots.left > shots.backRight, JSON.stringify(shots));
      assert.ok(Math.abs(shots.top - shots.backTop) < 24, JSON.stringify(shots));
      if (saveShots) await page.screenshot({ path: `${SHOTS}/web-${width}-track-shots.png` });
    }
    await page.setViewport({ width: 375, height: 900, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${port}/#/reconstruir`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#rc-last");
    await page.click("#rc-last");
    await page.waitForFunction(() => location.hash.includes("ronda=card-new"));
    assert.equal(posts.length, 0);
    await page.waitForSelector("#tkmap", { timeout: 15000 });
    await page.waitForFunction(() => (document.body.innerText || "").includes("Hoyo 1"));
    await new Promise(r => setTimeout(r, 1800));
    for (const width of [375, 430]) {
      await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
      await new Promise(r => setTimeout(r, 300));
      if (saveShots) await page.screenshot({ path: `${SHOTS}/web-${width}-track-shots-hoyo-1.png` });
    }
    await page.click("#tknext");
    await page.waitForSelector("#rc-nogeo");
    for (const width of [375, 430]) {
      await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
      if (saveShots) await page.screenshot({ path: `${SHOTS}/web-${width}-track-shots-sin-geo.png` });
    }
    await page.setViewport({ width: 375, height: 900, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${port}/#/reconstruir`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#rc-manual-open");
    await page.click("#rc-manual-open");
    await page.waitForFunction(() => (document.querySelector("#rc-course") as HTMLSelectElement | null)?.value === "209-cancha-vieja");
    await page.$eval("#rc-start", el => (el as HTMLButtonElement).click());
    await page.waitForFunction(() => location.hash.includes("live-manual"));
    const body = posts[0] as { round_id?: string; tee?: string; course_id?: string };
    assert.equal(body.round_id, undefined);
    assert.equal(body.tee, "Blanco");
    assert.equal(body.course_id, "209-cancha-vieja");
    await page.goto(`http://127.0.0.1:${port}/#/rondas`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => (document.body.innerText || "").includes("No oficial"));
    if (saveShots) await page.screenshot({ path: `${SHOTS}/web-375-rondas-no-oficial.png`, fullPage: true });
  } finally {
    await browser.close();
    server.close();
  }
});
