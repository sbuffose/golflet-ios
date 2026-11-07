/** t181u: green elevation grid ("green surface") format — API_v5 §60 "Green surface". Pure validation, no I/O. */
export const GREEN_SURFACE_FORMAT = "golflet.green-surface/v1";
export type GreenSurface = {
  format: typeof GREEN_SURFACE_FORMAT;
  club_code: string; course: string; hole: number;
  crs: string;                         // projected, metres, e.g. "EPSG:32721" (UTM 21S) or "EPSG:5347" (POSGAR 2007 / Argentina 5)
  origin: [number, number];            // x,y (CRS metres) of the OUTER upper-left corner of cell [0,0]; rows run north → south, cols west → east
  cell_m: number;                      // square cell size, 0.25–0.5 m (accepted 0.1–1.0)
  cols: number; rows: number;
  z: (number | null)[];                // rows*cols elevations in metres, row-major; null (or `nodata`) = outside the green
  nodata?: number | null;
  vertical_datum: string;              // e.g. "EGM2008", "SRVN16", "ellipsoidal (WGS84)", "local"
  accuracy: { horizontal_cm: number; vertical_cm: number; method?: string };   // RMSE vs check points
  source: { provider: string; method: "lidar" | "photogrammetry" | "gnss" | "other"; survey_date: string; license: string; notes?: string };
  outline?: [number, number][];        // optional green edge [lng,lat] used for masking
  synthetic?: boolean;                 // QA-only surfaces; NEVER accepted for import (DB check too)
};

export function validateSurface(s: any): string[] {
  const err: string[] = [];
  if (!s || typeof s !== "object") return ["no es un objeto"];
  if (s.format !== GREEN_SURFACE_FORMAT) err.push(`format debe ser ${GREEN_SURFACE_FORMAT}`);
  if (s.synthetic) err.push("superficie sintética: solo para pruebas locales, no se importa");
  if (!/^\d{1,6}$/.test(String(s.club_code ?? ""))) err.push("club_code inválido");
  if (!s.course || typeof s.course !== "string") err.push("course requerido");
  if (!Number.isInteger(s.hole) || s.hole < 1 || s.hole > 36) err.push("hole inválido");
  if (!/^EPSG:\d{4,5}$/.test(String(s.crs ?? "")) || s.crs === "EPSG:4326" || s.crs === "EPSG:3857") err.push("crs debe ser proyectado en metros (p. ej. EPSG:32721 o EPSG:5347)");
  if (!Array.isArray(s.origin) || s.origin.length !== 2 || !s.origin.every(Number.isFinite)) err.push("origin [x,y] requerido");
  if (!(s.cell_m >= 0.1 && s.cell_m <= 1)) err.push("cell_m fuera de rango (0.1–1.0 m; ideal 0.25–0.5)");
  if (!Number.isInteger(s.cols) || !Number.isInteger(s.rows) || s.cols < 8 || s.rows < 8 || s.cols * s.rows > 250_000) err.push("cols/rows inválidos");
  if (!Array.isArray(s.z) || s.z.length !== s.cols * s.rows) err.push("z debe tener rows*cols valores");
  else {
    const v = s.z.filter((x: any) => x != null && x !== s.nodata);
    if (v.some((x: any) => !Number.isFinite(x))) err.push("z con valores no numéricos");
    else if (v.length < 64) err.push("muy pocas celdas con dato");
    else { let lo = Infinity, hi = -Infinity; for (const x of v) { if (x < lo) lo = x; if (x > hi) hi = x; } if (hi - lo > 15) err.push("desnivel > 15 m: ¿unidades o nodata mal?"); }
  }
  if (!s.vertical_datum) err.push("vertical_datum requerido");
  if (!(s.accuracy?.vertical_cm > 0) || !(s.accuracy?.horizontal_cm > 0)) err.push("accuracy.horizontal_cm/vertical_cm requeridos");
  else if (s.accuracy.vertical_cm > 5) err.push("precisión vertical > 5 cm: no alcanza para leer pendientes de green");
  const src = s.source || {};
  if (!src.provider) err.push("source.provider requerido");
  if (!["lidar", "photogrammetry", "gnss", "other"].includes(src.method)) err.push("source.method inválido");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(src.survey_date ?? ""))) err.push("source.survey_date (YYYY-MM-DD) requerido");
  if (!src.license) err.push("source.license requerido (permiso de uso)");
  return err;
}

/** Slope in % at each cell (central differences); used by tests and the summary stored on import. */
export function slopeStats(s: Pick<GreenSurface, "cols" | "rows" | "cell_m" | "z" | "nodata">) {
  const { cols: W, rows: H, cell_m: c } = s, z = (i: number) => { const v = s.z[i]; return v == null || v === s.nodata ? NaN : v; };
  const out: number[] = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const l = z(y * W + x - 1), r = z(y * W + x + 1), u = z((y - 1) * W + x), d = z((y + 1) * W + x);
    if ([l, r, u, d, z(y * W + x)].some(Number.isNaN)) continue;
    out.push(100 * Math.hypot((r - l) / (2 * c), (d - u) / (2 * c)));
  }
  out.sort((a, b) => a - b);
  const p = (k: number) => out.length ? Math.round(out[Math.min(out.length - 1, Math.floor(k * out.length))] * 10) / 10 : null;
  return { cells: out.length, median_pct: p(0.5), p90_pct: p(0.9), max_pct: p(1) };
}
