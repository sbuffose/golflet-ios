/** TEST-ONLY. Bag, Cancha period, handicap hero contrast and group photo.
 *  Fixture data only. No production bag, group or club write. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdirSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { gpsShotSql } from "../lib/gps-shot";

const CHROME = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find(p => existsSync(p));
const ROOT = new URL("../public/", import.meta.url);
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".png": "image/png" };
const ART = join(tmpdir(), "golflet-ui-surface");

test("manual shots stay out of the GPS distance predicate", () => {
  const sql = gpsShotSql("s");
  assert.match(sql, /s\.lat is not null/);
  assert.match(sql, /s\.lng is not null/);
  assert.match(sql, /source/);
  assert.match(sql, /'gps'/);
});

const hole = (n: number, par: number) => ({ hole: n, par, hcp: n, yards: { BLANCO: 380 }, stats: { n: 1, avg: par, avg_to_par: 0.4, avg_last16: par, best: par, worst: par, dist: { eagle_or_better: 0, birdie: 0, par: 1, bogey: 0, double: 0, triple_plus: 0 } } });
const scored = (id: string, date: string, gross: number) => ({
  round_id: id, id, date, valid_card: true, gross, net: gross - 5, is_9_holes: false, differential_computed: 4,
  course_key: "c1", course: "Cancha Fixture", course_label: "Cancha Fixture", club_name: "Club Fixture",
  holes: [[1, 3, 1], [2, 4, 4], [3, 5, 4]], tournament: "TEST-ONLY",
});

test("bag, cancha, hero and group photo stay readable on a phone", { timeout: 120_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  let photoV = 1;
  let failPhoto = false;
  const puts: { type: string; bytes: number }[] = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (data: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(data)); };
    if (url.pathname.startsWith("/api/")) {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks);
      if (url.pathname === "/api/groups/g1/photo" && req.method === "PUT") {
        puts.push({ type: String(req.headers["content-type"] || ""), bytes: body.length });
        if (failPhoto) { res.writeHead(500, { "content-type": "text/html" }); res.end("<html>platform</html>"); return; }
        photoV = 2;
        return json({ ok: true, photo_url: `/api/groups/g1/photo?v=${photoV}` });
      }
      if (url.pathname === "/api/groups/g1") return json({ group: { id: "g1", name: "Familia", is_admin: true, photo_url: `/api/groups/g1/photo?v=${photoV}`, link: { url: "https://golflet.vercel.app/g/fixture", enabled: true, expired: false, expires_at: null, whatsapp_url: "https://wa.me/?text=fixture" } } });
      if (url.pathname === "/api/groups") return json({ groups: [], invitations: [] });
      if (url.pathname === "/api/data") return json({
        user: { name: "TEST-ONLY", first_name: "TEST-ONLY", pending_first_sync: false },
        player: { name: "TEST-ONLY", handicap_index: 3.7 },
        hi_history: [{ date: "2023-10-05", hi: 10.6 }, { date: "2026-11-05", hi: 3.7 }],
        rounds: [scored("r-nov", "2026-11-02", 80), scored("r-sep", "2026-09-01", 100), scored("r-jan", "2026-01-15", 90)],
        courses: [{ key: "c1", course: "Cancha Fixture", label: "Cancha Fixture", club_name: "Club Fixture", par: 72, tees: { AZUL: { course_rating: 69.4, slope: 124 } }, lat: -34.6, lng: -58.4, holes: [hole(1, 4), hole(2, 4), hole(3, 5), hole(4, 3), hole(5, 4), hole(6, 4)] }],
        clubs: [{ id: "acc", club_name: "Club Fixture", rounds: 3, last_sync_status: "ok", last_sync_at: "2026-11-02T12:00:00Z", password_saved: false, source: "site" }],
        bag: [
          { club: "Driver", carry: 300, total: 300 },
          { club: "Madera 3", carry: 285, total: null },
          { club: "Híbrido", carry: 265, total: null },
          { club: "SW", carry: null, total: null },
          { club: "LW", carry: null, total: null },
          { club: "Putter", carry: null, total: null },
        ],
      });
      if (url.pathname === "/api/bag/distances") return json({ clubs: [{ club: "Driver", code: "DR", gps: { avg_yd: 280, n: 4, used: 4, range_yd: [260, 300], spread_yd: 12 } }] });
      if (url.pathname === "/api/my-clubs/catalog") return json({ types: [{ code: "DR", category: "driver", bag: "Driver", label: "Driver" }, { code: "SW", category: "wedge", bag: "SW", label: "Sand wedge" }] });
      if (url.pathname === "/api/my-clubs/items") return json({ clubs: [{ code: "DR", label: "Driver", enabled: true }, { code: "SW", label: "Sand wedge", enabled: true }] });
      if (url.pathname === "/api/ball") return json({ ball: null, catalog: [] });
      if (url.pathname === "/api/club-stats") return json({ clubs: [] });
      if (url.pathname === "/api/live-rounds") return json({ rounds: [] });
      if (url.pathname === "/api/strategy") return json({ overview: "Plan fixture", holes: [{ hole: 1, plan_title: "Salida al centro", plan_text: "Plan", tee_club: "Driver", hazards: [], variants: {} }] });
      if (url.pathname === "/api/weather/rounds") return json({ rounds: {} });
      if (url.pathname === "/api/tee-times") return json({ tee_times: [], clubs: [] });
      if (url.pathname === "/api/tee-times/check") return json({ status: "cached", fresh: false, players_read: false, checked_at: null, last_checked_at: null, new: [], changed: [], gone: [], message: null, tee_times: [] });
      if (url.pathname === "/api/notifications") return json({ notifications: [] });
      if (url.pathname === "/api/weather/now") return json({ kmh: 12, from_deg: 180, temp_c: 20 });
      if (url.pathname === "/api/weather/forecast") return json({ hours: [] });
      if (url.pathname === "/api/gps/courses") return json({ courses: [{ course_id: "course-fixture", course_key: "c1", club_name: "Club Fixture", course: "Cancha Fixture", course_label: "Cancha Fixture" }] });
      if (url.pathname === "/api/gps/courses/course-fixture") return json({ course: { holes: [{ hole: 1, tee: null, green: { center: { lat: -34.6, lng: -58.4 } } }] } });
      if (url.pathname === "/api/me" || url.pathname.startsWith("/api/me/")) return json({ error: "no" }, 401);
      return json({});
    }
    const file = url.pathname === "/" ? "/index.html" : url.pathname;
    try {
      const buf = await readFile(new URL(file.slice(1), ROOT));
      res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
      res.end(buf);
    } catch { res.writeHead(404); res.end("missing"); }
  });
  server.on("clientError", (_e, socket) => socket.destroy());
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
  const leaked: string[] = [];
  let step = "boot";
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    await page.emulateTimezone("America/Argentina/Buenos_Aires");
    await page.evaluateOnNewDocument(`(() => {
      const fixed = Date.parse("2026-11-08T15:00:00-03:00");
      const Native = Date;
      class Frozen extends Native {
        constructor(...args) { super(...(args.length ? args : [fixed])); }
        static now() { return fixed; }
      }
      window.Date = Frozen;
      window.addEventListener("error", (e) => console.log("STACK", e.message, e.error && e.error.stack));
    })();`);
    page.on("request", req => { const u = new URL(req.url()); if ((u.protocol === "http:" || u.protocol === "https:") && u.hostname !== "127.0.0.1") leaked.push(u.hostname); });
    page.on("pageerror", (err: unknown) => {
      const error = err instanceof Error ? err : new Error(String(err));
      console.log("PAGE", error.stack || error.message);
    });
    page.on("console", msg => { if (msg.type() === "error") console.log("CONSOLE", msg.text()); });
    const mark = () => page.evaluate(() => { if (!document.getElementById("testonly")) { const n = document.createElement("p"); n.id = "testonly"; n.textContent = "TEST-ONLY"; n.style.cssText = "margin:0 0 8px;color:#0B2545;font-weight:700"; document.querySelector("#view")?.prepend(n); } });
    type Contrast = { ratio: number; color: string; bg: string; size: number };
    const contrast = (sel: string): Promise<Contrast> => page.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(sel)});
      const cs = getComputedStyle(el);
      const nums = (c) => (c.match(/[\\d.]+/g) || ["0","0","0"]).map(Number);
      const lin = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
      const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
      let node = el, bg = "rgb(246, 247, 249)";
      while (node) { const b = getComputedStyle(node).backgroundColor; if (b && b.indexOf(", 0)") < 0) { bg = b; break; } node = node.parentElement; }
      const L1 = lum(nums(cs.color)), L2 = lum(nums(bg));
      return { ratio: (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05), color: cs.color, bg: bg, size: parseFloat(cs.fontSize) };
    })()`) as Promise<Contrast>;
    const fits = () => page.evaluate(() => {
      const view = document.querySelector("#view") as HTMLElement;
      const bar = document.querySelector("#tabbar")?.getBoundingClientRect();
      view?.scrollIntoView();
      const wide = document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1;
      return { wide, bar: bar ? bar.top : 0, doc: document.documentElement.scrollWidth };
    });
    const note = (s: string) => { step = s; console.log("STEP", s); };
    note("bolsa");
    await page.goto(`http://127.0.0.1:${port}/#/bolsa`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => (document.querySelector("#bagcount")?.textContent || "").includes("de"));
    await page.waitForFunction(() => (document.querySelector("#bagmsg")?.textContent || "").includes("GPS"));
    await mark();
    const bagText = await page.$eval("#bagmsg", el => el.textContent || "");
    assert.match(bagText, /3 definidas por vos/);
    assert.match(bagText, /1 palo con tiros medidos por GPS/);
    assert.equal(bagText.includes("3/6"), false);
    assert.equal(await page.$eval("#bagcount", el => el.textContent), "3 de 6");
    const driver = await page.$eval('.bagrow[data-club="Driver"]', row => ({
      carry: (row.querySelector('[data-k="carry"]') as HTMLInputElement).value,
      total: (row.querySelector('[data-k="total"]') as HTMLInputElement).value,
      src: row.querySelector(".bsrc")?.textContent || "",
    }));
    assert.deepEqual(driver, { carry: "300", total: "300", src: "Definida por vos" });
    const wood = await page.$eval('.bagrow[data-club="Madera 3"] [data-k="total"]', el => (el as HTMLInputElement).value);
    assert.equal(wood, "");
    assert.match(await page.$eval('.bagrow[data-club="Madera 3"] [data-k="total"]', el => el.getAttribute("placeholder") || ""), /—/);
    const bagCount = await contrast("#bagcount");
    assert.ok(bagCount.ratio >= 4.5, `bag count contrast ${bagCount.ratio}`);
    const bagFit = await fits();
    assert.equal(bagFit.wide, true);
    mkdirSync(ART, { recursive: true });
    await page.screenshot({ path: `${ART}/bag-mobile.png` });
    note("font");
    await page.evaluate(() => { document.documentElement.dataset.ts = "muy_grande"; });
    const bagBig = await fits();
    assert.equal(bagBig.wide, true, `bag overflow ${bagBig.doc}`);
    await page.click('a.eq-a[href="#/equipo/DR"]');
    await page.waitForFunction(() => location.hash.includes("/equipo/DR"));
    note("cancha");
    await page.goto(`http://127.0.0.1:${port}/#/cancha?range=1m`, { waitUntil: "networkidle0" });
    await page.waitForSelector(".cn-scope");
    await mark();
    assert.match(await page.$eval(".cn-scope", el => el.textContent || ""), /Este mes/);
    assert.match(await page.$eval(".cn-scope", el => el.textContent || ""), /Cancha Fixture/);
    assert.equal(await page.$eval('button[data-range="1m"]', el => el.getAttribute("aria-selected")), "true");
    assert.equal(await page.$eval(".big", el => el.textContent), "80,0");
    await page.waitForSelector('#stratcard a[href="#/estrategia/c1"]');
    await page.waitForFunction(() => (document.querySelector("#cancwx")?.textContent || "").includes("km/h"));
    const windCopies = await page.$$eval("#cancwx .tw-holes div", els => els.length);
    assert.equal(windCopies, 0);
    const wxText = await page.$eval("#cancwx", el => el.textContent || "");
    assert.match(wxText, /No hay rumbo verificado/);
    assert.match(wxText, /Driver cargado: 300 yd/);
    assert.equal(wxText.includes("300 m"), false);
    assert.equal(wxText.includes("palo más"), false);
    await page.click('button[data-range="3m"]');
    await page.waitForFunction(() => location.hash.includes("range=3m") && (document.querySelector(".big")?.textContent || "") === "90,0");
    assert.match(await page.$eval(".cn-scope", el => el.textContent || ""), /3 meses/);
    await page.click('button[data-range="1m"]');
    await page.waitForFunction(() => location.hash.includes("range=1m") && (document.querySelector(".big")?.textContent || "") === "80,0");
    const canchaFit = await page.evaluate(() => {
      const bar = document.querySelector("#tabbar")!.getBoundingClientRect();
      const last = document.querySelector(".hc-legend")!.getBoundingClientRect();
      window.scrollTo(0, document.documentElement.scrollHeight);
      const last2 = document.querySelector(".hc-legend")!.getBoundingClientRect();
      const bar2 = document.querySelector("#tabbar")!.getBoundingClientRect();
      return { wide: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1, clear: last2.bottom <= bar2.top + 2, before: last.bottom, bar: bar.top };
    });
    assert.equal(canchaFit.wide, true);
    assert.equal(canchaFit.clear, true, JSON.stringify(canchaFit));
    await page.screenshot({ path: `${ART}/cancha-1m.png` });
    note("ronda");
    await page.goto(`http://127.0.0.1:${port}/#/ronda/r-nov`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#scoreline");
    const scoreline = await page.$eval("#scoreline", el => el.textContent || "");
    const legend = await page.$eval("#scoreline", el => ({
      text: el.textContent || "",
      marks: [...el.querySelectorAll(".b")].map(node => node.textContent || ""),
      names: [...el.querySelectorAll("[aria-label]")].map(node => node.getAttribute("aria-label")),
    }));
    assert.deepEqual(legend.marks, ["1", "1", "1", "0", "0"]);
    assert.deepEqual(legend.names, ["1 águilas", "1 birdies", "1 pares", "0 bogeys", "0 doble o peor"]);
    assert.match(scoreline, /1 Águilas/);
    assert.match(scoreline, /1 Birdies/);
    assert.match(scoreline, /1 Pares/);
    assert.match(scoreline, /0 Bogeys/);
    assert.match(scoreline, /0 Doble \+/);
    assert.equal(/[−+][12]/.test(scoreline), false);
    assert.equal(scoreline.includes("Águilas1"), false);
    assert.equal(scoreline.includes("Águila2"), false);
    assert.match(await page.$eval("#difnote", el => el.textContent || ""), /Diferencial estimado por Golflet/);
    const trackPlace = await page.evaluate(() => {
      const track = document.querySelector("#round-track");
      const stats = document.querySelector("#qstat");
      const fields = document.querySelector(".fields");
      if (!track || !stats || !fields) return null;
      return {
        href: track.getAttribute("href"),
        label: track.getAttribute("aria-label") || track.textContent,
        beforeStats: !!(track.compareDocumentPosition(stats) & Node.DOCUMENT_POSITION_FOLLOWING),
        fieldsStay: !!fields.querySelector('[data-k="putts"]') && !!fields.querySelector('[data-k="gir"]') && !!fields.querySelector('[data-k="fir"]'),
        quickStays: !!stats.querySelector("#qputts") && !!stats.querySelector("#qfw") && !!stats.querySelector("#qgir"),
      };
    });
    assert.equal(trackPlace?.href, "#/reconstruir?ronda=r-nov&hole=1");
    assert.match(trackPlace?.label || "", /Registrar mis tiros/);
    assert.equal(trackPlace?.beforeStats, true);
    assert.equal(trackPlace?.fieldsStay, true);
    assert.equal(trackPlace?.quickStays, true);
    note("inicio");
    await page.goto(`http://127.0.0.1:${port}/#/inicio`, { waitUntil: "networkidle0" });
    await page.waitForSelector(".hero .hi-ch-l");
    await mark();
    const heroBg = await page.$eval(".hero", el => getComputedStyle(el).backgroundImage + " " + getComputedStyle(el).backgroundColor);
    assert.equal(heroBg.includes("134634"), false);
    assert.match(heroBg, /11,\s*37,\s*69|rgb\(11, 37, 69\)|#0B2545/i);
    const cambios = await contrast(".hero .hi-ch-l");
    const jugar = await contrast(".hero .hp-prac");
    const big = await contrast(".hero .big");
    assert.ok(cambios.ratio >= 4.5, `Cambios ${cambios.ratio} ${cambios.color} on ${cambios.bg}`);
    assert.ok(jugar.ratio >= 4.5, `Jugar ${jugar.ratio}`);
    assert.ok(big.ratio >= 3, `index ${big.ratio}`);
    assert.equal(await page.$eval(".hero .hi-ch-l", el => el.getAttribute("href")), "#/cambios");
    assert.equal(await page.$eval(".hero .hp-prac", el => el.getAttribute("href")), "#/jugar");
    await page.screenshot({ path: `${ART}/hero-navy.png` });
    note("foto");
    await page.goto(`http://127.0.0.1:${port}/#/grupo/g1/ajustes`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#ggph", { timeout: 8000 });
    await mark();
    assert.equal(await page.$eval("body", el => (el.textContent || "").includes("Generar uno nuevo")), true);
    const before = await page.$eval(".gg-img", el => el.getAttribute("src"));
    await page.evaluate(() => {
      const file = new File([new Uint8Array([0, 1, 2, 3, 4])], "familia.heic", { type: "image/heic" });
      const input = document.querySelector("#ggph") as HTMLInputElement;
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change"));
    });
    await page.waitForFunction(() => (document.querySelector("#ggpmsg")?.textContent || "").includes("anterior sigue"));
    assert.equal(puts.length, 0);
    assert.equal(await page.$eval(".gg-img", el => el.getAttribute("src")), before);
    await page.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1600; canvas.height = 900;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#0B2545"; ctx.fillRect(0, 0, 1600, 900);
      const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, "image/png"));
      const file = new File([blob!], "familia.png", { type: "image/png" });
      const input = document.querySelector("#ggph") as HTMLInputElement;
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change"));
    });
    await page.waitForFunction(() => (document.querySelector(".gg-img")?.getAttribute("src") || "").includes("v=2"));
    assert.equal(puts.at(-1)?.type, "image/jpeg");
    assert.ok((puts.at(-1)?.bytes || 0) < 150_000, `resized bytes ${puts.at(-1)?.bytes}`);
    assert.ok((puts.at(-1)?.bytes || 0) > 100);
    failPhoto = true;
    const kept = await page.$eval(".gg-img", el => el.getAttribute("src"));
    await page.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 40; canvas.height = 40;
      canvas.getContext("2d")!.fillRect(0, 0, 40, 40);
      const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, "image/png"));
      const file = new File([blob!], "otra.png", { type: "image/png" });
      const input = document.querySelector("#ggph") as HTMLInputElement;
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change"));
    });
    await page.waitForFunction(() => (document.querySelector("#ggpmsg")?.textContent || "").includes("anterior sigue"));
    assert.equal(await page.$eval(".gg-img", el => el.getAttribute("src")), kept);
    await page.screenshot({ path: `${ART}/group-photo.png` });
    assert.deepEqual(leaked, []);
    step = "done";
  } catch (err) {
    console.log("FAILED AT", step);
    throw err;
  } finally {
    await browser.close();
    await new Promise<void>(r => server.close(() => r()));
  }
});
