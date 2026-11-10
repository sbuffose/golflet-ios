/** TEST-ONLY. Inherited photo, group leave, bag and admin traces, plus the climate and private screens.
 *  Fixtures only. Nothing is written to a personal account, and 0045/0046 are not applied. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import test from "node:test";
import { maxBirdiesInRound } from "../lib/group-stats";
import { STATS } from "../lib/group-period-core";
import { courseEvidence, priorityCourses, TRACE_IMAGERY, validateTrace } from "../lib/trace-review";
import { CREDIT_WORDING_PENDING } from "../lib/ai";

const CHROME = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find(p => existsSync(p));
const ROOT = new URL("../public/", import.meta.url);
const ART = "/opt/cursor/artifacts";
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png" };
const ADMIN_HTML = readFileSync(new URL("../admin-ui/admin.html", import.meta.url), "utf8")
  .replace("/*APP_JS*/", () => readFileSync(new URL("../admin-ui/shell.js", import.meta.url), "utf8"));

test("salir no borra el grupo, un águila no es birdie y Cancha Vieja no se inventa en lat/lng", async () => {
  process.env.DATABASE_URL ||= "postgres://fixture:fixture@127.0.0.1:1/fixture";
  const { leavePlan } = await import("../lib/groups");
  const plan = leavePlan("me", [
    { member_id: "me", status: "accepted", role: "admin", responded_at: "2024-01-01" },
    { member_id: "old", status: "accepted", role: "member", responded_at: "2020-06-01" },
    { member_id: "new", status: "accepted", role: "member", responded_at: "2025-01-01" },
  ]);
  assert.equal(plan.deleted, false);
  assert.equal(plan.dormant, false);
  assert.equal(plan.promoted_member_id, "old");
  assert.equal(leavePlan("me", [{ member_id: "me", status: "accepted", role: "admin" }]).dormant, true);
  assert.equal(maxBirdiesInRound([
    { holes: [[1, 4, 2], [2, 4, 4], [3, 5, 4]] },
    { holes: [[1, 4, 4], [2, 3, 3]] },
  ]), 1);
  assert.equal(maxBirdiesInRound([{ holes: [[1, 4, 2]] }]), 0);
  assert.equal(STATS.length, 19);
  assert.ok(STATS.some(s => s.key === "max_birdies"));
  const vieja = courseEvidence("209", "Cancha Vieja");
  assert.ok(vieja);
  assert.equal(vieja.holes[0].audience, "satellite");
  assert.equal(vieja.holes[0].confidence, "golfistics_axis");
  assert.equal(vieja.holes[0].tee, null);
  assert.equal(vieja.holes[0].polygon, null);
  assert.equal(vieja.holes[0].anchor?.lat, -38.03381176);
  assert.equal(vieja.holes[0].anchor?.lng, -57.53818687);
  assert.equal(vieja.holes.filter(h => h.axis && !h.polygon && !h.tee).length, 18);
  const colorada = courseEvidence("118", "Colorada");
  assert.equal(colorada?.holes.filter(h => h.axis && !h.polygon && !h.tee).length, 18);
  assert.equal(colorada?.holes[8].axis?.front.lat, colorada?.holes[8].axis?.center.lat);
  assert.equal(colorada?.holes[8].axis?.front.lng, colorada?.holes[8].axis?.center.lng);
  assert.notEqual(colorada?.holes[8].axis?.back.lat, colorada?.holes[8].axis?.center.lat);
  const azul = courseEvidence("118", "Azul");
  assert.equal(azul?.holes[0].audience, "satellite");
  assert.ok((azul?.holes[0].polygon || []).length >= 3);
  assert.match(CREDIT_WORDING_PENDING, /Pendiente de aclarar/);
  assert.match(CREDIT_WORDING_PENDING, /402/);
  const invented = validateTrace(vieja.holes[0], {
    status: "accepted", parent: "none", confirm: true,
    green: [{ lat: -38.0338, lng: -57.5382 }, { lat: -38.0337, lng: -57.5381 }, { lat: -38.0339, lng: -57.5383 }],
    note: "centro inventado",
  });
  assert.equal(invented.ok, false);
  assert.match(invented.errors.join(" "), /guía u\/v|eje de Golfistics/);
  const far = validateTrace(vieja.holes[0], {
    status: "draft", parent: "golfistics_axis", confirm: false,
    green: [{ lat: -38.02, lng: -57.52 }, { lat: -38.0201, lng: -57.5201 }, { lat: -38.0202, lng: -57.52 }],
    note: "lejos del eje",
  });
  assert.equal(far.ok, false);
  assert.match(far.errors.join(" "), /no cae sobre el eje/);
  const listed = priorityCourses().map(c => c.course);
  assert.deepEqual(listed, ["Azul", "Colorada", "Cancha Vieja"]);
});

test("foto, salida del grupo, bolsa y trazado de Cancha Vieja en el teléfono", { timeout: 90_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const calls: string[] = [];
  const writes: { method: string; path: string; body: string }[] = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (body: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname.startsWith("/api/")) {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      calls.push(`${req.method} ${url.pathname}`);
      if (req.method !== "GET") writes.push({ method: req.method || "", path: url.pathname, body: raw });
      if (url.pathname === "/api/data") return json({
        user: { name: "TEST-ONLY", first_name: "TEST-ONLY", pending_first_sync: false, photo_url: null, photo_state: "unavailable" },
        player: { name: "TEST-ONLY", handicap_index: 8 }, hi_history: [],
        clubs: [{ id: "acc", club_name: "Club Fixture", rounds: 0, last_sync_status: "ok", last_sync_at: "2026-11-07T12:00:00Z", password_saved: false, source: "site" }],
        courses: [], rounds: [],
        bag: [{ club: "Driver", carry: 250, total: 260 }, { club: "SW", carry: null, total: null }, { club: "Putter", carry: 20, total: 20 }],
      });
      if (url.pathname === "/api/bag/distances") return json({ clubs: [] });
      if (url.pathname === "/api/my-clubs/catalog") return json({ note: "TEST-ONLY", types: [
        { code: "SW", category: "wedge", bag: "SW", label: "Sand wedge", loft: 56 },
        { code: "PT", category: "putter", bag: "Putter", label: "Putter" },
        { code: "4I", category: "iron", bag: "Hierro 4", label: "Hierro 4" },
      ], brands: [] });
      if (url.pathname === "/api/my-clubs/items") return json({ clubs: [
        { code: "SW", label: "Sand wedge", loft: 56, brand: "Titleist", model: "Vokey", enabled: true },
        { code: "PT", label: "Putter", enabled: true },
      ] });
      if (url.pathname === "/api/groups/g1" && req.method === "GET") return json({
        group: { id: "g1", name: "Familia", is_admin: true, admins: 1 },
        members: [
          { member_id: "me", name: "TEST-ONLY", is_me: true, is_admin: true, color: "#0B2545" },
          { member_id: "old", name: "Ana López", is_me: false, is_admin: false, color: "#C8A86A" },
        ],
        pending: [],
      });
      if (url.pathname === "/api/groups/g1/leave" && req.method === "POST") return json({ ok: true, deleted: false, dormant: false, remaining: 1, promoted_member_id: "old" });
      if (url.pathname === "/api/groups") return json({ groups: [], invitations: [] });
      if (url.pathname === "/api/ball") return json({ ball: null, catalog: [] });
      if (url.pathname === "/api/sorteos") return json({ open: 0, sorteos: [] });
      if (url.pathname === "/api/profesores") return json({ profesores: [] });
      if (url.pathname === "/api/me/settings") return json({ pace_alert: true, text_size: "normal", text_weight: "normal" });
      if (url.pathname === "/api/admin/me") return json({ user: { role: "admin", email: "test@fixture", must_change: false }, sections: ["trazos", "dashboard"] });
      if (url.pathname === "/api/admin/trazos") {
        const courses = priorityCourses();
        return json({
          imagery: TRACE_IMAGERY,
          scope: "Solo estas canchas de Argentina. El resto se suma cuando haya una fuente, no antes.",
          courses,
          ayuda: courses.flatMap(c => c.holes.filter(h => h.state === "necesito_una_mano").map(h => ({ club_code: c.club_code, course: c.course, title: c.title, hole: h.hole, detail: h.detail }))),
        });
      }
      const hole = url.pathname.match(/^\/api\/admin\/trazos\/(\d+)\/(.+)$/);
      if (hole && req.method === "GET") {
        const found = courseEvidence(hole[1], decodeURIComponent(hole[2]));
        if (!found) return json({ error: "no está" }, 404);
        return json({ imagery: TRACE_IMAGERY, course: found, schema: "0046 preparada, no aplicada" });
      }
      if (hole && req.method === "PUT") {
        const body = JSON.parse(raw || "{}");
        if (body.confirm === true) return json({ error: "El trazado necesita la migración 0046, que todavía no está aplicada. No se guardó nada." }, 503);
        return json({ saved: false, preview: { track_lie: false, note: "No se escribió." } });
      }
      return json({});
    }
    if (url.pathname.startsWith("/admin")) {
      res.writeHead(200, { "content-type": "text/html" }); res.end(ADMIN_HTML); return;
    }
    const file = url.pathname === "/" ? "/index.html" : url.pathname;
    try { const buf = await readFile(new URL(file.slice(1), ROOT)); res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" }); res.end(buf); }
    catch { res.writeHead(404); res.end("missing"); }
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await page.setRequestInterception(true);
    page.on("request", req => {
      const host = new URL(req.url()).hostname;
      if (host !== "127.0.0.1" && host !== "localhost") req.abort();
      else req.continue();
    });
    mkdirSync(ART, { recursive: true });
    await page.goto(`http://127.0.0.1:${port}/#/bolsa`, { waitUntil: "networkidle0" });
    await page.waitForSelector(".bag-putter");
    const putter = await page.$eval(".bag-putter", el => ({
      text: el.textContent || "",
      inputs: el.querySelectorAll("input").length,
    }));
    assert.match(putter.text, /Sin distancia en la bolsa/);
    assert.match(putter.text, /no lleva yardas/);
    assert.equal(putter.inputs, 0);
    assert.equal(await page.$eval("#bagcount", el => el.textContent), "1 de 2");
    await page.waitForFunction(() => (document.body.innerText || "").includes("56°"));
    const putterList = await page.evaluate(() => {
      const row = [...document.querySelectorAll(".eq-row")].find(r => (r.textContent || "").includes("Putter"));
      return { text: row?.querySelector(".eq-yd")?.textContent || "", inputs: row?.querySelectorAll("input").length || 0 };
    });
    assert.match(putterList.text, /Sin yardas/);
    assert.equal(putterList.inputs, 0);
    const beforeItems = writes.filter(w => w.path.startsWith("/api/my-clubs/items")).length;
    await page.click('a[href="#/equipo/juego"]');
    await page.waitForSelector("#ironset");
    await page.waitForFunction(() => (document.body.innerText || "").includes("No lo creamos"));
    assert.equal(await page.$("#equipo"), null);
    assert.doesNotMatch(await page.evaluate(() => document.body.innerText), /Ese palo no está/);
    assert.equal(writes.filter(w => w.path.startsWith("/api/my-clubs/items")).length, beforeItems);
    assert.equal(writes.filter(w => w.path === "/api/my-clubs/iron-set").length, 0);
    await page.screenshot({ path: `${ART}/inherit-bag-390.png` });

    await page.goto(`http://127.0.0.1:${port}/#/cuenta`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => /tu cuenta/i.test(document.body.innerText || ""));
    const photo = await page.evaluate(() => ({
      files: document.querySelectorAll("#meph").length,
      img: !!document.querySelector("img.me-face"),
      msg: document.querySelector("#mephmsg")?.textContent || "",
    }));
    assert.equal(photo.files, 1);
    assert.equal(photo.img, false);
    assert.match(photo.msg, /0045/);
    assert.match(photo.msg, /No se guardó nada/);
    assert.equal(writes.some(w => w.path === "/api/me/photo"), false);
    await page.screenshot({ path: `${ART}/inherit-cuenta-390.png` });

    await page.goto(`http://127.0.0.1:${port}/#/grupo/g1/miembros`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#ggleave");
    assert.match(await page.evaluate(() => document.body.innerText), /jugador más antiguo pasa a ser admin/);
    assert.match(await page.evaluate(() => document.body.innerText), /tarjetas de los demás se quedan/);
    await page.click("#ggleave");
    await page.waitForSelector("[data-yes]");
    await page.click("[data-yes]");
    await page.waitForFunction(() => location.hash.includes("amigos"));
    assert.ok(calls.includes("POST /api/groups/g1/leave"));
    assert.equal(calls.some(c => c.startsWith("DELETE /api/groups")), false);
    await page.screenshot({ path: `${ART}/inherit-leave-390.png` });

    const admin = await browser.newPage();
    await admin.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 });
    await admin.setRequestInterception(true);
    admin.on("request", req => {
      const host = new URL(req.url()).hostname;
      if (host !== "127.0.0.1" && host !== "localhost" && host !== "server.arcgisonline.com") req.abort();
      else req.continue();
    });
    await admin.goto(`http://127.0.0.1:${port}/admin/trazos`, { waitUntil: "networkidle0" });
    await admin.waitForFunction(() => (document.body.innerText || "").includes("Cancha Vieja"));
    assert.match(await admin.evaluate(() => document.body.innerText), /necesito una mano|ayuda/);
    await admin.evaluate(() => {
      const a = [...document.querySelectorAll("a")].find(node => (node.getAttribute("href") || "").includes("/209/") && (node.getAttribute("href") || "").endsWith("/1"));
      if (a) a.click();
    });
    await admin.waitForFunction(() => (document.body.innerText || "").includes("u/v"));
    assert.match(await admin.evaluate(() => document.body.innerText), /Sebastián/);
    assert.match(await admin.evaluate(() => document.body.innerText), /no es un polígono/i);
    assert.match(await admin.evaluate(() => document.body.innerText), /Golfistics/);
    assert.ok(await admin.$("#trmap"));
    assert.ok(await admin.$("#trsave"));
    await admin.waitForFunction(() => {
      const imgs = [...document.querySelectorAll("#trmap img")] as HTMLImageElement[];
      return imgs.length >= 4 && imgs.every(img => img.complete && img.naturalWidth > 32);
    }, { timeout: 20000 });
    await admin.click("#trprev");
    await admin.waitForFunction(() => /no se escribió|no va a detectar/i.test(document.querySelector("#trmsg")?.textContent || ""));
    const preview = writes.filter(w => w.method === "PUT" && w.path.includes("/api/admin/trazos"));
    assert.equal(preview.length, 1);
    assert.equal(JSON.parse(preview[0].body).confirm, false);
    assert.equal((JSON.parse(preview[0].body).green || []).length, 0);
    await admin.click("#trsave");
    await admin.waitForFunction(() => /0046/.test(document.querySelector("#trmsg")?.textContent || ""));
    assert.match(await admin.$eval("#trmsg", el => el.textContent || ""), /No se guardó nada/);
    const saved = writes.filter(w => w.method === "PUT" && w.path.includes("/api/admin/trazos") && JSON.parse(w.body).confirm === true);
    assert.equal(saved.length, 1);
    await admin.screenshot({ path: `${ART}/inherit-trazo-vieja-390.png` });
    await admin.goto(`http://127.0.0.1:${port}/admin/trazos/118/Azul/1`, { waitUntil: "networkidle0" });
    await admin.waitForFunction(() => /OpenStreetMap|contorno/i.test(document.body.innerText || ""));
    assert.match(await admin.evaluate(() => document.body.innerText), /no lo reemplaza/);
    assert.equal(await admin.$("#trsave"), null);
  } finally {
    await browser.close();
    await new Promise<void>(r => server.close(() => r()));
  }
});

test("clima y solo para vos se leen en 390 px", { timeout: 60_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const rate = (n: number, holes: number) => Math.round((n / holes) * 18 * 10) / 10;
  const mix = (eagle: number, birdie: number, par: number, bogey: number, dbl: number, holes = 54, cards = 3) => ({
    eagles: { per_18: rate(eagle, holes) }, birdies: { per_18: rate(birdie, holes) }, pars: { per_18: rate(par, holes) },
    bogeys: { per_18: rate(bogey, holes) }, doubles: { per_18: rate(dbl, holes) }, cards, holes, nine: 0,
  });
  const wet = { key: "lluvia", label: "Con lluvia", n: 3, avg_diff: 2.4, comparable: true, mix: mix(0, 1, 30, 18, 5), sentence: "En tus vueltas con lluvia hubo más bogeys que en el resto.", note: "Misma cancha y mismo tee. 3 tarjetas de cada lado." };
  const dry = { key: "seco", label: "Seco", n: 3, avg_diff: 0.4, comparable: true, mix: mix(1, 6, 40, 6, 1), sentence: null, note: "Misma cancha y mismo tee." };
  const rounds = ["2026-10-02", "2026-10-09", "2026-10-16"].map((date, i) => ({
    round_id: `r${i}`, date, course: "Cancha Fixture", differential: i === 0 ? 2.1 : 0.4,
    wx: { condition: i === 0 ? "lluvia" : "despejado", temp_c: 16, precip_mm: i === 0 ? 4 : 0, wind_kmh: 12 },
  }));
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (body: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname.startsWith("/api/")) {
      for await (const chunk of req) void chunk;
      if (url.pathname === "/api/data") return json({
        user: { name: "TEST-ONLY", first_name: "TEST-ONLY", pending_first_sync: false },
        player: { name: "TEST-ONLY", handicap_index: 8 }, hi_history: [], clubs: [], courses: [], rounds: [], bag: [],
      });
      if (url.pathname === "/api/metrics/weather" && url.searchParams.get("dim")) return json({
        dim: "lluvia", group: { enough: true, buckets: [{ key: "lluvia", label: "Con lluvia", avg_diff: 2.4, vs_overall: 1.2, n: 3 }, { key: "seco", label: "Seco", avg_diff: 0.4, vs_overall: -0.8, n: 3 }] },
        play: [wet, dry], overall_avg_diff: 1.2, rounds,
      });
      if (url.pathname === "/api/metrics/weather") return json({
        n: 6, min_group: 3, overall_avg_diff: 1.2,
        lluvia: { enough: true, buckets: [{ key: "lluvia", label: "Con lluvia", avg_diff: 2.4, n: 3 }, { key: "seco", label: "Seco", avg_diff: 0.4, n: 3 }] },
        temperatura: { enough: false, buckets: [] }, viento: { enough: false, buckets: [] },
        play: { lluvia: [wet, dry] },
      });
      if (url.pathname === "/api/me/private-metrics") return json({
        empty: false, played: 6, matched: 4,
        bands: [
          { key: "manana", label: "Mañana", played: 4, matched: 3, avg_diff: 0.8 },
          { key: "mediodia", label: "Mediodía", played: 1, matched: 1, avg_diff: null },
          { key: "tarde", label: "Tarde", played: 1, matched: 0, avg_diff: null },
        ],
        partners: [
          { key: "juan garcia", name: "Juan García", count: 2, avg_diff: null },
          { key: "id:p9", name: "García", count: 2, avg_diff: 1.1 },
        ],
      });
      if (url.pathname === "/api/profesores") return json({ profesores: [] });
      if (url.pathname === "/api/weather/rounds") return json({ rounds: {} });
      if (url.pathname === "/api/tee-times") return json({ tee_times: [], clubs: [] });
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
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    mkdirSync(ART, { recursive: true });
    await page.goto(`http://127.0.0.1:${port}/#/clima/lluvia`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => (document.body.innerText || "").includes("hubo más bogeys"));
    const clima = await page.evaluate(() => document.body.innerText);
    assert.match(clima, /Birdies \/ 18/);
    assert.match(clima, /no la suma de golpes/);
    assert.equal(clima.includes("causa"), false);
    assert.equal(clima.includes("te cuesta"), false);
    await page.screenshot({ path: `${ART}/clima-390.png` });
    await page.goto(`http://127.0.0.1:${port}/#/privado/companeros`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => (document.body.innerText || "").includes("Juan García"));
    const priv = await page.evaluate(() => document.body.innerText);
    assert.match(priv, /cantidad de salidas juntos, no un resultado/);
    assert.match(priv, /Juan García/);
    assert.match(priv, /García/);
    assert.match(priv, /2 salidas/);
    assert.equal(priv.includes("Juan García García"), false);
    await page.screenshot({ path: `${ART}/privado-companeros-390.png` });
    await page.goto(`http://127.0.0.1:${port}/#/privado/horario`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => (document.body.innerText || "").includes("cantidad de salidas"));
    assert.match(await page.evaluate(() => document.body.innerText), /No es un resultado/);
    await page.screenshot({ path: `${ART}/privado-horario-390.png` });
  } finally {
    await browser.close();
    await new Promise<void>(r => server.close(() => r()));
  }
});
