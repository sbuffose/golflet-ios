/** t741: a finger on a club card selects it. Click alone is not the test. */
import assert from "node:assert/strict";
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
  { club: "Driver", carry: 285, brand: "Titleist", model: "GT2" },
  { club: "Madera 3", carry: 230 },
  { club: "Híbrido 4", carry: 210 },
  { club: "Hierro 7", carry: 155 },
  { club: "PW", carry: 120 },
];
const course = {
  club_code: "118", course: "Azul", course_id: "118-azul",
  holes: [{ hole: 3, par: 4, hcp: 16, yards: 414, green: { center: GREEN }, tee: TEE, line: [TEE, GREEN] }],
};

test("un toque en la grilla elige el palo", { timeout: 90_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (body: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname === "/api/data") return json({ user: { name: "TEST-ONLY", pending_first_sync: false }, player: { name: "TEST-ONLY" }, hi_history: [], clubs: [], courses: [], rounds: [], bag });
      if (url.pathname === "/api/bag") return json(bag);
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
    await page.setViewport({ width: 375, height: 812, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
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
    assert.ok(putter && putter.yards === "" && putter.face === "putter" && putter.kind === "silhouette", JSON.stringify(putter));
    assert.ok(driver && driver.kind === "photo" && driver.src.includes("titleist-gt2-driver"), JSON.stringify(driver));
    assert.ok(iron && /155 yd/.test(iron.yards) && iron.kind === "silhouette" && iron.face === "iron", JSON.stringify(iron));
    assert.ok(grid.cards.every(c => c.w >= 48 && c.h >= 48 && c.cardH >= 110), JSON.stringify(grid.cards));
    assert.equal(grid.cards.some(c => /\b(Dr|7i|Pt)\b/.test(c.text)), false, JSON.stringify(grid.cards));
    assert.equal(driver?.on, true);
    await page.screenshot({ path: join(art, "web-375-palo-grilla.png") });

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
  } finally {
    await browser.close();
    server.close();
  }
});
