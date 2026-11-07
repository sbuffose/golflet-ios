/**
 * Golfistics 8.x (Hallmore Argentina) read-only client.
 * Only the login form and read-only filter POSTs are ever submitted. Never sets txtAction,
 * never opens Cambio de Clave / reservations / ABM save actions. Cookies stay in memory only
 * (they include server internals) and are never logged or persisted.
 */
import * as cheerio from "cheerio";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const UA = "Mozilla/5.0 (compatible; GolfletReader/2.0; +https://golflet.vercel.app)";

export class GolfisticsError extends Error {
  constructor(public code: "bad_url" | "login_failed" | "unreachable" | "parse", message: string) { super(message); }
}

export const num = (s: unknown): number | null => {
  const t = String(s ?? "").trim().replace(",", ".");
  if (!t || t === "-" || t === "---") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const first = (s: unknown) => (s == null ? null : num(String(s).split("/")[0]));

/** Normalise a pasted Golfistics link to its base folder, and refuse private/internal hosts. */
export async function normalizeBaseUrl(input: string): Promise<string> {
  let u: URL;
  try { u = new URL(input.trim().startsWith("http") ? input.trim() : `https://${input.trim()}`); }
  catch { throw new GolfisticsError("bad_url", "El link no es válido"); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new GolfisticsError("bad_url", "El link tiene que ser http(s)");
  if (u.username || u.password || (u.port && !["80", "443"].includes(u.port))) throw new GolfisticsError("bad_url", "Link no permitido");
  const host = u.hostname.toLowerCase();
  if (isIP(host) || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || !host.includes("."))
    throw new GolfisticsError("bad_url", "Link no permitido");
  try {
    const addrs = await lookup(host, { all: true });
    if (!addrs.length || addrs.some(a => isPrivate(a.address))) throw new Error("private");
  } catch { throw new GolfisticsError("bad_url", "No se pudo resolver ese sitio"); }
  let path = u.pathname.replace(/\/+$/, "");
  if (/\.php$/i.test(path)) path = path.replace(/\/[^/]*$/, "");
  return `${u.protocol}//${host}${path}`;
}
function isPrivate(ip: string): boolean {
  if (ip.includes(":")) return ip === "::1" || /^f[cd]/i.test(ip) || /^fe80/i.test(ip) || ip.startsWith("::ffff:") && isPrivate(ip.slice(7));
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

export type Tee = { course: string; tee: string; course_rating: number; gender: string; slope: number };
export type CardRow = Record<string, any> & { torneo_id: string | null; date: string; course: string | null };
export type CardDetail = {
  holes: number[]; strokes: (number | null)[]; par_raw: (string | null)[]; hcp_raw: (string | null)[];
  par: (number | null)[]; hole_hcp: (number | null)[]; yardage_by_tee: Record<string, (number | null)[]>;
  handicap_allowance_pct: number | null;
};

export class Golfistics {
  private jar = new Map<string, string>();
  club: { club_code: string | null; club_name: string | null; base_url: string } = { club_code: null, club_name: null, base_url: "" };
  player: { userid: string | null; name: string | null; handicap_index: number | null; gender: string | null; txtkey?: string } =
    { userid: null, name: null, handicap_index: null, gender: null };
  tees: Tee[] = [];
  dateRange: [string, string] = ["1990-01-01", "2099-12-31"];

  constructor(public base: string, private user: string, private password: string) {
    this.club.base_url = base;
  }

  private cookieHeader() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "); }
  private absorb(res: Response) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";"); const i = pair.indexOf("=");
      if (i > 0) this.jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  }

  async req(method: "GET" | "POST", page: string, data?: Record<string, string>): Promise<string> {
    let url = `${this.base}/${page}`;
    let body: string | undefined = data ? new URLSearchParams(data).toString() : undefined;
    for (let hop = 0; hop < 5; hop++) {
      const res = await fetch(url, {
        method, body, redirect: "manual", signal: AbortSignal.timeout(45_000),
        headers: {
          "User-Agent": UA, Referer: `${this.base}/index2.php`, Cookie: this.cookieHeader(),
          ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        },
      }).catch(() => { throw new GolfisticsError("unreachable", "No se pudo conectar con el sistema de tu club"); });
      this.absorb(res);
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        const next = new URL(res.headers.get("location")!, url);
        if (next.host !== new URL(this.base).host) throw new GolfisticsError("unreachable", "Redirección inesperada");
        url = next.toString(); method = "GET"; body = undefined; continue;
      }
      if (!res.ok) throw new GolfisticsError("unreachable", `El sistema del club respondió ${res.status}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      const ct = res.headers.get("content-type") || "";
      return new TextDecoder(/utf-?8/i.test(ct) ? "utf-8" : "latin1").decode(buf);
    }
    throw new GolfisticsError("unreachable", "Demasiadas redirecciones");
  }

  async login() {
    await this.req("GET", "login.php");
    await this.req("POST", "login.php", { username: this.user, password: this.password, autologin: "1", submit: "Ingresar" });
    const vals = [...this.jar].map(([k, v]) => { try { return `${k}=${decodeURIComponent(v.replace(/\+/g, " "))}`; } catch { return `${k}=${v}`; } });
    const blob = vals.join("&") + "&" + vals.map(x => x.slice(x.indexOf("=") + 1)).join("&");
    const kv = (k: string) => { const m = blob.match(new RegExp(`(?:^|&)${k}=([^&;]*)`)); return m ? m[1].trim() : null; };
    if (!kv("userid")) throw new GolfisticsError("login_failed", "Matrícula o contraseña incorrecta");
    this.club.club_code = kv("CodigoClub"); this.club.club_name = kv("NombreClub");
    this.player = { userid: kv("userid"), name: kv("username"), handicap_index: num(kv("userhandicapactual")), gender: kv("PlayerGender") };
    const home = await this.req("GET", "index2.php");
    this.tees = parseTees(home);
    return this;
  }

  /**
   * Adopt a session that was opened elsewhere (Golfistics App SSO hand-off) instead of login().
   * Cookies stay in memory. `landingHtml` is the club's index2.php reached by the SSO redirect (tees table).
   */
  adoptSession(cookies: Map<string, string>, landingHtml: string | null, info: { club_code?: string | null; club_name?: string | null; player_name?: string | null; handicap_index?: number | null; gender?: string | null } = {}) {
    this.jar = new Map(cookies);
    this.club.club_code = info.club_code ?? null; this.club.club_name = info.club_name ?? null;
    this.player = { userid: this.user, name: info.player_name ?? null, handicap_index: info.handicap_index ?? null, gender: info.gender ?? null };
    this.tees = landingHtml ? parseTees(landingHtml) : [];
    return this;
  }

  /** Re-read the club home (tees) when the landing page didn't include them. */
  async loadTees() { this.tees = parseTees(await this.req("GET", "index2.php")); return this.tees; }

  async playerKey() {
    const h = await this.req("GET", "estadisticasjugador2.php");
    const m = h.match(/<option\s+selected\s+value="([^"]+)"/i);
    this.player.txtkey = m ? m[1] : this.player.userid ?? this.user;
    return this.player.txtkey!;
  }

  async cardsList(): Promise<CardRow[]> {
    const k = this.player.txtkey!;
    let h = await this.req("POST", "mostrar_tarjetas_total.php?pantalla=ej2&txtkey=", { txtkey: k, PlayerID: "" });
    const sel = h.match(/name="fechadesde"[\s\S]*?<\/select>/);
    const opts = sel ? [...sel[0].matchAll(/value="(\d{4}-\d\d-\d\d)"/g)].map(m => m[1]).sort() : [];
    if (opts.length) this.dateRange = [opts[0], opts[opts.length - 1]];
    h = await this.req("POST", `mostrar_tarjetas_total.php?pantalla=ej2&txtkey=${encodeURIComponent(k)}`, {
      fechadesde: this.dateRange[0], fechahasta: this.dateRange[1], puesto: "999", tipotarjeta: "Todas",
      cantidadtarjetas: "999", txtAction: "", txtkey1: "", cmbFecha: "", TorneoID: "", cmbJugador: "", cmbFechaExtra: "",
    });
    return parseCardsList(h);
  }

  async cardDetail(torneoId: string) {
    const h = await this.req("GET", `TarjetaFechaJugador.php?jugador=${encodeURIComponent(this.player.txtkey!)}&TorneoID=${encodeURIComponent(torneoId)}`);
    return parseCardDetail(h);
  }

  /** Official HI history, whole range. The club page opens on its default window (~6 months); its own "Actualizar" filter form
   *  (Desde/Hasta) is submitted with the earliest year it offers → today, so every weekly record the club keeps comes back (t143u).
   *  Read-only: it's the report's query form. Falls back to the default window if the filter isn't there or returns less. */
  async hiHistoryFull(): Promise<{ date: string; club: string; hi: number }[]> {
    const page = await this.req("GET", "reportehistoricohijugador.php");
    const base = parseHiHistory(page), form = hiRangeForm(page);
    if (!form) return base;
    try { const all = parseHiHistory(await this.req("POST", "reportehistoricohijugador.php", form)); return all.length >= base.length ? all : base; }
    catch { return base; }
  }
  async hiHistory() {
    try { return await this.hiHistoryFull(); } catch { return []; }
  }
}

/* ---------------- parsers (pure; tested against saved pages) ---------------- */
const txt = ($: cheerio.CheerioAPI, el: any) => $(el).text().replace(/\s+/g, " ").trim();

export function parseTees(html: string): Tee[] {
  const $ = cheerio.load(html); const out: Tee[] = [];
  $("tr").each((_, tr) => {
    const tds = $(tr).children("td").toArray().map(td => txt($, td));
    if (tds.length >= 5) {
      const m = tds[1].match(/^(.+?)\s*\((\d+(?:\.\d+)?)\)$/);
      if (m && (tds[2] === "C" || tds[2] === "D") && /^\d+$/.test(tds[3]))
        out.push({ course: tds[0], tee: m[1], course_rating: Number(m[2]), gender: tds[2], slope: Number(tds[3]) });
    }
  });
  return out;
}

export function parseCardsList(html: string): CardRow[] {
  const $ = cheerio.load(html); const t = $("table#customers").first(); const rows: CardRow[] = [];
  if (!t.length) return rows;
  const trs = t.find("tr").toArray();
  if (!trs.length) return rows;
  const hdr = $(trs[0]).find("th,td").toArray().map(c => $(c).text().trim());
  for (const tr of trs.slice(1)) {
    const tds = $(tr).children("td").toArray();
    if (tds.length < 20) continue;
    const v: Record<string, string> = {}; hdr.forEach((h, i) => { v[h] = tds[i] ? txt($, tds[i]) : ""; });
    const link = $(tr).find('a[href*="TarjetaFechaJugador.php"]').attr("href");
    const tid = link?.match(/TorneoID=(\d+)/)?.[1] ?? null;
    const title = $(tds[2]).attr("title") ?? null;
    const clima = $(tds[4]).find("div").attr("title") ?? null;
    const m = (v["Club (Cancha)"] || "").match(/^(.*)\((.*)\)\s*$/);
    const [dd, mm, yy0] = (v["Fecha"] || "").split("/"); let yy = Number(yy0); if (yy < 100) yy += yy < 70 ? 2000 : 1900;
    if (!dd || !mm || !yy) continue;
    const jug = (v["Jugadores"] || "").match(/(\d+)\s*\((\d+)\/(\d+)\)/);
    const trophy = $(tds[8]).find("img").toArray().some(i => /trophy/i.test($(i).attr("src") || ""));
    const sc = (k: string) => num(v[k]) || 0;
    rows.push({
      torneo_id: tid, date: `${String(yy).padStart(4, "0")}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`, weekday: v["Día"] || null,
      tournament: title, club_played: m ? m[1].trim() : v["Club (Cancha)"] || null, course: m ? m[2].trim() : null,
      weather: clima, category: v["Cat."] || null, course_rating: num(v["Dif."]),
      position: trophy ? 1 : num((v["Puesto"] || "").replace(/\D.*/, "")),
      field_size: jug ? Number(jug[1]) : null, handicap_index: num(v["HCPI"]), playing_handicap: num(v["HCP"]),
      out: num(v["Ida"]), in: num(v["Vta"]), gross: num(v["Gross"]) || null, net: num(v["Neto"]) || null, card_status: v["Tarj"] || null,
      summary_counts: { birdies: sc("Bir"), pars: sc("Par"), bogeys: sc("Bog"), double_bogeys: sc("2Bg"), triple_bogeys: sc("3Bg"), worse: sc("+3Bg") },
    });
  }
  return rows;
}

export function parseCardDetail(html: string): CardDetail | null {
  const $ = cheerio.load(html); const t = $("table").first();
  if (!t.length) return null;
  const rows: Record<string, string[]> = {}; const order: string[] = [];
  t.find("tr").each((_, tr) => {
    const c = $(tr).find("td,th").toArray().map(x => txt($, x));
    if (c.length) { const k = c[0].toUpperCase(); rows[k] = c.slice(1); order.push(k); }
  });
  const hoyo = rows["HOYO"] || [];
  const idx = hoyo.map((x, i) => (/^\d+$/.test(x) ? i : -1)).filter(i => i >= 0);
  const pick = (r: string[] = []) => idx.map(i => (i < r.length ? r[i] : null));
  const tees: Record<string, (number | null)[]> = {};
  for (const n of order) if (!["HOYO", "HANDICAP", "PAR", "GOLPES"].includes(n)) tees[n] = pick(rows[n]).map(num);
  const par_raw = pick(rows["PAR"]), hcp_raw = pick(rows["HANDICAP"]);
  const text = $.root().text();
  const pct = text.match(/(\d+)% del Handicap/);
  return {
    holes: idx.map(i => Number(hoyo[i])), strokes: pick(rows["GOLPES"]).map(num), par_raw, hcp_raw,
    par: par_raw.map(first), hole_hcp: hcp_raw.map(first), yardage_by_tee: tees, handicap_allowance_pct: pct ? Number(pct[1]) : null,
  };
}

/** The HI report's Desde/Hasta form (dia/mes/anio → diah/mesh/anioh) set to the earliest year offered → today (ART). Null if absent. */
export function hiRangeForm(html: string, today = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)): Record<string, string> | null {
  const sel = (n: string) => html.match(new RegExp(`<select[^>]*name="${n}"[\\s\\S]*?</select>`, "i"))?.[0] ?? null;
  const anio = sel("anio"); if (!anio || !sel("anioh") || !sel("dia") || !sel("mes")) return null;
  const years = [...anio.matchAll(/value="(\d{4})"/g)].map(m => Number(m[1])).filter(y => y >= 1990 && y <= 2100);
  if (!years.length) return null;
  const [y, m, d] = today.split("-");
  const form: Record<string, string> = { dia: "01", mes: "01", anio: String(Math.min(...years)), diah: d, mesh: m, anioh: y };
  for (const h of html.matchAll(/<input[^>]*type=["']?hidden["']?[^>]*>/gi)) { const n = h[0].match(/name=["']?([\w-]+)/i)?.[1]; if (n && !(n in form)) form[n] = h[0].match(/value=["']([^"']*)["']/i)?.[1] ?? ""; }
  return form;
}
export function parseHiHistory(html: string) {
  const out: { date: string; club: string; hi: number }[] = [];
  const re = /(\d\d)\/(\d\d)\/(\d\d)\s*(?:<\/td>)?\s*<td[^>]*>\s*([^<]+?)\s*(?:<\/td>)?\s*<td[^>]*>\s*([^<]+?)\s*(?:<\/b>)?\s*(?:<\/td>)?\s*<td[^>]*>\s*(-?[\d.]+)/g;
  for (const m of html.matchAll(re)) out.push({ date: `20${m[3]}-${m[2]}-${m[1]}`, club: m[4].trim(), hi: Number(m[6]) });
  return out;
}

/* ---------------- WHS helpers ---------------- */
export function teeFor(tees: Tee[], course: string | null, cr: number | null, gender = "C") {
  const c = tees.filter(t => t.course === course && t.gender === gender);
  if (!c.length || cr == null) return null;
  const best = c.reduce((a, b) => (Math.abs(b.course_rating - cr) < Math.abs(a.course_rating - cr) ? b : a));
  return Math.abs(best.course_rating - cr) <= 0.35 ? best : null;
}
export function strokesReceived(ch: number | null, hcp: number | null) {
  if (ch == null || hcp == null) return 0;
  if (ch >= 0) return Math.floor(ch / 18) + (hcp <= ch % 18 ? 1 : 0);
  return -(hcp > 18 + ch ? 1 : 0);
}
