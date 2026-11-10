import { handle, requireUser } from "@/lib/http";
import { memberProfilePhoto } from "@/lib/groups";

type C = { params: Promise<{ id: string; memberId: string }> };

/** JPEG of a group member's profile photo. 404 unless the viewer belongs and the member shares the profile. */
export const GET = handle(async (req: Request, ctx: C) => {
  const u = await requireUser(req);
  const { id, memberId } = await ctx.params;
  const photo = await memberProfilePhoto(id, u.id, memberId);
  return new Response(new Uint8Array(photo), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
});
