/** TRACK frames Cancha Vieja from course_map_hole, not from a tee invented on the green. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import test from "node:test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { VIEJA_GREEN_AXIS } from "../lib/golfistics-axis";

const CHROME = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find(p => existsSync(p));
const ROOT = new URL("../public/", import.meta.url);
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".png": "image/png" };
const rows = JSON.parse(readFileSync(new URL("./fixtures/course-map-holes.json", import.meta.url), "utf8")) as { course: string; hole: number; data: any }[];
const vieja = rows.filter(r => r.course === "Cancha Vieja");
const gpsHole = (row: { hole: number; data: any }) => {
  const g = row.data.green || {};
  const ll = (p: number[] | null) => p ? { lat: p[1], lng: p[0] } : null;
  return { hole: row.hole, par: 4, yards: 380, hcp: row.hole, green: { front: ll(g.front), center: ll(g.center), back: ll(g.back) } };
};
const gps = [
  ...vieja.map(gpsHole),
  ...[7, 16].map(n => {
    const h = VIEJA_GREEN_AXIS.find(x => x.hole === n)!;
    return { hole: n, par: 4, yards: 380, hcp: n, green: { front: h.front, center: h.center, back: h.back } };
  }),
];

test("Cancha Vieja abre con la salida del mapa y el hoyo 7 pide confirmarla", { timeout: 90_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const path = decodeURIComponent(url.pathname);
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (body: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (path.startsWith("/api/")) {
      for await (const chunk of req) void chunk;
      if (path === "/api/data") return json({ user: { name: "TEST-ONLY", pending_first_sync: false }, player: { name: "TEST-ONLY" }, hi_history: [], clubs: [], courses: [], rounds: [] });
      if (path === "/api/gps/courses/209-cancha-vieja") return json({ course: { club_code: "209", course: "Cancha Vieja", holes: gps } });
      if (path === "/api/course-maps/209/Cancha Vieja") return json({ club_code: "209", course: "Cancha Vieja", holes: vieja.map(r => ({ ...r.data, hole: r.hole })) });
      if (path === "/api/reconstructions" && req.method === "GET") return json({ rounds: [], reconstructions: [
        { id: "live-map", current_hole: 1, club_code: "209", vm_course: "Cancha Vieja", course: "Cancha Vieja", round_id: null },
      ] });
      if (path.endsWith("/shots")) return json({ shots: [] });
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
  const teeOf = (n: number) => {
    const row = vieja.find(r => r.hole === n)!;
    return { lat: row.data.tees[0].center[1] as number, lng: row.data.tees[0].center[0] as number };
  };
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const open = async (hole: number) => {
      await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-map?hole=${hole}`, { waitUntil: "networkidle0" });
      await page.waitForSelector("#tkmap");
    };
    await open(1);
    const tee = teeOf(1);
    await page.waitForFunction(lat => {
      const map = document.querySelector("#tkmap");
      return map?.getAttribute("data-span") === "1" && Math.abs(Number(map.getAttribute("data-ball-lat")) - lat) < 1e-5;
    }, { timeout: 20000 }, tee.lat);
    await page.waitForFunction(() => document.querySelector("#tkmap")?.getAttribute("data-drawn") === "1" && document.querySelector("#tkmap")?.getAttribute("data-moving") === "0");
    const framed = await page.evaluate(() => {
      const map = document.querySelector("#tkmap");
      const hit = document.querySelector("#play-hit") as HTMLElement | null;
      return { bearing: map?.getAttribute("data-bearing") || "", span: map?.getAttribute("data-span") || "", hit: hit ? hit.getBoundingClientRect().width : 0 };
    });
    assert.equal(framed.span, "1");
    assert.notEqual(framed.bearing, "");
    assert.ok(framed.hit > 0 && framed.hit <= 72);
    await page.screenshot({ path: join(art, "vieja-h1-map-390.png") });
    await page.click("#play-club-tile");
    await page.waitForSelector("#play-club-list button");
    const pill = await page.$eval("#play-club-list button", el => el.getBoundingClientRect().height);
    assert.ok(pill <= 34, `pill ${pill}`);
    await page.screenshot({ path: join(art, "vieja-h1-clubs-390.png") });
    await page.screenshot({ path: join(art, "track-390-club-list.png") });
    await open(2);
    const tee2 = teeOf(2);
    await page.waitForFunction(lat => Math.abs(Number(document.querySelector("#tkmap")?.getAttribute("data-ball-lat")) - lat) < 1e-5, { timeout: 20000 }, tee2.lat);
    await page.waitForFunction(() => document.querySelector("#tkmap")?.getAttribute("data-span") === "1" && document.querySelector("#tkmap")?.getAttribute("data-drawn") === "1");
    await page.screenshot({ path: join(art, "vieja-h2-map-390.png") });
    await open(7);
    await page.waitForFunction(() => (document.querySelector("#tkro")?.textContent || "").includes("Arrastrá para confirmar la salida"));
    await page.waitForFunction(() => document.querySelector("#tkmap")?.getAttribute("data-drawn") === "1" && document.querySelector("#tkmap")?.getAttribute("data-moving") === "0");
    const confirm = await page.evaluate(() => {
      const map = document.querySelector("#tkmap");
      const set = document.querySelector("#play-set") as HTMLElement;
      const cancel = document.querySelector("#play-cancel") as HTMLElement;
      const ss = getComputedStyle(set), cs = getComputedStyle(cancel);
      return {
        span: map?.getAttribute("data-span") || "",
        z: Number(map?.getAttribute("data-z") || 0),
        imagery: map?.getAttribute("data-imagery") || "",
        set: parseFloat(ss.fontSize),
        cancel: parseFloat(cs.fontSize),
        sw: set.getBoundingClientRect().width,
        cw: cancel.getBoundingClientRect().width,
        sh: set.getBoundingClientRect().height,
      };
    });
    assert.equal(confirm.span, "");
    assert.ok(confirm.z <= 17.05, `zoom ${confirm.z}`);
    assert.equal(confirm.imagery, "native");
    assert.ok(confirm.set <= 14 && confirm.cancel <= 14, JSON.stringify(confirm));
    assert.ok(Math.abs(confirm.sw - confirm.cw) < 2);
    assert.ok(confirm.sh <= 52);
    await page.screenshot({ path: join(art, "vieja-h7-confirm-390.png") });
  } finally {
    await browser.close();
    await new Promise<void>(r => server.close(() => r()));
  }
});
