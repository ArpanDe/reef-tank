// Shared painters for the illustrated reef: corals, sponges, anemones, clams, worms and the living
// cover on reef rock. Used by reef.svg.mjs (midground) and floor.svg.mjs (nearest strip).
// Every painter takes a seeded PRNG `r` and returns an SVG fragment; ids are unique per process.
import { smooth, blob, taper, mix, lighten, darken, f1 } from './_lib.mjs';
import { branchCoral, seaFan, tableCoral, dome } from './_reefkit.mjs';

export const INK = '#141a30'; // shadow / outline base
let uid = 0;
export const id = (p) => `${p}${uid++}`;
export const edgeOf = (c) => mix(c, INK, 0.62);

export function branching(r, x, y, { color, tip, len = 50, width = 12, depth = 3, spread = 0.6, colonies = 1 }) {
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

export function fan(r, x, y, w, h, color) {
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

export function table(r, x, y, w, h, color) {
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
export function brain(r, x, y, w, h, color, groove) {
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

export function sponges(r, x, y, color, n = 3) {
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

export function toadstool(r, x, y, w, color) {
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
export function fingers(r, x, y, { color, n = 6, h = 70, w = 16 }) {
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
export function pillars(r, x, y, color, n = 4) {
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

export function bubbles(r, x, y, n, color) {
  const out = [];
  const g = id('bg');
  out.push(`<radialGradient id="${g}" cx="0.38" cy="0.3" r="0.75"><stop offset="0" stop-color="#ffffff"/><stop offset="0.35" stop-color="${lighten(color, 0.3)}"/><stop offset="1" stop-color="${mix(color, INK, 0.35)}"/></radialGradient>`);
  const list = [];
  for (let i = 0; i < n; i++) list.push([x + r.range(-1, 1) * n * 2.4, y - r.range(0, 1) * n * 1.6 - 4, r.range(5, 8.5)]);
  list.sort((a, b) => a[1] - b[1]);
  for (const [px, py, pr] of list) out.push(`<circle cx="${f1(px)}" cy="${f1(py)}" r="${f1(pr)}" fill="url(#${g})" stroke="${edgeOf(color)}" stroke-width="1"/>`);
  return out.join('');
}

export function zoanthids(r, x, y, n, color, center) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const px = x + r.range(-1, 1) * n * 2.4;
    const py = y + r.range(-6, 4);
    const pr = r.range(3, 5);
    out.push(`<circle cx="${f1(px)}" cy="${f1(py)}" r="${f1(pr)}" fill="${color}" stroke="${mix(color, INK, 0.5)}" stroke-width="1"/><circle cx="${f1(px)}" cy="${f1(py)}" r="${f1(pr * 0.4)}" fill="${center}"/>`);
  }
  return out.join('');
}

export function urchin(r, x, y, s) {
  const out = [];
  for (let i = 0; i < 26; i++) {
    const a = Math.PI + (i / 25) * Math.PI + r.range(-0.05, 0.05);
    const l = s * r.range(1.6, 2.6);
    out.push(`<path d="M${f1(x)},${f1(y - s * 0.4)}l${f1(Math.cos(a) * l)},${f1(Math.sin(a) * l)}"/>`);
  }
  return `<g stroke="#20182c" stroke-width="1.4" stroke-linecap="round">${out.join('')}</g><ellipse cx="${f1(x)}" cy="${f1(y - s * 0.35)}" rx="${f1(s)}" ry="${f1(s * 0.75)}" fill="#2a2238"/><ellipse cx="${f1(x - s * 0.3)}" cy="${f1(y - s * 0.65)}" rx="${f1(s * 0.35)}" ry="${f1(s * 0.2)}" fill="#6a5a80" fill-opacity="0.6"/>`;
}

// Massive boulder coral (porites-like): a lumpy dome covered in fine pores.
export function boulderCoral(r, x, y, w, h, color) {
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
export function plateCoral(r, x, y, w, color) {
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
export function dusters(r, x, y, n, crown, band) {
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
export function xmasWorms(r, x, y, color) {
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
export function mushroom(r, x, y, w, color) {
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

// colour-matrix filter: keep saturation s, then mix toward water colour c by k
export function hazeFilter(fid, s, k, c, w = 2556, h = 600) {
  const off = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  const m = [
    [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s],
  ];
  const rows = m.map((row, i) => `${row.map((v) => (v * (1 - k)).toFixed(4)).join(' ')} 0 ${(off[i] * k).toFixed(4)}`).join('  ');
  return `<filter id="${fid}" filterUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${rows}  0 0 0 1 0"/></filter>`;
}


// ---------- live rock: rock almost completely covered by living colonies ----------

// colony colour + polyp/accent colour: rich natural hues, brighter polyps
export const COVER = [
  ['#3a8a3a', '#b8f070'], ['#d8702a', '#ffd090'], ['#6a2a90', '#7af07a'], ['#b03a7a', '#ffb0d8'],
  ['#1a8a8a', '#a0fff0'], ['#b8922a', '#fff0a0'], ['#a83030', '#ffb0a0'], ['#2a5ab0', '#b0d8ff'],
  ['#5a7a3a', '#f0a0d0'], ['#7a8a2a', '#ffe070'], ['#8a4ab0', '#ffd0ff'], ['#c85a5a', '#ffe0b0'],
];
// shaded fills for the colonies (defs to include once per document)
export const coverDefs = () =>
  COVER.map(([c], i) => `<radialGradient id="cov${i}" cx="0.42" cy="0.28" r="0.8"><stop offset="0" stop-color="${lighten(c, 0.28)}"/><stop offset="0.6" stop-color="${c}"/><stop offset="1" stop-color="${mix(c, INK, 0.4)}"/></radialGradient>`).join('');

// One colony patch: encrusting crust, zoanthid mat, mound cluster or mushroom discs.
export function colony(r, x, y, s, ci) {
  const [c, acc] = COVER[ci];
  const fill = `url(#cov${ci})`;
  const k = r();
  const out = [];
  if (k < 0.45) {
    const d = blob(r, x, y, s, s * r.range(0.45, 0.7), { n: 11, jitter: 0.3 });
    out.push(`<path d="${d}" fill="${fill}" stroke="${mix(c, INK, 0.5)}" stroke-width="1"/>`);
    const n = Math.min(16, Math.round(s * 0.9));
    for (let i = 0; i < n; i++) out.push(`<circle cx="${f1(x + r.range(-0.8, 0.8) * s)}" cy="${f1(y + r.range(-0.45, 0.45) * s)}" r="${f1(r.range(0.7, 1.4))}" fill="${acc}" fill-opacity="0.9"/>`);
  } else if (k < 0.7) {
    const n = Math.min(12, Math.round(s * 0.5) + 3);
    for (let i = 0; i < n; i++) {
      const px = x + r.range(-0.8, 0.8) * s;
      const py = y + r.range(-0.4, 0.4) * s;
      const pr = r.range(2, 3.4);
      out.push(`<circle cx="${f1(px)}" cy="${f1(py)}" r="${f1(pr)}" fill="${c}" stroke="${mix(c, INK, 0.55)}" stroke-width="0.8"/><circle cx="${f1(px)}" cy="${f1(py)}" r="${f1(pr * 0.45)}" fill="${acc}"/>`);
    }
  } else if (k < 0.88) {
    const n = Math.min(6, Math.round(s / 5) + 2);
    for (let i = 0; i < n; i++) {
      const px = x + r.range(-0.7, 0.7) * s;
      const py = y + r.range(-0.3, 0.3) * s;
      const pr = s * r.range(0.28, 0.42);
      out.push(`<ellipse cx="${f1(px)}" cy="${f1(py)}" rx="${f1(pr)}" ry="${f1(pr * 0.8)}" fill="${fill}" stroke="${mix(c, INK, 0.55)}" stroke-width="0.9"/><circle cx="${f1(px + pr * 0.1)}" cy="${f1(py)}" r="${f1(Math.max(0.8, pr * 0.12))}" fill="${acc}"/><circle cx="${f1(px - pr * 0.4)}" cy="${f1(py + pr * 0.2)}" r="0.8" fill="${acc}"/><circle cx="${f1(px + pr * 0.45)}" cy="${f1(py - pr * 0.25)}" r="0.8" fill="${acc}"/>`);
    }
  } else {
    const n = Math.min(5, Math.round(s / 6) + 2);
    for (let i = 0; i < n; i++) {
      const px = x + r.range(-0.7, 0.7) * s;
      const py = y + r.range(-0.3, 0.3) * s;
      const pr = r.range(4.5, 7.5);
      out.push(`<ellipse cx="${f1(px)}" cy="${f1(py)}" rx="${f1(pr)}" ry="${f1(pr * 0.6)}" fill="${fill}" stroke="${mix(c, INK, 0.55)}" stroke-width="0.9"/><path d="M${f1(px - pr * 0.7)},${f1(py)}L${f1(px + pr * 0.7)},${f1(py)}M${f1(px)},${f1(py - pr * 0.45)}L${f1(px)},${f1(py + pr * 0.45)}" stroke="${acc}" stroke-opacity="0.6" stroke-width="0.8"/><circle cx="${f1(px)}" cy="${f1(py)}" r="1.2" fill="${acc}"/>`);
    }
  }
  return out.join('');
}

// Reef rock covered ~85% by colonies; only small dark crevices show between them.
export function liveRock(r, cx, cy, rx, ry) {
  const d = blob(r, cx, cy, rx, ry, { n: 16, jitter: 0.17, flatBottom: true });
  const clip = id('lr');
  const g = id('lg');
  const cover = [];
  const area = Math.PI * rx * ry;
  let filled = 0;
  let guard = 0;
  while (filled < area * 2.3 && guard++ < 400) {
    const s = Math.max(6, Math.min(30, rx * r.range(0.12, 0.27)));
    const a = r.range(0, Math.PI * 2);
    const q = Math.sqrt(r());
    const px = cx + Math.cos(a) * q * rx * 0.98;
    const py = cy + Math.sin(a) * q * ry * 0.95 - ry * 0.05;
    cover.push(colony(r, px, py, s, r.int(0, COVER.length - 1)));
    filled += Math.PI * s * s * 0.58;
  }
  return `<radialGradient id="${g}" cx="0.45" cy="0.15" r="1"><stop offset="0" stop-color="#5a3a5a"/><stop offset="1" stop-color="#1e1428"/></radialGradient>
<clipPath id="${clip}"><path d="${d}"/></clipPath><path d="${d}" fill="url(#${g})"/>
<g clip-path="url(#${clip})">${cover.join('')}<ellipse cx="${f1(cx)}" cy="${f1(cy + ry * 0.75)}" rx="${f1(rx * 1.2)}" ry="${f1(ry * 0.45)}" fill="${INK}" fill-opacity="0.38"/></g>
<path d="${d}" fill="none" stroke="${INK}" stroke-opacity="0.55" stroke-width="1.6"/>`;
}

// ---------- sponges, anemones, clams, carpets, soft corals ----------

export function barrel(r, x, y, w, h, color) {
  const g = id('br');
  const top = y - h;
  const d = `M${f1(x - w * 0.32)},${f1(y + 3)}C${f1(x - w * 0.42)},${f1(y - h * 0.5)} ${f1(x - w * 0.56)},${f1(top + h * 0.2)} ${f1(x - w / 2)},${f1(top)}L${f1(x + w / 2)},${f1(top)}C${f1(x + w * 0.56)},${f1(top + h * 0.2)} ${f1(x + w * 0.42)},${f1(y - h * 0.5)} ${f1(x + w * 0.32)},${f1(y + 3)}Z`;
  const ridges = [];
  for (let i = -3; i <= 3; i++) {
    const t = i / 3.6;
    ridges.push(`M${f1(x + t * w * 0.32)},${f1(y)}C${f1(x + t * w * 0.42)},${f1(y - h * 0.5)} ${f1(x + t * w * 0.54)},${f1(top + h * 0.2)} ${f1(x + t * w * 0.5)},${f1(top + 2)}`);
  }
  return `<linearGradient id="${g}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${mix(color, INK, 0.45)}"/><stop offset="0.35" stop-color="${lighten(color, 0.25)}"/><stop offset="0.75" stop-color="${color}"/><stop offset="1" stop-color="${mix(color, INK, 0.5)}"/></linearGradient>
<path d="${d}" fill="url(#${g})" stroke="${edgeOf(color)}" stroke-width="1.6"/>
<path d="${ridges.join('')}" stroke="${darken(color, 0.3)}" stroke-opacity="0.55" stroke-width="2" fill="none"/>
<path d="${ridges.join('')}" stroke="${lighten(color, 0.4)}" stroke-opacity="0.4" stroke-width="1" fill="none" transform="translate(-1.6,0)"/>
<ellipse cx="${f1(x)}" cy="${f1(top)}" rx="${f1(w / 2)}" ry="${f1(w * 0.14)}" fill="${lighten(color, 0.2)}" stroke="${edgeOf(color)}" stroke-width="1.4"/>
<ellipse cx="${f1(x)}" cy="${f1(top + 1)}" rx="${f1(w / 2 - 5)}" ry="${f1(w * 0.14 - 3)}" fill="${mix(color, INK, 0.8)}"/>`;
}

// Anemone seen side-on: a dense mop of tentacles from a short coloured column.
export function anemone(r, x, y, w, base, tip) {
  const out = [];
  const g = id('an');
  out.push(`<radialGradient id="${g}" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${lighten(tip, 0.4)}"/><stop offset="1" stop-color="${tip}"/></radialGradient>`);
  const discY = y - w * 0.16;
  out.push(`<path d="M${f1(x - w * 0.2)},${f1(y + 3)}C${f1(x - w * 0.2)},${f1(discY + 4)} ${f1(x - w * 0.26)},${f1(discY)} ${f1(x - w * 0.3)},${f1(discY)}L${f1(x + w * 0.3)},${f1(discY)}C${f1(x + w * 0.26)},${f1(discY)} ${f1(x + w * 0.2)},${f1(discY + 4)} ${f1(x + w * 0.2)},${f1(y + 3)}Z" fill="${base}" stroke="${edgeOf(base)}" stroke-width="1.2"/>`);
  for (const layer of [0, 1]) {
    const n = layer ? 26 : 22;
    for (let i = 0; i < n; i++) {
      const u = (i + r.range(-0.3, 0.3)) / (n - 1);
      const a = -Math.PI / 2 + (u - 0.5) * (layer ? 3.0 : 3.4);
      const len = w * r.range(0.32, 0.46) * (layer ? 1 : 0.95);
      const droop = Math.cos(a) * r.range(0.2, 0.6);
      const bx = x + Math.cos(a) * w * 0.22;
      const by = discY - (layer ? 0 : 3);
      const pts = [];
      for (let t = 0; t <= 1.0001; t += 0.25) {
        const aa = a + droop * t;
        pts.push([bx + Math.cos(aa) * len * t, by + Math.sin(aa) * len * t * 0.9]);
      }
      const tp = pts[pts.length - 1];
      const col = layer ? base : mix(base, INK, 0.3);
      out.push(`<path d="${taper(pts, w * 0.07, w * 0.05)}" fill="${col}" stroke="${edgeOf(base)}" stroke-width="0.8"/>`);
      out.push(`<circle cx="${f1(tp[0])}" cy="${f1(tp[1])}" r="${f1(w * 0.045)}" fill="${layer ? `url(#${g})` : mix(tip, INK, 0.3)}" stroke="${edgeOf(tip)}" stroke-width="0.7"/>`);
    }
  }
  return out.join('');
}

// Giant clam set into the reef: wavy shell lips with an iridescent mantle between them.
export function clam(r, x, y, w, [m1, m2]) {
  const g = id('cm');
  const hgt = w * 0.24;
  const waves = 7;
  const lip = (k, amp) => {
    const pts = [];
    for (let i = 0; i <= 28; i++) {
      const t = i / 28;
      const a = Math.PI + t * Math.PI;
      const wav = Math.sin(t * Math.PI * waves) * amp;
      pts.push([x + Math.cos(a) * (w / 2) * k, y - hgt * 0.4 + Math.sin(a) * (hgt + wav) * k]);
    }
    for (let i = 28; i >= 0; i--) {
      const t = i / 28;
      const a = Math.PI - t * Math.PI;
      const wav = Math.sin(t * Math.PI * waves) * amp * 0.6;
      pts.push([x + Math.cos(a) * (w / 2) * k, y - hgt * 0.4 + Math.sin(a) * (hgt * 0.55 + wav) * k]);
    }
    return smooth(pts, true);
  };
  const spots = [];
  for (let i = 0; i < Math.round(w / 3); i++) {
    spots.push(`<circle cx="${f1(x + r.range(-0.42, 0.42) * w)}" cy="${f1(y - hgt * 0.4 + r.range(-0.6, 0.35) * hgt)}" r="${f1(r.range(0.8, 1.8))}" fill="${r() < 0.5 ? '#c8fff4' : '#2a1a6a'}" fill-opacity="0.75"/>`);
  }
  const clip = id('cc');
  const mantle = lip(0.86, 2.5);
  return `<linearGradient id="${g}" x1="0" y1="0" x2="1" y2="0.3"><stop offset="0" stop-color="${m2}"/><stop offset="0.45" stop-color="${m1}"/><stop offset="0.6" stop-color="${lighten(m1, 0.35)}"/><stop offset="1" stop-color="${m2}"/></linearGradient>
<path d="${lip(1, 3.5)}" fill="#c4b49a" stroke="#4a3e30" stroke-width="1.4"/>
<clipPath id="${clip}"><path d="${mantle}"/></clipPath>
<path d="${mantle}" fill="url(#${g})"/><g clip-path="url(#${clip})">${spots.join('')}<path d="M${f1(x - w * 0.42)},${f1(y - hgt * 0.4)}Q${f1(x)},${f1(y - hgt * 0.9)} ${f1(x + w * 0.42)},${f1(y - hgt * 0.4)}" stroke="#ffffff" stroke-opacity="0.35" stroke-width="2" fill="none"/></g>
<path d="${mantle}" fill="none" stroke="${mix(m2, INK, 0.5)}" stroke-width="1"/>
<ellipse cx="${f1(x + w * 0.12)}" cy="${f1(y - hgt * 0.5)}" rx="${f1(w * 0.05)}" ry="${f1(w * 0.025)}" fill="#0e0a20" stroke="#e8f0ff" stroke-width="0.8"/>`;
}

// Low colourful mat for sand or rock: zoanthids, green star polyps, mushroom discs or tube polyps.
export function carpet(r, x, y, w, kind, [c, acc]) {
  const out = [];
  if (kind === 'gsp') {
    out.push(`<path d="${blob(r, x, y, w / 2, w * 0.13, { n: 12, jitter: 0.22 })}" fill="${c}" stroke="${mix(c, INK, 0.5)}" stroke-width="1"/>`);
    for (let i = 0; i < Math.round(w * 0.9); i++) {
      const px = x + r.range(-0.46, 0.46) * w;
      const py = y + r.range(-0.12, 0.08) * w;
      out.push(`<path d="M${f1(px)},${f1(py)}l${f1(r.range(-1.5, 1.5))},${f1(-r.range(2, 4))}" stroke="${acc}" stroke-width="1.3" stroke-linecap="round"/>`);
    }
  } else if (kind === 'mush') {
    const n = Math.max(3, Math.round(w / 9));
    for (let i = 0; i < n; i++) {
      const px = x + r.range(-0.42, 0.42) * w;
      const py = y + r.range(-0.08, 0.06) * w;
      const pr = r.range(5, 8.5);
      out.push({ py, s: `<ellipse cx="${f1(px)}" cy="${f1(py)}" rx="${f1(pr)}" ry="${f1(pr * 0.5)}" fill="${c}" stroke="${mix(c, INK, 0.5)}" stroke-width="0.9"/><ellipse cx="${f1(px)}" cy="${f1(py - pr * 0.08)}" rx="${f1(pr * 0.55)}" ry="${f1(pr * 0.24)}" fill="${lighten(c, 0.3)}" fill-opacity="0.55"/><circle cx="${f1(px)}" cy="${f1(py)}" r="1.3" fill="${acc}"/>` });
    }
  } else if (kind === 'polyp') {
    const n = Math.max(4, Math.round(w / 5));
    for (let i = 0; i < n; i++) {
      const px = x + r.range(-0.45, 0.45) * w;
      const h = r.range(4, 9);
      out.push({ py: y, s: `<path d="M${f1(px)},${f1(y + 1)}L${f1(px + r.range(-1, 1))},${f1(y - h)}" stroke="${c}" stroke-width="2.6" stroke-linecap="round"/><circle cx="${f1(px)}" cy="${f1(y - h)}" r="2.2" fill="${acc}" stroke="${mix(c, INK, 0.4)}" stroke-width="0.6"/>` });
    }
  } else {
    const n = Math.max(5, Math.round(w / 4.5));
    for (let i = 0; i < n; i++) {
      const px = x + r.range(-0.46, 0.46) * w;
      const py = y + r.range(-0.1, 0.06) * w;
      const pr = r.range(2.5, 4);
      out.push({ py, s: `<ellipse cx="${f1(px)}" cy="${f1(py)}" rx="${f1(pr)}" ry="${f1(pr * 0.75)}" fill="${c}" stroke="${mix(c, INK, 0.5)}" stroke-width="0.8"/><ellipse cx="${f1(px)}" cy="${f1(py)}" rx="${f1(pr * 0.45)}" ry="${f1(pr * 0.35)}" fill="${acc}"/>` });
    }
  }
  return out.map((o) => (typeof o === 'string' ? o : o)).sort((a, b) => (a.py ?? -1e9) - (b.py ?? -1e9)).map((o) => (typeof o === 'string' ? o : o.s)).join('');
}

// Small soft-coral tree (Dendronephthya-like): translucent stalk, clustered polyp heads.
export function softTree(r, x, y, h, color) {
  const out = [];
  const g = id('st');
  out.push(`<radialGradient id="${g}" cx="0.38" cy="0.3" r="0.75"><stop offset="0" stop-color="${lighten(color, 0.55)}"/><stop offset="0.5" stop-color="${color}"/><stop offset="1" stop-color="${mix(color, INK, 0.45)}"/></radialGradient>`);
  const stalk = mix(color, '#f4e4ec', 0.6);
  const top = [x + r.range(-4, 4), y - h * 0.45];
  out.push(`<path d="${taper([[x, y + 3], [(x + top[0]) / 2, y - h * 0.2], top], h * 0.12, h * 0.08)}" fill="${stalk}" fill-opacity="0.9" stroke="${edgeOf(color)}" stroke-width="1"/>`);
  const heads = [];
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + r.range(-1.2, 1.2);
    const d = r.range(0.25, 0.55) * h;
    const hx = top[0] + Math.cos(a) * d * 0.8;
    const hy = top[1] + Math.sin(a) * d * 0.9;
    out.push(`<path d="M${f1(top[0])},${f1(top[1])}L${f1(hx)},${f1(hy)}" stroke="${stalk}" stroke-width="${f1(h * 0.04 + 1)}" stroke-linecap="round"/>`);
    heads.push([hx, hy, h * r.range(0.1, 0.15)]);
  }
  heads.sort((a, b) => a[1] - b[1]);
  for (const [hx, hy, s] of heads) {
    out.push(`<ellipse cx="${f1(hx)}" cy="${f1(hy)}" rx="${f1(s)}" ry="${f1(s * 0.85)}" fill="${mix(color, INK, 0.4)}"/>`);
    for (let k = 0; k < 6; k++) out.push(`<circle cx="${f1(hx + r.range(-0.7, 0.7) * s)}" cy="${f1(hy + r.range(-0.6, 0.6) * s)}" r="${f1(s * r.range(0.32, 0.45))}" fill="url(#${g})" stroke="${edgeOf(color)}" stroke-width="0.6"/>`);
  }
  return out.join('');
}
