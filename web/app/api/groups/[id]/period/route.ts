import { handle, json, requireUser, HttpError } from "@/lib/http";
import { groupPeriod } from "@/lib/group-period";
/** GET ?kind=semana|mes&off=0 → Comparativo: leaderboard + PGA-style boards for one calendar week (Mon–Sun) or month, ART. off = periods back. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const u = await requireUser(req); const { id } = await ctx.params; const s = new URL(req.url).searchParams;
  const kind = s.get("kind") || "semana"; if (kind !== "semana" && kind !== "mes") throw new HttpError(400, "kind tiene que ser semana o mes");
  const off = Number(s.get("off") || 0); if (!Number.isInteger(off) || off < 0) throw new HttpError(400, "off inválido");
  return json(await groupPeriod(id, u.id, kind, off));
});
