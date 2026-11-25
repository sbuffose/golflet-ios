/* Vista previa estática. Datos ficticios. No llama a la API ni guarda nada en el servidor. */
const KEY = "golflet-profe-preview";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const seed = () => ({
  puntos: {
    pies: "Ancho de hombros. Peso 60/40 hacia el pie izquierdo.",
    postura: "Espalda larga, rodillas blandas, brazos cuelgan.",
    brazo: "Sigue largo hasta la mitad. El codo no se dobla.",
    ritmo: "La subida es lenta. La velocidad aparece al bajar.",
    distancia: "Misma postura. Cambia el largo, no el loft.",
  },
  tareas: [
    { id: "t1", titulo: "20 wedges a 80 m", criterio: "Lista cuando 8 de 10 quedan dentro de 5 m.", hecha: false },
    { id: "t2", titulo: "Pausa de un segundo arriba", criterio: "Lista cuando el palo no se adelanta.", hecha: false },
    { id: "t3", titulo: "Tres distancias: 60, 80 y 100", criterio: "Lista cuando dice la distancia antes de pegar.", hecha: false },
  ],
  segmentos: [
    { hasta: 11, angulo: "frente" },
    { hasta: 23, angulo: "atras" },
  ],
  marcas: [],
  links: [
    { titulo: "Ritmo de wedge", url: "https://www.youtube.com/watch?v=demo-ritmo", tags: ["ritmo", "wedges"] },
    { titulo: "Control de distancia", url: "https://www.instagram.com/p/demo-distancia", tags: ["distancia"] },
  ],
  cuadro: null,
  compare: "antes",
  vista: "lado",
  opacidad: 0.45,
  refUrl: "",
});

let S = load();
function load() {
  try { const raw = sessionStorage.getItem(KEY); if (raw) return { ...seed(), ...JSON.parse(raw) }; } catch { /* sesión nueva */ }
  return seed();
}
function save() { try { sessionStorage.setItem(KEY, JSON.stringify(S)); } catch { /* la vista previa sigue en memoria */ } }

const PUNTO = [
  ["pies", "Pies"],
  ["postura", "Postura"],
  ["brazo", "Brazo izquierdo"],
  ["ritmo", "Ritmo y aceleración"],
  ["distancia", "Control de distancia"],
];

const app = document.getElementById("app");
let raf = 0;
let playing = false;
let frame = 8;
let voz = false;
let clip = "";

function stop() { cancelAnimationFrame(raf); raf = 0; playing = false; }

function shell(back, over, title, body, action) {
  return `${back ? `<div class="bar"><a class="back" href="${back}">Atrás</a><span class="ov">${esc(over)}</span></div>` : `<div class="bar"><span class="ov">${esc(over)}</span></div>`}
    <p class="banner">Vista previa. Alumna y profesor ficticios. Nada se envía a Golflet.</p>
    <div class="main" data-screen="${esc(over)}"><h1>${title}</h1>${body}</div>
    ${action ? `<div class="dock">${action}</div>` : ""}`;
}

function av(name, gold) {
  const ini = name.split(" ").map(p => p[0]).slice(0, 2).join("");
  return `<span class="av${gold ? " gold" : ""}">${esc(ini)}</span>`;
}

function ingreso() {
  return shell("", "Ingreso", "Martín Costa", `
    <p class="lead">Entrás con el link que te mandamos. No hace falta contraseña.</p>
    <div class="card"><b>Invitación</b><p class="note">La manda un admin o un alumno. El link abre esta sesión.</p></div>
    <p class="note">En el iPhone la sesión queda abierta y se confirma con Face ID.</p>`,
    `<a class="btn" href="#/hoy">Entrar</a>`);
}

function hoy() {
  return shell("#/", "Inicio", "Hoy", `
    <p class="lead">Martín Costa · Club Demo Golflet</p>
    <a class="hero" href="#/clase/wedges">
      <span class="when">09:30</span>
      <b>Lucía Vidal</b>
      <span class="tema">Wedges</span>
      <span class="cta">Abrir clase</span>
    </a>
    <a class="row" href="#/clase/salida">${av("Pedro Almeida", true)}<span><span class="nm">11:00 · Pedro Almeida</span><span class="st">Salida</span></span><span class="go">Abrir</span></a>
    <h2>Alumnos</h2>
    <a class="row" href="#/alumno/lucia">${av("Lucía Vidal")}<span><span class="nm">Lucía Vidal</span><span class="st">HI <b class="num">14,2</b> · Baja 0,4 · 18 nov</span><span class="st">Última vuelta · Demo Norte</span></span></a>
    <a class="row" href="#/alumno/pedro">${av("Pedro Almeida", true)}<span><span class="nm">Pedro Almeida</span><span class="st">HI <b class="num">8,6</b> · Sube 0,2 · 12 nov</span><span class="st">Última vuelta · Demo Sur</span></span></a>
    <p class="note"><a href="#/mia">Así lo ve Lucía</a></p>`);
}

function alumno(id) {
  const lucia = id !== "pedro";
  const name = lucia ? "Lucía Vidal" : "Pedro Almeida";
  const hi = lucia ? "14,2" : "8,6";
  const trend = lucia ? `<span class="trend">Baja 0,4</span>` : `<span class="trend up">Sube 0,2</span>`;
  const when = lucia ? "18 nov 2026" : "12 nov 2026";
  const course = lucia ? "Demo Norte" : "Demo Sur";
  const dist = lucia
    ? `<div class="grid"><div class="stat"><b class="num">118</b><span>PW · m</span></div><div class="stat"><b class="num">104</b><span>GW · m</span></div><div class="stat"><b class="num">88</b><span>SW · m</span></div><div class="stat"><b class="num">72</b><span>LW · m</span></div></div>`
    : `<div class="card">– <span class="note">Pedro no compartió distancias de palos.</span></div>`;
  const clases = lucia
    ? `<a class="row" href="#/clase/wedges"><span><span class="nm">25 nov · Wedges</span><span class="st">Concepto marcado</span></span><span class="go">Abrir</span></a>
       <div class="row"><span><span class="nm">11 nov · Grip</span><span class="st">Clase anterior</span></span></div>`
    : `<div class="card">– <span class="note">Todavía no hay una clase cargada.</span></div>`;
  const tareas = lucia
    ? S.tareas.map(t => `<div class="task"><b>${esc(t.titulo)}</b><p>${esc(t.criterio)}</p>${t.hecha ? `<p>La marcó hecha.</p>` : ""}</div>`).join("")
    : `<div class="card">–</div>`;
  return shell("#/hoy", "Alumno", name, `
    <div class="card hi"><div><div class="k">Handicap Index</div><div class="big num">${hi}</div></div><div>${trend}<div class="st">${when}</div><div class="st">${course}</div></div></div>
    <h2>Lo que comparte de sus vueltas</h2>
    ${dist}
    <p class="note">Tee times no se comparten.</p>
    <h2>Clases previas</h2>
    ${clases}
    <h2>Tareas</h2>
    ${tareas}`,
    lucia ? `<a class="btn" href="#/clase/wedges">Abrir la clase de hoy</a>` : "");
}

function clase(id) {
  const salida = id === "salida";
  const titulo = salida ? "Salida" : "Wedges";
  const quien = salida ? "Pedro Almeida" : "Lucía Vidal";
  const concepto = salida
    ? "La cara mira al objetivo. El cuerpo gira, no se desliza."
    : "El loft hace el vuelo. El cuerpo marca la distancia.";
  const puntos = salida ? PUNTO.slice(0, 2) : PUNTO;
  return shell(`#/alumno/${salida ? "pedro" : "lucia"}`, "Clase", titulo, `
    <p class="lead">${esc(quien)} · 25 nov 2026</p>
    <div class="concepto"><span>Concepto</span><p>${esc(concepto)}</p></div>
    <h2>Puntos</h2>
    ${puntos.map(([k, label]) => `<label class="fld"><span>${esc(label)}</span><textarea data-punto="${k}">${esc(S.puntos[k] || "")}</textarea></label>`).join("")}
    <h2>Adjuntos</h2>
    <div class="thumbs">
      <a class="thumb" href="#/video/frente"><canvas data-mini="frente" width="320" height="180"></canvas><span class="cap">De frente</span></a>
      <a class="thumb" href="#/video/atras"><canvas data-mini="atras" width="320" height="180"></canvas><span class="cap">Desde atrás</span></a>
    </div>
    <p class="note">${S.marcas.length ? `${S.marcas.length} marcas guardadas en el video.` : "Las marcas del video quedan en la clase."}</p>
    <h2>Para practicar</h2>
    ${(salida ? S.tareas.slice(0, 1) : S.tareas).map((t, i) => `<div class="task"><b>${i + 1}. ${esc(t.titulo)}</b><p>${esc(t.criterio)}</p></div>`).join("")}
    <p class="note"><a href="#/biblioteca">Elegir de la biblioteca</a></p>`,
    `<a class="btn" href="#/video/${salida ? "salida" : "frente"}">Ver el video</a>`);
}

function video(which) {
  if (clip !== which) {
    clip = which;
    frame = which === "atras" ? 16 : 4;
  }
  const ang = anguloDe(frame);
  return shell("#/clase/wedges", "Video", "Wedge de Lucía", `
    <p class="lead">Diagrama de demostración. No es una persona.</p>
    <div class="stage-wrap"><canvas id="stage" width="720" height="900"></canvas></div>
    <div class="seg" role="group" aria-label="Tramo">
      <button type="button" data-tramo="frente" class="${ang === "frente" ? "on" : ""}">De frente</button>
      <button type="button" data-tramo="atras" class="${ang === "atras" ? "on" : ""}">Desde atrás</button>
    </div>
    <div class="seg">
      <button type="button" data-speed="0.25">Lento</button>
      <button type="button" data-speed="1">Normal</button>
      <button type="button" id="play">Reproducir</button>
      <button type="button" data-step="-1">Anterior</button>
      <button type="button" data-step="1">Siguiente</button>
      <button type="button" id="crop" class="${S.crop ? "on" : ""}">Recorte</button>
    </div>
    <div class="tools" role="group" aria-label="Dibujo">
      ${["linea", "flecha", "circulo", "angulo", "texto", "eje"].map(t => `<button type="button" data-tool="${t}" class="${(S.tool || "linea") === t ? "on" : ""}">${etiqueta(t)}</button>`).join("")}
    </div>
    <label class="fld" id="texto-box" ${S.tool === "texto" ? "" : "hidden"}><span>Texto de la marca</span><input id="texto" type="text" maxlength="80" value="${esc(S.texto || "")}"></label>
    <div class="marks" id="marks">${marcasHtml()}</div>
    <div class="voz"><button type="button" id="voz" aria-label="Reproducir la nota de voz">Voz</button><div><b>Nota de Martín</b><div class="st">0:18 · el concepto de la clase</div><div class="bars${voz ? " play" : ""}">${"<span></span>".repeat(12)}</div></div></div>
    <p class="note"><a href="#/comparar">Comparar este clip</a></p>`,
    `<button class="btn" type="button" id="guardar">Guardar marcas</button>`);
}

function comparar() {
  const sobre = S.vista === "sobre";
  const ref = S.compare === "referencia";
  return shell("#/video/frente", "Comparar", "Comparar", `
    <div class="seg">
      <button type="button" data-vista="lado" class="${S.vista === "lado" ? "on" : ""}">Lado a lado</button>
      <button type="button" data-vista="sobre" class="${sobre ? "on" : ""}">Superpuesto</button>
    </div>
    <div class="seg">
      <button type="button" data-compare="antes" class="${S.compare === "antes" ? "on" : ""}">Antes y después</button>
      <button type="button" data-compare="profe" class="${S.compare === "profe" ? "on" : ""}">Clip de Martín</button>
      <button type="button" data-compare="referencia" class="${ref ? "on" : ""}">Referencia</button>
    </div>
    ${ref ? referenciaHtml() : parHtml(sobre)}
    ${sobre && !ref ? `<label class="op">Opacidad <input id="op" type="range" min="0.15" max="0.9" step="0.05" value="${S.opacidad}"></label>` : ""}
    <div class="seg"><button type="button" id="sync">Mover los dos juntos</button></div>
    <p class="note">El video externo se abre en su sitio. No lo descargamos ni lo guardamos. Para dibujar, tomamos un cuadro.</p>`,
    `<button class="btn" type="button" id="usar">Usar en la clase</button>`);
}

function parHtml(sobre) {
  if (sobre) {
    return `<div class="over stage-wrap"><canvas id="a" width="720" height="900"></canvas><canvas id="b" class="top" width="720" height="900"></canvas></div>`;
  }
  return `<div class="pair"><div class="stage-wrap"><canvas id="a" width="640" height="800"></canvas></div><div class="stage-wrap"><canvas id="b" width="640" height="800"></canvas></div></div>`;
}

function referenciaHtml() {
  const id = youtubeId(S.refUrl);
  const frame = S.cuadro ? `<div class="stage-wrap"><canvas id="cuadro" width="720" height="900"></canvas></div><p class="note">Cuadro tomado. El video sigue en su sitio.</p>` : "";
  const embed = id ? `<div class="stage-wrap"><iframe title="Referencia en YouTube" src="https://www.youtube-nocookie.com/embed/${esc(id)}" style="width:100%;aspect-ratio:16/9;border:0" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>` : "";
  return `<label class="fld"><span>Link de YouTube o Instagram</span><input id="ref" type="url" inputmode="url" placeholder="https://" value="${esc(S.refUrl)}"></label>
    ${embed}${frame}
    <div class="seg"><button type="button" id="tomar">Tomar cuadro</button></div>`;
}

function biblioteca() {
  const clips = [
    ["frente", "Wedge de frente", "wedges · de frente"],
    ["atras", "Wedge desde atrás", "wedges · desde atrás"],
    ["salida", "Salida de Martín", "driver · clip propio"],
  ];
  return shell("#/clase/wedges", "Biblioteca", "Biblioteca", `
    <h2>Clips propios</h2>
    ${clips.map(([id, t, tags]) => `<a class="row" href="#/video/${id}">${av(t)}<span><span class="nm">${esc(t)}</span><span class="st">${esc(tags)}</span></span></a>`).join("")}
    <h2>Referencias</h2>
    ${S.links.map(l => `<div class="card"><b>${esc(l.titulo)}</b><p class="note">${esc(l.url)}</p>${l.tags.map(t => `<span class="tag">${esc(t)}</span>`).join("")}</div>`).join("")}
    <h2>Agregar un link</h2>
    <label class="fld"><span>Título</span><input id="lt" type="text" maxlength="80"></label>
    <label class="fld"><span>Link</span><input id="lu" type="url" inputmode="url" placeholder="https://"></label>
    <label class="fld"><span>Etiquetas, separadas por coma</span><input id="lg" type="text" maxlength="80" placeholder="wedges, ritmo"></label>`,
    `<button class="btn" type="button" id="addlink">Guardar en la biblioteca</button>`);
}

function mia() {
  return shell("#/hoy", "Lucía", "Tu clase de wedges", `
    <div class="concepto"><span>Concepto</span><p>El loft hace el vuelo. El cuerpo marca la distancia.</p></div>
    <h2>Para practicar</h2>
    ${S.tareas.map(t => `<div class="task"><b>${esc(t.titulo)}</b><p>${esc(t.criterio)}</p><button type="button" class="ok${t.hecha ? " on" : ""}" data-done="${t.id}">${t.hecha ? "Hecha" : "Marcar hecha"}</button></div>`).join("")}
    <h2>Video de práctica</h2>
    <div class="card" id="prac">${S.practica ? `<b>Video elegido</b><p class="note">Queda en este aparato. No se sube.</p>` : `<b>–</b><p class="note">Todavía no hay un video de práctica.</p>`}</div>
    <input id="file" type="file" accept="video/*" hidden>`,
    `<button class="btn" type="button" id="subir">Subir video de práctica</button>`);
}

function marcasHtml() {
  if (!S.marcas.length) return `<p class="note">Todavía no hay marcas.</p>`;
  return S.marcas.map((m, i) => `<div class="mark"><input data-mark="${i}" value="${esc(m.texto || etiqueta(m.tipo))}" aria-label="Marca ${i + 1}"><span class="st">${m.angulo === "atras" ? "Desde atrás" : "De frente"}</span><button type="button" data-del="${i}">Quitar</button></div>`).join("");
}

function etiqueta(t) {
  return { linea: "Línea", flecha: "Flecha", circulo: "Círculo", angulo: "Ángulo", texto: "Texto", eje: "Eje" }[t] || t;
}

function youtubeId(url) {
  const m = String(url || "").match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : "";
}

function anguloDe(f) {
  return f <= S.segmentos[0].hasta ? S.segmentos[0].angulo : S.segmentos[1].angulo;
}

function render() {
  stop();
  document.querySelectorAll(".toast").forEach(n => n.remove());
  const p = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const [a, b] = p;
  let html = ingreso();
  if (a === "hoy") html = hoy();
  else if (a === "alumno") html = alumno(b || "lucia");
  else if (a === "clase") html = clase(b || "wedges");
  else if (a === "video") html = video(b || "frente");
  else if (a === "comparar") html = comparar();
  else if (a === "biblioteca") html = biblioteca();
  else if (a === "mia") html = mia();
  app.innerHTML = html;
  document.querySelectorAll("[data-mini]").forEach(c => drawSwing(c.getContext("2d"), c.width, c.height, c.dataset.mini === "atras" ? 16 : 6, c.dataset.mini));
  const stage = document.getElementById("stage");
  if (stage) bindStage(stage);
  ["a", "b", "cuadro"].forEach(id => {
    const c = document.getElementById(id);
    if (!c) return;
    const mode = id === "b" ? (S.compare === "profe" ? "profe" : "antes") : (id === "cuadro" ? "frente" : "frente");
    const fr = id === "b" && S.compare === "antes" ? Math.max(0, frame - 10) : frame;
    drawSwing(c.getContext("2d"), c.width, c.height, fr, mode);
    if (id === "b" && S.vista === "sobre") c.style.opacity = String(S.opacidad);
    if (id === "cuadro") drawMarks(c.getContext("2d"), c.width, c.height);
  });
}

function bindStage(canvas) {
  const ctx = canvas.getContext("2d");
  const paint = () => {
    drawSwing(ctx, canvas.width, canvas.height, frame, anguloDe(frame));
    if (S.crop) crop(ctx, canvas.width, canvas.height);
    drawMarks(ctx, canvas.width, canvas.height);
  };
  paint();
  const loop = () => {
    if (!playing) return;
    frame = (frame + 1) % 24;
    paint();
    raf = requestAnimationFrame(() => setTimeout(loop, S.speed === 0.25 ? 140 : 50));
  };
  canvas.onpointerdown = e => startDraw(canvas, e);
  canvas.onpointermove = e => moveDraw(canvas, e);
  canvas.onpointerup = () => endDraw();
  app.dataset.loop = "1";
  app._loop = loop;
}

let draft = null;
function pos(canvas, e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
}
function startDraw(canvas, e) {
  const p = pos(canvas, e);
  const tipo = S.tool || "linea";
  if (tipo === "angulo") {
    S._pts = S._pts || [];
    S._pts.push(p);
    if (S._pts.length === 3) {
      S.marcas.push({ tipo, pts: S._pts, angulo: anguloDe(frame), texto: "Ángulo" });
      S._pts = [];
      save();
      render();
    }
    return;
  }
  if (tipo === "texto") {
    S.marcas.push({ tipo, pts: [p], angulo: anguloDe(frame), texto: S.texto || "Nota" });
    save();
    render();
    return;
  }
  draft = { tipo, pts: [p, p], angulo: anguloDe(frame), texto: etiqueta(tipo) };
  canvas.setPointerCapture(e.pointerId);
}
function moveDraw(canvas, e) {
  if (!draft) return;
  draft.pts[1] = pos(canvas, e);
  const ctx = canvas.getContext("2d");
  drawSwing(ctx, canvas.width, canvas.height, frame, anguloDe(frame));
  if (S.crop) crop(ctx, canvas.width, canvas.height);
  drawMarks(ctx, canvas.width, canvas.height);
  trace(ctx, canvas.width, canvas.height, draft);
}
function endDraw() {
  if (!draft) return;
  S.marcas.push(draft);
  draft = null;
  save();
  render();
}

function drawMarks(ctx, w, h) {
  S.marcas.filter(m => m.angulo === anguloDe(frame) || m.angulo === "frente" && anguloDe(frame) === "frente" || m.angulo === "atras" && anguloDe(frame) === "atras").forEach(m => trace(ctx, w, h, m));
}
function trace(ctx, w, h, m) {
  const X = n => n * w, Y = n => n * h;
  ctx.save();
  ctx.lineWidth = m.tipo === "eje" ? 4 : 3;
  ctx.strokeStyle = m.tipo === "eje" ? "#C8A86A" : "#C8102E";
  ctx.fillStyle = "#C8102E";
  ctx.lineCap = "round";
  const a = m.pts[0], b = m.pts[1] || m.pts[0];
  if (m.tipo === "circulo") {
    const r = Math.hypot(X(b.x) - X(a.x), Y(b.y) - Y(a.y));
    ctx.beginPath(); ctx.arc(X(a.x), Y(a.y), Math.max(8, r), 0, Math.PI * 2); ctx.stroke();
  } else if (m.tipo === "angulo" && m.pts.length === 3) {
    ctx.beginPath(); ctx.moveTo(X(m.pts[0].x), Y(m.pts[0].y)); ctx.lineTo(X(m.pts[1].x), Y(m.pts[1].y)); ctx.lineTo(X(m.pts[2].x), Y(m.pts[2].y)); ctx.stroke();
  } else if (m.tipo === "texto") {
    ctx.font = "600 28px Geist, sans-serif";
    ctx.fillText(m.texto || "Nota", X(a.x), Y(a.y));
  } else {
    ctx.beginPath(); ctx.moveTo(X(a.x), Y(a.y)); ctx.lineTo(X(b.x), Y(b.y)); ctx.stroke();
    if (m.tipo === "flecha") head(ctx, X(a.x), Y(a.y), X(b.x), Y(b.y));
  }
  ctx.restore();
}
function head(ctx, x1, y1, x2, y2) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - 16 * Math.cos(a - 0.4), y2 - 16 * Math.sin(a - 0.4));
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - 16 * Math.cos(a + 0.4), y2 - 16 * Math.sin(a + 0.4));
  ctx.stroke();
}
function crop(ctx, w, h) {
  const x = w * 0.18, y = h * 0.12, rw = w * 0.64, rh = h * 0.7;
  ctx.fillStyle = "rgba(11,37,69,.55)";
  ctx.fillRect(0, 0, w, y);
  ctx.fillRect(0, y + rh, w, h - y - rh);
  ctx.fillRect(0, y, x, rh);
  ctx.fillRect(x + rw, y, w - x - rw, rh);
  ctx.strokeStyle = "#C8A86A";
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, rw, rh);
}

function drawSwing(ctx, w, h, fr, mode) {
  const t = (fr % 24) / 23;
  const back = t < 0.45 ? ease(t / 0.45) : 1;
  const thru = t < 0.45 ? 0 : ease((t - 0.45) / 0.55);
  const ang = 1.15 + back * -2.5 + thru * 3.5 + (mode === "antes" ? 0.35 : 0) + (mode === "profe" ? -0.25 : 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0B2545";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#13315C";
  ctx.fillRect(0, h * 0.72, w, h * 0.28);
  ctx.strokeStyle = "#C8A86A";
  ctx.lineWidth = Math.max(2, w / 180);
  ctx.beginPath();
  ctx.moveTo(w * 0.08, h * 0.78);
  ctx.lineTo(w * 0.92, h * 0.78);
  ctx.stroke();
  const cx = w * (mode === "atras" ? 0.48 : 0.5);
  const ground = h * 0.78;
  const lean = (thru - back * 0.3) * w * 0.04;
  const hip = { x: cx + lean * 0.3, y: ground - h * 0.16 };
  const sh = { x: cx + lean, y: ground - h * 0.36 };
  const head = { x: sh.x + (mode === "atras" ? w * 0.02 : -w * 0.015), y: sh.y - h * 0.07 };
  ctx.strokeStyle = "#F6F7F9";
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(4, w / 90);
  seg(ctx, hip, { x: cx - w * 0.06, y: ground });
  seg(ctx, hip, { x: cx + w * 0.07, y: ground });
  seg(ctx, hip, sh);
  ctx.beginPath();
  ctx.arc(head.x, head.y, Math.max(10, w * 0.035), 0, Math.PI * 2);
  ctx.stroke();
  const hand = { x: sh.x + Math.cos(ang) * w * 0.16, y: sh.y + Math.sin(ang) * h * 0.14 };
  const hand2 = { x: sh.x + Math.cos(ang + 0.15) * w * 0.15, y: sh.y + Math.sin(ang + 0.15) * h * 0.13 };
  seg(ctx, sh, hand);
  if (mode !== "atras") seg(ctx, sh, hand2);
  ctx.strokeStyle = mode === "profe" ? "#C8A86A" : "#C8102E";
  const club = { x: hand.x + Math.cos(ang) * w * 0.22, y: hand.y + Math.sin(ang) * h * 0.2 };
  seg(ctx, hand, club);
  if (t < 0.62) {
    ctx.fillStyle = "#F6F7F9";
    ctx.beginPath();
    ctx.arc(cx + w * 0.1, ground - h * 0.018, Math.max(5, w * 0.018), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#C8A86A";
  ctx.font = `600 ${Math.max(14, w / 28)}px Geist, sans-serif`;
  const label = mode === "atras" || anguloSafe(mode) === "atras" ? "Desde atrás" : mode === "profe" ? "Clip de Martín" : mode === "antes" ? "Antes" : "De frente";
  const low = mode === "antes" || mode === "profe";
  ctx.fillText(label, w * 0.06, low ? h * 0.95 : h * 0.08);
}
function anguloSafe(mode) { return mode === "atras" ? "atras" : "frente"; }
function ease(n) { return n * n * (3 - 2 * n); }
function seg(ctx, a, b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }

function toast(t) {
  const n = document.createElement("div");
  n.className = "toast";
  n.textContent = t;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 1600);
}

app.addEventListener("click", e => {
  const tool = e.target.closest("[data-tool]");
  if (tool) { S.tool = tool.dataset.tool; save(); render(); return; }
  const tramo = e.target.closest("[data-tramo]");
  if (tramo) {
    const i = frame <= S.segmentos[0].hasta ? 0 : 1;
    S.segmentos[i].angulo = tramo.dataset.tramo;
    save(); render(); return;
  }
  if (e.target.id === "play") {
    playing = !playing;
    if (playing && app._loop) app._loop();
    e.target.textContent = playing ? "Pausa" : "Reproducir";
    return;
  }
  const step = e.target.closest("[data-step]");
  if (step) { playing = false; frame = (frame + 24 + Number(step.dataset.step)) % 24; render(); return; }
  if (e.target.dataset.speed) { S.speed = Number(e.target.dataset.speed); save(); return; }
  if (e.target.id === "crop") { S.crop = !S.crop; save(); render(); return; }
  if (e.target.id === "guardar") { save(); toast("Marcas guardadas"); return; }
  if (e.target.id === "voz") { voz = !voz; render(); return; }
  const del = e.target.closest("[data-del]");
  if (del) { S.marcas.splice(Number(del.dataset.del), 1); save(); render(); return; }
  const vista = e.target.closest("[data-vista]");
  if (vista) { S.vista = vista.dataset.vista; save(); render(); return; }
  const cmp = e.target.closest("[data-compare]");
  if (cmp) { S.compare = cmp.dataset.compare; save(); render(); return; }
  if (e.target.id === "sync") { frame = (frame + 1) % 24; render(); return; }
  if (e.target.id === "tomar") {
    S.cuadro = { frame, compare: S.compare };
    save(); toast("Cuadro tomado"); render(); return;
  }
  if (e.target.id === "usar") { toast("Quedó en la clase"); location.hash = "#/clase/wedges"; return; }
  if (e.target.id === "addlink") {
    const titulo = document.getElementById("lt").value.trim();
    const url = document.getElementById("lu").value.trim();
    const tags = document.getElementById("lg").value.split(",").map(x => x.trim()).filter(Boolean);
    if (titulo.length < 2 || !/^https:\/\//.test(url)) { toast("Falta el título o el link"); return; }
    S.links.push({ titulo, url, tags });
    save(); toast("Link guardado"); render(); return;
  }
  const done = e.target.closest("[data-done]");
  if (done) {
    const t = S.tareas.find(x => x.id === done.dataset.done);
    if (t) t.hecha = !t.hecha;
    save(); render(); return;
  }
  if (e.target.id === "subir") document.getElementById("file").click();
});

app.addEventListener("input", e => {
  if (e.target.dataset.punto) { S.puntos[e.target.dataset.punto] = e.target.value; save(); }
  if (e.target.dataset.mark != null) { S.marcas[Number(e.target.dataset.mark)].texto = e.target.value; save(); }
  if (e.target.id === "texto") { S.texto = e.target.value; save(); }
  if (e.target.id === "op") {
    S.opacidad = Number(e.target.value);
    const b = document.getElementById("b");
    if (b) b.style.opacity = String(S.opacidad);
    save();
  }
  if (e.target.id === "ref") { S.refUrl = e.target.value.trim(); save(); }
});

app.addEventListener("change", e => {
  if (e.target.id === "file") {
    S.practica = true;
    e.target.value = "";
    save();
    toast("Queda en este aparato");
    render();
  }
});

addEventListener("hashchange", render);
if (!location.hash) location.hash = "#/";
render();
