import { handle, json, requireUser, HttpError } from "@/lib/http";
import { q } from "@/lib/db";
import { clubInitials, clubLogo } from "@/lib/club-logos";

/**
 * Live progress of a sync started with { progress_id }. Only visible to the user who started it.
 * v4 adds (all optional, older clients ignore them): club_code, club_logo (static path or null), club_initials
 * (monogram fallback) and stats (live counters of the cards read so far, see lib/sync-stats.ts).
 */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req); const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "No encontrado");
  const [p] = await q(`select club, club_index, club_count, stage, done, total, list_total, finished, error, updated_at, club_code, stats from sync_progress where id=$1 and user_id=$2`, [id, user.id]);
  if (!p) throw new HttpError(404, "No encontrado");
  const isApp = !p.club || p.club === "Golfistics App" || p.club === "tus clubes";
  const [up] = p.club_code ? await q(`select updated_at from club_logo where club_code=$1`, [p.club_code]) : [];
  const logo = up ? `/api/club-logo/${p.club_code}?v=${+new Date(up.updated_at)}` : clubLogo(p.club_code);
  return json({ progress: { ...p, club_logo: logo, club_initials: isApp ? null : clubInitials(p.club), stats: p.stats ?? null } });
});
