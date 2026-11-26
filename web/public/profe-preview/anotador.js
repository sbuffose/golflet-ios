/* Anotador local. Coordenadas normalizadas de 0 a 1. El archivo no sale del aparato. */
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const COLORS = [["#3DDC97", "Verde"], ["#F5A524", "Naranja"], ["#C8102E", "Rojo"], ["#F5D90A", "Amarillo"], ["#FFFFFF", "Blanco"]];
  const TOOLS = [
    ["mover", "Mover"], ["encuadre", "Encuadre"], ["linea", "Línea"], ["libre", "Libre"], ["flecha", "Flecha"],
    ["elipse", "Elipse"], ["caja", "Caja"], ["angulo", "Ángulo"], ["cabeza", "Cabeza"], ["pies", "Pies"],
    ["objetivo", "Objetivo"], ["plano", "Plano"], ["vertical", "Vertical"], ["horizontal", "Horizontal"], ["texto", "Texto"],
  ];
  const NAME = Object.fromEntries(TOOLS);
  const cache = { a: blankPane("a"), b: blankPane("b") };

  function blankPane(side) {
    return {
      side, kind: "diagram", mode: "frente", frame: 4, blob: "", still: "", user: false, booted: false,
      keys: { address: 1, top: 11, impact: 17 }, fixed: { address: false, top: false, impact: false },
      view: { s: 1, x: 0, y: 0 }, prev: null,
    };
  }

  function uid() { return "m" + Math.random().toString(36).slice(2, 9); }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function svgEl(name, attrs) {
    const n = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs || {})) if (v != null) n.setAttribute(k, String(v));
    return n;
  }
  function norm(m) {
    return {
      id: m.id || uid(), tipo: m.tipo || "linea", pts: (m.pts || []).map(p => ({ x: Number(p.x) || 0, y: Number(p.y) || 0 })),
      color: m.color || "#C8102E", sw: Number(m.sw) || 3, texto: m.texto || "", pin: m.pin || "all",
      f0: m.f0 ?? 0, f1: m.f1 ?? 23, t0: m.t0 ?? 0, t1: m.t1 ?? 1e9, side: m.side || "a",
      grados: m.grados, media: m.media || "diagram",
    };
  }

  function mount(host, opts) {
    const panesSpec = opts.panes === 2 ? ["a", "b"] : ["a"];
    panesSpec.forEach(side => {
      const p = cache[side];
      const mode = side === "a" ? opts.modeA : opts.modeB;
      if (mode) p.mode = mode;
      if (!p.booted) {
        p.frame = p.mode === "atras" ? 16 : p.mode === "antes" ? 2 : 4;
        p.booted = true;
      }
      if (opts.blank) { if (!p.user) p.kind = "empty"; }
      else if (!p.user && (p.kind === "empty" || p.kind === "diagram")) p.kind = "diagram";
    });

    let marks = (opts.marks || []).map(norm);
    let tool = "linea";
    let color = "#C8102E";
    let sw = 3;
    let pinMode = "frame";
    let rate = 1;
    let syncOn = panesSpec.length === 2;
    let activeKey = "address";
    let playing = false;
    let playTimer = 0;
    let draft = null;
    let sel = null;
    let drag = null;
    let editBefore = null;
    let undo = [];
    let redo = [];
    let pick = null;
    let syncing = false;
    const built = [];

    host.innerHTML = "";
    const root = document.createElement("div");
    root.className = "anotador";
    const layout = panesSpec.length === 2 ? (opts.overlay ? "sobre" : "lado") : "uno";
    const panesEl = document.createElement("div");
    panesEl.className = "panes " + layout;
    root.append(panesEl);

    panesSpec.forEach((side, i) => {
      const data = cache[side];
      const pane = document.createElement("div");
      pane.className = "pane" + (i === 0 ? " active" : "");
      pane.dataset.side = side;
      pane.innerHTML = `<div class="stage"${i === 0 ? ` id="${opts.stageId || "stage"}"` : ""} data-kind="${data.kind}">
        <div class="world"><canvas class="media diagram"></canvas><video class="media video" playsinline preload="metadata"></video><img class="media image" alt="Archivo de este aparato"><svg class="ink" viewBox="0 0 1 1" preserveAspectRatio="none"></svg></div>
        <div class="loupe" hidden><canvas width="168" height="168"></canvas><span class="snap"></span></div>
        <div class="drop"><p>Elegí una foto o un video</p><p class="note">Queda en este aparato. No se sube.</p><button type="button" class="btn" data-open="${side}">Abrir archivo</button><p class="note">O soltalo acá.</p></div>
      </div>`;
      panesEl.append(pane);
      const stage = pane.querySelector(".stage");
      data.root = pane;
      data.stage = stage;
      data.world = stage.querySelector(".world");
      data.canvas = stage.querySelector("canvas.diagram");
      data.video = stage.querySelector("video");
      data.img = stage.querySelector("img");
      data.svg = stage.querySelector("svg");
      data.loupe = stage.querySelector(".loupe");
      data.drop = stage.querySelector(".drop");
      data.pointers = new Map();
      data.pinch = null;
      built.push(data);
    });

    const transport = document.createElement("div");
    transport.className = "transport";
    transport.innerHTML = `<div class="seg">
      <button type="button" data-step="-1">Anterior</button>
      <button type="button" data-step="1">Siguiente</button>
      <button type="button" data-speed="0.25">0.25</button>
      <button type="button" data-speed="0.5">0.5</button>
      <button type="button" data-speed="1">Normal</button>
      <button type="button" id="play">Reproducir</button>
      <button type="button" data-act="captura">Tomar cuadro</button>
      <button type="button" data-act="volver" hidden>Volver</button>
    </div>
    <label class="op scrub"><span id="reloj">Cuadro</span><input id="scrub" type="range" min="0" max="23" step="1" value="0"></label>
    <div class="seg zoom">
      <button type="button" data-act="acercar">Acercar</button>
      <button type="button" data-act="alejar">Alejar</button>
      <button type="button" data-act="ajustar">Ajustar</button>
    </div>
    ${built.length === 2 ? `<div class="seg keys">
      <button type="button" data-pick="a">Lado A</button>
      <button type="button" data-pick="b">Lado B</button>
      <button type="button" data-key="address">Address</button>
      <button type="button" data-key="top">Arriba</button>
      <button type="button" data-key="impact">Impacto</button>
      <button type="button" data-act="fijar">Fijar</button>
      <button type="button" data-act="sync" class="on">Sincronizar</button>
    </div>` : ""}
    ${opts.overlay ? `<label class="op">Opacidad <input id="op" type="range" min="0.15" max="0.9" step="0.05" value="${opts.opacity ?? 0.45}"></label>` : ""}`;

    const tray = document.createElement("div");
    tray.className = "tray";
    tray.innerHTML = `<div class="tools" role="group" aria-label="Dibujo">${TOOLS.map(([id, name]) => `<button type="button" data-tool="${id}" class="${id === "linea" ? "on" : ""}">${name}</button>`).join("")}</div>
      <div class="seg colors" role="group" aria-label="Color">${COLORS.map(([c, name]) => `<button type="button" class="swatch${c === color ? " on" : ""}" data-color="${c}" style="background:${c}" aria-label="${name}"></button>`).join("")}</div>
      <label class="op">Grosor <input id="grosor" type="range" min="2" max="8" step="1" value="3"></label>
      <div class="seg" role="group" aria-label="Duración">
        <button type="button" data-pin="frame" class="on">Este cuadro</button>
        <button type="button" data-pin="range">Tramo</button>
        <button type="button" data-pin="all">Todo</button>
      </div>
      <label class="fld" id="texto-box" hidden><span>Texto de la marca</span><input id="texto" type="text" maxlength="80"></label>
      <div class="seg">
        <button type="button" data-act="deshacer">Deshacer</button>
        <button type="button" data-act="rehacer">Rehacer</button>
        <button type="button" data-act="borrar">Borrar</button>
        <button type="button" data-act="limpiar">Limpiar</button>
        <button type="button" data-open="a">Abrir archivo</button>
      </div>
      <p class="note">Coordenadas de 0 a 1. Quedan en este aparato.</p>
      <button type="button" id="guardar" class="${opts.saveStyle === "chip" ? "" : "btn"}">Guardar marcas</button>`;

    const list = document.createElement("div");
    list.className = "marks";
    const input = document.createElement("input");
    input.id = "abrir";
    input.type = "file";
    input.accept = "image/*,video/*";
    input.hidden = true;
    root.append(transport, tray, list, input);
    host.append(root);

    const playBtn = transport.querySelector("#play");
    const scrub = transport.querySelector("#scrub");
    const reloj = transport.querySelector("#reloj");
    const saveBtn = tray.querySelector("#guardar");
    const textBox = tray.querySelector("#texto-box");
    const textInput = tray.querySelector("#texto");
    const volverBtn = transport.querySelector("[data-act=volver]");
    let opacity = opts.opacity ?? 0.45;
    let active = built[0];

    function say(t) { if (opts.toast) opts.toast(t); }
    function persist() { if (opts.persist) opts.persist(marks.map(m => ({ ...m, pts: m.pts.map(p => ({ x: p.x, y: p.y })) }))); }
    function checkpoint() { undo.push(JSON.stringify(marks)); if (undo.length > 60) undo.shift(); redo = []; }
    function selMark() { return marks.find(m => m.id === sel) || null; }

    function applyView(p) {
      const v = p.view;
      p.world.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.s})`;
      p.world.dataset.zoom = v.s.toFixed(2);
    }
    function zoomAt(p, clientX, clientY, factor) {
      const r = p.stage.getBoundingClientRect();
      const px = clientX - r.left;
      const py = clientY - r.top;
      const v = p.view;
      const ns = clamp(v.s * factor, 1, 8);
      const wx = (px - v.x) / v.s;
      const wy = (py - v.y) / v.s;
      v.s = ns;
      v.x = ns <= 1 ? 0 : px - wx * ns;
      v.y = ns <= 1 ? 0 : py - wy * ns;
      if (ns <= 1) v.s = 1;
      applyView(p);
    }
    function drawDiagram(p) {
      if (p.kind !== "diagram" || !opts.paint) return;
      const r = p.stage.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(2, Math.round(r.width * dpr));
      const h = Math.max(2, Math.round((r.height || r.width * 1.25) * dpr));
      if (p.canvas.width !== w || p.canvas.height !== h) { p.canvas.width = w; p.canvas.height = h; }
      opts.paint(p.canvas.getContext("2d"), w, h, p.frame, p.mode);
    }
    function applyMedia(p) {
      p.stage.dataset.kind = p.kind;
      p.canvas.hidden = p.kind !== "diagram";
      p.video.hidden = p.kind !== "video";
      p.img.hidden = p.kind !== "image";
      p.drop.hidden = p.kind !== "empty";
      if (p.kind === "video" && p.blob && p.video.src !== p.blob) p.video.src = p.blob;
      if (p.kind === "image") p.img.src = p.still || p.blob;
      if (p.kind === "diagram") requestAnimationFrame(() => drawDiagram(p));
      saveBtn.hidden = built.every(x => x.kind === "empty");
      if (volverBtn) volverBtn.hidden = !active.prev;
      applyView(p);
    }
    function useFile(p, file) {
      if (!file) return;
      if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) { say("Elegí una foto o un video"); return; }
      if (p.blob && p.blob.startsWith("blob:")) URL.revokeObjectURL(p.blob);
      p.blob = URL.createObjectURL(file);
      p.still = "";
      p.user = true;
      p.prev = null;
      p.kind = file.type.startsWith("video/") ? "video" : "image";
      if (p.kind === "video") {
        p.video.onloadedmetadata = () => {
          const d = p.video.duration || 1;
          if (!p.fixed.address) p.keys.address = d * 0.08;
          if (!p.fixed.top) p.keys.top = d * 0.42;
          if (!p.fixed.impact) p.keys.impact = d * 0.62;
          if (p.video.videoWidth) p.stage.style.aspectRatio = `${p.video.videoWidth} / ${p.video.videoHeight}`;
          updateScrub();
        };
      } else {
        p.img.onload = () => {
          if (p.img.naturalWidth) p.stage.style.aspectRatio = `${p.img.naturalWidth} / ${p.img.naturalHeight}`;
        };
      }
      applyMedia(p);
      say("Queda en este aparato. No se sube.");
      paintInk(p);
    }
    function unitNow(p) { return p.kind === "video" ? (p.video.currentTime || 0) : p.frame; }
    function setUnit(p, t) {
      if (p.kind === "video") {
        const d = p.video.duration || t;
        p.video.pause();
        p.video.currentTime = clamp(t, 0, d || t);
      } else if (p.kind === "diagram") {
        p.frame = clamp(Math.round(t), 0, 23);
        drawDiagram(p);
      }
    }
    function phase(p) {
      const k = p.keys;
      const t = unitNow(p);
      if (t <= k.top) return { leg: 0, u: (t - k.address) / (k.top - k.address || 1) };
      return { leg: 1, u: (t - k.top) / (k.impact - k.top || 1) };
    }
    function fromPhase(p, ph) {
      const k = p.keys;
      if (ph.leg === 0) return k.address + ph.u * (k.top - k.address);
      return k.top + ph.u * (k.impact - k.top);
    }
    function syncTo(src) {
      if (!syncOn || syncing || built.length < 2) return;
      const other = built.find(p => p !== src);
      if (!other || other.kind === "empty" || other.kind === "image") return;
      syncing = true;
      setUnit(other, fromPhase(other, phase(src)));
      syncing = false;
    }
    function stamp(p) {
      const now = p.kind === "video" ? (p.video.currentTime || 0) : p.frame;
      const endT = p.kind === "video" ? (p.video.duration || now) : 1e9;
      const endF = 23;
      if (p.kind === "image" || pinMode === "all" || tool === "cabeza") return { pin: "all", f0: 0, f1: endF, t0: 0, t1: 1e9, media: p.kind };
      if (pinMode === "range") return { pin: "range", f0: p.frame, f1: endF, t0: now, t1: endT, media: p.kind };
      return { pin: "frame", f0: p.frame, f1: p.frame, t0: now, t1: now, media: p.kind };
    }
    function visible(m, p) {
      if (m.side !== p.side || p.kind === "empty") return false;
      if (m.pin === "all" || p.kind === "image") return true;
      if (p.kind === "diagram") return p.frame >= m.f0 && p.frame <= m.f1;
      const t = p.video.currentTime || 0;
      return t >= m.t0 - 0.034 && t <= m.t1 + 0.034;
    }
    function eventPos(p, e, origin) {
      const r = p.svg.getBoundingClientRect();
      let q = { x: clamp((e.clientX - r.left) / (r.width || 1), 0, 1), y: clamp((e.clientY - r.top) / (r.height || 1), 0, 1) };
      const tx = 8 / (r.width || 1);
      const ty = 8 / (r.height || 1);
      if (origin) {
        if (Math.abs(q.y - origin.y) < ty && Math.abs(q.x - origin.x) >= tx) q = { x: q.x, y: origin.y, snap: "h" };
        else if (Math.abs(q.x - origin.x) < tx && Math.abs(q.y - origin.y) >= ty) q = { x: origin.x, y: q.y, snap: "v" };
      }
      for (const m of marks) {
        if (m.side !== p.side) continue;
        for (const pt of m.pts) {
          if (Math.abs(q.x - pt.x) < tx && Math.abs(q.y - pt.y) < ty) return { x: pt.x, y: pt.y, snap: q.snap || "p" };
        }
      }
      return q;
    }
    function far(p, a, b) {
      const r = p.svg.getBoundingClientRect();
      return Math.hypot((a.x - b.x) * r.width, (a.y - b.y) * r.height) >= 4;
    }
    function degrees(a, v, c) {
      const ux = a.x - v.x, uy = a.y - v.y, wx = c.x - v.x, wy = c.y - v.y;
      const du = Math.hypot(ux, uy), dw = Math.hypot(wx, wy);
      if (du < 1e-6 || dw < 1e-6) return 0;
      const cos = clamp((ux * wx + uy * wy) / (du * dw), -1, 1);
      return Math.round(Math.acos(cos) * 180 / Math.PI);
    }
    function pinText(m) {
      if (m.pin === "all") return "Todo el clip";
      if (m.media === "video") return m.pin === "range" ? `${m.t0.toFixed(2)}–${m.t1.toFixed(2)} s` : `${m.t0.toFixed(2)} s`;
      return m.pin === "range" ? `Cuadro ${m.f0}–${m.f1}` : `Cuadro ${m.f0}`;
    }
    function markLabel(m) {
      const p0 = m.pts[0];
      const xy = p0 ? `${p0.x.toFixed(2)}, ${p0.y.toFixed(2)}` : "";
      const deg = m.tipo === "angulo" && m.grados != null ? ` · ${m.grados}°` : "";
      return `${NAME[m.tipo] || m.tipo}${deg} · ${xy} · ${pinText(m)}`;
    }
    function renderList() {
      list.replaceChildren();
      if (!marks.length) {
        const n = document.createElement("p");
        n.className = "note";
        n.textContent = "Todavía no hay marcas.";
        list.append(n);
        return;
      }
      for (const m of marks.slice().reverse()) {
        const row = document.createElement("div");
        row.className = "mark";
        const span = document.createElement("span");
        span.textContent = markLabel(m);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.dataset.del = m.id;
        btn.textContent = "Quitar";
        row.append(span, btn);
        list.append(row);
      }
    }
    function highlight() {
      root.querySelectorAll("[data-tool]").forEach(b => b.classList.toggle("on", b.dataset.tool === tool));
      root.querySelectorAll("[data-color]").forEach(b => b.classList.toggle("on", b.dataset.color === color));
      root.querySelectorAll("[data-pin]").forEach(b => {
        b.classList.toggle("on", b.dataset.pin === pinMode);
        b.disabled = tool === "cabeza" && b.dataset.pin !== "all";
      });
      root.querySelectorAll("[data-speed]").forEach(b => b.classList.toggle("on", Number(b.dataset.speed) === rate));
      root.querySelectorAll("[data-key]").forEach(b => b.classList.toggle("on", b.dataset.key === activeKey));
      const syncBtn = root.querySelector("[data-act=sync]");
      if (syncBtn) syncBtn.classList.toggle("on", syncOn);
      const m = selMark();
      textBox.hidden = tool !== "texto" && !(m && m.tipo === "texto");
      if (m && m.tipo === "texto" && document.activeElement !== textInput) textInput.value = m.texto || "";
      if (volverBtn) volverBtn.hidden = !active.prev;
    }
    function updateScrub() {
      const p = active;
      if (p.kind === "diagram") { scrub.max = "23"; scrub.step = "1"; scrub.disabled = false; scrub.value = String(p.frame); reloj.textContent = "Cuadro " + p.frame; }
      else if (p.kind === "video") {
        const d = p.video.duration || 0;
        scrub.max = String(d || 1); scrub.step = "0.01"; scrub.disabled = !d; scrub.value = String(p.video.currentTime || 0);
        reloj.textContent = clock(p.video.currentTime || 0) + " / " + clock(d);
      } else { scrub.disabled = true; reloj.textContent = p.kind === "image" ? "Imagen" : "Sin archivo"; }
    }
    function clock(t) {
      if (!Number.isFinite(t)) return "0:00";
      const s = Math.floor(t % 60).toString().padStart(2, "0");
      return Math.floor(t / 60) + ":" + s;
    }
    function setActive(p) {
      active = p;
      built.forEach(x => {
        x.root.classList.toggle("active", x === p);
        x.root.style.zIndex = x === p ? "2" : "1";
      });
      if (built[1]) built[1].root.style.opacity = opts.overlay ? String(opacity) : "1";
      updateScrub();
      highlight();
    }
    function stopPlay() {
      playing = false;
      clearTimeout(playTimer);
      playBtn.textContent = "Reproducir";
      built.forEach(p => { if (p.kind === "video") { p.video.pause(); p.video.ontimeupdate = null; } });
    }
    function paintInk(p) {
      const svg = p.svg;
      while (svg.firstChild) svg.firstChild.remove();
      svg.append(svgEl("rect", { class: "pad", x: 0, y: 0, width: 1, height: 1, fill: "transparent" }));
      const rect = p.svg.getBoundingClientRect();
      const show = marks.filter(m => visible(m, p));
      const live = liveMark(p);
      if (live) show.push(live);
      for (const m of show) svg.append(drawMark(m, rect, tool === "mover"));
      if (tool === "mover" && sel) {
        const m = marks.find(x => x.id === sel && x.side === p.side);
        if (m && visible(m, p)) drawHandles(svg, m, rect);
      }
    }
    function liveMark(p) {
      if (!draft || draft.side !== p.side) return null;
      if (draft.tipo === "angulo" && draft.hover && draft.pts.length < 3) {
        const pts = draft.pts.concat([draft.hover]);
        const m = { ...draft, pts };
        if (pts.length === 3) m.grados = degrees(pts[0], pts[1], pts[2]);
        return m;
      }
      return draft;
    }
    function paintAll() { built.forEach(p => { if (p.kind === "diagram") drawDiagram(p); paintInk(p); }); updateScrub(); }

    function drawMark(m, rect, hit) {
      const g = svgEl("g", { "data-ann": m.id });
      g.style.pointerEvents = hit ? "auto" : "none";
      const ink = (el, attrs) => {
        g.append(svgEl(el, { ...attrs, stroke: "#0B2545", "stroke-width": (Number(attrs["stroke-width"]) || m.sw) + 2, "vector-effect": "non-scaling-stroke", fill: "none" }));
        g.append(svgEl(el, { ...attrs, stroke: m.color, "vector-effect": "non-scaling-stroke", "stroke-linecap": "round", "stroke-linejoin": "round" }));
      };
      const hitLine = (x1, y1, x2, y2) => g.append(svgEl("line", { x1, y1, x2, y2, stroke: "transparent", "stroke-width": 0.08, "stroke-linecap": "round" }));
      if (m.tipo === "libre" && m.pts.length > 1) {
        const points = m.pts.map(p => `${p.x},${p.y}`).join(" ");
        g.append(svgEl("polyline", { points, fill: "none", stroke: "transparent", "stroke-width": 0.08, "stroke-linejoin": "round", "stroke-linecap": "round" }));
        ink("polyline", { points, fill: "none", "stroke-width": m.sw });
      } else if (m.tipo === "elipse" || m.tipo === "cabeza") {
        const c0 = m.pts[0], e = m.pts[1] || c0;
        const rx = Math.max(0.01, Math.abs(e.x - c0.x)), ry = Math.max(0.01, Math.abs(e.y - c0.y));
        g.append(svgEl("ellipse", { cx: c0.x, cy: c0.y, rx, ry, fill: "transparent", stroke: "transparent", "stroke-width": 0.06 }));
        ink("ellipse", { cx: c0.x, cy: c0.y, rx, ry, fill: "none", "stroke-width": m.sw });
        if (m.tipo === "cabeza") {
          const hx = 8 / (rect.width || 1), hy = 8 / (rect.height || 1);
          ink("line", { x1: c0.x - hx, y1: c0.y, x2: c0.x + hx, y2: c0.y, "stroke-width": m.sw });
          ink("line", { x1: c0.x, y1: c0.y - hy, x2: c0.x, y2: c0.y + hy, "stroke-width": m.sw });
        }
      } else if (m.tipo === "caja") {
        const a = m.pts[0], b = m.pts[1] || a;
        const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.max(0.01, Math.abs(b.x - a.x)), h = Math.max(0.01, Math.abs(b.y - a.y));
        g.append(svgEl("rect", { x, y, width: w, height: h, fill: "transparent", stroke: "transparent", "stroke-width": 0.06 }));
        ink("rect", { x, y, width: w, height: h, fill: "none", "stroke-width": m.sw });
      } else if (m.tipo === "vertical") {
        const x = m.pts[0].x;
        hitLine(x, 0, x, 1);
        ink("line", { x1: x, y1: 0, x2: x, y2: 1, "stroke-width": m.sw });
      } else if (m.tipo === "horizontal") {
        const y = m.pts[0].y;
        hitLine(0, y, 1, y);
        ink("line", { x1: 0, y1: y, x2: 1, y2: y, "stroke-width": m.sw });
      } else if (m.tipo === "texto") {
        const t = svgEl("text", { x: m.pts[0].x, y: m.pts[0].y, fill: m.color, "font-size": 0.045, "font-family": "Geist, sans-serif", "font-weight": 600, "font-style": "normal", "dominant-baseline": "hanging" });
        t.setAttribute("paint-order", "stroke");
        t.setAttribute("stroke", "#0B2545");
        t.setAttribute("stroke-width", "3px");
        t.textContent = m.texto || "Nota";
        g.append(t);
      } else if (m.tipo === "angulo") {
        const pts = m.pts;
        if (pts.length >= 2) { hitLine(pts[0].x, pts[0].y, pts[1].x, pts[1].y); ink("line", { x1: pts[0].x, y1: pts[0].y, x2: pts[1].x, y2: pts[1].y, "stroke-width": m.sw }); }
        if (pts.length === 3) {
          hitLine(pts[1].x, pts[1].y, pts[2].x, pts[2].y);
          ink("line", { x1: pts[1].x, y1: pts[1].y, x2: pts[2].x, y2: pts[2].y, "stroke-width": m.sw });
          const path = arcPath(pts[1], pts[0], pts[2], 28, rect);
          if (path) ink("path", { d: path, fill: "none", "stroke-width": m.sw });
          const deg = m.grados != null ? m.grados : degrees(pts[0], pts[1], pts[2]);
          const t = svgEl("text", { x: pts[1].x + 0.02, y: pts[1].y - 0.02, fill: m.color, "font-size": 0.05, "font-family": "Geist, sans-serif", "font-weight": 600, "font-style": "normal" });
          t.textContent = deg + "°";
          g.append(t);
        }
      } else if (m.pts.length >= 2) {
        const a = m.pts[0], b = m.pts[1];
        hitLine(a.x, a.y, b.x, b.y);
        ink("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, "stroke-width": m.sw });
        if (m.tipo === "flecha" || m.tipo === "objetivo") arrow(g, a, b, m, rect);
        if (m.tipo === "pies" || m.tipo === "objetivo" || m.tipo === "plano") {
          const t = svgEl("text", { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 0.03, fill: m.color, "font-size": 0.04, "font-family": "Geist, sans-serif", "font-weight": 600, "font-style": "normal" });
          t.textContent = NAME[m.tipo];
          g.append(t);
        }
      }
      return g;
    }
    function arrow(g, a, b, m, rect) {
      const ang = Math.atan2((b.y - a.y) * rect.height, (b.x - a.x) * rect.width);
      const px = b.x * rect.width, py = b.y * rect.height;
      const tip = (d) => ({ x: (px - 14 * Math.cos(ang + d)) / rect.width, y: (py - 14 * Math.sin(ang + d)) / rect.height });
      const p1 = tip(-0.45), p2 = tip(0.45);
      g.append(svgEl("line", { x1: b.x, y1: b.y, x2: p1.x, y2: p1.y, stroke: m.color, "stroke-width": m.sw, "vector-effect": "non-scaling-stroke", "stroke-linecap": "round" }));
      g.append(svgEl("line", { x1: b.x, y1: b.y, x2: p2.x, y2: p2.y, stroke: m.color, "stroke-width": m.sw, "vector-effect": "non-scaling-stroke", "stroke-linecap": "round" }));
    }
    function arcPath(v, a, c, rPx, rect) {
      const vx = v.x * rect.width, vy = v.y * rect.height;
      const a1 = Math.atan2(a.y * rect.height - vy, a.x * rect.width - vx);
      const a2 = Math.atan2(c.y * rect.height - vy, c.x * rect.width - vx);
      let d = a2 - a1;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const sweep = d > 0 ? 1 : 0;
      const p1x = (vx + Math.cos(a1) * rPx) / rect.width;
      const p1y = (vy + Math.sin(a1) * rPx) / rect.height;
      const p2x = (vx + Math.cos(a2) * rPx) / rect.width;
      const p2y = (vy + Math.sin(a2) * rPx) / rect.height;
      return `M ${p1x} ${p1y} A ${rPx / rect.width} ${rPx / rect.height} 0 0 ${sweep} ${p2x} ${p2y}`;
    }
    function drawHandles(svg, m, rect) {
      const ix = m.tipo === "libre" ? libreHandles(m.pts.length) : m.pts.map((_, i) => i);
      for (const i of ix) {
        const p = m.pts[i];
        const h = svgEl("ellipse", {
          cx: p.x, cy: p.y, rx: 7 / (rect.width || 1), ry: 7 / (rect.height || 1),
          fill: "#FFFFFF", stroke: "#0B2545", "stroke-width": 2, "vector-effect": "non-scaling-stroke",
          "data-h": i, "data-ann": m.id,
        });
        svg.append(h);
      }
    }
    function libreHandles(n) {
      const ix = [0];
      for (let i = 5; i < n - 1; i += 5) ix.push(i);
      if (n > 1) ix.push(n - 1);
      return ix;
    }
    function showLoupe(p, e, pt) {
      if (tool === "mover" || tool === "encuadre" || p.kind === "empty") { p.loupe.hidden = true; return; }
      p.loupe.hidden = false;
      const r = p.stage.getBoundingClientRect();
      const size = 132;
      let x = e.clientX - r.left - size - 16;
      let y = e.clientY - r.top - size - 16;
      if (x < 8) x = e.clientX - r.left + 20;
      if (y < 8) y = e.clientY - r.top + 20;
      p.loupe.style.left = x + "px";
      p.loupe.style.top = y + "px";
      const src = p.kind === "video" ? p.video : p.kind === "image" ? p.img : p.canvas;
      const ctx = p.loupe.querySelector("canvas").getContext("2d");
      const cw = 168, ch = 168, z = 3, sw = cw / z, sh = ch / z;
      const mw = src.videoWidth || src.naturalWidth || src.width || 1;
      const mh = src.videoHeight || src.naturalHeight || src.height || 1;
      ctx.fillStyle = "#0B2545";
      ctx.fillRect(0, 0, cw, ch);
      try { ctx.drawImage(src, pt.x * mw - sw / 2, pt.y * mh - sh / 2, sw, sh, 0, 0, cw, ch); } catch { /* el cuadro todavía no está */ }
      ctx.strokeStyle = "#C8A86A";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cw / 2, 0); ctx.lineTo(cw / 2, ch);
      ctx.moveTo(0, ch / 2); ctx.lineTo(cw, ch / 2);
      ctx.stroke();
      p.loupe.querySelector(".snap").textContent = pt.snap === "h" ? "Horizontal" : pt.snap === "v" ? "Vertical" : pt.snap === "c" ? "Círculo" : "";
    }
    function hideLoupes() { built.forEach(p => { p.loupe.hidden = true; }); }

    function startDraft(p, pt) {
      if (p.kind === "empty") return;
      const base = { id: uid(), tipo: tool, side: p.side, color, sw, texto: textInput.value || "Nota", pts: [], ...stamp(p) };
      if (tool === "angulo") {
        if (!draft || draft.tipo !== "angulo" || draft.side !== p.side || draft.pts.length >= 3) draft = { ...base, pts: [pt] };
        else { draft.pts.push(pt); if (draft.pts.length === 3) finishDraft(p); }
        paintInk(p);
        return;
      }
      if (tool === "vertical") draft = { ...base, pts: [{ x: pt.x, y: 0.5 }] };
      else if (tool === "horizontal") draft = { ...base, pts: [{ x: 0.5, y: pt.y }] };
      else if (tool === "texto") draft = { ...base, pts: [pt] };
      else if (tool === "libre") draft = { ...base, pts: [pt] };
      else draft = { ...base, pts: [pt, { ...pt }] };
      paintInk(p);
    }
    function finishDraft(p) {
      if (!draft) return;
      if (draft.tipo === "angulo" && draft.pts.length === 3) draft.grados = degrees(draft.pts[0], draft.pts[1], draft.pts[2]);
      if ((draft.tipo === "linea" || draft.tipo === "flecha" || draft.tipo === "elipse" || draft.tipo === "cabeza" || draft.tipo === "caja" || draft.tipo === "pies" || draft.tipo === "objetivo" || draft.tipo === "plano") && draft.pts[1] && !far(p, draft.pts[0], draft.pts[1])) {
        draft = null; paintInk(p); return;
      }
      if (draft.tipo === "libre" && draft.pts.length < 2) { draft = null; paintInk(p); return; }
      checkpoint();
      marks.push(draft);
      sel = draft.id;
      draft = null;
      persist();
      renderList();
      paintAll();
      highlight();
    }
    function beginEdit() { editBefore = JSON.stringify(marks); }
    function endEdit() {
      const now = JSON.stringify(marks);
      if (editBefore && editBefore !== now) { undo.push(editBefore); redo = []; persist(); renderList(); }
      editBefore = null;
    }
    function onDown(e, p) {
      if (e.target.closest("button, a, input, label")) return;
      p.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { p.stage.setPointerCapture(e.pointerId); } catch { /* el puntero ya no está */ }
      if (p.pointers.size >= 2) { draft = null; return; }
      setActive(p);
      const pt = eventPos(p, e);
      if (tool === "encuadre") { drag = { kind: "pan", x: e.clientX, y: e.clientY, ox: p.view.x, oy: p.view.y }; return; }
      if (tool === "mover") {
        const h = e.target.closest("[data-h]");
        const ann = e.target.closest("[data-ann]");
        if (h) {
          const m = marks.find(x => x.id === h.dataset.ann);
          sel = m ? m.id : null;
          beginEdit();
          drag = { kind: "handle", id: h.dataset.ann, i: Number(h.dataset.h), origin: m ? m.pts.map(q => ({ ...q })) : [] };
        } else if (ann) {
          const m = marks.find(x => x.id === ann.dataset.ann);
          sel = m ? m.id : null;
          beginEdit();
          drag = { kind: "move", id: ann.dataset.ann, x: pt.x, y: pt.y, origin: m ? m.pts.map(q => ({ ...q })) : [] };
          if (m && m.tipo === "texto") textInput.value = m.texto || "";
        } else sel = null;
        highlight();
        paintInk(p);
        return;
      }
      const origin = draft && draft.side === p.side && draft.pts.length ? draft.pts[draft.pts.length - 1] : null;
      startDraft(p, tool === "angulo" ? eventPos(p, e, origin) : pt);
      showLoupe(p, e, pt);
    }
    function onMove(e, p) {
      const prev = p.pointers.get(e.pointerId);
      if (prev) p.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (p.pointers.size >= 2) { pinch(p); return; }
      if (drag && drag.kind === "pan") {
        p.view.x = drag.ox + (e.clientX - drag.x);
        p.view.y = drag.oy + (e.clientY - drag.y);
        applyView(p);
        return;
      }
      const origin = drag && drag.kind === "handle" ? null : (draft && draft.pts[0] && draft.tipo !== "angulo" ? draft.pts[0] : null);
      let pt = eventPos(p, e, origin);
      if (drag && (drag.kind === "move" || drag.kind === "handle")) {
        const m = marks.find(x => x.id === drag.id);
        if (!m) return;
        if (drag.kind === "handle") moveHandle(m, drag, pt);
        else moveBody(m, drag, pt);
        if (m.tipo === "angulo" && m.pts.length === 3) m.grados = degrees(m.pts[0], m.pts[1], m.pts[2]);
        paintInk(p);
        showLoupe(p, e, pt);
        return;
      }
      if (!draft || draft.side !== p.side) return;
      if (draft.tipo === "angulo") { draft.hover = eventPos(p, e, draft.pts[draft.pts.length - 1]); pt = draft.hover; }
      else if (draft.tipo === "libre") { const last = draft.pts[draft.pts.length - 1]; if (!last || far(p, last, pt)) draft.pts.push(pt); }
      else if (draft.tipo === "vertical") draft.pts[0] = { x: pt.x, y: 0.5, snap: pt.snap };
      else if (draft.tipo === "horizontal") draft.pts[0] = { x: 0.5, y: pt.y, snap: pt.snap };
      else if (draft.tipo === "texto") draft.pts[0] = pt;
      else if (draft.pts[1]) {
        if ((draft.tipo === "elipse" || draft.tipo === "cabeza" || draft.tipo === "caja") && draft.pts[0]) {
          const dx = pt.x - draft.pts[0].x, dy = pt.y - draft.pts[0].y;
          if (Math.abs(Math.abs(dx) - Math.abs(dy)) < 0.03) {
            const s = (Math.abs(dx) + Math.abs(dy)) / 2 || 0.01;
            pt = { x: draft.pts[0].x + Math.sign(dx || 1) * s, y: draft.pts[0].y + Math.sign(dy || 1) * s, snap: "c" };
          }
        }
        draft.pts[1] = pt;
        draft.snap = pt.snap;
      }
      paintInk(p);
      showLoupe(p, e, pt);
    }
    function moveHandle(m, d, pt) {
      const o = d.origin.map(q => ({ ...q }));
      if ((m.tipo === "elipse" || m.tipo === "cabeza") && d.i === 0) {
        const dx = pt.x - o[0].x, dy = pt.y - o[0].y;
        m.pts[0] = { x: clamp(o[0].x + dx, 0, 1), y: clamp(o[0].y + dy, 0, 1) };
        if (o[1]) m.pts[1] = { x: clamp(o[1].x + dx, 0, 1), y: clamp(o[1].y + dy, 0, 1) };
      } else if (m.tipo === "vertical") m.pts[0] = { x: pt.x, y: 0.5 };
      else if (m.tipo === "horizontal") m.pts[0] = { x: 0.5, y: pt.y };
      else m.pts[d.i] = { x: pt.x, y: pt.y };
    }
    function moveBody(m, d, pt) {
      const dx = pt.x - d.x, dy = pt.y - d.y;
      m.pts = d.origin.map(q => {
        if (m.tipo === "vertical") return { x: clamp(q.x + dx, 0, 1), y: q.y };
        if (m.tipo === "horizontal") return { x: q.x, y: clamp(q.y + dy, 0, 1) };
        return { x: clamp(q.x + dx, 0, 1), y: clamp(q.y + dy, 0, 1) };
      });
    }
    function pinch(p) {
      const pts = [...p.pointers.values()];
      if (pts.length < 2) return;
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      if (!p.pinch) { p.pinch = { dist, mid }; return; }
      zoomAt(p, mid.x, mid.y, dist / p.pinch.dist);
      p.view.x += mid.x - p.pinch.mid.x;
      p.view.y += mid.y - p.pinch.mid.y;
      applyView(p);
      p.pinch = { dist, mid };
    }
    function onUp(e, p) {
      p.pointers.delete(e.pointerId);
      if (p.pointers.size < 2) p.pinch = null;
      hideLoupes();
      if (drag) { endEdit(); drag = null; paintAll(); return; }
      if (!draft || draft.tipo === "angulo") return;
      finishDraft(p);
    }

    built.forEach(p => {
      applyMedia(p);
      p.stage.addEventListener("pointerdown", e => onDown(e, p));
      p.stage.addEventListener("pointermove", e => onMove(e, p));
      p.stage.addEventListener("pointerup", e => onUp(e, p));
      p.stage.addEventListener("pointercancel", e => onUp(e, p));
      p.stage.addEventListener("wheel", e => { e.preventDefault(); zoomAt(p, e.clientX, e.clientY, e.deltaY < 0 ? 1.08 : 1 / 1.08); }, { passive: false });
      p.stage.addEventListener("dragover", e => { e.preventDefault(); p.stage.classList.add("over"); });
      p.stage.addEventListener("dragleave", () => p.stage.classList.remove("over"));
      p.stage.addEventListener("drop", e => { e.preventDefault(); p.stage.classList.remove("over"); useFile(p, e.dataTransfer.files && e.dataTransfer.files[0]); });
      p.video.addEventListener("seeked", () => { paintInk(p); updateScrub(); });
    });

    function step(dir) {
      stopPlay();
      const p = active;
      if (p.kind === "video") setUnit(p, (p.video.currentTime || 0) + dir / 30);
      else if (p.kind === "diagram") setUnit(p, (p.frame + dir + 24) % 24);
      if (syncOn) syncTo(p);
      paintAll();
    }
    function togglePlay() {
      if (playing) { stopPlay(); return; }
      const p = active;
      if (p.kind !== "video" && p.kind !== "diagram") return;
      playing = true;
      playBtn.textContent = "Pausa";
      if (p.kind === "video") {
        p.video.playbackRate = rate;
        p.video.play();
        p.video.ontimeupdate = () => {
          if (syncOn) syncTo(p);
          built.forEach(paintInk);
          updateScrub();
          if (p.video.ended) stopPlay();
        };
      } else {
        const loop = () => {
          if (!playing) return;
          p.frame = (p.frame + 1) % 24;
          if (syncOn) syncTo(p);
          paintAll();
          playTimer = setTimeout(loop, 1000 / (12 * rate));
        };
        loop();
      }
    }
    function capture() {
      const p = active;
      if (p.kind !== "video" && p.kind !== "diagram") return;
      const src = p.kind === "video" ? p.video : p.canvas;
      const w = src.videoWidth || src.width, h = src.videoHeight || src.height;
      if (!w || !h) return;
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(src, 0, 0, w, h);
      p.prev = { kind: p.kind, frame: p.frame, mode: p.mode };
      p.still = c.toDataURL("image/png");
      p.kind = "image";
      applyMedia(p);
      paintInk(p);
      updateScrub();
      highlight();
      say("Cuadro tomado. Queda en este aparato.");
    }
    function restore() {
      const p = active;
      if (!p.prev) return;
      p.kind = p.prev.kind;
      p.frame = p.prev.frame;
      p.still = "";
      p.prev = null;
      applyMedia(p);
      paintAll();
      highlight();
    }
    function undoDo() {
      if (!undo.length) return;
      redo.push(JSON.stringify(marks));
      marks = JSON.parse(undo.pop());
      sel = null; draft = null;
      persist(); renderList(); paintAll();
    }
    function redoDo() {
      if (!redo.length) return;
      undo.push(JSON.stringify(marks));
      marks = JSON.parse(redo.pop());
      persist(); renderList(); paintAll();
    }
    function removeSel() {
      if (!sel) return;
      checkpoint();
      marks = marks.filter(m => m.id !== sel);
      sel = null;
      persist(); renderList(); paintAll();
    }

    root.addEventListener("click", e => {
      const open = e.target.closest("[data-open]");
      if (open) { pick = built.find(p => p.side === open.dataset.open) || active; input.click(); return; }
      if (e.target.closest(".stage")) return;
      const tbtn = e.target.closest("[data-tool]");
      if (tbtn) {
        tool = tbtn.dataset.tool;
        if (tool === "cabeza") pinMode = "all";
        draft = null;
        highlight();
        paintAll();
        return;
      }
      const cbtn = e.target.closest("[data-color]");
      if (cbtn) { color = cbtn.dataset.color; const m = selMark(); if (m && tool === "mover") { checkpoint(); m.color = color; persist(); paintAll(); } highlight(); return; }
      const pbtn = e.target.closest("[data-pin]");
      if (pbtn && !pbtn.disabled) { pinMode = pbtn.dataset.pin; highlight(); return; }
      const speed = e.target.closest("[data-speed]");
      if (speed) { rate = Number(speed.dataset.speed); built.forEach(p => { if (p.kind === "video") p.video.playbackRate = rate; }); highlight(); return; }
      const st = e.target.closest("[data-step]");
      if (st) { step(Number(st.dataset.step)); return; }
      if (e.target.id === "play") { togglePlay(); return; }
      const act = e.target.closest("[data-act]");
      if (act) {
        const k = act.dataset.act;
        if (k === "captura") capture();
        else if (k === "volver") restore();
        else if (k === "acercar" || k === "alejar") {
          const r = active.stage.getBoundingClientRect();
          zoomAt(active, r.left + r.width / 2, r.top + r.height / 2, k === "acercar" ? 1.25 : 0.8);
        } else if (k === "ajustar") { active.view = { s: 1, x: 0, y: 0 }; applyView(active); }
        else if (k === "deshacer") undoDo();
        else if (k === "rehacer") redoDo();
        else if (k === "borrar") removeSel();
        else if (k === "limpiar") { checkpoint(); marks = marks.filter(m => m.side !== active.side); sel = null; persist(); renderList(); paintAll(); }
        else if (k === "sync") { syncOn = !syncOn; highlight(); }
        else if (k === "fijar") {
          if (active.kind === "diagram" || active.kind === "video") {
            active.keys[activeKey] = unitNow(active);
            active.fixed[activeKey] = true;
            say((activeKey === "address" ? "Address" : activeKey === "top" ? "Arriba" : "Impacto") + " fijado");
          }
        }
        return;
      }
      const key = e.target.closest("[data-key]");
      if (key) {
        activeKey = key.dataset.key;
        stopPlay();
        built.forEach(p => { if (p.kind === "diagram" || p.kind === "video") setUnit(p, p.keys[activeKey]); });
        highlight();
        paintAll();
        return;
      }
      const pickBtn = e.target.closest("[data-pick]");
      if (pickBtn) { setActive(built.find(p => p.side === pickBtn.dataset.pick) || active); return; }
      const del = e.target.closest("[data-del]");
      if (del) { checkpoint(); marks = marks.filter(m => m.id !== del.dataset.del); if (sel === del.dataset.del) sel = null; persist(); renderList(); paintAll(); }
    });
    input.addEventListener("change", () => {
      const f = input.files && input.files[0];
      useFile(pick || active, f);
      input.value = "";
    });
    tray.querySelector("#grosor").addEventListener("input", e => {
      sw = Number(e.target.value);
      const m = selMark();
      if (m && tool === "mover") { m.sw = sw; persist(); paintAll(); }
    });
    textInput.addEventListener("input", () => {
      const m = selMark();
      if (m && m.tipo === "texto") { m.texto = textInput.value; persist(); paintAll(); renderList(); }
    });
    const op = transport.querySelector("#op");
    if (op) op.addEventListener("input", () => { opacity = Number(op.value); if (built[1]) built[1].root.style.opacity = String(opacity); });

    function onKey(e) {
      if (e.target.matches("input, textarea")) return;
      if (!host.isConnected) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redoDo(); else undoDo(); }
      else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeSel(); }
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === " ") { e.preventDefault(); togglePlay(); }
    }
    document.addEventListener("keydown", onKey);
    const ro = new ResizeObserver(() => built.forEach(p => { if (p.kind === "diagram") drawDiagram(p); }));
    built.forEach(p => ro.observe(p.stage));
    const onResize = () => document.getElementById("app").classList.toggle("desk", window.innerWidth >= 900);
    window.addEventListener("resize", onResize);
    onResize();

    setActive(built[0]);
    renderList();
    requestAnimationFrame(() => paintAll());

    return {
      destroy() {
        stopPlay();
        ro.disconnect();
        document.removeEventListener("keydown", onKey);
        window.removeEventListener("resize", onResize);
        const app = document.getElementById("app");
        if (app) app.classList.remove("desk");
      },
    };
  }

  window.GolfletAnotador = { mount };
})();
