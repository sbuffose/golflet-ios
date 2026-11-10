/** TEST-ONLY. Executes the public scripts in headless Chrome against a fixture server.
 *  No club host, no saved clave, no production account. This is not a signed-in pass. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import test from "node:test";
import { existsSync } from "node:fs";

const CHROME = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find(p => existsSync(p));
const ROOT = new URL("../public/", import.meta.url);
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".png": "image/png" };

const fixture = {
  user: { name: "Test Player", first_name: "Test", pending_first_sync: false },
  player: { name: "Test Player", handicap_index: 12 },
  rounds: [{ id: "r1", date: "2026-11-01", valid_card: true, gross: 80, net: 70, is_9_holes: false, differential_computed: 4.2, course_key: "c1", course_label: "Cancha Fixture", holes: [], tournament: "TEST-ONLY" }],
  courses: [{ key: "c1", course: "Cancha Fixture", club: "Club Fixture" }],
  clubs: [{ id: "acc-fixture", club_name: "Club Fixture", rounds: 1, last_sync_status: "ok", last_sync_at: "2026-11-01T12:00:00Z", password_saved: true, source: "site" }],
  hi_history: [],
};
const tee = { id: "tt-fixture", date: "2026-11-09", time: "09:00", club_name: "Club Fixture", course_label: null, companions: [{ name: "Compañero viejo", hcp: 10 }], seen_at: "2026-11-01T12:00:00Z", starts_at: "2026-11-09T09:00:00-03:00", start_hole: 1 };

test("the public bundle opens the already-played round and the two explicit reads", { timeout: 60_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const calls = { check: 0, players: 0, sync: 0, postCourse: "" };
  let releaseSync: () => void = () => {};
  const syncGate = new Promise<void>(r => { releaseSync = r; });
  let releaseCheck: () => void = () => {};
  const checkGate = new Promise<void>(r => { releaseCheck = r; });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const host = req.headers.host || "";
    if (!host.startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    if (url.pathname.startsWith("/api/")) {
      let body = "";
      for await (const chunk of req) body += chunk;
      const json = (data: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(data)); };
      if (url.pathname === "/api/data") return json(fixture);
      if (url.pathname === "/api/gps/courses") return json({ courses: [{ course_id: "course-fixture", club_name: "Club Fixture", label: "Cancha Fixture" }] });
      if (url.pathname === "/api/reconstructions" && req.method === "GET") return json({ rounds: [], reconstructions: [] });
      if (url.pathname === "/api/reconstructions" && req.method === "POST") {
        calls.postCourse = JSON.parse(body).course_id;
        return json({ live_round: { id: "live-fixture" } });
      }
      if (url.pathname === "/api/tee-times/check") {
        calls.check++;
        const posted = body ? JSON.parse(body) : {};
        if (posted.players === true) { calls.players++; await checkGate; }
        return json({ status: "checked", fresh: true, players_read: posted.players === true, checked_at: "2026-11-08T12:00:00.000Z", last_checked_at: null, new: [], changed: [], gone: [], message: null, tee_times: [tee] });
      }
      if (url.pathname === "/api/tee-times") return json({ tee_times: [tee], clubs: [] });
      if (url.pathname.startsWith("/api/tee-times/")) return json({ tee_time: tee, tees: [], modalities: [], note: "TEST-ONLY" });
      if (url.pathname === "/api/accounts/acc-fixture/sync") {
        calls.sync++;
        await syncGate;
        return json({ sync: { ok: true, new_rounds: 0, message: "" }, accounts: [] });
      }
      return json({});
    }
    const file = url.pathname === "/" ? "/index.html" : url.pathname;
    try {
      const buf = await readFile(new URL(file.slice(1), ROOT));
      res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
      res.end(buf);
    } catch {
      res.writeHead(404); res.end("missing");
    }
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const page = await browser.newPage();
    const leaked: string[] = [];
    page.on("request", req => { const u = new URL(req.url()); if ((u.protocol === "http:" || u.protocol === "https:") && u.hostname !== "127.0.0.1") leaked.push(u.hostname); });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#recon-start");
    await page.click("#recon-start");
    await page.waitForFunction(() => (document.querySelector("#rc-course")?.textContent || "").includes("Cancha Fixture"));
    const err = await page.$eval("#rc-err", el => el.textContent || "");
    const course = await page.$eval("#rc-course", el => (el as HTMLSelectElement).selectedOptions[0]?.textContent || "");
    assert.equal(err.includes("api is not defined"), false);
    assert.equal(course.includes("Cargando canchas"), false);
    assert.match(course, /Cancha Fixture/);
    await page.click("#rc-start");
    await page.waitForFunction(() => location.hash === "#/reconstruir/live-fixture");
    assert.equal(calls.postCourse, "course-fixture");
    await page.goto(`http://127.0.0.1:${port}/#/inicio`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#bring-card");
    const click = page.click("#bring-card");
    await page.waitForFunction(() => (document.querySelector("#bring-card") as HTMLButtonElement).disabled);
    releaseSync();
    await click;
    await page.waitForFunction(() => (document.querySelector("#cardstat")?.textContent || "").includes("No hay una tarjeta nueva"));
    await page.click('a[href="#/tee/tt-fixture"]');
    await page.waitForSelector("#refresh-booking");
    const clear = await page.evaluate(() => {
      const button = document.querySelector("#refresh-booking") as HTMLElement;
      const bar = document.querySelector("#tabbar") as HTMLElement;
      const box = button.getBoundingClientRect();
      const nav = bar.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return { above: box.bottom <= nav.top + 1, hit: !!(hit && (hit.id === "refresh-booking" || hit.closest("#refresh-booking"))) };
    });
    assert.equal(clear.above, true);
    assert.equal(clear.hit, true);
    await page.screenshot({ path: "/opt/cursor/artifacts/reserva-800.png" });
    const before = calls.players;
    const booking = page.click("#refresh-booking");
    await page.waitForFunction(() => (document.querySelector("#refresh-booking") as HTMLButtonElement | null)?.disabled === true);
    releaseCheck();
    await booking;
    await page.waitForFunction(() => (document.querySelector("#bookstat")?.textContent || "").includes("Jugadores leídos del club"));
    assert.equal(calls.players, before + 1);
    assert.equal(calls.sync, 1);
    assert.deepEqual(leaked, []);
  } finally {
    await browser.close();
    server.close();
  }
});
