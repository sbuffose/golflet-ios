/** TEST-ONLY. Group competition screen. Fixture names only. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import test from "node:test";

const CHROME = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find(p => existsSync(p));
const ROOT = new URL("../public/", import.meta.url);
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".png": "image/png" };
const ART = "/opt/cursor/artifacts";

const types = (n: number, rounds: number) => ({ total: n, per_round: rounds ? Math.round((n / rounds) * 10) / 10 : null });
const member = (o: { id: string; name: string; me?: boolean; rounds: number; birdies: number; pars: number; net: number | null; avg: number | null; prev?: number | null }) => ({
  member_id: o.id, name: o.name, color: o.me ? "#0B2545" : "#C8102E", is_me: !!o.me, is_admin: !!o.me,
  rounds: o.rounds, cards_18: o.rounds, cards_9: 0, avg_gross: o.avg, best_gross: o.avg, avg_net: o.net, best_net: o.net, handicap_index: null,
  types: { birdies: types(o.birdies, o.rounds), pars: types(o.pars, o.rounds), eagles: types(0, o.rounds), aces: types(0, o.rounds), max_birdies: types(o.birdies ? 2 : 0, o.rounds), bogeys: types(1, o.rounds), doubles: types(0, o.rounds) },
  streak: o.rounds >= 2 ? 2 : null, consistency: o.rounds >= 3 ? { sd: 1.4, n: o.rounds } : null, trend: [],
  prev: o.prev == null ? null : { rounds: 1, birdies: o.prev, pars: 1, best_net: o.net, avg_gross: o.avg },
  hidden: [],
});

const payload = (range: string, min: number) => ({
  group: { id: "g1", name: "Grupo fixture", is_admin: true, admins: 1, photo_url: null },
  pending: [],
  view: { metrics: [], sections: ["table", "trend", "holes", "vs", "clubs"], range, course: null },
  filters: { year: null, range, since: "2026-01-01", until: null, min, course: null, years: ["2026"], courses: [{ key: "c1", label: "Cancha Fixture", shared: true, members: 2 }] },
  clubs: [],
  worst_holes: [],
  members: range === "1w"
    ? [member({ id: "a", name: "Ana Pérez", me: true, rounds: 1, birdies: 3, pars: 4, net: 74, avg: 80, prev: 1 }), member({ id: "b", name: "Luis Gómez", rounds: 1, birdies: 1, pars: 2, net: 78, avg: 84, prev: 2 })]
    : [member({ id: "a", name: "Ana Pérez", me: true, rounds: 8, birdies: 24, pars: 60, net: 74, avg: 80, prev: 10 }), member({ id: "b", name: "Luis Gómez", rounds: 2, birdies: 4, pars: 8, net: 79, avg: 86, prev: 6 })],
});

test("la competencia del grupo reemplaza la tabla y compara el período anterior", { timeout: 90_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  mkdirSync(ART, { recursive: true });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (data: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(data)); };
    if (url.pathname.startsWith("/api/groups/g1")) return json(payload(url.searchParams.get("range") || "all", url.searchParams.get("range") === "1w" ? 1 : 4));
    if (url.pathname === "/api/data") return json({ user: { name: "TEST-ONLY", pending_first_sync: false }, player: { name: "TEST-ONLY" }, rounds: [], courses: [], clubs: [] });
    if (url.pathname.startsWith("/api/")) return json({});
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
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    const open = async (range: string) => {
      await page.goto(`http://127.0.0.1:${port}/#/grupo/g1?range=${range}`, { waitUntil: "networkidle0" });
      await page.waitForSelector(".gg-carousel");
      await new Promise(r => setTimeout(r, 800));
    };
    await open("1w");
    const week = await page.evaluate(() => document.querySelector("#view")?.textContent || "");
    assert.match(week, /Semana/);
    assert.match(week, /Tu puesto en birdies/);
    assert.match(week, /Ver tabla completa/);
    assert.match(week, /\+2 birdies sobre Luis Gómez/);
    assert.match(week, /1 ronda esta semana/);
    assert.equal(await page.$eval('a[aria-selected="true"]', el => el.textContent), "Semana");
    const tableHidden = await page.$eval(".gg-full", el => (el as HTMLDetailsElement).open);
    assert.equal(tableHidden, false);
    await page.screenshot({ path: `${ART}/grupo-semana-390.png` });
    await open("12y");
    const year = await page.evaluate(() => document.querySelector("#view")?.textContent || "");
    assert.match(year, /20 rondas este año/);
    assert.match(year, /Pocas rondas/);
    assert.match(year, /Rey del birdie/);
    assert.equal(await page.$eval('a[aria-selected="true"]', el => el.textContent), "Año");
    await page.screenshot({ path: `${ART}/grupo-anio-390.png` });
  } finally {
    await browser.close();
    server.close();
  }
});
