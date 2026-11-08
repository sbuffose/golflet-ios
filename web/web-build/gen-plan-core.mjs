// Bundles lib/plan-core.ts (the wind model, dispersion and planner geometry the server uses) into public/plan-core.js
// for the "Preparar ronda" planner. Runs on prebuild; the output is also committed.
let buildSync;
try { ({ buildSync } = await import("esbuild")); } catch { console.log("plan-core.js: esbuild not available, keeping the committed file"); process.exit(0); }
const r = buildSync({ entryPoints: [new URL("../lib/plan-browser.ts", import.meta.url).pathname], bundle: true, format: "iife", globalName: "GolfletPlanCore",
  target: ["chrome100", "safari16", "edge100", "firefox110"], minify: false, write: false, legalComments: "none" });
const { writeFileSync } = await import("node:fs");
writeFileSync(new URL("../public/plan-core.js", import.meta.url), "/* Generated from lib/plan-browser.ts (plan-core + torneo-core + plan-suggest) by web-build/gen-plan-core.mjs. Do not edit. */\n" + r.outputFiles[0].text);
console.log("plan-core.js:", r.outputFiles[0].text.length, "bytes");
