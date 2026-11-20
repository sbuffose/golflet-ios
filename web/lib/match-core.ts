/** t260u/t261u «Armar partido»: pure match-play maths shared by the server and the browser (bundled to public/match-core.js by
 *  web-build/gen-match-core.mjs; tests/match-core.test.ts keeps both in sync). No DB, no network.
 *
 *  Strokes: the lowest handicap of the match plays at zero; everyone else receives (HCP − lowest) × allowance %, rounded half up
 *  (0,5 → 1). Fourball: lowest of the four. Mano a mano: lowest of the two. Metralleta: per pair (the lower of the two at zero).
 *  Gross: no strokes. Strokes go to the holes by stroke index (lowest S.I. first). More than the holes in play → a second round from the lowest S.I.
 *  A card without a complete S.I. (18 distinct, or 9 distinct on a 9-hole card) places nothing: never hole 1, 2, 3… by default.
 *  Scores: gross per hole; null = not entered; 0 = X «no terminó» (never a score, never strokes). t266u: a hole is decided from the scores
 *  entered — it counts once every player of that match is entered (score or X) OR the hole was closed (`_m.done[h]`, set when he moves on).
 *  Best net of each side among players WITH a score; a side with none loses to a side with one; nobody with a score → halved («nadie terminó»).
 *  t262u marks live under the reserved key `scores._m` (player ids are me / c: / n:, never `_m`):
 *    (t262u «dada» per player was removed in t269u: a conceded putt is part of the number; old flags are ignored.)
 *    conc[h] = 0 | 1    → «Hoyo dado»: the hole is won by side 0 / side 1 by concession, whatever the scores (mano a mano, fourball).
 *  Match scores never feed rounds, cards, handicap or stats: they live only in golf_match (see tests/match-isolation.test.ts). */
export type Modality = "fourball" | "single" | "metralleta";
export type MPlayer = { id: string; name: string; hcp: number | null; manual?: boolean; tee?: string | null; gender?: "C" | "D" | null };
export type TeeInfo = { tee: string; gender?: string | null; slope: number | null; course_rating: number | null; par: number | null };
/** t265u: `tees` present → every player plays off their Course Handicap from their tee (WHS: Index × Slope/113 + (CR − Par), rounded);
 *  a player without a usable tee (no tee, or the tee lacks slope / rating / par) falls back to the index, flagged. No tees → index (older matches). */
export type MatchDef = { modality: Modality; scoring: "hcp" | "gross"; allowance: number; players: MPlayer[]; sides?: string[][]; si: (number | null)[]; start_hole?: number; tees?: TeeInfo[]; pars?: (number | null)[] };
export type Scores = Record<string, (number | null)[]>;
export type Marks = { dada?: unknown /* legacy, ignored */; conc?: (0 | 1 | null)[]; done?: boolean[] };
export const marksOf = (s: any): Marks => (s && typeof s === "object" && s._m && typeof s._m === "object" ? s._m : {});
export const HOLES = 18;
export const DEFAULT_ALLOWANCE: Record<Modality, number> = { fourball: 85, single: 100, metralleta: 100 };

export function roundHalfUp(x: number): number { const c = Math.round(x * 1e6) / 1e6; return Math.floor(c + 0.5); }
/** Strokes for each handicap: the lowest at zero, the rest (h − low) × allowance %, rounded half up. */
export function strokesReceived(hcps: number[], allowance: number): number[] {
  if (!hcps.length) return []; const low = Math.min(...hcps);
  return hcps.map(h => roundHalfUp(((h - low) * allowance) / 100));
}
export type HoleCard = { hole: number; par?: number | null; hcp?: number | null };

/** Indexes (0 = hole 1) that have a usable S.I. Null unless the card is complete: 18 distinct values, or exactly 9 (the rest empty) for a 9-hole course. A broken or missing index is not a license to use hole order. */
export function strokeHoles(si: (number | null)[]): number[] | null {
  const known: number[] = [];
  for (let i = 0; i < HOLES; i++) {
    const v = si[i];
    if (v == null) continue;
    if (!Number.isInteger(v) || v < 1 || v > 18) return null;
    known.push(i);
  }
  if (known.length !== 18 && known.length !== 9) return null;
  if (new Set(known.map(i => si[i])).size !== known.length) return null;
  return known;
}
export const strokesPlaced = (si: (number | null)[]) => strokeHoles(si) != null;
/** Holes that receive strokes, lowest S.I. first. Empty when the card has no complete S.I. */
export function siOrder(si: (number | null)[]): number[] {
  const holes = strokeHoles(si);
  if (!holes) return [];
  return holes.slice().sort((a, b) => (si[a] as number) - (si[b] as number) || a - b);
}
/** Strokes per hole (index 0 = hole 1) for a player who receives `s` strokes. All zeros when the S.I. is not loaded. */
export function holeStrokes(s: number, si: (number | null)[]): number[] {
  const out = new Array(HOLES).fill(0); if (!(s > 0)) return out;
  const ord = siOrder(si); if (!ord.length) return out;
  const n = ord.length, base = Math.floor(s / n), extra = s % n;
  ord.forEach((h, r) => { out[h] = base + (r < extra ? 1 : 0); });
  return out;
}
/** Par (3–6) and S.I. (1–18) copied off an official card. Missing cells stay null; nothing is filled in. */
export function cardFromHoles(holes: HoleCard[] | null | undefined): { si: (number | null)[]; pars: (number | null)[] } {
  const si: (number | null)[] = Array(HOLES).fill(null), pars: (number | null)[] = Array(HOLES).fill(null);
  for (const h of holes || []) {
    const n = Number(h?.hole);
    if (!Number.isInteger(n) || n < 1 || n > HOLES) continue;
    const p = Number(h.par); if (Number.isInteger(p) && p >= 3 && p <= 6) pars[n - 1] = p;
    const v = Number(h.hcp); if (Number.isInteger(v) && v >= 1 && v <= 18) si[n - 1] = v;
  }
  return { si, pars };
}
/** First source that can place strokes, else the first that has a par, else an empty card. */
export function pickOfficialCard(sources: { holes?: HoleCard[] | null }[]): { si: (number | null)[]; pars: (number | null)[]; placed: boolean } {
  const cards = (sources.length ? sources : [{}]).map(s => cardFromHoles(s.holes));
  const chosen = cards.find(c => strokesPlaced(c.si)) || cards.find(c => c.pars.some(p => p != null)) || cards[0];
  return { ...chosen, placed: strokesPlaced(chosen.si) };
}
const foldMark = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MARK_COLOR: Record<string, RegExp> = { "🟥": /COLORAD|ROJ/, "🟦": /AZUL/, "🟩": /VERDE/, "🟨": /AMARILL/, "⬛": /NEGR/, "⬜": /BLANC/ };

/** Course named by the event, only when one course of this club matches.
 *  A name (or its first four letters, «COLO») wins. Else one color square (🟦 Azul, 🟥 Colorada).
 *  Two squares, two courses, or no match → null. This does not invent a stroke index. */
export function courseFromMarker(event: string | null | undefined, courses: string[]): string | null {
  const title = String(event || "").trim();
  const list = courses.map(c => c.trim()).filter(Boolean);
  if (!title || !list.length) return null;
  const upper = foldMark(title);
  const words = (name: string) => foldMark(name).split(/\s+/).filter(w => w.length >= 4 && w !== "CANCHA");
  const byName = list.filter(c => words(c).some(w => new RegExp(`\\b${escRe(w.slice(0, 4))}`).test(upper)));
  if (byName.length === 1) return byName[0];
  const colors = [...new Set((title.match(/🟥|🟦|🟩|🟨|⬛|⬜/gu) || []))];
  if (colors.length !== 1) return null;
  const re = MARK_COLOR[colors[0]];
  const hit = re ? list.filter(c => re.test(foldMark(c))) : [];
  return hit.length === 1 ? hit[0] : null;
}

/** The course this booking is for. A stored course label wins when it names exactly one known course.
 *  An empty label falls back to the event marker. The club name alone is not a course. */
export function bookingCourseName(t: { course_label?: string | null; event_name?: string | null }, courses: string[]): string | null {
  const label = String(t.course_label || "").trim();
  const list = [...new Set(courses.map(c => c.trim()).filter(Boolean))];
  if (label) {
    const hit = list.filter(c => courseLabelHits(c, label) || normName(c) === normName(label));
    return hit.length === 1 ? hit[0] : null;
  }
  return courseFromMarker(t.event_name, list);
}

/** Par copied from an official scorecard of this course (`[hoyo, par, golpes]`). Strokes are not a stroke index. */
export function scorecardHoles(rounds: { course?: string | null; official?: boolean | null; holes?: unknown }[] | null | undefined, courseName: string | null): HoleCard[] {
  const want = normName(courseName || "");
  if (!want) return [];
  for (const r of rounds || []) {
    if (r.official === false || normName(String(r.course || "")) !== want || !Array.isArray(r.holes)) continue;
    const holes: HoleCard[] = [];
    for (const h of r.holes) {
      if (!Array.isArray(h) || h.length < 2) continue;
      const hole = Number(h[0]);
      if (Number.isInteger(hole)) holes.push({ hole, par: Number(h[1]) });
    }
    if (holes.some(h => { const p = Number(h.par); return Number.isInteger(p) && p >= 3 && p <= 6; })) return holes;
  }
  return [];
}

/** Directory card, then the player's course list for that same course, then par from an official scorecard. Never a made-up S.I. */
export function resolveOfficialCard(
  t: { course_label?: string | null; event_name?: string | null },
  directoryHoles: HoleCard[] | null | undefined,
  courses: { name?: string; course?: string; holes?: any[] }[] | null | undefined,
  rounds?: { course?: string | null; official?: boolean | null; holes?: unknown }[] | null,
  catalog?: string[],
): { si: (number | null)[]; pars: (number | null)[]; placed: boolean; course: string | null } {
  const names = [...new Set([...(catalog || []), ...(courses || []).map(c => String(c.name || c.course || ""))].map(s => s.trim()).filter(Boolean))];
  const course = bookingCourseName(t, names);
  const extra = course
    ? (courses || []).filter(c => courseLabelHits(String(c.name || c.course || ""), course)).map(c => ({ holes: (c.holes || []).map((h: any) => ({ hole: h.hole, par: h.par, hcp: h.hcp ?? h.hole_hcp })) }))
    : [];
  const picked = pickOfficialCard([{ holes: directoryHoles }, ...extra, { holes: scorecardHoles(rounds, course) }]);
  return { ...picked, course };
}

/** True when the booking label names this course (the course name is its own word). */
export function courseLabelHits(courseName: string, label: string): boolean {
  const a = normName(courseName), b = normName(label);
  if (!a || a.length < 3 || !b) return false;
  if (b === a) return true;
  const words = a.split(" ");
  if (words.length === 1) return b.split(" ").includes(a);
  return b.startsWith(`${a} `) || b.endsWith(` ${a}`) || b.includes(` ${a} `);
}
/** «Joaquín L.» Given name + surname initial. When the list leads with a shared surname («Lavalle Joaquín» / «Lavalle Augusto»), the given name is the first token that is not shared. «Vos» for the account owner. */
export function shortName(name: string, peers: string[], me = false): string {
  if (me) return "Vos";
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0];
  const same = (a: string, b: string) => a.localeCompare(b, "es", { sensitivity: "accent" }) === 0;
  const lists = (peers.length ? peers : [name]).map(p => String(p || "").trim().split(/\s+/).filter(Boolean));
  const firstShared = lists.filter(t => t[0] && same(t[0], parts[0])).length > 1;
  if (firstShared) {
    let given = parts[parts.length - 1];
    for (let i = 1; i < parts.length; i++) {
      const tok = parts[i];
      if (lists.filter(t => t[i] && same(t[i], tok)).length < 2) { given = tok; break; }
    }
    return `${given} ${parts[0][0].toLocaleUpperCase("es")}.`;
  }
  return `${parts[0]} ${parts[parts.length - 1][0].toLocaleUpperCase("es")}.`;
}
/** WHS Course Handicap (rounded, .5 up). Null when the tee lacks slope, rating or par — never invented. */
export function courseHandicap(index: number | null, t: TeeInfo | null | undefined): number | null {
  if (index == null || !t || !(Number(t.slope) > 0) || !Number.isFinite(Number(t.course_rating)) || !(Number(t.par) > 0)) return null;
  return roundHalfUp(index * Number(t.slope) / 113 + (Number(t.course_rating) - Number(t.par)));
}
export function teeOf(def: MatchDef, p: MPlayer): TeeInfo | null {
  if (!def.tees?.length || !p.tee) return null; const k = p.tee.toLowerCase(), g = p.gender || "C";
  return def.tees.find(t => t.tee.toLowerCase() === k && (t.gender || "C") === g) || def.tees.find(t => t.tee.toLowerCase() === k && !t.gender) || null;
}
export type PlayingHcp = { index: number | null; tee: string | null; course_handicap: number | null; base: number | null; source: "course" | "index" | "none"; note: string | null };
/** The handicap the match uses for a player: Course Handicap from their tee, else the index (flagged), else none. */
export function playingHcp(def: MatchDef, p: MPlayer): PlayingHcp {
  const t = teeOf(def, p), ch = courseHandicap(p.hcp, t);
  if (ch != null) return { index: p.hcp, tee: t!.tee, course_handicap: ch, base: ch, source: "course", note: null };
  if (p.hcp == null) return { index: null, tee: p.tee ?? null, course_handicap: null, base: null, source: "none", note: "sin hándicap" };
  const why = !def.tees?.length ? null : !p.tee ? "sin salida elegida: juega con el índice" : !t ? "esa salida no está en los datos del club: juega con el índice" : "la salida no tiene slope / course rating / par: juega con el índice";
  return { index: p.hcp, tee: p.tee ?? null, course_handicap: null, base: p.hcp, source: "index", note: why };
}
export function playOrder(start = 1): number[] { const s = start >= 1 && start <= HOLES ? start - 1 : 0; return Array.from({ length: HOLES }, (_, k) => (s + k) % HOLES); }
const hasScore = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 20;

export type HoleRes = { hole: number; a: number | null; b: number | null; w: "A" | "B" | "H"; dado?: boolean };
export type MatchState = { up: number; played: number; remaining: number; finished: boolean; dormie: boolean; text: string; result: "A" | "B" | "H" | null; margin: number; holes: HoleRes[] };
/** Status text from the leader's side: «All square», «2 arriba», «Dormie (2 arriba)», finished «3&2», «1 arriba», «Empate». */
export function statusText(up: number, remaining: number, finished: boolean): string {
  const m = Math.abs(up);
  if (finished) return m === 0 ? "Empate" : remaining > 0 ? `${m}&${remaining}` : `${m} arriba`;
  if (m === 0) return "All square";
  return m === remaining ? `Dormie (${m} arriba)` : `${m} arriba`;
}
/** One match-play match between side A and side B; strokes[id] = strokes per hole for that match. */
export function matchPlay(A: string[], B: string[], scores: Scores, strokes: Record<string, number[]>, start = 1, conc: (0 | 1 | null)[] = [], done: boolean[] = []): MatchState {
  const all = [...A, ...B], holes: HoleRes[] = []; let up = 0, played = 0, closed = false;
  const best = (side: string[], h: number) => { const v = side.map(id => { const g = scores[id]?.[h]; return hasScore(g) && g! > 0 ? g! - (strokes[id]?.[h] || 0) : null; }).filter((x): x is number => x != null); return v.length ? Math.min(...v) : null; };
  for (const h of playOrder(start)) {
    if (closed) break;
    const c = conc[h];
    if (c === 0 || c === 1) { holes.push({ hole: h + 1, a: best(A, h), b: best(B, h), w: c === 0 ? "A" : "B", dado: true }); played++; up += c === 0 ? 1 : -1; if (Math.abs(up) > HOLES - played) closed = true; continue; }
    if (!(all.every(id => hasScore(scores[id]?.[h])) || (done[h] === true && all.some(id => hasScore(scores[id]?.[h]))))) continue;   // t266u: all entered, or closed with ≥1 entry
    const a = best(A, h), b = best(B, h), w: HoleRes["w"] = a == null && b == null ? "H" : a == null ? "B" : b == null ? "A" : a < b ? "A" : b < a ? "B" : "H";
    holes.push({ hole: h + 1, a, b, w }); played++; up += w === "A" ? 1 : w === "B" ? -1 : 0;
    if (Math.abs(up) > HOLES - played) closed = true;
  }
  const remaining = HOLES - played, finished = closed || remaining === 0;
  return { up, played, remaining, finished, dormie: !finished && up !== 0 && Math.abs(up) === remaining, text: statusText(up, remaining, finished), result: finished ? (up > 0 ? "A" : up < 0 ? "B" : "H") : null, margin: Math.abs(up), holes };
}
export type PairRes = { a: string; b: string; strokes: Record<string, number>; state: MatchState };
export type TableRow = { id: string; name: string; won: number; tied: number; lost: number; holes_up: number; open: number };
export type Evaluation = { modality: Modality; strokes: Record<string, number>; hole_strokes: Record<string, number[]>; strokes_placed: boolean; sides: string[][]; main: MatchState | null; pairs: PairRes[]; table: TableRow[]; finished: boolean; summary: string; playing?: Record<string, PlayingHcp> };

/** Everything the screens need: strokes, dots per hole, the live state, and (metralleta) every pair + the table. */
export function evaluate(def: MatchDef, scores: Scores): Evaluation {
  const P = def.players, hcpMode = def.scoring === "hcp", al = Number.isFinite(def.allowance) ? def.allowance : DEFAULT_ALLOWANCE[def.modality];
  const DONE = marksOf(scores).done || [];
  const playing = Object.fromEntries(P.map(p => [p.id, playingHcp(def, p)])) as Record<string, PlayingHcp>;
  const baseOf = (id: string) => { const p = P.find(x => x.id === id); return p ? playingHcp(def, p).base ?? 0 : 0; };
  const strokesOf = (ids: string[]) => { const hs = ids.map(baseOf); const s = hcpMode ? strokesReceived(hs, al) : hs.map(() => 0); return Object.fromEntries(ids.map((id, k) => [id, s[k]])) as Record<string, number>; };
  const placed = strokesPlaced(def.si);
  const hsOf = (st: Record<string, number>) => Object.fromEntries(Object.entries(st).map(([id, s]) => [id, holeStrokes(s, def.si)])) as Record<string, number[]>;
  const name = (id: string) => P.find(p => p.id === id)?.name || id, start = def.start_hole || 1;
  if (def.modality === "metralleta") {
    const ids = P.map(p => p.id), strokes = strokesOf(ids), pairs: PairRes[] = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const st = strokesOf([ids[i], ids[j]]); pairs.push({ a: ids[i], b: ids[j], strokes: st, state: matchPlay([ids[i]], [ids[j]], scores, hsOf(st), start, [], DONE) }); }
    const table: TableRow[] = ids.map(id => ({ id, name: name(id), won: 0, tied: 0, lost: 0, holes_up: 0, open: 0 }));
    for (const pr of pairs) { const ra = table.find(t => t.id === pr.a)!, rb = table.find(t => t.id === pr.b)!, s = pr.state;
      ra.holes_up += s.up; rb.holes_up -= s.up;
      if (!s.finished) { ra.open++; rb.open++; } else if (s.result === "H") { ra.tied++; rb.tied++; } else if (s.result === "A") { ra.won++; rb.lost++; } else { rb.won++; ra.lost++; } }
    table.sort((x, y) => y.won - x.won || y.holes_up - x.holes_up || x.lost - y.lost || x.name.localeCompare(y.name, "es"));
    const finished = pairs.length > 0 && pairs.every(p => p.state.finished);
    return { modality: "metralleta", strokes, hole_strokes: hsOf(strokes), strokes_placed: placed, sides: ids.map(i => [i]), main: null, pairs, table, finished, summary: finished ? `Ganó ${table[0]?.name ?? ""}` : `${pairs.filter(p => p.state.finished).length}/${pairs.length} partidos terminados`, playing };
  }
  const sides = def.modality === "single" ? [[P[0]?.id], [P[1]?.id]].map(s => s.filter(Boolean) as string[]) : (def.sides || []);
  const ids = sides.flat(), strokes = strokesOf(ids), hs = hsOf(strokes), main = matchPlay(sides[0] || [], sides[1] || [], scores, hs, start, marksOf(scores).conc || [], DONE);
  const sideName = (k: number) => (sides[k] || []).map(name).join(" / ");
  const lead = main.up > 0 ? sideName(0) : main.up < 0 ? sideName(1) : "";
  return { modality: def.modality, strokes, hole_strokes: hs, strokes_placed: placed, sides, main, pairs: [], table: [], finished: main.finished, summary: main.up === 0 ? main.text : `${lead} ${main.text}`, playing };
}

/** Stable player key across matches: the club player id when we have it, else the normalised name. «me» for the account owner. */
export function normName(s: string): string { return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-zñ0-9 ]+/g, " ").replace(/\s+/g, " ").trim(); }
export function playerKey(p: { club_id?: string | number | null; name: string; me?: boolean }): string { return p.me ? "me" : p.club_id != null && String(p.club_id) !== "" ? `c:${p.club_id}` : `n:${normName(p.name)}`; }

/* ---------- t261u history: head-to-head (players) and fourball pairs ---------- */
export type Rec = { w: number; t: number; l: number; holes: number; n: number; form: ("G" | "E" | "P")[] };   // form: last 8 results, oldest → newest
export type Last = { date: string; text: string; modality: Modality; match_id: string } | null;
export type StoredMatch = { id: string; date: string; course_label?: string | null; def: MatchDef; result: Evaluation };
const rec = (): Rec => ({ w: 0, t: 0, l: 0, holes: 0, n: 0, form: [] });
const add = (r: Rec, res: "A" | "B" | "H", margin: number, mine: "A" | "B") => { r.n++; const f = res === "H" ? "E" : res === mine ? "G" : "P"; if (res === "H") r.t++; else if (res === mine) { r.w++; r.holes += margin; } else { r.l++; r.holes -= margin; } r.form.push(f); if (r.form.length > 8) r.form.shift(); };
export type H2H = { a: string; b: string; individual: Rec; fourball_opp: Rec; fourball_partner: Rec; last: Last };
export type PairVs = { pair: string[]; vs: string[]; rec: Rec; last: Last };
export type History = { names: Record<string, string>; h2h: H2H[]; pairs: PairVs[]; partners: { partner: string; rec: Rec; last: Last }[]; matches: number;
  /** t264u: my overall record — mano a mano + fourball by match, metralleta by each of my pair matches. */ overall: Rec; by_modality: Record<Modality, Rec> };
/** Aggregates FINISHED matches. h2h: every pair of players (records from `a`'s side; `a` = me when I'm in it). Individual = mano a mano + metralleta pairs;
 *  fourball counted apart (as opponents, as partners). Pairs: each fourball pair vs each opposing pair (from the pair with me, else the first sorted). */
export function aggregate(ms: StoredMatch[], me = "me"): History {
  const names: Record<string, string> = {}, H = new Map<string, H2H>(), PV = new Map<string, PairVs>(), PT = new Map<string, { partner: string; rec: Rec; last: Last }>();
  const order = (x: string, y: string) => (x === me ? -1 : y === me ? 1 : x < y ? -1 : x > y ? 1 : 0);
  const h2h = (x: string, y: string) => { const [a, b] = order(x, y) <= 0 ? [x, y] : [y, x], k = `${a}|${b}`; if (!H.has(k)) H.set(k, { a, b, individual: rec(), fourball_opp: rec(), fourball_partner: rec(), last: null }); return { e: H.get(k)!, flip: a !== x }; };
  const flipRes = (r: "A" | "B" | "H") => (r === "A" ? "B" : r === "B" ? "A" : "H") as "A" | "B" | "H";
  const overall = rec(), byM: Record<Modality, Rec> = { fourball: rec(), single: rec(), metralleta: rec() };
  const mine = (m: Modality, res: "A" | "B" | "H", margin: number, side: "A" | "B") => { add(overall, res, margin, side); add(byM[m], res, margin, side); };
  const sorted = [...ms].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.id < y.id ? -1 : 1));
  for (const m of sorted) {
    const R = m.result; if (!R?.finished) continue;
    for (const p of m.def.players) names[p.id] = p.name;
    const last = (text: string): Last => ({ date: m.date, text, modality: m.def.modality, match_id: m.id });
    if (m.def.modality === "metralleta" || m.def.modality === "single") {
      const list = m.def.modality === "single" ? [{ a: R.sides[0][0], b: R.sides[1][0], state: R.main! }] : R.pairs.map(p => ({ a: p.a, b: p.b, state: p.state }));
      for (const pr of list) { if (!pr.state?.finished || !pr.state.result) continue; const { e, flip } = h2h(pr.a, pr.b), res = flip ? flipRes(pr.state.result) : pr.state.result;
        if (pr.a === me || pr.b === me) mine(m.def.modality, pr.state.result, pr.state.margin, pr.a === me ? "A" : "B");
        add(e.individual, res, pr.state.margin, "A"); e.last = last(`${res === "H" ? "Empate" : `${names[res === "A" ? e.a : e.b]} ${pr.state.text}`}`); }
      continue;
    }
    const [S0, S1] = R.sides, st = R.main!; if (!st?.finished || !st.result || S0?.length !== 2 || S1?.length !== 2) continue;
    const txt = st.result === "H" ? "Empate" : `${(st.result === "A" ? S0 : S1).map(i => names[i]).join(" / ")} ${st.text}`;
    for (const x of S0) for (const y of S1) { const { e, flip } = h2h(x, y); add(e.fourball_opp, flip ? flipRes(st.result) : st.result, st.margin, "A"); e.last = last(txt); }
    for (const [S, mine] of [[S0, "A"], [S1, "B"]] as const) { const { e } = h2h(S[0], S[1]); add(e.fourball_partner, st.result, st.margin, mine); e.last = last(txt); }
    // pairs: from the side with me, else the side whose sorted key is first
    const key = (S: string[]) => [...S].sort(order).join("+"), k0 = key(S0), k1 = key(S1);
    const mineFirst = S0.includes(me) ? true : S1.includes(me) ? false : k0 <= k1;
    const [P0, P1, mySide] = mineFirst ? [S0, S1, "A" as const] : [S1, S0, "B" as const], pk = `${key(P0)}|${key(P1)}`;
    if (!PV.has(pk)) PV.set(pk, { pair: [...P0].sort(order), vs: [...P1].sort(order), rec: rec(), last: null });
    const pv = PV.get(pk)!; add(pv.rec, st.result, st.margin, mySide); pv.last = last(txt);
    const meSide = S0.includes(me) ? S0 : S1.includes(me) ? S1 : null;
    if (meSide) mine("fourball", st.result, st.margin, meSide === S0 ? "A" : "B");
    if (meSide) { const partner = meSide.find(i => i !== me)!; if (!PT.has(partner)) PT.set(partner, { partner, rec: rec(), last: null }); const pt = PT.get(partner)!; add(pt.rec, st.result, st.margin, meSide === S0 ? "A" : "B"); pt.last = last(txt); }
  }
  const mineFirst = <T extends { a?: string; pair?: string[] }>(x: T, y: T) => Number((y.a ?? y.pair?.[0]) === me) - Number((x.a ?? x.pair?.[0]) === me);
  return { names, h2h: [...H.values()].sort(mineFirst), pairs: [...PV.values()].sort(mineFirst), partners: [...PT.values()], matches: sorted.filter(m => m.result?.finished).length, overall, by_modality: byM };
}

/** t264u: a finished match from my side — G/E/P + the short text for the badge («3&2», «1 arriba», metralleta «2-0-1»). */
export function myOutcome(R: Evaluation | null | undefined, me = "me"): { res: "G" | "E" | "P" | null; text: string | null } {
  if (!R) return { res: null, text: null };
  if (R.modality === "metralleta") { const row = R.table.find(t => t.id === me); if (!row) return { res: null, text: R.summary };
    const res = !R.finished ? null : R.table[0]?.id === me ? "G" : row.won > row.lost ? "G" : row.won === row.lost ? "E" : "P"; return { res, text: `${row.won}-${row.tied}-${row.lost}` }; }
  const st = R.main; if (!st) return { res: null, text: null }; const side = R.sides[0]?.includes(me) ? "A" : R.sides[1]?.includes(me) ? "B" : null;
  if (!st.finished || !st.result) return { res: null, text: st.text };
  return { res: st.result === "H" ? "E" : side == null ? null : st.result === side ? "G" : "P", text: st.text };
}
