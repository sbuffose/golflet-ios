/** t150u: curated text settings (brand-safe). size → text scale; big numbers (≥ 26 px) scale less. weight → one step heavier (max 700). */
export const TEXT_SIZES = { normal: { scale: 1, big: 1 }, grande: { scale: 1.15, big: 1.06 }, muy_grande: { scale: 1.3, big: 1.12 } } as const;
export const TEXT_SIZE_ALIAS: Record<string, TextSize> = { "100": "normal", "115": "grande", "130": "muy_grande" };
export const TEXT_WEIGHTS = ["normal", "marcado"] as const;
export type TextSize = keyof typeof TEXT_SIZES; export type TextWeight = typeof TEXT_WEIGHTS[number];
export const isTextSize = (v: unknown): v is TextSize => typeof v === "string" && v in TEXT_SIZES;
export const isTextWeight = (v: unknown): v is TextWeight => typeof v === "string" && (TEXT_WEIGHTS as readonly string[]).includes(v);
/** PATCH body → validated patch, or an error message. Any subset of { pace_alert, text_size, text_weight }; at least one. */
export function parseSettingsPatch(b: any): { ok: true; patch: { pace_alert?: boolean; text_size?: TextSize; text_weight?: TextWeight } } | { ok: false; error: string } {
  if (!b || typeof b !== "object") return { ok: false, error: "JSON inválido" };
  const patch: any = {};
  if ("pace_alert" in b) { if (typeof b.pace_alert !== "boolean") return { ok: false, error: "pace_alert: true | false" }; patch.pace_alert = b.pace_alert; }
  if ("text_size" in b) { const v = TEXT_SIZE_ALIAS[String(b.text_size)] ?? b.text_size;   // iOS may send 100 / 115 / 130
    if (!isTextSize(v)) return { ok: false, error: "text_size: normal | grande | muy_grande (o 100 | 115 | 130)" }; patch.text_size = v; }
  if ("text_weight" in b) { if (!isTextWeight(b.text_weight)) return { ok: false, error: "text_weight: normal | marcado" }; patch.text_weight = b.text_weight; }
  if (!Object.keys(patch).length) return { ok: false, error: "Mandá pace_alert, text_size o text_weight" };
  return { ok: true, patch };
}
