/** TEST-ONLY. SET and ENTER stay shut until the visible tiles are real imagery. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import test from "node:test";
import { existsSync } from "node:fs";
import { ESRI_BLANK_TILE_SHA256 } from "../lib/play-rules";

const CHROME = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find(p => existsSync(p));
const ROOT = new URL("../public/", import.meta.url);
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".png": "image/png" };
const REAL_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/17/80529/44586";
const BLANK_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/18/161058/89173";

let real: Buffer | null = null;
let blank: Buffer | null = null;
async function imagery() {
  if (real && blank) return { real, blank };
  real = Buffer.from(await (await fetch(REAL_URL)).arrayBuffer());
  blank = Buffer.from(await (await fetch(BLANK_URL)).arrayBuffer());
  assert.equal(createHash("sha256").update(blank).digest("hex"), ESRI_BLANK_TILE_SHA256);
  assert.notEqual(createHash("sha256").update(real).digest("hex"), ESRI_BLANK_TILE_SHA256);
  return { real, blank };
}

type Mode = "hold" | "real" | "placeholder" | "fail";

async function openMap(mode: Mode) {
  const { real: realTile, blank: blankTile } = await imagery();
  const calls: string[] = [];
  const pending: { respond: (r: { status: number; contentType: string; headers?: Record<string, string>; body: Buffer | string }) => Promise<void> }[] = [];
  const gate: { mode: Mode } = { mode };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const json = (body: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname.startsWith("/api/")) {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      calls.push(`${req.method} ${url.pathname}`);
      if (req.method === "POST") calls.push(raw);
      if (url.pathname === "/api/data") return json({ user: { name: "TEST-ONLY", pending_first_sync: false }, player: { name: "TEST-ONLY" }, hi_history: [], clubs: [{ id: "a", club_name: "Club Fixture", rounds: 1, last_sync_status: "ok", password_saved: false, source: "site" }], courses: [], rounds: [] });
      if (url.pathname === "/api/gps/courses/209-cancha-vieja") return json({ course: { holes: [{ hole: 1, par: 4, yards: 445, tee: { lat: -38.037468, lng: -57.538187 }, green: { center: { lat: -38.033812, lng: -57.538187 } } }] } });
      if (url.pathname === "/api/reconstructions" && req.method === "GET") return json({ rounds: [], reconstructions: [{ id: "live-map", current_hole: 1, club_code: "209", vm_course: "Cancha Vieja", course: "Cancha Vieja", round_id: null }] });
      if (url.pathname === "/api/reconstructions" && req.method === "POST") return json({ live_round: { id: "live-map" } }, 201);
      if (url.pathname.endsWith("/shots")) return json({ shots: [] });
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
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true });
  await page.setRequestInterception(true);
  page.on("request", req => {
    let host = "";
    try { host = new URL(req.url()).hostname; } catch { req.continue(); return; }
    if (host !== "server.arcgisonline.com") { req.continue(); return; }
    if (gate.mode === "hold") { pending.push(req); return; }
    if (gate.mode === "fail") { req.respond({ status: 500, contentType: "text/plain", headers: { "access-control-allow-origin": "*" }, body: "no" }); return; }
    req.respond({ status: 200, contentType: "image/jpeg", headers: { "access-control-allow-origin": "*" }, body: gate.mode === "placeholder" ? blankTile : realTile });
  });
  await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-map`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#play-hit");
  const posts = () => calls.filter(c => c.startsWith("POST ") && !c.startsWith("POST /api/tee-times/check"));
  const release = async (next: Mode) => {
    gate.mode = next;
    const queued = pending.splice(0);
    for (const req of queued) {
      if (next === "fail") await req.respond({ status: 500, contentType: "text/plain", headers: { "access-control-allow-origin": "*" }, body: "no" });
      else await req.respond({ status: 200, contentType: "image/jpeg", headers: { "access-control-allow-origin": "*" }, body: next === "placeholder" ? blankTile : realTile });
    }
  };
  return {
    page, calls, posts, gate, release, pending,
    close: async () => { gate.mode = "fail"; for (const req of pending.splice(0)) { try { await req.respond({ status: 500, contentType: "text/plain", headers: { "access-control-allow-origin": "*" }, body: "no" }); } catch { /* already gone */ } } await browser.close(); await new Promise<void>(r => server.close(() => r())); },
  };
}

const force = (page: { evaluate: (fn: (sel: string) => unknown, sel: string) => Promise<unknown> }, id: string) => page.evaluate(sel => {
  const button = document.querySelector(sel) as HTMLButtonElement | null;
  const frame = document.querySelector("#tkmap")?.getAttribute("data-frame") || "";
  if (!button) return { frame, clicked: false };
  button.disabled = false;
  button.click();
  return { frame, after: document.querySelector("#tkmap")?.getAttribute("data-frame") || "", clicked: true };
}, id);

test("a loading map does not take SET, and real tiles then unlock it", { timeout: 60_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const session = await openMap("hold");
  try {
    const early = await session.page.evaluate(() => ({
      map: document.querySelector("#tkmap")?.getAttribute("data-map") || "",
      phase: document.querySelector("#tkmap")?.getAttribute("data-phase") || "",
      hit: (document.querySelector("#play-hit") as HTMLButtonElement | null)?.disabled ?? null,
      set: document.querySelector("#play-set"),
    }));
    assert.equal(early.map, "loading");
    assert.equal(early.phase, "tracking");
    assert.equal(early.hit, true);
    assert.equal(early.set, null);
    const moved = await force(session.page, "#play-hit");
    assert.equal((moved as { frame: string }).frame, (moved as { after: string }).after);
    assert.deepEqual(session.posts(), []);
    await session.release("real");
    await session.page.waitForFunction(() => document.querySelector("#tkmap")?.getAttribute("data-map") === "ready", { timeout: 20000 });
    const open = await session.page.evaluate(() => (document.querySelector("#play-hit") as HTMLButtonElement).disabled);
    assert.equal(open, false);
    assert.deepEqual(session.posts(), []);
  } finally { await session.close(); }
});

test("the HTTP 200 placeholder stays on screen and does not enable SET or ENTER", { timeout: 60_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const session = await openMap("placeholder");
  try {
    await session.page.waitForFunction(() => document.querySelector("#tkmap")?.getAttribute("data-map") === "blocked");
    await session.page.waitForFunction(() => [...document.querySelectorAll(".tk-tile")].some(img => (img as HTMLImageElement).naturalWidth > 50));
    const view = await session.page.evaluate(() => ({
      hit: (document.querySelector("#play-hit") as HTMLButtonElement).disabled,
      set: document.querySelector("#play-set"),
      shown: [...document.querySelectorAll(".tk-tile")].some(img => (img as HTMLImageElement).naturalWidth > 50),
      banner: document.querySelector("#tk-maperr")?.textContent || "",
      hidden: (document.querySelector("#tk-maperr") as HTMLElement).hidden,
    }));
    assert.equal(view.hit, true);
    assert.equal(view.set, null);
    assert.equal(view.shown, true);
    assert.equal(view.hidden, false);
    assert.match(view.banner, /no tiene imagen/);
    const moved = await force(session.page, "#play-hit");
    assert.equal((moved as { frame: string }).frame, "play");
    assert.equal((moved as { after: string }).after, "play");
    assert.deepEqual(session.posts(), []);
  } finally { await session.close(); }
});

test("a failed map stays blocked and retry accepts real tiles", { timeout: 60_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const session = await openMap("fail");
  try {
    await session.page.waitForFunction(() => document.querySelector("#tkmap")?.getAttribute("data-map") === "blocked");
    const banner = await session.page.$eval("#tk-maperr", el => ({ text: el.textContent || "", hidden: (el as HTMLElement).hidden }));
    assert.equal(banner.hidden, false);
    assert.match(banner.text, /no cargó/);
    assert.equal(await session.page.evaluate(() => (document.querySelector("#play-hit") as HTMLButtonElement).disabled), true);
    await force(session.page, "#play-hit");
    assert.deepEqual(session.posts(), []);
    session.gate.mode = "real";
    await session.page.click("#tk-retry");
    await session.page.waitForFunction(() => document.querySelector("#tkmap")?.getAttribute("data-map") === "ready", { timeout: 20000 });
    assert.equal(await session.page.evaluate(() => (document.querySelector("#play-hit") as HTMLButtonElement).disabled), false);
  } finally { await session.close(); }
});

test("zooming drops the previous ready state until the new tiles are real", { timeout: 60_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const session = await openMap("real");
  try {
    await session.page.waitForFunction(() => document.querySelector("#tkmap")?.getAttribute("data-map") === "ready", { timeout: 20000 });
    const startZ = await session.page.$eval("#tkmap", el => el.getAttribute("data-tile-z"));
    session.gate.mode = "hold";
    let saw = "";
    for (let i = 0; i < 8 && !saw; i++) {
      await session.page.click("#play-zoom-out");
      const state = await session.page.evaluate(() => ({
        map: document.querySelector("#tkmap")?.getAttribute("data-map") || "",
        z: document.querySelector("#tkmap")?.getAttribute("data-tile-z") || "",
        set: (document.querySelector("#play-hit") as HTMLButtonElement).disabled,
        frame: document.querySelector("#tkmap")?.getAttribute("data-frame") || "",
      }));
      if (state.z !== startZ) saw = JSON.stringify(state);
    }
    const state = JSON.parse(saw) as { map: string; set: boolean; frame: string };
    assert.equal(state.map, "loading");
    assert.equal(state.set, true);
    assert.equal(state.frame, "play");
    await force(session.page, "#play-hit");
    assert.equal(await session.page.$eval("#tkmap", el => el.getAttribute("data-frame")), "play");
    assert.deepEqual(session.posts(), []);
    await session.release("real");
    await session.page.waitForFunction(() => document.querySelector("#tkmap")?.getAttribute("data-map") === "ready", { timeout: 20000 });
  } finally { await session.close(); }
});
