/* Per-hole quick stats. Same rules as web/lib/quick-stats.ts.
   A partial sample never becomes the round total, and an older rev never wins. */
(function (root) {
  var DRIVES = { left: 1, fairway: 1, right: 1, other: 1, hit: 1 };
  function has(body, key) { return Object.prototype.hasOwnProperty.call(body || {}, key); }
  function noteFields(marks, holes) {
    var by = {};
    (marks || []).forEach(function (mark) { by[mark.hole] = mark; });
    var card = (holes || []).filter(function (h) { return h && h.hole >= 1 && h.hole <= 18; });
    var out = {};
    if (card.length && card.every(function (h) { return by[h.hole] && by[h.hole].putts != null; })) {
      out.putts = String(card.reduce(function (sum, h) { return sum + by[h.hole].putts; }, 0));
    }
    if (card.length && card.every(function (h) { var g = by[h.hole] && by[h.hole].gir; return g === true || g === false; })) {
      out.gir = String(card.filter(function (h) { return by[h.hole].gir === true; }).length);
    }
    var firHoles = card.filter(function (h) { return h.par != null && h.par !== 3; });
    if (firHoles.length && firHoles.every(function (h) { return by[h.hole] && DRIVES[by[h.hole].drive]; })) {
      out.fir = String(firHoles.filter(function (h) { var d = by[h.hole].drive; return d === "fairway" || d === "hit"; }).length);
    }
    return out;
  }
  function parseCount(v, max) {
    if (v === null || v === undefined || v === "") return null;
    var n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > max) throw new Error("Valor inválido");
    return n;
  }
  function mergeNote(existing, body) {
    var src = body && typeof body === "object" ? body : {};
    var next = { putts: existing.putts ?? null, gir: existing.gir ?? null, fir: existing.fir ?? null, notes: existing.notes ?? null };
    if (has(src, "putts")) next.putts = parseCount(src.putts, 99);
    if (has(src, "gir")) next.gir = parseCount(src.gir, 18);
    if (has(src, "fir")) next.fir = parseCount(src.fir, 18);
    if (has(src, "notes")) next.notes = src.notes == null ? null : String(src.notes).slice(0, 10000);
    return next;
  }
  function canonDrive(v) {
    if (v == null || v === "") return null;
    var s = String(v);
    if (!DRIVES[s]) throw new Error("Salida inválida");
    return s === "hit" ? "fairway" : s;
  }
  function applyMark(stored, incoming) {
    var hole = Number(incoming.hole), rev = Number(incoming.rev);
    if (!Number.isInteger(hole) || hole < 1 || hole > 18) throw new Error("Hoyo inválido");
    if (!Number.isInteger(rev) || rev < 1 || rev > 1000000) throw new Error("Versión inválida");
    if (stored && rev < stored.rev) return { mark: stored, applied: false };
    return { mark: {
      hole: hole,
      putts: has(incoming, "putts") ? (incoming.putts == null || incoming.putts === "" ? null : Number(incoming.putts)) : (stored ? stored.putts : null),
      gir: has(incoming, "gir") ? (incoming.gir == null || incoming.gir === "" ? null : incoming.gir) : (stored ? stored.gir : null),
      drive: has(incoming, "drive") ? canonDrive(incoming.drive) : (stored ? stored.drive : null),
      rev: rev
    }, applied: true };
  }
  function shouldCommit(sentRev, latestRev, responseRev) {
    return sentRev === latestRev && responseRev === sentRev;
  }
  function accountView(totals, marks, holes) {
    return { totals: totals, fields: noteFields(marks, holes) };
  }
  root.GolfletQuick = { noteFields: noteFields, mergeNote: mergeNote, applyMark: applyMark, shouldCommit: shouldCommit, accountView: accountView };
})(typeof window !== "undefined" ? window : globalThis);
