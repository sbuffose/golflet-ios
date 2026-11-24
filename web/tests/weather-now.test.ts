/** Current wind: Open-Meteo, then MET Norway. No invented numbers. */
import assert from "node:assert/strict";
import test from "node:test";
import { currentWeather, type NowReading } from "../lib/weather-now";
import { windAbsolute, windArrow, windCardinal, windFace, windSide } from "../lib/play-rules";

const openBody = {
  current: { time: "2026-11-22T18:15", wind_speed_10m: 12.3, wind_direction_10m: 241, wind_gusts_10m: 31.3, temperature_2m: 25.6, precipitation: 0 },
};
const metBody = {
  properties: { timeseries: [{ time: "2026-11-22T21:00:00Z", data: { instant: { details: { air_temperature: 25.6, wind_from_direction: 246.3, wind_speed: 3.7 } }, next_1_hours: { details: { precipitation_amount: 0 } } } }] },
};

function responder(map: Record<string, { status?: number; body?: unknown; hang?: boolean }>) {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const host = url.includes("open-meteo") ? "open" : url.includes("met.no") ? "met" : "other";
    calls.push(host);
    const spec = map[host] || { status: 500 };
    const signal = init?.signal;
    if (spec.hang) {
      await new Promise((_, rej) => {
        const t = setTimeout(() => rej(new Error("slow")), 5000);
        signal?.addEventListener("abort", () => { clearTimeout(t); rej(new DOMException("aborted", "AbortError")); });
      });
    }
    return new Response(spec.body == null ? "" : JSON.stringify(spec.body), { status: spec.status ?? 200 });
  };
  return { fetchImpl, calls };
}

test("el viento de ahora usa Open-Meteo y no llama al respaldo", async () => {
  const { fetchImpl, calls } = responder({ open: { body: openBody } });
  const cache = new Map();
  const out = await currentWeather(-34.487, -58.53, { fetch: fetchImpl, cache, now: Date.parse("2026-11-22T21:15:00Z") });
  assert.equal(out.reason, null);
  assert.equal(out.weather?.source, "Open-Meteo");
  assert.equal(out.weather?.kmh, 12.3);
  assert.equal(out.weather?.from_deg, 241);
  assert.equal(out.weather?.gust_kmh, 31.3);
  assert.equal(out.weather?.temp_c, 25.6);
  assert.equal(out.weather?.precip_mm, 0);
  assert.equal(out.weather?.hhmm, "18:15");
  assert.equal(out.weather?.stale, false);
  assert.deepEqual(calls, ["open"]);
});

test("si Open-Meteo tarda o viene vacío, responde MET Norway", async () => {
  const slow = responder({ open: { hang: true }, met: { body: metBody } });
  const slowOut = await currentWeather(-34.487, -58.53, { fetch: slow.fetchImpl, cache: new Map(), timeoutMs: 40, now: Date.parse("2026-11-22T21:15:00Z") });
  assert.equal(slowOut.weather?.source, "MET Norway");
  assert.equal(slowOut.weather?.kmh, 13.3);
  assert.equal(slowOut.weather?.from_deg, 246);
  assert.equal(slowOut.weather?.temp_c, 25.6);
  assert.equal(slowOut.weather?.precip_mm, 0);
  assert.equal(slowOut.weather?.gust_kmh, null);
  assert.equal(slowOut.weather?.hhmm, "18:00");
  assert.deepEqual(slow.calls, ["open", "met"]);

  const empty = responder({ open: { body: { current: { wind_speed_10m: null } } }, met: { body: metBody } });
  const emptyOut = await currentWeather(-34.487, -58.53, { fetch: empty.fetchImpl, cache: new Map(), now: Date.parse("2026-11-22T21:15:00Z") });
  assert.equal(emptyOut.weather?.source, "MET Norway");
  assert.deepEqual(empty.calls, ["open", "met"]);
});

test("si fallan los dos, no inventa un número y reusa la última lectura", async () => {
  const cache = new Map<string, { t: number; v: NowReading }>();
  const fail = responder({ open: { status: 503 }, met: { status: 503 } });
  const none = await currentWeather(-34.487, -58.53, { fetch: fail.fetchImpl, cache, now: 1_000 });
  assert.equal(none.weather, null);
  assert.match(none.reason || "", /Open-Meteo y MET Norway/);

  const ok = responder({ open: { body: openBody } });
  await currentWeather(-34.487, -58.53, { fetch: ok.fetchImpl, cache, now: 2_000 });
  const again = responder({ open: { status: 500 }, met: { status: 500 } });
  const stale = await currentWeather(-34.487, -58.53, { fetch: again.fetchImpl, cache, retry: true, now: 9_000 });
  assert.equal(stale.weather?.stale, true);
  assert.equal(stale.weather?.kmh, 12.3);
  assert.equal(stale.weather?.source, "Open-Meteo");
  assert.equal(stale.reason, "cached");

  const fresh = responder({ open: { body: openBody } });
  const held = await currentWeather(-34.487, -58.53, { fetch: fresh.fetchImpl, cache, now: 10_000 });
  assert.equal(held.weather?.stale, false);
  assert.deepEqual(fresh.calls, []);
});

test("la flecha sale del tee hacia el green", () => {
  assert.equal(windArrow(180, 0), 0);
  assert.equal(windArrow(0, 0), 180);
  assert.equal(windArrow(null, 0), null);
  assert.equal(windSide(0, 0), "en contra");
  assert.equal(windSide(180, 0), "a favor");
  assert.equal(windSide(90, 0), "cruzado de derecha");
  assert.equal(windSide(270, 0), "de izquierda");
  assert.equal(windSide(null, 0), null);
  assert.equal(windFace(0, 0), "En contra");
  assert.equal(windFace(180, 0), "A favor");
  assert.equal(windFace(90, 0), "Cruzado de derecha");
  assert.equal(windFace(270, 0), "Cruzado de izquierda");
  assert.equal(windFace(45, 0), "En contra y cruzado de derecha");
  assert.equal(windFace(135, 0), "A favor y cruzado de derecha");
  assert.equal(windFace(225, 0), "A favor y cruzado de izquierda");
  assert.equal(windFace(315, 0), "En contra y cruzado de izquierda");
  assert.equal(windFace(241, 0), "A favor y cruzado de izquierda");
  assert.equal(windFace(241, 90), "A favor y cruzado de derecha");
  assert.equal(windFace(null, 0), null);
  assert.equal(windFace(180, null), null);
  const abs = windAbsolute(241);
  assert.equal(abs?.face, "Desde el SO");
  assert.equal(abs?.turn, 61);
  assert.equal(windAbsolute(null), null);
  assert.equal(windCardinal(0), "N");
  assert.equal(windCardinal(45), "NE");
  assert.equal(windCardinal(180), "S");
  assert.equal(windCardinal(225), "SO");
  assert.equal(windCardinal(null), null);
});
