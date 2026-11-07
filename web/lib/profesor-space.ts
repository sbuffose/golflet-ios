/** The profesor's own space: profile, students (only those sharing), per-student view within "Qué comparto", post-round audios
 *  only with "Puede escuchar mis audios post juego". NEVER: tee times, bookings, notes, recap text, strategy. */
import { q } from "./db";
import { HttpError } from "./http-error";
import { cleanProfile } from "./profesor-core";
import { profesorCanSee, event } from "./profesores";
import { getSharePrefs } from "./group-share";
import { memberRounds, memberStats, shareMember, publicNames } from "./groups";

export async function myProfesorProfile(userId: string) {
  const [p] = await q(`select user_id, display_name, bio, method, locations, availability, levels, price_min, price_max, formats, phone, verified, account_status, active, created_at, updated_at from profesor_profile where user_id=$1`, [userId]);
  return p || null;
}
export async function requireProfesor(userId: string) {
  const p = await myProfesorProfile(userId);
  if (!p) throw new HttpError(403, "Esta cuenta no es de profesor");
  if (p.account_status !== "active") throw new HttpError(403, "Tu cuenta está pendiente de activación");
  return p;
}
export async function updateMyProfile(userId: string, body: any) {
  const cur = await requireProfesor(userId), o = cleanProfile(body, cur);
  const keys = Object.keys(o); if (!keys.length) return cur;
  const sets = keys.map((k, i) => `${k}=$${i + 2}`).join(", ");
  await q(`update profesor_profile set ${sets}, updated_at=now() where user_id=$1`, [userId, ...keys.map(k => (k === "availability" || k === "levels" ? JSON.stringify(o[k]) : o[k]))]);
  return myProfesorProfile(userId);
}

export async function myStudents(profId: string) {
  await requireProfesor(profId);
  const rows = await q(`select player_id, can_hear_audio, created_at, updated_at from player_profesor where profesor_id=$1 and can_view_metrics order by created_at`, [profId]);
  const names = await publicNames(rows.map((r: any) => r.player_id));
  return rows.map((r: any) => ({ player_id: r.player_id, name: names.get(r.player_id) || "Jugador", can_hear_audio: r.can_hear_audio, linked_at: r.created_at }));
}

export async function studentView(profId: string, playerId: string) {
  await requireProfesor(profId);
  if (!(await profesorCanSee(profId, playerId, "metrics"))) throw new HttpError(404, "Este jugador no comparte sus métricas con vos");
  const [{ prefs }, names, mr] = await Promise.all([getSharePrefs(playerId), publicNames([playerId]), memberRounds(playerId)]);
  const byCourse = [...mr.rounds.reduce((m, r) => m.set(r.course_key, [...(m.get(r.course_key) || []), r]), new Map<string, any[]>()).entries()]
    .map(([k, rs]) => ({ course_key: k, label: rs[0].course_label, ...memberStats(rs) })).sort((a, b) => b.rounds - a.rounds).slice(0, 6)
    .map(c => ({ course_key: c.course_key, label: c.label, rounds: c.rounds, avg_gross: c.avg_gross, best_gross: c.best_gross }));
  const st = memberStats(mr.rounds);
  const m = shareMember({ player_id: playerId, name: names.get(playerId) || "Jugador" }, st, prefs, { hi: mr.hi, by_course: byCourse });
  // recent cards only when scores are shared: date, course, gross/net (no tournament notes, no tee times)
  if (prefs.scores) m.recent = mr.rounds.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 10).map(r => ({ date: r.date, course_label: r.course_label, gross: r.gross, net: r.net }));
  const [l] = await q(`select can_hear_audio from player_profesor where player_id=$1 and profesor_id=$2`, [playerId, profId]);
  m.can_hear_audio = !!l?.can_hear_audio;
  m.always_private = ["Notas de voz (salvo audios post juego si lo activó)", "Notas de cada ronda", "Estrategia de la cancha", "Tee times y reservas"];
  await event(profId, "view.student", playerId, profId);
  return m;
}

export async function studentAudios(profId: string, playerId: string) {
  await requireProfesor(profId);
  if (!(await profesorCanSee(profId, playerId, "audio"))) throw new HttpError(404, "Este jugador no comparte sus audios post juego con vos");
  return q(`select rr.id, coalesce(r.date::text, to_char(rr.created_at at time zone 'America/Argentina/Buenos_Aires','YYYY-MM-DD')) date, r.course course_label, rr.duration_s, rr.audio_mime
            from round_recap rr join recap_audio a on a.recap_id=rr.id left join round r on r.id=rr.round_id
            where rr.user_id=$1 order by rr.created_at desc limit 50`, [playerId]);
}
export async function studentAudio(profId: string, playerId: string, recapId: string) {
  await requireProfesor(profId);
  if (!(await profesorCanSee(profId, playerId, "audio"))) throw new HttpError(404, "Audio no disponible");
  if (!/^[0-9a-f-]{36}$/i.test(recapId)) throw new HttpError(404, "Audio no disponible");
  const [a] = await q(`select a.data, rr.audio_mime from recap_audio a join round_recap rr on rr.id=a.recap_id where rr.id=$1 and rr.user_id=$2`, [recapId, playerId]);
  if (!a) throw new HttpError(404, "Audio no disponible");
  await event(profId, "listen.audio", playerId, profId);
  return a;
}
