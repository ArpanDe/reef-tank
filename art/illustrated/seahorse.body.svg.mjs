// Seahorse body, upright and facing right: trunk and curled tail are built from a centre line with a
// width profile, then banded with bony rings. Head, snout and crown are drawn on top.
import { smooth, f1 } from './_lib.mjs';

// centre line from the nape down to the tip of the curled tail, with full width at each point
const SPINE = [
  [37, 38, 17], [40, 50, 22], [44, 64, 30], [46.5, 80, 36], [47, 96, 37], [45, 111, 33], [41, 125, 26],
  [38.5, 139, 18], [38.5, 153, 13.5], [40.5, 166, 11], [45.5, 177, 9], [53.5, 183.5, 7.5], [61.5, 182, 6.5],
  [65.5, 175, 5.5], [63, 168, 4.6], [57.5, 167.5, 3.8], [55, 172.5, 3.1], [57.5, 176.5, 2.2],
];

function resample(pts, step) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0, w0] = pts[i - 1];
    const [x1, y1, w1] = pts[i];
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      out.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w0 + (w1 - w0) * t]);
    }
  }
  return out;
}

export default function seahorseBody() {
  const pts = resample(SPINE, 2);
  const L = [];
  const R = [];
  const ribs = [];
  const knobs = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 2)];
    const b = pts[Math.min(pts.length - 1, i + 2)];
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const w = pts[i][2] / 2;
    // "left" here is the back side (x smaller) for the trunk
    const l = [pts[i][0] + dy * w, pts[i][1] - dx * w];
    const r = [pts[i][0] - dy * w, pts[i][1] + dx * w];
    L.push(l);
    R.push(r);
    if (i % 4 === 2 && i < pts.length - 4) {
      ribs.push(`M${f1(l[0])},${f1(l[1])}Q${f1(pts[i][0] + dx * 1.5)},${f1(pts[i][1] + dy * 1.5 + 1.2)} ${f1(r[0])},${f1(r[1])}`);
      if (pts[i][1] < 150) knobs.push(`<circle cx="${f1(l[0] + dy * 1.2)}" cy="${f1(l[1] - dx * 1.2)}" r="${f1(Math.max(1.1, w * 0.12))}" fill="#c98a2c" stroke="#5a3406" stroke-width="0.9"/>`);
    }
  }
  const outline = smooth([...L, ...R.reverse()], true);
  const head = 'M31,34 C28,26 31,17 39,14 C46,12 53,16 55,23 C56,26 56,28 55,30 C62,31 72,33 79,34.5 C81.5,36 81.5,40.5 79,42 C71,41.5 62,40 55,39 C52,43 46,46 41,46 C36,45 33,41 31,34 Z';
  const crown = 'M35,18 L36.5,9 L40,14 L42.5,7.5 L45,14 L48,10 L48.5,17 Z';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="90" height="200" viewBox="0 0 90 200">
<defs>
<linearGradient id="b" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="#9c5e14"/><stop offset="0.45" stop-color="#e2a034"/><stop offset="0.8" stop-color="#f4c45a"/><stop offset="1" stop-color="#e6b048"/>
</linearGradient>
<linearGradient id="h" x1="0" y1="0" x2="0.4" y2="1">
<stop offset="0" stop-color="#f2c050"/><stop offset="1" stop-color="#c4801e"/>
</linearGradient>
<clipPath id="bc"><path d="${outline}"/></clipPath>
</defs>
<path d="M33,44 C24,44 20,50 22,56 C27,56 32,52 35,48 Z" fill="#f6dc9a" fill-opacity="0.75" stroke="#5a3406" stroke-width="1.1"/>
<path d="${outline}" fill="url(#b)"/>
<g clip-path="url(#bc)" fill="none">
<path d="${ribs.join('')}" stroke="#7a4a0c" stroke-opacity="0.55" stroke-width="1.3"/>
<path d="M56,70 C60,84 60,104 54,118" stroke="#fff0c0" stroke-opacity="0.45" stroke-width="4" stroke-linecap="round"/>
<circle cx="48" cy="76" r="1.1" fill="#fff6dc" opacity="0.8"/><circle cx="52" cy="92" r="1" fill="#fff6dc" opacity="0.8"/><circle cx="44" cy="104" r="1.1" fill="#fff6dc" opacity="0.8"/><circle cx="40" cy="88" r="0.9" fill="#fff6dc" opacity="0.7"/><circle cx="46" cy="118" r="0.9" fill="#fff6dc" opacity="0.7"/>
</g>
${knobs.join('')}
<path d="${outline}" fill="none" stroke="#5a3406" stroke-width="1.8" stroke-linejoin="round"/>
<path d="${crown}" fill="#d8962c" stroke="#5a3406" stroke-width="1.4" stroke-linejoin="round"/>
<path d="${head}" fill="url(#h)" stroke="#5a3406" stroke-width="1.8" stroke-linejoin="round"/>
<path d="M57,33 C64,34 72,35.5 78,36.5" stroke="#fff0c0" stroke-opacity="0.5" stroke-width="1.6" fill="none" stroke-linecap="round"/>
<path d="M36,36 C38,40 42,42 47,41" stroke="#7a4a0c" stroke-opacity="0.6" stroke-width="1.2" fill="none"/>
<circle cx="44.5" cy="27" r="4.4" fill="#f6e2a8" stroke="#5a3406" stroke-width="1.1"/>
<circle cx="44.5" cy="27" r="3.2" fill="#5a3a10"/>
<circle cx="44.8" cy="27.2" r="1.9" fill="#080402"/>
<circle cx="43.5" cy="25.8" r="0.9" fill="#ffffff" opacity="0.9"/>
</svg>`;
}
