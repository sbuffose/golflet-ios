/** TEST-ONLY mobile flow. Cancha Vieja has a green axis and no invented polygon.
 *  Green Ring has a verified polygon. Nothing is written to a personal card. */
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
const TEE = { lat: -38.037468, lng: -57.538187 };
const vieja = [{ hole: 1, par: 4, hcp: 3, yards: 445, tee: TEE, green: { front: { lat: -38.03369214, lng: -57.5382432 }, center: GREEN, back: { lat: -38.03392117, lng: -57.53812785 } } }, { hole: 2, par: 3, yards: 160, tee: { lat: TEE.lat + 0.002, lng: TEE.lng }, green: { center: { lat: TEE.lat + 0.0032, lng: TEE.lng } } }];
const ring = [
  { lat: GREEN.lat + 0.00012, lng: GREEN.lng - 0.00012 },
  { lat: GREEN.lat + 0.00012, lng: GREEN.lng + 0.00012 },
  { lat: GREEN.lat - 0.00012, lng: GREEN.lng + 0.00012 },
  { lat: GREEN.lat - 0.00012, lng: GREEN.lng - 0.00012 },
];

test("drive, approach, putt and the next hole stay distinct", { timeout: 120_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const posts: Record<string, unknown>[] = [];
  const shots: Record<string, unknown>[] = [];
  const writes: string[] = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (body: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname.startsWith("/api/")) {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      if (req.method === "PUT" || req.method === "POST" || req.method === "DELETE") writes.push(`${req.method} ${url.pathname}`);
      if (url.pathname === "/api/data") return json({ user: { name: "TEST-ONLY", pending_first_sync: false }, player: { name: "TEST-ONLY" }, hi_history: [], clubs: [], courses: [], rounds: [] });
      if (url.pathname === "/api/bag") return json([{ club: "Driver", carry: 250, total: 260 }, { club: "PW", carry: 110, total: 115 }]);
      if (url.pathname === "/api/gps/courses/209-cancha-vieja") return json({ course: { club_code: "209", course: "Cancha Vieja", holes: vieja } });
      if (url.pathname === "/api/gps/courses/209-green-ring") return json({ course: { club_code: "209", course: "Green Ring", holes: [{ hole: 1, par: 4, yards: 400, tee: TEE, green: { center: GREEN } }] } });
      if (url.pathname === "/api/course-maps/209/Green%20Ring" || url.pathname === "/api/course-maps/209/Green Ring") return json({ holes: [{ hole: 1, green: { polygon: ring, source: "openstreetmap", confidence: "openstreetmap" } }] });
      if (url.pathname === "/api/reconstructions" && req.method === "GET") return json({ rounds: [], reconstructions: [
        { id: "live-vieja", current_hole: 1, club_code: "209", vm_course: "Cancha Vieja", course: "Cancha Vieja", round_id: null },
        { id: "live-ring", current_hole: 1, club_code: "209", vm_course: "Green Ring", course: "Green Ring", round_id: null },
      ] });
      if (url.pathname === "/api/reconstructions/live-ring/shots" && req.method === "GET") return json({ shots: [] });
      if (url.pathname.endsWith("/shots") && req.method === "POST") {
        const posted = JSON.parse(raw || "{}");
        posts.push(posted);
        shots.push({ id: `s${shots.length + 1}`, shot_number: shots.length + 1, ...posted });
        return json({ shots });
      }
      if (url.pathname.endsWith("/shots") && req.method === "DELETE") { shots.pop(); return json({ shots }); }
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
  const ready = (page: { waitForFunction: (fn: () => boolean, opts?: { timeout?: number }) => Promise<unknown> }) => page.waitForFunction(() => {
    const hit = document.querySelector("#play-hit") as HTMLButtonElement | null;
    const map = document.querySelector("#tkmap");
    return !!hit && !hit.disabled && map?.getAttribute("data-moving") === "0" && map?.getAttribute("data-map") === "ready";
  }, { timeout: 25000 });
  const aim = async (page: import("puppeteer-core").Page, target: number) => {
    for (let i = 0; i < 32; i++) {
      const lat = await page.$eval("#tkmap", el => Number(el.getAttribute("data-cursor-lat")));
      if (Math.abs(lat - target) < 0.00018) return lat;
      const south = lat < target;
      await page.mouse.move(195, south ? 280 : 520);
      await page.mouse.down();
      await page.mouse.move(195, south ? 400 : 350, { steps: 6 });
      await page.mouse.up();
    }
    return page.$eval("#tkmap", el => Number(el.getAttribute("data-cursor-lat")));
  };
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await page.setRequestInterception(true);
    page.on("request", req => {
      const host = new URL(req.url()).hostname;
      if (host !== "127.0.0.1" && host !== "localhost" && host !== "server.arcgisonline.com") req.abort();
      else req.continue();
    });
    mkdirSync("/opt/cursor/artifacts", { recursive: true });
    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-vieja?hole=1`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#play-club");
    await ready(page);
    const open = await page.evaluate(() => ({
      club: (document.querySelector("#play-club") as HTMLSelectElement).value,
      options: [...(document.querySelector("#play-club") as HTMLSelectElement).options].map(o => o.textContent),
      putting: document.querySelector("#tkmap")?.getAttribute("data-putting"),
    }));
    assert.equal(open.club, "Driver");
    assert.ok(open.options.includes("Putter"));
    assert.equal(open.putting, "0");
    await page.select("#play-club", "Pt");
    assert.equal(await page.$("#play-putt-m"), null);
    assert.equal(await page.$eval("#tkmap", el => el.getAttribute("data-putting")), "0");
    await page.select("#play-club", "Driver");
    const driven = await aim(page, -38.0362);
    assert.ok(driven < -38.0358 && driven > -38.0366, String(driven));
    assert.equal((await page.$eval("#tkro", el => el.textContent || "")).includes("En el hoyo"), false);
    await page.screenshot({ path: "/opt/cursor/artifacts/track-390-driver.png" });
    await ready(page);
    await page.click("#play-hit");
    await page.waitForFunction(() => (document.querySelector("#rc-shots")?.textContent || "").includes("Driver"));
    const rail = await page.$eval("#rc-shots", el => el.textContent || "");
    assert.match(rail, /Driver · \d+ yd/);
    assert.equal(rail.includes("445"), false);
    assert.equal(posts[0].club, "Driver");
    assert.equal(posts[0].distance_kind, "estimated");
    assert.equal(posts[0].result ?? null, null);
    assert.ok(Number(posts[0].distance_m) > 50 && Number(posts[0].distance_m) < 350);
    await page.screenshot({ path: "/opt/cursor/artifacts/track-390-history.png" });
    await ready(page);
    await page.select("#play-club", "PW");
    const approach = await aim(page, -38.03415);
    assert.ok(approach > -38.0344 && approach < -38.03395, String(approach));
    assert.equal((await page.$eval("#tkro", el => el.textContent || "")).includes("En el hoyo"), false);
    await ready(page);
    const beforeZoom = Number(await page.$eval("#tkmap", el => el.getAttribute("data-z")));
    await page.click("#play-hit");
    await page.waitForFunction(() => (document.querySelector("#rc-shots")?.textContent || "").includes("PW"));
    assert.equal(posts[1].club, "PW");
    assert.equal(posts[1].lie ?? null, null);
    await page.click("#play-lie");
    await page.waitForFunction(() => document.querySelector("#tkmap")?.getAttribute("data-putting") === "1" && document.querySelector("#tkmap")?.getAttribute("data-moving") === "0");
    const onGreen = await page.evaluate(() => ({
      club: (document.querySelector("#play-club") as HTMLSelectElement).value,
      label: (document.querySelector("#play-club") as HTMLSelectElement).selectedOptions[0]?.textContent,
      text: document.querySelector("#tkro")?.textContent || "",
      z: Number(document.querySelector("#tkmap")?.getAttribute("data-z") || 0),
    }));
    assert.equal(onGreen.club, "Pt");
    assert.equal(onGreen.label, "Putter");
    assert.match(onGreen.text, /m/);
    assert.ok(onGreen.z > beforeZoom, `${onGreen.z} vs ${beforeZoom}`);
    await page.screenshot({ path: "/opt/cursor/artifacts/track-390-putt.png" });
    await page.type("#play-putt-m", "2,4");
    await ready(page);
    await page.click("#play-hit");
    await page.waitForFunction(() => (document.querySelector("#rc-shots")?.textContent || "").includes("a mano"));
    assert.equal(posts[2].club, "Pt");
    assert.equal(posts[2].distance_kind, "manual");
    assert.equal(posts[2].lie, "green");
    assert.equal(posts[2].result ?? null, null);
    assert.equal((await page.$eval("#tkro", el => el.textContent || "")).includes("En el hoyo"), false);
    if (await page.$("#play-lie")) await page.click("#play-lie");
    await page.waitForFunction(() => document.querySelector("#tkmap")?.getAttribute("data-putting") === "1");
    const centered = await aim(page, GREEN.lat);
    assert.ok(Math.abs(centered - GREEN.lat) < 0.00025, String(centered));
    assert.equal((await page.$eval("#tkro", el => el.textContent || "")).includes("En el hoyo"), false);
    await page.waitForSelector("#play-hole");
    await page.click("#play-hole");
    assert.match(await page.$eval("#tkro", el => el.textContent || ""), /ENTER confirma/);
    assert.equal(posts.length, 3);
    await ready(page);
    await page.click("#play-hit");
    await page.waitForSelector("#play-next");
    await page.waitForFunction(() => document.querySelector("#tkmap")?.getAttribute("data-frame") === "overview" && document.querySelector("#tkmap")?.getAttribute("data-moving") === "0");
    assert.equal(await page.$("#play-hit"), null);
    assert.equal(posts[3].result, "holed");
    assert.match(await page.$eval("#tk-sum", el => el.textContent || ""), /Putts: /);
    await page.screenshot({ path: "/opt/cursor/artifacts/track-390-holed.png" });
    await page.click("#play-next");
    await page.waitForFunction(() => (document.querySelector(".tk-hn")?.textContent || "").includes("Hoyo 2"));
    assert.equal((await page.$eval("#play-club", el => (el as HTMLSelectElement).value)), "");
    await page.screenshot({ path: "/opt/cursor/artifacts/track-390-next.png" });

    shots.length = 0;
    posts.length = 0;
    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-ring`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.querySelector("#tkmap")?.getAttribute("data-cmap") === "1");
    await page.select("#play-club", "PW");
    let ringAt = "";
    for (let i = 0; i < 36; i++) {
      ringAt = await page.$eval("#tkmap", el => `${el.getAttribute("data-cursor-lat")},${el.getAttribute("data-cursor-lng")},${el.getAttribute("data-cursor-lie")}`);
      if (ringAt.endsWith(",green")) break;
      const lat = Number(ringAt.split(",")[0]);
      const south = lat < GREEN.lat;
      await page.mouse.move(195, south ? 260 : 540);
      await page.mouse.down();
      await page.mouse.move(195, south ? 420 : 340, { steps: 8 });
      await page.mouse.up();
    }
    assert.match(ringAt, /,green$/, ringAt);
    await ready(page);
    await page.click("#play-hit");
    await page.waitForFunction(() => {
      const map = document.querySelector("#tkmap");
      const club = document.querySelector("#play-club") as HTMLSelectElement | null;
      return map?.getAttribute("data-putting") === "1" && map?.getAttribute("data-moving") === "0" && club?.value === "Pt";
    });
    assert.equal(posts[0].club, "PW");
    assert.equal(posts.length, 1);
    await page.screenshot({ path: "/opt/cursor/artifacts/track-390-ring.png" });
    assert.equal(writes.some(w => w.includes("/api/bag")), false);
    assert.equal(writes.some(w => w.includes("hole-marks")), false);
  } finally {
    await browser.close();
    await new Promise<void>(r => server.close(() => r()));
  }
});
