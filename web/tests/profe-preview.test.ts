/** Vista previa estática del profesor. Datos ficticios. No toca la API. */
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const CHROME = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => existsSync(p));
const ROOT = new URL("../public/", import.meta.url);
const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
const ART = "/opt/cursor/artifacts";

test("la vista previa no llama a la API y usa gente ficticia", async () => {
  const html = await readFile(new URL("../public/profe-preview/index.html", import.meta.url), "utf8");
  const preview = await readFile(new URL("../public/profe-preview/preview.js", import.meta.url), "utf8");
  const anotador = await readFile(new URL("../public/profe-preview/anotador.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../public/profe-preview/preview.css", import.meta.url), "utf8");
  const js = preview + anotador;
  const all = html + js + css;
  assert.equal(/TODO|FIXME/.test(all), false);
  assert.equal(/\p{Extended_Pictographic}/u.test(all), false);
  assert.equal(all.includes("/api/"), false);
  assert.equal(js.includes("fetch("), false);
  assert.equal(css.includes("font-style:italic"), false);
  assert.match(preview, /Lucía Vidal/);
  assert.match(preview, /Martín Costa/);
  assert.match(preview, /Pedro Almeida/);
  assert.match(preview, /Tee times no se comparten/);
  assert.match(preview, /youtube-nocookie.com\/embed/);
  assert.match(preview, /No lo descargamos/);
  assert.match(preview, /blank/);
  assert.match(anotador, /createObjectURL/);
  assert.match(anotador, /vector-effect/);
  assert.match(anotador, /non-scaling-stroke/);
  assert.match(anotador, /Ángulo/);
  assert.match(anotador, /Cabeza/);
  assert.match(anotador, /0\.25/);
  assert.match(anotador, /Marcar address/);
  assert.match(anotador, /Línea de pies/);
});

test("cada pantalla de la vista previa se puede recorrer", { skip: !CHROME }, async () => {
  const hits: string[] = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    hits.push(url.pathname);
    const file = url.pathname === "/profe-preview" ? "/profe-preview/index.html" : url.pathname;
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
    mkdirSync(ART, { recursive: true });
    const shot = async (name: string) => {
      await page.evaluate(() => document.querySelectorAll(".toast").forEach(n => n.remove()));
      const height = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
      await page.setViewport({ width: 390, height, deviceScaleFactor: 2 });
      await page.screenshot({ path: `${ART}/${name}.png` });
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    };
    const open = async (name: string, hash: string) => {
      await page.goto(`http://127.0.0.1:${port}/profe-preview/index.html${hash}`, { waitUntil: "networkidle0" });
      await page.waitForSelector("#app .main");
      await shot(name);
    };
    await page.goto(`http://127.0.0.1:${port}/profe-preview/index.html?blank=1`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#abrir");
    assert.match(await page.$eval("body", el => el.innerText), /Elegí una foto o un video/);
    assert.equal(await page.$eval("#stage", el => el.dataset.kind), "empty");
    await shot("profe-00-vacio");
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    writeFileSync("/tmp/profe-frame.png", png);
    const abrir = await page.$("#abrir");
    assert.ok(abrir);
    await abrir.uploadFile("/tmp/profe-frame.png");
    await page.waitForFunction(() => document.querySelector("#stage")?.getAttribute("data-kind") === "image");
    assert.equal(hits.some(p => p.startsWith("/api/")), false);
    await open("profe-01-ingreso", "#/");
    assert.match(await page.$eval("h1", el => el.textContent || ""), /Martín/);
    await open("profe-02-hoy", "#/hoy");
    assert.match(await page.$eval("body", el => el.innerText), /09:30/);
    assert.match(await page.$eval("body", el => el.innerText), /Lucía Vidal/);
    await open("profe-03-alumno", "#/alumno/lucia");
    assert.match(await page.$eval("body", el => el.innerText), /Tee times no se comparten/);
    assert.match(await page.$eval("body", el => el.innerText), /118/);
    await open("profe-04-clase", "#/clase/wedges");
    assert.match(await page.$eval("body", el => el.innerText), /El loft hace el vuelo/);
    assert.match(await page.$eval("body", el => el.innerText), /Brazo izquierdo/);
    await open("profe-05-video", "#/video/frente");
    await page.$eval('[data-tool="linea"]', el => (el as HTMLButtonElement).click());
    const box = await page.$eval(".fit", el => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    });
    await page.mouse.move(box.x + box.w * 0.2, box.y + box.h * 0.25);
    await page.mouse.down();
    await page.mouse.move(box.x + box.w * 0.7, box.y + box.h * 0.55, { steps: 6 });
    assert.equal(await page.$eval(".loupe", el => el.hidden), false);
    await page.screenshot({ path: `${ART}/profe-05-lupa.png` });
    await page.mouse.up();
    await page.$eval('[data-act="marcas"]', (el: HTMLButtonElement) => el.click());
    await page.waitForSelector(".mark");
    const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem("golflet-profe-preview") || "{}").marcas || []);
    assert.ok(stored.length >= 1);
    assert.ok(stored[0].pts.every((p: { x: number; y: number }) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1));
    await page.mouse.move(box.x + box.w / 2, box.y + box.h / 2);
    await page.mouse.wheel({ deltaY: -240 });
    const zoom = await page.$eval(".world", el => Number(el.dataset.zoom || "1"));
    assert.ok(zoom > 1);
    await page.click('[data-act="ajustar"]');
    await page.$eval('[data-tool="angulo"]', el => (el as HTMLButtonElement).click());
    const box2 = await page.$eval(".fit", el => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    });
    for (const [nx, ny] of [[0.3, 0.7], [0.55, 0.4], [0.8, 0.62]]) {
      await page.mouse.click(box2.x + box2.w * nx, box2.y + box2.h * ny);
    }
    await page.waitForFunction(() => /°/.test(document.body.innerText || ""));
    await page.click("#guardar");
    await page.evaluate(() => document.querySelectorAll(".toast").forEach(n => n.remove()));
    await shot("profe-05-video");
    await open("profe-06-lado", "#/comparar");
    assert.equal(await page.$eval('[data-act="sync"]', el => (el as HTMLButtonElement).disabled), true);
    assert.match(await page.$eval('[data-act="marcar"][data-key="address"]', el => el.textContent || ""), /Marcar address/);
    await page.$eval('[data-act="menu"]', (el: HTMLButtonElement) => el.click());
    await page.click('[data-vista="sobre"]');
    await shot("profe-06-superpuesto");
    await page.$eval('[data-act="menu"]', (el: HTMLButtonElement) => el.click());
    await page.click('[data-compare="referencia"]');
    await page.type("#ref", "https://www.youtube.com/watch?v=demo-ritmo");
    await page.click("#tomar");
    await page.waitForSelector("#cuadro");
    await shot("profe-06-referencia");
    await open("profe-07-biblioteca", "#/biblioteca");
    await page.type("#lt", "Drill de tempo");
    await page.type("#lu", "https://www.youtube.com/watch?v=demo-tempo");
    await page.type("#lg", "tempo, wedges");
    await page.click("#addlink");
    assert.match(await page.$eval("body", el => el.innerText), /Drill de tempo/);
    await page.evaluate(() => document.querySelectorAll(".toast").forEach(n => n.remove()));
    await shot("profe-07-biblioteca");
    await open("profe-08-alumna", "#/mia");
    await page.click('[data-done="t1"]');
    assert.match(await page.$eval("body", el => el.innerText), /Hecha/);
    writeFileSync("/tmp/practica-preview.mp4", "demo");
    const file = await page.$("#file");
    assert.ok(file);
    await file.uploadFile("/tmp/practica-preview.mp4");
    await page.waitForFunction(() => (document.body.innerText || "").includes("Video elegido"));
    await shot("profe-08-alumna");
    assert.equal(hits.some(p => p.startsWith("/api/")), false);
  } finally {
    await browser.close();
    server.close();
  }
});

test("el anotador 9:16 mide en píxeles y no tapa el video", { skip: !CHROME }, async () => {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const file = url.pathname === "/profe-preview" ? "/profe-preview/index.html" : url.pathname;
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
    await page.goto(`http://127.0.0.1:${port}/profe-preview/index.html?blank=1#/anotar`, { waitUntil: "networkidle0" });
    const webm = await page.evaluate(async () => {
      const c = document.createElement("canvas");
      c.width = 180; c.height = 320;
      const g = c.getContext("2d");
      if (!g) return [];
      const stream = c.captureStream(30);
      const rec = new MediaRecorder(stream, { mimeType: "video/webm" });
      const chunks: Blob[] = [];
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      const done = new Promise<void>(r => { rec.onstop = () => r(); });
      rec.start(100);
      for (let i = 0; i < 18; i++) {
        g.fillStyle = "#0B2545";
        g.fillRect(0, 0, 180, 320);
        g.fillStyle = "#C8102E";
        g.fillRect(70, 30 + i * 10, 28, 28);
        await new Promise(r => setTimeout(r, 40));
      }
      rec.stop();
      await done;
      return Array.from(new Uint8Array(await new Blob(chunks, { type: "video/webm" }).arrayBuffer()));
    });
    writeFileSync("/tmp/profe-916.webm", Buffer.from(webm));
    const png = await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 180; c.height = 320;
      const g = c.getContext("2d");
      if (!g) return "";
      g.fillStyle = "#0B2545";
      g.fillRect(0, 0, 180, 320);
      g.strokeStyle = "#F6F7F9";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(90, 24);
      g.lineTo(90, 296);
      g.stroke();
      g.fillStyle = "#C8A86A";
      g.beginPath();
      g.arc(90, 250, 8, 0, Math.PI * 2);
      g.fill();
      return c.toDataURL("image/png").split(",")[1];
    });
    writeFileSync("/tmp/profe-916.png", Buffer.from(png, "base64"));
    const abrir = await page.$("#abrir");
    assert.ok(abrir);
    await abrir.uploadFile("/tmp/profe-916.png");
    await page.waitForFunction(() => document.querySelector("#stage")?.getAttribute("data-kind") === "image");
    assert.equal(await page.$eval("#app", el => el.classList.contains("archivo")), true);
    assert.equal(await page.$eval(".banner", el => getComputedStyle(el).display), "none");
    assert.equal((await page.$eval("body", el => el.innerText)).includes("Coordenadas de 0 a 1"), false);
    const layout = await page.evaluate(() => {
      const stage = document.querySelector("#stage")!.getBoundingClientRect();
      const transport = document.querySelector(".transport")!.getBoundingClientRect();
      const rail = document.querySelector(".rail")!;
      const rr = rail.getBoundingClientRect();
      const tools = ["angulo", "cabeza", "pies", "plano"].map(id => {
        const r = document.querySelector(`[data-tool="${id}"]`)!.getBoundingClientRect();
        return { id, top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width };
      });
      return {
        stageH: stage.height, stageBottom: stage.bottom, transportTop: transport.top, railTop: rr.top,
        scroll: rail.scrollWidth - rail.clientWidth, tools,
      };
    });
    assert.ok(layout.stageH >= 700, "alto " + layout.stageH);
    assert.ok(layout.transportTop < layout.stageBottom - 20, "el transporte sigue ocupando alto del video");
    assert.ok(layout.railTop >= layout.transportTop - 1);
    assert.ok(layout.scroll < 8, "la barra de herramientas se desplaza");
    for (const t of layout.tools) {
      assert.ok(t.w > 8 && t.top >= 0 && t.bottom <= 844 && t.left >= 0 && t.right <= 390, t.id);
    }
    const fit = await page.$eval(".fit", el => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    });
    assert.ok(Math.abs(fit.w / fit.h - 180 / 320) < 0.02);
    const at = (nx: number, ny: number) => page.mouse.click(fit.x + nx * fit.w, fit.y + ny * fit.h);
    await page.$eval('[data-tool="angulo"]', el => (el as HTMLButtonElement).click());
    const dx = 0.4;
    const dy = dx * fit.w * Math.tan(6 * Math.PI / 180) / fit.h;
    await at(0.75, 0.62);
    await at(0.25, 0.62);
    await at(0.25 + dx, 0.62 - dy);
    await page.$eval('[data-act="marcas"]', (el: HTMLButtonElement) => el.click());
    await page.waitForFunction(() => /Ángulo 6°/.test(document.body.innerText || ""));
    await page.evaluate(() => document.querySelectorAll(".toast").forEach(n => n.remove()));
    await page.$eval('[data-tool="cabeza"]', el => (el as HTMLButtonElement).click());
    await page.mouse.move(fit.x + fit.w * 0.5, fit.y + fit.h * 0.28);
    await page.mouse.down();
    await page.mouse.move(fit.x + fit.w * 0.5 + 36, fit.y + fit.h * 0.28 + 12, { steps: 4 });
    const loupe = await page.evaluate((fx, fy) => {
      const r = document.querySelector(".loupe")!.getBoundingClientRect();
      return { hidden: (document.querySelector(".loupe") as HTMLElement).hidden, cover: fx >= r.left && fx <= r.right && fy >= r.top && fy <= r.bottom };
    }, fit.x + fit.w * 0.5 + 36, fit.y + fit.h * 0.28 + 12);
    assert.equal(loupe.hidden, false);
    assert.equal(loupe.cover, false);
    await page.screenshot({ path: `${ART}/profe-10-lupa.png` });
    await page.mouse.up();
    const circle = await page.evaluate(() => {
      const ell = [...document.querySelectorAll(".ink ellipse")].find(e => e.getAttribute("stroke") === "#C8102E");
      return ell ? { rx: Number(ell.getAttribute("rx")), ry: Number(ell.getAttribute("ry")) } : null;
    });
    assert.ok(circle);
    assert.ok(Math.abs(circle.rx - circle.ry) < 1.5);
    await page.$eval('[data-tool="pies"]', el => (el as HTMLButtonElement).click());
    await page.mouse.move(fit.x + fit.w * 0.15, fit.y + fit.h * 0.82);
    await page.mouse.down();
    await page.mouse.move(fit.x + fit.w * 0.85, fit.y + fit.h * 0.82);
    await page.mouse.up();
    await page.waitForFunction(() => /Línea de pies/.test(document.body.innerText || ""));
    assert.equal(await page.evaluate(() => [...document.querySelectorAll(".ink text")].some(n => (n.textContent || "").includes("Pies"))), false);
    await page.$eval('[data-tool="texto"]', el => (el as HTMLButtonElement).click());
    await at(0.22, 0.18);
    const halo = await page.$eval(".ink text", el => ({
      sw: Number(el.getAttribute("stroke-width")),
      ve: el.getAttribute("vector-effect"),
      vb: el.ownerSVGElement?.viewBox.baseVal.width || 0,
    }));
    assert.equal(halo.ve, "non-scaling-stroke");
    assert.ok(halo.sw <= 4 && halo.vb > 80 && halo.sw * 8 < halo.vb);
    await page.evaluate(() => document.querySelectorAll(".toast").forEach(n => n.remove()));
    await page.screenshot({ path: `${ART}/profe-10-916.png` });

    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await page.waitForFunction(() => document.getElementById("app")?.classList.contains("desk"));
    const desk = await page.evaluate(() => {
      const stage = document.querySelector("#stage")!.getBoundingClientRect();
      const rail = document.querySelector(".rail")!.getBoundingClientRect();
      const fit = document.querySelector(".fit")!.getBoundingClientRect();
      return { sw: stage.width, sh: stage.height, rx: rail.left, rw: rail.width, fw: fit.width, fh: fit.height };
    });
    assert.ok(desk.rx >= desk.sw - 2);
    assert.ok(desk.sh > 500 && desk.sw > 700);
    assert.ok(Math.abs(desk.fw / desk.fh - 180 / 320) < 0.03);
    await page.screenshot({ path: `${ART}/profe-11-desk.png` });

    const video = await browser.newPage();
    await video.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await video.goto(`http://127.0.0.1:${port}/profe-preview/index.html?blank=1#/anotar`, { waitUntil: "networkidle0" });
    await (await video.$("#abrir"))!.uploadFile("/tmp/profe-916.webm");
    await video.waitForFunction(() => document.querySelector("#stage")?.getAttribute("data-kind") === "video");
    const stageH = await video.$eval("#stage", el => el.getBoundingClientRect().height);
    assert.ok(stageH >= 700, "alto " + stageH);
    assert.equal(await video.$eval(".transport .pins", el => (el as HTMLElement).hidden), true);
    await video.evaluate(() => document.querySelectorAll(".toast").forEach(n => n.remove()));
    await video.screenshot({ path: `${ART}/profe-14-uno-390.png` });
    await video.waitForFunction(() => /\d+:\d{2}\.\d{2} · \d+/.test(document.querySelector("#reloj")?.textContent || ""));
    const before = await video.$eval("#reloj", el => el.textContent || "");
    await video.click('[data-step="1"]');
    await video.waitForFunction((prev) => (document.querySelector("#reloj")?.textContent || "") !== prev, {}, before);
    const after = await video.$eval("#reloj", el => el.textContent || "");
    const frameOf = (s: string) => Number(s.split("·")[1]);
    assert.equal(frameOf(after), frameOf(before) + 1);
    const fitV = await video.$eval(".fit", el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    await video.$eval('[data-tool="linea"]', el => (el as HTMLButtonElement).click());
    await video.mouse.move(fitV.x + 30, fitV.y + 40);
    const h0 = await video.$eval("#stage", el => el.getBoundingClientRect().height);
    await video.mouse.down();
    const mid = await video.evaluate(() => ({
      h: document.querySelector("#stage")!.getBoundingClientRect().height,
      vis: getComputedStyle(document.querySelector(".transport")!).visibility,
      gone: document.querySelector(".rail")!.getClientRects().length,
    }));
    assert.ok(Math.abs(mid.h - h0) < 2, `salto ${h0} → ${mid.h}`);
    assert.equal(mid.vis, "hidden");
    assert.equal(mid.gone, 0);
    await video.evaluate(() => document.querySelectorAll(".toast").forEach(n => n.remove()));
    await video.screenshot({ path: `${ART}/profe-15-dibujando.png` });
    await video.mouse.move(fitV.x + 120, fitV.y + 180, { steps: 6 });
    await video.mouse.up();
    await video.$eval('[data-act="marcas"]', (el: HTMLButtonElement) => el.click());
    await video.waitForFunction(() => /cuadro /.test(document.body.innerText || ""));
    const onFrame = await video.$$eval(".ink line", ns => ns.length);
    assert.ok(onFrame > 0);
    await video.click('[data-step="1"]');
    await video.waitForFunction(() => document.querySelectorAll(".ink line").length === 0);
    await video.$eval('[data-tool="cabeza"]', el => (el as HTMLButtonElement).click());
    await video.mouse.move(fitV.x + fitV.w * 0.5, fitV.y + 70);
    await video.mouse.down();
    await video.mouse.move(fitV.x + fitV.w * 0.5 + 34, fitV.y + 90, { steps: 4 });
    await video.mouse.up();
    await video.waitForFunction(() => /Cabeza · tramo/.test(document.body.innerText || ""));
    const cabezaAntes = await video.$eval("body", el => (el.innerText.match(/Cabeza · tramo \d+–\d+/) || [""])[0]);
    await video.$eval('[data-pin="frame"]', (el: HTMLButtonElement) => el.click());
    const cabezaIgual = await video.$eval("body", el => (el.innerText.match(/Cabeza · tramo \d+–\d+/) || [""])[0]);
    assert.equal(cabezaIgual, cabezaAntes);
    assert.equal(await video.$eval('[data-pin="frame"]', el => el.classList.contains("on")), true);
    await video.$eval('[data-tool="mover"]', (el: HTMLButtonElement) => el.click());
    await video.$eval('[data-pin="frame"]', (el: HTMLButtonElement) => el.click());
    await video.waitForFunction(() => /Cabeza · cuadro/.test(document.body.innerText || ""));
    assert.equal(/todo el clip/.test(await video.$eval("body", el => el.innerText)), false);
    await video.evaluate(() => document.querySelectorAll(".toast").forEach(n => n.remove()));
    await video.screenshot({ path: `${ART}/profe-12-video.png` });
    await video.close();
  } finally {
    await browser.close();
    server.close();
  }
});

test("comparar dos clips ocupa la pantalla", { skip: !CHROME }, async () => {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const file = url.pathname === "/profe-preview" ? "/profe-preview/index.html" : url.pathname;
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
  const clip = async (page: { evaluate: (fn: () => Promise<number[]>) => Promise<number[]> }, frames: number, cutAt: number, color: string) => page.evaluate(async (n, cut, paint) => {
    const c = document.createElement("canvas");
    c.width = 180; c.height = 320;
    const g = c.getContext("2d");
    if (!g) return [];
    const stream = c.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: "video/webm" });
    const chunks: Blob[] = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise<void>(r => { rec.onstop = () => r(); });
    rec.start(80);
    for (let i = 0; i < n; i++) {
      g.fillStyle = i < cut ? "#0B2545" : paint;
      g.fillRect(0, 0, 180, 320);
      g.fillStyle = "#C8A86A";
      g.beginPath();
      g.arc(90, 40 + (i % 20) * 8, 10, 0, Math.PI * 2);
      g.fill();
      await new Promise(r => setTimeout(r, 42));
    }
    rec.stop();
    await done;
    return Array.from(new Uint8Array(await new Blob(chunks, { type: "video/webm" }).arrayBuffer()));
  }, frames, cutAt, color);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    const a = await clip(page, 160, 110, "#C8102E");
    const b = await clip(page, 16, 99, "#3DDC97");
    writeFileSync("/tmp/profe-a.webm", Buffer.from(a));
    writeFileSync("/tmp/profe-b.webm", Buffer.from(b));
    await page.goto(`http://127.0.0.1:${port}/profe-preview/index.html#/comparar`, { waitUntil: "networkidle0" });
    await (await page.$("#abrir"))!.uploadFile("/tmp/profe-a.webm");
    await page.waitForFunction(() => document.querySelector("#stage")?.getAttribute("data-kind") === "video");
    await page.$eval('[data-open="b"]', (el: HTMLButtonElement) => el.click());
    await (await page.$("#abrir"))!.uploadFile("/tmp/profe-b.webm");
    await page.waitForFunction(() => document.querySelector("#lado-b")?.getAttribute("data-kind") === "video");
    const sizes = await page.evaluate(() => [...document.querySelectorAll(".stage")].map(el => {
      const r = el.getBoundingClientRect();
      const video = el.querySelector("video");
      const fit = el.querySelector(".fit")!.getBoundingClientRect();
      return { w: r.width, h: r.height, fw: fit.width, fh: fit.height, vw: video ? video.videoWidth : 0, kind: el.getAttribute("data-kind") };
    }));
    assert.equal(sizes.length, 2);
    for (const s of sizes) {
      assert.equal(s.kind, "video");
      assert.ok(s.w > 140 && s.h > 400, JSON.stringify(s));
      assert.ok(s.fw > 80 && s.fh > 280, JSON.stringify(s));
      assert.ok(s.vw > 0);
    }
    assert.equal(await page.$eval("#app", el => el.classList.contains("lienzo") && el.classList.contains("archivo")), true);
    assert.equal(await page.$eval("h1", el => el.getClientRects().length), 0);
    assert.equal(await page.$eval(".main > .note", el => el.getClientRects().length), 0);
    assert.equal(await page.$eval("#usar", el => el.getClientRects().length), 0);
    const fs = await page.$eval(".rail button", el => parseFloat(getComputedStyle(el).fontSize));
    assert.ok(fs >= 11);
    await page.$eval('[data-act="menu"]', (el: HTMLButtonElement) => el.click());
    const pin = await page.$eval('[data-pin="range"]', el => ({ sheet: !!el.closest(".sheet"), w: el.getBoundingClientRect().width }));
    assert.equal(pin.sheet, false);
    assert.ok(pin.w > 8);
    await page.$eval('[data-pin="range"]', (el: HTMLButtonElement) => el.click());
    await page.$eval('[data-act="menu"]', (el: HTMLButtonElement) => el.click());
    assert.equal(await page.$eval('[data-pin="range"]', el => el.classList.contains("on")), true);
    const clocks = await page.$$eval(".sideclock", ns => ns.map(n => n.textContent || ""));
    await page.$eval('.pane[data-side="b"] [data-side-step="1"]', (el: HTMLButtonElement) => el.click());
    await page.waitForFunction((prev) => (document.querySelector('.pane[data-side="b"] .sideclock')?.textContent || "") !== prev, {}, clocks[1]);
    assert.equal(await page.$eval('.pane[data-side="a"] .sideclock', el => el.textContent), clocks[0]);
    await page.waitForFunction(() => document.querySelector("#stage")?.getAttribute("data-scanned") === "1", { timeout: 20000 });
    const scanInfo = await page.evaluate(() => {
      const stage = document.querySelector("#stage");
      const v = stage?.querySelector("video") as HTMLVideoElement | null;
      return { cuts: stage?.getAttribute("data-cuts") || "", dur: v && Number.isFinite(v.duration) ? v.duration : Number(stage?.getAttribute("data-duration") || "0") };
    });
    assert.ok(scanInfo.cuts.split(",").map(Number).some(n => n > 96), JSON.stringify(scanInfo));
    await page.$eval('[data-tool="cabeza"]', (el: HTMLButtonElement) => el.click());
    const fit = await page.$eval("#stage .fit", el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    await page.mouse.move(fit.x + fit.w * 0.5, fit.y + fit.h * 0.35);
    await page.mouse.down();
    await page.mouse.move(fit.x + fit.w * 0.5 + 28, fit.y + fit.h * 0.35 + 8, { steps: 4 });
    await page.mouse.up();
    await page.$eval('[data-act="marcas"]', (el: HTMLButtonElement) => el.click());
    await page.waitForFunction(() => /Cabeza · tramo/.test(document.body.innerText || ""));
    const range = await page.$eval("body", el => (el.innerText.match(/Cabeza · tramo (\d+)–(\d+)/) || []).slice(1).map(Number));
    const lastInfo = await page.$eval("#stage", el => {
      const v = el.querySelector("video") as HTMLVideoElement | null;
      const shown = v && Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
      const stored = Number(el.getAttribute("data-duration") || "0");
      const live = Math.max(shown, stored);
      return { last: Math.max(0, Math.round(live * 30) - 1), shown, stored };
    });
    const last = lastInfo.last;
    assert.ok(last > 100, JSON.stringify({ lastInfo, range, scanInfo }));
    assert.ok(range[1] > 96 && range[1] < last - 5, `tramo ${range.join("–")} de ${last}`);
    await page.$eval('[data-tool="angulo"]', (el: HTMLButtonElement) => el.click());
    await page.mouse.click(fit.x + fit.w * 0.2, fit.y + fit.h * 0.55);
    await page.mouse.click(fit.x + fit.w * 0.5, fit.y + fit.h * 0.35);
    await page.mouse.click(fit.x + fit.w * 0.8, fit.y + fit.h * 0.55);
    await page.waitForFunction(() => /Ángulo/.test(document.body.innerText || ""));
    const clear = await page.evaluate(() => {
      const text = document.querySelector("#stage .ink text");
      const ell = [...document.querySelectorAll("#stage .ink ellipse")].find(e => e.getAttribute("stroke") === "#C8102E");
      if (!text || !ell) return null;
      const tx = Number(text.getAttribute("x")), ty = Number(text.getAttribute("y"));
      const cx = Number(ell.getAttribute("cx")), cy = Number(ell.getAttribute("cy")), r = Number(ell.getAttribute("rx"));
      return { dist: Math.hypot(tx - cx, ty - cy), r };
    });
    assert.ok(clear && clear.dist > clear.r + 6);
    const listed = await page.$$eval(".marks-body .mark", ns => ns.filter(n => n.getClientRects().length > 0).length);
    assert.ok(listed >= 2);
    assert.notEqual(await page.$eval(".marks", el => getComputedStyle(el).maxHeight), "64px");
    await page.$eval('[data-act="marcas"]', (el: HTMLButtonElement) => el.click());
    await page.$eval("#texto", (el: HTMLInputElement) => { el.value = "Brazo izquierdo extendido"; });
    await page.$eval('[data-tool="texto"]', (el: HTMLButtonElement) => el.click());
    await page.mouse.click(fit.x + fit.w * 0.85, fit.y + fit.h * 0.22);
    const label = await page.evaluate(() => {
      const svg = document.querySelector("#stage .ink") as SVGSVGElement | null;
      const t = [...(svg?.querySelectorAll("text") || [])].find(n => (n.textContent || "").includes("Brazo")) as SVGGraphicsElement | undefined;
      if (!t || !svg) return null;
      const bb = t.getBBox();
      const vb = svg.viewBox.baseVal;
      return { x: bb.x, y: bb.y, r: bb.x + bb.width, b: bb.y + bb.height, vw: vb.width, vh: vb.height, text: t.textContent };
    });
    assert.ok(label, "falta la etiqueta");
    assert.match(label.text || "", /Brazo izquierdo extendido/);
    assert.ok(label.x >= -1 && label.y >= -1 && label.r <= label.vw + 2 && label.b <= label.vh + 2, JSON.stringify(label));
    await page.$eval('[data-tool="mover"]', (el: HTMLButtonElement) => el.click());
    await page.mouse.click(fit.x + 10, fit.y + fit.h - 12);
    await page.$eval('[data-tool="texto"]', (el: HTMLButtonElement) => el.click());
    await page.$eval("#texto", (el: HTMLInputElement) => { el.value = "Punta abierta"; });
    await page.mouse.click(fit.x + fit.w * 0.9, fit.y + fit.h * 0.55);
    const punta = await page.evaluate(() => {
      const svg = document.querySelector("#stage .ink");
      const t = [...(svg?.querySelectorAll("text") || [])].find(n => (n.textContent || "").includes("Punta")) as SVGGraphicsElement | undefined;
      const box = document.querySelector("#stage .fit")!.getBoundingClientRect();
      if (!t) return null;
      const r = t.getBoundingClientRect();
      return {
        text: t.textContent, w: r.width, h: r.height,
        inside: r.width > 12 && r.height > 6 && r.left >= box.left - 2 && r.right <= box.right + 3 && r.top >= box.top - 2 && r.bottom <= box.bottom + 3,
      };
    });
    if (!punta) {
      const dump = await page.evaluate(() => [...document.querySelectorAll("#stage text")].map(n => n.textContent).join(" | "));
      assert.ok(punta, "falta Punta abierta [" + dump + "]");
    }
    assert.match(punta.text || "", /Punta abierta/);
    assert.equal(punta.inside, true, JSON.stringify(punta));
    await page.evaluate(() => document.querySelectorAll(".toast").forEach(n => n.remove()));
    await page.screenshot({ path: `${ART}/profe-18-punta.png` });
    const relojA = await page.$eval("#reloj", el => el.textContent || "");
    await page.$eval('.pane[data-side="b"] [data-act="solo"]', (el: HTMLButtonElement) => el.click());
    const solo = await page.evaluate(() => {
      const a = document.querySelector('.pane[data-side="a"]')!.getBoundingClientRect();
      const b = document.querySelector('.pane[data-side="b"]')!.getBoundingClientRect();
      const juntos = document.querySelector('[data-act="juntos"]') as HTMLElement | null;
      const reloj = document.querySelector("#reloj")?.textContent || "";
      const side = document.querySelector('.pane[data-side="b"] .sideclock')?.textContent || "";
      return {
        aw: a.width, bw: b.width, juntos: !!juntos && !juntos.hidden, reloj, side,
        rf: Number((reloj.split("·")[1] || "").trim()),
        sf: Number((side.split("·")[1] || "").trim()),
      };
    });
    assert.ok(solo.bw > 300 && solo.aw < 2 && solo.juntos, JSON.stringify(solo));
    assert.equal(solo.rf, solo.sf);
    assert.notEqual(solo.rf, Number((relojA.split("·")[1] || "").trim()));
    await page.$eval('[data-act="juntos"]', (el: HTMLButtonElement) => el.click());
    await page.$eval('[data-tool="linea"]', (el: HTMLButtonElement) => el.click());
    await page.mouse.move(fit.x + 12, fit.y + fit.h * 0.72);
    const h0 = await page.$eval("#stage", el => el.getBoundingClientRect().height);
    await page.mouse.down();
    const mid = await page.evaluate(() => ({
      h: document.querySelector("#stage")!.getBoundingClientRect().height,
      vis: getComputedStyle(document.querySelector(".transport")!).visibility,
      dib: document.querySelector(".anotador")!.classList.contains("dibujando"),
    }));
    assert.equal(mid.dib, true);
    assert.equal(mid.vis, "hidden");
    assert.ok(Math.abs(mid.h - h0) < 2, `salto ${h0} → ${mid.h}`);
    await page.mouse.up();
    assert.equal(await page.$eval(".anotador", el => el.classList.contains("dibujando")), false);
    await page.evaluate(() => document.querySelectorAll(".toast").forEach(n => n.remove()));
    await page.screenshot({ path: `${ART}/profe-14-comparar-390.png` });
    const times = await page.$$eval(".sideclock", ns => ns.map(n => n.textContent || ""));
    await page.$eval('[data-act="menu"]', (el: HTMLButtonElement) => el.click());
    await page.click('[data-vista="sobre"]');
    await page.waitForFunction((prev) => {
      const b = document.querySelector('.pane[data-side="b"] .sideclock')?.textContent || "";
      const now = Number((b.split("·")[1] || "").trim());
      const was = Number((String(prev).split("·")[1] || "").trim());
      return now === was && now > 0;
    }, {}, times[1]);
    await page.waitForSelector("#op");
    await page.waitForFunction(() => document.querySelector('.pane[data-side="a"]')?.classList.contains("active"));
    const stack = await page.evaluate(() => {
      const a = document.querySelector('.pane[data-side="a"]') as HTMLElement;
      const b = document.querySelector('.pane[data-side="b"]') as HTMLElement;
      const r = a.querySelector(".stage")!.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return {
        az: getComputedStyle(a).zIndex, bz: getComputedStyle(b).zIndex,
        bo: Number(getComputedStyle(b).opacity), bp: getComputedStyle(b).pointerEvents,
        inA: !!(el && a.contains(el)),
        ar: { x: ar.x, y: ar.y, w: ar.width, h: ar.height },
        br: { x: br.x, y: br.y, w: br.width, h: br.height },
      };
    });
    assert.ok(stack.br.h > 400 && Math.abs(stack.ar.w - stack.br.w) < 3 && Math.abs(stack.ar.h - stack.br.h) < 3, JSON.stringify(stack));
    assert.ok(Math.abs(stack.ar.x - stack.br.x) < 3 && Math.abs(stack.ar.y - stack.br.y) < 3, JSON.stringify(stack));
    assert.ok(Number(stack.bz) > Number(stack.az), JSON.stringify(stack));
    assert.ok(stack.bo < 0.95 && stack.bo > 0.1, JSON.stringify(stack));
    assert.equal(stack.bp, "none");
    assert.equal(stack.inA, true);
    await page.screenshot({ path: `${ART}/profe-14-sobre-a.png` });
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await page.waitForFunction(() => document.getElementById("app")?.classList.contains("desk"));
    await page.$eval('[data-vista="lado"]', (el: HTMLButtonElement) => el.click());
    await page.waitForSelector(".panes.lado");
    const desk = await page.evaluate(() => {
      const stages = [...document.querySelectorAll(".stage")].map(el => el.getBoundingClientRect());
      const g = document.querySelector("#guardar")!.getBoundingClientRect();
      const chip = document.querySelector('[data-vista="lado"]')!.getBoundingClientRect();
      const video = document.querySelector("#stage .fit")!.getBoundingClientRect();
      const overlap = Math.max(0, Math.min(chip.right, video.right) - Math.max(chip.left, video.left))
        * Math.max(0, Math.min(chip.bottom, video.bottom) - Math.max(chip.top, video.top));
      return { stages: stages.map(r => ({ w: r.width, h: r.height })), g: { top: g.top, bottom: g.bottom, h: g.height }, overlap, chipTop: chip.top, videoTop: video.top, cw: chip.width, ch: chip.height };
    });
    for (const s of desk.stages) assert.ok(s.w > 200 && s.h > 280, JSON.stringify(s));
    assert.ok(desk.g.h > 10 && desk.g.top >= 0 && desk.g.bottom <= 801);
    assert.equal(desk.overlap, 0);
    assert.ok(desk.cw > 20 && desk.ch > 10 && desk.chipTop < desk.videoTop, JSON.stringify(desk));
    await page.screenshot({ path: `${ART}/profe-14-comparar-1280.png` });
    await page.$eval('[data-vista="sobre"]', (el: HTMLButtonElement) => el.click());
    await page.waitForSelector("#op");
    const over = await page.$$eval(".stage", ns => ns.map(el => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height }; }));
    assert.ok(over.every(s => s.w > 200 && s.h > 200));

    const struct = await page.evaluate(async () => {
      const c = document.createElement("canvas");
      c.width = 180; c.height = 320;
      const g = c.getContext("2d");
      if (!g) return [];
      const stream = c.captureStream(30);
      const rec = new MediaRecorder(stream, { mimeType: "video/webm" });
      const chunks: Blob[] = [];
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      const done = new Promise<void>(r => { rec.onstop = () => r(); });
      rec.start(80);
      const green = "#3E7A4A";
      const dark = "#2A5C38";
      for (let i = 0; i < 110; i++) {
        g.fillStyle = green;
        g.fillRect(0, 0, 180, 320);
        g.fillStyle = dark;
        if (i < 36) g.fillRect(70, 20, 40, 280);
        else g.fillRect(10, 200, 160, 70);
        await new Promise(r => setTimeout(r, 40));
      }
      rec.stop();
      await done;
      return Array.from(new Uint8Array(await new Blob(chunks, { type: "video/webm" }).arrayBuffer()));
    });
    writeFileSync("/tmp/profe-struct.webm", Buffer.from(struct));
    const page2 = await browser.newPage();
    await page2.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page2.goto(`http://127.0.0.1:${port}/profe-preview/index.html?blank=1#/anotar`, { waitUntil: "networkidle0" });
    await (await page2.$("#abrir"))!.uploadFile("/tmp/profe-struct.webm");
    await page2.waitForFunction(() => document.querySelector("#stage")?.getAttribute("data-kind") === "video");
    await page2.waitForFunction(() => document.querySelector("#stage")?.getAttribute("data-scanned") === "1", { timeout: 20000 });
    const found = await page2.evaluate(() => {
      const stage = document.querySelector("#stage");
      return { cuts: (stage?.getAttribute("data-cuts") || "").split(",").map(Number).filter(n => n > 0) };
    });
    assert.ok(found.cuts.some(n => n > 20 && n < 80), JSON.stringify(found));
    await page2.$eval('[data-tool="cabeza"]', (el: HTMLButtonElement) => el.click());
    const fit2 = await page2.$eval("#stage .fit", el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    await page2.mouse.move(fit2.x + fit2.w * 0.5, fit2.y + fit2.h * 0.3);
    await page2.mouse.down();
    await page2.mouse.move(fit2.x + fit2.w * 0.5 + 30, fit2.y + fit2.h * 0.3 + 10, { steps: 4 });
    await page2.mouse.up();
    await page2.$eval('[data-act="marcas"]', (el: HTMLButtonElement) => el.click());
    await page2.waitForFunction(() => /Cabeza · tramo/.test(document.body.innerText || ""));
    const autoEnd = await page2.$eval("body", el => (el.innerText.match(/Cabeza · tramo (\d+)–(\d+)/) || []).slice(1).map(Number));
    assert.ok(autoEnd[1] > 18 && autoEnd[1] < 78, JSON.stringify({ autoEnd, found }));
    await page2.$eval("#scrub", (el: HTMLInputElement) => { el.value = "8"; el.dispatchEvent(new Event("input", { bubbles: true })); });
    await page2.waitForFunction(() => Number((document.querySelector("#reloj")?.textContent || "").split("·")[1]) >= 8);
    await page2.$eval('[data-act="corte"]', (el: HTMLButtonElement) => el.click());
    await page2.waitForFunction(() => /Cabeza · tramo 0–7/.test(document.body.innerText || ""));
    await page2.evaluate(() => document.querySelectorAll(".toast").forEach(n => n.remove()));
    await page2.screenshot({ path: `${ART}/profe-15-corte.png` });
    const record = async (kind: "mano" | "paneo" | "duro") => page2.evaluate(async (mode) => {
      const c = document.createElement("canvas");
      c.width = 180; c.height = 320;
      const g = c.getContext("2d");
      if (!g) return [];
      const stream = c.captureStream(30);
      const rec = new MediaRecorder(stream, { mimeType: "video/webm" });
      const chunks: Blob[] = [];
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      const done = new Promise<void>(r => { rec.onstop = () => r(); });
      rec.start(80);
      const n = mode === "mano" ? 110 : mode === "paneo" ? 165 : 100;
      for (let i = 0; i < n; i++) {
        const t = i * 0.04;
        if (mode === "duro") {
          g.fillStyle = t < 1.6 ? "#0B2545" : "#C8102E";
          g.fillRect(0, 0, 180, 320);
        } else {
          g.fillStyle = "#3E7A4A";
          g.fillRect(0, 0, 180, 320);
          g.fillStyle = "#2A5C38";
          if (mode === "mano") {
            g.fillRect(70, 20, 40, 280);
            if (t >= 1.6 && t < 2.6) {
              g.fillStyle = "#E8C4A8";
              g.fillRect(112, 48, 52, 78);
            }
          } else {
            const p = t < 1.8 ? 0 : t > 4.8 ? 1 : (t - 1.8) / 3;
            g.save();
            g.translate(-p * 180, 0);
            g.fillStyle = "#3E7A4A";
            g.fillRect(0, 0, 180, 320);
            g.fillStyle = "#2A5C38";
            g.fillRect(40, 16, 36, 288);
            g.restore();
            g.save();
            g.translate((1 - p) * 180, 0);
            g.fillStyle = "#0B2545";
            g.fillRect(0, 0, 180, 320);
            g.fillStyle = "#C8A86A";
            g.fillRect(8, 214, 164, 64);
            g.restore();
          }
        }
        await new Promise(r => setTimeout(r, 40));
      }
      rec.stop();
      await done;
      return Array.from(new Uint8Array(await new Blob(chunks, { type: "video/webm" }).arrayBuffer()));
    }, kind);
    const mano = await record("mano");
    writeFileSync("/tmp/profe-mano.webm", Buffer.from(mano));
    const page3 = await browser.newPage();
    await page3.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page3.goto(`http://127.0.0.1:${port}/profe-preview/index.html?blank=1#/anotar`, { waitUntil: "networkidle0" });
    await (await page3.$("#abrir"))!.uploadFile("/tmp/profe-mano.webm");
    await page3.waitForFunction(() => document.querySelector("#stage")?.getAttribute("data-scanned") === "1", { timeout: 25000 });
    const manoCuts = await page3.$eval("#stage", el => (el.getAttribute("data-cuts") || "").split(",").map(Number).filter(n => n > 0));
    assert.deepEqual(manoCuts, [], "la mano no es un corte " + manoCuts.join(","));
    await page3.$eval('[data-tool="cabeza"]', (el: HTMLButtonElement) => el.click());
    const fitM = await page3.$eval("#stage .fit", el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    await page3.mouse.move(fitM.x + fitM.w * 0.45, fitM.y + fitM.h * 0.3);
    await page3.mouse.down();
    await page3.mouse.move(fitM.x + fitM.w * 0.45 + 26, fitM.y + fitM.h * 0.3 + 8, { steps: 3 });
    await page3.mouse.up();
    await page3.$eval('[data-act="marcas"]', (el: HTMLButtonElement) => el.click());
    await page3.waitForFunction(() => /Cabeza · tramo/.test(document.body.innerText || ""));
    const manoRange = await page3.$eval("body", el => (el.innerText.match(/Cabeza · tramo (\d+)–(\d+)/) || []).slice(1).map(Number));
    const manoLast = await page3.$eval("#stage", el => {
      const v = el.querySelector("video") as HTMLVideoElement | null;
      const shown = v && Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
      const live = Math.max(shown, Number(el.getAttribute("data-duration") || "0"));
      return Math.max(0, Math.round(live * 30) - 1);
    });
    assert.ok(manoRange[1] > manoLast - 5, `la cabeza se cortó en la mano ${manoRange.join("–")} de ${manoLast}`);
    assert.equal(await page3.$eval(".hint", el => (el as HTMLElement).hidden), false);
    assert.match(await page3.$eval(".hint", el => el.textContent || ""), /Revisá hasta dónde va la cabeza/);
    await page3.evaluate(() => document.querySelectorAll(".toast").forEach(n => n.remove()));
    await page3.screenshot({ path: `${ART}/profe-17-mano.png` });
    const paneo = await record("paneo");
    writeFileSync("/tmp/profe-paneo.webm", Buffer.from(paneo));
    const manoDur = await page3.$eval("#stage", el => el.getAttribute("data-duration") || "");
    await (await page3.$("#abrir"))!.uploadFile("/tmp/profe-paneo.webm");
    await page3.waitForFunction((prev) => {
      const stage = document.querySelector("#stage");
      return stage?.getAttribute("data-scanned") === "1" && (stage.getAttribute("data-duration") || "") !== prev;
    }, { timeout: 30000 }, manoDur);
    const panInfo = await page3.evaluate(() => {
      const stage = document.querySelector("#stage");
      return { cuts: stage?.getAttribute("data-cuts") || "", hints: stage?.getAttribute("data-hints") || "", ticks: document.querySelectorAll(".ticks i").length };
    });
    const panFrames = (panInfo.cuts || panInfo.hints).split(",").map(Number).filter(n => n > 0);
    assert.ok(panFrames.some(n => n > 40 && n < 170), JSON.stringify(panInfo));
    assert.ok(panInfo.ticks > 0, JSON.stringify(panInfo));
    await page3.evaluate(() => document.querySelectorAll(".toast").forEach(n => n.remove()));
    await page3.screenshot({ path: `${ART}/profe-17-paneo.png` });
    const duro = await record("duro");
    writeFileSync("/tmp/profe-duro.webm", Buffer.from(duro));
    const panDur = await page3.$eval("#stage", el => el.getAttribute("data-duration") || "");
    await (await page3.$("#abrir"))!.uploadFile("/tmp/profe-duro.webm");
    await page3.waitForFunction((prev) => {
      const stage = document.querySelector("#stage");
      const cuts = (stage?.getAttribute("data-cuts") || "").split(",").map(Number);
      return stage?.getAttribute("data-scanned") === "1" && (stage.getAttribute("data-duration") || "") !== prev && cuts.some(n => n > 30 && n < 90);
    }, { timeout: 25000 }, panDur);
    await page3.evaluate(() => document.querySelectorAll(".toast").forEach(n => n.remove()));
    await page3.screenshot({ path: `${ART}/profe-16-cortes.png` });
    await page3.close();
    await page2.close();
  } finally {
    await browser.close();
    server.close();
  }
});
