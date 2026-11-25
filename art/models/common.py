"""Shared helpers for the Blender models behind the Realistic and Pixel art styles.

Everything here is procedural: meshes are built from numbers, materials from shader nodes and
small textures generated with numpy. No external models or image files are used.

Units: 1 Blender unit = 100 px at final (near-band) size.
"""

import math

import bpy
import numpy as np

PX_PER_UNIT = 100


# ---------- scene ----------

# Set by render.py from the command line.
# Khronos PBR Neutral keeps saturated base colors (yellow tangs, clownfish orange) true; AgX turned
# bright yellows khaki.
SETTINGS = {'samples': 96, 'threads': 0, 'view': 'Khronos PBR Neutral'}


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = SETTINGS['samples']
    if SETTINGS['threads']:
        scene.render.threads_mode = 'FIXED'
        scene.render.threads = SETTINGS['threads']
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 6
    scene.cycles.transparent_max_bounces = 16
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '8'
    # Maximum (lossless) PNG compression: the renders are committed, so size matters.
    scene.render.image_settings.compression = 100
    scene.render.filter_size = 1.2
    set_view_transform(scene)
    return scene


def set_view_transform(scene):
    """View transform and look from SETTINGS['view'] ('Khronos PBR Neutral', 'AgX', or
    'AgX - Punchy' etc.). Blender's look list doesn't enumerate in background mode, so looks are
    set by name directly."""
    vs = scene.view_settings
    view = SETTINGS['view']
    if view.startswith('AgX - '):
        vs.view_transform = 'AgX'
        vs.look = view
    else:
        vs.view_transform = view
        vs.look = 'None'


def ortho_camera(scene, cx, cz, width_units, w_px, h_px, supersample=2):
    """Side-on orthographic camera looking along +Y, centered on (cx, cz)."""
    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'ORTHO'
    cam_data.sensor_fit = 'HORIZONTAL'
    cam_data.ortho_scale = width_units
    cam_data.clip_start = 0.01
    cam_data.clip_end = 100
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    cam.location = (cx, -20, cz)
    cam.rotation_euler = (math.pi / 2, 0, 0)
    scene.camera = cam
    scene.render.resolution_x = w_px * supersample
    scene.render.resolution_y = h_px * supersample
    scene.render.resolution_percentage = 100
    return cam


def world(scene, color=(0.02, 0.09, 0.14), strength=1.0):
    w = bpy.data.worlds.new('water')
    scene.world = w
    bg = w.node_tree.nodes.get('Background') or w.node_tree.nodes.new('ShaderNodeBackground')
    sock(bg.inputs, 'Color').default_value = (*color, 1)
    sock(bg.inputs, 'Strength').default_value = strength
    out = w.node_tree.nodes.get('World Output') or w.node_tree.nodes.new('ShaderNodeOutputWorld')
    w.node_tree.links.new(sock(bg.outputs, 'Background'), sock(out.inputs, 'Surface'))
    return w


def sun(scene, name, rot_deg, color, strength, angle_deg=6):
    d = bpy.data.lights.new(name, 'SUN')
    d.energy = strength
    d.color = color
    d.angle = math.radians(angle_deg)
    o = bpy.data.objects.new(name, d)
    o.rotation_euler = tuple(math.radians(a) for a in rot_deg)
    scene.collection.objects.link(o)
    return o


def area(scene, name, loc, target, color, power, size):
    d = bpy.data.lights.new(name, 'AREA')
    d.energy = power
    d.color = color
    d.size = size
    o = bpy.data.objects.new(name, d)
    o.location = loc
    scene.collection.objects.link(o)
    look_at(o, target)
    return o


def look_at(obj, target):
    from mathutils import Vector
    direction = Vector(target) - Vector(obj.location)
    obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()


def creature_lights(scene):
    """Sunlit shallow reef: warm-white sun from above and in front, blue fill from the water,
    a cool rim from behind so the silhouette separates from the backdrop."""
    world(scene, (0.05, 0.16, 0.22), 1.1)
    sun(scene, 'key', (20, 14, 0), (1.0, 0.97, 0.9), 5.5, angle_deg=5)
    area(scene, 'fill', (0, -6, -2.5), (0, 0, 0), (0.5, 0.78, 1.0), 70, 5)
    area(scene, 'rim', (-1.0, 4, 3.0), (0, 0, 0), (0.8, 0.95, 1.0), 520, 3)


# ---------- meshes ----------

def mesh_object(name, verts, faces, smooth=True, collection=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    if smooth:
        me.shade_smooth()
    o = bpy.data.objects.new(name, me)
    (collection or bpy.context.scene.collection).objects.link(o)
    return o


def sheet(name, grid, smooth=True, thickness=0.006):
    """A fin-like sheet from a grid[row][col] of (x, y, z) points. UV u runs along cols, v along
    rows (v=0 is the base row, v=1 the free edge)."""
    rows, cols = len(grid), len(grid[0])
    verts = [p for row in grid for p in row]
    faces = []
    for r in range(rows - 1):
        for c in range(cols - 1):
            i = r * cols + c
            faces.append((i, i + 1, i + cols + 1, i + cols))
    o = mesh_object(name, verts, faces, smooth)
    uv = o.data.uv_layers.new(name='UVMap')
    for poly in o.data.polygons:
        for li in poly.loop_indices:
            vi = o.data.loops[li].vertex_index
            r, c = divmod(vi, cols)
            uv.data[li].uv = (c / (cols - 1), r / (rows - 1))
    if thickness:
        m = o.modifiers.new('solid', 'SOLIDIFY')
        m.thickness = thickness
        m.offset = 0
    return o


def subdivide(obj, levels=2):
    m = obj.modifiers.new('subd', 'SUBSURF')
    m.levels = levels
    m.render_levels = levels
    return m


# ---------- curves ----------

def profile(points):
    """Smooth curve through (t, value) points (monotone cubic, so no overshoot)."""
    ts = np.array([p[0] for p in points], dtype=float)
    vs = np.array([p[1] for p in points], dtype=float)
    n = len(ts)
    d = np.diff(vs) / np.diff(ts)
    m = np.zeros(n)
    m[0], m[-1] = d[0], d[-1]
    for i in range(1, n - 1):
        m[i] = 0 if d[i - 1] * d[i] <= 0 else 2 / (1 / d[i - 1] + 1 / d[i])

    def f(t):
        t = min(max(t, ts[0]), ts[-1])
        i = min(np.searchsorted(ts, t, side='right') - 1, n - 2)
        h = ts[i + 1] - ts[i]
        s = (t - ts[i]) / h
        h00 = 2 * s**3 - 3 * s**2 + 1
        h10 = s**3 - 2 * s**2 + s
        h01 = -2 * s**3 + 3 * s**2
        h11 = s**3 - s**2
        return float(h00 * vs[i] + h10 * h * m[i] + h01 * vs[i + 1] + h11 * h * m[i + 1])

    return f


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# ---------- textures ----------

def srgb(hexstr):
    h = hexstr.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], dtype=np.float32)


def image_from_array(name, rgba):
    """rgba: float array (h, w, 4), row 0 at the BOTTOM, sRGB-encoded color."""
    h, w = rgba.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=True)
    img.colorspace_settings.name = 'sRGB'
    img.pixels.foreach_set(np.ascontiguousarray(rgba, dtype=np.float32).ravel())
    img.pack()
    return img


# ---------- materials ----------

def sock(coll, name):
    """The enabled socket with this name (some nodes, like Mix, have several per name)."""
    for s in coll:
        if s.name == name and s.enabled:
            return s
    return coll[name]


class Nodes:
    """Tiny helper to build node trees tersely."""

    def __init__(self, tree):
        self.tree = tree
        self.nodes = tree.nodes
        self.links = tree.links

    def new(self, kind, **inputs):
        n = self.nodes.new(kind)
        for k, v in inputs.items():
            if k.startswith('_'):
                setattr(n, k[1:], v)
            else:
                sock(n.inputs, k).default_value = v
        return n

    def link(self, a, b):
        self.links.new(a, b)


def new_material(name):
    mat = bpy.data.materials.new(name)
    nodes = mat.node_tree.nodes
    for n in list(nodes):
        nodes.remove(n)
    return mat, Nodes(mat.node_tree)


def side_projection(n, x0, x1, z0, z1):
    """Vector node output mapping object (x, z) onto image (u, v) in [0, 1]."""
    tc = n.new('ShaderNodeTexCoord')
    sep = n.new('ShaderNodeSeparateXYZ')
    n.link(sock(tc.outputs, 'Object'), sock(sep.inputs, 'Vector'))
    mu = n.new('ShaderNodeMapRange', **{'From Min': x0, 'From Max': x1, 'To Min': 0.0, 'To Max': 1.0})
    mv = n.new('ShaderNodeMapRange', **{'From Min': z0, 'From Max': z1, 'To Min': 0.0, 'To Max': 1.0})
    n.link(sock(sep.outputs, 'X'), sock(mu.inputs, 'Value'))
    n.link(sock(sep.outputs, 'Z'), sock(mv.inputs, 'Value'))
    comb = n.new('ShaderNodeCombineXYZ')
    n.link(sock(mu.outputs, 'Result'), sock(comb.inputs, 'X'))
    n.link(sock(mv.outputs, 'Result'), sock(comb.inputs, 'Y'))
    return sock(comb.outputs, 'Vector'), tc


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
