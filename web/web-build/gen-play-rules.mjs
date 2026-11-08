// Bundles lib/play-rules.ts into public/play-rules.js (same rules the server uses).
import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";
const src = readFileSync(new URL("../lib/play-rules.ts", import.meta.url), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, strict: false } }).outputText;
const out = `/* Generated from lib/play-rules.ts by web-build/gen-play-rules.mjs. Do not edit. */\n(function (root) {\n  var exports = {};\n${js}\n  root.GolfletRules = exports;\n  if (typeof module === "object" && module.exports) module.exports = exports;\n})(typeof globalThis !== "undefined" ? globalThis : this);\n`;
writeFileSync(new URL("../public/play-rules.js", import.meta.url), out);
console.log("play-rules.js", out.length, "bytes");
