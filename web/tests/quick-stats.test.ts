/** Isolated persistence. No database and no production write.
 *  Existing putts 32, GIR 10, FIR 8 stay when one hole is marked. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { accountView, applyMark, boundedCourseKey, mergeNote, noteFields, shouldCommit } from "../lib/quick-stats";

const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const holes = PARS.map((par, index) => ({ hole: index + 1, par }));
const totals = { putts: 32, gir: 10, fir: 8, notes: "existente" };
const oneGir = [{ hole: 1, putts: null, gir: true, drive: null, rev: 1 }];

type QuickJS = {
  noteFields: typeof noteFields;
  mergeNote: typeof mergeNote;
  applyMark: typeof applyMark;
  shouldCommit: typeof shouldCommit;
  accountView: typeof accountView;
};
const sandbox = { window: {} as { GolfletQuick: QuickJS } };
vm.runInNewContext(readFileSync(new URL("../public/quick-stats.js", import.meta.url), "utf8"), sandbox);
const js = sandbox.window.GolfletQuick;

test("one GIR yes does not replace putts 32, GIR 10 or FIR 8", () => {
  const fields = noteFields(oneGir, holes);
  assert.deepEqual(fields, {});
  assert.notDeepEqual(fields, { putts: "", gir: "1", fir: "" });
  assert.deepEqual(mergeNote(totals, fields), totals);
  assert.equal(JSON.stringify(js.noteFields(oneGir, holes)), JSON.stringify(fields));
  assert.equal(JSON.stringify(js.mergeNote(totals, fields)), JSON.stringify(totals));
});

test("a stale rev does not overwrite a newer hole or the round totals", () => {
  const first = applyMark(null, { hole: 1, gir: true, rev: 1 });
  const second = applyMark(first.mark, { hole: 1, gir: false, putts: 2, rev: 2 });
  const late = applyMark(second.mark, { hole: 1, gir: true, putts: "", fir: "", rev: 1 });
  assert.equal(first.applied, true);
  assert.equal(second.applied, true);
  assert.equal(late.applied, false);
  assert.equal(late.mark.gir, false);
  assert.equal(late.mark.putts, 2);
  assert.equal(late.mark.rev, 2);
  assert.equal(shouldCommit(1, 2, 1), false);
  assert.equal(shouldCommit(1, 2, 2), false);
  assert.equal(shouldCommit(2, 2, 2), true);
  assert.deepEqual(mergeNote(totals, noteFields([late.mark], holes)), totals);
  assert.equal(JSON.stringify(js.applyMark(second.mark, { hole: 1, gir: true, putts: "", fir: "", rev: 1 })), JSON.stringify({ mark: second.mark, applied: false }));
  assert.equal(js.shouldCommit(1, 2, 1), false);
  assert.equal(js.shouldCommit(2, 2, 2), true);
});

test("reload and the other view keep the account totals", () => {
  const saved = applyMark(null, { hole: 1, gir: true, rev: 1 }).mark;
  const again = accountView(totals, [saved], holes);
  assert.deepEqual(again.totals, totals);
  assert.deepEqual(again.fields, {});
  assert.equal(JSON.stringify(js.accountView(totals, [saved], holes)), JSON.stringify(again));
});

test("a finished stat is saved alone and the unfinished ones stay", () => {
  const marks = holes.map((hole, index) => ({ hole: hole.hole, putts: null, gir: index < 10, drive: null, rev: 3 }));
  const fields = noteFields(marks, holes);
  assert.deepEqual(fields, { gir: "10" });
  assert.deepEqual(mergeNote(totals, fields), { putts: 32, gir: 10, fir: 8, notes: "existente" });
  assert.equal(JSON.stringify(js.noteFields(marks, holes)), JSON.stringify(fields));
});

test("one fairway is not the FIR of the round", () => {
  const fields = noteFields([{ hole: 1, putts: null, gir: null, drive: "fairway", rev: 1 }], holes);
  assert.equal(fields.fir, undefined);
  assert.equal(Object.keys(fields).length, 0);
});

test("an iOS fairway value counts only when every non-par-3 is marked", () => {
  const marks = holes.filter(hole => hole.par !== 3).map(hole => ({ hole: hole.hole, putts: null, gir: null, drive: "hit", rev: 1 }));
  const fields = noteFields(marks, holes);
  assert.deepEqual(fields, { fir: String(marks.length) });
  const stored = applyMark(null, { hole: 1, drive: "hit", rev: 4 }).mark;
  assert.equal(stored.drive, "fairway");
});

test("a course key that is not clubId:name does not open the catalog", () => {
  assert.equal(boundedCourseKey("c1"), null);
  assert.equal(boundedCourseKey(""), null);
  assert.deepEqual(boundedCourseKey("12:Azul"), { clubId: "12", name: "Azul" });
});

test("the quick buttons do not build the wiping notes payload, and strategy is not stuck behind bearings", () => {
  const src = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  assert.equal(src.includes("putts: puttH.length"), false);
  assert.equal(src.includes("gir:'1'"), false);
  const bearings = src.slice(src.indexOf("async function holeBearings"), src.indexOf("async function fillTeePrep"));
  assert.match(bearings, /gpsForCourse/);
  assert.equal(bearings.includes("api('/api/gps/courses')"), false);
  const prep = src.slice(src.indexOf("async function fillTeePrep"), src.indexOf("function pickGpsCourse"));
  assert.match(prep, /Promise\.all\(\[weatherJob, stratJob\]\)/);
  const strategy = src.slice(src.indexOf("async function loadEstrategia"), src.indexOf("/* ---------- MI BOLSA"));
  assert.match(strategy, /gen !== VIEW_GEN/);
  assert.match(strategy, /dataset\.ck !== ck/);
  assert.match(src, /\/hole-marks/);
  assert.match(src, /shouldCommit/);
});
