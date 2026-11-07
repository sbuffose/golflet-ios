/** "¿Sos profesor?" / "¿Sponsor o marca?" / "Contactar" form cleaning (pure). */
import { HttpError } from "./http-error";
import { cleanText } from "./club-requests-core";
export const LEAD_KINDS = ["profesor", "marca", "contacto"] as const;
export const LEADS_PER_DAY_IP = 5;
export function cleanPhone(v: unknown) {
  const s = cleanText(v, 30);
  const digits = s.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15 || /[^\d\s()+.-]/.test(s)) throw new HttpError(400, "Revisá el teléfono (con código de área, solo números).");
  return s;
}
export function parseLead(b: any) {
  const kind = String(b?.kind || "");
  if (!(LEAD_KINDS as readonly string[]).includes(kind)) throw new HttpError(400, "Tipo de contacto inválido");
  if (b?.website) throw new HttpError(400, "No pudimos enviar el formulario");          // honeypot (hidden field)
  const nombre = cleanText(b?.nombre, 80);
  if (nombre.length < 2) throw new HttpError(400, "Escribí tu nombre.");
  const telefono = cleanPhone(b?.telefono);
  if (kind === "profesor") {
    const lugar = cleanText(b?.lugar, 120); if (lugar.length < 2) throw new HttpError(400, "Contanos dónde das clases.");
    const mat = cleanText(b?.matricula_aag, 20);
    if (mat && !/^[A-Za-z0-9.\- ]{1,20}$/.test(mat)) throw new HttpError(400, "Revisá la matrícula de Pro AAG.");
    return { kind, nombre, telefono, lugar, matricula_aag: mat || null, empresa: null, motivo: null };
  }
  if (kind === "contacto") {
    const motivo = cleanText(b?.motivo, 1000, true); if (motivo.length < 5) throw new HttpError(400, "Contanos brevemente el motivo.");
    return { kind, nombre, telefono, lugar: null, matricula_aag: null, empresa: null, motivo };
  }
  const empresa = cleanText(b?.empresa, 100); if (empresa.length < 2) throw new HttpError(400, "Escribí el nombre de la empresa o marca.");
  const motivo = cleanText(b?.motivo, 1000, true); if (motivo.length < 5) throw new HttpError(400, "Contanos brevemente el motivo.");
  return { kind, nombre, telefono, lugar: null, matricula_aag: null, empresa, motivo };
}
