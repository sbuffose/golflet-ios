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
  const js = await readFile(new URL("../public/profe-preview/preview.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../public/profe-preview/preview.css", import.meta.url), "utf8");
  const all = html + js + css;
  assert.equal(/TODO|FIXME/.test(all), false);
  assert.equal(/\p{Extended_Pictographic}/u.test(all), false);
  assert.equal(all.includes("/api/"), false);
  assert.equal(js.includes("fetch("), false);
  assert.equal(css.includes("font-style:italic"), false);
  assert.match(js, /Lucía Vidal/);
  assert.match(js, /Martín Costa/);
  assert.match(js, /Pedro Almeida/);
  assert.match(js, /Tee times no se comparten/);
  assert.match(js, /youtube-nocookie.com\/embed/);
  assert.match(js, /No lo descargamos/);
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
      await page.waitForSelector("h1");
      await shot(name);
    };
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
    await page.click('[data-tool="linea"]');
    const box = await page.$eval("#stage", el => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top };
    });
    await page.mouse.move(box.x + 40, box.y + 80);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + 260, { steps: 4 });
    await page.mouse.up();
    await page.waitForSelector(".mark");
    await page.click("#guardar");
    await page.evaluate(() => document.querySelectorAll(".toast").forEach(n => n.remove()));
    await shot("profe-05-video");
    await open("profe-06-lado", "#/comparar");
    await page.click('[data-vista="sobre"]');
    await shot("profe-06-superpuesto");
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
