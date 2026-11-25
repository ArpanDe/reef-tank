// Reef floor: the nearest backdrop strip, a living rubble bed rather than sand. The upper part has an
// irregular edge with low coral heads, sponges and tube worms poking up; the bottom ~45% is a low,
// level bed of rubble, encrusting coral and small sand pockets for the critters to walk on.
// Same reef as reef.svg.mjs but nearer: a bit more saturated and more detailed.
// Tiles seamlessly over TILE px: the top edge uses periodic noise and every feature wraps.
import { rng, pnoise, wrapX, smooth, blob, taper, mix, lighten, darken, f1, TILE } from './_lib.mjs';
import { brain, sponges, fingers, zoanthids, urchin, bubbleCoral, hazeFilter } from './reef.svg.mjs';

const W = TILE;
const H = 260;
const STEP = 18; // divides TILE
const WALK = Math.round(H * 0.55); // top of the walking bed (bottom 45%)
const INK = '#1a1428';

let uid = 0;
const id = (p) => `fl${p}${uid++}`;
const edgeOf = (c) => mix(c, INK, 0.6);

// ---------- small pieces ----------

// mostly bleached coral, some crusted with pink coralline algae or green turf
const RUBBLE = ['#ece2d2', '#e2d6c4', '#d6c8b4', '#cbbca8', '#e6dccc', '#d8a8b8', '#c8a0b0', '#b8b49a'];

// A broken branch of dead coral: a knobbly stick with a stub or two, lying at angle `ang`.
function stick(r, x, y, len, ang, w, color) {
  const pts = [];
  for (let t = 0; t <= 1.001; t += 0.25) pts.push([x + Math.cos(ang) * len * t + r.range(-1, 1), y + Math.sin(ang) * len * t + r.range(-0.8, 0.8)]);
  const d = taper(pts, w, w * 0.8);
  const stubs = [];
  if (r() < 0.6) {
    const t = r.range(0.3, 0.7);
    const sx = x + Math.cos(ang) * len * t;
    const sy = y + Math.sin(ang) * len * t;
    const a2 = ang + r.sign() * r.range(0.6, 1.1);
    const l2 = len * r.range(0.25, 0.45);
    stubs.push(taper([[sx, sy], [sx + Math.cos(a2) * l2, sy + Math.sin(a2) * l2]], w * 0.8, w * 0.65));
  }
  const all = [d, ...stubs];
  const shade = `<g transform="translate(1.5,${f1(w * 0.45)})">${all.map((p) => `<path d="${p}" fill="${INK}" fill-opacity="0.35"/>`).join('')}</g>`;
  const body = all.map((p) => `<path d="${p}" fill="${color}" stroke="${edgeOf(color)}" stroke-width="1"/>`).join('');
  const pores = [];
  for (let i = 0; i < Math.round(len / 5); i++) {
    const t = r();
    pores.push(`<circle cx="${f1(x + Math.cos(ang) * len * t)}" cy="${f1(y + Math.sin(ang) * len * t + r.range(-w * 0.2, w * 0.2))}" r="${f1(r.range(0.6, 1.1))}" fill="${darken(color, 0.35)}" fill-opacity="0.6"/>`);
  }
  const hl = `<path d="M${f1(x)},${f1(y - w * 0.22)}L${f1(x + Math.cos(ang) * len * 0.8)},${f1(y + Math.sin(ang) * len * 0.8 - w * 0.22)}" stroke="#ffffff" stroke-opacity="0.35" stroke-width="${f1(Math.max(0.8, w * 0.22))}" stroke-linecap="round"/>`;
  return shade + body + pores.join('') + hl;
}

// A rounded chunk of rubble with pores and a lit top.
function cobble(r, x, y, s, color) {
  const d = blob(r, x, y, s, s * r.range(0.55, 0.75), { n: 9, jitter: 0.18 });
  const g = id('cg');
  const pores = [];
  for (let i = 0; i < Math.round(s * 0.8); i++) pores.push(`<circle cx="${f1(x + r.range(-0.7, 0.7) * s)}" cy="${f1(y + r.range(-0.4, 0.3) * s)}" r="${f1(r.range(0.5, 1.1))}" fill="${darken(color, 0.4)}" fill-opacity="0.55"/>`);
  return `<radialGradient id="${g}" cx="0.4" cy="0.25" r="0.85"><stop offset="0" stop-color="${lighten(color, 0.35)}"/><stop offset="0.55" stop-color="${color}"/><stop offset="1" stop-color="${mix(color, INK, 0.5)}"/></radialGradient>
<ellipse cx="${f1(x + 1.5)}" cy="${f1(y + s * 0.5)}" rx="${f1(s * 1.05)}" ry="${f1(s * 0.3)}" fill="${INK}" fill-opacity="0.3"/>
<path d="${d}" fill="url(#${g})" stroke="${edgeOf(color)}" stroke-width="0.9"/>${pores.join('')}`;
}

// Flat, lobed encrusting coral with polyp dots.
function encrust(r, x, y, rx, ry, color, dot) {
  const d = blob(r, x, y, rx, ry, { n: 13, jitter: 0.25 });
  const c = id('ec');
  const dots = [];
  for (let i = 0; i < Math.round((rx * ry) / 14); i++) {
    dots.push(`<circle cx="${f1(x + r.range(-1, 1) * rx)}" cy="${f1(y + r.range(-1, 1) * ry)}" r="${f1(r.range(0.9, 1.6))}" fill="${dot}" fill-opacity="0.85"/>`);
  }
  return `<clipPath id="${c}"><path d="${d}"/></clipPath><path d="${d}" fill="${color}" stroke="${edgeOf(color)}" stroke-width="1.1"/><g clip-path="url(#${c})"><ellipse cx="${f1(x)}" cy="${f1(y - ry * 0.4)}" rx="${f1(rx * 0.8)}" ry="${f1(ry * 0.45)}" fill="#ffffff" fill-opacity="0.15"/>${dots.join('')}</g>`;
}

// A small pocket of sand between the rubble.
function sandPocket(r, x, y, rx, ry) {
  const d = blob(r, x, y, rx, ry, { n: 12, jitter: 0.2 });
  const c = id('sp');
  const g = id('sg');
  const grains = [];
  for (let i = 0; i < Math.round((rx * ry) / 4); i++) {
    grains.push(`<circle cx="${f1(x + r.range(-1, 1) * rx)}" cy="${f1(y + r.range(-1, 1) * ry)}" r="${f1(r.range(0.5, 1.1))}" fill="${r() < 0.5 ? '#fff8e8' : '#7a6a54'}" fill-opacity="${f1(r.range(0.3, 0.6))}"/>`);
  }
  return `<radialGradient id="${g}" cx="0.5" cy="0.6" r="0.6"><stop offset="0" stop-color="#d8ccae"/><stop offset="0.75" stop-color="#c4b698"/><stop offset="1" stop-color="#a89880"/></radialGradient>
<clipPath id="${c}"><path d="${d}"/></clipPath><path d="${d}" fill="url(#${g})"/><g clip-path="url(#${c})"><ellipse cx="${f1(x)}" cy="${f1(y - ry * 0.7)}" rx="${f1(rx * 1.1)}" ry="${f1(ry * 0.6)}" fill="#5a4a40" fill-opacity="0.25"/>${grains.join('')}</g>`;
}

// Massive boulder coral (porites-like): a lumpy dome covered in fine pores.
function boulderCoral(r, x, y, w, h, color) {
  const pts = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + (i / n) * Math.PI;
    const k = 1 + r.range(-0.08, 0.08) + 0.06 * Math.sin(i * 2.1);
    pts.push([x + Math.cos(a) * (w / 2) * k, y + Math.sin(a) * h * k]);
  }
  const d = smooth([[x - w / 2, y + 4], ...pts, [x + w / 2, y + 4]], true);
  const c = id('bk');
  const g = id('bg');
  const pores = [];
  for (let i = 0; i < Math.round((w * h) / 18); i++) {
    const px = x + r.range(-0.5, 0.5) * w;
    const py = y - r.range(0, 1) * h;
    pores.push(`<circle cx="${f1(px)}" cy="${f1(py)}" r="${f1(r.range(0.7, 1.3))}" fill="${darken(color, 0.35)}" fill-opacity="0.5"/>`);
  }
  // lumps
  const lumps = [];
  for (let i = 0; i < Math.round(w / 22); i++) {
    lumps.push(`<ellipse cx="${f1(x + r.range(-0.4, 0.4) * w)}" cy="${f1(y - r.range(0.3, 0.85) * h)}" rx="${f1(r.range(6, 12))}" ry="${f1(r.range(4, 8))}" fill="${lighten(color, 0.25)}" fill-opacity="0.35"/>`);
  }
  return `<radialGradient id="${g}" cx="0.42" cy="0.12" r="0.95"><stop offset="0" stop-color="${lighten(color, 0.35)}"/><stop offset="0.55" stop-color="${color}"/><stop offset="1" stop-color="${mix(color, INK, 0.55)}"/></radialGradient>
<clipPath id="${c}"><path d="${d}"/></clipPath>
<path d="${d}" fill="url(#${g})"/><g clip-path="url(#${c})">${lumps.join('')}${pores.join('')}<ellipse cx="${f1(x)}" cy="${f1(y + 2)}" rx="${f1(w * 0.6)}" ry="${f1(h * 0.3)}" fill="${INK}" fill-opacity="0.3"/></g>
<path d="${d}" fill="none" stroke="${edgeOf(color)}" stroke-width="1.6"/>`;
}

// Low plate coral: a flat, slightly cupped plate tilted toward the viewer.
function plateCoral(r, x, y, w, color) {
  const th = w * 0.11;
  const top = blob(r, x, y - th, w / 2, w * 0.17, { n: 14, jitter: 0.06 });
  const g = id('pc');
  const rings = [];
  for (let k = 1; k <= 3; k++) rings.push(`<ellipse cx="${f1(x)}" cy="${f1(y - th)}" rx="${f1((w / 2) * (k / 3.6))}" ry="${f1(w * 0.17 * (k / 3.6))}" fill="none" stroke="${darken(color, 0.25)}" stroke-opacity="0.5" stroke-width="1.1"/>`);
  const spokes = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    spokes.push(`M${f1(x)},${f1(y - th)}L${f1(x + Math.cos(a) * w * 0.47)},${f1(y - th + Math.sin(a) * w * 0.16)}`);
  }
  return `<linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(color, 0.3)}"/><stop offset="1" stop-color="${color}"/></linearGradient>
<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(w * 0.48)}" ry="${f1(w * 0.15)}" fill="${mix(color, INK, 0.55)}"/>
<path d="${top}" fill="url(#${g})" stroke="${edgeOf(color)}" stroke-width="1.4"/>
<path d="${spokes.join('')}" stroke="${lighten(color, 0.45)}" stroke-opacity="0.45" stroke-width="1"/>${rings.join('')}`;
}

// Feather-duster tube worms: parchment tubes with banded fan crowns.
function dusters(r, x, y, n, crown, band) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const bx = x + (i - (n - 1) / 2) * r.range(8, 12);
    const h = r.range(22, 42);
    const lean = r.range(-0.25, 0.25);
    const tx = bx + Math.sin(lean) * h;
    const ty = y - h;
    out.push(`<path d="${taper([[bx, y + 3], [(bx + tx) / 2, y - h / 2], [tx, ty]], 5, 4.2)}" fill="#cbb89a" stroke="#6a5a44" stroke-width="0.9"/>`);
    const fil = [];
    const nf = 13;
    const R = r.range(10, 14);
    for (let k = 0; k < nf; k++) {
      const a = -Math.PI / 2 + (k / (nf - 1) - 0.5) * 2.5;
      fil.push(`M${f1(tx)},${f1(ty)}Q${f1(tx + Math.cos(a) * R * 0.6)},${f1(ty + Math.sin(a) * R * 0.5 - 2)} ${f1(tx + Math.cos(a) * R)},${f1(ty + Math.sin(a) * R * 0.8)}`);
    }
    out.push(`<path d="${fil.join('')}" stroke="${crown}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`);
    out.push(`<path d="${fil.join('')}" stroke="${band}" stroke-width="2.2" fill="none" stroke-dasharray="2 3" stroke-linecap="butt"/>`);
  }
  return out.join('');
}

// Christmas-tree worms: tiny bright spiral cones sitting on a coral head.
function xmasWorms(r, x, y, color) {
  const out = [];
  for (const dx of [-4.5, 4.5]) {
    const cx = x + dx;
    const h = r.range(10, 14);
    out.push(`<path d="M${f1(cx - 4)},${f1(y)}L${f1(cx)},${f1(y - h)}L${f1(cx + 4)},${f1(y)}Z" fill="${color}" stroke="${edgeOf(color)}" stroke-width="0.8"/>`);
    for (let k = 1; k < 4; k++) out.push(`<path d="M${f1(cx - 4 * (1 - k / 4))},${f1(y - (h * k) / 4)}l${f1(8 * (1 - k / 4))},${f1(-1.5)}" stroke="${lighten(color, 0.5)}" stroke-width="0.9"/>`);
  }
  return out.join('');
}

// Free-living mushroom coral lying flat on the rubble.
function mushroom(r, x, y, w, color) {
  const g = id('mg');
  const sept = [];
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    sept.push(`M${f1(x + Math.cos(a) * w * 0.06)},${f1(y + Math.sin(a) * w * 0.02)}L${f1(x + Math.cos(a) * w * 0.46)},${f1(y + Math.sin(a) * w * 0.15)}`);
  }
  return `<radialGradient id="${g}" cx="0.5" cy="0.4" r="0.6"><stop offset="0" stop-color="${lighten(color, 0.35)}"/><stop offset="1" stop-color="${color}"/></radialGradient>
<ellipse cx="${f1(x + 1)}" cy="${f1(y + w * 0.06)}" rx="${f1(w * 0.52)}" ry="${f1(w * 0.18)}" fill="${INK}" fill-opacity="0.3"/>
<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(w / 2)}" ry="${f1(w * 0.17)}" fill="url(#${g})" stroke="${edgeOf(color)}" stroke-width="1.2"/>
<path d="${sept.join('')}" stroke="${darken(color, 0.25)}" stroke-opacity="0.55" stroke-width="0.9"/>
<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(w * 0.07)}" ry="${f1(w * 0.025)}" fill="${darken(color, 0.4)}"/>`;
}

// ---------- composition ----------

export default function floor() {
  uid = 0;
  const r = rng(6060);
  const n1 = pnoise(51, 13);
  const n2 = pnoise(52, 37);
  const n3 = pnoise(53, 113);
  const nW = pnoise(54, 29);
  // irregular upper edge of the rubble bed (local y), and the gently varying top of the walking bed
  const topAt = (x) => 92 + 14 * n1(x) + 6 * n2(x) + 2.5 * n3(x);
  const walkAt = (x) => WALK + 5 * nW(x);

  const edge = [];
  for (let x = -3 * STEP; x <= W + 3 * STEP; x += STEP) edge.push([x, topAt(x)]);
  const ground = `${smooth(edge)}L${W + 3 * STEP},${H + 5}L${-3 * STEP},${H + 5}Z`;

  const defs = `
<linearGradient id="flG" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${H}">
<stop offset="0" stop-color="#94847c"/><stop offset="0.4" stop-color="#857470"/><stop offset="0.62" stop-color="#a29484"/><stop offset="1" stop-color="#6e6060"/></linearGradient>
<linearGradient id="flHaze" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${H}"><stop offset="0" stop-color="#3a78a8" stop-opacity="0.3"/><stop offset="0.3" stop-color="#3a78a8" stop-opacity="0.08"/><stop offset="0.5" stop-color="#3a78a8" stop-opacity="0"/></linearGradient>
<clipPath id="flClip"><path d="${ground}"/></clipPath>
${hazeFilter('flTint', 0.98, 0.05, '#2a78aa')}`;

  const out = [];
  // contact shadow on the reef behind, then the rubble bed
  out.push(`<path d="${ground}" fill="${INK}" fill-opacity="0.35" transform="translate(0,-5)"/>`);
  out.push(`<path d="${ground}" fill="url(#flG)"/>`);

  // texture inside the bed: mottled crust, then a dense litter of tiny rubble bits
  const tex = [];
  for (let i = 0; i < 170; i++) {
    const x = r.range(0, W);
    const y = r.range(topAt(x), H);
    const rx = r.range(14, 46);
    const c = r.pick(['#b4909e', '#4a3c40', '#8e9472', '#c8b8a2', '#5a4a4c', '#a89886']);
    tex.push(wrapX(`<path d="${blob(r, x, y, rx, rx * r.range(0.3, 0.5), { n: 9, jitter: 0.3 })}" fill="${c}" fill-opacity="${f1(r.range(0.25, 0.5))}"/>`, x - rx * 1.3, x + rx * 1.3));
  }
  for (let i = 0; i < 4200; i++) {
    const x = r.range(0, W);
    const y = r.range(topAt(x) + 2, H);
    const s = r.range(0.7, 1.9);
    const c = r.pick(['#f0e8da', '#dcd0bc', '#c8bca8', '#d8b0bc']);
    const dark = r() < 0.4;
    tex.push(wrapX(`<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(s)}" ry="${f1(s * 0.6)}" fill="${dark ? '#2e2434' : c}" fill-opacity="${f1(dark ? r.range(0.3, 0.55) : r.range(0.45, 0.85))}"/>`, x - s, x + s));
  }
  tex.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="url(#flHaze)"/>`);
  out.push(`<g clip-path="url(#flClip)">${tex.join('')}</g>`);
  out.push(`<path d="${smooth(edge)}" stroke="#e8dcd0" stroke-opacity="0.35" stroke-width="2" fill="none"/>`);

  // ---- upper part: low coral heads, sponges and worms poking up from the edge ----
  const heads = [];
  let x = r.range(0, 60);
  while (x < W) {
    const kind = r.pick(['brain', 'boulder', 'boulder', 'boulder', 'plate', 'sponge', 'dusters', 'fingers', 'brain', 'gap']);
    const y = topAt(x) + r.range(8, 18);
    let svg = '';
    let half = 40;
    if (kind === 'brain') {
      const w = r.range(70, 112);
      svg = brain(r, x, y, w, w * r.range(0.45, 0.6), r.pick(['#c8b464', '#a8c07a', '#d0a070', '#b8a8d0']), r.pick(['#6e6030', '#4e6a3a', '#7a4e30']));
      if (r() < 0.5) svg += xmasWorms(r, x + r.range(-w * 0.2, w * 0.2), y - w * 0.45, r.pick(['#3a7ad8', '#f0a030', '#f0d040', '#e05050']));
      half = w / 2 + 6;
    } else if (kind === 'boulder') {
      const w = r.range(66, 130);
      svg = boulderCoral(r, x, y, w, w * r.range(0.38, 0.55), r.pick(['#d4a862', '#a07ac0', '#86b886', '#d08a7a', '#c8b070']));
      if (r() < 0.45) svg += xmasWorms(r, x + r.range(-w * 0.25, w * 0.25), y - w * 0.38, r.pick(['#3a7ad8', '#f0a030', '#f0d040']));
      half = w / 2 + 6;
    } else if (kind === 'plate') {
      const w = r.range(60, 90);
      svg = plateCoral(r, x, y - 4, w, r.pick(['#7ab4a4', '#9aa86a', '#88a890']));
      half = w / 2 + 4;
    } else if (kind === 'sponge') {
      svg = sponges(r, x, y + 4, r.pick(['#e8823a', '#a85ab8', '#e0c040', '#d0544a']), r.int(2, 3));
      half = 60;
    } else if (kind === 'dusters') {
      svg = dusters(r, x, y, r.int(2, 4), r.pick(['#a83a4a', '#e8843a', '#d8c8e8']), r.pick(['#f4e8e0', '#6a2030', '#5a3a8a']));
      half = 40;
    } else if (kind === 'fingers') {
      svg = fingers(r, x, y + 4, { color: r.pick(['#c8b48a', '#a89ac8', '#e0a080']), n: r.int(3, 5), h: r.range(34, 52), w: 12 });
      half = 50;
    }
    if (svg) heads.push({ y, svg: wrapX(svg, x - half, x + half) });
    x += r.range(55, 120);
  }
  heads.sort((a, b) => a.y - b.y);
  out.push(heads.map((h) => h.svg).join(''));

  // ---- middle: rubble pieces tumbled over the bases of the heads ----
  const mid = [];
  for (let i = 0; i < 300; i++) {
    const x = r.range(0, W);
    const y = r.range(topAt(x) + 12, walkAt(x) + 4);
    if (r() < 0.55) {
      const len = r.range(12, 32);
      mid.push({ y, svg: wrapX(stick(r, x, y, len, r.range(-0.6, 0.6) + (r() < 0.5 ? Math.PI : 0), r.range(4.5, 7.5), r.pick(RUBBLE)), x - len - 6, x + len + 6) });
    } else {
      const s = r.range(4, 11);
      mid.push({ y, svg: wrapX(cobble(r, x, y, s, r.pick(RUBBLE)), x - s * 1.2, x + s * 1.2) });
    }
  }
  for (let i = 0; i < 26; i++) {
    const x = r.range(0, W);
    const y = r.range(topAt(x) + 18, walkAt(x) - 4);
    const pick = r();
    let svg;
    let half = 40;
    if (pick < 0.4) svg = zoanthids(r, x, y, r.int(4, 7), r.pick(['#7fd08f', '#e090b8', '#e8b850']), r.pick(['#e05a8a', '#3a9a6a', '#8a3ab0']));
    else if (pick < 0.6) svg = bubbleCoral(r, x, y + 4, r.int(4, 6), r.pick(['#b0d8a8', '#c8b8e8']));
    else if (pick < 0.75) { svg = urchin(r, x, y + 3, r.range(8, 11)); half = 30; }
    else svg = encrust(r, x, y, r.range(14, 24), r.range(5, 8), r.pick(['#8a5aa0', '#c8804a', '#c86a90', '#5a9a80']), r.pick(['#d8f0a0', '#fff0c0', '#ffd0e8']));
    mid.push({ y, svg: wrapX(svg, x - half, x + half) });
  }
  mid.sort((a, b) => a.y - b.y);
  out.push(mid.map((m) => m.svg).join(''));

  // ---- bottom 45%: the low, level walking bed ----
  const bed = [];
  // sand pockets
  for (let x0 = r.range(0, 200); x0 < W; x0 += r.range(260, 520)) {
    const rx = r.range(26, 60);
    const y = r.range(walkAt(x0) + 28, H - 30);
    bed.push({ y: y - 100, svg: wrapX(sandPocket(r, x0, y, rx, rx * r.range(0.18, 0.26)), x0 - rx * 1.3, x0 + rx * 1.3) });
  }
  // flat encrusting coral and lying mushroom corals
  for (let i = 0; i < 12; i++) {
    const x = r.range(0, W);
    const y = r.range(walkAt(x) + 14, H - 14);
    const svg = r() < 0.55
      ? encrust(r, x, y, r.range(16, 30), r.range(4, 7), r.pick(['#8a5aa0', '#c8804a', '#c86a90', '#5a9a80']), r.pick(['#d8f0a0', '#fff0c0', '#ffd0e8']))
      : mushroom(r, x, y, r.range(22, 34), r.pick(['#c8b080', '#a8c890', '#d8a0b8']));
    bed.push({ y, svg: wrapX(svg, x - 40, x + 40) });
  }
  // level rubble: sticks lying nearly flat, chunks and pebbles
  for (let i = 0; i < 760; i++) {
    const x = r.range(0, W);
    const y = r.range(walkAt(x) - 4, H - 2);
    if (r() < 0.45) {
      const len = r.range(10, 30);
      bed.push({ y, svg: wrapX(stick(r, x, y, len, r.range(-0.18, 0.18) + (r() < 0.5 ? Math.PI : 0), r.range(4, 7), r.pick(RUBBLE)), x - len - 6, x + len + 6) });
    } else {
      const s = r.range(3, 9);
      bed.push({ y, svg: wrapX(cobble(r, x, y, s, r.pick(RUBBLE)), x - s * 1.2, x + s * 1.2) });
    }
  }
  bed.sort((a, b) => a.y - b.y);
  out.push(bed.map((b) => b.svg).join(''));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs><g filter="url(#flTint)">${out.join('')}</g></svg>`;
}
