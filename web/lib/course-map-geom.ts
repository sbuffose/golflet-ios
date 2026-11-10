/** course_map_hole stores positions as [lng, lat], the same order the strategy map projects.
 *  A {lat, lng} object is already geographic. This does not invent a point. */

export type MapPoint = { lat: number; lng: number };

export function mapLngLat(p: unknown): MapPoint | null {
  if (Array.isArray(p) && p.length >= 2) {
    const lng = Number(p[0]), lat = Number(p[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    if (lat === 0 && lng === 0) return null;
    return { lat, lng };
  }
  if (p && typeof p === "object" && "lat" in p && "lng" in p) {
    const lat = Number((p as { lat: unknown }).lat), lng = Number((p as { lng: unknown }).lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    if (lat === 0 && lng === 0) return null;
    return { lat, lng };
  }
  return null;
}

export function mapRing(raw: unknown): MapPoint[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(mapLngLat).filter((p): p is MapPoint => !!p);
}

export type CourseMapEnds = {
  tee: MapPoint | null;
  front: MapPoint | null;
  center: MapPoint | null;
  back: MapPoint | null;
  line: MapPoint[];
  polygon: MapPoint[];
  bearing: number | null;
};

/** Tee center, green center and the hole line, when the row actually has them. */
export function courseMapEnds(data: any): CourseMapEnds {
  const tee = mapLngLat(data?.tees?.[0]?.center) || mapLngLat(data?.line?.[0]) || mapLngLat(data?.tee);
  const front = mapLngLat(data?.green?.front);
  const center = mapLngLat(data?.green?.center) || front;
  const back = mapLngLat(data?.green?.back);
  const line = mapRing(data?.line);
  const polygon = mapRing(data?.green?.polygon);
  const bearing = Number(data?.bearing?.tee_to_green_true);
  return {
    tee, front, center, back, line, polygon,
    bearing: Number.isFinite(bearing) ? bearing : null,
  };
}

/** course_map wins where it has a point. A missing tee or green stays whatever the caller already had. */
type Overlaid<T> = Omit<T, "tee" | "line"> & { tee: MapPoint | null; line: MapPoint[] | null };

export function overlayCourseMapHole<T extends { tee?: MapPoint | null; line?: MapPoint[] | null; green?: any }>(hole: T, data: any): Overlaid<T> {
  const g = courseMapEnds(data);
  if (!g.tee && !g.center && !g.line.length && g.polygon.length < 3) return hole as Overlaid<T>;
  const green = hole.green || {};
  return {
    ...hole,
    tee: g.tee || hole.tee || null,
    line: g.line.length ? g.line : hole.line || null,
    green: {
      ...green,
      front: g.front || green.front || null,
      center: g.center || green.center || null,
      back: g.back || green.back || null,
      ...(g.polygon.length >= 3 ? { polygon: g.polygon, source: "course_map" } : {}),
    },
  };
}
