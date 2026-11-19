/** Fixture-only captures for impacto, round weather, and deleting a club shot. Never calls production. */
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

const round = {
  round_id: "fixture-ronda",
  date: "2026-10-30",
  club_name: "Club Fixture",
  course: "Norte",
  tournament: "Medal",
  valid_card: true,
  gross: 82,
  net: 74,
  differential_computed: 10.2,
  holes: [],
};

test("impacto, clima y borrar un golpe usan fixtures y no tocan producción", { timeout: 120_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const hosts: string[] = [];
  const methods: string[] = [];
  const shot = () => ({
    id: "shot-383", live_round_id: "live-fixture", round_id: "fixture-ronda", date: "2026-10-30", hole: 1,
    distance_yd: 383, lie: null, result: null, shots_on_hole: 5, posted_strokes: 5, counts_for_distance: true, distance_kind: null as string | null,
  });
  let recent = [shot()];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    hosts.push(req.headers.host || "");
    const json = (data: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(data)); };
    if (url.pathname.startsWith("/api/")) {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString() || "{}") : {};
      methods.push(`${req.method} ${url.pathname}`);
      if (url.pathname === "/api/data") return json({
        user: { name: "Jugador Demo", first_name: "Jugador", pending_first_sync: false, role: null },
        player: { name: "Jugador Demo" },
        hi_history: [{ date: "2023-10-05", hi: 15.3 }, { date: "2026-11-05", hi: 8.4 }],
        bag: [{ code: "Dr", label: "Driver" }],
        clubs: [], courses: [], rounds: [round],
      });
      if (url.pathname === "/api/metrics/hcp-impact") return json({
        hcp_impact: {
          delta: -6.2,
          start: { index: 15.3, date: "2023-10-05" },
          now: { index: 8.4, date: "2026-11-05" },
          source: "official",
          start_is_first_record: true,
          cards_in_range: 1,
          entered_best8: 1,
          cards: [{ round_id: "fixture-ronda", date: "2026-10-30", course_label: "Norte", gross: 82, differential: 10.2, vs_prev: -0.4, entered_best8: true, prev_index: 8.8, counts_now: true }],
          dropped: [],
          note: "Fixture.",
        },
      });
      if (url.pathname === "/api/rounds/fixture-ronda/weather") return json({
        weather: { condition: "despejado", temp_c: 22, precip_mm: 0, wind_kmh: 14, gust_kmh: 22, kind: "observed", source: "open-meteo-archive", window: [8, 12], basis: "tee_time" },
      });
      if (url.pathname === "/api/club-stats/Dr") return json({
        club: {
          label: "Driver", shots: recent.length, outliers_trimmed: 0,
          distance: recent.some(s => s.counts_for_distance) ? { median_yd: 383, avg_yd: 383, max_yd: 383, range_yd: [383, 383], spread_yd: 0, n: 1, trimmed: 0 } : null,
          direction: { n: 0, left: 0, center: 0, right: 0 },
          length_on_approach: { n: 0, short: 0, on: 0, long: 0 },
          mishit: { pct: null, count: 0, of: Math.max(recent.length, 1) },
        },
        recent_shots: recent,
      });
      if (req.method === "DELETE" && url.pathname === "/api/shots/shot-383") {
        const gone = recent[0];
        recent = [];
        return json({ ok: true, shot: { ...gone, club: "Dr" }, shots: [] });
      }
      if (req.method === "POST" && url.pathname === "/api/live-rounds/live-fixture/shots") {
        recent = [{ ...shot(), hole: body.hole || 1 }];
        return json({ shots: recent });
      }
      if (req.method === "PATCH" && url.pathname === "/api/shots/shot-383") {
        if (!recent[0]) recent = [shot()];
        recent[0].distance_kind = body.distance_kind ?? null;
        recent[0].counts_for_distance = recent[0].distance_kind !== "excluded";
        return json({ shot: recent[0], shots: recent });
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
    await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2 });
    const origin = `http://127.0.0.1:${port}`;
    await page.goto(`${origin}/#/inicio`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => {
      const mark = document.querySelector("#hcpimp b");
      return !!mark && (mark.textContent || "").includes("6,9");
    });
    const home = await page.$eval("#hcpimp b", el => el.textContent || "");
    assert.equal(home.includes("6,2"), false);

    await page.evaluate(() => { location.hash = "#/impacto"; });
    await page.waitForFunction(() => document.body.innerText.includes("15,3") && document.body.innerText.includes("8,4") && document.body.innerText.includes("6,9"));
    const impact = await page.evaluate(() => document.body.innerText);
    assert.match(impact, /5 oct 2023|5 oct/);
    assert.match(impact, /mismo tramo que el número de Inicio/);
    assert.equal(impact.includes("6,2"), false);
    if (saveShots) await page.screenshot({ path: `${SHOTS}/web-375-impacto.png`, fullPage: true });

    await page.evaluate(() => { location.hash = "#/ronda/fixture-ronda"; });
    await page.waitForFunction(() => {
      const wx = document.querySelector("#rwx");
      const stats = [...document.querySelectorAll("h2")].find(h => (h.textContent || "").includes("Estadísticas de la ronda"));
      return !!wx && !wx.hidden && !!stats && wx.getBoundingClientRect().top < stats.getBoundingClientRect().top;
    });
    const weather = await page.evaluate(() => document.querySelector("#rwx")?.textContent || "");
    assert.match(weather, /Clima en tu salida/);
    assert.match(weather, /Despejado/);
    assert.match(weather, /8 a 12 h · Open-Meteo histórico\./);
    if (saveShots) {
      await page.evaluate(() => document.querySelector("#rwx")?.scrollIntoView({ block: "center" }));
      await page.screenshot({ path: `${SHOTS}/web-375-ronda-clima.png` });
    }

    await page.evaluate(() => { location.hash = "#/palo/Dr"; });
    await page.waitForFunction(() => document.body.innerText.includes("383 yd") && document.body.innerText.includes("Últimos golpes"));
    if (saveShots) {
      await page.evaluate(() => document.querySelector("#f-tiros")?.scrollIntoView({ block: "center" }));
      await page.screenshot({ path: `${SHOTS}/web-375-ultimos-golpes.png` });
    }
    await page.click(".vx-del");
    await page.waitForFunction(() => document.body.innerText.includes("sigue en 5") && document.body.innerText.includes("Excluir de las distancias"));
    if (saveShots) await page.screenshot({ path: `${SHOTS}/web-375-golpe-confirmar.png`, fullPage: true });
    await page.click("[data-del]");
    await page.waitForFunction(() => !document.body.innerText.includes("383 yd") && (document.querySelector("#toast")?.textContent || "").includes("Deshacer"));
    if (saveShots) await page.screenshot({ path: `${SHOTS}/web-375-golpe-deshacer.png` });
    await page.click("#toast button");
    await page.waitForFunction(() => document.body.innerText.includes("383 yd") && !document.querySelector(".vx-ask"));

    await page.click(".vx-del");
    await page.waitForSelector("[data-ex]");
    const clicked = await page.evaluate(async () => {
      const btn = document.querySelector("[data-ex]") as HTMLButtonElement | null;
      btn?.click();
      await new Promise(r => setTimeout(r, 800));
      return { toast: document.querySelector("#toast")?.textContent || "", ask: !!document.querySelector(".vx-ask"), text: document.body.innerText.slice(0, 400) };
    });
    if (!clicked.toast.includes("Fuera de las distancias")) {
      throw new Error(`exclude no aplicó ${JSON.stringify(clicked)} methods=${methods.join(" | ")}`);
    }
    assert.equal(recent[0]?.distance_kind, "excluded");
    assert.equal(methods.some(m => m.startsWith("DELETE ")), true);
    assert.equal(hosts.every(h => h.startsWith("127.0.0.1")), true);
  } finally {
    await browser.close();
    await new Promise<void>(r => server.close(() => r()));
  }
});
