/** t104u/t105u shot tracking (pure). GPS start→end = TOTAL distance (where the ball stopped); carry is never inferred from GPS. */
import { haversine } from "./geo";
export type LL = { lat: number; lng: number };
export const KINDS = ["full", "approach", "putt_start", "putt"] as const;   // t127u: "putt" = one stroke on the green, marked standing at the ball
export const AUTO_WINS_AT = 5;                         // manual Mi bolsa value wins until this many auto samples
const M2YD = 1.0936133;
export const yd = (m: number | null) => (m == null ? null : Math.round(m * M2YD));
const okLL = (p: any): p is LL => p && Number.isFinite(+p.lat) && Number.isFinite(+p.lng) && Math.abs(+p.lat) <= 90 && Math.abs(+p.lng) <= 180 && !(+p.lat === 0 && +p.lng === 0);
const ll = (lat: any, lng: any) => (okLL({ lat, lng }) ? { lat: +lat, lng: +lng } : null);

export function cleanSample(s: any) {
  const client_id = String(s?.client_id ?? "").trim();
  if (!/^[A-Za-z0-9_.:-]{6,80}$/.test(client_id)) throw new Error("client_id inválido");
  const kind = s?.kind; if (!(KINDS as readonly string[]).includes(kind)) throw new Error(`kind inválido (${KINDS.join("|")})`);
  const hole = Number(s?.hole); if (!Number.isInteger(hole) || hole < 1 || hole > 36) throw new Error("hoyo inválido");
  const start = ll(s?.start_lat, s?.start_lng), end = ll(s?.end_lat, s?.end_lng);
  // putt: the player marks standing at the ball (start); where it stopped (end) is optional (= next putt's start, or the hole if holed)
  if (kind === "putt" ? !start : !end) throw new Error(kind === "putt" ? "Falta la posición de la pelota (start_lat/start_lng)" : "Falta la posición final (end_lat/end_lng)");
  if ((kind === "full" || kind === "approach") && !start) throw new Error("Falta la posición inicial (start_lat/start_lng)");
  const distance_m = start && end ? Math.round(haversine(start, end) * 10) / 10 : null;
  if (distance_m != null && (kind === "full" || kind === "approach") && distance_m > 450) throw new Error("Distancia imposible (> 450 m): revisá el GPS");
  if (distance_m != null && kind === "putt" && distance_m > 80) throw new Error("Putt imposible (> 80 m): revisá el GPS");
  const putts = s?.putts == null || s.putts === "" ? null : Number(s.putts);
  if (putts != null && (!Number.isInteger(putts) || putts < 0 || putts > 9)) throw new Error("putts inválido");
  const sn = s?.shot_number == null || s.shot_number === "" ? null : Number(s.shot_number);
  if (sn != null && (!Number.isInteger(sn) || sn < 1 || sn > 20)) throw new Error("shot_number inválido (1–20)");
  const pin = ll(s?.pin_lat, s?.pin_lng);   // only when the player marked the flag; we never guess it
  const club = s?.club == null || s.club === "" ? (kind === "putt" ? "Putter" : null) : String(s.club).slice(0, 30);
  const acc = s?.accuracy_m == null ? null : Math.max(0, Math.min(500, Number(s.accuracy_m) || 0));
  const taken_at = s?.taken_at && !isNaN(Date.parse(s.taken_at)) ? new Date(s.taken_at).toISOString() : null;
  return { client_id, kind, hole, club, start, end, distance_m, putts: kind === "putt_start" ? putts : null, accuracy_m: acc, taken_at,
    shot_number: sn, holed: s?.holed === true, pin };
}

/** t127u: flag = the pin the player marked, else the green center (labelled). Never an invented pin. */
export function flagFor(pin: LL | null, center: LL | null): { flag: LL | null; flag_source: "player_marked" | "green_center" | null } {
  return pin ? { flag: pin, flag_source: "player_marked" } : center ? { flag: center, flag_source: "green_center" } : { flag: null, flag_source: null };
}
const r1 = (m: number) => Math.round(m * 10) / 10;
export function toFlag(p: LL | null, flag: LL | null) { return p && flag ? r1(haversine(p, flag)) : null; }

/** "¿A cuánto la dejaste?" per shot of ONE hole, in play order: where it stopped → flag; else the next shot's start → flag; holed = 0. */
export function leftAt<T extends { shot_number?: number | null; taken_at?: any; created_at?: any; to_flag_start_m?: number | null; to_flag_end_m?: number | null; holed?: boolean | null; discarded?: boolean | null; kind?: string }>(rows: T[]) {
  const ord = rows.filter(r => !r.discarded && r.kind !== "putt_start").slice().sort((a, b) => (a.shot_number ?? 99) - (b.shot_number ?? 99) || +new Date(a.taken_at ?? a.created_at ?? 0) - +new Date(b.taken_at ?? b.created_at ?? 0));
  return ord.map((r, i) => {
    const nx = ord[i + 1];
    const left = r.holed ? 0 : r.to_flag_end_m ?? (nx ? nx.to_flag_start_m ?? null : null);
    const how = r.holed ? "holed" : r.to_flag_end_m != null ? "end_point" : nx?.to_flag_start_m != null ? "next_shot" : null;
    return { ...r, order: i + 1, left_to_flag_m: left, left_from: how };
  });
}

export const median = (xs: number[]) => { const a = xs.filter(Number.isFinite).sort((x, y) => x - y); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };

/** Ball on green vs green center. With an approach origin: long(+)/short(-) along the approach line and right(+)/left(-) across it. */
export function greenOffset(ball: LL, center: LL, from?: LL | null) {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180, lat0 = toRad(center.lat);
  const xy = (p: LL) => ({ x: toRad(p.lng - center.lng) * Math.cos(lat0) * R, y: toRad(p.lat - center.lat) * R });   // east, north (m) from center
  const b = xy(ball), dist = Math.hypot(b.x, b.y);
  const out: any = { to_center_m: Math.round(dist * 10) / 10, east_m: Math.round(b.x * 10) / 10, north_m: Math.round(b.y * 10) / 10, long_m: null, right_m: null };
  if (from) { const f = xy(from), L = Math.hypot(f.x, f.y); if (L > 5) { const ux = -f.x / L, uy = -f.y / L;   // unit vector origin → center
    out.long_m = Math.round((b.x * ux + b.y * uy) * 10) / 10; out.right_m = Math.round((b.x * uy - b.y * ux) * 10) / 10; } }
  return out;
}

/** Per club: manual (Mi bolsa, yards) vs auto (GPS total, metres). The typed (manual) distance always wins (t126u); GPS fills clubs without one; carry only from manual / launch monitor. */
export function mergeDistances(manual: { club: string; carry: number | null; total: number | null }[], auto: Record<string, number[]>, lm: Record<string, { carry_m: number | null; n: number }> = {}) {
  const key = (c: string) => c.trim().toLowerCase();
  const clubs = new Map<string, string>(); for (const m of manual) clubs.set(key(m.club), m.club); for (const c of Object.keys(auto)) if (!clubs.has(key(c))) clubs.set(key(c), c); for (const c of Object.keys(lm)) if (!clubs.has(key(c))) clubs.set(key(c), c);
  return [...clubs.entries()].map(([k, club]) => {
    const man = manual.find(m => key(m.club) === k) || null, xs = Object.entries(auto).find(([c]) => key(c) === k)?.[1] || [], n = xs.length;
    const autoTotal = median(xs), lmr = Object.entries(lm).find(([c]) => key(c) === k)?.[1] || null;
    const useAuto = man?.total == null && n > 0;   // t126u: the typed distance is the defined one; GPS only fills clubs without it
    const total_yd = useAuto ? yd(autoTotal) : man?.total ?? null;
    const carry_yd = man?.carry ?? (lmr?.carry_m != null ? yd(lmr.carry_m) : null);
    return { club, total_yd, total_m: total_yd == null ? null : Math.round(total_yd / M2YD), carry_yd, carry_m: carry_yd == null ? null : Math.round(carry_yd / M2YD),
      source: total_yd == null ? null : useAuto ? "auto" : "manual", carry_source: man?.carry != null ? "manual" : lmr?.carry_m != null ? "launch_monitor" : null,
      n_auto: n, auto_total_m: autoTotal == null ? null : Math.round(autoTotal), auto_total_yd: yd(autoTotal), manual_total_yd: man?.total ?? null, manual_carry_yd: man?.carry ?? null,
      auto_needs: 0 };   // deprecated (t126u): GPS no longer overrides a typed distance
  });
}
