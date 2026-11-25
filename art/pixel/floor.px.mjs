// Reef floor: 426x42 cells (2556x252 px), tiles seamlessly. The nearest slice of the same reef as
// `reef`, a notch more saturated and more detailed. The upper part is a mound of reef rock with
// low coral heads (brain, boulder, plate), sponges and tube worms poking up; the bottom ~45% is
// flat coral rubble with encrusting coral and a few sand pockets, where the critters walk.
// Everything wraps around the edges and the dither pattern is 2 cells wide, so the seam lines up.
import { Canvas, Mask, rng, hex, TILE, dither, psin, pnoise } from './pxlib.mjs';

const W = TILE, H = 42, GROUND = 23;
const pal = (o) => { for (const k in o) o[k] = Array.isArray(o[k]) ? o[k].map(hex) : hex(o[k]); return o; };
const MAT = {
  rock: pal({ light: '#b896ac', base: '#8a6a86', dark: '#5e4660', line: '#36263c' }),
  rock2: pal({ light: '#b2a08c', base: '#86705e', dark: '#5c4a3c', line: '#342820' }),
  brain: pal({ light: '#ffe08a', base: '#e0b448', dark: '#a87c26', line: '#5a3e10', groove: '#9a6e1e' }),
  brainG: pal({ light: '#c4f0a0', base: '#86c860', dark: '#5a9440', line: '#2a5020', groove: '#4e8a36' }),
  boulder: pal({ light: '#e6b4f0', base: '#b47ccc', dark: '#7e5096', line: '#46285a', dot: '#f4d8fa' }),
  boulder2: pal({ light: '#ffc0a0', base: '#e48a68', dark: '#a85a40', line: '#5a2a1a', dot: '#ffe0cc' }),
  plate: pal({ light: '#a0f0e4', base: '#4cbcb4', dark: '#2a8282', line: '#124848' }),
  plate2: pal({ light: '#ffd08a', base: '#e09448', dark: '#a85e24', line: '#5a2e0c' }),
  barrel: pal({ light: '#ffaa70', base: '#e8703c', dark: '#a84824', line: '#5a200c', hole: '#2e0e06' }),
  tube: pal({ light: '#d8a0ff', base: '#a060e0', dark: '#6c3aa4', line: '#3a1a5c', hole: '#1e0c30' }),
  zoa: pal({ light: '#b0fff0', base: '#40d0b8', dark: '#22907e', line: '#0e4a40' }),
};
const CRUST = ['#ff8aa8', '#e05a82', '#ffb070', '#d87a3a', '#c890ff', '#9a5ad8', '#9ae070', '#5aa040'].map(hex);
// rubble is kept mid-toned and muted so the bright, outlined critters read clearly on top of it
const RUBBLE = [
  ['#cfc3ac', '#ad9f86', '#7c705c'], // bone
  ['#c8a0aa', '#a47c88', '#74545e'], // pink
  ['#b2a6c2', '#8e829e', '#625a74'], // lilac
  ['#c6ac88', '#a28a68', '#725f46'], // tan
  ['#a6b2bc', '#84909c', '#5a6470'], // blue-grey
].map((c) => c.map(hex));
const CREVICE = [hex('#5a4a52'), hex('#6a5860'), hex('#46383f')];
const SAND = [hex('#e2d0a4'), hex('#ccb284'), hex('#ae9468')];

export default function () {
  const rand = rng(4242);
  const c = new Canvas(W, H, { wrap: true });
  const wdx = (x, cx) => ((((x - cx) % W) + W + W / 2) % W) - W / 2; // wrapped offset from a centre
  const mottle = pnoise(201, 6), fine = pnoise(202, 3), crust = pnoise(203, 6), crustHue = pnoise(204, 71);

  // ---------- shaded object painter ----------
  function paint(m, P, kind, ctr) {
    const inM = (x, y) => m.get(x, y) > 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (inM(x, y)) continue;
      if (inM(x + 1, y) || inM(x - 1, y) || inM(x, y + 1) || inM(x, y - 1)) c.set(x, y, P.line);
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!inM(x, y)) continue;
      let yy = 0; while (yy < 30 && inM(x, y - yy - 1)) yy++;
      const right = !inM(x + 1, y), left = !inM(x - 1, y), below = !inM(x, y + 1);
      let v = yy < 1 ? 0 : yy < 3 ? 0.7 : 1.1 + Math.min(0.7, (yy - 3) / 10);
      if (right || below) v += 0.7; if (left) v -= 0.5;
      v += (mottle(x, y) - 0.5) * 0.9 + (fine(x, y) - 0.5) * 0.4;
      let q = Math.floor(v); if (v - q > dither(x, y)) q++;
      let col = [P.light, P.base, P.dark][Math.max(0, Math.min(2, q))];
      if (kind === 'rock') {
        // encrusting coral and coralline algae on upward faces, in patches of changing colour
        if (yy < 4 && crust(x, y) > 0.6) { const h = Math.floor(crustHue(x, y) * 4) * 2; col = CRUST[h + (yy < 1 || crust(x, y) > 0.72 ? 0 : 1)]; }
        if (rand() < 0.015 && yy > 2) col = P.line;
      }
      if (kind === 'brain' && yy > 0 && !right && !below) {
        const lx = wdx(x, ctr[0]), ly = y - ctr[1];
        const g = Math.sin(lx * 0.9 + 1.6 * Math.sin(ly * 0.7 + lx * 0.15)) + 0.8 * Math.cos(ly * 1.1 + 1.2 * Math.sin(lx * 0.5));
        if (Math.abs(g) < 0.34) col = P.groove;
      }
      // small repeating details use coordinates local to the object, so they stay intact across the seam
      const lx = ctr ? Math.round(wdx(x, ctr[0])) + 64 : x;
      if (kind === 'boulder' && yy > 0 && !right && y % 2 === 0 && (lx + (y % 4 === 0 ? 0 : 2)) % 4 === 0) col = P.dot; // polyp pores
      if (kind === 'plate' && !below && yy >= 1) col = (lx + y) % 4 === 0 ? P.base : P.dark;     // underside
      if (kind === 'plate' && yy === 0) col = (lx % 3 === 0) ? P.base : P.light;                // growth ridges
      if (kind === 'sponge' && !left && !right && yy > 1 && (y + Math.floor(x / 2)) % 3 === 0) col = P.light;
      c.set(x, y, col);
    }
  }
  const mask = () => new Mask(W, H, { wrap: true });

  // ---------- back mound of reef rock (sets the irregular top edge) ----------
  const top = (x) => 12.5 + 2.4 * psin(x, 3, 0.4) + 1.6 * psin(x, 8, 1.2) + 1.0 * psin(x, 19, 2) + 0.6 * psin(x, 47, 0.5);
  { const m = mask(); m.ground(top, 1); paint(m, MAT.rock, 'rock'); }
  { // a second, warmer rock tone in lumps along the mound
    const m = mask(), r = rng(7);
    for (let x = 10; x < W; x += 34 + Math.floor(r() * 30)) m.ellipse(x, top(x) + 6, 8 + r() * 8, 5 + r() * 3, 1);
    paint(m, MAT.rock2, 'rock');
  }

  // ---------- coral heads, sponges and worms poking up from the mound ----------
  const heads = [
    ['brain', 14], ['plate', 40], ['barrel', 60], ['boulder', 82], ['brainG', 108], ['tube', 128], ['plate2', 150],
    ['brain', 176], ['boulder2', 200], ['zoa', 222], ['plate', 246], ['brainG', 270], ['barrel', 292], ['boulder', 316],
    ['tube', 338], ['brain', 360], ['plate2', 384], ['boulder2', 408],
  ];
  const worms = [];
  for (const [kind, x0] of heads) {
    const x = x0 + Math.floor(rand() * 6), base = Math.round(top(x)) + 5;
    const m = mask();
    if (kind.startsWith('brain')) {
      const rx = 6 + rand() * 3, ry = 5 + rand() * 2;
      m.ellipse(x, base, rx, ry, 1);
      paint(m, MAT[kind], 'brain', [x, base - ry]);
      worms.push([x - 2 + Math.floor(rand() * 4), Math.round(base - ry) - 1]);
    } else if (kind.startsWith('boulder')) {
      m.ellipse(x, base - 1, 7 + rand() * 2, 5.5 + rand() * 1.5, 1);
      m.ellipse(x - 4, base, 3.6, 3.6, 1); m.ellipse(x + 4.5, base, 3.4, 3.4, 1);
      paint(m, MAT[kind], 'boulder', [x, base]);
      worms.push([x + 3, base - 6]);
    } else if (kind.startsWith('plate')) {
      const w = 8 + rand() * 3;
      // whorled tiers, widest at the bottom
      m.ellipse(x, base, w, 2.0, 1); m.ellipse(x - 0.5, base - 3, w * 0.74, 1.6, 1); m.ellipse(x + 0.5, base - 5.6, w * 0.48, 1.4, 1);
      paint(m, MAT[kind], 'plate', [x, base]);
    } else if (kind === 'barrel') {
      m.stroke(x, base + 2, x, base - 7, 3.6, 3.0, 1);
      paint(m, MAT.barrel, 'sponge');
      for (let dx = -2; dx <= 1; dx++) c.set(x + dx, base - 9, MAT.barrel.hole);
      for (let dx = -1; dx <= 0; dx++) c.set(x + dx, base - 8, MAT.barrel.hole);
    } else if (kind === 'tube') {
      const tubes = [[0, 9], [3, 6], [-3, 5]];
      for (const [dx, h] of tubes) m.stroke(x + dx, base + 2, x + dx, base - h, 1.3, 1.2, 1);
      paint(m, MAT.tube, 'sponge');
      for (const [dx, h] of tubes) { c.set(x + dx, base - h - 1, MAT.tube.hole); c.set(x + dx - 1, base - h - 1, MAT.tube.hole); }
    } else if (kind === 'zoa') {
      for (let i = 0; i < 16; i++) m.ellipse(x + (rand() - 0.5) * 14, base - 2 - rand() * 3, 1.1, 1.1, 1);
      paint(m, MAT.zoa, 'blob');
    }
  }
  // feather-duster worms and tiny christmas-tree worms on the coral heads
  const DUSTER = [hex('#ff4a5a'), hex('#ffffff'), hex('#d8c09a'), hex('#5a2020')];
  const TREES = [['#3a8cff', '#9ac8ff'], ['#ffa02a', '#ffd88a'], ['#ff5ad0', '#ffb0ec'], ['#ffe040', '#fff4a8']].map((p) => p.map(hex));
  worms.forEach(([x, y], i) => {
    if (i % 2 === 0) {
      c.set(x, y + 1, DUSTER[2]); c.set(x, y, DUSTER[2]);
      for (const [dx, dy, k] of [[-2, -2, 0], [-1, -2, 1], [0, -2, 0], [1, -2, 1], [2, -2, 0], [-1, -1, 0], [0, -1, 1], [1, -1, 0]]) c.set(x + dx, y + dy, DUSTER[k]);
    } else {
      const [d, l] = TREES[i % TREES.length];
      for (const dx of [-2, 2]) { c.set(x + dx, y - 1, l); c.set(x + dx - 1, y, d); c.set(x + dx, y, l); c.set(x + dx + 1, y, d); }
    }
  });

  // ---------- ground: flat coral rubble, encrusting patches, sand pockets ----------
  const gtop = (x) => GROUND + 0.8 * psin(x, 6, 0.3) + 0.6 * psin(x, 17, 1.7) + 0.4 * psin(x, 53, 0.9);
  for (let x = 0; x < W; x++) for (let y = Math.floor(gtop(x)); y < H; y++) {
    const v = (mottle(x, y + 40) - 0.5) * 2.2 + 0.9;
    let q = Math.floor(v); if (v - q > dither(x, y)) q++;
    c.set(x, y, CREVICE[Math.max(0, Math.min(2, q))]);
  }
  const pockets = [];
  for (let i = 0; i < 7; i++) {
    const px = Math.floor((i + rand() * 0.6) * (W / 7)), py = GROUND + 6 + rand() * 9, rx = 5 + rand() * 6, ry = 1.6 + rand() * 1.2;
    pockets.push([px, py, rx, ry]);
    for (let y = Math.floor(py - ry); y <= py + ry; y++) for (let x = Math.floor(px - rx); x <= px + rx; x++) {
      if (((x + 0.5 - px) / rx) ** 2 + ((y + 0.5 - py) / ry) ** 2 > 1) continue;
      const v = 0.6 + (y - py + ry) / (2 * ry) + (fine(x, y) - 0.5) * 0.8;
      let q = Math.floor(v); if (v - q > dither(x, y)) q++;
      c.set(x, y, SAND[Math.max(0, Math.min(2, q))]);
    }
  }
  const inPocket = (x, y) => pockets.some(([px, py, rx, ry]) => (wdx(x, px) / rx) ** 2 + ((y - py) / ry) ** 2 < 0.55);
  // rubble pieces, back to front, a little larger toward the viewer
  const pieces = [];
  for (let i = 0; i < 640; i++) pieces.push([rand() * W, GROUND - 0.5 + rand() * (H - GROUND + 1), rand(), rand(), rand(), rand()]);
  pieces.sort((a, b) => a[1] - b[1]);
  for (const [px, py, r1, r2, r3, r4] of pieces) {
    if (inPocket(px, py)) continue;
    const near = (py - GROUND) / (H - GROUND);
    const s = 0.75 + near * 0.6;
    const col = RUBBLE[Math.floor(r1 * RUBBLE.length)];
    const cells = [];
    if (r2 < 0.55) { // rounded chunk
      const rx = (1.4 + r3 * 1.8) * s, ry = (0.75 + r4 * 0.5) * s;
      for (let y = Math.floor(py - ry); y <= py + ry; y++) for (let x = Math.floor(px - rx); x <= px + rx; x++)
        if (((x + 0.5 - px) / rx) ** 2 + ((y + 0.5 - py) / ry) ** 2 <= 1) cells.push([x, y]);
    } else { // broken branch fragment, lying mostly flat
      const len = (3 + r3 * 4) * s, a = (r4 - 0.5) * 0.7;
      for (let t = 0; t <= len; t += 0.5) { const X = Math.floor(px + Math.cos(a) * t), Y = Math.floor(py + Math.sin(a) * t); cells.push([X, Y]); cells.push([X, Y + 1]); }
    }
    const key = new Set(cells.map(([x, y]) => `${((x % W) + W) % W},${y}`));
    const has = (x, y) => key.has(`${((x % W) + W) % W},${y}`);
    for (const [x, y] of cells) {
      if (y < Math.floor(gtop(x)) || y >= H) continue;
      c.set(x, y, !has(x, y - 1) ? col[0] : !has(x, y + 1) ? col[2] : col[1]);
      if (!has(x, y + 1) && y + 1 < H) c.set(x, y + 1, CREVICE[2]);  // contact shadow
    }
  }
  // flat encrusting coral patches on the rubble, with polyp dots
  for (let i = 0; i < 14; i++) {
    const px = (i + 0.3 + rand() * 0.4) * (W / 14), py = GROUND + 3 + rand() * 13, rx = 3 + rand() * 4, ry = 0.9 + rand() * 0.6;
    const h = Math.floor(rand() * 4) * 2, light = CRUST[h], dark = CRUST[h + 1];
    for (let y = Math.floor(py - ry); y <= py + ry; y++) for (let x = Math.floor(px - rx); x <= px + rx; x++) {
      if (((x + 0.5 - px) / rx) ** 2 + ((y + 0.5 - py) / ry) ** 2 > 1) continue;
      c.set(x, y, (x + y) % 3 === 0 ? light : dark);
    }
  }
  // a couple of tiny shells in the sand pockets
  for (const [px, py] of pockets.slice(0, 4)) {
    const x = Math.round(px), y = Math.round(py);
    c.set(x, y, hex('#fff0e8')); c.set(x + 1, y, hex('#f0b0a0')); c.set(x, y + 1, hex('#c07a6a')); c.set(x + 1, y + 1, hex('#8a4a40'));
  }
  return c.result();
}
