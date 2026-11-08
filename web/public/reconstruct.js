/* Cargar una vuelta ya jugada. El mapa se mueve bajo la mira, igual que en el juego.
   El punto que se deja es manual. La distancia entre dos puntos es estimada. No hay GPS ni tarjeta del club. */
(function () {
  let api = () => Promise.reject(new Error("api is not defined"));
  let esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const CLUBS = ["Dr", "3W", "5W", "Hy", "4i", "5i", "6i", "7i", "8i", "9i", "PW", "GW", "SW", "LW", "Pt"];

  function roundQuery() {
    const hash = location.hash || "";
    const q = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
    const params = new URLSearchParams(q);
    const hole = Number(params.get("hole"));
    return { roundId: params.get("ronda") || "", hole: hole >= 1 && hole <= 18 ? String(hole) : "" };
  }

  function matchCourse(official, courses) {
    const rules = window.GolfletRules;
    if (!rules || typeof rules.matchRoundCourse !== "function") return null;
    return rules.matchRoundCourse(official, courses);
  }

  function open(root) {
    if (!root) return;
    const id = root.dataset.id || "";
    const query = roundQuery();
    if (!id && query.roundId) {
      mountRound(root, query.roundId, query.hole);
      return;
    }
    if (id) mountEditor(root, id, query.hole, query.roundId ? { roundId: query.roundId, back: `#/ronda/${query.roundId}` } : null);
    else { root.innerHTML = picker(); mountPicker(root); }
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
      const saved = Number(found.current_hole);
      const picked = hole || (saved >= 1 && saved <= 18 ? String(saved) : "1");
      const next = `#/reconstruir/${found.id}?hole=${encodeURIComponent(picked)}&ronda=${encodeURIComponent(roundId)}`;
      if ((location.hash || "") !== next) location.hash = next;
      else mountEditor(root, found.id, hole, { roundId, back: `#/ronda/${roundId}` });
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
    await mountEditor(root, "", hole, {
      roundId, date: official.date, courseId: course.course_id,
      courseName: official.course || official.course_label || course.label || "",
      scoreHoles: official.holes || [],
      back: `#/ronda/${roundId}`,
    });
  }

  function picker() {
    return `<div class="card rc-pick"><div class="t">Cargar una vuelta ya jugada</div>
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
      list.innerHTML = (mine.reconstructions || []).map(r => `<a class="recon-entry" href="#/reconstruir/${esc(r.id)}"><span class="rt-mark">TRACK</span><b>${esc(r.date)} · ${esc(r.course || "Cancha")}</b><span class="recon-go" aria-hidden="true">›</span></a>`).join("");
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

  let VISIT = 0;

  function scorePar(rows, n) {
    const row = (rows || []).find(h => Array.isArray(h) ? Number(h[0]) === n : Number(h.hole || h.number) === n);
    if (!row) return null;
    return Array.isArray(row) ? row[1] : (row.par || null);
  }

  async function mountEditor(root, id, holeHint, pending) {
    const visit = ++VISIT;
    const mine = () => visit === VISIT && !!root.isConnected;
    document.documentElement.classList.remove("rc-map");
    root.innerHTML = `<div class="tk-host" id="rc-host"></div>`;
    const host = root.querySelector("#rc-host");
    let liveId = id || "";
    let courseId = pending?.courseId || "";
    let savedHole = 0;
    let courseName = pending?.courseName || "";
    let roundId = pending?.roundId || "";
    const back = pending?.back || (roundId ? `#/ronda/${roundId}` : "#/rondas");
    let holes = [];
    let shots = [];
    const fail = (message) => {
      document.documentElement.classList.remove("rc-map");
      host.innerHTML = `<div class="card"><p class="s">${esc(message)}</p><button type="button" class="btn" id="rc-close">Volver a la tarjeta</button></div>`;
      const b = host.querySelector("#rc-close");
      if (b) b.onclick = () => { location.hash = back; };
    };
    try {
      if (liveId) {
        const setup = await api("/api/reconstructions");
        const row = (setup.reconstructions || []).find(r => r.id === liveId);
        if (!mine()) return;
        if (row) {
          courseName = courseName || row.course || "";
          roundId = roundId || row.round_id || "";
          const kept = Number(row.current_hole);
          if (kept >= 1 && kept <= 18) savedHole = kept;
          if (!courseId && row.club_code && row.vm_course) {
            courseId = `${row.club_code}-${String(row.vm_course).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
          }
        }
      }
      if (courseId) {
        const geo = await api("/api/gps/courses/" + encodeURIComponent(courseId));
        if (!mine()) return;
        const raw = geo.course?.holes || [];
        holes = raw.map(h => {
          const n = Number(h.hole || h.number);
          return { ...h, hole: n, par: h.par || scorePar(pending?.scoreHoles, n) };
        });
        courseName = courseName || geo.course?.course || geo.course?.label || "";
      }
      if (liveId) {
        const pack = await api(`/api/reconstructions/${encodeURIComponent(liveId)}/shots`);
        if (!mine()) return;
        shots = pack.shots || [];
      }
    } catch (e) {
      if (!mine()) return;
      fail(e?.message || "No pudimos abrir el mapa.");
      return;
    }
    if (!mine()) return;
    if (!window.GolfletTrack) { fail("No se cargó el mapa."); return; }
    const explicit = Number(holeHint) >= 1 && Number(holeHint) <= 18 ? Number(holeHint) : 0;
    const hole = explicit || savedHole || 1;
    window.GolfletTrack.mount(host, {
      retro: true,
      id: liveId,
      back,
      live: { course: courseName || "Golflet", course_id: courseId, current_hole: hole },
      shots,
      holes,
      course: { holes, course: courseName, course_id: courseId },
      bag: CLUBS.map(c => ({ code: c })),
      api, esc, toast: () => {}, cid: () => "",
      onSave: async (shot) => {
        if (!mine()) return null;
        try {
          if (!liveId) {
            if (!pending?.courseId || !pending?.date || !pending?.roundId) throw new Error("Elegí la cancha.");
            const created = await api("/api/reconstructions", { method: "POST", body: JSON.stringify({ date: pending.date, course_id: pending.courseId, round_id: pending.roundId }) });
            if (!mine()) return null;
            liveId = created?.live_round?.id || "";
            if (!liveId) throw new Error("No pudimos abrir la vuelta.");
            if (!mine()) return null;
            const ronda = pending.roundId ? `&ronda=${encodeURIComponent(pending.roundId)}` : "";
            history.replaceState(null, "", `#/reconstruir/${liveId}?hole=${shot.hole}${ronda}`);
          }
          if (!mine()) return null;
          const body = {
            hole: shot.hole,
            club: shot.club || null,
            result: shot.result || null,
            penalty_strokes: shot.penalty ? 1 : 0,
            lat: shot.from?.lat ?? null,
            lng: shot.from?.lng ?? null,
            end_lat: shot.land?.lat ?? null,
            end_lng: shot.land?.lng ?? null,
          };
          const pack = await api(`/api/reconstructions/${encodeURIComponent(liveId)}/shots`, { method: "POST", body: JSON.stringify(body) });
          if (!mine()) return null;
          return pack.shots || [];
        } catch (e) {
          if (!mine()) return null;
          throw e;
        }
      },
      onUndo: async (shotId) => {
        if (!mine()) return null;
        await api(`/api/reconstructions/${encodeURIComponent(liveId)}/shots?shot=${encodeURIComponent(shotId)}`, { method: "DELETE" });
        if (!mine()) return null;
        const pack = await api(`/api/reconstructions/${encodeURIComponent(liveId)}/shots`);
        if (!mine()) return null;
        return pack.shots || [];
      },
    });
  }

  window.GolfletRecon = {
    init(deps) { if (deps?.api) api = deps.api; if (deps?.esc) esc = deps.esc; },
    open,
  };
})();
