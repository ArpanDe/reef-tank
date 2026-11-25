// Water: 8x180 cells (stretched across the screen by the engine). Aqua-to-navy gradient in many fine
// steps (one every ~2 rows), with row dithering between neighbouring steps so every row differs a
// little and a slow vertical sway never reveals a flat band. Dithering is per row because the image
// is stretched horizontally.
import { waterAt } from './pxlib.mjs';

export default function () {
  const w = 8, h = 180, steps = 90, data = new Uint8Array(w * h * 4);
  const ROW_DITHER = [0.125, 0.625, 0.375, 0.875];
  for (let y = 0; y < h; y++) {
    const f = (y / (h - 1)) * (steps - 1);
    let s = Math.floor(f);
    if (f - s > ROW_DITHER[y % 4]) s += 1;
    const c = waterAt(s / (steps - 1));
    for (let x = 0; x < w; x++) data.set([...c, 255], (y * w + x) * 4);
  }
  return { width: w, height: h, data };
}
