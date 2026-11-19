/** «A buena» is a recovery stroke. It stays on the card and out of the club distances. */
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { countsForClub, clubStats, type ShotOut } from "../lib/shots-calc";
import { clubDetail } from "../lib/club-stats";
import { gameMetrics, type GmShot } from "../lib/game-metrics-core";

const clubs = [{ code: "Dr", label: "Driver", enabled: true }, { code: "7i", label: "Hierro 7", enabled: true }];

function shot(over: Partial<ShotOut>): ShotOut {
  return {
    id: "s", hole: 1, shot_number: 1, lat: 1, lng: 1, accuracy_m: 4, club: "7i", lie: "rough", result: "fairway",
    taken_at: "2026-01-01", distance_m: 140, distance_yd: 153, distance_source: "next_shot", to_green_m: 160, to_green_yd: 175,
    source: "gps", distance_kind: "measured", ...over,
  };
}

test("a recovery shot keeps its club and point and does not close the hole", async () => {
  process.env.DATABASE_URL ||= "postgres://golflet_test:golflet_test@127.0.0.1:5432/golflet_reconstruct_test";
  const { parseShot } = await import("../lib/shot-input");
  const row = parseShot({ hole: 1, lat: -38.035, lng: -57.538, club: "7i", intent: "recovery" });
  assert.equal(row.intent, "recovery");
  assert.equal(row.club, "7i");
  assert.equal(row.result, null);
  assert.equal(row.lat, -38.035);
  assert.equal(row.lng, -57.538);
  const bare = parseShot({ hole: 3, lat: -38.034, lng: -57.538, intent: "recovery" });
  assert.equal(bare.club, null);
  assert.equal(bare.result, null);
});

test("a recovery shot does not feed club distances or the first-shot history", () => {
  const measured = shot({ id: "full", club: "7i", distance_m: 140 });
  const punch = shot({ id: "punch", intent: "recovery", distance_m: 35, lie: "rough", shot_number: 2 });
  assert.equal(countsForClub(measured), true);
  assert.equal(countsForClub(punch), false);
  const stats = clubStats([measured, punch], clubs);
  const iron = stats.find(row => row.club === "7i");
  assert.equal(iron?.shots, 1);
  assert.equal(iron?.avg_m, 140);
  const tee = shot({ id: "tee", club: "Dr", lie: "tee", distance_m: 210, to_green_m: 380 });
  const punchTee = shot({ id: "out", club: "Dr", lie: "tee", intent: "recovery", distance_m: 40, shot_number: 1, to_green_m: 400 });
  const detail = clubDetail("Dr", clubs, [tee, punchTee], []);
  assert.equal(detail.tee_shots?.n, 1);
  assert.equal(detail.tee_shots?.avg_yd, Math.round(210 / 0.9144));
  assert.equal(detail.shots_measured, 1);
});

test("a recovery shot is not a drive carry and not an approach", () => {
  const round = { id: "r", date: "2026-11-01", course_label: "Cancha", pars: { 1: 4 }, greens: { 1: { lat: -38.0338, lng: -57.5382 } } };
  const shots: GmShot[] = [
    { live_round_id: "r", hole: 1, shot_number: 1, lat: -38.0374, lng: -57.5382, club: "7i", lie: "rough", result: null, direction: null, intent: "recovery" },
  ];
  const metrics = gameMetrics([round], shots, []);
  assert.equal(metrics.tee.drives, 0);
  assert.equal(metrics.tee.avg_carry_yd, null);
  assert.equal(metrics.empty.approach, true);
});

test("the screen no longer calls A buena a conceded putt", async () => {
  const track = await readFile(new URL("../public/track.js", import.meta.url), "utf8");
  const hole = await readFile(new URL("../../Golflet/Sources/Screens/PlayHoleView.swift", import.meta.url), "utf8");
  assert.equal(track.includes("Hoyo cerrado. A buena cuenta un golpe y un putt"), false);
  assert.equal(track.includes("putt concedido"), false);
  assert.equal(hole.includes("Hoyo cerrado. A buena cuenta un golpe y un putt"), false);
  assert.match(track, /intent: 'recovery'|body\.intent = 'recovery'/);
  assert.match(hole, /intent: "recovery"/);
});

const CHROME = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find(p => existsSync(p));
const ROOT = new URL("../public/", import.meta.url);
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".png": "image/png" };
const GREEN = { lat: -38.03381176, lng: -57.53818687 };
const TEE = { lat: -38.037468, lng: -57.538187 };
const vieja = [{ hole: 1, par: 4, hcp: 3, yards: 445, tee: TEE, green: { front: { lat: -38.03369214, lng: -57.5382432 }, center: GREEN, back: { lat: -38.03392117, lng: -57.53812785 } } }];

test("A buena stays in the shot list and the next shot starts there", { timeout: 120_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const posts: Record<string, unknown>[] = [];
  const shots: Record<string, unknown>[] = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const json = (body: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname.startsWith("/api/")) {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      if (url.pathname === "/api/data") return json({ user: { name: "TEST-ONLY", pending_first_sync: false }, player: { name: "TEST-ONLY" }, hi_history: [], clubs: [], courses: [], rounds: [], bag: [{ club: "PW", carry: 110, total: 115 }] });
      if (url.pathname === "/api/bag") return json([{ club: "PW", carry: 110, total: 115 }, { club: "8i", carry: 130, total: 140 }]);
      if (url.pathname === "/api/club-stats") return json({ clubs: [] });
      if (url.pathname === "/api/reconstructions" && req.method === "GET") return json({ rounds: [], reconstructions: [
        { id: "live-vieja", current_hole: 1, club_code: "209", vm_course: "Cancha Vieja", course: "Cancha Vieja", round_id: null },
      ] });
      if (url.pathname === "/api/gps/courses/209-cancha-vieja") return json({ course: { club_code: "209", course: "Cancha Vieja", holes: vieja } });
      if (url.pathname.endsWith("/shots") && req.method === "POST") {
        const posted = JSON.parse(raw || "{}");
        posts.push(posted);
        shots.push({ id: `s${shots.length + 1}`, shot_number: shots.length + 1, ...posted });
        return json({ shots });
      }
      if (url.pathname.endsWith("/shots")) return json({ shots });
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
    await page.setViewport({ width: 375, height: 812, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    mkdirSync("/opt/cursor/artifacts", { recursive: true });
    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-vieja?hole=1`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#play-good");
    await page.waitForFunction(() => {
      const hit = document.querySelector("#play-hit") as HTMLButtonElement | null;
      const map = document.querySelector("#tkmap");
      return !!hit && !hit.disabled && map?.getAttribute("data-map") === "ready";
    }, { timeout: 25000 });
    await page.screenshot({ path: "/opt/cursor/artifacts/web-375-abuena-boton.png" });
    await page.select("#play-club", "PW");
    for (let i = 0; i < 24; i++) {
      const lat = await page.$eval("#tkmap", el => Number(el.getAttribute("data-cursor-lat")));
      if (Math.abs(lat - -38.0354) < 0.0002) break;
      const south = lat < -38.0354;
      await page.mouse.move(180, south ? 260 : 520);
      await page.mouse.down();
      await page.mouse.move(180, south ? 390 : 340, { steps: 6 });
      await page.mouse.up();
    }
    await page.click("#play-good");
    await page.waitForFunction(() => (document.querySelector("#rc-shots")?.textContent || "").includes("A buena"));
    const list = await page.$eval("#rc-shots", el => el.textContent || "");
    const body = await page.evaluate(() => document.body.innerText);
    assert.match(list, /PW/);
    assert.match(list, /A buena/);
    assert.equal(body.includes("Hoyo cerrado"), false);
    assert.equal(await page.$("#play-conceded"), null);
    assert.ok(await page.$("#play-hit"));
    assert.equal(await page.$("#play-next"), null);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].intent, "recovery");
    assert.equal(posts[0].club, "PW");
    assert.equal(posts[0].result ?? null, null);
    assert.equal(Number.isFinite(Number(posts[0].lat)), true);
    assert.equal(Number.isFinite(Number(posts[0].end_lat)), true);
    await page.screenshot({ path: "/opt/cursor/artifacts/web-375-abuena-golpe.png" });
    await page.waitForFunction(() => {
      const hit = document.querySelector("#play-hit") as HTMLButtonElement | null;
      return !!hit && !hit.disabled;
    }, { timeout: 15000 });
    for (let i = 0; i < 16; i++) {
      const lat = await page.$eval("#tkmap", el => Number(el.getAttribute("data-cursor-lat")));
      if (lat > -38.0346) break;
      await page.mouse.move(180, 280);
      await page.mouse.down();
      await page.mouse.move(180, 400, { steps: 5 });
      await page.mouse.up();
    }
    await page.click("#play-hit");
    await page.waitForFunction(() => (document.querySelectorAll("#rc-shots .tk-shot").length) >= 2);
    assert.equal(posts.length, 2);
    assert.equal(posts[1].intent ?? null, null);
    assert.ok(Math.abs(Number(posts[1].lat) - Number(posts[0].end_lat)) < 0.00008);
    assert.equal((await page.evaluate(() => document.body.innerText)).includes("Hoyo cerrado"), false);
    await page.screenshot({ path: "/opt/cursor/artifacts/web-375-abuena-siguiente.png" });
  } finally {
    await browser.close();
    await new Promise<void>(r => server.close(() => r()));
  }
});
