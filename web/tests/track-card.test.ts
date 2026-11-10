/** TEST-ONLY. The round card takes TRACK where the player left a hole empty, and keeps a manual mark. */
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const CHROME = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find(p => existsSync(p));
const ROOT = new URL("../public/", import.meta.url);
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".png": "image/png" };
const fixture = {
  user: { name: "Ana Pérez", first_name: "Ana", pending_first_sync: false },
  player: { handicap_index: 12 },
  hi_history: [],
  rounds: [{
    round_id: "r1", id: "r1", date: "2026-11-09", gross: 80, net: 75, valid_card: true,
    course_key: "c1", club_name: "Fixture", course: "Cancha Vieja",
    course_rating: 69.4, slope: 124, adjusted_gross: 80, differential_computed: 9.7, pcc: null,
    holes: [[1, 4, 5], [2, 3, 3], [3, 4, 6]],
  }],
  courses: [{ key: "c1", course: "Cancha Vieja", label: "Cancha Vieja", club_name: "Fixture", par: 72, holes: [], tees: {} }],
  clubs: [],
  bag: [],
};
const shots = [
  { hole: 1, club: "Driver", result: "fairway", direction: "left" },
  { hole: 1, club: "7i", result: "green" },
  { hole: 1, club: "Putter", lie: "green", result: "holed" },
];
const marks = [{ hole: 1, putts: null, gir: null, drive: "fairway", rev: 1 }];
const priv = {
  private: true, played: 5, unknown: 235, empty: false,
  overall_avg_diff: 12.4,
  bands: [
    { key: "manana", label: "Mañana", played: 3, matched: 3, avg_diff: 11.1, impact: -1.3 },
    { key: "mediodia", label: "Mediodía", played: 1, matched: 1, avg_diff: null, impact: null },
    { key: "tarde", label: "Tarde", played: 1, matched: 1, avg_diff: null, impact: null },
  ],
  partners: [{ key: "id:lg", name: "Luis Gómez", count: 4, matched: 3, impact: -0.8 }],
  with_partners: [{ round_id: "r1", companions: [{ key: "id:lg", name: "Luis Gómez" }] }],
  sources: { reservation: 5, card: 0, track: 0, unknown: 235 },
};

test("la tarjeta se llena hoyo por hoyo y el manual gana", { timeout: 60_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const puts: Record<string, unknown>[] = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (body: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname.startsWith("/api/")) {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      if (url.pathname === "/api/data") return json(fixture);
      if (url.pathname === "/api/me/private-metrics") return json(priv);
      if (url.pathname === "/api/weather/rounds") return json({ rounds: {} });
      if (url.pathname === "/api/tee-times") return json({ tee_times: [], clubs: [] });
      if (url.pathname.endsWith("/hole-marks") && req.method === "GET") return json({ marks });
      if (url.pathname.endsWith("/hole-marks") && req.method === "PUT") {
        const body = JSON.parse(raw || "{}") as Record<string, unknown>;
        puts.push(body);
        return json({ applied: true, mark: body });
      }
      if (url.pathname === "/api/reconstructions") return json({ reconstructions: [{ id: "rec1", round_id: "r1" }], rounds: [] });
      if (url.pathname.endsWith("/shots")) return json({ shots });
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
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    mkdirSync("/opt/cursor/artifacts", { recursive: true });
    await page.goto(`http://127.0.0.1:${port}/#/ronda/r1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (document.querySelector("#qsrc")?.textContent || "").includes("Desde TRACK") && (document.querySelector("#qmsg")?.textContent || "").includes("Guardado en tu cuenta"), { timeout: 15000 });
    const hole1 = await page.$eval("#qsrc", el => el.textContent || "");
    assert.match(hole1, /Putts: Desde TRACK/);
    assert.match(hole1, /Fairway: Manual/);
    assert.match(hole1, /Green: Desde TRACK/);
    assert.match(await page.$eval("#rt-putts-src", el => el.textContent || ""), /Desde TRACK/);
    assert.match(await page.$eval("#rt-fir-src", el => el.textContent || ""), /Manual/);
    assert.equal(puts.some(p => p.drive === "left"), false);
    assert.equal(puts.some(p => p.putts === 1), true);
    await page.click('[data-qh="1"]');
    await page.waitForFunction(() => (document.querySelector("#qsrc")?.textContent || "").includes("No aplica"));
    await page.click('[data-qh="1"]');
    await page.waitForFunction(() => (document.querySelector("#qsrc")?.textContent || "").includes("Sin confirmar"));
    const open = await page.$eval("#qsrc", el => el.textContent || "");
    assert.match(open, /Putts: Sin confirmar/);
    assert.match(open, /Fairway: Sin confirmar/);
    await page.click('[data-qh="-1"]');
    await page.click('[data-qh="-1"]');
    await page.screenshot({ path: "/opt/cursor/artifacts/stats-track-390.png" });
    await page.waitForFunction(() => (document.querySelector("#rpartners")?.textContent || "").includes("Jugaste con"));
    const partners = await page.$eval("#rpartners", el => el.textContent || "");
    assert.match(partners, /Jugaste con/);
    assert.match(partners, /Luis Gómez/);
    await page.screenshot({ path: "/opt/cursor/artifacts/jugaste-con-390.png" });
    await page.goto(`http://127.0.0.1:${port}/#/diferencial/r1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (document.body.textContent || "").includes("¿Qué es esto?"));
    await page.screenshot({ path: "/opt/cursor/artifacts/diferencial-390.png" });
    await page.goto(`http://127.0.0.1:${port}/#/privado/horario`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (document.body.textContent || "").includes("sin horario"));
    await page.screenshot({ path: "/opt/cursor/artifacts/por-horario-390.png" });
  } finally {
    await browser.close();
    server.close();
  }
});
