// 8 x 1080 water: bright aqua at the surface to deep navy at the bottom. One row per pixel, with the
// smooth gradient quantised so every row differs from the one above it (no flat bands), keeping the
// rounding error under one colour level.
import { waterRGB, rgbToHex } from './_lib.mjs';

export default function water() {
  const rows = [];
  let prev = null;
  for (let y = 0; y < 1080; y++) {
    const ideal = waterRGB((y + 0.5) / 1080);
    let best = null;
    let bestErr = Infinity;
    for (let m = 0; m < 8; m++) {
      const c = ideal.map((v, ch) => ((m >> ch) & 1 ? Math.ceil(v) : Math.floor(v)));
      if (prev && c.every((v, ch) => v === prev[ch])) continue;
      const err = c.reduce((e, v, ch) => e + (v - ideal[ch]) ** 2, 0);
      if (err < bestErr) { bestErr = err; best = c; }
    }
    prev = best;
    rows.push(`<rect y="${y}" width="8" height="1" fill="${rgbToHex(best)}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="1080" viewBox="0 0 8 1080" shape-rendering="crispEdges">${rows.join('')}</svg>`;
}
