import { q } from "@/lib/db";

/** Public: a crest uploaded from the admin (PNG/JPG/WebP only). */
export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  if (!/^\d{1,5}$/.test(code)) return new Response("No encontrado", { status: 404 });
  const [r] = await q(`select mime, data from club_logo where club_code=$1`, [code]);
  if (!r || !/^image\/(png|jpeg|webp)$/.test(r.mime)) return new Response("No encontrado", { status: 404 });
  return new Response(new Uint8Array(r.data), { headers: { "Content-Type": r.mime, "Cache-Control": "public, max-age=86400", "Content-Security-Policy": "default-src 'none'" } });
}
