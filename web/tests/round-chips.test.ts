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

const round = (id: string, date: string, title: string, birdies: number, pars: number, bogeys: number) => ({
  round_id: id, date, tournament: title, course: "Azul", course_key: "118:Azul", course_label: "Azul", tee: "Azul",
  valid_card: true, gross: 76, net: 74, is_9_holes: false, birdies, pars, bogeys, eagles: 0, double_plus: 0, holes: [],
});

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
          round("r1", "2026-11-08", "Copa", 2, 10, 9),
          round("r2", "2026-11-01", "Mensual", 1, 10, 5),
          round("r3", "2026-10-18", "Copa", 2, 8, 5),
          round("r4", "2026-10-04", "Medal", 1, 8, 3),
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
      await page.waitForFunction(() => document.querySelectorAll(".rchips").length >= 4);
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
      assert.equal(rows.length, 4, `faltan filas en ${width}`);
      const texts = rows.map(row => row.chips.map(chip => chip.text).join(" / "));
      assert.ok(texts.some(t => t.includes("2 birdies") && t.includes("10 pares") && t.includes("9 bogeys")), texts.join(" || "));
      for (const row of rows) {
        assert.equal(row.wrap, "nowrap", `${width} ${texts}`);
        assert.ok(row.h > 14 && row.h < 26, `alto ${row.h} en ${width}: ${texts}`);
        assert.ok(row.scroll <= row.client + 1, `se sale del renglón en ${width}: ${row.scroll}>${row.client} ${texts}`);
        assert.equal(row.chips.length, 3, texts.join(" || "));
        const tops = row.chips.map(chip => chip.top);
        const heights = row.chips.map(chip => chip.h);
        assert.ok(Math.max(...tops) - Math.min(...tops) < 2, `segunda línea en ${width}: ${texts}`);
        assert.ok(Math.max(...heights) - Math.min(...heights) < 2, `altos distintos en ${width}: ${texts}`);
        assert.ok(heights.every(h => h >= 16 && h <= 20), `alto de chip en ${width}: ${heights}`);
        assert.ok(row.chips.every(chip => chip.nowrap === "nowrap" && chip.numberInside && !chip.text.includes("\n")), texts.join(" || "));
      }
      if (saveShots) await page.screenshot({ path: `${SHOTS}/web-${width}-rondas-chips.png` });
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
});
