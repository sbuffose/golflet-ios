/** Admin side of profesores: create pending records (name only), verified/visible flags, convert applications. Admin-only routes. */
import { randomUUID } from "node:crypto";
import { q } from "./db";
import { HttpError } from "./http-error";
import { cleanText } from "./club-requests-core";
import { event } from "./profesores";

/** A pending profesor has a placeholder user (no email, no password → can't sign in) until claimed with a real email (needs the mailer). */
export async function createPendingProfesor(o: { display_name: string; verified?: boolean; phone?: string | null; locations?: string[]; aag_matricula?: string | null; created_via: "admin" | "lead"; lead_id?: string | null; by: string }) {
  const name = cleanText(o.display_name, 80); if (name.length < 2) throw new HttpError(400, "Escribí el nombre del profesor.");
  const id = `prof-${randomUUID()}`;
  await q(`insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values ($1,$2,$3,false,now(),now())`, [id, name, `${id}@pending.golflet.invalid`]);
  await q(`insert into profesor_profile (user_id, display_name, verified, verified_by, account_status, created_via, lead_id, phone, locations, aag_matricula, active)
           values ($1,$2,$3,$4,'pending',$5,$6,$7,$8,$9,true)`,
    [id, name, !!o.verified, o.verified ? o.by : null, o.created_via, o.lead_id ?? null, o.phone ?? null, o.locations ?? [], o.aag_matricula ?? null]);
  await event(o.by, "profesor.create", null, id, o.created_via + (o.verified ? ":verified" : ""));
  return id;
}

export async function listProfesoresAdmin() {
  return q(`select p.user_id, p.display_name, p.verified, p.verified_by, p.account_status, p.created_via, p.active, p.locations, p.phone, p.aag_matricula, p.created_at, p.claimed_at,
              u.email like '%.invalid' as no_email,
              (select count(*)::int from player_profesor l where l.profesor_id=p.user_id) players,
              (select count(*)::int from player_profesor l where l.profesor_id=p.user_id and l.can_view_metrics) sharing
            from profesor_profile p join "user" u on u.id=p.user_id order by p.created_at desc limit 500`);
}

/** Only admins: verified (badge) and active (visible to players in search/match). */
export async function setProfesorFlags(id: string, b: any, by: string) {
  const [cur] = await q(`select verified, active from profesor_profile where user_id=$1`, [id]);
  if (!cur) throw new HttpError(404, "Profesor no encontrado");
  const next = { verified: cur.verified, active: cur.active };
  for (const k of ["verified", "active"] as const) if (b && k in b) { if (typeof b[k] !== "boolean") throw new HttpError(400, `${k} tiene que ser true o false`); next[k] = b[k]; }
  await q(`update profesor_profile set verified=$2, active=$3, verified_by=case when $2 and not verified then $4 when not $2 then null else verified_by end, updated_at=now() where user_id=$1`, [id, next.verified, next.active, by]);
  if (next.verified !== cur.verified) await event(by, next.verified ? "profesor.verify" : "profesor.unverify", null, id);
  if (next.active !== cur.active) await event(by, next.active ? "profesor.show" : "profesor.hide", null, id);
  return { user_id: id, ...next };
}

/** "Profesores interesados" → pending profesor record with the application's name, phone, place and AAG matrícula (nothing invented). */
export async function convertLead(leadId: string, by: string) {
  if (!/^[0-9a-f-]{36}$/i.test(leadId)) throw new HttpError(404, "Contacto no encontrado");
  const [l] = await q(`select * from contact_lead where id=$1`, [leadId]);
  if (!l) throw new HttpError(404, "Contacto no encontrado");
  if (l.kind !== "profesor") throw new HttpError(400, "Solo se convierten los profesores interesados");
  if (l.profesor_user_id) throw new HttpError(409, "Ya se convirtió en profesor");
  const id = await createPendingProfesor({ display_name: l.nombre, phone: l.telefono, locations: l.lugar ? [l.lugar] : [], aag_matricula: l.matricula_aag, created_via: "lead", lead_id: l.id, by });
  await q(`update contact_lead set status='convertido', profesor_user_id=$2, updated_at=now(), updated_by=$3 where id=$1`, [leadId, id, by]);
  return { profesor_id: id };
}

/** "Vincular a profesor existente": copy an application's phone, place and AAG matrícula into an existing profesor (no duplicate).
 *  Empty fields are filled; places are merged; a non-empty field is only replaced when listed in `overwrite`. dry_run → just the plan. */
export async function linkLead(leadId: string, b: any, by: string) {
  if (!/^[0-9a-f-]{36}$/i.test(leadId)) throw new HttpError(404, "Contacto no encontrado");
  const profId = String(b?.profesor_id || ""); const overwrite = new Set<string>(Array.isArray(b?.overwrite) ? b.overwrite.map(String) : []);
  const [l] = await q(`select * from contact_lead where id=$1`, [leadId]);
  if (!l) throw new HttpError(404, "Contacto no encontrado");
  if (l.kind !== "profesor") throw new HttpError(400, "Solo se vinculan los profesores interesados");
  if (l.profesor_user_id) throw new HttpError(409, "Este contacto ya está vinculado a un profesor");
  const [p] = await q(`select user_id, display_name, phone, locations, aag_matricula from profesor_profile where user_id=$1`, [profId]);
  if (!p) throw new HttpError(404, "Profesor no encontrado");
  const norm = (s: any) => String(s ?? "").trim();
  const plan: { field: string; label: string; current: string | null; incoming: string | null; action: "fill" | "keep" | "replace" | "same" | "merge" | "none" }[] = [];
  const one = (field: "phone" | "aag_matricula", label: string, incoming: string) => {
    const cur = norm(p[field]); const inc = norm(incoming);
    const action = !inc ? "none" : !cur ? "fill" : cur === inc ? "same" : overwrite.has(field) ? "replace" : "keep";
    plan.push({ field, label, current: cur || null, incoming: inc || null, action });
    return action === "fill" || action === "replace" ? inc : p[field];
  };
  const phone = one("phone", "Teléfono", l.telefono), aag = one("aag_matricula", "Matrícula Pro AAG", l.matricula_aag);
  const curLocs: string[] = p.locations || [], inc = norm(l.lugar);
  const has = curLocs.some(x => x.toLowerCase() === inc.toLowerCase());
  const locs = inc && !has ? [...curLocs, inc].slice(0, 12) : curLocs;
  plan.push({ field: "locations", label: "Dónde da clases", current: curLocs.join(" · ") || null, incoming: inc || null, action: !inc ? "none" : has ? "same" : curLocs.length ? "merge" : "fill" });
  if (b?.dry_run) return { profesor: { id: p.user_id, name: p.display_name }, plan, applied: false };
  await q(`update profesor_profile set phone=$2, aag_matricula=$3, locations=$4, lead_id=coalesce(lead_id,$5), updated_at=now() where user_id=$1`, [profId, phone, aag, locs, leadId]);
  await q(`update contact_lead set status='convertido', profesor_user_id=$2, updated_at=now(), updated_by=$3 where id=$1`, [leadId, profId, by]);
  return { profesor: { id: p.user_id, name: p.display_name }, plan, applied: true };
}
