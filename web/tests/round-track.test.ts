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

/** Reservation refresh on focus is not a reconstruction, round, or stat write. */
function cardWrites(calls: { method: string; path: string }[]) {
  return calls.filter(c => c.method !== "GET" && c.method !== "HEAD" && !(c.method === "POST" && c.path === "/api/tee-times/check"));
}

function untilReady(page: { waitForFunction: (fn: () => boolean, opts?: { timeout?: number }) => Promise<unknown> }) {
  return page.waitForFunction(() => document.querySelector("#tkmap")?.getAttribute("data-map") === "ready", { timeout: 25000 });
}

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
  const calls: { method: string; path: string; body?: string }[] = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (body: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname.startsWith("/api/")) {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      calls.push({ method: req.method || "GET", path: url.pathname, body: raw });
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
      if (url.pathname === "/api/reconstructions" && req.method === "POST") return json({ live_round: { id: "live-new" } }, 201);
      if (url.pathname === "/api/reconstructions/live-new/shots" && req.method === "POST") {
        const posted = JSON.parse(raw || "{}");
        return json({ shots: [{ id: "s-new", hole: 1, club: posted.club || null, position_label: "Marcado a mano", distance_label: "Distancia estimada", distance_m: 12, penalty_strokes: 0, lat: posted.lat ?? null, lng: posted.lng ?? null, end_lat: posted.end_lat ?? null, end_lng: posted.end_lng ?? null }] });
      }
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
    await page.evaluateOnNewDocument(() => {
      const mark = () => { (window as unknown as { __gps: number }).__gps = ((window as unknown as { __gps?: number }).__gps || 0) + 1; };
      const geo = navigator.geolocation;
      if (!geo) return;
      geo.watchPosition = () => { mark(); return 1; };
      geo.getCurrentPosition = () => { mark(); };
    });
    await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true });
    await page.setRequestInterception(true);
    page.on("request", req => {
      const host = new URL(req.url()).hostname;
      if (host !== "127.0.0.1" && host !== "localhost" && host !== "server.arcgisonline.com") req.abort();
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
    await page.evaluate(() => { (window as unknown as { __gps: number }).__gps = 0; });
    await page.click("#round-track");
    await page.waitForSelector("#play-set");
    await page.waitForSelector("#play-cancel");
    await page.waitForSelector("#play-reticle");
    assert.equal(await page.$("#play-hit"), null);
    assert.equal(await page.$("#play-more"), null);
    const layout = await page.evaluate(() => {
      const map = document.querySelector("#tkmap");
      const set = document.querySelector("#play-set");
      const ret = document.querySelector("#play-reticle");
      const bar = document.querySelector("#tabbar");
      const mr = map?.getBoundingClientRect();
      const rr = ret?.getBoundingClientRect();
      const sr = set?.getBoundingClientRect();
      const text = document.body.innerText || "";
      return {
        mapW: mr?.width || 0, mapH: mr?.height || 0, vw: innerWidth, vh: innerHeight,
        retX: rr ? rr.left + rr.width / 2 : -1, retY: rr ? rr.top + rr.height / 2 : -1,
        setBottom: sr?.bottom || 0,
        barDisplay: bar ? getComputedStyle(bar).display : "",
        prompt: document.querySelector("#tkro")?.textContent || "",
        promptH: document.querySelector("#tkro")?.getBoundingClientRect().height || 0,
        holeChip: document.querySelector("#tk-hole b")?.textContent || "",
        frame: document.querySelector("#tkmap")?.getAttribute("data-frame") || "",
        aimLat: document.querySelector("#tkmap")?.getAttribute("data-aim-lat") || "",
        tileZ: Number(document.querySelector("#tkmap")?.getAttribute("data-tile-z") || 0),
        salida: text.includes("Salida en la mira"),
        caida: text.includes("Caída en la mira"),
        borrar: text.includes("Borrar puntos"),
        essay: text.includes("La mira queda fija"),
        hole: document.querySelector(".tk-hn b")?.textContent || "",
        cancel: (document.querySelector("#play-cancel")?.textContent || "").trim(),
        rcMap: document.documentElement.classList.contains("rc-map"),
      };
    });
    assert.equal(layout.rcMap, true);
    assert.equal(layout.barDisplay, "none");
    assert.ok(layout.mapW >= layout.vw - 2, `map width ${layout.mapW}`);
    assert.ok(layout.mapH >= layout.vh - 2, `map height ${layout.mapH}`);
    assert.ok(Math.abs(layout.retX - layout.vw / 2) < 16, `reticle x ${layout.retX}`);
    assert.ok(Math.abs(layout.retY - layout.vh * 0.42) < 20, `reticle y ${layout.retY}`);
    assert.ok(layout.setBottom <= layout.vh - 8, `set bottom ${layout.setBottom}`);
    assert.equal(layout.salida, false);
    assert.equal(layout.caida, false);
    assert.equal(layout.borrar, false);
    assert.equal(layout.essay, false);
    assert.equal(layout.hole, "");
    assert.equal(layout.holeChip, "Hoyo 1");
    assert.equal(layout.frame, "overview");
    assert.equal(layout.aimLat.startsWith("-34.601"), true);
    assert.ok(layout.tileZ >= 15 && layout.tileZ <= 17, `tile ${layout.tileZ}`);
    assert.equal(layout.prompt, "");
    assert.equal(layout.cancel, "Cancelar");
    assert.match(await page.evaluate(() => location.hash), /ronda=r-nov/);
    assert.deepEqual(cardWrites(calls), []);
    assert.equal(calls.some(c => c.method === "GET" && c.path === "/api/gps/courses/course-fixture"), true);
    assert.equal(calls.some(c => c.path === "/api/weather/now"), false);
    assert.equal(calls.some(c => c.path.startsWith("/api/live-rounds")), false);
    assert.equal(await page.evaluate(() => (window as unknown as { __gps?: number }).__gps || 0), 0);
    const beforePan = await page.$eval("#tkmap", el => el.getAttribute("data-cx"));
    const beforeZoom = await page.$eval("#tkmap", el => Number(el.getAttribute("data-z")));
    await page.mouse.move(200, 280);
    await page.mouse.down();
    await page.mouse.move(80, 280, { steps: 8 });
    await page.mouse.up();
    const afterPan = await page.$eval("#tkmap", el => el.getAttribute("data-cx"));
    assert.notEqual(afterPan, beforePan);
    await page.click("#play-zoom-out");
    const afterZoom = await page.$eval("#tkmap", el => Number(el.getAttribute("data-z")));
    assert.ok(afterZoom < beforeZoom);
    assert.ok(Number(await page.$eval("#tkmap", el => el.getAttribute("data-tile-z"))) <= 17);
    assert.deepEqual(cardWrites(calls), []);
    await page.screenshot({ path: join(ART, "track-map.png") });
    await untilReady(page);
    await page.click("#play-set");
    await page.waitForFunction(() => document.querySelector("#tkmap")?.getAttribute("data-frame") === "tee");
    assert.match(await page.$eval("#tkro", el => el.textContent || ""), /salida/);
    assert.ok((await page.$eval("#tkro", el => el.getBoundingClientRect().height)) < 40);
    assert.deepEqual(cardWrites(calls), []);
    await untilReady(page);
    await page.click("#play-set");
    await page.waitForFunction(() => (document.querySelector("#tkro")?.textContent || "").includes("el hoyo"));
    assert.match(await page.$eval("#tkro", el => el.textContent || ""), /yd/);
    assert.notEqual(await page.$("#play-cancel"), null);
    assert.deepEqual(cardWrites(calls), []);
    await page.click("#play-cancel");
    await page.waitForSelector("#play-hit");
    await page.waitForSelector("#play-club");
    await page.waitForSelector("#play-penalty");
    assert.equal(await page.$("#play-set"), null);
    assert.equal(await page.$("#play-more"), null);
    assert.equal(await page.$eval(".tk-hn b", el => el.textContent), "Hoyo 1");
    assert.deepEqual(cardWrites(calls), []);
    await page.select("#play-club", "7i");
    await untilReady(page);
    await page.click("#play-hit");
    await page.waitForFunction(() => location.hash.startsWith("#/reconstruir/live-new?hole=1"));
    await page.waitForSelector(".tk-shot-n");
    const writes = cardWrites(calls).map(c => `${c.method} ${c.path}`);
    assert.deepEqual(writes, ["POST /api/reconstructions", "POST /api/reconstructions/live-new/shots"]);
    const shot = JSON.parse(calls.find(c => c.path === "/api/reconstructions/live-new/shots")?.body || "{}");
    assert.equal(typeof shot.lat, "number");
    assert.equal(typeof shot.end_lat, "number");
    assert.equal("accuracy_m" in shot, false);
    assert.equal(shot.penalty_strokes, 0);
    assert.equal(shot.club, "7i");
    await page.waitForSelector("#play-undo");
    assert.match(await page.$eval("#rc-shots", el => el.textContent || ""), /1\.\s*Hierro 7/);
    assert.deepEqual(await page.$$eval(".tk-shot-n", nodes => nodes.map(node => node.textContent)), ["1"]);
    assert.notEqual(await page.$(".tk-sh"), null);
    assert.equal((await page.evaluate(() => document.body.innerText)).includes("SG"), false);
    await page.click("#rc-close");
    await page.waitForSelector("#round-track");
    assert.equal(await page.evaluate(() => location.hash), "#/ronda/r-nov");
    assert.notEqual(await page.$eval("#tabbar", el => getComputedStyle(el).display), "none");
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains("rc-map")), false);
    const savedAt = calls.length;
    await page.goto(`http://127.0.0.1:${port}/#/ronda/r-saved`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#round-track");
    await page.click("#round-track");
    await page.waitForFunction(() => location.hash === "#/reconstruir/live-saved?hole=1&ronda=r-saved");
    await page.waitForSelector("#play-club");
    await page.waitForSelector("#play-hit");
    await page.waitForFunction(() => (document.querySelector("#rc-shots")?.textContent || "").includes("Hierro 7"));
    assert.equal(await page.$("#play-more"), null);
    assert.equal(await page.$("#play-set"), null);
    assert.equal(await page.$("#qstat"), null);
    assert.notEqual(await page.$("#play-club"), null);
    assert.deepEqual(await page.$$eval(".tk-shot-n", nodes => nodes.map(node => node.textContent)), []);
    assert.deepEqual(cardWrites(calls.slice(savedAt)), []);
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
      if (host !== "127.0.0.1" && host !== "localhost" && host !== "server.arcgisonline.com") req.abort();
      else req.continue();
    });
    await page.goto(`http://127.0.0.1:${port}/#/ronda/r-a`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#round-track");
    await page.click("#round-track");
    await page.waitForSelector("#rc-course");
    await page.waitForFunction(() => (document.querySelector("#rc-err")?.textContent || "").includes("Elegí la cancha"));
    assert.equal(await page.$("#rc-map"), null);
    assert.equal(await page.$("#play-track"), null);
    assert.equal(await page.$("#tkmap"), null);
    assert.equal(calls.some(c => c.path === "/api/gps/courses/200-principal"), false);
    assert.deepEqual(cardWrites(calls), []);
    assert.equal(calls.some(c => c.method === "POST" && c.path === "/api/reconstructions"), false);
    assert.equal(calls.some(c => c.method !== "GET" && c.path.startsWith("/api/rounds")), false);
  } finally {
    await browser.close();
    await new Promise<void>(r => server.close(() => r()));
  }
});

test("a late reconstruction reply does not navigate or post the shot after the player left", { timeout: 90_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const calls: { method: string; path: string }[] = [];
  const queued: Array<() => void> = [];
  let holdCreates = 0;
  const creates = () => calls.filter(c => c.method === "POST" && c.path === "/api/reconstructions");
  const shotPosts = () => calls.filter(c => c.method === "POST" && /\/shots$/.test(c.path));
  const until = async (pred: () => boolean, label: string) => {
    const start = Date.now();
    while (!pred()) {
      if (Date.now() - start > 8_000) throw new Error(label);
      await new Promise(r => setTimeout(r, 40));
    }
  };
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
      if (url.pathname === "/api/reconstructions" && req.method === "POST") {
        const id = `live-held-${creates().length}`;
        if (holdCreates > 0) {
          holdCreates -= 1;
          await new Promise<void>(resolve => queued.push(resolve));
        }
        return json({ live_round: { id } }, 201);
      }
      if (req.method === "POST" && /\/shots$/.test(url.pathname)) return json({ shots: [{ id: "s-held", hole: 1, club: "7i", distance_m: 12, penalty_strokes: 0 }] });
      if (url.pathname === "/api/reconstructions/live-saved/shots" && req.method === "GET") return json({ shots: [] });
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
  const release = () => {
    const done = queued.shift();
    if (!done) throw new Error("no reconstruction reply is waiting");
    done();
  };
  const releaseLast = () => {
    const done = queued.pop();
    if (!done) throw new Error("no reconstruction reply is waiting");
    done();
  };
  const settle = () => new Promise(r => setTimeout(r, 500));
  const reachEnter = async (page: { click: (s: string) => Promise<unknown>; waitForSelector: (s: string) => Promise<unknown>; waitForFunction: (fn: () => boolean) => Promise<unknown> }) => {
    await page.waitForSelector("#round-track");
    await page.click("#round-track");
    await page.waitForSelector("#play-cancel");
    await page.click("#play-cancel");
    await page.waitForFunction(() => (document.querySelector("#tkro")?.textContent || "").includes("el hoyo"));
    await page.click("#play-cancel");
    await page.waitForSelector("#play-hit");
  };
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true });
    await page.setRequestInterception(true);
    page.on("request", req => {
      const host = new URL(req.url()).hostname;
      if (host !== "127.0.0.1" && host !== "localhost" && host !== "server.arcgisonline.com") req.abort();
      else req.continue();
    });
    await page.goto(`http://127.0.0.1:${port}/#/ronda/r-nov`, { waitUntil: "networkidle0" });
    await reachEnter(page);
    holdCreates = 1;
    await untilReady(page);
    await page.click("#play-hit");
    await until(() => creates().length === 1, "the create request did not start");
    await page.evaluate(() => { location.hash = "#/inicio"; });
    await page.waitForFunction(() => location.hash === "#/inicio");
    release();
    await settle();
    assert.equal(await page.evaluate(() => location.hash), "#/inicio");
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains("rc-map")), false);
    assert.equal(shotPosts().length, 0);

    await page.goto(`http://127.0.0.1:${port}/#/ronda/r-nov`, { waitUntil: "networkidle0" });
    await reachEnter(page);
    holdCreates = 2;
    await untilReady(page);
    await page.click("#play-hit");
    await until(() => creates().length === 2, "the first of the two creates did not start");
    await page.click("#rc-close");
    await page.waitForFunction(() => location.hash === "#/ronda/r-nov");
    await reachEnter(page);
    await untilReady(page);
    await page.click("#play-hit");
    await until(() => creates().length === 3, "the re-entered create did not start");
    release();
    await settle();
    assert.equal(shotPosts().length, 0);
    assert.equal(await page.evaluate(() => location.hash.includes("live-held")), false);
    assert.match(await page.evaluate(() => location.hash), /ronda=r-nov/);
    release();
    await page.waitForFunction(() => /#\/reconstruir\/live-held-\d+/.test(location.hash));
    await until(() => shotPosts().length === 1, "the live visit did not post its shot");

    await page.goto(`http://127.0.0.1:${port}/#/ronda/r-nov`, { waitUntil: "networkidle0" });
    await reachEnter(page);
    holdCreates = 1;
    await untilReady(page);
    await page.click("#play-hit");
    await until(() => creates().length === 4, "the new-round create did not start");
    await page.evaluate(() => { location.hash = "#/ronda/r-saved"; });
    await page.waitForFunction(() => location.hash === "#/ronda/r-saved");
    release();
    await settle();
    assert.equal(await page.evaluate(() => location.hash), "#/ronda/r-saved");
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains("rc-map")), false);
    assert.equal(shotPosts().length, 1);
    assert.equal(creates().length, 4);

    await page.goto(`http://127.0.0.1:${port}/#/ronda/r-nov`, { waitUntil: "networkidle0" });
    await reachEnter(page);
    holdCreates = 2;
    await untilReady(page);
    await page.click("#play-hit");
    await until(() => creates().length === 5, "the older create did not start");
    await page.click("#rc-close");
    await page.waitForFunction(() => location.hash === "#/ronda/r-nov");
    await reachEnter(page);
    await untilReady(page);
    await page.click("#play-hit");
    await until(() => creates().length === 6, "the newer create did not start");
    releaseLast();
    await page.waitForFunction(() => /#\/reconstruir\/live-held-\d+/.test(location.hash));
    await until(() => shotPosts().length === 2, "the newer visit did not post its shot");
    const kept = await page.evaluate(() => location.hash);
    release();
    await settle();
    assert.equal(await page.evaluate(() => location.hash), kept);
    assert.equal(shotPosts().length, 2);

    await page.goto(`http://127.0.0.1:${port}/#/ronda/r-nov`, { waitUntil: "networkidle0" });
    await reachEnter(page);
    holdCreates = 1;
    await untilReady(page);
    await page.click("#play-hit");
    await until(() => creates().length === 7, "the logout create did not start");
    await page.evaluate(() => { location.replace("/login"); });
    await page.waitForFunction(() => location.pathname === "/login");
    release();
    await settle();
    assert.equal(await page.evaluate(() => location.pathname), "/login");
    assert.equal(shotPosts().length, 2);
  } finally {
    while (queued.length) queued.shift()?.();
    await browser.close();
    await new Promise<void>(r => server.close(() => r()));
  }
});

test("a stored shot with no point stays unknown and the next shot does not start at 0,0", { timeout: 60_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const calls: { method: string; path: string }[] = [];
  const shots = [
    { id: "u1", hole: 1, club: "7i", lat: null, lng: null, end_lat: null, end_lng: null, distance_m: null, position_label: "Sin ubicación", distance_label: "Sin distancia" },
    { id: "u2", hole: 1, club: "PW", lat: "", lng: "", end_lat: "", end_lng: "  ", distance_m: "", position_label: "Sin ubicación", distance_label: "Sin distancia" },
    { id: "u3", hole: 1, club: "SW", lat: null, lng: -58.401, end_lat: null, end_lng: -58.401, distance_m: null, position_label: "Sin ubicación", distance_label: "Sin distancia" },
    { id: "u0", hole: 1, club: "GW", lat: "0", lng: "0", end_lat: "0", end_lng: "0", distance_m: null, position_label: "Sin ubicación", distance_label: "Sin distancia" },
    { id: "u4", hole: 1, club: "9i", lat: -34.6, lng: -58.4, end_lat: -34.601, end_lng: -58.401, distance_m: null, position_label: "Marcado a mano", distance_label: "Sin distancia" },
  ];
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
          rounds: [{ id: "r-saved", date: "2026-10-01", course: "Cancha Fixture", club_name: "Club Fixture", club_code: "fx" }],
          reconstructions: [{ id: "live-saved", date: "2026-10-01", course: "Cancha Fixture", club_code: "fx", vm_course: "Cancha Fixture", round_id: "r-saved" }],
        });
      }
      if (url.pathname === "/api/reconstructions/live-saved/shots" && req.method === "GET") return json({ shots });
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
      if (host !== "127.0.0.1" && host !== "localhost" && host !== "server.arcgisonline.com") req.abort();
      else req.continue();
    });
    await page.goto(`http://127.0.0.1:${port}/#/ronda/r-saved`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#round-track");
    await page.click("#round-track");
    await page.waitForSelector("#rc-shots");
    const seen = await page.evaluate(() => {
      const map = document.querySelector("#tkmap");
      return {
        rail: document.querySelector("#rc-shots")?.textContent || "",
        read: document.querySelector("#tkro")?.textContent || "",
        ballLat: map?.getAttribute("data-ball-lat") || "",
        ballLng: map?.getAttribute("data-ball-lng") || "",
        script: [...document.scripts].some(s => (s.src || "").includes("/track.js")),
      };
    });
    assert.equal(seen.script, true);
    assert.match(seen.rail, /Hierro 7 · Sin ubicación/);
    assert.match(seen.rail, /PW · Sin ubicación/);
    assert.match(seen.rail, /SW · Sin ubicación/);
    assert.match(seen.rail, /GW · Sin ubicación/);
    assert.match(seen.rail, /9i|Hierro 9/);
    assert.equal(/\d{6,}/.test(seen.rail + seen.read), false);
    assert.equal(seen.rail.includes("7837291"), false);
    assert.equal(seen.ballLat, "-34.601");
    assert.equal(seen.ballLng, "-58.401");
    const marks = await page.$$eval(".tk-shot-mark", nodes => nodes.map(node => ({
      n: node.getAttribute("data-n"),
      lat: node.getAttribute("data-lat"),
      lng: node.getAttribute("data-lng"),
      label: node.querySelector(".tk-shot-n")?.textContent || "",
    })));
    assert.deepEqual(marks, [{ n: "5", lat: "-34.601", lng: "-58.401", label: "5" }]);
    assert.equal(marks.some(m => m.lat === "0" && m.lng === "0"), false);
    assert.deepEqual(cardWrites(calls), []);
  } finally {
    await browser.close();
    await new Promise<void>(r => server.close(() => r()));
  }
});

test("each ENTER drops the next numbered dot and undo takes that dot off the map", { timeout: 60_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const calls: { method: string; path: string }[] = [];
  const shots: { id: string; hole: number; club: string | null; lat: number | null; lng: number | null; end_lat: number | null; end_lng: number | null; distance_m: number }[] = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (body: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname.startsWith("/api/")) {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      calls.push({ method: req.method || "GET", path: url.pathname });
      if (url.pathname === "/api/data") return json(data);
      if (url.pathname === "/api/gps/courses") return json({ courses: [{ course_id: "course-fixture", club_name: "Club Fixture", course: "Cancha Fixture", label: "Cancha Fixture" }] });
      if (url.pathname === "/api/gps/courses/course-fixture" || url.pathname === "/api/gps/courses/fx-cancha-fixture") {
        return json({ course: { holes: [{ hole: 1, tee: { lat: -34.6, lng: -58.4 }, green: { center: { lat: -34.601, lng: -58.401 } } }] } });
      }
      if (url.pathname === "/api/reconstructions" && req.method === "GET") {
        return json({ rounds: [{ id: "r-nov", date: "2026-11-02", course: "Cancha Fixture", club_name: "Club Fixture", club_code: "fx" }], reconstructions: [] });
      }
      if (url.pathname === "/api/reconstructions" && req.method === "POST") return json({ live_round: { id: "live-new" } }, 201);
      if (url.pathname === "/api/reconstructions/live-new/shots" && req.method === "POST") {
        const posted = JSON.parse(raw || "{}");
        shots.push({ id: `s${shots.length + 1}`, hole: 1, club: posted.club || null, lat: posted.lat ?? null, lng: posted.lng ?? null, end_lat: posted.end_lat ?? null, end_lng: posted.end_lng ?? null, distance_m: 12 });
        return json({ shots });
      }
      if (url.pathname === "/api/reconstructions/live-new/shots" && req.method === "DELETE") { shots.pop(); return json({}); }
      if (url.pathname === "/api/reconstructions/live-new/shots" && req.method === "GET") return json({ shots });
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
  const page = await browser.newPage();
  const labels = () => page.$$eval(".tk-shot-n", nodes => nodes.map(node => node.textContent));
  const place = async () => page.evaluate(() => {
    const svg = document.querySelector(".tk-svg");
    const line = document.querySelector(".tk-sh");
    const box = (svg as SVGSVGElement).viewBox.baseVal;
    const pts = (line?.getAttribute("points") || "").trim().split(/\s+/).filter(Boolean).map(p => p.split(",").map(Number));
    const last = pts[pts.length - 1] || [NaN, NaN];
    return {
      dots: [...document.querySelectorAll(".tk-shot-mark")].map(node => ({
        n: node.getAttribute("data-n"),
        lat: node.getAttribute("data-lat"),
        lng: node.getAttribute("data-lng"),
        cx: Number(node.querySelector("circle")?.getAttribute("cx")),
        cy: Number(node.querySelector("circle")?.getAttribute("cy")),
      })),
      lastX: last[0], lastY: last[1], midX: box.width / 2, midY: box.height * 0.42,
      controls: {
        undo: !!document.querySelector("#play-undo"),
        club: !!document.querySelector("#play-club"),
        penalty: !!document.querySelector("#play-penalty"),
        enter: !!document.querySelector("#play-hit"),
        more: !!document.querySelector("#play-more"),
        next: !!document.querySelector("#play-next"),
      },
    };
  });
  try {
    await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true });
    await page.setRequestInterception(true);
    page.on("request", req => {
      const host = new URL(req.url()).hostname;
      if (host !== "127.0.0.1" && host !== "localhost" && host !== "server.arcgisonline.com") req.abort();
      else req.continue();
    });
    await page.goto(`http://127.0.0.1:${port}/#/ronda/r-nov`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#round-track");
    await page.click("#round-track");
    await page.waitForSelector("#play-cancel");
    await page.click("#play-cancel");
    await page.waitForFunction(() => (document.querySelector("#tkro")?.textContent || "").includes("el hoyo"));
    await page.click("#play-cancel");
    await page.waitForSelector("#play-hit");
    await untilReady(page);
    await page.click("#play-hit");
    await page.waitForSelector(".tk-shot-n");
    assert.deepEqual(await labels(), ["1"]);
    const dropped = await place();
    assert.equal(dropped.dots.length, 1);
    assert.equal(dropped.controls.undo, true);
    assert.equal(dropped.controls.club, true);
    assert.equal(dropped.controls.penalty, true);
    assert.equal(dropped.controls.enter, true);
    assert.equal(dropped.controls.more, false);
    assert.equal(dropped.controls.next, false);
    const first = dropped.dots[0];
    await page.mouse.move(200, 320);
    await page.mouse.down();
    await page.mouse.move(40, 360, { steps: 8 });
    await page.mouse.up();
    const panned = await place();
    assert.notEqual(panned.dots[0].cx, first.cx);
    assert.ok(Math.hypot(panned.lastX - panned.midX, panned.lastY - panned.midY) < 3);
    assert.ok(Math.hypot(panned.dots[0].cx - panned.midX, panned.dots[0].cy - panned.midY) > 20);
    await page.click("#play-zoom-out");
    const zoomed = await place();
    assert.notEqual(zoomed.dots[0].cx, panned.dots[0].cx);
    assert.equal(zoomed.dots[0].lat, first.lat);
    assert.equal(zoomed.dots[0].lng, first.lng);
    await untilReady(page);
    await page.click("#play-hit");
    await page.waitForFunction(() => document.querySelectorAll(".tk-shot-n").length === 2);
    const both = await place();
    assert.deepEqual(await labels(), ["1", "2"]);
    assert.notEqual(both.dots[0].cx, both.dots[1].cx);
    assert.equal(both.dots[0].lat, first.lat);
    assert.equal((await page.evaluate(() => document.body.innerText)).includes("SG"), false);
    await page.click("#play-undo");
    await page.waitForFunction(() => document.querySelectorAll(".tk-shot-n").length === 1);
    const left = await place();
    assert.deepEqual(await labels(), ["1"]);
    assert.equal(left.dots[0].lat, first.lat);
    assert.equal(left.dots[0].lng, first.lng);
    assert.equal(shots.length, 1);
  } finally {
    await browser.close();
    await new Promise<void>(r => server.close(() => r()));
  }
});
