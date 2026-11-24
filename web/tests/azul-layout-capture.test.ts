/** 375px captures: display 3 is stored 12, display 12 is stored 3, and 10 stays. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import test from "node:test";
import { azulBundledMap } from "../lib/azul-osm";
import { azulPresentHoles, relabelAzulHoles } from "../lib/azul-layout";

const CHROME = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find(p => existsSync(p));
const ROOT = new URL("../public/", import.meta.url);
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".png": "image/png" };
type CardHole = { hole: number; par: number; hole_hcp: number; yards: { AZUL: number } };
const courses = JSON.parse(readFileSync(new URL("../../Golflet/Resources/Fixtures/courses.json", import.meta.url), "utf8")) as { club_code: string; course: string; holes: CardHole[] }[];
const card = courses.find(c => c.club_code === "118" && c.course === "Azul")!;
const current = azulPresentHoles(relabelAzulHoles(azulBundledMap().holes.map(h => {
  const row = card.holes.find(c => c.hole === h.hole)!;
  return { ...h, par: row.par, hcp: row.hole_hcp, yards: row.yards };
}), "2026-11-22"), card.holes, "2026-11-22").map(h => ({ ...h, yards: h.yards.AZUL }));
const map = {
  club_code: "118",
  course: "Azul",
  layout: "current",
  holes: current,
};

const hole3Shots = [
  { id: "h3-1", hole: 3, shot_number: 1, lat: -34.48640, lng: -58.52676, end_lat: -34.48433, end_lng: -58.52808, result: null, club: "" },
  { id: "h3-2", hole: 3, shot_number: 2, lat: -34.48433, lng: -58.52808, end_lat: -34.48322, end_lng: -58.52820, result: null, club: "" },
  { id: "h3-3", hole: 3, shot_number: 3, lat: -34.48322, lng: -58.52820, end_lat: -34.48313, end_lng: -58.52820, result: null, club: "" },
  { id: "h3-4", hole: 3, shot_number: 4, lat: -34.48313, lng: -58.52820, end_lat: -34.48313, end_lng: -58.52820, result: "holed", club: "" },
];

test("la Azul muestra los hoyos 3, 10 y 12 con el mapeo del 22 nov", { timeout: 120_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  let roundShots = false;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const path = decodeURIComponent(url.pathname);
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (body: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (path.startsWith("/api/")) {
      for await (const chunk of req) void chunk;
      if (path === "/api/data") return json({ user: { name: "TEST-ONLY", pending_first_sync: false }, player: { name: "TEST-ONLY" }, hi_history: [], clubs: [], courses: [], rounds: [] });
      if (path === "/api/gps/courses/118-azul") return json({ course: { ...map, course_id: "118-azul" } });
      if (path === "/api/course-maps/118/Azul") return json(map);
      if (path === "/api/reconstructions" && req.method === "GET") return json({ rounds: [], reconstructions: [
        { id: "live-azul", date: "2026-11-22", current_hole: 1, club_code: "118", vm_course: "Azul", course: "Azul", round_id: null },
      ] });
      if (path.endsWith("/shots")) return json({ shots: roundShots ? hole3Shots : [] });
      if (path === "/api/bag") return json({ clubs: [] });
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
  const teeLats = (n: number) => current.find(h => h.hole === n)!.tees.map(t => t.center!.lat);
  const greenLat = (n: number) => current.find(h => h.hole === n)!.green.center!.lat;
  const storedGreen = (n: number) => azulBundledMap().holes.find(h => h.hole === n)!.green.center!;
  const expect = [
    { hole: 3, label: "Par 4", yards: "409 yd", hcp: "S.I. 9", tees: teeLats(3), flag: greenLat(3) },
    { hole: 7, label: "Par 4", yards: "377 yd", hcp: "S.I. 13", tees: teeLats(7), flag: greenLat(7) },
    { hole: 10, label: "Par 5", yards: "483 yd", hcp: "S.I. 4", tees: teeLats(10), flag: greenLat(10) },
    { hole: 12, label: "Par 4", yards: "345 yd", hcp: "S.I. 16", tees: teeLats(12), flag: greenLat(12) },
    { hole: 17, label: "Par 4", yards: "427 yd", hcp: "S.I. 2", tees: teeLats(17), flag: greenLat(17), note: "427 en el azul" },
  ];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 375, height: 812, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    for (const row of expect) {
      await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-azul?hole=${row.hole}`, { waitUntil: "networkidle0" });
      await page.waitForFunction((hole, yards) => {
        const text = document.querySelector(".tk-hn")?.textContent || "";
        const map = document.querySelector("#tkmap");
        return text.includes(`Hoyo ${hole}`) && text.includes(yards) && map?.getAttribute("data-map") === "ready" && map?.getAttribute("data-moving") === "0";
      }, { timeout: 25000 }, row.hole, row.yards);
      const seen = await page.$eval(".tk-hn", el => el.textContent || "");
      assert.match(seen, new RegExp(`Hoyo ${row.hole}`));
      assert.match(seen, new RegExp(row.label));
      assert.match(seen, new RegExp(row.yards));
      assert.match(seen, new RegExp(row.hcp));
      if ("note" in row && row.note) {
        const note = await page.$eval("#tk-yardnote", el => el.textContent || "");
        assert.match(note, new RegExp(row.note));
      } else {
        const note = await page.$("#tk-yardnote");
        assert.equal(note, null);
      }
      const ball = await page.$eval("#tkmap", el => Number(el.getAttribute("data-ball-lat")));
      const flag = await page.$eval("#tkmap", el => ({ lat: Number(el.getAttribute("data-flag-lat")), lng: Number(el.getAttribute("data-flag-lng")) }));
      const meters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
        const r = 6371000, p1 = a.lat * Math.PI / 180, p2 = b.lat * Math.PI / 180;
        const dlat = (b.lat - a.lat) * Math.PI / 180, dlng = (b.lng - a.lng) * Math.PI / 180;
        const h = Math.sin(dlat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dlng / 2) ** 2;
        return 2 * r * Math.asin(Math.sqrt(h));
      };
      assert.ok(row.tees.some(lat => Math.abs(ball - lat) < 1e-5), `hoyo ${row.hole} lat ${ball} fuera de sus salidas`);
      assert.ok(Math.abs(flag.lat - row.flag) < 1e-5, `hoyo ${row.hole} bandera ${flag.lat} vs ${row.flag}`);
      if (row.hole === 10) assert.ok(meters(flag, storedGreen(1)) > 80, "el hoyo 10 no usa el green del 1");
      if (row.hole === 3) assert.ok(meters(flag, storedGreen(3)) > 80, "el hoyo 3 usa el green guardado del 12");
      if (row.hole === 7) assert.ok(meters(flag, storedGreen(7)) > 80, "el hoyo 7 usa el green guardado del 16");
      if (row.hole === 12) assert.ok(meters(flag, storedGreen(12)) > 80, "el hoyo 12 usa el green guardado del 3");
      if (row.hole === 17) assert.ok(meters(flag, storedGreen(17)) > 80, "el hoyo 17 usa el green guardado del 8");
      await page.screenshot({ path: join(art, `web-375-azul-hoyo-${row.hole}.png`) });
      if (row.hole === 10) {
        for (let i = 0; i < 4; i++) await page.click("#play-zoom-out");
        await page.waitForFunction(() => document.querySelector("#tkmap")?.getAttribute("data-moving") === "0");
        await page.screenshot({ path: join(art, "web-375-azul-hoyo-10-lejos.png") });
        for (let i = 0; i < 4; i++) await page.click("#play-zoom-in");
        await page.waitForFunction(() => document.querySelector("#tkmap")?.getAttribute("data-moving") === "0");
      }
      if (row.hole === 12) {
        for (let i = 0; i < 6; i++) await page.click("#play-zoom-out");
        await page.waitForFunction(() => document.querySelector("#tkmap")?.getAttribute("data-moving") === "0");
        await page.screenshot({ path: join(art, "web-375-azul-hoyo-12-nuevo-lejos.png") });
      }
    }
    roundShots = true;
    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-azul?hole=3&ronda=1`, { waitUntil: "networkidle0" });
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForFunction(() => {
      const text = document.querySelector(".tk-hn")?.textContent || "";
      const marks = document.querySelectorAll(".tk-mapill, .tk-shot-mark").length;
      return text.includes("Hoyo 3") && text.includes("409 yd") && marks >= 4;
    }, { timeout: 25000 });
    const roundFlag = await page.$eval("#tkmap", el => Number(el.getAttribute("data-flag-lat")));
    assert.ok(Math.abs(roundFlag - greenLat(3)) < 1e-5, "la ronda del hoyo 3 se dibuja sobre el green del 12 guardado");
    await page.screenshot({ path: join(art, "web-375-azul-ronda-hoyo-3.png") });
  } finally {
    await browser.close();
    await new Promise<void>(r => server.close(() => r()));
  }
});
