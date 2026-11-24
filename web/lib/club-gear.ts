/** Official club photos we store ourselves, and tour players checked against a public WITB.
 *  A photo is used only for that brand + model. Two clubs that share a name (GT2 driver and GT2 fairway)
 *  stay on their own photo. A model with no photo here gets a silhouette, never another model's picture.
 *  Checked 2026-11-19. */
import type { Category } from "./club-catalog";

export const GEAR_CHECKED = "2026-11-19";

export type GearPhoto = {
  brand: string;
  model: string;
  category: Category;
  src: string;
  sourceUrl: string;
  sourceTitle: string;
  checked: string;
};

export type GearPlayer = {
  id: string;
  brand: string;
  model: string;
  category: Category;
  name: string;
  tour: string;
  sourceUrl: string;
  sourceTitle: string;
  when: string;
  whenLabel: string;
};

export const GEAR_PHOTOS: GearPhoto[] = [
  {
    brand: "Titleist", model: "GT2", category: "driver",
    src: "/clubs/models/titleist-gt2-driver.jpg",
    sourceUrl: "https://www.titleist.com/golf-clubs/drivers/gt2",
    sourceTitle: "Titleist GT2 Driver",
    checked: GEAR_CHECKED,
  },
  {
    brand: "Titleist", model: "GT2", category: "fairway",
    src: "/clubs/models/titleist-gt2-fairway.jpg",
    sourceUrl: "https://www.titleist.com/golf-clubs/fairways/gt2",
    sourceTitle: "Titleist GT2 Fairway",
    checked: GEAR_CHECKED,
  },
  {
    brand: "Titleist", model: "T150", category: "iron",
    src: "/clubs/models/titleist-t150-iron.jpg",
    sourceUrl: "https://www.titleist.com/golf-clubs/irons/t150-2023",
    sourceTitle: "Titleist T150, catálogo 2023",
    checked: GEAR_CHECKED,
  },
];

export const GEAR_PLAYERS: GearPlayer[] = [
  {
    id: "zalatoris", brand: "Titleist", model: "GT2", category: "driver",
    name: "Will Zalatoris", tour: "PGA Tour",
    sourceUrl: "https://golfwrx.com/752701/will-zalatoris-witb-2025-january/",
    sourceTitle: "Will Zalatoris WITB 2025 (January)",
    when: "2025-01-14", whenLabel: "14 ene 2025",
  },
  {
    id: "young", brand: "Titleist", model: "GT2", category: "driver",
    name: "Cameron Young", tour: "PGA Tour",
    sourceUrl: "https://golfwrx.com/761858/cameron-young-witb-2025-june/",
    sourceTitle: "Cameron Young WITB 2025 (June)",
    when: "2025-06-16", whenLabel: "16 jun 2025",
  },
  {
    id: "cauley", brand: "Titleist", model: "GT2", category: "driver",
    name: "Bud Cauley", tour: "PGA Tour",
    sourceUrl: "https://golfwrx.com/761979/bud-cauley-witb-2025-june/",
    sourceTitle: "Bud Cauley WITB 2025 (June)",
    when: "2025-06-18", whenLabel: "18 jun 2025",
  },
  {
    id: "young", brand: "Titleist", model: "GT2", category: "fairway",
    name: "Cameron Young", tour: "PGA Tour",
    sourceUrl: "https://golfwrx.com/761858/cameron-young-witb-2025-june/",
    sourceTitle: "Cameron Young WITB 2025 (June)",
    when: "2025-06-16", whenLabel: "16 jun 2025",
  },
  {
    id: "cauley", brand: "Titleist", model: "GT2", category: "fairway",
    name: "Bud Cauley", tour: "PGA Tour",
    sourceUrl: "https://golfwrx.com/761979/bud-cauley-witb-2025-june/",
    sourceTitle: "Bud Cauley WITB 2025 (June)",
    when: "2025-06-18", whenLabel: "18 jun 2025",
  },
  {
    id: "zalatoris", brand: "Titleist", model: "T150", category: "iron",
    name: "Will Zalatoris", tour: "PGA Tour",
    sourceUrl: "https://golfwrx.com/752701/will-zalatoris-witb-2025-january/",
    sourceTitle: "Will Zalatoris WITB 2025 (January)",
    when: "2025-01-14", whenLabel: "14 ene 2025",
  },
];

const norm = (s: string) => s.trim().toLowerCase();

export function gearPhotos(brand?: string | null, model?: string | null): GearPhoto[] {
  const b = norm(brand || ""), m = norm(model || "");
  if (!b || !m) return [];
  return GEAR_PHOTOS.filter(p => norm(p.brand) === b && norm(p.model) === m);
}

/** The photo for this exact model. One model with a single photo also covers a face of another type (a T150 pitching wedge). Two photos, and the face matches neither, return nothing. */
export function gearPhoto(brand?: string | null, model?: string | null, category?: Category | null): GearPhoto | null {
  const hits = gearPhotos(brand, model);
  if (hits.length === 1) return hits[0];
  if (!category) return null;
  return hits.find(p => p.category === category) || null;
}

export function gearCategory(brand?: string | null, model?: string | null, face?: Category | null): Category | null {
  const photo = gearPhoto(brand, model, face);
  if (photo) return photo.category;
  const hits = gearPhotos(brand, model);
  if (hits.length > 1) return null;
  return face || null;
}

export function gearPlayers(brand?: string | null, model?: string | null, category?: Category | null): GearPlayer[] {
  const resolved = gearCategory(brand, model, category);
  if (!resolved) return [];
  const b = norm(brand || ""), m = norm(model || "");
  if (!b || !m) return [];
  return GEAR_PLAYERS.filter(p => norm(p.brand) === b && norm(p.model) === m && p.category === resolved);
}

export function silhouetteSrc(category?: Category | null): string {
  const name = category && ["driver", "fairway", "hybrid", "iron", "wedge", "putter"].includes(category) ? category : "iron";
  return `/clubs/silhouettes/${name}.svg`;
}

const FACES = ["driver", "fairway", "hybrid", "iron", "wedge", "putter"] as const;
/** Yardage-table names for each equipment code. The bag stores "PW"; Mi bolsa stores code PW and label "Pitching wedge". */
const TYPE_NAMES: { code: string; category: Category; names: string[] }[] = [
  { code: "dr", category: "driver", names: ["driver"] },
  { code: "3w", category: "fairway", names: ["madera 3"] },
  { code: "5w", category: "fairway", names: ["madera 5"] },
  { code: "7w", category: "fairway", names: ["madera 7"] },
  { code: "9w", category: "fairway", names: ["madera 9"] },
  { code: "hy", category: "hybrid", names: ["hibrido"] },
  { code: "2h", category: "hybrid", names: ["hibrido 2"] },
  { code: "3h", category: "hybrid", names: ["hibrido 3"] },
  { code: "4h", category: "hybrid", names: ["hibrido 4"] },
  { code: "5h", category: "hybrid", names: ["hibrido 5"] },
  { code: "6h", category: "hybrid", names: ["hibrido 6"] },
  { code: "2i", category: "iron", names: ["hierro 2"] },
  { code: "3i", category: "iron", names: ["hierro 3"] },
  { code: "4i", category: "iron", names: ["hierro 4"] },
  { code: "5i", category: "iron", names: ["hierro 5"] },
  { code: "6i", category: "iron", names: ["hierro 6"] },
  { code: "7i", category: "iron", names: ["hierro 7"] },
  { code: "8i", category: "iron", names: ["hierro 8"] },
  { code: "9i", category: "iron", names: ["hierro 9"] },
  { code: "pw", category: "wedge", names: ["pw", "pitching wedge"] },
  { code: "gw", category: "wedge", names: ["gw", "gap wedge"] },
  { code: "sw", category: "wedge", names: ["sw", "sand wedge"] },
  { code: "lw", category: "wedge", names: ["lw", "lob wedge"] },
  { code: "pt", category: "putter", names: ["putter", "pt"] },
];

const foldName = (value: unknown) => String(value ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function expandedNames(values: unknown[]): { names: Set<string>; category: Category | null } {
  const names = new Set(values.map(foldName).filter(Boolean));
  let category: Category | null = null;
  for (const type of TYPE_NAMES) {
    if (names.has(type.code) || type.names.some(name => names.has(name))) {
      names.add(type.code);
      type.names.forEach(name => names.add(name));
      category = category || type.category;
    }
  }
  return { names, category };
}

type GearStamp = { brand?: string; model?: string; category?: Category; code?: string };

/** Copy Mi bolsa brand and model onto the yardage rows the track already has. A row that already names a model keeps it. */
export function attachEquipment<T>(bag: T[] | null | undefined, equipment: unknown): Array<T & GearStamp> {
  const rows = Array.isArray(bag) ? bag : [];
  const gear = Array.isArray(equipment) ? equipment : [];
  const indexed = gear.map(item => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const named = expandedNames([row.code, row.label, row.bag, row.club, row.name]);
    const given = FACES.includes(row.category as Category) ? row.category as Category : null;
    return { row, names: named.names, category: given || named.category };
  });
  return rows.map(item => {
    if (!item || typeof item !== "object") return item as T & GearStamp;
    const row = item as Record<string, unknown>;
    const want = expandedNames([row.club, row.code, row.label, row.name, row.id]).names;
    const hit = indexed.find(entry => [...want].some(name => entry.names.has(name)));
    if (!hit) return item;
    const brand = String(row.brand || hit.row.brand || "").trim();
    const model = String(row.model || row.model_name || hit.row.model || hit.row.model_name || "").trim();
    const category = FACES.includes(row.category as Category) ? row.category : hit.category;
    return { ...row, ...(brand ? { brand } : {}), ...(model ? { model } : {}), ...(category ? { category } : {}) } as T & GearStamp;
  });
}
