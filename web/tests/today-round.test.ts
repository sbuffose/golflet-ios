/** TEST-ONLY. Today's provisional round, then the same round once the fixture card arrives. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import test from "node:test";

const CHROME = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find(p => existsSync(p));
const ROOT = new URL("../public/", import.meta.url);
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml" };
const ART = "/opt/cursor/artifacts";

const holes = Array.from({ length: 18 }, (_, i) => [i + 1, 4, i === 2 ? 4 : 4]);
const pending = () => ({
  user: { name: "TEST-ONLY", pending_first_sync: false, first_name: "Fixture" },
  player: { name: "TEST-ONLY" },
  rounds: [],
  clubs: [{ id: "club-1", club_name: "Jockey Club Argentino" }],
  courses: [],
  hi_history: [],
  today: "2026-11-22",
  today_round: { id: "live-hoy", date: "2026-11-22", course: "Azul", tee: "", pending_label: "En juego" },
  today_booking: null,
  link_asks: [],
  unofficial_rounds: [{ id: "live-hoy", date: "2026-11-22", course: "Azul", tee: "", official: false, pending_label: "En juego" }],
});
const linked = () => ({
  user: { name: "TEST-ONLY", pending_first_sync: false, first_name: "Fixture" },
  player: { name: "TEST-ONLY" },
  rounds: [{
    round_id: "card-hoy", date: "2026-11-22", course: "Azul", course_key: "1:Azul", club_name: "Jockey Club Argentino",
    gross: 72, net: 72, valid_card: true, official: true, holes, track_diff: [3], tournament: "Tarjeta",
  }],
  clubs: [{ id: "club-1", club_name: "Jockey Club Argentino" }],
  courses: [],
  hi_history: [],
  today: "2026-11-22",
  today_round: null,
  today_booking: null,
  link_asks: [],
  unofficial_rounds: [],
});

test("la vuelta de hoy se trackea sin tarjeta y después queda vinculada", { timeout: 120_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  mkdirSync(ART, { recursive: true });
  let mode: "pending" | "linked" = "pending";
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (data: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(data)); };
    if (url.pathname === "/api/fixture/link") { mode = "linked"; return json({ ok: true }); }
    if (url.pathname === "/api/data") return json(mode === "pending" ? pending() : linked());
    if (url.pathname === "/api/reconstructions") return json({
      rounds: [],
      reconstructions: [{ id: "live-hoy", date: "2026-11-22", course: "Azul", tee: "", club_code: "fixture", vm_course: "Azul", round_id: null, current_hole: 1, official: false, tracked: true }],
    });
    if (url.pathname.startsWith("/api/reconstructions/") && url.pathname.endsWith("/shots")) return json({ shots: [] });
    if (url.pathname.startsWith("/api/gps/courses/")) return json({
      course: { course: "Azul", club_code: "fixture", holes: [{ hole: 1, par: 4, tee: { lat: -34.5, lng: -58.5 }, green: { center: { lat: -34.501, lng: -58.5 }, front: { lat: -34.501, lng: -58.5 } } }] },
    });
    if (url.pathname.startsWith("/api/")) return json({});
    const file = url.pathname === "/" ? "/index.html" : url.pathname;
    try {
      const buf = await readFile(new URL(file.slice(1), ROOT));
      res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
      res.end(buf);
    } catch { res.writeHead(404); res.end("missing"); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as { port: number }).port;
  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 2 });
    await page.setRequestInterception(true);
    page.on("request", request => {
      const url = request.url();
      if (url.includes("arcgisonline.com")) {
        void fetch(url).then(async res => {
          const body = Buffer.from(await res.arrayBuffer());
          await request.respond({ status: res.ok ? 200 : 502, contentType: res.headers.get("content-type") || "image/jpeg", headers: { "access-control-allow-origin": "*" }, body });
        }).catch(() => request.abort());
        return;
      }
      if (url.startsWith(`http://127.0.0.1:${port}`)) request.continue();
      else request.abort();
    });
    const hideBar = () => page.evaluate(() => { const bar = document.querySelector("#tabbar"); if (bar) (bar as HTMLElement).style.display = "none"; });
    await page.goto(`http://127.0.0.1:${port}/#/inicio`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#today-track", { timeout: 8000 });
    await hideBar();
    const home = await page.evaluate(() => document.body.innerText);
    assert.match(home, /Seguir la vuelta de hoy/);
    assert.match(home, /En juego/);
    assert.match(home, /Tarjeta pendiente/);
    assert.equal(home.includes("Sin cargar"), false);
    await page.screenshot({ path: `${ART}/web-375-inicio-vuelta.png` });
    await page.evaluate(() => document.querySelector("#today-track")?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
    await page.waitForSelector(".tk-cn", { timeout: 8000 });
    await page.waitForSelector(".tk-tiles:not([data-pending])", { timeout: 20000 });
    await page.waitForFunction(() => {
      const ban = document.querySelector("#tk-maperr");
      return !ban || (ban as HTMLElement).hidden;
    }, { timeout: 8000 });
    await hideBar();
    const track = await page.evaluate(() => document.body.innerText);
    assert.match(track, /Azul/);
    assert.equal(track.includes("Sin cargar"), false);
    await page.screenshot({ path: `${ART}/web-375-inicio-track.png` });
    await page.goto(`http://127.0.0.1:${port}/#/rondas`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".rc-off", { timeout: 8000 });
    await hideBar();
    const list = await page.evaluate(() => document.body.innerText);
    assert.match(list, /En juego/);
    assert.match(list, /Tarjeta pendiente/);
    assert.equal(list.includes("Sin cargar"), false);
    await page.screenshot({ path: `${ART}/web-375-rondas-pendiente.png` });
    await page.evaluate(() => fetch("/api/fixture/link", { method: "POST" }));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.evaluate(() => { location.hash = "#/ronda/card-hoy"; });
    await page.waitForSelector("#track-gap", { timeout: 8000 });
    await hideBar();
    const card = await page.evaluate(() => ({ text: document.body.innerText, gaps: document.querySelectorAll(".b.gap").length, pending: document.querySelectorAll(".rc-off").length }));
    assert.match(card.text, /difiere del track/);
    assert.match(card.text, /queda igual/);
    assert.equal(card.gaps > 0, true);
    assert.equal(card.pending, 0);
    assert.equal(card.text.includes("Sin cargar"), false);
    await page.screenshot({ path: `${ART}/web-375-rondas-vinculada.png` });
  } finally {
    await browser.close();
    server.close();
  }
});
