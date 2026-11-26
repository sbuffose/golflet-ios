/* Cortes de cámara. Solo un corte seco, de cuadro entero, cierra la cabeza. */
(function (root) {
  function compare(a, b) {
    const cols = a.cols || 0;
    const rows = a.rows || 0;
    const A = a.raw;
    const B = b.raw;
    let best = null;
    if (A && B && cols && rows) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          let n = 0, sa = 0, sb = 0, sab = 0, sa2 = 0, sb2 = 0, changed = 0;
          for (let y = 0; y < rows; y++) {
            const y2 = y + dy;
            if (y2 < 0 || y2 >= rows) continue;
            for (let x = 0; x < cols; x++) {
              const x2 = x + dx;
              if (x2 < 0 || x2 >= cols) continue;
              const va = A[y * cols + x];
              const vb = B[y2 * cols + x2];
              n++;
              sa += va;
              sb += vb;
              sab += va * vb;
              sa2 += va * va;
              sb2 += vb * vb;
              if (Math.abs(va - vb) > 16) changed++;
            }
          }
          if (n < 8) continue;
          const varA = n * sa2 - sa * sa;
          const varB = n * sb2 - sb * sb;
          let corr = 1;
          if (varA > 1 && varB > 1) corr = (n * sab - sa * sb) / Math.sqrt(varA * varB);
          else if (Math.abs(sa / n - sb / n) > 18) corr = 0;
          if (corr > 1) corr = 1;
          if (corr < -1) corr = -1;
          const cover = changed / n;
          if (!best || corr > best.corr + 0.015 || (Math.abs(corr - best.corr) <= 0.015 && cover < best.cover)) {
            best = { corr, cover };
          }
        }
      }
    }
    let hist = 0;
    const ha = a.hist || [];
    const hb = b.hist || [];
    for (let i = 0; i < ha.length; i++) hist += Math.abs((ha[i] || 0) - (hb[i] || 0));
    hist /= 2;
    return { corr: best ? best.corr : 1, cover: best ? best.cover : 0, hist };
  }

  function decideCuts(samples) {
    const list = samples || [];
    const n = list.length;
    const hard = [];
    const soft = [];
    const alive = (s) => s && s.mean >= 14 && s.raw && s.raw.length;
    for (let i = 1; i < n; i++) {
      if (!alive(list[i - 1]) || !alive(list[i]) || list[i].f < 8) continue;
      const step = compare(list[i - 1], list[i]);
      const prev = i >= 2 && alive(list[i - 2]) ? compare(list[i - 2], list[i - 1]).cover : 0;
      const next = i + 1 < n && alive(list[i + 1]) ? compare(list[i], list[i + 1]).cover : 0;
      const whole = step.cover >= 0.62 || step.hist >= 0.5;
      const unlike = step.corr < 0.45 || step.hist >= 0.45 || step.cover >= 0.85;
      if (!(whole && unlike && step.cover > prev + 0.28 && step.cover > next + 0.28)) continue;
      const future = Math.min(n - 1, i + 15);
      if (future < i + 8 || !alive(list[future])) continue;
      const stay = compare(list[i - 1], list[future]);
      const stayed = stay.cover >= 0.45 || stay.hist >= 0.35;
      if (stayed && (stay.corr < 0.55 || stay.hist >= 0.4 || stay.cover >= 0.7)) hard.push({ f: list[i].f, alta: true });
    }
    for (let i = 0; i < n - 12; i++) {
      if (!alive(list[i])) continue;
      let marked = -1;
      for (let span = 12; span <= 40 && i + span < n; span++) {
        const end = i + span;
        if (!alive(list[end])) continue;
        const far = compare(list[i], list[end]);
        if (!(far.corr < 0.5 && (far.cover >= 0.45 || far.hist >= 0.4))) continue;
        let maxStep = 0;
        let jumped = false;
        for (let k = i + 1; k <= end; k++) {
          if (!alive(list[k - 1]) || !alive(list[k])) continue;
          const step = compare(list[k - 1], list[k]);
          if (step.cover > maxStep) maxStep = step.cover;
          if (hard.some(h => h.f === list[k].f)) jumped = true;
        }
        if (jumped || maxStep >= 0.4) continue;
        const after = Math.min(n - 1, end + 8);
        if (after <= end || !alive(list[after])) continue;
        const settled = compare(list[end], list[after]);
        const still = compare(list[i], list[after]);
        if (settled.corr < 0.72) continue;
        if (still.corr > 0.6 && still.cover < 0.35) continue;
        marked = end;
        break;
      }
      if (marked >= 0 && list[marked].f >= 8) soft.push({ f: list[marked].f, alta: false });
    }
    hard.sort((a, b) => a.f - b.f);
    const firm = [];
    for (const hit of hard) {
      const prev = firm[firm.length - 1];
      if (prev && hit.f - prev.f < 45) continue;
      firm.push({ f: hit.f, alta: true });
    }
    soft.sort((a, b) => a.f - b.f);
    const pans = [];
    for (const hit of soft) {
      if (firm.some(h => Math.abs(h.f - hit.f) < 150)) continue;
      const prev = pans[pans.length - 1];
      if (prev && hit.f - prev.f < 150) { prev.f = Math.max(prev.f, hit.f); continue; }
      pans.push({ f: hit.f, alta: false });
    }
    return firm.concat(pans).sort((a, b) => a.f - b.f);
  }

  root.GolfletCortes = { compare, decideCuts };
})(typeof globalThis !== "undefined" ? globalThis : this);
