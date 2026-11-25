// Caustics: the dancing net of sunlight on a shallow sea floor. Voronoi cells (half-plane clipping
// of a jittered grid) drawn as softened, slightly wobbly outlines in white with a soft glow; transparent
// everywhere else. The engine stretches it 2x and sets a low opacity. Doesn't tile.
import { rng, smooth, f1 } from './_lib.mjs';

const W = 960;
const H = 540;

function clip(poly, p, q) {
  // keep the side of the bisector of p-q that contains p
  const mx = (p[0] + q[0]) / 2;
  const my = (p[1] + q[1]) / 2;
  const nx = q[0] - p[0];
  const ny = q[1] - p[1];
  const side = (v) => (v[0] - mx) * nx + (v[1] - my) * ny;
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = side(a);
    const sb = side(b);
    if (sa <= 0) out.push(a);
    if ((sa <= 0) !== (sb <= 0)) {
      const t = sa / (sa - sb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

// Real caustics fall on the reef and floor, not on open water: empty in the top 28%, fading in
// smoothly, full strength over the bottom 45%.
function ramp(top = 0.28, full = 0.55) {
  const stops = [`<stop offset="0" stop-color="#000000"/>`, `<stop offset="${top}" stop-color="#000000"/>`];
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    const v = Math.round(255 * t * t * (3 - 2 * t));
    const hex = v.toString(16).padStart(2, '0');
    stops.push(`<stop offset="${(top + (full - top) * t).toFixed(4)}" stop-color="#${hex}${hex}${hex}"/>`);
  }
  stops.push(`<stop offset="1" stop-color="#ffffff"/>`);
  return stops.join('');
}

export default function caustics() {
  const r = rng(3141);
  const cell = 74;
  const pts = [];
  for (let gy = -1; gy <= Math.ceil(H / cell) + 1; gy++) {
    for (let gx = -1; gx <= Math.ceil(W / cell) + 1; gx++) {
      pts.push([(gx + 0.5 + r.range(-0.42, 0.42)) * cell, (gy + 0.5 + r.range(-0.42, 0.42)) * cell * 0.9]);
    }
  }
  const paths = [];
  for (const p of pts) {
    let poly = [[p[0] - 300, p[1] - 300], [p[0] + 300, p[1] - 300], [p[0] + 300, p[1] + 300], [p[0] - 300, p[1] + 300]];
    for (const q of pts) if (q !== p && Math.abs(q[0] - p[0]) < 260 && Math.abs(q[1] - p[1]) < 260) poly = clip(poly, p, q);
    if (poly.length < 3) continue;
    const cx = poly.reduce((s, v) => s + v[0], 0) / poly.length;
    const cy = poly.reduce((s, v) => s + v[1], 0) / poly.length;
    if (cx < -80 || cx > W + 80 || cy < -80 || cy > H + 80) continue;
    // round the cell: corners pulled in a little, edge midpoints pulled in more, then a smooth spline
    const dense = [];
    const toward = ([x, y], k) => {
      const dx = cx - x;
      const dy = cy - y;
      const dl = Math.hypot(dx, dy) || 1;
      const wob = Math.sin(x * 0.07 + y * 0.05) * 1.4;
      return [x + (dx / dl) * (k + wob), y + (dy / dl) * (k + wob)];
    };
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 6) continue;
      dense.push(toward(a, 7));
      dense.push(toward([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], 2.5));
    }
    if (dense.length < 4) continue;
    paths.push(smooth(dense, true, 1));
  }
  const d = paths.join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><filter id="glow" x="0" y="0" width="${W}" height="${H}" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="2.6"/></filter>
<linearGradient id="fadeG" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${H}">${ramp()}</linearGradient>
<mask id="fade" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="url(#fadeG)"/></mask></defs>
<g mask="url(#fade)">
<path d="${d}" fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="5" stroke-linejoin="round" filter="url(#glow)"/>
<path d="${d}" fill="none" stroke="#ffffff" stroke-opacity="0.9" stroke-width="1.5" stroke-linejoin="round"/>
</g>
</svg>`;
}
