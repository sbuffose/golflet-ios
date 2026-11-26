/** t741: a finger on a club card selects it. Click alone is not the test.
 *  t744: the same finger chooses the club of an A buena shot, and of a shot being edited. */
import assert from "node:assert/strict";
import { countsForClub } from "../lib/shots-calc";
import { createServer } from "node:http";
import { mkdirSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import test from "node:test";

const CHROME = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find(p => existsSync(p));
const ROOT = new URL("../public/", import.meta.url);
const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".woff2": "font/woff2",
};
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
const GREEN = { lat: -34.48305197, lng: -58.52881 };
const TEE = { lat: GREEN.lat - (414 * 0.9144) / ((6371000 * Math.PI) / 180), lng: GREEN.lng };
const bag = [
  { club: "Putter" },
  { club: "Driver", carry: 285 },
  { club: "Madera 3", carry: 230 },
  { club: "Híbrido 4", carry: 210 },
  { club: "Hierro 7", carry: 155 },
  { club: "PW", carry: 120 },
];
const equipment = {
  clubs: [
    { code: "Pt", label: "Putter", enabled: true },
    { code: "Dr", label: "Driver", brand: "Titleist", model: "GT2", enabled: true },
    { code: "3W", label: "Madera 3", brand: "Titleist", model: "GT2", enabled: true },
    { code: "4H", label: "Híbrido 4", enabled: true },
    { code: "7i", label: "Hierro 7", enabled: true },
    { code: "PW", label: "Pitching wedge", enabled: true },
  ],
};
const catalog = {
  types: [
    { code: "Pt", label: "Putter", category: "putter", bag: null },
    { code: "Dr", label: "Driver", category: "driver", bag: "Driver" },
    { code: "3W", label: "Madera 3", category: "fairway", bag: "Madera 3" },
    { code: "4H", label: "Híbrido 4", category: "hybrid", bag: "Híbrido 4" },
    { code: "7i", label: "Hierro 7", category: "iron", bag: "Hierro 7" },
    { code: "PW", label: "Pitching wedge", category: "wedge", bag: "PW" },
  ],
  categories: [],
};
const course = {
  club_code: "118", course: "Azul", course_id: "118-azul",
  holes: [{ hole: 3, par: 4, hcp: 9, yards: 409, green: { center: GREEN }, tee: TEE, line: [TEE, GREEN] }],
};

test("un toque en la grilla elige el palo", { timeout: 90_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (body: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname === "/api/data") return json({ user: { name: "TEST-ONLY", pending_first_sync: false }, player: { name: "TEST-ONLY" }, hi_history: [], clubs: [], courses: [], rounds: [], bag });
      if (url.pathname === "/api/bag") return json(bag);
      if (url.pathname === "/api/my-clubs/items" || url.pathname === "/api/my-clubs") return json(equipment);
      if (url.pathname === "/api/my-clubs/catalog") return json(catalog);
      if (url.pathname.startsWith("/api/gps/courses")) return json({ course, courses: [course] });
      if (url.pathname.startsWith("/api/course-maps/")) return json(course);
      if (url.pathname === "/api/reconstructions" && req.method === "GET") return json({ rounds: [], reconstructions: [
        { id: "live-touch", date: today, current_hole: 3, club_code: "118", vm_course: "Azul", course: "Azul", round_id: "r-touch" },
      ] });
      if (url.pathname.endsWith("/shots")) return json({ shots: [] });
      if (url.pathname === "/api/weather/now") return json({ kmh: 12, from_deg: 180, temp_c: 20, source: "Open-Meteo", hhmm: "12:00" });
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
    await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-touch?hole=3`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#play-club-tile", { timeout: 20000 });
    const tileBox = await page.$eval("#play-club-tile", el => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.touchscreen.tap(tileBox.x, tileBox.y);
    await page.waitForFunction(() => {
      const list = document.querySelector("#play-club-list");
      return !!list && !list.hasAttribute("hidden");
    }, { timeout: 8000 });

    const grid = await page.evaluate(() => {
      const sheet = document.querySelector("#play-club-sheet") as HTMLElement;
      const dock = document.querySelector(".tk-dock");
      let blocked = "";
      let node: HTMLElement | null = sheet.parentElement;
      while (node) {
        if (getComputedStyle(node).pointerEvents === "none") blocked = node.className || node.tagName;
        node = node.parentElement;
      }
      const cards = [...document.querySelectorAll("#play-club-list button")].map(el => {
        const img = el.querySelector("img");
        const box = img ? img.getBoundingClientRect() : { width: 0, height: 0 };
        return {
          id: el.getAttribute("data-club") || "",
          text: (el.textContent || "").replace(/\s+/g, " ").trim(),
          yards: (el.querySelector("small")?.textContent || "").trim(),
          kind: img?.getAttribute("data-kind") || "",
          src: img?.getAttribute("src") || "",
          face: img?.getAttribute("data-face") || "",
          w: box.width,
          h: box.height,
          cardH: el.getBoundingClientRect().height,
          on: el.classList.contains("on"),
        };
      });
      return {
        blocked,
        inDock: !!(dock && sheet && dock.contains(sheet)),
        touch: getComputedStyle(document.documentElement).touchAction,
        cards,
      };
    });
    assert.equal(grid.blocked, "", JSON.stringify(grid));
    assert.equal(grid.inDock, false);
    assert.notEqual(grid.touch, "none");
    const putter = grid.cards.find(c => c.id === "Putter");
    const driver = grid.cards.find(c => c.id === "Driver");
    const iron = grid.cards.find(c => c.id === "Hierro 7");
    assert.ok(putter && putter.yards === "" && putter.face === "putter" && putter.kind === "silhouette" && /silhouettes\/putter\.svg/.test(putter.src), JSON.stringify(putter));
    assert.ok(driver && driver.kind === "photo" && driver.src.includes("titleist-gt2-driver"), JSON.stringify(driver));
    const wood = grid.cards.find(c => c.id === "Madera 3");
    assert.ok(wood && wood.kind === "photo" && wood.src.includes("titleist-gt2-fairway"), JSON.stringify(wood));
    assert.ok(iron && /155 yd/.test(iron.yards) && iron.kind === "silhouette" && iron.face === "iron" && /silhouettes\/iron\.svg/.test(iron.src), JSON.stringify(iron));
    assert.ok(grid.cards.every(c => c.w >= 64 && c.h >= 90 && c.h >= c.cardH * 0.55 && c.cardH >= 140), JSON.stringify(grid.cards));
    assert.equal(grid.cards.some(c => /\b(Dr|7i|Pt)\b/.test(c.text)), false, JSON.stringify(grid.cards));
    assert.equal(driver?.on, true);
    await page.screenshot({ path: join(art, "web-390-palo-grilla.png") });

    const ironBox = await page.$eval('#play-club-list button[data-club="Hierro 7"]', el => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    const hit = await page.evaluate((x, y) => {
      const node = document.elementFromPoint(x, y);
      const btn = node && node.closest("button[data-club]");
      return btn ? btn.getAttribute("data-club") : "";
    }, ironBox.x, ironBox.y);
    assert.equal(hit, "Hierro 7");
    await page.touchscreen.tap(ironBox.x, ironBox.y);
    await page.waitForFunction(() => {
      const select = document.querySelector("#play-club");
      const sheet = document.querySelector("#play-club-sheet");
      return !!select && select.value === "Hierro 7" && !!sheet && sheet.hasAttribute("hidden");
    }, { timeout: 8000 });
    const picked = await page.evaluate(() => {
      const select = document.querySelector("#play-club") as HTMLSelectElement;
      const tile = document.querySelector("#play-club-tile");
      return {
        value: select.value,
        input: select.dataset.input || "",
        text: (tile?.textContent || "").replace(/\s+/g, " ").trim(),
        label: tile?.getAttribute("aria-label") || "",
        src: tile?.querySelector("img")?.getAttribute("src") || "",
        kind: tile?.querySelector("img")?.getAttribute("data-kind") || "",
      };
    });
    assert.equal(picked.input, "touch", JSON.stringify(picked));
    assert.equal(picked.value, "Hierro 7");
    assert.match(picked.text, /Hierro 7/);
    assert.match(picked.text, /155 yd/);
    assert.equal(picked.label, "Hierro 7");
    assert.match(picked.src, /silhouettes\/iron\.svg/);
    assert.equal(picked.kind, "silhouette");
    await page.screenshot({ path: join(art, "web-375-palo-elegido.png") });

    await page.goto(`http://127.0.0.1:${port}/#/bolsa`, { waitUntil: "networkidle0" });
    await page.waitForSelector(".eq-thumb", { timeout: 8000 });
    const bagFaces = await page.evaluate(() => {
      return [...document.querySelectorAll(".eq-row")].map(row => {
        const img = row.querySelector("img");
        return {
          name: (row.querySelector(".t")?.textContent || "").trim(),
          src: img?.getAttribute("src") || "",
          kind: img?.getAttribute("data-kind") || "",
        };
      });
    });
    const bagDriver = bagFaces.find(row => row.name === "Driver");
    const bagIron = bagFaces.find(row => row.name === "Hierro 7");
    assert.ok(bagDriver && bagDriver.kind === "photo" && bagDriver.src.includes("titleist-gt2-driver"), JSON.stringify(bagFaces));
    assert.ok(bagIron && bagIron.kind === "silhouette" && /silhouettes\/iron\.svg/.test(bagIron.src), JSON.stringify(bagFaces));
    await page.screenshot({ path: join(art, "web-390-mi-bolsa.png"), fullPage: true });
  } finally {
    await browser.close();
    server.close();
  }
});

test("un toque elige el palo de un A buena y de un tiro que se edita", { timeout: 90_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const shots: Record<string, unknown>[] = [];
  const posts: Record<string, unknown>[] = [];
  const patches: Record<string, unknown>[] = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (body: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname.startsWith("/api/")) {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const body = raw ? JSON.parse(raw) : {};
      if (url.pathname === "/api/data") return json({ user: { name: "TEST-ONLY", pending_first_sync: false }, player: { name: "TEST-ONLY" }, hi_history: [], clubs: [], courses: [], rounds: [], bag });
      if (url.pathname === "/api/bag") return json(bag);
      if (url.pathname === "/api/my-clubs/items" || url.pathname === "/api/my-clubs") return json(equipment);
      if (url.pathname === "/api/my-clubs/catalog") return json(catalog);
      if (url.pathname.startsWith("/api/gps/courses")) return json({ course, courses: [course] });
      if (url.pathname.startsWith("/api/course-maps/")) return json(course);
      if (url.pathname === "/api/reconstructions" && req.method === "GET") return json({ rounds: [], reconstructions: [
        { id: "live-buena", date: today, current_hole: 3, club_code: "118", vm_course: "Azul", course: "Azul", round_id: "r-buena" },
      ] });
      if (url.pathname.endsWith("/shots") && req.method === "POST") {
        posts.push(body);
        shots.push({ id: "s1", shot_number: 1, hole: body.hole, club: body.club, intent: body.intent, lat: body.lat, lng: body.lng, end_lat: body.end_lat, end_lng: body.end_lng, result: body.result });
        return json({ shots });
      }
      if (url.pathname.endsWith("/shots") && req.method === "PATCH") {
        patches.push(body);
        const row = shots.find(s => s.id === body.shot_id);
        if (row) { row.club = body.club; row.intent = body.intent; }
        return json({ shots });
      }
      if (url.pathname.endsWith("/shots")) return json({ shots });
      if (url.pathname === "/api/weather/now") return json({ kmh: 12, from_deg: 180, temp_c: 20, source: "Open-Meteo", hhmm: "12:00" });
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
  const tap = async (page: { $eval: Function; touchscreen: { tap: Function } }, sel: string) => {
    const box = await page.$eval(sel, (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.touchscreen.tap(box.x, box.y);
  };
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 375, height: 812, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-buena?hole=3`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#play-good", { timeout: 20000 });
    await tap(page, "#play-good");
    await page.waitForFunction(() => {
      const title = document.querySelector(".tk-sheetk");
      const sheet = document.querySelector("#play-club-sheet");
      return !!title && (title.textContent || "").includes("a buena") && !!sheet && !sheet.hasAttribute("hidden");
    }, { timeout: 8000 });
    assert.equal(posts.length, 0);
    const iron = await page.$eval('#play-club-list button[data-club="Hierro 7"]', el => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    const hit = await page.evaluate((x, y) => {
      const node = document.elementFromPoint(x, y);
      const btn = node && node.closest("button[data-club]");
      return btn ? btn.getAttribute("data-club") : "";
    }, iron.x, iron.y);
    assert.equal(hit, "Hierro 7");
    await page.touchscreen.tap(iron.x, iron.y);
    await page.waitForFunction(() => (document.querySelector("#rc-shots")?.textContent || "").includes("A buena"), { timeout: 8000 });
    const rail = await page.$eval("#rc-shots", el => el.textContent || "");
    assert.match(rail, /Hierro 7/);
    assert.match(rail, /A buena/);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].club, "Hierro 7");
    assert.equal(posts[0].intent, "recovery");
    assert.equal(countsForClub({ club: "Hierro 7", intent: "recovery", distance_m: 40, source: "gps", distance_kind: "measured" }), false);
    assert.equal(countsForClub({ club: "Hierro 7", intent: null, distance_m: 140, source: "gps", distance_kind: "measured" }), true);
    await page.screenshot({ path: join(art, "web-375-abuena-palo.png") });

    await tap(page, "#play-shot-1");
    await page.waitForSelector("#play-edit-club");
    await tap(page, "#play-edit-club");
    await page.waitForFunction(() => {
      const sheet = document.querySelector("#play-club-sheet");
      return !!sheet && !sheet.hasAttribute("hidden") && !(document.querySelector(".tk-sheetk")?.textContent || "").includes("a buena");
    }, { timeout: 8000 });
    await tap(page, '#play-club-list button[data-club="Madera 3"]');
    await page.waitForFunction(() => (document.querySelector("#rc-shots")?.textContent || "").includes("Madera 3"), { timeout: 8000 });
    const edited = await page.$eval("#rc-shots", el => el.textContent || "");
    assert.match(edited, /Madera 3/);
    assert.match(edited, /A buena/);
    assert.equal(patches.length, 1);
    assert.equal(patches[0].club, "Madera 3");
    assert.equal(patches[0].intent, "recovery");
    assert.equal(countsForClub({ club: "Madera 3", intent: "recovery", distance_m: 40, source: "gps", distance_kind: "measured" }), false);
    await page.screenshot({ path: join(art, "web-375-abuena-editado.png") });
  } finally {
    await browser.close();
    server.close();
  }
});
