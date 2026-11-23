/** Cancha Azul hole numbers. Stored geometry and the imported card keep the order
 *  used through 2026-11-21. From 2026-11-22 the display swaps only 3–9 with 12–18:
 *  display 3 is stored 12, display 4 is stored 13, through display 9 = stored 18,
 *  and the other way around. Holes 1, 2, 10 and 11 stay. course_map_hole is not rewritten.
 *  Par, yards and stroke index travel with the physical hole. The official card
 *  still lists the stored order, so its stroke index is not applied by display number. */

export const AZUL_NINE_SWAP_FROM = "2026-11-22";

export function azulNineSwap(hole: number): number {
  const n = Math.round(Number(hole));
  if (!Number.isInteger(n) || n < 1 || n > 18) return n;
  if (n >= 3 && n <= 9) return n + 9;
  if (n >= 12 && n <= 18) return n - 9;
  return n;
}

/** Current layout on or after the change, or when the caller asks for it.
 *  A request with no day and no layout stays on the stored order. */
export function azulCurrentLayout(playedOn?: string | null, layout?: string | null): boolean {
  const mode = String(layout || "").toLowerCase();
  if (mode === "legacy" || mode === "viejo") return false;
  if (mode === "current" || mode === "nuevo") return true;
  const day = String(playedOn || "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return day >= AZUL_NINE_SWAP_FROM;
  return false;
}

/** Display hole → stored hole. */
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
