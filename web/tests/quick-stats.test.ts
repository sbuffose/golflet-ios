/** Isolated persistence. No database and no production write.
 *  Existing putts 32, GIR 10, FIR 8 stay when one hole is marked. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { HttpError } from "../lib/http-error";
import {
  accountView, applyMark, applyPresentColumns, boundedCourseKey, cardHoles, HOLE_MARK_UPSERT, mergeNote,
  absorbAccountMarks, acceptSaved, mergeAccountHole, noteAuthority, noteFields, noteIsNewer, notePatch, NOTE_UPSERT, phaseAfter, planHoleSend, projectBoard, saveMessage, seedHoleRevs, sendDecision, settleWrite, shouldCommit,
} from "../lib/quick-stats";

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
  seedHoleRevs: typeof seedHoleRevs;
  planHoleSend: typeof planHoleSend;
  phaseAfter: typeof phaseAfter;
  saveMessage: typeof saveMessage;
  absorbAccountMarks: typeof absorbAccountMarks;
  mergeAccountHole: typeof mergeAccountHole;
  sendDecision: typeof sendDecision;
  projectBoard: typeof projectBoard;
  acceptSaved: typeof acceptSaved;
  noteIsNewer: (previous: string | null | undefined, next: string | null | undefined) => boolean;
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
  const first = applyMark(null, { hole: 1, gir: true, rev: 1 }, holes);
  const second = applyMark(first.mark, { hole: 1, gir: false, putts: 2, rev: 2 }, holes);
  const late = applyMark(second.mark, { hole: 1, gir: true, putts: "", fir: "", rev: 1 }, holes);
  assert.equal(first.applied, true);
  assert.equal(second.applied, true);
  assert.equal(late.applied, false);
  assert.equal(late.conflict, "stale");
  assert.equal(late.mark.gir, false);
  assert.equal(late.mark.putts, 2);
  assert.equal(late.mark.rev, 2);
  assert.equal(shouldCommit(1, 2, 1), false);
  assert.equal(shouldCommit(1, 2, 2), false);
  assert.equal(shouldCommit(2, 2, 2), true);
  assert.deepEqual(mergeNote(totals, noteFields([late.mark], holes)), totals);
  assert.equal(JSON.stringify(js.applyMark(second.mark, { hole: 1, gir: true, putts: "", fir: "", rev: 1 }, holes)), JSON.stringify(late));
  assert.equal(js.shouldCommit(1, 2, 1), false);
  assert.equal(js.shouldCommit(2, 2, 2), true);
});

test("reload and the other view keep the account totals", () => {
  const saved = applyMark(null, { hole: 1, gir: true, rev: 1 }, holes).mark;
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
  const stored = applyMark(null, { hole: 1, drive: "hit", rev: 4 }, holes).mark;
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
  const quick = src.slice(src.indexOf("function bindQuick"), src.indexOf("const saveNote"));
  assert.match(quick, /await seedPromise/);
  assert.match(quick, /projectBoard/);
  assert.match(quick, /acceptSaved/);
  assert.match(quick, /noteIsNewer/);
  assert.match(quick, /acceptRoundNote\(id, saved\.note\)/);
  assert.match(src, /function acceptRoundNote/);
  assert.match(src, /activeElement === input/);
  assert.match(src, /function releaseNoteEdit/);
  assert.equal(quick.includes("noteFields(Q.projectBoard"), false);
  assert.equal(quick.includes("/notes"), false);
  assert.equal(quick.includes("if (!rows.some"), false);
  assert.match(readFileSync(new URL("../public/quick-stats.js", import.meta.url), "utf8"), /function absorbAccountMarks/);
  assert.match(quick, /sendDecision\(seeded, box\.isConnected\)/);
  assert.match(quick, /if \(!box\.isConnected\) return/);
  assert.match(quick, /planHoleSend/);
  assert.match(quick, /phaseAfter/);
  assert.match(quick, /retryLoad/);
  assert.match(quick, /id="qretry"|#qretry/);
  assert.equal(quick.includes("if (gen === 0)"), false);
  assert.equal(quick.includes("rev: mine"), false);
  assert.equal(quick.includes("latest"), false);
  assert.equal(quick.includes("textContent !== 'Guardando"), false);
  const marksRoute = readFileSync(new URL("../app/api/rounds/[id]/hole-marks/route.ts", import.meta.url), "utf8");
  const notesRoute = readFileSync(new URL("../app/api/rounds/[id]/notes/route.ts", import.meta.url), "utf8");
  assert.equal(marksRoute.includes("delete from"), false);
  assert.match(marksRoute, /cardHoles\(round\.holes\)/);
  assert.match(marksRoute, /withTransaction/);
  assert.equal(notesRoute.includes("select putts"), false);
  assert.match(notesRoute, /writeAuthoritativeNote/);
  assert.match(notesRoute, /isUndefinedTable/);
  assert.match(notesRoute, /round_hole_mark/);
  assert.match(marksRoute, /writeHoleMark/);
  assert.match(readFileSync(new URL("../lib/quick-stats.ts", import.meta.url), "utf8"), /pg_advisory_xact_lock/);
  assert.match(HOLE_MARK_UPSERT, /round_hole_mark\.rev < excluded\.rev/);
  assert.equal(HOLE_MARK_UPSERT.includes("<="), false);
  assert.match(NOTE_UPSERT, /case when \$8 then excluded\.gir else round_note\.gir end/);
  const migration = readFileSync(new URL("../db/migrations/0044_round_hole_mark.sql", import.meta.url));
  assert.equal(createHash("sha256").update(migration).digest("hex"), "b6ffd94559ee8393c0ee0275623583a79cbafbf7a778486ac10e4c03e4b35dac");
});

test("a tap before the account read keeps untouched GIR and drive, and a failed read or a left screen does not send", () => {
  const account = [{ hole: 1, putts: 2, gir: true, drive: "fairway", rev: 5 }];
  const early = { hole: 1, putts: 3, gir: null, drive: null, touched: { putts: true, gir: false, drive: false } };
  const absorbed = absorbAccountMarks(account, [early]);
  const stored = { hole: 1, putts: 2, gir: true, drive: "fairway", rev: 5 };
  assert.deepEqual(absorbed.holes[0], { hole: 1, putts: 3, gir: true, drive: "fairway", rev: 6 });
  assert.notDeepEqual(absorbed.holes[0], { hole: 1, putts: 3, gir: null, drive: null, rev: 6 });
  const wiped = applyMark(stored, { hole: 1, putts: 3, gir: null, drive: null, rev: 6 }, holes);
  assert.equal(wiped.applied, true);
  assert.equal(wiped.mark.gir, null);
  assert.equal(wiped.mark.drive, null);
  const kept = applyMark(stored, absorbed.holes[0], holes);
  assert.equal(kept.applied, true);
  assert.equal(kept.mark.putts, 3);
  assert.equal(kept.mark.gir, true);
  assert.equal(kept.mark.drive, "fairway");
  assert.equal(kept.mark.rev, 6);
  assert.deepEqual(noteFields([kept.mark], holes), {});
  const cleared = mergeAccountHole(stored, { hole: 1, putts: 2, gir: null, drive: "fairway", touched: { putts: false, gir: true, drive: false } });
  assert.deepEqual(cleared, { hole: 1, putts: 2, gir: null, drive: "fairway" });
  assert.equal(sendDecision(false, true), "hold");
  assert.equal(sendDecision(true, false), "hold");
  assert.equal(sendDecision(true, true), "send");
  assert.equal(JSON.stringify(js.absorbAccountMarks(account, [early])), JSON.stringify(absorbed));
  assert.equal(JSON.stringify(js.mergeAccountHole(stored, early)), JSON.stringify(mergeAccountHole(stored, early)));
  assert.equal(js.sendDecision(false, true), "hold");
  assert.equal(js.sendDecision(true, false), "hold");
  assert.equal(js.sendDecision(true, true), "send");
});

test("a stale board does not choose the total, zero is a total, and a missing hole is not zero", () => {
  const card = [{ hole: 1, par: 4 }, { hole: 2, par: 4 }];
  const marks = [
    { hole: 1, putts: 3, gir: true, drive: "fairway", rev: 6 },
    { hole: 2, putts: 4, gir: false, drive: "left", rev: 5 },
  ];
  const stale = notePatch({ putts: "6", gir: "1", fir: "1" });
  const decided = noteAuthority(marks, card, stale);
  assert.equal(decided.putts, 7);
  assert.equal(decided.gir, 1);
  assert.equal(decided.fir, 1);
  assert.equal(decided.puttsPresent, true);
  const partial = noteAuthority([marks[0]], card, stale);
  assert.equal(partial.puttsPresent, false);
  assert.equal(partial.girPresent, false);
  assert.equal(partial.firPresent, false);
  const zeros = noteAuthority([
    { hole: 1, putts: 0, gir: false, drive: "left", rev: 2 },
    { hole: 2, putts: 0, gir: false, drive: "right", rev: 2 },
  ], card, notePatch({}));
  assert.equal(zeros.putts, 0);
  assert.equal(zeros.gir, 0);
  assert.equal(zeros.fir, 0);
  const manual = noteAuthority([], card, notePatch({ putts: "32", gir: "", fir: "8" }));
  assert.equal(manual.putts, 32);
  assert.equal(manual.gir, null);
  assert.equal(manual.girPresent, true);
  assert.equal(manual.fir, 8);
  assert.equal(noteIsNewer("2026-11-08T03:00:01.000Z", "2026-11-08T03:00:00.000Z"), false);
  assert.equal(noteIsNewer("2026-11-08T03:00:00.000Z", "2026-11-08T03:00:01.000Z"), true);
  assert.equal(js.noteIsNewer("2026-11-08T03:00:01.000Z", "2026-11-08T03:00:00.000Z"), false);
});

test("a stale cached hole does not enter the total, and the next edit uses the saved rev", () => {
  const account = [
    { hole: 1, putts: 2, gir: true, drive: "fairway", rev: 5 },
    { hole: 2, putts: 1, gir: false, drive: "left", rev: 4 },
  ];
  const cache = [{ hole: 2, putts: 4, gir: true, drive: "fairway" }];
  const early = { hole: 1, putts: 3, gir: null, drive: null, touched: { putts: true, gir: false, drive: false } };
  const card = [{ hole: 1, par: 4 }, { hole: 2, par: 4 }];
  const board = projectBoard(account, [early]);
  assert.deepEqual(board.rows.find(row => row.hole === 1), { hole: 1, putts: 3, gir: true, drive: "fairway", rev: 6 });
  assert.deepEqual(board.rows.find(row => row.hole === 2), { hole: 2, putts: 1, gir: false, drive: "left", rev: 4 });
  assert.equal(board.rows.some(row => row.putts === cache[0].putts && row.gir === true && row.hole === 2), false);
  const fields = noteFields(board.rows, card);
  assert.deepEqual(fields, { putts: "4", gir: "1", fir: "1" });
  assert.notDeepEqual(fields, { putts: "7", gir: "2", fir: "2" });
  const saved = acceptSaved(account, { hole: 1, putts: 3, gir: true, drive: "fairway", rev: 6 });
  const second = { hole: 1, putts: null, gir: false, drive: null, touched: { putts: false, gir: true, drive: false } };
  const next = projectBoard(saved, [second]);
  assert.deepEqual(next.rows.find(row => row.hole === 1), { hole: 1, putts: 3, gir: false, drive: "fairway", rev: 7 });
  assert.deepEqual(noteFields(next.rows, card), { putts: "4", gir: "0", fir: "1" });
  assert.equal(JSON.stringify(js.projectBoard(account, [early])), JSON.stringify(board));
  assert.equal(JSON.stringify(js.acceptSaved(account, saved[0])), JSON.stringify(saved));
  assert.equal(JSON.stringify(js.noteFields(board.rows, card)), JSON.stringify(fields));
});

test("reloading rev 5 sends rev 6, and a rejected rev 1 is a conflict rather than Guardando", () => {
  const seeded = seedHoleRevs([{ hole: 1, rev: 5 }]);
  assert.equal(seeded["1"], 5);
  assert.equal(planHoleSend(seeded, 1, 0), 6);
  assert.equal(planHoleSend(seeded, 1, 6), 6);
  assert.equal(js.planHoleSend(seeded, 1, 0), 6);
  assert.equal(js.planHoleSend(seeded, 1, 6), 6);
  const phase = phaseAfter(1, { applied: false, conflict: "stale", mark: { rev: 5 } });
  assert.equal(phase, "conflict");
  assert.equal(saveMessage(phase).includes("Guardando"), false);
  assert.match(saveMessage(phase), /reintentar/i);
  assert.equal(js.phaseAfter(1, { applied: false, conflict: "stale", mark: { rev: 5 } }), "conflict");
  assert.equal(js.saveMessage(js.phaseAfter(1, { applied: false, conflict: "stale", mark: { rev: 5 } })).includes("Guardando"), false);
});

test("clearing a hole keeps the rev, so an older write cannot bring the value back", () => {
  const marked = applyMark(null, { hole: 1, gir: true, rev: 5 }, holes).mark;
  const cleared = applyMark(marked, { hole: 1, putts: null, gir: null, drive: null, rev: 6 }, holes);
  assert.equal(cleared.applied, true);
  assert.equal(cleared.mark.gir, null);
  assert.equal(cleared.mark.rev, 6);
  const late = applyMark(cleared.mark, { hole: 1, gir: true, rev: 5 }, holes);
  assert.equal(late.applied, false);
  assert.equal(late.conflict, "stale");
  assert.equal(late.mark.gir, null);
  assert.equal(late.mark.rev, 6);
  const settled = settleWrite(cleared.mark, { hole: 1, putts: null, gir: true, drive: null, rev: 5 });
  assert.equal(settled.conflict, "stale");
  assert.equal(settled.mark.rev, 6);
  assert.equal(JSON.stringify(js.applyMark(cleared.mark, { hole: 1, gir: true, rev: 5 }, holes)), JSON.stringify(late));
});

test("two devices with the same rev and different payloads conflict, and the same payload retries", () => {
  const base = applyMark(null, { hole: 1, gir: true, rev: 5 }, holes).mark;
  const first = applyMark(base, { hole: 1, gir: false, putts: null, drive: null, rev: 6 }, holes);
  const second = applyMark(first.mark, { hole: 1, gir: true, putts: 2, drive: null, rev: 6 }, holes);
  assert.equal(first.applied, true);
  assert.equal(first.conflict, null);
  assert.equal(second.applied, false);
  assert.equal(second.conflict, "revision");
  assert.equal(second.mark.gir, false);
  assert.equal(second.mark.putts, null);
  assert.equal(second.mark.rev, 6);
  const retry = applyMark(first.mark, { hole: 1, gir: false, putts: null, drive: null, rev: 6 }, holes);
  assert.equal(retry.applied, true);
  assert.equal(retry.idempotent, true);
  assert.equal(retry.conflict, null);
  assert.equal(retry.mark.gir, false);
  const raced = settleWrite(first.mark, { hole: 1, putts: 2, gir: true, drive: null, rev: 6 });
  assert.equal(raced.conflict, "revision");
  assert.equal(raced.mark.gir, false);
  assert.equal(JSON.stringify(js.applyMark(first.mark, { hole: 1, gir: true, putts: 2, drive: null, rev: 6 }, holes)), JSON.stringify(second));
  assert.equal(js.applyMark(first.mark, { hole: 1, gir: false, putts: null, drive: null, rev: 6 }, holes).idempotent, true);
});

test("a GIR-only note and a putts-only note keep both columns, in either order", () => {
  const start = { putts: 32, gir: 10, fir: 8, notes: "existente" };
  const girOnly = notePatch({ gir: "11" });
  const puttsOnly = notePatch({ putts: "33" });
  assert.equal(girOnly.girPresent, true);
  assert.equal(girOnly.puttsPresent, false);
  assert.equal(puttsOnly.puttsPresent, true);
  assert.equal(puttsOnly.girPresent, false);
  const left = applyPresentColumns(applyPresentColumns(start, girOnly), puttsOnly);
  const right = applyPresentColumns(applyPresentColumns(start, puttsOnly), girOnly);
  assert.deepEqual(left, { putts: 33, gir: 11, fir: 8, notes: "existente" });
  assert.deepEqual(right, left);
  assert.deepEqual(mergeNote(start, { gir: "11" }), { putts: 32, gir: 11, fir: 8, notes: "existente" });
});

test("a 9-hole card does not accept hole 10, and a par 3 does not accept a drive", () => {
  const nine = [4, 4, 3, 5, 4, 4, 3, 4, 5].map((par, index) => ({ hole: index + 1, par }));
  assert.equal(cardHoles([[1, 4, 4], [2, 3, 3], [3, 5, 5]]).map(h => h.hole).join(","), "1,2,3");
  assert.throws(() => applyMark(null, { hole: 10, gir: true, rev: 1 }, nine), (error: unknown) => error instanceof HttpError && error.status === 404);
  assert.throws(() => applyMark(null, { hole: 3, drive: "fairway", rev: 1 }, nine), (error: unknown) => error instanceof HttpError && error.status === 400);
  assert.equal(applyMark(null, { hole: 3, gir: true, drive: null, rev: 1 }, nine).applied, true);
  assert.equal(applyMark(null, { hole: 1, drive: "fairway", rev: 1 }, nine).mark.drive, "fairway");
  assert.throws(() => js.applyMark(null, { hole: 10, gir: true, rev: 1 }, nine), /no está en la tarjeta/);
  assert.throws(() => js.applyMark(null, { hole: 3, drive: "left", rev: 1 }, nine), /par 3/);
  const done = nine.map(hole => ({ hole: hole.hole, putts: 2, gir: true, drive: hole.par === 3 ? null : "fairway", rev: 1 }));
  assert.deepEqual(noteFields(done, nine), { putts: "18", gir: "9", fir: "7" });
  assert.deepEqual(noteFields([done[0]], nine), {});
  assert.equal(JSON.stringify(js.noteFields(done, nine)), JSON.stringify(noteFields(done, nine)));
});
