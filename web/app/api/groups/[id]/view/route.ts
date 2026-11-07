import { handle, json, requireUser, HttpError } from "@/lib/http";
import { loadGroup } from "@/lib/groups";
import { getView, setView, setShareOverride, VIEW_METRICS, VIEW_SECTIONS } from "@/lib/group-share";
type C = { params: Promise<{ id: string }> };
/** GET (members) → MY view of this group: { view:{metrics,sections,range,course}, share_override, options }. Only I can change it. */
export const GET = handle(async (req: Request, ctx: C) => {
  const u = await requireUser(req); const { id } = await ctx.params; await loadGroup(id, u.id, "member");
  return json({ ...(await getView(id, u.id)), options: { metrics: VIEW_METRICS, sections: VIEW_SECTIONS, ranges: ["1m", "3m", "6m", "12m", "all"] } });
});
/** PUT { view: { metrics?: [ordered], sections?: [ordered], range?, course? } } | { reset: true } | { share_override: {...} | null } */
export const PUT = handle(async (req: Request, ctx: C) => {
  const u = await requireUser(req); const { id } = await ctx.params; await loadGroup(id, u.id, "member");
  let b: any; try { b = await req.json(); } catch { throw new HttpError(400, "JSON inválido"); }
  const out: any = {};
  if (b && "share_override" in b) Object.assign(out, await setShareOverride(id, u.id, b.share_override));
  if (b?.view || b?.reset) Object.assign(out, await setView(id, u.id, b));
  if (!Object.keys(out).length) throw new HttpError(400, "Mandá view, reset o share_override.");
  return json(out);
});
