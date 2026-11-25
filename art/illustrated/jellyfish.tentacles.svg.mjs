// Jellyfish oral arms (frilly ribbons) and fine marginal tentacles. They start well up inside the
// bell so nothing separates when the bell pulses. Seeded for repeatable builds.
import { rng, smooth, f1 } from './_lib.mjs';

export default function tentacles() {
  const r = rng(2718);
  const out = [];
  // fine marginal tentacles from the rim
  for (let i = 0; i < 14; i++) {
    const x0 = 22 + (i / 13) * 116 + r.range(-3, 3);
    const len = r.range(130, 196);
    const ph = r.range(0, 6.28);
    const amp = r.range(4, 9);
    const pts = [];
    for (let y = 88; y <= 96 + len; y += 10) {
      const t = (y - 96) / len;
      const drift = (x0 - 80) * 0.25 * Math.max(0, t);
      pts.push([x0 + drift + Math.sin(ph + y / 26) * amp * Math.max(0, t), Math.min(y, 296)]);
    }
    out.push(`<path d="${smooth(pts)}" stroke="#ffc4dc" stroke-opacity="${f1(r.range(0.55, 0.8))}" stroke-width="${f1(r.range(1.6, 2.2))}" fill="none" stroke-linecap="round"/>`);
  }
  // oral arms: four frilled ribbons from the centre
  for (let a = 0; a < 4; a++) {
    const x0 = 66 + a * 9.5;
    const len = r.range(130, 165);
    const ph = r.range(0, 6.28);
    const sway = (a - 1.5) * 5;
    const L = [];
    const R = [];
    for (let y = 70; y <= 96 + len; y += 4) {
      const t = Math.max(0, (y - 96) / len);
      const cx = x0 + Math.sin(ph + y / 22) * 6 * t + sway * t;
      const w = (9 - 5 * t) * (1 + 0.3 * Math.sin(y / 3.2 + a));
      L.push([cx - w / 2, y]);
      R.push([cx + w / 2 + 0.3 * Math.sin(y / 2.6), y]);
    }
    const d = smooth([...L, ...R.reverse()], true);
    out.push(`<path d="${d}" fill="#f7a6c9" fill-opacity="0.55" stroke="#d65e98" stroke-opacity="0.7" stroke-width="1.2" stroke-linejoin="round"/>`);
    out.push(`<path d="${smooth(L.map(([x, y], i) => [(x + R[R.length - 1 - i][0]) / 2, y]))}" stroke="#ffffff" stroke-opacity="0.35" stroke-width="1.2" fill="none"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="300" viewBox="0 0 160 300">${out.join('')}</svg>`;
}
