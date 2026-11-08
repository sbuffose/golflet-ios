import { handle, json, requireUser, HttpError } from "@/lib/http";
import { q } from "@/lib/db";
import { body } from "@/lib/accounts";
import { LIVE_COLS, ownLive, shotsWithDistances } from "@/lib/live";
import { shape, RECAP_COLS } from "@/lib/recap";
import { cleanMod, cleanPlayers, paceModality } from "@/lib/pace-core";
import { torneoForLive } from "@/lib/torneo";

type Ctx = { params: Promise<{ id: string }> };
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req); const { id } = await ctx.params;
  const l = await ownLive(user.id, id);
  const [rc] = await q(`select ${RECAP_COLS} from round_recap where live_round_id=$1`, [id]);
  return json({ live_round: l, shots: await shotsWithDistances(l), recap: shape(rc), torneo: await torneoForLive(user.id, l) });
});
/** { tournament_mode?: true|false|null (null = automático), no_distance_rule?: boolean, current_hole?, ended?: true (sets ended_at=now), ended_at?: ISO|null, tee?, players? (1-4), modality? (medal|stableford|match|fourball or club text) } */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req); const { id } = await ctx.params; await ownLive(user.id, id);
  const b = await body<any>(req);
  if (b.current_hole != null && !(Number.isInteger(+b.current_hole) && +b.current_hole >= 1 && +b.current_hole <= 18)) throw new HttpError(400, "Hoyo inválido");
  const ended = b.ended === true ? new Date().toISOString() : b.ended_at === null || b.ended === false ? null : b.ended_at ? new Date(b.ended_at).toISOString() : undefined;
  const players = b.players == null ? null : cleanPlayers(b.players); if (b.players != null && players == null) throw new HttpError(400, "players: 1 a 4");
  const modality = b.modality == null || b.modality === "" ? null : (cleanMod(b.modality) ?? paceModality(String(b.modality)));
  const tm = "tournament_mode" in b, nd = "no_distance_rule" in b;
  if (tm && b.tournament_mode !== null && typeof b.tournament_mode !== "boolean") throw new HttpError(400, "tournament_mode: true, false o null");
  if (nd && typeof b.no_distance_rule !== "boolean") throw new HttpError(400, "no_distance_rule: true o false");
  if (tm || nd) await q(`update live_round set tournament_mode=case when $2 then $3::boolean else tournament_mode end, no_distance_rule=case when $4 then $5::boolean else no_distance_rule end, updated_at=now() where id=$1`,
    [id, tm, tm ? b.tournament_mode : null, nd, nd ? b.no_distance_rule : false]).catch((e: any) => { if (e?.code === "42703") throw new HttpError(503, "El modo torneo manual se habilita en unos minutos. Mientras tanto se activa solo con tu reserva del torneo."); throw e; });
  await q(`update live_round set current_hole=coalesce($2, current_hole), tee=coalesce($3, tee), ended_at=case when $4::boolean then $5::timestamptz else ended_at end,
             players=coalesce($6, players), modality=coalesce($7, modality), updated_at=now() where id=$1`,
    [id, b.current_hole ?? null, b.tee ?? null, ended !== undefined, ended ?? null, players, modality]);
  const [l] = await q(`select ${LIVE_COLS} from live_round l where l.id=$1`, [id]);
  return json({ live_round: l, torneo: await torneoForLive(user.id, l) });
});
export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req); const { id } = await ctx.params; await ownLive(user.id, id);
  await q(`delete from live_round where id=$1 and user_id=$2`, [id, user.id]);
  return json({ ok: true });
});
