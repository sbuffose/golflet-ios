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
