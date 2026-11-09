/** How a bag club is named, and the 4-iron–PW brand pass. Does not write a database and does not invent a loft. */
import { HttpError } from "./http-error";
import { findBrand, modelsFor, typeByCode, type Category } from "./club-catalog";
import type { Club } from "./bag-core";
import { loftLabel } from "./maker-specs";

export function isPutterCode(code: string | null | undefined): boolean {
  if (!code) return false;
  const t = typeByCode(code);
  if (t) return t.category === "putter";
  return /^(pt|putter)$/i.test(code.trim());
}

const WEDGE_FACE = new Set(["gw", "sw", "lw"]);

export function formatLoft(value: unknown): string {
  if (value == null || value === "") return "";
  const n = Number(String(value).replace(",", "."));
  if (!Number.isFinite(n)) return "";
  return loftLabel(n);
}

/** GW/SW/LW show the saved loft as the name. No loft keeps the stored name. A custom label stays the name. */
export function wedgeTitle(club: { code: string; label?: string | null; loft?: number | null }): { title: string; loftNote: string; usesLoft: boolean } {
  const code = String(club.code || "");
  const label = String(club.label || "").trim();
  const type = typeByCode(code);
  const loft = formatLoft(club.loft);
  if (!WEDGE_FACE.has(code.toLowerCase())) return { title: label || code, loftNote: "", usesLoft: false };
  const catalog = type?.label || "";
  const bag = type?.bag || "";
  const custom = !!label && label !== catalog && label !== bag && label.toLowerCase() !== code.toLowerCase();
  if (custom) return { title: label, loftNote: loft, usesLoft: false };
  if (!loft) return { title: label || catalog || code, loftNote: "", usesLoft: false };
  return { title: loft, loftNote: "", usesLoft: true };
}

export const IRON_SET_CODES = ["4i", "5i", "6i", "7i", "8i", "9i", "PW"] as const;

export type IronPlanRow = {
  code: string;
  label: string;
  brand: string | null;
  model: string | null;
  nextBrand: string;
  nextModel: string | null;
  modelCustom: boolean;
  modelCleared: boolean;
  overwrite: boolean;
  note: string;
};

function cleanBrand(raw: unknown): string {
  const text = String(raw || "").trim().replace(/\s+/g, " ");
  if (!text || text.length > 40) throw new HttpError(400, "Escribí la marca.");
  return findBrand(text) || text;
}

export function planIronSet(list: Club[], raw: { brand?: unknown; model?: unknown; codes?: unknown }): { rows: IronPlanRow[]; clubs: Club[] } {
  const brand = cleanBrand(raw?.brand);
  const modelIn = String(raw?.model ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  const asked = Array.isArray(raw?.codes) ? raw.codes.map(c => String(c)) : null;
  if (asked && !asked.length) throw new HttpError(400, "Elegí al menos un hierro.");
  const wanted = asked || [...IRON_SET_CODES];
  const bad = wanted.find(c => !IRON_SET_CODES.some(x => x.toLowerCase() === c.toLowerCase()));
  if (bad) throw new HttpError(400, "Ese juego es solo del 4 al PW. No incluye maderas, wedges ni el putter.");
  const catalogModels = modelsFor(brand, "iron" as Category);
  const catalogHit = modelIn ? catalogModels.find(m => m.toLowerCase() === modelIn.toLowerCase()) || null : null;
  const nextModel = modelIn ? (catalogHit || modelIn) : null;
  const modelCustom = !!modelIn && !catalogHit;
  const rows: IronPlanRow[] = [];
  const next = list.map(c => ({ ...c }));
  for (const code of wanted) {
    const club = next.find(c => c.code.toLowerCase() === code.toLowerCase());
    if (!club) throw new HttpError(404, `No está en tu bolsa (${code}). No lo creamos.`);
    let model = nextModel;
    let custom = modelCustom;
    let cleared = false;
    if (!modelIn) {
      const kept = club.model ? catalogModels.find(m => m.toLowerCase() === String(club.model).toLowerCase()) : null;
      model = kept || null;
      custom = false;
      cleared = !!club.model && !kept;
    }
    const overwrite = (!!club.brand && club.brand.toLowerCase() !== brand.toLowerCase()) || (!!club.model && (club.model || "").toLowerCase() !== (model || "").toLowerCase());
    const note = cleared
      ? `Se quita «${club.model}»: no está entre los hierros de ${brand}.`
      : overwrite
        ? `Reemplaza ${[club.brand, club.model].filter(Boolean).join(" ") || "la marca actual"}.`
        : model ? "Misma marca, o el palo todavía no tenía modelo." : "Queda la marca, sin modelo.";
    rows.push({
      code: club.code, label: club.label, brand: club.brand || null, model: club.model || null,
      nextBrand: brand, nextModel: model, modelCustom: custom, modelCleared: cleared, overwrite, note,
    });
    club.brand = brand;
    club.model = model;
    club.model_custom = custom;
  }
  return { rows, clubs: next };
}
