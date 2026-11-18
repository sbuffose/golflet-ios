/** Rondas result chips stay on one line, number beside the word, at 375 and 430. Fixture only. */
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

const plan = (n: number, par: number, strokes: number) => Array.from({ length: n }, () => [par, strokes] as const);
const holes = [...[[4, 2]] as const, ...plan(2, 4, 3), ...plan(10, 4, 4), ...plan(4, 4, 5), ...[[4, 6]] as const]
  .map(([par, strokes], i) => [i + 1, par, strokes]);
const played = (id: string, date: string, title: string) => ({
  round_id: id, date, tournament: title, course: "Azul", course_key: "118:Azul", course_label: "Azul", tee: "Azul",
  valid_card: true, gross: 74, net: 72, is_9_holes: false, holes,
});
const worst = {
  round_id: "worst", date: "2026-11-15", tournament: "Peor caso", course: "Azul", course_key: "118:Azul", course_label: "Azul", tee: "Azul",
  valid_card: true, gross: 99, net: 90, is_9_holes: false, holes: [],
  eagles: 12, birdies: 18, pars: 16, bogeys: 14, double_plus: 11,
};

test("los chips de Rondas quedan en una sola línea con el número y la palabra juntos", { timeout: 120_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const css = await readFile(new URL("../public/style.css", import.meta.url), "utf8");
  assert.match(css, /\.rchips\{[^}]*flex-wrap:nowrap/);
  assert.match(css, /\.rc\{[^}]*white-space:nowrap/);
  assert.match(css, /\.rc\{[^}]*flex-direction:row/);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const json = (data: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(data)); };
    if (url.pathname.startsWith("/api/")) {
      for await (const chunk of req) void chunk;
      if (url.pathname === "/api/weather/rounds") return json({ rounds: {} });
      if (url.pathname === "/api/data") return json({
        user: { name: "TEST-ONLY", first_name: "Test", pending_first_sync: false, role: null },
        player: { name: "TEST-ONLY" },
        hi_history: [], bag: [],
        clubs: [{ id: "c1", club_name: "Club Fixture", rounds: 4 }],
        courses: [{ key: "118:Azul", course: "Azul", label: "Azul", holes: [] }],
        rounds: [
          played("r1", "2026-11-08", "Copa"),
          worst,
          played("r2", "2026-10-04", "Medal"),
        ],
      });
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
    for (const width of [375, 430]) {
      const page = await browser.newPage();
      await page.setViewport({ width, height: 900, deviceScaleFactor: 2 });
      await page.goto(`http://127.0.0.1:${port}/#/rondas`, { waitUntil: "networkidle0" });
      await page.waitForFunction(() => document.querySelectorAll(".rchips").length >= 3);
      const rows = await page.evaluate(() => [...document.querySelectorAll(".rchips")].map(row => {
        const style = getComputedStyle(row);
        const chips = [...row.querySelectorAll(".rc")].map(el => {
          const chip = el.getBoundingClientRect();
          const num = el.querySelector("b")?.getBoundingClientRect();
          return {
            text: (el.textContent || "").replace(/\s+/g, " ").trim(),
            h: Math.round(chip.height),
            top: Math.round(chip.top),
            right: Math.round(chip.right),
            nowrap: getComputedStyle(el).whiteSpace,
            numberInside: !!num && num.top >= chip.top - 1 && num.bottom <= chip.bottom + 1 && num.left >= chip.left - 1 && num.right <= chip.right + 1,
          };
        });
        return { wrap: style.flexWrap, h: Math.round(row.getBoundingClientRect().height), scroll: row.scrollWidth, client: row.clientWidth, chips };
      }));
      assert.equal(rows.length, 3, `faltan filas en ${width}`);
      const texts = rows.map(row => row.chips.map(chip => chip.text).join(" / "));
      assert.ok(texts.some(t => t === "1 Ág / 2 Bir / 10 Par / 4 Bog / 1 Dob"), `falta la tarjeta con hoyos: ${texts.join(" || ")}`);
      assert.ok(texts.some(t => t === "12 Ág / 18 Bir / 16 Par / 14 Bog / 11 Dob"), `falta el peor caso: ${texts.join(" || ")}`);
      for (const row of rows) {
        assert.equal(row.wrap, "nowrap", `${width} ${texts}`);
        assert.ok(row.h > 14 && row.h < 28, `alto ${row.h} en ${width}: ${texts}`);
        assert.ok(row.scroll <= row.client + 1, `se sale del renglón en ${width}: ${row.scroll}>${row.client} ${texts}`);
        assert.ok(row.chips.length >= 3 && row.chips.length <= 5, texts.join(" || "));
        assert.ok(row.chips.every(chip => /^\d+ (Ág|Bir|Par|Bog|Dob)$/.test(chip.text) && !chip.text.includes("…")), texts.join(" || "));
        const tops = row.chips.map(chip => chip.top);
        const heights = row.chips.map(chip => chip.h);
        assert.ok(Math.max(...tops) - Math.min(...tops) < 2, `segunda línea en ${width}: ${texts}`);
        assert.ok(Math.max(...heights) - Math.min(...heights) < 2, `altos distintos en ${width}: ${texts}`);
        assert.ok(heights.every(h => h >= 16 && h <= 20), `alto de chip en ${width}: ${heights}`);
        assert.ok(row.chips.every(chip => chip.nowrap === "nowrap" && chip.numberInside && !chip.text.includes("\n")), texts.join(" || "));
      }
      if (saveShots) {
        await page.screenshot({ path: `${SHOTS}/web-${width}-rondas-chips.png` });
        if (width === 375) await page.screenshot({ path: `${SHOTS}/after-web-375-rondas.png` });
      }
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
});
