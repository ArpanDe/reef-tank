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

// ---------- sea whip: a purple gorgonian of tall, slender, polyp-fuzzed rods ----------

function seawhip() {
  const r = rng(515);
  const heights = [110, 110, 110, 110, 110, 110];
  const overlap = 6;
  const step = 110 - overlap;
  const total = heights.reduce((a, b) => a + b, 0) - overlap * (heights.length - 1);
  const stemX = (h) => 3 * Math.sin((2 * Math.PI * h) / step);
  const rods = [];
  // short trunk, then whips fanning gently up from it; the tallest stays near the centre line
  const fork = 70;
  rods.push({ pts: Array.from({ length: 9 }, (_, i) => [stemX((fork + 10) * (i / 8) - 10), -((fork + 10) * (i / 8) - 10)]), w0: 13, w1: 11 });
  const whips = [
    { lean: 0, len: total - fork - 16, wob: 5 },
    { lean: -30, len: total - fork - 120, wob: 7 },
    { lean: 34, len: total - fork - 80, wob: 6 },
    { lean: -46, len: total - fork - 260, wob: 6 },
    { lean: 48, len: total - fork - 230, wob: 7 },
  ];
  for (const wp of whips) {
    const ph = r.range(0, 6.28);
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const hgt = fork + wp.len * t;
      const x = (wp.lean === 0 ? stemX(hgt) : stemX(fork)) + wp.lean * Math.pow(t, 0.7) + wp.wob * Math.sin(ph + t * 5) * t;
      pts.push([Math.max(-48, Math.min(48, x)), -hgt]);
    }
    rods.push({ pts, w0: 10, w1: 4.6 });
    // an occasional side branch
    if (wp.lean !== 0 && r() < 0.8) {
      const j = r.int(8, 14);
      const [bx, by] = pts[j];
      const dir = Math.sign(wp.lean) || 1;
      const bl = r.range(60, 110);
      const bp = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        bp.push([Math.max(-50, Math.min(50, bx + dir * 14 * Math.pow(t, 0.8))), by - bl * t]);
      }
      rods.push({ pts: bp, w0: 7, w1: 4 });
    }
  }
  const defs = `<linearGradient id="sw" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5a1a7a"/><stop offset="0.45" stop-color="#a03ac8"/><stop offset="1" stop-color="#6a2090"/></linearGradient>`;
  const body = [];
  for (const rd of rods) body.push(`<path d="${taper(rd.pts, rd.w0, rd.w1)}" fill="url(#sw)" stroke="#2e0a40" stroke-width="1.3" stroke-linejoin="round"/>`);
  // fuzzy polyps along every rod
  for (const rd of rods) {
    for (let i = 1; i < rd.pts.length; i++) {
      const [x, y] = rd.pts[i];
      for (let k = 0; k < 3; k++) {
        const side = r.sign();
        const wdt = rd.w0 + (rd.w1 - rd.w0) * (i / (rd.pts.length - 1));
        body.push(`<circle cx="${f1(x + side * r.range(0.2, 0.55) * wdt)}" cy="${f1(y + r.range(-3, 3))}" r="${f1(r.range(0.9, 1.6))}" fill="${r() < 0.6 ? '#f0b0ff' : '#ffe0ff'}" fill-opacity="0.85"/>`);
      }
    }
    if (rd === rods[0]) continue; // the trunk ends inside the fork
    const tip = rd.pts[rd.pts.length - 1];
    body.push(`<circle cx="${f1(tip[0])}" cy="${f1(tip[1])}" r="${f1(rd.w1 * 0.55)}" fill="#e090ff"/>`);
  }
  return { width: 110, heights, overlap, defs, body: body.join('') };
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

const ANEMONE_PINK = {
  col: ['#5e2420', '#a85040', '#622822'], tip: ['#fbd2e2', '#d9739f', '#a24a76'], back: ['#76304e', '#b05686'],
  line: '#6a2848', bulb: ['#c4709a', '#f6c6da'], disc: '#8a3442', colLine: '#4a1c14', stripe: '#e8a890',
};
const ANEMONE_GREEN = {
  col: ['#1e5a2a', '#3aa04a', '#1e5a2a'], tip: ['#f8d8ff', '#c070e0', '#7a3aa8'], back: ['#2a6a3a', '#7ab84a'],
  line: '#2a2050', bulb: ['#a060c8', '#f0c8ff'], disc: '#2a6a3a', colLine: '#123a18', stripe: '#a8e8a0',
};

function anemone(seed = 909, C = ANEMONE_PINK) {
  const r = rng(seed);
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
    stripes.push(`<path d="${smooth(pts)}" stroke="${C.stripe}" stroke-opacity="0.28" stroke-width="2.2" fill="none"/>`);
  }
  const defs = `<linearGradient id="ac" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.col[0]}"/><stop offset="0.42" stop-color="${C.col[1]}"/><stop offset="1" stop-color="${C.col[2]}"/></linearGradient>
<radialGradient id="at" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="${C.tip[0]}"/><stop offset="0.6" stop-color="${C.tip[1]}"/><stop offset="1" stop-color="${C.tip[2]}"/></radialGradient>
<linearGradient id="atb" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${C.back[0]}"/><stop offset="1" stop-color="${C.back[1]}"/></linearGradient>`;

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
      out.push(`<path d="${taper(pts, 8, 5.6)}" fill="${back ? 'url(#atb)' : 'url(#at)'}" stroke="${C.line}" stroke-width="1.1"/>`);
      out.push(`<circle cx="${f1(tip[0])}" cy="${f1(tip[1])}" r="${f1(back ? 4.4 : 5.2)}" fill="${back ? C.bulb[0] : C.bulb[1]}" stroke="${C.line}" stroke-width="1"/>`);
      if (!back) out.push(`<circle cx="${f1(tip[0] - 1.6)}" cy="${f1(tip[1] - 1.8)}" r="1.5" fill="#ffffff" fill-opacity="0.7"/>`);
    }
    return out.join('');
  };
  const body =
    tent(0) +
    `<path d="${column}" fill="url(#ac)" stroke="${C.colLine}" stroke-width="1.6"/>${stripes.join('')}` +
    `<ellipse cx="0" cy="${-discH + 1}" rx="32" ry="6" fill="${C.disc}"/>` +
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

const PLANTS = { seawhip, seagrass, anemone, anemonegreen: () => anemone(1313, ANEMONE_GREEN), softcoral };
