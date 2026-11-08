/** Post-round voice recap: store audio (Postgres bytea), transcribe + structure via AI Gateway, rule-based fallback, edits. */
import { q } from "./db";
import { HttpError } from "./http";
import { ownRound } from "./rounds";
import { ownLive } from "./live";
import { AiUnavailable, structureRecap, transcribeAudio } from "./ai";
import { clientStructured, normalizeStructured, recurring, tagByRules, type Structured } from "./recap-rules";

export const RECAP_COLS = `id, round_id, live_round_id, status, error, audio_mime, audio_bytes, duration_s, transcript, summary, mistakes, positives, source, model, edited_at, created_at, updated_at`;
export const AI_OFF_MSG = "Audio guardado. La transcripción se hace en la app de iPhone; acá podés escribir cómo te fue y Golflet ordena los errores igual.";

export function shape(r: any) {
  if (!r) return null;
  return { id: r.id, round_id: r.round_id, live_round_id: r.live_round_id, status: r.status, error: r.error,
    has_audio: !!r.audio_bytes, audio: r.audio_bytes ? { mime: r.audio_mime, bytes: r.audio_bytes, duration_s: r.duration_s, url: `/api/recaps/${r.id}/audio` } : null,
    transcript: r.transcript, summary: r.summary, mistakes: r.mistakes || [], positives: r.positives || [], source: r.source, model: r.model, duration_s: r.duration_s ?? null,
    edited_at: r.edited_at, created_at: r.created_at, updated_at: r.updated_at };
}

/** Validates the target (Golfistics round or Golflet round) and returns {round_id, live_round_id, context} */
export async function target(userId: string, b: { round_id?: string | null; live_round_id?: string | null }) {
  if (b.round_id) {
    const r = await ownRound(userId, String(b.round_id));
    const ctx = (r.holes || []).filter((h: any) => h[2] != null).map((h: any) => `Hoyo ${h[0]} par ${h[1] ?? "?"}: ${h[2]}`).join(" · ");
    return { round_id: r.id as string, live_round_id: null, context: `${r.date} · ${r.club_name}${r.course ? " " + r.course : ""}${ctx ? "\n" + ctx : ""}` };
  }
  if (b.live_round_id) {
    const l = await ownLive(userId, String(b.live_round_id));
    return { round_id: null, live_round_id: l.id as string, context: `${l.date}${l.course ? " · " + l.course : ""}` };
  }
  throw new HttpError(400, "Falta round_id o live_round_id");
}

export async function existing(userId: string, t: { round_id: string | null; live_round_id: string | null }) {
  const [r] = t.round_id ? await q(`select ${RECAP_COLS} from round_recap where user_id=$1 and round_id=$2`, [userId, t.round_id])
    : await q(`select ${RECAP_COLS} from round_recap where user_id=$1 and live_round_id=$2`, [userId, t.live_round_id]);
  return r || null;
}
export async function ownRecap(userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "No encontrado");
  const [r] = await q(`select ${RECAP_COLS} from round_recap where id=$1 and user_id=$2`, [id, userId]);
  if (!r) throw new HttpError(404, "No encontrado");
  return r;
}

async function structure(text: string, context?: string): Promise<{ data: Structured; source: "ai" | "rules"; model: string | null; aiOff: boolean }> {
  try { const r = await structureRecap(text, context); return { data: r.data, source: "ai", model: r.model, aiOff: false }; }
  catch (e) {
    if (!(e instanceof AiUnavailable)) console.error("recap structure failed", e instanceof Error ? e.message.slice(0, 120) : "unknown");
    return { data: tagByRules(text), source: "rules", model: null, aiOff: e instanceof AiUnavailable };
  }
}

/** Save a new audio (replaces any previous recap of that round), then transcribe + structure. */
export async function createFromAudio(userId: string, t: { round_id: string | null; live_round_id: string | null; context?: string }, audio: Uint8Array, mime: string, client?: any) {
  const prev = await existing(userId, t);
  const [row] = prev
    ? await q(`update round_recap set status='processing', error=null, audio_mime=$2, audio_bytes=$3, duration_s=null, transcript=null, summary=null, mistakes='[]', positives='[]', source=null, model=null, edited_at=null, updated_at=now() where id=$1 returning id`, [prev.id, mime, audio.byteLength])
    : await q(`insert into round_recap (user_id, round_id, live_round_id, status, audio_mime, audio_bytes) values ($1,$2,$3,'processing',$4,$5) returning id`, [userId, t.round_id, t.live_round_id, mime, audio.byteLength]);
  await q(`insert into recap_audio (recap_id, data) values ($1,$2) on conflict (recap_id) do update set data=excluded.data`, [row.id, Buffer.from(audio)]);
  const c = client ? clientStructured(client) : null;
  const typed = client?.transcript != null ? String(client.transcript).trim().slice(0, 12_000) : "";
  if (c || typed) {   // the phone already did the work (or sent text): store it, no server AI
    const s = c ? { data: c.data, source: c.source, model: c.model } : await structure(typed, t.context);
    await q(`update round_recap set status='ready', error=null, transcript=$2, summary=$3, mistakes=$4, positives=$5, source=$6, model=$7, duration_s=$8, updated_at=now() where id=$1`,
      [row.id, typed || null, s.data.summary, JSON.stringify(s.data.mistakes), JSON.stringify(s.data.positives), s.source, s.model, c?.duration ?? null]);
    return shape(await ownRecap(userId, row.id));
  }
  return processRecap(userId, row.id, audio, mime, t.context);
}

export async function processRecap(userId: string, id: string, audio?: Uint8Array, mime?: string, context?: string) {
  if (!audio) {
    const [a] = await q(`select a.data, r.audio_mime from recap_audio a join round_recap r on r.id=a.recap_id where a.recap_id=$1 and r.user_id=$2`, [id, userId]);
    if (!a) throw new HttpError(409, "Esta nota no tiene audio");
    audio = new Uint8Array(a.data); mime = a.audio_mime;
  }
  let tr: Awaited<ReturnType<typeof transcribeAudio>>;
  try { tr = await transcribeAudio(audio, mime || "audio/mp4"); }
  catch (e) {
    const off = e instanceof AiUnavailable;
    if (!off) console.error("recap transcribe failed", e instanceof Error ? e.message.slice(0, 120) : "unknown");
    // a recap that already has text (typed/edited) stays ready; only empty ones show the pending/error state
    await q(`update round_recap set status=case when coalesce(transcript,'')<>'' then 'ready' else $2 end, error=case when coalesce(transcript,'')<>'' then null else $3 end, updated_at=now() where id=$1`,
      [id, off ? "pending_ai" : "error", off ? AI_OFF_MSG : "No se pudo transcribir el audio. Probá de nuevo o escribí cómo te fue."]);
    return shape(await ownRecap(userId, id));
  }
  if (!tr.text) {
    await q(`update round_recap set status='error', error=$2, duration_s=$3, updated_at=now() where id=$1`, [id, "No se escuchó nada en el audio.", tr.duration]);
    return shape(await ownRecap(userId, id));
  }
  const s = await structure(tr.text, context);
  await q(`update round_recap set status='ready', error=null, transcript=$2, summary=$3, mistakes=$4, positives=$5, source=$6, model=$7, duration_s=$8, updated_at=now() where id=$1`,
    [id, tr.text, s.data.summary, JSON.stringify(s.data.mistakes), JSON.stringify(s.data.positives), s.source, [tr.model, s.model].filter(Boolean).join(" + "), tr.duration]);
  return shape(await ownRecap(userId, id));
}

/** Text-only recap (typed on the web, or the user's own words while AI is off). */
export async function createFromText(userId: string, t: { round_id: string | null; live_round_id: string | null; context?: string }, b: any) {
  const text = String(b?.transcript ?? "").trim().slice(0, 12_000);
  const c = clientStructured(b);
  if (!c && text.length < 3) throw new HttpError(400, "Contá un poco más");
  if (c && !text && !c.data.summary && !c.data.mistakes.length && !c.data.positives.length) throw new HttpError(400, "La nota está vacía");
  // client-structured (iPhone on-device) is stored as-is; plain text goes through the keyword tagger (server AI only if RECAP_SERVER_AI=on)
  const s = c ? { data: c.data, source: c.source, model: c.model } : await structure(text, t.context);
  const prev = await existing(userId, t);
  const vals = [text || null, s.data.summary, JSON.stringify(s.data.mistakes), JSON.stringify(s.data.positives), s.source, s.model, c?.duration ?? null];
  // a new text/client recap keeps an existing audio (e.g. uploaded first, transcribed on the phone afterwards)
  const [row] = prev
    ? await q(`update round_recap set status='ready', error=null, transcript=$2, summary=$3, mistakes=$4, positives=$5, source=$6, model=$7, duration_s=coalesce($8, duration_s), edited_at=case when $6 in ('ios_on_device','web_mic') then null else now() end, updated_at=now() where id=$1 returning ${RECAP_COLS}`, [prev.id, ...vals])
    : await q(`insert into round_recap (user_id, round_id, live_round_id, status, transcript, summary, mistakes, positives, source, model, duration_s) values ($1,$2,$3,'ready',$4,$5,$6,$7,$8,$9,$10) returning ${RECAP_COLS}`, [userId, t.round_id, t.live_round_id, ...vals]);
  return shape(row);
}

/** PATCH: edit any of transcript/summary/mistakes/positives; `restructure:true` re-reads the (edited) transcript. */
export async function editRecap(userId: string, id: string, b: any) {
  const r = await ownRecap(userId, id);
  const transcript = b.transcript != null ? String(b.transcript).slice(0, 12_000) : r.transcript;
  let cur: Structured = normalizeStructured({ summary: b.summary ?? r.summary, mistakes: b.mistakes ?? r.mistakes, positives: b.positives ?? r.positives });
  const c = clientStructured(b);
  let source = c ? c.source : r.source, model = c && (c.source === "ios_on_device" || c.source === "web_mic") ? c.model : r.model;
  if (b.restructure && transcript?.trim()) {
    const ctx = r.round_id ? (await target(userId, { round_id: r.round_id })).context : undefined;
    const s = await structure(transcript, ctx); cur = s.data; source = s.source; model = s.model;
  }
  const [u] = await q(`update round_recap set transcript=$2, summary=$3, mistakes=$4, positives=$5, source=$6, model=$7, status=case when ($2::text is not null and length($2::text)>0) or $8 then 'ready' else status end,
      error=case when ($2::text is not null and length($2::text)>0) or $8 then null else error end, edited_at=now(), updated_at=now() where id=$1 returning ${RECAP_COLS}`,
    [id, transcript, cur.summary, JSON.stringify(cur.mistakes), JSON.stringify(cur.positives), source, model, !!c]);
  return shape(u);
}

export async function recurringFor(userId: string, lastN: number) {
  const rows = await q(`select coalesce(rr.round_id::text, rr.live_round_id::text) as round_key, coalesce(r.date, l.date)::text as date, rr.mistakes
    from round_recap rr left join round r on r.id=rr.round_id left join live_round l on l.id=rr.live_round_id
    where rr.user_id=$1 and rr.status='ready'`, [userId]);
  return recurring(rows as any, lastN);
}
