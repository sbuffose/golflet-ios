/** Round weather plan, catalog search, and the start-round / card surfaces. Fixture only. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import test from "node:test";
import { roundWeatherPlan, weatherCacheFresh, countsAsObserved, ARCHIVE_SOURCE, FORECAST_SOURCE } from "../lib/weather-core";
import { nowAR } from "../lib/tee-times-core";
import { matchCatalog } from "../lib/course-search";

const CHROME = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find(p => existsSync(p));
const ROOT = new URL("../public/", import.meta.url);
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".png": "image/png" };

test("el clima del día local no es archivo y un pronóstico no cuenta como observado", () => {
  const today = "2026-11-09";
  assert.deepEqual(roundWeatherPlan(today, today), { action: "forecast" });
  assert.equal(roundWeatherPlan("2026-11-10", today).action, "skip");
  const recent = roundWeatherPlan("2026-11-07", today);
  assert.equal(recent.action, "archive");
  assert.equal(recent.action === "archive" && recent.forecastFallback, true);
  const old = roundWeatherPlan("2026-10-01", today);
  assert.equal(old.action === "archive" && old.forecastFallback, false);
  assert.equal(countsAsObserved(FORECAST_SOURCE), false);
  assert.equal(countsAsObserved(ARCHIVE_SOURCE), true);
  assert.equal(countsAsObserved(null), false);
});

test("Argentina sigue en el 9 de noviembre a las 23:30 y ya es 10 a la 01:00", () => {
  const late = nowAR(new Date("2026-11-10T02:30:00Z"));
  assert.equal(late.date, "2026-11-09");
  assert.equal(roundWeatherPlan("2026-11-09", late.date).action, "forecast");
  const next = nowAR(new Date("2026-11-10T04:00:00Z"));
  assert.equal(next.date, "2026-11-10");
  assert.equal(roundWeatherPlan("2026-11-09", next.date).action, "archive");
});

test("el archivo queda y el fallo o el pronóstico se pueden volver a pedir", () => {
  const now = Date.parse("2026-11-09T22:00:00Z");
  assert.equal(weatherCacheFresh({ status: "ok", source: FORECAST_SOURCE, fetched_at: new Date(now - 10 * 60e3).toISOString() }, now), true);
  assert.equal(weatherCacheFresh({ status: "ok", source: FORECAST_SOURCE, fetched_at: new Date(now - 2 * 3600e3).toISOString() }, now), false);
  assert.equal(weatherCacheFresh({ status: "ok", source: ARCHIVE_SOURCE, fetched_at: new Date(now - 40 * 864e5).toISOString() }, now, true), true);
  assert.equal(weatherCacheFresh({ status: "unavailable", source: ARCHIVE_SOURCE, fetched_at: new Date(now - 20 * 60e3).toISOString() }, now), false);
  assert.equal(weatherCacheFresh({ status: "unavailable", source: FORECAST_SOURCE, fetched_at: new Date(now - 60e3).toISOString() }, now, true), false);
});

test("la búsqueda separa clubes homónimos y no duplica una cancha", () => {
  const rows = [
    { club_code: "118", club: "JOCKEY CLUB", vm_course: "JOCKEY AZUL" },
    { club_code: "118", club: "JOCKEY CLUB", vm_course: "JOCKEY COLORADA" },
    { club_code: "209", club: "MAR DEL PLATA GOLF CLUB", vm_course: "MAR DEL PLATA CANCHA VIEJA" },
    { club_code: "209", club: "MAR DEL PLATA GOLF CLUB", vm_course: "MAR DEL PLATA CANCHA NUEVA" },
    { club_code: "118", club: "JOCKEY CLUB", vm_course: "JOCKEY AZUL" },
    { club_code: "50", club: "CLUB DE GOLF PILAR", vm_course: "NORTE" },
    { club_code: "51", club: "PILAR GOLF", vm_course: "SUR" },
  ];
  const short = matchCatalog(rows, "a");
  assert.equal(short.reason, "short");
  assert.equal(short.hits.length, 0);
  assert.equal(short.catalog, 6);
  const azul = matchCatalog(rows, "azul");
  assert.equal(azul.hits.length, 1);
  assert.equal(azul.hits[0].course_label, "Azul");
  assert.match(azul.hits[0].club_name, /Jockey/i);
  const vieja = matchCatalog(rows, "cancha vieja");
  assert.equal(vieja.hits.length, 1);
  assert.equal(vieja.hits[0].course_label, "Cancha Vieja");
  assert.match(vieja.hits[0].club_name, /Mar del Plata/i);
  const pilar = matchCatalog(rows, "pilar");
  assert.equal(pilar.hits.length, 2);
  assert.equal(new Set(pilar.hits.map(h => h.club_code)).size, 2);
});

test("la tarjeta no promete un plazo y la ronda puede elegir otra cancha", { timeout: 120_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.equal(app.includes("Lo traemos en unos días"), false);
  assert.equal(app.includes("h.cn.slice(0, 3)"), false);
  assert.match(app, /Pronóstico, no es el histórico/);
  const posts: { path: string; body: string }[] = [];
  let weatherHits = 0;
  const roundId = "11111111-1111-1111-1111-111111111111";
  const fixture = {
    user: { name: "TEST-ONLY", first_name: "Test", pending_first_sync: false, role: null },
    player: { name: "TEST-ONLY" }, hi_history: [], bag: [],
    clubs: [{ id: "a", club_name: "Mar del Plata Golf Club", rounds: 1, last_sync_status: "ok", password_saved: false, source: "site" }],
    courses: [
      { key: "209:Cancha Vieja", club_id: 209, club_name: "Mar del Plata Golf Club", course: "Cancha Vieja", label: "Cancha Vieja", par: 72, tees: {}, rounds: 1, holes: [{ hole: 15, par: 5, hcp: 6, yards: {}, stats: { n: 2, avg: null, avg_to_par: 1.5, avg_last16: null, best: null, worst: null, dist: {} }, compare: null, data_warning: null, geometry: null, green: {}, recommendation: null }] },
      { key: "77:Cancha Vieja", club_id: 77, club_name: "Club del Sur", course: "Cancha Vieja", label: "Cancha Vieja · Club del Sur", par: 72, tees: {}, rounds: 1, holes: [{ hole: 3, par: 4, hcp: 1, yards: {}, stats: { n: 4, avg: 5.2, avg_to_par: 1.2, avg_last16: null, best: 4, worst: 7, dist: {} }, compare: null, data_warning: null, geometry: null, green: {}, recommendation: null }] },
    ],
    rounds: [{ round_id: roundId, date: "2026-11-09", valid_card: true, gross: 82, net: 79, is_9_holes: false, differential_computed: 9.7, course_key: "209:Cancha Vieja", course: "Cancha Vieja", club_name: "Mar del Plata Golf Club", tournament: "Copa", tee: "Azul", holes: [] }],
  };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const json = (data: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(data)); };
    if (url.pathname.startsWith("/api/")) {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks).toString();
      if (req.method === "POST") posts.push({ path: url.pathname, body });
      if (url.pathname === "/api/data") return json(fixture);
      if (url.pathname === "/api/gps/courses" && url.searchParams.has("q")) {
        const found = matchCatalog([
          { club_code: "209", club: "MAR DEL PLATA GOLF CLUB", vm_course: "MAR DEL PLATA CANCHA VIEJA" },
          { club_code: "50", club: "CLUB DE GOLF PILAR", vm_course: "NORTE" },
        ], url.searchParams.get("q") || "");
        return json({ courses: found.hits.map(h => ({ ...h, label: h.course_label, mine: false })), coverage: { catalog: found.catalog, clubs: found.clubs, shown: found.hits.length, truncated: found.truncated }, reason: found.reason });
      }
      if (url.pathname === "/api/gps/courses") return json({ courses: [
        { course_id: "209-cancha-vieja", club_code: "209", club_name: "Mar del Plata Golf Club", course_label: "Cancha Vieja", mine: true },
        { course_id: "50-norte", club_code: "50", club_name: "Club de Golf Pilar", course_label: "Norte", mine: false },
      ] });
      if (url.pathname === "/api/live-rounds" && req.method === "POST") return json({ live_round: { id: "live-1", course: "Norte", vm_course: "NORTE", current_hole: 1, date: "2026-11-09", ended_at: null } }, 201);
      if (url.pathname === "/api/live-rounds") return json({ live_rounds: [] });
      if (url.pathname === `/api/rounds/${roundId}/weather`) {
        weatherHits++;
        if (url.searchParams.get("retry") === "1") return json({ round_id: roundId, source: FORECAST_SOURCE, weather: { condition: "nublado", temp_c: 18, precip_mm: 0, wind_kmh: 14, gust_kmh: 22, kind: "forecast", source: FORECAST_SOURCE, basis: "day", window: [10, 16] } });
        return json({ round_id: roundId, weather: null, reason: "unavailable" });
      }
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
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    await page.goto(`http://127.0.0.1:${port}/#/resumen`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.body.innerText.includes("Hoyos que más te cuestan"));
    const resumen = await page.evaluate(() => document.body.innerText);
    assert.match(resumen, /Hoyo 15 · Cancha Vieja/);
    assert.match(resumen, /Mar del Plata Golf Club/);
    assert.match(resumen, /Hoyo 3 · Cancha Vieja/);
    assert.match(resumen, /Club del Sur/);
    assert.match(resumen, /\+1,50 vs par/);
    assert.equal(resumen.includes("Promedio —"), false);
    assert.equal(/\bCAN\b/.test(resumen), false);
    const bag = await page.$eval('a[data-tab="bolsa"] svg', el => el.innerHTML);
    assert.equal(bag.includes("M8 8V6a4"), false);
    assert.match(bag, /nav-accent/);
    for (const width of [320, 390, 430]) {
      await page.setViewport({ width, height: 844 });
      const box = await page.$eval("#tabbar", el => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height, labels: [...el.querySelectorAll("a[data-tab] span")].map(s => s.textContent) }; });
      assert.deepEqual(box.labels.slice(0, 5), ["Inicio", "Resumen", "Rondas", "Cancha", "Mi bolsa"]);
      assert.ok(box.w <= width + 1 && box.h >= 48, `${width} ${box.w}x${box.h}`);
    }
    await page.setViewport({ width: 390, height: 844 });
    await page.evaluate((id) => { location.hash = `#/ronda/${id}`; }, roundId);
    await page.waitForSelector("#wxretry");
    const miss = await page.$eval("#rwx", el => el.textContent || "");
    assert.match(miss, /Open-Meteo no tiene datos/);
    assert.equal(miss.includes("unos días"), false);
    await page.click("#wxretry");
    await page.waitForFunction(() => (document.querySelector("#rwx")?.textContent || "").includes("Pronóstico"));
    const got = await page.$eval("#rwx", el => el.textContent || "");
    assert.match(got, /Pronóstico, no es el histórico/);
    assert.match(got, /No entra en Clima y juego/);
    assert.ok(weatherHits >= 2);
    await page.evaluate(() => { location.hash = "#/jugar"; });
    await page.waitForSelector("#jgq");
    const start = await page.evaluate(() => document.body.innerText);
    assert.match(start, /Mis clubes/);
    assert.match(start, /Cancha Vieja/);
    assert.equal(start.includes("Club de Golf Pilar"), false);
    await page.type("#jgq", "pilar");
    await page.waitForFunction(() => document.body.innerText.includes("Club de Golf Pilar"));
    await page.click("#course-50-norte");
    await page.click("#jgstart");
    await page.waitForFunction(() => location.hash.includes("live-1"));
    assert.equal(posts.length, 1);
    assert.equal(posts[0].path, "/api/live-rounds");
    assert.equal(JSON.parse(posts[0].body).course_id, "50-norte");
  } finally {
    await browser.close();
    await new Promise<void>(r => server.close(() => r()));
  }
});
