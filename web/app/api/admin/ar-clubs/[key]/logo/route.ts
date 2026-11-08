import { handle, json } from "@/lib/http";
import { adminBody, requireAdmin, requireEditor } from "@/lib/admin";
import { arLogo, clearArLogo, setArLogo } from "@/lib/ar-clubs";

const OK = /^image\/(png|jpeg|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon)$/;
/** Logo del club (subido o importado). SVG se sirve con CSP sin scripts. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ key: string }> }) => {
  await requireEditor(req); const { key } = await ctx.params;
  const r = await arLogo(key); if (!r || !OK.test(r.mime)) return new Response("No encontrado", { status: 404 });
  return new Response(new Uint8Array(r.data), { headers: { "Content-Type": r.mime, "Cache-Control": "private, max-age=3600", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'", "X-Content-Type-Options": "nosniff" } });
});
/** { data_url, tone?: "dark"|"light" } PNG/JPG/WebP ≤ 600 KB */
export const PUT = handle(async (req: Request, ctx: { params: Promise<{ key: string }> }) => { const u = await requireAdmin(req); const { key } = await ctx.params; return json(await setArLogo(u, key, await adminBody(req))); });
export const DELETE = handle(async (req: Request, ctx: { params: Promise<{ key: string }> }) => {
  const u = await requireAdmin(req); const { key } = await ctx.params;
  if (!(req.headers.get("content-type") || "").includes("application/json")) return json({ error: "Mandá JSON" }, 415);
  return json(await clearArLogo(u, key));
});
