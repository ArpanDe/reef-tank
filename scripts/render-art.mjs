#!/usr/bin/env node
// Renders art/<style>/ into src/images/themes/<style>/*.png + theme.json, plus review images in out/.
// Usage: node scripts/render-art.mjs [illustrated] [pixel]   (default: both)
// The format is documented in art/README.md.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { PNG } from 'pngjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artDir = path.join(root, 'art');
const outReview = path.join(root, 'out');
const STYLES = ['illustrated', 'pixel'];
const requested = process.argv.slice(2);
const styles = requested.length ? requested : STYLES;

const species = JSON.parse(fs.readFileSync(path.join(artDir, 'species.json'), 'utf8'));
delete species._doc;

// Screen layout shared with the Roku scene (components/AquariumScene.brs).
const SCREEN = { w: 1920, h: 1080 };
// Backdrops tile horizontally: the scene scrolls them forever, so the right edge must flow into the left.
const BACKDROP_WIDTH = 2556;
const BACKDROP_MAX_H = { far: 600, reef: 540, floor: 280 };
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
    fs.writeFileSync(path.join(outDir, `${name}.png`), png);
    const a = { uri: `pkg:/images/themes/${style}/${name}.png`, w: img.width, h: img.height, png };
    cache.set(file, a);
    return a;
  }

  const backdrop = {};
  for (const key of ['water', 'far', 'reef', 'floor']) {
    if (!spec.backdrop?.[key]) { warn(style, `backdrop.${key} missing`); continue; }
    const a = await asset(spec.backdrop[key]);
    if (key !== 'water') {
      if (a.w !== BACKDROP_WIDTH) warn(style, `backdrop.${key} is ${a.w}px wide, expected ${BACKDROP_WIDTH}`);
      if (a.h > BACKDROP_MAX_H[key]) warn(style, `backdrop.${key} is ${a.h}px tall, max ${BACKDROP_MAX_H[key]}`);
    }
    backdrop[key] = a;
  }

  const ray = spec.ray ? await asset(spec.ray) : (warn(style, 'ray missing'), null);
  const bubbles = [];
  for (const f of spec.bubbles ?? []) bubbles.push(await asset(f));
  if (!bubbles.length) warn(style, 'no bubbles');

  const plants = [];
  for (const p of spec.plants ?? []) {
    const segments = [];
    for (const f of p.segments) segments.push(await asset(f));
    plants.push({ id: p.id, overlap: p.overlap ?? 0, sway: p.sway ?? 0.05, segments });
  }
  if (plants.length < 3) warn(style, `only ${plants.length} plant types (want 3+)`);

  const fish = [];
  const visitors = [];
  const critters = [];
  for (const [id, behavior] of Object.entries(species)) {
    const c = spec.creatures?.[id];
    if (!c) { warn(style, `no art for creature "${id}"`); continue; }
    const parts = [];
    for (const p of c.parts) {
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
    bandScale: spec.bandScale ?? { far: 0.5, mid: 0.75, near: 1 },
    backdrop,
    ray,
    bubbles,
    plants,
    fish,
    visitors,
    critters,
  };
  const json = JSON.stringify(theme, (key, v) => (key === 'png' ? undefined : v), 1);
  fs.writeFileSync(path.join(outDir, 'theme.json'), json);

  fs.mkdirSync(outReview, { recursive: true });
  const sheet = renderSvg(sheetSvg(theme), { pixelated: theme.pixelated });
  fs.writeFileSync(path.join(outReview, `art-${style}-sheet.png`), encodePng(sheet));
  const mock = sceneSvg(theme);
  fs.writeFileSync(path.join(outReview, `art-${style}-scene-full.png`), encodePng(renderSvg(mock, { pixelated: theme.pixelated })));
  const half = encodePng(renderSvg(mock, { width: 960 }));
  fs.writeFileSync(path.join(outReview, `art-${style}-scene.png`), half);
  fs.writeFileSync(path.join(outDir, 'preview.png'), half); // shown on the Settings screen
  fs.writeFileSync(path.join(outReview, `art-${style}-seams.png`), encodePng(renderSvg(seamsSvg(theme), { pixelated: theme.pixelated })));
  theme.mockSvg = mock;
  console.log(`[${style}] ${cache.size} images, ${fish.length} fish, ${visitors.length} visitors, ${critters.length} critters, ${plants.length} plants -> src/images/themes/${style}/`);
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

  const plantBase = H - (t.backdrop.floor?.h ?? 120) * 0.55;
  // Critters walk on the front part of the floor (same band as the engine's crawlBand()).
  const floorH = t.backdrop.floor?.h ?? 120;
  const critterSvgs = t.critters
    .map((c, i) => {
      const cx = 220 + i * 360 + between(-60, 60);
      const cy = H - floorH * between(0.12, 0.4);
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
${water}${layer(t.backdrop.far)}${bands.far.join('')}${layer(t.backdrop.reef)}${bands.mid.join('')}${plantSvgs}${bands.near.join('')}${layer(t.backdrop.floor)}${critterSvgs}${rays}${bubbles}
</svg>`;
}

// ---------- store images (from the illustrated tank mock) ----------

function buildStoreImages(theme) {
  const dir = path.join(root, 'src', 'images', 'store');
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
  for (const [name, w, h, view] of out) {
    fs.writeFileSync(path.join(dir, `${name}.png`), encodePng(renderSvg(frame(w, h, view, name.replace(/_(f?hd)$/, '')))));
  }
  console.log('[store] icons and splash -> src/images/store/');
}

// ---------- main ----------

let failed = false;
for (const style of styles) {
  if (!STYLES.includes(style)) { console.error(`Unknown style "${style}"`); process.exit(1); }
  try {
    const theme = await buildStyle(style);
    if (style === 'illustrated') buildStoreImages(theme);
  } catch (err) {
    failed = true;
    console.error(err.message);
  }
}
if (warnings) console.warn(`${warnings} warning(s)`);
if (failed) process.exit(1);
