"""Procedural reef fish (the source of the Realistic and Pixel art styles).

A fish is lofted from three side/top profiles (top edge, bottom edge, half-width) along its body,
with separate fin sheets, eyes, and a skin texture painted with numpy and projected from the side.
Species are described as data in SPECIES below. The seahorse, which stands upright, has its own
builder (build_seahorse) made of lofted tubes along curved centerlines.

Body coordinates: the snout is at x = L (facing +X, which is screen right), the tail root
(peduncle) at x = 0, and the caudal fin extends to negative x. Z is up, the camera looks along +Y
from negative Y, so -Y is the side facing the viewer.
"""

import math

import bmesh
import bpy
import numpy as np

from common import (Nodes, sock, assign, image_from_array, mesh_object, new_material, profile, sheet,
                    side_projection, smoothstep, srgb, subdivide)


# ---------- painting helpers ----------

def mix(base, color, mask):
    """Blends color over base by mask (arrays of shape (..., 3) and (...))."""
    m = np.asarray(mask)[..., None]
    return base * (1 - m) + np.asarray(color, dtype=np.float64) * m


def catmull_rom(points, n):
    """About n points along a Catmull-Rom spline through points (a list of 2D tuples)."""
    P = np.asarray(points, dtype=float)
    if len(P) < 3:
        return np.array([P[0] + (P[-1] - P[0]) * s for s in np.linspace(0, 1, max(n, 2))])
    ext = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]])
    segs = len(P) - 1
    m = max(2, n // segs)
    out = []
    for i in range(segs):
        p0, p1, p2, p3 = ext[i:i + 4]
        for k in range(m):
            s = k / m
            out.append(0.5 * (2 * p1 + (p2 - p0) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * s * s
                              + (3 * p1 - p0 - 3 * p2 + p3) * s ** 3))
    out.append(P[-1])
    return np.array(out)


class Painter:
    """Pattern helpers for a skin texture. Shapes are placed in body coordinates (t: 0 snout .. 1
    tail root, q: -1 belly .. +1 back) and measured in the side view, in units of body length."""

    def __init__(self, shape, T, Q, X, Z):
        L = shape['L']
        self.shape, self.T, self.Q = shape, T, Q
        self.X, self.Z = X / L, Z / L
        self.xs, self.zs = self.X[0], self.Z[:, 0]

    def xz(self, t, q):
        x, _, z = surface_point(self.shape, t, q)
        return x / self.shape['L'], z / self.shape['L']

    def path(self, pts, n=72):
        return np.array([self.xz(t, q) for t, q in catmull_rom(pts, n)])

    def _window(self, x0, x1, z0, z1):
        c0, c1 = np.searchsorted(self.xs, x0), np.searchsorted(self.xs, x1)
        r0, r1 = np.searchsorted(self.zs, z0), np.searchsorted(self.zs, z1)
        return slice(r0, max(r1, r0 + 1)), slice(c0, max(c1, c0 + 1))

    def _nearest(self, poly, reach):
        rs, cs = self._window(poly[:, 0].min() - reach, poly[:, 0].max() + reach,
                              poly[:, 1].min() - reach, poly[:, 1].max() + reach)
        X, Z = self.X[rs, cs], self.Z[rs, cs]
        seg = np.hypot(*np.diff(poly, axis=0).T)
        cum = np.concatenate([[0], np.cumsum(seg)])
        total = max(cum[-1], 1e-9)
        best = np.full(X.shape, 9.0)
        along = np.zeros(X.shape)
        for i in range(len(poly) - 1):
            ax, az = poly[i]
            vx, vz = poly[i + 1] - poly[i]
            h = np.clip(((X - ax) * vx + (Z - az) * vz) / max(vx * vx + vz * vz, 1e-12), 0, 1)
            d = np.hypot(X - ax - h * vx, Z - az - h * vz)
            m = d < best
            best = np.where(m, d, best)
            along = np.where(m, (cum[i] + h * seg[i]) / total, along)
        return rs, cs, best, along

    def line(self, pts, width, soft=0.005):
        """A band along a smooth path. width: half-width, or a list varying along the path."""
        widths = np.atleast_1d(np.asarray(width, dtype=float))
        rs, cs, d, s = self._nearest(self.path(pts), widths.max() + 2 * soft)
        w = widths[0] if len(widths) == 1 else np.interp(s, np.linspace(0, 1, len(widths)), widths)
        out = np.zeros(self.X.shape)
        out[rs, cs] = 1 - smoothstep(w - soft, w + soft, d)
        return out

    def fill(self, pts, soft=0.005):
        """Inside of a closed smooth path."""
        poly = self.path(list(pts) + [pts[0]])
        rs, cs, d, _ = self._nearest(poly, 2 * soft)
        X, Z = self.X[rs, cs], self.Z[rs, cs]
        inside = np.zeros(X.shape, dtype=bool)
        for i in range(len(poly) - 1):
            (x1, z1), (x2, z2) = poly[i], poly[i + 1]
            cross = (z1 > Z) != (z2 > Z)
            xi = x1 + (Z - z1) * (x2 - x1) / np.where(abs(z2 - z1) < 1e-12, 1e-12, z2 - z1)
            inside ^= cross & (X < xi)
        e = smoothstep(0, soft, d)
        out = np.zeros(self.X.shape)
        out[rs, cs] = np.where(inside, 0.5 + 0.5 * e, 0.5 - 0.5 * e)
        return out

    def disc(self, t, q, r, soft=0.005, squash=1.0):
        cx, cz = self.xz(t, q)
        return self.disc_xz(cx, cz, r, soft, squash)

    def disc_xz(self, cx, cz, r, soft=0.005, squash=1.0, out=None):
        reach = r + 2 * soft
        rs, cs = self._window(cx - reach, cx + reach, cz - reach * squash, cz + reach * squash)
        d = np.hypot(self.X[rs, cs] - cx, (self.Z[rs, cs] - cz) / squash)
        if out is None:
            out = np.zeros(self.X.shape)
        out[rs, cs] = np.maximum(out[rs, cs], 1 - smoothstep(r - soft, r + soft, d))
        return out

    def tq(self, x, z):
        """Body coordinates of a side-view point (x, z in body lengths)."""
        s = self.shape
        t = min(max(1 - x, 0.0), 1.0)
        zc = s['zc'](t) / s['L']
        h = (s['top'](t) if z >= zc else s['bot'](t)) / s['L']
        return t, (z - zc) / max(h, 1e-4)


def scales(p, size, stretch=1.25, seed=3):
    """Scale-row pattern: 0 at scale centers, 1 on their rims (offset rows, like real scales).
    Each scale's exposed edge faces the tail, so the rim is weighted toward -x."""
    rng = np.random.default_rng(seed)
    jitter = rng.uniform(-0.12, 0.12, 4096)
    x = p.X / size
    z = p.Z / (size / stretch)
    row = np.floor(z)
    xs = x + 0.5 * (row % 2) + jitter[(row.astype(int) * 7) % 4096]
    cell = np.floor(xs)
    fx = xs - cell - 0.5
    fz = z - row - 0.5
    d = np.hypot(fx * 1.15 + 0.12, fz)
    d = d + 0.06 * jitter[(cell.astype(int) * 13 + row.astype(int) * 31) % 4096]
    return np.clip(d * 2.0, 0, 1)


def shade(t, q, base, back, belly, back_amt=0.6, belly_amt=0.5, back_from=0.2, belly_from=-0.3):
    """Countershading: a darker back and paler belly over a base color."""
    col = np.asarray(base, dtype=np.float64)[None, None, :] * np.ones(t.shape + (1,))
    col = mix(col, back, smoothstep(back_from, 1.0, q) * back_amt)
    return mix(col, belly, smoothstep(belly_from, -1.0, q) * belly_amt)


# ---------- species: skins ----------

def clownfish_skin(t, q, ctx):
    """t: 0 at snout .. 1 at tail root. q: -1 belly .. +1 back (relative to the body edges).
    Returns (rgb, extra) arrays of shape t.shape + (3,)."""
    orange = srgb('#f2661a')
    deep = srgb('#d9480c')
    light = srgb('#f9a052')
    white = srgb('#f6f3ea')
    black = srgb('#15100d')

    base = orange[None, None, :] * np.ones(t.shape + (1,))
    back = smoothstep(0.2, 1.0, q)[..., None]
    belly = smoothstep(-0.3, -1.0, q)[..., None]
    base = base * (1 - back * 0.6) + deep * back * 0.6
    base = base * (1 - belly * 0.5) + light * belly * 0.5

    def band(center, half, edge=0.018):
        d = np.abs(t - center)
        inner = 1 - smoothstep(half - 0.007, half + 0.007, d)
        outer = 1 - smoothstep(half + edge - 0.007, half + edge + 0.007, d)
        return inner, outer

    bands = [
        (0.265 - 0.045 * q**2, 0.045),
        (0.555 - 0.085 * np.exp(-(q / 0.5) ** 2), 0.05),
        (0.935, 0.03),
    ]
    color = base
    for center, half in bands:
        inner, outer = band(center, half)
        color = color * (1 - outer[..., None]) + black * outer[..., None]
        color = color * (1 - inner[..., None]) + white * inner[..., None]

    # Lips: a darker line at the mouth.
    mouth = smoothstep(0.045, 0.02, t) * np.exp(-((q + 0.08) / 0.12) ** 2)
    color = color * (1 - mouth[..., None] * 0.7) + black * mouth[..., None] * 0.7
    return color


def bluetang_skin(t, q, p):
    """Royal blue with the black 'palette': a band from the eye along the back that sweeps down to
    the tail root, and a loop off it enclosing a blue oval on the flank. Yellow wedge on the
    peduncle."""
    black = srgb('#090b16')
    col = shade(t, q, srgb('#1d52dc'), srgb('#1a3aa6'), srgb('#4f9cf2'), 0.55, 0.6, 0.35, -0.15)
    # Slightly brighter face and a bluer, lighter cheek.
    col = mix(col, srgb('#2f6cec'), smoothstep(0.3, 0.05, t) * 0.5)
    upper = p.line([(0.1, 0.38), (0.2, 0.52), (0.35, 0.6), (0.5, 0.6), (0.65, 0.52), (0.78, 0.36),
                    (0.88, 0.17), (0.95, 0.04), (1.0, 0.0)],
                   [0.022, 0.04, 0.047, 0.05, 0.048, 0.045, 0.045, 0.05, 0.06], soft=0.005)
    loop = p.line([(0.29, 0.52), (0.31, 0.2), (0.38, -0.06), (0.5, -0.2), (0.64, -0.17), (0.75, 0.0),
                   (0.8, 0.26)], [0.03, 0.03, 0.032, 0.034, 0.034, 0.032, 0.03], soft=0.005)
    col = mix(col, black, np.maximum(upper, loop))
    # The yellow of the tail runs forward onto the peduncle as a wedge.
    wedge = p.fill([(0.84, 0.0), (0.95, 0.3), (1.04, 0.62), (1.04, -0.62), (0.95, -0.3)], soft=0.006)
    col = mix(col, srgb('#ffcf1f'), wedge)
    mouth = p.line([(0.0, -0.1), (0.035, -0.12)], 0.006, soft=0.004)
    return mix(col, srgb('#10183a'), mouth * 0.8)


def yellowtang_skin(t, q, p):
    """Lemon yellow all over, faint lengthwise lines, and the white scalpel spine by the tail."""
    # Warmer (more orange) toward the belly, so the blue fill light below doesn't turn it olive.
    col = shade(t, q, srgb('#ffd200'), srgb('#ffdc00'), srgb('#ffa800'), 0.5, 0.8, 0.2, 0.2)
    lines = 0.5 + 0.5 * np.cos(2 * np.pi * p.Z / 0.03)
    col = mix(col, srgb('#ffb000'), lines ** 6 * smoothstep(0.25, 0.4, t) * 0.2)
    spine_rim = p.line([(0.865, -0.02), (0.945, 0.04)], 0.024, soft=0.004)
    spine = p.line([(0.865, -0.02), (0.945, 0.04)], [0.006, 0.016], soft=0.004)
    col = mix(col, srgb('#c9a640'), spine_rim * 0.6)
    col = mix(col, srgb('#fbfbf4'), spine)
    mouth = p.line([(0.0, -0.05), (0.03, -0.1)], 0.007, soft=0.003)
    return mix(col, srgb('#6a4a10'), mouth * 0.7)


def angelfish_skin(t, q, p):
    """Queen-angel-like: gold-green scaled flank shading to blue on the back and face, a dark
    'crown' ringed in electric blue on the forehead, blue rim on the gill cover."""
    gold = srgb('#f7cf1e')
    teal = srgb('#2f9ab0')
    blue = srgb('#2449b8')
    ebl = srgb('#3ec4ff')
    sc = scales(p, 0.026)
    rim = smoothstep(0.6, 0.98, sc)
    flank = mix(gold[None, None, :] * np.ones(t.shape + (1,)), teal, 0.15 + 0.4 * smoothstep(-0.6, 0.6, q))
    flank = mix(flank, srgb('#1f7aa0'), rim * 0.45)
    back = smoothstep(0.3, 0.95, q)
    col = mix(flank, blue, back * 0.8)
    belly = smoothstep(-0.35, -0.95, q)
    col = mix(col, srgb('#ffd52a'), belly * 0.5)
    face = smoothstep(0.31, 0.2, t)
    col = mix(col, mix(srgb('#3266c8')[None, None, :] * np.ones(t.shape + (1,)), srgb('#f0c030'),
                       smoothstep(0.05, -0.6, q)), face)
    gill = p.line([(0.25, 0.6), (0.3, 0.2), (0.31, -0.2), (0.27, -0.6)], 0.011, soft=0.004)
    col = mix(col, ebl, gill * 0.9)
    # The 'crown' sits on the nape, in front of the dorsal fin, so it can't read as an eye.
    # The 'crown': a dark speckled patch on the nape (no bright ring, so it can't read as an eye).
    col = mix(col, srgb('#10205a'), p.disc(0.35, 0.8, 0.045, soft=0.012, squash=1.3) * 0.9)
    for dt, dq in ((-0.015, 0.0), (0.012, 0.08), (0.002, -0.09), (0.02, -0.02), (-0.006, 0.06),
                   (0.03, 0.05), (-0.022, -0.06)):
        col = mix(col, srgb('#3a8af0'), p.disc(0.35 + dt, 0.8 + dq, 0.006, soft=0.003) * 0.9)
    lips = p.line([(0.0, -0.05), (0.04, -0.08)], 0.012, soft=0.004)
    return mix(col, srgb('#2a4cc0'), lips * 0.8)


def pufferfish_skin(t, q, p):
    """Warm olive-brown back scattered with white spots, a white belly, a dark ring around the
    pectoral fin base."""
    rng = np.random.default_rng(7)
    col = shade(t, q, srgb('#9a7e4a'), srgb('#5e4826'), srgb('#b39a68'), 0.55, 0.0, 0.3)
    # Fine darker mottling between the spots.
    col = mix(col, srgb('#4e3c20'), smoothstep(0.55, 0.9, scales(p, 0.05, 1.0, seed=11)) * 0.25)
    # White belly: a lens that reaches highest mid-body and dips toward the head and tail.
    edge = -0.42 - 0.3 * smoothstep(0.35, 0.05, t) - 0.3 * smoothstep(0.6, 0.95, t)
    belly = smoothstep(edge, edge - 0.22, q)
    col = mix(col, srgb('#fbf2dc'), belly)
    col = mix(col, srgb('#cfc29e'), smoothstep(edge + 0.15, edge - 0.05, q) * (1 - belly) * 0.6)
    # Random spots (kept apart from each other), on the back and sides.
    spots = np.zeros(p.X.shape)
    placed = []
    for _ in range(2500):
        cx, cz = rng.uniform(-0.02, 1.0), rng.uniform(-0.5, 0.5)
        tt, qq = p.tq(cx, cz)
        if qq < -0.3 or qq > 0.97 or tt < 0.04 or tt > 0.98:
            continue
        if any((cx - a) ** 2 + (cz - b) ** 2 < 0.075 ** 2 for a, b in placed):
            continue
        placed.append((cx, cz))
        r = 0.022 * rng.uniform(0.8, 1.15) * (0.7 if tt > 0.82 else 1.0) * (0.75 if qq < -0.15 else 1.0)
        p.disc_xz(cx, cz, r, soft=0.005, out=spots)
    col = mix(col, srgb('#f6f2e4'), spots * 0.95)
    # A dark patch around the pectoral fin base.
    blotch = p.disc(0.36, 0.08, 0.06, soft=0.03, squash=1.4)
    col = mix(col, srgb('#2e2414'), blotch * 0.55)
    mouth = p.line([(0.0, -0.1), (0.03, -0.14)], 0.01, soft=0.004)
    return mix(col, srgb('#3a2c18'), mouth * 0.8)


def chromis_skin(t, q, p):
    """Blue-green: bluer on the back, apple green flank, pale belly."""
    col = shade(t, q, srgb('#16d0a8'), srgb('#0a86d0'), srgb('#9ef0d4'), 0.9, 0.55, 0.0, -0.4)
    col = mix(col, srgb('#30e8b0'), np.exp(-((q + 0.1) / 0.3) ** 2) * 0.4)
    return col


def anthias_skin(t, q, p):
    """Orange-pink, golden on the back, pink belly, a lavender streak from under the eye."""
    col = shade(t, q, srgb('#ff7040'), srgb('#f2601a'), srgb('#ff9ab0'), 0.6, 0.75, 0.2, -0.25)
    streak = p.line([(0.07, -0.12), (0.15, -0.2), (0.24, -0.3), (0.3, -0.35)], [0.03, 0.03, 0.022, 0.012],
                    soft=0.006)
    col = mix(col, srgb('#b38cff'), streak * 0.95)
    return col


# ---------- species: fins ----------

def stripe_fin(base, margin, edge, m0=0.72, m1=0.9):
    """Fin paint: base color, a band of margin color near the edge, then a thin edge color."""
    def paint(U, V):
        col = np.ones(U.shape + (3,)) * srgb(base)
        col = mix(col, srgb(margin), smoothstep(m0 - 0.05, m0, V) * (1 - smoothstep(m1, m1 + 0.04, V)))
        return mix(col, srgb(edge), smoothstep(m1, m1 + 0.04, V))
    return paint


def bluetang_tail(U, V):
    k = np.abs(2 * U - 1)
    col = np.ones(U.shape + (3,)) * srgb('#ffd21f')
    col = mix(col, srgb('#ffe466'), smoothstep(0.5, 1.0, V) * (1 - k) * 0.6)
    edge = smoothstep(0.66, 0.75, k + 0.08 * (1 - V))
    return mix(col, srgb('#0a0c18'), edge)


def angelfish_median(U, V):
    """Blue median fin with an electric-blue rim, the long trailing tips orange-yellow."""
    col = np.ones(U.shape + (3,)) * srgb('#2347b8')
    col = mix(col, srgb('#3364d8'), smoothstep(0.2, 0.7, V))
    # An orange-yellow margin, thin at the front, widening into the trailing tip.
    e = 0.9 - 0.3 * smoothstep(0.62, 0.92, U)
    rim = smoothstep(e - 0.1, e - 0.05, V) * (1 - smoothstep(e - 0.03, e, V))
    col = mix(col, srgb('#46c8ff'), rim * 0.9)
    return mix(col, srgb('#ffb21c'), smoothstep(e - 0.02, e + 0.02, V))


def angelfish_tail(U, V):
    col = np.ones(U.shape + (3,)) * srgb('#ffd21a')
    col = mix(col, srgb('#f7b412'), smoothstep(0.6, 0.0, V) * 0.5)
    return mix(col, srgb('#ffe680'), smoothstep(0.85, 1.0, V) * 0.6)


def angelfish_pectoral(U, V):
    col = np.ones(U.shape + (3,)) * srgb('#ffd21a')
    spot = 1 - smoothstep(0.12, 0.2, np.hypot((U - 0.5) * 0.6, V - 0.0))
    return mix(col, srgb('#1a3aa8'), spot)


def anthias_tail(U, V):
    k = np.abs(2 * U - 1)
    col = np.ones(U.shape + (3,)) * srgb('#ff8250')
    col = mix(col, srgb('#ffb08a'), smoothstep(0.3, 1.0, V) * (1 - k) * 0.5)
    return mix(col, srgb('#e8408a'), smoothstep(0.7, 0.95, k) * smoothstep(0.3, 0.8, V) * 0.8)


# Spec keys: length (units), top/bottom/width/axis profiles over t (in body lengths), roundness,
# skin(t, q, painter) -> rgb, eye, fin_colors (default ramp), dorsal/anal/pelvic/pectoral/caudal.
# Optional: film (thin-film nm), skin_bsdf (Principled overrides), mottle, scale_bump, ray_dark,
# height_scale. Per fin: colors or paint(U, V), alpha, rays, rows, edge_v (UV v from the body edge),
# sweep/sweep_pow (rays leaning back: long trailing fins). Caudal: shape (round, fork, lunate,
# truncate) or a reach profile over k = -1..1, pose angles. Pectoral: part=False keeps it in the body.
SPECIES = {
    'clownfish': {
        'length': 1.3,
        'top': [(0, 0), (0.015, 0.06), (0.06, 0.13), (0.16, 0.225), (0.33, 0.285), (0.5, 0.27),
                (0.7, 0.19), (0.86, 0.125), (0.95, 0.105), (1, 0.1)],
        'bottom': [(0, 0), (0.015, 0.05), (0.06, 0.1), (0.18, 0.19), (0.38, 0.235), (0.58, 0.205),
                   (0.78, 0.14), (0.9, 0.105), (1, 0.095)],
        'width': [(0, 0), (0.02, 0.04), (0.08, 0.085), (0.25, 0.125), (0.45, 0.12), (0.7, 0.08),
                  (0.9, 0.045), (1, 0.035)],
        'axis': [(0, -0.015), (0.5, 0.01), (1, 0.0)],
        'roundness': 2.3,
        'skin': clownfish_skin,
        'eye': {'t': 0.13, 'q': 0.28, 'r': 0.085, 'iris': '#e0781c'},
        'fin_colors': [(0.0, '#f06a1e'), (0.76, '#f06a1e'), (0.83, '#140f0c'), (0.95, '#140f0c'),
                       (1.0, '#efe9dc')],
        'dorsal': {'t0': 0.27, 't1': 0.86, 'rays': 16,
                   'height': [(0, 0.06), (0.12, 0.1), (0.38, 0.085), (0.45, 0.06), (0.52, 0.12),
                              (0.75, 0.17), (0.92, 0.12), (1, 0.03)]},
        'anal': {'t0': 0.6, 't1': 0.88, 'rays': 10,
                 'height': [(0, 0.05), (0.3, 0.15), (0.7, 0.14), (1, 0.03)]},
        'pectoral': {'t': 0.3, 'q': -0.15, 'length': 0.19, 'dir': 194, 'spread': 32, 'rays': 10,
                     'alpha': 0.55, 'colors': [(0.0, '#ee7428'), (0.8, '#f08a3a'), (1.0, '#f6b070')]},
        'pelvic': {'t': 0.34, 'length': 0.14, 'dir': 238, 'spread': 22, 'rays': 5},
        'caudal': {'radius': 0.28, 'spread': 46, 'shape': 'round', 'rays': 14},
    },

    'bluetang': {
        'length': 1.84,
        'top': [(0, 0), (0.012, 0.04), (0.04, 0.085), (0.1, 0.16), (0.2, 0.232), (0.34, 0.268),
                (0.5, 0.262), (0.66, 0.218), (0.8, 0.145), (0.92, 0.08), (1, 0.064)],
        'bottom': [(0, 0), (0.012, 0.035), (0.05, 0.08), (0.15, 0.16), (0.3, 0.218), (0.46, 0.228),
                   (0.62, 0.2), (0.78, 0.13), (0.92, 0.072), (1, 0.06)],
        'width': [(0, 0), (0.02, 0.03), (0.1, 0.07), (0.3, 0.095), (0.5, 0.09), (0.75, 0.06),
                  (0.9, 0.035), (1, 0.03)],
        'axis': [(0, -0.025), (0.3, 0.0), (1, 0.0)],
        'roundness': 2.4,
        'skin': bluetang_skin,
        'eye': {'t': 0.115, 'q': 0.36, 'r': 0.072, 'iris': '#2a2a3a', 'ring': '#101020'},
        'fin_colors': [(0.0, '#1d4cd0'), (1.0, '#1d4cd0')],
        'dorsal': {'t0': 0.17, 't1': 0.92, 'rays': 26, 'rows': 10, 'edge_v': True,
                   'paint': stripe_fin('#1c48cc', '#07091a', '#5ab4ff', 0.6, 0.86),
                   'height': [(0, 0.05), (0.12, 0.095), (0.5, 0.115), (0.85, 0.125), (0.95, 0.095),
                              (1, 0.02)]},
        'anal': {'t0': 0.42, 't1': 0.92, 'rays': 22, 'rows': 10, 'edge_v': True,
                 'paint': stripe_fin('#1c48cc', '#07091a', '#5ab4ff', 0.6, 0.86),
                 'height': [(0, 0.045), (0.15, 0.1), (0.75, 0.125), (0.93, 0.09), (1, 0.02)]},
        'pectoral': {'t': 0.27, 'q': -0.08, 'length': 0.17, 'dir': 196, 'spread': 24, 'rays': 12,
                     'alpha': 0.7, 'colors': [(0.0, '#2456d4'), (0.45, '#2a62dc'), (0.62, '#ffd43a'),
                                              (1.0, '#ffe680')]},
        'pelvic': {'t': 0.3, 'length': 0.09, 'dir': 240, 'spread': 18, 'rays': 5,
                   'colors': [(0.0, '#1d4cd0'), (1.0, '#3a7af0')]},
        'caudal': {'radius': 0.25, 'spread': 40, 'shape': 'lunate', 'rays': 16, 'paint': bluetang_tail,
                   'reach': [(-1, 1.2), (-0.7, 0.98), (-0.3, 0.8), (0, 0.76), (0.3, 0.8), (0.7, 0.98),
                             (1, 1.2)]},
    },

    'yellowtang': {
        'length': 1.48,
        'top': [(0, 0), (0.012, 0.03), (0.05, 0.045), (0.1, 0.065), (0.14, 0.095), (0.19, 0.16),
                (0.25, 0.245), (0.32, 0.31), (0.42, 0.355), (0.56, 0.345), (0.7, 0.275), (0.82, 0.175),
                (0.92, 0.105), (1, 0.082)],
        'bottom': [(0, 0), (0.012, 0.025), (0.05, 0.04), (0.1, 0.055), (0.15, 0.09), (0.21, 0.16),
                   (0.3, 0.245), (0.42, 0.3), (0.55, 0.305), (0.7, 0.245), (0.83, 0.155), (0.93, 0.095),
                   (1, 0.077)],
        'width': [(0, 0), (0.02, 0.02), (0.1, 0.04), (0.3, 0.08), (0.5, 0.075), (0.75, 0.055),
                  (0.9, 0.035), (1, 0.03)],
        'axis': [(0, 0.01), (0.15, 0.0), (0.4, 0.02), (1, 0.0)],
        'roundness': 2.4,
        'skin': yellowtang_skin,
        'mottle': (0.93, 1.06),
        'ray_dark': 0.1,
        'eye': {'t': 0.205, 'q': 0.42, 'r': 0.07, 'iris': '#1c1408', 'ring': '#6a5010'},
        'fin_colors': [(0.0, '#ffd400'), (1.0, '#ffe670')],
        'dorsal': {'t0': 0.16, 't1': 0.92, 'rays': 30, 'rows': 10, 'edge_v': True, 'alpha': 0.95,
                   'colors': [(0.0, '#ffd400'), (0.85, '#ffdc10'), (1.0, '#ffe670')],
                   'height': [(0, 0.1), (0.06, 0.17), (0.2, 0.235), (0.45, 0.27), (0.75, 0.235),
                              (0.92, 0.13), (1, 0.03)], 'sweep': 0.15},
        'anal': {'t0': 0.26, 't1': 0.92, 'rays': 26, 'rows': 10, 'edge_v': True, 'alpha': 0.95,
                 'colors': [(0.0, '#ffd400'), (0.85, '#ffdc10'), (1.0, '#ffe670')],
                 'height': [(0, 0.07), (0.08, 0.15), (0.35, 0.235), (0.72, 0.21), (0.92, 0.11),
                            (1, 0.03)], 'sweep': 0.18},
        'pectoral': {'t': 0.3, 'q': -0.12, 'length': 0.15, 'dir': 195, 'spread': 26, 'rays': 12,
                     'alpha': 0.8, 'colors': [(0.0, '#ffd000'), (1.0, '#ffe060')]},
        'pelvic': {'t': 0.32, 'length': 0.11, 'dir': 238, 'spread': 18, 'rays': 5, 'alpha': 0.9,
                   'colors': [(0.0, '#ffd000'), (1.0, '#ffe060')]},
        'caudal': {'radius': 0.24, 'spread': 40, 'shape': 'truncate', 'rays': 16, 'alpha': 0.92,
                   'colors': [(0.0, '#ffd000'), (0.85, '#ffd400'), (1.0, '#ffe670')]},
    },

    'angelfish': {
        'length': 1.44,
        'top': [(0, 0), (0.015, 0.045), (0.06, 0.1), (0.14, 0.21), (0.26, 0.315), (0.42, 0.36),
                (0.6, 0.33), (0.78, 0.225), (0.92, 0.12), (1, 0.09)],
        'bottom': [(0, 0), (0.015, 0.04), (0.07, 0.1), (0.18, 0.21), (0.34, 0.3), (0.52, 0.315),
                   (0.7, 0.255), (0.86, 0.145), (1, 0.085)],
        'width': [(0, 0), (0.03, 0.03), (0.12, 0.07), (0.35, 0.095), (0.6, 0.085), (0.85, 0.05),
                  (1, 0.035)],
        'axis': [(0, -0.01), (0.4, 0.0), (1, 0.0)],
        'roundness': 2.4,
        'skin': angelfish_skin,
        'eye': {'t': 0.165, 'q': 0.3, 'r': 0.072, 'iris': '#3060b0', 'ring': '#1a2a50'},
        'fin_colors': [(0.0, '#ffc81a'), (1.0, '#ffd84a')],
        'dorsal': {'t0': 0.29, 't1': 0.93, 'rays': 24, 'rows': 14, 'edge_v': True, 'paint': angelfish_median,
                   'height': [(0, 0.04), (0.2, 0.08), (0.45, 0.14), (0.68, 0.28), (0.84, 0.54),
                              (0.9, 0.6), (0.95, 0.38), (1, 0.03)],
                   'sweep': [(0, 0.3), (0.6, 0.42), (0.85, 0.6), (1, 0.72)], 'sweep_pow': 1.4},
        'anal': {'t0': 0.47, 't1': 0.93, 'rays': 20, 'rows': 14, 'edge_v': True, 'paint': angelfish_median,
                 'height': [(0, 0.05), (0.25, 0.13), (0.55, 0.24), (0.8, 0.48), (0.88, 0.54),
                            (0.95, 0.34), (1, 0.03)],
                 'sweep': [(0, 0.3), (0.6, 0.42), (0.85, 0.6), (1, 0.72)], 'sweep_pow': 1.4},
        'pectoral': {'t': 0.31, 'q': -0.1, 'length': 0.17, 'dir': 195, 'spread': 24, 'rays': 12,
                     'alpha': 0.75, 'paint': angelfish_pectoral},
        'pelvic': {'t': 0.3, 'length': 0.2, 'dir': 250, 'spread': 14, 'rays': 5,
                   'colors': [(0.0, '#ffc81a'), (0.8, '#ffb21c'), (1.0, '#46c8ff')]},
        'caudal': {'radius': 0.25, 'spread': 44, 'shape': 'truncate', 'rays': 16, 'paint': angelfish_tail},
    },

    'pufferfish': {
        'length': 1.3,
        'top': [(0, 0), (0.008, 0.045), (0.035, 0.12), (0.1, 0.25), (0.22, 0.36), (0.4, 0.415),
                (0.6, 0.37), (0.76, 0.24), (0.9, 0.125), (1, 0.085)],
        'bottom': [(0, 0), (0.008, 0.045), (0.04, 0.12), (0.12, 0.27), (0.28, 0.4), (0.46, 0.43),
                   (0.64, 0.36), (0.8, 0.22), (0.92, 0.11), (1, 0.08)],
        'width': [(0, 0), (0.008, 0.05), (0.04, 0.14), (0.14, 0.27), (0.36, 0.35), (0.6, 0.3),
                  (0.8, 0.16), (0.92, 0.08), (1, 0.055)],
        'axis': [(0, -0.04), (0.35, 0.0), (1, 0.02)],
        'roundness': 2.0,
        'skin': pufferfish_skin,
        'skin_bsdf': {'Roughness': 0.5, 'Coat Weight': 0.2},
        'height_scale': 1.08,
        'eye': {'t': 0.17, 'q': 0.45, 'r': 0.12, 'iris': '#7aa036', 'ring': '#3a3a18'},
        'fin_colors': [(0.0, '#c8b070'), (1.0, '#e8d8a0')],
        'dorsal': {'t0': 0.73, 't1': 0.87, 'rays': 9, 'rows': 10, 'edge_v': True,
                   'colors': [(0.0, '#a08850'), (0.6, '#c8b070'), (1.0, '#e8dcb0')],
                   'height': [(0, 0.06), (0.4, 0.15), (0.8, 0.13), (1, 0.02)], 'sweep': 0.55},
        'anal': {'t0': 0.75, 't1': 0.88, 'rays': 8, 'rows': 10, 'edge_v': True,
                 'colors': [(0.0, '#c8b890'), (1.0, '#ece2c4')],
                 'height': [(0, 0.06), (0.4, 0.13), (0.8, 0.11), (1, 0.02)], 'sweep': 0.55},
        'pectoral': {'t': 0.34, 'q': 0.1, 'length': 0.15, 'dir': 172, 'spread': 34, 'rays': 12,
                     'alpha': 0.55, 'shape': 'round', 'colors': [(0.0, '#c8a860'), (1.0, '#efe0a8')],
                     'amp': 0.6},
        'caudal': {'radius': 0.25, 'spread': 44, 'shape': 'round', 'rays': 12,
                   'colors': [(0.0, '#8c7444'), (0.6, '#a8905c'), (1.0, '#e0d2a4')]},
    },

    'chromis': {
        'length': 0.47,
        'film': 260.0,
        'skin_bsdf': {'Coat Weight': 0.25},
        'top': [(0, 0), (0.015, 0.055), (0.07, 0.12), (0.2, 0.2), (0.38, 0.232), (0.56, 0.21),
                (0.75, 0.14), (0.9, 0.085), (1, 0.072)],
        'bottom': [(0, 0), (0.015, 0.05), (0.08, 0.1), (0.22, 0.16), (0.42, 0.185), (0.6, 0.16),
                   (0.78, 0.105), (0.9, 0.078), (1, 0.068)],
        'width': [(0, 0), (0.02, 0.04), (0.1, 0.085), (0.3, 0.11), (0.55, 0.1), (0.8, 0.06),
                  (1, 0.035)],
        'axis': [(0, -0.01), (0.5, 0.0), (1, 0.0)],
        'roundness': 2.3,
        'skin': chromis_skin,
        'eye': {'t': 0.14, 'q': 0.26, 'r': 0.11, 'iris': '#4ac0b0', 'ring': '#123040'},
        'fin_colors': [(0.0, '#4ed2c8'), (1.0, '#a8f0e8')],
        'dorsal': {'t0': 0.26, 't1': 0.88, 'rays': 12, 'edge_v': True, 'alpha': 0.85,
                   'colors': [(0.0, '#1c9ccc'), (0.7, '#30b8d0'), (1.0, '#8ae4f0')],
                   'height': [(0, 0.04), (0.15, 0.08), (0.6, 0.075), (0.88, 0.09), (1, 0.025)]},
        'anal': {'t0': 0.6, 't1': 0.88, 'rays': 8, 'edge_v': True, 'alpha': 0.85,
                 'colors': [(0.0, '#2cc8c0'), (1.0, '#90ecd8')],
                 'height': [(0, 0.04), (0.3, 0.095), (0.8, 0.09), (1, 0.025)]},
        'pectoral': {'t': 0.3, 'q': -0.05, 'length': 0.17, 'dir': 196, 'spread': 22, 'rays': 8,
                     'alpha': 0.35, 'part': False, 'colors': [(0.0, '#30c0c0'), (1.0, '#80e0e0')]},
        'pelvic': {'t': 0.33, 'length': 0.12, 'dir': 240, 'spread': 18, 'rays': 4,
                   'colors': [(0.0, '#58d0c8'), (1.0, '#c0f4ec')]},
        'caudal': {'radius': 0.31, 'spread': 33, 'shape': 'fork', 'rays': 12, 'pose': (0, 62), 'alpha': 0.92,
                   'reach': [(-1, 1.1), (-0.6, 0.86), (-0.2, 0.62), (0, 0.58), (0.2, 0.62), (0.6, 0.86),
                             (1, 1.1)],
                   'colors': [(0.0, '#22b8c4'), (0.7, '#3ccccc'), (1.0, '#98ecea')]},
    },

    'anthias': {
        'length': 0.56,
        'top': [(0, 0), (0.015, 0.05), (0.07, 0.11), (0.2, 0.18), (0.4, 0.205), (0.6, 0.185),
                (0.8, 0.12), (0.92, 0.08), (1, 0.07)],
        'bottom': [(0, 0), (0.015, 0.045), (0.09, 0.1), (0.24, 0.16), (0.45, 0.172), (0.65, 0.14),
                   (0.82, 0.09), (1, 0.065)],
        'width': [(0, 0), (0.02, 0.035), (0.1, 0.075), (0.3, 0.095), (0.55, 0.085), (0.8, 0.05),
                  (1, 0.03)],
        'axis': [(0, 0.0), (0.5, 0.0), (1, 0.0)],
        'roundness': 2.3,
        'skin': anthias_skin,
        'eye': {'t': 0.12, 'q': 0.22, 'r': 0.1, 'iris': '#ff5a6a', 'ring': '#3a1020'},
        'fin_colors': [(0.0, '#ff7a48'), (1.0, '#ffb090')],
        'dorsal': {'t0': 0.22, 't1': 0.86, 'rays': 14, 'edge_v': True,
                   'colors': [(0.0, '#f86a38'), (0.75, '#ff9060'), (1.0, '#ffc8a0')],
                   'height': [(0, 0.05), (0.06, 0.1), (0.16, 0.07), (0.5, 0.07), (0.85, 0.09),
                              (1, 0.02)]},
        'anal': {'t0': 0.6, 't1': 0.86, 'rays': 8, 'edge_v': True,
                 'colors': [(0.0, '#ff8858'), (1.0, '#ffb8a8')],
                 'height': [(0, 0.04), (0.3, 0.1), (0.8, 0.09), (1, 0.025)]},
        'pectoral': {'t': 0.3, 'q': -0.12, 'length': 0.17, 'dir': 196, 'spread': 22, 'rays': 8,
                     'alpha': 0.35, 'part': False, 'colors': [(0.0, '#ff7a50'), (1.0, '#ffa888')]},
        'pelvic': {'t': 0.3, 'length': 0.14, 'dir': 242, 'spread': 16, 'rays': 4,
                   'colors': [(0.0, '#ff7050'), (1.0, '#ff5a8a')]},
        'caudal': {'radius': 0.3, 'spread': 35, 'shape': 'lunate', 'rays': 14, 'pose': (0, 62),
                   'reach': [(-1, 1.2), (-0.75, 0.94), (-0.4, 0.76), (0, 0.7), (0.4, 0.76), (0.75, 0.94),
                             (1, 1.2)],
                   'alpha': 0.9, 'paint': anthias_tail},
    },
}


# ---------- body ----------

def body_shape(spec):
    L = spec['length']
    top, bot, wid = profile(spec['top']), profile(spec['bottom']), profile(spec['width'])
    axis = profile(spec.get('axis', [(0, 0), (1, 0)]))
    hs = spec.get('height_scale', 1.0) * L
    return {
        'L': L,
        'x': lambda t: L * (1 - t),
        'top': lambda t: top(t) * hs,
        'bot': lambda t: bot(t) * hs,
        'wid': lambda t: wid(t) * L,
        'zc': lambda t: axis(t) * L,
        'n': spec.get('roundness', 2.3),
    }


def surface_point(shape, t, q, side=-1):
    """Point on the body surface at length t and height q (-1 belly .. +1 back), on the viewer's
    side (side=-1) or the far side (+1)."""
    n = shape['n']
    h = shape['top'](t) if q >= 0 else shape['bot'](t)
    z = shape['zc'](t) + h * q
    y = side * shape['wid'](t) * max(0.0, 1 - abs(q) ** n) ** (1 / n)
    return (shape['x'](t), y, z)


def build_body(spec, shape):
    n = shape['n']
    stations = 56
    ring = 40
    verts = []
    ts = [(i / (stations - 1)) ** 1.7 for i in range(stations)]
    ts = ts[1:]  # t = 0 is the snout tip vertex
    for t in ts:
        x, zc = shape['x'](t), shape['zc'](t)
        top, bot, w = shape['top'](t), shape['bot'](t), shape['wid'](t)
        for j in range(ring):
            a = 2 * math.pi * j / ring
            c, s = math.cos(a), math.sin(a)
            cz = abs(c) ** (2 / n) * (1 if c >= 0 else -1)
            sy = abs(s) ** (2 / n) * (1 if s >= 0 else -1)
            z = zc + (top * cz if c >= 0 else bot * cz)
            verts.append((x, -w * sy, z))
    nose = len(verts)
    verts.append((shape['x'](0), 0, shape['zc'](0)))
    tail = len(verts)
    verts.append((shape['x'](1) - 0.05 * shape['L'], 0, shape['zc'](1)))
    faces = []
    for i in range(len(ts) - 1):
        for j in range(ring):
            a, b = i * ring + j, i * ring + (j + 1) % ring
            faces.append((a, b, b + ring, a + ring))
    for j in range(ring):
        faces.append((nose, (j + 1) % ring, j))
        last = (len(ts) - 1) * ring
        faces.append((tail, last + j, last + (j + 1) % ring))
    o = mesh_object('body', verts, faces)
    fix_normals(o)
    subdivide(o, 1)
    return o


def fix_normals(o):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()


def set_uv(o, uv_of_vertex):
    """Rewrites a mesh's UVs from a per-vertex (u, v) list."""
    uv = o.data.uv_layers['UVMap']
    for poly in o.data.polygons:
        for li in poly.loop_indices:
            uv.data[li].uv = uv_of_vertex[o.data.loops[li].vertex_index]


# ---------- fins ----------

def scallop(u, rays, depth=0.035):
    """Membrane edge dips between fin rays."""
    return 1 - depth * abs(math.sin(math.pi * rays * u)) ** 0.6


def as_profile(value, default):
    """A profile from a list of (u, value) points, or a constant."""
    if value is None:
        value = default
    if isinstance(value, (int, float)):
        return lambda u, c=float(value): c
    return profile(value)


def median_fin(name, shape, fin, upper):
    """Dorsal or anal fin. fin['sweep'] (constant or profile over u) leans the rays back toward the
    tail, so long trailing fins can be made. With fin['edge_v'], UV v is 0 where the fin leaves the
    body and 1 at its edge (otherwise it runs from the fin's root inside the body)."""
    t0, t1 = fin['t0'], fin['t1']
    h = profile(fin['height'])
    sweep = as_profile(fin.get('sweep'), 0.25)
    power = fin.get('sweep_pow', 2.0)
    cols, rows = 48, fin.get('rows', 8)
    grid, uvs = [], []
    for r in range(rows):
        v = r / (rows - 1)
        row = []
        for c in range(cols):
            u = c / (cols - 1)
            t = t0 + (t1 - t0) * u
            edge = shape['top'](t) if upper else shape['bot'](t)
            height = h(u) * shape['L'] * scallop(u, fin['rays'])
            inset = 0.35 * edge
            d = -inset + (inset + height) * v
            z = shape['zc'](t) + (edge + d if upper else -(edge + d))
            # Rays sweep back toward the tail as they rise.
            x = shape['x'](t) - sweep(u) * height * v ** power
            row.append((x, 0.0, z))
            uvs.append((u, d / max(height, 1e-6)))
        grid.append(row)
    o = sheet(name, grid)
    if fin.get('edge_v'):
        set_uv(o, uvs)
    return o


def fan(name, base, direction_deg, spread_deg, length, rays, base_half=0.0, shape='round',
        y_tilt=0.0, overlap=0.0):
    """A fan-shaped fin. base: (x, y, z) root. Rays spread over +/-spread around direction (degrees,
    in the XZ plane, 0 = +X, 90 = up). base_half spreads the ray roots along Z (a tail's root)."""
    cols, rows = 40, 10
    grid = []
    for r in range(rows):
        v = r / (rows - 1)
        row = []
        for c in range(cols):
            u = c / (cols - 1)
            k = 2 * u - 1
            a = math.radians(direction_deg + spread_deg * k)
            if shape == 'round':
                reach = length * (1 - 0.18 * k**2) ** 0.5
            elif shape == 'fork':
                reach = length * (0.62 + 0.45 * k**2)
            elif shape == 'lunate':
                reach = length * (0.8 + 0.35 * k**4)
            else:
                reach = length
            reach *= scallop(u, rays, 0.05)
            rx, rz = base[0] - overlap * math.cos(a), base[2] + base_half * k
            d = reach * v
            x = rx + (d + overlap) * math.cos(a)
            z = rz + (d + overlap) * math.sin(a)
            y = base[1] + y_tilt * d
            row.append((x, y, z))
        grid.append(row)
    return sheet(name, grid)


def caudal_fin(name, shape, c):
    """The tail: rays leave a tall root inside the peduncle nearly parallel, then flare.
    c['reach'] (a profile over k = -1 bottom .. +1 top) overrides the named shapes."""
    L = shape['L']
    zc = shape['zc'](1)
    root_x = 0.07 * L
    root_h = shape['top'](1) * 0.85
    length = c['radius'] * L
    spread = math.radians(c['spread'])
    reach_of = profile(c['reach']) if 'reach' in c else None
    cols, rows = 44, 14
    grid = []
    for r in range(rows):
        v = r / (rows - 1)
        row = []
        for col in range(cols):
            u = col / (cols - 1)
            k = 2 * u - 1
            a = spread * k
            if reach_of is not None:
                reach = reach_of(k)
            elif c['shape'] == 'fork':
                reach = 0.6 + 0.48 * k**2
            elif c['shape'] == 'lunate':
                reach = 0.78 + 0.38 * k**4
            elif c['shape'] == 'truncate':
                reach = (0.84 + 0.04 * k**2) / math.cos(a)
            else:
                reach = (1 - 0.22 * k**2) ** 0.5
            reach *= length * scallop(u, c['rays'], 0.035)
            ex, ez = -reach * math.cos(a), zc + root_h * k + reach * math.sin(a)
            rz = zc + root_h * k
            row.append((root_x + (ex - root_x) * v, 0.0, rz + (ez - rz) * v**1.35))
        grid.append(row)
    return sheet(name, grid)


# ---------- eye ----------

def eye_object(p, r, iris, ring='#2a1a0e', depth=0.55):
    """A glossy eye centered near surface point p (on the viewer's side), radius r."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1, location=p)
    o = bpy.context.object
    o.name = 'eye'
    o.scale = (r, r * depth, r)
    o.location = (p[0], p[1] + r * 0.18, p[2])
    bpy.ops.object.shade_smooth()

    mat, n = new_material('eye')
    tc = n.new('ShaderNodeTexCoord')
    sep = n.new('ShaderNodeSeparateXYZ')
    n.link(sock(tc.outputs, 'Object'), sock(sep.inputs, 'Vector'))
    # Radial distance from the eye's axis (which points at the viewer along -Y).
    sq = n.new('ShaderNodeVectorMath', _operation='LENGTH')
    comb = n.new('ShaderNodeCombineXYZ')
    n.link(sock(sep.outputs, 'X'), sock(comb.inputs, 'X'))
    n.link(sock(sep.outputs, 'Z'), sock(comb.inputs, 'Y'))
    n.link(sock(comb.outputs, 'Vector'), sq.inputs[0])
    ramp = n.new('ShaderNodeValToRGB')
    cr = ramp.color_ramp
    cr.interpolation = 'EASE'
    stops = [(0.0, '#050505'), (0.4, '#050505'), (0.46, iris), (0.66, iris),
             (0.74, ring), (1.0, '#120c08')]
    cr.elements[0].position, cr.elements[0].color = stops[0][0], (*srgb_lin(stops[0][1]), 1)
    cr.elements[1].position, cr.elements[1].color = stops[1][0], (*srgb_lin(stops[1][1]), 1)
    for pos, col in stops[2:]:
        el = cr.elements.new(pos)
        el.color = (*srgb_lin(col), 1)
    n.link(sock(sq.outputs, 'Value'), sock(ramp.inputs, 'Fac'))
    bsdf = n.new('ShaderNodeBsdfPrincipled', Roughness=0.25, **{'Coat Weight': 1.0, 'Coat Roughness': 0.03})
    n.link(sock(ramp.outputs, 'Color'), sock(bsdf.inputs, 'Base Color'))
    out = n.new('ShaderNodeOutputMaterial')
    n.link(sock(bsdf.outputs, 'BSDF'), sock(out.inputs, 'Surface'))
    assign(o, mat)
    return o


def build_eye(spec, shape):
    e = spec['eye']
    p = surface_point(shape, e['t'], e['q'])
    return eye_object(p, e['r'] * shape['L'] / 2, e['iris'], e.get('ring', '#2a1a0e'))


def srgb_lin(hexstr):
    c = srgb(hexstr)
    return tuple(np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4))


# ---------- materials ----------

def skin_material(spec, shape, bounds):
    x0, x1, z0, z1 = bounds
    res_u, res_v = 1024, 512
    U, V = np.meshgrid((np.arange(res_u) + 0.5) / res_u, (np.arange(res_v) + 0.5) / res_v)
    X = x0 + U * (x1 - x0)
    Z = z0 + V * (z1 - z0)
    T = np.clip(1 - X / shape['L'], 0, 1)
    # T only varies along columns: evaluate the profiles once per column.
    zc, top, bot = (np.array([shape[k](t) for t in T[0]])[None, :] for k in ('zc', 'top', 'bot'))
    Q = np.where(Z >= zc, (Z - zc) / np.maximum(top, 1e-4), (Z - zc) / np.maximum(bot, 1e-4))
    Q = np.clip(Q, -1, 1)
    rgb = spec['skin'](T, Q, Painter(shape, T, Q, X, Z))
    rgba = np.concatenate([rgb, np.ones(rgb.shape[:2] + (1,))], axis=-1)
    img = image_from_array('skin', rgba)

    mat, n = new_material('skin')
    vec, tc = side_projection(n, x0, x1, z0, z1)
    tex = n.new('ShaderNodeTexImage', _image=img, _extension='EXTEND', _interpolation='Cubic')
    n.link(vec, sock(tex.inputs, 'Vector'))

    # Soft blotchy variation, so large areas aren't one flat color.
    noise = n.new('ShaderNodeTexNoise', Scale=9.0 / shape['L'], Detail=4.0, Roughness=0.55)
    n.link(sock(tc.outputs, 'Object'), sock(noise.inputs, 'Vector'))
    lo, hi = spec.get('mottle', (0.86, 1.1))
    vary = n.new('ShaderNodeMapRange', **{'To Min': lo, 'To Max': hi})
    n.link(sock(noise.outputs, 'Fac'), sock(vary.inputs, 'Value'))
    tint = n.new('ShaderNodeMix', _data_type='RGBA', _blend_type='MULTIPLY', Factor=1.0)
    n.link(sock(tex.outputs, 'Color'), sock(tint.inputs, 'A'))
    vcol = n.new('ShaderNodeCombineColor')
    for ch in ('Red', 'Green', 'Blue'):
        n.link(sock(vary.outputs, 'Result'), vcol.inputs[ch])
    n.link(sock(vcol.outputs, 'Color'), sock(tint.inputs, 'B'))

    # Scales: a fine cellular bump, stretched a little along the body.
    mapping = n.new('ShaderNodeMapping', Scale=(1.0, 1.6, 1.25))
    n.link(sock(tc.outputs, 'Object'), sock(mapping.inputs, 'Vector'))
    vor = n.new('ShaderNodeTexVoronoi', Scale=46.0 / shape['L'], _feature='SMOOTH_F1')
    n.link(sock(mapping.outputs, 'Vector'), sock(vor.inputs, 'Vector'))
    bump = n.new('ShaderNodeBump', Strength=spec.get('scale_bump', 0.22), Distance=0.004)
    n.link(sock(vor.outputs, 'Distance'), sock(bump.inputs, 'Height'))

    params = {'Roughness': 0.38, 'Subsurface Weight': 0.12, 'Subsurface Scale': 0.02,
              'Specular IOR Level': 0.55, 'Coat Weight': 0.35, 'Coat Roughness': 0.12,
              'Thin Film Thickness': spec.get('film', 0.0)}
    params.update(spec.get('skin_bsdf', {}))
    bsdf = n.new('ShaderNodeBsdfPrincipled', **params)
    n.link(sock(tint.outputs, 'Result'), sock(bsdf.inputs, 'Base Color'))
    n.link(sock(bump.outputs, 'Normal'), sock(bsdf.inputs, 'Normal'))
    out = n.new('ShaderNodeOutputMaterial')
    n.link(sock(bsdf.outputs, 'BSDF'), sock(out.inputs, 'Surface'))
    return mat


def fin_material(spec, name, rays, alpha=0.82, colors=None, paint=None, ray_dark=0.35):
    """Membrane colored along the fin (v: root -> edge) with darker rays across it (u).
    paint(U, V) -> rgb array, if given, paints the membrane in UV space instead."""
    mat, n = new_material(name)
    uv = n.new('ShaderNodeUVMap', _uv_map='UVMap')
    sep = n.new('ShaderNodeSeparateXYZ')
    n.link(sock(uv.outputs, 'UV'), sock(sep.inputs, 'Vector'))
    if paint is not None:
        res_u, res_v = 256, 128
        U, V = np.meshgrid((np.arange(res_u) + 0.5) / res_u, (np.arange(res_v) + 0.5) / res_v)
        rgb = paint(U, V)
        rgba = np.concatenate([rgb, np.ones(rgb.shape[:2] + (1,))], axis=-1)
        tex = n.new('ShaderNodeTexImage', _image=image_from_array(name, rgba), _extension='EXTEND')
        n.link(sock(uv.outputs, 'UV'), sock(tex.inputs, 'Vector'))
        membrane = sock(tex.outputs, 'Color')
    else:
        ramp = n.new('ShaderNodeValToRGB')
        cr = ramp.color_ramp
        stops = colors or spec['fin_colors']
        cr.elements[0].position, cr.elements[0].color = stops[0][0], (*srgb_lin(stops[0][1]), 1)
        cr.elements[1].position, cr.elements[1].color = stops[-1][0], (*srgb_lin(stops[-1][1]), 1)
        for pos, col in stops[1:-1]:
            el = cr.elements.new(pos)
            el.color = (*srgb_lin(col), 1)
        n.link(sock(sep.outputs, 'Y'), sock(ramp.inputs, 'Fac'))
        membrane = sock(ramp.outputs, 'Color')

    # Rays: a periodic ridge across u.
    mul = n.new('ShaderNodeMath', _operation='MULTIPLY', **{})
    mul.inputs[1].default_value = rays * math.pi
    n.link(sock(sep.outputs, 'X'), mul.inputs[0])
    sin = n.new('ShaderNodeMath', _operation='SINE')
    n.link(sock(mul.outputs, 'Value'), sin.inputs[0])
    ab = n.new('ShaderNodeMath', _operation='ABSOLUTE')
    n.link(sock(sin.outputs, 'Value'), ab.inputs[0])
    ray = n.new('ShaderNodeMath', _operation='POWER')
    ray.inputs[1].default_value = 6.0
    n.link(sock(ab.outputs, 'Value'), ray.inputs[0])
    # Darken along the rays a little.
    dark = n.new('ShaderNodeMix', _data_type='RGBA', _blend_type='MULTIPLY')
    sock(dark.inputs, 'B').default_value = (0.55, 0.5, 0.45, 1)
    inv = n.new('ShaderNodeMath', _operation='SUBTRACT')
    inv.inputs[0].default_value = 1.0
    n.link(sock(ray.outputs, 'Value'), inv.inputs[1])
    fac = n.new('ShaderNodeMath', _operation='MULTIPLY')
    fac.inputs[1].default_value = ray_dark
    n.link(sock(inv.outputs, 'Value'), fac.inputs[0])
    n.link(sock(fac.outputs, 'Value'), sock(dark.inputs, 'Factor'))
    n.link(membrane, sock(dark.inputs, 'A'))
    bump = n.new('ShaderNodeBump', Strength=0.25, Distance=0.003)
    n.link(sock(ray.outputs, 'Value'), sock(bump.inputs, 'Height'))

    # Thinner toward the edge.
    am = n.new('ShaderNodeMapRange', **{'From Min': 0.0, 'From Max': 1.0, 'To Min': 0.97, 'To Max': alpha})
    n.link(sock(sep.outputs, 'Y'), sock(am.inputs, 'Value'))

    bsdf = n.new('ShaderNodeBsdfPrincipled', Roughness=0.42, **{
        'Subsurface Weight': 0.25, 'Subsurface Scale': 0.01, 'Coat Weight': 0.2,
        'Coat Roughness': 0.15})
    n.link(sock(dark.outputs, 'Result'), sock(bsdf.inputs, 'Base Color'))
    n.link(sock(bump.outputs, 'Normal'), sock(bsdf.inputs, 'Normal'))
    n.link(sock(am.outputs, 'Result'), sock(bsdf.inputs, 'Alpha'))
    # Light passing through the membrane, so a backlit fin glows.
    trans = n.new('ShaderNodeBsdfTranslucent')
    n.link(sock(dark.outputs, 'Result'), sock(trans.inputs, 'Color'))
    clear = n.new('ShaderNodeBsdfTransparent')
    glow = n.new('ShaderNodeMixShader', Fac=0.35)
    n.link(sock(bsdf.outputs, 'BSDF'), glow.inputs[1])
    n.link(sock(trans.outputs, 'BSDF'), glow.inputs[2])
    see = n.new('ShaderNodeMixShader')
    n.link(sock(am.outputs, 'Result'), see.inputs[0])
    n.link(sock(clear.outputs, 'BSDF'), see.inputs[1])
    n.link(sock(glow.outputs, 'Shader'), see.inputs[2])
    out = n.new('ShaderNodeOutputMaterial')
    n.link(sock(see.outputs, 'Shader'), sock(out.inputs, 'Surface'))
    return mat


def fin_mat(spec, name, fin, rays, alpha=0.82):
    return fin_material(spec, name, rays, fin.get('alpha', alpha), fin.get('colors'), fin.get('paint'),
                        fin.get('ray_dark', spec.get('ray_dark', 0.35)))


# ---------- assembly ----------

def build_fish(name):
    """Builds one species. Returns the creature description render.py expects (see render.py)."""
    spec = SPECIES[name]
    shape = body_shape(spec)
    L = shape['L']

    body = build_body(spec, shape)
    body_objs = [body]
    fins = []
    if 'dorsal' in spec:
        fins.append(('dorsal', median_fin('dorsal', shape, spec['dorsal'], True), spec['dorsal']))
    if 'anal' in spec:
        fins.append(('anal', median_fin('anal', shape, spec['anal'], False), spec['anal']))
    if 'pelvic' in spec:
        p = spec['pelvic']
        base = surface_point(shape, p['t'], -0.85)
        fins.append(('pelvic', fan('pelvic', (base[0], base[1] - 0.004, base[2]), p['dir'], p['spread'],
                                   p['length'] * L, p['rays'], y_tilt=-0.12), p))
    c = spec['caudal']
    tail = caudal_fin('caudal', shape, c)
    pec = pec_base = None
    if 'pectoral' in spec:
        p = spec['pectoral']
        pec_base = surface_point(shape, p['t'], p['q'])
        pec = fan('pectoral', (pec_base[0], pec_base[1] - 0.006, pec_base[2]), p['dir'], p['spread'],
                  p['length'] * L, p['rays'], y_tilt=-0.18, shape=p.get('shape', 'round'))
        assign(pec, fin_mat(spec, 'fin-pectoral', p, p['rays']))
        if not p.get('part', True):
            body_objs.append(pec)
            pec = None

    body_objs.append(build_eye(spec, shape))

    # Skin projection bounds cover body and fins.
    x0, x1 = -0.5 * L, 1.05 * L
    z0, z1 = -0.6 * L, 0.6 * L
    assign(body, skin_material(spec, shape, (x0, x1, z0, z1)))
    for fname, obj, fin in fins:
        assign(obj, fin_mat(spec, f'fin-{fname}', fin, fin['rays']))
        body_objs.append(obj)
    assign(tail, fin_mat(spec, 'fin-caudal', c, c['rays'], alpha=0.78))

    root = (0.02 * L, 0.0, shape['zc'](1))
    parts = [
        # The tail swings side to side; seen from the side that narrows it toward its root.
        {'name': 'tail', 'objects': [tail], 'anim': 'sweep', 'amp': c.get('sweep', 0.45),
         'pivot': root, 'pose': {'rotate': 'Z', 'origin': root, 'angles': c.get('pose', (0, 55))}},
        {'name': 'body', 'objects': body_objs},
    ]
    if pec is not None:
        p = spec['pectoral']
        parts.append({'name': 'fin', 'objects': [pec], 'anim': 'sweep', 'amp': p.get('amp', 0.5),
                      'pivot': pec_base,
                      'pose': {'rotate': 'Z', 'origin': pec_base, 'angles': p.get('pose', (0, 60))}})
    return {'parts': parts}


# ---------- seahorse ----------

def tube(name, C, Nv, Bv, rp, rn, rb, colors, ring=24, power=2.0, mod=None):
    """A closed tube lofted along centers C (S x 3) with per-station frames: Nv (the 'front'
    direction, radius rp on its + side and rn on its - side) and Bv (depth, radius rb). Vertex
    colors from colors(i, theta) (linear RGB). mod(i, theta) scales the radius (ridges)."""
    S = len(C)
    verts, cols = [], []
    for i in range(S):
        for j in range(ring):
            th = 2 * math.pi * j / ring + math.pi / 2  # j = 0 on the far side (+Bv)
            c, s = math.cos(th), math.sin(th)
            ec = math.copysign(abs(c) ** (2 / power), c)
            es = math.copysign(abs(s) ** (2 / power), s)
            m = mod(i, th) if mod else 1.0
            r_n = rp[i] if c >= 0 else rn[i]
            verts.append(tuple(C[i] + Nv[i] * (ec * r_n * m) + Bv[i] * (es * rb[i] * m)))
            cols.append(colors(i, th))
    t0 = C[0] - C[1]
    t1 = C[-1] - C[-2]
    head, tip = len(verts), len(verts) + 1
    verts.append(tuple(C[0] + t0 / max(np.linalg.norm(t0), 1e-9) * min(rp[0], rn[0]) * 0.3))
    verts.append(tuple(C[-1] + t1 / max(np.linalg.norm(t1), 1e-9) * min(rp[-1], rn[-1]) * 0.6))
    cols += [colors(0, 0.0), colors(S - 1, 0.0)]
    faces = []
    for i in range(S - 1):
        for j in range(ring):
            a, b = i * ring + j, i * ring + (j + 1) % ring
            faces.append((a, b, b + ring, a + ring))
    for j in range(ring):
        faces.append((head, (j + 1) % ring, j))
        last = (S - 1) * ring
        faces.append((tip, last + j, last + (j + 1) % ring))
    o = mesh_object(name, verts, faces)
    attr = o.data.color_attributes.new('col', 'FLOAT_COLOR', 'POINT')
    flat = np.array([(*cc, 1.0) for cc in cols], dtype=np.float32).ravel()
    attr.data.foreach_set('color', flat)
    fix_normals(o)
    subdivide(o, 1)
    return o


def frames_along(points, n):
    """Resamples a smooth 2D (x, z) path into n stations evenly spaced by arc length. Returns
    centers (n x 3), front normals (n x 3, the left normal of travel), arc positions 0..1, length."""
    P = catmull_rom(points, 600)
    seg = np.hypot(*np.diff(P, axis=0).T)
    cum = np.concatenate([[0], np.cumsum(seg)])
    s = np.linspace(0, cum[-1], n)
    x = np.interp(s, cum, P[:, 0])
    z = np.interp(s, cum, P[:, 1])
    C = np.stack([x, np.zeros(n), z], axis=1)
    T = np.gradient(C, axis=0)
    T /= np.linalg.norm(T, axis=1)[:, None]
    N = np.stack([-T[:, 2], np.zeros(n), T[:, 0]], axis=1)
    return C, N, s / cum[-1], cum[-1]


def seahorse_material(name, rough=0.42):
    """Vertex-colored skin with sparse pale speckles and a fine bumpy texture."""
    mat, n = new_material(name)
    attr = n.new('ShaderNodeAttribute', _attribute_name='col')
    tc = n.new('ShaderNodeTexCoord')
    vor = n.new('ShaderNodeTexVoronoi', Scale=48.0, _feature='F1')
    n.link(sock(tc.outputs, 'Object'), sock(vor.inputs, 'Vector'))
    dot = n.new('ShaderNodeMapRange', **{'From Min': 0.1, 'From Max': 0.18, 'To Min': 1.0, 'To Max': 0.0})
    n.link(sock(vor.outputs, 'Distance'), sock(dot.inputs, 'Value'))
    pick = n.new('ShaderNodeMapRange', **{'From Min': 0.55, 'From Max': 0.6, 'To Min': 0.0, 'To Max': 0.7})
    n.link(sock(vor.outputs, 'Color'), sock(pick.inputs, 'Value'))
    fac = n.new('ShaderNodeMath', _operation='MULTIPLY')
    n.link(sock(dot.outputs, 'Result'), fac.inputs[0])
    n.link(sock(pick.outputs, 'Result'), fac.inputs[1])
    speck = n.new('ShaderNodeMix', _data_type='RGBA')
    sock(speck.inputs, 'B').default_value = (*srgb_lin('#fff4d8'), 1)
    n.link(sock(fac.outputs, 'Value'), sock(speck.inputs, 'Factor'))
    n.link(sock(attr.outputs, 'Color'), sock(speck.inputs, 'A'))

    noise = n.new('ShaderNodeTexNoise', Scale=60.0, Detail=3.0)
    n.link(sock(tc.outputs, 'Object'), sock(noise.inputs, 'Vector'))
    bump = n.new('ShaderNodeBump', Strength=0.25, Distance=0.004)
    n.link(sock(noise.outputs, 'Fac'), sock(bump.inputs, 'Height'))
    bsdf = n.new('ShaderNodeBsdfPrincipled', Roughness=rough, **{
        'Subsurface Weight': 0.1, 'Subsurface Scale': 0.02, 'Specular IOR Level': 0.5,
        'Coat Weight': 0.25, 'Coat Roughness': 0.2})
    n.link(sock(speck.outputs, 'Result'), sock(bsdf.inputs, 'Base Color'))
    n.link(sock(bump.outputs, 'Normal'), sock(bsdf.inputs, 'Normal'))
    out = n.new('ShaderNodeOutputMaterial')
    n.link(sock(bsdf.outputs, 'BSDF'), sock(out.inputs, 'Surface'))
    return mat


SEAHORSE = {
    'scale': 1.08,
    # Trunk + tail centerline (x, z), from inside the head down to the curled tail tip.
    'spine': [(-0.02, 1.8), (-0.085, 1.68), (-0.105, 1.54), (-0.085, 1.36), (-0.075, 1.16),
              (-0.115, 0.98), (-0.165, 0.8), (-0.185, 0.6), (-0.155, 0.42), (-0.075, 0.29), (0.035, 0.23),
              (0.135, 0.26), (0.19, 0.35), (0.165, 0.44), (0.095, 0.465), (0.05, 0.415), (0.065, 0.36),
              (0.105, 0.37)],
    # Radii along the trunk/tail (arc position 0..1): front (belly), back, half-depth.
    'front': [(0, 0.075), (0.06, 0.066), (0.124, 0.085), (0.2, 0.14), (0.28, 0.185), (0.35, 0.16),
              (0.42, 0.09), (0.47, 0.063), (0.56, 0.048), (0.71, 0.035), (0.86, 0.024), (1, 0.009)],
    'back': [(0, 0.07), (0.06, 0.056), (0.124, 0.06), (0.2, 0.068), (0.3, 0.076), (0.38, 0.072),
             (0.47, 0.06), (0.56, 0.048), (0.71, 0.035), (0.86, 0.024), (1, 0.009)],
    'depth': [(0, 0.062), (0.124, 0.056), (0.25, 0.09), (0.35, 0.085), (0.47, 0.052), (0.56, 0.043),
              (0.71, 0.032), (0.86, 0.022), (1, 0.008)],
    # Head: from the snout tip (a = 0) to the back of the skull (a = 1).
    'snout': (0.36, 1.69), 'nape': (-0.1, 1.8),
    'head_top': [(0, 0.035), (0.04, 0.03), (0.3, 0.031), (0.42, 0.05), (0.55, 0.095), (0.7, 0.118),
                 (0.85, 0.11), (0.95, 0.07), (1, 0.015)],
    'head_bot': [(0, 0.035), (0.04, 0.03), (0.3, 0.031), (0.42, 0.052), (0.55, 0.09), (0.7, 0.12),
                 (0.85, 0.12), (0.95, 0.085), (1, 0.015)],
    'head_depth': [(0, 0.03), (0.04, 0.026), (0.3, 0.027), (0.42, 0.04), (0.55, 0.065), (0.7, 0.078),
                   (0.85, 0.074), (0.95, 0.05), (1, 0.012)],
    'eye_a': 0.6, 'eye_r': 0.04,
    'dorsal': (0.31, 0.44), 'dorsal_h': 0.14,
    'colors': {'base': '#f6ac18', 'back': '#c45c0c', 'belly': '#ffd448', 'groove': '#8a4208',
               'snout': '#e8901a', 'band': '#a8500e'},
}


def build_seahorse():
    sh = SEAHORSE
    k = sh['scale']
    pal = {key: np.array(srgb_lin(v)) for key, v in sh['colors'].items()}

    # ---- trunk and tail ----
    n = 340
    C, N, s, length = frames_along([(x * k, z * k) for x, z in sh['spine']], n)
    B = np.tile([0.0, 1.0, 0.0], (n, 1))
    fr, bk, dp = profile(sh['front']), profile(sh['back']), profile(sh['depth'])
    rp = np.array([fr(v) * k for v in s])
    rn = np.array([bk(v) * k for v in s])
    rb = np.array([dp(v) * k for v in s])
    # Bony rings: spaced in proportion to the local thickness, as on a real seahorse.
    spacing = np.clip(0.62 * (rp + rn) / 2, 0.028 * k, 0.07 * k)
    phase = np.concatenate([[0], np.cumsum(np.diff(s) * length / spacing[1:])])
    ridge = (0.5 + 0.5 * np.cos(2 * np.pi * phase)) ** 3

    def body_mod(i, th):
        corner = max(0.0, math.cos(4 * (th - math.pi / 4))) ** 4
        return 1 + 0.05 * ridge[i] + 0.05 * ridge[i] * corner - 0.015

    def body_color(i, th):
        c = math.cos(th)
        col = pal['base'].copy()
        col = col * (1 - max(0, -c) * 0.55) + pal['back'] * max(0, -c) * 0.55
        col = col * (1 - max(0, c) ** 2 * 0.5) + pal['belly'] * max(0, c) ** 2 * 0.5
        # Darker saddles every few rings along the tail.
        if s[i] > 0.42:
            band = (0.5 + 0.5 * math.cos(2 * math.pi * phase[i] / 4)) ** 6
            col = col * (1 - band * 0.45) + pal['band'] * band * 0.45
        g = 1 - ridge[i]
        col = col * (1 - g ** 4 * 0.2) + pal['groove'] * g ** 4 * 0.2
        return tuple(col)

    body = tube('body', C, N, B, rp, rn, rb, body_color, ring=24, power=2.6, mod=body_mod)

    # ---- head ----
    hs, hb = np.array([sh['snout'][0] * k, 0, sh['snout'][1] * k]), np.array([sh['nape'][0] * k, 0, sh['nape'][1] * k])
    m = 90
    a = np.linspace(0, 1, m)
    HC = hs[None, :] + (hb - hs)[None, :] * a[:, None]
    T = (hb - hs) / np.linalg.norm(hb - hs)
    up = np.cross([0.0, 1.0, 0.0], T)
    HN = np.tile(up, (m, 1))
    ht, hbm, hd = profile(sh['head_top']), profile(sh['head_bot']), profile(sh['head_depth'])
    hrp = np.array([ht(v) * k for v in a])
    hrn = np.array([hbm(v) * k for v in a])
    hrb = np.array([hd(v) * k for v in a])
    # Lift the skull a little above the snout's line.
    HC[:, 2] += np.array([0.02 * k * smoothstep(0.4, 0.8, v) for v in a])
    snout_rings = (0.5 + 0.5 * np.cos(2 * np.pi * a * 9)) ** 6

    def head_mod(i, th):
        return 1 + (0.06 * snout_rings[i] if a[i] < 0.45 else 0.0)

    def head_color(i, th):
        c = math.cos(th)  # +1 up (crown), -1 down (throat)
        col = pal['base'].copy()
        sn = 1 - smoothstep(0.4, 0.55, a[i])
        col = col * (1 - sn * 0.6) + pal['snout'] * sn * 0.6
        col = col * (1 - max(0, c) * 0.35) + pal['back'] * max(0, c) * 0.35
        col = col * (1 - max(0, -c) ** 2 * 0.45) + pal['belly'] * max(0, -c) ** 2 * 0.45
        return tuple(col)

    head = tube('head', HC, HN, np.tile([0.0, 1.0, 0.0], (m, 1)), hrp, hrn, hrb, head_color, ring=24,
                power=2.2, mod=head_mod)

    # Coronet: a short knobbed crest on top of the skull.
    ca = 0.84
    crest_base = HC[int(ca * (m - 1))] + up * hrp[int(ca * (m - 1))] * 0.6
    crest_dir = np.array([-0.35, 0.0, 1.0])
    crest_dir /= np.linalg.norm(crest_dir)
    cn = 12
    CC = np.array([crest_base + crest_dir * 0.09 * k * v for v in np.linspace(0, 1, cn)])
    CN = np.tile(np.cross([0.0, 1.0, 0.0], crest_dir) * -1, (cn, 1))
    cr = np.array([(0.034 - 0.012 * v + 0.01 * smoothstep(0.75, 0.95, v)) * k for v in np.linspace(0, 1, cn)])
    crest = tube('crest', CC, CN, np.tile([0.0, 1.0, 0.0], (cn, 1)), cr, cr, cr * 0.8,
                 lambda i, th: tuple(pal['base'] * 0.8 + pal['back'] * 0.2), ring=16, power=3.0,
                 mod=lambda i, th: 1 + 0.12 * max(0.0, math.cos(5 * th)) ** 3 * (i / (cn - 1)))

    skin = seahorse_material('seahorse-skin')
    for o in (body, head, crest):
        assign(o, skin)

    # ---- eye ----
    ei = int(sh['eye_a'] * (m - 1))
    ep = HC[ei] + up * 0.012 * k
    eye = eye_object((ep[0], -hrb[ei] * 0.86, ep[2]), sh['eye_r'] * k, '#d8a428', '#3a2408', depth=0.6)

    # ---- pectoral fin (small, behind the head) ----
    pi_ = int(0.075 * (n - 1))
    pb = C[pi_] + N[pi_] * rp[pi_] * 0.25
    pec = fan('pectoral', (pb[0], -rb[pi_] * 0.95, pb[2]), 196, 28, 0.055 * k, 10, y_tilt=-0.2)
    assign(pec, fin_material({}, 'fin-pectoral', 10, 0.45, [(0.0, '#f6b030'), (1.0, '#ffe8a0')]))

    # ---- dorsal fin (the moving part) on the back of the lower trunk ----
    d0, d1 = sh['dorsal']
    cols_, rows_ = 36, 10
    grid = []
    H = sh['dorsal_h'] * k
    for r in range(rows_):
        v = r / (rows_ - 1)
        row = []
        for c in range(cols_):
            u = c / (cols_ - 1)
            i = int(round((d0 + (d1 - d0) * u) * (n - 1)))
            inset = rn[i] * 0.6
            hgt = H * (0.55 + 0.45 * math.sin(math.pi * u) ** 0.6) * scallop(u, 18, 0.03)
            d = -inset + (inset + hgt) * v
            p = C[i] - N[i] * (rn[i] + d)
            p[2] += 0.25 * hgt * v * v  # rays tilt up a little toward the edge
            row.append(tuple(p))
        grid.append(row)
    dorsal = sheet('dorsal', grid)
    assign(dorsal, fin_material({}, 'fin-dorsal', 20, 0.7,
                                [(0.0, '#e89018'), (0.45, '#f0a830'), (0.8, '#f6c860'),
                                 (0.87, '#9a4c10'), (0.94, '#9a4c10'), (1.0, '#ffe8b0')], ray_dark=0.25))
    mid = int(round((d0 + d1) / 2 * (n - 1)))
    pivot = tuple(C[mid] - N[mid] * rn[mid] * 0.9)

    return {'parts': [
        {'name': 'fin', 'objects': [dorsal], 'anim': 'sweep', 'amp': 0.35, 'pivot': pivot,
         'pose': {'rotate': 'Z', 'origin': pivot, 'angles': (0, 58)}},
        {'name': 'body', 'objects': [body, head, crest, eye, pec]},
    ]}


CREATURES = {name: (lambda n=name: build_fish(n)) for name in SPECIES}
CREATURES['seahorse'] = build_seahorse

