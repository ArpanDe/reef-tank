// Midground reef: live-rock clusters with sea fans, branching, table, brain, finger and pillar
// corals, tube sponges and small encrusting life, alternating with low stretches so open water keeps
// drifting through the fish zone. Tiles seamlessly over TILE px (periodic profiles, features wrapped
// across the edges). Muted a little and tinted toward the water so the fish stay the most saturated
// things on screen.
import { rng, pnoise, wrapDist, wrapX, smooth, blob, taper, mix, lighten, darken, f1, TILE } from './_lib.mjs';
import { branchCoral, seaFan, tableCoral, dome } from './_reefkit.mjs';

const W = TILE;
const H = 540;
const STEP = 18; // divides TILE
const INK = '#141a30'; // shadow / outline base

let uid = 0;
const id = (p) => `${p}${uid++}`;
const edgeOf = (c) => mix(c, INK, 0.62);
const bumps = (centers) => (x) => centers.reduce((s, [c, w, k]) => s + k * Math.exp(-(wrapDist(x, c) ** 2) / (2 * w * w)), 0);

// ---------- rock ----------

const ROCK_TONES = ['#6a5672', '#705c52', '#5c6272', '#74586a', '#6a5e60'];

function rockDefs() {
  return (
    ROCK_TONES.map(
      (c, i) => `<radialGradient id="rock${i}" cx="0.45" cy="0.1" r="1.05">
<stop offset="0" stop-color="${lighten(c, 0.3)}"/><stop offset="0.38" stop-color="${c}"/>
<stop offset="1" stop-color="${mix(c, INK, 0.72)}"/></radialGradient>`,
    ).join('') +
    // sunlit rim on the upper edge, dark crevice line only along the lower edge
    `<linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e4eef6" stop-opacity="0.5"/><stop offset="0.3" stop-color="#e4eef6" stop-opacity="0"/></linearGradient>
<linearGradient id="crev" x1="0" y1="0" x2="0" y2="1"><stop offset="0.35" stop-color="${INK}" stop-opacity="0"/><stop offset="1" stop-color="${INK}" stop-opacity="0.75"/></linearGradient>
<linearGradient id="mass" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${H}"><stop offset="0" stop-color="#3a3248"/><stop offset="1" stop-color="#1a1e32"/></linearGradient>`
  );
}

// One live-rock mass: irregular, porous, crusted with coralline algae, turf and tiny polyps.
function boulder(r, cx, cy, rx, ry) {
  const d = blob(r, cx, cy, rx, ry, { n: 16, jitter: 0.17, flatBottom: true });
  const clip = id('bc');
  const tex = [];
  // broad tonal variation so neighbouring rocks merge into one mass
  for (let i = 0; i < 3; i++) {
    tex.push(`<ellipse cx="${f1(cx + r.range(-0.7, 0.7) * rx)}" cy="${f1(cy + r.range(-0.6, 0.3) * ry)}" rx="${f1(rx * r.range(0.3, 0.6))}" ry="${f1(ry * r.range(0.25, 0.5))}" fill="${r() < 0.5 ? '#9a8aa0' : '#2a2438'}" fill-opacity="${f1(r.range(0.12, 0.22))}"/>`);
  }
  // encrusting coralline algae and turf along the upper surface
  const crusts = r.int(2, 5);
  for (let i = 0; i < crusts; i++) {
    const c = r.pick(['#b8789e', '#a86c9c', '#c88c98', '#c47a8a', '#7f9a6c', '#8a9c78', '#9a8c6a']);
    const px = cx + r.range(-0.7, 0.7) * rx;
    const py = cy - ry * r.range(0.45, 0.95);
    tex.push(`<path d="${blob(r, px, py, rx * r.range(0.12, 0.3), ry * r.range(0.07, 0.15), { n: 10, jitter: 0.4 })}" fill="${c}" fill-opacity="${f1(r.range(0.55, 0.85))}"/>`);
  }
  // porous pits (with a lit lower lip) and pale flecks
  const pits = Math.round((rx * ry) / 170);
  for (let i = 0; i < pits; i++) {
    const px = cx + r.range(-0.9, 0.9) * rx;
    const py = cy + r.range(-0.95, 0.5) * ry;
    const pr = r.range(1, 3.2);
    if (r() < 0.72) {
      tex.push(`<ellipse cx="${f1(px)}" cy="${f1(py + pr * 0.35)}" rx="${f1(pr)}" ry="${f1(pr * 0.6)}" fill="#c8bcd0" fill-opacity="0.16"/><ellipse cx="${f1(px)}" cy="${f1(py)}" rx="${f1(pr)}" ry="${f1(pr * 0.6)}" fill="${INK}" fill-opacity="0.42"/>`);
    } else tex.push(`<circle cx="${f1(px)}" cy="${f1(py)}" r="${f1(pr * 0.5)}" fill="#ece4ee" fill-opacity="0.22"/>`);
  }
  // a few tiny polyp clusters
  if (r() < 0.5) {
    const px = cx + r.range(-0.5, 0.5) * rx;
    const py = cy - ry * r.range(0.3, 0.8);
    const c = r.pick(['#8fd0a0', '#e0a0c0', '#e8c070', '#a0c8e8']);
    for (let k = 0; k < 6; k++) tex.push(`<circle cx="${f1(px + r.range(-9, 9))}" cy="${f1(py + r.range(-4, 4))}" r="${f1(r.range(1.4, 2.4))}" fill="${c}" fill-opacity="0.8"/>`);
  }
  // shade the underside
  tex.push(`<ellipse cx="${f1(cx)}" cy="${f1(cy + ry * 0.6)}" rx="${f1(rx * 1.15)}" ry="${f1(ry * 0.55)}" fill="${INK}" fill-opacity="0.32"/>`);
  return `<clipPath id="${clip}"><path d="${d}"/></clipPath><path d="${d}" fill="url(#rock${r.int(0, ROCK_TONES.length - 1)})"/><g clip-path="url(#${clip})">${tex.join('')}</g><path d="${d}" fill="none" stroke="url(#rim)" stroke-width="3"/><path d="${d}" fill="none" stroke="url(#crev)" stroke-width="2.2"/>`;
}

function rockLayer(r, heightAt, hump, { step, size }) {
  // Dark crevice mass under the rocks so gaps read as shadow, not water.
  const pts = [];
  for (let x = -3 * STEP; x <= W + 3 * STEP; x += STEP) pts.push([x, H - heightAt(x) + 24]);
  const out = [`<path d="${smooth(pts)}L${W + 3 * STEP},${H + 20}L${-3 * STEP},${H + 20}Z" fill="url(#mass)"/>`];
  const bs = [];
  for (let x = 0; x < W; x += r.range(...step)) {
    const top = H - heightAt(x);
    const k = 0.65 + 0.6 * Math.min(1, hump(x));
    // mostly big rocks with the odd small one, and some wide flat ledges
    const big = r() < 0.75;
    const rx = (big ? r.range(size[0], size[1]) : r.range(size[0] * 0.45, size[0] * 0.75)) * k;
    const ry = rx * (r() < 0.25 ? r.range(0.32, 0.42) : r.range(0.48, 0.7));
    bs.push({ x: x + r.range(-10, 10), cy: top + ry * 0.92, rx, ry });
    if (r() < 0.45) {
      const rx2 = rx * r.range(0.4, 0.8);
      bs.push({ x: x + r.range(-40, 40), cy: top + ry * 0.92 + rx2 * r.range(0.45, 0.85), rx: rx2, ry: rx2 * r.range(0.4, 0.62) });
    }
  }
  bs.sort((a, b) => a.cy + a.ry - (b.cy + b.ry));
  for (const b of bs) out.push(wrapX(boulder(r, b.x, b.cy, b.rx, b.ry), b.x - b.rx * 1.3, b.x + b.rx * 1.3));
  return out.join('');
}

// ---------- corals ----------

function branching(r, x, y, { color, tip, len = 50, width = 12, depth = 3, spread = 0.6, colonies = 1 }) {
  const segs = [];
  for (let c = 0; c < colonies; c++) {
    const lean = (c - (colonies - 1) / 2) * 0.32 + r.range(-0.12, 0.12);
    segs.push(...branchCoral(r, x + (c - (colonies - 1) / 2) * width * 1.5, y, { len: len * r.range(0.8, 1.1), width, depth, spread, lean }));
  }
  const col = (s) => mix(color, tip, (s.depth / depth) * 0.6);
  const a = segs.map((s) => `<path d="${s.d}" stroke="${edgeOf(color)}" stroke-width="${f1(s.w + 3)}"/>`).join('');
  const b = segs.map((s) => `<path d="${s.d}" stroke="${col(s)}" stroke-width="${f1(s.w)}"/>`).join('');
  const c = segs.map((s) => `<path d="${s.d}" stroke="${lighten(col(s), 0.35)}" stroke-width="${f1(Math.max(1.2, s.w * 0.3))}" stroke-opacity="0.75"/>`).join('');
  const tips = segs
    .filter((s) => s.last)
    .map((s) => `<circle cx="${f1(s.tip[0])}" cy="${f1(s.tip[1])}" r="${f1(s.w * 0.55)}" fill="${tip}"/>`)
    .join('');
  return `<g fill="none" stroke-linecap="round">${a}${b}<g transform="translate(-1.2,-1)">${c}</g></g>${tips}`;
}

function fan(r, x, y, w, h, color) {
  const f = seaFan(r, x, y, w, h);
  const clip = id('fc');
  const mesh = id('mesh');
  const dark = mix(color, INK, 0.45);
  const br = f.branches;
  return `<pattern id="${mesh}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><path d="M0,0L0,6M0,0L6,0" stroke="${lighten(color, 0.1)}" stroke-width="1"/></pattern>
<clipPath id="${clip}"><path d="${f.outline}"/></clipPath>
<path d="${f.outline}" fill="${color}" fill-opacity="0.4"/>
<g clip-path="url(#${clip})"><rect x="${f1(x - w)}" y="${f1(y - h - 10)}" width="${f1(w * 2)}" height="${f1(h + 20)}" fill="url(#${mesh})" fill-opacity="0.38"/>
<g fill="none" stroke-linecap="round">
${br.map((b) => `<path d="${b.d}" stroke="${dark}" stroke-width="${f1(b.w + 1.4)}"/>`).join('')}
${br.map((b) => `<path d="${b.d}" stroke="${color}" stroke-width="${f1(b.w)}"/>`).join('')}
${br.map((b) => `<path d="${b.d}" stroke="${lighten(color, 0.3)}" stroke-width="${f1(Math.max(0.7, b.w * 0.35))}" transform="translate(-0.6,-0.6)"/>`).join('')}
</g></g>
<path d="${f.outline}" fill="none" stroke="${dark}" stroke-opacity="0.5" stroke-width="1.2"/>`;
}

function table(r, x, y, w, h, color) {
  const t = tableCoral(r, x, y, w, h);
  const g = id('tg');
  const bumps = [];
  const nb = Math.round(w / 8);
  for (let i = 0; i < nb; i++) {
    const px = x - w / 2 + 6 + (i / nb) * (w - 12);
    bumps.push(`<circle cx="${f1(px)}" cy="${f1(t.plateY + r.range(-2, 3))}" r="${f1(r.range(2, 3.4))}" fill="${lighten(color, 0.35)}" fill-opacity="0.7"/>`);
  }
  return `<linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(color, 0.3)}"/><stop offset="0.5" stop-color="${color}"/><stop offset="1" stop-color="${mix(color, INK, 0.6)}"/></linearGradient>
<path d="${t.stem}" fill="${mix(color, INK, 0.5)}" stroke="${edgeOf(color)}" stroke-width="1.5"/>
<path d="${t.plate}" fill="url(#${g})" stroke="${edgeOf(color)}" stroke-width="1.8"/>
<path d="${t.topFace}" fill="${lighten(color, 0.22)}" fill-opacity="0.6"/>${bumps.join('')}`;
}

// Brain coral: dome with concentric meandering valleys.
function brain(r, x, y, w, h, color, groove) {
  const d = dome(r, x, y, w, h);
  const clip = id('brc');
  const g = id('brg');
  const lines = [];
  const rings = Math.max(3, Math.round(h / 9));
  for (let k = 1; k <= rings; k++) {
    const s = 1 - k / (rings + 0.6);
    const freq = r.range(5, 9) + k;
    const ph = r.range(0, 6.28);
    const amp = r.range(2, 3.5);
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const a = Math.PI + (i / 40) * Math.PI;
      const wob = Math.sin(a * freq + ph) * amp;
      pts.push([x + Math.cos(a) * (w / 2 * s + wob), y + 2 + Math.sin(a) * (h * s + wob)]);
    }
    lines.push(smooth(pts));
  }
  // a few cross valleys
  for (let i = 0; i < Math.round(w / 30); i++) {
    const a = Math.PI + r.range(0.15, 0.85) * Math.PI;
    const s0 = r.range(0.2, 0.6);
    const s1 = s0 + r.range(0.15, 0.3);
    lines.push(`M${f1(x + Math.cos(a) * w / 2 * s0)},${f1(y + Math.sin(a) * h * s0)}Q${f1(x + Math.cos(a + 0.2) * w / 2 * (s0 + s1) / 2)},${f1(y + Math.sin(a + 0.2) * h * (s0 + s1) / 2)} ${f1(x + Math.cos(a) * w / 2 * s1)},${f1(y + Math.sin(a) * h * s1)}`);
  }
  return `<radialGradient id="${g}" cx="0.42" cy="0.15" r="0.95"><stop offset="0" stop-color="${lighten(color, 0.32)}"/><stop offset="0.6" stop-color="${color}"/><stop offset="1" stop-color="${mix(color, INK, 0.55)}"/></radialGradient>
<clipPath id="${clip}"><path d="${d}"/></clipPath>
<path d="${d}" fill="url(#${g})"/>
<g clip-path="url(#${clip})" fill="none" stroke-linecap="round">
${lines.map((l) => `<path d="${l}" stroke="${groove}" stroke-width="2.6" stroke-opacity="0.7"/>`).join('')}
${lines.map((l) => `<path d="${l}" stroke="${lighten(color, 0.45)}" stroke-width="1.1" stroke-opacity="0.5" transform="translate(-1.4,-1.8)"/>`).join('')}
<ellipse cx="${f1(x)}" cy="${f1(y + 2)}" rx="${f1(w * 0.6)}" ry="${f1(h * 0.35)}" fill="${INK}" fill-opacity="0.25"/>
</g>
<path d="${d}" fill="none" stroke="${edgeOf(color)}" stroke-width="1.8"/>`;
}

function sponges(r, x, y, color, n = 3) {
  const out = [];
  const g = id('sg');
  out.push(`<linearGradient id="${g}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${mix(color, INK, 0.5)}"/><stop offset="0.35" stop-color="${lighten(color, 0.2)}"/><stop offset="0.7" stop-color="${color}"/><stop offset="1" stop-color="${mix(color, INK, 0.55)}"/></linearGradient>`);
  const tubes = [];
  for (let i = 0; i < n; i++) {
    const bx = x + (i - (n - 1) / 2) * r.range(15, 20);
    const h = r.range(45, 95) * (i === Math.floor(n / 2) ? 1.3 : 1);
    const w = r.range(15, 21);
    const lean = (i - (n - 1) / 2) * r.range(8, 14);
    tubes.push({ bx, h, w, lean });
  }
  tubes.sort((a, b) => b.h - a.h);
  for (const t of tubes) {
    const tx = t.bx + t.lean;
    const ty = y - t.h;
    const tw = t.w * 1.2;
    const d = `M${f1(t.bx - t.w / 2)},${f1(y + 4)}C${f1(t.bx - t.w / 2)},${f1(y - t.h * 0.5)} ${f1(tx - tw / 2)},${f1(ty + t.h * 0.25)} ${f1(tx - tw / 2)},${f1(ty)}L${f1(tx + tw / 2)},${f1(ty)}C${f1(tx + tw / 2)},${f1(ty + t.h * 0.25)} ${f1(t.bx + t.w / 2)},${f1(y - t.h * 0.5)} ${f1(t.bx + t.w / 2)},${f1(y + 4)}Z`;
    out.push(`<path d="${d}" fill="url(#${g})" stroke="${edgeOf(color)}" stroke-width="1.6"/>`);
    out.push(`<ellipse cx="${f1(tx)}" cy="${f1(ty)}" rx="${f1(tw / 2)}" ry="${f1(tw * 0.22)}" fill="${lighten(color, 0.25)}" stroke="${edgeOf(color)}" stroke-width="1.4"/>`);
    out.push(`<ellipse cx="${f1(tx)}" cy="${f1(ty + 0.6)}" rx="${f1(tw / 2 - 3.2)}" ry="${f1(tw * 0.22 - 1.8)}" fill="${mix(color, INK, 0.8)}"/>`);
  }
  return out.join('');
}

function toadstool(r, x, y, w, color) {
  const capY = y - w * 0.5;
  const stalk = `M${f1(x - w * 0.16)},${f1(y + 4)}C${f1(x - w * 0.12)},${f1(y - w * 0.2)} ${f1(x - w * 0.12)},${f1(capY)} ${f1(x - w * 0.2)},${f1(capY)}L${f1(x + w * 0.2)},${f1(capY)}C${f1(x + w * 0.12)},${f1(capY)} ${f1(x + w * 0.12)},${f1(y - w * 0.2)} ${f1(x + w * 0.16)},${f1(y + 4)}Z`;
  const cap = blob(r, x, capY, w / 2, w * 0.2, { n: 12, jitter: 0.06 });
  const clip = id('tc');
  const polyps = [];
  for (let i = 0; i < Math.round(w * 0.9); i++) {
    const px = x + r.range(-0.48, 0.48) * w;
    const py = capY + r.range(-0.22, 0.12) * w;
    polyps.push(`<circle cx="${f1(px)}" cy="${f1(py)}" r="${f1(r.range(1, 2))}" fill="${lighten(color, 0.45)}" fill-opacity="0.6"/>`);
  }
  return `<path d="${stalk}" fill="${mix(color, INK, 0.3)}" stroke="${edgeOf(color)}" stroke-width="1.4"/>
<clipPath id="${clip}"><path d="${cap}"/></clipPath>
<path d="${cap}" fill="${color}"/><g clip-path="url(#${clip})">${polyps.join('')}<ellipse cx="${f1(x)}" cy="${f1(capY + w * 0.2)}" rx="${f1(w * 0.55)}" ry="${f1(w * 0.12)}" fill="${INK}" fill-opacity="0.35"/></g>
<path d="${cap}" fill="none" stroke="${edgeOf(color)}" stroke-width="1.6"/>`;
}

// Finger leather coral: a clump of thick, rounded, slightly bent fingers.
function fingers(r, x, y, { color, n = 6, h = 70, w = 16 }) {
  const out = [];
  const g = id('fg');
  out.push(`<linearGradient id="${g}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${mix(color, INK, 0.35)}"/><stop offset="0.4" stop-color="${lighten(color, 0.22)}"/><stop offset="1" stop-color="${mix(color, INK, 0.4)}"/></linearGradient>`);
  const list = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.28 + r.range(-0.1, 0.1);
    const len = h * r.range(0.6, 1.05) * (1 - Math.abs(i - (n - 1) / 2) / n * 0.6);
    const bx = x + (i - (n - 1) / 2) * w * 0.45;
    const bend = r.range(-0.3, 0.3);
    const pts = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      const aa = a + bend * t;
      pts.push([bx + Math.cos(aa) * len * t, y + 6 + Math.sin(aa) * len * t]);
    }
    list.push({ pts, len });
  }
  list.sort((p, q) => p.len - q.len);
  for (const f of list) {
    const d = taper(f.pts, w, w * 0.72);
    out.push(`<path d="${d}" fill="url(#${g})" stroke="${edgeOf(color)}" stroke-width="1.4"/>`);
    const tip = f.pts[f.pts.length - 1];
    out.push(`<circle cx="${f1(tip[0] - 1)}" cy="${f1(tip[1])}" r="${f1(w * 0.22)}" fill="${lighten(color, 0.45)}" fill-opacity="0.7"/>`);
    for (let k = 0; k < 6; k++) {
      const p = f.pts[r.int(1, f.pts.length - 2)];
      out.push(`<circle cx="${f1(p[0] + r.range(-w * 0.3, w * 0.3))}" cy="${f1(p[1] + r.range(-4, 4))}" r="1.3" fill="${lighten(color, 0.5)}" fill-opacity="0.6"/>`);
    }
  }
  return out.join('');
}

// Pillar coral: upright rounded columns with fuzzy polyps.
function pillars(r, x, y, color, n = 4) {
  const out = [];
  const g = id('pg');
  out.push(`<linearGradient id="${g}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${mix(color, INK, 0.45)}"/><stop offset="0.35" stop-color="${lighten(color, 0.2)}"/><stop offset="1" stop-color="${mix(color, INK, 0.5)}"/></linearGradient>`);
  const cols = [];
  for (let i = 0; i < n; i++) cols.push({ px: x + (i - (n - 1) / 2) * 20 + r.range(-4, 4), ph: r.range(55, 130), pw: r.range(15, 21) });
  cols.sort((a, b) => b.ph - a.ph);
  for (const c of cols) {
    out.push(`<rect x="${f1(c.px - c.pw / 2)}" y="${f1(y - c.ph)}" width="${f1(c.pw)}" height="${f1(c.ph + 6)}" rx="${f1(c.pw / 2)}" fill="url(#${g})" stroke="${edgeOf(color)}" stroke-width="1.4"/>`);
    for (let k = 0; k < c.ph / 4; k++) {
      out.push(`<circle cx="${f1(c.px + r.range(-c.pw * 0.42, c.pw * 0.42))}" cy="${f1(y - r.range(0, c.ph - 3))}" r="1.2" fill="${lighten(color, 0.5)}" fill-opacity="0.55"/>`);
    }
  }
  return out.join('');
}

function bubbles(r, x, y, n, color) {
  const out = [];
  const g = id('bg');
  out.push(`<radialGradient id="${g}" cx="0.38" cy="0.3" r="0.75"><stop offset="0" stop-color="#ffffff"/><stop offset="0.35" stop-color="${lighten(color, 0.3)}"/><stop offset="1" stop-color="${mix(color, INK, 0.35)}"/></radialGradient>`);
  const list = [];
  for (let i = 0; i < n; i++) list.push([x + r.range(-1, 1) * n * 2.4, y - r.range(0, 1) * n * 1.6 - 4, r.range(5, 8.5)]);
  list.sort((a, b) => a[1] - b[1]);
  for (const [px, py, pr] of list) out.push(`<circle cx="${f1(px)}" cy="${f1(py)}" r="${f1(pr)}" fill="url(#${g})" stroke="${edgeOf(color)}" stroke-width="1"/>`);
  return out.join('');
}

function zoanthids(r, x, y, n, color, center) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const px = x + r.range(-1, 1) * n * 2.4;
    const py = y + r.range(-6, 4);
    const pr = r.range(3, 5);
    out.push(`<circle cx="${f1(px)}" cy="${f1(py)}" r="${f1(pr)}" fill="${color}" stroke="${mix(color, INK, 0.5)}" stroke-width="1"/><circle cx="${f1(px)}" cy="${f1(py)}" r="${f1(pr * 0.4)}" fill="${center}"/>`);
  }
  return out.join('');
}

function urchin(r, x, y, s) {
  const out = [];
  for (let i = 0; i < 26; i++) {
    const a = Math.PI + (i / 25) * Math.PI + r.range(-0.05, 0.05);
    const l = s * r.range(1.6, 2.6);
    out.push(`<path d="M${f1(x)},${f1(y - s * 0.4)}l${f1(Math.cos(a) * l)},${f1(Math.sin(a) * l)}"/>`);
  }
  return `<g stroke="#20182c" stroke-width="1.4" stroke-linecap="round">${out.join('')}</g><ellipse cx="${f1(x)}" cy="${f1(y - s * 0.35)}" rx="${f1(s)}" ry="${f1(s * 0.75)}" fill="#2a2238"/><ellipse cx="${f1(x - s * 0.3)}" cy="${f1(y - s * 0.65)}" rx="${f1(s * 0.35)}" ry="${f1(s * 0.2)}" fill="#6a5a80" fill-opacity="0.6"/>`;
}

// colour-matrix filter: keep saturation s, then mix toward water colour c by k
function hazeFilter(fid, s, k, c) {
  const off = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  const m = [
    [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s],
  ];
  const rows = m.map((row, i) => `${row.map((v) => (v * (1 - k)).toFixed(4)).join(' ')} 0 ${(off[i] * k).toFixed(4)}`).join('  ');
  return `<filter id="${fid}" filterUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${rows}  0 0 0 1 0"/></filter>`;
}

// ---------- composition ----------

const C = {
  lavender: ['#8e84c6', '#ddd6f8'],
  ochre: ['#b89c5e', '#eedc9e'],
  teal: ['#5fa3a6', '#bde8e0'],
  pink: ['#c4789a', '#f6cfdc'],
  blue: ['#6c8fc8', '#cfe0f6'],
  green: ['#7fa86a', '#d6eab0'],
};
const FAN = { purple: '#9a5a9e', red: '#c0604f', orange: '#d08a4a' };

// Each piece: [dx from cluster centre, horizontal half-extent, painter(r, x, y)]. y is the rock
// surface at x (plus a small embed) so pieces sit on the rock.
const br = (o) => [(r, x, y) => branching(r, x, y + 8, o), o.len * 2.6 + (o.colonies || 1) * o.width];
const PIECES = {
  fan: (w, h, c) => [(r, x, y) => fan(r, x, y + 14, w, h, c), w / 2 + 6],
  fingers: (o) => [(r, x, y) => fingers(r, x, y + 7, o), o.h * 0.8 + o.n * o.w * 0.3],
  pillars: (c, n) => [(r, x, y) => pillars(r, x, y + 8, c, n), n * 12 + 14],
  table: (w, h, c) => [(r, x, y) => table(r, x, y + 8, w, h, c), w / 2 + 4],
  sponges: (c, n) => [(r, x, y) => sponges(r, x, y + 7, c, n), n * 16 + 30],
  bubbles: (n, c) => [(r, x, y) => bubbles(r, x, y + 5, n, c), n * 2.6 + 10],
  brain: (w, h, c, g) => [(r, x, y) => brain(r, x, y + 7, w, h, c, g), w / 2 + 4],
  toadstool: (w, c) => [(r, x, y) => toadstool(r, x, y + 7, w, c), w * 0.6],
  zoanthids: (n, c, m) => [(r, x, y) => zoanthids(r, x, y + 2, n, c, m), n * 2.6 + 6],
  urchin: (s) => [(r, x, y) => urchin(r, x, y + 4, s), s * 2.8],
  branch: br,
};
const P = PIECES;

// Three clusters (centres ~800-900 px apart, wrapping) separated by low stretches. x is absolute
// on the tile (taken mod TILE, so pieces past the edge wrap round).
const CLUSTERS = [380, 1262, 2050];
const BACK = [
  // cluster A
  [200, P.fan(170, 180, FAN.purple)], [330, P.fan(210, 200, FAN.red)], [262, P.fingers({ color: '#b8b48a', n: 7, h: 76, w: 17 })],
  [440, P.branch({ color: C.lavender[0], tip: C.lavender[1], len: 44, width: 11, depth: 3, colonies: 3 })],
  [395, P.branch({ color: C.ochre[0], tip: C.ochre[1], len: 28, width: 9, depth: 3, colonies: 2 })],
  [528, P.pillars('#c2ae86', 4)], [600, P.table(150, 88, '#7aa392')],
  // low stretch
  [800, P.branch({ color: C.pink[0], tip: C.pink[1], len: 22, width: 7, depth: 2, colonies: 2 })], [910, P.fingers({ color: '#9fae86', n: 4, h: 40, w: 12 })],
  // cluster B
  [1085, P.pillars('#b9a27c', 3)], [1150, P.table(170, 96, '#a89a6e')],
  [1232, P.branch({ color: C.teal[0], tip: C.teal[1], len: 46, width: 12, depth: 3, colonies: 2 })],
  [1395, P.fan(210, 200, FAN.purple)], [1300, P.branch({ color: C.lavender[0], tip: C.lavender[1], len: 32, width: 9, depth: 3, colonies: 2 })],
  [1480, P.fan(140, 160, FAN.red)], [1440, P.fingers({ color: '#c7a98a', n: 6, h: 72, w: 16 })],
  // low stretch
  [1650, P.fan(80, 74, FAN.orange)], [1760, P.branch({ color: C.blue[0], tip: C.blue[1], len: 22, width: 7, depth: 2, colonies: 2 })],
  // cluster C
  [1960, P.fan(190, 185, FAN.orange)], [1892, P.fingers({ color: '#a8b88a', n: 6, h: 66, w: 15 })],
  [2045, P.branch({ color: C.blue[0], tip: C.blue[1], len: 42, width: 11, depth: 3, colonies: 3 })],
  [2200, P.fan(180, 180, FAN.purple)], [2118, P.table(150, 88, '#7aa392')], [2282, P.pillars('#c2ae86', 3)],
  [2330, P.branch({ color: C.green[0], tip: C.green[1], len: 30, width: 9, depth: 3, colonies: 2 })],
  // low stretch, wrapping across the tile edge
  [2470, P.table(90, 50, '#8aa38a')], [2590, P.branch({ color: C.ochre[0], tip: C.ochre[1], len: 22, width: 7, depth: 2, colonies: 2 })],
];
const FRONT = [
  // cluster A
  [170, P.zoanthids(7, '#7fc28f', '#d77fa0')], [240, P.sponges('#c98a4c', 3)], [315, P.bubbles(7, '#a8c8a0')],
  [405, P.brain(140, 74, '#b2a66a', '#6f6840')], [490, P.fingers({ color: '#9a6aa6', n: 5, h: 50, w: 13 })],
  [565, P.branch({ color: C.pink[0], tip: C.pink[1], len: 30, width: 9, depth: 3 })], [645, P.toadstool(74, '#c9be93')],
  // low stretch
  [790, P.zoanthids(7, '#7fc28f', '#d77fa0')], [890, P.sponges('#8e5d97', 2)], [975, P.urchin(10)],
  // cluster B
  [1065, P.branch({ color: C.ochre[0], tip: C.ochre[1], len: 30, width: 9, depth: 3 })], [1130, P.zoanthids(6, '#c98fb8', '#f0e08a')],
  [1180, P.urchin(13)], [1250, P.brain(150, 80, '#a8a46c', '#646238')], [1328, P.bubbles(7, '#c8b6d8')],
  [1380, P.branch({ color: C.green[0], tip: C.green[1], len: 26, width: 8, depth: 3 })], [1440, P.sponges('#c9b25a', 3)],
  [1510, P.toadstool(68, '#b9a7c4')],
  // low stretch
  [1640, P.zoanthids(6, '#d8a35c', '#5fb08e')], [1745, P.brain(84, 44, '#9aa878', '#5a6a48')],
  // cluster C
  [1880, P.brain(130, 70, '#8fae7c', '#56704c')], [1965, P.sponges('#8e5d97', 3)], [2040, P.bubbles(6, '#a8c8a0')],
  [2115, P.branch({ color: C.pink[0], tip: C.pink[1], len: 28, width: 9, depth: 3 })], [2185, P.urchin(12)],
  [2255, P.zoanthids(7, '#7fc28f', '#d77fa0')], [2325, P.toadstool(70, '#c9be93')],
  // low stretch, wrapping
  [2455, P.sponges('#c98a4c', 2)], [2545, P.zoanthids(6, '#c98fb8', '#f0e08a')],
];

function place(r, list, heightAt, embed) {
  return list
    .map(([dx, [paint, half]]) => {
      const x = ((dx % W) + W) % W;
      const y = H - heightAt(x) + embed;
      return wrapX(paint(r, x, y), x - half, x + half);
    })
    .join('');
}

export default function reef() {
  uid = 0;
  const r = rng(90210);
  const n1 = pnoise(31, 21);
  const n2 = pnoise(32, 64);
  const n3 = pnoise(33, 28);

  const humpBack = bumps(CLUSTERS.map((c, i) => [c + [20, 20, 0][i], [150, 145, 150][i], 1]));
  const humpFront = bumps(CLUSTERS.map((c, i) => [c + [30, -20, 20][i], [135, 130, 135][i], 1]));
  const hBack = (x) => 168 + 185 * Math.min(1.1, humpBack(x)) + 20 * n1(x) + 8 * n2(x);
  const hFront = (x) => 112 + 140 * Math.min(1.1, humpFront(x)) + 16 * n3(x) + 6 * n2(x + 500);

  const back = [rockLayer(r, hBack, humpBack, { step: [62, 104], size: [70, 125] }), place(r, BACK, hBack, 2)];
  const front = [rockLayer(r, hFront, humpFront, { step: [64, 108], size: [62, 112] }), place(r, FRONT, hFront, 2)];

  const defs = rockDefs() + hazeFilter('hazeBack', 0.8, 0.26, '#1f6a9e') + hazeFilter('hazeFront', 0.9, 0.12, '#1f6a9e');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs>
<g filter="url(#hazeBack)">${back.join('')}</g>
<g filter="url(#hazeFront)">${front.join('')}</g>
</svg>`;
}

// Painters shared with the nearer reef floor (floor.svg.mjs).
export { branching, brain, sponges, toadstool, fingers, zoanthids, urchin, bubbles as bubbleCoral, hazeFilter };
