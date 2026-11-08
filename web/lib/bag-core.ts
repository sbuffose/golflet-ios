/** Mi bolsa equipment (pure): brand/model per club on player_clubs items. No DB, no lib/http. */
import { HttpError } from "./http-error";
import { CLUB_TYPES, typeByCode, categoryOf, findBrand, modelsFor, type Category } from "./club-catalog";

export type Club = { code: string; label: string; enabled: boolean; brand?: string | null; model?: string | null; model_custom?: boolean; loft?: number | null };
const txt = (v: unknown, n: number) => { const s = String(v ?? "").replace(/\s+/g, " ").trim(); return s ? s.slice(0, n) : null; };

/** Validate brand/model/loft for a club of that category. Catalog brands are canonicalized; unknown ones are kept as typed. */
export function cleanEquipment(raw: any, cat: Category | null) {
  const brandIn = txt(raw?.brand, 40), modelIn = txt(raw?.model, 60);
  if (!brandIn && modelIn) throw new HttpError(400, "Elegí la marca antes del modelo.");
  const brand = brandIn ? findBrand(brandIn) || brandIn : null;
  let model = modelIn, custom = false;
  if (brand && model) {
    const list = cat ? modelsFor(brand, cat) : [];
    const hit = list.find(m => m.toLowerCase() === model!.toLowerCase());
    if (hit) model = hit; else custom = true;          // not in the list → typed by hand, marked as such
  }
  let loft: number | null = null;
  if (raw?.loft != null && raw.loft !== "") {
    const l = Number(String(raw.loft).replace(",", "."));
    if (!Number.isFinite(l) || l < 5 || l > 70) throw new HttpError(400, "El loft va entre 5° y 70°.");
    loft = Math.round(l * 2) / 2;
  }
  return { brand, model, model_custom: custom, loft };
}

/** iPhone PUT /api/my-clubs sends {code,label,enabled} only: keep the brand/model we already had for that code. */
export function mergeEquipment(incoming: Club[], prev: Club[]): Club[] {
  const by = new Map(prev.map(c => [c.code.toLowerCase(), c]));
  return incoming.map((c: any) => {
    const p = by.get(c.code.toLowerCase());
    if ("brand" in c || !p) return c;
    const keep: any = {}; for (const k of ["brand", "model", "model_custom", "loft"] as const) if ((p as any)[k] != null) keep[k] = (p as any)[k];
    return { ...c, ...keep };
  });
}

export function addClub(list: Club[], raw: any): Club {
  const t = typeByCode(String(raw?.code ?? ""));
  if (!t) throw new HttpError(400, "Elegí el tipo de palo.");
  if (list.some(c => c.code.toLowerCase() === t.code.toLowerCase())) throw new HttpError(409, `Ya tenés ${t.label} en la bolsa: editalo.`);
  if (list.length >= 30) throw new HttpError(400, "La bolsa admite hasta 30 palos.");
  const eq = cleanEquipment(raw, t.category);
  return { code: t.code, label: t.label, enabled: true, ...eq, loft: eq.loft ?? t.loft ?? null };
}
export function editClub(c: Club, raw: any): Club {
  const eq = cleanEquipment({ brand: "brand" in (raw || {}) ? raw.brand : c.brand, model: "model" in (raw || {}) ? raw.model : c.model, loft: "loft" in (raw || {}) ? raw.loft : c.loft }, categoryOf(c.code, c.label));
  return { ...c, ...eq, ...(raw && "enabled" in raw ? { enabled: raw.enabled !== false } : {}) };
}
/** Sort like a real bag: driver → woods → hybrids → irons → wedges → putter, then by code. */
const ORDER: Category[] = ["driver", "fairway", "hybrid", "iron", "wedge", "putter"];
export function sortBag(list: Club[]): Club[] {
  const idx = (c: Club) => { const t = CLUB_TYPES.findIndex(x => x.code.toLowerCase() === c.code.toLowerCase()); return t >= 0 ? t : ORDER.indexOf(categoryOf(c.code, c.label) || "iron") * 100 + 1000; };
  return [...list].sort((a, b) => idx(a) - idx(b));
}
/** Row label in the yardage table (bag) for a club code: PW/GW/SW/LW keep their short names there. */
export const bagLabel = (c: Club) => typeByCode(c.code)?.bag ?? (categoryOf(c.code, c.label) === "putter" ? null : c.label);
