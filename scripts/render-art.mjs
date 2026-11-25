#!/usr/bin/env node
// Renders art/<style>/ into src/images/themes/<style>/*.png + theme.json, plus review images in out/.
// Usage: node scripts/render-art.mjs [illustrated] [pixel] [photo]   (default: all)
// The format is documented in art/README.md.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { PNG } from 'pngjs';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artDir = path.join(root, 'art');
const outReview = path.join(root, 'out');
const STYLES = ['illustrated', 'pixel', 'photo'];
const requested = process.argv.slice(2);
const styles = requested.length ? requested : STYLES;

const species = JSON.parse(fs.readFileSync(path.join(artDir, 'species.json'), 'utf8'));
delete species._doc;

// Screen layout shared with the Roku scene (components/AquariumScene.brs).
const SCREEN = { w: 1920, h: 1080 };
// Backdrops tile horizontally: the scene scrolls them forever, so the right edge must flow into the left.
const BACKDROP_WIDTH = 2556;
const BACKDROP_MAX_H = { far: 600, reef: 540, floor: 440 };
const BAND_Y = { far: [180, 640], mid: [160, 760], near: [220, 820] };

let warnings = 0;
function warn(style, msg) {
  warnings++;
  console.warn(`[${style}] warning: ${msg}`);
}

// ---------- image helpers (RGBA, straight alpha) ----------

function decodePng(buf) {
  const png = PNG.sync.read(buf);
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
}

function encodePng(img) {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data);
  return PNG.sync.write(png);
}

function upscale(img, k) {
  if (k === 1) return img;
  const w = img.width * k;
  const h = img.height * k;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.floor(y / k);
    for (let x = 0; x < w; x++) {
      const si = (sy * img.width + Math.floor(x / k)) * 4;
      data.set(img.data.subarray(si, si + 4), (y * w + x) * 4);
    }
  }
  return { width: w, height: h, data };
}

function renderSvg(svg, opts = {}) {
  const r = new Resvg(svg, {
    fitTo: opts.width ? { mode: 'width', value: opts.width } : { mode: 'original' },
    font: { loadSystemFonts: true },
    imageRendering: opts.pixelated ? 1 : 0,
  });
  return decodePng(r.render().asPng());
}

// ---------- source loaders ----------

function parseHex(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`bad color "${hex}"`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function parsePalette(lines, palette, label) {
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [ch, color, alpha] = line.split(/\s+/);
    if (ch.length !== 1) throw new Error(`${label}: palette key "${ch}" must be one character`);
    if (color === 'transparent') palette.set(ch, [0, 0, 0, 0]);
    else palette.set(ch, [...parseHex(color), alpha ? parseInt(alpha, 16) : 255]);
  }
}

function parseGrid(text, basePalette, label, style) {
  const palette = new Map(basePalette);
  palette.set(' ', [0, 0, 0, 0]);
  let mode = null;
  const paletteLines = [];
  const rows = [];
  for (const raw of text.split(/\r?\n/)) {
    const t = raw.trim();
    if (t === 'palette:') { mode = 'palette'; continue; }
    if (t === 'grid:') { mode = 'grid'; continue; }
    if (mode === 'palette') paletteLines.push(raw);
    else if (mode === 'grid' && t !== '') rows.push(raw.replace(/\s+$/, ''));
  }
  parsePalette(paletteLines, palette, label);
  if (!rows.length) throw new Error(`${label}: no grid rows`);
  const width = Math.max(...rows.map((r) => r.length));
  if (rows.some((r) => r.length !== width)) warn(style, `${label}: rows have different lengths, padded to ${width}`);
  const data = new Uint8Array(width * rows.length * 4);
  const unknown = new Set();
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = palette.get(row[x]);
      if (!c) { unknown.add(row[x]); continue; }
      data.set(c, (y * width + x) * 4);
    }
  });
  if (unknown.size) warn(style, `${label}: unknown palette chars ${[...unknown].join(' ')} (drawn transparent)`);
  return { width, height: rows.length, data };
}

async function importFresh(file) {
  return import(`${pathToFileURL(file).href}?t=${Date.now()}`);
}

async function loadSource(style, file, ctx) {
  const full = path.join(artDir, style, file);
  if (!fs.existsSync(full)) throw new Error(`[${style}] missing file ${file}`);
  if (file.endsWith('.svg.mjs')) return renderSvg((await importFresh(full)).default());
  if (file.endsWith('.svg')) return renderSvg(fs.readFileSync(full, 'utf8'));
  if (file.endsWith('.txt')) return upscale(parseGrid(fs.readFileSync(full, 'utf8'), ctx.palette, file, style), ctx.k);
  if (file.endsWith('.px.mjs')) {
    const img = (await importFresh(full)).default();
    if (img.data.length !== img.width * img.height * 4) throw new Error(`[${style}] ${file}: data length != width*height*4`);
    return upscale({ ...img, data: new Uint8Array(img.data) }, ctx.k);
  }
  if (file.endsWith('.png')) return decodePng(fs.readFileSync(full));
  throw new Error(`[${style}] ${file}: unsupported extension`);
}

const baseName = (file) => path.basename(file).replace(/\.(svg\.mjs|px\.mjs|svg|txt|png)$/, '');


// ---------- styles made from the 3D model renders (art/models/renders) ----------
//
// Realistic ("photo"): each render is scaled to its final size with a Lanczos filter.
// Pixel: each render becomes 6-px cells. Rather than averaging each cell (which muddies edges
// and turns small bright details grey), every source pixel is snapped to one palette shared by
// the whole style, and each cell takes its most common color, weighted by alpha. Edges stay
// crisp, flat colors stay pure, and every texture uses the same colors. Creatures and plants
// get a darkened outline on their silhouette ("selective outline"), and see-through art
// (bubbles, jellyfish) keeps a few alpha levels instead of a hard cut.

let MODELS_DIR = path.join(artDir, 'models', 'renders');

function loadModelManifests() {
  if (!fs.existsSync(MODELS_DIR)) throw new Error(`missing ${path.relative(root, MODELS_DIR)}: run npm run models`);
  const items = {};
  for (const f of fs.readdirSync(MODELS_DIR).filter((n) => n.endsWith('.json'))) {
    const m = JSON.parse(fs.readFileSync(path.join(MODELS_DIR, f), 'utf8'));
    items[m.id] = m;
  }
  return items;
}

const readRender = (file) => decodePng(fs.readFileSync(path.join(MODELS_DIR, file)));

const srgbToLinear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

function oklab(r, g, b) {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

// Pixel art reads better a little punchier than a photographic render.
function punch(r, g, b, sat, contrast) {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const f = (c) => Math.max(0, Math.min(255, ((y + (c - y) * sat) - 128) * contrast + 128));
  return [f(r), f(g), f(b)];
}

class Palette {
  constructor(colors) {
    this.rgb = colors;
    this.lab = colors.map(([r, g, b]) => oklab(r, g, b));
    this.cache = new Map();
    this.darker = new Map();
  }

  nearest(r, g, b) {
    const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
    let idx = this.cache.get(key);
    if (idx !== undefined) return idx;
    idx = this.nearestLab(oklab(r, g, b));
    this.cache.set(key, idx);
    return idx;
  }

  nearestLab([L, A, B]) {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < this.lab.length; i++) {
      const [l, a, b] = this.lab[i];
      const d = (l - L) ** 2 + (a - A) ** 2 + (b - B) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  // A darker shade of palette color i, for outlines.
  shade(i) {
    if (!this.darker.has(i)) {
      const [L, A, B] = this.lab[i];
      let j = this.nearestLab([L * 0.62, A * 1.1, B * 1.1]);
      if (j === i) j = this.nearestLab([L * 0.45, A, B]);
      this.darker.set(i, j);
    }
    return this.darker.get(i);
  }
}

// One palette for the whole style, from a sample of every texture (libimagequant, via sharp).
async function stylePalette(images, opts) {
  const samples = [];
  for (const { img, weight } of images) {
    const visible = img.width * img.height;
    const want = Math.min(visible, 30000 * weight);
    const stride = Math.max(1, Math.floor(visible / want));
    for (let i = 0; i < visible; i += stride) {
      const o = i * 4;
      if (img.data[o + 3] < 128) continue;
      samples.push(punch(img.data[o], img.data[o + 1], img.data[o + 2], opts.saturation, opts.contrast));
    }
  }
  const side = Math.ceil(Math.sqrt(samples.length));
  const buf = Buffer.alloc(side * side * 3);
  samples.forEach((c, i) => buf.set(c.map(Math.round), i * 3));
  const quant = await sharp(buf, { raw: { width: side, height: side, channels: 3 } })
    .png({ palette: true, colours: opts.colors, dither: 0, effort: 10 })
    .toBuffer();
  // sharp only offers 2/4/16/256 colors, so merge its 256 down to the target count with a weighted
  // k-means in OKLab, keeping the most central real color of each cluster.
  const dec = PNG.sync.read(quant);
  const freq = new Map();
  for (let i = 0; i < dec.data.length; i += 4) {
    const key = (dec.data[i] << 16) | (dec.data[i + 1] << 8) | dec.data[i + 2];
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }
  const cols = [...freq.entries()].map(([key, n]) => ({ rgb: [key >> 16, (key >> 8) & 255, key & 255], n }));
  cols.forEach((c) => { c.lab = oklab(...c.rgb); });
  const k = Math.min(opts.colors, cols.length);
  if (k === cols.length) return new Palette(cols.map((c) => c.rgb));
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  // Deterministic k-means++ seeding: most frequent color first, then the farthest (weighted).
  cols.sort((a, b) => b.n - a.n);
  const centers = [cols[0].lab.slice()];
  while (centers.length < k) {
    let best = null;
    let bs = -1;
    for (const c of cols) {
      const s2 = c.n * Math.min(...centers.map((ct) => d2(ct, c.lab)));
      if (s2 > bs) { bs = s2; best = c; }
    }
    centers.push(best.lab.slice());
  }
  const assign = new Int32Array(cols.length);
  for (let it = 0; it < 20; it++) {
    cols.forEach((c, i) => {
      let bi = 0;
      let bd = Infinity;
      centers.forEach((ct, j) => { const d = d2(ct, c.lab); if (d < bd) { bd = d; bi = j; } });
      assign[i] = bi;
    });
    const sum = centers.map(() => [0, 0, 0, 0]);
    cols.forEach((c, i) => { const t = sum[assign[i]]; t[0] += c.lab[0] * c.n; t[1] += c.lab[1] * c.n; t[2] += c.lab[2] * c.n; t[3] += c.n; });
    sum.forEach((t, j) => { if (t[3]) centers[j] = [t[0] / t[3], t[1] / t[3], t[2] / t[3]]; });
  }
  const chosen = centers.map((ct, j) => {
    let bi = -1;
    let bd = Infinity;
    cols.forEach((c, i) => { if (assign[i] === j) { const d = d2(ct, c.lab); if (d < bd) { bd = d; bi = i; } } });
    return bi;
  }).filter((i) => i >= 0);
  return new Palette([...new Set(chosen)].map((i) => cols[i].rgb));
}

// Share of an image's visible pixels that are see-through.
function semiTransparency(img) {
  let semi = 0;
  let seen = 0;
  for (let i = 3; i < img.data.length; i += 4) {
    const a = img.data[i];
    if (a > 8) { seen++; if (a < 230) semi++; }
  }
  return seen ? semi / seen : 0;
}

// src: a render; (w, h): its final size in px; k: cell size in final px. Returns the final image.
function pixelate(src, w, h, k, pal, opts) {
  return cellsImage(pixelCells(src, w, h, k, pal, opts), w, h, k, pal, opts);
}

// One palette color (or none) and an alpha per cell. See-through art (opts.softAlpha) keeps a few
// alpha levels; everything else is cut hard at 50% coverage.
function pixelCells(src, w, h, k, pal, opts) {
  const cw = Math.round(w / k);
  const ch = Math.round(h / k);
  const sx = src.width / cw;
  const sy = src.height / ch;
  const soft = !!opts.softAlpha;
  const idx = new Int32Array(cw * ch).fill(-1);
  const alpha = new Uint8Array(cw * ch);
  const counts = new Float32Array(pal.rgb.length);
  for (let cy = 0; cy < ch; cy++) {
    for (let cx = 0; cx < cw; cx++) {
      counts.fill(0);
      let cover = 0;
      let n = 0;
      const x0 = Math.round(cx * sx);
      const x1 = Math.round((cx + 1) * sx);
      const y0 = Math.round(cy * sy);
      const y1 = Math.round((cy + 1) * sy);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const o = (y * src.width + x) * 4;
          const a = src.data[o + 3] / 255;
          n++;
          if (a <= 0.02) continue;
          cover += a;
          const [r, g, b] = punch(src.data[o], src.data[o + 1], src.data[o + 2], opts.saturation, opts.contrast);
          counts[pal.nearest(r | 0, g | 0, b | 0)] += a;
        }
      }
      const c = cover / n;
      const lvl = soft ? Math.round(c * 3) / 3 : c >= 0.5 ? 1 : 0;
      if (lvl <= 0) continue;
      let best = 0;
      for (let i = 1; i < counts.length; i++) if (counts[i] > counts[best]) best = i;
      idx[cy * cw + cx] = best;
      alpha[cy * cw + cx] = Math.round(lvl * 255);
    }
  }
  // Clean up orphan pixels: a cell that matches none of its 8 neighbors takes the most common
  // neighboring color, but only if that's a close shade (an eye or a spot is kept).
  {
    const before = Int32Array.from(idx);
    for (let cy = 0; cy < ch; cy++) {
      for (let cx = 0; cx < cw; cx++) {
        const i = cy * cw + cx;
        const c = before[i];
        if (c < 0) continue;
        const seen = new Map();
        let same = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const x = cx + dx;
            const y = cy + dy;
            if (x < 0 || y < 0 || x >= cw || y >= ch) continue;
            const v = before[y * cw + x];
            if (v < 0) continue;
            if (v === c) same++;
            seen.set(v, (seen.get(v) ?? 0) + 1);
          }
        }
        if (same) continue;
        let best = -1;
        let bn = 2;
        for (const [v, n] of seen) if (n > bn) { bn = n; best = v; }
        if (best < 0) continue;
        const [l1, a1, b1] = pal.lab[c];
        const [l2, a2, b2] = pal.lab[best];
        if ((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2 < 0.1 ** 2) idx[i] = best;
      }
    }
  }
  return { cw, ch, idx, alpha };
}

// Turns cells into the final image. opts.outline darkens cells on the silhouette; opts.cover (a
// mask of the creature's other parts) keeps outlines off edges another part covers, so only the
// whole creature's outline is drawn.
function cellsImage(c, w, h, k, pal, opts) {
  const { cw, ch, alpha } = c;
  const idx = Int32Array.from(c.idx);
  if (opts.outline) {
    const edge = [];
    const open = (x, y) => x < 0 || y < 0 || x >= cw || y >= ch ||
      (idx[y * cw + x] < 0 && !(opts.cover && opts.cover[y * cw + x]));
    for (let cy = 0; cy < ch; cy++) {
      for (let cx = 0; cx < cw; cx++) {
        const i = cy * cw + cx;
        if (idx[i] < 0 || alpha[i] < 255) continue;
        if (open(cx - 1, cy) || open(cx + 1, cy) || open(cx, cy - 1) || open(cx, cy + 1)) edge.push(i);
      }
    }
    for (const i of edge) idx[i] = pal.shade(idx[i]);
  }
  const cells = { width: cw, height: ch, data: new Uint8Array(cw * ch * 4) };
  for (let i = 0; i < cw * ch; i++) {
    if (idx[i] < 0) continue;
    cells.data.set([...pal.rgb[idx[i]], alpha[i]], i * 4);
  }
  const out = upscale(cells, k);
  return out.width === w && out.height === h ? out : crop(out, 0, 0, Math.min(w, out.width), Math.min(h, out.height));
}

// Water is stretched sideways by the engine, so only its rows matter: 6-px bands. It keeps its
// own exact color per band rather than the shared palette, which has too few blues for a smooth
// gradient (and dithering would be stretched into stripes).
function pixelateWater(src, k, opts) {
  const out = { width: src.width, height: src.height, data: new Uint8Array(src.data.length) };
  for (let y0 = 0; y0 < src.height; y0 += k) {
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let y = y0; y < Math.min(src.height, y0 + k); y++) {
      for (let x = 0; x < src.width; x++) {
        const o = (y * src.width + x) * 4;
        r += src.data[o]; g += src.data[o + 1]; b += src.data[o + 2]; n++;
      }
    }
    const c = punch(r / n, g / n, b / n, opts.saturation, opts.contrast).map(Math.round);
    for (let y = y0; y < Math.min(src.height, y0 + k); y++) {
      for (let x = 0; x < src.width; x++) out.data.set([...c, 255], (y * src.width + x) * 4);
    }
  }
  return out;
}

// Builds the style's backdrop, bubbles, plants and creature parts from the model renders.
async function buildFromModels(style, spec, k, makeAsset) {
  // models.renders: which render set to use (relative to the repo), default art/models/renders.
  MODELS_DIR = path.join(root, spec.models?.renders ?? 'art/models/renders');
  const items = loadModelManifests();
  const pixel = k > 1;
  const opts = { saturation: 1.15, contrast: 1.06, colors: 160, ...(spec.models?.pixel ?? {}) };
  const byKind = (kind) => Object.values(items).filter((m) => m.kind === kind);

  // Everything the style will use: [file, final w, final h, kind].
  const jobs = [];
  for (const m of byKind('backdrop')) jobs.push({ file: m.file, w: m.w, h: m.h, kind: m.layer === 'water' ? 'water' : 'backdrop' });
  for (const m of byKind('plant')) jobs.push({ file: m.file, w: m.w, h: m.h, kind: 'plant' });
  for (const m of byKind('sprites')) for (const s of m.sprites) jobs.push({ file: s.file, w: s.w, h: s.h, kind: 'sprite' });
  for (const m of byKind('creature')) {
    for (const p of m.parts) {
      const files = pixel && p.frames ? p.frames : [p.file];
      for (const f of files) jobs.push({ file: f, w: m.w, h: m.h, kind: 'creature', creature: m, part: p.name });
    }
  }
  const sources = new Map(jobs.map((j) => [j.file, readRender(j.file)]));

  let pal = null;
  if (pixel) {
    pal = await stylePalette(jobs.filter((j) => j.kind !== 'water').map((j) => ({ img: sources.get(j.file), weight: j.kind === 'backdrop' ? 3 : 1 })), opts);
  }
  const images = new Map();
  for (const j of jobs) {
    if (j.kind === 'creature' && pixel) continue;
    const src = sources.get(j.file);
    let img;
    if (!pixel) {
      img = src.width === j.w && src.height === j.h ? src : await resize(src, j.w, j.h);
    } else if (j.kind === 'water') {
      img = pixelateWater(src, k, opts);
    } else {
      img = pixelate(src, j.w, j.h, k, pal, { ...opts, outline: j.kind === 'plant', softAlpha: j.kind === 'sprite' });
    }
    images.set(j.file, img);
  }
  if (pixel) {
    // Creatures: cut all parts into cells first, so each part's outline can skip the edges another
    // part covers (where the tail meets the body, a fin over the body). See-through creatures (a
    // jellyfish) keep alpha levels; a see-through fin on a solid fish is cut hard.
    for (const m of byKind('creature')) {
      const mine = jobs.filter((j) => j.creature === m);
      const semi = mine.reduce((acc, j) => acc + semiTransparency(sources.get(j.file)), 0) / mine.length;
      const o = { ...opts, softAlpha: semi > 0.5 };
      const cells = new Map(mine.map((j) => [j.file, pixelCells(sources.get(j.file), m.w, m.h, k, pal, o)]));
      for (const j of mine) {
        const c = cells.get(j.file);
        const cover = new Uint8Array(c.cw * c.ch);
        for (const other of mine) {
          if (other.part === j.part) continue;
          const oc = cells.get(other.file);
          for (let i = 0; i < cover.length; i++) if (oc.idx[i] >= 0) cover[i] = 1;
        }
        images.set(j.file, cellsImage(c, m.w, m.h, k, pal, { ...o, outline: true, cover }));
      }
    }
  }
  const asset = (file) => makeAsset(file.replace(/\.png$/, ''), images.get(file));

  const backdrop = {};
  for (const m of byKind('backdrop')) backdrop[m.layer] = asset(m.file);

  const bubbles = byKind('sprites').flatMap((m) => m.sprites).filter((s) => s.name.startsWith('bubble'))
    .sort((a, b) => a.w - b.w).map((s) => asset(s.file));

  const plants = [];
  for (const m of byKind('plant').sort((a, b) => a.id.localeCompare(b.id))) {
    const img = images.get(m.file);
    const n = m.segments;
    const step = pixel ? k : 1;
    const hb = Math.max(step, Math.round(m.h / n / step) * step);
    const overlap = 6;
    const segments = [];
    for (let i = 0; i < n; i++) {
      const top = i === n - 1 ? 0 : Math.max(0, m.h - (i + 1) * hb);
      const bottom = Math.min(m.h, m.h - i * hb + (i > 0 ? overlap : 0));
      if (bottom - top <= overlap) break;
      segments.push(makeAsset(`${m.id}-${i + 1}`, crop(img, 0, top, m.w, bottom - top)));
    }
    plants.push({ id: m.id, overlap, sway: m.sway, segments });
  }

  const creatures = {};
  for (const m of byKind('creature')) {
    const parts = [];
    for (const p of m.parts) {
      if (pixel && p.frames) {
        parts.push({ ...asset(p.frames[0]), anim: 'frameA', pivot: p.pivot ?? [m.w / 2, m.h / 2] });
        parts.push({ ...asset(p.frames[1]), anim: 'frameB', pivot: p.pivot ?? [m.w / 2, m.h / 2] });
      } else {
        const part = { ...asset(p.file), anim: pixel ? 'none' : p.anim ?? 'none', pivot: p.pivot ?? [m.w / 2, m.h / 2] };
        if (!pixel && p.amp !== undefined) part.amp = p.amp;
        if (!pixel && p.period !== undefined) part.period = p.period;
        parts.push(part);
      }
    }
    creatures[m.id] = parts;
  }
  if (pal) {
    fs.mkdirSync(outReview, { recursive: true });
    fs.writeFileSync(path.join(outReview, `art-${style}-palette.json`), JSON.stringify(pal.rgb));
  }
  return { backdrop, bubbles, plants, creatures, palette: pal ? pal.rgb.length : 0 };
}

// ---------- theme build ----------

async function buildStyle(style) {
  const dir = path.join(artDir, style);
  const spec = JSON.parse(fs.readFileSync(path.join(dir, 'sprites.json'), 'utf8'));
  const k = spec.pixelScale ?? 1;
  const palette = new Map();
  const palFile = path.join(dir, 'palette.txt');
  if (fs.existsSync(palFile)) {
    const lines = fs.readFileSync(palFile, 'utf8').split(/\r?\n/).filter((l) => l.trim() !== 'palette:');
    parsePalette(lines, palette, 'palette.txt');
  }
  const ctx = { k, palette };

  const outDir = path.join(root, 'src', 'images', 'themes', style);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const cache = new Map();
  const names = new Map();
  async function asset(file) {
    if (cache.has(file)) return cache.get(file);
    const img = await loadSource(style, file, ctx);
    const name = baseName(file);
    if (names.has(name) && names.get(name) !== file) throw new Error(`[${style}] ${file} and ${names.get(name)} both output ${name}.png`);
    names.set(name, file);
    const png = encodePng(img);
    const a = { name, img, w: img.width, h: img.height, png };
    cache.set(file, a);
    return a;
  }

  // Styles made from the 3D models take their art from art/models/renders instead.
  function makeAsset(name, img) {
    if (names.has(name)) throw new Error(`[${style}] two images named ${name}`);
    names.set(name, name);
    return { name, img, w: img.width, h: img.height, png: encodePng(img) };
  }
  const models = spec.models ? await buildFromModels(style, spec, k, makeAsset) : null;
  if (models?.palette) console.log(`[${style}] pixel palette: ${models.palette} colors`);

  const backdrop = {};
  for (const key of ['water', 'far', 'reef', 'floor']) {
    if (models) {
      if (!models.backdrop[key]) { warn(style, `backdrop.${key} missing (npm run models -- ${key})`); continue; }
    } else if (!spec.backdrop?.[key]) { warn(style, `backdrop.${key} missing`); continue; }
    const a = models ? models.backdrop[key] : await asset(spec.backdrop[key]);
    if (key !== 'water') {
      if (a.w !== BACKDROP_WIDTH) warn(style, `backdrop.${key} is ${a.w}px wide, expected ${BACKDROP_WIDTH}`);
      if (a.h > BACKDROP_MAX_H[key]) warn(style, `backdrop.${key} is ${a.h}px tall, max ${BACKDROP_MAX_H[key]}`);
    }
    backdrop[key] = a;
  }

  const ray = spec.ray ? await asset(spec.ray) : (warn(style, 'ray missing'), null);
  const caustics = spec.caustics ? await asset(spec.caustics) : (warn(style, 'caustics missing'), null);
  const bubbles = models ? models.bubbles : [];
  if (!models) for (const f of spec.bubbles ?? []) bubbles.push(await asset(f));
  if (!bubbles.length) warn(style, 'no bubbles');

  const plants = models ? models.plants : [];
  if (!models) {
    for (const p of spec.plants ?? []) {
      const segments = [];
      for (const f of p.segments) segments.push(await asset(f));
      plants.push({ id: p.id, overlap: p.overlap ?? 0, sway: p.sway ?? 0.05, segments });
    }
  }
  if (plants.length < 3) warn(style, `only ${plants.length} plant types (want 3+)`);

  const fish = [];
  const visitors = [];
  const critters = [];
  for (const [id, behavior] of Object.entries(species)) {
    const c = models ? null : spec.creatures?.[id];
    if (models ? !models.creatures[id] : !c) { warn(style, `no art for creature "${id}"`); continue; }
    const parts = models ? models.creatures[id] : [];
    for (const p of c?.parts ?? []) {
      const a = await asset(p.file);
      const part = { ...a, anim: p.anim ?? 'none', pivot: (p.pivot ?? [a.w / k / 2, a.h / k / 2]).map((v) => v * k) };
      if (p.amp !== undefined) part.amp = p.amp;
      if (p.period !== undefined) part.period = p.period;
      parts.push(part);
    }
    const [w, h] = [parts[0].w, parts[0].h];
    if (parts.some((p) => p.w !== w || p.h !== h)) warn(style, `${id}: parts have different canvas sizes (${parts.map((p) => `${p.w}x${p.h}`).join(', ')})`);
    const anims = parts.map((p) => p.anim);
    if (anims.includes('frameA') !== anims.includes('frameB')) warn(style, `${id}: frameA and frameB must come in pairs`);
    const creature = { id, ...behavior, w, h, parts };
    (behavior.visitor ? visitors : behavior.critter ? critters : fish).push(creature);
  }

  const theme = {
    style,
    pixelated: k > 1,
    floorCover: backdrop.floor ? solidCover(backdrop.floor.img) : 0,
    bandScale: spec.bandScale ?? { far: 0.5, mid: 0.75, near: 1 },
    backdrop,
    ray,
    caustics,
    bubbles,
    plants,
    fish,
    visitors,
    critters,
  };
  const stats = await exportDevice(style, theme, outDir);

  fs.mkdirSync(outReview, { recursive: true });
  const sheet = renderSvg(sheetSvg(theme), { pixelated: theme.pixelated });
  fs.writeFileSync(path.join(outReview, `art-${style}-sheet.png`), encodePng(sheet));
  const mock = sceneSvg(theme);
  fs.writeFileSync(path.join(outReview, `art-${style}-scene-full.png`), encodePng(renderSvg(mock, { pixelated: theme.pixelated })));
  const half = encodePng(renderSvg(mock, { width: 960 }));
  fs.writeFileSync(path.join(outReview, `art-${style}-scene.png`), half);
  // Shown on the Settings screen. Opaque, so JPEG is far smaller than PNG.
  fs.writeFileSync(path.join(outDir, 'preview.jpg'), await sharp(half).jpeg({ quality: 85, mozjpeg: true }).toBuffer());
  fs.writeFileSync(path.join(outReview, `art-${style}-seams.png`), encodePng(renderSvg(seamsSvg(theme), { pixelated: theme.pixelated })));
  theme.mockSvg = mock;
  console.log(`[${style}] ${cache.size} images, ${fish.length} fish, ${visitors.length} visitors, ${critters.length} critters, ${plants.length} plants -> src/images/themes/${style}/`);
  reportBudget(style, stats);
  return theme;
}

// ---------- review images (SVG composed, rendered by resvg) ----------

const href = (a) => `data:image/png;base64,${a.png.toString('base64')}`;
const img = (a, attrs = '') => `<image href="${href(a)}" width="${a.w}" height="${a.h}" ${attrs}/>`;
const esc = (s) => String(s).replace(/[<&>]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' })[c]);

// Static pose for review images: frameB parts are the alternate frame, so leave them out.
function creatureSvg(c) {
  return c.parts.filter((p) => p.anim !== 'frameB').map((p) => img(p)).join('');
}

function plantSvg(p) {
  const width = Math.max(...p.segments.map((s) => s.w));
  let y = 0;
  const parts = [];
  for (const s of p.segments) {
    y -= s.h;
    parts.push(`<g transform="translate(${-s.w / 2},${y})">${img(s)}</g>`);
    y += p.overlap;
  }
  return { svg: parts.join(''), width, height: -y + p.overlap };
}

function sheetSvg(t) {
  const items = [];
  for (const c of [...t.fish, ...t.visitors, ...t.critters]) items.push({ label: c.id, w: c.w, h: c.h, svg: creatureSvg(c) });
  for (const p of t.plants) {
    const ps = plantSvg(p);
    items.push({ label: `plant ${p.id}`, w: ps.width, h: ps.height, svg: `<g transform="translate(${ps.width / 2},${ps.height})">${ps.svg}</g>` });
  }
  t.bubbles.forEach((b, i) => items.push({ label: `bubble ${i}`, w: Math.max(b.w, 60), h: b.h, svg: img(b) }));
  if (t.caustics) items.push({ label: 'caustics (50%)', w: t.caustics.w * 0.5, h: t.caustics.h * 0.5, svg: `<g transform="scale(0.5)">${img(t.caustics)}</g>` });
  if (t.ray) items.push({ label: 'ray (40%)', w: t.ray.w * 0.4, h: t.ray.h * 0.4, svg: `<g transform="scale(0.4)">${img(t.ray)}</g>` });

  const W = 1920;
  const pad = 24;
  let x = pad;
  let y = pad;
  let rowH = 0;
  const placed = [];
  for (const it of items) {
    if (x + it.w > W - pad) { x = pad; y += rowH + 40; rowH = 0; }
    placed.push(`<g transform="translate(${x},${y})">${it.svg}<rect width="${it.w}" height="${it.h}" fill="none" stroke="#ffffff30"/><text y="${it.h + 22}" fill="#fff" font-size="18" font-family="sans-serif">${esc(it.label)}</text></g>`);
    x += it.w + pad;
    rowH = Math.max(rowH, it.h);
  }
  y += rowH + 60;
  for (const key of ['far', 'reef', 'floor']) {
    const a = t.backdrop[key];
    if (!a) continue;
    placed.push(`<g transform="translate(${pad},${y}) scale(0.5)">${img(a)}<rect width="${a.w}" height="${a.h}" fill="none" stroke="#ffffff30" stroke-width="2"/></g><text x="${pad}" y="${y - 6}" fill="#fff" font-size="18" font-family="sans-serif">backdrop ${key} (50%)</text>`);
    y += a.h / 2 + 40;
  }
  const H = y + pad;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#1d5f8a"/>${placed.join('')}</svg>`;
}

// Each tiling backdrop's right 320 px joined to its left 320 px, at full size: the join should be invisible.
function seamsSvg(t) {
  const span = 320;
  let y = 0;
  const rows = [];
  for (const key of ['far', 'reef', 'floor']) {
    const a = t.backdrop[key];
    if (!a) continue;
    rows.push(`<text x="4" y="${y + 20}" fill="#fff" font-size="18" font-family="sans-serif">${key}: right edge | left edge</text>`);
    y += 28;
    rows.push(`<svg x="0" y="${y}" width="${span * 2}" height="${a.h}"><rect width="${span * 2}" height="${a.h}" fill="#1d5f8a"/>${[span - a.w, span].map((x) => `<g transform="translate(${x},0)">${img(a)}</g>`).join('')}</svg>`);
    y += a.h + 16;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${span * 2}" height="${y}"><rect width="${span * 2}" height="${y}" fill="#0b2033"/>${rows.join('')}</svg>`;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sceneSvg(t) {
  const rand = rng(7);
  const between = (a, b) => a + rand() * (b - a);
  const { w: W, h: H } = SCREEN;
  // Two copies with the tile seam at the center of the screen, so a bad seam is easy to spot.
  const layer = (a) => (a ? [W / 2 - a.w, W / 2].map((x) => `<g transform="translate(${x},${H - a.h})">${img(a)}</g>`).join('') : '');
  const bands = { far: [], mid: [], near: [] };

  const placeCreature = (c, band, cx, cy, flip) => {
    const s = t.bandScale[band];
    const tint = band === 'far' ? ' filter="url(#far)" opacity="0.85"' : '';
    const mirror = flip ? `translate(${c.w},0) scale(-1,1)` : '';
    bands[band].push(`<g transform="translate(${cx - (c.w * s) / 2},${cy - (c.h * s) / 2}) scale(${s})"${tint}><g transform="${mirror}">${creatureSvg(c)}</g></g>`);
  };

  const order = ['far', 'mid', 'mid', 'near', 'far', 'mid', 'near', 'mid', 'far', 'near'];
  const pool = t.fish.filter((f) => !f.school);
  order.forEach((band, i) => {
    if (!pool.length) return;
    const c = pool[i % pool.length];
    const b = c.bands.includes(band) ? band : c.bands[0];
    placeCreature(c, b, between(200, W - 200), between(...BAND_Y[b]), rand() < 0.5);
  });
  const neon = t.fish.find((f) => f.school);
  if (neon) {
    const [cx, cy] = [between(500, 1400), between(260, 420)];
    for (let i = 0; i < 7; i++) placeCreature(neon, 'mid', cx + between(-120, 120), cy + between(-50, 50), false);
  }
  if (t.visitors[0]) placeCreature(t.visitors[0], t.visitors[0].bands[0], 1350, 330, true);

  const plantBase = H - t.floorCover + 24; // as in AquariumScene.buildPlants
  // Caustics: two stretched copies, the second mirrored, at low opacity (as in AquariumScene).
  const causticSvgs = t.caustics
    ? `<g opacity="0.10"><image href="${href(t.caustics)}" x="-60" y="-40" width="${W + 120}" height="${H + 80}" preserveAspectRatio="none"/></g>` +
      `<g opacity="0.08" transform="translate(${W},0) scale(-1,1)"><image href="${href(t.caustics)}" x="-60" y="-40" width="${W + 120}" height="${H + 80}" preserveAspectRatio="none"/></g>`
    : '';
  // Critters walk on the front part of the floor (same band as the engine's crawlBand()).
  const critterSvgs = t.critters
    .map((c, i) => {
      const cx = 220 + i * 360 + between(-60, 60);
      const cy = H - between(14, 80) - c.h / 2; // feet on the front ledge, as in AquariumScene
      const mirror = rand() < 0.5 ? `translate(${c.w},0) scale(-1,1)` : '';
      return `<g transform="translate(${cx - c.w / 2},${cy - c.h / 2})"><g transform="${mirror}">${creatureSvg(c)}</g></g>`;
    })
    .join('');
  const plantSvgs = t.plants.length
    ? [160, 360, 610, 1330, 1580, 1790].map((x, i) => `<g transform="translate(${x},${plantBase})">${plantSvg(t.plants[i % t.plants.length]).svg}</g>`).join('')
    : '';

  const rays = t.ray
    ? [260, 720, 1180, 1600].map((x, i) => `<g opacity="0.16" transform="translate(${x - t.ray.w / 2},-20) rotate(${[-8, 4, -3, 7][i]},${t.ray.w / 2},0)">${img(t.ray)}</g>`).join('')
    : '';
  let bubbles = '';
  if (t.bubbles.length) {
    for (let i = 0; i < 12; i++) {
      const b = t.bubbles[i % t.bubbles.length];
      bubbles += `<g transform="translate(${1690 + Math.sin(i * 1.3) * 14},${900 - i * 70})">${img(b)}</g>`;
    }
  }
  const water = t.backdrop.water ? `<image href="${href(t.backdrop.water)}" width="${W}" height="${H}" preserveAspectRatio="none"/>` : '<rect width="1920" height="1080" fill="#0b4a73"/>';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs><filter id="far"><feColorMatrix type="matrix" values="0.56 0 0 0 0  0 0.71 0 0 0  0 0 0.84 0 0  0 0 0 1 0"/></filter></defs>
${water}${layer(t.backdrop.far)}${bands.far.join('')}${layer(t.backdrop.reef)}${bands.mid.join('')}${plantSvgs}${bands.near.join('')}${layer(t.backdrop.floor)}${critterSvgs}${causticSvgs}${rays}${bubbles}
</svg>`;
}

// ---------- device export: optimized textures + theme.json ----------
//
// The review images above use the full-size art. The Roku gets textures that cost as little
// texture memory as possible (it stores every image as width x height x 4 bytes, whatever the
// file format), and files as small as possible (the Channel Store package cap is ~4 MB):
//   - sprites are cropped to their visible pixels, with offsets in theme.json
//   - backdrop rows that are always hidden behind solid layers in front are trimmed away
//   - soft, blurry textures are stored smaller and stretched back by the Poster (illustrated only;
//     pixel art must stay at full size to stay crisp)
//   - anything wider than MAX_TEXTURE is split into pieces (2048 is a widely reported Roku limit)
//   - PNGs become palette PNGs when that's lossless (pixel art) or visually identical (illustrated)

const MAX_TEXTURE = 2048;
const BUDGET = { textureMB: 20, packageMB: 4 };
// Soft textures stored at a fraction of their display size (non-pixelated styles only).
const SOFT_SCALE = { far: 0.5, ray: 0.25, caustics: 0.5 };
// The size LightRays.brs draws each light ray at.
const RAY_DRAWN = [240, 820];

function alphaBox(img) {
  let [x0, y0, x1, y1] = [img.width, img.height, -1, -1];
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] > 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// Draws src over dst (same size), straight alpha.
function blendOver(dst, src) {
  for (let i = 0; i < dst.data.length; i += 4) {
    const sa = src.data[i + 3] / 255;
    if (sa === 0) continue;
    const da = dst.data[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    for (let c = 0; c < 3; c++) {
      dst.data[i + c] = Math.round((src.data[i + c] * sa + dst.data[i + c] * da * (1 - sa)) / oa);
    }
    dst.data[i + 3] = Math.round(oa * 255);
  }
}

function flipH(img) {
  const data = new Uint8Array(img.data.length);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const src = (y * img.width + x) * 4;
      data.set(img.data.subarray(src, src + 4), (y * img.width + (img.width - 1 - x)) * 4);
    }
  }
  return { width: img.width, height: img.height, data };
}

function crop(img, x, y, w, h) {
  const data = new Uint8Array(w * h * 4);
  for (let row = 0; row < h; row++) {
    const src = ((y + row) * img.width + x) * 4;
    data.set(img.data.subarray(src, src + w * 4), row * w * 4);
  }
  return { width: w, height: h, data };
}

// Smallest height, over all columns, of the fully opaque run up from the bottom edge.
function solidCover(img) {
  let min = img.height;
  for (let x = 0; x < img.width; x++) {
    let run = 0;
    for (let y = img.height - 1; y >= 0 && img.data[(y * img.width + x) * 4 + 3] === 255; y--) run++;
    if (run < min) min = run;
  }
  return min;
}

async function resize(img, w, h) {
  const { data, info } = await sharp(Buffer.from(img.data), { raw: { width: img.width, height: img.height, channels: 4 } })
    .resize(w, h, { kernel: 'lanczos3', fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data) };
}

// Pixel art: a palette PNG, which is lossless (its colors already come from one palette).
// Smooth styles: a 256-color palette PNG (libimagequant at quality 90, lightly dithered) when its
// average error on visible pixels stays within PALETTE_MEAN_ERR levels per channel, which is
// invisible at screen size and ~30% smaller than truecolor; otherwise a truecolor PNG.
const PALETTE_MEAN_ERR = 5;

async function encodeTexture(img, exact) {
  const raw = () => sharp(Buffer.from(img.data), { raw: { width: img.width, height: img.height, channels: 4 } });
  const full = await raw().png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 }).toBuffer();
  let pal;
  try {
    pal = exact
      ? await raw().png({ palette: true, quality: 100, effort: 10, dither: 0, compressionLevel: 9 }).toBuffer()
      : await raw().png({ palette: true, quality: 90, effort: 10, dither: 0.8, compressionLevel: 9 }).toBuffer();
  } catch {
    return { buf: full, palette: false };
  }
  if (pal.length >= full.length) return { buf: full, palette: false };
  const back = PNG.sync.read(pal).data;
  let sum = 0;
  let n = 0;
  let max = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    const a = img.data[i + 3];
    const ea = Math.abs(a - back[i + 3]);
    if (ea > max) max = ea;
    if (a === 0) continue;
    for (let c = 0; c < 3; c++) {
      const e = Math.abs(img.data[i + c] - back[i + c]);
      sum += e;
      n++;
      if (e > max) max = e;
    }
  }
  const ok = exact ? max === 0 : n === 0 || sum / n <= PALETTE_MEAN_ERR;
  return ok ? { buf: pal, palette: true } : { buf: full, palette: false };
}

async function exportDevice(style, t, outDir) {
  const exact = t.pixelated;
  const stats = { textures: 0, decoded: 0, bytes: 0, palette: 0, maxDim: 0, files: [] };
  const written = new Map();
  async function write(name, img) {
    if (written.has(name)) return written.get(name);
    const { buf, palette } = await encodeTexture(img, exact);
    fs.writeFileSync(path.join(outDir, `${name}.png`), buf);
    stats.textures++;
    stats.decoded += img.width * img.height * 4;
    stats.bytes += buf.length;
    if (palette) stats.palette++;
    stats.maxDim = Math.max(stats.maxDim, img.width, img.height);
    stats.files.push({ name, w: img.width, h: img.height, bytes: buf.length });
    const uri = `pkg:/images/themes/${style}/${name}.png`;
    written.set(name, uri);
    return uri;
  }
  const soft = (key) => (exact ? 1 : SOFT_SCALE[key] ?? 1);

  // Backdrops: trim always-hidden bottom rows, soften, split. Display sizes stay in screen px.
  const out = { style, pixelated: t.pixelated, bandScale: t.bandScale, backdrop: {}, floorCover: t.floorCover };
  const bd = t.backdrop;
  if (bd.water) out.backdrop.water = { uri: await write(bd.water.name, bd.water.img), w: bd.water.w, h: bd.water.h };
  const cover = { floor: bd.floor ? solidCover(bd.floor.img) : 0, reef: bd.reef ? solidCover(bd.reef.img) : 0 };
  const hiddenBelow = { floor: 0, reef: cover.floor, far: Math.max(cover.floor, cover.reef) };
  for (const key of ['far', 'reef', 'floor']) {
    const a = bd[key];
    if (!a) continue;
    const margin = 6;
    const trim = Math.max(0, Math.min(a.h - 1, hiddenBelow[key] - margin));
    let img = trim > 0 ? crop(a.img, 0, 0, a.w, a.h - trim) : a.img;
    const dispH = img.height;
    const s = soft(key);
    if (s !== 1) img = await resize(img, Math.round(img.width * s), Math.round(img.height * s));
    const pieces = Math.ceil(img.width / MAX_TEXTURE);
    const chunks = [];
    for (let i = 0; i < pieces; i++) {
      const x0 = Math.round((i * img.width) / pieces);
      const x1 = Math.round(((i + 1) * img.width) / pieces);
      const part = pieces === 1 ? img : crop(img, x0, 0, x1 - x0, img.height);
      chunks.push({ uri: await write(pieces === 1 ? a.name : `${a.name}-${i}`, part), x: (x0 / img.width) * a.w, w: ((x1 - x0) / img.width) * a.w });
    }
    out.backdrop[key] = { w: a.w, h: dispH, bottom: trim, chunks };
  }

  // Soft single textures: ray (stretched as is) and caustics (cropped, then stretched).
  if (t.ray) {
    // Never store a ray larger than it's drawn (LightRays.brs draws it at RAY_DRAWN).
    const s = soft('ray');
    const w = Math.min(Math.round(t.ray.w * s), RAY_DRAWN[0]);
    const h = Math.min(Math.round(t.ray.h * s), RAY_DRAWN[1]);
    const img = w !== t.ray.w || h !== t.ray.h ? await resize(t.ray.img, w, h) : t.ray.img;
    out.ray = { uri: await write(t.ray.name, img), w: t.ray.w, h: t.ray.h };
  }
  if (t.caustics) {
    const c = t.caustics;
    const box = alphaBox(c.img) ?? { x: 0, y: 0, w: c.w, h: c.h };
    let img = crop(c.img, box.x, box.y, box.w, box.h);
    const s = soft('caustics');
    if (s !== 1) img = await resize(img, Math.round(img.width * s), Math.round(img.height * s));
    // Fractions of the full canvas, because the engine stretches the canvas over the screen.
    out.caustics = { uri: await write(c.name, img), fx: box.x / c.w, fy: box.y / c.h, fw: box.w / c.w, fh: box.h / c.h };
  }
  out.bubbles = [];
  for (const b of t.bubbles) out.bubbles.push({ uri: await write(b.name, b.img), w: b.w, h: b.h });
  out.plants = [];
  for (const p of t.plants) {
    const segments = [];
    for (const sgm of p.segments) segments.push({ uri: await write(sgm.name, sgm.img), w: sgm.w, h: sgm.h });
    out.plants.push({ id: p.id, overlap: p.overlap, sway: p.sway, segments });
  }

  // Creatures: each part cropped to its visible pixels; x/y place it on the shared canvas.
  // Creatures that turn around also get a left-facing (mirrored) copy of every part: on a
  // real Roku a negative scale moves child images to their mirrored places but doesn't mirror
  // the images themselves, so fish swam backwards with detached tails. The crab (walks
  // sideways) and the jellyfish (rises straight up) never turn, so they don't need one.
  const turns = (c) => !c.sideways && c.motion !== 'rise';
  const creatures = async (list) => {
    const res = [];
    for (const c of list) {
      const parts = [];
      for (const p of c.parts) {
        const box = alphaBox(p.img) ?? { x: 0, y: 0, w: 1, h: 1 };
        const cropped = crop(p.img, box.x, box.y, box.w, box.h);
        const uri = await write(p.name, cropped);
        const part = { uri, x: box.x, y: box.y, w: box.w, h: box.h, anim: p.anim, pivot: p.pivot };
        if (turns(c)) part.uriL = await write(`${p.name}.L`, flipH(cropped));
        if (p.amp !== undefined) part.amp = p.amp;
        if (p.period !== undefined) part.period = p.period;
        parts.push(part);
      }
      const { parts: _drop, ...rest } = c;
      const out = { ...rest, parts };
      // One pre-combined image at the rest pose (frame A), for creatures drawn without
      // moving parts: school members and far-away fish (only species that can be either). One image instead of 2-3 per fish
      // cuts the number of images the Roku draws each frame.
      if (!c.critter && (c.school || (c.bands ?? []).includes('far'))) {
        const flat = { width: c.w, height: c.h, data: new Uint8Array(c.w * c.h * 4) };
        for (const p of c.parts) if (p.anim !== 'frameB') blendOver(flat, p.img);
        const box = alphaBox(flat) ?? { x: 0, y: 0, w: 1, h: 1 };
        const fc = crop(flat, box.x, box.y, box.w, box.h);
        out.flat = { uri: await write(`${c.id}.flat`, fc), x: box.x, y: box.y, w: box.w, h: box.h };
        if (turns(c)) out.flat.uriL = await write(`${c.id}.flat.L`, flipH(fc));
      }
      res.push(out);
    }
    return res;
  };
  out.fish = await creatures(t.fish);
  out.visitors = await creatures(t.visitors);
  out.critters = await creatures(t.critters);

  fs.writeFileSync(path.join(outDir, 'theme.json'), JSON.stringify(out));
  return stats;
}

function reportBudget(style, st) {
  const mb = (b) => (b / 1e6).toFixed(1);
  const flags = [];
  if (st.decoded / 1e6 > BUDGET.textureMB) flags.push(`over the ${BUDGET.textureMB} MB texture budget`);
  if (st.maxDim > MAX_TEXTURE) flags.push(`a texture exceeds ${MAX_TEXTURE}px`);
  console.log(
    `[${style}] device: ${st.textures} textures, ${mb(st.decoded)} MB texture memory, ${mb(st.bytes)} MB of PNGs ` +
      `(${st.palette} palette), largest side ${st.maxDim}px${flags.length ? ` -- WARNING: ${flags.join(', ')}` : ''}`,
  );
  if (flags.length) warnings++;
}

// ---------- store images (from the illustrated tank mock) ----------

async function buildStoreImages(theme) {
  const dir = path.join(root, 'src', 'images', 'store');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const overlay = (name) => {
    const f = path.join(artDir, 'store', `${name}.svg`);
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '') : '';
  };
  const mockInner = theme.mockSvg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const frame = (w, h, view, name) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${view}">${mockInner}${overlay(name)}</svg>`;
  const out = [
    ['splash_fhd', 1920, 1080, '0 0 1920 1080'],
    ['splash_hd', 1280, 720, '0 0 1920 1080'],
    ['icon_focus_fhd', 540, 405, '480 160 960 720'],
    ['icon_focus_hd', 290, 218, '480 160 960 720'],
  ];
  // Splash images aren't packaged: a full-screen splash stayed loaded at 8.4 MB of texture
  // memory on a Roku Ultra, and a screensaver doesn't need one (the manifest keeps
  // splash_color). They're still written to out/store/ for the Channel Store listing.
  const listing = path.join(outReview, 'store');
  fs.mkdirSync(listing, { recursive: true });
  for (const [name, w, h, view] of out) {
    const png = encodePng(renderSvg(frame(w, h, view, name.replace(/_(f?hd)$/, ''))));
    const target = name.startsWith('splash') ? listing : dir;
    fs.writeFileSync(path.join(target, `${name}.jpg`), await sharp(png).jpeg({ quality: 88, mozjpeg: true }).toBuffer());
  }
  console.log('[store] icons and splash -> src/images/store/');
}

// ---------- main ----------

let failed = false;
for (const style of styles) {
  if (!fs.existsSync(path.join(artDir, style, 'sprites.json'))) { console.error(`Unknown style "${style}"`); process.exit(1); }
  try {
    const theme = await buildStyle(style);
    if (style === 'illustrated') await buildStoreImages(theme);
  } catch (err) {
    failed = true;
    console.error(err.message);
  }
}
if (warnings) console.warn(`${warnings} warning(s)`);
if (failed) process.exit(1);
