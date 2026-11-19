import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("el clima de la ronda queda antes de las estadísticas", async () => {
  const src = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const start = src.indexOf("function sRonda");
  const end = src.indexOf("function sDif");
  const body = src.slice(start, end);
  const weather = body.indexOf('id="rwx"');
  const stats = body.indexOf("Estadísticas de la ronda");
  assert.ok(weather > 0 && stats > weather, "rwx tiene que estar arriba de las estadísticas");
  assert.equal(body.indexOf('id="rwx"'), body.lastIndexOf('id="rwx"'));
  assert.match(src, /Open-Meteo histórico\./);
});
