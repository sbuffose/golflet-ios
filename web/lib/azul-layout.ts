/** Cancha Azul hole numbers. Stored geometry and the imported card keep one order.
 *  A display swap of ±9 from 2026-11-22 was added without a club survey and the
 *  rows in course_map_hole were never rewritten. Hole 10 is the same green as
 *  the stored hole 10. No other renumbering was verified, so the screen uses
 *  the stored hole. azulNineSwap is the withdrawn formula and is not applied. */

export const AZUL_NINE_SWAP_FROM = "2026-11-22";

export function azulNineSwap(hole: number): number {
  const n = Math.round(Number(hole));
  if (!Number.isInteger(n) || n < 1 || n > 18) return n;
  return n <= 9 ? n + 9 : n - 9;
}

/** Stored order for every date and every layout request. */
export function azulCurrentLayout(_playedOn?: string | null, _layout?: string | null): boolean {
  return false;
}

/** Display hole and stored hole are the same number. */
export function azulStoredHole(displayHole: number, playedOn?: string | null, layout?: string | null): number {
  return azulCurrentLayout(playedOn, layout) ? azulNineSwap(displayHole) : displayHole;
}

export function relabelAzulHoles<T extends { hole?: number }>(holes: T[], playedOn?: string | null, layout?: string | null): T[] {
  if (!azulCurrentLayout(playedOn, layout)) return holes;
  return holes
    .map(h => {
      const n = Number(h.hole);
      if (!Number.isInteger(n) || n < 1 || n > 18) return h;
      return { ...h, hole: azulNineSwap(n) };
    })
    .sort((a, b) => Number(a.hole) - Number(b.hole));
}
