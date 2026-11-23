/** 375px: today's track shows the wind chip, and a miss shows a dash with retry. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import test from "node:test";

const CHROME = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find(p => existsSync(p));
const ROOT = new URL("../public/", import.meta.url);
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
const YD = 0.9144;
const hav = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371000, t = (x: number) => x * Math.PI / 180, dLa = t(b.lat - a.lat), dLo = t(b.lng - a.lng);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const GREEN = { lat: -34.48306, lng: -58.52882 };
const TEE = { lat: GREEN.lat - (414 * YD) / ((6371000 * Math.PI) / 180), lng: GREEN.lng };
const hole = { hole: 3, par: 4, hcp: 16, yards: { NEGRO: 414, AZUL: 409, BLANCO: 399, AMARILLO: 389 }, tee: TEE, green: { center: GREEN }, line: [TEE, GREEN], tees: [{ center: TEE }] };
const course = { club_code: "118", course: "Azul", course_id: "118-azul", holes: [hole] };

test("el track de hoy muestra el viento y, si no hay datos, un guion", { timeout: 90_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (body: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname.startsWith("/api/")) {
      for await (const chunk of req) void chunk;
      if (url.pathname === "/api/data") return json({ user: { name: "TEST-ONLY", pending_first_sync: false }, player: { name: "TEST-ONLY" }, hi_history: [], clubs: [], courses: [], rounds: [] });
      if (url.pathname === "/api/gps/courses/118-azul") return json({ course });
      if (url.pathname === "/api/course-maps/118/Azul") return json(course);
      if (url.pathname === "/api/reconstructions" && req.method === "GET") return json({ rounds: [], reconstructions: [
        { id: "live-hoy", date: today, current_hole: 3, club_code: "118", vm_course: "Azul", course: "Azul", round_id: "r-hoy" },
        { id: "live-vacio", date: today, current_hole: 3, club_code: "118", vm_course: "Azul", course: "Azul", round_id: null },
      ] });
      if (url.pathname.endsWith("/shots")) return json({ shots: [] });
      if (url.pathname === "/api/weather/now") {
        if (url.searchParams.get("retry") === "1") return json({ kmh: 12.3, from_deg: 241, gust_kmh: 31.3, temp_c: 25.6, precip_mm: 0, source: "Open-Meteo", at: `${today}T18:15`, hhmm: "18:15", stale: false });
        return json({ error: "Open-Meteo y MET Norway no devolvieron viento." }, 502);
      }
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
    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-vacio?hole=3`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => (document.querySelector("#play-wx")?.textContent || "").trim() === "–", { timeout: 20000 });
    await page.click("#play-wx");
    await page.waitForSelector("#play-wx-retry");
    const why = await page.$eval("#play-wx-why", el => el.textContent || "");
    assert.match(why, /Open-Meteo y MET Norway/);
    assert.match(why, /Reintentar/);
    assert.equal((await page.$eval(".tk-hn", el => el.textContent || "")).includes("414"), true);
    await page.screenshot({ path: join(art, "web-375-clima-sin-datos.png") });
    await page.click("#play-wx-retry");
    await page.waitForFunction(() => {
      const text = document.querySelector("#play-wx")?.textContent || "";
      return text.includes("12 km/h") && text.includes("26°C") && text.includes("Open-Meteo") && text.includes("18:15");
    }, { timeout: 15000 });
    const arrow = await page.$eval(".tk-wxarr", el => {
      const box = el.getBoundingClientRect();
      return { style: el.getAttribute("style") || "", h: box.height, w: box.width };
    });
    assert.match(arrow.style, /rotate\(/);
    assert.ok(arrow.h >= 30 && arrow.w >= 24, JSON.stringify(arrow));
    const copy = await page.$eval(".tk-wxcopy .num", el => ({ text: (el.textContent || "").trim(), h: el.getBoundingClientRect().height }));
    assert.match(copy.text, /12 km\/h · ráfagas 31 km\/h · 26°C/);
    assert.ok(copy.h < 22, JSON.stringify(copy));
    const placed = await page.evaluate(() => {
      const map = document.querySelector("#tkmap");
      const text = (document.querySelector("#tkro")?.textContent || "").replace(/\s+/g, " ");
      const card = document.querySelector("#tkro")?.getBoundingClientRect();
      const pin = document.querySelector(".tk-flagpin")?.getBoundingClientRect();
      const ret = document.querySelector("#play-reticle")?.getBoundingClientRect();
      const face = document.querySelector("#play-club-tile img") as HTMLImageElement | null;
      return {
        cursor: { lat: Number(map?.getAttribute("data-cursor-lat")), lng: Number(map?.getAttribute("data-cursor-lng")) },
        ball: { lat: Number(map?.getAttribute("data-ball-lat")), lng: Number(map?.getAttribute("data-ball-lng")) },
        flag: { lat: Number(map?.getAttribute("data-flag-lat")), lng: Number(map?.getAttribute("data-flag-lng")) },
        text,
        card: card ? { left: card.left, right: card.right, top: card.top, bottom: card.bottom } : null,
        pin: pin ? { left: pin.left, right: pin.right, top: pin.top, bottom: pin.bottom } : null,
        ret: ret ? { x: ret.left, y: ret.top } : null,
        face: face ? face.naturalWidth : 0,
      };
    });
    const shownLeft = Number((placed.text.match(/(\d+)\s*yd al hoyo/) || [])[1]);
    const shownShot = Number((placed.text.match(/(\d+)\s*yd/) || [])[1]);
    const remainYd = Math.round(hav(placed.cursor, placed.flag) / YD);
    const shotYd = Math.round(hav(placed.ball, placed.cursor) / YD);
    assert.ok(Math.abs(shownLeft - remainYd) <= 1, JSON.stringify({ placed, remainYd }));
    assert.ok(Math.abs(shownShot - shotYd) <= 1, JSON.stringify({ placed, shotYd }));
    assert.ok(Math.abs(shownShot + shownLeft - 414) <= 8, JSON.stringify({ shownShot, shownLeft }));
    const midY = placed.ret && placed.pin ? (placed.ret.y + (placed.pin.top + placed.pin.bottom) / 2) / 2 : 0;
    const covers = !!placed.card && !!placed.ret && placed.card.left <= placed.ret.x && placed.card.right >= placed.ret.x && placed.card.top <= midY && placed.card.bottom >= midY;
    assert.equal(covers, false, JSON.stringify(placed));
    assert.ok(placed.face > 0, JSON.stringify(placed.face));
    await page.screenshot({ path: join(art, "web-375-clima-viento.png") });
  } finally {
    await browser.close();
    server.close();
  }
});
