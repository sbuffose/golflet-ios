/** Published fallback plans for Mar del Plata Golf Club · Cancha Vieja when /api/strategy has no holes.
 *  Yardages, hazards and green notes come from the printed guía (MDP_CANCHA_VIEJA).
 *  Short rioplatense plan text follows the same par/yd pattern as jockey-plans.ts. */
import { publicHole, type HoleStrategy } from "./strategy-parse";
import { MDP_CANCHA_VIEJA } from "./green-guide/209-cancha-vieja";
import type { GgGreen, GgHazard, GgHole } from "./green-guide-core";

function fold(s: string) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function teeAdvice(par: number, yards: number) {
  if (par === 3 && yards < 140) return { title: "Wedge al centro", text: `Par 3 corto, ${yards} yd. Wedge o hierro 9 al medio del green. No lo pases.`, club: "PW", target: "Centro del green", miss: "corto" as const };
  if (par === 3 && yards < 190) return { title: "Hierro al centro", text: `Par 3 de ${yards} yd. Hierro medio al centro, sin cazar la bandera.`, club: "Hierro 7", target: "Centro del green", miss: "corto" as const };
  if (par === 3) return { title: "Hierro largo, sin pasarte", text: `Par 3 largo, ${yards} yd. Salí con lo que llegue cómodo y dejalo en el medio.`, club: "Híbrido", target: "Centro del green", miss: "corto" as const };
  if (par === 5 && yards < 500) return { title: "Dos golpes y un wedge", text: `Par 5 de ${yards} yd. Driver al centro y un segundo que deje wedge entero. No lo fuerces en dos.`, club: "Driver", target: "Centro del fairway", miss: "izquierda" as const };
  if (par === 5) return { title: "Jugalo en tres", text: `Par 5 de ${yards} yd. Tres golpes. El segundo es posición, no distancia.`, club: "Driver", target: "Lado ancho del fairway", miss: "izquierda" as const };
  if (par === 4 && yards < 330) return { title: "Híbrido y wedge", text: `Par 4 corto, ${yards} yd. Híbrido o hierro largo y dejá un wedge. El driver no hace falta.`, club: "Híbrido", target: "Centro, corto del problema", miss: "izquierda" as const };
  if (par === 4 && yards < 390) return { title: "Madera al centro", text: `Par 4 de ${yards} yd. Madera o híbrido al centro. El approach tiene que quedar entero.`, club: "Madera 3", target: "Centro del fairway", miss: "derecha" as const };
  return { title: "Driver al lado ancho", text: `Par 4 de ${yards} yd. Driver al lado más ancho y un hierro al centro del green.`, club: "Driver", target: "Lado ancho", miss: "izquierda" as const };
}

function mapSide(side: string): HoleStrategy["hazards"][number]["side"] {
  const s = fold(side).replace(/\./g, "").trim();
  if (s.startsWith("izq")) return "izquierda";
  if (s.startsWith("der")) return "derecha";
  if (s.startsWith("frente")) return "frente_green";
  if (s.startsWith("atras") || s.startsWith("detras")) return "detras_green";
  if (s.startsWith("cruz")) return "centro";
  return null;
}

function mapType(kind: string): HoleStrategy["hazards"][number]["type"] {
  const k = fold(kind);
  if (k.includes("bunker")) return "bunker";
  if (k.includes("limite") || k === "ob") return "ob";
  if (k.includes("arbol")) return "arboles";
  return "otro";
}

function hazardNote(z: GgHazard, type: string, side: HoleStrategy["hazards"][number]["side"]) {
  const label = type === "ob" ? "Fuera de límites" : type === "arboles" ? "Árboles" : fold(z.kind).includes("pasto") ? "Bunker de pasto" : type === "bunker" ? "Bunker" : z.kind;
  const where = side === "frente_green" ? "frente al green" : side === "detras_green" ? "detrás del green" : side === "centro" ? "cruzando la línea de juego" : side ? `a la ${side}` : "";
  const place = where ? ` ${where}` : "";
  let note = `${label}${place}.`;
  if (z.reach != null && z.carry != null) note = `${label}${place}: empieza a ${z.reach} yd de la salida, carry ${z.carry} yd.`;
  else if (z.carry != null) note = `${label}${place}: carry ${z.carry} yd.`;
  else if (z.reach != null) note = `${label}${place}: a ${z.reach} yd de la salida.`;
  else if (z.to_green?.length) note = `${label}${place}: a ${z.to_green.join("–")} yd del green.`;
  if (z.note) note = `${note} ${z.note}`.trim();
  return note;
}

function guideHazards(n: number, raw: GgHazard[]): HoleStrategy["hazards"] {
  return raw.map((z, i) => {
    const type = mapType(z.kind), side = mapSide(z.side);
    return {
      id: `mdp-${n}-${i + 1}`,
      type,
      side,
      from_yd: z.reach ?? null,
      carry_yd: z.carry ?? null,
      note: hazardNote(z, type, side),
      at: null,
      source: "manual" as const,
    };
  });
}

function pickMiss(hz: HoleStrategy["hazards"], fallback: { miss: NonNullable<HoleStrategy["miss_side"]>; note: string }) {
  if (hz.some(h => h.type === "ob" && h.side === "derecha")) return { miss: "izquierda" as const, note: "A la derecha hay fuera de límites." };
  if (hz.some(h => h.type === "ob" && h.side === "izquierda")) return { miss: "derecha" as const, note: "A la izquierda hay fuera de límites." };
  if (hz.some(h => h.type === "ob" && h.side === "detras_green")) return { miss: "corto" as const, note: "Atrás del green hay fuera de límites. No lo pases." };
  const left = hz.some(h => h.type === "bunker" && h.side === "izquierda");
  const right = hz.some(h => h.type === "bunker" && h.side === "derecha");
  if (right && !left) return { miss: "izquierda" as const, note: "Si errás, que sea a la izquierda: el bunker está a la derecha." };
  if (left && !right) return { miss: "derecha" as const, note: "Si errás, que sea a la derecha: el bunker está a la izquierda." };
  return { miss: fallback.miss, note: fallback.note };
}

function fallLabel(dir: number) {
  const d = ((dir % 360) + 360) % 360;
  if (d >= 315 || d < 45) return "atrás";
  if (d < 135) return "la derecha";
  if (d < 225) return "adelante";
  return "la izquierda";
}

function greenCopy(g?: GgGreen) {
  if (!g) return { slope: "", leave: "Abajo del hoyo", notes: "Mejor corto que pasado." };
  const votes = new Map<string, number>();
  for (const f of g.falls || []) {
    const k = fallLabel(f[2]);
    votes.set(k, (votes.get(k) || 0) + (f[3] === 2 ? 2 : 1));
  }
  const top = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
  const slope = top ? `Cae hacia ${top[0]}.` : "";
  const bits: string[] = [];
  if (g.false_front?.yd) bits.push(`Frente falso: termina a ${g.false_front.yd} yd de la entrada.`);
  if (g.depth_yd) bits.push(`Fondo del green a ${g.depth_yd} yd de la entrada.`);
  const sides = [...new Set((g.bunkers || []).map(b => b.side === "L" ? "izquierda" : b.side === "R" ? "derecha" : b.side === "F" ? "frente" : "atrás"))];
  if (sides.length) bits.push(`Bunkers del green: ${sides.join(", ")}.`);
  if (g.ob?.length) bits.push(`Fuera de límites junto al green: ${g.ob.map(o => o.side === "L" ? "izquierda" : o.side === "R" ? "derecha" : "atrás").join(", ")}.`);
  if (g.banks?.length) bits.push("Hay barrancas marcadas alrededor del green.");
  const leave = g.false_front || top?.[0] === "adelante" || g.ob?.some(o => o.side === "B") ? "Abajo del hoyo, nunca pasada" : "Abajo del hoyo";
  return { slope, leave, notes: bits.join(" ") || "Mejor corto que pasado." };
}

function plan(n: number, hole: GgHole, green?: GgGreen): HoleStrategy {
  const a = teeAdvice(hole.par, hole.yd);
  const hazards = guideHazards(n, hole.hazards || []);
  const miss = pickMiss(hazards, { miss: a.miss, note: a.text });
  if (hazards.some(h => h.type === "ob" && h.side === "derecha")) a.target = "Centro, lejos del límite de la derecha";
  else if (hazards.some(h => h.type === "ob" && h.side === "izquierda")) a.target = "Centro, lejos del límite de la izquierda";
  const hzLine = hazards.filter(h => h.from_yd != null || h.carry_yd != null || h.type === "ob" || h.type === "arboles")
    .slice(0, 4).map(h => h.note.replace(/\.$/, "")).join(". ");
  const extra: string[] = [];
  if (hole.alt_tee) extra.push(`Hay un tee alternativo de ${hole.alt_tee} yd.`);
  if (hole.card_diff) extra.push(hole.card_diff);
  const g = greenCopy(green);
  return {
    plan_title: a.title,
    plan_text: hzLine ? `${a.text} ${hzLine}.` : a.text,
    tee_club: a.club,
    tee_target: a.target,
    target: null,
    hazards,
    why: [`Par ${hole.par}, ${hole.yd} yd desde el tee de juego (guía de campo).`, ...extra].join(" "),
    miss_side: miss.miss,
    miss_note: miss.note,
    green_slope: g.slope,
    green_leave: g.leave,
    green_notes: g.notes,
    variants: { medio: { tee_club: a.club, plan: a.text } },
  };
}

function pack() {
  const src = MDP_CANCHA_VIEJA.source;
  const holes = Array.from({ length: 18 }, (_, i) => {
    const n = i + 1;
    const h = MDP_CANCHA_VIEJA.holes[n];
    return { hole: n, par: h.par, data: plan(n, h, MDP_CANCHA_VIEJA.greens[n]) };
  });
  return {
    course_id: "209-cancha-vieja",
    course_key: "7:Cancha Vieja",
    overview: `${src.title}. ${src.note}`,
    overview_published_at: "2026-11-06T12:00:00Z",
    published_holes: holes.map(h => h.hole),
    holes: holes.map(h => ({ ...publicHole(h.hole, h.data), par: h.par, published_at: "2026-11-06T12:00:00Z" })),
  };
}

export function isMdpCanchaVieja(key?: string | null) {
  const folded = fold(String(key || ""));
  return folded.includes("cancha vieja") || folded.includes("cancha-vieja");
}

export function mdpFallback(key?: string | null) {
  return isMdpCanchaVieja(key) ? pack() : null;
}
