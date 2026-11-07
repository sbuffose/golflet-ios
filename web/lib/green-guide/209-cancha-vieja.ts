/** t190u: Mar del Plata Golf Club · Cancha Vieja: coarse green + hole data transcribed from the printed course guide
 *  ("Guía de campo", Asociación Argentina de Golf) that the player provided. GENERAL information only (shape, falls,
 *  level changes, banks, bunkers, out of bounds); NOT a survey: green_surface stays empty and the precise slope viewer
 *  still needs a real survey. Frame per green: u ∈ [-0.5, 0.5] across (left → right, as seen from the approach),
 *  v ∈ [0, 1] from the front (entrada) to the back; dir = degrees clockwise from "toward the back" (0) = where it falls.
 *  t227u false_front: the number the guide writes on the line / slope band near the front = yards from the entrance to where the false front
 *  ends (owner, t227u: «distancia a donde termina el frente falso»); kind "linea" = plain line, "pendiente" = the legend's slope band; conf = how sure.
 *  t229u (owner): EVERY number written on a green is yards from the entrance (front edge) to that point: the top one = the back (depth_yd),
 *  the one on a line = false-front end or level change, the ones on the edge / loose = that spot (marks: u across like the shape, kind borde/nivel/punto).
 *  NB: width_yd of some greens (2, 3, 6, 8, 10, 14, 17, 18) was first read from those edge numbers; the guide prints no width, so it is only the drawing's proportion.
 *  t230u falls: [u, v, dir, strength] — strength 2 = the guide's double arrow (more slope), 1 = single (less). No percentages.
 *  Hole 9: the photos only show its green small on the hole page, with no arrows → no falls (earlier ones had no source).
 *  Bunker y0/y1 are yards from the front of the green (negative = short of it); nums are the guide's printed numbers. */
import type { GreenGuideCourse } from "../green-guide-core";
const OVAL: [number, number][] = [[0, 0], [0.3, 0.05], [0.45, 0.2], [0.5, 0.45], [0.45, 0.75], [0.3, 0.93], [0, 1], [-0.3, 0.93], [-0.45, 0.75], [-0.5, 0.45], [-0.45, 0.2], [-0.3, 0.05]];
const EGG: [number, number][] = [[0, 0], [0.3, 0.04], [0.42, 0.2], [0.5, 0.55], [0.42, 0.85], [0.2, 1], [-0.15, 0.98], [-0.4, 0.85], [-0.5, 0.6], [-0.4, 0.25], [-0.3, 0.06]];
const line = (v: number, kind: "nivel" | "pendiente") => ({ kind, pts: [[-0.55, v], [0.55, v]] as [number, number][] });
export const MDP_CANCHA_VIEJA: GreenGuideCourse = {
  club_code: "209", course: "Cancha Vieja",
  /* t227u: the guide's «Referencias» page: «En el fairway desde los puntos de color y hasta la entrada de los greens» (tees: «medido desde el punto azul») */
  marker_ref: { to: "entrada", source: "Guía de campo (AAG), página Referencias: «En el fairway desde los puntos de color y hasta la entrada de los greens»." },
  location: { lat: -38.0352, lng: -57.5395, source: "OpenStreetMap way 75980708 (ODbL): centro del campo, solo para el pronóstico" },
  source: { kind: "guia_club", title: "Guía de campo (AAG) · Mar del Plata Golf Club, Cancha Vieja", provided_by: "jugador (PDF escaneado)", received_at: "2026-10-29", precision: "general",
    note: "Datos generales transcriptos a mano de la guía impresa: forma, caídas, cambios de nivel, barrancas, bunkers y fuera de límites. No es un relevamiento." },
  greens: {
    1: { depth_yd: 28, width_yd: 27, shape: [[-0.5, 0.62], [-0.42, 0.88], [-0.2, 1], [0.25, 0.97], [0.48, 0.85], [0.5, 0.45], [0.42, 0.12], [0.22, 0], [0.02, 0.05], [-0.25, 0.25], [-0.45, 0.45]],
      falls: [[0.3, 0.7, 270, 2], [0.3, 0.5, 270, 2], [0.3, 0.32, 270, 2], [-0.3, 0.65, 270, 1], [-0.3, 0.45, 270, 1], [0.05, 0.15, 335, 2], [0.2, 0.12, 340, 2]], tiers: [], banks: [[-60, -5], [20, 50]],
      bunkers: [{ side: "R", y0: 17, y1: 31, nums: [17, 33] }, { side: "R", y0: 2, y1: 15, nums: [16] }, { side: "F", x: -14, w: 8, y0: -10, y1: -3, nums: [6, 23] }], ob: [] },
    2: { depth_yd: 44, width_yd: 24, marks: [{ yd: 24, u: -0.42, kind: "borde" }], shape: EGG, falls: [[-0.2, 0.75, 270, 1], [-0.2, 0.49, 270, 1], [-0.2, 0.36, 270, 1], [0.3, 0.78, 270, 2], [0.3, 0.62, 270, 2], [0.3, 0.48, 270, 2], [0.3, 0.32, 270, 2]],
      tiers: [], banks: [[-40, 15], [-110, -60], [30, 60]],
      bunkers: [{ side: "R", y0: 16, y1: 30, nums: [30, 16] }, { side: "L", y0: -5, y1: 8, nums: [10, 14] }, { side: "R", y0: -5, y1: 8, nums: [11, 4] }, { side: "F", x: 0, w: 12, y0: -14, y1: -9, nums: [21, 38] }], ob: [] },
    3: { depth_yd: 34, width_yd: 23, marks: [{ yd: 23, u: -0.42, kind: "borde" }], false_front: { yd: 9, kind: "linea", conf: "alta" }, shape: [[0, 0], [0.35, 0.05], [0.5, 0.3], [0.48, 0.7], [0.35, 0.95], [0, 1], [-0.3, 0.92], [-0.4, 0.7], [-0.5, 0.55], [-0.48, 0.3], [-0.35, 0.05]],
      falls: [[-0.15, 0.55, 270, 1], [-0.1, 0.35, 270, 1], [0.3, 0.68, 270, 2], [0.3, 0.5, 270, 2], [0.3, 0.32, 270, 2], [0.25, 0.85, 225, 1]], tiers: [], banks: [[-60, -20], [30, 60], [70, 100]],
      bunkers: [{ side: "L", y0: 8, y1: 15, nums: [18] }, { side: "L", y0: -4, y1: 4, nums: [9] }, { side: "R", y0: 2, y1: 14, nums: [15] }], ob: [{ side: "R", yd: 12 }] },
    4: { depth_yd: 32, width_yd: 22, shape: OVAL, falls: [[-0.15, 0.85, 180, 1], [0.15, 0.85, 180, 1], [0.35, 0.55, 210, 1], [0.35, 0.45, 210, 1]], tiers: [], banks: [],
      bunkers: [{ side: "L", y0: 30, y1: 38, nums: [39, 30] }, { side: "L", y0: 0, y1: 12, nums: [15, 2] }, { side: "F", x: -8, w: 7, y0: -7, y1: -2 }, { side: "F", x: -3, w: 7, y0: -15, y1: -10 }, { side: "F", x: 2, w: 8, y0: -24, y1: -19 }],
      ob: [{ side: "B", yd: 6 }, { side: "R", yd: 4 }] },
    5: { depth_yd: 29, width_yd: 27, shape: OVAL, falls: [[-0.15, 0.85, 180, 2], [0.25, 0.85, 180, 2], [-0.35, 0.6, 90, 1], [-0.35, 0.42, 90, 1]], tiers: [], banks: [[150, 210]],
      bunkers: [{ side: "B", x: -8, w: 9, y0: 31, y1: 35, nums: [40] }, { side: "L", y0: 10, y1: 27, nums: [27, 10] }, { side: "L", y0: 2, y1: 9, nums: [9, 2] }, { side: "F", x: 0, w: 20, y0: -5, y1: -1, nums: [13] },
        { side: "R", y0: 23, y1: 31, nums: [31, 23] }, { side: "R", y0: 5, y1: 22, nums: [22, 5] }, { side: "R", y0: -3, y1: 4, nums: [4, 11] }], ob: [{ side: "R", yd: 25 }] },
    6: { depth_yd: 36, width_yd: 25, marks: [{ yd: 21, u: 0.3, kind: "borde" }], shape: [[0.05, 0], [0.3, 0.05], [0.38, 0.3], [0.42, 0.55], [0.5, 0.75], [0.4, 0.95], [0.05, 1], [-0.3, 0.95], [-0.48, 0.75], [-0.5, 0.5], [-0.35, 0.3], [-0.2, 0.08]],
      falls: [[-0.25, 0.85, 125, 2], [-0.3, 0.7, 90, 2], [-0.3, 0.52, 90, 2], [0, 0.3, 170, 1]], tiers: [], banks: [[-60, -35], [25, 95]],
      bunkers: [{ side: "L", y0: 2, y1: 17, nums: [17, 2] }, { side: "R", y0: 3, y1: 19, nums: [19, 3] }, { side: "F", x: -8, w: 7, y0: -12, y1: -7, nums: [15] }], ob: [] },
    7: { depth_yd: 37, width_yd: 22, marks: [{ yd: 16, u: 0, kind: "nivel" }], shape: OVAL, falls: [[-0.1, 0.82, 85, 2], [-0.25, 0.6, 90, 2], [-0.25, 0.42, 90, 2], [-0.1, 0.18, 45, 1], [0.15, 0.12, 45, 1]], tiers: [line(16 / 37, "nivel")], banks: [[-30, -10], [15, 35]],
      bunkers: [{ side: "L", y0: 6, y1: 26, nums: [26, 6] }, { side: "R", y0: 14, y1: 29, nums: [29, 14] }, { side: "R", y0: -6, y1: 13, nums: [14, 6] }, { side: "F", x: -12, w: 7, y0: -12, y1: -6, nums: [13] },
        { side: "F", x: -4, w: 7, y0: -26, y1: -20, nums: [24, 50] }, { side: "F", x: 6, w: 10, y0: -34, y1: -29, nums: [57, 69] }], ob: [] },
    8: { depth_yd: 26, width_yd: 16, marks: [{ yd: 12, u: 0.32, kind: "borde" }], shape: [[-0.2, 0], [0.3, 0.02], [0.42, 0.2], [0.5, 0.35], [0.5, 0.8], [0.35, 1], [-0.2, 1], [-0.45, 0.9], [-0.5, 0.5], [-0.45, 0.1]],
      falls: [[-0.15, 0.85, 120, 2], [-0.3, 0.56, 90, 2], [0.25, 0.89, 175, 1]], tiers: [], banks: [[30, 160]],
      bunkers: [{ side: "L", y0: 17, y1: 25, nums: [21] }, { side: "L", y0: 6, y1: 14, nums: [11] }, { side: "F", x: -6, w: 9, y0: -8, y1: -2, nums: [15] }, { side: "R", y0: -4, y1: 7, nums: [7, 9] }], ob: [{ side: "B" }] },
    9: { depth_yd: 27, width_yd: 20, shape: [[-0.1, 0], [0.25, 0.05], [0.35, 0.3], [0.5, 0.55], [0.45, 0.85], [0.2, 1], [-0.2, 1], [-0.45, 0.85], [-0.5, 0.55], [-0.35, 0.3], [-0.3, 0.08]],
      falls: [], tiers: [], banks: [[35, 95]],
      bunkers: [{ side: "L", y0: -4, y1: 4, nums: [9, 2] }, { side: "R", y0: 0, y1: 10, nums: [10] }, { side: "F", x: 0, w: 20, y0: -10, y1: -6, nums: [9] }], ob: [{ side: "B", yd: 15 }, { side: "R", yd: 6 }] },
    10: { depth_yd: 35, width_yd: 22, marks: [{ yd: 22, u: -0.3, kind: "borde" }], shape: [[0.05, 0], [0.35, 0.1], [0.5, 0.45], [0.45, 0.85], [0.2, 1], [-0.05, 0.95], [-0.3, 0.7], [-0.5, 0.4], [-0.42, 0.2], [-0.2, 0.08]],
      falls: [[-0.15, 0.89, 200, 1], [0.2, 0.88, 210, 1], [0.35, 0.74, 270, 2], [0.3, 0.59, 270, 2]], tiers: [], banks: [[-120, -10]],
      bunkers: [{ side: "L", y0: -6, y1: 3, nums: [4, 8] }, { side: "R", y0: 4, y1: 15, nums: [15, 4] }, { side: "F", x: 0, w: 22, y0: -14, y1: -9, nums: [22, 36] }], ob: [] },
    11: { depth_yd: 34, width_yd: 22, false_front: { yd: 14, kind: "pendiente", conf: "alta" }, shape: EGG, falls: [[0.25, 0.86, 225, 1], [0.3, 0.75, 270, 2], [0.3, 0.62, 270, 2], [0.3, 0.5, 270, 2]], tiers: [line(14 / 34, "pendiente")], banks: [[-80, -20], [30, 50]],
      bunkers: [{ side: "L", y0: -6, y1: 14, nums: [14, 6] }, { side: "R", y0: 0, y1: 10, nums: [10] }], ob: [{ side: "L", yd: 17 }] },
    12: { depth_yd: 38, width_yd: 33, marks: [{ yd: 20, u: 0, kind: "nivel" }], shape: OVAL, falls: [[-0.15, 0.9, 200, 1], [0.15, 0.9, 200, 1], [0.3, 0.42, 270, 2], [0.25, 0.3, 315, 2]], tiers: [line(20 / 38, "nivel")], banks: [[-120, -50]],
      bunkers: [{ side: "L", y0: 2, y1: 12, nums: [12, 12] }, { side: "R", y0: 14, y1: 34, nums: [34, 14] }, { side: "R", y0: 2, y1: 10, nums: [10, 8] }, { side: "F", x: -2, w: 10, y0: -9, y1: -4, nums: [8, 25] }], ob: [] },
    13: { depth_yd: 40, width_yd: 24, false_front: { yd: 13, kind: "pendiente", conf: "alta" }, shape: [[0, 0], [0.3, 0.05], [0.38, 0.25], [0.35, 0.45], [0.5, 0.6], [0.45, 0.9], [0.2, 1], [-0.2, 0.98], [-0.45, 0.85], [-0.5, 0.55], [-0.35, 0.3], [-0.3, 0.06]],
      falls: [[0.05, 0.9, 225, 1], [0.25, 0.65, 270, 2], [0.25, 0.55, 270, 2]], tiers: [line(13 / 40, "pendiente")], banks: [[-110, -60]],
      bunkers: [{ side: "L", y0: 2, y1: 13, nums: [13, 2] }, { side: "R", y0: 7, y1: 27, nums: [27, 7] }], ob: [] },
    14: { depth_yd: 29, width_yd: 24, marks: [{ yd: 24, u: -0.3, kind: "borde" }], false_front: { yd: 6, kind: "linea", conf: "alta" }, shape: [[0, 0], [0.4, 0.05], [0.5, 0.4], [0.42, 0.8], [0.15, 1], [-0.2, 0.98], [-0.45, 0.8], [-0.5, 0.4], [-0.4, 0.08]],
      falls: [[0.3, 0.85, 225, 1], [-0.2, 0.7, 270, 1], [0.1, 0.7, 270, 2], [-0.2, 0.55, 270, 1], [0.2, 0.5, 270, 2], [-0.2, 0.4, 270, 1], [0.2, 0.35, 300, 2]], tiers: [], banks: [[-110, -70]],
      bunkers: [{ side: "L", y0: -4, y1: 9, nums: [9, 6] }, { side: "R", y0: 6, y1: 24, nums: [24, 6] }], ob: [{ side: "L", yd: 9 }] },
    15: { depth_yd: 37, width_yd: 22, false_front: { yd: 9, kind: "linea", conf: "alta" }, shape: OVAL, falls: [[-0.1, 0.85, 95, 2], [-0.15, 0.72, 90, 2], [-0.15, 0.6, 90, 2]], tiers: [], banks: [[-50, -30], [0, 80]],
      bunkers: [{ side: "L", y0: 5, y1: 24, nums: [24, 5] }, { side: "R", y0: 2, y1: 19, nums: [19, 2] }, { side: "F", x: -10, w: 7, y0: -14, y1: -8, nums: [17, 31] }, { side: "F", x: 10, w: 10, y0: -12, y1: -8, nums: [5, 20] }], ob: [] },
    16: { depth_yd: 36, width_yd: 24, shape: OVAL, falls: [[-0.15, 0.85, 135, 1], [-0.3, 0.65, 90, 2], [-0.3, 0.5, 90, 2], [-0.1, 0.25, 45, 1], [0.3, 0.65, 210, 1], [0.3, 0.55, 210, 1]], tiers: [], banks: [[-40, -30], [20, 90]],
      bunkers: [{ side: "L", y0: -4, y1: 10, nums: [10, 9] }, { side: "R", y0: -2, y1: 9, nums: [9, 5] }], ob: [] },
    17: { depth_yd: 46, width_yd: 29, marks: [{ yd: 29, u: 0.25, kind: "borde" }], false_front: { yd: 22, kind: "pendiente", conf: "media" }, shape: [[0.1, 0], [0.4, 0.1], [0.45, 0.3], [0.25, 0.45], [0.2, 0.6], [0.45, 0.75], [0.35, 0.95], [0, 1], [-0.3, 0.95], [-0.45, 0.75], [-0.5, 0.4], [-0.35, 0.12]],
      falls: [[-0.25, 0.85, 90, 2], [-0.25, 0.75, 90, 2], [-0.25, 0.62, 60, 1], [0.2, 0.9, 180, 1]],
      tiers: [{ kind: "pendiente", pts: [[-0.35, 0.55], [0, 0.48], [0.22, 0.5]] }, { kind: "pendiente", pts: [[0, 0.48], [0.05, 0.12]] }], banks: [[-40, 40], [-60, -45]],
      bunkers: [{ side: "L", y0: 8, y1: 35, nums: [35, 8] }, { side: "R", y0: 16, y1: 28, nums: [28, 16] }, { side: "B", x: 13, w: 5, y0: 44, y1: 55, nums: [55, 44] }], ob: [] },
    18: { depth_yd: 32, width_yd: 19, marks: [{ yd: 19, u: 0.4, kind: "borde" }, { yd: 7, u: 0.22, kind: "punto" }], false_front: { yd: 5, kind: "linea", conf: "alta" }, shape: [[0, 0], [0.4, 0.05], [0.5, 0.25], [0.42, 0.55], [0.3, 0.75], [0.2, 0.95], [-0.1, 1], [-0.4, 0.92], [-0.5, 0.6], [-0.45, 0.25], [-0.35, 0.06]],
      falls: [[-0.1, 0.85, 135, 1], [-0.2, 0.65, 120, 1], [-0.2, 0.52, 120, 1], [0.3, 0.2, 180, 1]], tiers: [], banks: [[-50, -40], [60, 90]],
      bunkers: [{ side: "L", y0: 16, y1: 26, nums: [22] }, { side: "L", y0: -5, y1: 7, nums: [7, 5] }, { side: "R", y0: -4, y1: 5, nums: [5, 11] }], ob: [{ side: "B", yd: 12 }] },
  },
  holes: {
    1: { par: 4, yd: 445, markers: [{ c: "rojo", to_green: 86 }, { c: "blanco", to_green: 137, from_tee: 294 }, { c: "azul", to_green: 187, from_tee: 244 }], hazards: [{ kind: "bunker", side: "izq.", reach: 300, carry: 313 }, { kind: "bunker", side: "izq.", reach: 215, carry: 245 }, { kind: "bunker", side: "der.", reach: 212, carry: 224 }] },
    2: { par: 3, yd: 195, alt_tee: 173, markers: [], hazards: [] },
    3: { par: 5, yd: 569, markers: [{ c: "blanco", to_green: 40 }, { c: "rojo", to_green: 83 }, { c: "blanco", to_green: 134 }, { c: "azul", to_green: 184 }, { c: "amarillo", to_green: 234, from_tee: 318 }], hazards: [{ kind: "bunker", side: "der.", reach: 370, carry: 390 }, { kind: "bunker", side: "der.", to_green: [60, 67] }, { kind: "límite", side: "der." }] },
    4: { par: 4, yd: 287, markers: [{ c: "blanco", to_green: 60, from_tee: 209 }, { c: "rojo", to_green: 84, from_tee: 185 }], hazards: [{ kind: "bunker", side: "frente", carry: 244 }, { kind: "árboles", side: "izq." }, { kind: "límite", side: "der." }, { kind: "límite", side: "atrás" }] },
    5: { par: 3, yd: 146, alt_tee: 131, markers: [], hazards: [{ kind: "límite", side: "der." }], card_diff: "La guía dice 146 yd; la tarjeta del club (azul) dice 180." },
    6: { par: 4, yd: 354, markers: [{ c: "rojo", to_green: 82, from_tee: 254 }, { c: "blanco", to_green: 132, from_tee: 204 }], hazards: [{ kind: "bunker", side: "izq.", reach: 148, carry: 165 }, { kind: "árboles", side: "der." }, { kind: "límite", side: "der.", reach: 150 }] },
    7: { par: 5, yd: 503, markers: [{ c: "rojo", to_green: 82 }, { c: "blanco", to_green: 133 }, { c: "azul", to_green: 184, from_tee: 301 }, { c: "amarillo", to_green: 234, from_tee: 251 }], hazards: [{ kind: "bunker", side: "izq.", reach: 279, carry: 293 }, { kind: "bunker", side: "izq.", reach: 164, carry: 188 }, { kind: "bunker", side: "der.", reach: 289, carry: 309 }, { kind: "bunker", side: "der.", to_green: [57, 69] }] },
    8: { par: 3, yd: 126, alt_tee: 112, markers: [], hazards: [{ kind: "límite", side: "atrás" }] },
    9: { par: 4, yd: 341, markers: [{ c: "blanco", to_green: 50, from_tee: 277 }, { c: "rojo", to_green: 85, from_tee: 242 }, { c: "blanco", to_green: 135, from_tee: 192 }], hazards: [{ kind: "bunker", side: "izq.", reach: 295, carry: 301 }, { kind: "bunker", side: "der.", reach: 240, carry: 255 }, { kind: "límite", side: "der.", reach: 300 }, { kind: "límite", side: "atrás" }] },
    10: { par: 4, yd: 307, markers: [{ c: "blanco", to_green: 60, from_tee: 229 }, { c: "rojo", to_green: 83, from_tee: 206 }, { c: "blanco", to_green: 133, from_tee: 156 }], hazards: [{ kind: "bunker", side: "cruzado", reach: 255, carry: 265 }, { kind: "límite", side: "izq." }] },
    11: { par: 4, yd: 355, markers: [{ c: "blanco", to_green: 50, from_tee: 288 }, { c: "rojo", to_green: 83, from_tee: 255 }, { c: "blanco", to_green: 134, from_tee: 204 }], hazards: [{ kind: "bunker", side: "der.", reach: 298 }, { kind: "bunker de pasto", side: "izq." }, { kind: "límite", side: "izq." }] },
    12: { par: 3, yd: 172, alt_tee: 152, markers: [], hazards: [] },
    13: { par: 5, yd: 564, markers: [{ c: "rojo", to_green: 81 }, { c: "blanco", to_green: 131 }, { c: "azul", to_green: 182 }, { c: "amarillo", to_green: 233, from_tee: 311 }], hazards: [{ kind: "bunker", side: "der.", reach: 248, carry: 263 }, { kind: "bunker", side: "der.", to_green: [45] }, { kind: "límite", side: "izq." }] },
    14: { par: 3, yd: 164, alt_tee: 149, markers: [], hazards: [{ kind: "límite", side: "izq." }] },
    15: { par: 4, yd: 384, markers: [{ c: "rojo", to_green: 83 }, { c: "blanco", to_green: 133, from_tee: 232 }, { c: "azul", to_green: 183, from_tee: 182 }], hazards: [{ kind: "bunker", side: "der.", to_green: [56] }, { kind: "árboles", side: "izq." }, { kind: "árboles", side: "der." }, { kind: "límite", side: "izq.", note: "junto a la salida" }] },
    16: { par: 4, yd: 367, markers: [{ c: "blanco", to_green: 50, from_tee: 297 }, { c: "rojo", to_green: 82, from_tee: 265 }, { c: "blanco", to_green: 134, from_tee: 215 }], hazards: [{ kind: "bunker", side: "der.", reach: 259, carry: 280 }, { kind: "bunker", side: "izq.", reach: 201, carry: 221 }] },
    17: { par: 4, yd: 410, markers: [{ c: "rojo", to_green: 77 }, { c: "blanco", to_green: 128, from_tee: 258 }, { c: "azul", to_green: 179, from_tee: 207 }], hazards: [{ kind: "bunker", side: "izq.", to_green: [24, 35] }, { kind: "bunker", side: "izq.", reach: 179, carry: 195 }] },
    18: { par: 4, yd: 331, markers: [{ c: "blanco", to_green: 50, from_tee: 265 }, { c: "rojo", to_green: 84, from_tee: 231 }], hazards: [{ kind: "bunker", side: "cruzado", carry: 190 }, { kind: "bunker", side: "izq.", reach: 230, carry: 246 }, { kind: "límite", side: "atrás" }, { kind: "límite", side: "izq." }] },
  },
};
