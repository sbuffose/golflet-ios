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
/** "Jockey Club Buenos Aires" + "Colorada" → the vm_course whose name ends with the course and shares a club token. */
export function matchCourse(clubPlayed: string | null, course: string | null, vm: { vm_course: string; lat: number; lng: number }[]) {
  const n = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (!course) return null; const c = n(course), club = new Set(n(clubPlayed || "").split(" ").filter(t => t.length > 2 && !["CLUB", "GOLF", "DEL", "LOS", "LAS", "CAMPO"].includes(t)));
  const hits = vm.filter(v => { const name = n(v.vm_course); return (name === c || name.endsWith(" " + c)) && name.split(" ").some(t => club.has(t)); });
  return hits.length === 1 ? hits[0] : null;
}
