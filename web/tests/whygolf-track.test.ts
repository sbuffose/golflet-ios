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
const meters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371000, t = (x: number) => x * Math.PI / 180, dLa = t(b.lat - a.lat), dLo = t(b.lng - a.lng);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const GREEN = { lat: -34.48305197, lng: -58.52881 };
const TEE = { lat: GREEN.lat - (380 * 0.9144) / 111320, lng: GREEN.lng };
const FAIR = { lat: TEE.lat + (230 * 0.9144) / 111320, lng: GREEN.lng };
const PUTT = { lat: GREEN.lat - (16 * 0.3048) / 111320, lng: GREEN.lng };
const holeYd = Math.round(meters(TEE, GREEN) / 0.9144);
const driveYd = Math.round(meters(TEE, FAIR) / 0.9144);
const approachYd = Math.round(meters(FAIR, PUTT) / 0.9144);
const holeRow: Record<string, unknown> = { hole: 12, par: 4, hcp: 8, yards: 380, green: { center: GREEN } };
const course = { club_code: "118", course: "Azul", course_id: "118-azul", holes: [holeRow] };
const shots: Array<Record<string, unknown>> = [];

test("el track cierra las brechas de WhyGolf sin inventar números", { timeout: 120_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (body: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString() || "{}") : {};
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname === "/api/data") return json({ user: { name: "TEST-ONLY", pending_first_sync: false }, player: { name: "TEST-ONLY" }, hi_history: [], clubs: [], courses: [], rounds: [], bag: [{ club: "Driver", carry: 230 }, { club: "Hierro 7", carry: 155 }, { club: "Putter" }, { club: "PW", carry: 110 }] });
      if (url.pathname === "/api/bag") return json([{ club: "Driver", carry: 230 }, { club: "Hierro 7", carry: 155 }, { club: "Putter" }, { club: "PW", carry: 110 }]);
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
    assert.ok(Math.abs(holeYd - 380) <= 2, String(holeYd));
    assert.ok(driveYd >= 220 && driveYd <= 240, String(driveYd));
    assert.ok(approachYd >= 130 && approachYd <= 160, String(approachYd));
    const page = await browser.newPage();
    await page.setViewport({ width: 375, height: 812, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const holeUrl = `http://127.0.0.1:${port}/#/reconstruir/live-whygolf?hole=12`;
    const open = async () => {
      if (page.url().startsWith(`http://127.0.0.1:${port}/`)) await page.reload({ waitUntil: "networkidle0" });
      else await page.goto(holeUrl, { waitUntil: "networkidle0" });
    };
    const oneLine = () => page.evaluate(() => {
      const b = document.querySelector(".tk-hn b")?.getBoundingClientRect();
      const s = document.querySelector(".tk-hn span")?.getBoundingClientRect();
      return !!b && !!s && Math.abs(b.top - s.top) < 4 && (s.height || 0) < 22;
    });
    await open();
    await page.waitForFunction(() => (document.querySelector("#tkro")?.textContent || "").includes("Arrastrá para confirmar la salida"), { timeout: 25000 });
    assert.equal(await page.$eval("#play-set", el => el.textContent), "SET");
    assert.match(await page.$eval(".tk-hn", el => el.textContent || ""), /Hoyo 12/);
    assert.match(await page.$eval(".tk-hn", el => el.textContent || ""), /S\.I\. 8/);
    assert.match(await page.$eval(".tk-hn", el => el.textContent || ""), /380/);
    assert.equal(await oneLine(), true);
    assert.equal(await page.$eval("#play-wx", el => (el.textContent || "").trim()), "Clima");
    await page.screenshot({ path: join(art, "web-375-whygolf-salida.png") });

    holeRow.tee = TEE;
    holeRow.line = [TEE, GREEN];
    shots.push({ id: "s1", hole: 12, club: "Dr", lat: TEE.lat, lng: TEE.lng, end_lat: FAIR.lat, end_lng: FAIR.lng, result: null, lie: null, penalty_strokes: 0 });
    await open();
    await page.waitForFunction(() => document.querySelector("#tkro")?.classList.contains("tk-live") && /\d+ yd/.test(document.querySelector("#tkro")?.textContent || ""), { timeout: 25000 });
    assert.equal(await page.$eval("#play-hit", el => el.textContent), "ENTER");
    assert.equal(await page.$eval("#play-hit", el => getComputedStyle(el).backgroundColor), "rgb(11, 37, 69)");
    const clubBtn = await page.$eval("#play-club-tile", el => ({
      text: (el.textContent || "").replace(/\s+/g, " ").trim(),
      img: !!el.querySelector("img"),
      h: el.getBoundingClientRect().height,
    }));
    const enterH = await page.$eval("#play-hit", el => el.getBoundingClientRect().height);
    assert.equal(clubBtn.img, true);
    assert.match(clubBtn.text, /Driver/);
    assert.ok(Math.abs(clubBtn.h - enterH) < 2, JSON.stringify({ clubBtn, enterH }));
    const lieBtn = await page.$eval("#play-lie", el => {
      const box = el.getBoundingClientRect();
      return { text: (el.textContent || "").trim(), right: box.right, left: box.left };
    });
    assert.equal(lieBtn.text, "En el green");
    assert.ok(lieBtn.right <= 375 && lieBtn.left >= 0, JSON.stringify(lieBtn));
    const rail = await page.$eval("#play-shot-1", el => el.textContent || "");
    assert.match(rail, /Driver/);
    assert.equal(rail.includes("496"), false);
    assert.equal((await page.$eval("#tkro", el => el.textContent || "")).includes("En el hoyo"), false);
    assert.equal(await oneLine(), true);
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

    shots.length = 0;
    shots.push(
      { id: "s1", hole: 12, club: "Dr", lat: TEE.lat, lng: TEE.lng, end_lat: FAIR.lat, end_lng: FAIR.lng, result: null, lie: null, penalty_strokes: 0 },
      { id: "s2", hole: 12, club: "Hierro 7", lat: FAIR.lat, lng: FAIR.lng, end_lat: PUTT.lat, end_lng: PUTT.lng, result: null, lie: null, penalty_strokes: 0 },
      { id: "s3", hole: 12, club: "Putter", lie: "green", lat: PUTT.lat, lng: PUTT.lng, end_lat: GREEN.lat, end_lng: GREEN.lng, result: null, penalty_strokes: 0, distance_m: meters(PUTT, GREEN) },
    );
    await open();
    await page.waitForFunction(() => (document.querySelector("#tkro")?.textContent || "").includes("En el hoyo"), { timeout: 25000 });
    assert.ok(await page.$(".tk-holeflash"));
    await page.waitForFunction(() => {
      const map = document.querySelector("#tkmap");
      const tile = document.querySelector("img.tk-tile") as HTMLImageElement | null;
      return map?.getAttribute("data-map") === "ready" && Number(map.getAttribute("data-z") || 0) >= 18 && !!tile && tile.naturalWidth > 32;
    }, { timeout: 15000 });
    assert.equal(await page.$(".tk-aim-n"), null);
    assert.ok(await page.$(".tk-flagcloth"));
    const greenFrame = await page.evaluate(() => {
      const flag = document.querySelector(".tk-flagpin")?.getBoundingClientRect();
      const ret = document.querySelector("#play-reticle")?.getBoundingClientRect();
      const chip = document.querySelector("#tkro")?.getBoundingClientRect();
      return {
        flag: flag ? { x: flag.left, y: flag.top, w: flag.width, h: flag.height } : null,
        retOpacity: getComputedStyle(document.querySelector("#play-reticle") as Element).opacity,
        chipBottom: chip?.bottom || 0,
      };
    });
    assert.ok(greenFrame.flag && greenFrame.flag.y > greenFrame.chipBottom, JSON.stringify(greenFrame));
    assert.equal(greenFrame.retOpacity, "0");
    await page.screenshot({ path: join(art, "web-375-whygolf-hoyo.png") });

    const putt = shots.find(s => s.id === "s3");
    if (putt) putt.result = "holed";
    await open();
    await page.waitForSelector(".tk-mapill", { timeout: 25000 });
    await page.waitForSelector("#play-next");
    await page.waitForSelector("#play-penalty");
    const pills = await page.$$eval(".tk-mapill", nodes => nodes.map(n => n.textContent || "").join(" | "));
    assert.match(pills, /Driver/);
    assert.match(pills, /Putter/);
    assert.match(pills, /Hierro 7/);
    assert.equal(/\b(Dr|7i|PW)\b/.test(pills), false);
    assert.equal(pills.includes("496"), false);
    const closed = await page.$eval("#tkro", el => el.textContent || "");
    assert.match(closed, /3 golpes/);
    assert.match(closed, /1 putt/);
    assert.match(closed, /Birdie/);
    assert.equal(closed.includes("Águila"), false);
    assert.equal(await oneLine(), true);
    await page.waitForFunction(() => document.querySelector("#tkmap")?.getAttribute("data-map") === "ready", { timeout: 15000 });
    const framed = await page.evaluate(() => {
      const flag = document.querySelector(".tk-flagpin")?.getBoundingClientRect();
      const tee = document.querySelector(".tk-pl")?.getBoundingClientRect();
      const rail = document.querySelector(".tk-shots-rail")?.getBoundingClientRect();
      const card = document.querySelector(".tk-ro.tk-done")?.getBoundingClientRect();
      const dock = document.querySelector(".tk-nextblock")?.getBoundingClientRect();
      const pills = [...document.querySelectorAll(".tk-mapill")].map(n => n.getBoundingClientRect());
      let pillHits = false;
      for (let i = 0; i < pills.length; i++) {
        for (let j = i + 1; j < pills.length; j++) {
          const a = pills[i], b = pills[j];
          if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) pillHits = true;
        }
        const p = pills[i];
        if (rail && p.left < rail.right && p.right > rail.left && p.top < rail.bottom && p.bottom > rail.top) pillHits = true;
        if (card && p.left < card.right && p.right > card.left && p.top < card.bottom && p.bottom > card.top) pillHits = true;
      }
      const ret = document.querySelector("#play-reticle");
      return {
        flag: flag ? { x: flag.left, y: flag.top, r: flag.right, b: flag.bottom } : null,
        tee: tee ? { y: tee.top, b: tee.bottom } : null,
        railRight: rail ? rail.right : 0,
        cardBottom: card ? card.bottom : 0,
        dockTop: dock ? dock.top : 0,
        pillHits,
        pillRight: pills.reduce((max, p) => Math.max(max, p.right), 0),
        retOpacity: ret ? getComputedStyle(ret).opacity : "",
      };
    });
    assert.ok(framed.flag && framed.flag.y > framed.cardBottom && framed.flag.x > framed.railRight - 8, JSON.stringify(framed));
    assert.ok(framed.tee && framed.tee.b < framed.dockTop, JSON.stringify(framed));
    assert.equal(framed.pillHits, false);
    assert.ok(framed.pillRight > 0 && framed.pillRight <= 312, JSON.stringify(framed));
    assert.equal(framed.retOpacity, "0");
    await page.screenshot({ path: join(art, "web-375-whygolf-resumen.png") });

    const before = await page.$eval("#play-shot-3", el => el.textContent || "");
    assert.match(before, /\b(ft|in)\b/);
    await page.click("#play-shot-3");
    await page.waitForSelector("#play-shot-editor");
    const editor = await page.$eval("#play-shot-editor", el => el.textContent || "");
    assert.match(editor, /Punto de inicio/);
    assert.match(editor, /Punto final/);
    assert.match(editor, /Objetivo/);
    assert.match(editor, /Insertar tiro/);
    assert.match(editor, /A buena/);
    assert.match(editor, /Borrar tiro/);
    assert.equal(editor.includes("Punch"), false);
    const covered = await page.evaluate(() => {
      const block = document.querySelector(".tk-nextblock") as HTMLElement | null;
      return !block || getComputedStyle(block).display === "none" || block.getBoundingClientRect().height === 0;
    });
    assert.equal(covered, true);
    await page.screenshot({ path: join(art, "web-375-whygolf-editar.png") });
    await page.click("#play-edit-club");
    await page.waitForSelector("#play-club-list button.on");
    const onClub = await page.$eval("#play-club-list button.on", el => getComputedStyle(el).boxShadow);
    assert.match(onClub, /rgb\(200, 16, 46\)/);
    await page.evaluate(() => {
      const btn = document.querySelector('#play-club-list button[data-club="PW"]');
      if (btn instanceof HTMLElement) btn.click();
    });
    await page.waitForFunction(() => /Pitching wedge/.test(document.querySelector("#play-shot-3")?.textContent || "") && /yd/.test(document.querySelector("#play-shot-3")?.textContent || ""), { timeout: 8000 });
    const after = await page.$eval("#play-shot-3", el => el.textContent || "");
    assert.equal(/\b(ft|in)\b/.test(after), false);
    assert.match(after, /Pitching wedge/);
    assert.match(after, /\d+ yd/);
  } finally {
    await browser.close();
    await new Promise<void>(r => server.close(() => r()));
  }
});
