/** 375px captures of the Azul holes after the nine swap. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import test from "node:test";
import { azulBundledMap } from "../lib/azul-osm";
import { relabelAzulHoles } from "../lib/azul-layout";

const CHROME = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find(p => existsSync(p));
const ROOT = new URL("../public/", import.meta.url);
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".png": "image/png" };
type CardHole = { hole: number; par: number; hole_hcp: number; yards: { AZUL: number } };
const courses = JSON.parse(readFileSync(new URL("../../Golflet/Resources/Fixtures/courses.json", import.meta.url), "utf8")) as { club_code: string; course: string; holes: CardHole[] }[];
const card = courses.find(c => c.club_code === "118" && c.course === "Azul")!;
const current = relabelAzulHoles(azulBundledMap().holes.map(h => {
  const row = card.holes.find(c => c.hole === h.hole)!;
  return { ...h, par: row.par, hcp: row.hole_hcp, yards: row.yards.AZUL };
}), "2026-11-22");
const map = {
  club_code: "118",
  course: "Azul",
  layout: "current",
  holes: current,
};

test("la Azul nueva muestra los hoyos 1, 3 y 12 a 375", { timeout: 90_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
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
      if (path.endsWith("/shots")) return json({ shots: [] });
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
  const teeLat = (n: number) => current.find(h => h.hole === n)!.tees[0]!.center!.lat;
  const expect = [
    { hole: 1, label: "Par 5", yards: "483 yd", hcp: "Hcp 4", lat: teeLat(1) },
    { hole: 3, label: "Par 4", yards: "409 yd", hcp: "Hcp 16", lat: teeLat(3) },
    { hole: 12, label: "Par 4", yards: "345 yd", hcp: "Hcp 9", lat: teeLat(12) },
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
      const ball = await page.$eval("#tkmap", el => Number(el.getAttribute("data-ball-lat")));
      assert.ok(Math.abs(ball - row.lat) < 1e-5, `hoyo ${row.hole} lat ${ball} vs ${row.lat}`);
      await page.screenshot({ path: join(art, `web-375-azul-hoyo-${row.hole}-nuevo.png`) });
      if (row.hole === 12) {
        for (let i = 0; i < 6; i++) await page.click("#play-zoom-out");
        await page.waitForFunction(() => document.querySelector("#tkmap")?.getAttribute("data-moving") === "0");
        await page.screenshot({ path: join(art, "web-375-azul-hoyo-12-nuevo-lejos.png") });
      }
    }
  } finally {
    await browser.close();
    await new Promise<void>(r => server.close(() => r()));
  }
});
