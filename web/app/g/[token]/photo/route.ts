import { groupByToken } from "@/lib/group-share";
import { groupPhoto } from "@/lib/groups";
/** Public group photo for a valid share link (Open Graph preview). 404 once the link is disabled or regenerated. */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params; const g = await groupByToken(token);
  const b = g?.has_photo ? await groupPhoto(g.id) : null;
  if (!b) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(b), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" } });
}
