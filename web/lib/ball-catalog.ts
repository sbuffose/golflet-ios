/** t74u: golf ball brands and models (real, current or recent). "Otra" lets the player type it; we never invent a model. */
export const BALLS: { brand: string; models: string[] }[] = [
  { brand: "Titleist", models: ["Pro V1", "Pro V1x", "Pro V1x Left Dash", "AVX", "Tour Speed", "Tour Soft", "TruFeel", "Velocity"] },
  { brand: "Callaway", models: ["Chrome Tour", "Chrome Tour X", "Chrome Soft", "ERC Soft", "Supersoft", "Warbird"] },
  { brand: "TaylorMade", models: ["TP5", "TP5x", "Tour Response", "Soft Response", "Distance+"] },
  { brand: "Bridgestone", models: ["Tour B X", "Tour B XS", "Tour B RX", "Tour B RXS", "e12 Contact", "e6"] },
  { brand: "Srixon", models: ["Z-Star", "Z-Star XV", "Z-Star Diamond", "Q-Star Tour", "Soft Feel", "AD333"] },
  { brand: "Wilson", models: ["Staff Model", "Staff Model X", "Triad", "Duo Soft"] },
  { brand: "Vice", models: ["Pro", "Pro Plus", "Pro Soft", "Tour", "Drive"] },
  { brand: "Mizuno", models: ["RB Tour", "RB Tour X", "RB 566"] },
  { brand: "Maxfli", models: ["Tour", "Tour X", "Tour S"] },
  { brand: "Kirkland Signature", models: ["Performance+"] },
];
export function cleanBall(b: any): { brand: string; model: string | null; custom: boolean } {
  const t = (v: any, n: number) => String(v ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, n);
  const brand = t(b?.brand, 40), model = t(b?.model, 60) || null;
  if (!brand) throw new Error("Elegí la marca de tu pelota.");
  const cat = BALLS.find(x => x.brand.toLowerCase() === brand.toLowerCase());
  if (!cat) return { brand, model, custom: true };
  const m = model ? cat.models.find(x => x.toLowerCase() === model.toLowerCase()) : null;
  return { brand: cat.brand, model: m ?? model, custom: !!model && !m };
}
