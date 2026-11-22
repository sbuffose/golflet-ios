/** 375px: the tee selector moves the start, keeps the choice, and never invents a point. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import test from "node:test";

const CHROME = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find(p => existsSync(p));
const ROOT = new URL("../public/", import.meta.url);
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".png": "image/png" };
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
const GREEN = { lat: -34.48306, lng: -58.52882 };
const LONG = { lat: -34.48596, lng: -58.53235 };
const SHORT = { lat: -34.4841, lng: -58.53 };
const LAND = { lat: -34.4835, lng: -58.5293 };
const hole = { hole: 3, par: 4, hcp: 16, yards: { NEGRO: 414, AMARILLO: 320 }, tee: LONG, green: { center: GREEN }, line: [LONG, GREEN], tees: [{ center: LONG }, { center: SHORT }] };
const course = { club_code: "118", course: "Azul", course_id: "118-azul", holes: [hole] };
const shot = { id: "s1", hole: 3, club: "Dr", lat: LONG.lat, lng: LONG.lng, end_lat: LAND.lat, end_lng: LAND.lng, result: null };

function yards(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (d: number) => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round((2 * 6_371_008.8 * Math.asin(Math.min(1, Math.sqrt(h)))) / 0.9144);
}

test("la salida se elige con yardas, se mueve en el mapa y queda guardada por hoyo", { timeout: 90_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (body: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname.startsWith("/api/")) {
      for await (const chunk of req) void chunk;
      if (url.pathname === "/api/data") return json({ user: { name: "TEST-ONLY", pending_first_sync: false }, player: { name: "TEST-ONLY" }, hi_history: [], clubs: [], courses: [], rounds: [] });
      if (url.pathname.startsWith("/api/gps/courses/")) return json({ course });
      if (url.pathname.startsWith("/api/course-maps/")) return json(course);
      if (url.pathname === "/api/reconstructions" && req.method === "GET") return json({ rounds: [], reconstructions: [
        { id: "live-salida", date: today, current_hole: 3, club_code: "118", vm_course: "Azul", course: "Azul", round_id: "r-salida" },
      ] });
      if (url.pathname.endsWith("/shots")) return json({ shots: [shot] });
      if (url.pathname === "/api/weather/now") return json({ error: "Open-Meteo y MET Norway no devolvieron viento." }, 502);
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
  const fromLong = yards(LONG, LAND);
  const fromShort = yards(SHORT, LAND);
  assert.notEqual(fromLong, fromShort);
  try {
    const page = await browser.newPage();
    const origin = `http://127.0.0.1:${port}`;
    await browser.defaultBrowserContext().overridePermissions(origin, ["geolocation"]);
    await page.setGeolocation({ latitude: -34.48455, longitude: -58.5304, accuracy: 6 });
    await page.setViewport({ width: 375, height: 812, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await page.goto(`${origin}/#/reconstruir/live-salida?hole=3`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#play-tee");
    const before = await page.$eval("#play-shot-1", el => el.textContent || "");
    assert.match(before, new RegExp(`${fromLong} yd`));
    assert.match(await page.$eval("#play-tee", el => el.textContent || ""), /414 yd/);
    await page.click("#play-tee");
    await page.waitForSelector("#play-tee-list");
    await page.screenshot({ path: join(art, "web-375-salida-tees.png") });
    await page.click('[data-tee="AMARILLO"]');
    await page.waitForFunction((lat: number) => document.querySelector("#tkmap")?.getAttribute("data-tee-lat") === String(lat), {}, SHORT.lat);
    const after = await page.$eval("#play-shot-1", el => el.textContent || "");
    assert.match(after, new RegExp(`${fromShort} yd`));
    assert.match(await page.$eval("#play-tee", el => el.textContent || ""), /AMARILLO · 320 yd/);
    assert.match(await page.$eval("#tkro", el => el.textContent || ""), /yd al hoyo/);
    const stored = await page.evaluate(() => localStorage.getItem("golflet.salida.live-salida.3"));
    assert.equal(JSON.parse(stored || "{}").name, "AMARILLO");
    assert.equal(JSON.parse(stored || "{}").source, "tee");
    await page.screenshot({ path: join(art, "web-375-salida-amarillo.png") });
    await page.click("#play-move-tee");
    await page.waitForFunction(() => (document.querySelector("#tkro")?.textContent || "").includes("Arrastrá la salida"));
    assert.equal(await page.$eval("#play-tee-gps", el => el.textContent || ""), "Usar mi ubicación");
    await page.screenshot({ path: join(art, "web-375-salida-mover.png") });
    await page.mouse.click(70, 160);
    await page.waitForFunction(() => document.querySelector("#tkmap")?.getAttribute("data-tee-source") === "jugador");
    const tapped = Number(await page.$eval("#tkmap", el => el.getAttribute("data-tee-lat")));
    assert.notEqual(tapped, SHORT.lat);
    await page.click("#play-move-tee");
    await page.click("#play-tee-gps");
    await page.waitForFunction(() => {
      const lat = Number(document.querySelector("#tkmap")?.getAttribute("data-tee-lat"));
      return Math.abs(lat + 34.48455) < 0.00001;
    }, { timeout: 10000 });
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForFunction(() => {
      const lat = Number(document.querySelector("#tkmap")?.getAttribute("data-tee-lat"));
      return Math.abs(lat + 34.48455) < 0.00001;
    });
    assert.match(await page.$eval("#play-shot-1", el => el.textContent || ""), /\d+ yd/);
    const kept = JSON.parse(await page.evaluate(() => localStorage.getItem("golflet.salida.live-salida.3") || "{}"));
    assert.equal(kept.source, "jugador");
    assert.ok(Math.abs(kept.lat + 34.48455) < 0.00001);
  } finally {
    await browser.close();
    server.close();
  }
});
