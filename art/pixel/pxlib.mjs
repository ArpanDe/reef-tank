// Shared helpers for the pixel backdrop generators (*.px.mjs). Not a sprite itself.
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 4x4 Bayer thresholds in (0,1)
export const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((r) => r.map((v) => (v + 0.5) / 16));
export const bayer = (x, y) => BAYER4[y & 3][x & 3];

// ---------- tiling helpers for the scrolling backdrops ----------
export const TILE = 426; // backdrop width in cells (2556 px); everything below repeats exactly over it
// Ordered dither that is 2 cells wide (426 is even, so the pattern lines up across the seam), 4 tall.
const DITHER24 = [[0, 4], [6, 2], [1, 5], [7, 3]].map((r) => r.map((v) => (v + 0.5) / 8));
export const dither = (x, y) => DITHER24[((y % 4) + 4) % 4][((x % 2) + 2) % 2];
// Periodic sine: k whole waves across the tile.
export const psin = (x, k, phase = 0) => Math.sin((2 * Math.PI * k * x) / TILE + phase);
// Periodic value noise in [0,1]: lattice spacing `cell` must divide TILE (1, 2, 3, 6, 71, ...).
export function pnoise(seed, cell) {
  const n = TILE / cell;
  const at = (i, j) => { // hash of (i mod n, j, seed) -> [0,1)
    let h = Math.imul((((i % n) + n) % n) + 1, 0x27d4eb2d) ^ Math.imul(j + 7919, 0x165667b1) ^ Math.imul(seed + 1, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / cell, fy = y / cell, i = Math.floor(fx), j = Math.floor(fy), u = sm(fx - i), v = sm(fy - j);
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

export const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

export class Canvas {
  // wrap: x wraps around the width, so anything drawn across an edge reappears on the other side (tiling)
  constructor(w, h, { wrap = false } = {}) { this.width = w; this.height = h; this.wrap = wrap; this.data = new Uint8Array(w * h * 4); }
  wx(x) { return this.wrap ? ((Math.floor(x) % this.width) + this.width) % this.width : Math.floor(x); }
  in(x, y) { x = this.wx(x); return x >= 0 && y >= 0 && x < this.width && y < this.height; }
  set(x, y, c, a = 255) {
    x = this.wx(x); y = Math.floor(y);
    if (!this.in(x, y) || !c) return;
    const i = (y * this.width + x) * 4;
    this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2]; this.data[i + 3] = c[3] ?? a;
  }
  get(x, y) {
    x = this.wx(x);
    if (!this.in(x, y)) return null;
    const i = (y * this.width + x) * 4;
    return this.data[i + 3] ? [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]] : null;
  }
  opaque(x, y) { x = this.wx(x); return this.in(x, y) && this.data[(y * this.width + x) * 4 + 3] > 0; }
  // copy another canvas on top (opaque cells only)
  over(o, dx = 0, dy = 0) {
    for (let y = 0; y < o.height; y++) for (let x = 0; x < o.width; x++) { const c = o.get(x, y); if (c) this.set(x + dx, y + dy, c); }
    return this;
  }
  // ring of `col` around opaque cells (4-neighbour)
  outline(col) {
    const add = [];
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) {
      if (this.opaque(x, y)) continue;
      if (this.opaque(x + 1, y) || this.opaque(x - 1, y) || this.opaque(x, y + 1) || this.opaque(x, y - 1)) add.push([x, y]);
    }
    for (const [x, y] of add) this.set(x, y, col);
    return this;
  }
  result() { return { width: this.width, height: this.height, data: this.data }; }
}

// Shared water gradient (screen fraction 0 = surface, 1 = floor), used by water and to tint the far layer.
export const WATER_STOPS = [
  [0.0, hex('#6fe0ec')],
  [0.12, hex('#3cc0dc')],
  [0.3, hex('#1f93c4')],
  [0.5, hex('#166aa6')],
  [0.72, hex('#104783')],
  [1.0, hex('#0a2654')],
];
export function waterAt(t) {
  t = Math.min(1, Math.max(0, t));
  for (let i = 1; i < WATER_STOPS.length; i++) {
    const [t1, c1] = WATER_STOPS[i];
    const [t0, c0] = WATER_STOPS[i - 1];
    if (t <= t1) return mix(c0, c1, (t - t0) / (t1 - t0));
  }
  return WATER_STOPS[WATER_STOPS.length - 1][1];
}

// ---------- shape helpers on a Uint8Array mask (value = layer id; higher ids win) ----------
export class Mask {
  constructor(w, h, { wrap = false } = {}) { this.w = w; this.h = h; this.wrap = wrap; this.m = new Uint8Array(w * h); }
  wx(x) { return this.wrap ? ((Math.floor(x) % this.w) + this.w) % this.w : Math.floor(x); }
  in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { x = this.wx(x); return this.in(x, y) ? this.m[y * this.w + x] : 0; }
  put(x, y, id, force = false) {
    x = this.wx(x); y = Math.floor(y);
    if (!this.in(x, y)) return;
    const i = y * this.w + x;
    if (force || this.m[i] < id) this.m[i] = id;
  }
  ellipse(cx, cy, rx, ry, id, force) {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++)
      if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) this.put(x, y, id, force);
  }
  // thick line from (x0,y0) to (x1,y1), radius r0 -> r1
  stroke(x0, y0, x1, y1, r0, r1, id, force) {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2) + 1;
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, r = r0 + (r1 - r0) * t;
      if (r < 0.75) this.put(x, y, id, force);
      else this.ellipse(x, y, r, r, id, force);
    }
  }
  // fill below a height function (top edge)
  ground(topFn, id, force) { for (let x = 0; x < this.w; x++) for (let y = Math.max(0, Math.floor(topFn(x))); y < this.h; y++) this.put(x, y, id, force); }
}

// Branching coral: recursive forks growing upward from (x,y).
export function branchy(mask, rand, x, y, len, ang, r, depth, id, spread = 0.55) {
  const x1 = x + Math.cos(ang) * len, y1 = y + Math.sin(ang) * len;
  mask.stroke(x, y, x1, y1, r, Math.max(0.5, r * 0.8), id);
  if (depth <= 0) return [[x1, y1]];
  const tips = [];
  const n = rand() < 0.35 ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const a = ang + (i - (n - 1) / 2) * spread * 2 / Math.max(1, n - 1) + (rand() - 0.5) * 0.35;
    tips.push(...branchy(mask, rand, x1, y1, len * (0.68 + rand() * 0.2), a, Math.max(0.5, r * 0.78), depth - 1, id, spread));
  }
  return tips;
}

// Sea fan: a flat fan of fine branches from a short stalk, plus cross-links (lattice look).
export function seaFan(mask, rand, x, y, w, h, id) {
  mask.stroke(x, y, x, y - 3, 1, 0.8, id);
  const n = Math.round(w * 0.7);
  const tips = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const a = -Math.PI / 2 + (t - 0.5) * 2.1;
    let px = x, py = y - 3;
    const len = h * (0.82 + 0.18 * Math.sin(t * Math.PI)) * (0.9 + rand() * 0.1);
    const steps = Math.ceil(len);
    for (let s = 0; s < steps; s++) {
      const k = s / steps;
      px += Math.cos(a) * (w / h) * 0.9 + (rand() - 0.5) * 0.6;
      py += Math.sin(a) * 0.95 * (1 - 0.2 * k) - 0.15;
      mask.put(px, py, id);
    }
    tips.push([px, py]);
  }
  // cross-links between neighbouring ribs
  for (let r = 0.4; r < 1; r += 0.24) {
    for (let i = 0; i + 1 < tips.length; i++) {
      const [ax, ay] = tips[i], [bx, by] = tips[i + 1];
      const p = [x + (ax - x) * r, y - 3 + (ay - y + 3) * r], q = [x + (bx - x) * r, y - 3 + (by - y + 3) * r];
      mask.stroke(p[0], p[1], q[0], q[1], 0.5, 0.5, id);
    }
  }
}
