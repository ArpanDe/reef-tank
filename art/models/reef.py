"""Procedural reef backdrop for the photo style.

Builds a strip of reef that is periodic in X with period W (one backdrop tile), so an orthographic
camera looking along +Y renders a seamless tile. Everything is generated: a rock heightfield, then
corals, sponges, sea fans and anemones scattered over it, on rippled sand. Materials fade into the
water color with distance from the camera.
"""

import math
import random

import bmesh
import bpy
from mathutils import Vector, noise

from common import Nodes, mesh_object, new_material, sock, srgb  # noqa: F401

W = 25.56  # one tile, in units (2556 px)


# ---------- noise and shapes ----------

def pnoise(x, y, scale, seed=0.0, octaves=4, z=0.0):
    """Fractal noise that repeats every W in x (sampled around a cylinder)."""
    th = 2 * math.pi * x / W
    r = W / (2 * math.pi) * scale
    p = Vector((r * math.cos(th), r * math.sin(th), y * scale + seed * 13.7 + z))
    return noise.fractal(p, 0.6, 2.0, octaves)


def psines(x, terms, base):
    """Sum of sines whose periods divide W."""
    return base + sum(a * math.sin(2 * math.pi * k * x / W + ph) for k, a, ph in terms)


def smooth(e0, e1, v):
    t = min(max((v - e0) / (e1 - e0), 0.0), 1.0)
    return t * t * (3 - 2 * t)


# ---------- mesh builders ----------

def heightfield(name, fn, x0, x1, y0, y1, nx, ny):
    verts, faces = [], []
    for j in range(ny + 1):
        y = y0 + (y1 - y0) * j / ny
        for i in range(nx + 1):
            x = x0 + (x1 - x0) * i / nx
            verts.append((x, y, fn(x, y)))
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + nx + 1, a + nx + 2, a + 1))
    return mesh_object(name, verts, faces)


def tubes(name, lines, sides=8, cap=True):
    """One mesh of tubes. lines: list of [(Vector point, radius), ...]. Frames are parallel-
    transported so the tubes don't twist."""
    verts, faces = [], []
    for line in lines:
        n = len(line)
        if n < 2:
            continue
        start = len(verts)
        prev_a = None
        d = Vector((0, 0, 1))
        for i, (p, r) in enumerate(line):
            d = (line[min(i + 1, n - 1)][0] - line[max(i - 1, 0)][0])
            if d.length < 1e-9:
                d = Vector((0, 0, 1))
            d.normalize()
            if prev_a is None:
                a = d.orthogonal().normalized()
            else:
                a = (prev_a - d * prev_a.dot(d))
                a = a.normalized() if a.length > 1e-6 else d.orthogonal().normalized()
            prev_a = a
            b = d.cross(a)
            for k in range(sides):
                ang = 2 * math.pi * k / sides
                verts.append(p + (a * math.cos(ang) + b * math.sin(ang)) * r)
        for i in range(n - 1):
            for k in range(sides):
                v0 = start + i * sides + k
                v1 = start + i * sides + (k + 1) % sides
                faces.append((v0, v1, v1 + sides, v0 + sides))
        if cap:
            tip = len(verts)
            verts.append(line[-1][0] + d * line[-1][1] * 0.8)
            last = start + (n - 1) * sides
            for k in range(sides):
                faces.append((last + k, last + (k + 1) % sides, tip))
    return mesh_object(name, verts, faces)


def blob(name, loc, radius, squash=0.75, lumpy=0.25, seed=0, detail=4):
    """A lumpy dome (boulder coral, sponge, rock)."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=detail, radius=1.0)
    for v in bm.verts:
        n = noise.fractal(v.co * 1.6 + Vector((seed * 3.1, seed * 1.7, 0)), 0.7, 2.0, 3)
        v.co = v.co * (1 + lumpy * n)
        v.co.z *= squash
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    o.scale = (radius, radius, radius)
    return o


def join(objs, name):
    if len(objs) == 1:
        objs[0].name = name
        return objs[0]
    ctx = bpy.context
    for o in ctx.selected_objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    ctx.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


# ---------- materials ----------

class Fog:
    """Water haze: blends each surface toward the water color with distance from the camera."""

    def __init__(self, color, start, density):
        self.color, self.start, self.density = color, start, density

    def finish(self, mat, n, shader):
        cam = n.new('ShaderNodeCameraData')
        sub = n.new('ShaderNodeMath', _operation='SUBTRACT')
        n.link(sock(cam.outputs, 'View Z Depth'), sub.inputs[0])
        sub.inputs[1].default_value = self.start
        mx = n.new('ShaderNodeMath', _operation='MAXIMUM')
        n.link(sock(sub.outputs, 'Value'), mx.inputs[0])
        mx.inputs[1].default_value = 0.0
        mul = n.new('ShaderNodeMath', _operation='MULTIPLY')
        n.link(sock(mx.outputs, 'Value'), mul.inputs[0])
        mul.inputs[1].default_value = -self.density
        ex = n.new('ShaderNodeMath', _operation='EXPONENT')
        n.link(sock(mul.outputs, 'Value'), ex.inputs[0])
        inv = n.new('ShaderNodeMath', _operation='SUBTRACT')
        inv.inputs[0].default_value = 1.0
        n.link(sock(ex.outputs, 'Value'), inv.inputs[1])
        em = n.new('ShaderNodeEmission', Strength=1.0)
        sock(em.inputs, 'Color').default_value = (*lin(self.color), 1)
        mix = n.new('ShaderNodeMixShader')
        n.link(sock(inv.outputs, 'Value'), mix.inputs[0])
        n.link(shader, mix.inputs[1])
        n.link(sock(em.outputs, 'Emission'), mix.inputs[2])
        out = n.new('ShaderNodeOutputMaterial')
        n.link(sock(mix.outputs, 'Shader'), sock(out.inputs, 'Surface'))
        return mat


def lin(hexstr):
    """Linear color from '#rrggbb' (sRGB) or an already-linear (r, g, b) tuple."""
    if not isinstance(hexstr, str):
        return tuple(float(v) for v in hexstr)
    c = srgb(hexstr)
    return tuple(float(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c)


def ramp_node(n, stops, interp='LINEAR'):
    r = n.new('ShaderNodeValToRGB')
    cr = r.color_ramp
    cr.interpolation = interp
    cr.elements[0].position, cr.elements[0].color = stops[0][0], (*lin(stops[0][1]), 1)
    cr.elements[1].position, cr.elements[1].color = stops[-1][0], (*lin(stops[-1][1]), 1)
    for pos, col in stops[1:-1]:
        el = cr.elements.new(pos)
        el.color = (*lin(col), 1)
    return r


def bsdf(n, color_socket, rough=0.7, normal=None, sss=0.0, ao=0.85, **extra):
    b = n.new('ShaderNodeBsdfPrincipled', Roughness=rough, **{'Subsurface Weight': sss,
                                                              'Subsurface Scale': 0.03}, **extra)
    if ao:
        # Darken crevices and the gaps between colonies (cheap contact shadows).
        occ = n.new('ShaderNodeAmbientOcclusion', Distance=0.6, _samples=8)
        if normal is not None:
            n.link(normal, sock(occ.inputs, 'Normal'))
        curve = n.new('ShaderNodeMath', _operation='POWER')
        n.link(sock(occ.outputs, 'AO'), curve.inputs[0])
        curve.inputs[1].default_value = 1.6
        f = n.new('ShaderNodeMapRange', **{'To Min': 1 - ao, 'To Max': 1.0})
        n.link(sock(curve.outputs, 'Value'), sock(f.inputs, 'Value'))
        g = n.new('ShaderNodeCombineColor')
        for ch in ('Red', 'Green', 'Blue'):
            n.link(sock(f.outputs, 'Result'), sock(g.inputs, ch))
        m = n.new('ShaderNodeMix', _data_type='RGBA', _blend_type='MULTIPLY', Factor=1.0)
        n.link(color_socket, sock(m.inputs, 'A'))
        n.link(sock(g.outputs, 'Color'), sock(m.inputs, 'B'))
        color_socket = sock(m.outputs, 'Result')
    n.link(color_socket, sock(b.inputs, 'Base Color'))
    if normal is not None:
        n.link(normal, sock(b.inputs, 'Normal'))
    return sock(b.outputs, 'BSDF')


def coords(n, kind='Object'):
    tc = n.new('ShaderNodeTexCoord')
    return sock(tc.outputs, kind)


def bump(n, height, strength, distance=0.02, normal=None):
    b = n.new('ShaderNodeBump', Strength=strength, Distance=distance)
    n.link(height, sock(b.inputs, 'Height'))
    if normal is not None:
        n.link(normal, sock(b.inputs, 'Normal'))
    return sock(b.outputs, 'Normal')


def mat_rock(fog):
    """Reef rock crusted with coralline algae, turf and small encrusting life."""
    mat, n = new_material('rock')
    co = coords(n)
    big = n.new('ShaderNodeTexNoise', Scale=0.9, Detail=6, Roughness=0.6)
    n.link(co, sock(big.inputs, 'Vector'))
    patches = ramp_node(n, [(0.0, '#3a352a'), (0.3, '#5a5434'), (0.42, '#6e6c40'), (0.5, '#86704e'),
                            (0.57, '#7e7448'), (0.61, '#a8607e'), (0.65, '#8a5a7a'), (0.69, '#5e6a3a'),
                            (0.8, '#7a7a44'), (1.0, '#4a4232')])
    n.link(sock(big.outputs, 'Fac'), sock(patches.inputs, 'Fac'))
    fine = n.new('ShaderNodeTexNoise', Scale=14.0, Detail=8, Roughness=0.7)
    n.link(co, sock(fine.inputs, 'Vector'))
    shade = n.new('ShaderNodeMapRange', **{'To Min': 0.55, 'To Max': 1.2})
    n.link(sock(fine.outputs, 'Fac'), sock(shade.inputs, 'Value'))
    mul = n.new('ShaderNodeMix', _data_type='RGBA', _blend_type='MULTIPLY', Factor=1.0)
    n.link(sock(patches.outputs, 'Color'), sock(mul.inputs, 'A'))
    gray = n.new('ShaderNodeCombineColor')
    for ch in ('Red', 'Green', 'Blue'):
        n.link(sock(shade.outputs, 'Result'), sock(gray.inputs, ch))
    n.link(sock(gray.outputs, 'Color'), sock(mul.inputs, 'B'))
    vor = n.new('ShaderNodeTexVoronoi', Scale=7.0, _feature='SMOOTH_F1')
    n.link(co, sock(vor.inputs, 'Vector'))
    add = n.new('ShaderNodeMath', _operation='ADD')
    n.link(sock(fine.outputs, 'Fac'), add.inputs[0])
    n.link(sock(vor.outputs, 'Distance'), add.inputs[1])
    nrm = bump(n, sock(add.outputs, 'Value'), 0.7, 0.05)
    return fog.finish(mat, n, bsdf(n, sock(mul.outputs, 'Result'), 0.85, nrm))


def mat_brain(fog, ridge, valley, scale=5.0):
    mat, n = new_material('brain')
    co = coords(n)
    nz = n.new('ShaderNodeTexNoise', Scale=scale * 0.5, Detail=2.0, Roughness=0.5)
    n.link(co, sock(nz.inputs, 'Vector'))
    k = n.new('ShaderNodeMath', _operation='MULTIPLY')
    n.link(sock(nz.outputs, 'Fac'), k.inputs[0])
    k.inputs[1].default_value = 9.0
    fr = n.new('ShaderNodeMath', _operation='FRACT')
    n.link(sock(k.outputs, 'Value'), fr.inputs[0])
    tri = n.new('ShaderNodeMath', _operation='PINGPONG')
    n.link(sock(fr.outputs, 'Value'), tri.inputs[0])
    tri.inputs[1].default_value = 0.5
    # tri: 0 in the middle of a ridge, 0.5 at the groove
    r = ramp_node(n, [(0.0, ridge), (0.25, ridge), (0.42, valley), (0.5, valley)])
    n.link(sock(tri.outputs, 'Value'), sock(r.inputs, 'Fac'))
    inv = n.new('ShaderNodeMath', _operation='SUBTRACT')
    inv.inputs[0].default_value = 0.5
    n.link(sock(tri.outputs, 'Value'), inv.inputs[1])
    nrm = bump(n, sock(inv.outputs, 'Value'), 0.8, 0.04)
    return fog.finish(mat, n, bsdf(n, sock(r.outputs, 'Color'), 0.6, nrm, sss=0.1))


def mat_polyps(fog, name, base, light, scale=40.0, rough=0.6):
    """Coral covered in small polyp cups."""
    mat, n = new_material(name)
    co = coords(n)
    vor = n.new('ShaderNodeTexVoronoi', Scale=scale, _feature='SMOOTH_F1')
    n.link(co, sock(vor.inputs, 'Vector'))
    r = ramp_node(n, [(0.0, base), (0.25, base), (0.55, light), (1.0, light)])
    n.link(sock(vor.outputs, 'Distance'), sock(r.inputs, 'Fac'))
    nrm = bump(n, sock(vor.outputs, 'Distance'), 0.6, 0.01)
    return fog.finish(mat, n, bsdf(n, sock(r.outputs, 'Color'), rough, nrm, sss=0.15))


def mat_tipped(fog, name, base, tip, scale=60.0):
    """Branching coral: polyp texture, base color fading to bright tips (by height in the object)."""
    mat, n = new_material(name)
    gen = coords(n, 'Generated')
    sep = n.new('ShaderNodeSeparateXYZ')
    n.link(gen, sock(sep.inputs, 'Vector'))
    r = ramp_node(n, [(0.0, base), (0.55, base), (0.95, tip), (1.0, tip)])
    n.link(sock(sep.outputs, 'Z'), sock(r.inputs, 'Fac'))
    vor = n.new('ShaderNodeTexVoronoi', Scale=scale, _feature='SMOOTH_F1')
    n.link(coords(n), sock(vor.inputs, 'Vector'))
    nrm = bump(n, sock(vor.outputs, 'Distance'), 0.5, 0.006)
    return fog.finish(mat, n, bsdf(n, sock(r.outputs, 'Color'), 0.55, nrm, sss=0.2))


def mat_plain(fog, name, color, rough=0.7, pores=0.0, sss=0.1):
    mat, n = new_material(name)
    c = n.new('ShaderNodeRGB')
    sock(c.outputs, 'Color').default_value = (*lin(color), 1)
    nrm = None
    col = sock(c.outputs, 'Color')
    if pores:
        vor = n.new('ShaderNodeTexVoronoi', Scale=pores, _feature='F1')
        n.link(coords(n), sock(vor.inputs, 'Vector'))
        nrm = bump(n, sock(vor.outputs, 'Distance'), 0.6, 0.01)
        noise_t = n.new('ShaderNodeTexNoise', Scale=6.0, Detail=4)
        n.link(coords(n), sock(noise_t.inputs, 'Vector'))
        vary = n.new('ShaderNodeMapRange', **{'To Min': 0.75, 'To Max': 1.15})
        n.link(sock(noise_t.outputs, 'Fac'), sock(vary.inputs, 'Value'))
        g = n.new('ShaderNodeCombineColor')
        for ch in ('Red', 'Green', 'Blue'):
            n.link(sock(vary.outputs, 'Result'), sock(g.inputs, ch))
        m = n.new('ShaderNodeMix', _data_type='RGBA', _blend_type='MULTIPLY', Factor=1.0)
        n.link(col, sock(m.inputs, 'A'))
        n.link(sock(g.outputs, 'Color'), sock(m.inputs, 'B'))
        col = sock(m.outputs, 'Result')
    return fog.finish(mat, n, bsdf(n, col, rough, nrm, sss=sss))


def mat_sand(fog):
    mat, n = new_material('sand')
    co = coords(n)
    mapping = n.new('ShaderNodeMapping', Scale=(1.0, 3.2, 1.0))
    n.link(co, sock(mapping.inputs, 'Vector'))
    wave = n.new('ShaderNodeTexWave', Scale=1.4, Distortion=4.0, Detail=2.0, _bands_direction='Y')
    n.link(sock(mapping.outputs, 'Vector'), sock(wave.inputs, 'Vector'))
    grain = n.new('ShaderNodeTexNoise', Scale=120.0, Detail=2)
    n.link(co, sock(grain.inputs, 'Vector'))
    blot = n.new('ShaderNodeTexNoise', Scale=1.2, Detail=3)
    n.link(co, sock(blot.inputs, 'Vector'))
    r = ramp_node(n, [(0.0, '#8f7a5c'), (0.5, '#b8a27c'), (1.0, '#cdb892')])
    n.link(sock(blot.outputs, 'Fac'), sock(r.inputs, 'Fac'))
    h = n.new('ShaderNodeMath', _operation='ADD')
    n.link(sock(wave.outputs, 'Fac'), h.inputs[0])
    gm = n.new('ShaderNodeMath', _operation='MULTIPLY')
    n.link(sock(grain.outputs, 'Fac'), gm.inputs[0])
    gm.inputs[1].default_value = 0.3
    n.link(sock(gm.outputs, 'Value'), h.inputs[1])
    nrm = bump(n, sock(h.outputs, 'Value'), 0.3, 0.03)
    return fog.finish(mat, n, bsdf(n, sock(r.outputs, 'Color'), 0.95, nrm))


def assign(o, mat):
    o.data.materials.clear()
    o.data.materials.append(mat)


# ---------- reef pieces ----------

def staghorn(name, base, size, rng, sides=7):
    lines = []

    def grow(p, d, length, r, depth):
        pts = []
        cur, dd = p.copy(), d.copy()
        steps = 5
        for s in range(steps + 1):
            pts.append((cur.copy(), r * (1 - 0.45 * s / steps)))
            if s < steps:
                jitter = Vector((rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2), rng.uniform(-0.05, 0.15)))
                dd = (dd + jitter + Vector((0, 0, 0.06))).normalized()
                cur = cur + dd * length / steps
        lines.append(pts)
        if depth > 0:
            for _ in range(rng.randint(1, 3)):
                idx = rng.randint(2, steps - 1)
                q = pts[idx][0]
                side = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), 0)).normalized()
                nd = (dd * 0.6 + side * 0.7 + Vector((0, 0, 0.35))).normalized()
                grow(q, nd, length * rng.uniform(0.5, 0.75), pts[idx][1] * 0.85, depth - 1)

    for _ in range(rng.randint(3, 5)):
        d = Vector((rng.uniform(-0.5, 0.5), rng.uniform(-0.4, 0.4), 1)).normalized()
        grow(base, d, size * rng.uniform(0.6, 1.0), size * 0.07, 2)
    return tubes(name, lines, sides)


def sea_fan(name, base, height, rng, yaw):
    lines = []

    def grow(p, d, length, r, depth):
        pts = []
        cur, dd = p.copy(), d.copy()
        steps = 4
        for s in range(steps + 1):
            pts.append((cur.copy(), r))
            if s < steps:
                dd = (dd + Vector((rng.uniform(-0.25, 0.25), 0, rng.uniform(-0.05, 0.1)))).normalized()
                cur = cur + dd * length / steps
        lines.append(pts)
        if depth > 0:
            for idx in (1, 2, 3):
                if rng.random() < 0.85:
                    side = 1 if rng.random() < 0.5 else -1
                    nd = (dd + Vector((side * rng.uniform(0.4, 0.9), 0, 0.1))).normalized()
                    grow(pts[idx][0], nd, length * rng.uniform(0.5, 0.7), r * 0.75, depth - 1)

    grow(base, Vector((0, 0, 1)), height * 0.45, 0.025, 4)
    o = tubes(name, lines, 5, cap=False)
    o.rotation_euler = (0, 0, yaw)
    return o


def anemone(name, base, radius, rng):
    lines = []
    count = int(70 * radius / 0.3)
    for _ in range(count):
        a = rng.uniform(0, 2 * math.pi)
        rr = radius * math.sqrt(rng.uniform(0.05, 1))
        p = base + Vector((math.cos(a) * rr, math.sin(a) * rr, 0.05))
        out = Vector((math.cos(a), math.sin(a), 0))
        d = (out * (0.3 + rr / radius) + Vector((0, 0, 1.3))).normalized()
        length = radius * rng.uniform(0.55, 0.95)
        pts = []
        cur = p.copy()
        for s in range(7):
            pts.append((cur.copy(), 0.022 * (1 + 0.6 * (s == 6))))
            sway = Vector((rng.uniform(-0.25, 0.25), rng.uniform(-0.25, 0.25), 0))
            d = (d + out * 0.18 + sway).normalized()
            cur = cur + d * length / 6
        lines.append(pts)
    return tubes(name, lines, 6)


def tube_sponges(name, base, rng):
    """A cluster of tapered tube sponges with flared, open rims."""
    lines = []
    for _ in range(rng.randint(2, 4)):
        off = Vector((rng.uniform(-0.22, 0.22), rng.uniform(-0.12, 0.12), 0))
        h = rng.uniform(0.4, 0.9)
        r = rng.uniform(0.07, 0.11)
        lean = Vector((rng.uniform(-0.3, 0.3), rng.uniform(-0.1, 0.1), 1)).normalized()
        pts = []
        for i in range(9):
            t = i / 8
            bend = Vector((0.06 * math.sin(t * 3 + h * 7), 0, 0))
            rad = r * (0.75 + 0.25 * t + 0.35 * max(0, t - 0.85) / 0.15)
            pts.append((base + off + lean * h * t + bend * t, rad))
        lines.append(pts)
    o = tubes(name, lines, 14, cap=False)
    sol = o.modifiers.new('wall', 'SOLIDIFY')
    sol.thickness = 0.025
    return o


def table_coral(name, base, radius, rng):
    stalk_h = rng.uniform(0.35, 0.6)
    rings, segs = 10, 40
    verts, faces = [], []
    top = base + Vector((0, 0, stalk_h))
    verts.append(top.copy())
    for i in range(1, rings + 1):
        rr = radius * i / rings
        for j in range(segs):
            a = 2 * math.pi * j / segs
            edge = 1 + 0.12 * noise.noise(Vector((math.cos(a) * 2, math.sin(a) * 2, i * 0.1)))
            x, y = math.cos(a) * rr * edge, math.sin(a) * rr * edge * 0.85
            z = 0.12 * radius * (i / rings) ** 2.2 + 0.03 * noise.noise(Vector((x * 4, y * 4, 1)))
            verts.append(top + Vector((x, y, z)))
    for j in range(segs):
        faces.append((0, 1 + j, 1 + (j + 1) % segs))
    for i in range(rings - 1):
        for j in range(segs):
            a = 1 + i * segs + j
            b = 1 + i * segs + (j + 1) % segs
            faces.append((a, a + segs, b + segs, b))
    plate = mesh_object(name, verts, faces)
    sol = plate.modifiers.new('thick', 'SOLIDIFY')
    sol.thickness = 0.05
    stalk = tubes(name + '-stalk', [[(base, 0.09), (base + Vector((0, 0, stalk_h * 0.6)), 0.07),
                                     (top, 0.12)]], 10, cap=False)
    return plate, stalk


def plates(name, base, size, rng):
    """Encrusting plate coral: overlapping curved plates tilted toward the viewer."""
    objs = []
    for i in range(rng.randint(3, 6)):
        r = size * rng.uniform(0.35, 0.6)
        rings, segs = 6, 28
        verts, faces = [Vector((0, 0, 0))], []
        for a_i in range(1, rings + 1):
            rr = r * a_i / rings
            for j in range(segs):
                a = 2 * math.pi * j / segs
                wob = 1 + 0.15 * noise.noise(Vector((math.cos(a) * 1.5, math.sin(a) * 1.5, i * 3.1)))
                x, y = math.cos(a) * rr * wob, math.sin(a) * rr * wob
                verts.append(Vector((x, y, 0.25 * (rr / r) ** 2 * r)))
        for j in range(segs):
            faces.append((0, 1 + j, 1 + (j + 1) % segs))
        for a_i in range(rings - 1):
            for j in range(segs):
                a = 1 + a_i * segs + j
                b = 1 + a_i * segs + (j + 1) % segs
                faces.append((a, a + segs, b + segs, b))
        o = mesh_object(f'{name}-{i}', verts, faces)
        sol = o.modifiers.new('thick', 'SOLIDIFY')
        sol.thickness = 0.03
        o.location = base + Vector((rng.uniform(-0.4, 0.4) * size, rng.uniform(-0.2, 0.1), i * 0.12 * size))
        o.rotation_euler = (math.radians(rng.uniform(-75, -45)), math.radians(rng.uniform(-20, 20)),
                            math.radians(rng.uniform(-25, 25)))
        objs.append(o)
    return objs


def soft_coral(name, base, size, rng):
    """Leather coral: a stalk with a wavy, folded cap."""
    stalk = tubes(name + '-stalk', [[(base, size * 0.16), (base + Vector((0, 0, size * 0.45)), size * 0.13)]],
                  12, cap=False)
    cap = blob(name, base + Vector((0, 0, size * 0.5)), size * 0.42, squash=0.35, lumpy=0.35,
               seed=rng.random() * 10, detail=4)
    return cap, stalk


# ---------- scene ----------

def surface_z(x, y, floor=0.0):
    """Height of whatever is already built at (x, y), by casting a ray down from above."""
    dg = bpy.context.evaluated_depsgraph_get()
    hit, loc, *_ = bpy.context.scene.ray_cast(dg, Vector((x, y, 30)), Vector((0, 0, -1)))
    return loc.z if hit else floor


def wrap_copies(objs):
    """Copy anything near a tile edge to the other side, so the tile repeats seamlessly."""
    for o in list(objs):
        xs = [(o.matrix_world @ Vector(c)).x for c in o.bound_box]
        lo, hi = min(xs), max(xs)
        for shift in (-W, W):
            if hi + shift > -0.5 and lo + shift < W + 0.5:
                c = o.copy()
                c.data = o.data
                c.location.x += shift
                bpy.context.scene.collection.objects.link(c)


def fit_under(objs, base, v_max, pitch_deg):
    """Scale a piece down about its base so its top stays inside the frame."""
    th = math.radians(pitch_deg)
    bpy.context.view_layer.update()
    top = max((o.matrix_world @ Vector(c)).y * math.sin(th) + (o.matrix_world @ Vector(c)).z * math.cos(th)
              for o in objs for c in o.bound_box)
    base_v = base.y * math.sin(th) + base.z * math.cos(th)
    if top <= v_max or top <= base_v + 0.05:
        return
    k = (v_max - base_v) / (top - base_v)
    for o in objs:
        o.location = base + (o.location - base) * k
        o.scale = o.scale * k


LAYERS = {
    # ppu: px per unit (smaller = farther away). h: px. bottom_v: screen v (units) of the frame's
    # bottom edge. crest: base height and sine terms (units). rows: rock rows from front to crest.
    # fog: (screen height 0..1 whose water color it fades to, start depth, density).
    # density: coral attempts per unit of tile width.
    'floor': {'seed': 3, 'ppu': 100, 'h': 438, 'bottom_v': -0.9, 'crest': (1.65, 1.0), 'crest_y': 1.5,
              'rows': 3, 'rock_r': (0.35, 1.0), 'rock_detail': 4, 'fog': (0.8, 29.0, 0.07),
              'density': 1.0, 'face_z': (0.15, 1.6), 'ledge': True},
    'reef': {'seed': 11, 'ppu': 62, 'h': 534, 'bottom_v': 0.0, 'crest': (6.0, 2.6), 'crest_y': 2.6,
             'rows': 7, 'rock_r': (0.45, 1.2), 'rock_detail': 3, 'fog': (0.62, 0.0, 0.02),
             'density': 0.8, 'face_z': (2.0, 7.0), 'ledge': False},
    'far': {'seed': 23, 'ppu': 40, 'h': 600, 'bottom_v': 0.0, 'crest': (11.5, 4.5), 'crest_y': 3.5,
            'rows': 8, 'rock_r': (0.9, 2.0), 'rock_detail': 2, 'fog': (0.55, 0.0, 0.028),
            'density': 0.35, 'face_z': (4.0, 12.0), 'ledge': False},
}
PITCH = 25


def set_tile(ppu):
    global W
    W = 2556 / ppu


def build_reef(P):
    """One tiling backdrop layer: a bank of coral heads on piled rock (with a sand ledge in front
    for the floor layer)."""
    rng = random.Random(P['seed'])
    t, start, density = P['fog']
    fog = Fog(water_at(t), start, density)
    v_top = P['bottom_v'] + P['h'] / P['ppu']
    v_max = v_top - 6 / P['ppu']
    rock_mat = mat_rock(fog)
    sand_mat = mat_sand(fog)
    brains = [mat_brain(fog, '#c9b26a', '#4f4a2a'), mat_brain(fog, '#9fc06a', '#2f4a2a', 6.5),
              mat_brain(fog, '#d38a5a', '#5a3524', 4.5), mat_brain(fog, '#a8c4b0', '#3a5048', 5.5)]
    boulders = [mat_polyps(fog, 'boulder-g', '#47603a', '#9fbd6a'), mat_polyps(fog, 'boulder-p', '#6a3f6e', '#c58ad0', 55),
                mat_polyps(fog, 'boulder-o', '#8a4e2a', '#f0a060', 50), mat_polyps(fog, 'boulder-t', '#2e6a6a', '#7ad0c0', 60)]
    stag = [mat_tipped(fog, 'stag-b', '#6a6a8a', '#a8d8ff'), mat_tipped(fog, 'stag-y', '#a08a4a', '#f3e6a0'),
            mat_tipped(fog, 'stag-p', '#8a4a7a', '#ff9ad0')]
    sponges = [mat_plain(fog, 'sponge-purple', '#6a3a7e', 0.9, pores=70), mat_plain(fog, 'sponge-orange', '#b8602e', 0.9, pores=70),
               mat_plain(fog, 'sponge-yellow', '#c2a03a', 0.9, pores=70)]
    fans = [mat_plain(fog, 'fan-red', '#b02a4a', 0.6), mat_plain(fog, 'fan-purple', '#7a3aa0', 0.6),
            mat_plain(fog, 'fan-orange', '#d0602a', 0.6)]
    anems = [mat_tipped(fog, 'anem-g', '#5a6a3a', '#f080c0', 30), mat_tipped(fog, 'anem-p', '#a8607a', '#ffd8ea', 30)]
    plate_mats = [mat_polyps(fog, 'plate-b', '#5a4632', '#a88a5a', 80), mat_polyps(fog, 'plate-p', '#5a3a6a', '#b48ac8', 80),
                  mat_polyps(fog, 'plate-g', '#3e5a3a', '#8ab070', 80)]
    softs = [mat_plain(fog, 'leather', '#cdbf8a', 0.6, pores=140, sss=0.25), mat_plain(fog, 'leather-g', '#9db27a', 0.6, pores=140, sss=0.25)]
    rubble = [mat_plain(fog, 'rubble', '#b8a88a', 0.9, pores=60), mat_plain(fog, 'shell', '#d8b8a8', 0.5, pores=0)]

    base, amp = P['crest']
    # Periods divide the tile; big slow swells make tall clusters with low stretches between.
    crest_terms = [(1, 0.3 * amp, 0.3), (2, 0.22 * amp, 1.9), (3, 0.28 * amp, 4.1), (5, 0.16 * amp, 2.2),
                   (7, 0.1 * amp, 0.7), (11, 0.05 * amp, 5.0)]

    def crest(x):
        return max(0.3, psines(x, crest_terms, base))

    cy0 = P['crest_y']

    def crest_y(x):
        return cy0 + 0.25 * cy0 * math.sin(2 * math.pi * 2 * x / W + 1.0)

    # Core: a heightfield fill behind the rocks, so no gaps show through.
    def core_z(x, y):
        cy = crest_y(x)
        up = smooth(0.2, cy + 0.3, y)
        down = 1 - 0.8 * smooth(cy + 0.6, cy + 2.8, y)
        return max(0.0, 0.8 * crest(x) * up * down + 0.25 * pnoise(x, y, 0.8, 1) * up)

    nx = int(16 * W)
    core = heightfield('core', core_z, -1.5, W + 1.5, 0.0, cy0 + 3.5, nx, 60)
    assign(core, rock_mat)
    # Sand only in front: behind the reef it would show as a flat horizon line.
    sand = heightfield('sand', lambda x, y: 0.04 * pnoise(x, y, 1.2, 7) - 0.03, -1.5, W + 1.5, -3.5,
                       0.8, int(8 * W), 30)
    assign(sand, sand_mat)

    # Piled rock: lumpy boulders, low at the front, building up to the crest.
    rocks = []
    rows = P['rows']
    r0, r1 = P['rock_r']
    x = 0.0
    while x < W:
        for i in range(rows):
            if i == 0 and rng.random() < 0.15:
                continue
            hfrac = (i + 1) / rows
            r = rng.uniform(r0, r1) * (0.6 + 0.4 * hfrac)
            y = 0.15 + (crest_y(x) - 0.4) * i / max(1, rows - 1) + rng.uniform(-0.15, 0.2)
            top = crest(x) * hfrac + rng.uniform(-0.15, 0.15)
            if top < 0.15:
                continue
            o = blob('rock', Vector((x + rng.uniform(-0.2, 0.2), y, top - r * 0.75)), r,
                     squash=0.75, lumpy=0.35, seed=rng.random() * 50, detail=P['rock_detail'])
            assign(o, rock_mat)
            rocks.append(o)
        x += rng.uniform(0.45, 0.75) * (r0 + r1) / 1.35
    wrap_copies(rocks)
    bpy.context.view_layer.update()

    pieces = []
    rad_guess = {'brain': 0.6, 'boulder': 0.45, 'stag': 0.6, 'plates': 0.55, 'fan': 0.4,
                 'sponge': 0.3, 'soft': 0.4, 'anemone': 0.38}

    def place(kind, p, normal=None, scale=1.0):
        o0 = Vector((0, 0, -0.05))
        r = rng
        if kind == 'brain':
            rad = r.uniform(0.4, 0.75) * scale
            objs = [blob('brain', o0 + Vector((0, 0, -rad * 0.2)), rad, squash=0.72, lumpy=0.08, seed=r.random() * 9)]
            assign(objs[0], r.choice(brains))
        elif kind == 'boulder':
            rad = r.uniform(0.3, 0.6) * scale
            objs = [blob('boulder', o0 + Vector((0, 0, -rad * 0.15)), rad, squash=0.8, lumpy=0.3, seed=r.random() * 9)]
            assign(objs[0], r.choice(boulders))
        elif kind == 'stag':
            objs = [staghorn('stag', o0, r.uniform(0.7, 1.1) * scale, r)]
            assign(objs[0], r.choice(stag))
        elif kind == 'fan':
            objs = [sea_fan('fan', o0, r.uniform(1.1, 1.6) * scale, r, r.uniform(-0.3, 0.3))]
            assign(objs[0], r.choice(fans))
        elif kind == 'anemone':
            objs = [anemone('anemone', o0, r.uniform(0.28, 0.4) * scale, r)]
            assign(objs[0], r.choice(anems))
        elif kind == 'sponge':
            objs = [tube_sponges('sponge', o0, r)]
            assign(objs[0], r.choice(sponges))
        elif kind == 'plates':
            objs = plates('plates', o0, r.uniform(0.8, 1.2) * scale, r)
            m = r.choice(plate_mats)
            for o in objs:
                assign(o, m)
        elif kind == 'soft':
            cap, stalk = soft_coral('soft', o0, r.uniform(0.5, 0.85) * scale, r)
            m = r.choice(softs)
            assign(cap, m)
            assign(stalk, m)
            objs = [cap, stalk]
        else:
            return []
        rot = Vector((0, 0, 1)).rotation_difference(
            (Vector((0, 0, 1)).lerp(normal, 0.6)).normalized() if normal is not None else Vector((0, 0, 1)))
        for o in objs:
            o.location = p + rot @ o.location
            o.rotation_euler = (rot @ o.rotation_euler.to_quaternion()).to_euler()
        fit_under(objs, p, v_max, PITCH)
        return objs

    def front_hit(x, z):
        dg = bpy.context.evaluated_depsgraph_get()
        hit, loc, nrm, *_ = bpy.context.scene.ray_cast(dg, Vector((x, -10, z)), Vector((0, 1, 0)))
        if hit and loc.y < cy0 + 1.1 and loc.z > 0.12:
            return loc, nrm
        return None

    taken = []

    def free(x, y, rad):
        for (tx, ty, tr) in taken:
            dx = min(abs(x - tx), W - abs(x - tx))
            if dx * dx + (y - ty) ** 2 < (0.7 * (rad + tr)) ** 2:
                return False
        return True

    k = P['density'] * W / 25.56
    zones = [
        (['brain', 'brain', 'boulder', 'stag', 'stag', 'plates', 'fan', 'sponge', 'soft', 'anemone'],
         (cy0 - 0.5, cy0 + 0.5), int(700 * k), 1.0),
        (['plates', 'plates', 'boulder', 'brain', 'anemone', 'soft', 'sponge', 'stag'],
         (0.35, cy0 - 0.4), int(700 * k), 0.85),
        (['boulder', 'anemone', 'plates', 'brain'], (0.0, 0.45), int(400 * k), 0.6),
    ]
    for kinds, (ya, yb), attempts, scale in zones:
        for _ in range(attempts):
            x = rng.uniform(0, W)
            y = rng.uniform(ya, yb) + (crest_y(x) - cy0) * 0.5
            kind = rng.choice(kinds)
            rg = rad_guess[kind] * scale
            if not free(x, y, rg):
                continue
            objs = place(kind, Vector((x, y, surface_z(x, y))), None, scale)
            if objs:
                taken.append((x, y, rg))
                pieces += objs
                bpy.context.view_layer.update()
    # Colonies on the front faces of the rock, found by casting rays from the viewer's side.
    face = []
    za, zb = P['face_z']
    for _ in range(int(900 * k * (zb - za) / 1.45)):
        x, z = rng.uniform(0, W), rng.uniform(za, zb)
        h = front_hit(x, z)
        if not h:
            continue
        loc, nrm = h
        kind = rng.choice(['plates', 'plates', 'boulder', 'brain', 'anemone', 'soft'])
        rg = rad_guess[kind] * 0.6
        if any((min(abs(x - fx), W - abs(x - fx))) ** 2 + (z - fz) ** 2 < (0.75 * (rg + fr)) ** 2 for fx, fz, fr in face):
            continue
        objs = place(kind, loc - nrm * 0.03, nrm, 0.6)
        if objs:
            face.append((x, z, rg))
            pieces += objs
    if P['ledge']:
        # The ledge critters walk on: sand with rubble and shell bits.
        for _ in range(160):
            x, y = rng.uniform(0, W), rng.uniform(-2.0, -0.05)
            rad = rng.uniform(0.03, 0.1)
            o = blob('rubble', Vector((x, y, rad * 0.1)), rad, squash=0.5, lumpy=0.4, seed=rng.random() * 9, detail=2)
            assign(o, rng.choice(rubble))
            pieces.append(o)
    wrap_copies(pieces)
    return fog


def reef_lights(scene):
    from common import area, sun, world
    world(scene, (0.05, 0.17, 0.25), 0.8)
    sun(scene, 'key', (30, -22, 0), (1.0, 0.96, 0.88), 6.0, angle_deg=2.5)
    area(scene, 'fill', (W / 2, -12, 2), (W / 2, 1, 1), (0.45, 0.75, 1.0), 1200, 30)


def reef_camera(scene, x0, width_units, w_px, h_px, pitch_deg=25, bottom_v=-0.9):
    """Orthographic camera looking along +Y, pitched down. Screen v (units, up) of a point is
    y*sin(pitch) + z*cos(pitch); the frame's bottom edge is at v = bottom_v."""
    th = math.radians(pitch_deg)
    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'ORTHO'
    cam_data.sensor_fit = 'HORIZONTAL'
    cam_data.ortho_scale = width_units
    cam_data.clip_start = 0.01
    cam_data.clip_end = 200
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    h_units = width_units * h_px / w_px
    vc = bottom_v + h_units / 2
    # A point at screen v = vc on the y=0 plane, then back off along the view direction.
    up = Vector((0, math.sin(th), math.cos(th)))
    view = Vector((0, math.cos(th), -math.sin(th)))
    center = Vector((x0 + width_units / 2, 0, 0)) + up * vc
    cam.location = center - view * 30
    cam.rotation_euler = (math.pi / 2 - th, 0, 0)
    scene.camera = cam
    scene.render.resolution_x = w_px
    scene.render.resolution_y = h_px
    return cam


# ---------- water ----------

# Linear emission colors, top of the screen to the bottom. They're rendered through the same view
# transform as the reef, so the haze on each layer matches the water behind it. On screen (Khronos
# PBR Neutral): about (30, 159, 201) at the top, (0, 124, 180) in the middle, (0, 61, 101) at the
# bottom.
WATER = [(0.0, (0.045, 0.376, 0.61)), (0.45, (0.003, 0.205, 0.456)), (1.0, (0.0, 0.048, 0.133))]


def water_at(t):
    for (t0, c0), (t1, c1) in zip(WATER, WATER[1:]):
        if t <= t1:
            k = (t - t0) / (t1 - t0)
            return tuple(a + (b - a) * k for a, b in zip(c0, c1))
    return WATER[-1][1]


def build_water(scene):
    from common import ortho_camera
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0), rotation=(math.pi / 2, 0, 0))
    plane = bpy.context.object
    plane.scale = (1.0, 10.8, 1.0)
    mat, n = new_material('water')
    gen = coords(n, 'Generated')
    sep = n.new('ShaderNodeSeparateXYZ')
    n.link(gen, sock(sep.inputs, 'Vector'))
    inv = n.new('ShaderNodeMath', _operation='SUBTRACT')
    inv.inputs[0].default_value = 1.0
    n.link(sock(sep.outputs, 'Y'), inv.inputs[1])
    r = ramp_node(n, WATER, 'LINEAR')
    n.link(sock(inv.outputs, 'Value'), sock(r.inputs, 'Fac'))
    em = n.new('ShaderNodeEmission', Strength=1.0)
    n.link(sock(r.outputs, 'Color'), sock(em.inputs, 'Color'))
    out = n.new('ShaderNodeOutputMaterial')
    n.link(sock(em.outputs, 'Emission'), sock(out.inputs, 'Surface'))
    assign(plane, mat)
    scene.render.film_transparent = False
    ortho_camera(scene, 0, 0, 0.08, 8, 1080, 1)
    scene.camera.data.sensor_fit = 'VERTICAL'
    scene.camera.data.ortho_scale = 10.8
    return {'layer': 'water', 'w': 8, 'h': 1080}


def backdrop_builder(layer):
    def build(scene):
        P = LAYERS[layer]
        set_tile(P['ppu'])
        build_reef(P)
        reef_lights(scene)
        reef_camera(scene, 0.0, W, 2556, P['h'], PITCH, P['bottom_v'])
        return {'layer': layer, 'w': 2556, 'h': P['h']}
    return build


BACKDROPS = {'water': build_water, 'far': backdrop_builder('far'), 'reef': backdrop_builder('reef'),
             'floor': backdrop_builder('floor')}
