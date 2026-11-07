// t260u: bundles lib/match-core.ts (match-play strokes, status, history) into public/match-core.js. Runs on prebuild; the output is also committed.
let buildSync;
try { ({ buildSync } = await import("esbuild")); } catch { console.log("match-core.js: esbuild not available, keeping the committed file"); process.exit(0); }
const r = buildSync({ entryPoints: [new URL("../lib/match-core.ts", import.meta.url).pathname], bundle: true, format: "iife", globalName: "GolfletMatchCore",
  target: ["chrome100", "safari16", "edge100", "firefox110"], minify: false, write: false, legalComments: "none" });
const { writeFileSync } = await import("node:fs");
writeFileSync(new URL("../public/match-core.js", import.meta.url), "/* Generated from lib/match-core.ts by web-build/gen-match-core.mjs. Do not edit. */\n" + r.outputFiles[0].text);
console.log("match-core.js:", r.outputFiles[0].text.length, "bytes");
