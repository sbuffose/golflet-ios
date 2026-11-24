/** Cancha Azul hole numbers. Stored geometry and the imported card keep the order
 *  used through 2026-11-21. From 2026-11-22 the display swaps only 3–9 with 12–18:
 *  display 3 is stored 12, display 4 is stored 13, through display 9 = stored 18,
 *  and the other way around. Holes 1, 2, 10 and 11 stay. course_map_hole is not rewritten.
 *  The Golfistics card dated 2026-11-22 already lists par and the men's stroke index
 *  by the number shown that day. Its tee yards stay in the physical order (card 16
 *  AZUL 377 is the old 16). Geometry and yards follow the physical hole. Par and
 *  stroke index follow the displayed number. On physical hole 8 the card prints
 *  AZUL 411 and AMARILLO 500. The handbook is 427 and 391, and BLANCO 417 already
 *  matches, so only those two tees change on screen. Nothing here writes the database. */

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

export const AZUL_AMARILLO_NOTE = "El handbook marca 427 en el azul y 391 en el amarillo. La tarjeta dice 411 y 500 en el hoyo 8 físico.";

type AzulCardRow = { hole?: number; par?: unknown; hcp?: unknown; hole_hcp?: unknown; hcp_raw?: unknown; yards?: unknown };

/** Men's stroke index: the first number of a "9/11" pair. */
export function azulMenIndex(row: AzulCardRow | null | undefined): number | null {
  const raw = row?.hcp ?? row?.hole_hcp ?? row?.hcp_raw;
  if (raw == null || raw === "") return null;
  const n = Number(String(raw).split("/")[0]);
  return Number.isInteger(n) && n >= 1 && n <= 18 ? n : null;
}

export function azulYardRecord(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const n = Number(raw);
    if (Number.isFinite(n)) out[key] = n;
  }
  return Object.keys(out).length ? out : null;
}

/** Physical hole 8's printed AZUL 411 and AMARILLO 500 are 427 and 391. The source row is left untouched. */
export function azulPhysicalYards(yards: unknown, physicalHole: number): { yards: Record<string, number>; note: string | null } {
  const out = { ...(azulYardRecord(yards) || {}) };
  if (physicalHole !== 8) return { yards: out, note: null };
  const azul = out.AZUL === 411;
  const amarillo = out.AMARILLO === 500;
  if (azul) out.AZUL = 427;
  if (amarillo) out.AMARILLO = 391;
  return { yards: out, note: azul || amarillo ? AZUL_AMARILLO_NOTE : null };
}

/** A par 3 of 377 yd is the card yards read by the wrong number. */
export function azulYardsFitPar(par: number, yards: number): boolean {
  if (!Number.isFinite(par) || !Number.isFinite(yards) || yards <= 0) return false;
  if (par <= 3) return yards < 260;
  if (par === 4) return yards >= 250 && yards <= 500;
  return yards >= 390 && yards <= 650;
}

/** After the geometry relabel: par and S.I. from the displayed card row, yards from the physical row. */
export function azulPresentHoles<T extends { hole?: number; par?: unknown; hcp?: unknown; yards?: unknown; yards_note?: string | null }>(
  holes: T[],
  card: AzulCardRow[],
  playedOn?: string | null,
  layout?: string | null,
): T[] {
  const current = azulCurrentLayout(playedOn, layout);
  const cardOf = (n: number) => card.find(row => Number(row.hole) === n);
  return holes.map(hole => {
    const display = Number(hole.hole);
    const physical = current ? azulNineSwap(display) : display;
    const shown = cardOf(current ? display : physical);
    const record = azulYardRecord(hole.yards) || azulYardRecord(cardOf(physical)?.yards);
    const fixed = record ? azulPhysicalYards(record, physical) : null;
    const hcp = azulMenIndex(shown);
    return {
      ...hole,
      ...(shown?.par != null && shown.par !== "" ? { par: Number(shown.par) } : {}),
      ...(hcp != null ? { hcp } : {}),
      ...(fixed ? { yards: fixed.yards } : {}),
      ...(fixed?.note ? { yards_note: fixed.note } : {}),
    };
  });
}
