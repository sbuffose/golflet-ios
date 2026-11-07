/** t185u: a tiny dependency-free PDF 1.4 writer for the printable yardage book. Vector only, pure black and white
 *  (no grey, no colour), Geist embedded as TrueType (WinAnsi: covers Rioplatense Spanish: á é í ó ú ñ ü ¿ ¡ ° ± ·). */
import { deflateSync } from "node:zlib";
import { readFileSync } from "node:fs";
import path from "node:path";
import { smoothClosed } from "./smooth-path";

type FontKey = "R" | "B";
type Metrics = { widths: number[]; bbox: number[]; ascent: number; descent: number; capHeight: number; psname: string };
const DIR = path.join(process.cwd(), "lib", "pdf-fonts");
let MET: Record<"Regular" | "Bold", Metrics> | null = null;
const met = () => (MET ??= JSON.parse(readFileSync(path.join(DIR, "geist-metrics.json"), "utf8")));
const FONT_FILE: Record<FontKey, string> = { R: "Geist-Regular.ttf", B: "Geist-Bold.ttf" };
const FONT_MET: Record<FontKey, "Regular" | "Bold"> = { R: "Regular", B: "Bold" };

const SUB: Record<string, string> = { "−": "-", "–": "–", "←": "<", "→": ">", "↑": "^", "’": "’", "≈": "~", "\u00a0": " " };
/** JS string → WinAnsi (cp1252) bytes; characters outside it are mapped to ASCII look-alikes. */
export function winAnsi(s: string): number[] {
  const cp: Record<string, number> = { "€": 0x80, "‚": 0x82, "„": 0x84, "…": 0x85, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97 };
  const out: number[] = [];
  for (const ch0 of s) { const ch = SUB[ch0] ?? ch0; for (const ch2 of ch) { const c = ch2.codePointAt(0)!; if (c >= 32 && c <= 126) out.push(c); else if (cp[ch2]) out.push(cp[ch2]); else if (c >= 160 && c <= 255) out.push(c); else out.push(63); } }
  return out;
}
export function textWidth(s: string, font: FontKey, size: number) {
  const w = met()[FONT_MET[font]].widths; return winAnsi(s).reduce((a, c) => a + (w[c - 32] || 500), 0) * size / 1000;
}
const n = (v: number) => (Math.round(v * 100) / 100).toString();

export class Page {
  ops: string[] = [];
  constructor(public w: number, public h: number) {}
  // y grows DOWN in our API (top-left origin, like SVG); converted on output
  private Y = (y: number) => this.h - y;
  save() { this.ops.push("q"); return this; }
  restore() { this.ops.push("Q"); return this; }
  lw(w: number) { this.ops.push(`${n(w)} w`); return this; }
  dash(a: number[] = [], ph = 0) { this.ops.push(`[${a.map(n).join(" ")}] ${n(ph)} d`); return this; }
  cap(c: 0 | 1 | 2) { this.ops.push(`${c} J`); return this; }
  join(j: 0 | 1 | 2) { this.ops.push(`${j} j`); return this; }
  black() { this.ops.push("0 g 0 G"); return this; }
  white() { this.ops.push("1 g 1 G"); return this; }
  fillWhite() { this.ops.push("1 g"); return this; }
  fillBlack() { this.ops.push("0 g"); return this; }
  move(x: number, y: number) { this.ops.push(`${n(x)} ${n(this.Y(y))} m`); return this; }
  line(x: number, y: number) { this.ops.push(`${n(x)} ${n(this.Y(y))} l`); return this; }
  curve(x1: number, y1: number, x2: number, y2: number, x: number, y: number) { this.ops.push(`${n(x1)} ${n(this.Y(y1))} ${n(x2)} ${n(this.Y(y2))} ${n(x)} ${n(this.Y(y))} c`); return this; }
  close() { this.ops.push("h"); return this; }
  /** t215u: closed outline as a smooth curve (centripetal Catmull-Rom → Bézier, area-preserving); straight polygon if degenerate. */
  spoly(pts: [number, number][]) { const b = smoothClosed(pts); if (!b) return this.poly(pts); this.move(b.start[0], b.start[1]); for (const c of b.segs) this.curve(c[0], c[1], c[2], c[3], c[4], c[5]); return this.close(); }
  poly(pts: [number, number][], closed = true) { pts.forEach((p, i) => i ? this.line(p[0], p[1]) : this.move(p[0], p[1])); if (closed) this.close(); return this; }
  rect(x: number, y: number, w: number, h: number) { this.ops.push(`${n(x)} ${n(this.Y(y + h))} ${n(w)} ${n(h)} re`); return this; }
  rrect(x: number, y: number, w: number, h: number, r: number) {
    r = Math.min(r, w / 2, h / 2); const k = 0.5523 * r;
    return this.move(x + r, y).line(x + w - r, y).curve(x + w - r + k, y, x + w, y + r - k, x + w, y + r).line(x + w, y + h - r).curve(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h)
      .line(x + r, y + h).curve(x + r - k, y + h, x, y + h - r + k, x, y + h - r).line(x, y + r).curve(x, y + r - k, x + r - k, y, x + r, y).close();
  }
  circle(cx: number, cy: number, r: number) { const k = 0.5523 * r;
    return this.move(cx + r, cy).curve(cx + r, cy + k, cx + k, cy + r, cx, cy + r).curve(cx - k, cy + r, cx - r, cy + k, cx - r, cy).curve(cx - r, cy - k, cx - k, cy - r, cx, cy - r).curve(cx + k, cy - r, cx + r, cy - k, cx + r, cy).close(); }
  stroke() { this.ops.push("S"); return this; }
  fill() { this.ops.push("f"); return this; }
  fillStroke() { this.ops.push("B"); return this; }
  clip() { this.ops.push("W n"); return this; }
  end() { this.ops.push("n"); return this; }
  /** Text at (x, baseline y). align: l | c | r. */
  text(s: string, x: number, y: number, size: number, font: FontKey = "R", align: "l" | "c" | "r" = "l") {
    const w = align === "l" ? 0 : textWidth(s, font, size), xx = align === "c" ? x - w / 2 : align === "r" ? x - w : x;
    const hex = winAnsi(s).map(c => c.toString(16).padStart(2, "0")).join("");
    this.ops.push(`BT /F${font} ${n(size)} Tf ${n(xx)} ${n(this.Y(y))} Td <${hex}> Tj ET`); return this;
  }
  /** Outlined text (render mode 1: stroke only, hairline) — a watermark that survives 1-bit printing without a grey fill. */
  outlineText(s: string, x: number, y: number, size: number, font: FontKey = "B", align: "l" | "c" | "r" = "l", lw = 0.35) {
    const w = align === "l" ? 0 : textWidth(s, font, size), xx = align === "c" ? x - w / 2 : align === "r" ? x - w : x;
    const hex = winAnsi(s).map(c => c.toString(16).padStart(2, "0")).join("");
    this.ops.push(`q 0 G ${n(lw)} w [] 0 d BT /F${font} ${n(size)} Tf 1 Tr ${n(xx)} ${n(this.Y(y))} Td <${hex}> Tj ET Q`); return this;
  }
  /** 1-bit stencil image (painted with the current fill: black), registered on the Doc with Doc.mask(). */
  image(id: string, x: number, y: number, w: number, h: number) { this.ops.push(`q ${n(w)} 0 0 ${n(h)} ${n(x)} ${n(this.Y(y + h))} cm /Im${id} Do Q`); return this; }
  /** Rotated text/graphics: run fn in a frame rotated by `deg` (clockwise on paper) around (cx, cy). */
  rotated(cx: number, cy: number, deg: number, fn: () => void) {
    const a = -deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), X = cx, Y = this.Y(cy);
    this.save(); this.ops.push(`${n(c)} ${n(s)} ${n(-s)} ${n(c)} ${n(X - c * X + s * Y)} ${n(Y - s * X - c * Y)} cm`); fn(); this.restore(); return this;
  }
}

/** t200u: brand printed on every card/page (white-label later: PRINT_BRAND env or an explicit brand). */
export const printBrand = (o?: { brand?: string }) => (o?.brand || process.env.PRINT_BRAND || "Golflet").trim().slice(0, 24) || "Golflet";

export class Doc {
  pages: Page[] = [];
  constructor(public w = 595.28, public h = 841.89) {}
  masks: Record<string, { w: number; h: number; bits: Buffer }> = {};
  page() { const p = new Page(this.w, this.h); this.pages.push(p); return p; }
  /** Register a 1-bit mask: rows packed MSB first, 1 = black (painted). */
  mask(id: string, m: { w: number; h: number; bits: Buffer }) { this.masks[id] = m; }
  render(meta: { title: string; author?: string; duplex?: "DuplexFlipLongEdge" | "DuplexFlipShortEdge" | "Simplex" }) {
    const objs: (string | Buffer)[] = [];   // 1-based ids
    const add = (o: string | Buffer) => { objs.push(o); return objs.length; };
    const catalogId = add(""), pagesId = add("");
    const fontIds: Record<FontKey, number> = { R: 0, B: 0 };
    for (const k of ["R", "B"] as FontKey[]) {
      const m = met()[FONT_MET[k]], raw = readFileSync(path.join(DIR, FONT_FILE[k])), z = deflateSync(raw);
      const ff = add(Buffer.concat([Buffer.from(`<< /Length ${z.length} /Length1 ${raw.length} /Filter /FlateDecode >>\nstream\n`), z, Buffer.from("\nendstream")]));
      const fd = add(`<< /Type /FontDescriptor /FontName /${m.psname} /Flags 32 /FontBBox [${m.bbox.join(" ")}] /ItalicAngle 0 /Ascent ${m.ascent} /Descent ${m.descent} /CapHeight ${m.capHeight} /StemV ${k === "B" ? 140 : 80} /FontFile2 ${ff} 0 R >>`);
      fontIds[k] = add(`<< /Type /Font /Subtype /TrueType /BaseFont /${m.psname} /FirstChar 32 /LastChar 255 /Widths [${m.widths.join(" ")}] /FontDescriptor ${fd} 0 R /Encoding /WinAnsiEncoding >>`);
    }
    const xo = Object.entries(this.masks).map(([id, m]) => { const z = deflateSync(m.bits);
      return `/Im${id} ${add(Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${m.w} /Height ${m.h} /ImageMask true /BitsPerComponent 1 /Decode [1 0] /Interpolate false /Length ${z.length} /Filter /FlateDecode >>\nstream\n`), z, Buffer.from("\nendstream")]))} 0 R`; }).join(" ");
    const kids: number[] = [];
    for (const p of this.pages) {
      const z = deflateSync(Buffer.from(p.ops.join("\n"), "latin1"));
      const c = add(Buffer.concat([Buffer.from(`<< /Length ${z.length} /Filter /FlateDecode >>\nstream\n`), z, Buffer.from("\nendstream")]));
      kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${n(this.w)} ${n(this.h)}] /Resources << /Font << /FR ${fontIds.R} 0 R /FB ${fontIds.B} 0 R >>${xo ? ` /XObject << ${xo} >>` : ""} >> /Contents ${c} 0 R >>`));
    }
    objs[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R /ViewerPreferences << /PrintScaling /None${meta.duplex ? ` /Duplex /${meta.duplex}` : ""} >> >>`;
    objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
    const pdfStr = (s: string) => "<FEFF" + Buffer.from(s, "utf16le").swap16().toString("hex").toUpperCase() + ">";
    const info = add(`<< /Title ${pdfStr(meta.title)} /Author ${pdfStr(meta.author || "Golflet")} /Producer (Golflet) >>`);
    const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1")]; const offs: number[] = []; let len = chunks[0].length;
    objs.forEach((o, i) => { offs.push(len); const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), typeof o === "string" ? Buffer.from(o, "latin1") : o, Buffer.from("\nendobj\n")]); chunks.push(b); len += b.length; });
    const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map(o => String(o).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size ${objs.length + 1} /Root ${catalogId} 0 R /Info ${info} 0 R >>\nstartxref\n${len}\n%%EOF\n`;
    chunks.push(Buffer.from(xref, "latin1"));
    return Buffer.concat(chunks);
  }
}
