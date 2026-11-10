/** Mi bolsa reference catalog: club types, plus brands and models by category.
 *  Only real, current or recent models. The list isn't exhaustive, so the player can always type the model or brand by hand. */
export type Category = "driver" | "fairway" | "hybrid" | "iron" | "wedge" | "putter";
export const CATEGORY_LABEL: Record<Category, string> = { driver: "Driver", fairway: "Maderas", hybrid: "Híbridos", iron: "Hierros", wedge: "Wedges", putter: "Putter" };

/** Club types the player can add: code (same codes as GPS / launch monitor), label, category, bag-table label. */
export type ClubType = { code: string; label: string; category: Category; bag: string | null; loft?: number };
const T = (code: string, label: string, category: Category, bag: string | null = label, loft?: number): ClubType => ({ code, label, category, bag, ...(loft ? { loft } : {}) });
export const CLUB_TYPES: ClubType[] = [
  T("Dr", "Driver", "driver"),
  T("3W", "Madera 3", "fairway"), T("5W", "Madera 5", "fairway"), T("7W", "Madera 7", "fairway"), T("9W", "Madera 9", "fairway"),
  T("Hy", "Híbrido", "hybrid"), T("2H", "Híbrido 2", "hybrid"), T("3H", "Híbrido 3", "hybrid"), T("4H", "Híbrido 4", "hybrid"), T("5H", "Híbrido 5", "hybrid"), T("6H", "Híbrido 6", "hybrid"),
  T("2i", "Hierro 2", "iron"), T("3i", "Hierro 3", "iron"), T("4i", "Hierro 4", "iron"), T("5i", "Hierro 5", "iron"), T("6i", "Hierro 6", "iron"), T("7i", "Hierro 7", "iron"), T("8i", "Hierro 8", "iron"), T("9i", "Hierro 9", "iron"),
  T("PW", "Pitching wedge", "wedge", "PW"), T("GW", "Gap wedge", "wedge", "GW"), T("SW", "Sand wedge", "wedge", "SW"), T("LW", "Lob wedge", "wedge", "LW"),
  ...[46, 48, 50, 52, 54, 56, 58, 60, 62, 64].map(l => T(`W${l}`, `Wedge ${l}°`, "wedge", `Wedge ${l}°`, l)),
  T("Pt", "Putter", "putter", null),
];
export const typeByCode = (code: string) => CLUB_TYPES.find(t => t.code.toLowerCase() === code.toLowerCase()) || null;
/** Guess the category of a club the player already had (custom codes keep working). */
export function categoryOf(code: string, label = ""): Category | null {
  const t = typeByCode(code); if (t) return t.category;
  const s = `${code} ${label}`.toLowerCase();
  return /putt|^pt\b/.test(s) ? "putter" : /driver|^dr\b/.test(s) ? "driver" : /madera|wood|\dw\b/.test(s) ? "fairway" : /h[ií]brido|hybrid|\dh\b|\bhy\b/.test(s) ? "hybrid" : /wedge|\b[pgsla]w\b/.test(s) ? "wedge" : /hierro|iron|\di\b/.test(s) ? "iron" : null;
}

type Line = Partial<Record<Category, string[]>>;
const WOODS = (d: string[], f: string[], h: string[]): Line => ({ driver: d, fairway: f, hybrid: h });
/** brand → category → models (newest first). */
export const CATALOG: Record<string, Line> = {
  Callaway: { ...WOODS(["Elyte", "Elyte Max Fast", "Elyte Triple Diamond", "Paradym Ai Smoke Max", "Paradym Ai Smoke Triple Diamond", "Paradym", "Rogue ST Max", "Epic Speed", "Mavrik"],
                       ["Elyte", "Paradym Ai Smoke Max", "Paradym", "Rogue ST Max", "Epic Speed", "Mavrik"],
                       ["Elyte", "Apex UW", "Paradym Ai Smoke", "Paradym", "Rogue ST Max", "Apex", "Mavrik"]),
              iron: ["Apex Pro", "Apex CB", "Apex MB", "Apex Ai200", "Apex Ai300", "Elyte", "Paradym Ai Smoke", "Paradym", "Rogue ST Max", "Big Bertha", "Mavrik"],
              wedge: ["Opus", "Opus Platinum", "Jaws Raw", "Jaws MD5", "CB", "Mack Daddy CB"] },
  TaylorMade: { ...WOODS(["Qi35", "Qi35 Max", "Qi35 LS", "Qi10", "Qi10 Max", "Qi10 LS", "Stealth 2", "Stealth 2 Plus", "Stealth", "SIM2", "SIM2 Max", "M6"],
                         ["Qi35", "Qi35 Max", "Qi10", "Qi10 Max", "Stealth 2", "Stealth", "SIM2 Max", "M6"],
                         ["Qi35", "Qi10", "Stealth 2", "Stealth", "SIM2 Max", "M6"]),
                iron: ["P790", "P770", "P7CB", "P7MC", "P7MB", "Qi", "Stealth", "SIM2 Max", "M6"],
                wedge: ["MG4", "MG3", "Milled Grind Hi-Toe", "Hi-Toe 3"],
                putter: ["Spider Tour", "Spider Tour X", "Spider X", "Spider GT", "TP Reserve", "TP Collection"] },
  Titleist: { ...WOODS(["GT2", "GT3", "GT4", "GT1", "TSR2", "TSR3", "TSR4", "TSi2", "TSi3", "TS2", "TS3"],
                       ["GT2", "GT3", "GT1", "TSR2", "TSR3", "TSi2", "TSi3", "TS2"],
                       ["GT2", "GT3", "TSR2", "TSR3", "TSi2", "TSi3", "TS2"]),
              iron: ["T100", "T150", "T200", "T250", "T350", "620 CB", "620 MB", "U505", "T100S", "T300"],
              wedge: ["Vokey SM10", "Vokey SM9", "Vokey SM8", "Vokey SM7"] },
  "Scotty Cameron": { putter: ["Phantom", "Newport", "Newport 2", "Special Select", "Super Select", "Studio Style", "Select", "Futura"] },
  Ping: { ...WOODS(["G440 Max", "G440 LST", "G440 SFT", "G430 Max", "G430 LST", "G430 SFT", "G430 Max 10K", "G425 Max", "G425 LST", "G410"],
                   ["G440 Max", "G440 LST", "G430 Max", "G430 LST", "G425 Max", "G410"],
                   ["G440", "G430", "G425", "G410"]),
          iron: ["i530", "i230", "i525", "i210", "Blueprint S", "Blueprint T", "G440", "G430", "G425", "G730", "G710"],
          wedge: ["s159", "Glide 4.0", "Glide 3.0"],
          putter: ["PLD Milled", "Ping 2023", "Anser", "Sigma 2"] },
  Cobra: { ...WOODS(["DS-Adapt Max", "DS-Adapt LS", "DS-Adapt X", "Darkspeed Max", "Darkspeed LS", "Darkspeed X", "Aerojet", "LTDx", "Radspeed"],
                    ["DS-Adapt", "Darkspeed", "Aerojet", "LTDx"],
                    ["DS-Adapt", "Darkspeed", "Aerojet", "LTDx", "King Tec"]),
           iron: ["King Tour", "King Forged Tec", "King Forged Tec X", "King CB/MB", "DS-Adapt", "Darkspeed", "Aerojet", "LTDx"],
           wedge: ["Snakebite"] },
  Mizuno: { ...WOODS(["ST-Max 230", "ST-Z 230", "ST-X 230", "ST-G", "ST-Z 220", "ST-X 220"], ["ST-Max 230", "ST-Z 230", "ST-X 230"], ["ST-Max 230", "CLK"]),
            iron: ["Pro 241", "Pro 243", "Pro 245", "JPX925 Forged", "JPX925 Hot Metal", "JPX925 Hot Metal Pro", "JPX923 Tour", "JPX923 Forged", "JPX923 Hot Metal", "Pro 221", "Pro 223", "Pro 225"],
            wedge: ["T24", "T22", "ES21", "S23"] },
  Srixon: { ...WOODS(["ZXi", "ZXi LS", "ZXi Max", "ZX5 Mk II", "ZX7 Mk II", "ZX5", "ZX7"], ["ZXi", "ZX Mk II", "ZX"], ["ZXi", "ZX Mk II", "ZX"]),
            iron: ["ZXi4", "ZXi5", "ZXi7", "ZXiU", "ZX4 Mk II", "ZX5 Mk II", "ZX7 Mk II", "Z-Forged II", "ZX5", "ZX7"] },
  Cleveland: { ...WOODS(["Launcher XL2", "Launcher XL"], ["Launcher XL2", "Launcher XL"], ["Launcher XL2 Halo", "Launcher XL Halo"]),
               iron: ["Launcher XL2 Halo", "Launcher XL Halo", "Launcher UHX"],
               wedge: ["RTZ", "RTX 6 ZipCore", "RTX ZipCore", "CBX 4 ZipCore", "CBX Full-Face", "Smart Sole"],
               putter: ["HB Soft 2", "HB Soft", "Frontline"] },
  Odyssey: { putter: ["Ai-One", "Ai-One Milled", "Ai-One Square 2 Square", "Tri-Hot 5K", "White Hot OG", "Ten", "Eleven", "Jailbird", "White Hot Pro", "Toulon"] },
  Wilson: { ...WOODS(["Dynapower", "D9", "Launch Pad 2"], ["Dynapower", "D9", "Launch Pad 2"], ["Dynapower", "D9", "Launch Pad 2"]),
            iron: ["Staff Model Blade", "Staff Model CB", "Staff Model Utility", "Dynapower", "Dynapower Forged", "D9", "Launch Pad 2"],
            wedge: ["Staff Model", "Staff Model ZM", "Harmonized"] },
  PXG: { ...WOODS(["Black Ops", "0311 Gen6", "0311 Gen5"], ["Black Ops", "0311 Gen6"], ["Black Ops", "0311 Gen6"]),
         iron: ["0311 P Gen7", "0311 XP Gen7", "0311 Gen6", "0311 P Gen6", "0311 XP Gen6", "0311 T Gen6"],
         wedge: ["Sugar Daddy III", "0311 Forged"],
         putter: ["Battle Ready II", "Battle Ready"] },
  Bettinardi: { putter: ["Queen B", "BB", "Studio Stock", "Inovai", "Antidote"] },
  Honma: { ...WOODS(["TR20", "T//World GS", "Beres"], ["TR20", "T//World GS", "Beres"], ["TR20", "T//World GS", "Beres"]), iron: ["TR20", "T//World GS", "Beres"] },
  "Tour Edge": { ...WOODS(["Exotics C724", "Exotics E724", "Hot Launch E524"], ["Exotics C724", "Exotics E724", "Hot Launch E524"], ["Exotics C724", "Exotics E724", "Hot Launch E524"]),
                 iron: ["Hot Launch E524"] },
  "L.A.B. Golf": { putter: ["DF3", "Mezz.1 Max", "Link.1", "OZ.1"] },
  Evnroll: { putter: ["ER2", "ER5", "Neo Classic"] },
};

export const BRANDS = Object.keys(CATALOG);
export function brandsFor(cat: Category) { return BRANDS.filter(b => CATALOG[b][cat]?.length); }
export function modelsFor(brand: string, cat: Category) { return CATALOG[brand]?.[cat] || []; }

/** Filter a catalog list. Newest stays first. A typed name that is not in the list becomes «Usar …». */
export function catalogChoices(options: readonly string[], query: string): { label: string; value: string; custom: boolean }[] {
  const q = query.trim();
  const ql = q.toLowerCase();
  const hits = (ql ? options.filter(x => x.toLowerCase().includes(ql)) : options).slice(0, 12);
  const exact = !!q && options.some(x => x.toLowerCase() === ql);
  const out = hits.map(value => ({ label: value, value, custom: false }));
  if (q && !exact) out.push({ label: `Usar «${q}»`, value: q, custom: true });
  return out;
}
export const findBrand = (s: string) => BRANDS.find(b => b.toLowerCase() === s.trim().toLowerCase()) || null;
