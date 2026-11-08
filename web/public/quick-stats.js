/* Per-hole quick stats. Same rules as web/lib/quick-stats.ts.
   A partial sample never becomes the round total.
   The same rev is idempotent only when the payload matches. A clear keeps its rev. */
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
  function puttsOf(v) {
    if (v == null || v === "") return null;
    var n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 6) throw new Error("Putts inválidos");
    return n;
  }
  function girOf(v) {
    if (v == null || v === "") return null;
    if (v === true || v === false) return v;
    throw new Error("Green inválido");
  }
  function samePayload(a, b) {
    return a.hole === b.hole && a.putts === b.putts && a.gir === b.gir && a.drive === b.drive;
  }
  function applyMark(stored, incoming, card) {
    var hole = Number(incoming.hole), rev = Number(incoming.rev);
    if (!Number.isInteger(hole) || hole < 1 || hole > 18) throw new Error("Hoyo inválido");
    if (!Number.isInteger(rev) || rev < 1 || rev > 1000000) throw new Error("Versión inválida");
    var onCard = null;
    (card || []).forEach(function (h) { if (h && h.hole === hole) onCard = h; });
    if (!onCard) throw new Error("Ese hoyo no está en la tarjeta");
    var mark = {
      hole: hole,
      putts: has(incoming, "putts") ? puttsOf(incoming.putts) : (stored ? stored.putts : null),
      gir: has(incoming, "gir") ? girOf(incoming.gir) : (stored ? stored.gir : null),
      drive: has(incoming, "drive") ? canonDrive(incoming.drive) : (stored ? stored.drive : null),
      rev: rev
    };
    if (onCard.par === 3 && mark.drive) throw new Error("Un par 3 no lleva fairway");
    if (!stored) return { mark: mark, applied: true, conflict: null, idempotent: false };
    if (rev < stored.rev) return { mark: stored, applied: false, conflict: "stale", idempotent: false };
    if (rev === stored.rev) {
      if (samePayload(mark, stored)) return { mark: stored, applied: true, conflict: null, idempotent: true };
      return { mark: stored, applied: false, conflict: "revision", idempotent: false };
    }
    return { mark: mark, applied: true, conflict: null, idempotent: false };
  }
  function nextHoleRev(storedRev) {
    var n = Number(storedRev);
    if (!Number.isInteger(n) || n < 1) return 1;
    return n + 1;
  }
  function seedHoleRevs(marks) {
    var out = {};
    (marks || []).forEach(function (mark) {
      var hole = Number(mark && mark.hole), rev = Number(mark && mark.rev);
      if (Number.isInteger(hole) && Number.isInteger(rev) && rev >= 1) out[String(hole)] = rev;
    });
    return out;
  }
  function planHoleSend(revs, hole, alreadyRev) {
    var frozen = Number(alreadyRev);
    if (Number.isInteger(frozen) && frozen >= 1) return frozen;
    var table = revs || {};
    return nextHoleRev(table[String(hole)]);
  }
  function mergeAccountHole(account, local) {
    var touched = (local && local.touched) || {};
    return {
      hole: local.hole,
      putts: touched.putts ? local.putts : (account ? account.putts ?? null : null),
      gir: touched.gir ? local.gir : (account ? account.gir ?? null : null),
      drive: touched.drive ? local.drive : (account ? account.drive ?? null : null)
    };
  }
  function absorbAccountMarks(marks, locals) {
    var by = {};
    (marks || []).forEach(function (mark) { by[mark.hole] = mark; });
    var revs = seedHoleRevs(marks);
    var holes = (locals || []).map(function (local) {
      var merged = mergeAccountHole(by[local.hole] || null, local);
      merged.rev = planHoleSend(revs, local.hole, 0);
      return merged;
    });
    return { holes: holes, revs: revs };
  }
  function sendDecision(accountReady, stillHere) {
    if (!accountReady || !stillHere) return "hold";
    return "send";
  }
  function interpretSave(sentRev, response) {
    if (!response || response.conflict === "revision" || response.conflict === "stale") return "conflict";
    if (response.applied === true && Number(response.mark && response.mark.rev) === sentRev) return "saved";
    return "conflict";
  }
  function phaseAfter(sentRev, response) { return interpretSave(sentRev, response); }
  function saveMessage(phase) {
    if (phase === "saving") return "Guardando…";
    if (phase === "saved") return "Guardado en tu cuenta";
    if (phase === "conflict") return "Otra edición llegó antes. Tocá reintentar para traer la cuenta.";
    if (phase === "error") return "No se pudo guardar. Lo que marcaste sigue acá.";
    return "Sin cargar";
  }
  function shouldCommit(sentRev, latestRev, responseRev) {
    return sentRev === latestRev && responseRev === sentRev;
  }
  function accountView(totals, marks, holes) {
    return { totals: totals, fields: noteFields(marks, holes) };
  }
  root.GolfletQuick = {
    noteFields: noteFields, mergeNote: mergeNote, applyMark: applyMark, shouldCommit: shouldCommit, accountView: accountView,
    nextHoleRev: nextHoleRev, seedHoleRevs: seedHoleRevs, planHoleSend: planHoleSend,
    mergeAccountHole: mergeAccountHole, absorbAccountMarks: absorbAccountMarks, sendDecision: sendDecision,
    interpretSave: interpretSave, phaseAfter: phaseAfter, saveMessage: saveMessage
  };
})(typeof window !== "undefined" ? window : globalThis);
