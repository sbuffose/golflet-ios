/** TEST-ONLY. Manual shot map: penalty is a stroke, the next shot starts at the drop. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import test from "node:test";

const CHROME = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find(p => existsSync(p));
const ROOT = new URL("../public/", import.meta.url);
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".png": "image/png" };
const holes = [
  { hole: 1, par: 4, yards: 380, tee: { lat: -34.6, lng: -58.4 }, green: { center: { lat: -34.601, lng: -58.401 } } },
  { hole: 2, par: 3, yards: 150, tee: { lat: -34.7, lng: -58.5 }, green: { center: { lat: -34.7012, lng: -58.5004 } } },
];
const greenRing = [
  { lat: -34.5995, lng: -58.3995 },
  { lat: -34.5995, lng: -58.4005 },
  { lat: -34.6005, lng: -58.4005 },
  { lat: -34.6005, lng: -58.3995 },
];

function near(a: number, b: number) {
  return Math.abs(a - b) < 1e-5;
}

test("penalty, drop and the next shot keep separate origins", { timeout: 90_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const shots: Record<string, unknown>[] = [];
  const posts: unknown[] = [];
  const deleted: string[] = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (body: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname.startsWith("/api/")) {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      if (url.pathname === "/api/data") return json({ user: { name: "TEST-ONLY", pending_first_sync: false }, player: { name: "TEST-ONLY" }, hi_history: [], clubs: [], courses: [], rounds: [] });
      if (url.pathname.startsWith("/api/gps/courses/fx-")) return json({ course: { club_code: "fx", course: "Cancha Fixture", holes } });
      if (url.pathname === "/api/course-maps/fx/Cancha%20Fixture" || url.pathname === "/api/course-maps/fx/Cancha Fixture") return json({ holes: [] });
      if (url.pathname === "/api/course-maps/fx/Green%20Fixture" || url.pathname === "/api/course-maps/fx/Green Fixture") {
        return json({ holes: [{ hole: 1, green: { polygon: greenRing } }] });
      }
      if (url.pathname === "/api/reconstructions" && req.method === "GET") {
        return json({
          rounds: [],
          reconstructions: [
            { id: "live-map", current_hole: 1, club_code: "fx", vm_course: "Cancha Fixture", course: "Cancha Fixture", round_id: null },
            { id: "live-pen", current_hole: 1, club_code: "fx", vm_course: "Cancha Fixture", course: "Cancha Fixture", round_id: null },
            { id: "live-green", current_hole: 1, club_code: "fx", vm_course: "Green Fixture", course: "Green Fixture", round_id: null },
          ],
        });
      }
      if (url.pathname === "/api/reconstructions/live-pen/shots" && req.method === "GET") {
        return json({ shots: [
          { id: "p1", hole: 1, club: "7i", result: null, penalty_strokes: 0, lat: -34.6, lng: -58.4, end_lat: -34.6004, end_lng: -58.4002 },
          { id: "p2", hole: 1, club: null, result: "penalty", penalty_strokes: 1, lat: -34.6004, lng: -58.4002, end_lat: -34.6008, end_lng: -58.4006 },
        ] });
      }
      if (url.pathname === "/api/reconstructions/live-map/shots" && req.method === "POST") {
        const posted = JSON.parse(raw || "{}");
        posts.push(posted);
        shots.push({ id: `s${shots.length + 1}`, ...posted });
        return json({ shots });
      }
      if (url.pathname === "/api/reconstructions/live-map/shots" && req.method === "DELETE") {
        deleted.push(url.searchParams.get("shot") || "");
        shots.pop();
        return json({});
      }
      if (url.pathname === "/api/reconstructions/live-map/shots" && req.method === "GET") return json({ shots });
      if (url.pathname === "/api/reconstructions/live-green/shots" && req.method === "POST") {
        const posted = JSON.parse(raw || "{}");
        posts.push(posted);
        return json({ shots: [{ id: "g1", ...posted }] });
      }
      if (url.pathname.endsWith("/shots")) return json({ shots: [] });
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
  const ready = (page: { waitForFunction: (fn: () => boolean, opts?: { timeout?: number }) => Promise<unknown> }) =>
    page.waitForFunction(() => document.querySelector("#tkmap")?.getAttribute("data-map") === "ready", { timeout: 25000 });
  const pan = async (page: { mouse: { move: (x: number, y: number, opts?: { steps?: number }) => Promise<void>; down: () => Promise<void>; up: () => Promise<void> } }, dx: number, dy: number) => {
    await page.mouse.move(200, 360);
    await page.mouse.down();
    await page.mouse.move(200 + dx, 360 + dy, { steps: 8 });
    await page.mouse.up();
  };
  const cursor = (page: { $eval: (sel: string, fn: (el: Element) => { lat: number; lng: number; phase: string; ball: string }) => Promise<{ lat: number; lng: number; phase: string; ball: string }> }) =>
    page.$eval("#tkmap", el => ({
      lat: Number(el.getAttribute("data-cursor-lat")),
      lng: Number(el.getAttribute("data-cursor-lng")),
      phase: el.getAttribute("data-phase") || "",
      ball: el.getAttribute("data-ball-lat") || "",
    }));
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true });
    await page.setRequestInterception(true);
    page.on("request", req => {
      const host = new URL(req.url()).hostname;
      if (host !== "127.0.0.1" && host !== "localhost" && host !== "server.arcgisonline.com") req.abort();
      else req.continue();
    });
    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-map?hole=1`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#play-cancel");
    await page.waitForFunction(() => { const v = document.querySelector("#tkmap")?.getAttribute("data-cmap"); return v === "0" || v === "1"; });
    await page.click("#play-cancel");
    await page.waitForFunction(() => (document.querySelector("#tkro")?.textContent || "").includes("el hoyo"));
    await page.click("#play-cancel");
    await page.waitForSelector("#play-hit");
    await page.select("#play-club", "7i");
    await ready(page);
    await page.click("#play-hit");
    await page.waitForSelector(".tk-shot-n");
    assert.equal((posts[0] as { club: string }).club, "7i");
    assert.equal((posts[0] as { penalty_strokes: number }).penalty_strokes, 0);

    await pan(page, -70, 40);
    await page.click("#play-penalty");
    await page.waitForFunction(() => document.querySelector("#play-reticle")?.getAttribute("data-cursor") === "penalty");
    await pan(page, -40, 30);
    const lost = await cursor(page);
    await ready(page);
    await page.click("#play-hit");
    await page.waitForSelector("#play-drop");
    const penalty = posts[1] as { penalty_strokes: number; result: string; end_lat: number; end_lng: number; lat: number; club: string | null };
    assert.equal(posts.length, 2);
    assert.equal(penalty.penalty_strokes, 1);
    assert.equal(penalty.result, "penalty");
    assert.equal(penalty.club, null);
    assert.ok(near(penalty.end_lat, lost.lat) && near(penalty.end_lng, lost.lng));
    assert.ok(!near(penalty.lat, penalty.end_lat));
    assert.equal(await page.$("#play-hit"), null);
    assert.notEqual(await page.$("#play-reload"), null);
    assert.notEqual(await page.$(".tk-lost"), null);
    assert.notEqual(await page.$eval("#tkmap", el => el.getAttribute("data-ball-lat")), String(penalty.end_lat));
    assert.match(await page.$eval("#rc-shots", el => el.textContent || ""), /Penalidad/);

    await page.click("#play-drop");
    await page.waitForFunction(() => document.querySelector("#play-reticle")?.getAttribute("data-cursor") === "drop");
    assert.equal(await page.$eval("#play-reticle b", el => el.textContent), "3");
    await pan(page, 90, -20);
    const dropAt = await cursor(page);
    assert.ok(!near(dropAt.lat, penalty.end_lat));
    const postsBeforeSet = posts.length;
    await ready(page);
    await page.click("#play-set");
    await page.waitForFunction(() => document.querySelector("#tkmap")?.getAttribute("data-phase") === "tracking");
    assert.equal(posts.length, postsBeforeSet);
    const origin = await page.$eval("#tkmap", el => el.getAttribute("data-ball-lat") || "");
    assert.ok(near(Number(origin), dropAt.lat));
    await pan(page, 30, 50);
    await ready(page);
    await page.click("#play-hit");
    await page.waitForFunction(() => document.querySelectorAll(".tk-shot-n").length === 2);
    const played = posts[2] as { penalty_strokes: number; lat: number; lng: number; end_lat: number; club: string };
    assert.equal(played.penalty_strokes, 0);
    assert.ok(near(played.lat, dropAt.lat) && near(played.lng, dropAt.lng));
    assert.ok(!near(played.lat, penalty.end_lat));
    assert.ok(!near(played.end_lat, played.lat));
    assert.equal(played.club, "7i");
    assert.deepEqual(await page.$$eval(".tk-shot-n", nodes => nodes.map(node => node.textContent)), ["1", "3"]);
    assert.notEqual(await page.$(".tk-drop-line"), null);
    assert.equal((await page.evaluate(() => document.body.innerText)).includes("SG"), false);

    await page.click("#play-undo");
    await page.waitForFunction(() => document.querySelectorAll(".tk-shot-n").length === 1);
    assert.equal(deleted.length, 1);
    assert.equal(shots.length, 2);
    await page.click("#play-undo");
    await page.waitForSelector("#play-drop");
    assert.equal(deleted.length, 1);
    assert.equal(shots.length, 2);
    assert.equal(await page.$eval("#tkmap", el => el.getAttribute("data-phase")), "relief");

    await page.click("#tknext");
    await page.waitForFunction(() => document.querySelector("#tk-hole b")?.textContent === "Hoyo 2");
    const next = await page.evaluate(() => ({
      frame: document.querySelector("#tkmap")?.getAttribute("data-frame") || "",
      aim: document.querySelector("#tkmap")?.getAttribute("data-aim-lat") || "",
    }));
    assert.equal(next.frame, "tee");
    assert.equal(next.aim.startsWith("-34.7"), true);

    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-pen`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#play-drop");
    const resumed = await page.evaluate(() => ({
      phase: document.querySelector("#tkmap")?.getAttribute("data-phase") || "",
      ball: document.querySelector("#tkmap")?.getAttribute("data-ball-lat") || "",
      lost: document.querySelector(".tk-lost")?.getAttribute("data-lat") || "",
      hit: !!document.querySelector("#play-hit"),
      reload: !!document.querySelector("#play-reload"),
    }));
    assert.equal(resumed.phase, "relief");
    assert.equal(resumed.hit, false);
    assert.equal(resumed.reload, true);
    assert.ok(resumed.ball.startsWith("-34.6004"));
    assert.ok(resumed.lost.startsWith("-34.6008"));
    assert.notEqual(resumed.ball, resumed.lost);

    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-green`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#play-cancel");
    await page.waitForFunction(() => document.querySelector("#tkmap")?.getAttribute("data-cmap") === "1");
    await page.click("#play-cancel");
    await page.waitForFunction(() => (document.querySelector("#tkro")?.textContent || "").includes("el hoyo"));
    await page.click("#play-cancel");
    await page.waitForFunction(() => document.querySelector("#tkmap")?.getAttribute("data-lie") === "green");
    await ready(page);
    await page.click("#play-hit");
    await page.waitForSelector(".tk-shot-n");
    assert.equal((posts.at(-1) as { club: string }).club, "Pt");
  } finally {
    await browser.close();
    await new Promise<void>(r => server.close(() => r()));
  }
});
