/** TEST-ONLY. Metralleta board and the existing track. Fixture names only. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
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

test("el partido muestra quién va arriba y abre el track existente", { timeout: 180_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  mkdirSync(ART, { recursive: true });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (data: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(data)); };
    if (url.pathname === "/api/data") return json({ user: { name: "TEST-ONLY", pending_first_sync: false }, player: { name: "TEST-ONLY" }, rounds: [], courses: [], clubs: [] });
    if (url.pathname.startsWith("/api/matches/") && req.method === "PUT") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      return json(JSON.parse(raw || "{}"));
    }
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
    const tileUrl = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/17/80529/44586";
    const tile = Buffer.from(await (await fetch(tileUrl)).arrayBuffer());
    await page.setRequestInterception(true);
    page.on("request", request => {
      const url = request.url();
      if (url.includes("arcgisonline.com")) {
        request.respond({ status: 200, contentType: "image/jpeg", headers: { "access-control-allow-origin": "*" }, body: tile });
        return;
      }
      if (url.startsWith(`http://127.0.0.1:${port}`)) request.continue();
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

    const hit = async (have: number) => {
      await page.waitForFunction((want) => {
        const button = document.querySelector("#play-hit") as HTMLButtonElement | null;
        const shots = document.querySelectorAll("#rc-shots .tk-shot:not(.tk-more)").length;
        const phase = document.querySelector("#tkmap")?.getAttribute("data-phase") || "";
        return !!button && !button.disabled && shots === want && phase === "tracking";
      }, { timeout: 20000 }, have);
      await page.click("#play-hit");
    };
    await hit(0);
    await hit(1);
    await page.waitForFunction(() => document.querySelectorAll("#rc-shots .tk-shot:not(.tk-more)").length === 2, { timeout: 8000 }).catch(async (error) => {
      const dump = await page.evaluate(() => ({
        phase: document.querySelector("#tkmap")?.getAttribute("data-phase") || "",
        map: document.querySelector("#tkmap")?.getAttribute("data-map") || "",
        shots: document.querySelector("#rc-shots")?.textContent || "",
        msg: document.body.innerText.slice(0, 500),
      }));
      throw new Error(`${error.message} ${JSON.stringify(dump)}`);
    });
    await page.click("#rc-close");
    await page.waitForFunction(() => (document.querySelector("#gm-track")?.textContent || "").includes("Seguir track · 2 golpes"));
    await page.click('[data-p="augusto"][data-v="6"]');
    await page.waitForFunction(() => !JSON.parse(localStorage.getItem("golflet.matchq") || "{}")["fixture-up"]);
    await page.click('.gm-hs button[data-h="0"]');
    await page.waitForFunction(() => (document.querySelector("#gm-track")?.textContent || "").includes("Seguir track · 2 golpes"));
    const resumed = await page.evaluate(() => {
      const row = JSON.parse(localStorage.getItem("golflet.match.fixture-up") || "{}");
      const track = JSON.parse(localStorage.getItem("golflet.matchtrack.fixture-up") || "{}");
      return { augusto: row.scores?.augusto?.[0], shots: (track.holes?.["1"]?.shots || []).length, open: track.holes?.["1"]?.open, label: document.querySelector("#gm-track")?.textContent || "" };
    });
    assert.equal(resumed.augusto, 6);
    assert.equal(resumed.shots, 2);
    assert.equal(resumed.open, true);
    assert.match(resumed.label, /Seguir track · 2 golpes/);
    await shot("web-375-partido-seguir");
    await page.click("#gm-track");
    await page.waitForFunction(() => document.querySelectorAll("#rc-shots .tk-shot:not(.tk-more)").length === 2);
    const again = await page.$$eval("#rc-shots .tk-shot:not(.tk-more)", nodes => nodes.map(node => (node.textContent || "").trim()));
    assert.equal(again.length, 2);
    assert.match(again[0], /^1\./);
    assert.match(again[1], /^2\./);
    await shot("web-375-partido-retomar");
    await page.click("#rc-close");
    await page.waitForSelector("#gm-track");

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

test("el partido abre la vuelta del día y un hoyo ya jugado", { timeout: 180_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  mkdirSync(ART, { recursive: true });
  let created = 0;
  const tee = { lat: -34.5, lng: -58.5 };
  const south = (meters: number) => tee.lat - meters / (6371000 * Math.PI / 180);
  const driveM = 230 * 0.9144;
  const approachM = 145 * 0.9144;
  const puttM = 6;
  const driveEnd = { lat: south(driveM), lng: tee.lng };
  const approachEnd = { lat: south(driveM + approachM), lng: tee.lng };
  const cup = { lat: south(driveM + approachM + puttM), lng: tee.lng };
  const shots = [
    { id: "s1", hole: 1, club: "Driver", result: null, penalty_strokes: 0, lat: tee.lat, lng: tee.lng, end_lat: driveEnd.lat, end_lng: driveEnd.lng },
    { id: "s2", hole: 1, club: "7i", result: null, penalty_strokes: 0, lat: driveEnd.lat, lng: driveEnd.lng, end_lat: approachEnd.lat, end_lng: approachEnd.lng },
    { id: "s3", hole: 1, club: "Putter", lie: "green", result: "holed", penalty_strokes: 0, lat: approachEnd.lat, lng: approachEnd.lng, end_lat: cup.lat, end_lng: cup.lng },
  ];
  const round = { id: "live-vuelta", date: "2026-11-22", course: "Jockey Club Argentino · Azul", vm_course: "Azul", club_code: "fixture", official: false, round_id: null, current_hole: 1, tracked: true };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (data: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(data)); };
    if (url.pathname === "/api/data") return json({ user: { name: "TEST-ONLY", pending_first_sync: false }, player: { name: "TEST-ONLY" }, rounds: [], unofficial_rounds: [{ id: "live-vuelta", date: "2026-11-22", course: "Azul", official: false }], courses: [], clubs: [] });
    if (url.pathname === "/api/matches/fixture-up" && req.method === "PUT") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw || "{}");
      const base = match("up");
      return json({ ...base, ...body, id: base.id, status: body.finish ? "done" : base.status });
    }
    if (url.pathname === "/api/matches/fixture-up") return json(match("up"));
    if (url.pathname === "/api/reconstructions" && req.method === "POST") { created += 1; return json({ live_round: { id: "should-not-create" } }, 201); }
    if (url.pathname === "/api/reconstructions") return json({ rounds: [], reconstructions: [round] });
    if (url.pathname === "/api/reconstructions/live-vuelta/shots" && req.method === "DELETE") {
      const id = url.searchParams.get("shot");
      const index = shots.findIndex(s => s.id === id);
      if (index >= 0) shots.splice(index, 1);
      return json({ ok: true });
    }
    if (url.pathname === "/api/reconstructions/live-vuelta/shots") return json({ shots });
    if (url.pathname === "/api/gps/courses") return json({ courses: [{ course_id: "fixture-azul", label: "jockey club argentino · azul", course: "Azul", vm_course: "Azul" }] });
    if (url.pathname.startsWith("/api/gps/courses/")) return json({
      course: {
        course: "Azul", club_code: "fixture",
        holes: [1, 2].map(hole => ({ hole, par: 4, tee, green: { center: cup, front: approachEnd } })),
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
    const tiles = new Map<string, Buffer>();
    const tileBody = async (url: string) => {
      const hit = tiles.get(url);
      if (hit) return hit;
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const body = Buffer.from(await res.arrayBuffer());
      tiles.set(url, body);
      return body;
    };
    await page.setRequestInterception(true);
    page.on("request", request => {
      const url = request.url();
      if (url.includes("arcgisonline.com") && /\/tile\/\d+\/\d+\/\d+/.test(url)) {
        tileBody(url).then(body => request.respond({ status: 200, contentType: "image/jpeg", headers: { "access-control-allow-origin": "*" }, body })).catch(() => request.abort());
        return;
      }
      if (url.startsWith(`http://127.0.0.1:${port}`)) request.continue();
      else request.abort();
    });
    const hideBar = () => page.evaluate(() => { const bar = document.querySelector("#tabbar"); if (bar) (bar as HTMLElement).style.display = "none"; });
    const tap = (sel: string) => page.evaluate(s => {
      const el = document.querySelector(s) as HTMLElement | null;
      if (!el) throw new Error(s);
      el.click();
    }, sel);
    await page.goto(`http://127.0.0.1:${port}/#/partido/fixture-up`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#gm-track", { timeout: 8000 });
    await hideBar();
    await tap('.gm-hs button[data-h="1"]');
    await tap("#gm-track");
    await page.waitForSelector("#tkprev:not([disabled])", { timeout: 8000 });
    await tap("#tkprev");
    await page.waitForFunction(() => (document.body.innerText || "").includes("Editar hoyo") && (document.body.innerText || "").includes("Driver"), { timeout: 8000 });
    await page.waitForSelector('#tkmap[data-map="ready"]', { timeout: 20000 });
    const doneHole = await page.evaluate(() => document.body.innerText || "");
    assert.match(doneHole, /Hoyo 1/);
    assert.match(doneHole, /Editar hoyo/);
    assert.match(doneHole, /No oficial/);
    assert.match(doneHole, /Putter · \d+ ft/);
    assert.equal(/Putter · \d+ yd/.test(doneHole), false);
    const puttFeet = Number((doneHole.match(/Putter · (\d+) ft/) || [])[1] || "0");
    assert.ok(puttFeet >= 10 && puttFeet <= 40, `putt ${puttFeet} ft`);
    assert.equal(created, 0);
    const linked = await page.evaluate(() => JSON.parse(localStorage.getItem("golflet.match.fixture-up") || "{}").track_id);
    assert.equal(linked, "live-vuelta");
    await page.screenshot({ path: `${ART}/web-375-partido-hoyo-anterior.png` });

    await page.goto(`http://127.0.0.1:${port}/#/rondas`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".rc-off", { timeout: 8000 });
    await hideBar();
    const list = await page.evaluate(() => ({ text: document.body.innerText, href: document.querySelector(".rc-off")?.getAttribute("href") || "" }));
    assert.match(list.text, /Azul/);
    assert.match(list.text, /No oficial/);
    assert.equal(list.href, "#/reconstruir/live-vuelta");
    assert.equal(list.text.includes("Editar hoyo"), false);
    await page.screenshot({ path: `${ART}/web-375-rondas-lista.png` });
    await tap(".rc-off");
    await page.waitForFunction(() => (document.body.innerText || "").includes("Editar hoyo") && /Putter · \d+ ft/.test(document.body.innerText || ""), { timeout: 8000 });
    await page.waitForSelector('#tkmap[data-map="ready"]', { timeout: 20000 });
    const same = await page.evaluate(() => document.body.innerText || "");
    assert.match(same, /No oficial/);
    assert.match(same, /Hoyo 1/);
    assert.match(same, /Driver/);
    assert.match(same, /Putter · \d+ ft/);
    assert.equal(created, 0);
    await page.screenshot({ path: `${ART}/web-375-rondas-mismo-track.png` });
    const hash = async (name: string) => createHash("md5").update(await readFile(`${ART}/${name}.png`)).digest("hex");
    const fromMatch = await hash("web-375-partido-hoyo-anterior");
    const fromList = await hash("web-375-rondas-lista");
    const fromRounds = await hash("web-375-rondas-mismo-track");
    assert.notEqual(fromList, fromMatch);
    assert.notEqual(fromList, fromRounds);

    await page.goto(`http://127.0.0.1:${port}/#/partido/fixture-up`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#gm-track", { timeout: 8000 });
    await tap("#gm-track");
    await page.waitForSelector("#play-edit-hole", { timeout: 8000 });
    await tap("#play-edit-hole");
    await page.waitForSelector("#play-shot-3", { timeout: 8000 });
    await tap("#play-shot-3");
    await page.waitForSelector("#play-edit-del", { timeout: 8000 });
    await tap("#play-edit-del");
    await page.waitForSelector("#play-edit-yes", { timeout: 8000 });
    await tap("#play-edit-yes");
    await page.waitForFunction(() => {
      const row = JSON.parse(localStorage.getItem("golflet.match.fixture-up") || "{}");
      const rail = document.querySelectorAll("#rc-shots .tk-shot:not(.tk-more)").length;
      return row.scores?.me?.[0] === 2 && rail === 2;
    }, { timeout: 8000 });
  } finally {
    await browser.close();
    server.close();
  }
});
