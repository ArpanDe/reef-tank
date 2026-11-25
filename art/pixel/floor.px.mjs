// Reef floor: 426x42 cells (2556x252 px), tiles seamlessly. A coral garden on warm golden coral
// sand, nearer and brighter than `reef`. The upper part is crowded with coral heads, clams, sponges,
// anemone beds and soft corals in two overlapping rows; the bottom ~45% is open sand (fine dither
// grain and ripples) with only low colourful carpets and polyps, where the critters walk.
import { Canvas, rng, hex, TILE, dither, psin, pnoise } from './pxlib.mjs';
import { kit, MAT } from './coral.mjs';

const W = TILE, H = 42, GROUND = 23;
const SAND = ['#fff0c4', '#f6dc9c', '#e8c47c', '#d4a862', '#b88c4c'].map(hex);
const RIPPLE = hex('#c89a56'), RIPPLE_LIT = hex('#fff6d6');

export default function () {
  const c = new Canvas(W, H, { wrap: true });
  const K = kit(c, { H, seed: 4242 });
  const r = K.rand;
  const grain = pnoise(41, 3), drift = pnoise(42, 12);

  // --- golden sand: irregular top edge, lighter on the crest, grain + gentle shading ---
  const sandTop = (x) => Math.round(10 + 1.6 * psin(x, 5, 0.7) + 1.1 * psin(x, 17, 2.1) + 0.6 * psin(x, 43, 0) + 0.4 * psin(x, 71, 1.3));
  for (let x = 0; x < W; x++) for (let y = Math.max(0, sandTop(x)); y < H; y++) {
    const d = y - sandTop(x);
    const v = (d === 0 ? 0 : 0.9 + Math.min(1.6, d / 14)) + (grain(x, y) - 0.5) * 1.1 + (drift(x, y) - 0.5) * 0.6;
    let q = Math.floor(v); if (v - q > dither(x, y)) q++;
    c.set(x, y, SAND[Math.max(0, Math.min(SAND.length - 1, q))]);
  }
  // ripples across the open sand
  for (let n = 0; n < 120; n++) {
    const x0 = Math.floor(r() * W), y0 = GROUND + 1 + Math.floor(r() * (H - GROUND - 2)), len = 4 + Math.floor(r() * 9);
    for (let k = 0; k < len; k++) { const x = x0 + k, y = y0 + Math.round(Math.sin(k / 2.3)); c.set(x, y, RIPPLE); c.set(x, y - 1, RIPPLE_LIT); }
  }

  const acros = [MAT.acroGreen, MAT.acroPurple, MAT.acroBlue];
  const brains = [MAT.brainGreen, MAT.brainOrange, MAT.brainYellow];
  const worms = [];
  // --- back row: taller heads poking above the sand line ---
  const backKinds = ['brain', 'acro', 'anembed', 'tubes', 'fan', 'leather', 'fingers', 'barrel', 'acro', 'clam', 'anembed', 'stag', 'brain', 'fingers', 'tubes'];
  let i = 0;
  for (let x = 3; x < W; x += 9 + Math.floor(r() * 5), i++) {
    const base = sandTop(x) + 6 + Math.floor(r() * 3), s = 0.6 + r() * 0.8;
    const kind = backKinds[(i * 5 + Math.floor(r() * 3)) % backKinds.length];
    if (kind === 'brain') { const ry = 3 + s * 2; K.brain(x, base + 1, 4 + s * 3, ry, brains[i % 3]); worms.push([x - 1, Math.round(base + 1 - ry)]); }
    else if (kind === 'acro') K.acropora(x, base, s, acros[i % 3]);
    else if (kind === 'anembed') { K.anemone(x - 3, base, s * 0.8, MAT.anemone); K.anemone(x + 3, base + 1, s * 0.7, i % 2 ? MAT.anemoneGreen : MAT.anemone); }
    else if (kind === 'tubes') K.tubes(x, base, 0.7 + s * 0.5, i % 2 ? MAT.tubePurple : MAT.tubeOrange);
    else if (kind === 'fan') K.fan(x, base, 5 + s * 2, 8 + s * 4, [MAT.fanRed, MAT.fanMagenta, MAT.fanOrange][i % 3]);
    else if (kind === 'stag') K.staghorn(x, base, 0.2 + s * 0.2, [MAT.stag, MAT.stagPink, MAT.stagGreen][i % 3], 2);
    else if (kind === 'leather') K.leather(x, base, s, i % 2 ? MAT.leatherPink : MAT.leatherOrange);
    else if (kind === 'fingers') K.fingers(x, base, s + 0.3, i % 2 ? MAT.leatherOrange : MAT.leatherPink);
    else if (kind === 'barrel') K.barrel(x, base, s * 0.8, MAT.barrel);
    else K.clam(x, base, 3 + s * 1.5, i % 2 ? MAT.clam : MAT.clamTeal);
  }
  // --- front row of the garden, lower, overlapping the back row ---
  const frontKinds = ['zoa', 'clam', 'anem', 'brain', 'zoa', 'fingers', 'anem', 'leather'];
  i = 0;
  for (let x = 8; x < W; x += 11 + Math.floor(r() * 6), i++) {
    const base = GROUND - 1 + Math.floor(r() * 2), s = 0.55 + r() * 0.35;
    const kind = frontKinds[(i * 3 + Math.floor(r() * 2)) % frontKinds.length];
    if (kind === 'zoa') K.zoa(x, base - 1, 5 + r() * 3, 1.6, i % 2 ? MAT.zoaOrange : MAT.zoaGreen);
    else if (kind === 'clam') K.clam(x, base, 2.6 + s * 1.5, i % 2 ? MAT.clamTeal : MAT.clam);
    else if (kind === 'anem') K.anemone(x, base, s * 0.8, i % 3 ? MAT.anemone : MAT.anemoneGreen);
    else if (kind === 'brain') { K.brain(x, base + 1, 3.5 + s * 2, 2.6 + s, brains[(i + 1) % 3]); worms.push([x, Math.round(base - 2)]); }
    else if (kind === 'fingers') K.fingers(x, base, s + 0.2, i % 2 ? MAT.leatherPink : MAT.leatherOrange);
    else K.leather(x, base, s * 0.8, i % 2 ? MAT.leatherOrange : MAT.leatherPink);
  }
  worms.forEach(([x, y], j) => K.xmas(x, y, j));

  // --- the critters' ground: low zoanthid carpets, polyp clusters and small shells on the sand ---
  for (let n = 0; n < 16; n++) {
    const x = (n + 0.2 + r() * 0.6) * (W / 16), y = GROUND + 5 + r() * 11;
    K.zoa(x, y, 2.5 + r() * 3, 1.1, n % 2 ? MAT.zoaGreen : MAT.zoaOrange);
  }
  const POLYP = [['#ff6cbe', '#ffd0ec'], ['#8a70ff', '#d8ccff'], ['#ffb020', '#fff0a8'], ['#30d0b0', '#c0fff0']].map((p) => p.map(hex));
  for (let n = 0; n < 40; n++) {
    const x = Math.floor(r() * W), y = GROUND + 3 + Math.floor(r() * (H - GROUND - 6)), [d, l] = POLYP[n % 4];
    c.set(x, y, l); c.set(x + 1, y, d); c.set(x, y + 1, d); c.set(x + 2, y + 1, l); c.set(x + 1, y + 1, d);
  }
  for (let n = 0; n < 8; n++) {
    const x = Math.floor(r() * W), y = GROUND + 4 + Math.floor(r() * 12);
    c.set(x, y, hex('#fff4ec')); c.set(x + 1, y, hex('#ffb4a4')); c.set(x, y + 1, hex('#e0806e')); c.set(x + 1, y + 1, hex('#a0503e'));
  }
  return c.result();
}
