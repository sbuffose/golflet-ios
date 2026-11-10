/** Golflet's differential replay. PCC is never treated as zero when it is missing. */

export function replayDifferential(
  ags: number | null,
  rating: number | null,
  slope: number | null,
  pcc: number | null,
): { value: number | null; pcc: "missing" | "present" } {
  const pccState = pcc == null || !Number.isFinite(Number(pcc)) ? "missing" : "present";
  if (ags == null || rating == null || slope == null) return { value: null, pcc: pccState };
  const gross = Number(ags), rate = Number(rating), sl = Number(slope);
  if (!Number.isFinite(gross) || !Number.isFinite(rate) || !Number.isFinite(sl) || sl === 0) return { value: null, pcc: pccState };
  return { value: Math.round((113 / sl) * (gross - rate) * 10) / 10, pcc: pccState };
}
