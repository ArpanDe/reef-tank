// Reef floor: a coral garden on warm coral sand, the nearest backdrop strip. The upper part is
// crowded with coral clumps on small live-rock bases, anemone beds, giant clams, sponges, soft corals
// and worms; the bottom ~45% is the critters' ground: rippled sand with low colourful carpets,
// small mushroom corals and polyps. Same reef as reef.svg.mjs, nearer, brighter and more detailed.
// Tiles seamlessly over TILE px: the top edge uses periodic noise and every feature wraps.
import { rng, pnoise, wrapX, smooth, blob, mix, f1, TILE } from './_lib.mjs';
import * as K from './_corals.mjs';
import { piece, PAL } from './reef.svg.mjs';

const W = TILE;
const H = 260;
const STEP = 18; // divides TILE
const WALK = Math.round(H * 0.55); // top of the critters' ground (bottom 45%)

function pickWeighted(r, table) {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let u = r() * total;
  for (const [k, w] of table) if ((u -= w) <= 0) return k;
  return table[0][0];
}

// A small colourful shell lying on the sand.
function shell(r, x, y, s) {
  const c = r.pick(['#f08a6a', '#f4c060', '#e86aa0', '#f0e0c0', '#c87ae0']);
  const d = blob(r, x, y, s, s * 0.6, { n: 9, jitter: 0.1, rot: r.range(-0.4, 0.4) });
  return `<ellipse cx="${f1(x + 1)}" cy="${f1(y + s * 0.5)}" rx="${f1(s * 1.1)}" ry="${f1(s * 0.3)}" fill="#7a5a30" fill-opacity="0.3"/><path d="${d}" fill="${c}" stroke="${mix(c, '#3a2010', 0.55)}" stroke-width="1"/><path d="M${f1(x - s * 0.6)},${f1(y)}Q${f1(x)},${f1(y - s * 0.7)} ${f1(x + s * 0.6)},${f1(y)}" stroke="#ffffff" stroke-opacity="0.5" stroke-width="1.2" fill="none"/>`;
}

export default function floor() {
  const r = rng(6060);
  const n1 = pnoise(51, 13);
  const n2 = pnoise(52, 37);
  const n3 = pnoise(53, 113);
  const topAt = (x) => 86 + 14 * n1(x) + 6 * n2(x) + 2.5 * n3(x);

  const edge = [];
  for (let x = -3 * STEP; x <= W + 3 * STEP; x += STEP) edge.push([x, topAt(x)]);
  const ground = `${smooth(edge)}L${W + 3 * STEP},${H + 5}L${-3 * STEP},${H + 5}Z`;

  const defs = `
<linearGradient id="sandG" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${H}">
<stop offset="0" stop-color="#e8d6a6"/><stop offset="0.45" stop-color="#e0c994"/><stop offset="0.75" stop-color="#d6bd84"/><stop offset="1" stop-color="#cbae76"/></linearGradient>
<linearGradient id="sandHaze" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${H}"><stop offset="0" stop-color="#3a8ab8" stop-opacity="0.3"/><stop offset="0.32" stop-color="#3a8ab8" stop-opacity="0.08"/><stop offset="0.5" stop-color="#3a8ab8" stop-opacity="0"/></linearGradient>
${K.coverDefs()}
<clipPath id="sandClip"><path d="${ground}"/></clipPath>
${K.hazeFilter('flTint', 1.06, 0.03, '#2a88b8', W, H)}`;

  const out = [];
  // soft shadow where the floor meets the reef behind, then the sand
  out.push(`<path d="${ground}" fill="#141a30" fill-opacity="0.35" transform="translate(0,-5)"/>`);
  out.push(`<path d="${ground}" fill="url(#sandG)"/>`);

  // sand texture: soft mottling, ripples and fine grain
  const tex = [];
  for (let i = 0; i < 120; i++) {
    const x = r.range(0, W);
    const y = r.range(topAt(x), H);
    const rx = r.range(30, 90);
    tex.push(wrapX(`<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rx)}" ry="${f1(rx * r.range(0.12, 0.22))}" fill="${r() < 0.5 ? '#f6e6b8' : '#b8955a'}" fill-opacity="${f1(r.range(0.12, 0.25))}"/>`, x - rx, x + rx));
  }
  for (let row = 0; row < 10; row++) {
    const dy = 14 + row * 16 + r.range(-3, 3);
    let x = r.range(0, 60);
    while (x < W) {
      const len = r.range(70, 190);
      const pts = [];
      for (let t = 0; t <= len; t += 14) {
        const px = x + t;
        pts.push([px, topAt(px) * (1 - row / 13) + dy + Math.sin(px / 23 + row) * 2.2]);
      }
      if (pts.length > 2) {
        const d = smooth(pts);
        tex.push(wrapX(`<path d="${d}" stroke="#a8844a" stroke-width="2" fill="none" stroke-linecap="round" stroke-opacity="${(0.14 + row * 0.012).toFixed(3)}"/><path d="${d}" stroke="#fff4d4" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-opacity="0.35" transform="translate(0,-2.4)"/>`, x - 2, x + len + 2));
      }
      x += len + r.range(25, 70);
    }
  }
  for (let i = 0; i < 4200; i++) {
    const x = r.range(0, W);
    const y = r.range(topAt(x) + 2, H);
    const rr = r.range(0.5, 1.3);
    const c = r.pick(['#fff8e4', '#fff0c8', '#a8844a', '#c89a5a', '#e8a0a0']);
    tex.push(wrapX(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(rr)}" fill="${c}" fill-opacity="${f1(r.range(0.3, 0.6))}"/>`, x - rr, x + rr));
  }
  tex.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="url(#sandHaze)"/>`);
  out.push(`<g clip-path="url(#sandClip)">${tex.join('')}</g>`);
  out.push(`<path d="${smooth(edge)}" stroke="#fff2cc" stroke-opacity="0.5" stroke-width="2" fill="none"/>`);

  // ---- upper part: a crowded coral garden ----
  const SINGLE = [['anemoneBed', 3], ['anemone', 1.5], ['clam', 2], ['barrel', 1.2], ['tube', 1.4], ['soft', 1.6], ['fingers', 1], ['leather', 1.2], ['brainCluster', 1.2], ['worms', 1], ['carpet', 1.2], ['bubble', 0.8]];
  const ON_ROCK = [['acro', 2], ['soft', 1.5], ['anemone', 1.5], ['clam', 1.2], ['fingers', 1], ['worms', 1], ['carpet', 1], ['bubble', 0.8], ['tube', 0.8], ['leather', 0.8], ['urchin', 0.4]];
  const garden = [];
  let x = r.range(0, 40);
  while (x < W) {
    const back = r() < 0.5; // two overlapping rows give depth
    const y = topAt(x) + (back ? r.range(12, 26) : r.range(30, 46));
    if (r() < 0.45) {
      // clump: a low live-rock base crowded with two or three pieces
      const rx = r.range(38, 70);
      const ry = r.range(15, 24);
      const parts = [K.liveRock(r, x, y - ry * 0.4, rx, ry)];
      const n = r.int(2, 3);
      for (let i = 0; i < n; i++) {
        const px = x + (i - (n - 1) / 2) * rx * 0.6 + r.range(-8, 8);
        const [svg] = piece(r, pickWeighted(r, ON_ROCK), px, y - ry * 1.05 + r.range(-3, 3), r.range(0.6, 0.78));
        parts.push(svg);
      }
      garden.push({ y, svg: wrapX(parts.join(''), x - rx - 70, x + rx + 70) });
    } else {
      const [svg, half] = piece(r, pickWeighted(r, SINGLE), x, y, r.range(0.62, 0.82));
      garden.push({ y, svg: wrapX(svg, x - half, x + half) });
    }
    x += r.range(48, 96);
  }
  garden.sort((a, b) => a.y - b.y);
  out.push(garden.map((g) => g.svg).join(''));

  // ---- bottom 45%: the critters' ground, kept low ----
  const ground2 = [];
  for (let gx = r.range(0, 40); gx < W; gx += r.range(38, 85)) {
    const y = r.range(WALK + 10, H - 22);
    const k = r();
    let svg;
    let half = 45;
    if (k < 0.55) {
      const w = r.range(36, 84);
      svg = K.carpet(r, gx, y, w, r.pick(['zoa', 'gsp', 'mush', 'polyp', 'zoa']), r.pick(PAL.carpet));
      half = w / 2 + 6;
    } else if (k < 0.75) {
      svg = K.mushroom(r, gx, y, r.range(20, 30), r.pick(['#f0a050', '#7ad06a', '#e870a8', '#50c0d0']));
    } else if (k < 0.9) {
      svg = shell(r, gx, y, r.range(5, 8));
      half = 12;
    } else {
      svg = K.xmasWorms(r, gx, y, r.pick(PAL.worm));
      half = 12;
    }
    ground2.push({ y, svg: wrapX(svg, gx - half, gx + half) });
  }
  ground2.sort((a, b) => a.y - b.y);
  out.push(ground2.map((g) => g.svg).join(''));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs><g filter="url(#flTint)">${out.join('')}</g></svg>`;
}
