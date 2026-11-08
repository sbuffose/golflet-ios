/** t183u "Modo torneo" (Rules of Golf 4.3). Pure: what is allowed or locked while a competition round is in play. API_v5 §62.
 *  Shared by the server (enforcement) and the browser (bundled into public/plan-core.js). */
export type Allow = "si" | "bloqueado" | "estatico" | "no_aplica";
export const TORNEO_MATRIX = [
  { key: "distances",       label: "Distancias (adelante/centro/fondo, al green)",      normal: "si",        torneo: "si",        sin_medidores: "bloqueado" },
  { key: "markers",         label: "Marcas 50–250 yd en el mapa",                       normal: "si",        torneo: "si",        sin_medidores: "bloqueado" },
  { key: "hazards",         label: "Obstáculos (símbolos en el mapa)",                  normal: "si",        torneo: "si",        sin_medidores: "si" },
  { key: "hazard_carry",    label: "Carry a obstáculos (yd)",                           normal: "si",        torneo: "si",        sin_medidores: "bloqueado" },
  { key: "forecast",        label: "Pronóstico del tiempo (viento km/h, dirección, hora)", normal: "si",     torneo: "si",        sin_medidores: "si" },
  { key: "own_plan",        label: "Tu estrategia armada antes (palos y caídas)",       normal: "si",        torneo: "estatico",  sin_medidores: "estatico" },
  { key: "plays_like",      label: "± yd por viento (juega como)",                      normal: "si",        torneo: "bloqueado", sin_medidores: "bloqueado" },
  { key: "live_wind",       label: "Viento medido o calculado en vivo",                 normal: "no_aplica", torneo: "bloqueado", sin_medidores: "bloqueado" },
  { key: "recommendations", label: "Qué conviene: palo sugerido y hacia dónde apuntar", normal: "si",        torneo: "bloqueado", sin_medidores: "bloqueado" },
  { key: "planner",         label: "Planificador (calcular golpes nuevos)",             normal: "si",        torneo: "bloqueado", sin_medidores: "bloqueado" },
  { key: "ovals",           label: "Óvalos de dispersión con viento",                   normal: "si",        torneo: "bloqueado", sin_medidores: "bloqueado" },
  { key: "green_slopes",    label: "Pendientes del green (mapa y 3D)",                  normal: "si",        torneo: "bloqueado", sin_medidores: "bloqueado" },
] as const satisfies readonly { key: string; label: string; normal: Allow; torneo: Allow; sin_medidores: Allow }[];
export type TorneoKey = typeof TORNEO_MATRIX[number]["key"];

export type TorneoIn = { manual: boolean | null; club_booking: boolean; competition_card: boolean; no_distance_rule: boolean; in_round: boolean };
/** Auto-on for a competition (club booking with a torneo modality/planilla, or the §51 is_competition card); the player's toggle wins. */
export function torneoState(i: TorneoIn) {
  const auto = i.club_booking || i.competition_card, on = i.manual ?? auto, active = on && i.in_round, noDist = active && i.no_distance_rule;
  const col = noDist ? "sin_medidores" : active ? "torneo" : "normal";
  const locks = Object.fromEntries(TORNEO_MATRIX.map(r => [r.key, r[col] === "bloqueado"])) as Record<TorneoKey, boolean>;
  return { on, auto, manual: i.manual, source: i.manual != null ? "manual" as const : i.competition_card ? "competition_card" as const : i.club_booking ? "club_booking" as const : null,
    in_round: i.in_round, active, no_distance_rule: i.no_distance_rule, mode: col, locks };
}
export type TorneoState = ReturnType<typeof torneoState>;
/** A club booking reads as a competition when the club's planilla gives it a modality or an event (torneo) name. */
export const isTorneoBooking = (t: { source?: string | null; modality?: string | null; event_name?: string | null }) =>
  t.source === "club" && !!((t.modality && t.modality.trim()) || (t.event_name && t.event_name.trim()));
/** "In the round" for a plan without a live GPS round: from 15 min before the tee time until 6 h after it, on the plan's day. */
export function inRoundWindow(date: string, teeTime: string, now: { date: string; time: string }) {
  if (date !== now.date) return false;
  const m = (s: string) => { const [h, mm] = s.split(":").map(Number); return h * 60 + mm; }, d = m(now.time) - m(teeTime);
  return d >= -15 && d <= 360;
}
