"""Procedural rare visitors: a green sea turtle, a manta ray and a jellyfish.

Each builder models the animal in its own local frame (x forward, y to its left, z up), then places
every object with one world matrix so the camera sees it from the angle we want. Object texture
coordinates therefore stay in the animal's frame, and pivots are mapped through the same matrix.

The helpers at the top (lofts, tubes with UVs, material snippets, holdouts) are shared with
critters.py.
"""

import math

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

from common import (area, assign, creature_lights, image_from_array, mesh_object, new_material, profile,
                    smoothstep, sock, srgb, subdivide, sun, world)


# ====================================================================================
# geometry helpers
# ====================================================================================

def lin(hexstr):
    c = srgb(hexstr)
    return tuple(float(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c)


def fix_normals(o):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()


def grid_mesh(name, P, closed=True, caps=(None, None), smooth=True, recalc=True, flip=False):
    """Mesh from a grid of points P[row][col] (rows along the length, cols around). UV u runs
    around (0..1), v along the rows (0..1). caps: optional end points that close row 0 / row -1."""
    nv, nu = len(P), len(P[0])
    verts = [tuple(p) for row in P for p in row]
    cols = nu if closed else nu - 1
    du = 1.0 / (nu if closed else nu - 1)
    faces, fuv = [], []
    for i in range(nv - 1):
        v0, v1 = i / (nv - 1), (i + 1) / (nv - 1)
        for j in range(cols):
            j1 = (j + 1) % nu
            f = [(i * nu + j, (j * du, v0)), (i * nu + j1, ((j + 1) * du, v0)),
                 ((i + 1) * nu + j1, ((j + 1) * du, v1)), ((i + 1) * nu + j, (j * du, v1))]
            if flip:
                f.reverse()
            faces.append(tuple(a for a, _ in f))
            fuv.append(tuple(b for _, b in f))
    for k, cap in enumerate(caps):
        if cap is None:
            continue
        ci = len(verts)
        verts.append(tuple(cap))
        row = 0 if k == 0 else nv - 1
        vv = 0.0 if k == 0 else 1.0
        for j in range(cols):
            j1 = (j + 1) % nu
            f = [(row * nu + j1, ((j + 1) * du, vv)), (row * nu + j, (j * du, vv)), (ci, ((j + 0.5) * du, vv))]
            if flip != (k == 1):
                f.reverse()
            faces.append(tuple(a for a, _ in f))
            fuv.append(tuple(b for _, b in f))
    o = mesh_object(name, verts, faces, smooth)
    uv = o.data.uv_layers.new(name='UVMap')
    for poly, cuv in zip(o.data.polygons, fuv):
        for li, c in zip(poly.loop_indices, cuv):
            uv.data[li].uv = c
    if recalc:
        fix_normals(o)
    return o


def superellipse(a, n):
    c, s = math.cos(a), math.sin(a)
    e = 2.0 / n
    return math.copysign(abs(c) ** e, c), math.copysign(abs(s) ** e, s)


def loft(name, stations, ring=24, n=2.0, caps=True, smooth=True):
    """Loft through cross-sections. stations: [(center, side, up, r_side, r_up), ...] where side/up
    are unit vectors. Ring angle 0 points along +side, 90 deg along +up."""
    P = []
    for c, sd, up, rs, ru in stations:
        row = []
        for j in range(ring):
            cs, sn = superellipse(2 * math.pi * j / ring, n)
            row.append(Vector(c) + Vector(sd) * rs * cs + Vector(up) * ru * sn)
        P.append(row)
    cap = (Vector(stations[0][0]), Vector(stations[-1][0])) if caps else (None, None)
    return grid_mesh(name, P, True, cap, smooth)


def bezier(p0, p1, p2, p3, t):
    u = 1 - t
    return p0 * u ** 3 + p1 * 3 * u * u * t + p2 * 3 * u * t * t + p3 * t ** 3


def spine(points, up_hint):
    """Tangent, side and up vectors along a polyline, keeping 'up' close to up_hint."""
    out = []
    n = len(points)
    for i, p in enumerate(points):
        t = (points[min(i + 1, n - 1)] - points[max(i - 1, 0)]).normalized()
        sd = t.cross(Vector(up_hint))
        if sd.length < 1e-6:
            sd = t.orthogonal()
        sd.normalize()
        up = sd.cross(t).normalized()
        out.append((t, sd, up))
    return out


def tubes_uv(name, lines, sides=8, cap=True, smooth=True):
    """Tubes along polylines [(Vector, radius), ...] with UVs (u around, v along each line)."""
    verts, faces, fuv = [], [], []
    du = 1.0 / sides
    for line in lines:
        n = len(line)
        if n < 2:
            continue
        start = len(verts)
        prev = None
        d = Vector((0, 0, 1))
        for i, (p, r) in enumerate(line):
            d = line[min(i + 1, n - 1)][0] - line[max(i - 1, 0)][0]
            d = d.normalized() if d.length > 1e-9 else Vector((0, 0, 1))
            if prev is None:
                a = d.orthogonal().normalized()
            else:
                a = prev - d * prev.dot(d)
                a = a.normalized() if a.length > 1e-6 else d.orthogonal().normalized()
            prev = a
            b = d.cross(a)
            for k in range(sides):
                ang = 2 * math.pi * k / sides
                verts.append(p + (a * math.cos(ang) + b * math.sin(ang)) * r)
        for i in range(n - 1):
            v0, v1 = i / (n - 1), (i + 1) / (n - 1)
            for k in range(sides):
                a0 = start + i * sides + k
                a1 = start + i * sides + (k + 1) % sides
                faces.append((a0, a1, a1 + sides, a0 + sides))
                fuv.append(((k * du, v0), ((k + 1) * du, v0), ((k + 1) * du, v1), (k * du, v1)))
        if cap:
            tip = len(verts)
            verts.append(line[-1][0] + d * line[-1][1] * 0.7)
            last = start + (n - 1) * sides
            for k in range(sides):
                faces.append((last + k, last + (k + 1) % sides, tip))
                fuv.append(((k * du, 1.0), ((k + 1) * du, 1.0), ((k + 0.5) * du, 1.0)))
            base = len(verts)
            verts.append(line[0][0] - (line[1][0] - line[0][0]).normalized() * line[0][1] * 0.5)
            for k in range(sides):
                faces.append((start + (k + 1) % sides, start + k, base))
                fuv.append((((k + 1) * du, 0.0), (k * du, 0.0), ((k + 0.5) * du, 0.0)))
    o = mesh_object(name, verts, faces, smooth)
    uv = o.data.uv_layers.new(name='UVMap')
    for poly, cuv in zip(o.data.polygons, fuv):
        for li, c in zip(poly.loop_indices, cuv):
            uv.data[li].uv = c
    fix_normals(o)
    return o


def ellipsoid(name, center, radii, rot=None, segs=24, rings=14):
    """UV sphere scaled to radii, optionally rotated by a 3x3 matrix (columns = local axes)."""
    P = []
    for i in range(1, rings):
        th = math.pi * i / rings
        row = []
        for j in range(segs):
            ph = 2 * math.pi * j / segs
            row.append(Vector((math.sin(th) * math.cos(ph) * radii[0], math.sin(th) * math.sin(ph) * radii[1],
                               math.cos(th) * radii[2])))
        P.append(row)
    caps = (Vector((0, 0, radii[2])), Vector((0, 0, -radii[2])))
    o = grid_mesh(name, P, True, caps)
    m = Matrix.Translation(Vector(center))
    if rot is not None:
        m = m @ Matrix(rot).to_4x4()
    o.matrix_world = m
    return o


def quick_lights(scene, rim=True):
    """The standard creature lights with fewer light bounces (these are small, mostly opaque
    models; the extra bounces cost render time without changing the look). rim=False lowers the
    rim light for animals seen from above, whose backs would otherwise mirror it as a white glare."""
    if rim:
        creature_lights(scene)
    else:
        world(scene, (0.05, 0.16, 0.22), 1.1)
        sun(scene, 'key', (20, 14, 0), (1.0, 0.97, 0.9), 5.5, angle_deg=5)
        area(scene, 'fill', (0, -6, -2.5), (0, 0, 0), (0.5, 0.78, 1.0), 70, 5)
        area(scene, 'rim', (-1.5, 5, 0.6), (0, 0, 0.3), (0.8, 0.95, 1.0), 300, 2)
    c = scene.cycles
    c.max_bounces, c.diffuse_bounces, c.glossy_bounces = 4, 2, 2
    c.transmission_bounces, c.volume_bounces = 4, 0
    c.adaptive_threshold = 0.03
    c.denoising_prefilter = 'FAST'
    # The renderer draws each part and pose in turn from this one scene: keep the synced scene,
    # textures and shaders between those renders instead of rebuilding them every time.
    scene.render.use_persistent_data = True


def top_lights(scene):
    quick_lights(scene, rim=False)


def place(objs, M):
    """Apply the creature's world matrix to objects built in its local frame."""
    for o in objs:
        o.matrix_world = M @ o.matrix_world
    bpy.context.view_layer.update()


def holdout_copy(src, shrink=0.985, center=None):
    """A camera-only holdout twin of src (slightly shrunk so it hides inside src). Not part of any
    part, so it stays in every part's render and masks whatever lies behind the real object: a part
    drawn in front (a flipper) then disappears where the body should cover its root."""
    o = src.copy()
    o.data = src.data.copy()
    o.name = src.name + '-holdout'
    for m in list(o.modifiers):
        if m.type != 'SUBSURF':
            o.modifiers.remove(m)
    # Kept in their own collection, so a line renderer (Freestyle) can leave them out.
    coll = bpy.data.collections.get('holdouts')
    if coll is None:
        coll = bpy.data.collections.new('holdouts')
        bpy.context.scene.collection.children.link(coll)
    coll.objects.link(o)
    c = Vector(center) if center is not None else sum((Vector(v.co) for v in o.data.vertices), Vector()) / len(
        o.data.vertices)
    for v in o.data.vertices:
        v.co = c + (v.co - c) * shrink
    mat, n = new_material('holdout')
    out = n.new('ShaderNodeOutputMaterial')
    n.link(sock(n.new('ShaderNodeHoldout').outputs, 'Holdout'), sock(out.inputs, 'Surface'))
    assign(o, mat)
    for attr in ('visible_shadow', 'visible_diffuse', 'visible_glossy', 'visible_transmission',
                 'visible_volume_scatter'):
        setattr(o, attr, False)
    o.matrix_world = src.matrix_world.copy()
    return o


# ====================================================================================
# material helpers
# ====================================================================================

def ramp(n, stops, interp='LINEAR'):
    r = n.new('ShaderNodeValToRGB')
    cr = r.color_ramp
    cr.interpolation = interp
    cr.elements[0].position, cr.elements[0].color = stops[0][0], (*lin(stops[0][1]), 1)
    cr.elements[1].position, cr.elements[1].color = stops[-1][0], (*lin(stops[-1][1]), 1)
    for pos, col in stops[1:-1]:
        el = cr.elements.new(pos)
        el.color = (*lin(col), 1)
    return r


def coord(n, kind='Object'):
    return sock(n.new('ShaderNodeTexCoord').outputs, kind)


def uv_xy(n, name='UVMap'):
    uv = n.new('ShaderNodeUVMap', _uv_map=name)
    sep = n.new('ShaderNodeSeparateXYZ')
    n.link(sock(uv.outputs, 'UV'), sock(sep.inputs, 'Vector'))
    return sock(sep.outputs, 'X'), sock(sep.outputs, 'Y'), sock(uv.outputs, 'UV')


def math_node(n, op, a, b=None, clamp=False):
    m = n.new('ShaderNodeMath', _operation=op, _use_clamp=clamp)
    for i, v in enumerate((a, b)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            m.inputs[i].default_value = v
        else:
            n.link(v, m.inputs[i])
    return sock(m.outputs, 'Value')


def map_range(n, value, a, b, c=0.0, d=1.0, clamp=True, interp='LINEAR'):
    m = n.new('ShaderNodeMapRange', _interpolation_type=interp, _clamp=clamp,
              **{'From Min': a, 'From Max': b, 'To Min': c, 'To Max': d})
    n.link(value, sock(m.inputs, 'Value'))
    return sock(m.outputs, 'Result')


def mix(n, fac, a, b, blend='MIX'):
    m = n.new('ShaderNodeMix', _data_type='RGBA', _blend_type=blend)
    for key, v in (('Factor', fac), ('A', a), ('B', b)):
        s = sock(m.inputs, key)
        if isinstance(v, (int, float)):
            s.default_value = v
        elif isinstance(v, tuple):
            s.default_value = v if len(v) == 4 else (*v, 1)
        elif isinstance(v, str):
            s.default_value = (*lin(v), 1)
        else:
            n.link(v, s)
    return sock(m.outputs, 'Result')


def rgb(n, hexstr):
    c = n.new('ShaderNodeRGB')
    sock(c.outputs, 'Color').default_value = (*lin(hexstr), 1)
    return sock(c.outputs, 'Color')


def noise(n, vec, scale, detail=3.0, rough=0.55, distortion=0.0):
    t = n.new('ShaderNodeTexNoise', Scale=scale, Detail=detail, Roughness=rough, Distortion=distortion)
    n.link(vec, sock(t.inputs, 'Vector'))
    return sock(t.outputs, 'Fac')


def vary(n, color, vec, scale, lo=0.85, hi=1.12, detail=3.0):
    """Multiply a color by soft blotchy noise so big areas aren't flat."""
    f = map_range(n, noise(n, vec, scale, detail), 0.3, 0.7, lo, hi)
    g = n.new('ShaderNodeCombineColor')
    for ch in ('Red', 'Green', 'Blue'):
        n.link(f, sock(g.inputs, ch))
    return mix(n, 1.0, color, sock(g.outputs, 'Color'), 'MULTIPLY')


def bump(n, height, strength, distance=0.01, normal=None):
    b = n.new('ShaderNodeBump', Strength=strength, Distance=distance)
    n.link(height, sock(b.inputs, 'Height'))
    if normal is not None:
        n.link(normal, sock(b.inputs, 'Normal'))
    return sock(b.outputs, 'Normal')


def local_normal(n):
    """Shading normal in object space (the creature's own frame): (x, y, z) sockets."""
    sep = n.new('ShaderNodeSeparateXYZ')
    n.link(coord(n, 'Normal'), sock(sep.inputs, 'Vector'))
    return sock(sep.outputs, 'X'), sock(sep.outputs, 'Y'), sock(sep.outputs, 'Z')


def pbr(n, color, rough=0.45, normal=None, sss=0.1, sss_scale=0.02, coat=0.2, coat_rough=0.2, spec=0.5,
        alpha=None, emission=None, emission_strength=0.0, sheen=0.0, sss_radius=None):
    b = n.new('ShaderNodeBsdfPrincipled', Roughness=rough, **{
        'Subsurface Weight': sss, 'Subsurface Scale': sss_scale, 'Coat Weight': coat,
        'Coat Roughness': coat_rough, 'Specular IOR Level': spec, 'Sheen Weight': sheen})
    if sss_radius is not None:
        sock(b.inputs, 'Subsurface Radius').default_value = sss_radius
    for key, v in (('Base Color', color), ('Normal', normal), ('Alpha', alpha),
                   ('Emission Color', emission)):
        if v is None:
            continue
        s = sock(b.inputs, key)
        if isinstance(v, str):
            s.default_value = (*lin(v), 1)
        elif isinstance(v, (int, float)):
            s.default_value = v
        else:
            n.link(v, s)
    if emission is not None:
        sock(b.inputs, 'Emission Strength').default_value = emission_strength
    return sock(b.outputs, 'BSDF')


def finish(mat, n, shader):
    out = n.new('ShaderNodeOutputMaterial')
    n.link(shader, sock(out.inputs, 'Surface'))
    return mat


def uv_image(n, img, uv_name='UVMap', interp='Cubic'):
    uv = n.new('ShaderNodeUVMap', _uv_map=uv_name)
    tex = n.new('ShaderNodeTexImage', _image=img, _extension='EXTEND', _interpolation=interp)
    n.link(sock(uv.outputs, 'UV'), sock(tex.inputs, 'Vector'))
    return tex


def paint(name, rgb_arr, alpha=None):
    """numpy (h, w, 3) sRGB colors (row 0 = bottom = v 0) -> packed Blender image."""
    h, w = rgb_arr.shape[:2]
    a = np.ones((h, w, 1)) if alpha is None else alpha[..., None]
    return image_from_array(name, np.concatenate([np.clip(rgb_arr, 0, 1), a], axis=-1))


def palette(values, stops):
    """Map an array of values through (pos, hex) color stops -> (..., 3) sRGB."""
    pos = np.array([s[0] for s in stops])
    cols = np.array([srgb(s[1]) for s in stops])
    out = np.empty(values.shape + (3,))
    for ch in range(3):
        out[..., ch] = np.interp(values, pos, cols[:, ch])
    return out


def blend(base, color, f):
    f = np.asarray(f)[..., None]
    return base * (1 - f) + np.asarray(color) * f


def uv_grid(w, h):
    return np.meshgrid((np.arange(w) + 0.5) / w, (np.arange(h) + 0.5) / h)


def smooth_noise1d(rng, n, k):
    """Periodic smooth random values (length n) built from k random harmonics."""
    x = np.linspace(0, 2 * np.pi, n, endpoint=False)
    v = np.zeros(n)
    for f in range(1, k + 1):
        v += rng.normal() / f * np.sin(f * x + rng.uniform(0, 2 * np.pi))
    v -= v.min()
    return v / max(v.max(), 1e-6)


def eye(name, center, radius, iris='#3a2a18', axis=Vector((0, -1, 0)), squash=0.6, pupil=0.42, ring='#d8c890',
        ring_w=0.0):
    """A glossy eye: a squashed sphere whose local -Y axis looks along `axis`."""
    rot = Vector(axis).to_track_quat('-Y', 'Z').to_matrix()
    o = ellipsoid(name, center, (radius, radius * squash, radius), rot, 24, 12)
    mat, n = new_material(name)
    co = coord(n)
    sep = n.new('ShaderNodeSeparateXYZ')
    n.link(co, sock(sep.inputs, 'Vector'))
    comb = n.new('ShaderNodeCombineXYZ')
    n.link(sock(sep.outputs, 'X'), sock(comb.inputs, 'X'))
    n.link(sock(sep.outputs, 'Z'), sock(comb.inputs, 'Y'))
    ln = n.new('ShaderNodeVectorMath', _operation='LENGTH')
    n.link(sock(comb.outputs, 'Vector'), ln.inputs[0])
    d = map_range(n, sock(ln.outputs, 'Value'), 0, radius, 0, 1)
    stops = [(0.0, '#030303'), (pupil, '#050505'), (pupil + 0.08, iris), (0.72, iris), (0.82, '#140c06'),
             (1.0, '#0c0806')]
    if ring_w:
        stops = stops[:-2] + [(0.86, '#140c06'), (0.9, ring), (1.0, ring)]
    r = ramp(n, stops, 'EASE')
    n.link(d, sock(r.inputs, 'Fac'))
    sh = pbr(n, sock(r.outputs, 'Color'), rough=0.2, coat=1.0, coat_rough=0.03, sss=0.0)
    assign(o, finish(mat, n, sh))
    return o


# ====================================================================================
# turtle
# ====================================================================================

TURTLE_SEED = 7


def shell_texture(Ax_f, Ax_b, B, v_rim, rng, w=2048, h=512):
    """Carapace scutes painted in the shell's (angle, row) UV space. Rows on the top surface are
    spaced by arc length, so v / v_rim is the fraction of the way from the crown to the rim."""
    U, Vv = uv_grid(w, h)
    phi = 2 * np.pi * U
    top = Vv <= v_rim
    rho = np.clip(Vv / v_rim, 0, 1)
    c, s = np.cos(phi), np.sin(phi)
    X = rho * np.where(c >= 0, Ax_f, Ax_b) * c
    Y = rho * B * s
    P = np.stack([X, Y], -1)

    # Inner scutes: Voronoi cells around hand-placed seeds (5 vertebrals, 4 costals a side).
    vert = [(0.78, 0.0), (0.4, 0.0), (0.02, 0.0), (-0.38, 0.0), (-0.78, 0.0)]
    cost = [(0.55, 0.5), (0.16, 0.6), (-0.24, 0.6), (-0.62, 0.46)]
    seeds = vert + cost + [(x, -y) for x, y in cost]
    S = np.array(seeds)
    d2 = ((P[..., None, :] - S[None, None]) ** 2).sum(-1)
    order = np.argsort(d2, axis=-1)
    i1 = order[..., 0]
    # Distance to the nearest Voronoi edge (exact bisector distance).
    edge = np.full(X.shape, 9.0)
    for j in range(len(S)):
        sj = S[j]
        si = S[i1]
        diff = sj[None, None] - si
        dl = np.linalg.norm(diff, axis=-1)
        dist = (d2[..., j] - np.take_along_axis(d2, i1[..., None], -1)[..., 0]) / (2 * np.maximum(dl, 1e-6))
        dist = np.where(i1 == j, 9.0, dist)
        edge = np.minimum(edge, dist)

    marg = rho > 0.86
    nm = 26
    seg = np.floor((phi / (2 * np.pi)) * nm + 0.5) % nm
    seg_edge = np.abs(((phi / (2 * np.pi)) * nm + 0.5) % 1 - 0.5) * (2 * np.pi / nm) * 1.15
    ring_edge = np.abs(rho - 0.86) * 1.1
    edge = np.where(marg, np.minimum(seg_edge, ring_edge), np.minimum(edge, ring_edge))
    sid = np.where(marg, 100 + seg, i1)

    # Each scute: soft streaks radiating from a growth point near its rear edge, broken up by blotches.
    stops = [(0.0, '#1a1209'), (0.2, '#33240f'), (0.38, '#4f3b18'), (0.55, '#6c5220'), (0.72, '#8a6c2c'),
             (0.88, '#a8873e'), (1.0, '#bc9c52')]
    blot = np.zeros(X.shape)
    for f in range(1, 6):
        blot += np.sin(X * 7 * f + rng.uniform(0, 6)) * np.sin(Y * 6.3 * f + rng.uniform(0, 6)) / f
    val = np.zeros(X.shape)
    for k in np.unique(sid):
        m = sid == k
        if k >= 100:
            a = 2 * np.pi * (k - 100) / nm
            ax = Ax_f if math.cos(a) >= 0 else Ax_b
            gx, gy = 0.98 * ax * math.cos(a), 0.98 * B * math.sin(a)
        else:
            sx, sy = S[int(k)]
            gx, gy = sx - 0.16, sy * 1.15
        th = np.arctan2(Y[m] - gy, X[m] - gx)
        r = np.hypot(Y[m] - gy, X[m] - gx)
        lut = smooth_noise1d(rng, 512, 40)
        lut2 = smooth_noise1d(rng, 512, 9)
        idx = ((th / (2 * np.pi)) % 1 * 512).astype(int) % 512
        base = rng.uniform(0.32, 0.58)
        # Fine rays get stronger away from the growth point; broad blotches carry most of the color.
        ray = smoothstep(0.03, 0.25, r)
        v = (base + 0.3 * ray * (lut[idx] - 0.5) + 0.3 * (lut2[idx] - 0.5) + 0.16 * blot[m]
             - 0.18 * np.exp(-r / 0.08))
        val[m] = v
    col = palette(np.clip(val, 0, 1), stops)
    # Darker toward each scute's border, then a thin pale seam.
    col = col * (0.7 + 0.3 * smoothstep(0.0, 0.08, edge))[..., None]
    seam = 1 - smoothstep(0.007, 0.016, edge)
    col = blend(col, srgb('#a89a78'), seam * 0.75)
    # Plastron (underside): creamy yellow with faint seams.
    under = ~top
    pl = srgb('#e2cd8c') * np.ones(X.shape + (3,))
    pseam = 1 - smoothstep(0.004, 0.012, np.abs(((Vv - v_rim) / (1 - v_rim) * 3) % 1 - 0.5) * 0.2)
    pl = blend(pl, srgb('#b49a5c'), pseam * 0.5)
    col = np.where(under[..., None], pl, col)
    return paint('carapace', col)


def shell_material(img):
    mat, n = new_material('carapace')
    tex = uv_image(n, img)
    co = coord(n)
    col = vary(n, sock(tex.outputs, 'Color'), co, 6.0, 0.82, 1.12)
    # Fine growth texture and a little pitting.
    fine = noise(n, co, 60.0, 6.0, 0.6)
    bw = n.new('ShaderNodeRGBToBW')
    n.link(sock(tex.outputs, 'Color'), sock(bw.inputs, 'Color'))
    h = math_node(n, 'ADD', math_node(n, 'MULTIPLY', sock(bw.outputs, 'Val'), 0.6), math_node(n, 'MULTIPLY', fine, 0.25))
    nrm = bump(n, h, 0.35, 0.01)
    sh = pbr(n, col, rough=0.62, normal=nrm, sss=0.0, coat=0.12, coat_rough=0.3, spec=0.35)
    return finish(mat, n, sh)


def scaly_skin(name, scale, dark='#21170c', mid='#4e3a1f', border='#b39a62', belly='#e2d4a8', belly_bias=-0.25,
               edge_w=0.06, uv_pale=None):
    """Reptile skin: polygonal scales (Voronoi cells) in browns with cream seams between them, cream
    on the underside (by object-space normal)."""
    mat, n = new_material(name)
    co = coord(n)
    v1 = n.new('ShaderNodeTexVoronoi', Scale=scale, Randomness=0.9, _feature='F1')
    n.link(co, sock(v1.inputs, 'Vector'))
    v2 = n.new('ShaderNodeTexVoronoi', Scale=scale, Randomness=0.9, _feature='DISTANCE_TO_EDGE')
    n.link(co, sock(v2.inputs, 'Vector'))
    bw = n.new('ShaderNodeRGBToBW')
    n.link(sock(v1.outputs, 'Color'), sock(bw.inputs, 'Color'))
    r = ramp(n, [(0.0, dark), (0.55, mid), (1.0, mid)])
    n.link(sock(bw.outputs, 'Val'), sock(r.inputs, 'Fac'))
    seam = map_range(n, sock(v2.outputs, 'Distance'), edge_w, edge_w * 0.35, 0, 1)
    col = mix(n, seam, sock(r.outputs, 'Color'), border)
    nx, ny, nz = local_normal(n)
    under = map_range(n, nz, belly_bias, belly_bias - 0.35, 0, 1)
    col = mix(n, under, col, belly)
    if uv_pale is not None:
        u, v, _ = uv_xy(n)
        d = math_node(n, 'ABSOLUTE', math_node(n, 'SUBTRACT', u, 0.5))
        pale = map_range(n, d, uv_pale + 0.05, uv_pale - 0.02, 0, 1)
        col = mix(n, math_node(n, 'MULTIPLY', pale, 0.85), col, belly)
    col = vary(n, col, co, 8.0, 0.85, 1.1)
    hgt = map_range(n, sock(v2.outputs, 'Distance'), 0.0, 0.25, 0, 1)
    nrm = bump(n, hgt, 0.5, 0.006)
    sh = pbr(n, col, rough=0.58, normal=nrm, sss=0.0, coat=0.12, coat_rough=0.3)
    return finish(mat, n, sh)


def build_shell(Ax_f=1.22, Ax_b=1.34, B=1.0, H=0.5, nphi=96, n_top=26, n_bot=8):
    def ztop(r):
        return H * max(0.0, 1 - r ** 2.3) ** 0.5

    def zbot(r):
        return -0.26 * max(0.0, 1 - r ** 3.0) ** 0.45 - 0.01

    # Top rows spaced by arc length along a typical meridian.
    rs = np.linspace(0, 1, 2001)
    zs = np.array([ztop(r) for r in rs])
    seg = np.hypot(np.diff(rs) * 1.2, np.diff(zs))
    arc = np.concatenate([[0], np.cumsum(seg)])
    arc /= arc[-1]
    top_r = [float(np.interp(i / n_top, arc, rs)) for i in range(1, n_top + 1)]
    bot_r = [1 - 0.035 * (k + 1) ** 1.6 for k in range(n_bot)]
    bot_r = [r for r in bot_r if r > 0.05]
    rows = [(r, ztop(r)) for r in top_r] + [(1.0, -0.035)] + [(r, zbot(r)) for r in bot_r]

    def xy(r, phi):
        c, s = math.cos(phi), math.sin(phi)
        ax = Ax_f if c >= 0 else Ax_b
        y = B * s * (1 + 0.05 * c) * (1 - 0.22 * max(0.0, -c) ** 2.2)
        return ax * r * c, r * y

    P = []
    for r, z in rows:
        row = []
        for j in range(nphi):
            phi = 2 * math.pi * j / nphi
            x, y = xy(r, phi)
            # The rim flares a little and the rear rim is serrated by the marginal scutes.
            lip = 0.0
            if r > 0.97:
                lip = 0.015 * (1 + 0.5 * max(0.0, -math.cos(phi)) * abs(math.sin(13 * phi)))
            k = 1 + lip
            row.append(Vector((x * k, y * k, z)))
        P.append(row)
    caps = (Vector((0, 0, ztop(0))), Vector((0, 0, zbot(0))))
    o = grid_mesh('shell', P, True, caps)
    v_rim = (n_top) / (len(rows) - 1)
    # grid_mesh's v runs 0..1 over rows 0..len-1; the cap is at v=0 and row 0 sits at r=top_r[0].
    # Remap: row i (0-based) has v = i/(len-1); top rows i=0..n_top-1 hold arc fractions (i+1)/n_top.
    uv = o.data.uv_layers['UVMap']
    nrows = len(rows)
    for li in range(len(uv.data)):
        u, v = uv.data[li].uv
        i = v * (nrows - 1)
        if i <= n_top - 1 + 1e-6:
            vv = (i + 1) / n_top * v_rim
        else:
            vv = v_rim + (i - (n_top - 1)) / (nrows - n_top) * (1 - v_rim)
        uv.data[li].uv = (u, vv)
    # Caps sit at v=0 in grid_mesh; that's the crown (arc 0) on top, but the bottom cap must be v=1.
    for poly in o.data.polygons:
        if poly.loop_total == 3:
            vs = [o.data.vertices[o.data.loops[li].vertex_index].co.z for li in poly.loop_indices]
            if max(vs) < 0:
                for li in poly.loop_indices:
                    uv.data[li].uv = (uv.data[li].uv[0], 1.0)
    subdivide(o, 1)
    return o, v_rim, (Ax_f, Ax_b, B)


def flipper(name, root, d0, d1, length, chord, thick, blade_up, n=26, ring=22, lead=1.0):
    """A flat paddle along a curved spine. chord/thick: profile() curves over t (0 root, 1 tip).
    The leading edge (thick, rounded) is on the +side; the trailing edge is thin."""
    p0 = Vector(root)
    p1 = p0 + Vector(d0).normalized() * length * 0.45
    p3 = p0 + Vector(d0).normalized() * length * 0.35 + Vector(d1).normalized() * length * 0.72
    p2 = p3 - Vector(d1).normalized() * length * 0.35
    pts = [bezier(p0, p1, p2, p3, (i / (n - 1)) ** 0.9) for i in range(n)]
    fr = spine(pts, blade_up)
    P = []
    for i, (p, (t, sd, up)) in enumerate(zip(pts, fr)):
        tt = i / (n - 1)
        c, h = chord(tt), thick(tt)
        sd = sd * lead
        row = []
        for j in range(ring):
            a = 2 * math.pi * j / ring
            ca, sa = math.cos(a), math.sin(a)
            # Leading edge at ca = +1 (thick, round), trailing at ca = -1 (thin).
            th = h * (0.3 + 0.7 * (1 + ca) / 2) * (1 - ca ** 8 * 0.0)
            off = sd * (c * 0.5 * ca - c * 0.12) + up * (th * 0.5 * sa)
            row.append(p + off)
        P.append(row)
    o = grid_mesh(name, P, True, (pts[0] - fr[0][0] * 0.02, pts[-1] + fr[-1][0] * 0.01))
    subdivide(o, 1)
    return o


def build_turtle():
    rng = np.random.default_rng(TURTLE_SEED)
    tilt, yaw = math.radians(30), math.radians(-10)
    M = Matrix.Scale(1.12, 4) @ Matrix.Rotation(tilt, 4, 'X') @ Matrix.Rotation(yaw, 4, 'Z')

    shell, v_rim, (Axf, Axb, B) = build_shell()
    assign(shell, shell_material(shell_texture(Axf, Axb, B, v_rim, rng)))

    skin = scaly_skin('turtle-skin', 15.0)
    fskin = scaly_skin('turtle-flipper', 17.0, uv_pale=0.04, edge_w=0.045, mid='#4a361c', border='#9a8456')

    # Head and neck: lofted, blunt-snouted.
    hw = profile([(0, 0.22), (0.3, 0.16), (0.45, 0.17), (0.66, 0.215), (0.84, 0.18), (0.95, 0.12), (1, 0.0)])
    ht = profile([(0, 0.2), (0.3, 0.14), (0.45, 0.16), (0.66, 0.2), (0.86, 0.16), (0.96, 0.1), (1, 0.0)])
    hb = profile([(0, 0.18), (0.3, 0.12), (0.45, 0.13), (0.66, 0.15), (0.86, 0.11), (0.96, 0.07), (1, 0.0)])
    stations = []
    for i in range(32):
        t = (i / 31) ** 0.85
        x = 0.8 + 1.1 * t
        zc = -0.08 + 0.1 * t - 0.05 * t * t
        top, bot = ht(t), hb(t)
        c = Vector((x, -0.08 * t, zc + (top - bot) / 2))
        stations.append((c, Vector((0, -1, 0)), Vector((0, 0, 1)), max(hw(t), 0.004), max((top + bot) / 2, 0.004)))
    head = loft('head', stations, 28, 2.2)
    subdivide(head, 1)
    assign(head, skin)
    eye_l = eye('eye', (1.68, -0.215, 0.07), 0.06, iris='#4a3418', axis=Vector((0.25, -1, 0.3)))

    # Front flippers (long wings) and rear flippers (short paddles).
    fchord = profile([(0, 0.2), (0.18, 0.36), (0.4, 0.42), (0.65, 0.34), (0.86, 0.2), (1, 0.04)])
    fthick = profile([(0, 0.13), (0.3, 0.08), (0.7, 0.045), (1, 0.015)])
    front = flipper('flipper-front', (0.6, -0.74, -0.1), (0.2, -1, -0.15), (-1, -0.3, -0.18), 1.4,
                    fchord, fthick, (0.1, -0.45, 1), lead=-1.0)
    far = flipper('flipper-far', (0.58, 0.72, -0.1), (0.15, 1, -0.35), (-0.8, 0.4, -0.55), 1.3,
                  fchord, fthick, (0.15, 0.25, 1), lead=1.0)
    rchord = profile([(0, 0.16), (0.4, 0.27), (0.75, 0.25), (1, 0.05)])
    rthick = profile([(0, 0.08), (0.5, 0.04), (1, 0.015)])
    rear = flipper('flipper-rear', (-1.0, -0.42, -0.12), (-0.5, -1, -0.1), (-1, -0.35, -0.2), 0.55,
                   rchord, rthick, (0, 0, 1), lead=-1.0)
    rear_far = flipper('flipper-rear-far', (-1.0, 0.42, -0.12), (-0.5, 1, -0.1), (-1, 0.35, -0.25), 0.5,
                       rchord, rthick, (0, 0, 1), lead=1.0)
    for o in (front, far, rear, rear_far):
        assign(o, fskin)
    tail = loft('tail', [(Vector((-1.15 - 0.12 * t, 0, -0.1 - 0.02 * t)), Vector((0, -1, 0)), Vector((0, 0, 1)),
                          0.09 * (1 - t) + 0.005, 0.06 * (1 - t) + 0.005) for t in np.linspace(0, 1, 8)], 12)
    assign(tail, skin)

    objs = [shell, head, eye_l, front, far, rear, rear_far, tail]
    place(objs, M)
    holdout_copy(shell, 0.99)

    front_root = M @ Vector((0.6, -0.78, -0.1))
    rear_root = M @ Vector((-1.0, -0.5, -0.12))
    return {'lights': top_lights, 'parts': [
        {'name': 'rear', 'objects': [rear, rear_far], 'anim': 'wag', 'amp': 0.3, 'pivot': tuple(rear_root),
         'pose': {'rotate': 'Y', 'origin': tuple(rear_root), 'angles': (-16, 14)}},
        {'name': 'body', 'objects': [far, tail, shell, head, eye_l]},
        {'name': 'front', 'objects': [front], 'anim': 'wag', 'amp': 0.28, 'pivot': tuple(front_root),
         'pose': {'rotate': 'Y', 'origin': tuple(front_root), 'angles': (14, -22)}},
    ]}


# ====================================================================================
# manta
# ====================================================================================

MANTA_SEED = 11
MANTA_VIEW = {'scale': 2.1, 'tilt': 40, 'yaw': -46, 'roll': -5}
MANTA_POSE = {'axis': 'Y', 'near': (11, -9), 'far': (-11, 9)}
MANTA_SPAN = 1.25          # half wingspan, local units
MANTA_LE = [(0, 0.42), (0.13, 0.42), (0.2, 0.37), (0.35, 0.27), (0.55, 0.1), (0.75, -0.1), (0.9, -0.26),
            (1, -0.4)]
MANTA_TE = [(0, -0.56), (0.12, -0.5), (0.25, -0.38), (0.45, -0.27), (0.65, -0.23), (0.85, -0.29), (1, -0.4)]
MANTA_TOP = [(0, 0.15), (0.12, 0.13), (0.25, 0.08), (0.45, 0.04), (0.7, 0.018), (1, 0.004)]
MANTA_BOT = [(0, 0.085), (0.12, 0.075), (0.25, 0.045), (0.45, 0.022), (0.7, 0.01), (1, 0.003)]


def manta_shape():
    le, te = profile(MANTA_LE), profile(MANTA_TE)
    top, bot = profile(MANTA_TOP), profile(MANTA_BOT)

    def lift(s):
        a = abs(s)
        return 0.11 * a - 0.17 * a ** 3 + 0.02 * a ** 6

    return le, te, top, bot, lift


def manta_panel(name, s_list, ring=44, cap=False):
    """A span-wise piece of the disc between the given span stations (s in -1..1, +s = left wing)."""
    le, te, top, bot, lift = manta_shape()
    P = []
    for s in s_list:
        a = abs(s)
        x0, x1 = le(a), te(a)
        row = []
        for k in range(ring):
            ang = 2 * math.pi * k / ring
            c = (1 - math.cos(ang)) / 2                      # 0 at the leading edge, 1 at the trailing edge
            f = 2.6 * max(c, 0.0) ** 0.5 * (1 - c)            # airfoil-like thickness
            up = math.sin(ang) >= 0
            h = top(a) if up else -bot(a)
            z = lift(s) + h * f * (1 if up else 1) - 0.03 * c * (1 - a)
            row.append(Vector((x0 + (x1 - x0) * c, s * MANTA_SPAN, z)))
        P.append(row)
    # Rings run leading edge -> over the top -> trailing edge; with rows along +y that winding
    # faces inward, so flip it (recalculating normals is unreliable on these thin open panels).
    caps = [sum(P[i], Vector()) / len(P[i]) for i in (0, -1)] if cap else (None, None)
    return grid_mesh(name, P, True, caps, recalc=False, flip=True)


def manta_textures(rng, res=1024):
    """Top-projected skin colors (local x, y) for the back and the belly."""
    le, te, *_ = manta_shape()
    x0, x1, y0, y1 = -1.7, 0.8, -1.3, 1.3
    U, Vv = uv_grid(res, res)
    X = x0 + U * (x1 - x0)
    Y = y0 + Vv * (y1 - y0)
    S = np.clip(np.abs(Y) / MANTA_SPAN, 0, 1)
    LE = np.interp(S, *zip(*[(i / 200, le(i / 200)) for i in range(201)]))
    TE = np.interp(S, *zip(*[(i / 200, te(i / 200)) for i in range(201)]))
    C = np.clip((LE - X) / np.maximum(LE - TE, 1e-3), -0.2, 1.2)
    wob = np.zeros(X.shape)
    for f in range(1, 7):
        wob += np.sin(X * 9 * f + rng.uniform(0, 6)) * np.sin(Y * 8 * f + rng.uniform(0, 6)) / f ** 1.3

    # Back: near-black, a touch lighter toward the wingtips, with pale shoulder patches.
    back = palette(np.clip(0.25 + 0.5 * S ** 1.5 + 0.05 * wob, 0, 1), [(0, '#14161a'), (0.5, '#20242b'),
                                                                         (1, '#30353e')])
    w = 0.5 * np.clip(1 - (S - 0.1) / 0.58, 0, 1) ** 0.75
    inner = 0.1 + 0.32 * np.clip(C - 0.06, 0, 1)
    patch = (smoothstep(0.05, 0.1, C) * (1 - smoothstep(w - 0.06, w + 0.03, C + 0.03 * wob)) *
             smoothstep(inner, inner + 0.04, S + 0.015 * wob) * smoothstep(0.0, 0.03, w))
    patch *= 1 - 0.35 * smoothstep(0.3, 0.9, wob + 0.3 * np.sin(X * 40) * np.sin(Y * 37))
    patch *= 1 - 0.45 * smoothstep(0.1, 0.45, C)
    back = blend(back, srgb('#c9cdd2'), patch * 0.95)
    back = blend(back, srgb('#0d0e10'), (1 - smoothstep(0.0, 0.05, C)) * 0.6)

    # Belly: white, grey along the trailing edge and wingtips, a scatter of dark spots.
    belly = palette(np.clip(smoothstep(0.7, 1.0, C) * 0.8 + smoothstep(0.6, 1.0, S) * 0.6, 0, 1),
                    [(0, '#e9ecee'), (0.5, '#9aa0a8'), (1, '#3e434b')])
    for _ in range(26):
        cx, cy = rng.uniform(-0.45, 0.1), rng.uniform(-0.38, 0.38)
        r = rng.uniform(0.012, 0.03)
        d = np.hypot(X - cx, (Y - cy) * 0.9)
        belly = blend(belly, srgb('#2c3036'), (1 - smoothstep(r * 0.7, r, d)) * 0.85)
    mouth = (1 - smoothstep(0.03, 0.07, C)) * (1 - smoothstep(0.1, 0.14, S))
    belly = blend(belly, srgb('#3a3f46'), mouth)
    return paint('manta-back', back), paint('manta-belly', belly), (x0, x1, y0, y1)


def manta_material(name, imgs, feather=None):
    """Dark back / pale belly by the object-space normal; feather=(y_from, y_to) fades alpha from 1
    to 0 along local y, so a separately drawn piece blends into the piece it overlaps."""
    back, belly, (x0, x1, y0, y1) = imgs
    mat, n = new_material(name)
    co = coord(n)
    sep = n.new('ShaderNodeSeparateXYZ')
    n.link(co, sock(sep.inputs, 'Vector'))
    comb = n.new('ShaderNodeCombineXYZ')
    n.link(map_range(n, sock(sep.outputs, 'X'), x0, x1, 0, 1, False), sock(comb.inputs, 'X'))
    n.link(map_range(n, sock(sep.outputs, 'Y'), y0, y1, 0, 1, False), sock(comb.inputs, 'Y'))
    vec = sock(comb.outputs, 'Vector')
    cols = []
    for img in (back, belly):
        t = n.new('ShaderNodeTexImage', _image=img, _extension='EXTEND', _interpolation='Cubic')
        n.link(vec, sock(t.inputs, 'Vector'))
        cols.append(sock(t.outputs, 'Color'))
    nx, ny, nz = local_normal(n)
    up = map_range(n, nz, -0.25, 0.1, 0, 1)
    col = mix(n, up, cols[1], cols[0])
    col = vary(n, col, co, 7.0, 0.9, 1.08)
    fine = noise(n, co, 90.0, 4.0, 0.6)
    nrm = bump(n, fine, 0.08, 0.004)
    alpha = None
    if feather is not None:
        alpha = map_range(n, sock(sep.outputs, 'Y'), feather[0], feather[1], 1.0, 0.0)
    sh = pbr(n, col, rough=0.68, normal=nrm, sss=0.0, coat=0.0, spec=0.25, alpha=alpha)
    return finish(mat, n, sh)


def build_manta():
    rng = np.random.default_rng(MANTA_SEED)
    s0, f = 0.3, 0.12
    imgs = manta_textures(rng)
    # Near wing = the manta's right wing (-y), which the yaw turns toward the camera.
    near_s = [-s0 - (1 - s0) * (1 - math.cos(math.pi / 2 * i / 30)) for i in range(31)][::-1]
    far_s = [(s0 - 0.04) + (1 - s0 + 0.04) * (1 - math.cos(math.pi / 2 * i / 30)) for i in range(31)]
    body_s = list(np.linspace(-(s0 + f), s0 + f, 26))
    near = manta_panel('wing-near', near_s)
    far = manta_panel('wing-far', far_s)
    body = manta_panel('body', body_s, cap=True)
    Y = MANTA_SPAN
    assign(near, manta_material('manta-near', imgs, (-(s0 + f) * Y, -s0 * Y)))
    assign(far, manta_material('manta-far', imgs))
    assign(body, manta_material('manta-body', imgs, (s0 * Y, (s0 + f) * Y)))
    for o in (near, far, body):
        subdivide(o, 1)
    plain = manta_material('manta', imgs)

    parts = [body]
    # Cephalic lobes: rolled horns either side of the mouth.
    for side in (-1, 1):
        pts = [Vector((0.38 + 0.13 * t, side * (0.17 - 0.03 * t * t), -0.01 - 0.02 * t))
               for t in np.linspace(0, 1, 14)]
        fr = spine(pts, (0, 0, 1))
        st = []
        for i, (p, (t, sd, up)) in enumerate(zip(pts, fr)):
            u = i / (len(pts) - 1)
            w = 0.016 * (1 - 0.4 * u ** 2) + 0.004
            st.append((p, sd, up, w, 0.04 * (1 - 0.3 * u) + 0.004))
        lobe = loft(f'lobe{side}', st, 16, 2.0)
        subdivide(lobe, 1)
        assign(lobe, plain)
        parts.append(lobe)
    mouth = ellipsoid('mouth', (0.405, 0, -0.022), (0.04, 0.15, 0.02))
    mm, mn = new_material('manta-mouth')
    assign(mouth, finish(mm, mn, pbr(mn, '#1c1e22', rough=0.5)))
    parts.append(mouth)
    eye_n = eye('eye', (0.3, -0.2, 0.025), 0.028, iris='#2a2a2a', axis=Vector((0.2, -1, 0.15)))
    parts.append(eye_n)
    # Tail and a small dorsal fin.
    tail = tubes_uv('tail', [[(Vector((-0.5 - 0.6 * t, 0.05 * t * t, 0.01 - 0.12 * t * t)), 0.011 * (1 - t) + 0.003)
                              for t in np.linspace(0, 1, 16)]], 8)
    assign(tail, plain)
    dorsal = loft('dorsal', [(Vector((-0.44 - 0.1 * t, 0, 0.05 + 0.04 * t)), Vector((0, -1, 0)),
                              Vector((1, 0, 1)).normalized(), 0.008, 0.04 * (1 - t) + 0.004)
                             for t in np.linspace(0, 1, 8)], 12)
    assign(dorsal, plain)
    parts += [tail, dorsal]

    v = MANTA_VIEW
    M = (Matrix.Scale(v['scale'], 4) @ Matrix.Rotation(math.radians(v['tilt']), 4, 'X')
         @ Matrix.Rotation(math.radians(v['yaw']), 4, 'Z') @ Matrix.Rotation(math.radians(v['roll']), 4, 'X'))
    place([near, far] + parts, M)
    le, te, top, bot, lift = manta_shape()
    piv_near = M @ Vector(((le(s0) + te(s0)) / 2, -s0 * Y, lift(s0)))
    piv_far = M @ Vector(((le(s0) + te(s0)) / 2, s0 * Y, lift(s0)))
    return {'lights': top_lights, 'parts': [
        {'name': 'farwing', 'objects': [far], 'anim': 'wag', 'amp': 0.2, 'pivot': tuple(piv_far),
         'pose': {'rotate': MANTA_POSE['axis'], 'origin': tuple(piv_far), 'angles': MANTA_POSE['far']}},
        {'name': 'body', 'objects': parts},
        {'name': 'nearwing', 'objects': [near], 'anim': 'wag', 'amp': 0.2, 'pivot': tuple(piv_near),
         'pose': {'rotate': MANTA_POSE['axis'], 'origin': tuple(piv_near), 'angles': MANTA_POSE['near']}},
    ]}


# ====================================================================================
# jellyfish
# ====================================================================================

JELLY_SEED = 5
JELLY_R, JELLY_H = 0.63, 0.39


def jelly_lights(scene):
    creature_lights(scene)
    scene.cycles.adaptive_threshold = 0.03
    scene.cycles.denoising_prefilter = 'FAST'
    scene.render.use_persistent_data = True


def jelly_material(name, color, glow=0.6, base=0.12, rim=0.6, canals=0, ring=0.0, sheen=0.35):
    """See-through glowing jelly: mostly Transparent (so the PNG's alpha lets the water through),
    with an emissive, faintly glossy skin that thickens toward the silhouette (where we look
    through more jelly). canals: number of radial canals painted on the bell."""
    mat, n = new_material(name)
    lw = n.new('ShaderNodeLayerWeight', Blend=0.35)
    facing = sock(lw.outputs, 'Facing')
    op = map_range(n, math_node(n, 'POWER', facing, 1.6), 0, 1, base, base + rim)
    col = rgb(n, color)
    glow_k = math_node(n, 'ADD', 0.6, math_node(n, 'MULTIPLY', facing, 1.4))
    co = coord(n)
    if canals:
        sep = n.new('ShaderNodeSeparateXYZ')
        n.link(co, sock(sep.inputs, 'Vector'))
        ang = math_node(n, 'ARCTAN2', sock(sep.outputs, 'Y'), sock(sep.outputs, 'X'))
        k = math_node(n, 'MULTIPLY', ang, canals / (2 * math.pi))
        fr = math_node(n, 'FRACT', k)
        d = math_node(n, 'ABSOLUTE', math_node(n, 'SUBTRACT', fr, 0.5))
        line = map_range(n, d, 0.44, 0.5, 0, 1)
        # Canals fade toward the crown, where they converge.
        rr = n.new('ShaderNodeCombineXYZ')
        n.link(sock(sep.outputs, 'X'), sock(rr.inputs, 'X'))
        n.link(sock(sep.outputs, 'Y'), sock(rr.inputs, 'Y'))
        ln = n.new('ShaderNodeVectorMath', _operation='LENGTH')
        n.link(sock(rr.outputs, 'Vector'), ln.inputs[0])
        rad = sock(ln.outputs, 'Value')
        line = math_node(n, 'MULTIPLY', line, map_range(n, rad, 0.12, 0.35, 0, 1))
        if ring:
            edge = map_range(n, rad, ring - 0.05, ring, 0, 1)
            line = math_node(n, 'MAXIMUM', line, edge)
        op = math_node(n, 'ADD', op, math_node(n, 'MULTIPLY', line, 0.35), clamp=True)
        glow_k = math_node(n, 'ADD', glow_k, math_node(n, 'MULTIPLY', line, 1.5))
    mottle = map_range(n, noise(n, co, 9.0, 4.0, 0.6), 0.35, 0.65, 0.75, 1.15)
    glow_k = math_node(n, 'MULTIPLY', glow_k, mottle)
    em = n.new('ShaderNodeEmission')
    n.link(col, sock(em.inputs, 'Color'))
    n.link(math_node(n, 'MULTIPLY', glow_k, glow), sock(em.inputs, 'Strength'))
    gl = n.new('ShaderNodeBsdfGlossy', Roughness=0.18)
    tr = n.new('ShaderNodeBsdfTranslucent')
    n.link(col, sock(tr.inputs, 'Color'))
    lit = n.new('ShaderNodeMixShader', Fac=1 - sheen)
    n.link(sock(gl.outputs, 'BSDF'), lit.inputs[1])
    n.link(sock(tr.outputs, 'BSDF'), lit.inputs[2])
    add = n.new('ShaderNodeAddShader')
    n.link(sock(em.outputs, 'Emission'), add.inputs[0])
    n.link(sock(lit.outputs, 'Shader'), add.inputs[1])
    see = n.new('ShaderNodeMixShader')
    n.link(op, see.inputs[0])
    n.link(sock(n.new('ShaderNodeBsdfTransparent').outputs, 'BSDF'), see.inputs[1])
    n.link(sock(add.outputs, 'Shader'), see.inputs[2])
    return finish(mat, n, sock(see.outputs, 'Shader'))


def jelly_bell(nphi=72, n_out=22, n_in=14, lobes=16):
    R, H = JELLY_R, JELLY_H
    rows = []
    for i in range(1, n_out + 1):
        u = i / n_out
        r = R * math.sin(u * math.pi / 2) ** 0.85
        z = H * math.cos(u * math.pi / 2) ** 1.25 - 0.06 * smoothstep(0.8, 1.0, u)
        rows.append((r, z, u))
    for i in range(n_in):
        u = 1 - (i + 1) / (n_in + 1)
        th = 0.012 + 0.17 * (1 - u) ** 1.3
        r = (R - 0.02) * math.sin(u * math.pi / 2) ** 0.85
        z = H * math.cos(u * math.pi / 2) ** 1.25 - 0.06 * smoothstep(0.8, 1.0, u) - th
        rows.append((r, z, u))
    P = []
    for r, z, u in rows:
        row = []
        for j in range(nphi):
            ph = 2 * math.pi * j / nphi
            # Scalloped margin: shallow lobes between the sense organs.
            sc = 1 - 0.035 * smoothstep(0.75, 1.0, u) * abs(math.sin(lobes / 2 * ph)) ** 0.5
            row.append(Vector((r * sc * math.cos(ph), r * sc * math.sin(ph), z - 0.02 * smoothstep(0.85, 1, u) *
                               (1 - abs(math.sin(lobes / 2 * ph))))))
        P.append(row)
    caps = (Vector((0, 0, H)), Vector((0, 0, H - 0.18)))
    o = grid_mesh('bell', P, True, caps)
    subdivide(o, 1)
    return o


def build_jellyfish():
    rng = np.random.default_rng(JELLY_SEED)
    R, H = JELLY_R, JELLY_H
    bell = jelly_bell()
    assign(bell, jelly_material('bell', '#a9d8ff', glow=0.55, base=0.1, rim=0.55, canals=16, ring=0.66))

    # Four horseshoe gonads under the crown, seen through the bell.
    lines = []
    for k in range(4):
        a0 = math.pi / 4 + k * math.pi / 2
        cx, cy = 0.19 * math.cos(a0), 0.19 * math.sin(a0)
        pts = []
        for t in np.linspace(0, 1, 26):
            a = a0 + math.pi + (t - 0.5) * math.radians(290)
            pts.append((Vector((cx + 0.1 * math.cos(a), cy + 0.1 * math.sin(a), H - 0.19 - 0.02 * math.sin(t * math.pi))),
                        0.02))
        lines.append(pts)
    gonads = tubes_uv('gonads', lines, 10)
    assign(gonads, jelly_material('gonads', '#ee8fcf', glow=1.2, base=0.5, rim=0.4, sheen=0.2))

    # Trailing tentacles from just inside the margin.
    tl = []
    count = 30
    for k in range(count):
        ph = 2 * math.pi * (k + rng.uniform(-0.3, 0.3)) / count
        out = Vector((math.cos(ph), math.sin(ph), 0))
        root = out * (R * 0.9) + Vector((0, 0, -0.02))
        L = rng.uniform(1.3, 2.25)
        f, phase, amp = rng.uniform(0.6, 1.3), rng.uniform(0, 6.3), rng.uniform(0.03, 0.08)
        pts = []
        for t in np.linspace(0, 1, 28):
            drift = out * (0.05 * math.sin(t * math.pi) - 0.16 * t) + Vector((amp * math.sin(2 * math.pi * f * t + phase), 0, 0))
            pts.append((root + drift + Vector((0, 0, -L * t)), 0.0075 * (1 - 0.55 * t) + 0.0025))
        tl.append(pts)
    tentacles = tubes_uv('tentacles', tl, 6)
    assign(tentacles, jelly_material('tentacles', '#d9ecff', glow=0.75, base=0.22, rim=0.4, sheen=0.3))

    # Four frilly oral arms hanging from the middle.
    arms = []
    for k in range(4):
        a0 = math.pi / 4 + k * math.pi / 2 + rng.uniform(-0.2, 0.2)
        out = Vector((math.cos(a0), math.sin(a0), 0))
        L = rng.uniform(1.15, 1.4)
        pts = [Vector((0, 0, H - 0.25)) + out * (0.05 + 0.08 * t + 0.05 * math.sin(t * 3 + k)) +
               Vector((0.04 * math.sin(5 * t + k * 1.7), 0, -L * t)) for t in np.linspace(0, 1, 40)]
        fr = spine(pts, out)
        P = []
        for i, (p, (tg, sd, up)) in enumerate(zip(pts, fr)):
            t = i / (len(pts) - 1)
            w = 0.085 * (1 - 0.5 * t) * min(1, t * 8 + 0.3)
            th = 0.014
            tw = 2.2 * t + k
            side = sd * math.cos(tw) + up * math.sin(tw)
            upv = side.cross(tg).normalized()
            row = []
            for j in range(16):
                a = 2 * math.pi * j / 16
                ca, sa = math.cos(a), math.sin(a)
                ruff = 0.028 * (0.4 + t) * math.sin(38 * t + 2 * ca + k) * ca * ca
                row.append(p + side * w * ca + upv * (th * sa + ruff))
            P.append(row)
        o = grid_mesh(f'arm{k}', P, True, (pts[0], pts[-1] + fr[-1][0] * 0.01))
        arms.append(o)
    armmat = jelly_material('arms', '#eccbe8', glow=0.7, base=0.24, rim=0.45, sheen=0.35)
    for o in arms:
        assign(o, armmat)

    M = Matrix.Rotation(math.radians(16), 4, 'X')
    back = [tentacles] + arms
    place([bell, gonads] + back, M)
    pivot = tuple(M @ Vector((0, 0, H * 0.45)))
    root = tuple(M @ Vector((0, 0, 0.0)))
    return {'lights': jelly_lights, 'parts': [
        {'name': 'tentacles', 'objects': back, 'anim': 'wag', 'amp': 0.07, 'pivot': root,
         'pose': {'rotate': 'Y', 'origin': root, 'angles': (-3.2, 3.2)}},
        {'name': 'bell', 'objects': [bell, gonads], 'anim': 'pulse', 'amp': 0.06, 'pivot': pivot,
         'pose': {'scale': ((1.08, 1.08, 0.86), (0.93, 0.93, 1.1)), 'origin': pivot}},
    ]}


CREATURES = {
    'turtle': build_turtle,
    'manta': build_manta,
    'jellyfish': build_jellyfish,
}
