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
const past = {
  round_id: "card-prev", date: "2026-11-15", course: "Azul", course_key: "1:Azul", course_label: "Azul",
  club_name: "Jockey Club Argentino", gross: 78, net: 70, valid_card: true, official: true,
  holes, tournament: "Medal", differential_computed: 8.4,
};
const pending = () => ({
  user: { name: "TEST-ONLY", pending_first_sync: false, first_name: "Fixture" },
  player: { name: "TEST-ONLY", handicap_index: 14.2 },
  rounds: [past],
  clubs: [{ id: "club-1", club_name: "Jockey Club Argentino" }],
  courses: [],
  hi_history: [{ date: "2023-10-01", hi: 21.1 }, { date: "2026-11-15", hi: 14.2 }],
  today: "2026-11-22",
  today_round: { id: "live-hoy", date: "2026-11-22", course: "Azul", tee: "", pending_label: "En juego" },
  today_booking: null,
  link_asks: [],
  unofficial_rounds: [{ id: "live-hoy", date: "2026-11-22", course: "Azul", tee: "", official: false, pending_label: "En juego" }],
});
const linked = () => ({
  user: { name: "TEST-ONLY", pending_first_sync: false, first_name: "Fixture" },
  player: { name: "TEST-ONLY", handicap_index: 14.2 },
  rounds: [{
    round_id: "card-hoy", date: "2026-11-22", course: "Azul", course_key: "1:Azul", club_name: "Jockey Club Argentino",
    gross: 72, net: 72, valid_card: true, official: true, holes, track_diff: [3], tournament: "Tarjeta", gps_shots: 2,
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
      reconstructions: [{ id: "live-hoy", date: "2026-11-22", course: "Azul", tee: "", club_code: "fixture", vm_course: "Azul", round_id: mode === "linked" ? "card-hoy" : null, current_hole: 1, official: mode === "linked", tracked: true }],
    });
    if (url.pathname.startsWith("/api/reconstructions/") && url.pathname.endsWith("/shots")) return json({
      shots: mode === "linked" ? [{ id: "s1", hole: 1, club: "Dr", penalty_strokes: 0, result: "fairway" }, { id: "s2", hole: 1, club: "7i", penalty_strokes: 0, result: "green" }] : [],
    });
    if (url.pathname.startsWith("/api/gps/courses/")) return json({
      course: { course: "Azul", club_code: "fixture", holes: [{ hole: 1, par: 4, tee: { lat: -34.5, lng: -58.5 }, green: { center: { lat: -34.501, lng: -58.5 }, front: { lat: -34.501, lng: -58.5 } } }] },
    });
    if (url.pathname.startsWith("/api/tee-times")) {
      const booking = { id: "tt-hoy", date: "2026-11-22", time: "08:30", club_name: "Jockey Club Argentino", course_label: "Azul", start_hole: 1, companions: ["Joaquín Lavalle", "Augusto Lavalle"] };
      return json({ fresh: true, tee_times: [booking], new: [], changed: [] });
    }
    if (url.pathname === "/api/profesores") return json({ profesores: [{ profesor_id: "prof-ana", name: "Ana Ruiz", verified: true }] });
    if (url.pathname === "/api/groups") return json({ groups: [{ id: "grp-jueves", name: "Los jueves" }] });
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
    await page.waitForFunction(() => document.body.innerText.includes("08:30"), { timeout: 8000 });
    await page.waitForSelector("#hiprofs .hp-av", { timeout: 8000 });
    await page.waitForSelector("#higroups .hp-av", { timeout: 8000 });
    await hideBar();
    let layout = "";
    for (let i = 0; i < 20 && !String(layout).startsWith("ok"); i++) {
      layout = await page.evaluate(`(() => {
      const r = (s) => { const el = document.querySelector(s); return el ? el.getBoundingClientRect() : null; };
      const greet = r("#greet"), pill = r("#ttpill"), prof = r("#hiprofs"), group = r("#higroups");
      const play = r("#today-track"), cambios = r(".hero .hi-ch-l"), meta = r(".hero .meta");
      const hero = document.querySelector(".hero");
      const bigEl = document.querySelector(".hero .big");
      const titleEl = document.querySelector(".hero .overline");
      if (!greet || !pill || !bigEl || !titleEl || !prof || !group || !play || !cambios || !meta || !hero) return "missing";
      const digits = document.createRange(); digits.selectNodeContents(bigEl); const big = digits.getBoundingClientRect();
      const words = document.createRange(); words.selectNodeContents(titleEl); const title = words.getBoundingClientRect();
      const hit = (a, b) => !(a.bottom <= b.top + 1 || a.top >= b.bottom - 1 || a.right <= b.left + 1 || a.left >= b.right - 1);
      const problems = [];
      if (hero.classList.contains("avs-below")) problems.push("avs-below");
      if (hit(greet, pill) || pill.top < greet.bottom - 1) problems.push("pill");
      if (hit(title, prof) || hit(title, group)) problems.push("title");
      if (big.right > play.left + 1 || hit(big, group) || hit(big, prof)) problems.push("number");
      if (play.top < group.bottom - 2) problems.push("play");
      if (cambios.top < play.bottom - 2) problems.push("cambios");
      if (hit(cambios, meta) || hit(play, meta)) problems.push("stats");
      if (big.width < 40) problems.push("narrow");
      return problems.join(",") || "ok " + Math.round(cambios.bottom) + "/" + Math.round(meta.top) + " play " + Math.round(play.bottom) + " margin " + getComputedStyle(document.querySelector(".hero .meta")).marginTop;
    })()`);
      if (!String(layout).startsWith("ok")) await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(String(layout).startsWith("ok"), true, String(layout));
    const home = await page.evaluate(() => document.body.innerText);
    assert.match(home, /1 grupo/);
    assert.match(home, /Seguir vuelta/);
    assert.match(home, /handicap index/i);
    assert.match(home, /14,2/);
    assert.match(home, /Última ronda/);
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
    await page.waitForFunction(() => (document.querySelector("#track-shots")?.textContent || "").includes("Seguir track · 2 golpes"), { timeout: 8000 });
    await hideBar();
    const card = await page.evaluate(() => ({ text: document.body.innerText, gaps: document.querySelectorAll(".b.gap").length, pending: document.querySelectorAll(".rc-off").length }));
    assert.match(card.text, /difiere del track/);
    assert.match(card.text, /queda igual/);
    assert.equal(card.gaps > 0, true);
    assert.equal(card.pending, 0);
    assert.equal(card.text.includes("Sin cargar"), false);
    assert.match(card.text, /Seguir track · 2 golpes/);
    assert.equal(card.text.includes("Track Shots"), false);
    await page.screenshot({ path: `${ART}/web-375-rondas-vinculada.png` });
  } finally {
    await browser.close();
    server.close();
  }
});
