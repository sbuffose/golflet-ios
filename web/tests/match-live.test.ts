/** TEST-ONLY. Metralleta board and the existing track. Fixture names only. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import test from "node:test";

const CHROME = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find(p => existsSync(p));
const ROOT = new URL("../public/", import.meta.url);
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg" };
const ART = "/opt/cursor/artifacts";

const blank = () => Array(18).fill(null);
const match = (kind: "up" | "square" | "done") => {
  const me = blank(), joaquin = blank(), augusto = blank();
  if (kind === "up") {
    me[0] = 4; joaquin[0] = 5; me[1] = 4; joaquin[1] = 5; joaquin[2] = 4; augusto[2] = 5;
  } else if (kind === "square") {
    me[0] = 4; joaquin[0] = 4; augusto[0] = 4;
  } else {
    for (let hole = 0; hole < 3; hole++) { me[hole] = 4; joaquin[hole] = 5; augusto[hole] = 6; }
    for (let hole = 3; hole < 16; hole++) { me[hole] = 4; joaquin[hole] = 4; augusto[hole] = 4; }
  }
  return {
    id: `fixture-${kind}`,
    date: "2026-11-22",
    course_label: "Jockey Club Argentino · Azul",
    status: kind === "done" ? "done" : "open",
    def: {
      modality: "metralleta",
      scoring: "gross",
      allowance: 100,
      players: [
        { id: "me", name: "Fixture Vos", hcp: 0 },
        { id: "joaquin", name: "Joaquín Lavalle", hcp: 0 },
        { id: "augusto", name: "Augusto Lavalle", hcp: 0 },
      ],
      si: Array.from({ length: 18 }, (_, i) => i + 1),
      pars: Array(18).fill(4),
    },
    scores: { me, joaquin, augusto },
  };
};

test("el partido muestra quién va arriba y abre el track existente", { timeout: 120_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  mkdirSync(ART, { recursive: true });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (data: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(data)); };
    if (url.pathname === "/api/data") return json({ user: { name: "TEST-ONLY", pending_first_sync: false }, player: { name: "TEST-ONLY" }, rounds: [], courses: [], clubs: [] });
    if (url.pathname === "/api/matches/fixture-up") return json(match("up"));
    if (url.pathname === "/api/matches/fixture-square") return json(match("square"));
    if (url.pathname === "/api/matches/fixture-done") return json(match("done"));
    if (url.pathname === "/api/gps/courses") return json({ courses: [{ course_id: "fixture-azul", label: "jockey club argentino · azul", course: "Azul" }] });
    if (url.pathname.startsWith("/api/gps/courses/")) return json({
      course: {
        course: "Azul", club_code: "fixture",
        holes: [{ hole: 1, par: 4, tee: { lat: -34.5, lng: -58.5 }, green: { center: { lat: -34.502, lng: -58.5 }, front: { lat: -34.501, lng: -58.5 } } }],
      },
    });
    if (url.pathname.startsWith("/api/")) return json({});
    const file = url.pathname === "/" ? "/index.html" : url.pathname;
    try {
      const buf = await readFile(new URL(file.slice(1), ROOT));
      res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
      res.end(buf);
    } catch { res.writeHead(404); res.end("missing"); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as { port: number }).port;
  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 2 });
    await page.setRequestInterception(true);
    page.on("request", request => {
      const url = request.url();
      if (url.startsWith(`http://127.0.0.1:${port}`) || url.includes("arcgisonline.com")) request.continue();
      else request.abort();
    });
    const open = async (id: string) => {
      await page.goto(`http://127.0.0.1:${port}/#/partido/${id}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#gm-board", { timeout: 8000 });
      await page.evaluate(() => { const bar = document.querySelector("#tabbar"); if (bar) (bar as HTMLElement).style.display = "none"; });
    };
    const text = () => page.evaluate(() => document.querySelector("#gm")?.textContent || "");
    const shot = (name: string) => page.screenshot({ path: `${ART}/${name}.png` });
    const fits = () => page.evaluate(() => {
      const board = document.querySelector("#gm-board");
      if (!board) return false;
      return [...board.querySelectorAll(".gm-ln")].every(line => line.scrollWidth <= line.clientWidth + 1);
    });

    await open("fixture-up");
    const up = await text();
    assert.match(up, /Vos 2 arriba/);
    assert.match(up, /Joaquín L\. 1 arriba/);
    assert.match(up, /All square/);
    assert.match(up, /Trackear golpes/);
    assert.equal(up.includes("partidos terminados"), false);
    const hole = await page.$eval(".gm-hs button.on", el => {
      const style = getComputedStyle(el);
      return { text: (el.textContent || "").trim(), bg: style.backgroundColor, color: style.color };
    });
    assert.equal(hole.text, "1");
    assert.equal(hole.bg, "rgb(11, 37, 69)");
    assert.equal(hole.color, "rgb(246, 247, 249)");
    assert.equal(await fits(), true);
    await shot("web-375-partido-arriba");

    await page.click("#gm-track");
    await page.waitForSelector(".tk-unofficial", { timeout: 8000 });
    await page.waitForFunction(() => {
      const err = document.querySelector("#tk-maperr");
      return !err || (err as HTMLElement).hidden;
    }, { timeout: 8000 }).catch(() => undefined);
    const track = await page.evaluate(() => {
      const tile = document.querySelector("#play-club-tile");
      const img = tile?.querySelector("img");
      const good = document.querySelector("#play-good") as HTMLElement | null;
      const goodStyle = good ? getComputedStyle(good) : null;
      return {
        text: document.body.innerText,
        tile: (tile?.textContent || "").replace(/\s+/g, " ").trim(),
        src: img?.getAttribute("src") || "",
        good: (good?.textContent || "").trim(),
        nowrap: goodStyle?.whiteSpace || "",
        lines: good ? good.scrollHeight <= good.clientHeight + 1 : false,
      };
    });
    assert.match(track.text, /No oficial/);
    assert.equal(track.good, "A buena");
    assert.equal(track.nowrap, "nowrap");
    assert.equal(track.lines, true);
    assert.equal(track.tile.includes("CLUB"), false);
    assert.equal(/\bDr\b/.test(track.tile), false);
    assert.match(track.src, /silhouettes\/driver\.svg/);
    await shot("web-375-partido-track");

    await open("fixture-square");
    const square = await text();
    assert.equal((square.match(/All square/g) || []).length, 3);
    assert.match(square, /Trackear golpes/);
    assert.equal(await fits(), true);
    await shot("web-375-partido-square");

    await open("fixture-done");
    const done = await text();
    assert.match(done, /Ganó Vos 3&2/);
    assert.match(done, /Ganó Joaquín L\. 3&2/);
    assert.equal(done.includes("Trackear golpes"), false);
    assert.equal(done.includes("partidos terminados"), false);
    assert.equal(await fits(), true);
    await shot("web-375-partido-terminado");

    const poured = await page.evaluate(() => {
      const api = (window as unknown as { GolfletMatch: { applyTrack: (id: string, hole: number, strokes: number) => boolean } }).GolfletMatch;
      api.applyTrack("fixture-square", 1, 6);
      api.applyTrack("fixture-square", 1, 6);
      const row = JSON.parse(localStorage.getItem("golflet.match.fixture-square") || "{}");
      return row.scores?.me?.[0];
    });
    assert.equal(poured, 6);
  } finally {
    await browser.close();
    server.close();
  }
});
