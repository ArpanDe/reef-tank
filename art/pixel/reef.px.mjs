// Reef layer: 426x90 cells (2556 px), tiles seamlessly. Three taller coral clusters alternate with
// low stretches (one cluster + one low stretch every ~142 cells) so open water keeps passing through
// the fish zone as the layer scrolls. Each object is drawn into its own wrapping mask, then shaded
// (light from above), textured, outlined in its own dark tone and stacked back to front. Colours are
// a notch less saturated than the fish.
import { Canvas, Mask, rng, hex, branchy, seaFan, TILE, dither, pnoise } from './pxlib.mjs';

const W = TILE, H = 90;
const MAT = {
  rockWarm: { light: '#ab9c8a', base: '#80705f', dark: '#5a4c40', line: '#352a22' },
  rockPurple: { light: '#9e90aa', base: '#736680', dark: '#4e445e', line: '#2f2a3c' },
  rockBlue: { light: '#8c9cac', base: '#627284', dark: '#43505f', line: '#28303c' },
  brain: { light: '#d8cb8c', base: '#b5a466', dark: '#86763f', line: '#4f4424', groove: '#8a7a44' },
  brain2: { light: '#a8cc9a', base: '#7fa878', dark: '#5a7c58', line: '#2f4a32', groove: '#58805a' },
  stag: { light: '#ecd9bd', base: '#c8a888', dark: '#957761', line: '#5e4636' },
  table: { light: '#a8d2bf', base: '#6fa395', dark: '#46746a', line: '#27463f' },
  fanP: { light: '#c497cc', base: '#9a6aa6', dark: '#6c4a7c', line: '#4a2d58' },
  fanR: { light: '#e08c72', base: '#b8604e', dark: '#84413a', line: '#57261f' },
  lav: { light: '#d4bfe6', base: '#a88cc0', dark: '#76609a', line: '#4a3a66' },
  sponge: { light: '#e6a46a', base: '#c27a4a', dark: '#8c5232', line: '#5a2e1e', hole: '#3a1c14' },
  leather: { light: '#e8e2a8', base: '#c8c07e', dark: '#989058', line: '#5c5634' },
  polyp: { light: '#9ee8d8', base: '#58b8a8', dark: '#3a8478', line: '#1f4c46' },
};
for (const k in MAT) for (const j in MAT[k]) MAT[k][j] = hex(MAT[k][j]);
// encrusting growth on the rocks' upper faces
const CORALLINE = [hex('#c88aa6'), hex('#a5688a')];
const ALGAE = [hex('#9cb878'), hex('#728f55')];

export default function () {
  const rand = rng(77);
  const c = new Canvas(W, H, { wrap: true });
  const objs = [];
  const obj = (mat, opts = {}) => { const m = new Mask(W, H, { wrap: true }); objs.push({ m, mat, ...opts }); return m; };

  // --- rock piles (corals sit on them) ---
  function rockPile(x0, x1, top, seed, mat) {
    const r = rng(seed), m = obj(mat, { kind: 'rock' });
    for (let x = x0; x < x1; x += 5 + r() * 6) {
      const t = (x - x0) / (x1 - x0);
      const hgt = (H - top) * (0.55 + 0.45 * Math.sin(Math.PI * t)) * (0.8 + r() * 0.3);
      m.ellipse(x, H - hgt * 0.45, 6 + r() * 7, hgt * 0.55, 1);
    }
  }
  // cluster A (tall), centred near x=50 and wrapping across the seam
  rockPile(-10, 108, 26, 3, 'rockWarm');
  rockPile(8, 70, 18, 4, 'rockPurple');
  // low stretch
  rockPile(112, 152, 56, 7, 'rockBlue');
  // cluster B (medium), x~150-236
  rockPile(148, 238, 34, 5, 'rockBlue');
  rockPile(170, 214, 27, 6, 'rockWarm');
  // low stretch
  rockPile(240, 290, 56, 8, 'rockPurple');
  // cluster C (tall), x~290-384
  rockPile(288, 386, 24, 9, 'rockPurple');
  rockPile(318, 372, 17, 10, 'rockWarm');
  // low stretch wrapping back to A
  rockPile(386, 424, 55, 11, 'rockBlue');

  // --- corals (patterned ones stay clear of the seam) ---
  { const m = obj('brain', { kind: 'brain' }); m.ellipse(22, 49, 13, 9, 1); m.ellipse(374, 46, 11, 8, 1); m.ellipse(196, 56, 7, 5, 1); }
  { const m = obj('brain2', { kind: 'brain' }); m.ellipse(130, 60, 8, 6, 1); m.ellipse(224, 46, 9, 6.5, 1); m.ellipse(404, 59, 7, 5, 1); m.ellipse(58, 40, 6, 4.5, 1); }
  { const m = obj('leather', { kind: 'blob' });
    for (const [x, y] of [[118, 52], [280, 54], [346, 46]]) for (const [dx, h] of [[-4, 6], [-1, 9], [2, 7], [5, 5]]) { m.stroke(x + dx, y + 8, x + dx * 1.3, y + 8 - h, 1.6, 1.3, 1); m.ellipse(x + dx * 1.3, y + 8 - h, 1.6, 1.6, 1); } }
  { const m = obj('fanP', { kind: 'fan' }); seaFan(m, rng(11), 34, 23, 13, 21, 1); seaFan(m, rng(14), 252, 58, 5, 9, 1); }
  { const m = obj('fanR', { kind: 'fan' }); seaFan(m, rng(12), 354, 21, 12, 20, 1); seaFan(m, rng(13), 146, 58, 5, 9, 1); seaFan(m, rng(15), 206, 30, 7, 12, 1); }
  { const m = obj('stag', { kind: 'branch' }); for (const [x, y] of [[76, 34], [82, 36]]) branchy(m, rng(x), x, y, 6, -Math.PI / 2 + (x - 79) * 0.06, 1.6, 3, 1, 0.5); branchy(m, rng(5), 416, 57, 4, -Math.PI / 2, 1.1, 2, 1, 0.6); }
  { const m = obj('lav', { kind: 'branch' }); branchy(m, rng(21), 166, 36, 5.5, -Math.PI / 2, 1.5, 3, 1, 0.6); branchy(m, rng(22), 300, 30, 5, -Math.PI / 2, 1.4, 3, 1, 0.6); branchy(m, rng(23), 268, 60, 4, -Math.PI / 2, 1.1, 2, 1, 0.6); }
  { const m = obj('table', { kind: 'table' });
    for (const [x, y, w] of [[192, 24, 15], [318, 27, 12], [100, 36, 10]]) { m.stroke(x, y + 14, x, y + 1, 2, 1.4, 1); m.ellipse(x, y, w, 2.2, 1); m.ellipse(x - 1, y - 1, w * 0.7, 1.6, 1); } }
  { const m = obj('sponge', { kind: 'sponge' });
    const tubes = [[96, 46, 12], [101, 50, 8], [232, 42, 14], [238, 47, 9], [330, 40, 15], [336, 45, 9], [160, 56, 7], [396, 55, 7]];
    for (const [x, y, h] of tubes) m.stroke(x, y + h, x, y, 2.2, 2.0, 1);
    objs[objs.length - 1].holes = tubes.map(([x, y]) => [x, y]); }
  { const m = obj('polyp', { kind: 'polyp' }), r = rng(31);
    for (const [cx, cy, n] of [[46, 38, 9], [92, 54, 7], [178, 38, 8], [214, 52, 7], [306, 46, 9], [366, 58, 6], [124, 61, 5], [410, 60, 5]])
      for (let i = 0; i < n; i++) m.ellipse(cx + (r() - 0.5) * 12, cy + (r() - 0.5) * 4, 1, 1, 1); }

  // --- shade, texture and composite each object ---
  const mottle = pnoise(101, 6), fine = pnoise(102, 3), crust = pnoise(103, 6), moss = pnoise(104, 3);
  for (const o of objs) {
    const { m, mat } = o, P = MAT[mat];
    const inM = (x, y) => m.get(x, y) > 0;
    // outline first so later objects overlap earlier ones cleanly; sea fans skip it to keep the lattice open
    if (o.kind !== 'fan') for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (inM(x, y)) continue;
      if (inM(x + 1, y) || inM(x - 1, y) || inM(x, y + 1) || inM(x, y - 1)) c.set(x, y, P.line);
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!inM(x, y)) continue;
      let col = P.base;
      let depth = 0; while (depth < 6 && inM(x, y - depth - 1)) depth++;
      const right = !inM(x + 1, y), left = !inM(x - 1, y), below = !inM(x, y + 1);
      if (depth === 0 || (left && depth < 3)) col = P.light;
      else if (right || below) col = P.dark;
      if (o.kind === 'rock') {
        // tone from height below the top, side lighting and soft mottling, quantised with the tiling dither
        let yy = 0; while (yy < 40 && inM(x, y - yy - 1)) yy++;
        let v = yy < 2 ? 0.1 : yy < 12 ? 1 : Math.min(1.65, 1 + (yy - 12) / 12);
        if (right) v += 0.6;
        if (left) v -= 0.6;
        v += (mottle(x, y) - 0.5) * 1.3 + (fine(x, y) - 0.5) * 0.5;
        let q = Math.floor(v); if (v - q > dither(x, y)) q++;
        col = [P.light, P.base, P.dark][Math.max(0, Math.min(2, q))];
        // pink coralline crust and green algae on upward faces
        if (yy < 5 && crust(x, y) > 0.66) col = CORALLINE[crust(x, y) > 0.76 || yy < 1 ? 0 : 1];
        else if (yy < 3 && moss(x, y) > 0.7) col = ALGAE[yy === 0 ? 0 : 1];
        const n = rand();
        if (n < 0.012 && yy > 2) col = P.line; // pits and cracks
      }
      if (o.kind === 'brain' && depth > 0 && !right && !below) {
        const g = Math.sin(x * 0.7 + 1.8 * Math.sin(y * 0.55 + x * 0.12)) + 0.8 * Math.cos(y * 0.9 + 1.4 * Math.sin(x * 0.4));
        col = depth <= 2 ? P.light : P.base;
        if (Math.abs(g) < 0.32) col = P.groove;
        if (depth > 5 && Math.abs(g) >= 0.32 && dither(x, y) < (depth - 5) / 6) col = P.dark;
      }
      if (o.kind === 'polyp') col = depth === 0 && !right ? P.light : P.base;
      if (o.kind === 'table' && !below && depth >= 2) col = P.dark;
      if (o.kind === 'fan') col = below || right ? P.line : depth === 0 ? P.light : (x + y) % 3 ? P.base : P.dark;
      if (o.kind === 'sponge' && !right && !left && depth > 1 && (y + Math.floor(x / 2)) % 3 === 0) col = P.light;
      c.set(x, y, col);
    }
    if (o.holes) for (const [x, y] of o.holes) { c.set(x - 1, y, P.hole); c.set(x, y, P.hole); c.set(x - 1, y + 1, P.dark); c.set(x, y + 1, P.dark); }
  }
  return c.result();
}
