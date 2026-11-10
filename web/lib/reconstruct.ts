/** Persist a round the player reconstructs after playing it.
 *  The official club card (table round) is never updated. A chosen round id is only stored on the live row. */
import { q } from "./db";
import { HttpError } from "./http-error";
import { isUndefinedColumn, isUndefinedTable, type Sql } from "./scorecard-lease";
import { INTENTS, LIES, RESULTS } from "./shots-calc";
import { placeShot, ReconstructInputError, type PlacedShot } from "./reconstruct-core";
import { slug } from "./viewmaster-parse";

export class ReconstructSchemaError extends Error {
  constructor() {
    super("Falta aplicar web/db/migrations/0043_manual_shots.sql antes de guardar un golpe sin coordenadas.");
    this.name = "ReconstructSchemaError";
  }
}

const schema = (e: unknown) =>
  isUndefinedColumn(e, "origin") || isUndefinedColumn(e, "end_lat") || isUndefinedColumn(e, "distance_kind")
  || isUndefinedColumn(e, "penalty_strokes") || isUndefinedColumn(e, "end_source") || isUndefinedColumn(e, "distance_m") || isUndefinedColumn(e, "intent")
  || (e as { code?: string })?.code === "23502";

function wrap(sql?: Sql): Sql {
  const run = sql ?? ((text, params) => q(text, params ?? []));
  return async (text, params = []) => {
    try { return await run(text, params); }
    catch (e) {
      if (schema(e) || isUndefinedTable(e, "live_round") || isUndefinedTable(e, "shot")) throw new ReconstructSchemaError();
      throw e;
    }
  };
}

export type ManualRoundInput = {
  userId: string;
  date: string;
  clubCode: string;
  vmCourse: string;
  course: string;
  clubId: number | null;
  roundId: string | null;
};

const dayOk = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

export async function createManualRound(input: ManualRoundInput, sql?: Sql) {
  const db = wrap(sql);
  if (!dayOk(input.date)) throw new HttpError(400, "Fecha inválida");
  const today = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  if (input.date > today) throw new HttpError(400, "La fecha no puede ser futura");
  if (!input.clubCode || !input.course) throw new HttpError(400, "Elegí la cancha");
  let roundId: string | null = null;
  if (input.roundId) {
    const [owned] = await db(`select r.id from round r join club_account a on a.id=r.club_account_id where r.id=$1 and a.user_id=$2`, [input.roundId, input.userId]);
    if (!owned) throw new HttpError(404, "No encontrado");
    roundId = String(owned.id);
  }
  const [row] = await db(`insert into live_round (user_id, club_code, vm_course, club_id, course, date, current_hole, origin, ended_at, round_id)
    values ($1,$2,$3,$4,$5,$6,1,'manual',now(),$7)
    returning id, date::text as date, course, club_code, vm_course, round_id, origin`, [
    input.userId, input.clubCode, input.vmCourse, input.clubId, input.course, input.date, roundId,
  ]);
  return {
    id: String(row.id),
    date: String(row.date).slice(0, 10),
    course: String(row.course),
    club_code: String(row.club_code),
    vm_course: String(row.vm_course),
    course_id: slug(String(row.club_code), String(row.vm_course)),
    round_id: row.round_id ? String(row.round_id) : null,
    origin: "manual",
  };
}

export async function liveOrigin(userId: string, liveId: string, sql?: Sql): Promise<"manual" | "live" | "absent"> {
  const run = sql ?? ((text, params) => q(text, params ?? []));
  if (!/^[0-9a-f-]{36}$/i.test(liveId)) return "absent";
  try {
    const [row] = await run(`select origin from live_round where id=$1 and user_id=$2`, [liveId, userId]);
    if (!row) return "absent";
    return row.origin === "manual" ? "manual" : "live";
  } catch (e) {
    if (isUndefinedColumn(e, "origin")) return "live";
    throw e;
  }
}

function shotFields(body: any) {
  let placed: PlacedShot;
  try { placed = placeShot(body); }
  catch (e) { if (e instanceof ReconstructInputError) throw new HttpError(400, e.message); throw e; }
  const hole = Number(body.hole);
  if (!Number.isInteger(hole) || hole < 1 || hole > 18) throw new HttpError(400, "Hoyo inválido");
  const club = body.club == null || body.club === "" ? null : String(body.club).slice(0, 8);
  const lie = body.lie == null || body.lie === "" ? null : String(body.lie);
  const result = body.result == null || body.result === "" ? null : String(body.result);
  if (lie && !(LIES as readonly string[]).includes(lie)) throw new HttpError(400, "lie inválido");
  if (result && !(RESULTS as readonly string[]).includes(result)) throw new HttpError(400, "result inválido");
  const intent = body.intent == null || body.intent === "" ? null : String(body.intent);
  if (intent && !(INTENTS as readonly string[]).includes(intent)) throw new HttpError(400, "intent inválido");
  return { placed, hole, club, lie, result, intent, clientId: body.client_id ? String(body.client_id).slice(0, 80) : null };
}

export async function saveManualShot(userId: string, liveId: string, body: any, sql?: Sql) {
  const db = wrap(sql);
  if (await liveOrigin(userId, liveId, db) !== "manual") throw new HttpError(404, "No encontrado");
  const shot = shotFields(body);
  const [row] = await db(`insert into shot (live_round_id, user_id, client_id, hole, shot_number, lat, lng, accuracy_m, taken_at, club, lie, result, source, end_lat, end_lng, end_source, penalty_strokes, distance_m, distance_kind, intent)
    values ($1,$2,$3,$4, coalesce($5, (select coalesce(max(shot_number),0)+1 from shot where live_round_id=$1 and hole=$4)), $6,$7,null,now(),$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    returning id, hole, shot_number`, [
    liveId, userId, shot.clientId, shot.hole, body.shot_number ?? null,
    shot.placed.lat, shot.placed.lng, shot.club, shot.lie, shot.result, shot.placed.source,
    shot.placed.end_lat, shot.placed.end_lng, shot.placed.end_source, shot.placed.penalty_strokes, shot.placed.distance_m, shot.placed.distance_kind, shot.intent,
  ]);
  await db(`update live_round set current_hole=$2, updated_at=now() where id=$1 and user_id=$3`, [liveId, shot.hole, userId]);
  return present(row.id, shot);
}

export async function updateManualShot(userId: string, liveId: string, shotId: string, body: any, sql?: Sql) {
  const db = wrap(sql);
  if (!/^[0-9a-f-]{36}$/i.test(shotId) || await liveOrigin(userId, liveId, db) !== "manual") throw new HttpError(404, "No encontrado");
  const [existing] = await db(`select s.id from shot s where s.id=$1 and s.user_id=$2 and s.live_round_id=$3`, [shotId, userId, liveId]);
  if (!existing) throw new HttpError(404, "No encontrado");
  const shot = shotFields({ ...body, hole: body.hole ?? 1 });
  const hole = body.hole == null ? null : shot.hole;
  const rows = await db(`update shot set lat=$2, lng=$3, source=$4, end_lat=$5, end_lng=$6, end_source=$7, penalty_strokes=$8, distance_m=$9, distance_kind=$10,
      club=coalesce($11, club), lie=$12, result=$13, hole=coalesce($14, hole), accuracy_m=null, updated_at=now()
    where id=$1 and user_id=$15 and live_round_id=$16 returning id`, [
    shotId, shot.placed.lat, shot.placed.lng, shot.placed.source, shot.placed.end_lat, shot.placed.end_lng, shot.placed.end_source,
    shot.placed.penalty_strokes, shot.placed.distance_m, shot.placed.distance_kind, shot.club, shot.lie, shot.result, hole, userId, liveId,
  ]);
  if (!rows.length) throw new HttpError(404, "No encontrado");
  return present(shotId, shot);
}

export async function deleteManualShot(userId: string, liveId: string, shotId: string, sql?: Sql) {
  const db = wrap(sql);
  if (!/^[0-9a-f-]{36}$/i.test(shotId) || await liveOrigin(userId, liveId, db) !== "manual") throw new HttpError(404, "No encontrado");
  const rows = await db(`delete from shot where id=$1 and user_id=$2 and live_round_id=$3 returning id`, [shotId, userId, liveId]);
  if (!rows.length) throw new HttpError(404, "No encontrado");
  return { ok: true };
}

export async function listManualShots(userId: string, liveId: string, sql?: Sql) {
  const db = wrap(sql);
  if (await liveOrigin(userId, liveId, db) !== "manual") throw new HttpError(404, "No encontrado");
  const rows = await db(`select id, hole, shot_number, lat, lng, club, lie, result, source, end_lat, end_lng, end_source, penalty_strokes, distance_m, distance_kind
    from shot where live_round_id=$1 and user_id=$2 order by hole, shot_number`, [liveId, userId]);
  return rows.map(presentRow);
}

function present(id: string, shot: ReturnType<typeof shotFields>) {
  return { id: String(id), hole: shot.hole, club: shot.club, lie: shot.lie, result: shot.result, ...shot.placed };
}

function presentRow(row: any) {
  const manual = row.distance_kind === "manual";
  let placed: PlacedShot;
  try {
    placed = placeShot({
      lat: row.lat, lng: row.lng, end_lat: row.end_lat, end_lng: row.end_lng,
      distance_m: manual ? row.distance_m : (row.distance_kind === "estimated" && row.lat == null ? row.distance_m : null),
      distance_kind: manual ? "manual" : undefined,
      penalty_strokes: row.penalty_strokes,
    });
  } catch {
    placed = placeShot({ lat: row.lat, lng: row.lng, end_lat: row.end_lat, end_lng: row.end_lng, penalty_strokes: row.penalty_strokes });
  }
  const kind = manual && placed.distance_kind === "manual" ? "manual" : (row.distance_kind || placed.distance_kind);
  const meters = row.distance_m == null ? placed.distance_m : Number(row.distance_m);
  return {
    id: String(row.id), hole: Number(row.hole), shot_number: Number(row.shot_number),
    club: row.club, lie: row.lie, result: row.result,
    ...placed,
    distance_m: meters,
    distance_kind: kind,
    distance_label: kind === "manual" ? "A mano" : kind === "estimated" ? "Distancia estimada" : placed.distance_label,
  };
}
