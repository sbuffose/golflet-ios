/**
 * Daily GPS greens read ("Lectura diaria 6:00"): Vercel Cron 09:00 UTC (06:00 ART) → /api/cron/gps.
 * Same READ-ONLY path as the admin "Volver a leer de Golfistics" button (getVmCourse(force) → viewmaster_get_holes_anonimo.php,
 * anonymous, spaced by vmFetch's GAP_MS; viewmaster_update_gps.php is blocked in vmFetch). Manual overrides live in
 * vm_course.green_override and are never touched; when Golfistics moves a point that has an override, the hole is flagged in `review`.
 */
import { q } from "./db";
import { getVmCourse } from "./viewmaster";
import { slug, type VmHole } from "./viewmaster-parse";
import { haversine } from "./geo";

export const SETTING_KEY = "gps_daily_read";
const POINTS = ["front", "center", "back"] as const;
const MOVED_M = 0.5;

export async function dailyEnabled(): Promise<boolean> {
  const [r] = await q(`select value from app_setting where key=$1`, [SETTING_KEY]);
  return r ? r.value === true || r.value?.enabled === true : false;
}
export async function setDailyEnabled(on: boolean, userId: string) {
  await q(`insert into app_setting (key, value, updated_by) values ($1,$2,$3) on conflict (key) do update set value=excluded.value, updated_by=excluded.updated_by, updated_at=now()`, [SETTING_KEY, JSON.stringify(!!on), userId]);
}

export function diffHoles(before: VmHole[], after: VmHole[], overrides: Record<string, any>) {
  const changed: { hole: number; points: string[]; max_m: number }[] = [], conflicts: number[] = [];
  for (const a of after) {
    const b = before.find(x => x.hole === a.hole);
    const pts: string[] = []; let max = 0;
    for (const p of POINTS) {
      const pa = (a as any)[p], pb = b ? (b as any)[p] : null;
      if (!pa) continue;
      const d = pb ? haversine(pa, pb) : Infinity;
      if (d > MOVED_M) { pts.push(p); max = Math.max(max, Number.isFinite(d) ? d : 0); }
    }
    if (pts.length) {
      changed.push({ hole: a.hole, points: pts, max_m: Math.round(max * 10) / 10 });
      const ov = overrides[String(a.hole)];
      if (ov && pts.some(p => ov[p])) conflicts.push(a.hole);
    }
  }
  return { changed, conflicts };
}

/** One read of one course. trigger: "cron" | "manual". Never throws; returns the run row. */
export async function readCourse(clubCode: string, vmCourse: string, trigger: "cron" | "manual", actorEmail: string | null = null) {
  const courseId = slug(clubCode, vmCourse);
  const [run] = await q(`insert into gps_read_run (course_id, club_code, vm_course, trigger, actor_email) values ($1,$2,$3,$4,$5) returning id`, [courseId, clubCode, vmCourse, trigger, actorEmail]);
  const [row] = await q(`select holes, green_override, fetched_at, review from vm_course where club_code=$1 and vm_course=$2`, [clubCode, vmCourse]);
  const before: VmHole[] = row?.holes || [], prevFetched = row?.fetched_at ? +new Date(row.fetched_at) : 0;
  let status = "ok", message = "", detail: any = null, changedN = 0, conflictsN = 0;
  try {
    const after = await getVmCourse(clubCode, vmCourse, true);
    const fetchedNow = after?.fetched_at && +new Date(after.fetched_at) > prevFetched;
    if (!fetchedNow) { status = "skipped"; message = "Golfistics se leyó hace menos de 15 minutos o no respondió con datos nuevos; quedan los datos anteriores."; }
    else {
      const d = diffHoles(before, after.holes as VmHole[], row?.green_override || {});
      changedN = d.changed.length; conflictsN = d.conflicts.length; detail = d;
      status = changedN ? "changed" : "ok";
      message = changedN ? `Cambiaron ${changedN} hoyo(s)` : "Sin cambios";
      if (conflictsN) {
        const review = { ...(row?.review || {}) };
        for (const h of d.conflicts) review[String(h)] = { points: d.changed.find(c => c.hole === h)!.points, at: new Date().toISOString() };
        await q(`update vm_course set review=$3 where club_code=$1 and vm_course=$2`, [clubCode, vmCourse, JSON.stringify(review)]);
        message += ` · ${conflictsN} con corrección manual para revisar (la corrección se mantiene)`;
      }
    }
  } catch (e) {
    status = "failed"; message = e instanceof Error ? e.message.slice(0, 200) : "Error";
  }
  await q(`update gps_read_run set finished_at=now(), status=$2, changed_holes=$3, conflicts=$4, detail=$5, message=$6 where id=$1`, [run.id, status, changedN, conflictsN, detail ? JSON.stringify(detail) : null, message]);
  await q(`insert into admin_audit (actor_id, actor_email, action, target_type, target_id, summary, detail) values (null,$1,$2,'gps_course',$3,$4,$5)`,
    [actorEmail ?? (trigger === "cron" ? "cron" : null), trigger === "cron" ? "green.daily_read" : "green.read", courseId, `Lectura ${trigger === "cron" ? "diaria" : "manual"} de greens: ${message}`, JSON.stringify({ run_id: run.id, status, changed_holes: changedN, conflicts: conflictsN })]).catch(() => {});
  return { id: Number(run.id), course_id: courseId, status, changed_holes: changedN, conflicts: conflictsN, message };
}

export async function runDaily(opts: { only?: string | null; budgetMs?: number; force?: boolean } = {}) {
  const t0 = Date.now(), budget = opts.budgetMs ?? 240_000;
  if (!opts.force && !(await dailyEnabled())) return { enabled: false, runs: [] as any[] };
  const rows = await q(`select club_code, vm_course from vm_course where daily_read order by club_code, vm_course`);
  const list = rows.filter((r: any) => !opts.only || slug(r.club_code, r.vm_course) === opts.only);
  const runs = [];
  for (const r of list) {
    if (Date.now() - t0 > budget) break;
    runs.push(await readCourse(r.club_code, r.vm_course, "cron"));
    await new Promise(res => setTimeout(res, 1500));            // polite spacing between courses (vmFetch also spaces each request)
  }
  return { enabled: true, runs };
}
