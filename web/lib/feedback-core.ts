/** Anonymous feedback (t135u), pure cleaning. Nothing that identifies the sender is accepted or stored. */
import { HttpError } from "./http-error";
import { cleanText } from "./club-requests-core";
export const FEEDBACK_CATS = ["no_funciono", "idea", "me_encanto", "otro"] as const;
export const FEEDBACK_STATUS = ["nuevo", "leido", "archivado"] as const;
export const FEEDBACK_PER_DAY = 8;
export const CAT_LABEL: Record<string, string> = { no_funciono: "Algo que no funcionó", idea: "Una idea", me_encanto: "Algo que me encantó", otro: "Otra cosa" };
export function parseFeedback(b: any) {
  if (b?.website) throw new HttpError(400, "No pudimos enviar el comentario");   // honeypot
  const c = b?.category == null || b?.category === "" ? null : String(b.category);
  if (c !== null && !(FEEDBACK_CATS as readonly string[]).includes(c)) throw new HttpError(400, "Tipo de comentario inválido");
  const texto = cleanText(b?.texto, 2000, true);
  if (texto.length < 10) throw new HttpError(400, "Contanos un poco más (al menos 10 caracteres).");
  return { category: c, texto };
}
