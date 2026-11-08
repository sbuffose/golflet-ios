/** Admin "Clubes de Argentina": lista, detalle, correcciones (overrides + auditoría) y logos. Lee ar_* (importadas por clubs_ar/db/import.mjs). */
import { q } from "./db";
import { HttpError, type SessionUser } from "./http";
import { audit } from "./admin";
import { applyFilter, CLUB_FIELDS, effectiveField, KEY_RE, normalizeValue, parseFieldKey, sourceBadges, type ListFilter, type ListRow, type OverrideRow } from "./ar-clubs-core";

const checkKey = (k: string) => { if (!KEY_RE.test(k || "")) throw new HttpError(404, "Club no encontrado"); return k; };
const LIST_FIELDS = ["name", "province", "city", "federation", "holes", "par", "website", "phone", "address", "lat", "lng", "location_precision", "designer", "founded", "length_m", "type"] as const;

async function overridesFor(keys: string[] | null) {
  const rows = await q<OverrideRow & { club_key: string }>(`select o.club_key, o.field, o.value, o.updated_at, u.email updated_by_email from ar_club_override o left join "user" u on u.id=o.updated_by
    ${keys ? "where o.club_key = any($1)" : ""}`, keys ? [keys] : []);
  const m = new Map<string, Map<string, OverrideRow>>();
  for (const r of rows) { if (!m.has(r.club_key)) m.set(r.club_key, new Map()); m.get(r.club_key)!.set(r.field, r); }
  return m;
}

export async function listArClubs(f: ListFilter = {}) {
  const rows = await q(`select d.key, d.aag_code, d.match_status, d.golflet_club_id, d.fields, ${LIST_FIELDS.map(k => `d.${k}`).join(", ")},
      (select count(*)::int from ar_course_directory c where c.club_key=d.key) n_courses,
      exists(select 1 from ar_club_logo l where l.club_key=d.key) imp_logo, (select tone from ar_club_logo l where l.club_key=d.key) imp_tone,
      (select updated_at from ar_club_logo_override l where l.club_key=d.key) ov_logo_at, (select tone from ar_club_logo_override l where l.club_key=d.key) ov_tone
    from ar_club_directory d`);
  const ovs = await overridesFor(null);
  const out: ListRow[] = rows.map((r: any) => {
    const ov = ovs.get(r.key) || new Map();
    const e: Record<string, unknown> = {};
    for (const k of LIST_FIELDS) e[k] = effectiveField(r[k], r.fields?.[k], ov.get(k)).value;
    const has_logo = !!(r.imp_logo || r.ov_logo_at);
    const tone = (ov.get("logo_tone")?.value as string) || r.ov_tone || (r.ov_logo_at ? null : r.imp_tone) || "light";
    const precise = e.lat != null && !/localidad/i.test(String(e.location_precision || ""));
    return { key: r.key, aag_code: r.aag_code, ...e, name: (e.name as string) ?? null, province: (e.province as string) ?? null, city: (e.city as string) ?? null,
      federation: (e.federation as string) ?? null, holes: (e.holes as number) ?? null, n_courses: r.n_courses, has_logo, logo_tone: has_logo ? tone : null,
      logo_v: r.ov_logo_at ? +new Date(r.ov_logo_at) : 0,
      has_course: !!(e.holes || e.par || r.n_courses), linked: r.golflet_club_id != null, golflet_club_id: r.golflet_club_id, precise, has_location: e.lat != null,
      sources: sourceBadges(r.match_status), edited: ov.size > 0 } as ListRow;
  });
  out.sort((a, b) => (a.name ? 0 : 1) - (b.name ? 0 : 1) || String(a.name || "").localeCompare(String(b.name || ""), "es"));
  return applyFilter(out, f);
}

export async function arClubDetail(key: string) {
  checkKey(key);
  const [d] = await q(`select d.*, g.name golflet_club_name, g.code golflet_code from ar_club_directory d left join club g on g.id=d.golflet_club_id where d.key=$1`, [key]);
  if (!d) throw new HttpError(404, "Club no encontrado");
  const ov = (await overridesFor([key])).get(key) || new Map<string, OverrideRow>();
  const fields: Record<string, unknown> = {};
  for (const k of CLUB_FIELDS) fields[k] = effectiveField(k === "logo_tone" ? null : d[k], d.fields?.[k], ov.get(k));
  fields.social = effectiveField(d.social, d.fields?.social, undefined);
  fields.country = effectiveField(d.fields?.country?.value ?? null, d.fields?.country, undefined);
  const courses = await q(`select * from ar_course_directory where club_key=$1 order by name`, [key]);
  const cs = courses.map((c: any) => {
    const src = (c.sources || [])[c.sources?.length - 1] || null; const s0 = (c.sources || [])[0] || null;
    const f = (name: string, v: unknown, s: any) => effectiveField(v, s, ov.get(`course:${c.name}:${name}`));
    return { name: c.name, vm_course: c.vm_course, golflet_course_name: c.golflet_course_name, hole1: c.hole1_lat != null ? { lat: c.hole1_lat, lng: c.hole1_lng } : null,
      sources: c.sources || [],
      fields: { holes: f("holes", c.holes, src), par: f("par", c.par, src), length_m: f("length_m", c.length_m, src), designer: f("designer", c.designer, s0), year: f("year", null, null) } };
  });
  const [lo] = await q(`select updated_at, tone, u.email by from ar_club_logo_override l left join "user" u on u.id=l.updated_by where club_key=$1`, [key]);
  const [li] = await q(`select source_url, fetched_at::text fetched, tone, mime from ar_club_logo where club_key=$1`, [key]);
  const toneOv = ov.get("logo_tone")?.value as string | undefined;
  const logo = lo ? { url: `/api/admin/ar-clubs/${key}/logo?v=${+new Date(lo.updated_at)}`, source: "Subido desde el admin", source_url: null, fetched: new Date(lo.updated_at).toISOString().slice(0, 10), by: lo.by, tone: toneOv || lo.tone || "light", uploaded: true }
    : li ? { url: `/api/admin/ar-clubs/${key}/logo`, source: "Sitio oficial del club", source_url: d.logo_url || li.source_url, fetched: li.fetched, tone: toneOv || li.tone || "light", uploaded: false } : null;
  const auditRows = await q(`select created_at, actor_email, action, summary from admin_audit where target_type='ar_club' and target_id=$1 order by created_at desc limit 30`, [key]);
  return { key, aag_code: d.aag_code, match_status: d.match_status, sources_badges: sourceBadges(d.match_status), match: d.match, sources: d.sources, last_checked: d.last_checked,
    notes: d.fields?._notes || [], osm_ids: d.osm_ids || [], area_m2: d.area_m2,
    golflet: d.golflet_club_id ? { id: d.golflet_club_id, name: d.golflet_club_name, code: d.golflet_code } : null, fields, courses: cs, logo, audit: auditRows,
    overrides: [...ov.values()].map(o => ({ field: o.field, value: o.value, by: o.updated_by_email, at: o.updated_at })) };
}

const LABEL: Record<string, string> = { name: "nombre", province: "provincia", city: "localidad", address: "dirección", postcode: "código postal", phone: "teléfono", website: "web", email: "email",
  federation: "federación", holes: "hoyos", par: "par", length_m: "largo", designer: "diseñador", founded: "fundación", type: "tipo", lat: "latitud", lng: "longitud", location_precision: "precisión", logo_tone: "fondo del logo", year: "año" };

/** { field, value } — value null/"" = "Sin dato" explícito; { field, reset:true } vuelve al dato importado. */
export async function setArOverride(actor: SessionUser, key: string, b: any) {
  checkKey(key);
  const field = String(b?.field || ""); const k = parseFieldKey(field); if (!k) throw new HttpError(400, "Campo inválido");
  const [d] = await q(`select key, name from ar_club_directory where key=$1`, [key]); if (!d) throw new HttpError(404, "Club no encontrado");
  if (k.kind === "course") { const [c] = await q(`select 1 from ar_course_directory where club_key=$1 and name=$2`, [key, k.course]); if (!c) throw new HttpError(404, "Cancha no encontrada"); }
  const [before] = await q(`select value from ar_club_override where club_key=$1 and field=$2`, [key, field]);
  const label = (k.kind === "course" ? `${LABEL[k.field]} de ${k.course}` : LABEL[k.field]) || field;
  if (b?.reset) {
    const r = await q(`delete from ar_club_override where club_key=$1 and field=$2 returning field`, [key, field]);
    if (r.length) await audit(actor, "ar_club.override_clear", { type: "ar_club", id: key }, `Volvió ${label} de ${d.name} al dato importado`, { field, before: before?.value ?? null });
    return arClubDetail(key);
  }
  let value: unknown; try { value = normalizeValue(field, b?.value); } catch (e) { throw new HttpError(400, e instanceof Error ? e.message : "Valor inválido"); }
  await q(`insert into ar_club_override (club_key, field, value, updated_by) values ($1,$2,$3,$4) on conflict (club_key, field) do update set value=excluded.value, updated_by=excluded.updated_by, updated_at=now()`,
    [key, field, JSON.stringify(value), actor.id]);
  await audit(actor, "ar_club.override", { type: "ar_club", id: key }, `Corrigió ${label} de ${d.name}`, { field, before: before?.value ?? null, after: value });
  return arClubDetail(key);
}

const MAGIC: [string, (b: Buffer) => boolean][] = [["image/png", b => b[0] === 0x89 && b[1] === 0x50], ["image/jpeg", b => b[0] === 0xff && b[1] === 0xd8], ["image/webp", b => b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP"]];
export async function setArLogo(actor: SessionUser, key: string, b: any) {
  checkKey(key);
  const [d] = await q(`select name from ar_club_directory where key=$1`, [key]); if (!d) throw new HttpError(404, "Club no encontrado");
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b?.data_url || "")); if (!m) throw new HttpError(400, "Subí un PNG, JPG o WebP");
  const buf = Buffer.from(m[2], "base64"); if (buf.length > 600_000) throw new HttpError(413, "La imagen pesa más de 600 KB");
  const kind = MAGIC.find(([, t]) => t(buf))?.[0]; if (!kind) throw new HttpError(400, "El archivo no es una imagen válida");
  const tone = b?.tone === "dark" ? "dark" : "light";
  await q(`insert into ar_club_logo_override (club_key, mime, data, tone, updated_by) values ($1,$2,$3,$4,$5) on conflict (club_key) do update set mime=excluded.mime, data=excluded.data, tone=excluded.tone, updated_by=excluded.updated_by, updated_at=now()`, [key, kind, buf, tone, actor.id]);
  await audit(actor, "ar_club.logo", { type: "ar_club", id: key }, `Subió el logo de ${d.name}`, { bytes: buf.length, mime: kind, tone });
  return arClubDetail(key);
}
export async function clearArLogo(actor: SessionUser, key: string) {
  checkKey(key);
  const [d] = await q(`select name from ar_club_directory where key=$1`, [key]); if (!d) throw new HttpError(404, "Club no encontrado");
  const r = await q(`delete from ar_club_logo_override where club_key=$1 returning club_key`, [key]);
  if (r.length) await audit(actor, "ar_club.logo_reset", { type: "ar_club", id: key }, `Volvió al logo importado de ${d.name}`);
  return arClubDetail(key);
}
export async function arLogo(key: string) {
  checkKey(key);
  const [o] = await q(`select mime, data from ar_club_logo_override where club_key=$1`, [key]); if (o) return o;
  const [i] = await q(`select mime, data from ar_club_logo where club_key=$1`, [key]); return i || null;
}
