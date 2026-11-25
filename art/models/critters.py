"""Procedural floor critters: crab, hermit crab, sea star, nudibranch and banded cleaner shrimp.

They walk along the sand at full size, so each sets 'feet': True (the canvas bottom is its lowest
point) and uses bold, saturated colors that stay readable against coral rubble and survive the
Pixel style's 6 px cells. Geometry and material helpers come from visitors.py.
"""

import math

import bpy
import numpy as np
from mathutils import Matrix, Vector

from common import assign, new_material, profile, smoothstep, sock, subdivide
from visitors import (bump, coord, ellipsoid, eye, finish, grid_mesh, holdout_copy, local_normal, loft, map_range,
                      math_node, mix, noise, pbr, place, quick_lights, ramp, rgb, spine, top_lights, tubes_uv,
                      uv_xy, vary)


# ---------- shared ----------

def world_min_z(objs):
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    zs = []
    for o in objs:
        ev = o.evaluated_get(dg)
        zs += [(ev.matrix_world @ Vector(c)).z for c in ev.bound_box]
    return min(zs)


def world_center_x(objs):
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    xs = []
    for o in objs:
        ev = o.evaluated_get(dg)
        xs += [(ev.matrix_world @ Vector(c)).x for c in ev.bound_box]
    return (min(xs) + max(xs)) / 2


def banded(name, stops, rough=0.4, coat=0.35, sss=0.0, belly=None, bump_scale=0.0, interp='EASE', axis='Y'):
    """Color by position along a tube (UV v = 0 root .. 1 tip), e.g. a leg's joint bands."""
    mat, n = new_material(name)
    u, v, _ = uv_xy(n)
    r = ramp(n, stops, interp)
    n.link(v if axis == 'Y' else u, sock(r.inputs, 'Fac'))
    co = coord(n)
    col = vary(n, sock(r.outputs, 'Color'), co, 25.0, 0.88, 1.1)
    if belly is not None:
        _, _, nz = local_normal(n)
        col = mix(n, map_range(n, nz, -0.2, -0.7, 0, 0.7), col, belly)
    nrm = None
    if bump_scale:
        nrm = bump(n, noise(n, co, bump_scale, 4.0, 0.6), 0.25, 0.004)
    return finish(mat, n, pbr(n, col, rough=rough, normal=nrm, sss=sss, coat=coat, coat_rough=0.15))


def critter_lights(scene):
    quick_lights(scene)


# ====================================================================================
# crab
# ====================================================================================

def crab_carapace(zb, W=0.31, D=0.22, H=0.13, nphi=64, n_top=14, n_bot=6):
    rows = []
    for i in range(1, n_top + 1):
        r = math.sin(i / n_top * math.pi / 2)
        rows.append((r, H * max(0.0, 1 - r ** 2.6) ** 0.55))
    rows.append((1.0, -0.015))
    for k in range(n_bot):
        r = 1 - (k + 1) / (n_bot + 1)
        rows.append((r, -0.06 * (1 - r ** 3) ** 0.4 - 0.015))
    P = []
    for r, z in rows:
        row = []
        for j in range(nphi):
            ph = 2 * math.pi * j / nphi
            c, s = math.cos(ph), math.sin(ph)
            front = max(0.0, -s)
            # Broad, slightly squared front edge; narrower behind.
            x = W * r * math.copysign(abs(c) ** 0.8, c) * (1 + 0.08 * front - 0.12 * max(0.0, s))
            y = D * r * math.copysign(abs(s) ** 1.1, s) * (1 - 0.15 * front)
            # Teeth along the front-lateral margin.
            if r > 0.95 and front > 0.2:
                x *= 1 + 0.03 * abs(math.sin(9 * ph))
            row.append(Vector((x, y, zb + z + 0.03 * front * r)))
        P.append(row)
    caps = (Vector((0, 0, zb + H)), Vector((0, 0, zb - 0.075)))
    o = grid_mesh('carapace', P, True, caps)
    subdivide(o, 1)
    return o


def crab_shell_mat(belly=True):
    """Red-orange carapace with cream spots, paler underneath."""
    mat, n = new_material('crab-shell')
    co = coord(n)
    base = ramp(n, [(0.0, '#8e1a10'), (0.45, '#c2301a'), (0.75, '#d9502a'), (1.0, '#e6703a')])
    n.link(noise(n, co, 6.0, 3.0), sock(base.inputs, 'Fac'))
    vor = n.new('ShaderNodeTexVoronoi', Scale=12.0, Randomness=0.85, _feature='F1')
    n.link(co, sock(vor.inputs, 'Vector'))
    bw = n.new('ShaderNodeRGBToBW')
    n.link(sock(vor.outputs, 'Color'), sock(bw.inputs, 'Color'))
    pick = math_node(n, 'GREATER_THAN', sock(bw.outputs, 'Val'), 0.55)
    size = map_range(n, sock(vor.outputs, 'Distance'), 0.34, 0.24, 0, 1)
    spot = math_node(n, 'MULTIPLY', pick, size)
    col = mix(n, spot, sock(base.outputs, 'Color'), '#f4dcb6')
    if belly:
        _, _, nz = local_normal(n)
        col = mix(n, map_range(n, nz, -0.1, -0.5, 0, 1), col, '#ecd2ae')
    gran = noise(n, co, 70.0, 4.0, 0.6)
    h = math_node(n, 'ADD', math_node(n, 'MULTIPLY', spot, 0.5), math_node(n, 'MULTIPLY', gran, 0.4))
    nrm = bump(n, h, 0.3, 0.004)
    return finish(mat, n, pbr(n, col, rough=0.38, normal=nrm, coat=0.45, coat_rough=0.12))


def build_crab():
    zb = 0.25
    shell = crab_carapace(zb)
    assign(shell, crab_shell_mat())
    leg_mat = banded('crab-leg', [(0.0, '#b42818'), (0.38, '#c8361e'), (0.44, '#f2d2a8'), (0.5, '#c8361e'),
                                  (0.68, '#d2401f'), (0.73, '#f2d2a8'), (0.78, '#cc3a1e'), (0.94, '#7a1c10'),
                                  (1.0, '#2a1410')], belly='#e8c8a0')
    claw_mat = banded('crab-claw', [(0.0, '#b42818'), (0.5, '#cf3a1c'), (1.0, '#cf3a1c')], belly='#efd2ac')
    tip_mat = banded('crab-finger', [(0.0, '#d04020'), (0.45, '#c43418'), (0.6, '#3a1a12'), (1.0, '#1a0e0a')])

    legs = []
    for sgn in (-1, 1):
        for i, ang in enumerate((-38, -13, 12, 36)):
            a = math.radians(ang)
            d = Vector((sgn * math.cos(a), math.sin(a), 0))
            root = Vector((sgn * 0.18, 0.02 + 0.06 * i - 0.08, zb - 0.02))
            reach = 1.0 - 0.06 * abs(i - 1.5)
            pts = []
            # coxa+merus up and out to the knee, carpus/propodus down to the dactyl tip.
            ctrl = [(0.0, 0.0, 0.0), (0.08, 0.06, 0.03), (0.2, 0.15, 0.028), (0.27, 0.09, 0.025),
                    (0.33, -0.06, 0.021), (0.37, -0.18, 0.016), (0.39, -0.25, 0.007)]
            for k, (out, up, r) in enumerate(ctrl):
                p = root + d * (out * reach) + Vector((0, 0, up))
                if k == len(ctrl) - 1:
                    p.z = 0.0
                pts.append((p, r * 1.4))
            legs.append(pts)
    leg_obj = tubes_uv('legs', legs, 8)
    assign(leg_obj, leg_mat)

    arms, hands, fingers = [], [], []
    for sgn in (-1, 1):
        arm = [(Vector((sgn * 0.12, -0.12, zb - 0.03)), 0.035), (Vector((sgn * 0.25, -0.24, zb + 0.06)), 0.04),
               (Vector((sgn * 0.28, -0.34, zb + 0.09)), 0.036), (Vector((sgn * 0.22, -0.4, zb + 0.08)), 0.035)]
        arms.append(arm)
        hand_dir = Vector((-sgn * 0.75, -0.5, 0.1)).normalized()
        hc = Vector((sgn * 0.2, -0.43, zb + 0.08)) + hand_dir * 0.06
        z_ax = Vector((0, 0, 1))
        y_ax = z_ax.cross(hand_dir).normalized()
        z_ax = hand_dir.cross(y_ax)
        rot = Matrix((hand_dir, y_ax, z_ax)).transposed()
        hand = ellipsoid(f'hand{sgn}', hc, (0.115, 0.07, 0.085), rot, 20, 12)
        assign(hand, claw_mat)
        claws_hand_tip = hc + hand_dir * 0.095
        for dz, ln, rr in ((0.035, 0.13, 0.027), (-0.035, 0.11, 0.023)):
            f0 = claws_hand_tip + Vector((0, 0, dz))
            fd = (hand_dir + Vector((0, -0.25, -dz * 4))).normalized()
            fingers.append([(f0 - fd * 0.03, rr), (f0 + fd * ln * 0.5, rr * 0.8),
                            (f0 + fd * ln + Vector((0, 0, -dz * 0.6)), rr * 0.25)])
        hands.append(hand)
    arm_obj = tubes_uv('arms', arms, 10)
    assign(arm_obj, claw_mat)
    finger_obj = tubes_uv('fingers', fingers, 8)
    assign(finger_obj, tip_mat)

    stalks = tubes_uv('stalks', [[(Vector((sgn * 0.06, -0.17, zb + 0.08)), 0.018),
                                  (Vector((sgn * 0.085, -0.2, zb + 0.16)), 0.014)] for sgn in (-1, 1)], 8)
    assign(stalks, claw_mat)
    eyes = [eye(f'eye{sgn}', (sgn * 0.088, -0.205, zb + 0.18), 0.03, iris='#2a1a10', axis=Vector((sgn * 0.3, -1, 0.3)),
                squash=0.9, pupil=0.6) for sgn in (-1, 1)]
    mouth = ellipsoid('mouth', (0, -0.19, zb + 0.0), (0.08, 0.03, 0.045))
    assign(mouth, banded('crab-mouth', [(0, '#6a1a10'), (1, '#9a2a18')]))

    body = [shell, stalks, mouth] + eyes
    claw_objs = [arm_obj, finger_obj] + hands
    M = (Matrix.Scale(0.8, 4) @ Matrix.Rotation(math.radians(24), 4, 'X') @
         Matrix.Rotation(math.radians(16), 4, 'Z'))
    place([leg_obj] + body + claw_objs, M)
    holdout_copy(shell, 0.97, center=(0, 0, zb))
    gz = world_min_z([leg_obj])
    cx = world_center_x([leg_obj])
    leg_origin = (cx, 0.0, gz)
    claw_root = tuple(M @ Vector((0, -0.12, zb)))
    return {'feet': True, 'lights': top_lights, 'parts': [
        {'name': 'legs', 'objects': [leg_obj], 'anim': 'wag', 'amp': 0.06, 'pivot': tuple(M @ Vector((0, 0, zb))),
         'pose': {'scale': ((1.08, 1.0, 0.9), (0.94, 1.0, 1.07)), 'origin': leg_origin}},
        {'name': 'body', 'objects': body},
        {'name': 'claws', 'objects': claw_objs, 'anim': 'wag', 'amp': 0.08, 'pivot': claw_root,
         'pose': {'rotate': 'X', 'origin': claw_root, 'angles': (-14, 8)}},
    ]}


# ====================================================================================
# hermit crab
# ====================================================================================

HERMIT = {'apex': (-0.6, -0.4, 0.7), 'mouth': (1.0, 0.0, -0.5), 'at': (0.1, 0.0, 0.22), 'scale': 0.9}


def spiral_shell(r_ap=0.2, D=0.16, T=0.4, turns=4.4, W=1.85, ring=28, per_turn=40):
    """A coiled gastropod shell: a tube whose radius grows by W per whorl as it winds around and
    down the spire axis (local +z points to the apex). The aperture (last ring) is at angle 0."""
    b = math.log(W) / (2 * math.pi)
    n = int(turns * per_turn) + 1
    P = []
    for i in range(n):
        th = -turns * 2 * math.pi * (1 - i / (n - 1))
        g = math.exp(b * th)
        rad = Vector((math.cos(th), math.sin(th), 0))
        c = rad * (D * g) + Vector((0, 0, -T * g))
        r = r_ap * g
        # The lip flares a little at the aperture.
        r *= 1 + 0.12 * smoothstep(0.96, 1.0, i / (n - 1))
        row = [c + (rad * math.cos(2 * math.pi * j / ring) + Vector((0, 0, 1)) * math.sin(2 * math.pi * j / ring)) * r
               for j in range(ring)]
        P.append(row)
    apex = sum(P[0], Vector()) / ring + Vector((0, 0, r_ap * math.exp(-b * turns * 2 * math.pi)))
    o = grid_mesh('shell', P, True, (apex, None))
    subdivide(o, 1)
    ap_center = Vector((D, 0, -T))
    ap_normal = Vector((0, 1, 0))  # the tube's direction of growth at the aperture
    return o, ap_center, ap_normal, r_ap * 1.12


def shell_mat(turns):
    """Cream turban shell with brown flame stripes across the whorls, fine spiral cords, and
    patches of pink coralline crust."""
    mat, n = new_material('hermit-shell')
    u, v, _ = uv_xy(n)
    co = coord(n)
    # Flames: zigzag stripes running across the whorl (v is along the coil).
    wig = math_node(n, 'MULTIPLY', math_node(n, 'SINE', math_node(n, 'MULTIPLY', u, 6 * math.pi)), 0.035)
    fv = math_node(n, 'ADD', math_node(n, 'MULTIPLY', v, turns * 9.0), math_node(n, 'MULTIPLY', wig, turns * 9.0))
    fl = math_node(n, 'ABSOLUTE', math_node(n, 'SUBTRACT', math_node(n, 'FRACT', fv), 0.5))
    flame = map_range(n, fl, 0.16, 0.24, 1, 0)
    col = mix(n, flame, '#e2cfa6', '#7c4524')
    # A dark spiral band on each whorl's shoulder, and a pale one below it.
    bandv = math_node(n, 'ABSOLUTE', math_node(n, 'SUBTRACT', u, 0.2))
    band = map_range(n, bandv, 0.07, 0.04, 0, 1)
    col = mix(n, math_node(n, 'MULTIPLY', band, 0.75), col, '#5a3018')
    crust = map_range(n, noise(n, co, 5.0, 4.0, 0.6), 0.55, 0.68, 0, 0.8)
    col = mix(n, crust, col, '#c98a9a')
    col = vary(n, col, co, 14.0, 0.85, 1.1)
    cords = math_node(n, 'ABSOLUTE', math_node(n, 'SINE', math_node(n, 'MULTIPLY', u, 2 * math.pi * 11)))
    growth = math_node(n, 'ABSOLUTE', math_node(n, 'SINE', math_node(n, 'MULTIPLY', v, 2 * math.pi * turns * 30)))
    h = math_node(n, 'ADD', math_node(n, 'MULTIPLY', cords, 0.6), math_node(n, 'MULTIPLY', growth, 0.25))
    h = math_node(n, 'ADD', h, math_node(n, 'MULTIPLY', noise(n, co, 40.0, 3.0), 0.5))
    nrm = bump(n, h, 0.35, 0.006)
    return finish(mat, n, pbr(n, col, rough=0.55, normal=nrm, coat=0.2, coat_rough=0.3))


def build_hermitcrab():
    turns = 4.4
    shell, ap_c, ap_n, _ = spiral_shell(turns=turns)
    assign(shell, shell_mat(turns))
    # Orient the shell: spire axis up and back, aperture facing forward and down.
    A = Vector(HERMIT['apex']).normalized()
    F = Vector(HERMIT['mouth'])
    F = (F - A * F.dot(A)).normalized()
    R = Matrix((F.cross(A), F, A)).transposed().to_4x4()
    shell.matrix_world = R
    bpy.context.view_layer.update()
    shell.matrix_world = Matrix.Translation(Vector(HERMIT['at']) - R @ ap_c) @ R
    bpy.context.view_layer.update()
    mw = shell.matrix_world
    ap = mw @ ap_c
    apn = (mw.to_3x3() @ ap_n).normalized()

    red = [(0.0, '#a8200f'), (0.3, '#c62a16'), (0.36, '#f3e6d0'), (0.42, '#c62a16'), (0.64, '#cf3318'),
           (0.7, '#f3e6d0'), (0.76, '#d0381a'), (0.92, '#e8b030'), (1.0, '#3a2010')]
    leg_mat = banded('hermit-leg', red, belly='#f0c8a8')
    claw_mat = banded('hermit-claw', [(0.0, '#b8240f'), (0.6, '#cc2c16'), (1.0, '#d8402a')], bump_scale=90.0)

    # A frame at the aperture: f forward out of the shell (level), s toward the viewer's side.
    O = ap
    f = Vector((apn.x, apn.y, 0)).normalized()
    sd = Vector((f.y, -f.x, 0))           # right-hand side of the crab = toward the camera
    z = Vector((0, 0, 1))
    head = ellipsoid('head', O + f * 0.04 + z * 0.03, (0.09, 0.08, 0.07))
    assign(head, claw_mat)

    # Walking legs: two pairs a side, knees high, reaching forward and down to the sand.
    legs = []
    for side in (1, -1):
        for i, (reach, knee_h) in enumerate(((0.34, 0.13), (0.25, 0.1))):
            r0 = O - z * 0.07 + sd * (0.05 * side) - f * (0.04 * i)
            knee = r0 + f * (reach * 0.45) + sd * (0.07 * side) + z * knee_h
            ank = r0 + f * (reach * 0.85) + sd * (0.09 * side) + z * 0.0
            tip = r0 + f * reach + sd * (0.1 * side)
            tip.z = 0.0
            legs.append([(r0, 0.03), (knee, 0.028), (ank, 0.02), (tip, 0.006)])
    leg_obj = tubes_uv('legs', legs, 8)
    assign(leg_obj, leg_mat)

    # The big claw (near side) blocks the aperture; a smaller one behind it.
    claw_parts = []
    spot_mat = crab_shell_mat(belly=False)
    for side, k in ((1, 1.0), (-1, 0.7)):
        b0 = O + f * 0.04 + sd * (0.05 * side) - z * 0.03
        el = b0 + f * (0.1 * k) + sd * (0.05 * side) + z * 0.03
        wr = el + f * (0.06 * k) - z * (0.05 * k)
        arm = tubes_uv(f'carm{side}', [[(b0, 0.036 * k), (el, 0.036 * k), (wr, 0.032 * k)]], 10)
        assign(arm, claw_mat)
        hd = (f * 0.75 - z * 0.65).normalized()
        hc = wr + hd * 0.065 * k
        y_ax = sd
        z_ax = hd.cross(y_ax).normalized()
        rot = Matrix((hd, y_ax, z_ax)).transposed()
        hand = ellipsoid(f'chand{side}', hc, (0.09 * k, 0.04 * k, 0.062 * k), rot, 18, 10)
        assign(hand, spot_mat)
        fing = tubes_uv(f'cfing{side}', [[(hc + hd * 0.06 * k + z_ax * dz * k, 0.02 * k),
                                          (hc + hd * 0.11 * k + z_ax * dz * 0.8 * k, 0.016 * k),
                                          (hc + hd * 0.15 * k + z_ax * dz * 0.2 * k, 0.006 * k)]
                                         for dz in (0.022, -0.022)], 8)
        assign(fing, banded('hermit-finger', [(0, '#d03a1e'), (0.55, '#e8c060'), (1, '#3a2414')]))
        claw_parts += [arm, hand, fing]

    stalk_mat = banded('hermit-stalk', [(0, '#e0a020'), (0.8, '#f2c840'), (1, '#f2c840')])
    stalk_lines, eyes = [], []
    for side in (1, -1):
        a = O + f * 0.09 + z * 0.06 + sd * (0.03 * side)
        b = a + f * 0.04 + z * 0.09 + sd * (0.01 * side)
        c = b + f * 0.02 + z * 0.06
        stalk_lines.append([(a, 0.015), (b, 0.013), (c, 0.013)])
        eyes.append(eye(f'eye{side}', c + z * 0.015 + f * 0.005, 0.024, iris='#101010',
                        axis=(f * 0.5 + sd + z * 0.2).normalized(), squash=0.85, pupil=0.7))
    stalks = tubes_uv('stalks', stalk_lines, 8)
    assign(stalks, stalk_mat)
    ant_lines = []
    for side in (1, -1):
        a = O + f * 0.1 + z * 0.03 + sd * (0.04 * side)
        ant_lines.append([(a, 0.008), (a + f * 0.12 + z * 0.06 + sd * (0.03 * side), 0.006),
                          (a + f * 0.22 + z * 0.17 + sd * (0.05 * side), 0.004),
                          (a + f * 0.26 + z * 0.27 + sd * (0.06 * side), 0.003)])
    ant = tubes_uv('antennae', ant_lines, 6)
    assign(ant, leg_mat)

    # The crab is drawn a bit larger than the opening it lives in, so it reads at this size.
    K = Matrix.Translation(O) @ Matrix.Scale(1.25, 4) @ Matrix.Translation(-O)
    for o in [head, leg_obj, stalks, ant] + eyes + claw_parts:
        o.matrix_world = K @ o.matrix_world
    body = [shell, head, stalks, ant] + eyes + claw_parts
    M = Matrix.Scale(HERMIT['scale'], 4)
    place([leg_obj] + body, M)
    gz = world_min_z([leg_obj])
    tips_x = world_center_x([leg_obj])
    origin = (tips_x, 0.0, gz + 0.3 * HERMIT['scale'])
    return {'feet': True, 'lights': critter_lights, 'parts': [
        {'name': 'legs', 'objects': [leg_obj], 'anim': 'wag', 'amp': 0.15, 'pivot': origin,
         'pose': {'rotate': 'Y', 'origin': origin, 'angles': (-9, 9)}},
        {'name': 'body', 'objects': body},
    ]}


# ====================================================================================
# sea star
# ====================================================================================

def spheres(name, items, segs=10, rings=6):
    """Many small spheres in one mesh. items: [(center, radius, squash_z), ...]."""
    verts, faces = [], []
    for c, r, sq in items:
        base = len(verts)
        verts.append(Vector(c) + Vector((0, 0, r * sq)))
        for i in range(1, rings):
            th = math.pi * i / rings
            for j in range(segs):
                ph = 2 * math.pi * j / segs
                verts.append(Vector(c) + Vector((r * math.sin(th) * math.cos(ph), r * math.sin(th) * math.sin(ph),
                                                 r * sq * math.cos(th))))
        verts.append(Vector(c) - Vector((0, 0, r * sq)))
        top, bot = base, len(verts) - 1
        for j in range(segs):
            j1 = (j + 1) % segs
            faces.append((top, base + 1 + j, base + 1 + j1))
            faces.append((bot, base + 1 + (rings - 2) * segs + j1, base + 1 + (rings - 2) * segs + j))
        for i in range(rings - 2):
            for j in range(segs):
                j1 = (j + 1) % segs
                a, b = base + 1 + i * segs + j, base + 1 + i * segs + j1
                faces.append((a, a + segs, b + segs, b))
    from common import mesh_object
    o = mesh_object(name, verts, faces)
    from visitors import fix_normals
    fix_normals(o)
    return o


STAR = {'tilt': 62, 'R': 0.56, 'seed': 3}


def build_seastar():
    rng = np.random.default_rng(STAR['seed'])
    R = STAR['R']
    arms = [math.radians(90 + 6 + 72 * k + rng.uniform(-4, 4)) for k in range(5)]
    lens = [R * rng.uniform(0.92, 1.05) for _ in range(5)]
    bends = [rng.uniform(-0.25, 0.25) for _ in range(5)]
    w0 = 0.125

    def width(d, L):
        u = min(max(d / L, 0.0), 1.0)
        return w0 * (1 - u ** 1.4) ** 0.55 + 0.018 * (1 - u) + 0.012

    def height(d, L):
        u = min(max(d / L, 0.0), 1.0)
        return 0.115 * (1 - u) ** 0.75 + 0.025

    def nearest(phi):
        best = None
        for k, a in enumerate(arms):
            dd = (phi - a + math.pi) % (2 * math.pi) - math.pi
            if best is None or abs(dd) < abs(best[1]):
                best = (k, dd)
        return best

    def outline(phi):
        k, dd = nearest(phi)
        L = lens[k]
        rho = L
        while rho > 0.01:
            lat, d = rho * math.sin(abs(dd)), rho * math.cos(dd)
            if d > 0 and lat <= width(d, L):
                return rho
            rho -= 0.0025
        return 0.01

    nphi, nrow = 200, 22
    P_top, P_bot = [], []
    outl = [outline(2 * math.pi * j / nphi) for j in range(nphi)]
    rows = [((i / nrow) ** 0.8) for i in range(1, nrow + 1)]
    for f in rows:
        row = []
        for j in range(nphi):
            phi = 2 * math.pi * j / nphi
            k, dd = nearest(phi)
            L = lens[k]
            rho = f * outl[j]
            lat, d = rho * math.sin(dd), rho * math.cos(dd)
            w = width(max(d, 0), L)
            z = height(max(d, 0), L) * max(0.0, 1 - min(1.0, abs(lat) / w) ** 2.2) ** 0.5
            z += 0.07 * (max(d, 0) / L) ** 3                  # arm tips curl up off the sand
            # Bend each arm a little.
            ph2 = phi + bends[k] * (max(d, 0) / L) ** 2
            row.append(Vector((rho * math.cos(ph2), rho * math.sin(ph2), z)))
        P_top.append(row)
    rim = [Vector((p.x, p.y, p.z - 0.012)) for p in P_top[-1]]
    under = []
    for f in (0.85, 0.5):
        under.append([Vector((p.x * f, p.y * f, -0.012 + 0.07 * (p.length * f / R) ** 3 * 0.6)) for p in P_top[-1]])
    P = P_top + [rim] + under
    caps = (Vector((0, 0, height(0, R))), Vector((0, 0, -0.012)))
    body = grid_mesh('star', P, True, caps)
    subdivide(body, 1)

    # Rows of blunt knobs along each arm.
    items = []
    for k, a in enumerate(arms):
        L = lens[k]
        for d in np.arange(0.1, 0.8 * L, 0.06):
            for lat_f, rr in ((0.0, 0.026), (0.6, 0.017), (-0.6, 0.017)):
                if lat_f and d > 0.62 * L:
                    continue
                w = width(d, L)
                lat = lat_f * w
                zz = height(d, L) * max(0.0, 1 - abs(lat_f) ** 2.2) ** 0.5 + 0.07 * (d / L) ** 3
                ph = a + bends[k] * (d / L) ** 2
                c = Vector((d * math.cos(ph) - lat * math.sin(ph), d * math.sin(ph) + lat * math.cos(ph), zz - 0.006))
                r = rr * (1 - 0.45 * d / L) * rng.uniform(0.85, 1.15)
                items.append((c, r, 0.85))
    for k, a in enumerate(arms):
        items.append((Vector((0.07 * math.cos(a + 0.63), 0.07 * math.sin(a + 0.63), height(0, R) - 0.004)), 0.024, 0.8))
    knobs = spheres('knobs', items)

    mat, n = new_material('star-skin')
    co = coord(n)
    sep = n.new('ShaderNodeSeparateXYZ')
    n.link(co, sock(sep.inputs, 'Vector'))
    comb = n.new('ShaderNodeCombineXYZ')
    n.link(sock(sep.outputs, 'X'), sock(comb.inputs, 'X'))
    n.link(sock(sep.outputs, 'Y'), sock(comb.inputs, 'Y'))
    ln = n.new('ShaderNodeVectorMath', _operation='LENGTH')
    n.link(sock(comb.outputs, 'Vector'), ln.inputs[0])
    rad = map_range(n, sock(ln.outputs, 'Value'), 0.0, R, 0, 1)
    r = ramp(n, [(0.0, '#a82a14'), (0.25, '#c8381a'), (0.7, '#dc5222'), (1.0, '#ee8a40')])
    n.link(rad, sock(r.inputs, 'Fac'))
    col = vary(n, sock(r.outputs, 'Color'), co, 9.0, 0.8, 1.12)
    # Fine reticulated grooves between the plates.
    vor = n.new('ShaderNodeTexVoronoi', Scale=55.0, _feature='DISTANCE_TO_EDGE')
    n.link(co, sock(vor.inputs, 'Vector'))
    groove = map_range(n, sock(vor.outputs, 'Distance'), 0.0, 0.12, 1, 0)
    col = mix(n, math_node(n, 'MULTIPLY', groove, 0.45), col, '#6a1a0c')
    _, _, nz = local_normal(n)
    col = mix(n, map_range(n, nz, -0.2, -0.6, 0, 1), col, '#f0c890')
    nrm = bump(n, math_node(n, 'SUBTRACT', 1.0, groove), 0.35, 0.004)
    assign(body, finish(mat, n, pbr(n, col, rough=0.6, normal=nrm, coat=0.15, coat_rough=0.3, sss=0.0)))
    km, kn = new_material('star-knob')
    kc = vary(kn, rgb(kn, '#f6d8a4'), coord(kn), 30.0, 0.85, 1.08)
    assign(knobs, finish(km, kn, pbr(kn, kc, rough=0.45, coat=0.3, coat_rough=0.2)))

    M = Matrix.Rotation(math.radians(STAR['tilt']), 4, 'X')
    objs = [body, knobs]
    place(objs, M)
    gz = world_min_z(objs)
    cx = world_center_x(objs)
    pivot = tuple(M @ Vector((0, 0, 0.05)))
    return {'feet': True, 'lights': top_lights, 'parts': [
        {'name': 'body', 'objects': objs, 'anim': 'pulse', 'amp': 0.025, 'pivot': pivot,
         'pose': {'scale': ((1.045, 1.0, 0.955), (0.96, 1.0, 1.045)), 'origin': (cx, 0.0, gz)}},
    ]}


# ====================================================================================
# nudibranch
# ====================================================================================

NUDI = {'scale': 1.0}


def nudi_body(L=1.1, ring=40, n=48):
    w = profile([(0, 0.012), (0.06, 0.05), (0.2, 0.105), (0.45, 0.125), (0.75, 0.12), (0.9, 0.1), (0.97, 0.07),
                 (1, 0.02)])
    h = profile([(0, 0.025), (0.08, 0.07), (0.25, 0.17), (0.5, 0.21), (0.75, 0.2), (0.9, 0.16), (0.97, 0.11),
                 (1, 0.05)])
    zm = 0.05  # mantle edge height
    P = []
    for i in range(n):
        t = i / (n - 1)
        x = -L / 2 + L * t
        ww, hh = w(t), max(h(t), zm + 0.01)
        row = []
        for j in range(ring):
            a = 2 * math.pi * j / ring
            ca, sa = math.cos(a), math.sin(a)
            # Wavy mantle skirt along the sides.
            frill = 1 + 0.07 * math.sin(t * 46) * max(0.0, 1 - abs(sa) * 3) * smoothstep(0.05, 0.2, t)
            if sa >= 0:
                y = -ww * math.copysign(abs(ca) ** 0.8, ca) * frill
                z = zm + (hh - zm) * sa ** 0.75
            else:
                y = -ww * math.copysign(abs(ca) ** 0.6, ca) * (0.78 + 0.22 * abs(ca)) * frill
                z = zm * (1 - abs(sa) ** 0.45)
            row.append(Vector((x, y, z)))
        P.append(row)
    o = grid_mesh('nudi', P, True, (Vector((-L / 2 - 0.01, 0, 0.02)), Vector((L / 2 + 0.005, 0, 0.05))))
    subdivide(o, 1)
    return o, w, h


def nudi_material():
    """Royal blue with a bright orange-yellow mantle rim, white lines along the back and sides."""
    mat, n = new_material('nudi-skin')
    u, v, _ = uv_xy(n)
    co = coord(n)
    # Distance (in u) to the mantle edge, which sits at u = 0 / 0.5 / 1.
    e0 = math_node(n, 'MINIMUM', u, math_node(n, 'ABSOLUTE', math_node(n, 'SUBTRACT', u, 0.5)))
    edge = math_node(n, 'MINIMUM', e0, math_node(n, 'SUBTRACT', 1.0, u))
    col = rgb(n, '#2b2aa8')
    lower = map_range(n, u, 0.5, 0.53, 0, 1)
    lower = math_node(n, 'MULTIPLY', lower, map_range(n, u, 0.97, 0.94, 0, 1))
    col = mix(n, lower, col, '#a8b0f4')
    col = mix(n, map_range(n, edge, 0.022, 0.012, 0, 1), col, '#ffc414')
    col = mix(n, map_range(n, math_node(n, 'ABSOLUTE', math_node(n, 'SUBTRACT', edge, 0.055)), 0.012, 0.005, 0, 1),
              col, '#f6f6ff')
    mid = math_node(n, 'ABSOLUTE', math_node(n, 'SUBTRACT', u, 0.25))
    col = mix(n, map_range(n, mid, 0.035, 0.022, 0, 1), col, '#f8f8ff')
    # A few dark spots on the blue.
    vor = n.new('ShaderNodeTexVoronoi', Scale=26.0, Randomness=1.0, _feature='F1')
    n.link(co, sock(vor.inputs, 'Vector'))
    bw = n.new('ShaderNodeRGBToBW')
    n.link(sock(vor.outputs, 'Color'), sock(bw.inputs, 'Color'))
    spot = math_node(n, 'MULTIPLY', math_node(n, 'GREATER_THAN', sock(bw.outputs, 'Val'), 0.62),
                     map_range(n, sock(vor.outputs, 'Distance'), 0.22, 0.14, 0, 1))
    blue = map_range(n, edge, 0.07, 0.09, 0, 1)
    blue = math_node(n, 'MULTIPLY', blue, map_range(n, mid, 0.05, 0.07, 0, 1))
    blue = math_node(n, 'MULTIPLY', blue, map_range(n, u, 0.5, 0.48, 0, 1))
    col = mix(n, math_node(n, 'MULTIPLY', spot, math_node(n, 'MULTIPLY', blue, 0.85)), col, '#14124a')
    col = vary(n, col, co, 20.0, 0.9, 1.08)
    nrm = bump(n, noise(n, co, 60.0, 3.0), 0.2, 0.003)
    return finish(mat, n, pbr(n, col, rough=0.3, normal=nrm, sss=0.0, coat=0.6, coat_rough=0.08))


def rhinophore(name, base, height, lean, r=0.024):
    pts, rows = [], []
    for i in range(30):
        s_ = i / 29
        p = base + Vector((lean * s_ * s_ * height, 0, height * s_))
        rr = r * (0.55 + 0.45 * smoothstep(0.0, 0.45, s_)) * (1 - smoothstep(0.7, 1.0, s_) * 0.85)
        if 0.35 < s_ < 0.92:
            rr *= 1 + 0.18 * abs(math.sin(s_ * math.pi * 13))   # lamellae
        pts.append((p, rr + 0.002))
    return pts


def build_nudibranch():
    rng = np.random.default_rng(2)
    body, w, h = nudi_body()
    assign(body, nudi_material())
    L = 1.1
    orange = banded('nudi-orange', [(0.0, '#ff7414'), (0.75, '#ff8a1e'), (0.92, '#ffd070'), (1.0, '#fff4d8')],
                    rough=0.35, coat=0.5)
    tr = 0.87
    x_r = -L / 2 + L * tr
    rh = tubes_uv('rhino', [rhinophore('r', Vector((x_r + dx, dy, h(tr) - 0.03)), 0.2, 0.25)
                            for dx, dy in ((0.0, -0.045), (-0.035, 0.045))], 12)
    assign(rh, orange)
    # Gill plume: a ring of feathery branches curling up and out.
    tg = 0.2
    x_g = -L / 2 + L * tg
    gc = Vector((x_g, 0, h(tg) - 0.025))
    lines = []
    for k in range(13):
        a = 2 * math.pi * k / 13 + 0.2
        out = Vector((math.cos(a) * 1.2, math.sin(a), 0))
        pts = []
        for i in range(16):
            s_ = i / 15
            p = gc + out * (0.03 + 0.1 * s_ ** 1.5) + Vector((0, 0, 0.17 * math.sin(s_ * math.pi * 0.6)))
            rr = 0.012 * (1 - 0.6 * s_) * (1 + 0.45 * abs(math.sin(s_ * math.pi * 8))) + 0.003
            pts.append((p, rr))
        lines.append(pts)
    gills = tubes_uv('gills', lines, 8)
    assign(gills, orange)
    tent = tubes_uv('oral', [[(Vector((L / 2 - 0.04, dy, 0.05)), 0.014), (Vector((L / 2 + 0.03, dy * 1.6, 0.03)), 0.01),
                              (Vector((L / 2 + 0.06, dy * 2.0, 0.012)), 0.005)] for dy in (-0.05, 0.05)], 8)
    assign(tent, orange)

    M = Matrix.Scale(NUDI['scale'], 4) @ Matrix.Rotation(math.radians(8), 4, 'X')
    place([body, rh, gills, tent], M)
    holdout_copy(body, 0.985, center=(0, 0, 0.08))
    pivot = tuple(M @ Vector((0, 0, h(0.5) * 0.9)))
    return {'feet': True, 'lights': critter_lights, 'parts': [
        {'name': 'body', 'objects': [body, tent]},
        {'name': 'gills', 'objects': [rh, gills], 'anim': 'pulse', 'amp': 0.08, 'pivot': pivot,
         'pose': {'scale': ((1.04, 1.0, 0.8), (0.97, 1.0, 1.12)), 'origin': pivot}},
    ]}


# ====================================================================================
# banded cleaner shrimp
# ====================================================================================

def build_shrimp():
    # Body spine from the tail root (t=0) to the rostrum tip (t=1), arched a little.
    n = 44
    pts = []
    for i in range(n):
        t = i / (n - 1)
        x = -0.4 + 0.76 * t
        z = 0.2 + 0.05 * math.sin(math.pi * min(1.0, t * 1.4)) - 0.07 * (1 - t) ** 3 - 0.02 * smoothstep(0.85, 1.0, t)
        pts.append(Vector((x, 0, z)))
    wp = profile([(0, 0.022), (0.08, 0.03), (0.3, 0.045), (0.52, 0.055), (0.62, 0.06), (0.8, 0.058), (0.9, 0.045),
                  (0.95, 0.025), (1, 0.004)])
    hp = profile([(0, 0.026), (0.08, 0.036), (0.3, 0.055), (0.52, 0.066), (0.62, 0.074), (0.8, 0.07), (0.9, 0.05),
                  (0.95, 0.025), (1, 0.004)])
    fr = spine(pts, (0, 0, 1))
    st = []
    for i, (p, (tg, sd, up)) in enumerate(zip(pts, fr)):
        t = i / (n - 1)
        seg = 1.0
        if t < 0.55:   # six abdominal segments with slight constrictions
            k = (t - 0.02) / 0.53 * 6
            seg = 1 - 0.07 * math.exp(-((k - round(k)) / 0.12) ** 2)
        st.append((p, sd, up, wp(t) * seg * 1.25, hp(t) * seg * 1.35))
    body = loft('shrimp', st, 20, 2.3)
    subdivide(body, 1)
    bands = [(0.0, '#f2eee6'), (0.07, '#f2eee6'), (0.1, '#d0202a'), (0.25, '#d0202a'), (0.28, '#f4f0e8'),
             (0.36, '#f4f0e8'), (0.39, '#cc1f2a'), (0.53, '#cc1f2a'), (0.56, '#f4f0e8'), (0.63, '#f4f0e8'),
             (0.66, '#d22430'), (0.82, '#d22430'), (0.85, '#f4f0e8'), (0.91, '#f4f0e8'), (0.94, '#d22430'),
             (1.0, '#d22430')]
    body_mat = banded('shrimp-body', bands, rough=0.3, coat=0.6, sss=0.0, interp='LINEAR')
    assign(body, body_mat)

    # Tail fan: telson and uropods fanned out behind.
    tail = pts[0]
    fans = []
    for ang, ln, wd, dy in ((-178, 0.15, 0.028, 0.0), (-192, 0.16, 0.034, -0.02), (-166, 0.16, 0.034, 0.02),
                            (-203, 0.14, 0.03, -0.035), (-156, 0.14, 0.03, 0.035)):
        a = math.radians(ang)
        d = Vector((math.cos(a), 0.0, math.sin(a)))
        side = Vector((0, -1, 0))
        upv = d.cross(side).normalized()
        stf = []
        for i in range(10):
            u = i / 9
            c = tail + Vector((0.06, dy, 0)) + d * (ln + 0.06) * u
            stf.append((c, upv, side, wd * (0.35 + 0.65 * math.sin(min(u * 1.3, 1) * math.pi / 2)) * (1 - 0.35 * u ** 5)
                        + 0.003, 0.007))
        fans.append(loft(f'fan{ang}', stf, 12, 2.0))
    fan_mat = banded('shrimp-fan', [(0.0, '#f4f0e8'), (0.4, '#f4f0e8'), (0.48, '#d0202a'), (0.78, '#d0202a'),
                                    (0.86, '#f8f6f0'), (1.0, '#f8f6f0')], rough=0.3, coat=0.5)
    for o in fans:
        assign(o, fan_mat)

    # Walking legs (thin, white with red bands), both sides.
    legs = []
    for side in (-1, 1):
        for i, x0 in enumerate((0.02, 0.08, 0.14, 0.2)):
            r0 = Vector((x0, side * 0.03, 0.17))
            knee = r0 + Vector((0.03 + 0.02 * i, side * 0.05, 0.03))
            tip = Vector((x0 + 0.06 + 0.03 * i - 0.04 * (side > 0), side * 0.07, 0.0))
            legs.append([(r0, 0.011), (knee, 0.01), ((knee + tip) / 2 + Vector((0.01, 0, 0)), 0.008), (tip, 0.004)])
    leg_obj = tubes_uv('legs', legs, 6)
    leg_mat = banded('shrimp-leg', [(0.0, '#f6f2ea'), (0.4, '#f6f2ea'), (0.5, '#d8303a'), (0.6, '#f6f2ea'),
                                    (1.0, '#f6f2ea')], rough=0.35, coat=0.4)
    assign(leg_obj, leg_mat)

    # Long banded claws held forward (third pair of legs), near and far.
    claws = []
    for side, k in ((-1, 1.0), (1, 0.85)):
        r0 = Vector((0.22, side * 0.03, 0.15))
        el = r0 + Vector((0.08 * k, side * 0.05, 0.1 * k))
        wr = el + Vector((0.16 * k, side * 0.01, 0.02 * k))
        tip = wr + Vector((0.15 * k, 0, -0.04 * k))
        claws.append([(r0, 0.013), (el, 0.013), (wr, 0.016), (wr + (tip - wr) * 0.45, 0.027 * k),
                      (wr + (tip - wr) * 0.75, 0.018 * k), (tip, 0.005)])
    claw_obj = tubes_uv('claws', claws, 8)
    assign(claw_obj, banded('shrimp-claw', [(0.0, '#f6f2ea'), (0.18, '#d0202a'), (0.32, '#f6f2ea'),
                                             (0.48, '#d0202a'), (0.62, '#f6f2ea'), (0.75, '#d0202a'),
                                             (0.9, '#f6f2ea'), (1.0, '#f6f2ea')], rough=0.3, coat=0.5,
                                    interp='LINEAR'))
    eyes = [eye(f'eye{s_}', (0.31, s_ * 0.035, 0.265), 0.02, iris='#141414', axis=Vector((0.3, s_, 0.2)),
                squash=0.9, pupil=0.7) for s_ in (-1, 1)]

    # Antennae: two long white whips arching up and back, two shorter ones forward.
    head = Vector((0.33, 0, 0.25))
    ants = []
    for side, (dx, top, reach) in ((-1, (-0.66, 0.22, 1.0)), (1, (-0.52, 0.19, 0.9))):
        line = []
        for i in range(24):
            u = i / 23
            x = head.x + 0.12 * math.sin(u * math.pi * 0.7) + (dx * reach) * u ** 1.6
            z = head.z + top * math.sin(u * math.pi * 0.85) + 0.02 * u
            line.append((Vector((x, side * 0.02, z)), 0.007 * (1 - 0.6 * u) + 0.002))
        ants.append(line)
    for side in (-1, 1):
        line = []
        for i in range(14):
            u = i / 13
            line.append((head + Vector((0.18 * u, side * 0.02, 0.09 * math.sin(u * math.pi * 0.8))),
                         0.006 * (1 - 0.6 * u) + 0.002))
        ants.append(line)
    ant_obj = tubes_uv('antennae', ants, 6)
    assign(ant_obj, banded('shrimp-ant', [(0.0, '#e8e0d8'), (0.1, '#f8f6f2'), (1.0, '#f8f6f2')], rough=0.4,
                           coat=0.3))

    M = Matrix.Scale(0.85, 4) @ Matrix.Rotation(math.radians(6), 4, 'X')
    back = [leg_obj] + fans
    place(back + [body, claw_obj, ant_obj] + eyes, M)
    pivot = tuple(M @ Vector((-0.06, 0, 0.16)))
    ant_root = tuple(M @ head)
    return {'feet': True, 'lights': critter_lights, 'parts': [
        {'name': 'legs', 'objects': back, 'anim': 'wag', 'amp': 0.12, 'pivot': pivot,
         'pose': {'rotate': 'Y', 'origin': pivot, 'angles': (-7, 7)}},
        {'name': 'body', 'objects': [body, claw_obj] + eyes},
        {'name': 'antennae', 'objects': [ant_obj], 'anim': 'wag', 'amp': 0.25, 'pivot': ant_root,
         'pose': {'rotate': 'Y', 'origin': ant_root, 'angles': (-9, 9)}},
    ]}


CREATURES = {
    'crab': build_crab,
    'hermitcrab': build_hermitcrab,
    'seastar': build_seastar,
    'nudibranch': build_nudibranch,
    'shrimp': build_shrimp,
}
