/** Tus grupos counts and the preloaded Otra cancha catalog. Fixture only. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import test from "node:test";

const CHROME = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find(p => existsSync(p));
const ROOT = new URL("../public/", import.meta.url);
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml" };
const SHOTS = "/opt/cursor/artifacts";
let saveShots = false;
try { mkdirSync(SHOTS, { recursive: true }); saveShots = true; } catch { saveShots = false; }

test("la lista de grupos muestra el conteo aceptado y la otra cancha usa el catálogo con nombre", { timeout: 120_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const groupsJs = await readFile(new URL("../public/groups.js", import.meta.url), "utf8");
  assert.match(groupsJs, /\$\{g\.accepted\} jugador/);
  assert.equal(groupsJs.includes("0 integrantes"), false);
  const searches: string[] = [];
  const catalog = [
    { course_id: "107-nautico-san-isidro", club_code: "107", club_name: "Club Nautico San Isidro", course_label: "Nautico San Isidro", label: "Nautico San Isidro", vm_course: "NAUTICO SAN ISIDRO", lat: -34.452247, lng: -58.513119, mine: false },
    { course_id: "124-san-isidro-gc", club_code: "124", club_name: "San Isidro Golf Club", course_label: "San Isidro GC", label: "San Isidro GC", vm_course: "SAN ISIDRO GC", lat: -34.49217, lng: -58.553188, mine: false },
  ];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const json = (data: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(data)); };
    if (url.pathname.startsWith("/api/")) {
      for await (const chunk of req) void chunk;
      if (url.pathname === "/api/data") return json({
        user: { name: "TEST-ONLY", first_name: "Test", pending_first_sync: false, role: null },
        player: { name: "TEST-ONLY" }, hi_history: [], bag: [], clubs: [], courses: [], rounds: [],
      });
      if (url.pathname === "/api/groups") return json({
        groups: [
          { id: "g-scratch", name: "Scratch", is_admin: true, accepted: 1, pending: 0, photo_url: null },
          { id: "g-familia", name: "Familia", is_admin: false, accepted: 2, pending: 0, photo_url: null },
        ],
        invitations: [],
        outgoing: [],
      });
      if (url.pathname === "/api/gps/courses") {
        if (url.searchParams.has("q")) searches.push(url.searchParams.get("q") || "");
        return json({
          courses: [{ course_id: "1-norte", club_code: "1", club_name: "Club Fixture", course_label: "Norte", label: "Norte", mine: true }],
          catalog,
        });
      }
      if (url.pathname === "/api/live-rounds") return json({ live_rounds: [] });
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
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const page = await browser.newPage();
    const origin = `http://127.0.0.1:${port}`;
    await browser.defaultBrowserContext().overridePermissions(origin, ["geolocation"]);
    await page.setGeolocation({ latitude: -34.452247, longitude: -58.513119 });
    await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2 });
    await page.goto(`${origin}/#/amigos`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.body.innerText.includes("1 jugador") && document.body.innerText.includes("2 jugadores"));
    const groups = await page.evaluate(() => document.body.innerText);
    assert.match(groups, /Tus grupos/);
    assert.match(groups, /Scratch/);
    assert.match(groups, /Familia/);
    assert.match(groups, /1 jugador/);
    assert.match(groups, /2 jugadores/);
    assert.equal(groups.includes("0 jugador"), false);
    assert.equal(groups.includes("0 integrantes"), false);
    if (saveShots) await page.screenshot({ path: `${SHOTS}/web-375-tus-grupos.png`, fullPage: true });
    await page.evaluate(() => { location.hash = "#/jugar"; });
    await page.waitForSelector("#jgq");
    await page.waitForFunction(() => document.body.innerText.includes("Cerca") && document.body.innerText.includes("Club Nautico San Isidro"));
    const before = await page.evaluate(() => document.body.innerText);
    assert.equal(/Club\s+107/.test(before), false);
    assert.equal(/Club\s+124/.test(before), false);
    await page.type("#jgq", "San Isidro");
    await page.waitForFunction(() => {
      const box = document.querySelector("#jgqout");
      const t = box ? box.innerText : "";
      return t.includes("Nautico San Isidro") && t.includes("San Isidro GC") && t.includes("San Isidro Golf Club") && !t.includes("Escribí al menos 2 letras");
    });
    const clipped = await page.evaluate(() => [...document.querySelectorAll(".jg-course .t")].some(el => el.scrollWidth > el.clientWidth + 1));
    assert.equal(clipped, false);
    const found = await page.evaluate(() => document.body.innerText);
    assert.match(found, /Club Nautico San Isidro/);
    assert.match(found, /Nautico San Isidro/);
    assert.match(found, /San Isidro Golf Club/);
    assert.match(found, /San Isidro GC/);
    assert.equal(/Club\s+107/.test(found), false);
    assert.equal(/Club\s+124/.test(found), false);
    assert.deepEqual(searches, []);
    if (saveShots) await page.screenshot({ path: `${SHOTS}/web-375-otra-cancha-san-isidro.png`, fullPage: true });
  } finally {
    await browser.close();
    await new Promise<void>(r => server.close(() => r()));
  }
});
