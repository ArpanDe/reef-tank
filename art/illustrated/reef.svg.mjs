// Midground reef: a crowded, healthy tropical reef. Rock is almost entirely covered with living
// colonies; on top grow branching Acropora and staghorn with bright tips, layered table corals,
// vivid sea fans, soft and leather corals, sponges, anemones, clams and worms, in several overlapping
// depth layers. Tall clusters alternate with low stretches so open water keeps drifting through the
// fish zone. Sits slightly darker and bluer than the floor for depth, but stays saturated.
// Tiles seamlessly over TILE px (periodic profiles, features wrapped across the edges).
import { rng, pnoise, wrapDist, wrapX, smooth, f1, TILE } from './_lib.mjs';
import * as K from './_corals.mjs';

const W = TILE;
const H = 540;
const STEP = 18; // divides TILE

const bumps = (centers) => (x) => centers.reduce((s, [c, w, k]) => s + k * Math.exp(-(wrapDist(x, c) ** 2) / (2 * w * w)), 0);

// ---------- palettes (saturated, warm-to-cool) ----------
export const PAL = {
  fan: ['#e0303a', '#f07a20', '#d8308a', '#c42a72', '#f0a030', '#9a3ad8'],
  acro: [['#4a9a2a', '#c8ff60'], ['#7a2ab0', '#f2a8ff'], ['#2a5ac8', '#9ae4ff'], ['#1a9a8a', '#a8fff0'], ['#c8702a', '#ffe090'], ['#c83a7a', '#ffb8e4']],
  table: ['#4a9a5a', '#a8702a', '#2a8a9a', '#7a5ab8', '#8aa83a'],
  brain: [['#4aa84a', '#1a5a2a'], ['#ec8a30', '#8a3a10'], ['#d8b830', '#6a5a10'], ['#30b0a0', '#105a50'], ['#c85aa0', '#5a1a48']],
  tube: ['#8a3ab8', '#f07a2a', '#d83a5a', '#3a6ad8', '#c84ab0'],
  barrel: ['#e8b820', '#f0c840', '#e09a20'],
  leather: ['#f290b4', '#f4a050', '#e8c860', '#b0d870'],
  soft: ['#ec5a8a', '#f27a3a', '#a85ad8', '#e83a4a', '#f0a0c8'],
  anemone: [['#c8287a', '#ff9ad0'], ['#3aa84a', '#f6a8e4'], ['#d8487a', '#c890ff'], ['#2a9a6a', '#ff88c8'], ['#e86a2a', '#ffd070']],
  clam: [['#30d8ff', '#1a4ad0'], ['#20e8c0', '#106a9a'], ['#7a9aff', '#3a2aa8'], ['#40ffb0', '#0a6a8a']],
  carpet: [['#3ab84a', '#ff8ac0'], ['#f08a2a', '#4ae0a0'], ['#8a3ac0', '#8aff6a'], ['#e85a9a', '#fff0a0'], ['#2ab0b0', '#ffb040']],
  worm: ['#3a7ad8', '#f0a030', '#f0d040', '#e05050', '#c040d0'],
};

// One reef piece at (x, y) scaled by s (0.6..1.3). Returns [svg, halfWidth].
export function piece(r, kind, x, y, s) {
  const P = PAL;
  switch (kind) {
    case 'fan': {
      const w = r.range(120, 200) * s;
      return [K.fan(r, x, y + 12, w, w * r.range(0.95, 1.1), r.pick(P.fan)), w / 2 + 8];
    }
    case 'acro': {
      const [c, t] = r.pick(P.acro);
      const len = r.range(30, 44) * s;
      return [K.branching(r, x, y + 8, { color: c, tip: t, len, width: 10 * s, depth: 3, colonies: r.int(2, 3) }), len * 2.6 + 30];
    }
    case 'stag': {
      const [c, t] = r.pick(P.acro);
      const len = r.range(40, 54) * s;
      return [K.branching(r, x, y + 8, { color: c, tip: t, len, width: 7 * s, depth: 3, spread: 0.45, colonies: 2 }), len * 2.4 + 20];
    }
    case 'tables': {
      const c = r.pick(P.table);
      const w = r.range(110, 170) * s;
      let out = K.table(r, x, y + 8, w, w * 0.55, c);
      if (r() < 0.75) out = K.table(r, x + r.range(-0.3, 0.3) * w, y + 8, w * 0.75, w * 0.32, r.pick(P.table)) + out;
      return [out, w / 2 + 6];
    }
    case 'soft':
      return [K.softTree(r, x, y + 6, r.range(60, 90) * s, r.pick(P.soft)), 50 * s];
    case 'fingers':
      return [K.fingers(r, x, y + 7, { color: r.pick(P.leather), n: r.int(4, 7), h: r.range(44, 70) * s, w: 14 * s }), 55 * s];
    case 'tube':
      return [K.sponges(r, x, y + 7, r.pick(P.tube), r.int(2, 4)), 70];
    case 'barrel': {
      const w = r.range(34, 52) * s;
      return [K.barrel(r, x, y + 6, w, w * r.range(1, 1.3), r.pick(P.barrel)), w * 0.6];
    }
    case 'leather': {
      const w = r.range(56, 84) * s;
      return [K.toadstool(r, x, y + 7, w, r.pick(P.leather)), w * 0.6];
    }
    case 'anemone': {
      const [b, t] = r.pick(P.anemone);
      const w = r.range(54, 80) * s;
      return [K.anemone(r, x, y + 4, w, b, t), w * 0.7];
    }
    case 'anemoneBed': {
      const [b, t] = r.pick(P.anemone);
      const n = r.int(2, 3);
      const out = [];
      for (let i = 0; i < n; i++) out.push(K.anemone(r, x + (i - (n - 1) / 2) * 34 * s, y + 4 + r.range(-3, 3), r.range(46, 64) * s, b, t));
      return [out.join(''), n * 20 * s + 40];
    }
    case 'clam': {
      const w = r.range(40, 60) * s;
      return [K.clam(r, x, y + 2, w, r.pick(P.clam)), w * 0.6];
    }
    case 'brainCluster': {
      const [c, g] = r.pick(P.brain);
      const w = r.range(70, 110) * s;
      const [c2, t2] = r.pick(P.acro);
      // a brain coral never stands alone: give it a neighbour and something growing on top
      const out = [K.brain(r, x + w * 0.38, y + 8, w * 0.6, w * 0.32, ...r.pick(P.brain)), K.brain(r, x, y + 8, w, w * 0.5, c, g)];
      out.push(K.branching(r, x - w * 0.15, y - w * 0.38, { color: c2, tip: t2, len: 18 * s, width: 6 * s, depth: 2, colonies: 2 }));
      if (r() < 0.6) out.push(K.xmasWorms(r, x + w * 0.15, y - w * 0.44, r.pick(P.worm)));
      return [out.join(''), w * 0.9 + 20];
    }
    case 'carpet': {
      const w = r.range(40, 80) * s;
      return [K.carpet(r, x, y, w, r.pick(['zoa', 'gsp', 'mush', 'polyp']), r.pick(P.carpet)), w / 2 + 6];
    }
    case 'bubble':
      return [K.bubbles(r, x, y + 4, r.int(5, 8), r.pick(['#b8f0a8', '#d8b8f8', '#a8e0f8'])), 30];
    case 'urchin':
      return [K.urchin(r, x, y + 3, r.range(9, 13)), 32];
    case 'worms':
      return [K.dusters(r, x, y + 2, r.int(2, 4), r.pick(['#d83a4a', '#f08a3a', '#c040d0', '#3a8ad8']), r.pick(['#fff0e8', '#6a2030', '#f0e040'])), 40];
    default:
      return ['', 0];
  }
}

function pickWeighted(r, table) {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let u = r() * total;
  for (const [k, w] of table) if ((u -= w) <= 0) return k;
  return table[0][0];
}

// Walk along the tile placing pieces: dense in clusters, sparser (but never empty) between them.
function populate(r, heightAt, hump, tall, low, { dense = 46, sparse = 120, embed = 2, scale = [0.7, 1.15] } = {}) {
  const items = [];
  let x = r.range(0, 40);
  while (x < W) {
    const h = Math.min(1, hump(x));
    const table = h > 0.35 ? tall : low;
    const kind = pickWeighted(r, table);
    const s = scale[0] + (scale[1] - scale[0]) * h * r.range(0.85, 1.1);
    const y = H - heightAt(x) + embed + r.range(-4, 10);
    const [svg, half] = piece(r, kind, x, y, s);
    items.push({ y, svg: wrapX(svg, x - half, x + half) });
    x += (sparse + (dense - sparse) * h) * r.range(0.75, 1.2);
  }
  items.sort((a, b) => a.y - b.y);
  return items.map((i) => i.svg).join('');
}

function rockLayer(r, heightAt, hump, { step, size }) {
  const pts = [];
  for (let x = -3 * STEP; x <= W + 3 * STEP; x += STEP) pts.push([x, H - heightAt(x) + 24]);
  const out = [`<path d="${smooth(pts)}L${W + 3 * STEP},${H + 20}L${-3 * STEP},${H + 20}Z" fill="url(#mass)"/>`];
  const bs = [];
  for (let x = 0; x < W; x += r.range(...step)) {
    const top = H - heightAt(x);
    const k = 0.65 + 0.6 * Math.min(1, hump(x));
    const rx = r.range(...size) * k;
    const ry = rx * r.range(0.45, 0.68);
    bs.push({ x: x + r.range(-10, 10), cy: top + ry * 0.92, rx, ry });
    if (r() < 0.5) {
      const rx2 = rx * r.range(0.45, 0.8);
      bs.push({ x: x + r.range(-40, 40), cy: top + ry * 0.92 + rx2 * r.range(0.45, 0.85), rx: rx2, ry: rx2 * r.range(0.42, 0.62) });
    }
  }
  bs.sort((a, b) => a.cy + a.ry - (b.cy + b.ry));
  for (const b of bs) out.push(wrapX(K.liveRock(r, b.x, b.cy, b.rx, b.ry), b.x - b.rx * 1.3, b.x + b.rx * 1.3));
  return out.join('');
}

const CLUSTERS = [380, 1262, 2050];

export default function reef() {
  const r = rng(90210);
  const n1 = pnoise(31, 21);
  const n2 = pnoise(32, 64);
  const n3 = pnoise(33, 28);

  const humpBack = bumps(CLUSTERS.map((c, i) => [c + [20, 20, 0][i], [155, 150, 155][i], 1]));
  const humpFront = bumps(CLUSTERS.map((c, i) => [c + [30, -20, 20][i], [140, 135, 140][i], 1]));
  const hBack = (x) => 188 + 175 * Math.min(1.1, humpBack(x)) + 18 * n1(x) + 8 * n2(x);
  const hFront = (x) => 132 + 130 * Math.min(1.1, humpFront(x)) + 14 * n3(x) + 6 * n2(x + 500);

  const BACK_TALL = [['fan', 3], ['acro', 3], ['stag', 2], ['tables', 2.2], ['soft', 2], ['fingers', 1], ['tube', 1.4], ['barrel', 1], ['leather', 0.8]];
  const BACK_LOW = [['acro', 2], ['soft', 1.5], ['tube', 1], ['barrel', 1], ['fingers', 1], ['fan', 0.8], ['anemoneBed', 1], ['leather', 1]];
  const FRONT_TALL = [['brainCluster', 2], ['acro', 2], ['anemoneBed', 2], ['clam', 1.6], ['tube', 1.2], ['barrel', 1], ['leather', 1.2], ['soft', 1.4], ['fingers', 1], ['carpet', 1], ['bubble', 0.8], ['worms', 1], ['urchin', 0.4]];
  const FRONT_LOW = [['anemoneBed', 2], ['clam', 1.5], ['carpet', 1.5], ['brainCluster', 1], ['soft', 1], ['acro', 1], ['worms', 1], ['bubble', 0.6], ['urchin', 0.4]];

  const back = [
    rockLayer(r, hBack, humpBack, { step: [56, 96], size: [66, 120] }),
    populate(r, hBack, humpBack, BACK_TALL, BACK_LOW, { dense: 52, sparse: 150, scale: [0.75, 1.15] }),
  ];
  const front = [
    rockLayer(r, hFront, humpFront, { step: [58, 100], size: [60, 112] }),
    populate(r, hFront, humpFront, FRONT_TALL, FRONT_LOW, { dense: 48, sparse: 120, scale: [0.75, 1.1] }),
  ];

  const defs =
    K.coverDefs() +
    `<linearGradient id="mass" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${H}"><stop offset="0" stop-color="#3a2a48"/><stop offset="1" stop-color="#160f22"/></linearGradient>` +
    K.hazeFilter('hazeBack', 1.0, 0.16, '#1a5a92', W, H) +
    K.hazeFilter('hazeFront', 1.04, 0.07, '#1a5a92', W, H);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs>
<g filter="url(#hazeBack)">${back.join('')}</g>
<g filter="url(#hazeFront)">${front.join('')}</g>
</svg>`;
}
