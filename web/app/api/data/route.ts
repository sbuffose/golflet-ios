import { getRole } from "@/lib/admin";
import { handle, json, requireUser } from "@/lib/http";
import { buildData } from "@/lib/data";
import { linkLiveRounds } from "@/lib/live";
import { q } from "@/lib/db";
import { callName } from "@/lib/person-name";
import { linkPendingInvites } from "@/lib/groups";
import { profilePhotoUrl } from "@/lib/profile-photo";

export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  await linkLiveRounds(user.id).catch(() => 0);
  await linkPendingInvites(user.id);
  const [role, pending, pref] = await Promise.all([getRole(user.id), q(`select 1 from golfistics_pending where user_id=$1 and created_at > now() - interval '1 day'`, [user.id]).catch(() => []),
    q(`select call_name from user_pref where user_id=$1`, [user.id]).catch(() => [])]);
  const data = await buildData(user.id);
  const call_name = pref[0]?.call_name ?? null;
  const first_name = callName({ chosen: call_name, accountName: user.name, golfistics: data.player?.name });
  const [inv] = await q(`select count(*)::int n from cmp_member where user_id=$1 and status='invited'`, [user.id]).catch(() => [{ n: 0 }]);
  const photo_url = await profilePhotoUrl(user.id);
  return json({ user: { ...user, is_admin: role === "admin", role, pending_first_sync: pending.length > 0, first_name, call_name, photo_url, group_invitations: inv?.n ?? 0 }, ...data });
});
