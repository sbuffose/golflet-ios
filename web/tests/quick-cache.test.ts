/** TEST-ONLY. Localhost fixture. External hosts are aborted. No club and no production write.
 *  A cached hole must not become the round total when the account has a different one. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import test from "node:test";
import { existsSync } from "node:fs";

const CHROME = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find(p => existsSync(p));
const ROOT = new URL("../public/", import.meta.url);
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".png": "image/png" };
const account = [
  { hole: 1, putts: 2, gir: true, drive: "fairway", rev: 5 },
  { hole: 2, putts: 1, gir: false, drive: "left", rev: 4 },
];
const fixture = {
  user: { name: "TEST", first_name: "TEST", pending_first_sync: false },
  player: { handicap_index: 12 },
  hi_history: [],
  rounds: [{ round_id: "r1", id: "r1", date: "2026-11-02", gross: 80, net: 75, valid_card: true, course_key: "c1", club_name: "Fixture", holes: [[1, 4, 4], [2, 4, 4]], putts: 32, gir: 10, fir: 8 }],
  courses: [{ key: "c1", course: "Fixture", label: "Fixture", club_name: "Fixture", par: 72, holes: [], tees: {} }],
  clubs: [],
  bag: [],
};

test("a stale cached hole stays out of the total when another hole is edited early", { timeout: 60_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const file = url.pathname === "/" ? "/index.html" : url.pathname;
    try {
      const body = await readFile(new URL(file.slice(1), ROOT));
      res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", () => resolve()));
  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const puts: Array<Record<string, unknown>> = [];
  const notes: Array<Record<string, unknown>> = [];
  let outside = 0;
  let gets = 0;
  let answerGet: (body: unknown) => Promise<void> = async () => { throw new Error("la lectura no quedó en espera"); };
  let release: () => void = () => {};
  const heldReady = new Promise<void>(resolve => { release = resolve; });
  await page.setRequestInterception(true);
  page.on("request", async req => {
    const url = new URL(req.url());
    if (url.hostname !== "127.0.0.1") { outside += 1; await req.abort(); return; }
    if (!url.pathname.startsWith("/api/")) { await req.continue(); return; }
    let body: unknown = {};
    if (url.pathname === "/api/data") body = fixture;
    if (url.pathname.endsWith("/hole-marks")) {
      if (req.method() === "GET") {
        gets += 1;
        if (gets === 1) {
          answerGet = async payload => { await req.respond({ status: 200, contentType: "application/json", body: JSON.stringify(payload) }); };
          release();
          return;
        }
        body = { marks: account };
      } else {
        const sent = JSON.parse(req.postData() || "{}") as Record<string, unknown>;
        puts.push(sent);
        body = { mark: sent, applied: true, conflict: null, idempotent: false };
      }
    }
    if (url.pathname.endsWith("/notes") && req.method() === "PUT") {
      notes.push(JSON.parse(req.postData() || "{}") as Record<string, unknown>);
      body = { note: {} };
    }
    if (url.pathname === "/api/weather/rounds") body = { rounds: {} };
    if (url.pathname === "/api/tee-times") body = { tee_times: [], clubs: [] };
    await req.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  try {
    await page.evaluateOnNewDocument(() => localStorage.setItem("gl_q_r1", JSON.stringify([{ hole: 2, putts: 4, gir: true, drive: "fairway" }])));
    const port = (server.address() as { port: number }).port;
    await page.goto(`http://127.0.0.1:${port}/#/ronda/r1`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#qputts button", { timeout: 10_000 });
    await heldReady;
    await page.click("#qputts button:nth-child(4)");
    await answerGet({ marks: account });
    await page.waitForFunction(() => document.querySelector("#qmsg")?.textContent === "Guardado en tu cuenta", { timeout: 10_000 });
    assert.deepEqual(puts, [{ hole: 1, putts: 3, gir: true, drive: "fairway", rev: 6 }]);
    assert.deepEqual(notes, [{ putts: "4", gir: "1", fir: "1" }]);
    assert.notDeepEqual(notes, [{ putts: "7", gir: "2", fir: "2" }]);
    await page.evaluate(() => {
      const button = [...document.querySelectorAll("#qgir button")].find(item => item.textContent === "No") as HTMLButtonElement | undefined;
      button?.click();
    });
    const deadline = Date.now() + 8_000;
    while (puts.length < 2 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    assert.deepEqual(puts[1], { hole: 1, putts: 3, gir: false, drive: "fairway", rev: 7 });
    assert.deepEqual(notes[1], { putts: "4", gir: "0", fir: "1" });
    assert.equal(outside, 0);
  } finally {
    await browser.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
