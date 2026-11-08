/**
 * Golfistics App (app.golfistics.com) read-only client: one login (AAG matrícula + the club clave) lists every
 * club the player belongs to, and an SSO link per club opens a normal club-site session. From there the regular
 * club client (`Golfistics`) and its parsers do the rest.
 *
 * Only the login form is ever submitted; everything else is GET. Cookies live in memory, per host, and are never
 * logged or persisted. Redirects may cross exactly once from the app host to the club host (the SSO hand-off).
 */
import * as cheerio from "cheerio";
import { Golfistics, GolfisticsError, normalizeBaseUrl, num } from "./golfistics";

export const APP_ORIGIN = "https://app.golfistics.com";
const LOGIN = "/golf/golfisticsapp_login.php";
const MENU = "/golf/golfisticsappmenu.php";
const CLUBS = "/golf/ingresoclubesgolfisticsapp.php";
const UA = "Mozilla/5.0 (compatible; GolfletReader/2.0; +https://golflet.vercel.app)";

export type AppClub = { cc: string; name: string };
type Fetch = typeof fetch;

/* ---------------- pure parsers (tested) ---------------- */
export function parseAppLoginForm(html: string) {
  const $ = cheerio.load(html);
  const f = $(`form[action*="golfisticsapp_login.php"]`).first();
  return {
    csrf: f.find('input[name="csrf"]').attr("value") ?? null,
    hasUser: f.find('input[name="usuario"]').length > 0,
    hasPassword: f.find('input[name="clave"]').length > 0,
    error: $(".error").first().text().replace(/\s+/g, " ").trim() || null,
  };
}

/** Club list + player identity from ingresoclubesgolfisticsapp.php. */
export function parseAppClubs(html: string) {
  const $ = cheerio.load(html);
  const clubs: AppClub[] = [];
  $('a.club-card[href*="golfisticsapp_sso_online.php"]').each((_, a) => {
    const cc = ($(a).attr("href") || "").match(/[?&]cc=(\d+)/)?.[1];
    const name = $(a).text().replace(/\s+/g, " ").trim();
    if (cc && !clubs.some(c => c.cc === cc)) clubs.push({ cc, name: prettyClub(name) });
  });
  const player = $(".jugador").first().text().replace(/\s+/g, " ").trim() || null;
  const hi = num($(".hcp-val").first().text());
  return { clubs, player_name: player, handicap_index: hi };
}

/** Player name/HI from the app menu header (`<h1 title="Apellido Nombre">`). */
export function parseAppMenu(html: string) {
  const $ = cheerio.load(html);
  const h1 = $("#hcpBtn h1").first();
  return { player_name: (h1.attr("title") || h1.text()).replace(/\s+/g, " ").trim() || null, handicap_index: num($("#hcpBtn .hcp").first().text()) };
}

/** "Mar Del Plata" -> "Mar del Plata"; keeps the rest as Golfistics writes it. */
export function prettyClub(s: string) {
  return s.replace(/\s+/g, " ").trim().replace(/(?!^)\b(Del|De|La|Las|Los|El|Y)\b/g, w => w.toLowerCase());
}

/** App club list → does it include this club? Unknown club code: any club in the list counts (pre-t166 behaviour). */
export function appServesClub(clubs: { cc: string }[], clubCode: string | null | undefined) {
  return clubCode ? clubs.some(c => c.cc === clubCode) : clubs.length > 0;
}

/* ---------------- client ---------------- */
export class GolfisticsApp {
  private jars = new Map<string, Map<string, string>>();
  player: { name: string | null; handicap_index: number | null } = { name: null, handicap_index: null };
  clubs: AppClub[] = [];

  constructor(private user: string, private password: string,
    private opts: { fetch?: Fetch; origin?: string; checkBase?: (base: string) => Promise<string> } = {}) {}

  private get origin() { return this.opts.origin ?? APP_ORIGIN; }
  private jar(host: string) { let j = this.jars.get(host); if (!j) this.jars.set(host, (j = new Map())); return j; }

  /** GET/POST with manual redirects. `allowHandOff` lets the chain leave the app host once (to the club). */
  private async go(method: "GET" | "POST", path: string, data?: Record<string, string>, allowHandOff = false) {
    const f = this.opts.fetch ?? fetch;
    const appHost = new URL(this.origin).host;
    let url = new URL(path, this.origin).toString();
    let body = data ? new URLSearchParams(data).toString() : undefined;
    let clubHost: string | null = null;
    for (let hop = 0; hop < 6; hop++) {
      const u = new URL(url);
      const j = this.jar(u.host);
      const res = await f(url, {
        method, body, redirect: "manual", signal: AbortSignal.timeout(45_000),
        headers: { "User-Agent": UA, Cookie: [...j].map(([k, v]) => `${k}=${v}`).join("; "), ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
      }).catch(() => { throw new GolfisticsError("unreachable", "No se pudo conectar con el sistema de tu club"); });
      for (const c of res.headers.getSetCookie?.() ?? []) {
        const [pair] = c.split(";"); const i = pair.indexOf("=");
        if (i > 0) j.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
      }
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        const next = new URL(loc, url);
        if (next.host !== u.host) {
          const ok = allowHandOff && u.host === appHost && !clubHost && next.protocol === "https:";
          if (!ok) throw new GolfisticsError("unreachable", "Redirección inesperada");
          clubHost = next.host;
        }
        url = next.toString(); method = "GET"; body = undefined; continue;
      }
      if (!res.ok) throw new GolfisticsError("unreachable", `El sistema del club respondió ${res.status}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      const ct = res.headers.get("content-type") || "";
      return { url, host: new URL(url).host, text: new TextDecoder(/utf-?8/i.test(ct) ? "utf-8" : "latin1").decode(buf) };
    }
    throw new GolfisticsError("unreachable", "Demasiadas redirecciones");
  }

  async login() {
    const page = await this.go("GET", LOGIN);
    const form = parseAppLoginForm(page.text);
    if (!form.hasUser || !form.hasPassword) throw new GolfisticsError("parse", "El sistema del club cambió su pantalla de ingreso");
    const res = await this.go("POST", LOGIN, { csrf: form.csrf ?? "", usuario: this.user, clave: this.password, recordar: "1" });
    if (!new URL(res.url).pathname.endsWith(MENU)) {
      const err = parseAppLoginForm(res.text).error;
      throw new GolfisticsError("login_failed", err && /incorrect/i.test(err) ? "Matrícula o contraseña incorrecta" : err || "No pudimos entrar con esa matrícula y contraseña");
    }
    const m = parseAppMenu(res.text);
    this.player = { name: m.player_name, handicap_index: m.handicap_index };
    return this;
  }

  async listClubs() {
    const page = await this.go("GET", CLUBS);
    const p = parseAppClubs(page.text);
    this.clubs = p.clubs;
    this.player.name ??= p.player_name;
    this.player.handicap_index ??= p.handicap_index;
    return this.clubs;
  }

  /** SSO into one club and return a ready club client (session adopted, tees loaded). */
  async openClub(cc: string, extra: { gender?: string | null } = {}): Promise<Golfistics> {
    if (!/^\d{1,6}$/.test(cc)) throw new GolfisticsError("bad_url", "Club inválido");
    const land = await this.go("GET", `/golf/golfisticsapp_sso_online.php?cc=${cc}`, undefined, true);
    const appHost = new URL(this.origin).host;
    if (land.host === appHost) throw new GolfisticsError("login_failed", "No se pudo abrir el club");
    const u = new URL(land.url);
    const seg = u.pathname.split("/").filter(Boolean);
    const folder = seg.length > 1 ? `/${seg.slice(0, -1).join("/")}` : "";
    const base = await (this.opts.checkBase ?? normalizeBaseUrl)(`${u.protocol}//${u.host}${folder}`)
      .catch(() => { throw new GolfisticsError("bad_url", "El club redirigió a un sitio no permitido"); });
    const club = this.clubs.find(c => c.cc === cc);
    const g = new Golfistics(base, this.user, "").adoptSession(this.jar(u.host), land.text, {
      club_code: cc, club_name: club?.name ?? null, player_name: this.player.name, handicap_index: this.player.handicap_index, gender: extra.gender ?? null,
    });
    if (!g.tees.length) await g.loadTees().catch(() => []);
    return g;
  }
}
