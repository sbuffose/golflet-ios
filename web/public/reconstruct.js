/* Cargar una vuelta ya jugada. El mapa se mueve bajo la mira, igual que en el juego.
   El punto que se deja es manual. La distancia entre dos puntos es estimada. No hay GPS ni tarjeta del club. */
(function () {
  let api = () => Promise.reject(new Error("api is not defined"));
  let esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const TILE = (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
  const CLUBS = ["Dr", "3W", "5W", "Hy", "4i", "5i", "6i", "7i", "8i", "9i", "PW", "GW", "SW", "LW", "Pt"];
  const RESULTS = [["fairway", "Fairway"], ["green", "Green"], ["rough", "Rough"], ["bunker", "Bunker"], ["water", "Agua"], ["ob", "OB"], ["penalty", "Pena"], ["holed", "Embocada"], ["other", "Otro"]];
  const proj = (lat, lng) => {
    const x = (lng + 180) / 360;
    const s = Math.sin(lat * Math.PI / 180);
    const y = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
    return [x, y];
  };
  const unproj = (x, y) => {
    const lng = x * 360 - 180;
    const n = Math.PI - 2 * Math.PI * y;
    return { lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), lng };
  };
  const hav = (a, b) => {
    if (!a || !b) return null;
    const R = 6371008.8, t = v => v * Math.PI / 180, dLa = t(b.lat - a.lat), dLo = t(b.lng - a.lng);
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  };

  function roundQuery() {
    const hash = location.hash || "";
    const q = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
    const params = new URLSearchParams(q);
    const hole = Number(params.get("hole"));
    return { roundId: params.get("ronda") || "", hole: hole >= 1 && hole <= 18 ? String(hole) : "" };
  }

  function normName(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }

  function matchCourse(official, courses) {
    const name = normName(official?.course);
    if (!name) return null;
    const club = normName(official.club_name);
    const named = (courses || []).filter(c => normName(c.course || c.course_label || c.label) === name);
    if (club) {
      const both = named.find(c => normName(c.club_name || c.club) === club);
      if (both) return both;
    }
    return named.length === 1 ? named[0] : null;
  }

  function open(root) {
    if (!root) return;
    const id = root.dataset.id || "";
    const query = roundQuery();
    if (!id && query.roundId) {
      mountRound(root, query.roundId, query.hole);
      return;
    }
    root.innerHTML = id ? editor(id) : picker();
    if (id) mountEditor(root, id, query.hole);
    else mountPicker(root);
  }

  async function mountRound(root, roundId, hole) {
    root.innerHTML = `<div class="card"><p class="s">Leyendo esta vuelta…</p></div>`;
    let setup;
    try { setup = await api("/api/reconstructions"); }
    catch (e) {
      root.innerHTML = `<div class="card"><p class="s">${esc(e?.message || "No pudimos abrir esta vuelta.")}</p></div>`;
      return;
    }
    if (!root.isConnected) return;
    const found = (setup.reconstructions || []).find(r => r.round_id === roundId);
    if (found) {
      const next = `#/reconstruir/${found.id}?hole=${encodeURIComponent(hole || "1")}`;
      if ((location.hash || "") !== next) location.hash = next;
      else { root.innerHTML = editor(found.id); mountEditor(root, found.id, hole); }
      return;
    }
    const official = (setup.rounds || []).find(r => r.id === roundId);
    if (!official) {
      root.innerHTML = picker();
      mountPicker(root, { roundId });
      return;
    }
    let courses = [];
    try {
      const pack = await api("/api/gps/courses");
      courses = pack.courses || [];
    } catch (_) { courses = []; }
    if (!root.isConnected) return;
    const course = matchCourse(official, courses);
    if (!course?.course_id) {
      root.innerHTML = picker();
      await mountPicker(root, { roundId, date: official.date });
      const err = root.querySelector("#rc-err");
      if (err && !err.textContent) err.textContent = "Esta es la tarjeta de la vuelta. Elegí la cancha para ver el mapa. Abrir esta pantalla no guarda golpes.";
      return;
    }
    root.innerHTML = editor("");
    const title = root.querySelector("#rc-title");
    if (title) title.textContent = "Registrar mis tiros";
    await mountEditor(root, "", hole, { roundId, date: official.date, courseId: course.course_id });
  }

  function picker() {
    return `<div class="card"><div class="t">Cargar una vuelta ya jugada</div>
      <p class="s">Elegí la fecha, la cancha y, si ya está, la tarjeta del club. Los golpes se guardan aparte: no reescriben esa tarjeta.</p>
      <label class="s">Fecha<input id="rc-date" type="date" required></label>
      <label class="s">Cancha<select id="rc-course"><option value="">Cargando canchas…</option></select></label>
      <label class="s">Tarjeta del club, si ya está<select id="rc-round"><option value="">Sin asociar</option></select></label>
      <p id="rc-err" class="s"></p>
      <button class="btn" type="button" id="rc-start">Empezar hoyo por hoyo</button>
      <div id="rc-list"></div></div>`;
  }

  async function mountPicker(root, prefill) {
    const date = root.querySelector("#rc-date");
    const art = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
    date.value = prefill?.date || art;
    date.max = art;
    const err = root.querySelector("#rc-err");
    let courses = [];
    try {
      const pack = await api("/api/gps/courses");
      courses = pack.courses || [];
      const sel = root.querySelector("#rc-course");
      sel.innerHTML = courses.length
        ? courses.map(c => `<option value="${esc(c.course_id)}">${esc(c.club_name || c.club || "")} · ${esc(c.label || c.course || c.vm_course || "Cancha")}</option>`).join("")
        : `<option value="">No hay canchas cargadas en tu cuenta</option>`;
    } catch (e) {
      err.textContent = e?.message || "No pudimos leer las canchas.";
    }
    try {
      const mine = await api("/api/reconstructions");
      const round = root.querySelector("#rc-round");
      for (const r of mine.rounds || []) {
        const o = document.createElement("option");
        o.value = r.id;
        o.textContent = `${r.date} · ${r.club_name || ""} · ${r.course || "Cancha"}`;
        round.appendChild(o);
      }
      if (prefill?.roundId && [...round.options].some(o => o.value === prefill.roundId)) round.value = prefill.roundId;
      const list = root.querySelector("#rc-list");
      list.innerHTML = (mine.reconstructions || []).map(r => `<a class="card" href="#/reconstruir/${esc(r.id)}"><div class="t">${esc(r.date)} · ${esc(r.course || "Cancha")}</div><div class="s">Seguir cargando golpes</div></a>`).join("");
    } catch (e) {
      if (!err.textContent) err.textContent = e?.message || "No pudimos leer tus vueltas.";
    }
    root.querySelector("#rc-start").onclick = async () => {
      err.textContent = "";
      const course = root.querySelector("#rc-course").value;
      if (!course) { err.textContent = "Elegí la cancha."; return; }
      try {
        const body = { date: date.value, course_id: course };
        const round = root.querySelector("#rc-round").value;
        if (round) body.round_id = round;
        const res = await api("/api/reconstructions", { method: "POST", body: JSON.stringify(body) });
        location.hash = `#/reconstruir/${res.live_round.id}`;
      } catch (e) { err.textContent = e?.message || "No pudimos abrir la vuelta."; }
    };
  }

  function editor(id) {
    return `<div class="card"><div class="t" id="rc-title">Golpes de la vuelta</div>
      <p class="s">La mira queda fija. Arrastrá el mapa y marcá la salida y la caída. Si no hay mapa del hoyo, guardá el palo y el resultado sin un punto.</p>
      <div id="rc-map" style="position:relative;height:280px;background:#0d1b2a;border-radius:12px;overflow:hidden;touch-action:none"></div>
      <p id="rc-mapnote" class="s"></p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">
        <button class="btn sm" type="button" id="rc-startp">Salida en la mira</button>
        <button class="btn sm" type="button" id="rc-endp">Caída en la mira</button>
        <button class="btn ghost sm" type="button" id="rc-clear">Borrar puntos</button>
      </div>
      <p id="rc-place" class="s">Sin ubicación. Sin distancia.</p>
      <label class="s">Hoyo<select id="rc-hole">${Array.from({ length: 18 }, (_, i) => `<option>${i + 1}</option>`).join("")}</select></label>
      <label class="s">Palo<select id="rc-club">${CLUBS.map(c => `<option>${c}</option>`).join("")}</select></label>
      <label class="s">Resultado<select id="rc-result"><option value="">Sin resultado</option>${RESULTS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></label>
      <label class="s">Penas<input id="rc-pen" type="number" min="0" max="4" value="0"></label>
      <label class="s">Distancia estimada en metros, si no marcaste los dos puntos<input id="rc-dist" type="number" min="1" max="600" placeholder="vacío si no la sabés"></label>
      <p id="rc-err" class="s"></p>
      <button class="btn" type="button" id="rc-save">Guardar golpe</button>
      <div id="rc-shots"></div></div>`;
  }

  async function mountEditor(root, id, holeHint, pending) {
    const note = root.querySelector("#rc-mapnote");
    const place = root.querySelector("#rc-place");
    const err = root.querySelector("#rc-err");
    let holes = [];
    let center = null;
    let start = null;
    let end = null;
    let editing = null;
    const map = makeMap(root.querySelector("#rc-map"));
    const show = () => {
      const meters = start && end ? hav(start, end) : null;
      const where = start || end ? "Marcado a mano" : "Sin ubicación";
      const dist = meters != null ? `Distancia estimada ${Math.round(meters)} m` : (root.querySelector("#rc-dist").value ? "Distancia estimada, sin los dos puntos" : "Sin distancia");
      place.textContent = `${where}. ${dist}.`;
      map.setMarks(start, end);
    };
    root.querySelector("#rc-startp").onclick = () => { start = map.center(); show(); };
    root.querySelector("#rc-endp").onclick = () => { end = map.center(); show(); };
    root.querySelector("#rc-clear").onclick = () => { start = null; end = null; show(); };
    root.querySelector("#rc-dist").oninput = show;
    const loadHole = () => {
      const n = Number(root.querySelector("#rc-hole").value);
      const h = holes.find(x => Number(x.hole) === n);
      const tee = h?.tee;
      const green = h?.green?.center || h?.green;
      center = tee || green || null;
      if (!center) {
        note.textContent = "Este hoyo no tiene un punto de mapa. Podés guardar el palo, el resultado y las penas sin ubicación.";
        map.hide();
      } else {
        note.textContent = "Mapa del hoyo. La mira no es un GPS: el punto queda marcado a mano.";
        map.show(center);
      }
      show();
    };
    root.querySelector("#rc-hole").onchange = () => { start = null; end = null; loadHole(); };
    let liveId = id || "";
    if (holeHint) root.querySelector("#rc-hole").value = String(holeHint);
    try {
      let courseId = pending?.courseId || "";
      if (!courseId && liveId) {
        const setup = await api("/api/reconstructions");
        const row = (setup.reconstructions || []).find(r => r.id === liveId);
        if (row?.club_code && row?.vm_course) {
          courseId = `${row.club_code}-${String(row.vm_course).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
        }
      }
      if (courseId) {
        try {
          const geo = await api("/api/gps/courses/" + encodeURIComponent(courseId));
          holes = geo.course?.holes || [];
        } catch (e) {
          note.textContent = e?.message || "No hay mapa de esta cancha. Podés guardar el golpe sin un punto.";
        }
      }
    } catch (e) { note.textContent = e?.message || "No pudimos abrir la vuelta."; }
    if (!root.isConnected) return;
    loadHole();
    const draw = async () => {
      const box = root.querySelector("#rc-shots");
      if (!liveId) {
        box.innerHTML = `<p class="s">Todavía no hay golpes. Guardar crea la carga de esta tarjeta; abrirla no la guarda.</p>`;
        return;
      }
      try {
        const pack = await api(`/api/reconstructions/${liveId}/shots`);
        box.innerHTML = (pack.shots || []).map(s => `<div class="card"><div class="t">Hoyo ${s.hole} · ${esc(s.club || "sin palo")}</div>
          <div class="s">${esc(s.position_label)}. ${esc(s.distance_label)}${s.distance_m != null ? ` · ${Math.round(s.distance_m)} m` : ""}${s.penalty_strokes ? ` · ${s.penalty_strokes} pena${s.penalty_strokes === 1 ? "" : "s"}` : ""}</div>
          <button class="btn ghost sm" type="button" data-edit="${esc(s.id)}">Corregir</button>
          <button class="btn ghost sm" type="button" data-del="${esc(s.id)}">Borrar</button></div>`).join("") || `<p class="s">Todavía no hay golpes.</p>`;
        box.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => {
          const s = (pack.shots || []).find(x => x.id === b.dataset.edit);
          if (!s) return;
          editing = s.id;
          root.querySelector("#rc-hole").value = String(s.hole);
          root.querySelector("#rc-club").value = s.club || "7i";
          root.querySelector("#rc-result").value = s.result || "";
          root.querySelector("#rc-pen").value = String(s.penalty_strokes || 0);
          root.querySelector("#rc-dist").value = s.lat == null && s.distance_m != null ? String(s.distance_m) : "";
          start = s.lat != null ? { lat: Number(s.lat), lng: Number(s.lng) } : null;
          end = s.end_lat != null ? { lat: Number(s.end_lat), lng: Number(s.end_lng) } : null;
          loadHole();
          if (start) map.show(start);
          show();
          root.querySelector("#rc-save").textContent = "Guardar corrección";
        });
        box.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => {
          err.textContent = "";
          try { await api(`/api/reconstructions/${liveId}/shots?shot=${encodeURIComponent(b.dataset.del)}`, { method: "DELETE" }); await draw(); }
          catch (e) { err.textContent = e?.message || "No pudimos borrar el golpe."; }
        });
      } catch (e) { box.innerHTML = `<p class="s">${esc(e?.message || "No pudimos leer los golpes.")}</p>`; }
    };
    root.querySelector("#rc-save").onclick = async () => {
      err.textContent = "";
      const body = {
        hole: Number(root.querySelector("#rc-hole").value),
        club: root.querySelector("#rc-club").value,
        result: root.querySelector("#rc-result").value || null,
        penalty_strokes: Number(root.querySelector("#rc-pen").value || 0),
        lat: start?.lat ?? null, lng: start?.lng ?? null,
        end_lat: end?.lat ?? null, end_lng: end?.lng ?? null,
      };
      const typed = root.querySelector("#rc-dist").value;
      if (typed) body.distance_m = Number(typed);
      try {
        const wasNew = !liveId;
        if (!liveId) {
          if (!pending?.courseId || !pending?.date || !pending?.roundId) throw new Error("Elegí la cancha.");
          const created = await api("/api/reconstructions", { method: "POST", body: JSON.stringify({ date: pending.date, course_id: pending.courseId, round_id: pending.roundId }) });
          liveId = created?.live_round?.id || "";
          if (!liveId) throw new Error("No pudimos abrir la vuelta.");
        }
        if (editing) {
          body.shot_id = editing;
          await api(`/api/reconstructions/${liveId}/shots`, { method: "PATCH", body: JSON.stringify(body) });
        } else await api(`/api/reconstructions/${liveId}/shots`, { method: "POST", body: JSON.stringify(body) });
        editing = null;
        root.querySelector("#rc-save").textContent = "Guardar golpe";
        start = null; end = null; root.querySelector("#rc-dist").value = "";
        show();
        await draw();
        if (wasNew) location.hash = `#/reconstruir/${liveId}?hole=${encodeURIComponent(root.querySelector("#rc-hole").value || "1")}`;
      } catch (e) { err.textContent = e?.message || "No pudimos guardar el golpe."; }
    };
    draw();
  }

  function makeMap(el) {
    const z = 17;
    let cx = 0, cy = 0, ready = false;
    el.innerHTML = `<div class="rc-tiles" style="position:absolute;inset:0"></div><div style="position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 2px #8e1b1b;pointer-events:none"></div>`;
    const tiles = el.querySelector(".rc-tiles");
    const paint = () => {
      if (!ready) { tiles.innerHTML = ""; return; }
      const w = el.clientWidth || 320, h = el.clientHeight || 280;
      const scale = 256 * 2 ** z;
      const left = cx * scale - w / 2, top = cy * scale - h / 2;
      let html = "";
      const x0 = Math.floor(left / 256), y0 = Math.floor(top / 256);
      const x1 = Math.floor((left + w) / 256), y1 = Math.floor((top + h) / 256);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const n = 2 ** z;
        if (y < 0 || y >= n) continue;
        const xx = ((x % n) + n) % n;
        html += `<img alt="" src="${TILE(z, xx, y)}" style="position:absolute;width:256px;height:256px;left:${x * 256 - left}px;top:${y * 256 - top}px">`;
      }
      tiles.innerHTML = html;
    };
    let drag = null;
    el.onpointerdown = (e) => { if (!ready) return; drag = { x: e.clientX, y: e.clientY, cx, cy }; el.setPointerCapture(e.pointerId); };
    el.onpointermove = (e) => {
      if (!drag) return;
      const scale = 256 * 2 ** z;
      cx = drag.cx - (e.clientX - drag.x) / scale;
      cy = drag.cy - (e.clientY - drag.y) / scale;
      paint();
    };
    el.onpointerup = () => { drag = null; };
    return {
      show(ll) { const p = proj(ll.lat, ll.lng); cx = p[0]; cy = p[1]; ready = true; el.style.display = ""; paint(); },
      hide() { ready = false; el.style.display = "none"; paint(); },
      center() { return ready ? unproj(cx, cy) : null; },
      setMarks() { paint(); },
    };
  }

  window.GolfletRecon = {
    init(deps) { if (deps?.api) api = deps.api; if (deps?.esc) esc = deps.esc; },
    open,
  };
})();
