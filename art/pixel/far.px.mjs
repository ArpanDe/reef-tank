// Far layer: 426x100 cells (2556 px), tiles seamlessly. Distant, blue-shifted reef silhouettes in
// two hazy ridges. Ridgelines are sums of sines with whole periods over the tile, features wrap
// around the edges, and the dither pattern is 2 cells wide so it lines up across the seam.
import { Canvas, Mask, rng, mix, hex, waterAt, branchy, seaFan, TILE, dither, psin, pnoise } from './pxlib.mjs';

export default function () {
  const W = TILE, H = 100, TOP = 1080 - H * 6;
  const rand = rng(2024);
  const m = new Mask(W, H, { wrap: true });

  // back ridge (id 1): rolling hills with a few deeper saddles
  const back = (x) => 42 + 8 * psin(x, 2, 1.3) + 5 * psin(x, 5, 0.4) + 2.5 * psin(x, 11, 2) + 1.2 * psin(x, 29, 1) + 9 * Math.max(0, psin(x, 3, 2.2));
  m.ground(back, 1);
  for (const [x, kind] of [[18, 'fan'], [60, 'branch'], [104, 'table'], [150, 'branch'], [196, 'fan'], [246, 'table'], [292, 'branch'], [338, 'fan'], [384, 'branch'], [420, 'table']]) {
    const top = Math.round(back(x));
    if (kind === 'fan') seaFan(m, rand, x, top + 4, 9, 13, 1);
    if (kind === 'branch') branchy(m, rand, x, top + 4, 6, -Math.PI / 2, 1.4, 3, 1, 0.5);
    if (kind === 'table') { m.stroke(x, top + 6, x, top - 2, 1.2, 1, 1); m.ellipse(x, top - 3, 10, 1.6, 1); }
  }
  // front ridge (id 2)
  const front = (x) => 63 + 6 * psin(x, 3, 0.4) + 4 * psin(x, 7, 2) + 2 * psin(x, 17, 0.9) + 1 * psin(x, 41, 0) + 8 * Math.max(0, psin(x, 2, 4.1));
  m.ground(front, 2);
  for (const [x, kind] of [[8, 'branch'], [44, 'table'], [86, 'fan'], [128, 'branch'], [176, 'table'], [222, 'fan'], [270, 'branch'], [318, 'table'], [362, 'fan'], [402, 'branch']]) {
    const top = Math.round(front(x));
    if (kind === 'fan') seaFan(m, rand, x, top + 4, 8, 11, 2);
    if (kind === 'branch') branchy(m, rand, x, top + 4, 5, -Math.PI / 2, 1.2, 3, 2, 0.55);
    if (kind === 'table') { m.stroke(x, top + 6, x, top - 1, 1, 0.8, 2); m.ellipse(x, top - 2, 9, 1.4, 2); }
  }

  const mottle = pnoise(5, 6), fine = pnoise(6, 3);
  const c = new Canvas(W, H, { wrap: true });
  const deep = hex('#0b2a52');
  for (let y = 0; y < H; y++) {
    const wt = waterAt((TOP + y * 6) / 1080);
    for (let x = 0; x < W; x++) {
      const id = m.get(x, y);
      if (!id) continue;
      let d = 0; while (d < 12 && m.get(x, y - d - 1) >= id) d++;   // depth below this ridge's own edge
      // haze darkens with depth; soft mottling keeps big areas from being one flat colour
      const k = (id === 1 ? 0.2 + d * 0.012 : 0.36 + d * 0.016) + (mottle(x, y) - 0.5) * (0.12 + d * 0.008) + (fine(x, y) - 0.5) * 0.06;
      const step = 0.06;
      let q = Math.floor(k / step);
      if (k / step - q > dither(x, y)) q++;
      let col = mix(wt, deep, Math.max(0, q * step));
      if (d === 0) col = mix(wt, hex('#7fc4e0'), id === 1 ? 0.1 : 0.14);  // faint light on top edges
      c.set(x, y, col);
    }
  }
  return c.result();
}
