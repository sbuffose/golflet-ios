/* Satellite review for a hole we already have a point for. Zoom stops at 17.
   A click does not invent a green: vertices exist only after the editor places them.
   Cancel restores the hole that was on screen. Nothing here is uploaded. */
(function () {
  const TILE = (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
  const ZMAX = 17;
  function project(lat, lng, z) {
    const n = 2 ** z;
    const x = (lng + 180) / 360 * n;
    const s = Math.sin(lat * Math.PI / 180);
    const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
    return { x, y };
  }
  function unproject(x, y, z) {
    const n = 2 ** z;
    const lng = x / n * 360 - 180;
    const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
    return { lat, lng };
  }
  function mount(el, model) {
    const anchor = model.anchor || model.tee || (model.polygon && model.polygon[0]) || (model.axis && model.axis.center) || null;
    if (!anchor) {
      el.innerHTML = `<div class="tr-miss"><b>Sin punto para abrir el satélite.</b><p>${model.detail || "No hay latitud y longitud de este hoyo en lo que ya tenemos. No centro la foto en un lugar inventado."}</p></div>`;
      return { draft: () => null, cancel() {}, destroy() {} };
    }
    const startTee = model.tee ? { lat: model.tee.lat, lng: model.tee.lng } : null;
    const startRing = (model.draw || []).map(p => ({ lat: p.lat, lng: p.lng }));
    const state = { z: 17, lat: anchor.lat, lng: anchor.lng, tee: startTee ? { ...startTee } : null, ring: startRing.map(p => ({ ...p })), mode: model.canDraw ? "green" : "view" };
    el.innerHTML = `<div class="tr-map" id="trmap"></div><div class="tr-tools"><button type="button" data-z="1">+</button><button type="button" data-z="-1">−</button>${model.canDraw ? '<button type="button" data-mode="green">Contorno</button><button type="button" data-mode="tee">Salida</button><button type="button" data-act="undo">Deshacer punto</button>' : ""}<button type="button" data-act="cancel">Cancelar</button></div><p class="tr-note" id="trnote"></p><p class="tr-copy">${model.credit || "Satélite Esri hasta el zoom 17. Un trazado visual no es un relevamiento ni el pin del día."}</p>`;
    const map = el.querySelector("#trmap");
    const note = el.querySelector("#trnote");
    let drag = null;
    function world(lat, lng) { return project(lat, lng, state.z); }
    function paint() {
      const w = map.clientWidth || 640, h = map.clientHeight || 420;
      const c = world(state.lat, state.lng);
      const originX = c.x * 256 - w / 2, originY = c.y * 256 - h / 2;
      const x0 = Math.floor(originX / 256), y0 = Math.floor(originY / 256);
      const x1 = Math.floor((originX + w) / 256), y1 = Math.floor((originY + h) / 256);
      const n = 2 ** state.z;
      let html = "";
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        if (y < 0 || y >= n) continue;
        const wx = ((x % n) + n) % n;
        html += `<img alt="" draggable="false" src="${TILE(state.z, wx, y)}" style="left:${x * 256 - originX}px;top:${y * 256 - originY}px">`;
      }
      const xy = p => { const q = world(p.lat, p.lng); return [q.x * 256 - originX, q.y * 256 - originY]; };
      const poly = (pts, cls) => pts.length ? `<polygon class="${cls}" points="${pts.map(p => xy(p).join(",")).join(" ")}"/>` : "";
      const dot = (p, cls) => { if (!p) return ""; const [x, y] = xy(p); return `<circle class="${cls}" cx="${x}" cy="${y}" r="6"/>`; };
      const axis = model.axis;
      const axisLine = axis ? `<polyline class="tr-axis" points="${[axis.front, axis.center, axis.back].filter(Boolean).map(p => xy(p).join(",")).join(" ")}"/>` : "";
      html += `<svg class="tr-svg" viewBox="0 0 ${w} ${h}">${poly(model.polygon || [], "tr-osm")}${poly(state.ring, "tr-draw")}${axisLine}${dot(state.tee, "tr-tee")}${(model.polygon || []).length ? "" : state.ring.map(p => dot(p, "tr-vert")).join("")}</svg>`;
      map.innerHTML = html;
      const kind = (model.polygon || []).length >= 3 ? "Contorno que ya estaba. No se reemplaza." : state.ring.length >= 3 ? "Vista previa del trazado visual. Todavía no se guardó." : model.canDraw ? "Marcá el contorno sobre la foto. Cancelar vuelve a cero." : "Solo lectura.";
      note.textContent = kind;
    }
    function at(ev) {
      const r = map.getBoundingClientRect();
      const c = world(state.lat, state.lng);
      const x = (c.x * 256 - (r.width / 2) + (ev.clientX - r.left)) / 256;
      const y = (c.y * 256 - (r.height / 2) + (ev.clientY - r.top)) / 256;
      return unproject(x, y, state.z);
    }
    map.onpointerdown = ev => { drag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, lat: state.lat, lng: state.lng, moved: false }; map.setPointerCapture?.(ev.pointerId); };
    map.onpointermove = ev => {
      if (!drag || drag.id !== ev.pointerId) return;
      const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      const c = world(drag.lat, drag.lng);
      const p = unproject(c.x - dx / 256, c.y - dy / 256, state.z);
      state.lat = p.lat; state.lng = p.lng; paint();
    };
    map.onpointerup = ev => {
      if (!drag || drag.id !== ev.pointerId) return;
      const moved = drag.moved; drag = null;
      if (moved || !model.canDraw) return;
      const p = at(ev);
      if (state.mode === "tee") state.tee = p;
      else state.ring.push(p);
      paint();
    };
    el.querySelectorAll("[data-z]").forEach(b => b.onclick = () => { state.z = Math.max(14, Math.min(ZMAX, state.z + Number(b.dataset.z))); paint(); });
    el.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { state.mode = b.dataset.mode; });
    const undo = el.querySelector("[data-act=undo]"); if (undo) undo.onclick = () => { state.ring.pop(); paint(); };
    const cancel = el.querySelector("[data-act=cancel]");
    cancel.onclick = () => { state.tee = startTee ? { ...startTee } : null; state.ring = startRing.map(p => ({ ...p })); state.lat = anchor.lat; state.lng = anchor.lng; paint(); };
    paint();
    return {
      draft: () => ({ tee: state.tee, green: state.ring.map(p => ({ lat: p.lat, lng: p.lng })) }),
      cancel: () => cancel.click(),
      destroy() { el.innerHTML = ""; },
    };
  }
  window.GolfletTrace = { mount };
})();
