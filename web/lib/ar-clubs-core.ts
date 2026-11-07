/**
 * Directorio de clubes de Argentina: reglas puras (sin DB) para overrides del admin y validación.
 * Los datos importados viven en ar_club_directory/ar_course_directory; las correcciones en ar_club_override
 * (clave = club_key + field) y nunca se pisan con un re-import.
 */
export type Src = { source?: string; url?: string; fetched?: string; precision?: string; note?: string; evidence?: unknown };
export type FieldOut = { value: unknown; source: string | null; url: string | null; fetched: string | null; precision?: string | null; note?: string | null;
  override?: { by: string; at: string; imported: unknown } | null };

export const KEY_RE = /^[a-z0-9-]{3,64}$/;
export const CLUB_FIELDS = ["name", "province", "city", "address", "postcode", "phone", "website", "email", "federation", "holes", "par", "length_m", "designer", "founded", "type", "lat", "lng", "location_precision", "logo_tone"] as const;
export const COURSE_FIELDS = ["name", "holes", "par", "length_m", "designer", "year"] as const;
export type ClubField = typeof CLUB_FIELDS[number];

const INT: Record<string, [number, number]> = { holes: [1, 72], par: [27, 80], length_m: [300, 8000], year: [1850, 2100] };
const TEXT_MAX = 300;

/** Course field keys look like `course:<course name>:<field>`. */
export function parseFieldKey(field: string): { kind: "club"; field: ClubField } | { kind: "course"; course: string; field: typeof COURSE_FIELDS[number] } | null {
  if ((CLUB_FIELDS as readonly string[]).includes(field)) return { kind: "club", field: field as ClubField };
  const m = /^course:(.{1,120}):([a-z_]+)$/.exec(field || "");
  if (m && (COURSE_FIELDS as readonly string[]).includes(m[2])) return { kind: "course", course: m[1], field: m[2] as typeof COURSE_FIELDS[number] };
  return null;
}

/** Validates and normalizes an admin edit. `null`/"" means "Sin dato" (explicit empty). Throws Error with a Spanish message. */
export function normalizeValue(field: string, raw: unknown): unknown {
  const k = parseFieldKey(field); if (!k) throw new Error("Campo inválido");
  if (raw == null || (typeof raw === "string" && raw.trim() === "")) { if (k.field === "name" && k.kind === "club") throw new Error("El nombre no puede quedar vacío"); return null; }
  const f = k.field;
  if (f in INT || f === "founded") {
    const n = Number(String(raw).trim()); const [lo, hi] = INT[f === "founded" ? "year" : f];
    if (!Number.isInteger(n) || n < lo || n > hi) throw new Error(`Tiene que ser un número entero entre ${lo} y ${hi}`);
    return f === "founded" ? String(n) : n;
  }
  if (f === "lat" || f === "lng") {
    const n = Number(String(raw).replace(",", ".")); const lim = f === "lat" ? [-56, -21] : [-74, -53];
    if (!Number.isFinite(n) || n < lim[0] || n > lim[1]) throw new Error(f === "lat" ? "Latitud fuera de Argentina (-56 a -21)" : "Longitud fuera de Argentina (-74 a -53)");
    return Math.round(n * 1e6) / 1e6;
  }
  const s = String(raw).trim().replace(/\s+/g, " ").slice(0, TEXT_MAX);
  if (f === "website") { let u: URL; try { u = new URL(/^https?:\/\//i.test(s) ? s : "https://" + s); } catch { throw new Error("Web inválida"); } if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) throw new Error("Web inválida"); return u.toString(); }
  if (f === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new Error("Email inválido");
  if (f === "type" && !["privado", "publico"].includes(s.toLowerCase())) throw new Error("Tipo: privado o publico");
  if (f === "logo_tone" && !["dark", "light"].includes(s)) throw new Error("Fondo del logo: dark o light");
  return f === "type" ? s.toLowerCase() : s;
}

export type OverrideRow = { field: string; value: unknown; updated_by_email?: string | null; updated_at: string | Date };

/** Effective field = override (if any) else imported value with its source. Empty stays null ("Sin dato"). */
export function effectiveField(imported: unknown, src: Src | null | undefined, ov: OverrideRow | undefined): FieldOut {
  if (ov) return { value: ov.value ?? null, source: "Corrección del admin", url: null, fetched: new Date(ov.updated_at).toISOString().slice(0, 10),
    override: { by: ov.updated_by_email || "admin", at: new Date(ov.updated_at).toISOString(), imported: imported ?? null } };
  const empty = imported == null || imported === "";
  return { value: empty ? null : imported, source: empty ? null : src?.source ?? null, url: empty ? null : src?.url ?? null, fetched: empty ? null : src?.fetched ?? null,
    precision: src?.precision ?? null, note: src?.note ?? null, override: null };
}

export const SOURCE_LABELS: Record<string, string> = { aag: "AAG", golfistics: "Golfistics", osm: "OSM", dgt: "DigitalGolfTour", golflet: "Golflet" };
export const sourceBadges = (matchStatus: string | null) => (matchStatus || "").split("+").filter(s => s in SOURCE_LABELS);

/** List filters from the query string (all optional). */
export type ListFilter = { q?: string; prov?: string; fed?: string; logo?: boolean; course?: boolean; linked?: boolean; has?: string; missing?: string; src?: string; precise?: boolean };
export type ListRow = { key: string; name: string | null; province: string | null; city: string | null; federation: string | null; holes: number | null; has_logo: boolean;
  has_course: boolean; linked: boolean; precise: boolean; sources: string[]; [k: string]: unknown };
const fold = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function applyFilter(rows: ListRow[], f: ListFilter): ListRow[] {
  const qq = f.q ? fold(f.q).trim() : "";
  return rows.filter(r => (!qq || fold(`${r.name} ${r.city} ${r.province} ${r.key}`).includes(qq))
    && (!f.prov || (f.prov === "_none" ? !r.province : r.province === f.prov)) && (!f.fed || (f.fed === "_none" ? !r.federation : r.federation === f.fed))
    && (f.logo == null || r.has_logo === f.logo) && (f.course == null || r.has_course === f.course) && (f.linked == null || r.linked === f.linked)
    && (f.precise == null || r.precise === f.precise) && (!f.src || r.sources.includes(f.src))
    && (!f.has || (r[f.has] != null && r[f.has] !== "" && r[f.has] !== false)) && (!f.missing || r[f.missing] == null || r[f.missing] === "" || r[f.missing] === false));
}
