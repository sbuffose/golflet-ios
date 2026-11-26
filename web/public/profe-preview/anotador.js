/* Anotador local. Coordenadas de 0 a 1. Geometría en píxeles del medio. El archivo no sale del aparato. */
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const COLORS = [["#3DDC97", "Verde"], ["#F5A524", "Naranja"], ["#C8102E", "Rojo"], ["#F5D90A", "Amarillo"], ["#FFFFFF", "Blanco"]];
  const TOOLS = [
    ["mover", "Mover"], ["encuadre", "Marco"], ["linea", "Línea"], ["libre", "Libre"], ["flecha", "Flecha"],
    ["elipse", "Elipse"], ["caja", "Caja"], ["angulo", "Ángulo"], ["cabeza", "Cabeza"], ["pies", "Pies"],
    ["objetivo", "Objetivo"], ["plano", "Plano"], ["vertical", "V"], ["horizontal", "H"], ["texto", "Texto"],
  ];
  const HUMAN = {
    linea: "Línea", libre: "Línea libre", flecha: "Flecha", elipse: "Elipse", caja: "Caja",
    angulo: "Ángulo", cabeza: "Cabeza", pies: "Línea de pies", objetivo: "Línea de objetivo",
    plano: "Plano del palo", vertical: "Vertical", horizontal: "Horizontal", texto: "Texto",
  };
  const ICO = {
    mover: "M12 3v18M3 12h18M12 3l-2.2 2.2M12 3l2.2 2.2M12 21l-2.2-2.2M12 21l2.2-2.2M3 12l2.2-2.2M3 12l2.2 2.2M21 12l-2.2-2.2M21 12l-2.2 2.2",
    encuadre: "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5",
    linea: "M5 19L19 5",
    libre: "M4 16c3-7 5-7 8 0s5 7 8 0",
    flecha: "M5 19L19 5M19 5h-6M19 5v6",
    elipse: "M12 5a7 7 0 1 0 0.1 0",
    caja: "M5 6h14v12H5z",
    angulo: "M5 19L12 5L19 16",
    cabeza: "M12 12m-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0M12 9v6M9 12h6",
    pies: "M4 16h16M7 16v3M17 16v3",
    objetivo: "M4 18L18 8M18 8h-5M18 8v5",
    plano: "M5 19L19 7",
    vertical: "M12 3v18",
    horizontal: "M3 12h18",
    texto: "M6 6h12M12 6v12",
  };
  const GROUP_START = { mover: 1, linea: 1, elipse: 1, angulo: 1, cabeza: 1, texto: 1 };
  const cache = { a: blankPane("a"), b: blankPane("b") };

  function blankPane(side) {
    return {
      side, kind: "diagram", mode: "frente", frame: 4, blob: "", still: "", user: false, booted: false, fps: 30,
      keys: { address: null, top: null, impact: null }, fixed: { address: false, top: false, impact: false },
      view: { s: 1, x: 0, y: 0 }, prev: null, cuts: [], scanToken: 0,
    };
  }

  function uid() { return "m" + Math.random().toString(36).slice(2, 9); }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function svgEl(name, attrs) {
    const n = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs || {})) if (v != null) n.setAttribute(k, String(v));
    return n;
  }
  function ico(id) {
    return `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="${ICO[id] || ""}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  function norm(m) {
    return {
      id: m.id || uid(), tipo: m.tipo || "linea", pts: (m.pts || []).map(p => ({ x: Number(p.x) || 0, y: Number(p.y) || 0 })),
      color: m.color || "#C8102E", sw: Number(m.sw) || 3, texto: m.texto || "", etiqueta: !!m.etiqueta, snap: m.snap || "",
      pin: m.pin || "frame", f0: m.f0 ?? 0, f1: m.f1 ?? m.f0 ?? 0, t0: m.t0 ?? 0, t1: m.t1 ?? m.t0 ?? 0,
      side: m.side || "a", grados: m.grados, media: m.media || "diagram", auto: !!m.auto,
    };
  }

  function mount(host, opts) {
    const panesSpec = opts.panes === 2 ? ["a", "b"] : ["a"];
    let holdSide = "a";
    panesSpec.forEach(side => {
      const p = cache[side];
      if (p.root && p.root.classList.contains("active")) holdSide = side;
      if (p.video && p.kind === "video" && Number.isFinite(p.video.currentTime)) p.holdTime = p.video.currentTime;
      if (p.kind === "video" && p.blob && !p.scanned) p.scanToken = (p.scanToken || 0) + 1;
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
    let labelOn = false;
    let rate = 1;
    let syncOn = false;
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
    let menu = null;
    let menuOpen = false;
    let pinOpen = false;
    let tapAt = 0;
    let tapSide = "";
    let tapX = 0;
    let tapY = 0;
    const built = [];

    host.innerHTML = "";
    const root = document.createElement("div");
    root.className = "anotador";
    const stack = document.createElement("div");
    stack.className = "stack";
    const layout = panesSpec.length === 2 ? (opts.overlay ? "sobre" : "lado") : "uno";
    const panesEl = document.createElement("div");
    panesEl.className = "panes " + layout;
    stack.append(panesEl);
    root.append(stack);

    panesSpec.forEach((side, i) => {
      const data = cache[side];
      const pane = document.createElement("div");
      pane.className = "pane" + (i === 0 ? " active" : "");
      pane.dataset.side = side;
      const stageId = i === 0 ? (opts.stageId || "stage") : "lado-b";
      pane.innerHTML = `<div class="stage" id="${stageId}" data-kind="${data.kind}">
        <div class="fit"><div class="world"><canvas class="media diagram"></canvas><video class="media video" playsinline preload="metadata"></video><img class="media image" alt=""><svg class="ink" viewBox="0 0 100 100" preserveAspectRatio="none"></svg></div></div>
        <div class="loupe" hidden><canvas width="168" height="168"></canvas><span class="snap"></span></div>
        <div class="drop"><p>Elegí una foto o un video</p><p class="note">Queda en este aparato. No se sube.</p><button type="button" class="btn" data-open="${side}">Abrir archivo</button><p class="note">O soltalo acá.</p></div>
      </div>${panesSpec.length === 2 ? `<div class="sidebar"><button type="button" data-side-step="-1" aria-label="Cuadro anterior">−</button><button type="button" class="sideclock" data-act="solo" aria-label="Ver este lado"></button><button type="button" data-side-step="1" aria-label="Cuadro siguiente">+</button></div>` : ""}`;
      panesEl.append(pane);
      const stage = pane.querySelector(".stage");
      data.root = pane;
      data.stage = stage;
      data.fit = stage.querySelector(".fit");
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

    const two = built.length === 2;
    const vista = opts.vista === "sobre" ? "sobre" : "lado";
    const compareMode = opts.compare || "antes";
    const pinButtons = (hidden) => `<div class="seg pins"${hidden ? " hidden" : ""} role="group" aria-label="Duración">
      <button type="button" data-pin="frame" class="on">Este cuadro</button>
      <button type="button" data-pin="range">Tramo</button>
      <button type="button" data-pin="all">Todo</button>
    </div>`;
    const keyButtons = `<div class="seg keys">
      <button type="button" data-open="a">Abrir A</button>
      <button type="button" data-open="b">Abrir B</button>
      <button type="button" data-act="marcar" data-key="address">Marcar address</button>
      <button type="button" data-act="marcar" data-key="top">Marcar arriba</button>
      <button type="button" data-act="marcar" data-key="impact">Marcar impacto</button>
      <button type="button" data-act="ir" data-key="address" hidden>Address</button>
      <button type="button" data-act="ir" data-key="top" hidden>Arriba</button>
      <button type="button" data-act="ir" data-key="impact" hidden>Impacto</button>
      <button type="button" data-act="sync">Sincronizar</button>
    </div>`;
    if (two) {
      const top = document.createElement("div");
      top.className = "topbar";
      top.innerHTML = `<span class="mode-now">${vista === "sobre" ? "Superpuesto" : "Lado a lado"}</span>
        <button type="button" data-pick="a">A</button>
        <button type="button" data-pick="b">B</button>
        <button type="button" data-act="juntos" hidden>Los dos</button>
        <button type="button" data-act="menu" aria-expanded="false">Más</button>
        ${opts.overlay ? `<label class="op top-op">Opacidad <input id="op" type="range" min="0.15" max="0.9" step="0.05" value="${opts.opacity ?? 0.45}"></label>` : ""}`;
      menu = document.createElement("div");
      menu.className = "menu";
      menu.hidden = true;
      menu.innerHTML = `<div class="seg">
          <button type="button" data-vista="lado" class="${vista === "lado" ? "on" : ""}">Lado a lado</button>
          <button type="button" data-vista="sobre" class="${vista === "sobre" ? "on" : ""}">Superpuesto</button>
        </div>
        <div class="seg">
          <button type="button" data-compare="antes" class="${compareMode === "antes" ? "on" : ""}">Antes y después</button>
          <button type="button" data-compare="profe" class="demo${compareMode === "profe" ? " on" : ""}">Clip de Martín</button>
          <button type="button" data-compare="referencia"${compareMode === "referencia" ? ' class="on"' : ""}>Referencia</button>
        </div>
        ${pinButtons(false)}
        ${keyButtons}`;
      top.append(menu);
      stack.insertBefore(top, panesEl);
    }

    const transport = document.createElement("div");
    transport.className = "transport";
    transport.innerHTML = `<div class="seg">
      <button type="button" data-step="-1" aria-label="Cuadro anterior">−</button>
      <button type="button" id="play" aria-label="Reproducir">Ver</button>
      <button type="button" data-step="1" aria-label="Cuadro siguiente">+</button>
      <button type="button" data-speed="0.25">0.25</button>
      <button type="button" data-speed="0.5">0.5</button>
      <button type="button" data-speed="1" class="on">1</button>
      <button type="button" data-act="acercar" aria-label="Acercar">Zoom</button>
      <button type="button" data-act="alejar" aria-label="Alejar">Lejos</button>
      <button type="button" data-act="ajustar">1:1</button>
      <button type="button" data-act="captura">Cuadro</button>
      <button type="button" data-act="volver" hidden>Volver</button>
    </div>
    <label class="op scrub"><span id="reloj">Cuadro</span><span class="ticks" aria-hidden="true"></span><input id="scrub" type="range" min="0" max="23" step="1" value="0"></label>
    ${two ? keyButtons : pinButtons(true)}`;

    const sheet = document.createElement("div");
    sheet.className = "sheet";
    sheet.hidden = true;
    sheet.innerHTML = `<div class="seg colors" role="group" aria-label="Color">${COLORS.map(([c, name]) => `<button type="button" class="swatch${c === color ? " on" : ""}" data-color="${c}" style="background:${c}" aria-label="${name}"></button>`).join("")}</div>
      <label class="op">Grosor <input id="grosor" type="range" min="2" max="8" step="1" value="3"></label>
      <div class="seg">
        <button type="button" data-act="desde">Desde acá</button>
        <button type="button" data-act="hasta">Hasta acá</button>
        <button type="button" data-act="etiqueta">Etiqueta</button>
      </div>
      <label class="fld" id="texto-box" hidden><span>Texto</span><input id="texto" type="text" maxlength="80"></label>
      <div class="seg">
        <button type="button" data-act="deshacer">Deshacer</button>
        <button type="button" data-act="rehacer">Rehacer</button>
        <button type="button" data-act="borrar">Borrar</button>
        <button type="button" data-act="limpiar">Limpiar</button>
        <button type="button" data-open="a">Abrir</button>
      </div>`;

    const rail = document.createElement("div");
    rail.className = "rail";
    rail.setAttribute("role", "toolbar");
    rail.innerHTML = `<div class="rail-tools">${TOOLS.map(([id, name]) => `<button type="button" data-tool="${id}"${GROUP_START[id] ? ' data-g="1"' : ""} aria-label="${HUMAN[id] || name}">${ico(id)}<span>${name}</span></button>`).join("")
      }<button type="button" data-act="estilo" aria-label="Color y grosor"><span class="dot"></span><span>Color</span></button><button type="button" data-act="riel" aria-label="Herramientas"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 9l7 6 7-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Más</span></button></div>`
      + `<button type="button" id="guardar">Guardar</button>`;

    const list = document.createElement("div");
    list.className = "marks";
    const marksToggle = document.createElement("button");
    marksToggle.type = "button";
    marksToggle.className = "marks-toggle";
    marksToggle.dataset.act = "marcas";
    marksToggle.setAttribute("aria-expanded", "false");
    const marksBody = document.createElement("div");
    marksBody.className = "marks-body";
    marksBody.hidden = true;
    const marksBar = document.createElement("div");
    marksBar.className = "marks-bar";
    marksBar.append(marksToggle);
    if (!two) {
      const dur = document.createElement("button");
      dur.type = "button";
      dur.dataset.act = "duracion";
      dur.textContent = "Duración";
      marksBar.append(dur);
    }
    const corte = document.createElement("button");
    corte.type = "button";
    corte.dataset.act = "corte";
    corte.setAttribute("aria-label", "Corte de cámara aquí");
    corte.textContent = "Corte de cámara aquí";
    marksBar.append(corte);
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.hidden = true;
    hint.textContent = "Revisá hasta dónde va la cabeza";
    list.append(marksBar, hint, marksBody);
    let marksOpen = false;
    let marksPinned = false;
    const input = document.createElement("input");
    input.id = "abrir";
    input.type = "file";
    input.accept = "image/*,video/*";
    input.hidden = true;
    const chrome = document.createElement("div");
    chrome.className = "chrome";
    chrome.append(transport, sheet, list);
    stack.append(chrome);
    root.append(rail, input);
    host.append(root);

    const playBtn = transport.querySelector("#play");
    const scrub = transport.querySelector("#scrub");
    const reloj = transport.querySelector("#reloj");
    const saveBtn = rail.querySelector("#guardar");
    const textBox = sheet.querySelector("#texto-box");
    const textInput = sheet.querySelector("#texto");
    const volverBtn = transport.querySelector("[data-act=volver]");
    let opacity = opts.opacity ?? 0.45;
    let active = built[0];

    function say(t) { if (opts.toast) opts.toast(t); }
    function persist() {
      if (opts.persist) opts.persist(marks.map(m => ({
        ...m, pts: m.pts.map(p => ({ x: p.x, y: p.y })),
      })));
    }
    function checkpoint() { undo.push(JSON.stringify(marks)); if (undo.length > 60) undo.shift(); redo = []; }
    function selMark() { return marks.find(m => m.id === sel) || null; }
    function syncChrome() {
      const app = document.getElementById("app");
      if (app) app.classList.toggle("archivo", built.some(p => p.user));
    }
    function boxOf(p) {
      return { w: Math.max(1, p.fit.clientWidth), h: Math.max(1, p.fit.clientHeight) };
    }
    function mediaPx(p) {
      if (p.kind === "video" && p.video.videoWidth) return { w: p.video.videoWidth, h: p.video.videoHeight };
      if (p.kind === "image" && p.img.naturalWidth) return { w: p.img.naturalWidth, h: p.img.naturalHeight };
      return boxOf(p);
    }
    function fpsOf(p) { return p.fps || 30; }
    function frameNow(p) {
      if (p.kind === "diagram") return p.frame;
      if (p.kind === "video") return Math.max(0, Math.round((p.video.currentTime || 0) * fpsOf(p)));
      return 0;
    }
    function frameLast(p) {
      if (p.kind === "diagram") return 23;
      if (p.kind === "video") {
        const live = p.video.duration;
        const d = Number.isFinite(live) && live > 0 ? live : p.knownDuration;
        if (!Number.isFinite(d) || d <= 0) return Math.max(frameNow(p), (p.cuts && p.cuts.length ? p.cuts[p.cuts.length - 1] : frameNow(p)));
        return Math.max(0, Math.round(d * fpsOf(p)) - 1);
      }
      return 0;
    }
    function keysReady(p) { return !!(p.fixed.address && p.fixed.top && p.fixed.impact); }
    function canSync() { return built.length === 2 && built.every(keysReady); }

    function layoutFit(p) {
      const sw = p.stage.clientWidth;
      const sh = p.stage.clientHeight;
      if (sw < 2 || sh < 2) return;
      let aw = 9, ah = 16;
      if (p.kind === "video" && p.video.videoWidth) { aw = p.video.videoWidth; ah = p.video.videoHeight; }
      else if (p.kind === "image" && p.img.naturalWidth) { aw = p.img.naturalWidth; ah = p.img.naturalHeight; }
      else if (p.kind === "diagram") { aw = 4; ah = 5; }
      else { aw = sw; ah = sh; }
      const s = Math.min(sw / aw, sh / ah);
      const w = Math.max(2, Math.floor(aw * s));
      const h = Math.max(2, Math.floor(ah * s));
      p.fit.style.width = w + "px";
      p.fit.style.height = h + "px";
      p.svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    }
    function applyView(p) {
      const v = p.view;
      p.world.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.s})`;
      p.world.dataset.zoom = v.s.toFixed(2);
    }
    function zoomAt(p, clientX, clientY, factor) {
      const r = p.fit.getBoundingClientRect();
      const px = clientX - r.left;
      const py = clientY - r.top;
      const v = p.view;
      const ns = clamp(v.s * factor, 1, 8);
      const wx = (px - v.x) / v.s;
      const wy = (py - v.y) / v.s;
      v.s = ns;
      v.x = ns <= 1 ? 0 : px - wx * ns;
      v.y = ns <= 1 ? 0 : py - wy * ns;
      if (ns <= 1) { v.s = 1; v.x = 0; v.y = 0; }
      applyView(p);
    }
    function drawDiagram(p) {
      if (p.kind !== "diagram" || !opts.paint) return;
      const b = boxOf(p);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(2, Math.round(b.w * dpr));
      const h = Math.max(2, Math.round(b.h * dpr));
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
      saveBtn.hidden = built.every(x => x.kind === "empty");
      if (volverBtn) volverBtn.hidden = !active.prev;
      layoutFit(p);
      if (p.kind === "diagram") drawDiagram(p);
      applyView(p);
      syncChrome();
    }
    function bindVideo(p) {
      p.video.onloadedmetadata = () => {
        const hold = p.holdTime;
        if (Number.isFinite(hold) && hold > 0.001) {
          const d = p.video.duration;
          const t = Number.isFinite(d) && d > 0 ? Math.min(hold, Math.max(0, d - 0.001)) : hold;
          try { p.video.currentTime = t; } catch { /* el medio todavía no acepta el salto */ }
        }
        layoutFit(p);
        paintInk(p);
        updateScrub();
        if (p.scanned) {
          if (p.stage) {
            p.stage.dataset.scanned = "1";
            p.stage.dataset.cuts = (p.cuts || []).join(",");
            p.stage.dataset.hints = (p.suggestions || []).map(s => s.f).join(",");
            if (p.knownDuration) p.stage.dataset.duration = String(p.knownDuration);
          }
        } else scanCuts(p);
      };
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
      p.fps = 30;
      if (p.kind === "video") {
        p.cuts = [];
        p.manualCuts = [];
        p.suggestions = [];
        p.firm = [];
        p.scanned = false;
        p.holdTime = 0;
        p.knownDuration = 0;
        p.scanToken = (p.scanToken || 0) + 1;
        if (p.stage) { p.stage.dataset.scanned = ""; p.stage.dataset.cuts = ""; p.stage.dataset.hints = ""; }
        bindVideo(p);
      } else {
        p.img.onload = () => { layoutFit(p); paintInk(p); };
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
      if (t <= k.top) return { leg: 0, u: (t - k.address) / ((k.top - k.address) || 1) };
      return { leg: 1, u: (t - k.top) / ((k.impact - k.top) || 1) };
    }
    function fromPhase(p, ph) {
      const k = p.keys;
      if (ph.leg === 0) return k.address + ph.u * (k.top - k.address);
      return k.top + ph.u * (k.impact - k.top);
    }
    function syncTo(src) {
      if (!syncOn || syncing || !canSync()) return;
      const other = built.find(p => p !== src);
      if (!other || other.kind === "empty" || other.kind === "image") return;
      syncing = true;
      setUnit(other, fromPhase(other, phase(src)));
      syncing = false;
    }
    function rangeEnd(p, f) {
      const next = (p.cuts || []).find(c => c > f + 2);
      const last = frameLast(p);
      if (next != null) return Math.max(f, Math.min(last > f ? last : next - 1, next - 1));
      return Math.max(f, last > f ? last : f);
    }
    function applyCuts(p) {
      let changed = false;
      for (const m of marks) {
        if (m.side !== p.side || m.pin !== "range" || !m.auto) continue;
        const next = (p.cuts || []).find(c => c > m.f0 + 2);
        const end = next != null ? next - 1 : frameLast(p);
        const f1 = Math.max(m.f0, end);
        if (m.f1 !== f1) {
          m.f1 = f1;
          m.t1 = f1 / fpsOf(p);
          changed = true;
        }
      }
      if (changed && p.stage && p.stage.isConnected) { persist(); renderList(); paintAll(); }
    }
    function addCutHere() {
      const p = active;
      if (p.kind !== "video") { say("Elegí un video"); return; }
      const f = frameNow(p);
      p.manualCuts = p.manualCuts || [];
      if (!p.manualCuts.includes(f)) p.manualCuts.push(f);
      p.cuts = [...new Set([...(p.cuts || []), f])].sort((a, b) => a - b);
      if (p.stage) p.stage.dataset.cuts = p.cuts.join(",");
      const m = selMark();
      if (m && m.side === p.side && m.pin === "range" && m.f0 < f && m.f1 >= f) {
        checkpoint();
        m.f1 = Math.max(m.f0, f - 1);
        m.t1 = m.f1 / fpsOf(p);
        m.auto = false;
      }
      applyCuts(p);
      persist();
      renderList();
      paintAll();
      say("Corte de cámara");
    }
    function seekTo(video, t) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { cleanup(); reject(new Error("seek")); }, 1200);
        const done = () => { cleanup(); resolve(); };
        const fail = () => { cleanup(); reject(new Error("media")); };
        const cleanup = () => {
          clearTimeout(timer);
          video.removeEventListener("seeked", done);
          video.removeEventListener("error", fail);
        };
        video.addEventListener("seeked", done);
        video.addEventListener("error", fail);
        try { video.currentTime = t; } catch (err) { cleanup(); reject(err); }
      });
    }
    function scanCuts(p) {
      if (p.kind !== "video" || !p.blob) return;
      const token = (p.scanToken || 0) + 1;
      p.scanToken = token;
      const stage = p.stage;
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      let scannedDur = 0;
      const finish = (found) => {
        if (p.scanToken !== token) return;
        const suggestions = (found || []).slice().sort((a, b) => a.f - b.f);
        const firm = suggestions.filter(s => s.alta).map(s => s.f);
        p.suggestions = suggestions;
        p.firm = firm;
        p.cuts = [...new Set([...firm, ...(p.manualCuts || [])])].sort((a, b) => a - b);
        p.scanned = true;
        const durNow = scannedDur > 0 ? scannedDur : (Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0);
        if (durNow > 0) p.knownDuration = durNow;
        if (stage && stage.isConnected) {
          stage.dataset.scanned = "1";
          stage.dataset.cuts = p.cuts.join(",");
          stage.dataset.hints = suggestions.map(s => s.f).join(",");
          if (p.knownDuration) stage.dataset.duration = String(p.knownDuration);
          applyCuts(p);
        }
        paintTicks();
        syncHint();
      };
      const total = (a, b) => {
        let s = 0;
        for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
        return s;
      };
      const l1 = (a, b) => total(a, b) / (a.length || 1);
      const distance = (a, b) => total(a.hist, b.hist) / 2 * 1.15 + l1(a.blocks, b.blocks) * 2.6 + l1(a.edges, b.edges) * 1.1;
      const featuresOf = (data, w, h) => {
        const hist = new Array(16).fill(0);
        const luma = new Float32Array(w * h);
        let sum = 0;
        for (let i = 0; i < w * h; i++) {
          const o = i * 4;
          const y = data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114;
          luma[i] = y;
          sum += y;
          hist[Math.min(15, y >> 4)]++;
        }
        const n = w * h || 1;
        const mean = sum / n;
        for (let i = 0; i < 16; i++) hist[i] /= n;
        const cols = w >= h ? 8 : 6;
        const rows = h >= w ? 8 : 6;
        const blocks = [];
        const edges = [];
        for (let by = 0; by < rows; by++) {
          const y0 = Math.floor(by * h / rows);
          const y1 = Math.max(y0 + 1, Math.floor((by + 1) * h / rows));
          for (let bx = 0; bx < cols; bx++) {
            const x0 = Math.floor(bx * w / cols);
            const x1 = Math.max(x0 + 1, Math.floor((bx + 1) * w / cols));
            let s = 0, c = 0, e = 0, ec = 0;
            for (let y = y0; y < y1; y++) {
              for (let x = x0; x < x1; x++) {
                const yv = luma[y * w + x];
                s += yv;
                c++;
                if (x + 1 < w) { e += Math.abs(yv - luma[y * w + x + 1]); ec++; }
                if (y + 1 < h) { e += Math.abs(yv - luma[(y + 1) * w + x]); ec++; }
              }
            }
            blocks.push(s / (c || 1));
            edges.push(e / (ec || 1));
          }
        }
        const base = mean || 1;
        return { hist, blocks: blocks.map(val => val / base), edges: edges.map(val => val / 40), mean };
      };
      v.onerror = () => finish([]);
      v.onloadeddata = async () => {
        if (!Number.isFinite(v.duration) || v.duration <= 0) {
          await new Promise(resolve => {
            const done = () => {
              if (Number.isFinite(v.duration) && v.duration > 0) {
                v.removeEventListener("durationchange", done);
                v.removeEventListener("seeked", done);
                resolve();
              }
            };
            v.addEventListener("durationchange", done);
            v.addEventListener("seeked", done);
            try { v.currentTime = 1e101; } catch { resolve(); }
            setTimeout(resolve, 1500);
          });
        }
        const fps = fpsOf(p);
        const dur = v.duration;
        if (p.scanToken !== token || !Number.isFinite(dur) || dur <= 0) { finish([]); return; }
        scannedDur = dur;
        const last = Math.max(0, Math.round(dur * fps) - 1);
        const vw = v.videoWidth || 48;
        const vh = v.videoHeight || 48;
        const scale = 48 / Math.max(vw, vh);
        const w = Math.max(16, Math.round(vw * scale));
        const h = Math.max(16, Math.round(vh * scale));
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const g = c.getContext("2d", { willReadFrequently: true });
        const step = Math.max(1, Math.round(fps / 10));
        const samples = [];
        let misses = 0;
        for (let f = 0; f <= last; f += step) {
          if (p.scanToken !== token) return;
          try {
            await seekTo(v, Math.min(dur - 0.001, f / fps));
            misses = 0;
          } catch {
            misses++;
            if (misses >= 4) break;
            continue;
          }
          if (!g || !v.videoWidth) continue;
          // drawImage toma el cuadro ya rotado, como lo muestra el reproductor.
          g.drawImage(v, 0, 0, w, h);
          samples.push({ f, ...featuresOf(g.getImageData(0, 0, w, h).data, w, h) });
        }
        const back = 15;
        const panMax = 40;
        const blockFrac = (a, b) => {
          let n = 0;
          const len = Math.min(a.blocks.length, b.blocks.length);
          for (let i = 0; i < len; i++) if (Math.abs(a.blocks[i] - b.blocks[i]) > 0.1) n++;
          return n / (len || 1);
        };
        const coverage = (a, b) => {
          const blocks = blockFrac(a, b);
          const hist = total(a.hist, b.hist) / 2;
          return hist >= 0.35 ? Math.max(blocks, hist) : blocks;
        };
        const stays = (from, pre) => {
          const end = Math.min(samples.length - 1, from + back);
          if (end < from + 8) return false;
          for (let k = from; k <= end; k += 3) if (distance(pre, samples[k]) < 0.16) return false;
          return distance(pre, samples[end]) >= 0.18;
        };
        const found = [];
        for (let i = back; i + back < samples.length; i++) {
          const pre = samples[i - back];
          const post = samples[i + back];
          if (pre.mean < 14 || post.mean < 14) continue;
          const dist = distance(pre, post);
          const cover = coverage(pre, post);
          if (dist < 0.22 || cover < 0.34 || !stays(i, pre)) continue;
          let best = i, bestScore = -1;
          for (let k = Math.max(1, i - back); k <= Math.min(samples.length - 1, i + back); k++) {
            const step = distance(samples[k - 1], samples[k]);
            if (step > bestScore) { bestScore = step; best = k; }
          }
          if (bestScore < 0.16 || samples[best].f < 8) continue;
          const alta = dist >= 0.22 && cover >= 0.34 && bestScore >= 0.18;
          found.push({ f: samples[best].f, alta });
        }
        for (let i = 0; i < samples.length - back; i++) {
          const anchor = samples[i];
          if (anchor.mean < 14) continue;
          let crossed = -1;
          for (let span = 12; span <= panMax && i + span < samples.length; span++) {
            const end = samples[i + span];
            const dist = distance(anchor, end);
            const cover = coverage(anchor, end);
            if (dist < 0.24 || cover < 0.34) continue;
            let maxStep = 0;
            for (let k = i + 1; k <= i + span; k++) maxStep = Math.max(maxStep, distance(samples[k - 1], samples[k]));
            if (maxStep > Math.max(0.18, dist * 0.62)) continue;
            const after = Math.min(samples.length - 1, i + span + Math.min(back, 10));
            if (distance(anchor, samples[after]) < 0.2) continue;
            if (crossed < 0) {
              for (let k = i + 1; k <= i + span; k++) {
                if (distance(anchor, samples[k]) > 0.28 && coverage(anchor, samples[k]) >= 0.28) { crossed = k; break; }
              }
            }
            if (crossed < 0 || samples[crossed].f < 8) continue;
            const alta = dist >= 0.26 && cover >= 0.34 && distance(anchor, samples[after]) >= 0.22;
            found.push({ f: samples[crossed].f, alta });
            break;
          }
        }
        found.sort((a, b) => a.f - b.f);
        const cuts = [];
        for (const hit of found) {
          const prev = cuts[cuts.length - 1];
          if (prev && hit.f - prev.f < 45) {
            if (hit.alta) prev.alta = true;
            continue;
          }
          cuts.push({ f: hit.f, alta: !!hit.alta });
        }
        finish(cuts);
      };
      v.src = p.blob;
    }
    function stamp(p) {
      const f = frameNow(p);
      const last = frameLast(p);
      const t = p.kind === "video" ? (p.video.currentTime || 0) : f;
      const endF = rangeEnd(p, f);
      const endT = p.kind === "video" ? endF / fpsOf(p) : endF;
      if (p.kind === "image" || pinMode === "all") return { pin: "all", f0: 0, f1: Math.max(last, f), t0: 0, t1: 1e9, media: p.kind };
      if (pinMode === "range") return { pin: "range", f0: f, f1: endF, t0: t, t1: endT, media: p.kind, auto: true };
      return { pin: "frame", f0: f, f1: f, t0: t, t1: t, media: p.kind };
    }
    function visible(m, p) {
      if (m.side !== p.side || p.kind === "empty") return false;
      if (m.pin === "all" || p.kind === "image") return true;
      const f = frameNow(p);
      return f >= m.f0 && f <= m.f1;
    }
    function eventPos(p, e, origin) {
      const r = p.svg.getBoundingClientRect();
      let q = { x: clamp((e.clientX - r.left) / (r.width || 1), 0, 1), y: clamp((e.clientY - r.top) / (r.height || 1), 0, 1) };
      const px = 8 / (r.width || 1);
      const py = 8 / (r.height || 1);
      if (origin) {
        if (Math.abs(q.y - origin.y) < py && Math.abs(q.x - origin.x) >= px) q = { x: q.x, y: origin.y, snap: "h" };
        else if (Math.abs(q.x - origin.x) < px && Math.abs(q.y - origin.y) >= py) q = { x: origin.x, y: q.y, snap: "v" };
      }
      for (const m of marks) {
        if (m.side !== p.side) continue;
        for (const pt of m.pts) {
          if (Math.abs(q.x - pt.x) < px && Math.abs(q.y - pt.y) < py) return { x: pt.x, y: pt.y, snap: q.snap || "p" };
        }
      }
      return q;
    }
    function far(p, a, b) {
      const r = p.svg.getBoundingClientRect();
      return Math.hypot((a.x - b.x) * r.width, (a.y - b.y) * r.height) >= 4;
    }
    function degrees(a, v, c, box) {
      const ux = (a.x - v.x) * box.w, uy = (a.y - v.y) * box.h;
      const wx = (c.x - v.x) * box.w, wy = (c.y - v.y) * box.h;
      const du = Math.hypot(ux, uy), dw = Math.hypot(wx, wy);
      if (du < 1e-6 || dw < 1e-6) return 0;
      const cos = clamp((ux * wx + uy * wy) / (du * dw), -1, 1);
      return Math.round(Math.acos(cos) * 180 / Math.PI);
    }
    function circlePoint(origin, pt, box) {
      const dx = (pt.x - origin.x) * box.w;
      const dy = (pt.y - origin.y) * box.h;
      const r = Math.hypot(dx, dy) || 1;
      return {
        x: origin.x + Math.sign(dx || 1) * r / box.w,
        y: origin.y + Math.sign(dy || 1) * r / box.h,
        snap: "c",
      };
    }
    function pinText(m) {
      if (m.media === "image") return "en la imagen";
      if (m.pin === "all") return "todo el clip";
      if (m.pin === "range") return `tramo ${m.f0}–${m.f1}`;
      return `cuadro ${m.f0}`;
    }
    function markLabel(m) {
      const name = m.tipo === "texto" && m.texto ? m.texto : (HUMAN[m.tipo] || m.tipo);
      const deg = m.tipo === "angulo" && m.grados != null ? ` ${m.grados}°` : "";
      return `${name}${deg} · ${pinText(m)}`;
    }
    function headNeedsReview(p) {
      if (!p || p.kind !== "video" || !p.scanned) return false;
      const last = frameLast(p);
      if (last < 8) return false;
      return marks.some(m => m.side === p.side && m.tipo === "cabeza" && m.pin === "range" && m.auto && m.f1 >= last - 2);
    }
    function syncHint() {
      hint.hidden = !headNeedsReview(active);
    }
    function paintTicks() {
      const host = transport.querySelector(".ticks");
      if (!host) return;
      host.replaceChildren();
      const p = active;
      if (!p || p.kind !== "video") return;
      const last = Math.max(1, frameLast(p));
      const frames = [...(p.suggestions || []).map(s => s.f), ...(p.manualCuts || [])];
      for (const f of frames) {
        const tick = document.createElement("i");
        tick.style.left = Math.min(100, Math.max(0, 100 * f / last)) + "%";
        host.append(tick);
      }
    }
    function renderList() {
      syncHint();
      const rows = marks.filter(m => m.side === active.side);
      marksToggle.textContent = rows.length ? `Marcas · ${rows.length}` : "Marcas";
      marksToggle.setAttribute("aria-expanded", marksOpen ? "true" : "false");
      marksBody.replaceChildren();
      if (!rows.length) {
        const n = document.createElement("p");
        n.className = "note";
        n.textContent = "Todavía no hay marcas.";
        marksBody.append(n);
        return;
      }
      for (const m of rows.slice().reverse()) {
        const row = document.createElement("div");
        row.className = "mark";
        const span = document.createElement("span");
        span.textContent = markLabel(m);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.dataset.del = m.id;
        btn.textContent = "Quitar";
        row.append(span, btn);
        marksBody.append(row);
      }
    }
    function highlight() {
      root.querySelectorAll("[data-tool]").forEach(b => b.classList.toggle("on", b.dataset.tool === tool));
      root.querySelectorAll("[data-color]").forEach(b => b.classList.toggle("on", b.dataset.color === color));
      root.querySelectorAll("[data-pin]").forEach(b => b.classList.toggle("on", b.dataset.pin === pinMode));
      root.querySelectorAll("[data-speed]").forEach(b => b.classList.toggle("on", Number(b.dataset.speed) === rate));
      root.querySelectorAll("[data-act=sync]").forEach(syncBtn => {
        syncBtn.classList.toggle("on", syncOn);
        syncBtn.disabled = !canSync();
      });
      root.querySelectorAll("[data-pick]").forEach(b => b.classList.toggle("on", b.dataset.pick === active.side));
      transport.querySelectorAll(".pins").forEach(el => { el.hidden = !pinOpen; });
      root.querySelectorAll("[data-act=ir]").forEach(b => { b.hidden = !active.fixed[b.dataset.key]; });
      const dot = root.querySelector(".dot");
      if (dot) dot.style.background = color;
      const m = selMark();
      const showText = tool === "texto" || (m && (m.tipo === "texto" || m.etiqueta));
      textBox.hidden = !showText;
      if (m && (m.tipo === "texto" || m.etiqueta) && document.activeElement !== textInput) textInput.value = m.texto || "";
      const et = root.querySelector("[data-act=etiqueta]");
      if (et) et.classList.toggle("on", labelOn || !!(m && m.etiqueta));
      if (volverBtn) volverBtn.hidden = !active.prev;
    }
    function clock(t) {
      if (!Number.isFinite(t) || t < 0) t = 0;
      const m = Math.floor(t / 60);
      const s = Math.floor(t % 60);
      const cs = Math.floor(t * 100 + 1e-4) % 100;
      return m + ":" + String(s).padStart(2, "0") + "." + String(cs).padStart(2, "0");
    }
    function updateScrub() {
      const p = active;
      if (p.kind === "diagram") {
        scrub.max = "23"; scrub.step = "1"; scrub.disabled = false; scrub.value = String(p.frame);
        reloj.textContent = "Cuadro " + p.frame;
      } else if (p.kind === "video") {
        const last = frameLast(p);
        scrub.max = String(Math.max(0, last)); scrub.step = "1"; scrub.disabled = !p.video.duration;
        scrub.value = String(frameNow(p));
        reloj.textContent = clock(p.video.currentTime || 0) + " · " + frameNow(p);
      } else {
        scrub.disabled = true;
        reloj.textContent = p.kind === "image" ? "Imagen" : "Sin archivo";
      }
      built.forEach(pane => {
        const el = pane.root.querySelector(".sideclock");
        if (!el) return;
        if (pane.kind === "video") el.textContent = clock(pane.video.currentTime || 0) + " · " + frameNow(pane);
        else if (pane.kind === "diagram") el.textContent = "Cuadro " + pane.frame;
        else el.textContent = pane.kind === "image" ? "Imagen" : "Sin archivo";
      });
      paintTicks();
    }
    function setActive(p) {
      active = p;
      built.forEach(x => {
        x.root.classList.toggle("active", x === p);
        x.root.style.zIndex = "";
        x.root.style.opacity = "1";
      });
      if (opts.overlay && built[1]) built[1].root.style.opacity = String(opacity);
      updateScrub();
      highlight();
      renderList();
    }
    function stopPlay() {
      playing = false;
      clearTimeout(playTimer);
      playBtn.textContent = "Ver";
      built.forEach(p => { if (p.kind === "video") { p.video.pause(); p.video.ontimeupdate = null; } });
    }
    function paintInk(p) {
      layoutFit(p);
      const box = boxOf(p);
      const svg = p.svg;
      while (svg.firstChild) svg.firstChild.remove();
      svg.append(svgEl("rect", { class: "pad", x: 0, y: 0, width: box.w, height: box.h, fill: "transparent" }));
      const show = marks.filter(m => visible(m, p));
      const live = liveMark(p, box);
      if (live) show.push(live);
      for (const m of show) svg.append(drawMark(m, box, tool === "mover"));
      if (tool === "mover" && sel) {
        const m = marks.find(x => x.id === sel && x.side === p.side);
        if (m && visible(m, p)) drawHandles(svg, m, box);
      }
    }
    function liveMark(p, box) {
      if (!draft || draft.side !== p.side) return null;
      if (draft.tipo === "angulo" && draft.hover && draft.pts.length < 3) {
        const pts = draft.pts.concat([draft.hover]);
        const m = { ...draft, pts };
        if (pts.length === 3) m.grados = degrees(pts[0], pts[1], pts[2], box);
        return m;
      }
      return draft;
    }
    function paintAll() { built.forEach(p => { if (p.kind === "diagram") drawDiagram(p); paintInk(p); }); updateScrub(); }

    let textMeasure = null;
    function textWidth(str, size) {
      if (!textMeasure) textMeasure = document.createElement("canvas").getContext("2d");
      textMeasure.font = "600 " + size + "px Geist, sans-serif";
      return textMeasure.measureText(str).width;
    }
    function wrapLabel(str, size, maxW) {
      const words = String(str || "").split(/\s+/).filter(Boolean);
      const lines = [];
      let line = "";
      const piecesOf = (word) => {
        if (textWidth(word, size) <= maxW) return [word];
        const parts = [];
        let chunk = "";
        for (const ch of word) {
          const trial = chunk + ch;
          if (!chunk || textWidth(trial, size) <= maxW) chunk = trial;
          else { parts.push(chunk); chunk = ch; }
        }
        if (chunk) parts.push(chunk);
        return parts.length ? parts : [word];
      };
      for (const word of words) {
        for (const piece of piecesOf(word)) {
          const trial = line ? line + " " + piece : piece;
          if (!line || textWidth(trial, size) <= maxW) line = trial;
          else { if (line) lines.push(line); line = piece; }
        }
      }
      if (line) lines.push(line);
      return lines.length ? lines : [String(str || "")];
    }
    function drawText(g, x, y, str, fill, box) {
      const maxW = Math.max(16, (box ? box.w : 280) - 8);
      const maxH = box ? Math.max(14, box.h - 4) : 400;
      let size = 15;
      let lines = wrapLabel(str, size, maxW);
      while (size > 8) {
        const widest = Math.max(...lines.map(l => textWidth(l, size)));
        const block = lines.length * (size + 2);
        const wordFits = lines.every(l => textWidth(l, size) <= maxW + 1);
        if (widest <= maxW && wordFits && block <= maxH) break;
        size -= 1;
        lines = wrapLabel(str, size, maxW);
      }
      const lineH = size + 2;
      const widest = Math.max(...lines.map(l => textWidth(l, size)), 0);
      let left = x;
      let base = y;
      if (box) {
        if (left + widest > box.w - 4) left = Math.max(4, box.w - widest - 4);
        if (left < 4) left = 4;
        const block = lines.length * lineH;
        if (base - size + block > box.h - 2) base = Math.max(size, box.h - 2 - (block - size));
        if (base < size) base = size;
      }
      const t = svgEl("text", {
        x: left, y: base, fill, "font-size": size, "font-family": "Geist, sans-serif", "font-weight": 600, "font-style": "normal",
        stroke: "#0B2545", "stroke-width": 3, "vector-effect": "non-scaling-stroke", "paint-order": "stroke",
        "stroke-linejoin": "round",
      });
      lines.forEach((ln, i) => {
        const span = svgEl("tspan", { x: left, dy: i === 0 ? 0 : lineH });
        span.textContent = i < lines.length - 1 ? ln + " " : ln;
        t.append(span);
      });
      g.append(t);
    }
    function drawMark(m, box, hit) {
      const g = svgEl("g", { "data-ann": m.id });
      g.style.pointerEvents = hit ? "auto" : "none";
      const X = n => n * box.w;
      const Y = n => n * box.h;
      const ink = (el, attrs) => {
        g.append(svgEl(el, { ...attrs, stroke: "#0B2545", "stroke-width": (Number(attrs["stroke-width"]) || m.sw) + 2, "vector-effect": "non-scaling-stroke", fill: "none" }));
        g.append(svgEl(el, { ...attrs, stroke: m.color, "vector-effect": "non-scaling-stroke", "stroke-linecap": "round", "stroke-linejoin": "round", fill: attrs.fill || "none" }));
      };
      const hitLine = (x1, y1, x2, y2) => g.append(svgEl("line", { x1, y1, x2, y2, stroke: "transparent", "stroke-width": 16, "stroke-linecap": "round" }));
      if (m.tipo === "libre" && m.pts.length > 1) {
        const points = m.pts.map(p => `${X(p.x)},${Y(p.y)}`).join(" ");
        g.append(svgEl("polyline", { points, fill: "none", stroke: "transparent", "stroke-width": 16, "stroke-linejoin": "round", "stroke-linecap": "round" }));
        ink("polyline", { points, fill: "none", "stroke-width": m.sw });
      } else if (m.tipo === "elipse" || m.tipo === "cabeza") {
        const c0 = m.pts[0], e = m.pts[1] || c0;
        const dx = (e.x - c0.x) * box.w, dy = (e.y - c0.y) * box.h;
        let rx, ry;
        if (m.tipo === "cabeza" || m.snap === "c") {
          const r = Math.max(6, Math.hypot(dx, dy));
          rx = r; ry = r;
        } else {
          rx = Math.max(6, Math.abs(dx));
          ry = Math.max(6, Math.abs(dy));
        }
        g.append(svgEl("ellipse", { cx: X(c0.x), cy: Y(c0.y), rx, ry, fill: "transparent", stroke: "transparent", "stroke-width": 14 }));
        ink("ellipse", { cx: X(c0.x), cy: Y(c0.y), rx, ry, fill: "none", "stroke-width": m.sw });
        if (m.tipo === "cabeza") {
          ink("line", { x1: X(c0.x) - 8, y1: Y(c0.y), x2: X(c0.x) + 8, y2: Y(c0.y), "stroke-width": m.sw });
          ink("line", { x1: X(c0.x), y1: Y(c0.y) - 8, x2: X(c0.x), y2: Y(c0.y) + 8, "stroke-width": m.sw });
        }
      } else if (m.tipo === "caja") {
        const a = m.pts[0], b = m.pts[1] || a;
        const x = Math.min(X(a.x), X(b.x)), y = Math.min(Y(a.y), Y(b.y));
        const w = Math.max(6, Math.abs(X(b.x) - X(a.x))), h = Math.max(6, Math.abs(Y(b.y) - Y(a.y)));
        g.append(svgEl("rect", { x, y, width: w, height: h, fill: "transparent", stroke: "transparent", "stroke-width": 14 }));
        ink("rect", { x, y, width: w, height: h, fill: "none", "stroke-width": m.sw });
      } else if (m.tipo === "vertical") {
        const x = X(m.pts[0].x);
        hitLine(x, 0, x, box.h);
        ink("line", { x1: x, y1: 0, x2: x, y2: box.h, "stroke-width": m.sw });
      } else if (m.tipo === "horizontal") {
        const y = Y(m.pts[0].y);
        hitLine(0, y, box.w, y);
        ink("line", { x1: 0, y1: y, x2: box.w, y2: y, "stroke-width": m.sw });
      } else if (m.tipo === "texto") {
        const x = clamp(X(m.pts[0].x), 4, box.w - 8);
        const y = clamp(Y(m.pts[0].y), 18, box.h - 6);
        drawText(g, x, y, m.texto || "Nota", m.color, box);
      } else if (m.tipo === "angulo") {
        const pts = m.pts;
        if (pts.length >= 2) { hitLine(X(pts[0].x), Y(pts[0].y), X(pts[1].x), Y(pts[1].y)); ink("line", { x1: X(pts[0].x), y1: Y(pts[0].y), x2: X(pts[1].x), y2: Y(pts[1].y), "stroke-width": m.sw }); }
        if (pts.length === 3) {
          hitLine(X(pts[1].x), Y(pts[1].y), X(pts[2].x), Y(pts[2].y));
          ink("line", { x1: X(pts[1].x), y1: Y(pts[1].y), x2: X(pts[2].x), y2: Y(pts[2].y), "stroke-width": m.sw });
          const path = arcPath(pts[1], pts[0], pts[2], 28, box);
          if (path) ink("path", { d: path, fill: "none", "stroke-width": m.sw });
          const deg = m.grados != null ? m.grados : degrees(pts[0], pts[1], pts[2], box);
          const pos = degreeLabelPos(pts, box, m);
          drawText(g, pos.x, pos.y, deg + "°", m.color, box);
        }
      } else if (m.pts.length >= 2) {
        const a = m.pts[0], b = m.pts[1];
        hitLine(X(a.x), Y(a.y), X(b.x), Y(b.y));
        ink("line", { x1: X(a.x), y1: Y(a.y), x2: X(b.x), y2: Y(b.y), "stroke-width": m.sw });
        if (m.tipo === "flecha" || m.tipo === "objetivo") arrow(g, a, b, m, box);
        if (m.etiqueta && (m.tipo === "pies" || m.tipo === "objetivo" || m.tipo === "plano")) {
          const pos = labelPos(a, b, box);
          drawText(g, pos.x, pos.y, m.texto || HUMAN[m.tipo], m.color, box);
        }
      }
      return g;
    }
    function degreeLabelPos(pts, box, self) {
      const vx = pts[1].x * box.w, vy = pts[1].y * box.h;
      const a1 = Math.atan2((pts[0].y - pts[1].y) * box.h, (pts[0].x - pts[1].x) * box.w);
      const a2 = Math.atan2((pts[2].y - pts[1].y) * box.h, (pts[2].x - pts[1].x) * box.w);
      let sweep = a2 - a1;
      while (sweep > Math.PI) sweep -= Math.PI * 2;
      while (sweep < -Math.PI) sweep += Math.PI * 2;
      const bis = a1 + sweep / 2;
      const circles = marks.filter(m => m !== self && m.side === self.side && (m.tipo === "cabeza" || m.tipo === "elipse" || m.tipo === "caja") && m.pts[0]).map(m => {
        const c0 = m.pts[0], e = m.pts[1] || c0;
        const r = (m.tipo === "cabeza" || m.snap === "c")
          ? Math.hypot((e.x - c0.x) * box.w, (e.y - c0.y) * box.h)
          : Math.max(Math.abs((e.x - c0.x) * box.w), Math.abs((e.y - c0.y) * box.h));
        return { x: c0.x * box.w, y: c0.y * box.h, r: r + 10 };
      });
      const textW = 40, textH = 18;
      const hits = (x, y) => circles.some(c => {
        const cx = clamp(c.x, x, x + textW);
        const cy = clamp(c.y, y - textH, y);
        return Math.hypot(cx - c.x, cy - c.y) < c.r;
      });
      const dirs = [bis, bis + Math.PI, bis + Math.PI / 2, bis - Math.PI / 2];
      for (const dir of dirs) {
        for (const dist of [52, 74, 96]) {
          const x = clamp(vx + Math.cos(dir) * dist, 4, box.w - textW);
          const y = clamp(vy + Math.sin(dir) * dist, textH, box.h - 4);
          if (Math.hypot(x - vx, y - vy) > 34 && !hits(x, y)) return { x, y };
        }
      }
      return { x: clamp(vx + Math.cos(bis) * 52, 4, box.w - textW), y: clamp(vy + Math.sin(bis) * 52, textH, box.h - 4) };
    }
    function labelPos(a, b, box) {
      const ax = a.x * box.w, ay = a.y * box.h, bx = b.x * box.w, by = b.y * box.h;
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const x = clamp(bx + ((bx - ax) / len) * 14, 4, box.w - 8);
      const y = clamp(by + ((by - ay) / len) * 14, 16, box.h - 6);
      return { x, y };
    }
    function arrow(g, a, b, m, box) {
      const ax = a.x * box.w, ay = a.y * box.h, bx = b.x * box.w, by = b.y * box.h;
      const ang = Math.atan2(by - ay, bx - ax);
      const tip = (d) => ({ x: bx - 14 * Math.cos(ang + d), y: by - 14 * Math.sin(ang + d) });
      const p1 = tip(-0.45), p2 = tip(0.45);
      g.append(svgEl("line", { x1: bx, y1: by, x2: p1.x, y2: p1.y, stroke: m.color, "stroke-width": m.sw, "vector-effect": "non-scaling-stroke", "stroke-linecap": "round" }));
      g.append(svgEl("line", { x1: bx, y1: by, x2: p2.x, y2: p2.y, stroke: m.color, "stroke-width": m.sw, "vector-effect": "non-scaling-stroke", "stroke-linecap": "round" }));
    }
    function arcPath(v, a, c, rPx, box) {
      const vx = v.x * box.w, vy = v.y * box.h;
      const a1 = Math.atan2(a.y * box.h - vy, a.x * box.w - vx);
      const a2 = Math.atan2(c.y * box.h - vy, c.x * box.w - vx);
      let d = a2 - a1;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const sweep = d > 0 ? 1 : 0;
      const p1x = vx + Math.cos(a1) * rPx, p1y = vy + Math.sin(a1) * rPx;
      const p2x = vx + Math.cos(a2) * rPx, p2y = vy + Math.sin(a2) * rPx;
      return `M ${p1x} ${p1y} A ${rPx} ${rPx} 0 0 ${sweep} ${p2x} ${p2y}`;
    }
    function drawHandles(svg, m, box) {
      const ix = m.tipo === "libre" ? libreHandles(m.pts.length) : m.pts.map((_, i) => i);
      for (const i of ix) {
        const p = m.pts[i];
        svg.append(svgEl("ellipse", {
          cx: p.x * box.w, cy: p.y * box.h, rx: 7, ry: 7,
          fill: "#FFFFFF", stroke: "#0B2545", "stroke-width": 2, "vector-effect": "non-scaling-stroke",
          "data-h": i, "data-ann": m.id,
        }));
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
      const size = 132;
      const gap = 28;
      const candidates = [
        { x: e.clientX - size - gap, y: e.clientY - size - gap },
        { x: e.clientX + gap, y: e.clientY - size - gap },
        { x: e.clientX - size - gap, y: e.clientY + gap },
        { x: e.clientX + gap, y: e.clientY + gap },
      ];
      let best = candidates[0], bestD = -1;
      for (const c of candidates) {
        const cx = clamp(c.x, 8, window.innerWidth - size - 8);
        const cy = clamp(c.y, 8, window.innerHeight - size - 8);
        const d = Math.hypot(cx + size / 2 - e.clientX, cy + size / 2 - e.clientY);
        const inside = c.x >= 4 && c.y >= 4 && c.x + size <= window.innerWidth - 4 && c.y + size <= window.innerHeight - 4;
        const score = d + (inside ? 80 : 0);
        if (score > bestD) { bestD = score; best = { x: cx, y: cy }; }
      }
      p.loupe.style.left = best.x + "px";
      p.loupe.style.top = best.y + "px";
      const src = p.kind === "video" ? p.video : p.kind === "image" ? p.img : p.canvas;
      const ctx = p.loupe.querySelector("canvas").getContext("2d");
      const cw = 168, ch = 168, z = 3;
      const mw = src.videoWidth || src.naturalWidth || src.width || mediaPx(p).w || 1;
      const mh = src.videoHeight || src.naturalHeight || src.height || mediaPx(p).h || 1;
      const sw = cw / z, sh = ch / z;
      const sx = pt.x * mw - sw / 2, sy = pt.y * mh - sh / 2;
      ctx.fillStyle = "#0B2545";
      ctx.fillRect(0, 0, cw, ch);
      try { ctx.drawImage(src, sx, sy, sw, sh, 0, 0, cw, ch); } catch { /* el cuadro todavía no está */ }
      drawLoupeMarks(ctx, p, sx, sy, z, mw, mh);
      ctx.strokeStyle = "#C8A86A";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cw / 2, 0); ctx.lineTo(cw / 2, ch);
      ctx.moveTo(0, ch / 2); ctx.lineTo(cw, ch / 2);
      ctx.stroke();
      p.loupe.querySelector(".snap").textContent = pt.snap === "h" ? "Horizontal" : pt.snap === "v" ? "Vertical" : pt.snap === "c" ? "Círculo" : "";
    }
    function drawLoupeMarks(ctx, p, sx, sy, z, mw, mh) {
      const listM = marks.filter(m => visible(m, p));
      if (draft && draft.side === p.side) listM.push(draft);
      const X = n => (n * mw - sx) * z;
      const Y = n => (n * mh - sy) * z;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const m of listM) {
        if (!m.pts.length) continue;
        ctx.strokeStyle = m.color || color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (m.tipo === "libre") {
          m.pts.forEach((q, i) => i ? ctx.lineTo(X(q.x), Y(q.y)) : ctx.moveTo(X(q.x), Y(q.y)));
        } else if (m.tipo === "elipse" || m.tipo === "cabeza") {
          const c0 = m.pts[0], e = m.pts[1] || c0;
          const rx = Math.abs(e.x - c0.x) * mw * z, ry = Math.abs(e.y - c0.y) * mh * z;
          const r = (m.tipo === "cabeza" || m.snap === "c") ? Math.hypot((e.x - c0.x) * mw, (e.y - c0.y) * mh) * z : 0;
          ctx.ellipse(X(c0.x), Y(c0.y), r || rx || 1, r || ry || 1, 0, 0, Math.PI * 2);
        } else if (m.pts.length >= 2) {
          ctx.moveTo(X(m.pts[0].x), Y(m.pts[0].y));
          ctx.lineTo(X(m.pts[1].x), Y(m.pts[1].y));
          if (m.tipo === "angulo" && m.pts[2]) { ctx.moveTo(X(m.pts[1].x), Y(m.pts[1].y)); ctx.lineTo(X(m.pts[2].x), Y(m.pts[2].y)); }
        } else if (m.tipo === "vertical") {
          ctx.moveTo(X(m.pts[0].x), Y(0)); ctx.lineTo(X(m.pts[0].x), Y(1));
        } else if (m.tipo === "horizontal") {
          ctx.moveTo(X(0), Y(m.pts[0].y)); ctx.lineTo(X(1), Y(m.pts[0].y));
        }
        ctx.stroke();
      }
    }
    function hideLoupes() { built.forEach(p => { p.loupe.hidden = true; }); }

    function startDraft(p, pt) {
      if (p.kind === "empty") return;
      const align = tool === "pies" || tool === "objetivo" || tool === "plano";
      const base = {
        id: uid(), tipo: tool, side: p.side, color, sw,
        texto: textInput.value || (tool === "texto" ? "Nota" : ""),
        etiqueta: align && labelOn, snap: pt.snap === "c" ? "c" : "",
        pts: [], ...stamp(p),
      };
      if (tool === "angulo") {
        if (!draft || draft.tipo !== "angulo" || draft.side !== p.side || draft.pts.length >= 3) draft = { ...base, pts: [pt] };
        else { draft.pts.push(pt); if (draft.pts.length === 3) { draft.grados = degrees(draft.pts[0], draft.pts[1], draft.pts[2], boxOf(p)); finishDraft(p); return; } }
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
      const box = boxOf(p);
      if (draft.tipo === "angulo" && draft.pts.length === 3) draft.grados = degrees(draft.pts[0], draft.pts[1], draft.pts[2], box);
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
    function armDrawChrome(on) {
      if (window.innerWidth >= 900 || !on || tool === "mover" || tool === "encuadre") root.classList.remove("dibujando");
      else root.classList.add("dibujando");
    }
    function toggleSolo(side) {
      if (built.length < 2 || opts.overlay) return;
      const on = panesEl.classList.contains("solo-" + side);
      panesEl.classList.remove("solo-a", "solo-b");
      if (!on) {
        panesEl.classList.add("solo-" + side);
        const pane = built.find(q => q.side === side);
        if (pane) setActive(pane);
      }
      const back = root.querySelector("[data-act=juntos]");
      if (back) back.hidden = !(panesEl.classList.contains("solo-a") || panesEl.classList.contains("solo-b"));
      requestAnimationFrame(() => built.forEach(q => { layoutFit(q); paintInk(q); }));
    }
    function syncMenu() {
      if (!menu) return;
      const desk = window.innerWidth >= 900;
      const btn = root.querySelector("[data-act=menu]");
      if (desk) {
        menu.hidden = false;
        menu.classList.add("inline");
        if (btn) btn.setAttribute("aria-expanded", "false");
      } else {
        menu.classList.remove("inline");
        menu.hidden = !menuOpen;
        if (btn) btn.setAttribute("aria-expanded", menuOpen ? "true" : "false");
      }
    }
    function onDown(e, p) {
      if (e.target.closest("button, a, input, label")) return;
      p.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { p.stage.setPointerCapture(e.pointerId); } catch { /* el puntero ya no está */ }
      if (p.pointers.size >= 2) { draft = null; return; }
      const now = performance.now();
      const dbl = built.length === 2 && !opts.overlay && now - tapAt < 320 && tapSide === p.side && Math.hypot(e.clientX - tapX, e.clientY - tapY) < 28;
      tapAt = now;
      tapSide = p.side;
      tapX = e.clientX;
      tapY = e.clientY;
      if (dbl) { draft = null; toggleSolo(p.side); paintInk(p); return; }
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
          if (m && (m.tipo === "texto" || m.etiqueta)) textInput.value = m.texto || "";
        } else sel = null;
        highlight();
        paintInk(p);
        return;
      }
      const origin = draft && draft.side === p.side && draft.pts.length ? draft.pts[draft.pts.length - 1] : null;
      armDrawChrome(true);
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
        if (m.tipo === "angulo" && m.pts.length === 3) m.grados = degrees(m.pts[0], m.pts[1], m.pts[2], boxOf(p));
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
        const box = boxOf(p);
        const dx = (pt.x - draft.pts[0].x) * box.w, dy = (pt.y - draft.pts[0].y) * box.h;
        if (draft.tipo === "cabeza") pt = circlePoint(draft.pts[0], pt, box);
        else if (draft.tipo === "elipse" && Math.abs(Math.abs(dx) - Math.abs(dy)) < 10) pt = circlePoint(draft.pts[0], pt, box);
        else if (draft.tipo === "caja" && Math.abs(Math.abs(dx) - Math.abs(dy)) < 10) pt = circlePoint(draft.pts[0], pt, box);
        draft.pts[1] = pt;
        draft.snap = pt.snap === "c" ? "c" : "";
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
      if (m.tipo === "cabeza" && m.pts[1]) m.snap = "c";
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
      armDrawChrome(false);
      hideLoupes();
      if (drag) { endEdit(); drag = null; paintAll(); return; }
      if (!draft || draft.tipo === "angulo") return;
      finishDraft(p);
    }
    function markKey(name) {
      if (active.kind !== "diagram" && active.kind !== "video") return;
      active.keys[name] = unitNow(active);
      active.fixed[name] = true;
      if (!canSync()) syncOn = false;
      const label = name === "address" ? "Address" : name === "top" ? "Arriba" : "Impacto";
      say(label + " marcado");
      highlight();
    }
    function shiftRange(which) {
      const m = selMark();
      if (!m || m.pin === "all" || active.kind === "image") return;
      const f = frameNow(active);
      const t = active.kind === "video" ? (active.video.currentTime || 0) : f;
      checkpoint();
      if (which === "desde") { m.f0 = f; m.t0 = t; if (m.f1 < m.f0) { m.f1 = m.f0; m.t1 = m.t0; } }
      else { m.f1 = f; m.t1 = t; if (m.f1 < m.f0) { m.f0 = m.f1; m.t0 = m.t1; } }
      m.pin = "range";
      m.auto = false;
      pinMode = "range";
      persist();
      renderList();
      paintAll();
      highlight();
    }

    built.forEach(p => {
      p.video.addEventListener("seeked", () => { paintInk(p); updateScrub(); });
      if (p.kind === "video" && p.blob) bindVideo(p);
      applyMedia(p);
      p.stage.addEventListener("pointerdown", e => onDown(e, p));
      p.stage.addEventListener("pointermove", e => onMove(e, p));
      p.stage.addEventListener("pointerup", e => onUp(e, p));
      p.stage.addEventListener("pointercancel", e => onUp(e, p));
      p.stage.addEventListener("wheel", e => { e.preventDefault(); zoomAt(p, e.clientX, e.clientY, e.deltaY < 0 ? 1.08 : 1 / 1.08); }, { passive: false });
      p.stage.addEventListener("dragover", e => { e.preventDefault(); p.stage.classList.add("over"); });
      p.stage.addEventListener("dragleave", () => p.stage.classList.remove("over"));
      p.stage.addEventListener("drop", e => { e.preventDefault(); p.stage.classList.remove("over"); useFile(p, e.dataTransfer.files && e.dataTransfer.files[0]); });
    });

    function step(dir) {
      stopPlay();
      const p = active;
      if (p.kind === "video") {
        const f = clamp(frameNow(p) + dir, 0, frameLast(p));
        p.video.pause();
        p.video.currentTime = f / fpsOf(p);
      } else if (p.kind === "diagram") setUnit(p, (p.frame + dir + 24) % 24);
      if (syncOn && canSync()) syncTo(p);
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
          if (syncOn && canSync()) syncTo(p);
          built.forEach(paintInk);
          updateScrub();
          if (p.video.ended) stopPlay();
        };
      } else {
        const loop = () => {
          if (!playing) return;
          p.frame = (p.frame + 1) % 24;
          if (syncOn && canSync()) syncTo(p);
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
        if (tool === "cabeza") pinMode = "range";
        draft = null;
        highlight();
        paintAll();
        return;
      }
      const cbtn = e.target.closest("[data-color]");
      if (cbtn) {
        color = cbtn.dataset.color;
        const m = selMark();
        if (m && tool === "mover") { checkpoint(); m.color = color; persist(); paintAll(); }
        highlight();
        return;
      }
      const sideStep = e.target.closest("[data-side-step]");
      if (sideStep) {
        const pane = sideStep.closest(".pane");
        const p = built.find(x => x.side === (pane && pane.dataset.side)) || active;
        setActive(p);
        step(Number(sideStep.dataset.sideStep));
        return;
      }
      const pbtn = e.target.closest("[data-pin]");
      if (pbtn) {
        pinMode = pbtn.dataset.pin;
        const m = selMark();
        if (m && tool === "mover") {
          checkpoint();
          const stamped = stamp(active);
          m.pin = stamped.pin; m.f0 = stamped.f0; m.f1 = stamped.f1; m.t0 = stamped.t0; m.t1 = stamped.t1;
          m.auto = false;
          persist(); renderList(); paintAll();
        }
        highlight();
        return;
      }
      const speed = e.target.closest("[data-speed]");
      if (speed) { rate = Number(speed.dataset.speed); built.forEach(p => { if (p.kind === "video") p.video.playbackRate = rate; }); highlight(); return; }
      const st = e.target.closest("[data-step]");
      if (st) { step(Number(st.dataset.step)); return; }
      if (e.target.id === "play" || e.target.closest("#play")) { togglePlay(); return; }
      const act = e.target.closest("[data-act]");
      if (act) {
        const k = act.dataset.act;
        if (k === "captura") capture();
        else if (k === "volver") restore();
        else if (k === "acercar" || k === "alejar") {
          const r = active.fit.getBoundingClientRect();
          zoomAt(active, r.left + r.width / 2, r.top + r.height / 2, k === "acercar" ? 1.25 : 0.8);
        } else if (k === "ajustar") { active.view = { s: 1, x: 0, y: 0 }; applyView(active); }
        else if (k === "deshacer") undoDo();
        else if (k === "rehacer") redoDo();
        else if (k === "borrar") removeSel();
        else if (k === "limpiar") { checkpoint(); marks = marks.filter(m => m.side !== active.side); sel = null; persist(); renderList(); paintAll(); }
        else if (k === "sync") {
          if (!canSync()) { say("Marcá address, arriba e impacto en los dos lados"); return; }
          syncOn = !syncOn;
          highlight();
        } else if (k === "marcar") markKey(act.dataset.key);
        else if (k === "ir") {
          const name = act.dataset.key;
          if (!active.fixed[name]) return;
          stopPlay();
          setUnit(active, active.keys[name]);
          if (syncOn && canSync()) syncTo(active);
          paintAll();
        } else if (k === "desde") shiftRange("desde");
        else if (k === "hasta") shiftRange("hasta");
        else if (k === "etiqueta") {
          labelOn = !labelOn;
          const m = selMark();
          if (m && (m.tipo === "pies" || m.tipo === "objetivo" || m.tipo === "plano")) {
            checkpoint();
            m.etiqueta = labelOn;
            persist();
            paintAll();
            renderList();
          }
          highlight();
        }         else if (k === "estilo") sheet.hidden = !sheet.hidden;
        else if (k === "menu") { menuOpen = !menuOpen; syncMenu(); }
        else if (k === "riel") root.classList.toggle("riel");
        else if (k === "duracion") { pinOpen = !pinOpen; highlight(); }
        else if (k === "corte") addCutHere();
        else if (k === "solo") {
          const pane = act.closest(".pane");
          if (pane) toggleSolo(pane.dataset.side);
        } else if (k === "juntos") {
          panesEl.classList.remove("solo-a", "solo-b");
          const back = root.querySelector("[data-act=juntos]");
          if (back) back.hidden = true;
          requestAnimationFrame(() => built.forEach(q => { layoutFit(q); paintInk(q); }));
        } else if (k === "marcas") {
          marksPinned = true;
          marksOpen = !marksOpen;
          marksBody.hidden = !marksOpen;
          renderList();
        }
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
    scrub.addEventListener("input", () => {
      stopPlay();
      const f = Number(scrub.value);
      if (active.kind === "video") active.video.currentTime = f / fpsOf(active);
      else setUnit(active, f);
      if (syncOn && canSync()) syncTo(active);
      paintAll();
    });
    sheet.querySelector("#grosor").addEventListener("input", e => {
      sw = Number(e.target.value);
      const m = selMark();
      if (m && tool === "mover") { m.sw = sw; persist(); paintAll(); }
    });
    textInput.addEventListener("input", () => {
      const m = selMark();
      if (m && (m.tipo === "texto" || m.etiqueta)) { m.texto = textInput.value; persist(); paintAll(); renderList(); }
    });
    const op = root.querySelector("#op");
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
    const ro = new ResizeObserver(() => built.forEach(p => { layoutFit(p); if (p.kind === "diagram") drawDiagram(p); paintInk(p); }));
    built.forEach(p => ro.observe(p.stage));
    const onResize = () => {
      const app = document.getElementById("app");
      if (app) app.classList.toggle("desk", window.innerWidth >= 900);
      if (window.innerWidth >= 900) root.classList.remove("dibujando");
      syncMenu();
    };
    window.addEventListener("resize", onResize);
    onResize();

    setActive(built.find(p => p.side === holdSide) || built[0]);
    requestAnimationFrame(() => paintAll());

    return {
      destroy() {
        stopPlay();
        ro.disconnect();
        document.removeEventListener("keydown", onKey);
        window.removeEventListener("resize", onResize);
        const app = document.getElementById("app");
        if (app) { app.classList.remove("desk"); app.classList.remove("archivo"); }
      },
    };
  }

  window.GolfletAnotador = { mount };
})();
