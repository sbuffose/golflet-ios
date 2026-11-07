import { handle, json, requireUser, HttpError } from "@/lib/http";
import { addContent } from "@/lib/profesor-sessions";
/** Profesor assigns: { kind: "link", title, url (https), body? } | { kind: "tip", title, body }. kind "video" → 402 (student Premium) / 503 (storage). */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const u = await requireUser(req); const { id } = await ctx.params; let b: any; try { b = await req.json(); } catch { throw new HttpError(400, "JSON inválido"); }
  return json({ content: await addContent(u.id, id, b) }, 201);
});
