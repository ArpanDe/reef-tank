// Shared coral painters for the tiling reef backdrops (reef.px.mjs, floor.px.mjs). Not a sprite.
// Every shape is drawn into a wrapping mask, then shaded with light from above, outlined in its
// own dark tone and textured. Small repeating textures use coordinates local to each object, so
// nothing breaks where a shape crosses the 426-cell seam.
import { Mask, rng, hex, mix, TILE, dither, pnoise, branchy, seaFan } from './pxlib.mjs';

const P = (light, base, dark, line, extra = {}) => {
  const o = { light: hex(light), base: hex(base), dark: hex(dark), line: hex(line) };
  for (const k in extra) o[k] = hex(extra[k]);
  return o;
};
export const MAT = {
  acroGreen: P('#c8ff86', '#70d44c', '#3c8c32', '#1a4418', { tip: '#f2ffc8' }),
  acroPurple: P('#eab0ff', '#b064e6', '#7438aa', '#3a1860', { tip: '#ffe0ff' }),
  acroBlue: P('#a8e0ff', '#4c9cec', '#2a5eb4', '#142c60', { tip: '#e4f8ff' }),
  stag: P('#c8b8ff', '#8c70e6', '#5a42a8', '#2a1a60', { tip: '#8af0ff' }),
  stagPink: P('#ffc8e0', '#f088b4', '#b04e7e', '#58223a', { tip: '#fff4a0' }),
  stagGreen: P('#d8ff9a', '#9ad85a', '#5a983a', '#264a18', { tip: '#c0f4ff' }),
  tableTeal: P('#9cf6de', '#3cc4aa', '#208272', '#0c4038', { tip: '#e0fff4' }),
  tableOlive: P('#e2f08e', '#b0c84e', '#70862e', '#344018', { tip: '#fbffd0' }),
  brainGreen: P('#c0f496', '#70c452', '#3e8c34', '#1c4418', { groove: '#2e6a28' }),
  brainOrange: P('#ffc874', '#f28e32', '#b45c1a', '#5a2a08', { groove: '#a04c14' }),
  brainYellow: P('#fff08c', '#e8c440', '#a8841e', '#544008', { groove: '#9a7418' }),
  leatherPink: P('#ffc8e6', '#f284bc', '#b24c82', '#5a1c40', { polyp: '#fff4fb' }),
  leatherOrange: P('#ffd898', '#ffa244', '#c46c1e', '#5a300a', { polyp: '#fff6dc' }),
  fanRed: P('#ff8a78', '#e63e3e', '#a41e26', '#500a10'),
  fanOrange: P('#ffbe6a', '#ff7e22', '#c24c12', '#5a2008'),
  fanMagenta: P('#ff9cec', '#e444c4', '#a21e8a', '#4e0a42'),
  tubePurple: P('#dc96ff', '#a454ea', '#6c2aaa', '#34105a', { hole: '#1a0830' }),
  tubeOrange: P('#ffb878', '#f27c32', '#b24c1a', '#5a2008', { hole: '#2a0c04' }),
  barrel: P('#fff48a', '#f2cc34', '#b28c1a', '#5a4008', { hole: '#3a2808' }),
  anemone: P('#ffb4e0', '#ff6cbe', '#c03a8a', '#5a1440', { tip: '#ffffff', column: '#a060c8' }),
  anemoneGreen: P('#c8ffb0', '#78e070', '#40a050', '#14501e', { tip: '#ff9ad8', column: '#c89060' }),
  clam: P('#fff0c8', '#e8c890', '#b08a58', '#4a3418', { m1: '#7cf0ff', m2: '#1c96e6', m3: '#0a52a4', spot: '#e0ffff' }),
  clamTeal: P('#fff0c8', '#e8c890', '#b08a58', '#4a3418', { m1: '#86ffd8', m2: '#16bca0', m3: '#066e5c', spot: '#ffff9a' }),
  zoaGreen: P('#ffff9a', '#58dc48', '#24922c', '#0c4414'),
  zoaOrange: P('#fff2a0', '#ff8c26', '#c24e12', '#5a2008'),
};
// living cover for any exposed reef rock: coralline crust, encrusting corals, zoanthid carpets, turf
export const COVER = [
  [hex('#ffa4c0'), hex('#e46c96'), hex('#aa426c')],   // pink coralline crust
  [hex('#b4f080'), hex('#64c044'), hex('#327a2a')],   // green zoanthid carpet
  [hex('#d8a4ff'), hex('#9a58dc'), hex('#64309e')],   // purple encrusting coral
  [hex('#ffc880'), hex('#f08434'), hex('#aa5218')],   // orange zoanthid carpet
  [hex('#ff94b0'), hex('#d85a80'), hex('#983a5e')],   // deeper pink crust
  [hex('#90f0e0'), hex('#38b8a8'), hex('#1e7a70')],   // teal encrusting coral
];
export const CREVICE = [hex('#4a1c34'), hex('#2e1022')];

export function kit(c, { H, seed = 1, tint = (col) => col }) {
  const W = TILE;
  const rand = rng(seed);
  const put = (x, y, col) => c.set(x, y, tint(col));
  const mot = pnoise(seed + 11, 6);
  const wdx = (x, cx) => ((((x - cx) % W) + W + W / 2) % W) - W / 2;
  const mask = () => new Mask(W, H, { wrap: true });

  // bounding box of a mask (columns stored as wrapped offsets around a centre)
  function cellsOf(m, cx) {
    const out = [];
    for (let y = 0; y < H; y++) for (let dx = -70; dx <= 70; dx++) { const x = cx + dx; if (m.get(x, y)) out.push([x, y]); }
    return out;
  }

  // shade + outline + texture
  function paint(m, M, cx, o = {}) {
    const cells = cellsOf(m, cx);
    const inM = (x, y) => m.get(x, y) > 0;
    if (o.outline !== false) {
      const seen = new Set();
      for (const [x, y] of cells) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy, k = `${X},${Y}`;
        if (!seen.has(k) && !inM(X, Y) && Y >= 0 && Y < H) { seen.add(k); put(X, Y, M.line); }
      }
    }
    for (const [x, y] of cells) {
      let yy = 0; while (yy < 8 && inM(x, y - yy - 1)) yy++;
      const right = !inM(x + 1, y), left = !inM(x - 1, y), below = !inM(x, y + 1);
      let v = yy === 0 ? 0 : yy < 3 ? 0.8 : 1.2;
      if (o.vol) { // big rounded forms: light from the upper left across the whole volume
        const nx = wdx(x, o.vol[0]) / o.vol[2], ny = (y - o.vol[1]) / o.vol[3];
        v = Math.max(yy === 0 ? 0 : 0.25, 1 + (nx * 0.5 + ny * 0.9) * 1.1);
      }
      if (right || below) v += 0.8; if (left) v -= 0.4;
      v += (mot(x, y) - 0.5) * 0.6;
      let q = Math.floor(v); if (v - q > dither(x, y)) q++;
      let col = [M.light, M.base, M.dark][Math.max(0, Math.min(2, q))];
      if (o.tex) { const t = o.tex(x, y, { lx: Math.round(wdx(x, cx)), yy, right, left, below, col }); if (t) col = t; }
      put(x, y, col);
    }
  }

  const K = {
    rand, put, mask, paint, wdx,
    // corymbose Acropora: a dome of short upright branches with bright tips
    acropora(x, base, size, M) {
      const m = mask(), n = Math.round(2 + size * 1.6), tips = [];
      for (let i = -n; i <= n; i++) {
        const t = i / (n + 0.5), h = size * 5.5 * (1 - t * t * 0.7) * (0.85 + rand() * 0.3);
        const x0 = x + i * 1.5, x1 = x + i * 1.9;
        m.stroke(x0, base, x1, base - h, 0.9, 0.8, 1);
        tips.push([x1, base - h]);
      }
      m.ellipse(x, base - 1, n * 1.6, 2, 1);
      paint(m, M, x);
      for (const [tx, ty] of tips) { put(tx, ty, M.tip); put(tx, ty - 1, M.line); }
    },
    // staghorn: long antler branches, bright tips
    staghorn(x, base, size, M, depth = 3) {
      const m = mask(), tips = [];
      for (let k = -1; k <= 1; k++) tips.push(...branchy(m, rand, x + k * 3, base, 4 + size * 2.2, -Math.PI / 2 + k * 0.45, 1.5, depth, 1, 0.5));
      paint(m, M, x);
      for (const [tx, ty] of tips) { put(tx, ty, M.tip); put(tx + 1, ty, M.tip); }
    },
    // table coral: short stalk, wide flat layered plates
    table(x, base, w, M) {
      const m = mask();
      m.stroke(x, base, x, base - 4, 1.8, 1.4, 1);
      m.ellipse(x, base - 5, w, 1.7, 1); m.ellipse(x - 1, base - 6.4, w * 0.72, 1.4, 1);
      m.ellipse(x + w * 0.5, base - 2.4, w * 0.45, 1.3, 1);
      paint(m, M, x, { tex: (X, Y, i) => (i.yy === 0 ? (i.lx % 3 === 0 ? M.tip : M.light) : !i.below && i.yy >= 1 && Y > base - 7 ? null : null) });
    },
    brain(x, base, rx, ry, M) {
      const m = mask();
      m.ellipse(x, base, rx, ry, 1);
      paint(m, M, x, { tex: (X, Y, i) => {
        if (i.yy === 0 || i.right || i.below) return null;
        const lx = i.lx, ly = Y - base;
        const g = Math.sin(lx * 0.9 + 1.6 * Math.sin(ly * 0.7 + lx * 0.15)) + 0.8 * Math.cos(ly * 1.1 + 1.2 * Math.sin(lx * 0.5));
        return Math.abs(g) < 0.34 ? M.groove : null;
      } });
    },
    // leather / mushroom soft coral: stalk + wavy cap fuzzed with polyps
    leather(x, base, size, M) {
      const m = mask(), w = 3 + size * 2;
      m.stroke(x, base, x, base - size * 2.5, 1.8, 1.5, 1);
      m.ellipse(x, base - size * 2.5 - 1, w, 1.6 + size * 0.5, 1);
      m.ellipse(x - w * 0.5, base - size * 2.5 - 0.5, w * 0.5, 1.4 + size * 0.4, 1);
      paint(m, M, x, { tex: (X, Y, i) => (i.yy <= 1 && (i.lx + Y) % 2 === 0 ? M.polyp : null) });
    },
    // finger soft coral: clump of stubby lobes
    fingers(x, base, size, M) {
      const m = mask();
      for (const [dx, h] of [[-4, 5], [-1.5, 8], [1.5, 7], [4, 4.5], [0, 4]]) {
        const hh = h * size * 0.5;
        m.stroke(x + dx * 0.8, base, x + dx * 1.2, base - hh, 1.6, 1.3, 1);
        m.ellipse(x + dx * 1.2, base - hh, 1.5, 1.5, 1);
      }
      paint(m, M, x, { tex: (X, Y, i) => (i.yy <= 1 && (i.lx + Y) % 2 === 0 ? M.polyp : null) });
    },
    fan(x, base, w, h, M) {
      const m = mask();
      seaFan(m, rand, x, base, w, h, 1);
      paint(m, M, x, { outline: false, tex: (X, Y, i) => (i.below || i.right ? M.dark : i.yy === 0 ? M.light : (i.lx + Y) % 3 ? M.base : M.light) });
    },
    tubes(x, base, size, M) {
      const m = mask(), list = [[0, 7 * size], [2.6, 5 * size], [-2.4, 4.2 * size], [4.6, 3 * size]];
      for (const [dx, h] of list) m.stroke(x + dx, base, x + dx, base - h, 1.3, 1.2, 1);
      paint(m, M, x, { tex: (X, Y, i) => (!i.right && !i.left && i.yy > 1 && (Y + i.lx) % 3 === 0 ? M.light : null) });
      for (const [dx, h] of list) { put(Math.round(x + dx - 0.5), Math.round(base - h), M.hole); put(Math.round(x + dx + 0.5), Math.round(base - h), M.hole); }
    },
    barrel(x, base, size, M) {
      const m = mask(), r = 2.4 + size, h = 4 + size * 3;
      m.stroke(x, base, x, base - h, r * 0.9, r, 1);
      paint(m, M, x, { tex: (X, Y, i) => (!i.right && !i.left && i.yy > 0 && ((i.lx + 99) % 3 === 0) ? M.dark : null) });
      for (let dx = -Math.floor(r) + 1; dx < r - 1; dx++) put(x + dx, Math.round(base - h), M.hole);
    },
    anemone(x, base, size, M) {
      const m = mask(), n = 7 + Math.round(size * 2), tips = [];
      m.ellipse(x, base - 1, 2.6 + size, 1.8, 1);
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * 2.6, len = (3 + size * 2.2) * (0.8 + rand() * 0.3);
        const tx = x + Math.cos(a) * len * 1.15, ty = base - 2 + Math.sin(a) * len;
        m.stroke(x + Math.cos(a) * 1.5, base - 2, tx, ty, 0.6, 0.5, 1);
        tips.push([tx, ty]);
      }
      paint(m, M, x);
      for (const [tx, ty] of tips) put(tx, ty, M.tip);
    },
    // giant clam: cream shell lips around a vivid mantle with bright spots
    clam(x, base, w, M) {
      const m = mask();
      m.ellipse(x, base - 2.4, w, 3, 1);
      paint(m, M, x);
      // the frilly mantle fills most of the gape: bright, spotted, edged in deep blue
      for (let X = Math.ceil(x - w + 1); X <= x + w - 1; X++) {
        const lx = Math.round(wdx(X, x)), zig = (lx + 99) % 2;
        for (let Y = Math.round(base - 4) + zig; Y <= Math.round(base - 1); Y++) {
          const edge = Y === Math.round(base - 4) + zig;
          put(X, Y, edge ? M.m3 : (lx + Y + 99) % 3 === 0 ? M.spot : Y === Math.round(base - 1) ? M.m2 : M.m1);
        }
      }
    },
    // flat carpet of zoanthid polyps: little discs with bright mouths
    zoa(x, y, w, h, M) {
      const m = mask();
      m.ellipse(x, y, w, h, 1);
      paint(m, M, x, { tex: (X, Y, i) => {
        const lx = i.lx + 99, ly = Y + 99;
        const cxp = lx % 3 === 1 && ly % 2 === (Math.floor(lx / 3) % 2);
        return cxp ? M.light : (lx % 3 === 1 || ly % 2 === (Math.floor(lx / 3) % 2)) ? M.base : M.dark;
      } });
    },
    // tiny christmas-tree worm pair
    xmas(x, y, i = 0) {
      const C = [['#3a8cff', '#b4dcff'], ['#ffa02a', '#ffe08a'], ['#ff5ad0', '#ffc0f0'], ['#ffe040', '#fffac0'], ['#ffffff', '#c8d8ff']][i % 5].map(hex);
      for (const dx of [0, 3]) { put(x + dx, y - 1, C[1]); put(x + dx - 1, y, C[0]); put(x + dx, y, C[1]); put(x + dx + 1, y, C[0]); }
    },
  };
  return K;
}

// Paint living cover over a rock mask: blotchy patches of crusts and carpets (whichever of a few
// soft noise fields is strongest wins), separated only by thin dark crevices along patch borders.
// Pink coralline crust is the most common, so any rock that shows reads pink, never grey.
export function coverRock(c, m, H, { seed = 5, tint = (col) => col } = {}) {
  const W = TILE, put = (x, y, col) => c.set(x, y, tint(col));
  const weights = [1.25, 1.0, 0.95, 0.85, 1.1, 0.8];
  const fields = COVER.map((_, i) => pnoise(seed + i * 17, 12));
  const grain = pnoise(seed + 99, 3);
  const best = (x, y) => {
    let b = 0, bv = -1, sv = -1;
    fields.forEach((f, i) => { const v = f(x, y * 1.3) * weights[i]; if (v > bv) { sv = bv; bv = v; b = i; } else if (v > sv) sv = v; });
    return [b, bv - sv];
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!m.get(x, y)) continue;
    let yy = 0; while (yy < 10 && m.get(x, y - yy - 1)) yy++;
    const [k, margin] = best(x, y);
    if (margin < 0.035) { put(x, y, CREVICE[yy > 4 ? 1 : 0]); continue; }
    const pal = COVER[k];
    if (k === 1 || k === 3) {     // carpets get a polyp dot texture
      const dot = (x % 3 === 1) && (y % 2 === ((Math.floor(x / 3)) % 2));
      put(x, y, dot ? pal[0] : (x + y) % 3 === 0 ? pal[2] : pal[1]);
    } else {                      // crusts: lit from above, grainy
      const v = (yy === 0 ? 0 : yy < 3 ? 0.9 : 1.25) + (grain(x, y) - 0.5) * 0.9;
      let q = Math.floor(v); if (v - q > dither(x, y)) q++;
      put(x, y, pal[Math.max(0, Math.min(2, q))]);
    }
  }
}

export { mix };
