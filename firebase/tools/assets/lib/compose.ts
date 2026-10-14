/**
 * Image composition helpers for the QwikMart catalog assets (sharp + SVG; text is converted to SVG paths with
 * opentype.js so the output does not depend on fonts installed on the machine).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
// @ts-expect-error opentype.js ships no types
import opentype from 'opentype.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FONTS_DIR = path.resolve(HERE, '../fonts');

type Font = { getPath: (t: string, x: number, y: number, s: number) => { toPathData: (d?: number) => string }; getAdvanceWidth: (t: string, s: number) => number; charToGlyph: (c: string) => { advanceWidth: number } ; unitsPerEm: number };
const fontCache = new Map<string, Font>();
export type Weight = 'ExtraBold' | 'Bold' | 'SemiBold' | 'Medium';
export function font(w: Weight = 'ExtraBold'): Font {
  if (!fontCache.has(w)) fontCache.set(w, opentype.loadSync(path.join(FONTS_DIR, `PlusJakartaSans-${w}.ttf`)));
  return fontCache.get(w)!;
}

export const BRAND = {
  primary: '#0E9623',
  primaryDark: '#0B7A1C',
  tint: '#E6F4E9',
  ink: '#111827',
  body: '#344054',
  quick: ['#EBEC8D', '#F8F9E9'],
  ecommerce: ['#FDE2D6', '#FFF4EE'],
};

export function measure(text: string, size: number, w: Weight = 'ExtraBold', letterSpacing = 0) {
  const f = font(w);
  if (!letterSpacing) return f.getAdvanceWidth(text, size);
  let x = 0;
  for (const ch of text) x += f.getAdvanceWidth(ch, size) + letterSpacing;
  return x - letterSpacing;
}

/** SVG <path> for a line of text. anchor: start | middle | end. */
export function textPath(
  text: string,
  x: number,
  y: number,
  size: number,
  opts: { weight?: Weight; fill?: string; anchor?: 'start' | 'middle' | 'end'; letterSpacing?: number; opacity?: number } = {},
) {
  const f = font(opts.weight ?? 'ExtraBold');
  const ls = opts.letterSpacing ?? 0;
  const width = measure(text, size, opts.weight ?? 'ExtraBold', ls);
  let x0 = opts.anchor === 'middle' ? x - width / 2 : opts.anchor === 'end' ? x - width : x;
  let d = '';
  if (!ls) d = f.getPath(text, x0, y, size).toPathData(2);
  else
    for (const ch of text) {
      d += f.getPath(ch, x0, y, size).toPathData(2);
      x0 += f.getAdvanceWidth(ch, size) + ls;
    }
  return `<path d="${d}" fill="${opts.fill ?? BRAND.ink}"${opts.opacity !== undefined ? ` fill-opacity="${opts.opacity}"` : ''}/>`;
}

/** Largest size (<= max) at which `text` fits in `maxWidth`. */
export function fitSize(text: string, maxWidth: number, max: number, w: Weight = 'ExtraBold', min = 10, letterSpacing = 0) {
  let s = max;
  while (s > min && measure(text, s, w, letterSpacing) > maxWidth) s -= 1;
  return s;
}

/** Greedy word wrap into at most `maxLines` lines at a given size. */
export function wrap(text: string, maxWidth: number, size: number, w: Weight = 'Medium', maxLines = 2) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const t = cur ? `${cur} ${word}` : word;
    if (measure(t, size, w) <= maxWidth || !cur) cur = t;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const head = lines.slice(0, maxLines);
    head[maxLines - 1] = `${head[maxLines - 1]}…`;
    return head;
  }
  return lines;
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ------------------------------------------------------------------------------------------- photos
export interface PhotoOpts {
  /** 'cutout': white-background photo blended with multiply (white disappears into the background). 'card': rounded photo card. */
  mode: 'cutout' | 'card';
  /** brighten factor so off-white backgrounds become pure white before the multiply (1 = none) */
  lift?: number;
  /** crop box in source-relative fractions [left, top, width, height] */
  crop?: [number, number, number, number];
  /** feather (px) of the soft edge mask applied in cutout mode */
  feather?: number;
  /** background-removal tolerance multiplier (default 1) */
  strength?: number;
  /** trim uniform white borders before fitting (cutout mode, default true) */
  trim?: boolean;
  /** where to place the fitted cutout inside its box (sharp position, e.g. 'bottom', 'centre') */
  align?: string;
  radius?: number;
}

/** Load + crop + resize a photo into a w×h buffer (PNG with alpha) ready to composite. */
export async function preparePhoto(file: string, w: number, h: number, o: PhotoOpts): Promise<Buffer> {
  let img = sharp(file).rotate();
  const meta = await img.metadata();
  if (o.crop) {
    const [l, t, cw, ch] = o.crop;
    img = img.extract({
      left: Math.round(l * meta.width!),
      top: Math.round(t * meta.height!),
      width: Math.round(cw * meta.width!),
      height: Math.round(ch * meta.height!),
    });
  }
  if (o.mode === 'card') {
    const r = o.radius ?? 28;
    const buf = await img.resize(w, h, { fit: 'cover', position: sharp.strategy.attention }).toBuffer();
    const mask = Buffer.from(`<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" ry="${r}" fill="#fff"/></svg>`);
    return sharp(buf).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  }
  // cutout: remove the (light, plain) studio background. The background colour is estimated from the border; pixels close to
  // it that are connected to the border (flood fill) become transparent with a soft ramp, and their colour is un-mixed from
  // the background so soft edges/shadows blend onto any new background. Enclosed light areas (rice in a bowl) stay opaque.
  const cut = await removeBackground(img, Math.max(w, h) * 1.25, o.strength);
  let piece = sharp(cut);
  if (o.trim !== false) {
    const trimmed = await piece.trim({ threshold: 10 }).toBuffer().catch(() => null);
    if (trimmed) piece = sharp(trimmed);
  }
  return piece.resize(w, h, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 }, position: o.align ?? 'centre' }).png().toBuffer();
}

/** Flood-fill background removal (see preparePhoto). Returns a PNG with alpha. `strength` widens the tolerance (default 1). */
export async function removeBackground(input: sharp.Sharp, maxDim: number, strength = 1): Promise<Buffer> {
  const { data, info } = await input
    .clone()
    .resize(Math.round(maxDim), Math.round(maxDim), { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;
  // background colour = per-channel median of the border pixels
  const border: number[][] = [[], [], []];
  const push = (x: number, y: number) => { const i = (y * W + x) * C; for (let c = 0; c < 3; c++) border[c].push(data[i + c]); };
  for (let x = 0; x < W; x += 2) { push(x, 0); push(x, H - 1); push(x, 1); push(x, H - 2); }
  for (let y = 0; y < H; y += 2) { push(0, y); push(W - 1, y); push(1, y); push(W - 2, y); }
  const med = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1];
  const bg = border.map(med);
  const dist = new Float32Array(W * H);
  for (let p = 0; p < W * H; p++) {
    const i = p * C;
    dist[p] = Math.max(Math.abs(data[i] - bg[0]), Math.abs(data[i + 1] - bg[1]), Math.abs(data[i + 2] - bg[2]));
  }
  // tolerance from the spread of the border (vignettes / soft gradients)
  const bd: number[] = [];
  for (let x = 0; x < W; x += 2) bd.push(dist[x], dist[(H - 1) * W + x]);
  for (let y = 0; y < H; y += 2) bd.push(dist[y * W], dist[y * W + W - 1]);
  bd.sort((p, q) => p - q);
  const spread = bd[Math.floor(bd.length * 0.9)];
  const t1 = Math.min(90, Math.max(34, spread * 1.6 + 18) * strength);
  const t0 = Math.min(t1 * 0.45, Math.max(8, spread * 0.8));
  // flood fill from the border through pixels with dist < t1
  const seen = new Uint8Array(W * H);
  const stack: number[] = [];
  const seed = (p: number) => { if (!seen[p] && dist[p] < t1) { seen[p] = 1; stack.push(p); } };
  for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1); }
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % W, y = (p / W) | 0;
    if (x > 0) seed(p - 1);
    if (x < W - 1) seed(p + 1);
    if (y > 0) seed(p - W);
    if (y < H - 1) seed(p + W);
  }
  const alpha = new Float32Array(W * H);
  for (let p = 0; p < W * H; p++) alpha[p] = seen[p] ? Math.max(0, Math.min(1, (dist[p] - t0) / (t1 - t0))) : 1;
  // soften the matte (3x3 box blur on the alpha only)
  const soft = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H) { s += alpha[yy * W + xx]; n++; }
      }
      soft[y * W + x] = Math.min(alpha[y * W + x] === 1 ? 1 : 1, s / n);
    }
  const out = Buffer.alloc(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    const a = soft[p];
    if (a < 0.01) continue;
    const i = p * C, j = p * 4;
    for (let c = 0; c < 3; c++) out[j + c] = a >= 0.999 ? data[i + c] : Math.max(0, Math.min(255, Math.round((data[i + c] - bg[c] * (1 - a)) / a)));
    out[j + 3] = Math.round(a * 255);
  }
  return sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
}

/** Is the photo on a (near) white background? Samples the border strip. */
export async function isWhiteBackground(file: string, threshold = 236) {
  const { data, info } = await sharp(file).rotate().resize(64, 64, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  let n = 0;
  let min = 255;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      if (x > 2 && x < info.width - 3 && y > 2 && y < info.height - 3) continue;
      const i = (y * info.width + x) * 3;
      const v = (data[i] + data[i + 1] + data[i + 2]) / 3;
      sum += v;
      n++;
      min = Math.min(min, v);
    }
  return sum / n >= threshold && min > 180;
}

// ------------------------------------------------------------------------------------------- output
/** Encode to WebP under a byte budget (lowers quality step by step). */
export async function webpUnder(input: sharp.Sharp | Buffer, maxBytes: number, startQ = 84): Promise<Buffer> {
  const base = Buffer.isBuffer(input) ? input : await input.png().toBuffer();
  let q = startQ;
  let out = await sharp(base).webp({ quality: q, effort: 5, smartSubsample: true }).toBuffer();
  while (out.length > maxBytes && q > 40) {
    q -= 6;
    out = await sharp(base).webp({ quality: q, effort: 5, smartSubsample: true }).toBuffer();
  }
  return out;
}

// ------------------------------------------------------------------------------------------- decorations
export function leaf(x: number, y: number, s: number, rot: number, fill: string, opacity = 1) {
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s / 100})" opacity="${opacity}"><path d="M0 0 C 30 -40, 80 -45, 100 -10 C 70 25, 25 30, 0 0 Z" fill="${fill}"/><path d="M4 -1 C 35 -12, 65 -15, 96 -10" stroke="#ffffff" stroke-opacity=".45" stroke-width="3" fill="none"/></g>`;
}

export function arrowCircle(cx: number, cy: number, r: number, bg: string, fg: string) {
  const s = r * 0.5;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${bg}"/><path d="M${cx - s * 0.75} ${cy} H${cx + s * 0.7} M${cx + s * 0.15} ${cy - s * 0.6} L${cx + s * 0.75} ${cy} L${cx + s * 0.15} ${cy + s * 0.6}" stroke="${fg}" stroke-width="${Math.max(2, r * 0.16)}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
}

/** Round "UP TO 40% OFF" style badge. */
export function badge(cx: number, cy: number, r: number, l1: string, l2: string, l3: string, bg = '#8DBF4A', fg = '#1F4D10') {
  return [
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${bg}"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${r * 0.86}" fill="none" stroke="#ffffff" stroke-opacity=".8" stroke-width="${Math.max(2, r * 0.03)}" stroke-dasharray="${r * 0.09} ${r * 0.06}"/>`,
    textPath(l1, cx, cy - r * 0.3, r * 0.22, { anchor: 'middle', fill: fg, weight: 'ExtraBold' }),
    textPath(l2, cx, cy + r * 0.2, fitSize(l2, r * 1.45, r * 0.56), { anchor: 'middle', fill: fg, weight: 'ExtraBold' }),
    textPath(l3, cx, cy + r * 0.52, r * 0.22, { anchor: 'middle', fill: fg, weight: 'ExtraBold' }),
  ].join('');
}

// ------------------------------------------------------------------------------------------- banner
export interface BannerSpec {
  width: number;
  height: number;
  bg: [string, string] | [string, string, string];
  tag?: string;
  line1: string;
  line2?: string;
  subtitle?: string;
  cta?: string;
  badge?: [string, string, string];
  accent?: string; // line2 + tag + cta color
  photos: { file: string; x: number; y: number; w: number; h: number; opts: PhotoOpts }[];
  /** fraction of the width reserved for text (default .5) */
  textWidth?: number;
  leaves?: boolean;
  compact?: boolean;
}

export async function composeBanner(s: BannerSpec): Promise<Buffer> {
  const { width: W, height: H } = s;
  const accent = s.accent ?? BRAND.primary;
  const k = H / 600; // scale relative to the 1600x600 design
  const pad = Math.round((s.compact ? 44 : 84) * k * (W < 1000 ? 0.85 : 1));
  const textW = W * (s.textWidth ?? 0.5) - pad;
  const stops = s.bg.map((c, i) => `<stop offset="${(i / (s.bg.length - 1)) * 100}%" stop-color="${c}"/>`).join('');
  const deco: string[] = [];
  // soft light blobs
  deco.push(`<circle cx="${W * 0.72}" cy="${H * 0.5}" r="${H * 0.62}" fill="#ffffff" fill-opacity=".45"/>`);
  deco.push(`<circle cx="${W * 0.08}" cy="${H * 1.02}" r="${H * 0.35}" fill="#ffffff" fill-opacity=".35"/>`);
  if (s.leaves !== false) {
    deco.push(leaf(-10 * k, H * 0.2, 120 * k, 35, '#7FB241', 0.55));
    deco.push(leaf(W * 0.47, H * 0.13, 60 * k, -35, '#6FA83A', 0.7));
    deco.push(leaf(W - 30 * k, H * 0.92, 110 * k, 200, '#7FB241', 0.5));
  }
  const layout = (sc: number) => {
    const parts: string[] = [];
    let y = 0;
    const c = (s.compact ? 0.9 : 1) * sc;
    if (s.tag) {
      const ts = Math.round(26 * k * c);
      const tw = measure(s.tag, ts, 'ExtraBold', 1.5 * k) + ts * 1.6;
      const th = ts * 2;
      parts.push(`<rect x="${pad}" y="${y}" width="${tw}" height="${th}" rx="${10 * k}" fill="${accent}"/>`);
      parts.push(textPath(s.tag, pad + ts * 0.8, y + th * 0.68, ts, { fill: '#ffffff', letterSpacing: 1.5 * k }));
      y += th + 28 * k * sc;
    }
    const hMax = Math.round((s.compact ? 72 : 92) * k * sc);
    const hs = Math.min(fitSize(s.line1, textW, hMax), s.line2 ? fitSize(s.line2, textW, hMax) : hMax);
    y += hs * 0.9;
    parts.push(textPath(s.line1, pad, y, hs, { fill: BRAND.ink }));
    if (s.line2) {
      y += hs * 1.08;
      parts.push(textPath(s.line2, pad, y, hs, { fill: accent }));
    }
    y += hs * 0.42;
    parts.push(`<rect x="${pad}" y="${y}" width="${130 * k}" height="${5 * k}" rx="${2.5 * k}" fill="${accent}" fill-opacity=".75"/><circle cx="${pad + 150 * k}" cy="${y + 2.5 * k}" r="${5 * k}" fill="${accent}"/>`);
    y += 14 * k;
    if (s.subtitle) {
      const ss = Math.round(29 * k * c);
      for (const line of wrap(s.subtitle, textW, ss, 'Medium', 2)) {
        y += ss * 1.32;
        parts.push(textPath(line, pad, y, ss, { weight: 'Medium', fill: BRAND.body }));
      }
    }
    if (s.cta) {
      const cs = Math.round(28 * k * c);
      const ch = cs * 2.2;
      const cw = measure(s.cta, cs, 'Bold') + cs * 1.4 + ch * 0.9;
      const cy = y + 30 * k * sc;
      parts.push(`<rect x="${pad}" y="${cy + 6 * k}" width="${cw}" height="${ch}" rx="${ch / 2}" fill="#000" fill-opacity=".12"/>`);
      parts.push(`<rect x="${pad}" y="${cy}" width="${cw}" height="${ch}" rx="${ch / 2}" fill="${accent}"/>`);
      parts.push(textPath(s.cta, pad + cs * 1.1, cy + ch * 0.66, cs, { weight: 'Bold', fill: '#ffffff' }));
      parts.push(arrowCircle(pad + cw - ch / 2 - 1, cy + ch / 2, ch * 0.38, '#ffffff', accent));
      y = cy + ch + 6 * k;
    }
    return { parts, height: y };
  };
  let sc = 1;
  let L = layout(sc);
  while (L.height > H - pad * 1.4 && sc > 0.55) L = layout((sc -= 0.04));
  const top = Math.max(pad * 0.6, (H - L.height) / 2);
  const parts = [`<g transform="translate(0 ${top.toFixed(1)})">${L.parts.join('')}</g>`];
  const bg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0.35">${stops}</linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/>${deco.join('')}</svg>`,
  );
  const layers: sharp.OverlayOptions[] = [];
  for (const p of s.photos) {
    const buf = await preparePhoto(p.file, Math.round(p.w), Math.round(p.h), p.opts);
    layers.push({ input: buf, left: Math.round(p.x), top: Math.round(p.y), blend: 'over' });
  }
  const fg: string[] = [...parts];
  if (s.badge) {
    const r = 105 * k * (s.compact ? 0.8 : 1);
    fg.push(badge(W - r - 40 * k, r + 34 * k, r, ...s.badge));
  }
  layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${fg.join('')}</svg>`), left: 0, top: 0 });
  return sharp(bg).composite(layers).png().toBuffer();
}
