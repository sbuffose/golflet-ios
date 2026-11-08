/** t154u: Notificaciones. Items are derived on read (no fan-out copies):
 *  - group_invite: cmp_member rows with status 'invited' for this user (matrícula invitations; a share link joins directly, so it never waits here).
 *  - club_message: admin-written messages for clubs the user is linked to (club_account), from 30 days before they linked onward.
 *  Read state lives in notification_read (user_id, item_key). */
import { q } from "./db";
import { linkPendingInvites, publicNames, photoUrl } from "./groups";
import { parseMarkRead, type Kind } from "./notifications-core";
import { HttpError } from "./http-error";

export type Notification = { id: string; kind: Kind; title: string; body: string | null; created_at: string; read: boolean;
  group?: { id: string; name: string; invited_by: string; members: number; photo_url: string | null }; club?: { id: number; name: string }; link?: string };

const CLUB_MSGS = `select m.id, m.title, m.body, m.created_at, c.id club_id, c.name club_name from club_message m join club c on c.id=m.club_id
  where m.withdrawn_at is null and m.created_at >= (select min(a.created_at) - interval '30 days' from club_account a where a.user_id=$1 and a.club_id=m.club_id)`;
const INVITES = `select m.id, m.invited_at created_at, m.invited_by, g.id group_id, g.name, g.photo_updated_at, (g.photo is not null) has_photo,
  (select count(*)::int from cmp_member x where x.group_id=g.id and x.status='accepted') members
  from cmp_member m join cmp_group g on g.id=m.group_id where m.user_id=$1 and m.status='invited'`;

// t162u: "Bandera mal registrada" reports go to Golflet admins (user_role admin), last 30 days. The reporter is never named here.
const PIN_REPORTS = `select r.id, r.created_at, r.hole, r.vm_course, r.date::text date, r.status, c.name club_name from pin_report r left join club c on c.code=r.club_code
  where exists (select 1 from user_role ur where ur.user_id=$1 and ur.role='admin') and r.created_at > now() - interval '30 days'`;
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s-])\S/g, x => x.toUpperCase());
const STATUS_TXT: Record<string, string> = { open: "Sin revisar", cleared: "Bandera borrada", moved: "Bandera movida", dismissed: "Descartado" };

export async function listNotifications(userId: string, limit = 50): Promise<{ unread_count: number; items: Notification[] }> {
  await linkPendingInvites(userId);
  const [msgs, inv, reads, pins] = await Promise.all([q(CLUB_MSGS + ` order by m.created_at desc limit ${limit}`, [userId]), q(INVITES, [userId]),
    q(`select item_key from notification_read where user_id=$1`, [userId]), q(PIN_REPORTS + ` order by r.created_at desc limit ${limit}`, [userId])]);
  const read = new Set(reads.map((r: any) => r.item_key));
  const names = await publicNames([...new Set(inv.map((r: any) => r.invited_by).filter(Boolean))] as string[]);
  const items: Notification[] = [
    ...inv.map((r: any) => { const by = names.get(r.invited_by) || "Un jugador", id = `group_invite:${r.id}`;
      return { id, kind: "group_invite" as const, title: `${by} te invitó a «${r.name}»`, body: null, created_at: new Date(r.created_at).toISOString(), read: read.has(id),
        group: { id: r.group_id, name: r.name, invited_by: by, members: r.members, photo_url: photoUrl({ id: r.group_id, has_photo: r.has_photo, photo_updated_at: r.photo_updated_at }) } }; }),
    ...msgs.map((r: any) => { const id = `club_message:${r.id}`;
      return { id, kind: "club_message" as const, title: r.title, body: r.body || null, created_at: new Date(r.created_at).toISOString(), read: read.has(id), club: { id: r.club_id, name: r.club_name } }; }),
    ...pins.map((r: any) => { const id = `pin_report:${r.id}`;
      return { id, kind: "pin_report" as const, title: `Bandera mal registrada · ${titleCase(r.vm_course)} hoyo ${r.hole}`,
        body: `Un jugador reportó que la bandera de hoy (${r.date.split("-").reverse().join("/")}) no está donde dice Golflet. Estado: ${STATUS_TXT[r.status] || r.status}.`,
        created_at: new Date(r.created_at).toISOString(), read: read.has(id), club: r.club_name ? { id: 0, name: r.club_name } : undefined, link: `/admin/banderas/${r.id}` }; }),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
  return { unread_count: await unreadCount(userId, read), items };
}

export async function unreadCount(userId: string, readSet?: Set<string>): Promise<number> {
  if (!readSet) await linkPendingInvites(userId);
  const [r] = await q(`select
     (select count(*)::int from (${INVITES}) i where not exists (select 1 from notification_read n where n.user_id=$1 and n.item_key='group_invite:'||i.id))
   + (select count(*)::int from (${CLUB_MSGS}) c where not exists (select 1 from notification_read n where n.user_id=$1 and n.item_key='club_message:'||c.id))
   + (select count(*)::int from (${PIN_REPORTS}) p where not exists (select 1 from notification_read n where n.user_id=$1 and n.item_key='pin_report:'||p.id)) n`, [userId]);
  return r.n;
}

export async function getNotification(userId: string, id: string) {
  const { items } = await listNotifications(userId, 500); return items.find(i => i.id === id) ?? null;
}

/** Marks as read only items the user can actually see (others are ignored). */
export async function markRead(userId: string, body: unknown) {
  const p = parseMarkRead(body); const { items } = await listNotifications(userId, 500);
  const visible = new Set(items.map(i => i.id)), keys = "all" in p ? [...visible] : p.ids.filter(k => visible.has(k));
  if (keys.length) await q(`insert into notification_read (user_id, item_key) select $1, unnest($2::text[]) on conflict do nothing`, [userId, keys]);
  return { ok: true, marked: keys.length, unread_count: await unreadCount(userId) };
}

/* ---------- admin ---------- */
export async function adminListClubMessages() {
  return { messages: await q(`select m.id, m.club_id, c.name club_name, m.title, m.body, m.created_at, m.withdrawn_at,
      (select count(distinct a.user_id)::int from club_account a where a.club_id=m.club_id and a.user_id is not null) recipients,
      (select count(*)::int from notification_read n where n.item_key='club_message:'||m.id) reads
    from club_message m join club c on c.id=m.club_id order by m.created_at desc limit 200`) };
}
export async function adminCreateClubMessage(adminId: string, p: { club_id: number; title: string; body: string }) {
  const [c] = await q(`select id from club where id=$1`, [p.club_id]); if (!c) throw new HttpError(404, "Club no encontrado");
  const [m] = await q(`insert into club_message (club_id, title, body, created_by) values ($1,$2,$3,$4) returning id, club_id, title, created_at`, [p.club_id, p.title, p.body, adminId]);
  return { message: m };
}
export async function adminWithdrawClubMessage(id: string) {
  const [m] = await q(`update club_message set withdrawn_at=coalesce(withdrawn_at, now()) where id=$1 returning id, title, withdrawn_at`, [id]); return m ?? null;
}
