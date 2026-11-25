// Foreground reef: the nearest backdrop layer, a massive wall of big coral formations filling the
// bottom of the screen. Fully opaque from the bottom up to at least 280 px; the crown rises in big
// formations to ~360-430 px with dips no lower than ~290 px. Inside the wall: live rock covered in
// colonies, dark cave mouths, table-coral overhangs, giant brain and boulder heads, tall thickets,
// fans, barrel sponges, anemone beds and clams, with small life filling every gap. The bottom 90 px
// is the front ledge the critters walk on (sand, colourful rubble, low carpets, nothing over ~20 px).
// The most saturated and detailed layer after the fish. Tiles seamlessly over TILE px.
import { rng, pnoise, wrapX, smooth, blob, taper, mix, lighten, darken, f1, TILE } from './_lib.mjs';
import * as K from './_corals.mjs';
import { piece, PAL } from './reef.svg.mjs';

const W = TILE;
const H = 430;
const STEP = 18; // divides TILE
const LEDGE = H - 90; // top of the critters' ledge
const INK = K.INK;

const pickW = (r, table) => {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let u = r() * total;
  for (const [k, w] of table) if ((u -= w) <= 0) return k;
  return table[0][0];
};

// ---------- big pieces ----------

// A cave mouth: dark, opaque, shaded toward the back, with a lit lip.
function cave(r, x, y, rx, ry) {
  const d = blob(r, x, y, rx, ry, { n: 12, jitter: 0.2 });
  const g = K.id('cv');
  return `<radialGradient id="${g}" cx="0.5" cy="0.62" r="0.62"><stop offset="0" stop-color="#05060e"/><stop offset="0.7" stop-color="#120c22"/><stop offset="1" stop-color="#2a1a3a"/></radialGradient>
<path d="${d}" fill="url(#${g})" stroke="#0a0814" stroke-width="2"/>
<path d="${d}" fill="none" stroke="#ffe8c0" stroke-opacity="0.18" stroke-width="3" transform="translate(0,-3)"/>`;
}

// Table corals in tiers, each casting a dark overhang shadow on what's below.
function tableStack(r, x, top, w) {
  const out = [];
  const tiers = r.int(2, 3);
  for (let i = tiers - 1; i >= 0; i--) {
    const tw = w * (1 - i * 0.22) * r.range(0.9, 1.05);
    const ty = top + i * w * 0.16 + tw * 0.1;
    const cx = x + r.range(-0.12, 0.12) * w;
    const c = r.pick(PAL.table);
    out.push(`<ellipse cx="${f1(cx)}" cy="${f1(ty + tw * 0.12)}" rx="${f1(tw * 0.5)}" ry="${f1(tw * 0.09)}" fill="#0a0814" fill-opacity="0.55"/>`);
    out.push(K.table(r, cx, ty + tw * 0.28, tw, tw * 0.38, c));
  }
  return out.join('');
}

function thicket(r, x, base, hgt) {
  const out = [];
  const n = r.int(2, 3);
  const [c, t] = r.pick(PAL.acro);
  for (let i = 0; i < n; i++) {
    const len = (hgt / 2.6) * r.range(0.85, 1.05);
    out.push(K.branching(r, x + (i - (n - 1) / 2) * hgt * 0.32, base + r.range(-6, 6), { color: c, tip: t, len, width: Math.max(10, len * 0.22), depth: 3, spread: r.range(0.45, 0.6), colonies: 1 }));
  }
  return out.join('');
}

function megaBrain(r, x, base, w) {
  const out = [];
  const [c, g] = r.pick(PAL.brain);
  out.push(K.boulderCoral(r, x - w * 0.42, base + 6, w * 0.55, w * 0.3, r.pick(['#d4a050', '#a070c8', '#70b070', '#e07a6a'])));
  out.push(K.brain(r, x + w * 0.4, base + 8, w * 0.5, w * 0.26, ...r.pick(PAL.brain)));
  out.push(K.brain(r, x, base, w, w * 0.5, c, g));
  // life growing on top so the head never stands bare
  const [c2, t2] = r.pick(PAL.acro);
  out.push(K.branching(r, x - w * 0.18, base - w * 0.42, { color: c2, tip: t2, len: w * 0.12, width: w * 0.035, depth: 2, colonies: 2 }));
  out.push(K.xmasWorms(r, x + w * 0.12, base - w * 0.47, r.pick(PAL.worm)));
  out.push(K.xmasWorms(r, x + w * 0.25, base - w * 0.4, r.pick(PAL.worm)));
  out.push(K.carpet(r, x + w * 0.3, base - w * 0.12, w * 0.3, 'zoa', r.pick(PAL.carpet)));
  return out.join('');
}

function barrels(r, x, base, w) {
  const out = [];
  const c = r.pick(PAL.barrel);
  out.push(K.barrel(r, x - w * 0.55, base + 10, w * 0.7, w * 0.8, mix(c, '#c86a20', 0.3)));
  out.push(K.barrel(r, x + w * 0.1, base, w, w * r.range(1.05, 1.25), c));
  out.push(K.sponges(r, x + w * 0.85, base + 8, r.pick(PAL.tube), 3));
  return out.join('');
}

function anemoneBed(r, x, base, w) {
  const out = [];
  const [b, t] = r.pick(PAL.anemone);
  const n = r.int(3, 4);
  for (let i = 0; i < n; i++) out.push({ y: base + r.range(-8, 10), s: K.anemone(r, x + (i - (n - 1) / 2) * w * 0.62, 0, w * r.range(0.85, 1.1), b, t) });
  out.sort((a, b2) => a.y - b2.y);
  return out.map((o) => `<g transform="translate(0,${f1(o.y)})">${o.s}</g>`).join('');
}

function clamRock(r, x, base, w) {
  const out = [K.liveRock(r, x, base - w * 0.12, w * 0.95, w * 0.32)];
  out.push(K.clam(r, x - w * 0.35, base - w * 0.3, w * 0.75, r.pick(PAL.clam)));
  out.push(K.clam(r, x + w * 0.4, base - w * 0.22, w * 0.6, r.pick(PAL.clam)));
  out.push(K.carpet(r, x, base - w * 0.06, w * 0.8, r.pick(['zoa', 'mush']), r.pick(PAL.carpet)));
  return out.join('');
}

function fanGroup(r, x, base, hgt) {
  const out = [];
  out.push(K.fan(r, x - hgt * 0.3, base + 10, hgt * 0.75, hgt * 0.8, r.pick(PAL.fan)));
  out.push(K.fan(r, x + hgt * 0.15, base + 4, hgt, hgt, r.pick(PAL.fan)));
  out.push(K.softTree(r, x + hgt * 0.55, base + 8, hgt * 0.5, r.pick(PAL.soft)));
  return out.join('');
}

function softGarden(r, x, base, hgt) {
  const out = [];
  out.push(K.fingers(r, x - hgt * 0.45, base + 6, { color: r.pick(PAL.leather), n: 7, h: hgt * 0.6, w: hgt * 0.1 }));
  out.push(K.softTree(r, x, base, hgt, r.pick(PAL.soft)));
  out.push(K.toadstool(r, x + hgt * 0.55, base + 8, hgt * 0.55, r.pick(PAL.leather)));
  return out.join('');
}

// ---------- the ledge ----------

function rubble(r, x, y) {
  const c = r.pick(['#dca088', '#e0b07c', '#c898a8', '#d8bc98', '#b8c094', '#e0a890']);
  if (r() < 0.55) {
    const len = r.range(9, 20);
    const a = r.range(-0.25, 0.25) + (r() < 0.5 ? Math.PI : 0);
    const pts = [[x, y], [x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5], [x + Math.cos(a) * len, y + Math.sin(a) * len]];
    return `<path d="${taper(pts, 5, 4)}" fill="#3a2010" fill-opacity="0.3" transform="translate(1,2.5)"/><path d="${taper(pts, 5, 4)}" fill="${c}" stroke="${mix(c, INK, 0.5)}" stroke-width="0.9"/><circle cx="${f1(x + Math.cos(a) * len * 0.4)}" cy="${f1(y - 0.8)}" r="0.9" fill="${lighten(c, 0.5)}"/>`;
  }
  const s = r.range(3, 7);
  return `<ellipse cx="${f1(x + 1)}" cy="${f1(y + s * 0.45)}" rx="${f1(s * 1.05)}" ry="${f1(s * 0.3)}" fill="#3a2010" fill-opacity="0.3"/><path d="${blob(r, x, y, s, s * 0.65, { n: 8, jitter: 0.15 })}" fill="${c}" stroke="${mix(c, INK, 0.5)}" stroke-width="0.9"/>`;
}

export default function floor() {
  const r = rng(6060);
  const nb = pnoise(61, 17);
  const nb2 = pnoise(62, 53);
  const nc = pnoise(63, 11);
  const nc2 = pnoise(64, 31);
  const nl = pnoise(65, 41);
  // top of the solid base mass: heights 295..320 (local y 110..135) so it's opaque well above 280 px
  const baseTop = (x) => 122 + 10 * nb(x) + 4 * nb2(x);
  // target crown height for the big formations: dips ~300, peaks ~425
  const crown = (x) => {
    const c = Math.max(0, Math.min(1, 0.55 + 0.6 * nc(x) + 0.2 * nc2(x)));
    return 300 + 125 * Math.pow(c, 1.2);
  };
  const ledgeTop = (x) => LEDGE + 5 * nl(x);

  // ---- base mass (opaque) ----
  const edge = [];
  for (let x = -3 * STEP; x <= W + 3 * STEP; x += STEP) edge.push([x, baseTop(x)]);
  const mass = `${smooth(edge)}L${W + 3 * STEP},${H + 5}L${-3 * STEP},${H + 5}Z`;
  const out = [`<path d="${mass}" fill="url(#wallG)"/>`];

  // ---- the wall face: rows of live rock, then caves between them ----
  const face = [];
  for (const [y0, y1, step, size] of [[150, 220, [70, 120], [70, 120]], [215, 290, [80, 130], [80, 140]], [280, 350, [90, 140], [90, 150]]]) {
    for (let x = r.range(0, 60); x < W; x += r.range(...step)) {
      const rx = r.range(...size);
      const ry = rx * r.range(0.42, 0.6);
      const y = Math.max(baseTop(x) + ry * 0.7, r.range(y0, y1));
      face.push({ y, svg: wrapX(K.liveRock(r, x, y, rx, ry), x - rx * 1.3, x + rx * 1.3) });
    }
  }
  face.sort((a, b) => a.y - b.y);
  out.push(face.map((f) => f.svg).join(''));
  for (let x = r.range(60, 200); x < W; x += r.range(180, 340)) {
    const rx = r.range(40, 85);
    const y = r.range(200, 300);
    out.push(wrapX(cave(r, x, y, rx, rx * r.range(0.4, 0.58)), x - rx * 1.3, x + rx * 1.3));
  }

  // ---- big formations, sized so their tops follow the crown ----
  const BIG = [['megaBrain', 2.2], ['tableStack', 2], ['thicket', 2.4], ['fanGroup', 1.4], ['barrels', 1.3], ['anemoneBed', 1.6], ['clamRock', 1.3], ['softGarden', 1.4]];
  const forms = [];
  let x = r.range(0, 80);
  while (x < W) {
    const kind = pickW(r, BIG);
    const top = H - crown(x) + r.range(-8, 8);
    let base = r.range(Math.max(baseTop(x) + 70, top + 110), LEDGE - 30);
    let hgt = base - top;
    let svg = '';
    let half = 160;
    if (kind === 'megaBrain') {
      const w = Math.max(120, Math.min(260, hgt * 1.9));
      base = top + w * 0.52;
      svg = megaBrain(r, x, base, w);
      half = w * 0.95;
    } else if (kind === 'tableStack') {
      const w = r.range(200, 340);
      svg = tableStack(r, x, top, w);
      half = w * 0.65;
      base = top + w * 0.45;
    } else if (kind === 'thicket') {
      hgt = Math.max(150, Math.min(250, hgt));
      base = top + hgt;
      svg = thicket(r, x, base, hgt);
      half = hgt;
    } else if (kind === 'fanGroup') {
      hgt = Math.max(150, Math.min(240, hgt));
      base = top + hgt;
      svg = fanGroup(r, x, base, hgt);
      half = hgt;
    } else if (kind === 'barrels') {
      const w = Math.max(80, Math.min(140, hgt / 1.15));
      base = top + w * 1.15;
      svg = barrels(r, x, base, w);
      half = w * 1.5;
    } else if (kind === 'anemoneBed') {
      const w = r.range(100, 140);
      base = Math.min(LEDGE - 20, top + w * 0.55);
      svg = anemoneBed(r, x, base, w);
      half = w * 1.6;
    } else if (kind === 'clamRock') {
      const w = r.range(110, 150);
      base = Math.min(LEDGE - 20, top + w * 0.5);
      svg = clamRock(r, x, base, w);
      half = w * 1.1;
    } else {
      hgt = Math.max(130, Math.min(200, hgt));
      base = top + hgt;
      svg = softGarden(r, x, base, hgt);
      half = hgt;
    }
    forms.push({ y: base, svg: wrapX(svg, x - half, x + half) });
    x += r.range(115, 190);
  }

  // ---- smaller life filling every gap on the face ----
  const SMALL = [['acro', 2], ['carpet', 2.5], ['anemone', 1.5], ['clam', 1], ['worms', 1.2], ['bubble', 1], ['urchin', 0.5], ['tube', 1], ['soft', 1], ['fingers', 0.8], ['leather', 0.8]];
  for (let i = 0; i < 115; i++) {
    const sx = r.range(0, W);
    const y = r.range(baseTop(sx) + 20, LEDGE - 6);
    const [svg, half] = piece(r, pickW(r, SMALL), sx, y, r.range(0.75, 1.05));
    forms.push({ y, svg: wrapX(svg, sx - half, sx + half) });
  }
  forms.sort((a, b) => a.y - b.y);
  out.push(forms.map((f) => f.svg).join(''));

  // ---- front ledge: sand, colourful rubble, low carpets ----
  const le = [];
  for (let lx = -3 * STEP; lx <= W + 3 * STEP; lx += STEP) le.push([lx, ledgeTop(lx)]);
  const ledge = `${smooth(le)}L${W + 3 * STEP},${H + 5}L${-3 * STEP},${H + 5}Z`;
  out.push(`<path d="${ledge}" fill="#0a0814" fill-opacity="0.45" transform="translate(0,-6)"/><path d="${ledge}" fill="url(#ledgeG)"/>`);
  const lt = [];
  for (let i = 0; i < 2600; i++) {
    const gx = r.range(0, W);
    const gy = r.range(ledgeTop(gx) + 2, H);
    const rr = r.range(0.5, 1.3);
    lt.push(wrapX(`<circle cx="${f1(gx)}" cy="${f1(gy)}" r="${f1(rr)}" fill="${r.pick(['#fff8e4', '#fff0c8', '#a8844a', '#c89a5a', '#e8a0a0'])}" fill-opacity="${f1(r.range(0.3, 0.6))}"/>`, gx - rr, gx + rr));
  }
  for (let row = 0; row < 4; row++) {
    let rx0 = r.range(0, 60);
    while (rx0 < W) {
      const len = r.range(70, 170);
      const pts = [];
      for (let t = 0; t <= len; t += 14) pts.push([rx0 + t, ledgeTop(rx0 + t) + 16 + row * 18 + Math.sin((rx0 + t) / 23 + row) * 2]);
      if (pts.length > 2) lt.push(wrapX(`<path d="${smooth(pts)}" stroke="#a8844a" stroke-opacity="0.22" stroke-width="2" fill="none" stroke-linecap="round"/>`, rx0 - 2, rx0 + len + 2));
      rx0 += len + r.range(30, 80);
    }
  }
  out.push(`<g clip-path="url(#ledgeClip)">${lt.join('')}</g>`);
  const low = [];
  for (let i = 0; i < 170; i++) {
    const gx = r.range(0, W);
    const gy = r.range(ledgeTop(gx) + 4, H - 6);
    low.push({ y: gy, svg: wrapX(rubble(r, gx, gy), gx - 22, gx + 22) });
  }
  for (let gx = r.range(0, 40); gx < W; gx += r.range(60, 120)) {
    const gy = r.range(ledgeTop(gx) + 10, H - 14);
    const k = r();
    let svg;
    if (k < 0.6) svg = K.carpet(r, gx, gy, r.range(36, 80), r.pick(['zoa', 'gsp', 'mush', 'polyp', 'zoa']), r.pick(PAL.carpet));
    else if (k < 0.85) svg = K.mushroom(r, gx, gy, r.range(20, 30), r.pick(['#f0a050', '#7ad06a', '#e870a8', '#50c0d0']));
    else svg = K.xmasWorms(r, gx, gy, r.pick(PAL.worm));
    low.push({ y: gy, svg: wrapX(svg, gx - 46, gx + 46) });
  }
  low.sort((a, b) => a.y - b.y);
  out.push(low.map((l) => l.svg).join(''));

  const defs = `${K.coverDefs()}
<linearGradient id="wallG" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${H}"><stop offset="0.25" stop-color="#3a2448"/><stop offset="0.7" stop-color="#1e1430"/><stop offset="1" stop-color="#120c1e"/></linearGradient>
<linearGradient id="ledgeG" gradientUnits="userSpaceOnUse" x1="0" y1="${LEDGE - 10}" x2="0" y2="${H}"><stop offset="0" stop-color="#e2cc96"/><stop offset="1" stop-color="#cbae76"/></linearGradient>
<clipPath id="ledgeClip"><path d="${ledge}"/></clipPath>
${K.hazeFilter('flTint', 1.08, 0.02, '#2a88b8', W, H)}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs><g filter="url(#flTint)">${out.join('')}</g></svg>`;
}
