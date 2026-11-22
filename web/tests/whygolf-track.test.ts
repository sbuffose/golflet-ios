/** 375px: WhyGolf gaps on the current track. Fixed reticle, live text, pills, edit, drop. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdirSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import test from "node:test";

const CHROME = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find(p => existsSync(p));
const ROOT = new URL("../public/", import.meta.url);
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
const GREEN = { lat: -34.48306, lng: -58.52882 };
const TEE = { lat: -34.48596, lng: -58.53235 };
const FAIR = { lat: -34.4844, lng: -58.5306 };
const PUTT = { lat: GREEN.lat - 4.8768 / 111320, lng: GREEN.lng };
const hole = (n: number, extra: Record<string, unknown>) => ({ hole: n, par: n === 10 ? 3 : 4, hcp: n === 10 ? 1 : 8, yards: n === 10 ? 149 : 380, ...extra });
const course = {
  club_code: "118", course: "Azul", course_id: "118-azul",
  holes: [
    hole(10, { green: { center: GREEN } }),
    hole(11, { tee: TEE, green: { center: GREEN }, line: [TEE, GREEN] }),
    hole(12, { tee: TEE, green: { center: GREEN }, line: [TEE, GREEN] }),
    hole(13, { tee: TEE, green: { center: GREEN }, line: [TEE, GREEN] }),
  ],
};
const shots = [
  { id: "s11", hole: 11, club: "Dr", lat: TEE.lat, lng: TEE.lng, end_lat: FAIR.lat, end_lng: FAIR.lng, result: null, lie: null, penalty_strokes: 0 },
  { id: "s12a", hole: 12, club: "Dr", lat: TEE.lat, lng: TEE.lng, end_lat: PUTT.lat, end_lng: PUTT.lng, result: null, lie: null, penalty_strokes: 0 },
  { id: "s12", hole: 12, club: "Putter", lie: "green", lat: PUTT.lat, lng: PUTT.lng, end_lat: GREEN.lat, end_lng: GREEN.lng, result: null, penalty_strokes: 0, distance_m: 4.8768 },
  { id: "s13a", hole: 13, club: "Dr", lat: TEE.lat, lng: TEE.lng, end_lat: PUTT.lat, end_lng: PUTT.lng, result: null, lie: null, penalty_strokes: 0 },
  { id: "s13b", hole: 13, club: "Putter", lie: "green", lat: PUTT.lat, lng: PUTT.lng, end_lat: GREEN.lat, end_lng: GREEN.lng, result: "holed", penalty_strokes: 0, distance_m: 4.8768 },
];

test("el track cierra las brechas de WhyGolf sin inventar números", { timeout: 120_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (body: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString() || "{}") : {};
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname === "/api/data") return json({ user: { name: "TEST-ONLY", pending_first_sync: false }, player: { name: "TEST-ONLY" }, hi_history: [], clubs: [], courses: [], rounds: [], bag: [{ club: "Driver", carry: 230 }, { club: "Putter" }, { club: "PW", carry: 110 }] });
      if (url.pathname === "/api/bag") return json([{ club: "Driver", carry: 230 }, { club: "Putter" }, { club: "PW", carry: 110 }]);
      if (url.pathname === "/api/gps/courses") return json({ courses: [course] });
      if (url.pathname.startsWith("/api/gps/courses/")) return json({ course });
      if (url.pathname.startsWith("/api/course-maps/")) return json(course);
      if (url.pathname === "/api/reconstructions" && req.method === "GET") return json({ rounds: [], reconstructions: [
        { id: "live-whygolf", date: today, current_hole: 10, club_code: "118", vm_course: "Azul", course: "Azul", round_id: "r-whygolf" },
      ] });
      if (url.pathname.endsWith("/shots") && req.method === "PATCH") {
        const hit = shots.find(s => s.id === body.shot_id);
        if (hit) Object.assign(hit, { club: body.club, lie: body.lie, intent: body.intent, lat: body.lat, lng: body.lng, end_lat: body.end_lat, end_lng: body.end_lng });
        return json({ ok: true });
      }
      if (url.pathname.endsWith("/shots") && req.method === "POST") {
        shots.push({ id: `new-${shots.length}`, hole: body.hole, club: body.club, lie: body.lie, intent: body.intent, result: body.result, lat: body.lat, lng: body.lng, end_lat: body.end_lat, end_lng: body.end_lng, penalty_strokes: body.penalty_strokes || 0, distance_m: body.distance_m });
        return json({ shots });
      }
      if (url.pathname.endsWith("/shots")) return json({ shots });
      if (url.pathname === "/api/weather/now") return json({ error: "Open-Meteo y MET Norway no devolvieron viento." }, 502);
      if (url.pathname.includes("hole-marks")) return json({ marks: [] });
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
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 375, height: 812, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-whygolf?hole=10`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => (document.querySelector("#tkro")?.textContent || "").includes("Arrastrá para confirmar la salida"), { timeout: 25000 });
    assert.equal(await page.$eval("#play-set", el => el.textContent), "SET");
    assert.match(await page.$eval(".tk-hn", el => el.textContent || ""), /Hoyo 10/);
    assert.match(await page.$eval(".tk-hn", el => el.textContent || ""), /S\.I\. 1/);
    assert.match(await page.$eval(".tk-hn", el => el.textContent || ""), /149/);
    await page.screenshot({ path: join(art, "web-375-whygolf-salida.png") });

    await page.click("#tknext");
    await page.waitForFunction(() => document.querySelector("#tkro")?.classList.contains("tk-live") && /\d+ yd/.test(document.querySelector("#tkro")?.textContent || ""), { timeout: 25000 });
    assert.equal(await page.$eval("#play-hit", el => el.textContent), "ENTER");
    assert.equal(await page.$eval("#play-hit", el => getComputedStyle(el).backgroundColor), "rgb(11, 37, 69)");
    const live = await page.$eval("#tkro", el => el.textContent || "");
    assert.match(live, /\d+ yd/);
    assert.equal(live.includes("En el hoyo"), false);
    await page.screenshot({ path: join(art, "web-375-whygolf-vivo.png") });

    await page.click("#play-penalty");
    await page.click("#play-pen-stroke");
    await page.waitForFunction(() => (document.querySelector("#tkro")?.textContent || "").includes("¿dónde fue?"));
    await page.screenshot({ path: join(art, "web-375-whygolf-penalidad.png") });
    await page.waitForFunction(() => { const hit = document.querySelector("#play-hit") as HTMLButtonElement | null; return !!hit && !hit.disabled; }, { timeout: 25000 });
    await page.click("#play-hit");
    await page.waitForSelector("#play-drop", { timeout: 15000 });
    await page.click("#play-drop");
    await page.waitForFunction(() => document.querySelector("#play-reticle")?.getAttribute("data-cursor") === "drop" && (document.querySelector("#tkro")?.textContent || "").includes("lugar del drop"));
    assert.equal(await page.$eval("#play-reticle", el => el.textContent?.trim()), "X");
    assert.equal(await page.$eval(".tk-drop-line", el => getComputedStyle(el).stroke), "rgb(200, 16, 46)");
    await page.screenshot({ path: join(art, "web-375-whygolf-drop.png") });

    await page.click("#tknext");
    await page.waitForFunction(() => (document.querySelector("#tkro")?.textContent || "").includes("En el hoyo"), { timeout: 25000 });
    assert.ok(await page.$(".tk-holeflash"));
    await page.screenshot({ path: join(art, "web-375-whygolf-hoyo.png") });

    await page.click("#tknext");
    await page.waitForSelector(".tk-mapill", { timeout: 25000 });
    await page.waitForSelector("#play-next");
    const pills = await page.$$eval(".tk-mapill", nodes => nodes.map(n => n.textContent || "").join(" | "));
    assert.match(pills, /Driver/);
    assert.match(pills, /Putter/);
    assert.equal(/\b(Dr|7i|PW)\b/.test(pills), false);
    await page.screenshot({ path: join(art, "web-375-whygolf-resumen.png") });

    const before = await page.$eval("#play-shot-2", el => el.textContent || "");
    assert.match(before, /\b(ft|in)\b/);
    await page.click("#play-shot-2");
    await page.waitForSelector("#play-shot-editor");
    const editor = await page.$eval("#play-shot-editor", el => el.textContent || "");
    assert.match(editor, /Punto de inicio/);
    assert.match(editor, /Punto final/);
    assert.match(editor, /Objetivo/);
    assert.match(editor, /Insertar tiro/);
    assert.match(editor, /A buena/);
    assert.match(editor, /Borrar tiro/);
    assert.equal(editor.includes("Punch"), false);
    await page.screenshot({ path: join(art, "web-375-whygolf-editar.png") });
    await page.click("#play-edit-club");
    await page.waitForSelector("#play-club-list button.on");
    const onClub = await page.$eval("#play-club-list button.on", el => getComputedStyle(el).boxShadow);
    assert.match(onClub, /rgb\(200, 16, 46\)/);
    await page.evaluate(() => {
      const btn = document.querySelector('#play-club-list button[data-club="PW"]');
      if (btn instanceof HTMLElement) btn.click();
    });
    await page.waitForFunction(() => /Pitching wedge/.test(document.querySelector("#play-shot-2")?.textContent || "") && /yd/.test(document.querySelector("#play-shot-2")?.textContent || ""), { timeout: 8000 });
    const after = await page.$eval("#play-shot-2", el => el.textContent || "");
    assert.equal(/\b(ft|in)\b/.test(after), false);
    assert.match(after, /Pitching wedge/);
    assert.match(after, /\d+ yd/);
  } finally {
    await browser.close();
    await new Promise<void>(r => server.close(() => r()));
  }
});
