import { handle, json, requireUser, HttpError } from "@/lib/http";
import { q } from "@/lib/db";
import { createFromAudio, createFromText, existing, RECAP_COLS, shape, target } from "@/lib/recap";
import { MAX_AUDIO_BYTES, MIN_AUDIO_BYTES, sniffAudio } from "@/lib/recap-rules";

export const maxDuration = 120;

/** GET ?round_id= | ?live_round_id= -> {recap|null}; no params -> {recaps:[...]} (latest 50). */
export const GET = handle(async (req: Request) => {
  const user = await requireUser(req); const u = new URL(req.url);
  const rid = u.searchParams.get("round_id"), lid = u.searchParams.get("live_round_id");
  if (rid || lid) { const t = await target(user.id, { round_id: rid, live_round_id: lid }); return json({ recap: shape(await existing(user.id, t)) }); }
  const rows = await q(`select ${RECAP_COLS} from round_recap where user_id=$1 order by created_at desc limit 50`, [user.id]);
  return json({ recaps: rows.map(shape) });
});

/**
 * Audio: multipart/form-data { audio: File, round_id | live_round_id }  (or raw audio body with ?round_id= / ?live_round_id=).
 * Text:  application/json { round_id | live_round_id, transcript?, summary?, mistakes?, positives?, source?: "ios_on_device" | "web_mic", model?, duration_s? }.
 *        With summary/mistakes/positives (or source ios_on_device / web_mic) it is stored as-is; with only transcript the keyword tagger structures it.
 * Replaces the round's previous recap. Responds with the processed recap (status ready | pending_ai | error).
 */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req); const ct = req.headers.get("content-type") || ""; const u = new URL(req.url);
  if (ct.includes("application/json")) {
    const b = await req.json().catch(() => { throw new HttpError(400, "JSON inválido"); });
    const t = await target(user.id, b);
    return json({ recap: await createFromText(user.id, t, b) }, 201);
  }
  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_AUDIO_BYTES + 64 * 1024) throw new HttpError(413, "El audio supera 4 MB (unos 10 minutos). Grabá algo más corto.");
  let bytes: Uint8Array, ids: { round_id: string | null; live_round_id: string | null }, client: any = null;
  if (ct.includes("multipart/form-data")) {
    const f = await req.formData().catch(() => { throw new HttpError(400, "Formulario inválido"); });
    const file = f.get("audio"); if (!file || typeof file === "string") throw new HttpError(400, "Falta el archivo 'audio'");
    bytes = new Uint8Array(await file.arrayBuffer());
    ids = { round_id: (f.get("round_id") as string) || null, live_round_id: (f.get("live_round_id") as string) || null };
    // optional on-device results next to the audio: transcript, summary, source, model, duration_s; mistakes/positives as JSON strings
    const str = (k: string) => { const v = f.get(k); return typeof v === "string" ? v : null; };
    const arr = (k: string) => { const v = str(k); if (v == null) return undefined; try { const a = JSON.parse(v); return Array.isArray(a) ? a : undefined; } catch { throw new HttpError(400, `'${k}' tiene que ser un JSON array`); } };
    const c = { transcript: str("transcript"), summary: str("summary"), mistakes: arr("mistakes"), positives: arr("positives"), source: str("source"), model: str("model"), duration_s: str("duration_s") };
    if (c.transcript != null || c.summary != null || c.mistakes || c.positives || c.source) client = c;
  } else if (ct.startsWith("audio/") || ct.includes("octet-stream")) {
    bytes = new Uint8Array(await req.arrayBuffer());
    ids = { round_id: u.searchParams.get("round_id"), live_round_id: u.searchParams.get("live_round_id") };
  } else throw new HttpError(415, "Mandá multipart/form-data con 'audio', o JSON con 'transcript'");
  if (bytes.byteLength > MAX_AUDIO_BYTES) throw new HttpError(413, "El audio supera 4 MB (unos 10 minutos). Grabá algo más corto.");
  if (bytes.byteLength < MIN_AUDIO_BYTES) throw new HttpError(400, "El audio está vacío o es demasiado corto");
  const kind = sniffAudio(bytes); if ("error" in kind) throw new HttpError(415, kind.error);
  const t = await target(user.id, ids);
  return json({ recap: await createFromAudio(user.id, t, bytes, kind.mime, client) }, 201);
});
