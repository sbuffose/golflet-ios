import { q } from "./db";
import { buildData } from "./data";
import { applyHolesOverride } from "./course-override";
import { teeHandicaps } from "./tee-times-core";
import { pickExampleHole, findCappedCard, type HoleDef } from "./outliers-core";

/** Personalized net-double-bogey explainer. Never invents: every number comes from the player's cards, the club's course data
 *  or the club's official calculator; the estimate (WHS formula with the course's slope/rating) is labelled as such. */
export async function outliersExplainer(userId: string) {
  const D: any = await buildData(userId);
  const hi = D.player?.handicap_index ?? (D.hi_history || []).at(-1)?.hi ?? null;
  const valid = (D.rounds || []).filter((r: any) => r.valid_card && !r.is_9_holes && !r.other_course && r.holes?.length);
  const clubIds = [...new Set(valid.map((r: any) => r.club_id))];
  const defs = clubIds.length ? await q(`select club_id, name, par, holes, tees, holes_override from course where club_id = any($1)`, [clubIds]) : [];
  const course = new Map<string, any>(defs.map((c: any) => { const holes = c.holes_override ? applyHolesOverride(c.holes || [], c.holes_override) : (c.holes || []); return [`${c.club_id}:${c.name}`, { ...c, holes }]; }));
  const holesOf = (key: string): HoleDef[] | null => { const c = course.get(key); return c?.holes?.length ? c.holes.map((h: any) => ({ hole: h.hole, par: h.par, hcp: h.hcp ?? null })) : null; };
  const newest = valid.slice().sort((a: any, b: any) => (a.date < b.date ? 1 : -1));
  const past = findCappedCard(newest, r => holesOf(r.course_key));

  // most played course + tee
  const cnt = new Map<string, { key: string; tee: string | null; n: number; r: any }>();
  for (const r of valid) { const k = `${r.course_key}|${r.tee || ""}`; const e = cnt.get(k) || { key: r.course_key, tee: r.tee || null, n: 0, r }; e.n++; cnt.set(k, e); }
  const top = [...cnt.values()].sort((a, b) => b.n - a.n)[0] || null;
  let example: any = null, ph: number | null = null, ph_source: "club" | "estimado" | null = null;
  if (top && hi != null) {
    const c = course.get(top.key), [clubId, name] = [Number(top.key.split(":")[0]), top.key.split(":").slice(1).join(":")];
    const [off] = top.tee ? await q(`select p.playing_hcp from playing_hcp p join club_account a on a.id=p.club_account_id where a.user_id=$1 and a.club_id=$2 and lower(p.course)=lower($3) and lower(p.tee)=lower($4) and p.modality='medal18' order by p.fetched_at desc limit 1`, [userId, clubId, name, top.tee]) : [];
    if (off?.playing_hcp != null) { ph = off.playing_hcp; ph_source = "club"; }
    else if (c?.tees && top.tee) { const t = teeHandicaps(+hi, c.par ?? null, c.tees, [], top.tee).find(x => x.tee.toLowerCase() === top.tee!.toLowerCase()); if (t?.course_handicap != null) { ph = t.course_handicap; ph_source = "estimado"; } }
    const h = ph != null ? holesOf(top.key) : null;
    const pick = h ? pickExampleHole(h, ph!) : null;
    if (pick) example = { course_label: top.r.course_label || name, tee: top.tee, rounds_there: top.n, ...pick };
  }
  return {
    rule: "Para el hándicap, cada hoyo cuenta como máximo doble bogey neto: par + 2 + los golpes que recibís en ese hoyo.",
    best8: "Tu índice es el promedio de tus 8 mejores diferenciales de las últimas 20 tarjetas: una tarjeta mala no entra en ese promedio.",
    hi: hi == null ? null : +hi, playing_handicap: ph, playing_handicap_source: ph_source,
    example, past_card: past,
    note: ph_source === "estimado" ? "Hándicap estimado con el slope y el rating de la cancha (tu club no devolvió el oficial)." : null,
  };
}
