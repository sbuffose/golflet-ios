/**
 * Groups v2 helpers: "Qué comparto" sharing settings (enforced server-side), per-member group views,
 * share links (/g/<token>) and group photos. Voice notes, notes and strategy are ALWAYS private and are not a category.
 */
import { randomBytes, createHash } from "node:crypto";
import { q } from "./db";
import { HttpError } from "./http-error";

export const SHARE_CATS = [
  { key: "profile", label: "Mi perfil en los grupos", desc: "Los jugadores de tus grupos pueden abrir tu perfil: nombre, club y lo que compartas abajo. Si lo apagás, solo ven tu nombre.", default: true },
  { key: "rounds_detail", label: "Mis tarjetas hoyo por hoyo", desc: "Desde tu perfil pueden abrir cada ronda (fecha, cancha, score y la tarjeta). Necesita “Rondas y scores”.", default: false },
  { key: "scores", label: "Rondas y scores", desc: "Cantidad de rondas, gross y neto (promedio y mejor) y su evolución.", default: true },
  { key: "handicap", label: "Hándicap", desc: "Tu Hándicap Index actual.", default: true },
  { key: "score_types", label: "Águilas, birdies, pares y bogeys", desc: "Totales y por ronda.", default: true },
  { key: "holes", label: "Resultados por hoyo", desc: "Mapa de calor hoyo por hoyo y promedios en pares 3, 4 y 5.", default: true },
  { key: "gir_fir", label: "Greens y fairways", desc: "Greens en regulación y fairways que cargaste.", default: true },
  { key: "putting", label: "Putts", desc: "Putts por ronda que cargaste.", default: true },
  { key: "gps", label: "Distancias por palo (GPS)", desc: "Distancias medianas de tus golpes con GPS.", default: false },
  { key: "bag", label: "Mi bolsa", desc: "Los palos que usás.", default: false },
  { key: "ball", label: "Pelota", desc: "La pelota con la que jugás.", default: false },
] as const;
export type ShareKey = (typeof SHARE_CATS)[number]["key"];
export type Share = Record<ShareKey, boolean>;
export const ALWAYS_PRIVATE = ["Notas de voz", "Notas de cada ronda", "Estrategia de la cancha", "Tus salidas reservadas y con quién jugás"];
export const SHARE_DEFAULTS: Share = Object.fromEntries(SHARE_CATS.map(c => [c.key, c.default])) as Share;

function clean(p: any): Partial<Share> {
  const o: any = {}; if (!p || typeof p !== "object") return o;
  for (const c of SHARE_CATS) if (typeof p[c.key] === "boolean") o[c.key] = p[c.key];
  return o;
}
export async function getSharePrefs(userId: string) {
  const [r] = await q(`select prefs, updated_at from share_pref where user_id=$1`, [userId]);
  return { prefs: { ...SHARE_DEFAULTS, ...clean(r?.prefs) } as Share, customized: !!r, updated_at: r?.updated_at ?? null };
}
export async function setSharePrefs(userId: string, body: any) {
  const p = clean(body?.prefs ?? body);
  if (!Object.keys(p).length) throw new HttpError(400, "Mandá al menos una categoría (true/false).");
  const cur = await getSharePrefs(userId), next = { ...cur.prefs, ...p };
  await q(`insert into share_pref (user_id, prefs, updated_at) values ($1,$2,now()) on conflict (user_id) do update set prefs=excluded.prefs, updated_at=now()`, [userId, JSON.stringify(next)]);
  return { prefs: next };
}
/** Effective sharing per member in one group: defaults ← profile ← optional per-group override. */
export async function effectiveShare(groupId: string, userIds: string[]): Promise<Map<string, Share>> {
  const out = new Map<string, Share>(); if (!userIds.length) return out;
  const prof = await q(`select user_id, prefs from share_pref where user_id = any($1)`, [userIds]);
  const ovr = await q(`select user_id, share from cmp_member_pref where group_id=$1 and user_id = any($2) and share is not null`, [groupId, userIds]);
  for (const u of userIds) out.set(u, { ...SHARE_DEFAULTS, ...clean(prof.find((r: any) => r.user_id === u)?.prefs), ...clean(ovr.find((r: any) => r.user_id === u)?.share) });
  return out;
}

/* ---- per-member view of a group (only the member edits it) ---- */
export const VIEW_METRICS = ["rounds", "avg_gross", "best_gross", "avg_net", "best_net", "handicap", "eagles", "birdies", "pars", "bogeys", "doubles", "par3", "par4", "par5", "putts", "gir", "fir"] as const;
export const VIEW_SECTIONS = ["table", "trend", "holes", "vs", "clubs"] as const;
export const VIEW_DEFAULT = { metrics: [...VIEW_METRICS], sections: [...VIEW_SECTIONS], range: "all", course: null as string | null };
export function cleanView(v: any) {
  const pick = (a: any, allowed: readonly string[]) => Array.isArray(a) ? [...new Set(a.filter((x: any) => typeof x === "string" && allowed.includes(x)))] as string[] : null;
  const metrics = pick(v?.metrics, VIEW_METRICS), sections = pick(v?.sections, VIEW_SECTIONS);
  const range = ["1m", "3m", "6m", "12m", "all"].includes(v?.range) ? v.range : null;
  const course = typeof v?.course === "string" && v.course.length <= 200 ? v.course : v?.course === null ? null : undefined;
  return { ...(metrics ? { metrics } : {}), ...(sections ? { sections } : {}), ...(range ? { range } : {}), ...(course !== undefined ? { course } : {}) };
}
export async function getView(groupId: string, userId: string) {
  const [r] = await q(`select view, share, updated_at from cmp_member_pref where group_id=$1 and user_id=$2`, [groupId, userId]);
  return { view: { ...VIEW_DEFAULT, ...cleanView(r?.view) }, share_override: r?.share ? { ...clean(r.share) } : null, customized: !!r?.view && Object.keys(r.view).length > 0 };
}
export async function setView(groupId: string, userId: string, body: any) {
  const cur = await getView(groupId, userId), v = { ...cur.view, ...cleanView(body?.view ?? body) };
  if (body?.reset) { await q(`update cmp_member_pref set view='{}'::jsonb, updated_at=now() where group_id=$1 and user_id=$2`, [groupId, userId]); return { view: { ...VIEW_DEFAULT } }; }
  await q(`insert into cmp_member_pref (group_id, user_id, view, updated_at) values ($1,$2,$3,now())
    on conflict (group_id, user_id) do update set view=excluded.view, updated_at=now()`, [groupId, userId, JSON.stringify(v)]);
  return { view: v };
}
/** Per-group override of what I share (null = follow my profile). */
export async function setShareOverride(groupId: string, userId: string, share: any) {
  const s = share === null ? null : clean(share);
  if (s !== null && !Object.keys(s).length) throw new HttpError(400, "Mandá categorías true/false o null para volver a tu perfil.");
  await q(`insert into cmp_member_pref (group_id, user_id, share, updated_at) values ($1,$2,$3,now())
    on conflict (group_id, user_id) do update set share=excluded.share, updated_at=now()`, [groupId, userId, s === null ? null : JSON.stringify(s)]);
  return { share_override: s };
}

/* ---- share link ---- */
export const BASE_URL = (process.env.PUBLIC_BASE_URL || "https://golflet.vercel.app").replace(/\/$/, "");
export const newToken = () => randomBytes(16).toString("base64url");     // 22 chars, 128 bits
export const validToken = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9_-]{16,40}$/.test(t);
export const linkUrl = (t: string) => `${BASE_URL}/g/${t}`;
export function waText(groupName: string, url: string) {
  return `Sumate a "${groupName}" en Golflet para comparar nuestras métricas de golf: ${url}`;
}
export function linkInfo(g: { share_token: string | null; share_enabled: boolean; share_expires_at: string | null; name: string }) {
  if (!g.share_token) return { url: null, enabled: false, expires_at: null, expired: false, whatsapp_url: null };
  const url = linkUrl(g.share_token), expired = !!g.share_expires_at && new Date(g.share_expires_at) < new Date();
  return { url, enabled: !!g.share_enabled, expires_at: g.share_expires_at, expired, whatsapp_url: `https://wa.me/?text=${encodeURIComponent(waText(g.name, url))}` };
}
const ipHash = (ip: string) => createHash("sha256").update(`golflet-link:${ip}`).digest("hex").slice(0, 32);
export const clientIp = (req: Request) => (req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || "0.0.0.0").trim();
/** 60 link opens / previews per IP per 10 minutes. */
export async function linkRateLimit(req: Request, max = 60) {
  const h = ipHash(clientIp(req));
  const [r] = await q(`select count(*)::int n from cmp_link_hit where ip_hash=$1 and created_at > now() - interval '10 minutes'`, [h]);
  if (r.n >= max) throw new HttpError(429, "Demasiados intentos con links de invitación. Probá en unos minutos.");
  await q(`insert into cmp_link_hit (ip_hash) values ($1)`, [h]);
  if (Math.random() < 0.02) await q(`delete from cmp_link_hit where created_at < now() - interval '1 day'`).catch(() => {});
}
/** Group behind a token if the link is usable (enabled, not expired). */
export async function groupByToken(token: unknown) {
  if (!validToken(token)) return null;
  const [g] = await q(`select id, name, owner_id, share_token, share_enabled, share_expires_at, photo_updated_at, (photo is not null) has_photo,
      (select count(*)::int from cmp_member m where m.group_id=g.id and m.status='accepted') members
    from cmp_group g where share_token=$1`, [token]);
  if (!g || !g.share_enabled || (g.share_expires_at && new Date(g.share_expires_at) < new Date())) return null;
  return g;
}

/* ---- photo: images only, resized to max 512px JPEG ---- */
export const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
export async function processPhoto(buf: Buffer): Promise<Buffer> {
  if (!buf.length || buf.length > MAX_PHOTO_BYTES) throw new HttpError(400, "La foto tiene que pesar menos de 6 MB.");
  const sharp = (await import("sharp")).default;
  let meta; try { meta = await sharp(buf, { limitInputPixels: 40_000_000 }).metadata(); } catch { throw new HttpError(400, "Eso no es una imagen."); }
  if (!meta.format || !["jpeg", "png", "webp", "heif", "avif", "gif", "tiff"].includes(meta.format)) throw new HttpError(400, "Solo imágenes (JPG, PNG, WebP o HEIC).");
  return sharp(buf, { limitInputPixels: 40_000_000 }).rotate().resize(512, 512, { fit: "cover", position: "attention" }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
}
