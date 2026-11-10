/** Published fallback plans for Jockey Azul and Colorada when /api/strategy has no holes. */
import { publicHole, type HoleStrategy } from "./strategy-parse";

type Yard = { n: number; par: number; hcp: number; yards: number };

const AZUL_YARDS: Yard[] = [
  { n: 1, par: 5, hcp: 5, yards: 485 }, { n: 2, par: 5, hcp: 1, yards: 474 },
  { n: 3, par: 4, hcp: 9, yards: 345 }, { n: 4, par: 4, hcp: 3, yards: 340 },
  { n: 5, par: 3, hcp: 15, yards: 122 }, { n: 6, par: 4, hcp: 17, yards: 327 },
  { n: 7, par: 4, hcp: 13, yards: 168 }, { n: 8, par: 5, hcp: 7, yards: 411 },
  { n: 9, par: 4, hcp: 11, yards: 407 }, { n: 10, par: 5, hcp: 4, yards: 483 },
  { n: 11, par: 3, hcp: 14, yards: 186 }, { n: 12, par: 4, hcp: 16, yards: 409 },
  { n: 13, par: 4, hcp: 8, yards: 393 }, { n: 14, par: 3, hcp: 18, yards: 150 },
  { n: 15, par: 4, hcp: 12, yards: 343 }, { n: 16, par: 3, hcp: 10, yards: 377 },
  { n: 17, par: 4, hcp: 2, yards: 490 }, { n: 18, par: 4, hcp: 6, yards: 452 },
];

export const COLORADA_YARDS: Yard[] = [
  { n: 1, par: 4, hcp: 5, yards: 425 }, { n: 2, par: 4, hcp: 11, yards: 350 },
  { n: 3, par: 3, hcp: 17, yards: 148 }, { n: 4, par: 5, hcp: 9, yards: 490 },
  { n: 5, par: 4, hcp: 13, yards: 340 }, { n: 6, par: 4, hcp: 7, yards: 355 },
  { n: 7, par: 4, hcp: 1, yards: 425 }, { n: 8, par: 3, hcp: 15, yards: 208 },
  { n: 9, par: 4, hcp: 3, yards: 415 }, { n: 10, par: 5, hcp: 4, yards: 470 },
  { n: 11, par: 5, hcp: 12, yards: 540 }, { n: 12, par: 3, hcp: 18, yards: 175 },
  { n: 13, par: 4, hcp: 2, yards: 444 }, { n: 14, par: 4, hcp: 6, yards: 390 },
  { n: 15, par: 5, hcp: 10, yards: 511 }, { n: 16, par: 4, hcp: 8, yards: 401 },
  { n: 17, par: 3, hcp: 16, yards: 170 }, { n: 18, par: 4, hcp: 14, yards: 354 },
];

function fold(s: string) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function teeAdvice(par: number, yards: number, hcp: number) {
  const hard = hcp <= 4 ? " Es de los más duros: centro antes que un golpe heroico." : "";
  const easy = hcp >= 15 ? " Acá se defiende el par. Un golpe de más vale más que el riesgo." : "";
  if (par === 3 && yards < 140) return { title: "Wedge al centro", text: `Par 3 corto, ${yards} yd. Wedge o hierro 9 al medio del green. No lo pases.${easy}`, club: "PW", target: "Centro del green", miss: "corto" as const, hazard: "Si errás, que sea corto. Largo no vuelve." };
  if (par === 3 && yards < 190) return { title: "Hierro al centro", text: `Par 3 de ${yards} yd. Hierro medio al centro, sin cazar la bandera.${easy}`, club: "Hierro 7", target: "Centro del green", miss: "corto" as const, hazard: "El rough de adelante es mejor que pasarlo." };
  if (par === 3) return { title: "Hierro largo, sin pasarte", text: `Par 3 largo, ${yards} yd. Salí con lo que llegue cómodo y dejalo en el medio.${hard}`, club: "Híbrido", target: "Centro del green", miss: "corto" as const, hazard: "No lo caces: pasado queda muerto." };
  if (par === 5 && yards < 500) return { title: "Dos golpes y un wedge", text: `Par 5 de ${yards} yd. Driver al centro y un segundo que deje wedge entero. No lo fuerces en dos.${hard}`, club: "Driver", target: "Centro del fairway", miss: "izquierda" as const, hazard: "El rough te saca el segundo golpe. Mejor el centro." };
  if (par === 5) return { title: "Jugalo en tres", text: `Par 5 de ${yards} yd. Tres golpes. El segundo es posición, no distancia.${hard}`, club: "Driver", target: "Lado ancho del fairway", miss: "izquierda" as const, hazard: "Un layup al centro le gana al rough." };
  if (par === 4 && yards < 330) return { title: "Híbrido y wedge", text: `Par 4 corto, ${yards} yd. Híbrido o hierro largo y dejá un wedge. El driver no hace falta.${easy}`, club: "Híbrido", target: "Centro, corto del problema", miss: "izquierda" as const, hazard: "Pasarte desde el tee te deja un approach incómodo." };
  if (par === 4 && yards < 390) return { title: "Madera al centro", text: `Par 4 de ${yards} yd. Madera o híbrido al centro. El approach tiene que quedar entero.${easy}`, club: "Madera 3", target: "Centro del fairway", miss: "derecha" as const, hazard: "Del rough el hierro no entra igual. Pagá el centro." };
  return { title: "Driver al lado ancho", text: `Par 4 de ${yards} yd. Driver al lado más ancho y un hierro al centro del green.${hard}`, club: "Driver", target: "Lado ancho", miss: "izquierda" as const, hazard: "Un drive al rough te deja el segundo golpe largo." };
}

function plan(hole: Yard, course: string): HoleStrategy {
  const a = teeAdvice(hole.par, hole.yards, hole.hcp);
  return {
    plan_title: a.title,
    plan_text: a.text,
    tee_club: a.club,
    tee_target: a.target,
    target: null,
    hazards: [{
      id: `${course.toLowerCase()}-${hole.n}`,
      type: "rough_alto",
      side: a.miss === "corto" ? "frente_green" : a.miss,
      from_yd: null,
      carry_yd: null,
      note: a.hazard,
      at: null,
      source: "manual",
    }],
    why: `Par ${hole.par}, ${hole.yards} yd desde el tee de juego, hándicap ${hole.hcp} de la cancha.`,
    miss_side: a.miss,
    miss_note: a.hazard,
    green_slope: "",
    green_leave: "Abajo del hoyo",
    green_notes: "Mejor corto que pasado.",
    variants: { medio: { tee_club: a.club, plan: a.text } },
  };
}

const azul7: HoleStrategy = {
  plan_title: "Híbrido al centro y wedge al green",
  plan_text: "Salida con híbrido buscando el centro del fairway, corto del bunker de la derecha. Queda un segundo de 120–140 yd del green abierto.",
  tee_club: "Híbrido",
  tee_target: "Centro del fairway, apuntando al árbol solo del fondo",
  target: { lat: -34.4866, lng: -58.5296 },
  hazards: [
    { id: "h7-left", type: "bunker", side: "izquierda", from_yd: 131, carry_yd: 151, note: "Bunker de fairway a la izquierda: agarra el gancho corto.", at: null, source: "manual" },
    { id: "h7-right", type: "bunker", side: "derecha", from_yd: 293, carry_yd: 325, note: "Bunker a la derecha: empieza a 293 yd de la salida, carry 325 yd.", at: null, source: "manual" },
    { id: "h7-front", type: "bunker", side: "frente_green", from_yd: 332, carry_yd: 359, note: "Bunker frente al green: empieza a 332 yd de la salida, carry 359 yd.", at: null, source: "manual" },
  ],
  why: "El bunker de la derecha agarra los drives de 290 a 325 yd y el de la izquierda castiga el gancho corto. Con híbrido quedás antes y el approach entra con más spin a un green que cae hacia adelante.",
  miss_side: "izquierda",
  miss_note: "Si errás, que sea a la izquierda, corto del bunker.",
  green_slope: "Cae de atrás hacia adelante",
  green_leave: "Abajo del hoyo, nunca pasada",
  green_notes: "Green que cae hacia adelante: quedate corto y abajo.",
  variants: {
    scratch: { tee_club: "Madera 3", plan: "Madera 3 al centro, corto del bunker de la derecha. Queda un wedge corto." },
    medio: { tee_club: "Híbrido", plan: "Híbrido al centro. El segundo queda 120–140 yd con wedge." },
    alto: { tee_club: "Híbrido", plan: "Híbrido al centro, sin forzar. El segundo es un hierro o híbrido al green." },
  },
};

const azul8: HoleStrategy = {
  plan_title: "Hierro largo al centro",
  plan_text: "Salida con hierro 4 o 5 al centro del fairway. El green está protegido adelante: mejor quedar corto que largo.",
  tee_club: "Hierro 4",
  tee_target: "Centro del fairway",
  target: null,
  hazards: [
    { id: "h8-front", type: "bunker", side: "frente_green", from_yd: 310, carry_yd: 335, note: "Bunker frente al green: no lo desafíes con la salida.", at: null, source: "manual" },
  ],
  why: "Un hierro te deja un approach cómodo y saca de juego el bunker de adelante.",
  miss_side: "corto",
  miss_note: "Si errás, que sea corto. Largo no tiene recovery.",
  green_slope: "Cae de adelante hacia atrás",
  green_leave: "Abajo, corto del hoyo",
  green_notes: "No pases el hoyo.",
  variants: { alto: { tee_club: "Híbrido", plan: "Híbrido al centro. El segundo puede ser un pitch." } },
};

function pack(id: string, key: string, overview: string, holes: { hole: number; data: HoleStrategy }[]) {
  return {
    course_id: id,
    course_key: key,
    overview,
    overview_published_at: "2026-11-06T12:00:00Z",
    published_holes: holes.map(h => h.hole),
    holes: holes.map(h => ({ ...publicHole(h.hole, h.data), published_at: "2026-11-06T12:00:00Z" })),
  };
}

function azul() {
  return pack(
    "118-jockey-azul",
    "1:Azul",
    "Cancha corta y técnica. El rough castiga y varios greens caen hacia adelante. Pensá el palo de salida hoyo por hoyo.",
    AZUL_YARDS.map(h => ({ hole: h.n, data: h.n === 7 ? azul7 : h.n === 8 ? azul8 : plan(h, "Azul") })),
  );
}

function colorada() {
  return pack(
    "118-jockey-colorada",
    "1:Colorada",
    "Más larga que la Azul, con pares 4 de drive y tres pares 5. El rough pesa. Salí al centro y dejá el approach entero.",
    COLORADA_YARDS.map(h => ({ hole: h.n, data: plan(h, "Colorada") })),
  );
}

export function jockeyFallback(key?: string | null) {
  const folded = fold(String(key || ""));
  if (folded.includes("colorada")) return colorada();
  if (folded.includes("azul") || folded === "1:azul" || folded.includes("118-jockey-azul")) return azul();
  return null;
}
