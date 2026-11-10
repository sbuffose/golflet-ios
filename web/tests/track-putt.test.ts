/** TEST-ONLY. Cancha Vieja uses the real Golfistics green axis and no invented polygon.
 *  The tee is the card-length point already used by the map tests, not a new survey. */
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const CHROME = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find(p => existsSync(p));
const ROOT = new URL("../public/", import.meta.url);
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".png": "image/png" };
const GREEN = { lat: -38.03381176, lng: -57.53818687 };
const vieja = [{
  hole: 1, par: 4, hcp: 3, yards: 445,
  tee: { lat: -38.037468, lng: -57.538187 },
  green: {
    front: { lat: -38.03369214, lng: -57.5382432 },
    center: GREEN,
    back: { lat: -38.03392117, lng: -57.53812785 },
  },
}];
const ring = [
  { lat: GREEN.lat + 0.00012, lng: GREEN.lng - 0.00012 },
  { lat: GREEN.lat + 0.00012, lng: GREEN.lng + 0.00012 },
  { lat: GREEN.lat - 0.00012, lng: GREEN.lng + 0.00012 },
  { lat: GREEN.lat - 0.00012, lng: GREEN.lng - 0.00012 },
];

test("a putt starts after the approach, in meters, and the hole closes only on purpose", { timeout: 120_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const posts: Record<string, unknown>[] = [];
  const shots: Record<string, unknown>[] = [];
  let failNext = false;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (body: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname.startsWith("/api/")) {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      if (url.pathname === "/api/data") return json({ user: { name: "TEST-ONLY", pending_first_sync: false }, player: { name: "TEST-ONLY" }, hi_history: [], clubs: [], courses: [], rounds: [] });
      if (url.pathname === "/api/bag") return json([
        { club: "Driver", carry: 250, total: 260 },
        { club: "PW", carry: 110, total: 115 },
        { club: "Putter", carry: 0, total: 0 },
      ]);
      if (url.pathname === "/api/gps/courses/209-cancha-vieja") return json({ course: { club_code: "209", course: "Cancha Vieja", holes: vieja } });
      if (url.pathname === "/api/gps/courses/209-green-ring") return json({ course: { club_code: "209", course: "Green Ring", holes: [{ hole: 1, par: 4, yards: 445, tee: vieja[0].tee, green: { center: GREEN } }] } });
      if (url.pathname === "/api/course-maps/209/Green%20Ring" || url.pathname === "/api/course-maps/209/Green Ring") {
        return json({ holes: [{ hole: 1, green: { polygon: ring } }] });
      }
      if (url.pathname === "/api/reconstructions" && req.method === "GET") {
        return json({ rounds: [], reconstructions: [
          { id: "live-vieja", current_hole: 1, club_code: "209", vm_course: "Cancha Vieja", course: "Cancha Vieja", round_id: null },
          { id: "live-ring", current_hole: 1, club_code: "209", vm_course: "Green Ring", course: "Green Ring", round_id: null },
          { id: "live-ring-fresh", current_hole: 1, club_code: "209", vm_course: "Green Ring", course: "Green Ring", round_id: null },
          { id: "live-out", current_hole: 1, club_code: "209", vm_course: "Green Ring", course: "Green Ring", round_id: null },
        ] });
      }
      if (url.pathname === "/api/reconstructions/live-ring-fresh/shots" && req.method === "GET") return json({ shots: [] });
      if (url.pathname === "/api/reconstructions/live-out/shots" && req.method === "GET") {
        return json({ shots: [{ id: "out1", hole: 1, club: "PW", lie: null, result: null, penalty_strokes: 0, lat: vieja[0].tee.lat, lng: vieja[0].tee.lng, end_lat: -38.036, end_lng: -57.53819, distance_m: 140, distance_kind: "estimated" }] });
      }
      if (url.pathname === "/api/reconstructions/live-ring/shots" && req.method === "GET") {
        return json({ shots: [{ id: "in1", hole: 1, club: "PW", lie: null, result: null, penalty_strokes: 0, lat: vieja[0].tee.lat, lng: vieja[0].tee.lng, end_lat: GREEN.lat, end_lng: GREEN.lng, distance_m: 400, distance_kind: "estimated" }] });
      }
      if (url.pathname.endsWith("/shots") && req.method === "POST") {
        if (failNext) { failNext = false; return json({ error: "no" }, 500); }
        const posted = JSON.parse(raw || "{}");
        posts.push(posted);
        shots.push({ id: `s${shots.length + 1}`, shot_number: shots.length + 1, ...posted });
        return json({ shots });
      }
      if (url.pathname.endsWith("/shots") && req.method === "DELETE") {
        shots.pop();
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
  const ready = (page: { waitForFunction: (fn: () => boolean, opts?: { timeout?: number }) => Promise<unknown> }) =>
    page.waitForFunction(() => {
      const hit = document.querySelector("#play-hit") as HTMLButtonElement | null;
      const map = document.querySelector("#tkmap");
      return !!hit && !hit.disabled && map?.getAttribute("data-moving") === "0" && map?.getAttribute("data-map") === "ready";
    }, { timeout: 25000 });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true });
    await page.setRequestInterception(true);
    page.on("request", req => {
      const host = new URL(req.url()).hostname;
      if (host !== "127.0.0.1" && host !== "localhost" && host !== "server.arcgisonline.com") req.abort();
      else req.continue();
    });
    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-vieja?hole=1`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#play-club");
    assert.equal(await page.$eval("#tkmap", el => getComputedStyle(el).userSelect), "none");
    assert.equal(await page.$eval("#play-hit", el => getComputedStyle(el).webkitUserSelect || getComputedStyle(el).userSelect), "none");
    assert.notEqual(await page.$(".tk-gaxis"), null);
    assert.match(await page.$eval(".tk-axisnote", el => el.textContent || ""), /No es el contorno/);
    await page.select("#play-club", "PW");
    await ready(page);
    const before = await page.evaluate(() => ({
      club: (document.querySelector("#play-club") as HTMLSelectElement).value,
      ball: document.querySelector("#tkmap")?.getAttribute("data-ball-lat") || "",
      lie: document.querySelector("#tkmap")?.getAttribute("data-lie") || "",
    }));
    assert.equal(before.club, "PW");
    assert.ok(before.ball.startsWith("-38.037"));
    assert.equal(before.lie, "");
    for (let i = 0; i < 28; i++) {
      const lat = await page.$eval("#tkmap", el => Number(el.getAttribute("data-cursor-lat")));
      if (lat > -38.0344 && lat < -38.034) break;
      const down = lat < -38.0344;
      await page.mouse.move(195, down ? 280 : 520);
      await page.mouse.down();
      await page.mouse.move(195, down ? 390 : 360, { steps: 6 });
      await page.mouse.up();
    }
    const aimed = await page.evaluate(() => ({
      club: (document.querySelector("#play-club") as HTMLSelectElement).value,
      cursor: document.querySelector("#tkmap")?.getAttribute("data-cursor-lat") || "",
      text: document.body.innerText,
    }));
    assert.equal(aimed.club, "PW");
    assert.ok(Number(aimed.cursor) > -38.0344 && Number(aimed.cursor) < -38.034, aimed.cursor);
    assert.equal(aimed.text.includes("En el hoyo"), false);
    assert.equal(posts.length, 0);
    mkdirSync("/opt/cursor/artifacts", { recursive: true });
    await page.screenshot({ path: "/opt/cursor/artifacts/track-approach-before.png" });
    await ready(page);
    const ballBefore = await page.$eval("#tkmap", el => el.getAttribute("data-ball-lat"));
    await page.click("#play-hit");
    await new Promise(r => setTimeout(r, 160));
    await page.screenshot({ path: "/opt/cursor/artifacts/track-transition-mid.png" });
    await page.waitForFunction(() => document.querySelector("#tkmap")?.getAttribute("data-moving") === "0");
    await page.waitForSelector(".tk-shot-n");
    const landed = await page.evaluate(() => ({
      club: (document.querySelector("#play-club") as HTMLSelectElement).value,
      ball: document.querySelector("#tkmap")?.getAttribute("data-ball-lat") || "",
      putting: document.querySelector("#tkmap")?.getAttribute("data-putting") || "",
      lie: document.querySelector("#play-lie")?.textContent || "",
    }));
    assert.equal(posts.length, 1);
    assert.equal(posts[0].club, "PW");
    assert.equal(posts[0].result ?? null, null);
    assert.notEqual(landed.ball, ballBefore);
    assert.equal(landed.club, "PW");
    assert.equal(landed.putting, "0");
    assert.equal(landed.lie, "En el green");
    const bearing = Number(await page.$eval("#tkmap", el => el.getAttribute("data-bearing") || "999"));
    assert.ok(bearing < 25 || bearing > 335, String(bearing));
    await page.click("#play-lie");
    await page.waitForFunction(() => document.querySelector("#tkmap")?.getAttribute("data-moving") === "0" && document.querySelector("#tkmap")?.getAttribute("data-putting") === "1");
    const armed = await page.evaluate(() => ({
      club: (document.querySelector("#play-club") as HTMLSelectElement).value,
      label: (document.querySelector("#play-club") as HTMLSelectElement).selectedOptions[0]?.textContent || "",
      putting: document.querySelector("#tkmap")?.getAttribute("data-putting") || "",
      text: document.querySelector("#tkro")?.textContent || "",
      posts: document.querySelectorAll(".tk-shot-n").length,
    }));
    assert.equal(posts.length, 1);
    assert.equal(armed.club, "Putter");
    assert.equal(armed.label, "Putter");
    assert.equal(armed.putting, "1");
    assert.match(armed.text, /En el hoyo|m al hoyo/);
    assert.equal(armed.text.includes("ft"), false);
    assert.equal(armed.posts, 1);
    assert.equal(await page.$("#play-putt-m"), null);
    for (let i = 0; i < 8 && (await page.$eval("#tkro", el => el.textContent || "")).includes("En el hoyo"); i++) {
      await page.mouse.move(195, 300);
      await page.mouse.down();
      await page.mouse.move(195, 420, { steps: 4 });
      await page.mouse.up();
    }
    assert.match(await page.$eval("#tkro", el => el.textContent || ""), /m al hoyo/);
    assert.match(await page.$eval("#tkro", el => el.textContent || ""), /estimada en el mapa/);
    assert.equal((await page.$eval("#tkro", el => el.textContent || "")).includes("ft"), false);
    await ready(page);
    for (const w of [320, 430]) {
      await page.setViewport({ width: w, height: 844, hasTouch: true, isMobile: true });
      await ready(page);
      const enter = await page.$eval("#play-hit", el => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: window.innerWidth, height: window.innerHeight };
      });
      assert.ok(enter.left >= 0 && enter.right <= enter.width + 1 && enter.top >= 0 && enter.bottom <= enter.height + 1, JSON.stringify(enter));
      await page.screenshot({ path: `/opt/cursor/artifacts/track-putt-${w}.png` });
    }
    await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true });
    await ready(page);
    await page.screenshot({ path: "/opt/cursor/artifacts/track-putt-after.png" });
    await page.click("#play-hit");
    await page.waitForFunction(() => document.querySelectorAll(".tk-shot-n").length === 2);
    assert.equal(posts.length, 2);
    assert.equal(posts[1].club, "Putter");
    assert.equal(posts[1].distance_kind, "estimated");
    assert.equal(typeof posts[1].distance_m, "number");
    assert.equal(posts[1].lie, "green");
    assert.equal(posts[1].result ?? null, null);
    assert.equal(typeof posts[1].lat, "number");
    assert.equal(typeof posts[1].end_lat, "number");
    const near = await page.$eval("#tkro", el => el.textContent || "");
    assert.equal(near.includes("En el hoyo"), false);
    await ready(page);
    await page.click("#play-lie");
    await page.waitForFunction(() => document.querySelector("#tkmap")?.getAttribute("data-moving") === "0");
    assert.equal(posts.length, 2);
    for (let i = 0; i < 8 && (await page.$eval("#tkro", el => el.textContent || "")).includes("En el hoyo"); i++) {
      await page.mouse.move(195, 300);
      await page.mouse.down();
      await page.mouse.move(195, 420, { steps: 4 });
      await page.mouse.up();
    }
    assert.match(await page.$eval("#tkro", el => el.textContent || ""), /estimada en el mapa/);
    await ready(page);
    await page.click("#play-hit");
    await page.waitForFunction(() => document.querySelectorAll(".tk-shot-n").length === 3);
    assert.equal(posts[2].result ?? null, null);
    assert.equal(posts[2].distance_kind, "estimated");
    assert.equal(posts[2].club, "Putter");
    assert.equal(posts[2].lie, "green");
    await ready(page);
    if (await page.$("#play-lie")) await page.click("#play-lie");
    await page.waitForFunction(() => (document.querySelector("#tkro")?.textContent || "").includes("En el hoyo"), { timeout: 15000 });
    assert.equal(posts.length, 3);
    await ready(page);
    await page.click("#play-hit");
    await page.waitForSelector("#play-next");
    await page.waitForFunction(() => {
      const map = document.querySelector("#tkmap");
      return map?.getAttribute("data-moving") === "0" && map?.getAttribute("data-frame") === "overview" && map?.getAttribute("data-map") === "ready";
    });
    assert.equal(await page.$("#play-hit"), null);
    assert.equal(posts.length, 4);
    assert.equal(posts[3].result, "holed");
    await page.screenshot({ path: "/opt/cursor/artifacts/track-holed.png" });

    shots.length = 0;
    posts.length = 0;
    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-ring`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.querySelector("#tkmap")?.getAttribute("data-putting") === "1");
    assert.equal(await page.$eval("#play-club", el => (el as HTMLSelectElement).value), "Putter");
    assert.equal(posts.length, 0);

    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-out`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#play-club");
    assert.equal(await page.$eval("#play-club", el => (el as HTMLSelectElement).value), "PW");
    assert.equal(await page.$eval("#tkmap", el => el.getAttribute("data-putting")), "0");

    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-vieja?hole=1`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#play-hit");
    await ready(page);
    failNext = true;
    const stayed = await page.$eval("#tkmap", el => el.getAttribute("data-ball-lat"));
    await page.click("#play-hit");
    await page.waitForFunction(() => (document.querySelector(".tk-msg")?.textContent || "").length > 0);
    assert.equal(await page.$eval("#tkmap", el => el.getAttribute("data-ball-lat")), stayed);
    assert.equal(posts.length, 0);

    shots.length = 0;
    posts.length = 0;
    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-ring-fresh`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.querySelector("#tkmap")?.getAttribute("data-cmap") === "1");
    await page.select("#play-club", "PW");
    for (let i = 0; i < 30; i++) {
      const lat = await page.$eval("#tkmap", el => Number(el.getAttribute("data-cursor-lat")));
      if (lat > -38.0339 && lat < -38.03373) break;
      const down = lat < -38.0339;
      await page.mouse.move(195, down ? 280 : 520);
      await page.mouse.down();
      await page.mouse.move(195, down ? 390 : 360, { steps: 6 });
      await page.mouse.up();
    }
    const aimedRing = await page.evaluate(() => ({
      club: (document.querySelector("#play-club") as HTMLSelectElement).value,
      lat: document.querySelector("#tkmap")?.getAttribute("data-cursor-lat") || "",
    }));
    assert.equal(aimedRing.club, "PW");
    assert.ok(Number(aimedRing.lat) > -38.0339 && Number(aimedRing.lat) < -38.03373, aimedRing.lat);
    await ready(page);
    await page.click("#play-hit");
    await page.waitForFunction(() => {
      const map = document.querySelector("#tkmap");
      const club = document.querySelector("#play-club") as HTMLSelectElement | null;
      return map?.getAttribute("data-putting") === "1" && map?.getAttribute("data-moving") === "0" && club?.value === "Putter";
    });
    assert.equal(posts.length, 1);
    assert.equal(posts[0].club, "PW");
  } finally {
    await browser.close();
    await new Promise<void>(r => server.close(() => r()));
  }
});
