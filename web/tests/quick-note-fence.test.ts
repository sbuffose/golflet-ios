/** TEST-ONLY. Localhost browsers. External hosts are aborted.
 *  A response belongs to the round that sent it, and a note stamp follows the commit. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import test from "node:test";
import { Pool, type PoolClient } from "pg";
import { withTransaction } from "../lib/db";
import { HOLE_MARK_UPSERT, notePatch, writeAuthoritativeNote, writeHoleMark, type HoleRef } from "../lib/quick-stats";

const CHROME = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find(p => existsSync(p));
const ROOT = new URL("../public/", import.meta.url);
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".png": "image/png" };
const TEST_DATABASE_URL = process.env.GOLFLET_TEST_DATABASE_URL || "postgres://golflet_test:golflet_test@127.0.0.1:5432/golflet_scorecard_test";
const local = /@(127\.0\.0\.1|localhost)(:|\/)/.test(TEST_DATABASE_URL);
const card: HoleRef[] = [{ hole: 1, par: 4 }, { hole: 2, par: 4 }];

const account = { hole: 1, putts: 2, gir: true, drive: "fairway", rev: 5 };
const fixture = {
  user: { name: "TEST", first_name: "TEST", pending_first_sync: false },
  player: { handicap_index: 12 },
  hi_history: [],
  rounds: [
    { round_id: "r1", id: "r1", date: "2026-11-02", gross: 80, net: 75, valid_card: true, course_key: "c1", club_name: "Fixture", holes: [[1, 4, 4], [2, 4, 4]], putts: 32, gir: 10, fir: 8 },
    { round_id: "r2", id: "r2", date: "2026-11-02", gross: 80, net: 75, valid_card: true, course_key: "c1", club_name: "Fixture", holes: [[1, 4, 4], [2, 4, 4]], putts: 50, gir: 12, fir: 9 },
  ],
  courses: [{ key: "c1", course: "Fixture", label: "Fixture", club_name: "Fixture", par: 72, holes: [], tees: {} }],
  clubs: [],
  bag: [],
};

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function staticServer() {
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
  return server;
}

test("a late round stays on its own screen, and a pending edit stays with the round that typed it", { timeout: 60_000, skip: !CHROME ? "chrome is not available" : false }, async () => {
  const server = await staticServer();
  const port = (server.address() as { port: number }).port;
  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const open = async () => {
      const page = await browser.newPage();
      const held: Array<{ url: string; body: Record<string, unknown>; respond: (payload: unknown) => Promise<void> }> = [];
      const notes: Array<{ body: Record<string, unknown>; respond: (payload: unknown) => Promise<void> }> = [];
      let outside = 0;
      await page.setRequestInterception(true);
      page.on("request", async request => {
        const target = new URL(request.url());
        if (target.hostname !== "127.0.0.1") { outside += 1; await request.abort(); return; }
        if (!target.pathname.startsWith("/api/")) { await request.continue(); return; }
        const posted = request.method() === "PUT" && request.postData() ? JSON.parse(request.postData() || "{}") as Record<string, unknown> : {};
        const respond = async (payload: unknown) => {
          await request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
        };
        if (target.pathname === "/api/data") { await respond(fixture); return; }
        if (target.pathname.endsWith("/hole-marks") && request.method() === "GET") {
          await respond({ marks: [account, { hole: 2, putts: 1, gir: false, drive: "left", rev: 4 }] });
          return;
        }
        if (target.pathname.endsWith("/hole-marks") && request.method() === "PUT") { held.push({ url: target.pathname, body: posted, respond }); return; }
        if (target.pathname.endsWith("/notes") && request.method() === "PUT") { notes.push({ body: posted, respond }); return; }
        const empty = target.pathname === "/api/weather/rounds" ? { rounds: {} } : target.pathname === "/api/tee-times" ? { tee_times: [], clubs: [] } : {};
        await respond(empty);
      });
      await page.goto(`http://127.0.0.1:${port}/#/ronda/r1`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.querySelector("#qmsg")?.textContent === "Guardado en tu cuenta", { timeout: 10_000 });
      const putts = () => page.$eval('input[data-k="putts"]', el => (el as HTMLInputElement).value);
      return { page, held, notes, putts, outside: () => outside };
    };

    const away = await open();
    await away.page.click("#qputts button:nth-child(4)");
    for (let i = 0; i < 80 && away.held.length === 0; i++) await delay(25);
    assert.equal(away.held.length, 1);
    await away.page.evaluate(() => { location.hash = "#/ronda/r2"; });
    await away.page.waitForFunction(() => (document.querySelector('input[data-k="putts"]') as HTMLInputElement).value === "50");
    await away.held[0].respond({ mark: { hole: 1, putts: 3, gir: true, drive: "fairway", rev: 6 }, applied: true, note: { putts: 4, gir: 1, fir: 1, updated_at: "2026-11-08T04:21:33.165Z" } });
    await delay(300);
    assert.equal(await away.putts(), "50");
    await away.page.evaluate(() => { location.hash = "#/ronda/r1"; });
    await away.page.waitForFunction(() => (document.querySelector('input[data-k="putts"]') as HTMLInputElement).value === "4");
    assert.equal(away.outside(), 0);
    await away.page.close();

    const reenter = await open();
    await reenter.page.click("#qputts button:nth-child(4)");
    for (let i = 0; i < 80 && reenter.held.length === 0; i++) await delay(25);
    await reenter.page.evaluate(() => { location.hash = "#/ronda/r2"; });
    await reenter.page.waitForFunction(() => (document.querySelector('input[data-k="putts"]') as HTMLInputElement).value === "50");
    await reenter.page.evaluate(() => { location.hash = "#/ronda/r1"; });
    await reenter.page.waitForFunction(() => (document.querySelector('input[data-k="putts"]') as HTMLInputElement).value === "32");
    await reenter.held[0].respond({ mark: { hole: 1, putts: 3, gir: true, drive: "fairway", rev: 6 }, applied: true, note: { putts: 4, gir: 1, fir: 1, updated_at: "2026-11-08T04:21:34.165Z" } });
    await reenter.page.waitForFunction(() => (document.querySelector('input[data-k="putts"]') as HTMLInputElement).value === "4", { timeout: 10_000 });
    await reenter.page.evaluate(() => { location.hash = "#/ronda/r2"; });
    await reenter.page.waitForFunction(() => (document.querySelector('input[data-k="putts"]') as HTMLInputElement).value === "50");
    assert.equal(reenter.outside(), 0);
    await reenter.page.close();

    const typed = await open();
    await typed.page.evaluate(() => {
      const input = document.querySelector('input[data-k="putts"]') as HTMLInputElement;
      input.focus();
      input.value = "6";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    for (let i = 0; i < 80 && typed.notes.length === 0; i++) await delay(25);
    assert.equal(typed.notes.length, 1);
    assert.equal(typed.notes[0].body.putts, "6");
    await typed.page.evaluate(() => { location.hash = "#/ronda/r2"; });
    await typed.page.waitForFunction(() => (document.querySelector('input[data-k="putts"]') as HTMLInputElement).value === "50");
    await typed.page.evaluate(() => { location.hash = "#/ronda/r1"; });
    await typed.page.waitForFunction(() => (document.querySelector('input[data-k="putts"]') as HTMLInputElement).value === "32");
    await typed.page.evaluate(() => {
      const input = document.querySelector('input[data-k="putts"]') as HTMLInputElement;
      input.focus();
      input.value = "9";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await typed.notes[0].respond({ note: { putts: 4, gir: 1, fir: 1, updated_at: "2026-11-08T04:21:35.165Z" } });
    await delay(300);
    assert.equal(await typed.putts(), "9");
    for (let i = 0; i < 80 && typed.notes.length < 2; i++) await delay(25);
    assert.equal(typed.notes.length, 2);
    assert.equal(typed.notes[1].body.putts, "9");
    assert.equal(typed.notes[1].body.gir, "10");
    assert.notEqual(typed.notes[1].body.putts, "50");
    await typed.page.evaluate(() => { location.hash = "#/ronda/r2"; });
    await typed.page.waitForFunction(() => (document.querySelector('input[data-k="putts"]') as HTMLInputElement).value === "50");
    await typed.notes[1].respond({ note: { putts: 4, gir: 1, fir: 1, updated_at: "2026-11-08T04:21:36.165Z" } });
    await delay(300);
    assert.equal(await typed.putts(), "50");
    await typed.page.evaluate(() => { location.hash = "#/ronda/r1"; });
    await typed.page.waitForFunction(() => (document.querySelector('input[data-k="putts"]') as HTMLInputElement).value === "4");
    assert.equal(typed.outside(), 0);
    await typed.page.close();
  } finally {
    await browser.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

const DDL = `
create schema if not exists quick_integrity;
create table if not exists quick_integrity.round_hole_mark (
  round_id uuid not null, user_id text not null, hole int not null, putts int, gir boolean, drive text, rev int not null, updated_at timestamptz not null default now(), primary key (round_id, hole)
);
create table if not exists quick_integrity.round_note (
  round_id uuid primary key, user_id text not null, putts int, gir int, fir int, notes text, updated_at timestamptz not null default now()
);`;

test("the total that commits after a wait replaces the total the screen already showed", { timeout: 60_000, skip: !CHROME || !local ? "chrome or local postgres is not available" : false }, async (t) => {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 4, connectionTimeoutMillis: 2000 });
  pool.on("error", () => {});
  const round = randomUUID();
  const user = "browser-order";
  let setup: PoolClient | null = null;
  try {
    setup = await pool.connect();
    await setup.query("set search_path to quick_integrity");
    for (const statement of DDL.split(";").map(part => part.trim()).filter(Boolean)) await setup.query(statement);
    await setup.query(`insert into round_note (round_id, user_id, putts, gir, fir, notes) values ($1,$2,32,10,8,'existente')`, [round, user]);
    await setup.query(HOLE_MARK_UPSERT, [round, user, 1, 2, true, "fairway", 5]);
    await setup.query(HOLE_MARK_UPSERT, [round, user, 2, 1, false, "left", 4]);
  } catch (e) {
    await setup?.release();
    await pool.end();
    return t.skip(`sin postgres aislado: ${e instanceof Error ? e.message : "error"}`);
  } finally {
    setup?.release();
  }

  let releaseHole: () => void = () => {};
  const holeGate = new Promise<void>(resolve => { releaseHole = resolve; });
  let holeOpen: () => void = () => {};
  const holeStarted = new Promise<void>(resolve => { holeOpen = resolve; });
  let txStart = 0;
  let noteAt = "";
  let markAt = "";
  let outside = 0;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (!url.pathname.startsWith("/api/")) {
      const file = url.pathname === "/" ? "/index.html" : url.pathname;
      try {
        const body = await readFile(new URL(file.slice(1), ROOT));
        res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end();
      }
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const posted = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown> : {};
    const send = (payload: unknown) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(payload));
    };
    if (url.pathname === "/api/data") {
      send({
        user: { name: "TEST", first_name: "TEST", pending_first_sync: false },
        player: { handicap_index: 12 },
        hi_history: [],
        rounds: [{ round_id: round, id: round, date: "2026-11-02", gross: 80, net: 75, valid_card: true, course_key: "c1", club_name: "Fixture", holes: [[1, 4, 4], [2, 4, 4]], putts: 32, gir: 10, fir: 8 }],
        courses: [{ key: "c1", course: "Fixture", label: "Fixture", club_name: "Fixture", par: 72, holes: [], tees: {} }],
        clubs: [],
        bag: [],
      });
      return;
    }
    if (url.pathname.endsWith("/hole-marks") && req.method === "GET") {
      const client = await pool.connect();
      try {
        await client.query("set search_path to quick_integrity");
        const rows = await client.query(`select hole, putts, gir, drive, rev from round_hole_mark where round_id=$1 order by hole`, [round]);
        send({ marks: rows.rows });
      } finally {
        client.release();
      }
      return;
    }
    if (url.pathname.endsWith("/hole-marks") && req.method === "PUT") {
      const client = await pool.connect();
      try {
        await client.query("set search_path to quick_integrity");
        await client.query("BEGIN");
        const started = await client.query(`select now() as tx`);
        txStart = new Date(started.rows[0].tx).getTime();
        holeOpen();
        await holeGate;
        const saved = await writeHoleMark((sql, params) => client.query(sql, params).then(result => result.rows), {
          roundId: round, userId: user, card, incoming: posted,
        });
        await client.query("COMMIT");
        markAt = String(saved.note?.updated_at || "");
        send({ mark: saved.mark, applied: saved.applied, conflict: saved.conflict, idempotent: saved.idempotent, note: saved.note });
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        res.writeHead(500);
        res.end(e instanceof Error ? e.message : "error");
      } finally {
        client.release();
      }
      return;
    }
    if (url.pathname.endsWith("/notes") && req.method === "PUT") {
      await holeStarted;
      const note = await withTransaction(run => writeAuthoritativeNote(run, {
        roundId: round, userId: user, card, client: notePatch(posted),
      }), async () => {
        const client = await pool.connect();
        await client.query("set search_path to quick_integrity");
        return client;
      });
      noteAt = String(note?.updated_at || "");
      send({ note });
      return;
    }
    const empty = url.pathname === "/api/weather/rounds" ? { rounds: {} } : url.pathname === "/api/tee-times" ? { tee_times: [], clubs: [] } : {};
    send(empty);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", () => resolve()));
  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const port = (server.address() as { port: number }).port;
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", async request => {
      const target = new URL(request.url());
      if (target.hostname !== "127.0.0.1") { outside += 1; await request.abort(); return; }
      await request.continue();
    });
    await page.goto(`http://127.0.0.1:${port}/#/ronda/${round}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("#qmsg")?.textContent === "Guardado en tu cuenta", { timeout: 10_000 });
    await page.click("#qputts button:nth-child(4)");
    await holeStarted;
    await page.evaluate(() => {
      const input = document.querySelector('input[data-k="putts"]') as HTMLInputElement;
      input.focus();
      input.value = "30";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.blur();
    });
    await page.waitForFunction(() => (document.querySelector('input[data-k="putts"]') as HTMLInputElement).value === "3", { timeout: 10_000 });
    releaseHole();
    await page.waitForFunction(() => (document.querySelector('input[data-k="putts"]') as HTMLInputElement).value === "4", { timeout: 10_000 });
    assert.ok(Date.parse(noteAt) > txStart);
    assert.ok(Date.parse(markAt) > Date.parse(noteAt));
    const stored = await pool.query(`select putts from quick_integrity.round_note where round_id=$1`, [round]);
    assert.equal(Number(stored.rows[0].putts), 4);
    assert.equal(outside, 0);
  } finally {
    releaseHole();
    await browser.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await pool.query(`delete from quick_integrity.round_hole_mark where round_id=$1`, [round]).catch(() => {});
    await pool.query(`delete from quick_integrity.round_note where round_id=$1`, [round]).catch(() => {});
    await pool.end();
  }
});
