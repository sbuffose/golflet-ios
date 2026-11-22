/** Cancha Azul hole numbers. Stored geometry and the imported card keep the order used through 2026-11-21.
 *  From 2026-11-22 the club swapped the nines: stored hole N is shown as N+9 (1–9 → 10–18) and stored N+9 as N.
 *  The swap is its own inverse. Historical rounds pass their date and stay on the stored numbers. */

export const AZUL_NINE_SWAP_FROM = "2026-11-22";

export function azulNineSwap(hole: number): number {
  const n = Math.round(Number(hole));
  if (!Number.isInteger(n) || n < 1 || n > 18) return n;
  return n <= 9 ? n + 9 : n - 9;
}

/** Current layout when the day is on or after the swap, or the caller asks for it.
 *  A request with no day and no layout stays on the stored order: the installed iOS app
 *  does not send a day, and its compiled geometry is still the old numbering. */
export function azulCurrentLayout(playedOn?: string | null, layout?: string | null): boolean {
  const mode = String(layout || "").toLowerCase();
  if (mode === "legacy" || mode === "viejo") return false;
  if (mode === "current" || mode === "nuevo") return true;
  const day = String(playedOn || "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return day >= AZUL_NINE_SWAP_FROM;
  return false;
}

/** Display hole → stored hole. Before the swap, and for a legacy request, they are the same number. */
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
