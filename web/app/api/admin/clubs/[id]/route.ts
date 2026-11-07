import { handle, json, HttpError } from "@/lib/http";
import { adminBody, requireAdmin } from "@/lib/admin";
import { listClubs, updateClub } from "@/lib/admin-content";

const cid = (s: string) => { const n = Number(s); if (!Number.isInteger(n) || n < 1) throw new HttpError(404, "Club no encontrado"); return n; };
/** { name } */
export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const u = await requireAdmin(req); const { id } = await ctx.params;
  const r = await updateClub(u, cid(id), await adminBody(req));
  return json({ ...r, clubs: await listClubs() });
});
