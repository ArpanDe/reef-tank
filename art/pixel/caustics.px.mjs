// Caustics: 160x90 cells (960x540 px). The dancing sunlight net on a shallow sea floor: a wavy
// cellular web of 1-cell white lines, brighter where strands meet, with a dithered soft glow
// beside them. It falls on the reef and floor only: full strength in rows 50-89, fading out
// (dithered) above that to nothing by row 25. White only; transparent elsewhere. The engine stretches it 2x at low opacity.
import { rng, bayer } from './pxlib.mjs';

export default function () {
  const W = 160, H = 90, data = new Uint8Array(W * H * 4);
  const rand = rng(31337);
  // jittered grid of cell centres
  const pts = [];
  const GX = 16, GY = 9;
  for (let j = -1; j <= GY; j++) for (let i = -1; i <= GX; i++) pts.push([(i + 0.15 + rand() * 0.7) * (W / GX), (j + 0.15 + rand() * 0.7) * (H / GY)]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    // wobble the lookup position so the strands wave instead of running straight
    const wx = x + 1.6 * Math.sin(y / 5.3 + x / 17) + 0.9 * Math.sin(y / 2.1 + 1.3);
    const wy = y + 1.4 * Math.sin(x / 6.1 + y / 13) + 0.8 * Math.sin(x / 2.6 + 0.7);
    let d1 = 1e9, d2 = 1e9, d3 = 1e9;
    for (const [px, py] of pts) {
      const d = Math.hypot(wx - px, wy - py);
      if (d < d1) { d3 = d2; d2 = d1; d1 = d; } else if (d < d2) { d3 = d2; d2 = d; } else if (d < d3) d3 = d;
    }
    const edge = d2 - d1;                 // ~0 on the borders between cells
    const knot = d3 - d1;                 // small where three cells meet
    let a = 0;
    if (edge < 0.9) a = knot < 2.2 ? 255 : 220;
    else if (edge < 2.0) a = bayer(x, y) < 0.5 ? 110 : 0;
    else if (edge < 2.8 && knot < 4) a = bayer(x, y) < 0.25 ? 70 : 0;
    // only the lower part of the tank gets the net: full from row 50 down, dithered fade to nothing by row 25
    const keep = Math.min(1, Math.max(0, (y - 25) / 25));
    if (a && keep > bayer(x + 2, y + 1)) data.set([255, 255, 255, a], (y * W + x) * 4);
  }
  return { width: W, height: H, data };
}
