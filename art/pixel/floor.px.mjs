// Front reef: 426x72 cells (2556x432 px), tiles seamlessly. The nearest, boldest layer: a solid wall
// of big coral formations, fully opaque from the bottom up to at least 47 cells, whose crown rises
// to 60-72 cells in giant staghorn and Acropora thickets, table corals, fans, barrel sponges and
// brain/boulder heads. Cave mouths, overhang shadows and crevices give it depth, and smaller corals,
// anemone beds, clams and polyps fill every gap. The bottom 15 cells are the front ledge the
// critters walk on: golden sand and coral rubble with only low polyp carpets.
// Everything wraps around the tile edges; dither patterns are 2 cells wide so the seam lines up.
import { Canvas, Mask, rng, hex, mix, TILE, dither, psin, pnoise, branchy, seaFan } from './pxlib.mjs';
import { kit, coverRock, MAT, CREVICE } from './coral.mjs';

const W = TILE, H = 72, LEDGE = 57;              // ledge rows 57..71 (15 cells)
const SAND = ['#fff0c4', '#f6dc9c', '#e8c47c', '#d4a862', '#b88c4c'].map(hex);
const RUBBLE = [['#ffc8b4', '#f08c80', '#b0545a'], ['#ffe0a0', '#f0b45c', '#b07830'], ['#f0c4ff', '#c088e8', '#8050b0'], ['#c8f0b4', '#88c870', '#4e8a44']].map((p) => p.map(hex));
const CAVE = ['#3e1a3a', '#2c1030', '#1c0a24', '#120618'].map(hex);

export default function () {
  const c = new Canvas(W, H, { wrap: true });
  const K = kit(c, { H, seed: 9090 });
  const r = K.rand;
  const wdx = K.wdx;
  const acros = [MAT.acroGreen, MAT.acroPurple, MAT.acroBlue];
  const stags = [MAT.stag, MAT.stagPink, MAT.stagGreen];
  const brains = [MAT.brainGreen, MAT.brainOrange, MAT.brainYellow];
  const fans = [MAT.fanRed, MAT.fanMagenta, MAT.fanOrange];

  // ---------- big painters ----------
  const cave = (x, y, rx, ry) => {                 // dark, opaque cave mouth with a lit upper lip
    for (let yy = Math.floor(y - ry); yy <= y + ry; yy++) for (let xx = Math.floor(x - rx); xx <= x + rx; xx++) {
      const d = (wdx(xx, x) / rx) ** 2 + ((yy + 0.5 - y) / ry) ** 2;
      if (d > 1) continue;
      const v = (1 - d) * 3.2;
      let q = Math.floor(v); if (v - q > dither(xx, yy)) q++;
      K.put(xx, yy, CAVE[Math.min(3, q)]);
    }
  };
  const brain = (x, base, rx, ry, M) => {
    const m = K.mask(); m.ellipse(x, base, rx, ry, 1);
    K.paint(m, M, x, { vol: [x - rx * 0.3, base - ry * 0.4, rx, ry], tex: (X, Y, i) => {
      if (i.yy === 0 || i.right) return null;
      const lx = i.lx, ly = Y - base;
      const g = Math.sin(lx * 0.8 + 1.8 * Math.sin(ly * 0.6 + lx * 0.13)) + 0.9 * Math.cos(ly * 0.95 + 1.3 * Math.sin(lx * 0.42));
      return Math.abs(g) < 0.3 ? M.groove : null;
    } });
  };
  const boulder = (x, base, w, M) => {           // lumpy mound with polyp pores
    const m = K.mask(), lumps = 3 + Math.floor(w / 8);
    for (let k = 0; k < lumps; k++) { const t = lumps === 1 ? 0 : k / (lumps - 1) - 0.5; m.ellipse(x + t * w * 0.8, base - 2 - r() * w * 0.12, w * 0.3 + r() * 2, w * 0.28 + r() * 3, 1); }
    K.paint(m, M, x, { vol: [x - w * 0.2, base - w * 0.3, w * 0.6, w * 0.4], tex: (X, Y, i) =>
      (i.yy > 0 && !i.right && Y % 2 === 0 && (i.lx + 99 + (Y % 4 === 0 ? 0 : 2)) % 4 === 0 ? M.light : null) });
  };
  const stagThicket = (x, base, h, M) => {         // big antler trees, each outlined on its own so branches read
    for (const k of [-2, 2, -1, 1, 0]) {
      const m = K.mask();
      const tips = branchy(m, r, x + k * 5, base, h / 3.3 * (k === 0 ? 1 : 0.85), -Math.PI / 2 + k * 0.24 + (r() - 0.5) * 0.15, 2.4, 3, 1, 0.42);
      K.paint(m, M, x + k * 5);
      for (const [tx, ty] of tips) for (const [dx, dy] of [[0, 0], [1, 0], [0, -1], [1, -1]]) K.put(tx + dx - 0.5, ty + dy, M.tip);
    }
  };
  const acroThicket = (x, base, h, w, M) => {      // bushy Acropora: separate leaning branches with side twigs
    const n = Math.round(w / 4.2), order = [];
    for (let i = 0; i <= n; i++) order.push(i);
    order.sort((a, b) => Math.abs(b / n - 0.5) - Math.abs(a / n - 0.5));     // outer branches first, centre in front
    for (const i of order) {
      const m = K.mask(), tips = [];
      const t = i / n - 0.5, bx = x + t * w + (r() - 0.5) * 2;
      const hh = h * Math.max(0.35, 1 - t * t * 2.2) * (0.65 + r() * 0.4), lean = t * 8 + (r() - 0.5) * 4;
      m.stroke(bx, base, bx + lean, base - hh, 2.0, 1.3, 1);
      tips.push([bx + lean, base - hh]);
      for (let k = 0, twigs = 1 + Math.floor(hh / 8); k < twigs; k++) {
        const f = 0.4 + r() * 0.45, px = bx + lean * f, py = base - hh * f, side = r() < 0.5 ? -1 : 1, len = 2.5 + r() * 2.5;
        const tx = px + side * len * 0.8, ty = py - len * 0.75;
        m.stroke(px, py, tx, ty, 1.1, 0.8, 1);
        tips.push([tx, ty]);
      }
      K.paint(m, M, bx);
      for (const [tx, ty] of tips) { K.put(tx, ty, M.tip); K.put(tx + 1, ty, M.tip); }
    }
  };
  const table = (x, base, w, M) => {               // stalk, broad layered plates, dark overhang below
    const py = base - 9 - r() * 4, th = 2 + w * 0.05;
    cave(x, py + th + 3, w * 0.85, 3.4);
    const m = K.mask();
    m.stroke(x, base, x, py, 3, 2.4, 1);
    m.ellipse(x, py, w, th, 1);
    m.ellipse(x - w * 0.08, py - th * 0.9, w * 0.72, th * 0.8, 1);
    m.ellipse(x + w * 0.1, py - th * 1.7, w * 0.4, th * 0.7, 1);
    K.paint(m, M, x, { tex: (X, Y, i) => (i.yy === 0 ? ((i.lx + 99) % 3 === 0 ? M.tip : M.light)
      : !i.below && (i.lx + (Y % 2) * 2 + 99) % 4 === 0 ? M.light : i.below ? null : (i.lx + Y + 99) % 6 === 0 ? M.dark : null) });   // radiating growth lines
  };
  const fan = (x, base, w, h, M) => { const m = K.mask(); seaFan(m, r, x, base, w, h, 1); seaFan(m, r, x + 1, base, w * 0.8, h * 0.85, 1);
    K.paint(m, M, x, { outline: false, tex: (X, Y, i) => (i.below || i.right ? M.dark : i.yy === 0 ? M.light : null) }); };
  const barrel = (x, base, w, h, M) => {           // giant barrel sponge: bulging ringed barrel, wide dark crater on top
    const m = K.mask(), R = (t) => (w / 2) * (0.72 + 0.28 * Math.sin(Math.PI * Math.min(1, t * 1.15)));
    for (let t = 0; t <= 1; t += 0.015) m.ellipse(x, base - t * h, R(t), 1.4, 1);
    K.paint(m, M, x, { vol: [x - w * 0.25, base - h * 0.55, w / 2, h / 2], tex: (X, Y, i) => {
      if (i.left || i.right || i.yy < 2) return null;
      const ring = ((Y - Math.round(base) + 99) % 4);                       // stacked growth ridges
      return ring === 0 ? M.light : ring === 1 ? null : ring === 3 && (i.lx + Y) % 2 === 0 ? M.dark : null;
    } });
    const rx = R(1) - 1.2, cy = base - h + 0.6;
    for (let yy = -2; yy <= 2; yy++) for (let dx = -Math.ceil(rx); dx <= rx; dx++) {
      const d = (dx / rx) ** 2 + (yy / 2.1) ** 2;
      if (d < 1) K.put(x + dx, cy + yy, d > 0.62 ? (yy < 0 ? M.light : M.dark) : yy < 0 ? M.line : M.hole);
    }
  };
  const clam = (x, base, w, M) => {                // giant clam: wavy shell lips around a bright mantle
    const h = w * 0.42, m = K.mask();
    m.ellipse(x, base - h, w, h, 1);
    K.paint(m, M, x, { vol: [x, base - h * 1.4, w, h] });
    for (let X = Math.ceil(x - w + 1.5); X <= x + w - 1.5; X++) {
      const lx = Math.round(wdx(X, x)), wave = Math.round(Math.sin(lx * 0.9) * 0.9);
      const y0 = Math.round(base - h * 1.35) + wave, y1 = Math.round(base - h * 0.55) - wave;
      for (let Y = y0; Y <= y1; Y++) K.put(X, Y, Y === y0 || Y === y1 ? M.m3 : (lx + Y + 99) % 4 === 0 ? M.spot : Y < (y0 + y1) / 2 ? M.m1 : M.m2);
    }
  };
  const bed = (x, base, w, M, M2) => { for (let dx = -w / 2; dx <= w / 2; dx += 5 + r() * 2) K.anemone(x + dx, base + Math.round(r() * 2), 1.6 + r() * 0.8, r() < 0.5 ? M : M2); };

  // ---------- 1. the wall body: opaque from row <=25 down, wrapped in living cover ----------
  const crownBase = (x) => 22 + 1.6 * psin(x, 4, 0.3) + 1.0 * psin(x, 11, 1.9) + 0.6 * psin(x, 29, 0.6);   // always <= row 25
  const rock = new Mask(W, H, { wrap: true });
  rock.ground(crownBase, 1);
  coverRock(c, rock, H, { seed: 777 });
  // shadowed band where the wall meets the ledge
  for (let x = 0; x < W; x++) for (let y = LEDGE - 4; y < LEDGE; y++) {
    const f = (y - LEDGE + 5) / 5, d = dither(x, y);
    if (d < f) K.put(x, y, d < f * 0.55 ? CREVICE[1] : CREVICE[0]);
  }

  // ---------- 2. crown formations (back to front) ----------
  const crown = [
    ['stag', 20], ['table', 62], ['fan', 96], ['barrel', 120], ['acro', 152], ['brain', 188], ['stag', 222],
    ['table', 262], ['fan', 296], ['acro', 322], ['barrel', 352], ['brain', 384], ['acro', 410],
  ];
  crown.forEach(([kind, x0], i) => {
    const x = x0 + Math.floor(r() * 6), base = Math.round(crownBase(x)) + 14;
    if (kind === 'stag') stagThicket(x, base, 27 + r() * 6, stags[i % 3]);
    else if (kind === 'acro') acroThicket(x, base, 24 + r() * 6, 26 + r() * 10, acros[i % 3]);
    else if (kind === 'table') table(x, base + 4, 18 + r() * 10, i % 2 ? MAT.tableTeal : MAT.tableOlive);
    else if (kind === 'fan') fan(x, base - 2, 20 + r() * 6, 26 + r() * 5, fans[i % 3]);
    else if (kind === 'barrel') barrel(x, base + 6, 16 + r() * 7, 18 + r() * 6, i % 2 ? MAT.barrel : MAT.tubeOrange);
    else brain(x, base + 8, 14 + r() * 7, 12 + r() * 4, brains[i % 3]);
  });

  // ---------- 3. big heads across the wall face ----------
  const face = ['brain', 'clam', 'boulder', 'bed', 'brain', 'tubes', 'boulder', 'clam', 'bed', 'leather'];
  for (let i = 0, x = 6; x < W; x += 20 + Math.floor(r() * 10), i++) {
    const y = 38 + Math.floor(r() * 8), kind = face[(i * 3 + Math.floor(r() * 2)) % face.length];
    if (kind === 'brain') brain(x, y + 6, 10 + r() * 6, 8 + r() * 3, brains[(i + 1) % 3]);
    else if (kind === 'boulder') boulder(x, y + 6, 18 + r() * 10, i % 2 ? MAT.leatherPink : MAT.acroPurple);
    else if (kind === 'clam') clam(x, y + 4, 7 + r() * 4, i % 2 ? MAT.clam : MAT.clamTeal);
    else if (kind === 'bed') bed(x, y + 2, 16 + r() * 8, MAT.anemone, MAT.anemoneGreen);
    else if (kind === 'tubes') K.tubes(x, y + 6, 1.8 + r() * 0.8, i % 2 ? MAT.tubePurple : MAT.tubeOrange);
    else K.leather(x, y + 4, 1.8 + r() * 0.8, i % 2 ? MAT.leatherOrange : MAT.leatherPink);
  }

  // cave mouths between the big heads, framed by the smaller life drawn next
  for (let k = 0; k < 7; k++) cave((k + 0.5) * (W / 7) + (r() - 0.5) * 10, 44 + r() * 5, 4.5 + r() * 3, 3 + r() * 1.5);

  // ---------- 4. smaller life filling the gaps, lowest row in front ----------
  const small = ['acro', 'fingers', 'anem', 'zoa', 'brainS', 'tubes', 'leather', 'zoa', 'anem', 'clamS'];
  for (let i = 0, x = 3; x < W; x += 8 + Math.floor(r() * 6), i++) {
    const y = 48 + Math.floor(r() * 7), kind = small[(i * 7 + Math.floor(r() * 3)) % small.length], s = 0.9 + r() * 0.6;
    if (kind === 'acro') K.acropora(x, y, s, acros[i % 3]);
    else if (kind === 'fingers') K.fingers(x, y, s + 0.5, i % 2 ? MAT.leatherPink : MAT.leatherOrange);
    else if (kind === 'anem') K.anemone(x, y, s, i % 3 ? MAT.anemone : MAT.anemoneGreen);
    else if (kind === 'zoa') K.zoa(x, y - 1, 5 + r() * 4, 2, i % 2 ? MAT.zoaOrange : MAT.zoaGreen);
    else if (kind === 'brainS') K.brain(x, y + 1, 4 + s * 2, 3 + s, brains[i % 3]);
    else if (kind === 'tubes') K.tubes(x, y, 0.8 + s * 0.4, i % 2 ? MAT.tubeOrange : MAT.tubePurple);
    else if (kind === 'leather') K.leather(x, y, s, i % 2 ? MAT.leatherOrange : MAT.leatherPink);
    else K.clam(x, y, 3 + s, i % 2 ? MAT.clamTeal : MAT.clam);
  }
  for (let k = 0; k < 40; k++) K.xmas(Math.floor(r() * W), 26 + Math.floor(r() * 28), k);

  // ---------- 5. the ledge: sand, colourful rubble, low polyp carpets (<= 3 cells tall) ----------
  const grain = pnoise(41, 3), drift = pnoise(42, 12);
  const ledgeTop = (x) => Math.round(LEDGE + 0.8 * psin(x, 7, 0.4) + 0.5 * psin(x, 23, 1.1));
  for (let x = 0; x < W; x++) for (let y = ledgeTop(x); y < H; y++) {
    const d = y - ledgeTop(x);
    const v = (d === 0 ? 0 : 0.9 + Math.min(1.8, d / 8)) + (grain(x, y) - 0.5) * 1.1 + (drift(x, y) - 0.5) * 0.6;
    let q = Math.floor(v); if (v - q > dither(x, y)) q++;
    K.put(x, y, SAND[Math.max(0, Math.min(SAND.length - 1, q))]);
  }
  for (let n = 0; n < 70; n++) {                   // ripples
    const x0 = Math.floor(r() * W), y0 = LEDGE + 3 + Math.floor(r() * 11), len = 4 + Math.floor(r() * 8);
    for (let k = 0; k < len; k++) { const x = x0 + k, y = y0 + Math.round(Math.sin(k / 2.3)); K.put(x, y, hex('#c89a56')); K.put(x, y - 1, hex('#fff6d6')); }
  }
  for (let n = 0; n < 150; n++) {                  // coral rubble pieces, warm and colourful
    const x = r() * W, y = LEDGE + 2 + r() * (H - LEDGE - 3), col = RUBBLE[Math.floor(r() * RUBBLE.length)];
    const len = 1 + Math.floor(r() * 3);
    for (let k = 0; k < len; k++) { K.put(x + k, y, k === 0 ? col[0] : col[1]); K.put(x + k, y + 1, col[2]); }
  }
  for (let n = 0; n < 18; n++) K.zoa((n + 0.3 + r() * 0.4) * (W / 18), LEDGE + 5 + r() * 9, 2.5 + r() * 3, 1.1, n % 2 ? MAT.zoaGreen : MAT.zoaOrange);
  const POLYP = [['#ff6cbe', '#ffd0ec'], ['#8a70ff', '#d8ccff'], ['#ffb020', '#fff0a8'], ['#30d0b0', '#c0fff0']].map((p) => p.map(hex));
  for (let n = 0; n < 50; n++) {
    const x = Math.floor(r() * W), y = LEDGE + 3 + Math.floor(r() * 11), [d, l] = POLYP[n % 4];
    K.put(x, y, l); K.put(x + 1, y, d); K.put(x, y + 1, d); K.put(x + 2, y + 1, l); K.put(x + 1, y + 1, d);
  }
  return c.result();
}
