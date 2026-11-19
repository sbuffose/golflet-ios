/** What happens to a hole when a logged shot is removed or kept off the distance table. */

export const EXCLUDED_DISTANCE = "excluded";

export function postedStrokes(holes: unknown, hole: number): number | null {
  if (!Array.isArray(holes)) return null;
  for (const item of holes) {
    if (Array.isArray(item) && Number(item[0]) === hole && item[2] != null && Number.isFinite(+item[2])) return +item[2];
    if (item && typeof item === "object" && Number((item as { hole?: unknown }).hole) === hole) {
      const strokes = (item as { strokes?: unknown }).strokes;
      if (strokes != null && Number.isFinite(+strokes)) return +strokes;
    }
  }
  return null;
}

export function deleteLine(shotsOnHole: number | null, posted: number | null): string {
  if (shotsOnHole == null || shotsOnHole < 1) {
    return "El golpe sale de la ronda. Las distancias de este palo se recalculan.";
  }
  const next = shotsOnHole - 1;
  if (posted != null) {
    return `La tarjeta del club sigue en ${posted}. Los golpes marcados pasan de ${shotsOnHole} a ${next}, así que dejan de coincidir con ese score. Las distancias de este palo se recalculan.`;
  }
  return `El hoyo pasa de ${shotsOnHole} a ${next} golpes. Las distancias de este palo se recalculan.`;
}

export const excludeLine = "El golpe sigue en el hoyo y en el score. Deja de contar en las distancias de este palo.";
