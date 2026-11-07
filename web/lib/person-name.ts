/**
 * What we call the player ("Hola, Sebastián").
 * Priority: the name the player chose in Cuenta ("Cómo te llamamos") → the account name, when it isn't the Golfistics
 * full name or a placeholder → parsed from the Golfistics player name.
 * Golfistics formats: "APELLIDO, Nombre", "APELLIDO APELLIDO Nombre", "Apellido Apellido Nombre" (surnames first).
 * Title-cases and keeps the accents the source has; never adds one.
 */
const cap = (w: string) => w ? w.charAt(0).toLocaleUpperCase("es-AR") + w.slice(1).toLocaleLowerCase("es-AR") : w;
export const titleWord = (w: string) => w.split("-").map(cap).join("-");
const isUpper = (w: string) => w.length > 1 && w === w.toLocaleUpperCase("es-AR") && w !== w.toLocaleLowerCase("es-AR");
const isMixed = (w: string) => /^\p{Lu}\p{Ll}/u.test(w);

export function firstNameFromGolfistics(raw: string | null | undefined): string | null {
  const s = (raw || "").trim().replace(/\s+/g, " ");
  if (!s || /^matr[ií]cula\b/i.test(s)) return null;
  if (s.includes(",")) { const given = s.split(",").slice(1).join(",").trim().split(" ")[0]; return given ? titleWord(given) : null; }
  const w = s.split(" ");
  if (w.length === 1) return titleWord(w[0]);
  // "BUFFO SEMPE Sebastián": surnames in capitals, given name mixed case → first mixed-case word after the capitals
  if (isUpper(w[0])) { const g = w.find(x => isMixed(x) && !isUpper(x)); if (g) return titleWord(g); }
  // uniform case ("Buffo Sempe Sebastian" / "BUFFO SEMPE SEBASTIAN"): Golfistics puts surnames first → last word
  return titleWord(w[w.length - 1]);
}

export function callName(opts: { chosen?: string | null; accountName?: string | null; golfistics?: string | null }): string {
  const chosen = (opts.chosen || "").trim(); if (chosen) return chosen;
  const acc = (opts.accountName || "").trim(), g = (opts.golfistics || "").trim();
  const norm = (x: string) => x.toLocaleLowerCase("es-AR").replace(/[,\s]+/g, " ").trim();
  if (acc && !/^matr[ií]cula\b/i.test(acc) && !acc.includes(",") && norm(acc) !== norm(g) && !(g && norm(g).startsWith(norm(acc.split(" ")[0])))) return titleWord(acc.split(" ")[0]);
  return firstNameFromGolfistics(g) || firstNameFromGolfistics(acc) || "";
}
