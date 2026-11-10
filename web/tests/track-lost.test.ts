/** TEST-ONLY. Lost ball plus the provisional, then the next shot from where it finished. */
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { countsForClub, type ShotOut } from "../lib/shots-calc";

const CHROME = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find(p => existsSync(p));
const ROOT = new URL("../public/", import.meta.url);
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".png": "image/png" };
const GREEN = { lat: -38.03381176, lng: -57.53818687 };
const TEE = { lat: -38.037468, lng: -57.538187 };
const vieja = [{ hole: 1, par: 4, hcp: 3, yards: 445, tee: TEE, green: { front: { lat: -38.03369214, lng: -57.5382432 }, center: GREEN, back: { lat: -38.03392117, lng: -57.53812785 } } }];

test("pelota perdida con provisional, el cuarto golpe y deshacer", { timeout: 120_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const posts: Record<string, unknown>[] = [];
  const shots: Record<string, unknown>[] = [];
  const deleted: string[] = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (body: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname.startsWith("/api/")) {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      if (url.pathname === "/api/data") return json({ user: { name: "TEST-ONLY", pending_first_sync: false }, player: { name: "TEST-ONLY" }, hi_history: [], clubs: [], courses: [], rounds: [], bag: [{ club: "Driver", carry: 250, total: 260 }] });
      if (url.pathname === "/api/bag") return json([{ club: "Driver", carry: 250, total: 260 }]);
      if (url.pathname === "/api/club-stats") return json({ clubs: [{ club: "Dr", label: "Driver", tee_shots: { n: 6, avg_yd: 241 } }] });
      if (url.pathname === "/api/reconstructions" && req.method === "GET") return json({ rounds: [], reconstructions: [{ id: "live-vieja", current_hole: 1, club_code: "209", vm_course: "Cancha Vieja", course: "Cancha Vieja", round_id: null }] });
      if (url.pathname === "/api/gps/courses/209-cancha-vieja") return json({ course: { club_code: "209", course: "Cancha Vieja", holes: vieja } });
      if (url.pathname.endsWith("/shots") && req.method === "POST") {
        const posted = JSON.parse(raw || "{}") as Record<string, unknown>;
        posts.push(posted);
        shots.push({ id: `s${shots.length + 1}`, shot_number: shots.length + 1, ...posted });
        return json({ shots });
      }
      if (url.pathname.endsWith("/shots") && req.method === "DELETE") {
        const id = url.searchParams.get("shot") || "";
        deleted.push(id);
        const i = shots.findIndex(s => s.id === id);
        if (i >= 0) shots.splice(i, 1);
        return json({ ok: true });
      }
      if (url.pathname.endsWith("/shots")) return json({ shots });
      if (url.pathname === "/api/rounds/r-none/weather") return json({ weather: null, source: null });
      if (url.pathname === "/api/rounds/r-wind/weather") return json({ source: "open-meteo-archive", weather: { wind_kmh: 18, temp_c: 21, precip_mm: 1.2, condition: "lluvia", gust_kmh: 28 } });
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
  const ready = (page: { waitForFunction: (fn: () => boolean, opts?: { timeout?: number }) => Promise<unknown> }) => page.waitForFunction(() => {
    const hit = document.querySelector("#play-hit") as HTMLButtonElement | null;
    const map = document.querySelector("#tkmap");
    return !!hit && !hit.disabled && map?.getAttribute("data-moving") === "0" && map?.getAttribute("data-map") === "ready";
  }, { timeout: 25000 });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await page.setRequestInterception(true);
    page.on("request", req => {
      const host = new URL(req.url()).hostname;
      if (host !== "127.0.0.1" && host !== "localhost" && host !== "server.arcgisonline.com") req.abort();
      else req.continue();
    });
    mkdirSync("/opt/cursor/artifacts", { recursive: true });
    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-vieja?hole=1`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#play-club");
    await ready(page);
    const hidden = await page.$eval("#play-club", el => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return { w: box.width, h: box.height, opacity: style.opacity };
    });
    assert.ok(hidden.w <= 1 && hidden.h <= 1 && hidden.opacity === "0");
    await page.click("#play-club-tile");
    await page.waitForSelector("#play-club-list:not([hidden])");
    const sheet = await page.$eval("#play-club-sheet", el => getComputedStyle(el).display);
    assert.notEqual(sheet, "none");
    await page.screenshot({ path: "/opt/cursor/artifacts/palos-390.png" });
    await page.click("#play-club-close");
    await page.mouse.move(195, 340);
    await page.mouse.down();
    await page.mouse.move(195, 420, { steps: 4 });
    await page.mouse.up();
    await ready(page);
    await page.$eval("#play-lost-prov", el => (el as HTMLButtonElement).click());
    await page.waitForFunction(() => document.querySelectorAll("#rc-shots button").length === 3, { timeout: 15000 });
    assert.equal(posts.length, 3);
    assert.equal(posts[0].result, "lost");
    assert.equal(posts[0].distance_m, null);
    assert.equal(posts[1].result, "penalty");
    assert.equal(posts[1].distance_m, null);
    assert.equal(posts[2].result, null);
    assert.equal(typeof posts[2].distance_m, "number");
    assert.equal(countsForClub({ source: "gps", club: "Dr", distance_m: 220, distance_kind: "measured", result: "lost", accuracy_m: 4 } as ShotOut), false);
    const rail = await page.$$eval("#rc-shots button", els => els.map(el => el.textContent || ""));
    assert.match(rail[0], /^1\. perdida/);
    assert.equal(rail[0].includes("yd"), false);
    assert.match(rail[1], /^2\. Penalidad/);
    assert.match(rail[2], /^3\./);
    await page.screenshot({ path: "/opt/cursor/artifacts/perdida-390.png" });
    await ready(page);
    await page.click("#play-hit");
    await page.waitForFunction(() => document.querySelectorAll("#rc-shots button").length === 4, { timeout: 15000 });
    const fourth = posts[3];
    assert.equal(Number(fourth.lat), Number(posts[2].end_lat));
    assert.equal(Number(fourth.lng), Number(posts[2].end_lng));
    await page.waitForSelector("#play-undo");
    await page.click("#play-undo");
    await page.waitForFunction(() => document.querySelectorAll("#rc-shots button").length === 3, { timeout: 15000 });
    assert.deepEqual(deleted, ["s4"]);
    await page.click("#play-undo");
    await page.waitForFunction(() => document.querySelector("#rc-shots") == null, { timeout: 15000 });
    assert.deepEqual(deleted.slice().sort(), ["s1", "s2", "s3", "s4"]);

    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-vieja?hole=1&ronda=r-none`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (document.querySelector(".tk-chip")?.textContent || "").includes("Clima no disponible"), { timeout: 15000 });
    await page.screenshot({ path: "/opt/cursor/artifacts/clima-sin-datos-390.png" });
    await page.evaluate(() => { location.hash = "#/reconstruir/live-vieja?hole=1&ronda=r-wind"; });
    await page.waitForFunction(() => {
      const text = document.querySelector(".tk-chip")?.textContent || "";
      return text.includes("18 km/h") && text.includes("21°C") && text.includes("lluvia") && !text.includes("yd a favor");
    }, { timeout: 15000 });
    await page.screenshot({ path: "/opt/cursor/artifacts/viento-sin-direccion-390.png" });
  } finally {
    await browser.close();
    server.close();
  }
});
