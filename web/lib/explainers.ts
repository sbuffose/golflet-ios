import { q } from "./db";
import { HttpError } from "./http-error";
import { EXPLAINERS, NETWORKS, cleanUrl, isExplainer, type NetKey } from "./explainers-core";
const NETS = NETWORKS.map(n => n.key) as NetKey[];
/** Public: only explainers with at least one URL; networks without URL are omitted. */
export async function publicVideos() {
  const rows = await q(`select key, instagram, tiktok, youtube, x from explainer_video`);
  const out: Record<string, Partial<Record<NetKey, string>>> = {};
  for (const r of rows) { if (!isExplainer(r.key)) continue; const o: any = {}; for (const n of NETS) if (r[n]) o[n] = r[n]; if (Object.keys(o).length) out[r.key] = o; }
  return { videos: out, networks: NETWORKS.map(n => ({ key: n.key, label: n.label })) };
}
export async function adminVideos() {
  const rows = await q(`select key, instagram, tiktok, youtube, x, updated_by, updated_at from explainer_video`);
  return { explainers: EXPLAINERS.map(e => { const r = rows.find((x: any) => x.key === e.key) || {}; return { ...e, urls: Object.fromEntries(NETS.map(n => [n, r[n] ?? null])), updated_by: r.updated_by ?? null, updated_at: r.updated_at ?? null }; }),
    networks: NETWORKS.map(n => ({ key: n.key, label: n.label, hosts: n.hosts })) };
}
export async function setVideos(key: string, body: any, by: string) {
  if (!isExplainer(key)) throw new HttpError(404, "Explicación no encontrada");
  const v: Record<string, string | null> = {};
  try { for (const n of NETS) v[n] = cleanUrl(n, body?.[n]); } catch (e: any) { throw new HttpError(400, e.message); }
  await q(`insert into explainer_video (key, instagram, tiktok, youtube, x, updated_by, updated_at) values ($1,$2,$3,$4,$5,$6,now())
    on conflict (key) do update set instagram=excluded.instagram, tiktok=excluded.tiktok, youtube=excluded.youtube, x=excluded.x, updated_by=excluded.updated_by, updated_at=now()`, [key, v.instagram, v.tiktok, v.youtube, v.x, by]);
  return { key, urls: v };
}
