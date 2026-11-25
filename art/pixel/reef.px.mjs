// Reef layer: 426x90 cells (2556 px), tiles seamlessly. A crowded, healthy reef: rock mounds are
// covered in living crusts and carpets, and corals, sponges, anemones, clams and fans are packed on
// top and down the faces in several overlapping depth rows. Three taller clusters alternate with
// low stretches (~142 cells per pair) so open water keeps passing through the fish zone. A light
// blue tint sits the whole layer a touch deeper than the floor.
import { Canvas, Mask, rng, hex, mix, TILE } from './pxlib.mjs';
import { kit, coverRock, MAT } from './coral.mjs';

const W = TILE, H = 90;
const CLUSTERS = [50, 192, 334];
const clusterAmt = (x) => Math.max(...CLUSTERS.map((cx) => Math.max(0, 1 - Math.abs((((x - cx) % W) + W + W / 2) % W - W / 2) / 52)));

export default function () {
  const c = new Canvas(W, H, { wrap: true });
  const tint = (col) => mix(col, hex('#1a4a8e'), 0.13);
  const K = kit(c, { H, seed: 77, tint });
  const r = K.rand;

  // --- rock mounds, wrapped in living cover ---
  const rock = new Mask(W, H, { wrap: true });
  const pile = (x0, x1, top, seed) => {
    const rr = rng(seed);
    for (let x = x0; x < x1; x += 5 + rr() * 6) {
      const t = (x - x0) / (x1 - x0), hgt = (H - top) * (0.55 + 0.45 * Math.sin(Math.PI * t)) * (0.85 + rr() * 0.25);
      rock.ellipse(x, H - hgt * 0.45, 6 + rr() * 7, hgt * 0.55, 1);
    }
  };
  pile(-8, 108, 32, 3); pile(10, 80, 28, 4);
  pile(150, 236, 36, 5); pile(168, 218, 32, 6);
  pile(290, 382, 30, 9); pile(310, 366, 26, 10);
  for (const [a, b, s] of [[104, 156, 7], [232, 294, 8], [378, 430, 11]]) pile(a, b, 60, s);
  coverRock(c, rock, H, { seed: 501, tint });
  const topY = (x) => { for (let y = 0; y < H; y++) if (rock.get(x, y)) return y; return H; };

  const acros = [MAT.acroGreen, MAT.acroPurple, MAT.acroBlue];
  const brains = [MAT.brainGreen, MAT.brainOrange, MAT.brainYellow];
  const fans = [MAT.fanRed, MAT.fanMagenta, MAT.fanOrange];
  const stags = [MAT.stag, MAT.stagPink, MAT.stagGreen];
  const worms = [];

  // --- back row on the clusters: tall fans, staghorn thickets, tables ---
  let i = 0;
  for (let x = 4; x < W; x += 13 + Math.floor(r() * 8), i++) {
    const amt = clusterAmt(x);
    if (amt < 0.3) continue;
    const base = topY(x) + 3, k = i % 3;
    if (k === 0) K.fan(x, base, 8 + amt * 4, 12 + amt * 8, fans[i % 3]);
    else if (k === 1) K.staghorn(x, base, 0.7 + amt, stags[i % 3]);
    else K.table(x, base, 8 + amt * 5, i % 2 ? MAT.tableTeal : MAT.tableOlive);
  }

  // --- packed rows from the crest down the faces; later (lower) rows overlap earlier ones ---
  const crestKinds = ['acro', 'leather', 'tubes', 'anem', 'fingers', 'fan', 'barrel', 'brain', 'anem', 'stag', 'acro', 'tubes'];
  const faceKinds = ['brain', 'anem', 'fan', 'leather', 'tubes', 'stag', 'fingers', 'acro', 'anem', 'zoa', 'tubes', 'brain', 'clam'];
  for (const [row, depth] of [[0, 4], [1, 11], [2, 18], [3, 25], [4, 32], [5, 40]]) {
    i = row * 3;
    for (let x = row * 5 + 2; x < W + row * 5; x += 9 + Math.floor(r() * 5), i++) {
      const amt = clusterAmt(x), top = topY(x);
      const base = top + depth + Math.floor(r() * 4);
      if (base > 86 || (row > 0 && top > 64)) continue;
      const s = (0.55 + amt * 0.75) * (row === 0 ? 1 : 0.85);
      const kinds = row === 0 ? crestKinds : faceKinds;
      const kind = kinds[(i * 3 + Math.floor(r() * 4)) % kinds.length];
      if (kind === 'acro') K.acropora(x, base, s, acros[i % 3]);
      else if (kind === 'brain') { const ry = 2.6 + s * 2; K.brain(x, base + 2, 3.6 + s * 3, ry, brains[i % 3]); worms.push([x - 1, Math.round(base + 2 - ry)]); }
      else if (kind === 'leather') K.leather(x, base, s, i % 2 ? MAT.leatherPink : MAT.leatherOrange);
      else if (kind === 'fingers') K.fingers(x, base, s + 0.4, i % 2 ? MAT.leatherOrange : MAT.leatherPink);
      else if (kind === 'tubes') K.tubes(x, base, 0.55 + s * 0.6, i % 2 ? MAT.tubePurple : MAT.tubeOrange);
      else if (kind === 'barrel') K.barrel(x, base, s, MAT.barrel);
      else if (kind === 'anem') K.anemone(x, base, s, i % 3 ? MAT.anemone : MAT.anemoneGreen);
      else if (kind === 'fan') K.fan(x, base, 5 + s * 3, 7 + s * 5, fans[i % 3]);
      else if (kind === 'stag') K.staghorn(x, base, 0.4 + s * 0.5, stags[i % 3]);
      else if (kind === 'zoa') K.zoa(x, base - 1, 5 + r() * 4, 1.8, i % 2 ? MAT.zoaOrange : MAT.zoaGreen);
      else K.clam(x, base, 3 + s * 2, i % 2 ? MAT.clam : MAT.clamTeal);
    }
  }
  worms.forEach(([x, y], j) => K.xmas(x, y, j));
  return c.result();
}
