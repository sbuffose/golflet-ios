import { handle, json, HttpError } from "@/lib/http";
import { adminBody, requireAdmin } from "@/lib/admin";
import { clearClubLogo, setClubLogo } from "@/lib/admin-content";

const cid = (s: string) => { const n = Number(s); if (!Number.isInteger(n) || n < 1) throw new HttpError(404, "Club no encontrado"); return n; };
/** { data_url: "data:image/png;base64,…" } (PNG/JPG/WebP, max 600 KB) */
export const PUT = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const u = await requireAdmin(req); const { id } = await ctx.params;
  return json(await setClubLogo(u, cid(id), await adminBody(req)));
});
export const DELETE = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const u = await requireAdmin(req); const { id } = await ctx.params;
  if (!(req.headers.get("content-type") || "").includes("application/json")) return json({ error: "Mandá JSON" }, 415);
  return json(await clearClubLogo(u, cid(id)));
});
