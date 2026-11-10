/* Shared square crop for the player and the group. Confirm exports a 512 JPEG.
   Cancel resolves null and uploads nothing. A file the browser cannot decode rejects before the dialog. */
(function () {
  function fail(file) {
    if (!file) return "Elegí una foto. La anterior sigue igual.";
    const type = String(file.type || "").toLowerCase();
    const name = String(file.name || "").toLowerCase();
    if (!(type.startsWith("image/") || /\.(jpe?g|png|webp|gif|heic|heif|bmp|tiff?)$/.test(name))) return "Solo imágenes. Elegí un JPG, PNG o HEIC. La anterior sigue igual.";
    if (file.size > 12 * 1024 * 1024) return "La foto pesa más de 12 MB. Elegí una más chica. La anterior sigue igual.";
    return "";
  }
  function decode(file) {
    const why = fail(file);
    if (why) return Promise.reject(new Error(why));
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No pudimos leer esta foto en el navegador. Probá con un JPG o PNG. La anterior sigue igual.")); };
      img.src = url;
    });
  }
  function open(file) {
    return decode(file).then(img => new Promise((resolve, reject) => {
      const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      if (!w || !h) { reject(new Error("No pudimos leer esta foto. La anterior sigue igual.")); return; }
      const host = document.createElement("div");
      host.className = "pc";
      host.innerHTML = `<div class="pc-sheet" role="dialog" aria-label="Recortar foto"><div class="pc-stage" id="pcstage"></div><label class="pc-zoom">Zoom <input id="pc-zoom" type="range" min="1" max="3" step="0.01" value="1"></label><div class="pc-acts"><button type="button" class="btn ghost" id="pc-cancel">Cancelar</button><button type="button" class="btn" id="pc-ok">Usar esta foto</button></div></div>`;
      document.body.appendChild(host);
      const stage = host.querySelector("#pcstage");
      const canvas = document.createElement("canvas");
      stage.appendChild(canvas);
      const zoom = host.querySelector("#pc-zoom");
      let scale = 1, ox = 0, oy = 0, drag = null, pointers = new Map();
      function layout() {
        const s = stage.clientWidth || 280;
        canvas.width = s; canvas.height = s;
        const ctx = canvas.getContext("2d");
        const base = Math.max(s / w, s / h) * scale;
        const dw = w * base, dh = h * base;
        ctx.fillStyle = "#0B2545";
        ctx.fillRect(0, 0, s, s);
        ctx.drawImage(img, (s - dw) / 2 + ox, (s - dh) / 2 + oy, dw, dh);
      }
      function close(result) { host.remove(); document.documentElement.classList.remove("pc-open"); resolve(result); }
      host.querySelector("#pc-cancel").onclick = () => close(null);
      host.querySelector("#pc-ok").onclick = () => {
        const out = document.createElement("canvas");
        out.width = 512; out.height = 512;
        const ctx = out.getContext("2d");
        const s = canvas.width || 1;
        ctx.drawImage(canvas, 0, 0, s, s, 0, 0, 512, 512);
        out.toBlob(blob => { if (!blob) { host.remove(); document.documentElement.classList.remove("pc-open"); reject(new Error("No pudimos preparar la foto. La anterior sigue igual.")); return; } close(blob); }, "image/jpeg", 0.82);
      };
      zoom.oninput = () => { scale = Number(zoom.value) || 1; layout(); };
      stage.onpointerdown = ev => { pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY }); stage.setPointerCapture?.(ev.pointerId); drag = { x: ev.clientX, y: ev.clientY, ox, oy }; };
      stage.onpointermove = ev => {
        if (!pointers.has(ev.pointerId)) return;
        pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
        if (pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
          if (!stage._pinch) stage._pinch = { dist, scale };
          scale = Math.max(1, Math.min(3, stage._pinch.scale * dist / stage._pinch.dist));
          zoom.value = String(scale);
          layout();
          return;
        }
        if (!drag) return;
        ox = drag.ox + (ev.clientX - drag.x);
        oy = drag.oy + (ev.clientY - drag.y);
        layout();
      };
      stage.onpointerup = stage.onpointercancel = ev => { pointers.delete(ev.pointerId); if (pointers.size < 2) stage._pinch = null; if (!pointers.size) drag = null; };
      document.documentElement.classList.add("pc-open");
      requestAnimationFrame(layout);
    }));
  }
  window.GolfletCrop = { open };
})();
