// Bundles lib/recap-rules.ts (the same keyword tagger the server uses) into public/recap-rules.js for the web mic recap
// (structured in the browser; no server AI). Runs on prebuild; the output is also committed.
let buildSync;
try { ({ buildSync } = await import("esbuild")); } catch { console.log("recap-rules.js: esbuild not available, keeping the committed file"); process.exit(0); }
const r = buildSync({ entryPoints: [new URL("../lib/recap-rules.ts", import.meta.url).pathname], bundle: true, format: "iife", globalName: "GolfletRecap",
  target: ["chrome100", "safari16", "edge100", "firefox110"], minify: false, write: false, legalComments: "none" });
const { writeFileSync } = await import("node:fs");
writeFileSync(new URL("../public/recap-rules.js", import.meta.url), "/* Generated from lib/recap-rules.ts by web-build/gen-recap-rules.mjs. Do not edit. */\n" + r.outputFiles[0].text);
console.log("recap-rules.js:", r.outputFiles[0].text.length, "bytes");
