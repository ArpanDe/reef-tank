// Plants are drawn once in "plant space" (x = 0 on the stem, y = -height, base at y = 0) and each
// segment file renders a window of that drawing. Segment k's bottom-centre sits exactly on segment
// k-1's top-centre minus `overlap`, so stacked segments reproduce the drawing with no seams; the
// stems pass through x = 0 at every joint so the engine's per-segment rotation stays tidy.
import { rng, smooth, taper, mix, lighten, darken, f1 } from './_lib.mjs';

const cache = new Map();

function plant(name) {
  if (!cache.has(name)) cache.set(name, PLANTS[name]());
  return cache.get(name);
}

export function segment(name, k) {
  const p = plant(name);
  const h = p.heights[k];
  let base = 0;
  for (let j = 0; j < k; j++) base += p.heights[j] - p.overlap;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${p.width}" height="${h}" viewBox="0 0 ${p.width} ${h}"><g transform="translate(${p.width / 2},${h + base})"><defs>${p.defs}</defs>${p.body}</g></svg>`;
}

// ---------- kelp: tall stipe with long, wavy, streaming ribbon blades ----------

function kelp() {
  const r = rng(301);
  const heights = [112, 112, 112, 112, 112, 112];
  const overlap = 6;
  const step = 112 - overlap;
  const total = heights.reduce((a, b) => a + b, 0) - overlap * (heights.length - 1);
  const stemX = (h) => 3.5 * Math.sin((2 * Math.PI * h) / step);
  const defs = `<radialGradient id="kf" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#e6d888"/><stop offset="1" stop-color="#7a6a1e"/></radialGradient>`;

  const stipe = [];
  for (let h = -10; h <= total - 60; h += 8) stipe.push([stemX(h), -h]);
  const stipeSvg = `<path d="${smooth(stipe)}" stroke="#3c3810" stroke-width="6.5" fill="none" stroke-linecap="round"/><path d="${smooth(stipe)}" stroke="#86792a" stroke-width="4" fill="none" stroke-linecap="round"/>`;

  const tones = [['#5e5c1c', '#a49a34', '#d2c668'], ['#585e22', '#8f9a36', '#c6cc6a'], ['#665616', '#ae9030', '#dcc060']];
  const blades = [];
  let side = 1;
  for (let hb = 40; hb < total - 150; hb += r.range(34, 46)) {
    blades.push({ hb, side, len: r.range(150, 190), wid: r.range(13, 17), reach: r.range(20, 32), tone: r.pick(tones), ph: r.range(0, 6.28) });
    side = -side;
  }
  // crown blades at the top, streaming up from the end of the stipe
  for (const [s, len, reach] of [[1, 150, 10], [-1, 140, 14], [1, 112, 22]]) {
    blades.push({ hb: total - 160 + (len - 112) * 0.2, side: s, len, wid: 14, reach, tone: tones[1], ph: r.range(0, 6.28), crown: true });
  }

  const svg = blades.map((b, i) => {
    const x0 = stemX(b.hb);
    const y0 = -b.hb;
    const s = b.side;
    const spine = [];
    for (let t = 0; t <= 1.0001; t += 1 / 16) {
      const out = b.reach * Math.sin(Math.min(1, t * 1.8) * Math.PI / 2) + 5 * Math.sin(b.ph + t * 7) * t;
      spine.push([Math.max(-56, Math.min(56, x0 + s * (3 + out))), y0 - 4 - b.len * t]);
    }
    const left = [];
    const right = [];
    for (let j = 0; j < spine.length; j++) {
      const t = j / (spine.length - 1);
      const A = spine[Math.max(0, j - 1)];
      const C = spine[Math.min(spine.length - 1, j + 1)];
      let dx = C[0] - A[0];
      let dy = C[1] - A[1];
      const L = Math.hypot(dx, dy) || 1;
      dx /= L;
      dy /= L;
      const env = Math.min(1, t * 6) * (1 - Math.pow(t, 3));
      const ruffle = 1 + 0.18 * Math.sin(t * 40 + i);
      const w = (b.wid / 2) * env * ruffle + 0.6;
      left.push([spine[j][0] - dy * w, spine[j][1] + dx * w]);
      right.push([spine[j][0] + dy * w, spine[j][1] - dx * w]);
    }
    const tip = spine[spine.length - 1];
    const gid = `kg${i}`;
    const [c0, c1, c2] = b.tone;
    return `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(tip[0])}" y2="${f1(tip[1])}"><stop offset="0" stop-color="${c0}"/><stop offset="0.45" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
<path d="${smooth([...left, ...right.reverse()], true)}" fill="url(#${gid})" fill-opacity="0.93" stroke="#45420f" stroke-width="1.4" stroke-linejoin="round"/>
<path d="${smooth(spine.slice(2, -2))}" stroke="#e6de90" stroke-opacity="0.4" stroke-width="1.2" fill="none"/>
${b.crown ? '' : `<ellipse cx="${f1(x0 + s * 4)}" cy="${f1(y0 - 2)}" rx="4.2" ry="5.6" fill="url(#kf)" stroke="#45420f" stroke-width="1.1"/>`}`;
  });
  const back = svg.filter((_, i) => i % 2 === 1).join('');
  const front = svg.filter((_, i) => i % 2 === 0).join('');
  return { width: 120, heights, overlap, defs, body: back + stipeSvg + front };
}

// ---------- sea grass: a short clump of ribbon blades ----------

function seagrass() {
  const r = rng(77);
  const heights = [84, 84, 84];
  const overlap = 6;
  const total = heights.reduce((a, b) => a + b, 0) - overlap * (heights.length - 1);
  const greens = ['#4f9a56', '#5fab5a', '#78b64e', '#3f8a62', '#6aa848'];
  const blades = [];
  const n = 15;
  for (let i = 0; i < n; i++) {
    const x0 = (i / (n - 1) - 0.5) * 30 + r.range(-3, 3);
    const L = r.range(0.5, 1) * (total - 6) * (1 - Math.abs(x0) / 60);
    const lean = (x0 / 15) * r.range(0.12, 0.3) + r.range(-0.12, 0.12);
    const wave = r.range(4, 9) * (r() < 0.5 ? -1 : 1);
    const w0 = r.range(5.5, 8);
    const pts = [];
    for (let t = 0; t <= 1.0001; t += 1 / 14) {
      let x = x0 + lean * L * Math.pow(t, 1.5) + wave * Math.sin(t * Math.PI * 1.2) * t;
      x = Math.max(-52, Math.min(52, x));
      pts.push([x, 8 - (L + 8) * t]);
    }
    blades.push({ pts, w0, L, c: greens[i % greens.length], i });
  }
  // longest at the back
  blades.sort((a, b) => b.L - a.L);
  const defs = blades
    .map((b) => `<linearGradient id="sg${b.i}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${f1(-b.L)}"><stop offset="0" stop-color="${darken(b.c, 0.3)}"/><stop offset="0.6" stop-color="${b.c}"/><stop offset="1" stop-color="${lighten(b.c, 0.3)}"/></linearGradient>`)
    .join('');
  const body = blades
    .map((b) => {
      const d = taper(b.pts, b.w0, 1.2);
      return `<path d="${d}" fill="url(#sg${b.i})" stroke="${darken(b.c, 0.5)}" stroke-width="1.2" stroke-linejoin="round"/><path d="${smooth(b.pts.slice(1, -2))}" stroke="${lighten(b.c, 0.45)}" stroke-width="1" stroke-opacity="0.55" fill="none"/>`;
    })
    .join('');
  return { width: 110, heights, overlap, defs, body };
}

// ---------- anemone: short fleshy column under a mop of bulb-tipped tentacles ----------

function anemone() {
  const r = rng(909);
  const heights = [60, 60, 84];
  const overlap = 8;
  const discH = 82;
  const colW = (h) => {
    const t = Math.max(0, Math.min(1, h / discH));
    return 46 - 6 * Math.sin(t * Math.PI * 0.8) + 18 * Math.pow(t, 4);
  };
  const left = [];
  const right = [];
  for (let h = -10; h <= discH; h += 6) {
    left.push([-colW(h) / 2, -h]);
    right.push([colW(h) / 2, -h]);
  }
  const column = smooth([...left, ...right.reverse()], true);
  const stripes = [];
  for (let i = -3; i <= 3; i++) {
    const pts = [];
    for (let h = -6; h <= discH - 4; h += 10) pts.push([(i / 3.6) * (colW(h) / 2), -h]);
    stripes.push(`<path d="${smooth(pts)}" stroke="#e8a890" stroke-opacity="0.28" stroke-width="2.2" fill="none"/>`);
  }
  const defs = `<linearGradient id="ac" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5e2420"/><stop offset="0.42" stop-color="#a85040"/><stop offset="1" stop-color="#622822"/></linearGradient>
<radialGradient id="at" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#fbd2e2"/><stop offset="0.6" stop-color="#d9739f"/><stop offset="1" stop-color="#a24a76"/></radialGradient>
<linearGradient id="atb" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#76304e"/><stop offset="1" stop-color="#b05686"/></linearGradient>`;

  // Tentacles spread from the oral disc: upright in the middle, arching out and drooping at the
  // sides so they hang over the top of the column.
  const tent = (layer) => {
    const out = [];
    const n = [22, 24, 12][layer];
    const span = [3.3, 3.0, 1.6][layer];
    for (let i = 0; i < n; i++) {
      const u = (i + r.range(-0.35, 0.35)) / (n - 1);
      const a = -Math.PI / 2 + (u - 0.5) * span;
      const c = Math.cos(a);
      const baseX = c * (layer === 2 ? 16 : 30);
      const baseY = -discH + Math.sin(a) * 5 - (layer === 0 ? 3 : 0);
      const len = r.range(36, 60) * (layer === 2 ? 0.85 : 1) * (1 - 0.25 * Math.abs(Math.cos(a)) * r());
      const droop = Math.sign(c) * Math.abs(c) * r.range(0.15, 0.75) + r.range(-0.2, 0.2);
      let pts = [];
      for (let t = 0; t <= 1.0001; t += 0.2) {
        const aa = a + droop * t;
        const x = baseX + Math.cos(a) * len * t * 0.6 + Math.cos(aa) * len * t * 0.4;
        const y = baseY + Math.sin(a) * len * t * 0.6 + Math.sin(aa) * len * t * 0.4;
        pts.push([x, y]);
      }
      // shorten (rather than clip) tentacles that would leave the 120-px canvas
      const reach = Math.max(...pts.map(([x]) => Math.abs(x)));
      const limit = r.range(36, 53);
      if (reach > limit) {
        const k = (limit - Math.abs(baseX)) / (reach - Math.abs(baseX));
        pts = pts.map(([x, y]) => [baseX + (x - baseX) * k, baseY + (y - baseY) * k]);
      }
      const tip = pts[pts.length - 1];
      const back = layer === 0;
      out.push(`<path d="${taper(pts, 8, 5.6)}" fill="${back ? 'url(#atb)' : 'url(#at)'}" stroke="#6a2848" stroke-width="1.1"/>`);
      out.push(`<circle cx="${f1(tip[0])}" cy="${f1(tip[1])}" r="${f1(back ? 4.4 : 5.2)}" fill="${back ? '#c4709a' : '#f6c6da'}" stroke="#6a2848" stroke-width="1"/>`);
      if (!back) out.push(`<circle cx="${f1(tip[0] - 1.6)}" cy="${f1(tip[1] - 1.8)}" r="1.5" fill="#ffffff" fill-opacity="0.7"/>`);
    }
    return out.join('');
  };
  const body =
    tent(0) +
    `<path d="${column}" fill="url(#ac)" stroke="#4a1c14" stroke-width="1.6"/>${stripes.join('')}` +
    `<ellipse cx="0" cy="${-discH + 1}" rx="32" ry="6" fill="#8a3442"/>` +
    tent(1) +
    tent(2);
  return { width: 120, heights, overlap, defs, body };
}

// ---------- soft coral tree: pale translucent trunk branching into a crown of polyp clusters ----------

function softcoral() {
  const r = rng(4242);
  const heights = [80, 80, 80, 80];
  const overlap = 6;
  const total = heights.reduce((a, b) => a + b, 0) - overlap * (heights.length - 1);
  const limbs = [];
  const clusters = [];
  // trunk, then three main branches into a rounded crown
  const trunkTop = [0, -112];
  limbs.push({ d: `M0,8C1,-40 -2,-80 0,-112`, w: 13 });
  const mains = [
    [[-6, -150], [-24, -196], [-28, -246]],
    [[2, -160], [4, -214], [0, -276]],
    [[8, -146], [24, -188], [30, -238]],
  ];
  const mainPts = [];
  for (const m of mains) {
    limbs.push({ d: `M${trunkTop[0]},${trunkTop[1]}C${m[0][0]},${m[0][1]} ${m[1][0]},${m[1][1]} ${m[2][0]},${m[2][1]}`, w: 7.5 });
    for (let t = 0.25; t <= 1.001; t += 0.25) {
      const u = 1 - t;
      const P = [trunkTop, ...m];
      const x = u ** 3 * P[0][0] + 3 * u * u * t * P[1][0] + 3 * u * t * t * P[2][0] + t ** 3 * P[3][0];
      const y = u ** 3 * P[0][1] + 3 * u * u * t * P[1][1] + 3 * u * t * t * P[2][1] + t ** 3 * P[3][1];
      mainPts.push([x, y]);
    }
  }
  // clusters fill an elliptical crown; each gets a twig from the nearest point on a main branch
  const cx0 = 0;
  const cy0 = -210;
  let tries = 0;
  while (clusters.length < 19 && tries++ < 3000) {
    const a = r.range(0, Math.PI * 2);
    const d = Math.sqrt(r());
    const x = cx0 + Math.cos(a) * d * 38;
    const y = cy0 + Math.sin(a) * d * 76;
    const sz = r.range(8.5, 12) * (1 - (y - cy0) / 400);
    if (clusters.some(([px, py, ps]) => Math.hypot(px - x, (py - y) * 0.9) < (ps + sz) * 0.9)) continue;
    clusters.push([Math.max(-46 + sz, Math.min(46 - sz, x)), Math.max(-total + sz + 6, y), sz]);
  }
  for (const [x, y] of clusters) {
    let best = mainPts[0];
    for (const p of mainPts) if (Math.hypot(p[0] - x, p[1] - y) < Math.hypot(best[0] - x, best[1] - y)) best = p;
    limbs.push({ d: `M${f1(best[0])},${f1(best[1])}Q${f1((best[0] + x) / 2)},${f1(Math.max(best[1], y) + 4)} ${f1(x)},${f1(y)}`, w: 3.6 });
  }
  const defs = `<radialGradient id="cp" cx="0.38" cy="0.3" r="0.75"><stop offset="0" stop-color="#ffd2a8"/><stop offset="0.5" stop-color="#ec6438"/><stop offset="1" stop-color="#a02c1a"/></radialGradient>`;
  const clusterSvg = clusters
    .sort((a, b) => a[1] - b[1])
    .map(([cx, cy, s]) => {
      const balls = [];
      const n = Math.round(s * 1.5);
      for (let i = 0; i < n; i++) {
        const a = r.range(0, Math.PI * 2);
        const d = Math.sqrt(r()) * s * 0.78;
        balls.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.85, r.range(3.2, 4.8)]);
      }
      balls.sort((a, b) => a[1] - b[1]);
      return `<ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(s * 0.92)}" ry="${f1(s * 0.8)}" fill="#842818"/>` +
        balls.map(([x, y, rr]) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(rr)}" fill="url(#cp)" stroke="#742010" stroke-width="0.8"/><circle cx="${f1(x - rr * 0.3)}" cy="${f1(y - rr * 0.35)}" r="0.9" fill="#fff4e0" fill-opacity="0.8"/>`).join('');
    })
    .join('');
  const body =
    `<g fill="none" stroke-linecap="round">${limbs.map((l) => `<path d="${l.d}" stroke="#a8808a" stroke-width="${f1(l.w + 2.2)}"/>`).join('')}` +
    `${limbs.map((l) => `<path d="${l.d}" stroke="#e8ccd2" stroke-width="${f1(l.w)}"/>`).join('')}` +
    `${limbs.map((l) => `<path d="${l.d}" stroke="#c89aa6" stroke-opacity="0.5" stroke-width="${f1(Math.max(1, l.w * 0.18))}" transform="translate(${f1(l.w * 0.18)},0)"/>`).join('')}</g>` +
    clusterSvg;
  return { width: 100, heights, overlap, defs, body };
}

const PLANTS = { kelp, seagrass, anemone, softcoral };
