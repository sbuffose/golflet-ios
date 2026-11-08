/** TEST-ONLY. Hole wind on a booked tee time uses that hour and this course. */
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
const ART = join(tmpdir(), "golflet-tee-wind");

test("the tee page shows this course at the booked hour, between the match button and the handicap", { timeout: 60_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const calls: { method: string; path: string; search: string }[] = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (body: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname.startsWith("/api/")) {
      for await (const chunk of req) void chunk;
      calls.push({ method: req.method || "GET", path: url.pathname, search: url.search });
      if (url.pathname === "/api/data") return json({ user: { name: "TEST-ONLY", pending_first_sync: false }, player: { handicap_index: 8 }, clubs: [], courses: [], rounds: [], bag: [] });
      if (url.pathname === "/api/tee-times/t-mdp") {
        return json({
          tee_time: {
            id: "t-mdp", date: "2026-11-08", time: "09:00", starts_at: "2026-11-08T09:00:00-03:00",
            club_name: "Mar del Plata Golf Club", course_label: "Cancha Vieja", start_hole: 1,
            modality: "Medal", companions: [],
          },
          tees: [{ tee: "Caballeros", gender: "C", playing_handicap: 12, selected: true, course_rating: 72.1, slope: 131, strokes_by_hole: [], estimated: false }],
          modalities: [{ key: "18", label: "18 hoyos" }],
          modality: "18", modality_label: "18 hoyos", source: "club", hi: 8,
        });
      }
      if (url.pathname === "/api/weather/forecast") {
        return json({
          hours: [{ at: "2026-11-08T09:00", temp_c: 16, rain_mm: 0, wind_kmh: 18, wind_from_deg: 180, wind_from: "sur" }],
          source: "Open-Meteo",
        });
      }
      if (url.pathname === "/api/gps/courses") {
        return json({ courses: [
          { course_id: "209-vieja", course_key: "7:Cancha Vieja", club_name: "Mar del Plata Golf Club", course: "Cancha Vieja", course_label: "Cancha Vieja" },
          { course_id: "200-principal", course_key: "200:Principal", club_name: "Club B", course: "Principal", course_label: "Principal" },
        ] });
      }
      if (url.pathname === "/api/gps/courses/209-vieja") {
        return json({ course: { holes: [
          { hole: 1, tee: { lat: -38.03, lng: -57.54 }, green: { center: { lat: -38.02, lng: -57.54 } } },
          { hole: 2, tee: { lat: -38.03, lng: -57.54 }, green: {} },
        ] } });
      }
      if (url.pathname === "/api/strategy") return json({ holes: [], overview: "" });
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
    await page.goto(`http://127.0.0.1:${port}/#/tee/t-mdp`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#teeprep .tw-now");
    const placed = await page.evaluate(() => {
      const tee = document.querySelector("#tee");
      const html = tee?.innerHTML || "";
      const prep = document.querySelector("#teeprep");
      const hcp = [...document.querySelectorAll("h2")].find(node => (node.textContent || "").includes("Tu hándicap"));
      const button = [...document.querySelectorAll("a")].find(node => (node.textContent || "").includes("Armar partido"));
      const card = document.querySelector("#teeprep .tw-card");
      return {
        order: html.indexOf("Armar partido") < html.indexOf('id="teeprep"') && html.indexOf('id="teeprep"') < html.indexOf("Tu hándicap de juego"),
        above: !!prep && !!hcp && !!button && prep.getBoundingClientRect().top > button.getBoundingClientRect().top && prep.getBoundingClientRect().bottom <= hcp.getBoundingClientRect().top + 1,
        text: card?.textContent || "",
        map: document.querySelectorAll("#teeprep .tw-map").length,
        warnings: (card?.textContent || "").split("Sin rumbo verificado").length - 1,
        fits: !!tee && tee.scrollWidth <= tee.clientWidth + 1,
      };
    });
    assert.equal(placed.order, true);
    assert.equal(placed.above, true);
    assert.match(placed.text, /Pronóstico 09:00/);
    assert.match(placed.text, /18 km\/h/);
    assert.match(placed.text, /Hoyo 1 · a favor · 18 km\/h/);
    assert.match(placed.text, /Un hoyo sin rumbo verificado no se clasifica/);
    assert.equal(placed.warnings, 0);
    assert.equal(placed.map, 0);
    assert.equal(placed.fits, true);
    const forecast = calls.find(c => c.path === "/api/weather/forecast");
    assert.match(forecast?.search || "", /at=2026-11-08T09/);
    assert.equal(calls.some(c => c.path === "/api/weather/now"), false);
    assert.equal(calls.some(c => c.path === "/api/gps/courses/200-principal"), false);
    assert.equal(calls.some(c => c.path === "/api/gps/courses/209-vieja"), true);
    assert.equal(calls.some(c => c.path.startsWith("/api/reconstructions")), false);
    mkdirSync(ART, { recursive: true });
    await page.evaluate(() => {
      const button = [...document.querySelectorAll("a")].find(node => (node.textContent || "").includes("Armar partido"));
      button?.scrollIntoView({ block: "start" });
    });
    await page.screenshot({ path: join(ART, "tee-wind.png") });
  } finally {
    await browser.close();
    server.close();
  }
});
