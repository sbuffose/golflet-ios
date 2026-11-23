/** t728–t731: club names, reticle distance, putts in feet, compact dock. Fixture only. */
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
const YD = 0.9144;
const meters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371000, t = (x: number) => x * Math.PI / 180, dLa = t(b.lat - a.lat), dLo = t(b.lng - a.lng);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const GREEN = { lat: -34.48305197, lng: -58.52881 };
const DEG = (6371000 * Math.PI) / 180;
const south = (yards: number) => ({ lat: GREEN.lat - (yards * YD) / DEG, lng: GREEN.lng });
const TEE = south(414);
const DRIVE = south(414 - 285);
const ELEVEN = south(12);
const ONE = south(1);
const holeYd = Math.round(meters(TEE, GREEN) / YD);
const bag = [
  { club: "Putter" },
  { club: "Driver", carry: 285 },
  { club: "Madera 3", carry: 230 },
  { club: "Híbrido 4", carry: 210 },
  { club: "Hierro 7", carry: 155 },
  { club: "PW", carry: 120 },
  { club: "54°", carry: 90 },
];
const holeRow: Record<string, unknown> = { hole: 3, par: 4, hcp: 16, yards: 414, green: { center: GREEN }, tee: TEE, line: [TEE, GREEN] };
const course = { club_code: "118", course: "Azul", course_id: "118-azul", holes: [holeRow] };
const shots: Array<Record<string, unknown>> = [];

test("el tiro vivo mide desde la mira y el panel cabe en una barra", { timeout: 120_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (body: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname === "/api/data") return json({ user: { name: "TEST-ONLY", pending_first_sync: false }, player: { name: "TEST-ONLY" }, hi_history: [], clubs: [], courses: [], rounds: [], bag });
      if (url.pathname === "/api/bag") return json(bag);
      if (url.pathname === "/api/gps/courses") return json({ courses: [course] });
      if (url.pathname.startsWith("/api/gps/courses/")) return json({ course });
      if (url.pathname.startsWith("/api/course-maps/")) return json(course);
      if (url.pathname === "/api/reconstructions" && req.method === "GET") return json({ rounds: [], reconstructions: [
        { id: "live-panel", date: today, current_hole: 3, club_code: "118", vm_course: "Azul", course: "Azul", round_id: "r-panel" },
      ] });
      if (url.pathname.endsWith("/shots")) return json({ shots });
      if (url.pathname === "/api/weather/now") return json({ kmh: 18, from_deg: 180, temp_c: 22, gust_kmh: 7, source: "Open-Meteo", hhmm: "12:00", stale: false });
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
    assert.ok(Math.abs(holeYd - 414) <= 2, String(holeYd));
    const page = await browser.newPage();
    await page.setViewport({ width: 375, height: 812, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-panel?hole=3`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.querySelector("#tkro")?.classList.contains("tk-live") && /\d+ yd/.test(document.querySelector("#tkro")?.textContent || ""), { timeout: 25000 });

    const readLive = () => page.evaluate(() => {
      const text = document.querySelector("#tkro")?.textContent || "";
      const shot = Number((text.match(/(\d+)\s*yd/) || [])[1]);
      const left = Number((text.match(/(\d+)\s*yd al hoyo/) || [])[1]);
      return {
        shot, left, text: text.replace(/\s+/g, " ").trim(),
        line: !!document.querySelector(".tk-toflag"),
      };
    });
    for (let i = 0; i < 14; i += 1) {
      const live = await readLive();
      if (live.shot >= 250 && live.shot <= 330) break;
      await page.mouse.move(180, 300);
      await page.mouse.down();
      await page.mouse.move(180, live.shot < 250 ? 430 : 180, { steps: 6 });
      await page.mouse.up();
      await new Promise(r => setTimeout(r, 120));
    }
    const live = await readLive();
    assert.ok(live.shot >= 200 && live.shot <= 360, JSON.stringify(live));
    assert.ok(Math.abs(live.shot + live.left - holeYd) <= 8, JSON.stringify({ live, holeYd }));
    assert.ok(Math.abs(live.left - holeYd) > 40, JSON.stringify({ live, holeYd }));
    assert.equal(live.line, true);
    const card = await page.$eval("#tkro", el => {
      const box = el.getBoundingClientRect();
      const num = el.querySelector("b.num");
      const left = el.querySelector(".tk-left");
      return {
        left: box.left, right: box.right, top: box.top, bottom: box.bottom,
        num: num ? parseFloat(getComputedStyle(num).fontSize) : 0,
        leftSize: left ? parseFloat(getComputedStyle(left).fontSize) : 0,
      };
    });
    assert.ok(card.left >= 8 && card.right <= 188, JSON.stringify(card));
    assert.ok(card.num >= 32 && card.leftSize >= 16, JSON.stringify(card));
    const geo = await page.evaluate(() => {
      const map = document.querySelector("#tkmap");
      return {
        cursor: { lat: Number(map?.getAttribute("data-cursor-lat")), lng: Number(map?.getAttribute("data-cursor-lng")) },
        ball: { lat: Number(map?.getAttribute("data-ball-lat")), lng: Number(map?.getAttribute("data-ball-lng")) },
        flag: { lat: Number(map?.getAttribute("data-flag-lat")), lng: Number(map?.getAttribute("data-flag-lng")) },
      };
    });
    const remainYd = Math.round(meters(geo.cursor, geo.flag) / YD);
    const shotYd = Math.round(meters(geo.ball, geo.cursor) / YD);
    assert.ok(Math.abs(live.left - remainYd) <= 1, JSON.stringify({ live, remainYd, geo }));
    assert.ok(Math.abs(live.shot - shotYd) <= 1, JSON.stringify({ live, shotYd, geo }));
    const title = await page.$eval(".tk-cn", el => {
      const b = el.getBoundingClientRect();
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
    });
    const flag = await page.$eval(".tk-flagpin", el => {
      const b = el.getBoundingClientRect();
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
    });
    const titleHitsFlag = !(title.right < flag.left || flag.right < title.left || title.bottom < flag.top || flag.bottom < title.top);
    assert.equal(titleHitsFlag, false, JSON.stringify({ title, flag }));
    await page.waitForFunction(() => {
      const text = document.querySelector("#play-wx")?.textContent || "";
      return text.includes("a favor") && text.includes("18 km/h") && text.includes("ráfagas 7") && text.includes("22°C");
    }, { timeout: 15000 });
    const cardWind = await page.$eval("#tkro", el => el.textContent || "");
    assert.equal(/más|menos|en contra|a favor|Sin dirección|ráfagas/.test(cardWind), false, cardWind);
    const juega = Number((cardWind.match(/Juega (\d+) yd/) || [])[1]);
    if (juega) {
      assert.ok(Math.abs(juega - live.left) < Math.abs(juega - live.shot), cardWind);
      assert.ok(Math.abs(juega - live.left) <= Math.max(15, live.left * 0.2), cardWind);
    }
    const windClear = await page.evaluate(() => {
      const wxNode = document.querySelector("#play-wx");
      const titleNode = document.querySelector(".tk-cn");
      const flagNode = document.querySelector(".tk-flagpin");
      const wx = wxNode ? wxNode.getBoundingClientRect() : null;
      const titleBox = titleNode ? titleNode.getBoundingClientRect() : null;
      const flagBox = flagNode ? flagNode.getBoundingClientRect() : null;
      const titleHit = !!wx && !!titleBox && !(titleBox.right < wx.left || wx.right < titleBox.left || titleBox.bottom < wx.top || wx.bottom < titleBox.top);
      const flagHit = !!wx && !!flagBox && !(flagBox.right < wx.left || wx.right < flagBox.left || flagBox.bottom < wx.top || wx.bottom < flagBox.top);
      return { title: titleHit, flag: flagHit, right: wx ? wx.right : 0, left: wx ? wx.left : 0 };
    });
    assert.equal(windClear.title, false, JSON.stringify(windClear));
    assert.equal(windClear.flag, false, JSON.stringify(windClear));
    assert.ok(windClear.right > windClear.left && windClear.right <= 375, JSON.stringify(windClear));

    const dock = await page.evaluate(() => {
      const tile = document.querySelector("#play-club-tile")!.getBoundingClientRect();
      const hit = document.querySelector("#play-hit")!.getBoundingClientRect();
      const chips = [...document.querySelectorAll(".tk-rounds button")].filter(el => !el.closest("[hidden]")).map(el => {
        const box = el.getBoundingClientRect();
        return { id: el.id, h: Math.round(box.height), text: (el.textContent || "").replace(/\s+/g, " ").trim() };
      });
      const rail = document.querySelector(".tk-shots-rail");
      const railBg = rail ? getComputedStyle(rail).backgroundColor : "";
      return {
        tileH: Math.round(tile.height),
        hitH: Math.round(hit.height),
        tileText: (document.querySelector("#play-club-tile")?.textContent || "").replace(/\s+/g, " ").trim(),
        img: !!document.querySelector("#play-club-tile img"),
        chips,
        railBg,
      };
    });
    assert.ok(dock.tileH >= 52 && dock.tileH <= 60 && dock.hitH >= 52 && dock.hitH <= 60, JSON.stringify(dock));
    assert.equal(dock.img, true);
    assert.match(dock.tileText, /Driver|Hierro|Madera|Híbrido|Putter|PW|\d+°/);
    assert.equal(/\b(Dr|7i|Pt)\b/.test(dock.tileText), false);
    assert.ok(dock.chips.length >= 3, JSON.stringify(dock.chips));
    assert.ok(dock.chips.every(c => Math.abs(c.h - dock.chips[0].h) <= 1 && c.h >= 32 && c.h <= 40), JSON.stringify(dock.chips));
    const mover = await page.$eval("#play-move-tee", el => {
      const box = el.getBoundingClientRect();
      return { text: (el.textContent || "").trim(), left: box.left, right: box.right };
    });
    assert.equal(mover.text, "Mover");
    assert.ok(mover.left >= 0 && mover.right <= 375, JSON.stringify(mover));
    const teeLabel = await page.$eval("#play-tee", el => {
      const box = el.getBoundingClientRect();
      return { text: (el.textContent || "").trim(), scroll: el.scrollWidth, client: el.clientWidth, right: box.right };
    });
    assert.match(teeLabel.text, /414 yd/);
    assert.ok(teeLabel.scroll <= teeLabel.client + 1, JSON.stringify(teeLabel));
    if (dock.railBg) assert.match(dock.railBg, /rgba\(0, 0, 0, 0\)|transparent/);
    await page.screenshot({ path: join(art, "web-375-panel-vivo.png") });
    await page.screenshot({ path: join(art, "web-375-panel-barra.png"), clip: { x: 0, y: 520, width: 375, height: 292 } });

    await page.click("#play-club-tile");
    await page.waitForFunction(() => {
      const list = document.querySelector("#play-club-list");
      return !!list && !list.hasAttribute("hidden") && /Putter/.test(list.textContent || "") && /Hierro 7/.test(list.textContent || "");
    }, { timeout: 8000 });
    const grid = await page.$$eval("#play-club-list button", buttons => buttons.map(el => (el.textContent || "").replace(/\s+/g, " ").trim()));
    assert.ok(grid.some(t => t.startsWith("Putter") && !/\d/.test(t)), JSON.stringify(grid));
    assert.ok(grid.some(t => /Hierro 7/.test(t) && /yd/.test(t)), JSON.stringify(grid));
    assert.ok(grid.some(t => /54°/.test(t)), JSON.stringify(grid));
    assert.equal(grid.some(t => /\b(Dr|7i|Pt)\b/.test(t)), false, JSON.stringify(grid));
    const rings = await page.$$eval("#play-club-list button", els => els.filter(el => el.classList.contains("on") || el.classList.contains("sug")).map(el => el.getAttribute("data-club")));
    assert.equal(rings.length, 1, JSON.stringify(rings));
    const ring = await page.$eval("#play-club-list button.on", el => getComputedStyle(el).boxShadow);
    assert.match(ring, /rgb\(226, 185, 59\)/);
    const sheet = await page.$eval(".tk-sheetcard", el => {
      const box = el.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom };
    });
    assert.ok(sheet.bottom >= 790 && sheet.top > 80, JSON.stringify(sheet));
    const face = await page.$eval("#play-club-tile img", img => ({ w: img.naturalWidth, h: img.naturalHeight }));
    assert.ok(face.w > 0 && face.h > 0, JSON.stringify(face));
    const score = await page.$eval("#play-score", el => (el.textContent || "").trim());
    assert.equal(score, "–");
    await page.screenshot({ path: join(art, "web-375-panel-grilla.png") });
    await page.click("#play-club-close");

    shots.push(
      { id: "s1", hole: 3, club: "Driver", lat: TEE.lat, lng: TEE.lng, end_lat: DRIVE.lat, end_lng: DRIVE.lng, result: null, lie: null, penalty_strokes: 0 },
      { id: "s2", hole: 3, club: "GW", lat: DRIVE.lat, lng: DRIVE.lng, end_lat: ELEVEN.lat, end_lng: ELEVEN.lng, result: null, lie: null, penalty_strokes: 0 },
      { id: "s3", hole: 3, club: "PT", lat: ELEVEN.lat, lng: ELEVEN.lng, end_lat: ONE.lat, end_lng: ONE.lng, result: null, lie: "green", penalty_strokes: 0 },
      { id: "s4", hole: 3, club: "Putter", lat: ONE.lat, lng: ONE.lng, end_lat: GREEN.lat, end_lng: GREEN.lng, result: "holed", lie: "green", penalty_strokes: 0 },
    );
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForFunction(() => /2 putts/.test(document.querySelector("#tkro")?.textContent || "") && /33 ft/.test(document.body.textContent || ""), { timeout: 20000 });
    const close = (await page.$eval("#tkro", el => el.textContent || "")).replace(/\s+/g, " ").trim();
    assert.match(close, /4 golpes · 2 putts · Par/);
    assert.equal(close.includes("sin confirmar"), false);
    const rail3 = await page.$eval("#play-shot-3", el => el.textContent || "");
    const rail4 = await page.$eval("#play-shot-4", el => el.textContent || "");
    assert.match(rail3, /33 ft/);
    assert.match(rail4, /\b3 ft\b/);
    assert.equal(/\d+ yd/.test(rail3 + rail4), false);
    const nav = await page.$eval(".tk-hn", el => el.textContent || "");
    assert.match(nav, /S\.I\. 16/);
    assert.equal(/Hcp/i.test(nav), false);
    const penalty = await page.$eval("#play-penalty", el => (el.textContent || "").trim());
    assert.match(penalty, /P\+1|P/);
    const clear = await page.evaluate(() => {
      const card = document.querySelector(".tk-ro.tk-done")!.getBoundingClientRect();
      const wx = document.querySelector("#play-wx")!.getBoundingClientRect();
      const hits = !(card.right < wx.left || wx.right < card.left || card.bottom < wx.top || wx.bottom < card.top);
      const flag = document.querySelector(".tk-flagpin")!.getBoundingClientRect();
      const pills = [...document.querySelectorAll(".tk-mapill")].map(el => el.getBoundingClientRect());
      const pile = pills.filter(p => !(p.right < flag.left || flag.right < p.left || p.bottom < flag.top || flag.bottom < p.top));
      const flagHit = !(flag.right < wx.left || wx.right < flag.left || flag.bottom < wx.top || wx.bottom < flag.top);
      let shotHit = false;
      for (const el of document.querySelectorAll(".tk-shots-rail button")) {
        const p = el.getBoundingClientRect();
        if (!(p.right < wx.left + 1 || wx.right < p.left || p.bottom < wx.top || wx.bottom < p.top)) shotHit = true;
      }
      let pillHit = false;
      for (const p of pills) {
        if (!(p.right < wx.left || wx.right < p.left || p.bottom < wx.top || wx.bottom < p.top)) pillHit = true;
      }
      const wxText = (document.querySelector("#play-wx")?.textContent || "").replace(/\s+/g, " ").trim();
      return { hits, pile: pile.length, flagHit, shotHit, pillHit, wxText, wxTop: wx.top, wxBottom: wx.bottom, cardBottom: card.bottom, wxLeft: wx.left };
    });
    assert.equal(clear.hits, false, JSON.stringify(clear));
    assert.equal(clear.flagHit, false, JSON.stringify(clear));
    assert.equal(clear.shotHit, false, JSON.stringify(clear));
    assert.equal(clear.pillHit, false, JSON.stringify(clear));
    assert.equal(clear.pile, 0, JSON.stringify(clear));
    assert.match(clear.wxText, /22°C/);
    const railPaint = await page.evaluate(() => {
      const rail = document.querySelector(".tk-shots-rail");
      const pill = document.querySelector("#play-shot-1");
      return {
        rail: rail ? getComputedStyle(rail).backgroundColor : "",
        pill: pill ? getComputedStyle(pill).backgroundColor : "",
      };
    });
    assert.match(railPaint.rail, /rgba\(0, 0, 0, 0\)|transparent/);
    assert.equal(railPaint.pill, "rgb(255, 255, 255)");
    assert.ok(clear.wxTop >= 0 && clear.wxBottom <= 812, JSON.stringify(clear));
    await page.screenshot({ path: join(art, "web-375-panel-resumen.png") });
  } finally {
    await browser.close();
    server.close();
  }
});
