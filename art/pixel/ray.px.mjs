// Light ray: 60x183 cells, white, alpha stepped in 4 levels with ordered dithering between them.
// Brightest at the top centre; widens downward and fades out toward the edges and the floor.
import { bayer } from './pxlib.mjs';

export default function () {
  const w = 60, h = 183, data = new Uint8Array(w * h * 4);
  const LEVELS = [0, 70, 130, 190, 245];
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    const half = 9 + 20 * t;            // half width in cells
    const cx = 30 + 3 * t;              // a slight lean
    for (let x = 0; x < w; x++) {
      const d = Math.abs(x + 0.5 - cx) / half;
      if (d >= 1) continue;
      const across = 1 - d * d;
      const down = Math.pow(1 - t, 1.3) * (t < 0.04 ? t / 0.04 * 0.5 + 0.5 : 1);
      const v = across * down * (LEVELS.length - 1);
      let lvl = Math.floor(v);
      if (v - lvl > bayer(x, y)) lvl += 1;
      const a = LEVELS[Math.min(lvl, LEVELS.length - 1)];
      if (!a) continue;
      data.set([255, 255, 255, a], (y * w + x) * 4);
    }
  }
  return { width: w, height: h, data };
}
