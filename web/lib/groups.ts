/**
 * Comparison groups ("Amigos"). A player creates a group and invites players by matrícula; nothing is shared until each
 * invitee accepts. Only ACCEPTED members see each other's aggregates. Never exposed: emails, recaps, notes, strategy, raw shots.
 * Every endpoint authorizes on the server through `loadGroup()`.
 */
import { q } from "./db";
import { HttpError } from "./http";
import { buildData } from "./data";
import { allUserShots, userClubs } from "./live";
import { clubStats } from "./shots-calc";
import { callName, titleWord } from "./person-name";
import { effectiveShare, getView, linkInfo, newToken, type Share } from "./group-share";
import { rangeSince, parseRange } from "./metrics";
import { createGroupAtomic } from "./group-create-tx";

export const MAX_MEMBERS = 12, INVITES_PER_DAY = 20, GROUPS_PER_DAY = 10;
/** Member colors: brand greens and golds only (#0F3D2E / #C8A86A first). */
export const PALETTE = ["#0F3D2E", "#C8A86A", "#5E8C6A", "#8C6A2F", "#2F6B55", "#B39257", "#9DB8A6", "#6B5320", "#1F5A45", "#D9C291", "#3E7560", "#A08050"];
export const validMatricula = (m: unknown): m is string => typeof m === "string" && /^\d{3,9}$/.test(m.trim());

export async function event(actor: string, action: string, groupId: string | null, memberId: string | null = null, detail: string | null = null) {
  await q(`insert into cmp_event (actor_id, action, group_id, member_id, detail) values ($1,$2,$3,$4,$5)`, [actor, action, groupId, memberId, detail]).catch(() => {});
}
async function rateLimit(actor: string, action: string, max: number) {
  const [r] = await q(`select count(*)::int n from cmp_event where actor_id=$1 and action=$2 and created_at > now() - interval '24 hours'`, [actor, action]);
  if (r.n >= max) throw new HttpError(429, action === "invite" ? `Llegaste al máximo de ${max} invitaciones por día. Probá mañana.` : `Llegaste al máximo de ${max} grupos por día.`);
}

/** Link invitations sent to a matrícula before its owner had a Golflet account (called on sign-in / data load). */
export async function linkPendingInvites(userId: string) {
  await q(`update cmp_member m set user_id=$1 where m.user_id is null and m.status='invited'
    and m.matricula in (select matricula from club_account where user_id=$1 and matricula is not null)`, [userId]).catch(() => {});
}
async function usersForMatricula(mat: string): Promise<string | null> {
  const [r] = await q(`select user_id from club_account where matricula=$1 and user_id is not null order by last_sync_at desc nulls last limit 1`, [mat]);
  return r?.user_id ?? null;
}
async function myMatriculas(userId: string): Promise<string[]> {
  return (await q(`select distinct matricula from club_account where user_id=$1 and matricula is not null`, [userId])).map((r: any) => r.matricula);
}

/** "Sebastian Buffo": what other members see (first name + first surname from the Golfistics card). */
export async function publicNames(userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>(); if (!userIds.length) return out;
  const rows = await q(`select u.id, u.name, p.call_name, (select a.player_name from club_account a where a.user_id=u.id and a.player_name is not null order by a.id limit 1) player
    from "user" u left join user_pref p on p.user_id=u.id where u.id = any($1)`, [userIds]);
  for (const r of rows) {
    const first = callName({ chosen: r.call_name, accountName: r.name, golfistics: r.player }) || "Jugador";
    const g = String(r.player || "").trim(); let sur = "";
    if (g) sur = g.includes(",") ? g.split(",")[0].trim().split(/\s+/)[0] : (g.split(/\s+/).length > 1 ? g.split(/\s+/)[0] : "");
    out.set(r.id, sur && titleWord(sur) !== first ? `${first} ${titleWord(sur)}` : first);
  }
  return out;
}

export type Member = { member_id: string; user_id: string | null; status: string; matricula: string; invited_at: string; responded_at: string | null; role: "admin" | "member" };
/** Loads a group the viewer may see. need: "member" (accepted) | "admin" (accepted admin; "owner" is an alias) | "invitee" | "any".
 *  WhatsApp-style: the creator starts as admin, any admin can promote/demote; a group always keeps at least one admin. */
export async function loadGroup(groupId: string, viewerId: string, need: "member" | "admin" | "owner" | "invitee" | "any" = "member") {
  if (!/^[0-9a-f-]{36}$/i.test(groupId || "")) throw new HttpError(404, "Grupo no encontrado");
  const [g] = await q(`select id, name, owner_id, created_at, share_token, share_enabled, share_expires_at, photo_updated_at, (photo is not null) has_photo from cmp_group where id=$1`, [groupId]);
  if (!g) throw new HttpError(404, "Grupo no encontrado");
  const members: Member[] = await q(`select id member_id, user_id, status, matricula, invited_at, responded_at, role from cmp_member where group_id=$1 order by invited_at`, [groupId]);
  const me = members.find(m => m.user_id === viewerId);
  const accepted = me?.status === "accepted", invited = me?.status === "invited", isAdmin = accepted && me?.role === "admin";
  const ok = need === "owner" || need === "admin" ? accepted : need === "member" ? accepted : need === "invitee" ? invited : (accepted || invited);
  if (!ok) throw new HttpError(404, "Grupo no encontrado");   // 404, not 403: don't reveal that the group exists
  if ((need === "owner" || need === "admin") && !isAdmin) throw new HttpError(403, "Solo los admins del grupo pueden hacer esto.");
  return { group: g, members, me: me ?? null, isOwner: isAdmin, isAdmin };
}
export const photoUrl = (g: { id: string; has_photo?: boolean; photo_updated_at?: string | null }) =>
  g.has_photo ? `/api/groups/${g.id}/photo?v=${g.photo_updated_at ? new Date(g.photo_updated_at).getTime() : 0}` : null;

export async function listGroups(userId: string) {
  await linkPendingInvites(userId);
  const rows = await q(`select g.id, g.name, g.owner_id, m.status, m.id member_id, m.invited_by, m.role, g.photo_updated_at, (g.photo is not null) has_photo,
      (select count(*)::int from cmp_member x where x.group_id=g.id and x.status='accepted') accepted,
      (select count(*)::int from cmp_member x where x.group_id=g.id and x.status='invited') pending
    from cmp_member m join cmp_group g on g.id=m.group_id where m.user_id=$1 and m.status in ('accepted','invited') order by g.created_at desc`, [userId]);
  const names = await publicNames([...new Set(rows.map((r: any) => r.invited_by).filter(Boolean))] as string[]);
  const groups = rows.filter((r: any) => r.status === "accepted").map((r: any) => ({ id: r.id, name: r.name, is_admin: r.role === "admin", is_owner: r.role === "admin", accepted: r.accepted, pending: r.pending, photo_url: photoUrl(r) }));
  const invitations = rows.filter((r: any) => r.status === "invited").map((r: any) => ({ group_id: r.id, member_id: r.member_id, name: r.name, invited_by: names.get(r.invited_by) || "Un jugador", members: r.accepted, photo_url: photoUrl(r) }));
  const outgoing = await q(`select m.id member_id, m.group_id, g.name group_name, m.matricula, m.invited_at, (m.user_id is not null) is_user
    from cmp_member m join cmp_group g on g.id=m.group_id
    where m.status='invited' and exists (select 1 from cmp_member a where a.group_id=g.id and a.user_id=$1 and a.status='accepted' and a.role='admin') order by m.invited_at desc`, [userId]);
  return { groups, invitations, outgoing };
}

/** Group, owner and ledger commit together. Invites run after that commit and do not create a second group on retry. */
export async function createGroup(userId: string, name: unknown, matriculas: unknown, idemRaw?: unknown) {
  const made = await createGroupAtomic(userId, name, matriculas, idemRaw, undefined, GROUPS_PER_DAY);
  if (made.replay) return made.result;
  const g = made.group!;
  const invited = [];
  for (const m of (Array.isArray(matriculas) ? matriculas : []).slice(0, MAX_MEMBERS - 1)) invited.push(await invite(userId, g.id, m).catch(e => ({ matricula: String(m), error: e.message })));
  return { ...made.result, invited };
}

export async function invite(userId: string, groupId: string, matricula: unknown) {
  const { members } = await loadGroup(groupId, userId, "owner");
  if (!validMatricula(matricula)) throw new HttpError(400, "La matrícula tiene que ser un número.");
  const mat = matricula.trim();
  if ((await myMatriculas(userId)).includes(mat)) throw new HttpError(400, "Esa es tu matrícula.");
  const live = members.filter(m => m.status === "accepted" || m.status === "invited");
  if (live.length >= MAX_MEMBERS) throw new HttpError(400, `Un grupo puede tener hasta ${MAX_MEMBERS} jugadores.`);
  const ex = members.find(m => m.matricula === mat);
  if (ex && (ex.status === "accepted" || ex.status === "invited")) throw new HttpError(409, ex.status === "accepted" ? "Ya está en el grupo." : "Ya está invitado.");
  await rateLimit(userId, "invite", INVITES_PER_DAY);
  const uid = await usersForMatricula(mat);
  if (uid === userId) throw new HttpError(400, "Esa es tu matrícula.");
  const [m] = await q(`insert into cmp_member (group_id, matricula, user_id, status, invited_by) values ($1,$2,$3,'invited',$4)
    on conflict (group_id, matricula) do update set status='invited', user_id=excluded.user_id, invited_by=excluded.invited_by, invited_at=now(), responded_at=null returning id`, [groupId, mat, uid, userId]);
  await event(userId, "invite", groupId, m.id);
  return { member_id: m.id, matricula: mat, is_user: !!uid };
}

export async function respond(userId: string, groupId: string, accept: boolean) {
  const { me } = await loadGroup(groupId, userId, "invitee");
  await q(`update cmp_member set status=$2, responded_at=now() where id=$1`, [me!.member_id, accept ? "accepted" : "declined"]);
  await event(userId, accept ? "accept" : "decline", groupId, me!.member_id);
  await q(`insert into notification_read (user_id, item_key) values ($1, $2) on conflict do nothing`, [userId, `group_invite:${me!.member_id}`]).catch(() => {});  // t154u
  return { ok: true, status: accept ? "accepted" : "declined" };
}
export type LeaveSeat = { member_id: string; status: string; role: string; responded_at?: string | null; invited_at?: string | null };
/** The last accepted member leaves a dormant group. The row stays. Nobody else's cards are removed. */
export function leavePlan(meId: string, members: LeaveSeat[]) {
  const others = members.filter(m => m.status === "accepted" && m.member_id !== meId);
  if (!others.length) return { deleted: false as const, dormant: true as const, remaining: 0, promoted_member_id: null as string | null };
  const promoted = others.some(m => m.role === "admin") ? null
    : others.slice().sort((a, b) => String(a.responded_at || a.invited_at).localeCompare(String(b.responded_at || b.invited_at)))[0].member_id;
  return { deleted: false as const, dormant: false as const, remaining: others.length, promoted_member_id: promoted };
}
/** Any member can leave. The group is never deleted here. A sole admin hands the role to the oldest remaining member. */
export async function leave(userId: string, groupId: string) {
  const { me, members } = await loadGroup(groupId, userId, "member");
  const plan = leavePlan(me!.member_id, members);
  await q(`update cmp_member set status='left', role='member', responded_at=now() where id=$1`, [me!.member_id]);
  await event(userId, "leave", groupId, me!.member_id);
  if (plan.promoted_member_id) {
    await q(`update cmp_member set role='admin' where id=$1`, [plan.promoted_member_id]);
    await event(userId, "role.auto_admin", groupId, plan.promoted_member_id);
  }
  return { ok: true, deleted: false, dormant: plan.dormant, remaining: plan.remaining, promoted_member_id: plan.promoted_member_id };
}
/** A group is not deleted. Each player leaves. Admin check stays so a guest still gets 403, then 409. */
export async function deleteGroup(userId: string, groupId: string) {
  await loadGroup(groupId, userId, "admin");
  throw new HttpError(409, "Un grupo no se borra. Cada jugador sale por su cuenta. El grupo y las tarjetas de los demás se quedan.");
}
/** Admins: make an accepted member admin or remove admin status. A group always keeps at least one admin. */
export async function setRole(userId: string, groupId: string, memberId: string, role: unknown) {
  if (role !== "admin" && role !== "member") throw new HttpError(400, "role tiene que ser admin o member.");
  const { members } = await loadGroup(groupId, userId, "admin");
  const m = members.find(x => x.member_id === memberId && x.status === "accepted"); if (!m) throw new HttpError(404, "No encontrado");
  if (m.role === role) return { ok: true, role };
  if (role === "member" && members.filter(x => x.status === "accepted" && x.role === "admin").length <= 1) throw new HttpError(409, "El grupo tiene que tener al menos un admin.");
  await q(`update cmp_member set role=$2 where id=$1`, [memberId, role]);
  await event(userId, role === "admin" ? "role.admin" : "role.member", groupId, memberId);
  return { ok: true, role };
}
/** Admins: remove an accepted member or revoke a pending invitation. */
export async function removeMember(userId: string, groupId: string, memberId: string) {
  const { members } = await loadGroup(groupId, userId, "owner");
  const m = members.find(x => x.member_id === memberId); if (!m || m.user_id === userId) throw new HttpError(404, "No encontrado");
  if (m.status !== "accepted" && m.status !== "invited") throw new HttpError(409, "Ya no está en el grupo.");
  const st = m.status === "invited" ? "revoked" : "removed";
  await q(`update cmp_member set status=$2, role='member', responded_at=now() where id=$1`, [memberId, st]);
  await event(userId, st === "revoked" ? "revoke" : "remove", groupId, memberId);
  return { ok: true, status: st };
}
export async function renameGroup(userId: string, groupId: string, name: unknown) {
  await loadGroup(groupId, userId, "owner");
  const nm = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
  if (nm.length < 2 || nm.length > 40) throw new HttpError(400, "Poné un nombre de 2 a 40 letras.");
  await q(`update cmp_group set name=$2 where id=$1`, [groupId, nm]); await event(userId, "rename", groupId);
  return { ok: true };
}

/* ---------------- comparison (aggregates only) ---------------- */
import { memberStats, shareMember, type NR } from "./group-stats";
export { memberStats, shareMember };
const r1 = (x: number | null) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

export async function memberRounds(userId: string): Promise<{ rounds: NR[]; hi: number | null; hi_history: { date: string; hi: number }[]; clubs: string[]; courses: Map<string, { label: string; par: number | null; holes: any[] }> }> {
  const d: any = await buildData(userId);
  const courses = new Map<string, { label: string; par: number | null; holes: any[] }>();
  for (const c of d.courses || []) courses.set(c.key, { label: c.course && c.club_name ? (c.label || c.course) : c.label, par: c.par ?? null, holes: (c.holes || []).map((h: any) => ({ hole: h.hole, par: h.par, hcp: h.hcp })) });
  const rounds: NR[] = (d.rounds || []).filter((r: any) => r.valid_card && !r.is_9_holes && r.gross).map((r: any) => ({
    date: r.date, year: String(r.date).slice(0, 4), course_key: r.course_key, course_label: r.course_label || courses.get(r.course_key)?.label || r.course,
    gross: Number(r.gross) || null, net: r.net != null ? Number(r.net) : null, holes: Array.isArray(r.holes) ? r.holes : [],
    putts: r.putts ?? null, gir: r.gir ?? null, fir: r.fir ?? null, round_id: String(r.round_id),
    par: (() => { const hs = Array.isArray(r.holes) ? r.holes : []; const ok = hs.filter((h: any) => h && h[1]); return ok.length === 18 ? ok.reduce((n: number, h: any) => n + Number(h[1]), 0) : (courses.get(r.course_key)?.par ?? null); })() }));
  const hi = d.player?.handicap_index ?? (d.hi_history || []).at(-1)?.hi ?? null;
  const hi_history = (d.hi_history || []).filter((h: any) => h?.date && h.hi != null).map((h: any) => ({ date: String(h.date).slice(0, 10), hi: Number(h.hi) }));
  const clubs = [...new Set((d.course_groups || []).map((g: any) => g.club_name).filter(Boolean))] as string[];
  return { rounds, courses, hi: hi == null ? null : Number(hi), hi_history, clubs };
}
export const colorOf = (members: Member[], memberId: string, i = 0) => PALETTE[members.filter(x => x.status === "accepted").findIndex(x => x.member_id === memberId) % PALETTE.length] || PALETTE[i % PALETTE.length];
export async function groupCompare(groupId: string, viewerId: string, f: { year?: string | null; course?: string | null; members?: string[] | null; range?: string | null }) {
  const { group, members, isAdmin } = await loadGroup(groupId, viewerId, "member");
  const mine = await getView(groupId, viewerId);
  // the member's own saved view applies when the request doesn't say (undefined); course "all" = every course
  if (f.range === undefined && !f.year) f = { ...f, range: mine.view.range };
  if (f.course === undefined) f = { ...f, course: mine.view.course };
  if (f.course === "all") f = { ...f, course: null };
  let acc = members.filter(m => m.status === "accepted" && m.user_id);
  if (f.members?.length) acc = acc.filter(m => f.members!.includes(m.member_id));
  const names = await publicNames(acc.map(m => m.user_id!));
  const share = await effectiveShare(groupId, acc.map(m => m.user_id!));
  const data = await Promise.all(acc.map(async m => ({ m, sh: share.get(m.user_id!)!, ...(await memberRounds(m.user_id!)) })));
  const allYears = new Set<string>(), courseMembers = new Map<string, { label: string; members: Set<string> }>();
  for (const d of data) if (d.sh.scores || d.sh.holes) for (const r of d.rounds) { allYears.add(r.year); const c = courseMembers.get(r.course_key) || { label: r.course_label, members: new Set() }; c.members.add(d.m.member_id); courseMembers.set(r.course_key, c); }
  const range = parseRange(f.range), since = range ? rangeSince(range) : null;
  const filt = (rs: NR[]) => rs.filter(r => (!f.year || r.year === f.year) && (!since || r.date >= since) && (!f.course || r.course_key === f.course));
  const out = data.map((d, i) => {
    const rs = filt(d.rounds);
    const byCourse = Object.entries(rs.reduce((a: any, r) => { a[r.course_key] = (a[r.course_key] || 0) + 1; return a; }, {})).map(([key, n]) => ({ key, label: courseMembers.get(key)?.label || key, rounds: n }));
    return shareMember({ member_id: d.m.member_id, name: names.get(d.m.user_id!) || "Jugador", color: colorOf(members, d.m.member_id, i),
      is_me: d.m.user_id === viewerId, is_admin: d.m.role === "admin", is_owner: d.m.role === "admin" }, memberStats(rs), d.sh, { hi: d.hi, by_course: byCourse });
  });
  // t74u: pelota only for members sharing "ball" (omitted otherwise, never null-filled)
  { const ids = acc.filter(m => share.get(m.user_id!)?.ball).map(m => m.user_id!); if (ids.length) { const bm = await (await import("./ball")).ballsFor(ids);
    out.forEach((o: any, i: number) => { const b = bm.get(data[i].m.user_id!); if (b && share.get(data[i].m.user_id!)?.ball) o.ball = b; }); } }
  // per-club GPS distances: only members sharing "gps", only clubs where at least two of them have data
  const clubs = await Promise.all(acc.map(async m => { if (!share.get(m.user_id!)?.gps) return []; const s = await allUserShots(m.user_id!).catch(() => []); return clubStats(s as any, await userClubs(m.user_id!).catch(() => [])); }));
  const clubMap = new Map<string, { club: string; label: string; members: { member_id: string; median_m: number; shots: number }[] }>();
  clubs.forEach((cs, i) => cs.forEach((c: any) => { const e = clubMap.get(c.club) || { club: c.club as string, label: c.label as string, members: [] as { member_id: string; median_m: number; shots: number }[] }; e.members.push({ member_id: acc[i].member_id, median_m: c.median_m, shots: c.shots }); clubMap.set(c.club, e); }));
  const pending = isAdmin ? members.filter(m => m.status === "invited").map(m => ({ member_id: m.member_id, matricula: m.matricula, invited_at: m.invited_at, is_user: !!m.user_id }))
    : members.filter(m => m.status === "invited").map(m => ({ member_id: m.member_id, invited_at: m.invited_at }));
  return {
    group: { id: group.id, name: group.name, is_admin: isAdmin, is_owner: isAdmin, created_at: group.created_at, photo_url: photoUrl(group), admins: members.filter(m => m.status === "accepted" && m.role === "admin").length,
      ...(isAdmin ? { link: linkInfo(group) } : {}) },
    view: mine.view, share_override: mine.share_override,
    filters: { year: f.year || null, range: range || null, since, course: f.course || null, years: [...allYears].sort().reverse(),
      courses: [...courseMembers.entries()].map(([key, c]) => ({ key, label: c.label, members: c.members.size, shared: c.members.size >= 2 })).sort((a, b) => b.members - a.members) },
    members: out, pending,
    clubs: [...clubMap.values()].filter(c => c.members.length >= 2),
  };
}

/** Per-hole head-to-head on one shared course (18-hole heatmap). */
export async function groupHoles(groupId: string, viewerId: string, course: string, year?: string | null, memberFilter?: string[] | null, range?: string | null) {
  if (range === undefined && !year) range = (await getView(groupId, viewerId)).view.range;
  range = parseRange(range);
  const { members } = await loadGroup(groupId, viewerId, "member");
  let acc = members.filter(m => m.status === "accepted" && m.user_id);
  if (memberFilter?.length) acc = acc.filter(m => memberFilter.includes(m.member_id));
  const names = await publicNames(acc.map(m => m.user_id!));
  const share = await effectiveShare(groupId, acc.map(m => m.user_id!));
  const data = await Promise.all(acc.map(async m => ({ m, sh: share.get(m.user_id!)!, ...(await memberRounds(m.user_id!)) })));
  const def = data.map(d => d.courses.get(course)).find(Boolean);
  const since = range ? rangeSince(range as any) : null;
  const label = def?.label || data.flatMap(d => d.rounds).find(r => r.course_key === course)?.course_label || course;
  const holeNums = def?.holes?.length ? def.holes.map((h: any) => h.hole) : Array.from({ length: 18 }, (_, i) => i + 1);
  const per = data.map(d => ({ d, rs: d.sh.holes ? d.rounds.filter(r => r.course_key === course && (!year || r.year === year) && (!since || r.date >= since)) : [] }));
  const withData = per.filter(p => p.rs.length);
  const holes = holeNums.map((n: number) => {
    const hd = def?.holes?.find((h: any) => h.hole === n);
    const ms = per.map(({ d, rs }) => {
      const sc = rs.map(r => r.holes.find(h => h[0] === n)).filter((h): h is [number, number, number] => !!h && !!h[2]);
      const par = hd?.par ?? sc[0]?.[1] ?? null;
      const tp = sc.map(h => h[2] - h[1]);
      return { member_id: d.m.member_id, n: sc.length, avg: r1(mean(sc.map(h => h[2]))), avg_to_par: r1(mean(tp)), birdies: tp.filter(x => x === -1).length, eagles: tp.filter(x => x <= -2).length, pars: tp.filter(x => x === 0).length,
        bogeys: tp.filter(x => x === 1).length, doubles: tp.filter(x => x >= 2).length, best: sc.length ? Math.min(...sc.map(h => h[2])) : null, par };
    });
    const live = ms.filter(x => x.n);
    const lead = (k: "birdies" | "pars", hi = true) => { if (live.length < 2) return []; const best = Math.max(...live.map(x => x[k])); return best > 0 ? live.filter(x => x[k] === best).map(x => x.member_id) : []; };
    const bestAvg = live.length >= 2 ? Math.min(...live.map(x => x.avg_to_par!)) : null;
    return { hole: n, par: hd?.par ?? ms.find(x => x.par)?.par ?? null, hcp: hd?.hcp ?? null, members: ms,
      leaders: { avg: bestAvg == null ? [] : live.filter(x => x.avg_to_par === bestAvg).map(x => x.member_id), birdies: lead("birdies"), pars: lead("pars") } };
  });
  return { course: { key: course, label, par: def?.par ?? null }, year: year || null, shared: withData.length >= 2,
    range: range || null, members: per.map(({ d, rs }) => ({ member_id: d.m.member_id, name: names.get(d.m.user_id!) || "Jugador", ...(d.sh.holes ? { rounds: rs.length } : { hidden: ["holes"] }),
      color: colorOf(members, d.m.member_id), is_me: d.m.user_id === viewerId })), holes: holes.map((h: any) => ({ ...h, members: h.members.filter((x: any) => share.get(acc.find(a => a.member_id === x.member_id)!.user_id!)?.holes) })) };
}

/* ---------------- share link (/g/<token>) ---------------- */
import { groupByToken, processPhoto } from "./group-share";

/** Public preview of a share link (no session needed): name, photo, creator's public name, member count. Nothing else. */
export async function previewByToken(token: string, viewerId: string | null) {
  const g = await groupByToken(token); if (!g) throw new HttpError(404, "Este link de invitación no existe, venció o fue desactivado.");
  const creator = (await publicNames([g.owner_id])).get(g.owner_id) || "Un jugador";
  let status: string | null = null;
  if (viewerId) { const [m] = await q(`select status from cmp_member where group_id=$1 and user_id=$2 order by invited_at desc limit 1`, [g.id, viewerId]); status = m?.status ?? null; }
  return { token, group: { id: status === "accepted" ? g.id : undefined, name: g.name, members: g.members, owner: creator, photo_url: g.has_photo ? `/g/${token}/photo?v=${g.photo_updated_at ? new Date(g.photo_updated_at).getTime() : 0}` : null,
    expires_at: g.share_expires_at }, signed_in: !!viewerId, status, full: g.members >= MAX_MEMBERS };
}
/** Accept (or decline) a share-link invitation. Always audited (cmp_event detail "link"). */
export async function respondByToken(token: string, userId: string, accept: boolean) {
  const g = await groupByToken(token); if (!g) throw new HttpError(404, "Este link de invitación no existe, venció o fue desactivado.");
  const rows: Member[] = await q(`select id member_id, user_id, status, matricula, invited_at, responded_at, role from cmp_member where group_id=$1`, [g.id]);
  const mine = rows.find(m => m.user_id === userId);
  if (mine?.status === "accepted") return { ok: true, status: "accepted", group_id: g.id, already: true };
  if (!accept) {
    if (mine?.status === "invited") await q(`update cmp_member set status='declined', responded_at=now() where id=$1`, [mine.member_id]);
    await event(userId, "decline", g.id, mine?.member_id ?? null, "link"); return { ok: true, status: "declined" };
  }
  if (rows.filter(m => m.status === "accepted").length >= MAX_MEMBERS) throw new HttpError(409, `El grupo ya tiene ${MAX_MEMBERS} jugadores.`);
  const [recent] = await q(`select count(*)::int n from cmp_event where actor_id=$1 and action='accept' and detail='link' and created_at > now() - interval '24 hours'`, [userId]);
  if (recent.n >= 20) throw new HttpError(429, "Te sumaste a muchos grupos hoy. Probá mañana.");
  let id: string;
  if (mine) { await q(`update cmp_member set status='accepted', role='member', responded_at=now() where id=$1`, [mine.member_id]); id = mine.member_id; }
  else {
    const mats = await myMatriculas(userId), mat = mats.find(x => !rows.some(r => r.matricula === x && r.user_id && r.user_id !== userId)) || `u:${userId.slice(0, 8)}`;
    const [m] = await q(`insert into cmp_member (group_id, matricula, user_id, status, invited_by, responded_at, role) values ($1,$2,$3,'accepted',null,now(),'member')
      on conflict (group_id, matricula) do update set user_id=excluded.user_id, status='accepted', role='member', responded_at=now() returning id`, [g.id, mat, userId]);
    id = m.id;
  }
  await event(userId, "accept", g.id, id, "link");
  return { ok: true, status: "accepted", group_id: g.id };
}
/** Admins: regenerate / disable / enable the link and set an optional expiry (days, null = never). */
export async function setLink(userId: string, groupId: string, b: { action?: string; expires_days?: number | null }) {
  const { group } = await loadGroup(groupId, userId, "admin");
  const a = b?.action;
  if (a === "regenerate") await q(`update cmp_group set share_token=$2, share_enabled=true where id=$1`, [groupId, (await import("./group-share")).newToken()]);
  else if (a === "disable") await q(`update cmp_group set share_enabled=false where id=$1`, [groupId]);
  else if (a === "enable") await q(`update cmp_group set share_enabled=true, share_token=coalesce(share_token,$2) where id=$1`, [groupId, (await import("./group-share")).newToken()]);
  else if (a !== "expiry") throw new HttpError(400, "action: regenerate | disable | enable | expiry");
  if (b && "expires_days" in b) {
    const d = b.expires_days; if (d != null && (!Number.isInteger(d) || d < 1 || d > 365)) throw new HttpError(400, "expires_days: 1 a 365, o null para que no venza.");
    await q(`update cmp_group set share_expires_at = case when $2::int is null then null else now() + make_interval(days => $2::int) end where id=$1`, [groupId, d ?? null]);
  }
  await event(userId, `link.${a}`, groupId);
  const [g] = await q(`select name, share_token, share_enabled, share_expires_at from cmp_group where id=$1`, [group.id]);
  return { link: linkInfo(g) };
}
export async function setPhoto(userId: string, groupId: string, buf: Buffer | null) {
  await loadGroup(groupId, userId, "admin");
  if (buf === null) { await q(`update cmp_group set photo=null, photo_updated_at=now() where id=$1`, [groupId]); await event(userId, "photo.remove", groupId); return { ok: true, photo_url: null }; }
  const jpg = await processPhoto(buf);
  const [g] = await q(`update cmp_group set photo=$2, photo_updated_at=now() where id=$1 returning id, photo_updated_at, true has_photo`, [groupId, jpg]);
  await event(userId, "photo.set", groupId);
  return { ok: true, photo_url: photoUrl(g), bytes: jpg.length };
}
export async function groupPhoto(groupId: string) {
  const [g] = await q(`select photo from cmp_group where id=$1`, [groupId]); return g?.photo ? Buffer.from(g.photo) : null;
}

/** "Nuevo grupo" chips: matrícula → display name (the same one groups show) for Golflet players. Nothing else is returned.
 *  Non-users: we hold no club data with names for them, so they come back as unknown (still invitable). Rate-limited. */
export async function lookupMatriculas(userId: string, raw: unknown) {
  const list = (Array.isArray(raw) ? raw : []).map(x => String(x ?? "").trim()).filter(Boolean).slice(0, MAX_MEMBERS);
  if (!list.length) return [];
  const [{ n }] = await q(`select count(*)::int n from cmp_event where actor_id=$1 and action='lookup' and created_at > now() - interval '1 hour'`, [userId]);
  if (n + list.length > 120) throw new HttpError(429, "Buscaste muchas matrículas en poco tiempo. Probá en un rato.");
  await q(`insert into cmp_event (actor_id, action, detail) select $1, 'lookup', null from generate_series(1, $2)`, [userId, list.length]);
  const mine = await myMatriculas(userId), out: { matricula: string; status: "user" | "unknown" | "self" | "invalid"; name: string | null }[] = [];
  for (const m of list) {
    if (!validMatricula(m)) { out.push({ matricula: m, status: "invalid", name: null }); continue; }
    if (mine.includes(m)) { out.push({ matricula: m, status: "self", name: null }); continue; }
    const uid = await usersForMatricula(m);
    if (uid === userId) { out.push({ matricula: m, status: "self", name: null }); continue; }
    out.push({ matricula: m, status: uid ? "user" : "unknown", name: uid ? (await publicNames([uid])).get(uid) ?? null : null });
  }
  return out;
}
