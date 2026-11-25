// Shared helpers for the illustrated style's procedural art (backdrops, plants, some creatures).
// Not referenced from sprites.json, so render-art never renders this file itself.

// Seeded PRNG (mulberry32) so every build is identical.
export function rng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (a, b) => a + next() * (b - a);
  next.int = (a, b) => Math.floor(a + next() * (b - a + 1));
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.sign = () => (next() < 0.5 ? -1 : 1);
  return next;
}

// Smooth 1-D value noise in roughly [-1, 1].
export function noise1d(seed, scale) {
  const r = rng(seed);
  const pts = Array.from({ length: 512 }, () => r() * 2 - 1);
  return (x) => {
    const u = x / scale;
    const i = Math.floor(u);
    const f = u - i;
    const a = pts[((i % 512) + 512) % 512];
    const b = pts[(((i + 1) % 512) + 512) % 512];
    const s = f * f * (3 - 2 * f);
    return a + (b - a) * s;
  };
}

// ---------- tiling ----------

// Backdrops scroll forever, so far/reef/sand are periodic over TILE px.
export const TILE = 2556;

// Periodic value noise over TILE (cubic-smoothed lattice of `cells` values), roughly [-1, 1].
export function pnoise(seed, cells, period = TILE) {
  const r = rng(seed);
  const pts = Array.from({ length: cells }, () => r() * 2 - 1);
  return (x) => {
    const u = (((x / period) % 1) + 1) % 1 * cells;
    const i = Math.floor(u);
    const f = u - i;
    const P = (k) => pts[((i + k) % cells + cells) % cells];
    // Catmull-Rom through the lattice: smooth slope everywhere, including across the wrap
    const p0 = P(-1), p1 = P(0), p2 = P(1), p3 = P(2);
    return 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
  };
}

// Shortest horizontal distance on the wrapped strip.
export const wrapDist = (a, b, period = TILE) => {
  const d = (((a - b) % period) + period) % period;
  return Math.min(d, period - d);
};

// Emit a feature whose horizontal extent is [x0, x1]; if it crosses a tile edge, add a copy
// shifted by one tile so it continues on the other side.
let wrapId = 0;
export function wrapX(svg, x0, x1, period = TILE) {
  const shifts = [];
  if (x0 < 0) shifts.push(period);
  if (x1 > period) shifts.push(-period);
  if (!shifts.length) return svg;
  const id = `wx${wrapId++}`;
  return `<g id="${id}">${svg}</g>` + shifts.map((dx) => `<use href="#${id}" x="${dx}"/>`).join('');
}

export const f1 = (n) => (Math.round(n * 10) / 10).toString();

// ---------- colour ----------

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
export function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
export function mix(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v + (B[i] - v) * t));
}
export const lighten = (c, t) => mix(c, '#ffffff', t);
export const darken = (c, t) => mix(c, '#000000', t);

// Water gradient, top (0) to bottom (1) of the 1080-px screen: evenly spaced stops joined by a
// smooth spline, so the colour changes steadily with no flat bands. water.svg.mjs renders it and the
// backdrops tint themselves toward the water colour behind them with waterAt().
export const WATER_STOPS = ['#8cdcea', '#4cb2d8', '#2384bd', '#145b97', '#0b3a6b', '#05203e'];
export function waterRGB(t) {
  t = Math.max(0, Math.min(1, t));
  const C = WATER_STOPS.map(hexToRgb);
  const n = C.length - 1;
  const u = t * n;
  const i = Math.min(n - 1, Math.floor(u));
  const f = u - i;
  const P = (k) => C[Math.max(0, Math.min(n, i + k))];
  return [0, 1, 2].map((ch) => {
    const p0 = P(-1)[ch], p1 = P(0)[ch], p2 = P(1)[ch], p3 = P(2)[ch];
    return 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
  });
}
export const waterAt = (screenY) => rgbToHex(waterRGB(screenY / 1080));

// ---------- geometry ----------

// Catmull-Rom spline through points -> cubic Bezier path data.
export function smooth(points, closed = false, tension = 1) {
  const n = points.length;
  if (n < 2) return '';
  const P = (i) => (closed ? points[(i + n) % n] : points[Math.max(0, Math.min(n - 1, i))]);
  let d = `M${f1(points[0][0])},${f1(points[0][1])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    const k = tension / 6;
    const c1 = [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
    const c2 = [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
    d += `C${f1(c1[0])},${f1(c1[1])} ${f1(c2[0])},${f1(c2[1])} ${f1(p2[0])},${f1(p2[1])}`;
  }
  return closed ? d + 'Z' : d;
}

// Irregular closed blob around an ellipse.
export function blob(r, cx, cy, rx, ry, { n = 11, jitter = 0.12, flatBottom = false, rot = 0 } = {}) {
  const pts = [];
  const off = r() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = off + (i / n) * Math.PI * 2;
    const k = 1 + (r() * 2 - 1) * jitter;
    let x = Math.cos(a) * rx * k;
    let y = Math.sin(a) * ry * k;
    if (flatBottom && y > 0) y *= 0.55;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    pts.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return smooth(pts, true);
}

// Tapered stroke along a polyline: returns a closed outline path (width w0 at start -> w1 at end).
export function taper(points, w0, w1, cap = true) {
  const n = points.length;
  const left = [];
  const right = [];
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const w = (w0 + (w1 - w0) * (i / (n - 1))) / 2;
    left.push([points[i][0] - dy * w, points[i][1] + dx * w]);
    right.push([points[i][0] + dy * w, points[i][1] - dx * w]);
  }
  const pts = [...left, ...(cap ? [points[n - 1]] : []), ...right.reverse()];
  return smooth(pts, true);
}

export const svgDoc = (w, h, body, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
  (defs ? `<defs>${defs}</defs>` : '') +
  body +
  '</svg>';
