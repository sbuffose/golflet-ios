import { handle, json } from "@/lib/http";
import { requireAdmin, audit } from "@/lib/admin";
import { setVideos } from "@/lib/explainers";
/** Admin only: PUT { instagram, tiktok, youtube, x } (each https on its own domain, or empty to clear). */
export const PUT = handle(async (req: Request, ctx: { params: Promise<{ key: string }> }) => {
  const u = await requireAdmin(req); const { key } = await ctx.params; const r = await setVideos(key, await req.json().catch(() => null), u.email || u.id);
  await audit(u as any, "explainer_video.update", { type: "explainer", id: key }, `Videos de "${key}": ${Object.entries(r.urls).filter(([, v]) => v).map(([k]) => k).join(", ") || "sin links"}`); return json(r);
});
