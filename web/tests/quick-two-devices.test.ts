/** TEST-ONLY. Two browsers, one local Postgres. External hosts are aborted.
 *  The total is the transaction's, not the snapshot either device loaded. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import test from "node:test";
import { Pool, type PoolClient } from "pg";
import { HOLE_MARK_UPSERT, writeHoleMark, type HoleRef } from "../lib/quick-stats";

const CHROME = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find(p => existsSync(p));
const ROOT = new URL("../public/", import.meta.url);
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".png": "image/png" };
const TEST_DATABASE_URL = process.env.GOLFLET_TEST_DATABASE_URL || "postgres://golflet_test:golflet_test@127.0.0.1:5432/golflet_scorecard_test";
const local = /@(127\.0\.0\.1|localhost)(:|\/)/.test(TEST_DATABASE_URL);
const card: HoleRef[] = [{ hole: 1, par: 4 }, { hole: 2, par: 4 }];
const DDL = `
create schema if not exists quick_integrity;
create table if not exists quick_integrity.round_hole_mark (
  round_id uuid not null, user_id text not null, hole int not null, putts int, gir boolean, drive text, rev int not null, updated_at timestamptz not null default now(), primary key (round_id, hole)
);
create table if not exists quick_integrity.round_note (
  round_id uuid primary key, user_id text not null, putts int, gir int, fir int, notes text, updated_at timestamptz not null default now()
);`;

test("two browsers save different holes and the stored total is the sum of the marks", { timeout: 60_000, skip: !CHROME || !local ? "chrome or local postgres is not available" : false }, async (t) => {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 4, connectionTimeoutMillis: 2000 });
  pool.on("error", () => {});
  const round = randomUUID();
  const user = "browser-two";
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

  const fixture = {
    user: { name: "TEST", first_name: "TEST", pending_first_sync: false },
    player: { handicap_index: 12 },
    hi_history: [],
    rounds: [{ round_id: round, id: round, date: "2026-11-02", gross: 80, net: 75, valid_card: true, course_key: "c1", club_name: "Fixture", holes: [[1, 4, 4], [2, 4, 4]], putts: 32, gir: 10, fir: 8 }],
    courses: [{ key: "c1", course: "Fixture", label: "Fixture", club_name: "Fixture", par: 72, holes: [], tees: {} }],
    clubs: [],
    bag: [],
  };
  let releaseLate: () => void = () => {};
  const late = new Promise<void>(resolve => { releaseLate = resolve; });
  let heldFirst = false;
  let notes = 0;
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
    const client = await pool.connect();
    try {
      await client.query("set search_path to quick_integrity");
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const posted = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown> : {};
      if (url.pathname === "/api/data") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(fixture));
        return;
      }
      if (url.pathname.endsWith("/hole-marks") && req.method === "GET") {
        const rows = await client.query(`select hole, putts, gir, drive, rev from round_hole_mark where round_id=$1 order by hole`, [round]);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ marks: rows.rows }));
        return;
      }
      if (url.pathname.endsWith("/hole-marks") && req.method === "PUT") {
        await client.query("BEGIN");
        const saved = await writeHoleMark((sql, params) => client.query(sql, params).then(result => result.rows), {
          roundId: round, userId: user, card, incoming: posted,
        });
        await client.query("COMMIT");
        const payload = JSON.stringify({ mark: saved.mark, applied: saved.applied, conflict: saved.conflict, idempotent: saved.idempotent, note: saved.note });
        const status = saved.conflict ? 409 : 200;
        if (!heldFirst && Number(posted.hole) === 1) {
          heldFirst = true;
          await late;
        }
        res.writeHead(status, { "content-type": "application/json" });
        res.end(payload);
        return;
      }
      if (url.pathname.endsWith("/notes")) notes += 1;
      const empty = url.pathname === "/api/weather/rounds" ? { rounds: {} } : url.pathname === "/api/tee-times" ? { tee_times: [], clubs: [] } : {};
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(empty));
    } finally {
      client.release();
    }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", () => resolve()));
  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const contexts = [];
  try {
    const port = (server.address() as { port: number }).port;
    const open = async () => {
      const context = await browser.createBrowserContext();
      contexts.push(context);
      const page = await context.newPage();
      await page.setRequestInterception(true);
      page.on("request", async request => {
        const target = new URL(request.url());
        if (target.hostname !== "127.0.0.1") { outside += 1; await request.abort(); return; }
        await request.continue();
      });
      await page.goto(`http://127.0.0.1:${port}/#/ronda/${round}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.querySelector("#qmsg")?.textContent === "Guardado en tu cuenta", { timeout: 10_000 });
      return page;
    };
    const first = await open();
    const second = await open();
    const firstSave = first.click("#qputts button:nth-child(4)");
    for (let i = 0; i < 40 && !heldFirst; i++) await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(heldFirst, true);
    await second.click('#qstat button[data-qh="1"]');
    await second.waitForFunction(() => document.querySelector("#qhole")?.textContent === "Hoyo 2");
    await second.click("#qputts button:nth-child(5)");
    await second.waitForFunction(() => document.querySelector("#qmsg")?.textContent === "Guardado en tu cuenta", { timeout: 10_000 });
    const storedEarly = await pool.query(`select putts from quick_integrity.round_note where round_id=$1`, [round]);
    assert.equal(Number(storedEarly.rows[0].putts), 7);
    releaseLate();
    await firstSave;
    await new Promise(resolve => setTimeout(resolve, 300));
    const stored = await pool.query(`select putts, gir, fir, notes from quick_integrity.round_note where round_id=$1`, [round]);
    const marks = await pool.query(`select hole, putts, rev from quick_integrity.round_hole_mark where round_id=$1 order by hole`, [round]);
    assert.deepEqual(marks.rows.map(row => ({ hole: Number(row.hole), putts: Number(row.putts), rev: Number(row.rev) })), [
      { hole: 1, putts: 3, rev: 6 },
      { hole: 2, putts: 4, rev: 5 },
    ]);
    assert.equal(Number(stored.rows[0].putts), 7);
    assert.equal(Number(stored.rows[0].gir), 1);
    assert.equal(Number(stored.rows[0].fir), 1);
    assert.equal(stored.rows[0].notes, "existente");
    assert.equal(notes, 0);
    assert.equal(outside, 0);
  } finally {
    await browser.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await pool.query(`delete from quick_integrity.round_hole_mark where round_id=$1`, [round]).catch(() => {});
    await pool.query(`delete from quick_integrity.round_note where round_id=$1`, [round]).catch(() => {});
    await pool.end();
  }
});
