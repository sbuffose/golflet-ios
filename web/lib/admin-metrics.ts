/**
 * Platform metrics for /admin. Real DB queries only; empty lists stay empty. Test accounts (@example.com) are left out unless asked.
 * Privacy: no claves, cookies, session tokens or IPs are ever selected. Recap transcripts are not shown (only counts).
 */
import { q } from "./db";
import { HttpError } from "./http";
import { visibleRoundIds } from "./data";
import { slug } from "./viewmaster-parse";

export const TZ = "America/Argentina/Buenos_Aires";
const TEST = `'%@example.com'`;
/** users in scope: $1 = include test accounts */
const US = `us as (select id, name, email, "createdAt" as created_at from "user" where ($1::boolean or email not ilike ${TEST}))`;
export const PLATFORM_SQL = (col: string) => `case when ${col} ilike 'Golflet/%' or ${col} ilike '%CFNetwork%' then 'ios' when ${col} ilike 'Mozilla/%' then 'web' else 'otro' end`;
/** user activity events (manual actions only: cron syncs don't count) */
const ACT = `act as (
  select "userId" as uid, "updatedAt" as t, 'sesion' as k from session
  union all select "userId", "createdAt", 'ingreso' from session
  union all select user_id, created_at, 'sincronizacion' from sync_log where trigger not in ('cron', 'scorecard')
  union all select user_id, updated_at, 'sincronizacion' from sync_progress
  union all select user_id, started_at, 'ronda_gps' from live_round
  union all select user_id, created_at, 'golpe' from shot
  union all select user_id, created_at, 'audio' from round_recap
  union all select user_id, updated_at, 'nota' from round_note
  union all select user_id, updated_at, 'bolsa' from bag
  union all select user_id, updated_at, 'palos' from player_clubs
)`;
const n = (x: any) => (x == null ? 0 : Number(x));

export async function summary(includeTest: boolean) {
  const P = [includeTest];
  const [[u], [l], [s], [r], byClub, byCourse, [lv], [rc], plat, [c]] = await Promise.all([
    q(`with ${US}, ${ACT}
    select (select count(*) from us)::int total,
      (select count(*) from "user" where email ilike ${TEST})::int test_accounts,
      (select count(distinct uid) from act join us on us.id=act.uid where t > now() - interval '7 days')::int active7,
      (select count(distinct uid) from act join us on us.id=act.uid where t > now() - interval '30 days')::int active30,
      (select count(*) from us where created_at > now() - interval '7 days')::int new7,
      (select count(*) from us where created_at > now() - interval '30 days')::int new30`, P),
    q(`with ${US} select count(*)::int accounts, count(distinct a.user_id)::int users_linked,
      count(*) filter (where a.last_sync_status='ok')::int ok, count(*) filter (where a.last_sync_status='error')::int error,
      count(*) filter (where a.last_sync_status='running')::int running, count(*) filter (where a.last_sync_status is null)::int never,
      count(*) filter (where a.password_enc is not null)::int saved_clave, count(distinct a.club_id)::int clubs
    from club_account a join us on us.id=a.user_id`, P),
    q(`with ${US} select count(*)::int runs, count(*) filter (where ok)::int ok, count(*) filter (where not ok)::int fail,
      max(l.created_at) last_at, min(l.created_at) since, coalesce(sum(l.new_rounds),0)::int new_rounds
    from sync_log l join us on us.id=l.user_id`, P),
    q(`with ${US} select count(*)::int stored, count(*) filter (where jsonb_array_length(r.holes) > 0)::int with_holes,
      count(*) filter (where coalesce((r.data->>'other_course')::boolean,false))::int other_course, count(distinct a.user_id)::int users,
      count(distinct coalesce(r.data->>'club_played','') || '|' || coalesce(r.course,''))::int courses_played
    from round r join club_account a on a.id=r.club_account_id join us on us.id=a.user_id`, P),
    q(`with ${US} select c.id, c.name, c.code, count(r.id)::int rounds from round r join club_account a on a.id=r.club_account_id join club c on c.id=a.club_id join us on us.id=a.user_id group by 1,2,3 order by 4 desc`, P),
    q(`with ${US} select coalesce(r.data->>'club_played', c.name) club, r.course, count(*)::int rounds from round r join club_account a on a.id=r.club_account_id join club c on c.id=a.club_id join us on us.id=a.user_id
    group by 1,2 order by 3 desc limit 8`, P),
    q(`with ${US} select (select count(*) from live_round l join us on us.id=l.user_id)::int rounds,
      (select count(*) from live_round l join us on us.id=l.user_id where l.ended_at is not null)::int finished,
      (select count(distinct l.user_id) from live_round l join us on us.id=l.user_id)::int users,
      (select count(*) from shot s join us on us.id=s.user_id)::int shots,
      (select count(*) from shot s join us on us.id=s.user_id where s.club is not null)::int shots_with_club`, P),
    q(`with ${US} select count(*)::int total, count(*) filter (where rr.source='ios_on_device')::int on_device, count(*) filter (where rr.source='web_mic')::int web_mic, count(*) filter (where rr.status='ready')::int ready,
      count(distinct rr.user_id)::int users, (select count(*) from recap_audio ra join round_recap x on x.id=ra.recap_id join us on us.id=x.user_id)::int with_audio
    from round_recap rr join us on us.id=rr.user_id`, P),
    q(`with ${US} select ${PLATFORM_SQL(`s."userAgent"`)} p, count(*)::int sessions, count(distinct s."userId")::int users, max(s."updatedAt") last_at
    from session s join us on us.id=s."userId" group by 1`, P),
    q(`with ${US} select (select count(*) from round_note x join us on us.id=x.user_id)::int notes,
      (select count(*) from bag x join us on us.id=x.user_id)::int bags, (select count(*) from player_clubs x join us on us.id=x.user_id)::int player_clubs,
      (select count(*) from club_sample x join us on us.id=x.user_id)::int samples,
      (select count(*) from admin_audit)::int audit, (select count(*) from user_role)::int staff`, P),
  ]);
  let visible = 0;
  for (const x of await q(`with ${US} select distinct a.user_id from club_account a join us on us.id=a.user_id`, P)) visible += (await visibleRoundIds(x.user_id)).size;
  const [strategy, ser] = await Promise.all([strategyCoverage(), series(includeTest)]);
  return {
    generated_at: new Date().toISOString(), include_test: includeTest,
    users: u, links: l, syncs: { ...s, current: { ok: l.ok, error: l.error } },
    rounds: { ...r, visible, by_club: byClub, by_course: byCourse },
    live: lv, recaps: rc,
    platform: Object.fromEntries(["web", "ios", "otro"].map(p => { const x = plat.find((y: any) => y.p === p); return [p, { sessions: n(x?.sessions), users: n(x?.users), last_at: x?.last_at ?? null }]; })),
    content: c, strategy, series: ser,
  };
}

export async function series(includeTest: boolean) {
  const P = [includeTest];
  const signups = await q(`with ${US}, w as (select generate_series(date_trunc('week', (now() at time zone '${TZ}')) - interval '25 weeks', date_trunc('week', (now() at time zone '${TZ}')), interval '1 week')::date d)
    select w.d::text as d, (select count(*) from us where date_trunc('week', us.created_at at time zone '${TZ}')::date = w.d)::int v from w order by 1`, P);
  const rounds = await q(`with ${US}, m as (select generate_series(date_trunc('month', (now() at time zone '${TZ}')) - interval '23 months', date_trunc('month', (now() at time zone '${TZ}')), interval '1 month')::date d)
    select m.d::text as d, (select count(*) from round r join club_account a on a.id=r.club_account_id join us on us.id=a.user_id where date_trunc('month', r.date)::date = m.d)::int v from m order by 1`, P);
  const days = `d as (select generate_series((now() at time zone '${TZ}')::date - 29, (now() at time zone '${TZ}')::date, interval '1 day')::date d)`;
  const syncs = await q(`with ${US}, ${days} select d.d::text as d,
      (select count(*) from sync_log l join us on us.id=l.user_id where l.ok and (l.created_at at time zone '${TZ}')::date = d.d)::int ok,
      (select count(*) from sync_log l join us on us.id=l.user_id where not l.ok and (l.created_at at time zone '${TZ}')::date = d.d)::int fail from d order by 1`, P);
  const active = await q(`with ${US}, ${ACT}, ${days} select d.d::text as d, (select count(distinct uid) from act join us on us.id=act.uid where (act.t at time zone '${TZ}')::date = d.d)::int v from d order by 1`, P);
  return { signups_weekly: signups, rounds_monthly: rounds, syncs_daily: syncs, active_daily: active };
}

/** Strategy coverage for every cached GPS course (+ any course with strategy rows). */
export async function strategyCoverage() {
  const vms = await q(`select v.club_code, v.vm_course, jsonb_array_length(v.holes)::int holes, (v.osm is not null) has_osm, (v.green_override is not null and v.green_override <> '{}'::jsonb) green_fixed, c.name club_name
    from vm_course v left join lateral (select name from club where code=v.club_code order by seeded desc, id limit 1) c on true order by v.club_code, v.vm_course`);
  const st = await q(`select c.course_id, (c.published is not null and coalesce(c.published->>'overview','')<>'') overview_published, coalesce(c.draft->>'overview','')<>'' overview_draft,
      (select count(*)::int from hole_strategy h where h.course_id=c.course_id and h.published is not null) published_holes,
      (select count(*)::int from hole_strategy h where h.course_id=c.course_id and h.draft <> '{}'::jsonb and (h.published is null or h.published <> h.draft)) pending_holes,
      greatest(c.updated_at, (select max(updated_at) from hole_strategy h where h.course_id=c.course_id)) updated_at, c.published_at
    from course_strategy c`);
  const rows = vms.map((v: any) => ({ course_id: slug(v.club_code, v.vm_course), club_code: v.club_code, club_name: v.club_name, vm_course: v.vm_course, holes: v.holes, has_osm: v.has_osm, green_fixed: v.green_fixed }));
  for (const s of st) if (!rows.some(r => r.course_id === s.course_id)) rows.push({ course_id: s.course_id, club_code: s.course_id.split("-")[0], club_name: null, vm_course: s.course_id, holes: 18, has_osm: false, green_fixed: false });
  return rows.map(r => {
    const s = st.find((x: any) => x.course_id === r.course_id);
    const pub = n(s?.published_holes), pend = n(s?.pending_holes);
    return { ...r, published_holes: pub, pending_holes: pend, overview_published: !!s?.overview_published, overview_draft: !!s?.overview_draft, updated_at: s?.updated_at ?? null,
      status: pub === 0 && !s?.overview_published ? (pend || s?.overview_draft ? "draft" : "none") : pend ? "changed" : pub >= 18 ? "published" : "partial" };
  });
}

/* ---------------- drill-downs ---------------- */
type Col = { k: string; l: string; num?: boolean; link?: string; kind?: "date" | "datetime" | "bool" | "chip" | "pct" };
type Filter = { k: string; l: string; options: [string, string][] };
type Detail = { title: string; subtitle?: string; columns: Col[]; rows: any[]; filters: Filter[]; note?: string; total?: number };

const DAYS: [string, string][] = [["", "Todo"], ["7", "Últimos 7 días"], ["30", "Últimos 30 días"], ["90", "Últimos 90 días"], ["365", "Último año"]];
const days = (v: string | null) => { const d = Number(v); return Number.isInteger(d) && d > 0 && d <= 3650 ? d : null; };
const s = (v: string | null, max = 120) => (v ? String(v).slice(0, max) : null);

export async function detail(metric: string, sp: URLSearchParams): Promise<Detail> {
  const T = sp.get("test") === "1"; const P: unknown[] = [T];
  const add = (v: unknown) => { P.push(v); return `$${P.length}`; };
  const d = days(sp.get("days")), from = s(sp.get("from"), 10), to = s(sp.get("to"), 10);
  const range = (col: string) => {
    let w = "";
    if (d) w += ` and ${col} > now() - make_interval(days => ${add(d)}::int)`;
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) w += ` and (${col} at time zone '${TZ}')::date >= ${add(from)}::date`;
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) w += ` and (${col} at time zone '${TZ}')::date <= ${add(to)}::date`;
    return w;
  };
  const clubs = async (): Promise<[string, string][]> => [["", "Todos los clubes"], ...(await q(`select id::text, name from club where exists (select 1 from club_account a where a.club_id=club.id) order by name`)).map((c: any) => [c.id, c.name] as [string, string])];
  const userOpt = async (): Promise<[string, string][]> => [["", "Todos los usuarios"], ...(await q(`select id, coalesce(nullif(name,''), email) l from "user" where ($1::boolean or email not ilike ${TEST}) order by 2`, [T])).map((u: any) => [u.id, u.l] as [string, string])];
  const user = s(sp.get("user"), 64);
  const uw = (col: string) => (user ? ` and ${col} = ${add(user)}` : "");

  switch (metric) {
    case "users": case "signups": case "active": {
      const ad = metric === "active" ? days(sp.get("days")) ?? 30 : null;
      const role = s(sp.get("role"), 10), plat = s(sp.get("platform"), 10);
      let w = metric === "signups" ? range("us.created_at") : "";
      if (role === "none") w += ` and r.role is null`; else if (role) w += ` and r.role = ${add(role)}`;
      if (plat) w += ` and exists (select 1 from session x where x."userId"=us.id and ${PLATFORM_SQL(`x."userAgent"`)} = ${add(plat)})`;
      if (ad) w += ` and la.t > now() - make_interval(days => ${add(ad)}::int)`;
      const rows = await q(`with ${US}, ${ACT}, last as (select uid, max(t) t from act group by uid)
        select us.id, us.name, us.email, us.created_at, r.role, la.t last_activity,
          (select count(*)::int from club_account a where a.user_id=us.id) links,
          (select max(a.last_sync_at) from club_account a where a.user_id=us.id) last_sync,
          (select count(*)::int from round x join club_account a on a.id=x.club_account_id where a.user_id=us.id) rounds_stored,
          (select string_agg(distinct ${PLATFORM_SQL(`x."userAgent"`)}, ' · ') from session x where x."userId"=us.id) platforms
        from us left join user_role r on r.user_id=us.id left join last la on la.uid=us.id where true ${w} order by ${metric === "active" ? "la.t desc nulls last" : "us.created_at desc"}`, P);
      return { title: metric === "active" ? `Usuarios activos (${ad} días)` : metric === "signups" ? "Altas de usuarios" : "Usuarios",
        subtitle: metric === "active" ? "Actividad = ingresos, uso de la sesión, sincronizaciones manuales, rondas GPS, golpes, audios, notas, bolsa o palos. La sincronización automática diaria no cuenta." : undefined,
        columns: [{ k: "name", l: "Nombre", link: "/admin/users/{id}" }, { k: "email", l: "Email" }, { k: "role", l: "Rol", kind: "chip" }, { k: "created_at", l: "Alta", kind: "date" }, { k: "last_activity", l: "Última actividad", kind: "datetime" },
          { k: "platforms", l: "Plataforma" }, { k: "links", l: "Vínculos", num: true }, { k: "rounds_stored", l: "Rondas", num: true }, { k: "last_sync", l: "Última sinc.", kind: "datetime" }],
        rows, filters: [...(metric === "active" ? [{ k: "days", l: "Ventana", options: [["30", "30 días"], ["7", "7 días"], ["90", "90 días"]] as [string, string][] }] : metric === "signups" ? [{ k: "days", l: "Período", options: DAYS }] : []),
          { k: "role", l: "Rol", options: [["", "Todos"], ["admin", "Admin"], ["editor", "Editor"], ["none", "Jugador"]] }, { k: "platform", l: "Plataforma", options: [["", "Todas"], ["web", "Web"], ["ios", "iPhone"], ["otro", "Otro"]] }] };
    }
    case "links": {
      const club = s(sp.get("club"), 10), st = s(sp.get("status"), 10);
      let w = uw("a.user_id"); if (club) w += ` and a.club_id = ${add(Number(club))}`;
      if (st === "never") w += ` and a.last_sync_status is null`; else if (st) w += ` and a.last_sync_status = ${add(st)}`;
      const rows = await q(`with ${US} select a.id, us.id user_id, coalesce(nullif(us.name,''), us.email) user_name, c.name club, a.source, a.player_name, a.handicap_index::float hi,
          (a.password_enc is not null) clave_guardada, a.last_sync_at, a.last_sync_status, a.last_sync_message, a.created_at,
          (select count(*)::int from round r where r.club_account_id=a.id) rounds
        from club_account a join us on us.id=a.user_id join club c on c.id=a.club_id where true ${w} order by a.last_sync_at desc nulls last`, P);
      return { title: "Vínculos con Golfistics", subtitle: "Una fila por club vinculado. La clave nunca se muestra: solo si está guardada (cifrada) para la sincronización diaria.",
        columns: [{ k: "user_name", l: "Usuario", link: "/admin/users/{user_id}" }, { k: "club", l: "Club" }, { k: "player_name", l: "Jugador" }, { k: "hi", l: "HI", num: true }, { k: "source", l: "Origen" },
          { k: "clave_guardada", l: "Clave guardada", kind: "bool" }, { k: "last_sync_status", l: "Estado", kind: "chip" }, { k: "last_sync_at", l: "Última sinc.", kind: "datetime" }, { k: "last_sync_message", l: "Mensaje" }, { k: "rounds", l: "Rondas", num: true }],
        rows, filters: [{ k: "club", l: "Club", options: await clubs() }, { k: "status", l: "Estado", options: [["", "Todos"], ["ok", "OK"], ["error", "Con error"], ["running", "En curso"], ["never", "Nunca"]] }, { k: "user", l: "Usuario", options: await userOpt() }] };
    }
    case "syncs": {
      const st = s(sp.get("status"), 5), tr = s(sp.get("trigger"), 10);
      let w = range("l.created_at") + uw("l.user_id"); if (st === "ok") w += ` and l.ok`; if (st === "fail") w += ` and not l.ok`; if (tr) w += ` and l.trigger = ${add(tr)}`;
      const rows = await q(`with ${US} select l.id, l.user_id, coalesce(nullif(us.name,''), us.email) user_name, l.created_at, l.trigger, l.ok, l.new_rounds, l.updated, l.pending, l.duration_ms, l.message,
          (select string_agg(x->>'club_name', ' · ') from jsonb_array_elements(coalesce(l.clubs,'[]'::jsonb)) x) clubs
        from sync_log l join us on us.id=l.user_id where true ${w} order by l.created_at desc limit 500`, P);
      const [since] = await q(`select min(created_at) t from sync_log`);
      return { title: "Sincronizaciones", subtitle: "Cada vez que se leyó Golfistics (al vincular, al tocar Actualizar o en la sincronización diaria de las 06:00).",
        note: since?.t ? undefined : "El historial de sincronizaciones empezó a registrarse con esta versión del panel; todavía no hay corridas guardadas.",
        columns: [{ k: "created_at", l: "Cuándo", kind: "datetime" }, { k: "user_name", l: "Usuario", link: "/admin/users/{user_id}" }, { k: "trigger", l: "Origen", kind: "chip" }, { k: "ok", l: "OK", kind: "bool" },
          { k: "clubs", l: "Clubes" }, { k: "new_rounds", l: "Nuevas", num: true }, { k: "updated", l: "Actualizadas", num: true }, { k: "pending", l: "Pendientes", num: true }, { k: "duration_ms", l: "Duración (ms)", num: true }, { k: "message", l: "Mensaje" }],
        rows, filters: [{ k: "days", l: "Período", options: DAYS }, { k: "status", l: "Resultado", options: [["", "Todos"], ["ok", "OK"], ["fail", "Con error"]] }, { k: "trigger", l: "Origen", options: [["", "Todos"], ["link", "Vínculo"], ["manual", "Actualizar"], ["cron", "Diaria"]] }, { k: "user", l: "Usuario", options: await userOpt() }] };
    }
    case "rounds": {
      const club = s(sp.get("club"), 10), course = s(sp.get("course"), 80), year = s(sp.get("year"), 4), sort = sp.get("sort") || "date", month = s(sp.get("month"), 7);
      let w = uw("a.user_id");
      if (club) w += ` and a.club_id = ${add(Number(club))}`;
      if (course) w += ` and r.course = ${add(course)}`;
      if (year && /^\d{4}$/.test(year)) w += ` and extract(year from r.date) = ${add(Number(year))}`;
      if (month && /^\d{4}-\d{2}$/.test(month)) w += ` and to_char(r.date,'YYYY-MM') = ${add(month)}`;
      const hn = sp.get("holes"); if (hn === "18") w += ` and not coalesce((r.data->>'is_9_holes')::boolean,false)`; if (hn === "9") w += ` and coalesce((r.data->>'is_9_holes')::boolean,false)`;
      if (sp.get("dedupe") !== "0") { /* visible only */ }
      const order = sort === "gross" ? `(r.data->>'gross')::int asc nulls last` : sort === "net" ? `(r.data->>'net')::int asc nulls last` : `r.date desc`;
      let rows = await q(`with ${US} select r.id, a.user_id, coalesce(nullif(us.name,''), us.email) user_name, r.date::text date, c.name source_club, coalesce(r.data->>'club_played', c.name) club_played, r.course,
          (r.data->>'gross')::int gross, (r.data->>'net')::int net, case when coalesce((r.data->>'is_9_holes')::boolean,false) then 9 else 18 end holes_n, (jsonb_array_length(r.holes) > 0) hole_detail, r.data->>'card_status' card_status, r.data->>'tournament' tournament
        from round r join club_account a on a.id=r.club_account_id join club c on c.id=a.club_id join us on us.id=a.user_id where true ${w} order by ${order} limit 2000`, P);
      const total = rows.length;
      if (sp.get("dedupe") !== "0") { const keep = new Set<string>(); for (const uid of new Set(rows.map((r: any) => r.user_id))) for (const id of await visibleRoundIds(uid)) keep.add(id); rows = rows.filter((r: any) => keep.has(r.id)); }
      const years = (await q(`select distinct extract(year from date)::int y from round order by 1 desc`)).map((x: any) => [String(x.y), String(x.y)] as [string, string]);
      const courses = (await q(`select distinct course from round where course is not null order by 1`)).map((x: any) => [x.course, x.course] as [string, string]);
      return { title: "Rondas sincronizadas", subtitle: `Sin duplicados entre clubes: ${rows.length} de ${total} guardadas.`, total,
        columns: [{ k: "date", l: "Fecha", kind: "date" }, { k: "user_name", l: "Usuario", link: "/admin/users/{user_id}" }, { k: "club_played", l: "Club jugado" }, { k: "course", l: "Cancha" }, { k: "holes_n", l: "Hoyos", num: true }, { k: "gross", l: "Gross", num: true }, { k: "net", l: "Neto", num: true },
          { k: "hole_detail", l: "Hoyo por hoyo", kind: "bool" }, { k: "card_status", l: "Tarjeta" }, { k: "source_club", l: "Leída desde" }],
        rows, filters: [{ k: "club", l: "Leída desde", options: await clubs() }, { k: "course", l: "Cancha", options: [["", "Todas"], ...courses] }, { k: "year", l: "Año", options: [["", "Todos"], ...years] },
          { k: "holes", l: "Hoyos", options: [["", "18 y 9"], ["18", "Solo 18"], ["9", "Solo 9"]] }, { k: "sort", l: "Orden", options: [["date", "Más recientes"], ["gross", "Mejor gross"], ["net", "Mejor neto"]] }, { k: "dedupe", l: "Duplicadas", options: [["", "Sin duplicados"], ["0", "Todas las guardadas"]] }, { k: "user", l: "Usuario", options: await userOpt() }] };
    }
    case "courses": {
      const club = s(sp.get("club"), 10); let w = uw("a.user_id"); if (club) w += ` and a.club_id = ${add(Number(club))}`;
      const rows = await q(`with ${US} select coalesce(r.data->>'club_played', c.name) club_played, r.course, count(*)::int rounds, count(distinct a.user_id)::int users,
          min((r.data->>'gross')::int) best_gross, round(avg((r.data->>'gross')::int) filter (where not coalesce((r.data->>'is_9_holes')::boolean,false)),1)::float avg_gross, max(r.date)::text last_played
        from round r join club_account a on a.id=r.club_account_id join club c on c.id=a.club_id join us on us.id=a.user_id where true ${w} group by 1,2 order by 3 desc`, P);
      return { title: "Rondas por club y cancha", subtitle: "Rondas guardadas (incluye copias de la misma tarjeta leídas desde dos clubes).",
        columns: [{ k: "club_played", l: "Club jugado" }, { k: "course", l: "Cancha", link: "/admin/metrics/rounds?course={course}" }, { k: "rounds", l: "Rondas", num: true }, { k: "users", l: "Usuarios", num: true }, { k: "best_gross", l: "Mejor gross", num: true }, { k: "avg_gross", l: "Gross prom. (18h)", num: true }, { k: "last_played", l: "Última", kind: "date" }],
        rows, filters: [{ k: "club", l: "Leída desde", options: await clubs() }, { k: "user", l: "Usuario", options: await userOpt() }] };
    }
    case "live_rounds": {
      const st = s(sp.get("status"), 10); let w = range("l.started_at") + uw("l.user_id"); if (st === "open") w += ` and l.ended_at is null`; if (st === "done") w += ` and l.ended_at is not null`;
      const rows = await q(`with ${US} select l.id, l.user_id, coalesce(nullif(us.name,''), us.email) user_name, l.date::text date, l.vm_course, l.course, l.tee, l.started_at, l.ended_at, l.current_hole,
          (select count(*)::int from shot s where s.live_round_id=l.id) shots, (l.round_id is not null) linked, exists (select 1 from round_recap rr where rr.live_round_id=l.id) recap
        from live_round l join us on us.id=l.user_id where true ${w} order by l.started_at desc limit 500`, P);
      return { title: "Rondas con GPS (Golflet)", columns: [{ k: "date", l: "Fecha", kind: "date" }, { k: "user_name", l: "Usuario", link: "/admin/users/{user_id}" }, { k: "course", l: "Cancha" }, { k: "tee", l: "Salida" },
          { k: "shots", l: "Golpes", num: true }, { k: "current_hole", l: "Hoyo actual", num: true }, { k: "ended_at", l: "Terminada", kind: "datetime" }, { k: "linked", l: "Unida a Golfistics", kind: "bool" }, { k: "recap", l: "Audio", kind: "bool" }],
        rows, filters: [{ k: "days", l: "Período", options: DAYS }, { k: "status", l: "Estado", options: [["", "Todas"], ["open", "En juego"], ["done", "Terminadas"]] }, { k: "user", l: "Usuario", options: await userOpt() }] };
    }
    case "shots": {
      const club = s(sp.get("palo"), 20); let w = range("s.created_at") + uw("s.user_id"); if (club) w += ` and s.club = ${add(club)}`;
      const rows = await q(`with ${US} select coalesce(s.club,'(sin palo)') palo, count(*)::int shots, count(distinct s.user_id)::int users, count(distinct s.live_round_id)::int rounds,
          count(*) filter (where s.direction is not null or s.length is not null)::int with_result, count(*) filter (where s.mishit)::int mishits, max(s.created_at) last_at
        from shot s join us on us.id=s.user_id where true ${w} group by 1 order by 2 desc`, P);
      const palos = (await q(`select distinct club from shot where club is not null order by 1`)).map((x: any) => [x.club, x.club] as [string, string]);
      return { title: "Golpes registrados con GPS", subtitle: "Agrupados por palo.", columns: [{ k: "palo", l: "Palo" }, { k: "shots", l: "Golpes", num: true }, { k: "rounds", l: "Rondas", num: true }, { k: "users", l: "Usuarios", num: true },
          { k: "with_result", l: "Con resultado", num: true }, { k: "mishits", l: "Mal pegados", num: true }, { k: "last_at", l: "Último", kind: "datetime" }],
        rows, filters: [{ k: "days", l: "Período", options: DAYS }, { k: "palo", l: "Palo", options: [["", "Todos"], ...palos] }, { k: "user", l: "Usuario", options: await userOpt() }] };
    }
    case "recaps": {
      const src = s(sp.get("source"), 20); let w = range("rr.created_at") + uw("rr.user_id"); if (src) w += ` and rr.source = ${add(src)}`;
      const rows = await q(`with ${US} select rr.id, rr.user_id, coalesce(nullif(us.name,''), us.email) user_name, rr.created_at, rr.status, rr.source, rr.model, round(rr.duration_s)::int duration_s,
          jsonb_array_length(rr.mistakes)::int mistakes, jsonb_array_length(rr.positives)::int positives, (ra.recap_id is not null) audio, coalesce(r.date, l.date)::text round_date
        from round_recap rr join us on us.id=rr.user_id left join recap_audio ra on ra.recap_id=rr.id left join round r on r.id=rr.round_id left join live_round l on l.id=rr.live_round_id where true ${w} order by rr.created_at desc limit 500`, P);
      const srcs = (await q(`select distinct source from round_recap where source is not null`)).map((x: any) => [x.source, x.source] as [string, string]);
      return { title: "Audios post ronda", subtitle: "Se transcriben en el iPhone (ios_on_device) o con el micrófono de la compu en el navegador (web_mic). Acá no se muestra lo que dijo cada jugador, solo los totales.",
        columns: [{ k: "created_at", l: "Guardado", kind: "datetime" }, { k: "user_name", l: "Usuario", link: "/admin/users/{user_id}" }, { k: "round_date", l: "Ronda", kind: "date" }, { k: "status", l: "Estado", kind: "chip" }, { k: "source", l: "Origen" }, { k: "model", l: "Modelo" },
          { k: "duration_s", l: "Duración (s)", num: true }, { k: "mistakes", l: "Errores", num: true }, { k: "positives", l: "Aciertos", num: true }, { k: "audio", l: "Audio guardado", kind: "bool" }],
        rows, filters: [{ k: "days", l: "Período", options: DAYS }, { k: "source", l: "Origen", options: [["", "Todos"], ...srcs] }, { k: "user", l: "Usuario", options: await userOpt() }] };
    }
    case "sessions": {
      const plat = s(sp.get("platform"), 10); let w = uw(`x."userId"`); if (plat) w += ` and ${PLATFORM_SQL(`x."userAgent"`)} = ${add(plat)}`;
      const rows = await q(`with ${US} select x."userId" user_id, coalesce(nullif(us.name,''), us.email) user_name, ${PLATFORM_SQL(`x."userAgent"`)} platform,
          case when x."userAgent" ~ '^Golflet/\\d+' then 'Build ' || substring(x."userAgent" from '^Golflet/(\\d+)') else null end app_build,
          x."createdAt" created_at, x."updatedAt" last_seen, x."expiresAt" expires_at
        from session x join us on us.id=x."userId" where true ${w} order by x."updatedAt" desc`, P);
      return { title: "Web vs iPhone", subtitle: "Sesiones abiertas según el navegador o la app que las inició. Los tokens y las IP nunca se muestran.",
        columns: [{ k: "user_name", l: "Usuario", link: "/admin/users/{user_id}" }, { k: "platform", l: "Plataforma", kind: "chip" }, { k: "app_build", l: "App" }, { k: "created_at", l: "Ingresó", kind: "datetime" }, { k: "last_seen", l: "Último uso", kind: "datetime" }, { k: "expires_at", l: "Vence", kind: "date" }],
        rows, filters: [{ k: "platform", l: "Plataforma", options: [["", "Todas"], ["web", "Web"], ["ios", "iPhone"], ["otro", "Otro"]] }, { k: "user", l: "Usuario", options: await userOpt() }] };
    }
    case "strategy": {
      const st = s(sp.get("status"), 12); let rows = await strategyCoverage(); if (st) rows = rows.filter(r => r.status === st);
      return { title: "Cobertura de Cómo jugar la cancha", columns: [{ k: "club_name", l: "Club" }, { k: "vm_course", l: "Cancha", link: "/admin/courses/{course_id}" }, { k: "status", l: "Estado", kind: "chip" },
          { k: "published_holes", l: "Hoyos publicados", num: true }, { k: "pending_holes", l: "Borradores sin publicar", num: true }, { k: "overview_published", l: "Resumen publicado", kind: "bool" }, { k: "has_osm", l: "Mapa OSM", kind: "bool" }, { k: "updated_at", l: "Editado", kind: "datetime" }],
        rows, filters: [{ k: "status", l: "Estado", options: [["", "Todos"], ["none", "Sin cargar"], ["draft", "Borrador"], ["partial", "Publicado en parte"], ["changed", "Cambios sin publicar"], ["published", "Completo"]] }] };
    }
    case "notes": {
      const rows = await q(`with ${US} select n.round_id, n.user_id, coalesce(nullif(us.name,''), us.email) user_name, r.date::text date, r.course, n.putts, n.gir, n.fir, (coalesce(n.notes,'')<>'') has_text, n.updated_at
        from round_note n join us on us.id=n.user_id join round r on r.id=n.round_id where true ${uw("n.user_id")} order by n.updated_at desc limit 500`, P);
      return { title: "Notas de ronda", subtitle: "Putts, greens y fairways que cargó el jugador. El texto libre no se muestra.", columns: [{ k: "updated_at", l: "Editada", kind: "datetime" }, { k: "user_name", l: "Usuario", link: "/admin/users/{user_id}" }, { k: "date", l: "Ronda", kind: "date" }, { k: "course", l: "Cancha" },
          { k: "putts", l: "Putts", num: true }, { k: "gir", l: "GIR", num: true }, { k: "fir", l: "FIR", num: true }, { k: "has_text", l: "Con texto", kind: "bool" }], rows, filters: [{ k: "user", l: "Usuario", options: await userOpt() }] };
    }
    case "bags": {
      const rows = await q(`with ${US} select 'bolsa' kind, b.user_id, coalesce(nullif(us.name,''), us.email) user_name, jsonb_array_length(b.clubs)::int items, b.updated_at from bag b join us on us.id=b.user_id where true ${uw("b.user_id")}
        union all select 'palos', p.user_id, coalesce(nullif(us.name,''), us.email), jsonb_array_length(p.clubs)::int, p.updated_at from player_clubs p join us on us.id=p.user_id where true ${uw("p.user_id")}
        union all select 'monitor', c.user_id, coalesce(nullif(us.name,''), us.email), count(*)::int, max(c.created_at) from club_sample c join us on us.id=c.user_id where true ${uw("c.user_id")} group by 2,3 order by 5 desc`, P);
      return { title: "Bolsa, palos y launch monitor", columns: [{ k: "kind", l: "Tipo", kind: "chip" }, { k: "user_name", l: "Usuario", link: "/admin/users/{user_id}" }, { k: "items", l: "Elementos", num: true }, { k: "updated_at", l: "Actualizado", kind: "datetime" }], rows, filters: [{ k: "user", l: "Usuario", options: await userOpt() }] };
    }
  }
  throw new HttpError(404, "Métrica desconocida");
}
