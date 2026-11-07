/**
 * Golfistics ViewMaster green geometry (public anonymous endpoints, read-only).
 * Only GETs/POSTs that READ: viewmaster_get_courses_anonimo, viewmaster_get_holes_anonimo, viewmaster_canchascercanas?action=getCanchas.
 * Never calls viewmaster_update_gps.php / viewmaster_clear_session.php and never uses their map or weather keys.
 * Cached in Postgres (vm_club, vm_course) with a TTL; requests are serialized and spaced out.
 */
import { q } from "./db";
import { HttpError } from "./http";

const BASE = "https://app.golfistics.com/golf/";
const UA = "Golflet/1.0 (+https://golflet.vercel.app)";
export const TTL_MS = 7 * 24 * 3600_000;         // geometry rarely changes
const RETRY_MS = 15 * 60_000;                    // after a failed/odd fetch, don't hammer
const GAP_MS = 600;                              // min spacing between Golfistics calls (per instance)
const FORBIDDEN = /update_gps|clear_session/i;

let chain: Promise<unknown> = Promise.resolve(); let last = 0;
async function vmFetch(path: string, init?: RequestInit): Promise<unknown> {
  if (FORBIDDEN.test(path)) throw new Error("forbidden ViewMaster endpoint");
  const run = async () => {
    const wait = last + GAP_MS - Date.now(); if (wait > 0) await new Promise(r => setTimeout(r, wait));
    last = Date.now();
    const r = await fetch(BASE + path, { ...init, headers: { "User-Agent": UA, Accept: "application/json", ...(init?.headers || {}) }, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`ViewMaster ${r.status}`);
    return r.json();
  };
  const p = chain.then(run, run); chain = p.catch(() => {}); return p;
}

export * from "./viewmaster-parse";
import { parseCourses, parseHoles, type VmHole } from "./viewmaster-parse";

const fresh = (d: Date | null | undefined, ms: number) => !!d && Date.now() - new Date(d).getTime() < ms;

export async function getClubCourses(clubCode: string): Promise<string[]> {
  if (!/^\d{1,5}$/.test(clubCode)) throw new HttpError(400, "Club inválido");
  const [row] = await q(`select courses, fetched_at, attempted_at from vm_club where club_code=$1`, [clubCode]);
  if (row && (fresh(row.fetched_at, TTL_MS) || fresh(row.attempted_at, RETRY_MS))) return row.courses || [];
  await q(`insert into vm_club (club_code, attempted_at) values ($1, now()) on conflict (club_code) do update set attempted_at=now()`, [clubCode]);
  try {
    const courses = parseCourses(await vmFetch(`viewmaster_get_courses_anonimo.php?club=${clubCode}`));
    await q(`update vm_club set courses=$2, fetched_at=now() where club_code=$1`, [clubCode, JSON.stringify(courses)]);
    return courses;
  } catch (e) {
    if (row) return row.courses || [];
    throw new HttpError(502, "El sistema del club no respondió con las canchas");
  }
}

export async function getVmCourse(clubCode: string, vmCourse: string, force = false) {
  const [row] = await q(`select holes, osm, fetched_at, attempted_at from vm_course where club_code=$1 and vm_course=$2`, [clubCode, vmCourse]);
  if (row && !force && row.holes?.length && (fresh(row.fetched_at, TTL_MS) || fresh(row.attempted_at, RETRY_MS))) return row as { holes: VmHole[]; osm: any; fetched_at: Date };
  if (row && force && fresh(row.attempted_at, RETRY_MS) && row.holes?.length) return row;
  await q(`insert into vm_course (club_code, vm_course, attempted_at) values ($1,$2,now()) on conflict (club_code, vm_course) do update set attempted_at=now()`, [clubCode, vmCourse]);
  try {
    const holes = parseHoles(await vmFetch(`viewmaster_get_holes_anonimo.php?course=${encodeURIComponent(vmCourse)}&club=${clubCode}`));
    if (!holes.length) throw new Error("empty");
    const [u] = await q(`update vm_course set holes=$3, fetched_at=now() where club_code=$1 and vm_course=$2 returning holes, osm, fetched_at`, [clubCode, vmCourse, JSON.stringify(holes)]);
    return u;
  } catch {
    if (row?.holes?.length) return row;
    throw new HttpError(502, "El sistema del club no tiene los greens de esta cancha o no respondió");
  }
}

/** All ViewMaster courses (134 at last probe) with their hole-1 green point; cached 1 day. Read-only POST. */
export async function getAllCanchas(): Promise<{ club_code: string; club: string; vm_course: string; lat: number; lng: number }[]> {
  const [row] = await q(`select courses, fetched_at, attempted_at from vm_club where club_code='_all'`);
  if (row && (fresh(row.fetched_at, 24 * 3600_000) || fresh(row.attempted_at, RETRY_MS))) return row.courses || [];
  await q(`insert into vm_club (club_code, attempted_at) values ('_all', now()) on conflict (club_code) do update set attempted_at=now()`);
  try {
    const j: any = await vmFetch(`viewmaster_canchascercanas.php?action=getCanchas`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat: -34.6, lng: -58.4 }) });
    const list = (Array.isArray(j?.canchas) ? j.canchas : []).map((c: any) => ({ club_code: String(c.id ?? ""), club: String(c.club ?? "").trim(), vm_course: String(c.nombre ?? "").trim(), lat: Number(c.lat), lng: Number(c.lng) }))
      .filter((c: any) => /^\d+$/.test(c.club_code) && c.vm_course && Number.isFinite(c.lat) && Number.isFinite(c.lng));
    if (!list.length) throw new Error("empty");
    await q(`update vm_club set courses=$1, fetched_at=now() where club_code='_all'`, [JSON.stringify(list)]);
    return list;
  } catch {
    if (row) return row.courses || [];
    throw new HttpError(502, "El sistema del club no respondió con la lista de canchas");
  }
}
