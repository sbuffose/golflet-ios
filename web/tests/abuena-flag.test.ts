/** A buena keeps a stroke number, and flag adjust frames the green. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import test from "node:test";
import { azulBundledMap } from "../lib/azul-osm";
import { azulPresentHoles, relabelAzulHoles } from "../lib/azul-layout";
import { frameGreenPolygon, holeCloseText, countedPutts, projectLL, shotCountsAsPutt } from "../lib/play-rules";
import { countsForClub, type ShotOut } from "../lib/shots-calc";

const punch = {
  id: "punch", hole: 3, shot_number: 2, lat: 1, lng: 1, accuracy_m: 4, club: "Hierro 4", lie: "rough", result: null,
  taken_at: "2026-11-24", distance_m: 40, distance_yd: 44, distance_source: "next_shot" as const, to_green_m: 80, to_green_yd: 87,
  source: "gps", distance_kind: "measured", intent: "recovery",
};

test("Hierro 4 a buena, Lob wedge and Putter count 2, 3 and 4", () => {
  assert.equal(countsForClub(punch as ShotOut), false);
  assert.equal(shotCountsAsPutt({ club: "Hierro 4", intent: "recovery", lie: "rough" }), false);
  assert.equal(shotCountsAsPutt({ club: "Putter", lie: "green" }), true);
  const putts = countedPutts([
    { club: "Driver", lie: "tee" },
    { club: "Hierro 4", intent: "recovery", recovery: true, lie: "rough" },
    { club: "Lob wedge", lie: "rough" },
    { club: "Putter", lie: "green" },
  ]);
  assert.equal(putts, 1);
  assert.equal(holeCloseText(4, 4, putts).line, "4 golpes · 1 putt");
});

type CardHole = { hole: number; par: number; hole_hcp: number; yards: { AZUL: number } };
const courses = JSON.parse(readFileSync(new URL("../../Golflet/Resources/Fixtures/courses.json", import.meta.url), "utf8")) as { club_code: string; course: string; holes: CardHole[] }[];
const card = courses.find(c => c.club_code === "118" && c.course === "Azul")!;
const played = "2026-11-22";
const azulHoles = azulPresentHoles(relabelAzulHoles(azulBundledMap().holes.map(h => {
  const row = card.holes.find(c => c.hole === h.hole)!;
  return { ...h, par: row.par, hcp: row.hole_hcp, yards: row.yards };
}), played), card.holes, played).map(h => h.hole === 3 ? { ...h, yards: { ...h.yards, NEGRO: 414 } } : h);

test("the Azul hole 3 green fills the flag band", () => {
  const hole = azulHoles.find(h => h.hole === 3)!;
  const poly = hole.green.polygon;
  assert.ok(poly.length >= 3);
  const view = { width: 390, height: 844 };
  const band = { top: 200, bottom: 230, side: 39 };
  const frame = frameGreenPolygon(poly, view, band);
  assert.ok(frame);
  assert.equal(frame.mode, "flag");
  assert.equal(frame.bearing, 0);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of poly) {
    const [x, y] = projectLL(p.lat, p.lng);
    xs.push(x);
    ys.push(y);
  }
  const bw = Math.max(...xs) - Math.min(...xs);
  const bh = Math.max(...ys) - Math.min(...ys);
  const n = 2 ** frame.z;
  const pxW = bw * n * 256;
  const pxH = bh * n * 256;
  const boxW = view.width - band.side * 2;
  const boxH = view.height - band.top - band.bottom;
  assert.ok(pxW <= boxW + 1.5, `width ${pxW} box ${boxW}`);
  assert.ok(pxH <= boxH + 1.5, `height ${pxH} box ${boxH}`);
  assert.ok(pxW >= boxW * 0.98 || pxH >= boxH * 0.98, `width ${pxW}/${boxW} height ${pxH}/${boxH}`);
});

const CHROME = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find(p => existsSync(p));
const ROOT = new URL("../public/", import.meta.url);
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg" };
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
const green = azulHoles.find(h => h.hole === 3)!.green.center!;
const listShots = [
  { id: "a1", hole: 3, shot_number: 1, club: "Driver", intent: null, result: null, lat: green.lat - 0.002, lng: green.lng, end_lat: green.lat - 0.001, end_lng: green.lng },
  { id: "a2", hole: 3, shot_number: 2, club: "Hierro 4", intent: "recovery", result: null, lat: green.lat - 0.001, lng: green.lng, end_lat: green.lat - 0.0006, end_lng: green.lng },
  { id: "a3", hole: 3, shot_number: 2, club: "Lob wedge", intent: null, result: null, lat: green.lat - 0.0006, lng: green.lng, end_lat: green.lat - 0.0003, end_lng: green.lng },
  { id: "a4", hole: 3, shot_number: 3, club: "Putter", intent: null, result: null, lie: "green", lat: green.lat - 0.0003, lng: green.lng, end_lat: green.lat - 0.0001, end_lng: green.lng },
];
const map = { club_code: "118", course: "Azul", layout: "current", holes: azulHoles };

test("the shot list and the Azul hole 3 flag view", { timeout: 120_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
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
      if (path === "/api/bag") return json([]);
      if (path === "/api/my-clubs/items" || path === "/api/my-clubs") return json({ clubs: [] });
      if (path.startsWith("/api/weather/now")) return json({ kmh: 36, from_deg: 20, temp_c: 24, source: "open-meteo-archive", gust_kmh: null, precip_mm: 0, hhmm: "", at: "", stale: false });
      if (path === "/api/reconstructions" && req.method === "GET") return json({ rounds: [], reconstructions: [
        { id: "live-list", date: today, current_hole: 3, club_code: "118", vm_course: "Azul", course: "Azul", round_id: null },
        { id: "live-flag", date: today, current_hole: 3, club_code: "118", vm_course: "Azul", course: "Azul", round_id: null },
      ] });
      if (path === "/api/reconstructions/live-list/shots") return json({ shots: listShots });
      if (path.endsWith("/shots")) return json({ shots: [] });
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
  mkdirSync("/opt/cursor/artifacts", { recursive: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    await page.setRequestInterception(true);
    page.on("request", req => {
      const host = new URL(req.url()).hostname;
      if (host !== "127.0.0.1" && host !== "localhost" && host !== "server.arcgisonline.com") req.abort();
      else req.continue();
    });
    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-list?hole=3`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#rc-shots");
    const more = await page.$("#play-shots-more");
    if (more) await more.click();
    const lines = await page.evaluate(() => {
      const nodes = document.querySelectorAll("#rc-shots .tk-shot:not(.tk-more)");
      const out = [];
      for (const node of nodes) out.push((node.textContent || "").replace(/\s+/g, " ").trim());
      return out;
    }) as string[];
    assert.deepEqual(lines.map(line => line.replace(/ · .*$/, "")), [
      "1. Driver",
      "2. Hierro 4 A buena",
      "3. Lob wedge",
      "4. Putter",
    ]);
    assert.equal(lines.some(line => /putt/i.test(line) && /Hierro 4/.test(line)), false);
    assert.equal(await page.$eval("#play-score", el => (el.textContent || "").trim()), "4");
    assert.equal((await page.evaluate(() => document.body.innerText)).includes("Hoyo cerrado"), false);
    await page.screenshot({ path: "/opt/cursor/artifacts/web-390-abuena-lista.png" });

    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-flag?hole=3`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => {
      const map = document.querySelector("#tkmap");
      return map?.getAttribute("data-map") === "ready" && map.getAttribute("data-phase") === "tracking" && !!document.querySelector("#play-flag");
    }, { timeout: 25000 });
    await page.evaluate(() => {
      const button = document.querySelector("#play-flag");
      if (button) (button as HTMLButtonElement).click();
    });
    await page.waitForFunction(() => {
      const map = document.querySelector("#tkmap");
      const poly = document.querySelector(".tk-g");
      return map?.getAttribute("data-phase") === "confirmFlag" && !!poly && map.getAttribute("data-map") === "ready";
    }, { timeout: 25000 });
    const laid = await page.evaluate(() => {
      const holeEl = document.querySelector("#tk-hole");
      const windEl = document.querySelector(".tk-wx");
      const cardEl = document.querySelector("#tkro");
      const polyEl = document.querySelector(".tk-g");
      const mapEl = document.querySelector("#tkmap");
      const sideEl = document.querySelector(".tk-sidebtns");
      const hr = holeEl ? holeEl.getBoundingClientRect() : null;
      const wr = windEl ? windEl.getBoundingClientRect() : null;
      const cr = cardEl ? cardEl.getBoundingClientRect() : null;
      const pr = polyEl ? polyEl.getBoundingClientRect() : null;
      const mr = mapEl ? mapEl.getBoundingClientRect() : null;
      const sr = sideEl ? sideEl.getBoundingClientRect() : null;
      return {
        hole: hr ? { l: hr.left, t: hr.top, r: hr.right, b: hr.bottom, w: hr.width, h: hr.height } : null,
        wind: wr ? { l: wr.left, t: wr.top, r: wr.right, b: wr.bottom, w: wr.width, h: wr.height } : null,
        card: cr ? { l: cr.left, t: cr.top, r: cr.right, b: cr.bottom, w: cr.width, h: cr.height } : null,
        poly: pr ? { l: pr.left, t: pr.top, r: pr.right, b: pr.bottom, w: pr.width, h: pr.height } : null,
        map: mr ? { l: mr.left, t: mr.top, r: mr.right, b: mr.bottom, w: mr.width, h: mr.height } : null,
        side: sr ? { l: sr.left, t: sr.top, r: sr.right, b: sr.bottom, w: sr.width, h: sr.height } : null,
        text: cardEl?.textContent || "",
        holeText: holeEl?.textContent || "",
        z: Number(mapEl?.getAttribute("data-z") || 0),
        tile: Number(mapEl?.getAttribute("data-tile-z") || 0),
      };
    }) as {
      hole: { l: number; t: number; r: number; b: number; w: number; h: number } | null;
      wind: { l: number; t: number; r: number; b: number; w: number; h: number } | null;
      card: { l: number; t: number; r: number; b: number; w: number; h: number } | null;
      poly: { l: number; t: number; r: number; b: number; w: number; h: number } | null;
      map: { l: number; t: number; r: number; b: number; w: number; h: number } | null;
      side: { l: number; t: number; r: number; b: number; w: number; h: number } | null;
      text: string; holeText: string; z: number; tile: number;
    };
    const hit = (a: { l: number; t: number; r: number; b: number }, b: { l: number; t: number; r: number; b: number }) => a.l < b.r - 2 && a.r > b.l + 2 && a.t < b.b - 2 && a.b > b.t + 2;
    assert.ok(laid.poly && laid.map && laid.card && laid.hole && laid.side);
    const ratio = laid.poly.w / laid.map.w;
    const center = Math.abs((laid.poly.l + laid.poly.r) / 2 - (laid.map.l + laid.map.r) / 2) / laid.map.w;
    assert.ok(ratio >= 0.7 && ratio <= 0.9, `green width ${ratio}`);
    assert.ok(center <= 0.08, `green center ${center}`);
    assert.equal(hit(laid.card, laid.poly), false);
    assert.equal(hit(laid.card, laid.side), false);
    assert.ok(laid.card.l < laid.map.w * 0.2);
    assert.ok(laid.card.w <= 220);
    assert.ok(laid.card.w >= 150, `card width ${laid.card.w}`);
    if (laid.wind) {
      assert.equal(hit(laid.hole, laid.wind), false);
      assert.equal(hit(laid.card, laid.wind), false);
    }
    assert.match(laid.text, /Ajustá la bandera/);
    assert.match(laid.text, /desde la salida/);
    assert.match(laid.holeText, /Hoyo 3/);
    assert.match(laid.holeText, /414 yd/);
    assert.equal(laid.tile, 17);
    assert.ok(laid.z > 17);
    await page.screenshot({ path: "/opt/cursor/artifacts/web-390-bandera-azul-3.png" });
    const before = laid.z;
    await page.click("#play-zoom-out");
    const after = await page.$eval("#tkmap", el => ({
      z: Number(el.getAttribute("data-z") || 0),
      phase: el.getAttribute("data-phase") || "",
      tile: Number(el.getAttribute("data-tile-z") || 0),
    }));
    assert.ok(after.z < before);
    assert.equal(after.phase, "confirmFlag");
    assert.equal(after.tile, 17);
  } finally {
    await browser.close();
    await new Promise<void>(r => server.close(() => r()));
  }
});
