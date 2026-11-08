/** TEST-ONLY. Period chip, strategy/wind retry, and verified hole geometry in headless Chrome.
 *  Fixture data only. No club host, no Open-Meteo, no production session. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import test from "node:test";
import { existsSync } from "node:fs";

const CHROME = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find(p => existsSync(p));
const ROOT = new URL("../public/", import.meta.url);
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".png": "image/png" };

const hole = (n: number) => ({ hole: n, par: 4, hcp: n, yards: { BLANCO: 380 }, stats: { n: 0, avg: null, avg_to_par: null, avg_last16: null, best: null, worst: null, dist: { eagle_or_better: 0, birdie: 0, par: 0, bogey: 0, double: 0, triple_plus: 0 } } });
const strategy = {
  overview: "Plan fixture",
  holes: Array.from({ length: 18 }, (_, i) => ({
    hole: i + 1,
    plan_title: `Plan ${i + 1}`,
    plan_text: "Plan general que no es el de hándicap bajo",
    tee_club: null,
    hazards: [],
    variants: i === 0 ? { bajo: { plan: "Salida al centro verificada", tee_club: "Driver" } } : {},
  })),
};
const fixture = {
  user: { name: "Test Player", first_name: "Test", pending_first_sync: false },
  player: { name: "Test Player", handicap_index: 12 },
  rounds: [
    { id: "r-new", date: "2026-11-01", valid_card: true, gross: 80, net: 70, is_9_holes: false, differential_computed: 4, course_key: "c1", course_label: "Cancha Fixture", holes: [], tournament: "TEST-ONLY noviembre" },
    { id: "r-old", date: "2026-01-15", valid_card: true, gross: 90, net: 80, is_9_holes: false, differential_computed: 8, course_key: "c1", course_label: "Cancha Fixture", holes: [], tournament: "TEST-ONLY enero" },
  ],
  courses: [{ key: "c1", course: "Cancha Fixture", label: "Cancha Fixture", club_name: "Club Fixture", par: 72, tees: {}, lat: -34.48, lng: -58.53, holes: [hole(1), hole(2)] }],
  clubs: [{ id: "acc-fixture", club_name: "Club Fixture", rounds: 2, last_sync_status: "ok", last_sync_at: "2026-11-01T12:00:00Z", password_saved: false, source: "site" }],
  hi_history: [],
};

test("period, strategy and the hole map follow the fixture", { timeout: 90_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  let pauseStrategy = false;
  const releaseStrategy: (() => void)[] = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const host = req.headers.host || "";
    if (!host.startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (data: unknown, status = 200) => {
      if (res.writableEnded || res.destroyed) return;
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (url.pathname.startsWith("/api/")) {
      for await (const chunk of req) void chunk;
      if (url.pathname === "/api/me" || url.pathname === "/api/profe/me" || url.pathname.startsWith("/api/me/")) return json({ error: "no" }, 401);
      if (url.pathname === "/api/data") return json(fixture);
      if (url.pathname === "/api/strategy") {
        if (pauseStrategy) await new Promise<void>(r => releaseStrategy.push(r));
        return json(strategy);
      }
      if (url.pathname === "/api/weather/now") return json({ kmh: 18, from_deg: 0, temp_c: 21 });
      if (url.pathname === "/api/weather/forecast") return json({ hours: [{ at: "2026-11-08T15:00:00", wind_kmh: 18, wind_from: "norte", temp_c: 21, rain_mm: 0 }] });
      if (url.pathname === "/api/gps/courses") return json({ courses: [
        { course_id: "azul-otro", course_key: "9:Azul", club_name: "Otro Club", course: "Azul", course_label: "Azul" },
        { course_id: "course-fixture", course_key: "c1", club_name: "Club Fixture", course: "Cancha Fixture", course_label: "Cancha Fixture" },
      ] });
      if (url.pathname === "/api/gps/courses/course-fixture") return json({ course: { holes: [
        { hole: 1, tee: { lat: -34.48, lng: -58.53 }, green: { center: { lat: -34.481, lng: -58.529 } }, line: [{ lat: -34.4805, lng: -58.5295 }] },
        { hole: 2, tee: null, green: { center: { lat: -34.48, lng: -58.53 } } },
      ] } });
      if (url.pathname === "/api/tee-times/check") return json({ status: "checked", fresh: true, players_read: false, checked_at: "2026-11-08T12:00:00.000Z", last_checked_at: null, new: [], changed: [], gone: [], message: null, tee_times: [] });
      if (url.pathname === "/api/tee-times") return json({ tee_times: [], clubs: [] });
      return json({});
    }
    const file = url.pathname === "/" ? "/index.html" : url.pathname;
    try {
      const buf = await readFile(new URL(file.slice(1), ROOT));
      res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
      res.end(buf);
    } catch { res.writeHead(404); res.end("missing"); }
  });
  server.on("clientError", (_e, socket) => socket.destroy());
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    await page.emulateTimezone("America/Argentina/Buenos_Aires");
    await page.evaluateOnNewDocument(`(() => {
      const fixed = Date.parse("2026-11-08T15:00:00-03:00");
      const Native = Date;
      class Frozen extends Native {
        constructor(...args) { super(...(args.length ? args : [fixed])); }
        static now() { return fixed; }
      }
      window.Date = Frozen;
    })();`);
    const leaked: string[] = [];
    const urls: string[] = [];
    page.on("request", req => { const u = new URL(req.url()); if ((u.protocol === "http:" || u.protocol === "https:") && u.hostname !== "127.0.0.1") leaked.push(u.hostname); });
    page.on("framenavigated", frame => { if (frame === page.mainFrame()) urls.push(frame.url()); });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle0" });
    await page.waitForSelector(".rng-n");
    assert.equal(urls.some(u => u.includes("/login")), false);
    const selected = () => page.$$eval('button[data-range][aria-selected="true"]', els => els.map(el => el.textContent || ""));
    const rounds = () => page.$eval(".rng-n", el => el.textContent || "");
    assert.deepEqual(await selected(), ["Histórico"]);
    assert.match(await rounds(), /2 rondas/);
    await page.click('button[data-range="3m"]');
    await page.waitForFunction(() => location.hash.includes("range=3m") && document.querySelector('button[data-range="3m"]')?.getAttribute("aria-selected") === "true");
    assert.deepEqual(await selected(), ["3 meses"]);
    assert.match(await rounds(), /1 ronda/);
    assert.match(await rounds(), /8 ago 2026/);
    await page.click('a[data-tab="cancha"]');
    await page.waitForSelector("#stratcard");
    await page.waitForFunction(() => (document.querySelector("#stratcard")?.textContent || "").includes("18 de 18"));
    await page.waitForFunction(() => (document.querySelector("#cancwx")?.textContent || "").includes("viene del norte"));
    assert.deepEqual(await selected(), ["3 meses"]);
    assert.match(await rounds(), /1 ronda/);
    assert.equal(await page.$eval(".big", el => el.textContent), "80,0");
    await page.click('button[data-range="all"]');
    await page.waitForFunction(() => document.querySelector('button[data-range="all"]')?.getAttribute("aria-selected") === "true" && (document.querySelector(".big")?.textContent || "") === "85,0");
    assert.match(await rounds(), /2 rondas/);
    await page.click('button[data-range="3m"]');
    await page.waitForFunction(() => (document.querySelector(".big")?.textContent || "") === "80,0");
    await page.click('a[href="#/hoyo/c1/1"]');
    await page.waitForSelector('#holegeo svg[aria-label="Trazado con los puntos provistos del hoyo 1"]');
    await page.waitForFunction(() => (document.querySelector("#howto")?.textContent || "").includes("Salida al centro verificada"));
    const hole1 = await page.evaluate(() => document.body.innerText);
    assert.equal(hole1.includes("próximamente"), false);
    assert.equal(hole1.includes("Esquema"), false);
    assert.equal(hole1.includes("Plan general que no es el de hándicap bajo"), false);
    assert.equal(await page.$eval('button[data-lvl="bajo"]', el => el.classList.contains("on")), true);
    await page.click('a[aria-label="Siguiente"]');
    await page.waitForFunction(() => (document.querySelector("#holegeo")?.textContent || "").includes("No hay un trazado verificado para este hoyo."));
    await page.waitForFunction(() => (document.querySelector("#howto")?.textContent || "").includes("No hay un plan verificado para hándicap bajo."));
    const hole2 = await page.evaluate(() => document.body.innerText);
    assert.equal(hole2.includes("Plan general que no es el de hándicap bajo"), false);
    assert.equal(hole2.includes("Salida al centro verificada"), false);
    assert.equal(hole2.includes("próximamente"), false);
    pauseStrategy = true;
    await page.click('a[data-tab="inicio"]');
    await page.waitForSelector("#greet");
    await page.click('a[data-tab="cancha"]');
    await page.waitForSelector("#stratcard .spin");
    await page.click('a[data-tab="inicio"]');
    releaseStrategy.splice(0).forEach(fn => fn());
    await page.waitForFunction(() => !!document.querySelector("#greet") && !document.querySelector("#stratcard"));
    pauseStrategy = false;
    await page.click('a[data-tab="cancha"]');
    await page.waitForFunction(() => (document.querySelector("#stratcard")?.textContent || "").includes("18 de 18"));
    pauseStrategy = true;
    await page.click('a[data-tab="inicio"]');
    await page.waitForSelector("#greet");
    await page.click('a[data-tab="cancha"]');
    await page.waitForFunction(() => (document.querySelector("#stratcard")?.textContent || "").includes("La lectura tardó demasiado."), { timeout: 12_000 });
    releaseStrategy.splice(0).forEach(fn => fn());
    await new Promise(r => setTimeout(r, 400));
    assert.match(await page.$eval("#stratcard", el => el.textContent || ""), /La lectura tardó demasiado/);
    pauseStrategy = false;
    await page.click("#stratcard [data-retry]");
    await page.waitForFunction(() => (document.querySelector("#stratcard")?.textContent || "").includes("18 de 18"));
    assert.equal(urls.some(u => u.includes("/login")), false);
    assert.deepEqual(leaked, []);
  } finally {
    releaseStrategy.splice(0).forEach(fn => fn());
    await browser.close();
    server.close();
  }
});
