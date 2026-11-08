import { test } from "node:test";
import assert from "node:assert/strict";
import * as P from "../lib/club-pages";
// Synthetic fixtures that copy the structure of the real pages (no real names).
const RES = `<table class="table table-bordered"><tr><td colspan="2"> Próximas Reservas</b><br><font color="#009900">Perez Juan Carlos </font><br/></td></tr>
<tr><td>Salida</td><td>Jugad.</td></tr><tr valign="middle"><td nowrap> <a href="misjugadoresporlinea.php?TorneoID=15379&PlayerID=111" style="x" > Sab 31 12:33 Hoyo 1 </td>
<td><a href="misjugadoresporlinea.php?TorneoID=15379&PlayerID=111" ><img src="jugadoresgolf.png"></a></td></tr></table>`;
const NONE = `<table class="table table-bordered"> No hay Reservas Registradas para los Próximos Torneos </table>`;
const COMP = `<table><tr><td>Jugadores de la Línea</td></tr><tr><th>Nombre</th><th>HCP</th></tr><tr><td><div>Gomez Ana </td><td><div>8.9</td></tr><tr><td><div>Perez Juan Carlos </td><td><div>3.1</td></tr></table>`;
const EV = `<td id='14' width='16'><div align='center'><a id='15' href=javascript:reservas('15379')><img></a></td><td bgcolor='#FFFFFF'<div><font>&nbsp;Sábado&nbsp;</font></div></td><td bgcolor='#FFFFFF'<div><font>&nbsp;31/10/26&nbsp;</font></div></td><td><div><font>Jockey Club</font></div></td><td><div><font>Copa X 0-9.9 36hmp &#128997;&#128997;</font></div></td><td><div><font>Medal 36 Hoyos (1/2)</font></div></td>`;
const CALC = `<form name="frm1"><select name="modalidad"><option selected value="medal18">Medal 18 Hoyos</option><option value="fba">Fourball Americano</option></select>
<select name="CanchaSalida"><option value="21">Azul -> Tee: Azul (Caballeros)</option><option value="25">Azul -> Tee: Rosa (Damas)</option><option value="11">Colorada -> Tee: Rojo (Caballeros)</option></select>
<table id="tabladiferen"><tr><td>Tee</td><td>Slope</td><td>Calificaci&oacute;n</td><td>Par</td></tr><tr><td>21</td><td>123</td><td>70.2</td><td>72</td></tr></table>
<input name="J1" type="text" value="111" /><tr><td> CALCULO DE HANDICAP DE JUEGO </td></tr><tr><td> PEREZ JUAN (3.1) </td></tr><tr><td> HANDICAP DE JUEGO : 2 </td></tr></form>`;

test("bookings: row, header, empty page", () => {
  const b = P.parseBookings(RES);
  assert.equal(b.player_header, "Perez Juan Carlos");
  assert.deepEqual(b.rows.map(r => [r.torneo_id, r.weekday, r.day, r.time, r.start_hole]), [["15379", 6, 31, "12:33", 1]]);
  const n = P.parseBookings(NONE); assert.equal(n.none, true); assert.equal(n.rows.length, 0); assert.equal(n.recognized, true);
  assert.equal(P.parseBookings("<html>login</html>").recognized, false);
});
test("companions, events, and the course only when the source names it", () => {
  assert.deepEqual(P.parseCompanions(COMP).players, [{ name: "Gomez Ana", hcp: 8.9 }, { name: "Perez Juan Carlos", hcp: 3.1 }]);
  const e = P.parseEvents(EV).get("15379")!;
  assert.equal(e.date, "2026-10-31"); assert.equal(e.modality, "Medal 36 Hoyos (1/2)");
  assert.deepEqual(P.courseFromEvent(e.event, ["Azul", "Colorada"]), { course: null, how: null });
  assert.deepEqual(P.courseFromEvent("Medal Viernes 18hmp COLO", ["Azul", "Colorada"]), { course: null, how: null });
  assert.deepEqual(P.courseFromEvent("Copa 🟥🟦", ["Azul", "Colorada"]), { course: null, how: null });
  assert.deepEqual(P.verifiedCourse({ venue: "Colorada" }, ["Azul", "Colorada"]), { course: "Colorada", how: "fuente" });
  assert.deepEqual(P.verifiedCourse({ venue: e.venue, course: e.event }, ["Azul", "Colorada"]), { course: null, how: null });
  assert.equal(P.inferDate(6, 31, "2026-10-28"), "2026-10-31");
});
test("calculator: options, result, plus handicaps, modality mapping", () => {
  const f = P.parseCalcForm(CALC);
  assert.equal(f.recognized, true); assert.equal(f.j1, "111");
  assert.deepEqual(f.options[0], { id: "21", course: "Azul", tee: "Azul", gender: "C" });
  assert.deepEqual(P.parseCalcResult(CALC), { playing_hcp: 2, slope: 123, course_rating: 70.2, par: 72, hi: 3.1 });
  assert.equal(P.parseCalcResult(CALC.replace(": 2", ": +1")).playing_hcp, -1);
  assert.equal(P.modalityKey("Medal 36 Hoyos (1/2)"), "medal18"); assert.equal(P.modalityKey("Fourball Clásico"), null); assert.equal(P.modalityKey("Stableford"), "stableford18");
});
