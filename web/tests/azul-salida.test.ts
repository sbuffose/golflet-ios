/** Par 5 whose listed tees do not measure the card. The automatic tee stays empty. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import test from "node:test";
import { matchingTee } from "../lib/play-rules.ts";

const CHROME = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find(p => existsSync(p));
const ROOT = new URL("../public/", import.meta.url);
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".png": "image/png" };

const GREEN = { lat: -34.4830601, lng: -58.5288192 };
const BACK = { lat: -34.4854229, lng: -58.5323458 };
const YELLOW = { lat: -34.4851158, lng: -58.5319504 };
const JUNK = { lat: -34.48332, lng: -58.52902 };
const CARD = { NEGRO: 488, AZUL: 485, BLANCO: 446, AMARILLO: 403 };

test("el hoyo 10 no hereda un centro que no mide las yardas de atrás", () => {
  assert.equal(matchingTee(GREEN, CARD, [JUNK, YELLOW, BACK]), null);
  assert.equal(matchingTee(GREEN, 488, [BACK])?.lat, BACK.lat);
});

test("el hoyo 10 pide confirmar la salida y conserva par, yardas y S.I.", { timeout: 90_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const ring = [
    [GREEN.lng - 0.00015, GREEN.lat - 0.00008],
    [GREEN.lng + 0.00015, GREEN.lat - 0.00008],
    [GREEN.lng + 0.00015, GREEN.lat + 0.00008],
    [GREEN.lng - 0.00015, GREEN.lat + 0.00008],
  ];
  const hole = {
    hole: 10, par: 5, hcp: 5, yards: CARD,
    green: { center: GREEN, front: GREEN, polygon: ring, source: "course_map" },
    tee: BACK,
    line: [[BACK.lng, BACK.lat], [GREEN.lng, GREEN.lat]],
    tees: [
      { center: [JUNK.lng, JUNK.lat] },
      { center: [YELLOW.lng, YELLOW.lat] },
      { center: [BACK.lng, BACK.lat] },
    ],
  };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (body: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname.startsWith("/api/")) {
      for await (const chunk of req) void chunk;
      if (url.pathname === "/api/data") return json({ user: { name: "TEST-ONLY", pending_first_sync: false }, player: { name: "TEST-ONLY" }, hi_history: [], clubs: [], courses: [], rounds: [] });
      if (url.pathname === "/api/gps/courses/118-jockey-azul") return json({ course: { club_code: "118", course: "Azul", course_id: "118-jockey-azul", holes: [hole] } });
      if (url.pathname === "/api/course-maps/118/Azul") return json({ club_code: "118", course: "Azul", holes: [hole] });
      if (url.pathname === "/api/reconstructions" && req.method === "GET") return json({ rounds: [], reconstructions: [
        { id: "live-azul-10", date: "2026-11-22", current_hole: 10, club_code: "118", vm_course: "JOCKEY AZUL", course: "Azul", round_id: null },
      ] });
      if (url.pathname.endsWith("/shots")) return json({ shots: [] });
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
    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-azul-10?hole=10`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => {
      const nav = document.querySelector(".tk-hn")?.textContent || "";
      const read = document.querySelector("#tkro")?.textContent || "";
      return nav.includes("Hoyo 10") && nav.includes("Par 5") && nav.includes("488") && nav.includes("S.I. 5") && read.includes("Sin salida verificada");
    }, { timeout: 20000 });
    const placed = await page.$eval("#tkmap", el => ({
      tee: el.getAttribute("data-tee-lat") || "",
      ball: el.getAttribute("data-ball-lat") || "",
      span: el.getAttribute("data-span") || "",
    }));
    assert.equal(placed.tee, "");
    assert.equal(placed.ball, "");
    assert.equal(placed.span, "");
    await page.screenshot({ path: join(art, "web-375-hoyo-10-azul.png") });
  } finally {
    await browser.close();
    server.close();
  }
});
