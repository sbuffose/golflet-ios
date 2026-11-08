/**
 * Club crests shipped as static assets (public/clubs/<golfistics club code>@2x.png, 256 px, transparent).
 * Sources (official club sites, fetched 2026-10-28):
 *  118 Jockey Club Argentino: jockeyclub.org.ar/wp-content/uploads/2024/07/jocker_club_logo_Mesa-de-trabajo-1.png (tinted Golflet green)
 *  209 Mar del Plata Golf Club: mardelplatagolfclub.com.ar/wp-content/uploads/2025/02/logo-MDPGC-2-e1740667869969.png
 * Any other club gets a monogram (initials) drawn by the client.
 */
export const CLUB_LOGOS: Record<string, string> = {
  "118": "/clubs/118@2x.png",
  "209": "/clubs/209@2x.png",
};

export const clubLogo = (code: string | null | undefined) => (code && CLUB_LOGOS[String(code)]) || null;

const STOP = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "club", "golf", "country", "the", "and", "cc", "gc", "g", "c", "asociacion", "asociación", "sociedad", "s.a.", "sa"]);

/** Up to two initials for a club monogram: "Olivos Golf Club" -> "O", "San Andrés Golf Club" -> "SA", "Jockey Club Argentino" -> "JA". */
export function clubInitials(name: string | null | undefined) {
  const words = String(name ?? "").replace(/[()·.,]/g, " ").split(/\s+/).filter(Boolean);
  const sig = words.filter(w => !STOP.has(w.toLowerCase()));
  const pick = (sig.length ? sig : words).slice(0, 2);
  return pick.map(w => w[0]).join("").toUpperCase() || "G";
}
