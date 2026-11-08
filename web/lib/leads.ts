import { createHash } from "node:crypto";
import { q } from "./db";
import { HttpError } from "./http-error";
import { clientIp } from "./group-share";
import { parseLead, LEADS_PER_DAY_IP } from "./leads-core";
const ipHash = (ip: string) => createHash("sha256").update(`golflet-lead:${ip}`).digest("hex").slice(0, 32);

export async function createLead(req: Request, body: any, userId: string | null) {
  const l = parseLead(body), h = ipHash(clientIp(req));
  const [{ n }] = await q(`select count(*)::int n from contact_lead where (ip_hash=$1 or ($2::text is not null and user_id=$2)) and created_at > now() - interval '24 hours'`, [h, userId]);
  if (n >= LEADS_PER_DAY_IP) throw new HttpError(429, "Ya recibimos varios mensajes desde acá hoy. Probá de nuevo mañana.");
  const [r] = await q(`insert into contact_lead (kind, nombre, telefono, lugar, matricula_aag, empresa, motivo, user_id, ip_hash) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id, kind, created_at`,
    [l.kind, l.nombre, l.telefono, l.lugar, l.matricula_aag, l.empresa, l.motivo, userId, h]);
  return { lead: r, message: l.kind === "profesor" ? "Gracias. Te vamos a contactar para sumarte como profesor." : "Gracias. Te vamos a contactar a la brevedad." };
}
export async function listLeads(kind: string, status: string | null) {
  if (!["profesor", "marca", "contacto"].includes(kind)) throw new HttpError(400, "kind: profesor | marca | contacto");
  return q(`select id, kind, nombre, telefono, lugar, matricula_aag, empresa, motivo, user_id, profesor_user_id, status, created_at, updated_at, updated_by from contact_lead
            where kind=$1 and ($2::text is null or status=$2) order by created_at desc limit 500`, [kind, status]);
}
export async function setLeadStatus(id: string, status: string, by: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "Contacto no encontrado");
  if (!["nuevo", "contactado", "descartado"].includes(status)) throw new HttpError(400, "Estado: nuevo | contactado | descartado");   // 'convertido' comes with phase B (create profesor account)
  const [r] = await q(`update contact_lead set status=$2, updated_at=now(), updated_by=$3 where id=$1 returning id, kind, status`, [id, status, by]);
  if (!r) throw new HttpError(404, "Contacto no encontrado");
  return r;
}
