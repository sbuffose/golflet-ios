/* t215u: smooth closed outlines for the phone views (mirror of lib/smooth-path.ts: centripetal Catmull-Rom → cubic Bézier, area-preserving). */
(function () {
  function clean(pts) { const out = []; for (const p of pts) { const q = out[out.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6) out.push([+p[0], +p[1]]); }
    if (out.length > 2) { const a = out[0], b = out[out.length - 1]; if (Math.hypot(a[0] - b[0], a[1] - b[1]) <= 1e-6) out.pop(); } return out; }
  function polyArea(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  function crBez(p, alpha) { const n = p.length, segs = [], d = (a, b) => Math.max(Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), alpha), 1e-9);
    for (let i = 0; i < n; i++) { const p0 = p[(i - 1 + n) % n], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[(i + 2) % n], d1 = d(p0, p1), d2 = d(p1, p2), d3 = d(p2, p3), c1 = [0, 0], c2 = [0, 0];
      for (let k = 0; k < 2; k++) { const a = d1 * d1, b = d2 * d2, c = d3 * d3;
        c1[k] = (a * p2[k] - b * p0[k] + (2 * a + 3 * d1 * d2 + b) * p1[k]) / (3 * d1 * (d1 + d2));
        c2[k] = (c * p1[k] - b * p3[k] + (2 * c + 3 * d3 * d2 + b) * p2[k]) / (3 * d3 * (d3 + d2)); }
      segs.push([c1[0], c1[1], c2[0], c2[1], p2[0], p2[1]]); }
    return { start: [p[0][0], p[0][1]], segs }; }
  function sampled(b, k) { const pts = []; let [x0, y0] = b.start;
    for (const [x1, y1, x2, y2, x3, y3] of b.segs) { for (let i = 0; i < k; i++) { const t = i / k, u = 1 - t;
      pts.push([u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3]); } x0 = x3; y0 = y3; }
    return polyArea(pts); }
  function smoothClosed(pts) { const p = clean(pts); if (p.length < 3) return null; const A = polyArea(p); if (!isFinite(A) || Math.abs(A) < 1e-9) return null;
    let b = crBez(p, 0.5); const r = A / sampled(b, 16);
    if (isFinite(r) && r > 0 && Math.abs(r - 1) > 0.002) { const cx = p.reduce((s, q) => s + q[0], 0) / p.length, cy = p.reduce((s, q) => s + q[1], 0) / p.length, k = Math.sqrt(r), S = (x, y) => [cx + (x - cx) * k, cy + (y - cy) * k];
      b = { start: S(b.start[0], b.start[1]), segs: b.segs.map(([a, c, d, e, f, g]) => [...S(a, c), ...S(d, e), ...S(f, g)]) }; }
    return b; }
  const f = v => (Math.round(v * 10) / 10).toString();
  /** SVG path "d" for a closed smooth outline; falls back to the straight polygon. */
  function d(pts) { const b = smoothClosed(pts); if (!b) return pts.length ? 'M' + pts.map(p => f(p[0]) + ',' + f(p[1])).join(' L') + ' Z' : '';
    return 'M' + f(b.start[0]) + ',' + f(b.start[1]) + b.segs.map(s => ' C' + f(s[0]) + ',' + f(s[1]) + ' ' + f(s[2]) + ',' + f(s[3]) + ' ' + f(s[4]) + ',' + f(s[5])).join('') + ' Z'; }
  window.GolfletSmooth = { smoothClosed, d };
})();
