// Distant reef: two hazy ridges of rock and coral silhouettes, blue-shifted and low contrast.
// Tiles seamlessly over TILE px: ridgelines use periodic noise and features wrap across the edges.
import { rng, pnoise, wrapDist, wrapX, smooth, blob, mix, waterAt, f1, TILE } from './_lib.mjs';
import { branchCoral, seaFan, tableCoral, dome } from './_reefkit.mjs';

const W = TILE;
const H = 600;
const TOP = 1080 - H; // screen y of this layer's top edge (before the engine's tide sway)
const STEP = 18; // divides TILE, so sampled ridgelines repeat exactly

// periodic sum of soft bumps: 0 in the low stretches, ~1 at a cluster's peak
const bumps = (centers) => (x) => centers.reduce((s, [c, w, k]) => s + k * Math.exp(-(wrapDist(x, c) ** 2) / (2 * w * w)), 0);

function gradient(id, haze, deep) {
  const stops = [0, 0.2, 0.45, 0.7, 1]
    .map((t) => `<stop offset="${t}" stop-color="${mix(waterAt(TOP + t * H), deep, haze + t * 0.18)}"/>`)
    .join('');
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${H}">${stops}</linearGradient>`;
}

// Ridge polygon sampled on a grid that divides TILE, extended past both edges so the spline's
// tangents at x = 0 and x = TILE match.
function ridge(heightAt) {
  const pts = [];
  for (let x = -3 * STEP; x <= W + 3 * STEP; x += STEP) pts.push([x, H - heightAt(x)]);
  return `${smooth(pts)}L${W + 3 * STEP},${H + 10}L${-3 * STEP},${H + 10}Z`;
}

function lumps(r, heightAt, hump, fill, step, size) {
  const out = [];
  for (let x = 0; x < W; x += r.range(...step)) {
    const rx = r.range(...size) * (0.7 + hump(x) * 0.5);
    const ry = rx * r.range(0.45, 0.7);
    const d = blob(r, x, H - heightAt(x) + ry * 0.75, rx, ry, { n: 10, jitter: 0.14, flatBottom: true });
    out.push(wrapX(`<path d="${d}" fill="${fill}"/>`, x - rx * 1.3, x + rx * 1.3));
  }
  return out.join('');
}

function silhouettes(r, baseAt, hump, fill, count, scale) {
  const out = [];
  const xs = [];
  for (let i = 0; i < count; i++) xs.push(r.range(0, W));
  xs.sort((a, b) => a - b);
  for (const x of xs) {
    const y = H - baseAt(x) + 8;
    const s = scale * (0.7 + hump(x) * 0.5) * r.range(0.75, 1.2);
    const kind = r.pick(['branch', 'branch', 'table', 'fan', 'dome', 'pillar', 'boulder']);
    const parts = [];
    let half = 90 * s;
    if (kind === 'branch') {
      for (const b of branchCoral(r, x, y, { len: 34 * s, width: 9 * s, depth: 3, spread: 0.6 })) {
        parts.push(`<path d="${b.d}" stroke="${fill}" stroke-width="${f1(b.w)}" stroke-linecap="round" fill="none"/>`);
      }
      half = 130 * s;
    } else if (kind === 'table') {
      const t = tableCoral(r, x, y, 120 * s, 60 * s);
      parts.push(`<path d="${t.stem}" fill="${fill}"/><path d="${t.plate}" fill="${fill}"/>`);
    } else if (kind === 'fan') {
      const fan = seaFan(r, x, y, 120 * s, 130 * s);
      parts.push(`<path d="${fan.outline}" fill="${fill}" fill-opacity="0.55"/>`);
      for (const b of fan.branches) parts.push(`<path d="${b.d}" stroke="${fill}" stroke-width="${f1(b.w)}" stroke-linecap="round" fill="none"/>`);
      half = 110 * s;
    } else if (kind === 'pillar') {
      const n = r.int(2, 4);
      for (let i = 0; i < n; i++) {
        const px = x + (i - n / 2) * 16 * s + r.range(-4, 4);
        const ph = r.range(50, 110) * s;
        const pw = r.range(11, 16) * s;
        parts.push(`<rect x="${f1(px - pw / 2)}" y="${f1(y - ph)}" width="${f1(pw)}" height="${f1(ph + 10)}" rx="${f1(pw / 2)}" fill="${fill}"/>`);
      }
    } else {
      const w = r.range(60, 130) * s;
      parts.push(`<path d="${dome(r, x, y, w, w * r.range(0.4, 0.6))}" fill="${fill}"/>`);
    }
    out.push(wrapX(parts.join(''), x - half, x + half));
  }
  return out.join('');
}

// Faint mottling so the hazy rock bodies aren't flat colour (helps every pixel change as it scrolls).
function mottle(r, clipId, heightAt, n, light, dark) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = r.range(0, W);
    const top = H - heightAt(x);
    const y = r.range(top - 10, H);
    const rx = r.range(20, 70);
    const ry = rx * r.range(0.3, 0.6);
    const c = r() < 0.5 ? light : dark;
    out.push(wrapX(`<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="${c}" fill-opacity="${(r.range(0.03, 0.065)).toFixed(3)}"/>`, x - rx, x + rx));
  }
  return `<g clip-path="url(#${clipId})">${out.join('')}</g>`;
}

export default function far() {
  const nA = pnoise(11, 18);
  const nA2 = pnoise(12, 56);
  const nB = pnoise(21, 23);
  const nB2 = pnoise(22, 71);

  // Hazy clusters, offset from the reef's so the depth keeps changing as layers drift past.
  const humpA = bumps([[520, 260, 1], [1420, 230, 0.85], [2150, 210, 0.9]]);
  const humpB = bumps([[180, 200, 1], [1000, 230, 0.9], [1760, 210, 1]]);
  const hA = (x) => 290 + 200 * humpA(x) + 45 * nA(x) + 12 * nA2(x);
  const hB = (x) => 190 + 190 * humpB(x) + 40 * nB(x) + 10 * nB2(x);

  const defs =
    gradient('gA', 0.14, '#0b3768') +
    gradient('gB', 0.3, '#072a54') +
    `<clipPath id="cA"><path d="${ridge(hA)}"/></clipPath><clipPath id="cB"><path d="${ridge(hB)}"/></clipPath>`;

  const rA = rng(7);
  const rB = rng(8);
  const rM = rng(9);
  const body = [
    `<g>${silhouettes(rA, hA, humpA, 'url(#gA)', 34, 0.55)}${lumps(rA, hA, humpA, 'url(#gA)', [40, 80], [30, 60])}<path d="${ridge(hA)}" fill="url(#gA)"/></g>`,
    mottle(rM, 'cA', hA, 120, '#5a9ccc', '#0a2c58'),
    `<g>${silhouettes(rB, hB, humpB, 'url(#gB)', 48, 0.85)}${lumps(rB, hB, humpB, 'url(#gB)', [36, 70], [34, 70])}<path d="${ridge(hB)}" fill="url(#gB)"/></g>`,
    mottle(rM, 'cB', hB, 160, '#4a8cbc', '#061e40'),
  ].join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs>${body}</svg>`;
}
