/** TEST-ONLY. Manual shot map: penalty is a stroke, the next shot starts at the drop. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, mkdirSync } from "node:fs";
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
const shaped = [
  { hole: 1, par: 4, yards: { BLANCO: 380, AZUL: "410" }, tee: { lat: -34.6, lng: -58.4 }, green: { center: { lat: -34.601, lng: -58.401 } } },
  { hole: 2, par: 3, yards: { BLANCO: 156 }, tee: { lat: -34.7, lng: -58.5 }, green: { center: { lat: -34.7012, lng: -58.5004 } } },
  { hole: 3, par: 4, yards: { BLANCO: 390 }, green: { center: { lat: -34.602, lng: -58.402 } } },
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
function apart(aLat: number, aLng: number, bLat: number, bLng: number) {
  return Math.hypot(aLat - bLat, aLng - bLng) > 1e-5;
}

test("penalty, drop and the next shot keep separate origins", { timeout: 120_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const shots: Record<string, unknown>[] = [];
  const posts: unknown[] = [];
  const deleted: string[] = [];
  const shotApi: string[] = [];
  const bagRows: unknown[] = [
    { club: "Driver", carry: 300, total: 300 },
    { club: "7i", carry: 165, total: 165 },
    { club: "SW", carry: 105, total: 105 },
  ];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (body: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname.startsWith("/api/")) {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      if (url.pathname.includes("/shots")) shotApi.push(`${req.method} ${url.pathname}${url.search}`);
      if (url.pathname === "/api/data") return json({ user: { name: "TEST-ONLY", pending_first_sync: false }, player: { name: "TEST-ONLY" }, hi_history: [], clubs: [], courses: [], rounds: [] });
      if (url.pathname === "/api/bag") return json(bagRows);
      if (url.pathname === "/api/gps/courses/fx-forma-fixture") return json({ course: { club_code: "fx", course: "Forma Fixture", holes: shaped } });
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
            { id: "live-shape", current_hole: 1, club_code: "fx", vm_course: "Forma Fixture", course: "Forma Fixture", round_id: null },
            { id: "live-resume", current_hole: 2, club_code: "fx", vm_course: "Forma Fixture", course: "Forma Fixture", round_id: null },
            { id: "live-stale", current_hole: 2, club_code: "fx", vm_course: "Forma Fixture", course: "Forma Fixture", round_id: null },
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
      if (url.pathname === "/api/reconstructions/live-stale/shots" && req.method === "GET") {
        return json({ shots: [
          { id: "t1", hole: 2, club: "58°", result: null, penalty_strokes: 0, lat: -34.7, lng: -58.5, end_lat: -34.7004, end_lng: -58.5001 },
        ] });
      }
      if (url.pathname === "/api/reconstructions/live-resume/shots" && req.method === "GET") {
        return json({ shots: [
          { id: "r1", hole: 2, club: "SW", result: null, penalty_strokes: 0, lat: -34.7, lng: -58.5, end_lat: -34.7006, end_lng: -58.5002 },
        ] });
      }
      if (url.pathname.endsWith("/shots") && req.method === "POST") {
        const posted = JSON.parse(raw || "{}");
        posts.push(posted);
        return json({ shots: [{ id: `x${posts.length}`, ...posted }] });
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
    page.waitForFunction(() => {
      const map = document.querySelector("#tkmap");
      if (!map) return false;
      const cmap = map.getAttribute("data-cmap");
      if (map.getAttribute("data-map") !== "ready" || map.getAttribute("data-drawn") !== "1" || map.getAttribute("data-moving") !== "0") return false;
      if (cmap !== "0" && cmap !== "1") return false;
      for (const id of ["#play-hit", "#play-set"]) {
        const button = document.querySelector(id) as HTMLButtonElement | null;
        if (button && button.disabled) return false;
      }
      return true;
    }, { timeout: 25000 });
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
    await page.waitForSelector("#play-hit");
    await page.waitForFunction(() => { const v = document.querySelector("#tkmap")?.getAttribute("data-cmap"); return v === "0" || v === "1"; });
    assert.equal(await page.$eval("#tkmap", el => el.getAttribute("data-phase")), "tracking");
    assert.equal(await page.$eval(".tk-aim-n", el => el.textContent), "1");
    await page.select("#play-club", "7i");
    await ready(page);
    await page.click("#play-hit");
    await page.waitForSelector(".tk-shot-n");
    assert.equal((posts[0] as { club: string }).club, "7i");
    assert.equal((posts[0] as { penalty_strokes: number }).penalty_strokes, 0);

    await pan(page, -70, 40);
    await page.click("#play-penalty");
    await page.click("#play-pen-stroke");
    await page.waitForFunction(() => document.querySelector("#play-reticle")?.getAttribute("data-cursor") === "penalty");
    await page.screenshot({ path: "/opt/cursor/artifacts/track-390-penalty.png" });
    await pan(page, -40, 30);
    const lost = await cursor(page);
    await ready(page);
    await page.click("#play-hit");
    await page.waitForSelector("#play-drop");
    const penalty = posts[1] as { penalty_strokes: number; result: string; end_lat: number; end_lng: number; lat: number; lng: number; club: string | null };
    assert.equal(posts.length, 2);
    assert.equal(penalty.penalty_strokes, 1);
    assert.equal(penalty.result, "penalty");
    assert.equal(penalty.club, null);
    assert.ok(near(penalty.end_lat, lost.lat) && near(penalty.end_lng, lost.lng));
    assert.ok(apart(penalty.lat, penalty.lng, penalty.end_lat, penalty.end_lng));
    assert.equal(await page.$("#play-hit"), null);
    assert.notEqual(await page.$("#play-reload"), null);
    assert.notEqual(await page.$(".tk-lost"), null);
    assert.notEqual(await page.$eval("#tkmap", el => el.getAttribute("data-ball-lat")), String(penalty.end_lat));
    assert.match(await page.$eval("#rc-shots", el => el.textContent || ""), /Penalidad/);

    await page.click("#play-drop");
    await page.waitForFunction(() => document.querySelector("#play-reticle")?.getAttribute("data-cursor") === "drop");
    await page.screenshot({ path: "/opt/cursor/artifacts/track-390-drop.png" });
    assert.equal(await page.$eval("#play-reticle b", el => el.textContent), "3");
    await pan(page, 90, -20);
    const dropAt = await cursor(page);
    assert.ok(apart(dropAt.lat, dropAt.lng, penalty.end_lat, penalty.end_lng));
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
    const played = posts[2] as { penalty_strokes: number; lat: number; lng: number; end_lat: number; end_lng: number; club: string };
    assert.equal(played.penalty_strokes, 0);
    assert.ok(near(played.lat, dropAt.lat) && near(played.lng, dropAt.lng));
    assert.ok(apart(played.lat, played.lng, penalty.end_lat, penalty.end_lng));
    assert.ok(apart(played.end_lat, played.end_lng, played.lat, played.lng));
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

    const postsAtRelief = posts.length;
    const deletedAtRelief = deleted.length;
    await page.click("#play-reload");
    await page.waitForFunction(() => document.querySelector("#tkmap")?.getAttribute("data-phase") === "tracking");
    assert.equal(posts.length, postsAtRelief);
    assert.equal(deleted.length, deletedAtRelief);
    await page.click("#play-penalty");
    await page.click("#play-pen-stroke");
    await page.waitForFunction(() => document.querySelector("#play-reticle")?.getAttribute("data-cursor") === "penalty");
    await ready(page);
    await page.click("#play-hit");
    await page.waitForSelector("#play-drop");
    assert.equal(posts.length, postsAtRelief + 1);
    assert.equal((posts.at(-1) as { penalty_strokes: number; result: string }).penalty_strokes, 1);
    assert.equal((posts.at(-1) as { result: string }).result, "penalty");
    await page.click("#play-drop");
    await page.waitForFunction(() => document.querySelector("#play-reticle")?.getAttribute("data-cursor") === "drop");
    const postsBeforeSecondSet = posts.length;
    await ready(page);
    await page.click("#play-set");
    await page.waitForFunction(() => document.querySelector("#tkmap")?.getAttribute("data-phase") === "tracking");
    assert.equal(posts.length, postsBeforeSecondSet);
    await ready(page);
    await page.click("#play-hit");
    await page.waitForFunction(() => document.querySelectorAll(".tk-shot-n").length === 2);
    await page.click("#play-undo");
    await page.waitForFunction(() => document.querySelectorAll(".tk-shot-n").length === 1);
    assert.equal(deleted.length, deletedAtRelief + 1);
    assert.equal(shots.length, 3);
    await page.click("#play-undo");
    await page.waitForSelector("#play-drop");
    assert.equal(deleted.length, deletedAtRelief + 1);
    assert.equal(shots.length, 3);
    assert.equal(await page.$eval("#tkmap", el => el.getAttribute("data-phase")), "relief");
    assert.deepEqual(shotApi.filter(line => line.includes("/live-map/shots")), [
      "GET /api/reconstructions/live-map/shots",
      "POST /api/reconstructions/live-map/shots",
      "POST /api/reconstructions/live-map/shots",
      "POST /api/reconstructions/live-map/shots",
      "DELETE /api/reconstructions/live-map/shots?shot=s3",
      "GET /api/reconstructions/live-map/shots",
      "POST /api/reconstructions/live-map/shots",
      "POST /api/reconstructions/live-map/shots",
      "DELETE /api/reconstructions/live-map/shots?shot=s4",
      "GET /api/reconstructions/live-map/shots",
    ]);

    await page.click("#tknext");
    await page.waitForFunction(() => document.querySelector(".tk-hn b")?.textContent === "Hoyo 2");
    const next = await page.evaluate(() => ({
      frame: document.querySelector("#tkmap")?.getAttribute("data-frame") || "",
      aim: document.querySelector("#tkmap")?.getAttribute("data-aim-lat") || "",
    }));
    assert.equal(next.frame, "play");
    assert.equal(next.aim.startsWith("-34.7"), true);
    assert.notEqual(await page.$eval("#play-club", el => (el as HTMLSelectElement).value), "Driver");
    assert.notEqual(await page.$eval("#play-club", el => (el as HTMLSelectElement).value), "Dr");
    assert.equal(await page.$eval("#play-club", el => el.querySelector("option[value='']")?.textContent), "Elegir palo");
    assert.equal((await page.evaluate(() => document.body.innerText)).includes("Después"), false);

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
    await page.waitForSelector("#play-hit");
    await page.waitForFunction(() => document.querySelector("#tkmap")?.getAttribute("data-cmap") === "1");
    await page.waitForFunction(() => document.querySelector("#tkmap")?.getAttribute("data-lie") === "green");
    await ready(page);
    await page.click("#play-hit");
    await page.waitForSelector(".tk-shot-n");
    assert.equal((posts.at(-1) as { club: string }).club, "Pt");

    const beforeShape = posts.length;
    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-shape?hole=1`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#play-hit");
    const opened = await page.evaluate(() => {
      const club = document.querySelector("#play-club") as HTMLSelectElement | null;
      const text = document.body.innerText || "";
      return {
        phase: document.querySelector("#tkmap")?.getAttribute("data-phase") || "",
        frame: document.querySelector("#tkmap")?.getAttribute("data-frame") || "",
        aim: document.querySelector("#tkmap")?.getAttribute("data-aim-lat") || "",
        ball: document.querySelector("#tkmap")?.getAttribute("data-ball-lat") || "",
        origin: document.querySelector(".tk-origin")?.getAttribute("data-lat") || "",
        aimN: document.querySelector(".tk-aim-n")?.textContent || "",
        club: club?.value || "",
        label: club?.selectedOptions[0]?.textContent || "",
        blank: !!club?.querySelector("option[value='']"),
        hole: document.querySelector(".tk-hn")?.textContent || "",
        text,
      };
    });
    assert.equal(opened.phase, "tracking");
    assert.equal(opened.frame, "play");
    assert.ok(opened.aim.startsWith("-34.6") && !opened.aim.startsWith("-34.601"));
    assert.equal(opened.ball, opened.origin);
    assert.equal(opened.aimN, "1");
    assert.equal(opened.club, "Driver");
    assert.equal(opened.label, "Driver");
    assert.equal(opened.blank, false);
    assert.match(opened.hole, /410 yd/);
    assert.equal(opened.hole.includes("[object Object]"), false);
    assert.equal(opened.text.includes("[object Object]"), false);
    assert.equal(opened.text.includes("Después"), false);
    await ready(page);
    mkdirSync("/opt/cursor/artifacts", { recursive: true });
    for (const w of [320, 390, 430]) {
      await page.setViewport({ width: w, height: 844, hasTouch: true, isMobile: true });
      await ready(page);
      await page.screenshot({ path: `/opt/cursor/artifacts/track-shot-${w}.png` });
    }
    await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true });
    await page.screenshot({ path: "/opt/cursor/artifacts/track-shot-ready.png" });
    const z0 = await page.$eval("#tkmap", el => Number(el.getAttribute("data-z")));
    await page.click("#play-zoom-in");
    await page.click("#play-zoom-in");
    const zoomed = await page.evaluate(() => ({
      z: Number(document.querySelector("#tkmap")?.getAttribute("data-z") || 0),
      tile: Number(document.querySelector("#tkmap")?.getAttribute("data-tile-z") || 0),
      imagery: document.querySelector("#tkmap")?.getAttribute("data-imagery") || "",
      phase: document.querySelector("#tkmap")?.getAttribute("data-phase") || "",
      ball: document.querySelector("#tkmap")?.getAttribute("data-ball-lat") || "",
    }));
    assert.ok(zoomed.z > z0);
    assert.ok(zoomed.tile <= 17);
    assert.equal(zoomed.phase, "tracking");
    assert.equal(zoomed.ball, opened.ball);
    if (zoomed.z > 17.05) assert.equal(zoomed.imagery, "scaled");
    assert.equal(posts.length, beforeShape);
    await page.mouse.move(200, 360);
    await page.mouse.down();
    await page.mouse.move(120, 300, { steps: 6 });
    await page.mouse.up();
    assert.equal(await page.$eval("#tkmap", el => el.getAttribute("data-ball-lat")), opened.ball);
    assert.equal(posts.length, beforeShape);
    await page.click("#play-zoom-out");
    await page.click("#play-zoom-out");
    await page.click("#play-zoom-out");
    const zBeforePinch = await page.$eval("#tkmap", el => Number(el.getAttribute("data-z")));
    const pinched = await page.evaluate(`(() => {
      const map = document.querySelector("#tkmap");
      const fire = (type, id, x, y) => map.dispatchEvent(new PointerEvent(type, {
        pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: "touch", isPrimary: id === 1
      }));
      fire("pointerdown", 1, 150, 340);
      fire("pointerdown", 2, 210, 340);
      fire("pointermove", 2, 280, 300);
      fire("pointerup", 2, 280, 300);
      fire("pointerup", 1, 150, 340);
      return Number(map.getAttribute("data-z") || 0);
    })()`) as number;
    assert.ok(pinched > zBeforePinch, `synthetic pinch ${pinched} from ${zBeforePinch}`);
    assert.equal(posts.length, beforeShape);
    await page.click("#play-flag");
    await page.waitForFunction(() => document.querySelector("#tkmap")?.getAttribute("data-phase") === "confirmFlag");
    const flag = await page.evaluate(() => ({
      frame: document.querySelector("#tkmap")?.getAttribute("data-frame") || "",
      kind: document.querySelector("#tkmap")?.getAttribute("data-flag-kind") || "",
      tile: Number(document.querySelector("#tkmap")?.getAttribute("data-tile-z") || 0),
      imagery: document.querySelector("#tkmap")?.getAttribute("data-imagery") || "",
      z: Number(document.querySelector("#tkmap")?.getAttribute("data-z") || 0),
      text: document.querySelector("#tkro")?.textContent || "",
    }));
    assert.equal(flag.frame, "flag");
    assert.equal(flag.kind, "green");
    assert.ok(flag.z > 17);
    assert.equal(flag.tile, 17);
    assert.equal(flag.imagery, "scaled");
    assert.match(flag.text, /Referencia del green/);
    assert.equal(posts.length, beforeShape);
    await page.screenshot({ path: "/opt/cursor/artifacts/track-flag-close.png" });
    await page.click("#play-zoom-out");
    assert.equal(await page.$eval("#tkmap", el => el.getAttribute("data-phase")), "confirmFlag");
    assert.equal(posts.length, beforeShape);
    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-shape?hole=3`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#tkro");
    const missingTee = await page.evaluate(() => ({
      frame: document.querySelector("#tkmap")?.getAttribute("data-frame") || "",
      phase: document.querySelector("#tkmap")?.getAttribute("data-phase") || "",
      aim: document.querySelector("#tkmap")?.getAttribute("data-aim-lat") || "",
      text: document.querySelector("#tkro")?.textContent || "",
      hole: document.querySelector("#tk-hole")?.textContent || "",
    }));
    assert.equal(missingTee.frame, "seek");
    assert.equal(missingTee.phase, "confirmTee");
    assert.ok(missingTee.aim.startsWith("-34.602"));
    assert.match(missingTee.text, /Sin salida verificada/);
    assert.equal(missingTee.text.includes("Confirmá la salida"), false);
    assert.match(missingTee.hole, /390 yd/);
    assert.equal(missingTee.hole.includes("[object Object]"), false);
    await ready(page);
    await page.screenshot({ path: "/opt/cursor/artifacts/track-no-tee.png" });
    assert.equal(posts.length, beforeShape);

    await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true });
    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-shape?hole=2`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#play-club");
    assert.equal(await page.$eval("#play-club", el => (el as HTMLSelectElement).value), "");
    assert.equal(await page.$eval("#play-club", el => el.querySelector("option[value='']")?.textContent), "Elegir palo");
    assert.equal((await page.evaluate(() => document.body.innerText)).includes("Después"), false);
    await page.screenshot({ path: "/opt/cursor/artifacts/track-par3-elegir.png" });
    const blocked = posts.length;
    await ready(page);
    await page.click("#play-hit");
    await page.waitForFunction(() => (document.querySelector(".tk-msg")?.textContent || "").includes("Elegí un palo"));
    assert.equal(posts.length, blocked);
    await page.$eval(".tk-msg", el => { el.setAttribute("data-once", "1"); });
    await ready(page);
    await page.click("#play-hit");
    await page.waitForFunction(() => {
      const msg = document.querySelector(".tk-msg");
      return !!msg && msg.getAttribute("data-once") !== "1" && (msg.textContent || "").includes("Elegí un palo");
    });
    assert.equal(posts.length, blocked);
    await page.select("#play-club", "7i");
    await ready(page);
    await page.click("#play-hit");
    await page.waitForFunction(() => document.querySelector(".tk-shot-n"));
    assert.equal((posts.at(-1) as { club: string }).club, "7i");

    bagRows.splice(0, bagRows.length);
    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-shape?hole=1`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#play-club");
    const emptyBag = await page.$eval("#play-club", el => ({
      value: (el as HTMLSelectElement).value,
      labels: [...el.querySelectorAll("option")].map(o => o.textContent),
    }));
    assert.deepEqual(emptyBag.labels, ["Elegir palo", "Putter"]);
    assert.equal(emptyBag.value, "");
    const emptyPosts = posts.length;
    await ready(page);
    await page.click("#play-hit");
    await page.waitForFunction(() => (document.querySelector(".tk-msg")?.textContent || "").includes("Elegí un palo"));
    assert.equal(posts.length, emptyPosts);
    await page.$eval(".tk-msg", el => { el.setAttribute("data-once", "1"); });
    await ready(page);
    await page.click("#play-hit");
    await page.waitForFunction(() => {
      const msg = document.querySelector(".tk-msg");
      return !!msg && msg.getAttribute("data-once") !== "1" && (msg.textContent || "").includes("Elegí un palo");
    });
    assert.equal(posts.length, emptyPosts);
    await page.screenshot({ path: "/opt/cursor/artifacts/track-empty-bag.png" });

    bagRows.push({ club: "Driver", carry: 300, total: 300 }, { club: "7i", carry: 165, total: 165 }, { club: "SW", carry: 105, total: 105 });
    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-resume`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#play-club");
    const resumedClub = await page.$eval("#play-club", el => ({
      value: (el as HTMLSelectElement).value,
      blank: el.querySelector("option[value='']")?.textContent || "",
      text: document.body.innerText,
    }));
    assert.equal(resumedClub.value, "SW");
    assert.equal(resumedClub.blank, "");
    assert.equal(await page.$eval("#play-club", el => (el as HTMLSelectElement).selectedOptions[0]?.textContent), "SW");
    assert.equal(resumedClub.text.includes("Después"), false);

    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-stale`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#play-club");
    const stale = await page.$eval("#play-club", el => ({
      value: (el as HTMLSelectElement).value,
      blank: el.querySelector("option[value='']")?.textContent || "",
      labels: [...el.querySelectorAll("option")].map(o => o.textContent),
    }));
    assert.equal(stale.value, "");
    assert.equal(stale.blank, "Elegir palo");
    assert.equal(stale.labels.includes("58°"), false);
    assert.equal(stale.labels.includes("Driver"), true);
  } finally {
    await browser.close();
    await new Promise<void>(r => server.close(() => r()));
  }
});
