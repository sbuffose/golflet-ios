import { q } from "./db";
import { dedupeRounds, norm } from "./dedupe";
import { competitionByKey } from "./competition";
import { applyHolesOverride, parTotal } from "./course-override";
import { clubDisplayName } from "./course-names";
import { roundChips } from "./metrics";

export const DEFAULT_BAG = ["Driver", "Madera 3", "Híbrido", "Hierro 4", "Hierro 5", "Hierro 6", "Hierro 7", "Hierro 8", "Hierro 9", "PW", "GW", "SW", "LW"]
  .map(club => ({ club, carry: null as number | null, total: null as number | null }));

const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const r2 = (x: number | null) => (x == null ? null : Math.round(x * 100) / 100);

/** Heuristic: yardage that doesn't fit the par (site data entry errors). */
function warnFor(par: number | null, yards: Record<string, number | null>) {
  const ys = Object.values(yards).filter((y): y is number => !!y); if (!par || !ys.length) return null;
  const y = Math.max(...ys);
  const bad = (par === 3 && y > 260) || (par === 4 && (y < 200 || y > 500)) || (par === 5 && y < 380);
  return bad ? "Dato del sitio a revisar: la yarda y el par de este hoyo no parecen coincidir." : null;
}

/** Minimal round rows for every account of the user, with the cross-club dedupe applied. */
async function userRoundKeys(userId: string) {
  const accts = await q(`select id from club_account where user_id=$1 order by created_at`, [userId]);
  const rows = await q(`select r.id, r.club_account_id as account_id, r.date::text as date, r.course, r.data->>'club_played' as club_played,
      (r.data->>'gross')::int as gross, r.data->>'card_status' as card_status, jsonb_array_length(r.holes) as holes_n,
      coalesce((r.data->>'other_course')::boolean, false) as other_course, (n.round_id is not null) as has_notes
    from round r join club_account a on a.id=r.club_account_id left join round_note n on n.round_id=r.id where a.user_id=$1`, [userId]);
  return dedupeRounds(rows as any[], accts.map(a => a.id));
}

export async function listAccounts(userId: string) {
  const accts = await q(`select a.id, a.club_id, c.name as club_name, c.base_url, c.code as club_code, a.source, a.matricula, a.player_name, a.handicap_index,
              (a.password_enc is not null) as password_saved, a.last_sync_at, a.last_sync_status, a.last_sync_message,
              (select count(*)::int from round r where r.club_account_id=a.id) as rounds_stored,
              (select count(*)::int from round r where r.club_account_id=a.id and jsonb_array_length(r.holes) > 0) as rounds_with_holes
            from club_account a join club c on c.id=a.club_id where a.user_id=$1 order by a.created_at`, [userId]);
  const { kept } = await userRoundKeys(userId);
  const per = new Map<string, number>(); for (const r of kept) per.set(r.account_id, (per.get(r.account_id) || 0) + 1);
  return accts.map(a => ({ ...a, rounds: per.get(a.id) || 0 }));
}

/** The user's round ids after dedupe (used by /api/rounds and /api/data). */
export async function visibleRoundIds(userId: string) { return (await userRoundKeys(userId)).keep; }

/** Everything the app needs, in the same shape as the original window.GOLFLET. Scoped to one user. */
export async function buildData(userId: string) {
  const accounts = await listAccounts(userId);
  const ids = accounts.map(a => a.id);
  const multi = new Set(accounts.map((a: any) => a.club_id)).size > 1;
  const rows = ids.length ? await q(`select r.id, r.club_account_id, r.date::text as date, r.course, r.data, r.holes, a.club_id,
        n.putts, n.gir, n.fir, n.notes, n.updated_at as notes_at,
        (select rr.id from round_recap rr where rr.round_id=r.id) as recap_id,
        (select count(*)::int from shot s join live_round l on l.id=s.live_round_id where l.round_id=r.id) as gps_shots,
        (select count(*)::int from shot s join live_round l on l.id=s.live_round_id where l.round_id=r.id and (s.club ~* '^(pt|putter)$' or s.lie='green')) as gps_putts
      from round r join club_account a on a.id=r.club_account_id left join round_note n on n.round_id=r.id
      where r.club_account_id = any($1) order by r.date desc`, [ids]) : [];
  const clubName = new Map(accounts.map(a => [a.club_id, a.club_name]));
  const keep = await visibleRoundIds(userId);
  const localName = new Map<string, string>();
  for (const a of await q(`select a.local_club, c.name from club_account a join club c on c.id=a.club_id where a.user_id=$1 and a.local_club is not null`, [userId])) localName.set(norm(a.local_club), a.name);
  const comp = competitionByKey(rows.map(r => ({ ...r.data, date: r.date, course: r.course })));
  const rounds = rows.filter(r => keep.has(r.id)).map(r => {
    const cx = comp.get({ ...r.data, date: r.date, course: r.course });
    const other = !!r.data.other_course, played = localName.get(norm(r.data.club_played)) || r.data.club_played || clubName.get(r.club_id);
    return {
      ...r.data, round_id: r.id, date: r.date, course: r.course, holes: r.holes, club_id: r.club_id,
      tournament: (r.data.tournament && String(r.data.tournament).trim()) ? r.data.tournament : cx.tournament, is_competition: cx.is_competition,
      club_name: other ? played : clubName.get(r.club_id), source_club_name: clubName.get(r.club_id), other_course: other,
      account_id: r.club_account_id,
      course_key: other ? `x:${played}:${r.course}` : `${r.club_id}:${r.course}`,
      course_label: other ? (r.course && r.course !== played ? `${r.course} · ${played}` : played) : null,
      putts: r.putts, gir: r.gir, fir: r.fir, notes: r.notes, notes_at: r.notes_at,
      recap_id: r.recap_id ?? null, gps_shots: r.gps_shots ?? 0,
      ...roundChips({ holes: r.holes, summary_counts: r.data.summary_counts, is_9_holes: r.data.is_9_holes }, r.putts, r.gps_putts),
    };
  });
  const clubIds = [...new Set(accounts.map(a => a.club_id))];
  const cdefs = (clubIds.length ? await q(`select club_id, name, par, holes, tees, holes_override from course where club_id = any($1)`, [clubIds]) : [])
    .map((c: any) => c.holes_override ? { ...c, holes: applyHolesOverride(c.holes, c.holes_override), par: parTotal(applyHolesOverride(c.holes, c.holes_override)) ?? c.par } : c);
  const cmp = ids.length ? await q(`select a.club_id, h.course, h.data from hole_compare h join club_account a on a.id=h.club_account_id where h.club_account_id = any($1)`, [ids]) : [];
  const courses: any[] = [];
  for (const c of cdefs) {
    const key = `${c.club_id}:${c.name}`;
    const rs = rounds.filter(r => r.course_key === key && !r.other_course && r.holes?.length && r.valid_card && !r.is_9_holes);
    if (!rs.length || !c.holes?.length) continue;
    const comp = cmp.find(x => x.club_id === c.club_id && x.course === c.name)?.data || {};
    const asc = rs.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    const holes = c.holes.map((hd: any) => {
      const get = (r: any) => r.holes.find((h: any) => h[0] === hd.hole)?.[2] as number | null;
      const sc = rs.map(get).filter((x): x is number => !!x);
      const tp = sc.map(s => s - hd.par);
      const l16 = asc.slice(-16).map(get).filter((x): x is number => !!x);
      return {
        hole: hd.hole, par: hd.par, par_raw: hd.par_raw, hcp: hd.hcp, hcp_raw: hd.hcp_raw, yards: hd.yards,
        stats: {
          n: sc.length, avg: r2(mean(sc)), avg_to_par: r2(mean(tp)), avg_last16: r2(mean(l16)),
          best: sc.length ? Math.min(...sc) : null, worst: sc.length ? Math.max(...sc) : null,
          dist: { eagle_or_better: tp.filter(x => x <= -2).length, birdie: tp.filter(x => x === -1).length, par: tp.filter(x => x === 0).length,
            bogey: tp.filter(x => x === 1).length, double: tp.filter(x => x === 2).length, triple_plus: tp.filter(x => x >= 3).length },
        },
        compare: comp[hd.hole] || null,
        data_warning: warnFor(hd.par, hd.yards || {}),
        geometry: null, green: { slope_grid: null, depth_yds: null, front_back: null }, recommendation: null,
      };
    });
    courses.push({ key, club_id: c.club_id, club_name: clubName.get(c.club_id), course: c.name,
      label: multi ? `${c.name} · ${clubName.get(c.club_id)}` : c.name, par: c.par, tees: c.tees, holes, rounds: rs.length });
  }
  courses.sort((a, b) => b.rounds - a.rounds);
  const hiRows = ids.length ? await q(`select date::text as date, club, hi::float as hi from hi_history where club_account_id = any($1) order by date`, [ids]) : [];
  const hiByDate = new Map<string, any>(); for (const h of hiRows) hiByDate.set(h.date, h);
  const [bag] = await q(`select clubs from bag where user_id=$1`, [userId]);
  // player identity: the first linked account (its club site gives the full 'APELLIDO Nombre' form); HI from the freshest sync
  const lead = accounts[0];
  const fresh = accounts.slice().sort((a: any, b: any) => +(b.last_sync_at || 0) - +(a.last_sync_at || 0))[0];
  // course_groups: every course of every linked club, grouped by club with the real club name (directory → Golflet club), for filters.
  const dirNames = clubIds.length ? await q(`select c.id, c.code, c.name golflet, d.name directory from club c left join ar_club_directory d on d.golflet_club_id=c.id where c.id = any($1)`, [clubIds]).catch(() => []) : [];
  const realName = new Map<number, string>(dirNames.map((r: any) => [r.id, clubDisplayName(r.code || String(r.id), { directory: r.directory, golflet: r.golflet })]));
  const course_groups = clubIds.map(id => ({ club_id: id, club_name: realName.get(id) || clubName.get(id) || `Club ${id}`,
    rounds: rounds.filter(r => r.club_id === id && !r.other_course).length,
    courses: (courses as any[]).filter((c: any) => c.key.split(":")[0] === String(id)).map((c: any) => ({ key: c.key, course: c.course, label: c.label, rounds: rounds.filter(r => r.course_key === c.key).length })) }))
    .filter(g => g.courses.length || g.rounds);
  const otherN = rounds.filter(r => r.other_course).length;
  return {
    generated: new Date().toISOString(),
    course_groups, other_course_rounds: otherN,
    player: lead ? { name: lead.player_name ?? fresh?.player_name ?? null, handicap_index: (fresh?.handicap_index ?? lead.handicap_index) == null ? null : Number(fresh?.handicap_index ?? lead.handicap_index), txtkey: lead.matricula } : null,
    clubs: accounts,
    hi_history: [...hiByDate.values()],
    rounds, courses,
    bag: bag?.clubs || DEFAULT_BAG,
  };
}
