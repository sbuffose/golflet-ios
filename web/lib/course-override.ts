/** Admin corrections on top of the synced course card (pure). Sync rewrites course.holes; course.holes_override survives it. */
import { HttpError } from "./http";
import type { LatLng } from "./geo";

export type HoleFix = { par?: number; hcp?: number; yards?: Record<string, number> };
export type HolesOverride = Record<string, HoleFix>;

export function applyHolesOverride<T extends { hole: number; par?: any; hcp?: any; yards?: any }>(holes: T[], ov: HolesOverride | null | undefined): T[] {
  if (!ov || !Object.keys(ov).length) return holes || [];
  return (holes || []).map(h => {
    const f = ov[String(h.hole)]; if (!f) return h;
    return { ...h, ...(f.par != null ? { par: f.par } : {}), ...(f.hcp != null ? { hcp: f.hcp } : {}), yards: { ...(h.yards || {}), ...(f.yards || {}) }, corrected: true };
  });
}
export const parTotal = (holes: { par?: any }[]) => holes.reduce((s, h) => s + (Number(h.par) || 0), 0) || null;

/** Admin row -> stored diff against the synced card. `edits`: [{hole, par?, hcp?, yards?:{TEE:yds}}] (full values, we keep only differences). */
export function buildOverride(base: any[], edits: unknown): HolesOverride {
  if (!Array.isArray(edits)) throw new HttpError(400, "Faltan los hoyos");
  const out: HolesOverride = {};
  for (const e of edits as any[]) {
    const hole = Number(e?.hole); const b = base.find(x => x.hole === hole);
    if (!b) throw new HttpError(400, `Hoyo inválido: ${e?.hole}`);
    const fix: HoleFix = {};
    if (e.par != null && e.par !== "") { const p = Number(e.par); if (!Number.isInteger(p) || p < 3 || p > 6) throw new HttpError(400, `Hoyo ${hole}: par inválido (3–6)`); if (p !== b.par) fix.par = p; }
    if (e.hcp != null && e.hcp !== "") { const p = Number(e.hcp); if (!Number.isInteger(p) || p < 1 || p > 18) throw new HttpError(400, `Hoyo ${hole}: hándicap inválido (1–18)`); if (p !== b.hcp) fix.hcp = p; }
    if (e.yards && typeof e.yards === "object") for (const [tee, v] of Object.entries(e.yards)) {
      if (!(tee in (b.yards || {}))) throw new HttpError(400, `Hoyo ${hole}: salida desconocida ${tee}`);
      if (v == null || v === "") continue;
      const y = Number(v); if (!Number.isInteger(y) || y < 50 || y > 750) throw new HttpError(400, `Hoyo ${hole} ${tee}: yardas inválidas (50–750)`);
      if (y !== b.yards[tee]) (fix.yards ||= {})[tee] = y;
    }
    if (Object.keys(fix).length) out[String(hole)] = fix;
  }
  return out;
}

/** Heuristic (same as the player app): yardage that doesn't fit the par. */
export function cardWarning(par: number | null, yards: Record<string, number | null>) {
  const ys = Object.values(yards || {}).filter((y): y is number => !!y); if (!par || !ys.length) return null;
  const y = Math.max(...ys);
  return (par === 3 && y > 260) || (par === 4 && (y < 200 || y > 500)) || (par === 5 && y < 380) ? "La yarda y el par no parecen coincidir" : null;
}

export type GreenFix = Partial<Record<"front" | "center" | "back", LatLng>>;
export function applyGreenOverride<T extends { hole: number; front: LatLng; center: LatLng; back: LatLng }>(holes: T[], ov: Record<string, GreenFix> | null | undefined): (T & { overridden?: boolean })[] {
  if (!ov || !Object.keys(ov).length) return holes;
  return holes.map(h => { const f = ov[String(h.hole)]; return f ? { ...h, ...f, overridden: true } : h; });
}
