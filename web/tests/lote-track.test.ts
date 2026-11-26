/** Fixture-only. Wedge photos, the putt that follows a miss, and editing or deleting a shot. */
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdirSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const CHROME = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find(p => existsSync(p));
const ROOT = new URL("../public/", import.meta.url);
const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};
const ART = "/opt/cursor/artifacts";
const GREEN = { lat: -38.03381176, lng: -57.53818687 };
const TEE = { lat: -38.037468, lng: -57.538187 };
const ring = [
  { lat: GREEN.lat + 0.00012, lng: GREEN.lng - 0.00012 },
  { lat: GREEN.lat + 0.00012, lng: GREEN.lng + 0.00012 },
  { lat: GREEN.lat - 0.00012, lng: GREEN.lng + 0.00012 },
  { lat: GREEN.lat - 0.00012, lng: GREEN.lng - 0.00012 },
];
const hole = { hole: 1, par: 5, yards: 520, tee: TEE, green: { center: GREEN } };
const bag = [
  { club: "Gap wedge", carry: 125 },
  { club: "Sand wedge", carry: 105 },
  { club: "Lob wedge", carry: 85 },
  { club: "Putter", carry: 0 },
  { club: "Híbrido", carry: 200 },
  { club: "Hierro 8", carry: 140 },
];
const gear = {
  clubs: [
    { code: "GW", label: "Gap wedge", brand: "Titleist", model: "Vokey SM10" },
    { code: "SW", label: "Sand wedge", brand: "Titleist", model: "Vokey SM10" },
    { code: "LW", label: "Lob wedge", brand: "Titleist", model: "Vokey SM10" },
    { code: "Pt", label: "Putter", brand: "Scotty Cameron", model: "Phantom" },
    { code: "Hy", label: "Híbrido", brand: "Titleist" },
    { code: "8i", label: "Hierro 8", brand: "Titleist", model: "T150" },
  ],
};

test("la bolsa muestra el SM10, el putt fallado ofrece Embocar, y un tiro se edita o se borra", { timeout: 180_000, skip: CHROME ? false : "chrome is not installed" }, async () => {
  const onGreen = { lat: GREEN.lat - 0.00004, lng: GREEN.lng };
  const puttShots: Record<string, unknown>[] = [{
    id: "approach", hole: 1, shot_number: 1, club: "Lob wedge", result: null, penalty_strokes: 0,
    lat: TEE.lat, lng: TEE.lng, end_lat: onGreen.lat, end_lng: onGreen.lng, distance_m: 90, distance_kind: "estimated",
  }];
  const buenaShots = [{
    id: "b1", hole: 1, shot_number: 1, club: "Lob wedge", result: null, penalty_strokes: 0,
    lat: TEE.lat, lng: TEE.lng, end_lat: onGreen.lat, end_lng: onGreen.lng, distance_m: 90,
  }, {
    id: "b2", hole: 1, shot_number: 2, club: "Putter", lie: "green", intent: "recovery", result: null, penalty_strokes: 0,
    lat: onGreen.lat, lng: onGreen.lng, end_lat: GREEN.lat - 0.00002, end_lng: GREEN.lng, distance_m: 2,
  }];
  const editShots: Record<string, unknown>[] = [
    { id: "e1", hole: 1, shot_number: 1, club: "Driver", result: null, penalty_strokes: 0, lat: TEE.lat, lng: TEE.lng, end_lat: -38.0352, end_lng: TEE.lng, distance_m: 230, distance_kind: "estimated" },
    { id: "e2", hole: 1, shot_number: 2, club: "Hierro 7", result: null, penalty_strokes: 0, lat: -38.0352, lng: TEE.lng, end_lat: -38.0344, end_lng: TEE.lng, distance_m: 140, distance_kind: "estimated" },
    { id: "e3", hole: 1, shot_number: 3, club: "Sand wedge", result: null, penalty_strokes: 0, lat: -38.0344, lng: TEE.lng, end_lat: onGreen.lat, end_lng: onGreen.lng, distance_m: 70, distance_kind: "estimated" },
    { id: "e4", hole: 1, shot_number: 4, club: "Putter", lie: "green", result: "holed", penalty_strokes: 0, lat: onGreen.lat, lng: onGreen.lng, end_lat: GREEN.lat, end_lng: GREEN.lng, distance_m: 4, distance_kind: "estimated" },
  ];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (!(req.headers.host || "").startsWith("127.0.0.1")) { res.writeHead(500); res.end("refused"); return; }
    const json = (body: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname.startsWith("/api/")) {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      if (url.pathname === "/api/data") return json({ user: { name: "TEST-ONLY", pending_first_sync: false }, player: { name: "TEST-ONLY" }, hi_history: [], clubs: [], courses: [], rounds: [] });
      if (url.pathname === "/api/bag") return json(bag);
      if (url.pathname === "/api/my-clubs/items") return json(gear);
      if (url.pathname === "/api/gps/courses/209-azul") return json({ course: { club_code: "209", course: "Azul", holes: [hole] } });
      if (url.pathname === "/api/course-maps/209/Azul") return json({ holes: [{ hole: 1, green: { polygon: ring } }] });
      if (url.pathname === "/api/reconstructions" && req.method === "GET") {
        return json({ rounds: [], reconstructions: ["live-putt", "live-buena", "live-edit"].map(id => ({ id, current_hole: 1, club_code: "209", vm_course: "Azul", course: "Azul", round_id: null })) });
      }
      const body = raw ? JSON.parse(raw) : {};
      if (url.pathname === "/api/reconstructions/live-putt/shots" && req.method === "POST") {
        puttShots.push({ id: `p${puttShots.length + 1}`, shot_number: puttShots.length + 1, hole: body.hole, ...body });
        return json({ shots: puttShots });
      }
      if (url.pathname === "/api/reconstructions/live-putt/shots") return json({ shots: puttShots });
      if (url.pathname === "/api/reconstructions/live-buena/shots") return json({ shots: buenaShots });
      if (url.pathname === "/api/reconstructions/live-edit/shots" && req.method === "PATCH") {
        const shot = editShots.find(s => s.id === body.shot_id);
        if (shot) Object.assign(shot, body);
        return json({ shot });
      }
      if (url.pathname === "/api/reconstructions/live-edit/shots" && req.method === "DELETE") {
        const id = url.searchParams.get("shot");
        const index = editShots.findIndex(s => s.id === id);
        if (index >= 0) editShots.splice(index, 1);
        editShots.forEach((s, i) => { s.shot_number = i + 1; });
        return json({ ok: true });
      }
      if (url.pathname === "/api/reconstructions/live-edit/shots") return json({ shots: editShots });
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
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true });
    await page.setRequestInterception(true);
    page.on("request", req => {
      const host = new URL(req.url()).hostname;
      if (host !== "127.0.0.1" && host !== "localhost" && host !== "server.arcgisonline.com") req.abort();
      else req.continue();
    });
    mkdirSync(ART, { recursive: true });
    const ready = () => page.waitForFunction(() => {
      const hit = document.querySelector("#play-hit") as HTMLButtonElement | null;
      const map = document.querySelector("#tkmap");
      return !!hit && !hit.disabled && map?.getAttribute("data-moving") === "0" && map?.getAttribute("data-map") === "ready";
    }, { timeout: 25000 });

    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-putt`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => {
      const club = document.querySelector("#play-club") as HTMLSelectElement | null;
      const map = document.querySelector("#tkmap");
      return club?.value === "Putter" && map?.getAttribute("data-putting") === "1" && map?.getAttribute("data-map") === "ready";
    }, { timeout: 25000 });
    await page.click("#play-club-tile");
    await page.waitForFunction(() => {
      const list = document.querySelector("#play-club-list") as HTMLElement | null;
      return !!list && !list.hidden && list.querySelectorAll("button").length >= 6;
    });
    const faces = await page.$$eval("#play-club-list button", nodes => nodes.map(node => ({
      label: node.getAttribute("aria-label") || "",
      src: node.querySelector("img")?.getAttribute("src") || "",
    })));
    for (const label of ["Gap wedge", "Sand wedge", "Lob wedge"]) {
      const face = faces.find(item => item.label === label);
      assert.equal(face?.src, "/clubs/models/titleist-vokey-sm10.jpg", JSON.stringify(faces));
    }
    assert.equal(faces.find(item => item.label === "Putter")?.src, "/clubs/silhouettes/putter.svg");
    assert.equal(faces.find(item => item.label === "Híbrido")?.src, "/clubs/silhouettes/hybrid.svg");
    assert.equal(faces.find(item => item.label === "Hierro 8")?.src, "/clubs/models/titleist-t150-iron.jpg");
    await page.screenshot({ path: `${ART}/web-390-wedges.png` });
    await page.click("#play-club-close");

    const readOut = () => page.$eval("#tkro", el => el.textContent || "");
    for (let i = 0; i < 12; i++) await page.click("#play-zoom-in");
    for (let i = 0; i < 30; i++) {
      const now = await readOut();
      if (/ft al hoyo|in al hoyo/.test(now)) break;
      await page.mouse.move(195, 280);
      await page.mouse.down();
      await page.mouse.move(195, 360, { steps: 4 });
      await page.mouse.up();
      await new Promise(r => setTimeout(r, 40));
    }
    assert.match(await readOut(), /ft al hoyo|in al hoyo/);
    assert.equal((await readOut()).includes("En el hoyo"), false);
    await ready();
    assert.equal(await page.$eval("#play-hit", el => (el.textContent || "").trim()), "ENTER");
    await page.click("#play-hit");
    await page.waitForFunction(() => (document.querySelector("#play-hit")?.textContent || "").trim() === "Embocar", { timeout: 15000 });
    const follow = await page.evaluate(() => ({
      club: (document.querySelector("#play-club") as HTMLSelectElement).value,
      hit: (document.querySelector("#play-hit")?.textContent || "").trim(),
      act: document.querySelector("#play-hit")?.getAttribute("data-act") || "",
      mark: (document.querySelector("#play-mark")?.textContent || "").trim(),
      read: document.querySelector("#tkro")?.textContent || "",
    }));
    assert.equal(follow.club, "Putter");
    assert.equal(follow.hit, "Embocar");
    assert.equal(follow.act, "hole");
    assert.equal(follow.mark, "Marcar");
    assert.match(follow.read, /ft al hoyo|in al hoyo/);
    await page.screenshot({ path: `${ART}/web-390-embocar.png` });
    await page.click("#play-hit");
    await page.waitForSelector("#play-next", { timeout: 15000 });
    assert.equal(puttShots.at(-1)?.result, "holed");
    assert.equal(puttShots.filter(s => s.club === "Putter").length, 2);

    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-buena`, { waitUntil: "networkidle0" });
    await ready();
    assert.equal(await page.$eval("#play-hit", el => (el.textContent || "").trim()), "ENTER");
    assert.equal(await page.$("#play-mark"), null);

    await page.goto(`http://127.0.0.1:${port}/#/reconstruir/live-edit`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => {
      const map = document.querySelector("#tkmap");
      return !!document.querySelector("#play-shot-2") && !!document.querySelector("#play-edit-hole") && map?.getAttribute("data-map") === "ready";
    }, { timeout: 25000 });
    assert.equal(await page.$eval("#play-score", el => (el.textContent || "").trim()), "4");
    await page.click("#play-shot-2");
    await page.waitForSelector("#play-shot-editor");
    await page.click("#play-edit-club");
    await page.waitForSelector("#play-club-list button[aria-label='Gap wedge']");
    await page.click("#play-club-list button[aria-label='Gap wedge']");
    await page.waitForFunction(() => (document.querySelector("#play-shot-2")?.textContent || "").includes("Gap wedge"));
    await page.click("#play-edit-buena");
    await page.waitForFunction(() => (document.querySelector("#play-edit-buena")?.textContent || "").includes("activo"));
    const edited = editShots.find(s => s.id === "e2");
    assert.equal(edited?.club, "Gap wedge");
    assert.equal(edited?.intent, "recovery");
    await page.screenshot({ path: `${ART}/web-390-editar-tiro.png` });
    await page.click("#play-edit-del");
    await page.waitForSelector("#play-edit-yes");
    assert.match(await page.$eval("#play-shot-editor", el => el.textContent || ""), /¿Borrar este tiro\?/);
    await page.screenshot({ path: `${ART}/web-390-borrar-tiro.png` });
    await page.click("#play-edit-yes");
    await page.waitForFunction(() => document.querySelectorAll("#rc-shots .tk-shot:not(.tk-more)").length === 3, { timeout: 10000 });
    const rows = await page.$$eval("#rc-shots .tk-shot:not(.tk-more)", nodes => nodes.map(node => (node.textContent || "").replace(/\s+/g, " ").trim()));
    assert.match(rows[0] || "", /^1\. Driver/);
    assert.match(rows[1] || "", /^2\. Sand wedge/);
    assert.match(rows[2] || "", /^3\. Putter/);
    assert.equal(rows.some(row => row.includes("Gap wedge") || row.includes("Hierro 7")), false);
    assert.equal(await page.$eval("#play-score", el => (el.textContent || "").trim()), "3");
    assert.equal(editShots.map(s => s.shot_number).join(","), "1,2,3");
  } finally {
    await browser.close();
    await new Promise<void>(r => server.close(() => r()));
  }
});
