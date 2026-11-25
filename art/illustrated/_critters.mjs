// Floor critters (crab, hermit crab, sea star, nudibranch, banded shrimp). Each part file is a tiny
// .svg.mjs that calls one of these. All parts of a critter share its canvas; feet touch the bottom edge.
import { smooth, taper, mix, lighten, darken, f1 } from './_lib.mjs';

const svg = (w, h, body, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;

// Soft contact shadow, half below the bottom edge, as its own static part under everything.
export const shadow = (w, h, cx, rx) =>
  svg(w, h, `<defs><radialGradient id="s" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#140c18" stop-opacity="0.5"/><stop offset="1" stop-color="#140c18" stop-opacity="0"/></radialGradient></defs><ellipse cx="${cx}" cy="${h - 1}" rx="${rx}" ry="5" fill="url(#s)"/>`);

// A jointed leg: two segments with a knee, outlined, tapering to a point at the foot.
function leg(root, knee, foot, w, color, dark, band) {
  const a = taper([root, [(root[0] + knee[0]) / 2, (root[1] + knee[1]) / 2], knee], w, w * 0.85, false);
  const b = taper([knee, [(knee[0] + foot[0]) / 2, (knee[1] + foot[1]) / 2], foot], w * 0.85, 0.8);
  const joint = `<circle cx="${f1(knee[0])}" cy="${f1(knee[1])}" r="${f1(w * 0.5)}" fill="${band || color}" stroke="${dark}" stroke-width="1"/>`;
  return `<path d="${a}" fill="${color}" stroke="${dark}" stroke-width="1.3" stroke-linejoin="round"/><path d="${b}" fill="${color}" stroke="${dark}" stroke-width="1.3" stroke-linejoin="round"/>${joint}`;
}

// ---------------- crab (120 x 80), seen from the front, walks sideways ----------------

const CRAB = { w: 120, h: 80, shell: '#d84a28', light: '#f6844e', dark: '#5a160a', tip: '#2a120c' };

export function crabLegs(side) {
  // side -1 = left, +1 = right (mirrored about x = 60)
  const X = (x) => (side < 0 ? x : 120 - x);
  const out = [];
  // legs splay out to the side: up to a high knee, then down and out to the foot
  const L = [
    [[41, 55], [25, 38], [31, 79.5]],
    [[40, 57], [17, 40], [20, 79.5]],
    [[39, 59], [10, 45], [10, 79.5]],
    [[39, 61], [5, 53], [2, 78.5]],
  ];
  for (let i = 3; i >= 0; i--) {
    const [root, knee, foot] = L[i].map(([x, y]) => [X(x), y]);
    const c = mix(CRAB.shell, '#7a1e10', i * 0.12);
    out.push(leg(root, knee, foot, 6, c, CRAB.dark, lighten(c, 0.2)));
  }
  return svg(120, 80, out.join(''));
}

export function crabBody() {
  const shell = 'M30,40 C30,24 45,15 60,15 C75,15 90,24 90,40 C90,50 77,58 60,58 C43,58 30,50 30,40 Z';
  const gran = [];
  const pts = [[42, 26], [50, 22], [60, 21], [70, 22], [78, 26], [46, 32], [56, 29], [64, 29], [74, 32], [38, 34], [82, 34], [52, 36], [68, 36], [60, 40]];
  for (const [x, y] of pts) gran.push(`<circle cx="${x}" cy="${y}" r="1.4" fill="#ffc8a8" fill-opacity="0.7"/>`);
  const teeth = [];
  for (const x of [36, 41, 79, 84]) teeth.push(`<path d="M${x - 3},${x < 60 ? 30 - (x - 36) * 0.9 : 30 - (84 - x) * 0.9}l2.5,-4l2.5,4Z" fill="${CRAB.shell}" stroke="${CRAB.dark}" stroke-width="0.9"/>`);
  const defs = `<linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${CRAB.light}"/><stop offset="0.55" stop-color="${CRAB.shell}"/><stop offset="1" stop-color="#9a2a16"/></linearGradient><clipPath id="cc"><path d="${shell}"/></clipPath>`;
  const eyes = [[54, 21, 51, 10], [66, 21, 69, 10]]
    .map(([x0, y0, x1, y1]) => `<path d="M${x0},${y0}L${x1},${y1}" stroke="${CRAB.dark}" stroke-width="4.4" stroke-linecap="round"/><path d="M${x0},${y0}L${x1},${y1}" stroke="${CRAB.light}" stroke-width="2.6" stroke-linecap="round"/><circle cx="${x1}" cy="${y1}" r="3.6" fill="#140a08" stroke="${CRAB.dark}" stroke-width="0.8"/><circle cx="${x1 - 1.1}" cy="${y1 - 1.2}" r="1.1" fill="#ffffff"/>`)
    .join('');
  return svg(
    120,
    80,
    `<g transform="translate(0,9)">${teeth.join('')}<path d="${shell}" fill="url(#c)"/><g clip-path="url(#cc)">${gran.join('')}<ellipse cx="60" cy="24" rx="20" ry="5" fill="#ffffff" fill-opacity="0.25"/><path d="M28,48 C42,60 78,60 92,48 L92,60 L28,60 Z" fill="#6a1a0c" fill-opacity="0.35"/></g>
<path d="${shell}" fill="none" stroke="${CRAB.dark}" stroke-width="1.8"/>
${eyes}</g>`,
    defs,
  );
}

export function crabClaw(side) {
  // claws folded in front of the lower carapace, pincers pointing up and in
  const X = (x) => (side < 0 ? x : 120 - x);
  const arm = `<path d="${taper([[X(48), 67], [X(42), 67], [X(38), 62]], 7, 6.5, false)}" fill="${CRAB.shell}" stroke="${CRAB.dark}" stroke-width="1.3" stroke-linejoin="round"/>`;
  const palm = `<ellipse cx="${X(38)}" cy="56" rx="8.5" ry="9.5" transform="rotate(${side * 18} ${X(38)} 56)" fill="url(#p)" stroke="${CRAB.dark}" stroke-width="1.4"/>`;
  const fixed = `<path d="M${X(32)},51 C${X(31)},44 ${X(34)},38 ${X(39)},35 C${X(39)},40 ${X(38)},45 ${X(37)},50 Z" fill="${CRAB.shell}" stroke="${CRAB.dark}" stroke-width="1.2"/>`;
  const moving = `<path d="M${X(41)},49 C${X(43)},44 ${X(44)},39 ${X(43)},34 C${X(47)},38 ${X(48)},44 ${X(46)},51 Z" fill="${CRAB.shell}" stroke="${CRAB.dark}" stroke-width="1.2"/>`;
  const tips = `<path d="M${X(39)},35 C${X(36)},37 ${X(35)},40 ${X(35)},42 L${X(38)},42 Z M${X(43)},34 C${X(45)},36 ${X(46)},39 ${X(46)},41 L${X(44)},41 Z" fill="${CRAB.tip}"/>`;
  const dots = [[35, 55], [40, 59], [37, 61], [41, 53]].map(([x, y]) => `<circle cx="${X(x)}" cy="${y}" r="1.2" fill="#ffd0b0" fill-opacity="0.8"/>`).join('');
  const defs = `<radialGradient id="p" cx="0.4" cy="0.3" r="0.8"><stop offset="0" stop-color="${CRAB.light}"/><stop offset="1" stop-color="#b03418"/></radialGradient>`;
  return svg(120, 80, arm + fixed + moving + palm + tips + dots, defs);
}

// ---------------- hermit crab (110 x 90): spiral shell, legs and claws out the front ----------------

const HERMIT = { leg: '#d8462e', band: '#f6efe6', dark: '#4a160c' };

export function hermitLegs() {
  const out = [];
  const L = [
    [[72, 66], [84, 66], [90, 89.5]],
    [[70, 70], [76, 76], [76, 89.5]],
    [[74, 62], [94, 66], [104, 89.5]],
  ];
  for (const [root, knee, foot] of L) {
    out.push(leg(root, knee, foot, 6, HERMIT.leg, HERMIT.dark, HERMIT.band));
    // white band near the tip
    const t = 0.62;
    const bx = knee[0] + (foot[0] - knee[0]) * t;
    const by = knee[1] + (foot[1] - knee[1]) * t;
    out.push(`<circle cx="${f1(bx)}" cy="${f1(by)}" r="2.2" fill="${HERMIT.band}"/>`);
  }
  return svg(110, 90, out.join(''));
}

export function hermitBody() {
  const shell = 'M72,72 C81,58 81,36 68,24 C58,14 42,10 30,11 C24,6 15,4 10,8 C8,14 12,19 16,22 C9,31 8,45 12,57 C17,70 31,78 47,78 C57,78 66,76 72,72 Z';
  const defs = `<radialGradient id="sh" cx="0.38" cy="0.3" r="0.8"><stop offset="0" stop-color="#f0c48a"/><stop offset="0.55" stop-color="#c88a52"/><stop offset="1" stop-color="#7a4a28"/></radialGradient>
<clipPath id="sc"><path d="${shell}"/></clipPath>
<radialGradient id="cl" cx="0.4" cy="0.3" r="0.8"><stop offset="0" stop-color="#ff8a6a"/><stop offset="1" stop-color="#b02a1a"/></radialGradient>`;
  const bands = [];
  for (let k = 0; k < 6; k++) {
    const s = 1 - k * 0.14;
    bands.push(`<path d="M${f1(12 + k * 3)},${f1(60 - k * 2)} C${f1(20 + k * 2)},${f1(30 + k * 4)} ${f1(52 - k * 2)},${f1(20 + k * 5)} ${f1(70 - k * 3)},${f1(36 + k * 2)}" stroke="#6a3a1c" stroke-opacity="${f1(0.25 + 0.05 * (k % 2))}" stroke-width="${f1(3 * s)}" fill="none"/>`);
  }
  const spots = [[30, 40], [44, 32], [56, 44], [36, 58], [50, 62], [24, 50], [62, 30]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="3" ry="2" fill="#fff2dc" fill-opacity="0.65"/>`).join('');
  const sutures = `<path d="M15,23 C28,20 46,24 58,36 M11,13 C19,11 29,13 35,18" stroke="#4a2a14" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
  // crab parts at the aperture: head, eyestalks, antennae, claws
  const antennae = `<path d="M82,42 C92,32 100,22 107,13 M84,44 C94,38 102,32 108,27" stroke="#c8402a" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
  const head = `<ellipse cx="80" cy="47" rx="8" ry="6.5" fill="${HERMIT.leg}" stroke="${HERMIT.dark}" stroke-width="1.2"/>`;
  const eyes = [[80, 44, 86, 32], [82, 45, 91, 36]]
    .map(([x0, y0, x1, y1]) => `<path d="M${x0},${y0}L${x1},${y1}" stroke="${HERMIT.dark}" stroke-width="3.6" stroke-linecap="round"/><path d="M${x0},${y0}L${x1},${y1}" stroke="#f0d6a0" stroke-width="2" stroke-linecap="round"/><circle cx="${x1}" cy="${y1}" r="2.6" fill="#0e0a08"/><circle cx="${x1 - 0.8}" cy="${y1 - 0.9}" r="0.8" fill="#ffffff"/>`)
    .join('');
  const bigClaw = `<path d="${taper([[76, 56], [84, 58], [88, 60]], 7, 7, false)}" fill="${HERMIT.leg}" stroke="${HERMIT.dark}" stroke-width="1.2"/>
<ellipse cx="92" cy="60" rx="10" ry="8" fill="url(#cl)" stroke="${HERMIT.dark}" stroke-width="1.3"/>
<path d="M99,55 C104,55 108,57 108,60 C104,60 101,59 99,58 Z M99,62 C104,62 107,64 107,66 C103,66 100,65 98,64 Z" fill="${HERMIT.leg}" stroke="${HERMIT.dark}" stroke-width="1.1"/>
<circle cx="89" cy="57" r="1.2" fill="#ffe0d0"/><circle cx="93" cy="62" r="1.2" fill="#ffe0d0"/><circle cx="87" cy="62" r="1.1" fill="#ffe0d0"/>`;
  const smallClaw = `<ellipse cx="88" cy="50" rx="6" ry="4.4" fill="url(#cl)" stroke="${HERMIT.dark}" stroke-width="1.1"/><path d="M93,48 L99,48 L94,51 Z" fill="${HERMIT.leg}" stroke="${HERMIT.dark}" stroke-width="0.9"/>`;
  const aperture = `<ellipse cx="72" cy="58" rx="9" ry="16" transform="rotate(-18 72 58)" fill="#3a1c10"/><ellipse cx="72" cy="58" rx="9" ry="16" transform="rotate(-18 72 58)" fill="none" stroke="#f6e8dc" stroke-width="3"/>`;
  return svg(
    110,
    90,
    `${antennae}<path d="${shell}" fill="url(#sh)"/><g clip-path="url(#sc)">${bands.join('')}${spots}<ellipse cx="34" cy="26" rx="16" ry="6" fill="#ffffff" fill-opacity="0.3" transform="rotate(-20 34 26)"/><path d="M14,64 C30,80 60,80 76,68 L80,90 L10,90 Z" fill="#3a2010" fill-opacity="0.3"/><path d="M40,66 C46,62 54,63 58,68 C52,72 44,72 40,66 Z" fill="#c87aa0" fill-opacity="0.75"/></g>
<path d="${shell}" fill="none" stroke="#4a2a14" stroke-width="1.8"/>${sutures}${aperture}${head}${eyes}${smallClaw}${bigClaw}`,
    defs,
  );
}

// ---------------- sea star (110 x 110): blue, five slender arms, seen from slightly above ----------------

export function seastarBody() {
  const cx = 55;
  const cy = 77;
  const sq = 0.62; // vertical squash for the viewing angle
  const R = 50;
  const arms = [];
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
    const pts = [];
    for (let t = 0; t <= 1.0001; t += 0.25) pts.push([Math.cos(a) * R * t, Math.sin(a) * R * t + Math.sin(t * Math.PI) * 2 * (k % 2 ? 1 : -1)]);
    arms.push({ a, d: taper(pts, 18, 8) });
  }
  const disc = `<circle cx="0" cy="0" r="12"/>`;
  const shapes = (fill, extra = '') => `<g fill="${fill}" ${extra}>${arms.map((m) => `<path d="${m.d}"/>`).join('')}${disc}</g>`;
  const tex = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const m of arms) {
    for (let i = 0; i < 26; i++) {
      const t = 0.12 + rnd() * 0.84;
      const off = (rnd() - 0.5) * (16 - 9 * t) * 0.9;
      const x = Math.cos(m.a) * R * t - Math.sin(m.a) * off;
      const y = Math.sin(m.a) * R * t + Math.cos(m.a) * off;
      tex.push(rnd() < 0.62
        ? `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(0.9 + rnd() * 0.9)}" fill="#a8c8ff" fill-opacity="0.8"/>`
        : `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(0.8 + rnd() * 0.7)}" fill="#14307a" fill-opacity="0.7"/>`);
    }
    // darker centre line down each arm, lighter tip
    tex.push(`<path d="M0,0L${f1(Math.cos(m.a) * R * 0.9)},${f1(Math.sin(m.a) * R * 0.9)}" stroke="#1e46a8" stroke-opacity="0.45" stroke-width="3"/>`);
    tex.push(`<circle cx="${f1(Math.cos(m.a) * R * 0.94)}" cy="${f1(Math.sin(m.a) * R * 0.94)}" r="3.6" fill="#8ab4ff" fill-opacity="0.7"/>`);
  }
  const defs = `<radialGradient id="st" gradientUnits="userSpaceOnUse" cx="0" cy="-6" r="56"><stop offset="0" stop-color="#6c9cf4"/><stop offset="0.5" stop-color="#3a6ad8"/><stop offset="1" stop-color="#2a54c0"/></radialGradient>`;
  const g = (inner) => `<g transform="translate(${cx},${cy}) scale(1,${sq})">${inner}</g>`;
  return svg(
    110,
    110,
    // side of the arms (thickness), outline, top surface, texture, soft top highlight
    `<g transform="translate(0,6)">${g(shapes('#18306e', 'stroke="#0c1a44" stroke-width="3"'))}</g>` +
      g(shapes('none', 'stroke="#0c1a44" stroke-width="4.5" stroke-linejoin="round"')) +
      g(shapes('url(#st)') + tex.join('') + `<ellipse cx="-6" cy="-8" rx="16" ry="8" fill="#ffffff" fill-opacity="0.22"/><circle cx="0" cy="0" r="3" fill="#f0a040"/>`),
    defs,
  );
}

// ---------------- nudibranch (120 x 50): violet sea slug, orange gills and rhinophores ----------------

const NUDI = { body: '#4a36b0', light: '#8070e0', dark: '#1e1450', orange: '#f5832a', orangeD: '#8a3a0a' };

export function nudiGills() {
  const fronds = [];
  const base = [30, 27];
  for (let k = 0; k < 7; k++) {
    const a = -Math.PI / 2 + (k - 3) * 0.32;
    const len = 15 - Math.abs(k - 3) * 1.6;
    const tip = [base[0] + Math.cos(a) * len, base[1] + Math.sin(a) * len];
    fronds.push(`<path d="M${base[0]},${base[1]}Q${f1((base[0] + tip[0]) / 2 + 2)},${f1((base[1] + tip[1]) / 2)} ${f1(tip[0])},${f1(tip[1])}" stroke="${NUDI.orangeD}" stroke-width="4.4" fill="none" stroke-linecap="round"/>`);
    fronds.push(`<path d="M${base[0]},${base[1]}Q${f1((base[0] + tip[0]) / 2 + 2)},${f1((base[1] + tip[1]) / 2)} ${f1(tip[0])},${f1(tip[1])}" stroke="${NUDI.orange}" stroke-width="2.8" fill="none" stroke-linecap="round"/>`);
    // little side pinnules
    for (const t of [0.45, 0.75]) {
      const px = base[0] + (tip[0] - base[0]) * t;
      const py = base[1] + (tip[1] - base[1]) * t;
      fronds.push(`<path d="M${f1(px)},${f1(py)}l${f1(Math.cos(a - 0.9) * 3.4)},${f1(Math.sin(a - 0.9) * 3.4)}M${f1(px)},${f1(py)}l${f1(Math.cos(a + 0.9) * 3.4)},${f1(Math.sin(a + 0.9) * 3.4)}" stroke="#ffb070" stroke-width="1.2" stroke-linecap="round"/>`);
    }
  }
  return svg(120, 50, fronds.join(''));
}

export function nudiRhinophores() {
  const out = [];
  for (const [bx, tx, ty] of [[98, 101, 6], [104, 109, 9]]) {
    const d = taper([[bx, 28], [(bx + tx) / 2 + 0.5, (28 + ty) / 2], [tx, ty]], 5.5, 3.2);
    out.push(`<path d="${d}" fill="${NUDI.orange}" stroke="${NUDI.orangeD}" stroke-width="1.1"/>`);
    for (let k = 1; k <= 4; k++) {
      const t = 0.35 + k * 0.13;
      const x = bx + (tx - bx) * t;
      const y = 28 + (ty - 28) * t;
      out.push(`<path d="M${f1(x - 2.4)},${f1(y + 0.5)}L${f1(x + 2.4)},${f1(y - 0.5)}" stroke="${NUDI.orangeD}" stroke-opacity="0.7" stroke-width="0.9"/>`);
    }
  }
  return svg(120, 50, out.join(''));
}

export function nudiBody() {
  // mantle (upper body) with a gently frilled skirt edge, over a pale foot
  const top = [];
  for (let x = 14; x <= 112; x += 6) {
    const t = (x - 14) / 98;
    top.push([x, 40 - 20 * Math.sin(Math.PI * Math.min(1, t * 1.08)) ** 0.7]);
  }
  const skirt = [];
  for (let x = 112; x >= 14; x -= 4) skirt.push([x, 41 + 1.6 * Math.sin(x * 0.55)]);
  const mantle = smooth([...top, [114, 38], ...skirt], true, 0.8);
  const foot = `M4,49 C14,45 30,44 50,44 L104,44 C110,44 114,46 114,49 Z`;
  const defs = `<linearGradient id="m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${NUDI.light}"/><stop offset="0.6" stop-color="${NUDI.body}"/><stop offset="1" stop-color="#2e2088"/></linearGradient><clipPath id="mc"><path d="${mantle}"/></clipPath>`;
  const dots = [[40, 28], [52, 24], [64, 23], [76, 24], [88, 27], [46, 33], [70, 30], [58, 31], [82, 32]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.5" fill="#ffffff" fill-opacity="0.85"/>`).join('');
  return svg(
    120,
    50,
    `<path d="${foot}" fill="#c4bce8" stroke="${NUDI.dark}" stroke-width="1.2"/>
<path d="${mantle}" fill="url(#m)"/>
<g clip-path="url(#mc)"><path d="${smooth(skirt.map(([x, y]) => [x, y - 3.5]))}" stroke="#f2d84a" stroke-width="3.4" fill="none"/><path d="${smooth(skirt.map(([x, y]) => [x, y - 0.6]))}" stroke="#ffffff" stroke-width="2" fill="none"/>
<path d="M30,30 C50,22 80,21 104,30" stroke="#ffffff" stroke-opacity="0.7" stroke-width="1.6" fill="none"/>${dots}
<ellipse cx="64" cy="24" rx="30" ry="4" fill="#ffffff" fill-opacity="0.2"/></g>
<path d="${mantle}" fill="none" stroke="${NUDI.dark}" stroke-width="1.5"/>`,
    defs,
  );
}

// ---------------- banded shrimp (110 x 60) ----------------

const SHRIMP = { red: '#d8283a', white: '#f6f0e8', dark: '#5a0e16' };

export function shrimpTail() {
  const fan = 'M30,30 L22,28 C16,20 10,16 4,16 C6,24 6,38 4,46 C10,46 16,42 22,36 L30,36 Z';
  return svg(
    110,
    60,
    `<path d="${fan}" fill="${SHRIMP.white}" stroke="${SHRIMP.dark}" stroke-width="1.2" stroke-linejoin="round"/>
<path d="M22,30 L6,20 M22,32 L5,31 M22,34 L6,42" stroke="${SHRIMP.red}" stroke-width="2.4"/>
<path d="M4,16 C6,24 6,38 4,46" stroke="${SHRIMP.red}" stroke-width="3" fill="none"/>`,
  );
}

export function shrimpLegs() {
  const out = [];
  for (let i = 0; i < 5; i++) {
    const rx = 50 + i * 6.5;
    out.push(leg([rx, 37], [rx + 3 + i * 0.5, 47], [rx - 2 + i * 1.4, 59.5], 2.6, i % 2 ? SHRIMP.white : '#f4b0b8', SHRIMP.dark, SHRIMP.red));
  }
  return svg(110, 60, out.join(''));
}

export function shrimpBody() {
  // arched abdomen + carapace with a pointed rostrum
  const body = 'M26,30 C30,22 44,17 60,18 C72,19 82,20 88,23 L99,22 L90,27 C90,32 86,37 78,38 C66,40 50,40 40,38 C32,37 27,35 26,30 Z';
  const bands = [];
  const segs = [32, 40, 48, 56];
  segs.forEach((x, i) => bands.push(`<path d="M${x},14 L${x + 6},14 L${x + 6},44 L${x},44 Z" fill="${i % 2 ? SHRIMP.white : SHRIMP.red}"/>`));
  bands.push(`<path d="M64,14 L80,14 L80,44 L64,44 Z" fill="${SHRIMP.red}"/><path d="M80,14 L86,14 L86,44 L80,44 Z" fill="${SHRIMP.white}"/><path d="M86,14 L100,14 L100,44 L86,44 Z" fill="${SHRIMP.red}"/>`);
  const defs = `<clipPath id="b"><path d="${body}"/></clipPath>`;
  // long banded claws held forward
  const clawArm = taper([[80, 36], [88, 34], [94, 28]], 3.6, 3.2, false);
  const claw = `<path d="${clawArm}" fill="${SHRIMP.white}" stroke="${SHRIMP.dark}" stroke-width="1"/>
<path d="M92,30 C96,24 102,22 108,23 C104,26 100,28 96,32 Z" fill="${SHRIMP.red}" stroke="${SHRIMP.dark}" stroke-width="1"/>
<path d="M98,26 L101,24.5" stroke="${SHRIMP.white}" stroke-width="2.4"/>`;
  return svg(
    110,
    60,
    `<path d="${body}" fill="${SHRIMP.white}"/><g clip-path="url(#b)">${bands.join('')}<path d="M26,34 C40,42 70,42 92,32 L92,44 L26,44 Z" fill="#5a0e16" fill-opacity="0.18"/><path d="M34,24 C48,19 66,19 84,23" stroke="#ffffff" stroke-opacity="0.55" stroke-width="2" fill="none"/></g>
<path d="${body}" fill="none" stroke="${SHRIMP.dark}" stroke-width="1.3" stroke-linejoin="round"/>
<path d="M44,22 L44,38 M52,21 L52,39 M60,20 L60,39" stroke="${SHRIMP.dark}" stroke-opacity="0.35" stroke-width="0.9"/>
${claw}
<circle cx="86" cy="24" r="2.4" fill="#120608"/><circle cx="85.4" cy="23.3" r="0.7" fill="#ffffff"/>`,
    defs,
  );
}

export function shrimpAntennae() {
  return svg(
    110,
    60,
    `<g fill="none" stroke-linecap="round">
<path d="M88,23 C80,8 60,3 34,5 C24,6 14,8 6,12" stroke="${SHRIMP.dark}" stroke-opacity="0.35" stroke-width="2.4"/>
<path d="M88,23 C80,8 60,3 34,5 C24,6 14,8 6,12" stroke="${SHRIMP.white}" stroke-width="1.3"/>
<path d="M89,23 C86,12 76,4 62,2" stroke="${SHRIMP.dark}" stroke-opacity="0.35" stroke-width="2.4"/>
<path d="M89,23 C86,12 76,4 62,2" stroke="${SHRIMP.white}" stroke-width="1.3"/>
<path d="M90,24 C96,16 102,12 108,10" stroke="${SHRIMP.white}" stroke-width="1.1"/>
</g>`,
  );
}
