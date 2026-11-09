/** Manufacturer facts checked against official pages. No live scrape.
 *  A row applies only to that brand + model + club type. The same model name on another type is a different row.
 *  Checked 2026-11-09. Models that are not listed here stay unknown. */
import { findBrand, type Category } from "./club-catalog";

export const SPEC_CHECKED = "2026-11-09";

export type MakerRow = {
  brand: string;
  model: string;
  category: Category;
  sourceUrl: string;
  sourceTitle: string;
  loftOptions: number[];
  /** One lie for every loft of this exact model. Omitted when the published lie changes by loft. */
  lieDeg?: number;
  lengthIn?: number;
  volumeCc?: number;
  /** Published hosel step. Not the player's resulting loft. */
  hoselStepDeg?: number;
  notes?: string[];
};

export const MAKER_SPECS: MakerRow[] = [
  {
    brand: "Titleist", model: "GT2", category: "driver",
    sourceUrl: "https://www.titleist.com/golf-clubs/drivers/gt2",
    sourceTitle: "Titleist GT2 Driver",
    loftOptions: [8, 9, 10, 11],
    lieDeg: 58.5, lengthIn: 45.5, volumeCc: 460, hoselStepDeg: 0.75,
    notes: ["Lie 58,5° en la posición A1 del SureFit.", "Largo estándar de hombre 45,5 in. El largo de mujer publicado es 44,5 in."],
  },
  {
    brand: "Titleist", model: "GT2", category: "fairway",
    sourceUrl: "https://www.titleist.com/golf-clubs/fairways/gt2",
    sourceTitle: "Titleist GT2 Fairway",
    loftOptions: [13.5, 15, 16.5, 18, 21],
    hoselStepDeg: 0.75,
    notes: ["El lie publicado cambia con el loft (56,5° a 58°). No es el lie de tu palo."],
  },
  {
    brand: "Titleist", model: "GT2", category: "hybrid",
    sourceUrl: "https://www.titleist.com.au/golf-clubs/specifications",
    sourceTitle: "Titleist GT specifications",
    loftOptions: [18, 21, 24],
    notes: ["El hosel SureFit del híbrido cambia loft y lie en pasos de 1°."],
  },
  {
    brand: "TaylorMade", model: "Qi35", category: "driver",
    sourceUrl: "https://www.taylormadegolf.com/on/demandware.static/-/Sites-TMaG-Library/en_US/v1784786557256/docs/productspecs/2025/Qi35-Core-Driver.pdf",
    sourceTitle: "TaylorMade Qi35 driver spec sheet (2025)",
    loftOptions: [9, 10.5, 12],
    volumeCc: 460, lengthIn: 45.75,
    notes: ["Lie publicado 56°–60°.", "12° figura solo para diestros. 9° y 10,5° para diestros y zurdos.", "La ficha nombra una manga de loft de 4°. No la convertimos al loft de tu palo."],
  },
  {
    brand: "TaylorMade", model: "Qi35 LS", category: "driver",
    sourceUrl: "https://www.taylormadegolf.com/Qi35-LS-Driver/DW-TC366.html",
    sourceTitle: "TaylorMade Qi35 LS Driver",
    loftOptions: [8, 9, 10.5],
    volumeCc: 460, lengthIn: 45.75,
    notes: ["Lie publicado 54°–58°.", "8° figura solo para diestros."],
  },
  {
    brand: "TaylorMade", model: "Qi35 Max", category: "driver",
    sourceUrl: "https://www.taylormadegolf.com/on/demandware.static/-/Sites-TMaG-Library/en_US/v1784786557256/docs/productspecs/2025/Qi35-Core-Driver.pdf",
    sourceTitle: "TaylorMade Qi35 Max driver spec sheet (2025)",
    loftOptions: [9, 10.5, 12],
    volumeCc: 460, lengthIn: 45.75,
    notes: ["Lie publicado 58°–62°. No es el lie del Qi35."],
  },
  {
    brand: "Titleist", model: "Vokey SM10", category: "wedge",
    sourceUrl: "https://www.titleist.com/golf-clubs/wedges/sm10",
    sourceTitle: "Vokey SM10",
    loftOptions: [46, 48, 50, 52, 54, 56, 58, 60, 62],
    lieDeg: 64,
    notes: ["El bounce y el grind cambian con cada loft. No los asignamos a tu palo.", "El lie estándar publicado es 64° para todos los modelos de la ficha."],
  },
];

/** Same name, more than one official loft table. We do not pick a generation. */
export const AMBIGUOUS_SPECS: { brand: string; model: string; category: Category; message: string }[] = [
  {
    brand: "Titleist", model: "T100", category: "iron",
    message: "Titleist publicó más de una generación de T100 con lofts distintos (el 7 hierro figura en 33° en la ficha actual y en 34° en una ficha anterior). Sin el año del modelo no elegimos una.",
  },
];

export type SpecMatch = {
  status: "match";
  brand: string;
  model: string;
  category: Category;
  sourceUrl: string;
  sourceTitle: string;
  checked: string;
  loftOptions: number[];
  lines: { label: string; value: string }[];
};

export type SpecGap = { status: "missing" | "ambiguous" | "brand-only"; message: string };

const norm = (s: string) => s.trim().toLowerCase();

export function loftLabel(value: number): string {
  const n = Math.round(value * 2) / 2;
  return `${String(n).replace(".", ",")}°`;
}

function linesOf(row: MakerRow): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [
    { label: "Lofts de fábrica", value: row.loftOptions.map(loftLabel).join(" · ") },
  ];
  if (row.lieDeg != null) out.push({ label: "Lie publicado", value: loftLabel(row.lieDeg) });
  if (row.lengthIn != null) out.push({ label: "Largo publicado", value: `${String(row.lengthIn).replace(".", ",")} in` });
  if (row.volumeCc != null) out.push({ label: "Volumen publicado", value: `${row.volumeCc} cc` });
  if (row.hoselStepDeg != null) out.push({ label: "Ajuste publicado", value: `Pasos de ${loftLabel(row.hoselStepDeg)} en loft y lie. No es el loft de tu palo.` });
  for (const note of row.notes || []) out.push({ label: "Ficha", value: note });
  return out;
}

/** Exact brand, model and club type. Brand alone, another type, or an ambiguous name returns no numbers. */
export function lookupMaker(input: { brand?: string | null; model?: string | null; category?: Category | null }): SpecMatch | SpecGap {
  const brandIn = String(input.brand || "").trim();
  const modelIn = String(input.model || "").trim();
  const category = input.category || null;
  if (!brandIn) return { status: "missing", message: "Sin marca: no hay ficha de fábrica para mostrar." };
  if (!modelIn) return { status: "brand-only", message: "Con la marca sola no alcanza. Elegí el modelo: el mismo nombre puede ser otro palo." };
  if (!category) return { status: "missing", message: "Falta el tipo de palo, así que no buscamos una ficha." };
  const brand = findBrand(brandIn) || brandIn;
  const amb = AMBIGUOUS_SPECS.find(a => norm(a.brand) === norm(brand) && norm(a.model) === norm(modelIn) && a.category === category);
  if (amb) return { status: "ambiguous", message: amb.message };
  const row = MAKER_SPECS.find(s => norm(s.brand) === norm(brand) && norm(s.model) === norm(modelIn) && s.category === category);
  if (!row) {
    const other = MAKER_SPECS.find(s => norm(s.brand) === norm(brand) && norm(s.model) === norm(modelIn));
    if (other) return { status: "missing", message: `La ficha de ${rowName(brand, modelIn)} que tenemos es de ${typeName(other.category)}, no de ${typeName(category)}.` };
    return { status: "missing", message: "No tenemos una ficha oficial de este modelo para este tipo de palo." };
  }
  return {
    status: "match", brand: row.brand, model: row.model, category: row.category,
    sourceUrl: row.sourceUrl, sourceTitle: row.sourceTitle, checked: SPEC_CHECKED,
    loftOptions: [...row.loftOptions], lines: linesOf(row),
  };
}

function typeName(c: Category): string {
  return { driver: "driver", fairway: "madera", hybrid: "híbrido", iron: "hierro", wedge: "wedge", putter: "putter" }[c];
}
function rowName(brand: string, model: string) { return `${brand} ${model}`; }
