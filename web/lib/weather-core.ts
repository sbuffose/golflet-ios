/** Weather per round (t136u), pure helpers. Source: Open-Meteo archive (free, no key). Never invents values. */
export type Hourly = { time: string[]; temperature_2m: (number | null)[]; precipitation: (number | null)[]; wind_speed_10m: (number | null)[]; wind_gusts_10m: (number | null)[]; weather_code: (number | null)[] };
export type Wx = { temp_c: number | null; precip_mm: number | null; rain_hours: number; wind_kmh: number | null; gust_kmh: number | null; weather_code: number | null; condition: Cond | null };
export type Cond = "despejado" | "nublado" | "lluvia" | "tormenta";
export const DEFAULT_WINDOW: [number, number] = [10, 16];          // no tee time known → "durante el día"
export const MIN_GROUP = 3;                                        // a bucket needs ≥3 rounds to be shown
const r1 = (x: number) => Math.round(x * 10) / 10;
/** Window around a tee time: 4.5 h of play, starting at the tee time hour. */
export function windowFor(time: string | null | undefined): [number, number] {
  const m = /^(\d{2}):(\d{2})$/.exec(time || ""); if (!m) return DEFAULT_WINDOW;
  const h = +m[1]; return [h, Math.min(23, h + 4)];
}
export function codeCond(code: number | null): Cond | null {
  if (code == null) return null;
  if (code >= 95) return "tormenta";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 86) || (code >= 71 && code <= 77)) return "lluvia";
  if (code <= 1) return "despejado";
  return "nublado";                                               // 2, 3, 45, 48
}
/** Aggregate the hourly series of ONE local day over [from, to] (inclusive hours). */
export function aggregate(h: Hourly, date: string, from: number, to: number): Wx | null {
  const idx = h.time.map((t, i) => [t, i] as const).filter(([t]) => t.startsWith(date) && +t.slice(11, 13) >= from && +t.slice(11, 13) <= to).map(([, i]) => i);
  const num = (a: (number | null)[]) => idx.map(i => a[i]).filter((v): v is number => typeof v === "number" && isFinite(v));
  const T = num(h.temperature_2m), P = num(h.precipitation), W = num(h.wind_speed_10m), G = num(h.wind_gusts_10m), C = num(h.weather_code);
  if (!T.length && !P.length && !W.length) return null;
  const precip = P.length ? r1(P.reduce((a, b) => a + b, 0)) : null, rainH = P.filter(v => v >= 0.2).length;
  const code = C.length ? Math.max(...C) : null;                 // WMO codes grow with severity
  let cond = codeCond(code);
  if (cond !== "tormenta" && precip != null && (precip >= 1 || rainH >= 2)) cond = "lluvia";
  if (cond === "lluvia" && precip != null && precip < 0.3 && rainH === 0) cond = "nublado";   // code said drizzle, the gauge says dry
  return { temp_c: T.length ? r1(T.reduce((a, b) => a + b, 0) / T.length) : null, precip_mm: precip, rain_hours: rainH,
    wind_kmh: W.length ? r1(W.reduce((a, b) => a + b, 0) / W.length) : null, gust_kmh: G.length ? r1(Math.max(...G)) : null, weather_code: code, condition: cond };
}
export const isWet = (w: { condition: Cond | null }) => w.condition === "lluvia" || w.condition === "tormenta";
export const TEMP_BANDS = [["frio", "Frío", -99, 12], ["fresco", "Fresco", 12, 20], ["templado", "Templado", 20, 27], ["calor", "Calor", 27, 99]] as const;
export const WIND_BANDS = [["calmo", "Poco viento", 0, 12], ["moderado", "Viento moderado", 12, 25], ["fuerte", "Viento fuerte", 25, 999]] as const;
export const tempBand = (t: number | null) => t == null ? null : TEMP_BANDS.find(([, , a, b]) => t >= a && t < b)?.[0] ?? null;
export const windBand = (w: number | null) => w == null ? null : WIND_BANDS.find(([, , a, b]) => w >= a && w < b)?.[0] ?? null;
export type WxRound = { round_id: string; date: string; course: string | null; differential: number | null; gross: number | null; wx: Wx };
/** Resumen groups: rain vs dry, temperature band, wind band. Metric = mean differential (WHS) per bucket; only buckets with ≥MIN_GROUP. */
export function weatherGroups(rs: WxRound[]) {
  const ok = rs.filter(r => r.differential != null && r.wx.condition);
  const mean = (a: number[]) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 10) / 10 : null;
  const overall = mean(ok.map(r => r.differential!));
  const mk = (dim: string, buckets: readonly (readonly [string, string, ...any[]])[], of: (r: WxRound) => string | null) => {
    const out = buckets.map(([k, label]) => { const g = ok.filter(r => of(r) === k); return { key: k, label, n: g.length, avg_diff: mean(g.map(r => r.differential!)), vs_overall: g.length && overall != null ? Math.round((mean(g.map(r => r.differential!))! - overall) * 10) / 10 : null }; })
      .filter(b => b.n >= MIN_GROUP);
    return { dim, buckets: out, enough: out.length >= 2 };
  };
  return { n: ok.length, overall_avg_diff: overall, min_group: MIN_GROUP,
    lluvia: mk("lluvia", [["lluvia", "Con lluvia"], ["seco", "Seco"]], r => isWet(r.wx) ? "lluvia" : "seco"),
    temperatura: mk("temperatura", TEMP_BANDS, r => tempBand(r.wx.temp_c)),
    viento: mk("viento", WIND_BANDS, r => windBand(r.wx.wind_kmh)) };
}
export function bucketOf(dim: string, r: WxRound): string | null {
  return dim === "lluvia" ? (isWet(r.wx) ? "lluvia" : "seco") : dim === "temperatura" ? tempBand(r.wx.temp_c) : dim === "viento" ? windBand(r.wx.wind_kmh) : null;
}

export type Tally = { eagles: number; birdies: number; pars: number; bogeys: number; doubles: number; holes: number; nine: boolean };
export type PlayRound = WxRound & { holes?: unknown; tee?: string | null; nine?: boolean };

/** 9 or 18 holes with par and strokes. A partial card is not a rate. */
export function tallyHoles(holes: unknown, nine = false): Tally | null {
  if (!Array.isArray(holes)) return null;
  const rows: { par: number; strokes: number }[] = [];
  for (const h of holes) {
    if (!Array.isArray(h) || h.length < 3 || h[1] == null || h[2] == null) continue;
    const par = Number(h[1]), strokes = Number(h[2]);
    if (!Number.isFinite(par) || !Number.isFinite(strokes)) continue;
    rows.push({ par, strokes });
  }
  if (rows.length !== 9 && rows.length !== 18) return null;
  const out: Tally = { eagles: 0, birdies: 0, pars: 0, bogeys: 0, doubles: 0, holes: rows.length, nine: rows.length === 9 || nine };
  for (const h of rows) {
    const d = h.strokes - h.par;
    if (d <= -2) out.eagles++;
    else if (d === -1) out.birdies++;
    else if (d === 0) out.pars++;
    else if (d === 1) out.bogeys++;
    else out.doubles++;
  }
  return out;
}

export type Rate = { per_hole: number; per_18: number };
export type Mix = { cards: number; holes: number; nine: number; eagles: Rate; birdies: Rate; pars: Rate; bogeys: Rate; doubles: Rate };
const rate = (n: number, holes: number): Rate => ({ per_hole: holes ? Math.round((n / holes) * 1000) / 1000 : 0, per_18: holes ? Math.round((n / holes) * 18 * 100) / 100 : 0 });
export function mixOf(tallies: Tally[]): Mix | null {
  if (!tallies.length) return null;
  const holes = tallies.reduce((s, t) => s + t.holes, 0);
  const sum = (k: keyof Tally) => tallies.reduce((s, t) => s + Number(t[k]), 0);
  return {
    cards: tallies.length, holes, nine: tallies.filter(t => t.nine).length,
    eagles: rate(sum("eagles"), holes), birdies: rate(sum("birdies"), holes), pars: rate(sum("pars"), holes),
    bogeys: rate(sum("bogeys"), holes), doubles: rate(sum("doubles"), holes),
  };
}

export type PlayBucket = {
  key: string; label: string; n: number; avg_diff: number | null; vs_overall: number | null;
  mix: Mix | null; base: Mix | null; courses: string[]; tees: string[]; comparable: boolean; note: string | null; sentence: string | null;
};

function bucketNote(courses: string[], tees: string[], n: number): { comparable: boolean; note: string | null } {
  const courseSet = [...new Set(courses.filter(Boolean))];
  const teeSet = [...new Set(tees.filter(Boolean))];
  const missingTee = tees.some(t => !t);
  if (n < MIN_GROUP) return { comparable: false, note: `Hacen falta ${MIN_GROUP} tarjetas en el grupo para comparar. Hay ${n}.` };
  if (courseSet.length > 1) return { comparable: false, note: `Estas tarjetas son de ${courseSet.join(" y ")}. No las comparo entre sí.` };
  if (teeSet.length > 1 || missingTee) return { comparable: false, note: missingTee ? "No todas las tarjetas dicen la salida. No comparo el resultado." : `Las salidas son ${teeSet.join(" y ")}. No las comparo entre sí.` };
  return { comparable: true, note: null };
}

function sentenceFor(label: string, mix: Mix, base: Mix): string | null {
  const birdie = mix.birdies.per_18 - base.birdies.per_18;
  const bogey = (mix.bogeys.per_18 + mix.doubles.per_18) - (base.bogeys.per_18 + base.doubles.per_18);
  if (birdie >= 0.4) return `En tus vueltas ${label} hubo más birdies por vuelta que en el resto con clima.`;
  if (bogey >= 0.4) return `En tus vueltas ${label} hubo más bogeys o peor por vuelta que en el resto con clima.`;
  if (birdie <= -0.4) return `En tus vueltas ${label} hubo menos birdies por vuelta que en el resto con clima.`;
  return null;
}

/** Rates per valid hole, also shown as an 18-hole average. The comparator is the rate, never the sum of scores. */
export function weatherPlay(rounds: PlayRound[]) {
  const scored = rounds.map(r => ({ r, tally: tallyHoles(r.holes, !!r.nine) })).filter((x): x is { r: PlayRound; tally: Tally } => !!x.tally);
  const base = mixOf(scored.map(x => x.tally));
  const overallDiffs = rounds.filter(r => r.differential != null).map(r => r.differential!);
  const overall = overallDiffs.length ? Math.round(overallDiffs.reduce((a, b) => a + b, 0) / overallDiffs.length * 10) / 10 : null;
  const mean = (a: number[]) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 10) / 10 : null;
  const build = (dim: string, buckets: readonly (readonly [string, string])[], of: (r: PlayRound) => string | null): PlayBucket[] => buckets.map(([key, label]) => {
    const g = scored.filter(x => of(x.r) === key);
    const diffs = g.map(x => x.r.differential).filter((d): d is number => d != null);
    const mix = mixOf(g.map(x => x.tally));
    const courses = [...new Set(g.map(x => x.r.course || "").filter(Boolean))];
    const tees = g.map(x => x.r.tee || "");
    const gate = bucketNote(courses, tees, g.length);
    const others = mixOf(scored.filter(x => of(x.r) !== key).map(x => x.tally));
    const sentence = gate.comparable && mix && others && g.length >= MIN_GROUP ? sentenceFor(label.toLowerCase(), mix, others) : null;
    const avg = mean(diffs);
    return { key, label, n: g.length, avg_diff: avg, vs_overall: avg != null && overall != null && gate.comparable ? Math.round((avg - overall) * 10) / 10 : null, mix, base, courses, tees: [...new Set(tees.filter(Boolean))], comparable: gate.comparable, note: gate.note, sentence };
  });
  return {
    cards: scored.length, holes: scored.reduce((s, x) => s + x.tally.holes, 0), base, min_group: MIN_GROUP,
    lluvia: build("lluvia", [["lluvia", "Con lluvia"], ["seco", "En seco"]], r => isWet(r.wx) ? "lluvia" : "seco"),
    temperatura: build("temperatura", TEMP_BANDS.map(([k, label]) => [k, label] as const), r => tempBand(r.wx.temp_c)),
    viento: build("viento", WIND_BANDS.map(([k, label]) => [k, label] as const), r => windBand(r.wx.wind_kmh)),
  };
}

/** Archive is the observed source. The forecast model is never treated as observed. */
export const ARCHIVE_SOURCE = "open-meteo-archive";
export const FORECAST_SOURCE = "open-meteo-forecast";
/** Same cutoff as the hourly reader: a day more than 6 days before today can use the archive directly. */
export const ARCHIVE_AFTER_DAYS = 6;
export const FORECAST_TTL_MS = 3600e3;
export const MISS_TTL_MS = 15 * 60e3;

export function daysBefore(date: string, today: string): number {
  return Math.round((Date.parse(today + "T12:00:00Z") - Date.parse(date + "T12:00:00Z")) / 864e5);
}

/**
 * What a round date may ask Open-Meteo.
 * The archive does not include the local day. Recent days often are not in the archive yet:
 * a forecast fill-in stays labeled forecast and must not enter Clima y juego.
 */
export function roundWeatherPlan(date: string, today: string):
  | { action: "skip"; reason: "not_played" }
  | { action: "forecast" }
  | { action: "archive"; forecastFallback: boolean } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return { action: "skip", reason: "not_played" };
  if (date > today) return { action: "skip", reason: "not_played" };
  if (date === today) return { action: "forecast" };
  return { action: "archive", forecastFallback: daysBefore(date, today) <= ARCHIVE_AFTER_DAYS };
}

export function countsAsObserved(source: string | null | undefined): boolean {
  return source === ARCHIVE_SOURCE;
}

/** Final archive rows stay. Forecast and misses are retried. An explicit retry still keeps a final archive row. */
export function weatherCacheFresh(row: { status?: string | null; source?: string | null; fetched_at?: string | Date | null }, now = Date.now(), retry = false): boolean {
  if (!row?.fetched_at) return false;
  const source = row.source || ARCHIVE_SOURCE;
  const age = now - new Date(row.fetched_at).getTime();
  if (!Number.isFinite(age) || age < 0) return false;
  if (row.status === "ok" && source === ARCHIVE_SOURCE) return true;
  if (retry) return false;
  if (row.status === "ok" && source === FORECAST_SOURCE) return age < FORECAST_TTL_MS;
  return age < MISS_TTL_MS;
}
/** "Jockey Club Buenos Aires" + "Colorada" → the vm_course whose name ends with the course and shares a club token. */
export function matchCourse(clubPlayed: string | null, course: string | null, vm: { vm_course: string; lat: number; lng: number }[]) {
  const n = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (!course) return null; const c = n(course), club = new Set(n(clubPlayed || "").split(" ").filter(t => t.length > 2 && !["CLUB", "GOLF", "DEL", "LOS", "LAS", "CAMPO"].includes(t)));
  const hits = vm.filter(v => { const name = n(v.vm_course); return (name === c || name.endsWith(" " + c)) && name.split(" ").some(t => club.has(t)); });
  return hits.length === 1 ? hits[0] : null;
}
