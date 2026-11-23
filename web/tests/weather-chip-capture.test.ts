/** 375px: today's track shows the wind chip, and a miss shows a dash with retry. */
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
const TEE = { lat: -34.48596, lng: -58.53235 };
const GREEN = { lat: -34.48306, lng: -58.52882 };
const hole = { hole: 3, par: 4, hcp: 16, yards: { NEGRO: 414, AZUL: 409, BLANCO: 399, AMARILLO: 389 }, tee: TEE, green: { center: GREEN }, line: [TEE, GREEN], tees: [{ center: TEE }] };
const course = { club_code: "118", course: "Azul", course_id: "118-azul", holes: [hole] };

test("el track de hoy muestra el viento y, si no hay datos, un guion", { timeout: 90_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (body: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname.startsWith("/api/")) {
      for await (const chunk of req) void chunk;
      if (url.pathname === "/api/data") return json({ user: { name: "TEST-ONLY", pending_first_sync: false }, player: { name: "TEST-ONLY" }, hi_history: [], clubs: [], courses: [], rounds: [] });
      if (url.pathname === "/api/gps/courses/118-azul") return json({ course });
      if (url.pathname === "/api/course-maps/118/Azul") return json(course);
      if (url.pathname === "/api/reconstructions" && req.method === "GET") return json({ rounds: [], reconstructions: [
        { id: "live-hoy", date: today, current_hole: 3, club_code: "118", vm_course: "Azul", course: "Azul", round_id: "r-hoy" },
        { id: "live-vacio", date: today, current_hole: 3, club_code: "118", vm_course: "Azul", course: "Azul", round_id: null },
      ] });
      if (url.pathname.endsWith("/shots")) return json({ shots: [] });
      if (url.pathname === "/api/weather/now") {
        if (url.searchParams.get("retry") === "1") return json({ kmh: 12.3, from_deg: 241, gust_kmh: 31.3, temp_c: 25.6, precip_mm: 0, source: "Open-Meteo", at: `${today}T18:15`, hhmm: "18:15", stale: false });
        return json({ error: "Open-Meteo y MET Norway no devolvieron viento." }, 502);
      }
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
    await page.setViewport({ width: 375, height: 812, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-vacio?hole=3`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => (document.querySelector("#play-wx")?.textContent || "").trim() === "Clima", { timeout: 20000 });
    await page.click("#play-wx");
    await page.waitForSelector("#play-wx-retry");
    const why = await page.$eval("#play-wx-why", el => el.textContent || "");
    assert.match(why, /Open-Meteo y MET Norway/);
    assert.match(why, /Reintentar/);
    assert.equal((await page.$eval(".tk-hn", el => el.textContent || "")).includes("414"), true);
    await page.screenshot({ path: join(art, "web-375-clima-sin-datos.png") });
    await page.click("#play-wx-retry");
    await page.waitForFunction(() => {
      const text = document.querySelector("#play-wx")?.textContent || "";
      return text.includes("12 km/h") && text.includes("26°C") && text.includes("Open-Meteo") && text.includes("18:15");
    }, { timeout: 15000 });
    const arrow = await page.$eval(".tk-wxarr", el => el.getAttribute("style") || "");
    assert.match(arrow, /rotate\(/);
    await page.screenshot({ path: join(art, "web-375-clima-viento.png") });
  } finally {
    await browser.close();
    server.close();
  }
});
