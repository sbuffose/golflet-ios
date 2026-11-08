/* Generated from lib/recap-rules.ts by web-build/gen-recap-rules.mjs. Do not edit. */
"use strict";
var GolfletRecap = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // lib/recap-rules.ts
  var recap_rules_exports = {};
  __export(recap_rules_exports, {
    CATEGORIES: () => CATEGORIES,
    CATEGORY_LABEL: () => CATEGORY_LABEL,
    CLIENT_SOURCES: () => CLIENT_SOURCES,
    DEVICE_SOURCES: () => DEVICE_SOURCES,
    MAX_AUDIO_BYTES: () => MAX_AUDIO_BYTES,
    MIN_AUDIO_BYTES: () => MIN_AUDIO_BYTES,
    clientStructured: () => clientStructured,
    findHole: () => findHole,
    findHoles: () => findHoles,
    normalizeStructured: () => normalizeStructured,
    recurring: () => recurring,
    sniffAudio: () => sniffAudio,
    tagByRules: () => tagByRules
  });
  var CATEGORIES = ["salida", "approach", "juego_corto", "bunker", "putt", "estrategia", "otro"];
  var CATEGORY_LABEL = {
    salida: "Salida",
    approach: "Approach",
    juego_corto: "Juego corto",
    bunker: "Bunker",
    putt: "Putt",
    estrategia: "Estrategia / mental",
    otro: "Otro"
  };
  var MAX_AUDIO_BYTES = 4 * 1024 * 1024;
  var MIN_AUDIO_BYTES = 1024;
  function sniffAudio(b) {
    const s = (o, n) => String.fromCharCode(...b.slice(o, o + n));
    if (b.length >= 12 && s(4, 4) === "ftyp") return { mime: "audio/mp4", ext: "m4a" };
    if (s(0, 4) === "OggS") return { mime: "audio/ogg", ext: "ogg" };
    if (b[0] === 26 && b[1] === 69 && b[2] === 223 && b[3] === 163) return { mime: "audio/webm", ext: "webm" };
    if (s(0, 4) === "RIFF" && s(8, 4) === "WAVE") return { mime: "audio/wav", ext: "wav" };
    if (s(0, 3) === "ID3" || b[0] === 255 && (b[1] & 230) === 226) return { mime: "audio/mpeg", ext: "mp3" };
    if (b[0] === 255 && (b[1] & 246) === 240) return { error: "AAC sin contenedor (ADTS) no es compatible: grab\xE1 en .m4a (MPEG-4 AAC)." };
    return { error: "Formato de audio no reconocido. Us\xE1 m4a, webm, ogg, mp3 o wav." };
  }
  var clamp = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  var holeNum = (v) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 && n <= 18 ? n : null;
  };
  function normalizeStructured(x) {
    const cat = (c) => CATEGORIES.includes(String(c)) ? c : "otro";
    return {
      summary: clamp(x?.summary, 600),
      mistakes: (Array.isArray(x?.mistakes) ? x.mistakes : []).slice(0, 30).map((m) => typeof m === "string" ? { category: "otro", hole: null, text: clamp(m, 300) } : { category: cat(m?.category), hole: holeNum(m?.hole), text: clamp(m?.text, 300) }).filter((m) => m.text),
      positives: (Array.isArray(x?.positives) ? x.positives : []).slice(0, 20).map((p) => typeof p === "string" ? { hole: null, text: clamp(p, 300) } : { hole: holeNum(p?.hole), text: clamp(p?.text, 300) }).filter((p) => p.text)
    };
  }
  var NUM = { uno: 1, primero: 1, primer: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18 };
  var fold = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  function findHole(sentence) {
    const t = fold(sentence), words = Object.keys(NUM).join("|");
    const val = (x) => /^\d+$/.test(x) ? +x : NUM[x];
    const m = new RegExp(`\\bhoyo\\s+(?:(?:numero|nro\\.?|n)\\s+)?(\\d{1,2}|${words})\\b`).exec(t) || /\b(?:en el|del) (\d{1,2})\b(?!\s*(?:metros|yardas|yardas|golpes|putts?|%|m\b))/.exec(t);
    const v = m ? val(m[1]) : null;
    return v && v >= 1 && v <= 18 ? v : null;
  }
  function findHoles(sentence) {
    const first = findHole(sentence);
    if (!first) return [];
    const t = fold(sentence), out = /* @__PURE__ */ new Set([first]);
    for (const m of t.matchAll(/\b(?:hoyos?|en el|del|y (?:en )?el|y)\s+(\d{1,2})\b(?!\s*(?:metros|yardas|golpes|putts?|%|m\b))/g)) {
      const v = +m[1];
      if (v >= 1 && v <= 18) out.add(v);
    }
    return [...out];
  }
  var KW = [
    ["putt", /\b(putt?s?|putter|putee|emboc|green lento|green rapido|lectura|tres putts|3 putts)/],
    ["bunker", /\b(bunker|bunquer|arena|trampa)/],
    ["juego_corto", /\b(chip|pitch|flop|lob|alrededor del green|juego corto|wedge|sw\b|sand)/],
    ["salida", /\b(drive|driver|salida|tee\b|desde el tee|madera|fairway|slice|gancho|hook|ob\b|fuera de limites|out of bounds)/],
    ["approach", /\b(approach|aproach|hierro|hibrido|segundo tiro|tercer tiro|al green|green en regulacion|gir|corto al green|largo al green)/],
    ["estrategia", /\b(cabeza|mental|concentr|apur|decision|estrategia|nervio|ansie|enoj|calent|confian|paciencia)/]
  ];
  var NEG = /\b(mal|error|erre|falle|perdi|pifi|tope|toppe|gordo|fat|slice|gancho|hook|shank|socket|ob\b|fuera de limites|agua|doble|triple|bogey|corto|largo|no emboque|tres putts|3 putts|me fui|me apure|desastre|horrible|regale)/;
  var POS = /\b(bien|buen|birdie|aguila|eagle|emboque|salve|excelente|genial|solido|clave|par\b|recupere|mejor)/;
  function tagByRules(transcript) {
    const sentences = transcript.replace(/\s+/g, " ").split(new RegExp("(?<=[.!?;])\\s+|\\s+(?:pero|aunque|despues|despu\xE9s|luego)\\s+|,?\\s+y\\s+(?=en el (?:hoyo )?\\d)|,\\s*(?=en el (?:hoyo )?\\d)", "i")).map((s) => s.trim()).filter((s) => s.length > 3);
    const mistakes = [], positives = [];
    let carry = [], last = null;
    const bare = (t) => !NEG.test(t) && !POS.test(t);
    sentences.forEach((s, i) => {
      const t = fold(s), own = findHoles(s), holes = [.../* @__PURE__ */ new Set([...carry, ...own])], hole = holes[0] ?? null;
      const neg = NEG.test(t), pos = POS.test(t);
      if (neg) {
        const category = KW.find(([, re]) => re.test(t))?.[0] ?? "otro";
        const items = (holes.length ? holes : [null]).map((h) => ({ category, hole: h, text: clamp(s, 300) }));
        mistakes.push(...items);
        last = { kind: "neg", items };
        carry = [];
      } else if (pos) {
        const p = { hole, text: clamp(s, 300) };
        positives.push(p);
        last = { kind: "pos", items: [p] };
        carry = [];
      } else if (own.length && t.split(" ").length <= 4) {
        const next = sentences[i + 1] ? fold(sentences[i + 1]) : null;
        if (next && !bare(next)) carry = holes;
        else if (last?.kind === "neg") {
          const base = last.items[0];
          for (const h of own) if (!mistakes.some((m) => m.hole === h && m.text === base.text)) mistakes.push({ ...base, hole: h });
          carry = [];
        } else carry = [];
      } else carry = [];
    });
    const first = sentences.slice(0, 2).join(" ");
    return { summary: clamp(first, 280), mistakes, positives };
  }
  function recurring(rows, lastN = 10) {
    const recent = rows.slice().sort((a, b) => a.date < b.date ? 1 : -1).slice(0, lastN);
    const of = recent.length;
    const by = /* @__PURE__ */ new Map();
    for (const r of recent) for (const m of r.mistakes || []) {
      const e = by.get(m.category) || { rounds: /* @__PURE__ */ new Set(), mentions: 0, holes: /* @__PURE__ */ new Map(), examples: [] };
      e.rounds.add(r.round_key);
      e.mentions++;
      if (m.hole) e.holes.set(m.hole, (e.holes.get(m.hole) || 0) + 1);
      if (e.examples.length < 3) e.examples.push({ date: r.date, hole: m.hole, text: m.text });
      by.set(m.category, e);
    }
    const items = [...by.entries()].map(([category, e]) => ({
      category,
      label: CATEGORY_LABEL[category],
      rounds: e.rounds.size,
      of,
      share: of ? Math.round(e.rounds.size / of * 100) / 100 : 0,
      mentions: e.mentions,
      holes: [...e.holes.entries()].sort((a, b) => b[1] - a[1]).map(([hole, n]) => ({ hole, mentions: n })),
      text: `${CATEGORY_LABEL[category]}: en ${e.rounds.size} de ${of} rondas`,
      examples: e.examples
    })).sort((a, b) => b.rounds - a.rounds || b.mentions - a.mentions);
    return { rounds_considered: of, last_n: lastN, items };
  }
  var CLIENT_SOURCES = ["ios_on_device", "web_mic", "manual"];
  var DEVICE_SOURCES = ["ios_on_device", "web_mic"];
  function clientStructured(b) {
    const has = b && (b.summary != null || Array.isArray(b.mistakes) || Array.isArray(b.positives) || DEVICE_SOURCES.includes(String(b.source)));
    if (!has) return null;
    const source = CLIENT_SOURCES.includes(String(b.source)) ? String(b.source) : "manual";
    const model = b.model ? String(b.model).replace(/[^\w .:+\/-]/g, "").slice(0, 80) || null : source === "ios_on_device" ? "apple-on-device" : source === "web_mic" ? "web-speech-api" : null;
    const d = Number(b.duration_s);
    return { data: normalizeStructured(b), source, model, duration: Number.isFinite(d) && d > 0 && d < 3600 ? Math.round(d) : null };
  }
  return __toCommonJS(recap_rules_exports);
})();
