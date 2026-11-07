import { q } from "./db";
import { validateSurface, slopeStats, type GreenSurface } from "./green-surface-core";

/** t181u: real green surveys only (table check rejects synthetic). API_v5 §60 "Green surface". */
export async function greenSurfaceHoles(clubCode: string, course: string): Promise<number[]> {
  const r = await q(`select hole from green_surface where club_code=$1 and lower(course)=lower($2) order by hole`, [clubCode, course]);
  return r.map((x: any) => x.hole);
}
export async function getGreenSurface(clubCode: string, course: string, hole: number) {
  const [r] = await q(`select surface, stats, imported_at from green_surface where club_code=$1 and lower(course)=lower($2) and hole=$3`, [clubCode, course, hole]);
  return r ? { ...r.surface, stats: r.stats, imported_at: r.imported_at } : null;
}
export async function importGreenSurface(s: GreenSurface) {
  const err = validateSurface(s); if (err.length) throw new Error(err.join("; "));
  const st = slopeStats(s);
  await q(`insert into green_surface (club_code, course, hole, surface, stats, survey_date, provider)
           values ($1,$2,$3,$4,$5,$6,$7)
           on conflict (club_code, course, hole) do update set surface=excluded.surface, stats=excluded.stats, survey_date=excluded.survey_date, provider=excluded.provider, imported_at=now()`,
    [s.club_code, s.course, s.hole, JSON.stringify(s), JSON.stringify(st), s.source.survey_date, s.source.provider]);
  return st;
}
