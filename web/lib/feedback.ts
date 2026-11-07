/** Anonymous feedback (t135u). Never reads the session; stores no user id, email or IP with the text.
 *  Rate limit: separate counter keyed by sha256(day + secret + ip), rotating daily and never joined to feedback rows. */
import { createHash } from "node:crypto";
import { q } from "./db";
import { HttpError } from "./http-error";
import { clientIp } from "./group-share";
import { parseFeedback, FEEDBACK_PER_DAY, FEEDBACK_STATUS } from "./feedback-core";
const bucket = (ip: string) => createHash("sha256").update(`fb:${new Date().toISOString().slice(0, 10)}:${process.env.BETTER_AUTH_SECRET || "golflet"}:${ip}`).digest("hex").slice(0, 32);

export async function createFeedback(req: Request, body: any) {
  const f = parseFeedback(body);
  await q(`delete from feedback_rate where day < current_date`).catch(() => {});
  const [{ n }] = await q(`insert into feedback_rate (bucket, n) values ($1, 1) on conflict (bucket) do update set n = feedback_rate.n + 1 returning n`, [bucket(clientIp(req))]);
  if (n > FEEDBACK_PER_DAY) throw new HttpError(429, "Ya recibimos varios comentarios desde acá hoy. Probá de nuevo mañana.");
  await q(`insert into feedback (category, texto) values ($1, $2)`, [f.category, f.texto]);
  return { ok: true, message: "¡Gracias! Lo leemos todo. Es anónimo: no guardamos quién lo mandó." };
}
export async function listFeedback(status: string | null) {
  return q(`select id, category, texto, status, created_at, updated_at, updated_by from feedback where ($1::text is null or status=$1) order by created_at desc limit 500`, [status]);
}
export async function setFeedbackStatus(id: string, status: string, by: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "Comentario no encontrado");
  if (!(FEEDBACK_STATUS as readonly string[]).includes(status)) throw new HttpError(400, "Estado: nuevo | leido | archivado");
  const [r] = await q(`update feedback set status=$2, updated_at=now(), updated_by=$3 where id=$1 returning id, status`, [id, status, by]);
  if (!r) throw new HttpError(404, "Comentario no encontrado");
  return r;
}
