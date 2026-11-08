/** "Tengo otro club y no aparece": input cleaning (pure). */
import { HttpError } from "./http-error";
export const MAX_PER_DAY = 5;
/** Plain text only: no tags, no control chars, collapsed spaces (newlines kept in the message). */
export const cleanText = (v: unknown, max: number, multiline = false) => {
  let s = String(v ?? "").normalize("NFC").replace(/<[^>]*>/g, " ").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u2028\u2029]/g, "");
  s = multiline ? s.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n") : s.replace(/\s+/g, " ");
  return s.trim().slice(0, max);
};
export function parseClubRequest(b: any) {
  const club = cleanText(b?.club, 120), mensaje = cleanText(b?.mensaje ?? b?.message, 1000, true);
  if (club.length < 2) throw new HttpError(400, "Escribí el nombre del club.");
  return { club, mensaje: mensaje || null };
}
