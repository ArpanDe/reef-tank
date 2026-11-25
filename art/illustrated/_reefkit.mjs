// Geometry for reef features (no colours), shared by far.svg.mjs and reef.svg.mjs.
import { smooth, f1 } from './_lib.mjs';

const UP = -Math.PI / 2;

// Branching coral (staghorn / tree silhouette). Returns [{ d, w, depth, tip:[x,y] }].
export function branchCoral(r, x, y, { len = 60, width = 12, depth = 3, spread = 0.55, lean = 0, shrink = [0.62, 0.82], kidsP = 0.75 } = {}) {
  const out = [];
  const grow = (x0, y0, l, ang, w, d) => {
    const bend = r.range(-0.22, 0.22);
    const mx = x0 + Math.cos(ang) * l * 0.5;
    const my = y0 + Math.sin(ang) * l * 0.5;
    const ex = x0 + Math.cos(ang + bend) * l;
    const ey = y0 + Math.sin(ang + bend) * l;
    out.push({ d: `M${f1(x0)},${f1(y0)}Q${f1(mx)},${f1(my)} ${f1(ex)},${f1(ey)}`, w, depth: d, tip: [ex, ey], last: d >= depth });
    if (d >= depth) return;
    const kids = r() < kidsP ? 2 : 3;
    for (let k = 0; k < kids; k++) {
      const a = ang + bend * 0.5 + spread * (k - (kids - 1) / 2) + r.range(-0.15, 0.15);
      // pull branches back toward vertical so the colony grows upward
      const toUp = (UP - a) * 0.25;
      grow(ex, ey, l * r.range(...shrink), a + toUp, Math.max(2, w * 0.74), d + 1);
    }
  };
  grow(x, y, len, UP + lean, width, 0);
  return out;
}

// Gorgonian sea fan. Returns { outline, branches:[{d,w}] } in a plane facing the viewer.
// Branches are generated to fill the outline; callers clip them to it.
export function seaFan(r, x, y, w, h, maxDepth = 6) {
  const pts = [];
  const n = 16;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = Math.PI + t * Math.PI; // left-bottom -> top -> right-bottom
    const k = 1 + r.range(-0.07, 0.05);
    const px = x + Math.cos(a) * (w / 2) * k;
    let py = y - h * 0.12 + Math.sin(a) * h * 0.88 * k;
    if (t < 0.1 || t > 0.9) py = Math.min(py, y - h * 0.24);
    pts.push([px, py]);
  }
  const outline = smooth([[x - w * 0.04, y], ...pts, [x + w * 0.04, y]], true);
  const branches = [];
  const grow = (x0, y0, l, ang, wd, d) => {
    const ex = x0 + Math.cos(ang) * l;
    const ey = y0 + Math.sin(ang) * l;
    const mx = x0 + Math.cos(ang + r.range(-0.25, 0.25)) * l * 0.5;
    const my = y0 + Math.sin(ang + r.range(-0.25, 0.25)) * l * 0.5;
    branches.push({ d: `M${f1(x0)},${f1(y0)}Q${f1(mx)},${f1(my)} ${f1(ex)},${f1(ey)}`, w: wd });
    if (d >= maxDepth) return;
    const spread = 0.26 + d * 0.03;
    // bias toward the fan's own direction so branches spread out and up
    grow(ex, ey, l * r.range(0.72, 0.88), ang - spread * r.range(0.5, 1.1), Math.max(1, wd * 0.74), d + 1);
    grow(ex, ey, l * r.range(0.72, 0.88), ang + spread * r.range(0.5, 1.1), Math.max(1, wd * 0.74), d + 1);
  };
  const trunk = h * 0.14;
  branches.push({ d: `M${f1(x)},${f1(y + 4)}L${f1(x)},${f1(y - trunk)}`, w: Math.max(3, w * 0.035) });
  const mains = 4;
  for (let i = 0; i < mains; i++) {
    const a = UP + (i - (mains - 1) / 2) * 0.48 + r.range(-0.08, 0.08);
    grow(x, y - trunk, h * 0.27, a, Math.max(2.5, w * 0.028), 1);
  }
  return { outline, branches };
}

// Table (plate) coral on a short stem.
export function tableCoral(r, x, y, w, h) {
  const plateY = y - h * 0.72;
  const th = Math.max(8, h * 0.2);
  const stemW = w * 0.1;
  const stem = `M${f1(x - stemW * 0.9)},${f1(y)}C${f1(x - stemW * 0.5)},${f1(y - h * 0.3)} ${f1(x - stemW * 0.4)},${f1(plateY)} ${f1(x - stemW)},${f1(plateY)}L${f1(x + stemW)},${f1(plateY)}C${f1(x + stemW * 0.4)},${f1(plateY)} ${f1(x + stemW * 0.5)},${f1(y - h * 0.3)} ${f1(x + stemW * 0.9)},${f1(y)}Z`;
  const top = [];
  const bot = [];
  const n = 12;
  const tilt = r.range(-0.06, 0.06) * w;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const px = x - w / 2 + t * w;
    const dome = Math.sin(t * Math.PI);
    const lift = tilt * (t - 0.5);
    top.push([px, plateY - th * 0.55 * dome - lift + r.range(-1.5, 1.5)]);
    bot.push([px, plateY + th * 0.45 * dome - lift + th * 0.15]);
  }
  const plate = smooth([...top, ...bot.reverse()], true);
  const topFace = smooth(top.map(([px, py], i) => [px, py + (i === 0 || i === n ? 0 : th * 0.28)]).concat(top.slice().reverse()), true);
  return { stem, plate, topFace, plateY, th };
}

// Mound with a flat-ish base (brain coral / boulder).
export function dome(r, x, y, w, h, n = 12) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = Math.PI + t * Math.PI;
    const k = 1 + r.range(-0.05, 0.05);
    pts.push([x + Math.cos(a) * (w / 2) * k, y + Math.sin(a) * h * k]);
  }
  return smooth([[x - w / 2, y + 4], ...pts, [x + w / 2, y + 4]], true);
}
