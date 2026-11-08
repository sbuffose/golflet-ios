/** t130u/t131u: explainers that can carry a "Ver video" link, and per-network URL validation. Never invents URLs. */
export const EXPLAINERS = [
  { key: "calculo_hcp", label: "Cómo se calcula el hándicap", where: "Resumen › Tendencia (i) · Cómo se calcula" },
  { key: "mejores_8", label: "Mejores 8 de las últimas 20", where: "Cómo se calcula · Impacto en el hándicap" },
  { key: "outliers", label: "Outliers: doble bogey neto", where: "Cómo se calcula (outliers)" },
  { key: "impacto_hcp", label: "Impacto en el hándicap", where: "Inicio › Impacto HCP" },
  { key: "hcp_juego", label: "Hándicap de juego", where: "Tee time › elegir tee" },
  { key: "dispersion", label: "Rango y dispersión por palo", where: "Mi bolsa › palo" },
  { key: "clima", label: "Clima y juego", where: "Resumen › Clima y juego" },
  { key: "a_cuanto", label: "¿A cuánto la dejaste? (distancia a la bandera)", where: "Ronda › Mapa del hoyo" },
] as const;
export const NETWORKS = [
  { key: "instagram", label: "Instagram", hosts: ["instagram.com"] },
  { key: "tiktok", label: "TikTok", hosts: ["tiktok.com"] },
  { key: "youtube", label: "YouTube", hosts: ["youtube.com", "youtu.be"] },
  { key: "x", label: "X", hosts: ["x.com", "twitter.com"] },
] as const;
export type NetKey = (typeof NETWORKS)[number]["key"];
export const isExplainer = (k: string) => EXPLAINERS.some(e => e.key === k);
/** "" / null clears; otherwise https URL on that network's own domain. */
export function cleanUrl(net: NetKey, v: any): string | null {
  const s = String(v ?? "").trim(); if (!s) return null;
  let u: URL; try { u = new URL(s); } catch { throw new Error(`Link de ${net} inválido.`); }
  const n = NETWORKS.find(x => x.key === net)!, h = u.hostname.toLowerCase().replace(/^(www\.|m\.|vm\.|mobile\.)/, "");
  if (u.protocol !== "https:" || !n.hosts.some(x => h === x || h.endsWith("." + x))) throw new Error(`El link de ${n.label} tiene que ser https y de ${n.hosts.join(" o ")}.`);
  if (s.length > 400) throw new Error("Link demasiado largo.");
  return u.toString();
}
