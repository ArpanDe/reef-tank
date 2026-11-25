"""Procedural reef plants that sway (the source of the Realistic and Pixel art styles).

Each builder returns what render.py expects for PLANTS: the plant stands on the world origin and
grows up +Z, is rendered whole, then sliced into `segments` stacked bands that the engine rotates
with a phase lag. So plants stay upright, centered and narrow (canvas <= ~160 px), and the bottom
~0.2 units hide behind the front reef.

Everything is grown from seeded random numbers and built from shader nodes: no image files.
1 unit = 100 px at final size.
"""

import math
import random

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector, noise

from common import area, assign, mesh_object, new_material, sheet, sock, srgb, sun, world

HALF_WIDTH = 0.73  # widest |x| a plant may reach (canvas <= 156 px with the render margin)


def lin(hexstr):
    c = srgb(hexstr)
    return tuple(float(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c)


# ---------- lights ----------

def plant_lights(height):
    """The reef's light: warm sun from the upper left and in front (as on the reef backdrop), blue
    fill from the water, a cool rim from behind that makes translucent tissue glow."""
    def setup(scene):
        world(scene, (0.05, 0.16, 0.22), 1.0)
        sun(scene, 'key', (24, -20, 0), (1.0, 0.96, 0.88), 5.0, angle_deg=5)
        area(scene, 'fill', (0.8, -6, height * 0.25), (0, 0, height * 0.45), (0.5, 0.78, 1.0), 110, 6)
        area(scene, 'rim', (1.4, 4, height * 0.8), (0, 0, height * 0.5), (0.8, 0.95, 1.0), 600,
             3 + height * 0.5)
    return setup


# ---------- node shorthand ----------

class G:
    """A material's node graph, built tersely. Values may be sockets, numbers, tuples or '#hex'."""

    def __init__(self, name):
        self.mat, self.n = new_material(name)
        self._tc = None

    def put(self, socket, v):
        if isinstance(v, bpy.types.NodeSocket):
            self.n.link(v, socket)
        elif isinstance(v, str):
            socket.default_value = (*lin(v), 1.0)
        else:
            socket.default_value = v

    def node(self, kind, inputs=(), **props):
        nd = self.n.new(kind)
        for k, v in props.items():
            setattr(nd, k, v)
        for k, v in dict(inputs).items():
            self.put(sock(nd.inputs, k) if isinstance(k, str) else nd.inputs[k], v)
        return nd

    def coords(self, kind='Object'):
        if self._tc is None:
            self._tc = self.n.new('ShaderNodeTexCoord')
        return sock(self._tc.outputs, kind)

    def math(self, op, a, b=None, clamp=False):
        nd = self.node('ShaderNodeMath', operation=op, use_clamp=clamp)
        self.put(nd.inputs[0], a)
        if b is not None:
            self.put(nd.inputs[1], b)
        return nd.outputs[0]

    def remap(self, v, f0, f1, t0=0.0, t1=1.0, smooth=False):
        nd = self.node('ShaderNodeMapRange', {'From Min': f0, 'From Max': f1, 'To Min': t0, 'To Max': t1},
                       clamp=True)
        if smooth:
            nd.interpolation_type = 'SMOOTHSTEP'
        self.put(sock(nd.inputs, 'Value'), v)
        return sock(nd.outputs, 'Result')

    def ramp(self, fac, stops, interp='LINEAR'):
        nd = self.n.new('ShaderNodeValToRGB')
        cr = nd.color_ramp
        cr.interpolation = interp
        cr.elements[0].position, cr.elements[0].color = stops[0][0], (*lin(stops[0][1]), 1)
        cr.elements[1].position, cr.elements[1].color = stops[-1][0], (*lin(stops[-1][1]), 1)
        for pos, col in stops[1:-1]:
            cr.elements.new(pos).color = (*lin(col), 1)
        self.put(sock(nd.inputs, 'Factor'), fac)
        return sock(nd.outputs, 'Color')

    def mix(self, fac, a, b, blend='MIX'):
        nd = self.node('ShaderNodeMix', data_type='RGBA', blend_type=blend)
        self.put(sock(nd.inputs, 'Factor'), fac)
        self.put(sock(nd.inputs, 'A'), a)
        self.put(sock(nd.inputs, 'B'), b)
        return sock(nd.outputs, 'Result')

    def attr(self, name):
        nd = self.node('ShaderNodeAttribute', attribute_name=name, attribute_type='GEOMETRY')
        return sock(nd.outputs, 'Factor')

    def noise(self, vec, scale, detail=3.0, rough=0.55, out='Factor'):
        nd = self.node('ShaderNodeTexNoise', {'Scale': scale, 'Detail': detail, 'Roughness': rough})
        self.put(sock(nd.inputs, 'Vector'), vec)
        return sock(nd.outputs, out)

    def voronoi(self, vec, scale, feature='F1', out='Distance', randomness=1.0):
        nd = self.node('ShaderNodeTexVoronoi', {'Scale': scale, 'Randomness': randomness}, feature=feature)
        self.put(sock(nd.inputs, 'Vector'), vec)
        return sock(nd.outputs, out)

    def mapping(self, vec, scale):
        nd = self.node('ShaderNodeMapping', {'Scale': scale})
        self.put(sock(nd.inputs, 'Vector'), vec)
        return sock(nd.outputs, 'Vector')

    def bump(self, h, strength, dist, normal=None):
        nd = self.node('ShaderNodeBump', {'Strength': strength, 'Distance': dist, 'Height': h})
        if normal is not None:
            self.put(sock(nd.inputs, 'Normal'), normal)
        return sock(nd.outputs, 'Normal')

    def ao(self, color, distance, strength, normal=None, samples=8):
        """Darken crevices: cheap contact shadow between strands."""
        nd = self.node('ShaderNodeAmbientOcclusion', {'Distance': distance}, samples=samples)
        if normal is not None:
            self.put(sock(nd.inputs, 'Normal'), normal)
        f = self.remap(sock(nd.outputs, 'AO'), 0.0, 1.0, 1.0 - strength, 1.0)
        return self.mix(1.0, color, f, 'MULTIPLY')

    def principled(self, color, normal=None, **kw):
        nd = self.node('ShaderNodeBsdfPrincipled', {k.replace('_', ' '): v for k, v in kw.items()})
        self.put(sock(nd.inputs, 'Base Color'), color)
        if normal is not None:
            self.put(sock(nd.inputs, 'Normal'), normal)
        return sock(nd.outputs, 'BSDF')

    def translucent(self, color, normal=None):
        nd = self.node('ShaderNodeBsdfTranslucent', {'Color': color})
        if normal is not None:
            self.put(sock(nd.inputs, 'Normal'), normal)
        return sock(nd.outputs, 'BSDF')

    def mix_shader(self, fac, a, b):
        nd = self.n.new('ShaderNodeMixShader')
        self.put(nd.inputs[0], fac)
        self.n.link(a, nd.inputs[1])
        self.n.link(b, nd.inputs[2])
        return nd.outputs[0]

    def out(self, shader):
        o = self.n.new('ShaderNodeOutputMaterial')
        self.n.link(shader, sock(o.inputs, 'Surface'))
        return self.mat


# ---------- geometry ----------

def noise_vec(p):
    """Smooth random vector field. (mathutils.noise.noise_vector differs from run to run; this is
    repeatable and has the same spread.)"""
    return Vector((noise.noise(p), noise.noise(p + Vector((31.7, 7.3, 0))), noise.noise(p + Vector((0, 47.1, 13.9)))))


def point_attr(obj, name, values):
    a = obj.data.attributes.new(name, 'FLOAT', 'POINT')
    a.data.foreach_set('value', np.asarray(values, dtype=np.float32))


def strands_mesh(name, strands, sides=10):
    """One mesh of tubes. strands: dicts with 'pts' (Vectors, root to tip), 'radii', 'seed' (0..1)
    and optional 'along' (value at root, value at tip; default 0..1) and 'tip' (round cap, default
    True). Writes point attributes 'along' and 'seed' for the materials. Frames are parallel-
    transported, so tubes don't twist."""
    verts, faces, along, seeds = [], [], [], []
    for st in strands:
        pts, radii = st['pts'], st['radii']
        a0, a1 = st.get('along', (0.0, 1.0))
        n = len(pts)
        acc = [0.0]
        for i in range(1, n):
            acc.append(acc[-1] + (pts[i] - pts[i - 1]).length)
        total = acc[-1] or 1.0
        start = len(verts)
        prev = None
        rings = 0
        for i in range(n):
            d = pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]
            d = d.normalized() if d.length > 1e-9 else Vector((0, 0, 1))
            if prev is None:
                a = d.orthogonal().normalized()
            else:
                a = prev - d * prev.dot(d)
                a = a.normalized() if a.length > 1e-6 else d.orthogonal().normalized()
            prev = a
            b = d.cross(a)
            v = a0 + (a1 - a0) * acc[i] / total
            for k in range(sides):
                t = 2 * math.pi * k / sides
                verts.append(pts[i] + (a * math.cos(t) + b * math.sin(t)) * radii[i])
                along.append(v)
                seeds.append(st['seed'])
            rings += 1
        tip = st.get('tip', True)
        if tip:
            r = radii[-1]
            for j in (1, 2, 3):
                ang = j / 4 * math.pi / 2
                for k in range(sides):
                    t = 2 * math.pi * k / sides
                    verts.append(pts[-1] + d * r * math.sin(ang) + (a * math.cos(t) + b * math.sin(t)) * r * math.cos(ang))
                    along.append(a1)
                    seeds.append(st['seed'])
                rings += 1
        for i in range(rings - 1):
            for k in range(sides):
                v0 = start + i * sides + k
                v1 = start + i * sides + (k + 1) % sides
                faces.append((v0, v1, v1 + sides, v0 + sides))
        if tip:
            tv = len(verts)
            verts.append(pts[-1] + d * radii[-1])
            along.append(a1)
            seeds.append(st['seed'])
            last = start + (rings - 1) * sides
            for k in range(sides):
                faces.append((last + k, last + (k + 1) % sides, tv))
    o = mesh_object(name, verts, faces)
    point_attr(o, 'along', along)
    point_attr(o, 'seed', seeds)
    return o


def lathe(name, prof, segs=48, wobble=0.0, seed=0.0):
    """Surface of revolution around Z from [(r, z)] (bottom to top), closed at the top center.
    Writes a point attribute 'along' (0 at the bottom .. 1 at the top center)."""
    verts, faces, along = [], [], []
    for i, (r, z) in enumerate(prof):
        for j in range(segs):
            a = 2 * math.pi * j / segs
            w = 1 + wobble * noise.noise(Vector((math.cos(a) * 1.7, math.sin(a) * 1.7, z * 4 + seed)))
            verts.append((r * w * math.cos(a), r * w * math.sin(a), z))
            along.append(i / len(prof))
    for i in range(len(prof) - 1):
        for j in range(segs):
            a, b = i * segs + j, i * segs + (j + 1) % segs
            faces.append((a, b, b + segs, a + segs))
    c = len(verts)
    verts.append((0, 0, prof[-1][1] - 0.02))
    along.append(1.0)
    last = (len(prof) - 1) * segs
    for j in range(segs):
        faces.append((last + j, last + (j + 1) % segs, c))
    o = mesh_object(name, verts, faces)
    point_attr(o, 'along', along)
    return o


_ICO = {}


def lumps(name, items, subdiv=3, lumpy=0.16, bumps=0.0, freq=7.0):
    """One mesh of slightly lumpy spheres. items: [(center Vector, radius, seed 0..1)]. `bumps`
    adds a billowy small-scale relief (polyps). Writes a point attribute 'seed' per lump."""
    if subdiv not in _ICO:
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
        _ICO[subdiv] = ([v.co.copy() for v in bm.verts], [[v.index for v in f.verts] for f in bm.faces])
        bm.free()
    tv, tf = _ICO[subdiv]
    verts, faces, seeds = [], [], []
    for i, (c, r, sd) in enumerate(items):
        base = len(verts)
        off = Vector((sd * 91.7, i * 3.31, sd * 17.3))
        for v in tv:
            k = 1 + lumpy * noise.noise(v * 1.8 + off)
            if bumps:
                k += bumps * (abs(noise.noise(v * freq + off * 1.3)) - 0.25)
            verts.append(c + v * r * k)
            seeds.append(sd)
        faces += [[base + j for j in f] for f in tf]
    o = mesh_object(name, verts, faces)
    point_attr(o, 'seed', seeds)
    return o


def fit_width(point_lists, extra=0.0, half=HALF_WIDTH):
    """Squeeze x about the axis so everything (plus `extra` for tube radii) fits in |x| <= half."""
    m = max(abs(p.x) for pts in point_lists for p in pts) + extra
    if m > half:
        k = (half - extra) / (m - extra)
        for pts in point_lists:
            for p in pts:
                p.x *= k


def fit_anchored(lines, extra=0.0, half=HALF_WIDTH):
    """Like fit_width, but per line: squeezes only the lines that stick out, and only their x travel
    away from their own root, so roots stay put."""
    for pts in lines:
        x0 = pts[0].x
        m = max(abs(p.x) for p in pts) + extra
        if m <= half:
            continue
        # Largest k in (0, 1] with every point inside.
        k = 1.0
        for p in pts:
            dx = p.x - x0
            if abs(x0 + dx) + extra > half and abs(dx) > 1e-9:
                k = min(k, ((half - extra) * (1 if dx > 0 else -1) - x0) / dx)
        for p in pts:
            p.x = x0 + (p.x - x0) * max(0.0, k)


def height_of(objs):
    bpy.context.view_layer.update()
    return max((o.matrix_world @ Vector(c)).z for o in objs for c in o.bound_box)


# ---------- sea whip ----------

def mat_seawhip():
    g = G('seawhip')
    along, seed = g.attr('along'), g.attr('seed')
    # Some whips redder, some more orange; darker toward the holdfast, paler at the growing tips.
    f = g.math('ADD', g.math('MULTIPLY', along, 0.8), g.math('MULTIPLY', seed, 0.24))
    col = g.ramp(f, [(0.0, '#4a0c1c'), (0.1, '#8c1428'), (0.4, '#c42a2c'), (0.75, '#e2502a'),
                     (1.0, '#f4883c')])
    co = g.coords()
    # Retracted polyps: small raised cups all along the whip.
    vor = g.voronoi(g.mapping(co, (1.0, 1.0, 0.7)), 48.0)
    polyp = g.remap(vor, 0.04, 0.3, 1.0, 0.0, smooth=True)
    col = g.mix(g.math('MULTIPLY', polyp, 0.3), col, '#ff9a64')
    blot = g.remap(g.noise(g.mapping(co, (2.0, 2.0, 0.6)), 4.0, 3.0), 0.3, 0.7, 0.82, 1.1)
    col = g.mix(1.0, col, blot, 'MULTIPLY')
    nrm = g.bump(polyp, 0.5, 0.008)
    col = g.ao(col, 0.15, 0.4, nrm)
    shader = g.principled(col, nrm, Roughness=0.5, Subsurface_Weight=0.35, Subsurface_Scale=0.02,
                          Subsurface_Radius=(1.0, 0.25, 0.15), Coat_Weight=0.1, Coat_Roughness=0.35)
    return g.out(shader)


def whip_path(p, ang0, ang1, length, dy, rng, steps, decay=5.0, bow=0.0):
    """A whip growing from p: starts at ang0 from vertical (in XZ, + is right), settles to ang1,
    with a gentle irregular wave; dy drifts it in depth near the root."""
    ph, amp, fq = rng.uniform(0, 6.3), math.radians(rng.uniform(1.5, 4.5)), rng.uniform(3, 7)
    p = p.copy()
    pts, angs = [p.copy()], []
    for j in range(steps):
        s = (j + 0.5) / steps
        ang = ang1 + (ang0 - ang1) * math.exp(-decay * s) + amp * math.sin(ph + fq * s) + bow * s * s
        angs.append(ang)
        d = Vector((math.sin(ang), dy * math.exp(-3 * s), math.cos(ang))).normalized()
        p = p + d * length / steps
        pts.append(p.copy())
    return pts, angs


def build_seawhip():
    """A gorgonian sea whip colony: a short stem forking near the holdfast into a few long, thin,
    flexible whips."""
    rng = random.Random(41)
    H = 4.45
    stem = [Vector((0.0, 0.0, -0.15 + 0.45 * i / 10)) for i in range(11)]
    prim, whips = [], []
    for k in (-1.0, -0.15, 1.0):
        ang = math.radians(30 * k + rng.uniform(-4, 4))
        length = rng.uniform(0.28, 0.4) if abs(k) > 0.5 else 0.16
        pts, angs = whip_path(stem[-1], ang, ang * 0.8, length, rng.uniform(-0.6, 0.6), rng, 10, 1.0)
        prim.append(pts)
        n = 3 if abs(k) > 0.5 else 2
        for c in range(n):
            off = (c - (n - 1) / 2) * math.radians(rng.uniform(14, 20))
            a0 = angs[-1] + off
            g = k * 0.7 + (c - (n - 1) / 2) * 0.25  # where this whip sits across the colony
            a1 = math.radians(7 * g + 3 + rng.uniform(-3, 3))
            length = (H - pts[-1].z) * rng.uniform(0.7, 1.0) * (1 - 0.12 * abs(g))
            w, wa = whip_path(pts[-1], a0, a1, length, rng.uniform(-0.3, 0.3), rng, 64, 4.0,
                             math.radians(rng.uniform(4, 14)))
            whips.append((w, wa, length, g))
    # Two whips fork again a little higher up.
    forks = []
    for w, wa, length, g in rng.sample(whips, 2):
        j0 = rng.randint(8, 16)
        side = 1 if g >= 0 else -1
        a0 = wa[j0] + side * math.radians(rng.uniform(16, 24))
        f, _ = whip_path(w[j0], a0, math.radians(5 * side + 3), length * rng.uniform(0.4, 0.55),
                         rng.uniform(-0.3, 0.3), rng, 44, 4.0, math.radians(8))
        forks.append((f, j0 / 64))
    fit_width(prim + [w[0] for w in whips] + [f[0] for f in forks], extra=0.05)
    strands = [{'pts': stem, 'radii': [0.075 - 0.012 * i / 10 for i in range(11)], 'seed': 0.3,
                'along': (0.0, 0.06), 'tip': False}]
    for pts in prim:
        strands.append({'pts': pts, 'radii': [0.06 - 0.008 * j / 10 for j in range(11)], 'seed': 0.3,
                        'along': (0.06, 0.12)})

    def taper(m, r0, r1):
        return [r1 + (r0 - r1) * (1 - j / m) ** 0.8 for j in range(m + 1)]

    for w, wa, length, g in whips:
        strands.append({'pts': w, 'radii': taper(len(w) - 1, 0.05, 0.024), 'seed': rng.random(),
                        'along': (0.12, 1.0)})
    for f, s0 in forks:
        strands.append({'pts': f, 'radii': taper(len(f) - 1, 0.038, 0.022), 'seed': rng.random(),
                        'along': (0.12 + 0.5 * s0, 1.0)})
    o = strands_mesh('seawhip', strands, sides=10)
    assign(o, mat_seawhip())
    h = height_of([o])
    return {'objects': [o], 'segments': 6, 'sway': 0.04, 'lights': plant_lights(h)}


# ---------- sea grass ----------

def mat_seagrass():
    g = G('seagrass')
    uv = g.node('ShaderNodeUVMap', uv_map='UVMap')
    sep = g.node('ShaderNodeSeparateXYZ', {'Vector': sock(uv.outputs, 'UV')})
    u, v = sock(sep.outputs, 'X'), sock(sep.outputs, 'Y')
    rnd = sock(g.node('ShaderNodeObjectInfo').outputs, 'Random')
    col = g.ramp(v, [(0.0, '#a8b47a'), (0.07, '#5a8a36'), (0.3, '#3f8a2e'), (0.7, '#4f9a32'),
                     (0.9, '#7aa83a'), (1.0, '#9aa848')])
    # Each blade a little different: younger ones fresher, older ones darker and browner at the tip.
    shade = g.remap(rnd, 0.0, 1.0, 0.78, 1.12)
    col = g.mix(1.0, col, shade, 'MULTIPLY')
    old = g.math('MULTIPLY', g.remap(v, 0.62, 1.0, 0.0, 1.0, smooth=True), g.remap(rnd, 0.3, 1.0, 0.0, 0.8))
    col = g.mix(old, col, '#8a7a3a')
    # Long parallel veins.
    veins = g.math('POWER', g.math('ABSOLUTE', g.math('SINE', g.math('MULTIPLY', u, 9 * math.pi))), 8.0)
    col = g.mix(g.math('MULTIPLY', veins, 0.25), col, '#2a5a20')
    # Specks of encrusting algae near the old tips.
    co = g.coords()
    speck = g.remap(g.voronoi(co, 34.0), 0.0, 0.16, 1.0, 0.0)
    speck = g.math('MULTIPLY', speck, g.math('MULTIPLY', old, 1.4))
    col = g.mix(g.math('MINIMUM', speck, 1.0), col, '#e2cfc0')
    nrm = g.bump(g.math('ADD', veins, speck), 0.15, 0.004)
    surf = g.principled(col, nrm, Roughness=0.42, Coat_Weight=0.2, Coat_Roughness=0.2,
                        Specular_IOR_Level=0.45)
    glow = g.translucent(g.mix(1.0, col, '#c8e070', 'MULTIPLY'), nrm)
    return g.out(g.mix_shader(0.3, surf, glow))


def blade_grid(base, length, width, lean, bend, dy, twist0, twist1, cup, rows=60, cols=7):
    """A ribbon blade: rows run from the base to the rounded tip, cols across the width."""
    p = base.copy()
    grid = []
    step = length / (rows - 1)
    for r in range(rows):
        s = r / (rows - 1)
        ang = lean + bend * s ** 1.7
        t = Vector((math.sin(ang), dy * (1 - s), math.cos(ang))).normalized()
        w = Vector((math.cos(ang), 0.0, -math.sin(ang)))
        w = Matrix.Rotation(twist0 + twist1 * s, 3, t) @ w
        nrm = t.cross(w)
        wf = width * min(1.0, 0.6 + 0.4 * s / 0.06)
        tip = 0.6 * width / length  # a blunt, rounded tip
        if s > 1 - tip:
            wf *= max(0.08, math.sqrt(max(0.0, 1 - ((s - 1 + tip) / tip) ** 2)))
        row = []
        for c in range(cols):
            u = c / (cols - 1)
            k = 2 * u - 1
            row.append(p + w * k * wf / 2 + nrm * cup * wf * (1 - k * k))
        grid.append(row)
        p = p + t * step
    return grid


def build_seagrass():
    """A clump of broad, flat seagrass blades (turtle grass), arching a little in the current."""
    rng = random.Random(17)
    grids = []
    n = 13
    for i in range(n):
        k = 2 * i / (n - 1) - 1 + rng.uniform(-0.12, 0.12)
        base = Vector((0.12 * k + rng.uniform(-0.02, 0.02), rng.uniform(-0.14, 0.14), -0.2))
        length = rng.uniform(1.7, 2.7) * (1 - 0.25 * abs(k))
        width = rng.uniform(0.12, 0.16)
        lean = math.radians(14 * k + rng.uniform(-5, 5))
        bend = math.radians(rng.uniform(15, 70) * (0.5 + abs(k))) * (1 if (k + rng.uniform(-0.4, 0.4)) > 0 else -1)
        grids.append(blade_grid(base, length, width, lean, bend, rng.uniform(-0.25, 0.25),
                                math.radians(rng.uniform(-22, 22)), math.radians(rng.uniform(-45, 45)),
                                rng.uniform(0.08, 0.2)))
    fit_width([p for g in grids for p in g], extra=0.0)
    mat = mat_seagrass()
    objs = []
    for i, gr in enumerate(grids):
        o = sheet(f'blade{i}', [[tuple(p) for p in row] for row in gr], thickness=0.005)
        assign(o, mat)
        objs.append(o)
    h = height_of(objs)
    return {'objects': objs, 'segments': 3, 'sway': 0.07, 'lights': plant_lights(h)}


# ---------- anemones ----------

ANEMONES = {
    # Long, thin, wavy tentacles reaching up from a flared disc, a skirt of shorter ones flopping
    # over its rim; cream to pink with magenta tips.
    'anemone': {
        'seed': 3, 'count': 130, 'disc': 0.36, 'top': 0.47, 'length': (1.15, 1.6), 'steps': 28,
        'elev0': (18, 72), 'elev1': (4, 22), 'decay': 3.0, 'wave': 0.75, 'wave_freq': 2.0,
        'swirl': 1.0, 'current': 0.25, 'skirt': (0.3, (0.55, 0.9), (95, 118), (35, 60)),
        'radius': lambda s: 0.037 - 0.015 * s,
        'column': [(0.2, -0.15), (0.19, 0.1), (0.205, 0.25), (0.25, 0.36), (0.33, 0.43), (0.37, 0.465),
                   (0.33, 0.48), (0.18, 0.475), (0.05, 0.455)],
        'tentacle': [(0.0, '#c47a5a'), (0.25, '#e8ae96'), (0.5, '#f2b4bc'), (0.76, '#f476ac'),
                     (0.91, '#ea328e'), (1.0, '#d2187e')],
        'column_colors': [(0.0, '#8a3a2c'), (0.45, '#c45a40'), (0.72, '#e08a62'), (0.82, '#eeac86'),
                          (1.0, '#9a5040')],
        'sss': (1.0, 0.35, 0.5),
    },
    # Bubble-tip: fewer, fatter tentacles that swell into a bulb below the tip; olive-green to
    # fluorescent teal-green tips.
    'anemonegreen': {
        'seed': 8, 'count': 70, 'disc': 0.3, 'top': 0.52, 'length': (1.1, 1.45), 'steps': 24,
        'elev0': (14, 66), 'elev1': (4, 28), 'decay': 2.5, 'wave': 0.5, 'wave_freq': 1.6,
        'swirl': 0.7, 'current': 0.2, 'skirt': (0.3, (0.55, 0.85), (92, 110), (35, 55)),
        'radius': lambda s: (0.04 + 0.032 * math.exp(-((s - 0.83) / 0.085) ** 2) - 0.012 * s),
        'column': [(0.18, -0.15), (0.175, 0.1), (0.185, 0.3), (0.22, 0.42), (0.29, 0.5), (0.31, 0.53),
                   (0.27, 0.545), (0.14, 0.535), (0.04, 0.515)],
        'tentacle': [(0.0, '#4a4a2e'), (0.22, '#566a34'), (0.48, '#2e8a46'), (0.7, '#16a86a'),
                     (0.84, '#2cd09a'), (0.95, '#6ae8c0'), (1.0, '#c8f0a0')],
        'column_colors': [(0.0, '#5a4030'), (0.5, '#7e5e44'), (0.78, '#8e7a52'), (0.88, '#9a9a60'),
                          (1.0, '#a85a6a')],
        'sss': (0.4, 1.0, 0.7),
    },
}


def mat_tentacles(spec, name):
    g = G(name)
    along, seed = g.attr('along'), g.attr('seed')
    f = g.math('ADD', along, g.math('MULTIPLY', g.math('SUBTRACT', seed, 0.5), 0.08))
    col = g.ramp(f, spec['tentacle'])
    col = g.mix(1.0, col, g.remap(seed, 0.0, 1.0, 0.85, 1.1), 'MULTIPLY')
    co = g.coords()
    # Faint length-wise streaks and blotches so the flesh isn't flat.
    streak = g.noise(g.mapping(co, (30.0, 30.0, 4.0)), 1.0, 2.0)
    col = g.mix(1.0, col, g.remap(streak, 0.3, 0.7, 0.88, 1.08), 'MULTIPLY')
    nrm = g.bump(streak, 0.12, 0.003)
    col = g.ao(col, 0.12, 0.55, nrm)
    shader = g.principled(col, nrm, Roughness=0.38, Subsurface_Weight=0.6, Subsurface_Scale=0.04,
                          Subsurface_Radius=spec['sss'], Coat_Weight=0.35, Coat_Roughness=0.15)
    return g.out(shader)


def mat_column(spec, name):
    g = G(name)
    col = g.ramp(g.attr('along'), spec['column_colors'])
    co = g.coords()
    # Verrucae: rows of soft warts on the column.
    vor = g.voronoi(g.mapping(co, (1.0, 1.0, 1.6)), 24.0, 'SMOOTH_F1')
    wart = g.remap(vor, 0.0, 0.45, 1.0, 0.0, smooth=True)
    col = g.mix(1.0, col, g.remap(wart, 0.0, 1.0, 0.85, 1.2), 'MULTIPLY')
    nrm = g.bump(wart, 0.35, 0.01)
    col = g.ao(col, 0.2, 0.6, nrm)
    shader = g.principled(col, nrm, Roughness=0.45, Subsurface_Weight=0.4, Subsurface_Scale=0.04,
                          Subsurface_Radius=spec['sss'], Coat_Weight=0.25, Coat_Roughness=0.2)
    return g.out(shader)


def lerp(a, b, t):
    return a + (b - a) * t


def build_anemone(name):
    """A sea anemone: a short column, its oral disc, and a crown of tentacles that leave the disc
    leaning outward and curl up toward the light, waving."""
    spec = ANEMONES[name]
    rng = random.Random(spec['seed'])
    col = lathe(f'{name}-column', spec['column'], segs=56, wobble=0.06, seed=spec['seed'])
    assign(col, mat_column(spec, f'{name}-column'))
    R, top, steps = spec['disc'], spec['top'], spec['steps']
    lines = []
    frac, slen, se0, se1 = spec['skirt']
    for i in range(spec['count']):
        skirt = rng.random() < frac
        q = rng.uniform(0.85, 1.0) if skirt else math.sqrt(rng.uniform(0.03, 0.9))
        az = rng.uniform(0, 2 * math.pi)
        out = Vector((math.cos(az), math.sin(az), 0.0))
        root = Vector((0, 0, top - 0.015 - 0.03 * q)) + out * q * R * 0.94
        if skirt:
            length = rng.uniform(*spec['length']) * rng.uniform(*slen)
            e0, e1 = math.radians(rng.uniform(*se0)), math.radians(rng.uniform(*se1))
        else:
            length = rng.uniform(*spec['length']) * (1.05 - 0.25 * q)
            e0 = math.radians(lerp(*spec['elev0'], q ** 1.2) + rng.uniform(-8, 8))
            e1 = math.radians(lerp(*spec['elev1'], q) + rng.uniform(-8, 8))
        # Tentacles pointing sideways stand more upright (the plant must stay narrow); those
        # pointing toward or away from the viewer may splay and show foreshortened.
        side = 0.4 + 0.6 * abs(math.sin(az))
        e0, e1 = e0 * side, e1 * side
        swirl = rng.uniform(-spec['swirl'], spec['swirl'])
        sv = Vector((rng.uniform(0, 100), rng.uniform(0, 100), rng.uniform(0, 100)))
        p = root.copy()
        pts = [p.copy()]
        for j in range(steps):
            s = (j + 0.5) / steps
            el = e1 + (e0 - e1) * math.exp(-spec['decay'] * s)
            a = az + swirl * s
            d = Vector((math.sin(el) * math.cos(a), math.sin(el) * math.sin(a), math.cos(el)))
            d += noise_vec(sv + Vector((0, 0, s * spec['wave_freq']))) * spec['wave'] * min(1.0, 3 * s)
            d.x += spec['current'] * s * s
            d.normalize()
            p = p + d * length / steps
            pts.append(p.copy())
        lines.append(pts)
    fit_anchored(lines, extra=0.05)
    strands = [{'pts': pts, 'radii': [spec['radius'](j / steps) for j in range(steps + 1)],
                'seed': rng.random()} for pts in lines]
    t = strands_mesh(f'{name}-tentacles', strands, sides=10)
    assign(t, mat_tentacles(spec, f'{name}-tentacles'))
    objs = [col, t]
    h = height_of(objs)
    return {'objects': objs, 'segments': 3, 'sway': 0.05, 'lights': plant_lights(h)}


# ---------- soft coral ----------

def mat_stalk():
    """Milky, translucent stalk with red sclerites (spicules) showing through."""
    g = G('softcoral-stalk')
    co = g.coords()
    along = g.attr('along')
    base = g.ramp(along, [(0.0, '#c88e84'), (0.3, '#e6a6a4'), (0.7, '#eca0b8'), (1.0, '#de8cc2')])
    spic = g.noise(g.mapping(co, (30.0, 30.0, 6.0)), 1.0, 3.0, 0.6)
    lines = g.remap(spic, 0.54, 0.68, 0.0, 1.0, smooth=True)
    col = g.mix(g.math('MULTIPLY', lines, 0.6), base, '#c42a40')
    fine = g.remap(g.noise(g.mapping(co, (80.0, 80.0, 16.0)), 1.0, 2.0), 0.55, 0.7, 0.0, 1.0)
    col = g.mix(g.math('MULTIPLY', fine, 0.35), col, '#d84a54')
    blot = g.remap(g.noise(co, 4.0), 0.3, 0.7, 0.88, 1.05)
    col = g.mix(1.0, col, blot, 'MULTIPLY')
    nrm = g.bump(g.math('ADD', lines, fine), 0.15, 0.006)
    edge = sock(g.node('ShaderNodeLayerWeight', {'Blend': 0.5}).outputs, 'Facing')
    col = g.mix(g.math('MULTIPLY', g.math('POWER', edge, 2.0), 0.5), col, '#fff0f0')
    shader = g.principled(col, nrm, Roughness=0.28, Subsurface_Weight=1.0, Subsurface_Scale=0.12,
                          Subsurface_Radius=(1.0, 0.55, 0.65), Coat_Weight=0.45, Coat_Roughness=0.08)
    glow = g.translucent(g.mix(1.0, col, '#ffd0d8', 'MULTIPLY'), nrm)
    return g.out(g.mix_shader(0.3, shader, glow))


def mat_lobes():
    """Polyp-covered lobes: violet to magenta-purple, each lobe a slightly different shade, pale
    polyp heads on the bumps, dark crevices between them."""
    g = G('softcoral-lobes')
    co = g.coords()
    seed = g.attr('seed')
    base = g.ramp(seed, [(0.0, '#5216a0'), (0.4, '#7220bc'), (0.75, '#9026b4'), (1.0, '#ac34a8')])
    geo = g.node('ShaderNodeNewGeometry')
    tips = g.remap(sock(geo.outputs, 'Pointiness'), 0.5, 0.56, 0.0, 1.0, smooth=True)
    vor = g.voronoi(co, 120.0, 'SMOOTH_F1')
    polyp = g.remap(vor, 0.0, 0.5, 1.0, 0.0, smooth=True)
    col = g.mix(g.math('MULTIPLY', g.math('MAXIMUM', tips, polyp), 0.5), base, '#eab4ff')
    nrm = g.bump(polyp, 0.3, 0.003)
    col = g.ao(col, 0.06, 0.75, nrm, samples=4)
    shader = g.principled(col, nrm, Roughness=0.62, Subsurface_Weight=0.45, Subsurface_Scale=0.025,
                          Subsurface_Radius=(0.8, 0.4, 1.0), Coat_Weight=0.1, Coat_Roughness=0.4)
    return g.out(shader)


def build_softcoral():
    """A soft coral tree (Dendronephthya-like): a thick translucent stalk that branches, every
    branch ending in a cluster of polyp-covered lobes."""
    rng = random.Random(29)
    skel = []   # (pts, r0, r1, along0, along1)
    tips = []   # (point, direction, cluster radius)
    steps = 14

    def grow(p, d, length, bend_up, wob):
        pts = [p.copy()]
        for j in range(steps):
            s = (j + 0.5) / steps
            d = (d + Vector((0, 0, bend_up / steps)) +
                 noise_vec(wob + Vector((0, 0, s * 1.5))) * 0.3 / steps).normalized()
            p = p + d * length / steps
            pts.append(p.copy())
        return pts, d

    trunk_h = 1.25
    trunk = [Vector((0.04 * math.sin(2.4 * s) - 0.015, 0.0, -0.15 + (trunk_h + 0.15) * s))
             for s in (i / steps for i in range(steps + 1))]
    skel.append((trunk, 0.16, 0.105, 0.0, 0.4))

    def branch(start, d, length, r0, r1, a0, depth, k):
        pts, dd = grow(start, d, length, 0.8, Vector((rng.uniform(0, 50), k * 7.0, depth)))
        skel.append((pts, r0, r1, a0, 1.0))
        tips.append((pts[-1].copy(), dd, 0.15 + 0.03 * depth))
        if depth == 0:
            return
        for c in range(rng.randint(2, 3)):
            j = int(steps * rng.uniform(0.35, 0.8))
            side = Vector((-dd.y, dd.x, 0))
            side = (side.normalized() if side.length > 1e-6 else Vector((1, 0, 0))) * (1 if c % 2 else -1)
            side += Vector((0, rng.uniform(-0.6, 0.6), 0))
            d2 = (dd + side * rng.uniform(0.6, 1.0) + Vector((0, 0, 0.1))).normalized()
            rj = r0 + (r1 - r0) * j / steps
            branch(pts[j], d2, length * rng.uniform(0.45, 0.6), rj * 0.75, 0.024, a0 + 0.3, depth - 1, k + c + 1)

    branch(trunk[-1], Vector((0.06, 0.0, 1.0)), 1.15, 0.1, 0.035, 0.4, 1, 0)
    n = 6
    for i in range(n):
        az = 2 * math.pi * i / n + rng.uniform(-0.25, 0.25)
        el = math.radians(rng.uniform(36, 52))
        start = trunk[int(steps * rng.uniform(0.55, 0.95))]
        d = Vector((math.sin(el) * math.cos(az), math.sin(el) * math.sin(az), math.cos(el)))
        branch(start, d, rng.uniform(0.95, 1.25), 0.08, 0.032, 0.4, 1, 10 * (i + 1))
    fit_width([s[0] for s in skel] + [[t[0] for t in tips]], extra=0.18)

    strands = []
    for pts, r0, r1, a0, a1 in skel:
        m = len(pts) - 1
        radii = [r0 + (r1 - r0) * j / m for j in range(m + 1)]
        if pts is trunk:  # flared foot
            radii = [r + 0.05 * max(0.0, 1 - j / (0.25 * m)) ** 2 for j, r in enumerate(radii)]
        strands.append({'pts': pts, 'radii': radii, 'seed': rng.random(), 'along': (a0, a1)})
    stalk = strands_mesh('softcoral-stalk', strands, sides=12)
    assign(stalk, mat_stalk())

    items = []
    for p, d, R in tips:
        for _ in range(rng.randint(5, 7)):
            v = Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1))).normalized()
            if v.dot(d) < 0:
                v = v - d * 1.3 * v.dot(d)
            items.append((p + d * R * 0.25 + v * R * rng.uniform(0.15, 0.5), R * rng.uniform(0.42, 0.58),
                          rng.random()))
    # Polyp bundles sprouting along the outer parts of the branches too.
    for pts, r0, r1, a0, a1 in skel[1:]:
        for _ in range(rng.randint(2, 4)):
            j = rng.randint(len(pts) // 3, len(pts) - 2)
            v = Vector((rng.gauss(0, 1), rng.gauss(0, 1), abs(rng.gauss(0, 1)))).normalized()
            rj = r0 + (r1 - r0) * j / (len(pts) - 1)
            items.append((pts[j] + v * rj * 1.2, rng.uniform(0.045, 0.065), rng.random()))
    lobes = lumps('softcoral-lobes', items, subdiv=4, lumpy=0.14, bumps=0.22, freq=6.0)
    assign(lobes, mat_lobes())
    objs = [stalk, lobes]
    h = height_of(objs)
    return {'objects': objs, 'segments': 4, 'sway': 0.03, 'lights': plant_lights(h)}


PLANTS = {
    'seawhip': build_seawhip,
    'seagrass': build_seagrass,
    'anemone': lambda: build_anemone('anemone'),
    'softcoral': build_softcoral,
    'anemonegreen': lambda: build_anemone('anemonegreen'),
}
