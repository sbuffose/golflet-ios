/** t171u: detailed course maps (open data). Read-only API helpers. */
import { greenSurfaceHoles } from "./green-surface";
import { q } from "./db";
import { holeWind, courseCompleteness, markersToEntrance, type Completeness } from "./course-map-core";
import { getGreenGuide } from "./green-guide";
import { azulBundledMap, isJockeyAzul } from "./azul-osm";
import { mergeTrace, readAcceptedTraces } from "./course-trace";

export const IMAGERY = {
  provider: "ign_ortho_amba_2013",
  attribution: "Ortomosaico AMBA 2013 © Instituto Geográfico Nacional (IGN), Argentina — reutilización libre (Ley 27.275)",
  wms: { url: "https://imagenes.ign.gob.ar/geoserver/wms", layer: "ortomosaicos_fotogrametria:amba_3_2013", version: "1.1.1", srs: ["EPSG:4326", "EPSG:32721", "EPSG:3857"] },
};
/** Optional newer imagery once a key is configured (ArcGIS Location Platform; key restricted by referrer on Esri's side). */
export function imageryConfig() {
  const esri = process.env.ESRI_BASEMAP_KEY ? {
    provider: "esri_world_imagery", attribution: "Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    tiles: "https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", needs_token: true,
  } : null;
  return { default: IMAGERY, ...(esri ? { recent: esri } : {}) };
}

export async function listCourseMaps() {
  return q(`select m.club_code, m.course, m.extracted_at, m.imported_at, m.summary->'holes' as holes, m.summary->'holes_with' as holes_with,
            coalesce(jsonb_array_length(m.summary->'issues'), 0) as issues, c.name as club_name
            from course_map m left join club c on c.code=m.club_code order by m.club_code, m.course`);
}

export async function getCourseMap(clubCode: string, course: string, o: { hole?: number | null; windFrom?: number | null; windKmh?: number | null } = {}) {
  const [m] = await q(`select id, club_code, course, extracted_at, imported_at, sources, boundary, summary from course_map where club_code=$1 and lower(course)=lower($2)`, [clubCode, course]);
  if (!m) {
    if (!isJockeyAzul(clubCode, course)) return null;
    const bundled = azulBundledMap(o.hole);
    const traces = await readAcceptedTraces(clubCode, course);
    return { ...bundled, imagery: imageryConfig(), holes: bundled.holes.map(h => mergeTrace(h, traces.find((t: any) => Number(t.hole) === h.hole) || null)) };
  }
  const holes = await q(`select hole, data, crosscheck, coverage from course_map_hole where course_map_id=$1 ${o.hole ? "and hole=$2" : ""} order by hole`, o.hole ? [m.id, o.hole] : [m.id]);
  const traces = await readAcceptedTraces(m.club_code, m.course);
  const wind = o.windFrom != null && o.windKmh != null, gg = getGreenGuide(m.club_code, m.course);
  const { id, ...meta } = m;
  return {
    ...meta, imagery: imageryConfig(), completeness: await courseCompletenessFor(m.club_code, m.course),
    green_surfaces: await greenSurfaceHoles(m.club_code, m.course),   // t181u: holes whose green has a REAL slope survey (usually none)
    attribution: [m.sources?.osm?.attribution, m.sources?.trace?.attribution, m.sources?.dem?.attribution].filter(Boolean),
    holes: holes.map(h => withGuide(mergeTrace({ ...h.data, crosscheck: h.crosscheck, coverage: h.coverage, ...(wind ? { wind: holeWind(h.data, o.windFrom!, o.windKmh!) } : {}) }, traces.find((t: any) => Number(t.hole) === h.hole) || null), h.hole, gg)),
    marker_ref: gg?.marker_ref?.to === "entrada" ? { to: "entrada", label: "a la entrada del green", source: gg.marker_ref.source } : { to: "centro", label: "al centro del green", source: "mapa" },
  };
}

/** t198u: completeness of one course (map coverage + club guide). Courses with neither → en relevamiento. */
export async function courseCompletenessFor(clubCode: string, course: string): Promise<Completeness & { override?: "guia_club" }> {
  const [m] = await q(`select id from course_map where club_code=$1 and lower(course)=lower($2)`, [clubCode, course]);
  const rows = m ? await q(`select hole, coverage, (crosscheck->'card'->>'par')::int par from course_map_hole where course_map_id=$1 order by hole`, [m.id]) : [];
  if (!m || rows.some((r: any) => r.par == null)) {   // pars from the club card when the map has none
    const [c] = await q(`select c.holes from course c join club k on k.id=c.club_id where k.code=$1 and lower(c.name)=lower($2)`, [clubCode, course]);
    for (let n = 1; n <= 18; n++) { const p = (c?.holes || []).find((h: any) => h.hole === n)?.par ?? null; const r = rows.find((x: any) => x.hole === n);
      if (r) r.par = r.par ?? p; else rows.push({ hole: n, par: p, coverage: null }); }
  }
  const g = getGreenGuide(clubCode, course), r = courseCompleteness(rows, g as any);
  // t201u: exception to the gate — MdP Cancha Vieja keeps its libreta (real club green guide) while the mapping is finished. Status stays honest; no ± yd.
  if (g && LIBRETA_GUIDE_OVERRIDE.has(`${clubCode}|${course.toLowerCase()}`) && !r.ready.libreta) return { ...r, ready: { libreta: true, wind_yd: false }, override: "guia_club" as const };
  return r;
}
/** Courses whose printed libreta stays available from the club guide while the map is incomplete (owner decision t201u). */
export const LIBRETA_GUIDE_OVERRIDE = new Set(["209|cancha vieja"]);

/** t227u: per course (club guide): markers measured to the entrance when the guide says so, and the green's false-front end (yd from the front). */
function withGuide(h: any, n: number, gg: ReturnType<typeof getGreenGuide>) {
  if (!gg) return h;
  const G = gg.greens?.[n], ff = G?.false_front, out = gg.marker_ref?.to === "entrada" ? markersToEntrance(h, gg.holes?.[n]?.markers) : h;
  if (!G || !out.green) return out;
  // t229u: the guide's numbers on the green = yd from the entrance (back = depth, false-front end, edge spots, level changes)
  const guide = { depth_yd: G.depth_yd, marks: (G.marks || []).map(k => ({ yd: k.yd, u: k.u, kind: k.kind })), source: "guia_club" };
  return { ...out, green: { ...out.green, guide, ...(ff ? { false_front: { yd: ff.yd, kind: ff.kind, conf: ff.conf, source: "guia_club" } } : {}) } };
}
