/** TEST-ONLY. Round legend counts and the Tu juego map entry.
 *  Fixture data only. Opening the entry must not create a reconstruction. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

const CHROME = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find(p => existsSync(p));
const ROOT = new URL("../public/", import.meta.url);
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".png": "image/png" };
const ART = join(tmpdir(), "golflet-round-track");
const hole = (n: number, par: number, strokes: number) => [n, par, strokes];

const data = {
  user: { name: "TEST-ONLY", first_name: "TEST-ONLY", pending_first_sync: false },
  player: { name: "TEST-ONLY", handicap_index: 8 },
  hi_history: [],
  clubs: [{ id: "acc", club_name: "Club Fixture", rounds: 2, last_sync_status: "ok", last_sync_at: "2026-11-02T12:00:00Z", password_saved: false, source: "site" }],
  courses: [{ key: "c1", course: "Cancha Fixture", label: "Cancha Fixture", club_name: "Club Fixture", par: 72, tees: {}, holes: [] }],
  rounds: [
    {
      round_id: "r-nov", id: "r-nov", date: "2026-11-02", valid_card: true, gross: 80, net: 75, is_9_holes: false,
      differential_computed: 4.2, course_key: "c1", course: "Cancha Fixture", course_label: "Cancha Fixture",
      club_name: "Club Fixture", tournament: "TEST-ONLY",
      holes: [hole(1, 3, 1), hole(2, 4, 4), hole(3, 5, 4)],
    },
    {
      round_id: "r-saved", id: "r-saved", date: "2026-10-01", valid_card: true, gross: 82, net: 76, is_9_holes: false,
      differential_computed: 5, course_key: "c1", course: "Cancha Fixture", course_label: "Cancha Fixture",
      club_name: "Club Fixture", tournament: "TEST-ONLY",
      holes: [hole(1, 4, 4)],
    },
  ],
};

test("Tu juego opens this round on the map and the legend count sits inside the symbol", { timeout: 60_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const calls: { method: string; path: string }[] = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (body: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname.startsWith("/api/")) {
      for await (const chunk of req) void chunk;
      calls.push({ method: req.method || "GET", path: url.pathname });
      if (url.pathname === "/api/data") return json(data);
      if (url.pathname === "/api/gps/courses") return json({ courses: [{ course_id: "course-fixture", club_name: "Club Fixture", course: "Cancha Fixture", label: "Cancha Fixture" }] });
      if (url.pathname === "/api/gps/courses/course-fixture" || url.pathname === "/api/gps/courses/fx-cancha-fixture") {
        return json({ course: { holes: [{ hole: 1, tee: { lat: -34.6, lng: -58.4 }, green: { center: { lat: -34.601, lng: -58.401 } } }] } });
      }
      if (url.pathname === "/api/reconstructions" && req.method === "GET") {
        return json({
          rounds: [
            { id: "r-nov", date: "2026-11-02", course: "Cancha Fixture", club_name: "Club Fixture", club_code: "fx" },
            { id: "r-saved", date: "2026-10-01", course: "Cancha Fixture", club_name: "Club Fixture", club_code: "fx" },
          ],
          reconstructions: [{ id: "live-saved", date: "2026-10-01", course: "Cancha Fixture", club_code: "fx", vm_course: "Cancha Fixture", round_id: "r-saved" }],
        });
      }
      if (url.pathname === "/api/reconstructions/live-saved/shots" && req.method === "GET") return json({ shots: [{ id: "s1", hole: 1, club: "7i", position_label: "Marcado a mano", distance_label: "Distancia estimada", distance_m: 140, penalty_strokes: 0 }] });
      if (req.method === "POST") return json({ live_round: { id: "should-not-create" } }, 201);
      return json({});
    }
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
    await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true });
    await page.setRequestInterception(true);
    page.on("request", req => {
      const host = new URL(req.url()).hostname;
      if (host !== "127.0.0.1" && host !== "localhost") req.abort();
      else req.continue();
    });
    mkdirSync(ART, { recursive: true });
    await page.goto(`http://127.0.0.1:${port}/#/ronda/r-nov`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#scoreline");
    await page.waitForSelector("#round-track");
    const legend = await page.$eval("#scoreline", el => ({
      marks: [...el.querySelectorAll(".b")].map(node => (node.textContent || "").trim()),
      outside: [...el.querySelectorAll(".num")].length,
    }));
    assert.deepEqual(legend.marks, ["1", "1", "1", "0", "0"]);
    assert.equal(legend.outside, 0);
    await page.$eval("#scoreline", el => el.scrollIntoView({ block: "center" }));
    await page.screenshot({ path: join(ART, "legend.png") });
    const before = calls.filter(c => c.method === "POST").length;
    await page.click("#round-track");
    await page.waitForSelector("#rc-map");
    await page.waitForFunction(() => (document.querySelector("#rc-title")?.textContent || "").includes("Registrar mis tiros"));
    await page.waitForFunction(() => (document.querySelector("#rc-mapnote")?.textContent || "").includes("Mapa del hoyo"));
    assert.equal(await page.$eval("#rc-hole", el => (el as HTMLSelectElement).value), "1");
    assert.match(await page.evaluate(() => location.hash), /ronda=r-nov/);
    assert.equal(calls.filter(c => c.method === "POST").length, before);
    assert.equal(calls.some(c => c.method === "GET" && c.path === "/api/gps/courses/course-fixture"), true);
    const clear = await page.evaluate(() => {
      const save = document.querySelector("#rc-save");
      const bar = document.querySelector("#tabbar");
      if (!save || !bar) return false;
      save.scrollIntoView({ block: "center" });
      return save.getBoundingClientRect().bottom <= bar.getBoundingClientRect().top + 1;
    });
    assert.equal(clear, true);
    await page.screenshot({ path: join(ART, "track-map.png") });
    const back = await page.$eval(".crumb-back", el => el.getAttribute("href"));
    assert.equal(back, "#/ronda/r-nov");
    await page.click(".crumb-back");
    await page.waitForSelector("#round-track");
    assert.equal(await page.evaluate(() => location.hash), "#/ronda/r-nov");
    await page.goto(`http://127.0.0.1:${port}/#/ronda/r-saved`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#round-track");
    await page.click("#round-track");
    await page.waitForFunction(() => location.hash === "#/reconstruir/live-saved?hole=1");
    await page.waitForFunction(() => (document.querySelector("#rc-shots")?.textContent || "").includes("7i"));
    assert.equal(calls.filter(c => c.method === "POST").length, before);
    assert.equal(await page.$("#qstat"), null);
  } finally {
    await browser.close();
    await new Promise<void>(r => server.close(() => r()));
  }
});

test("a round does not open another club's course when only the course name matches", { timeout: 60_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const calls: { method: string; path: string }[] = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (body: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname.startsWith("/api/")) {
      for await (const chunk of req) void chunk;
      calls.push({ method: req.method || "GET", path: url.pathname });
      if (url.pathname === "/api/data") return json({
        user: { name: "TEST-ONLY", first_name: "TEST-ONLY", pending_first_sync: false },
        player: { name: "TEST-ONLY", handicap_index: 8 }, hi_history: [],
        clubs: [{ id: "a", club_name: "Club A", rounds: 1, last_sync_status: "ok", last_sync_at: "2026-11-02T12:00:00Z", password_saved: false, source: "site" }],
        courses: [{ key: "a1", course: "Principal", label: "Principal", club_name: "Club A", par: 72, tees: {}, holes: [] }],
        rounds: [{ round_id: "r-a", id: "r-a", date: "2026-11-02", valid_card: true, gross: 80, net: 74, is_9_holes: false, differential_computed: 4, course_key: "a1", course: "Principal", course_label: "Principal", club_name: "Club A", tournament: "TEST-ONLY", holes: [[1, 4, 4]] }],
      });
      if (url.pathname === "/api/gps/courses") return json({ courses: [{ course_id: "200-principal", club_code: "200", club_name: "Club B", course: "Principal", course_label: "Principal" }] });
      if (url.pathname === "/api/gps/courses/200-principal") return json({ course: { holes: [{ hole: 1, tee: { lat: -38, lng: -57 }, green: { center: { lat: -38.001, lng: -57.001 } } }] } });
      if (url.pathname === "/api/reconstructions" && req.method === "GET") return json({ rounds: [{ id: "r-a", date: "2026-11-02", course: "Principal", club_name: "Club A", club_code: "118" }], reconstructions: [] });
      if (req.method === "POST") return json({ live_round: { id: "should-not-create" } }, 201);
      return json({});
    }
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
    await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true });
    await page.setRequestInterception(true);
    page.on("request", req => {
      const host = new URL(req.url()).hostname;
      if (host !== "127.0.0.1" && host !== "localhost") req.abort();
      else req.continue();
    });
    await page.goto(`http://127.0.0.1:${port}/#/ronda/r-a`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#round-track");
    await page.click("#round-track");
    await page.waitForSelector("#rc-course");
    await page.waitForFunction(() => (document.querySelector("#rc-err")?.textContent || "").includes("Elegí la cancha"));
    assert.equal(await page.$("#rc-map"), null);
    assert.equal(calls.some(c => c.path === "/api/gps/courses/200-principal"), false);
    assert.equal(calls.some(c => c.method === "POST"), false);
  } finally {
    await browser.close();
    await new Promise<void>(r => server.close(() => r()));
  }
});
