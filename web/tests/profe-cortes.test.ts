/** Secuencia sintética: mano, temblor y un paneo. Como mucho una transición, y no cierra la cabeza. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const code = readFileSync(new URL("../public/profe-preview/cortes.js", import.meta.url), "utf8");
const ctx: { GolfletCortes?: { decideCuts: (samples: Sample[]) => { f: number; alta: boolean }[] } } = {};
(ctx as { globalThis: unknown }).globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(code, ctx);
const decideCuts = ctx.GolfletCortes!.decideCuts;

type Sample = { f: number; raw: number[]; cols: number; rows: number; hist: number[]; mean: number };

function sample(f: number, raw: number[]): Sample {
  const hist = new Array(16).fill(0);
  let sum = 0;
  for (const v of raw) {
    sum += v;
    hist[Math.min(15, Math.max(0, v) >> 4)]++;
  }
  for (let i = 0; i < 16; i++) hist[i] /= raw.length || 1;
  return { f, raw, cols: 6, rows: 8, hist, mean: sum / (raw.length || 1) };
}

function sceneA(shift: number) {
  const raw = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 6; x++) raw.push(x - shift >= 2 && x - shift <= 3 ? 64 : 102);
  }
  return raw;
}

function sceneB() {
  const raw = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 6; x++) raw.push(y >= 5 && y <= 6 ? 168 : 34);
  }
  return raw;
}

function withHand(raw: number[]) {
  const next = raw.slice();
  for (const [x, y] of [[4, 1], [5, 1], [4, 2], [5, 2]] as const) next[y * 6 + x] = 198;
  return next;
}

test("mano, temblor y paneo dejan como mucho una transición", () => {
  const samples: Sample[] = [];
  let f = 0;
  const push = (raw: number[]) => { samples.push(sample(f, raw)); f += 3; };
  for (let i = 0; i < 50; i++) {
    let raw = sceneA(i % 6 === 0 ? 1 : 0).map((v, k) => v + ((i + k) % 5) - 2);
    if (i >= 20 && i < 30) raw = withHand(raw);
    push(raw);
  }
  const start = sceneA(0);
  const end = sceneB();
  for (let i = 1; i <= 30; i++) {
    const t = i / 30;
    push(start.map((v, k) => v * (1 - t) + end[k] * t));
  }
  for (let i = 0; i < 18; i++) push(sceneB().map((v, k) => v + (i + k) % 3));
  const cuts = decideCuts(samples);
  assert.equal(cuts.length, 1, JSON.stringify(cuts));
  assert.equal(cuts[0].alta, false, JSON.stringify(cuts));
  const sec = cuts[0].f / 30;
  assert.ok(sec > 7.2 && sec < 9.6, JSON.stringify(cuts));
});

test("un corte seco de cuadro entero sí es firme", () => {
  const samples: Sample[] = [];
  let f = 0;
  const push = (raw: number[]) => { samples.push(sample(f, raw)); f += 3; };
  const navy = new Array(48).fill(28);
  const red = new Array(48).fill(86);
  for (let i = 0; i < 20; i++) push(navy);
  for (let i = 0; i < 20; i++) push(red);
  const cuts = decideCuts(samples);
  assert.equal(cuts.length, 1, JSON.stringify(cuts));
  assert.equal(cuts[0].alta, true);
  assert.ok(cuts[0].f > 40 && cuts[0].f < 80, JSON.stringify(cuts));
});
