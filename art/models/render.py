"""Renders the 3D models into the images the Realistic and Pixel art styles are built from.

Run it through npm (it finds Blender for you):

    npm run models                      # everything
    npm run models -- clownfish crab    # just these ids (or a module name: fish, critters, ...)
    npm run models -- clownfish --samples 32 --threads 2 --review out/models

or directly:

    blender -b --factory-startup -P art/models/render.py -- [ids...] [--samples N] [--threads N]
            [--out DIR] [--review DIR] [--sets photo,toon] [--view NAME] [--crop FRACTION]

--sets limits which render sets to make. --crop renders only the left FRACTION of backdrops
(quick tests).

Output: two render sets of every model, each PNGs plus one <id>.json per model, which
scripts/render-art.mjs reads:
  art/models/renders/       realistic (Cycles): the Realistic style
  art/models/renders-toon/  cel-shaded with outlines (EEVEE + Freestyle, toon.py): the Illustrated
                            style, and the Pixel style down-rezzed from it
Each model is built once and rendered realistic first, then converted to cel shading. Creatures, plants and sprites are rendered at 2x their final (near)
size; backdrops at 1x. With --review, a quick composite of each model over water blue is written
there too (neutral pose, then pixel frames A and B side by side).

Units: 1 Blender unit = 100 px at final size. The camera looks along +Y from -Y; Z is up; +X is
screen right (creatures face +X).

Model modules (files in this folder, listed in MODULES) expose any of:

  CREATURES = {id: build}   build() -> {
      'parts': [part, ...],         # drawn back to front; each part is rendered on its own
      'feet': False,                # True for critters: canvas bottom = the creature's lowest point
      'lights': fn(scene),          # optional; default common.creature_lights
  }
  part = {
      'name': 'tail',               # file becomes <id>.<name>.png
      'objects': [bpy objects],
      'anim': 'none' | 'sweep' | 'wag' | 'pulse',   # Realistic: how the engine moves this part
      'amp': float, 'period': float,                # optional engine tuning (see art/README.md)
      'pivot': (x, y, z),           # world point the engine moves the part around
      'pose': {...},                # optional: two real 3D poses, rendered as Pixel frames A and B
  }
  pose = {'rotate': 'X'|'Y'|'Z', 'origin': (x, y, z), 'angles': (degA, degB)}
       | {'scale': ((sx, sy, sz), (sx, sy, sz)), 'origin': (x, y, z)}

  PLANTS = {id: build}      build() -> {'objects': [...], 'segments': 3..7, 'sway': radians,
                                        'lights': fn(scene) optional}
      The plant stands on the world origin and grows up +Z. It is rendered whole with its base at
      the bottom center of the canvas; render-art slices it into stacked sway segments.

  SPRITES = {id: build}     build() -> {'sprites': [{'name': ..., 'objects': [...]}, ...]}
      Loose single images (bubbles). Each gets its own tight canvas.

  BACKDROPS = {id: build}   build(scene) -> {'layer': 'far'|'reef'|'floor', 'w': px, 'h': px}
      Builds a tiling layer, its camera and lights (see reef.py).

Builders run in a fresh, empty scene each time (render.py resets it), so they must not keep bpy
data around between calls.
"""

import argparse
import importlib
import json
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import common  # noqa: E402

MODULES = ['fish', 'visitors', 'critters', 'plants', 'sprites', 'reef']
OPTS = {'crop': 1.0}


def each_set(scene, sets, line_px, convert=True):
    """Yields (out_dir, review_dir) for each render set, in order. The realistic set renders the
    model as built; before the cel set, every material is converted to cel shading (toon.py), so
    the model is only built once."""
    for s in sets:
        if s['name'] == 'toon' and convert:
            import toon
            toon.apply(scene, line_px)
        yield s['out'], s['review']
SUPERSAMPLE = 2
MARGIN_PX = 4
CELL = 6  # Pixel art cell size: canvases are multiples of it so cells line up.
REVIEW_BG = (0x1d / 255, 0x5f / 255, 0x80 / 255)


def ceil_to(v, step):
    return int(math.ceil(v / step - 1e-6) * step)


# ---------- poses ----------

def pose_matrix(pose, which):
    o = Vector(pose['origin'])
    if 'rotate' in pose:
        m = Matrix.Rotation(math.radians(pose['angles'][which]), 4, pose['rotate'])
    else:
        sx, sy, sz = pose['scale'][which]
        m = Matrix.Diagonal((sx, sy, sz, 1.0))
    return Matrix.Translation(o) @ m @ Matrix.Translation(-o)


class Posed:
    """Temporarily applies a pose to a part's objects."""

    def __init__(self, part, which):
        self.part, self.which = part, which

    def __enter__(self):
        self.saved = [o.matrix_world.copy() for o in self.part['objects']]
        if self.which is not None and self.part.get('pose'):
            m = pose_matrix(self.part['pose'], self.which)
            for o in self.part['objects']:
                o.matrix_world = m @ o.matrix_world
        bpy.context.view_layer.update()

    def __exit__(self, *exc):
        for o, mw in zip(self.part['objects'], self.saved):
            o.matrix_world = mw
        bpy.context.view_layer.update()


def world_bounds(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    xs, zs = [], []
    for o in objs:
        ev = o.evaluated_get(dg)
        for corner in ev.bound_box:
            p = ev.matrix_world @ Vector(corner)
            xs.append(p.x)
            zs.append(p.z)
    return min(xs), max(xs), min(zs), max(zs)


def union(a, b):
    return min(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), max(a[3], b[3])


# ---------- rendering ----------

def render_to(path, visible, all_objs):
    for o in all_objs:
        o.hide_render = o not in visible
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def load_rgba(path):
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    bpy.data.images.remove(img)
    return a.reshape(h, w, 4)


def save_rgb(path, rgb):
    h, w = rgb.shape[:2]
    img = bpy.data.images.new('review', w, h, alpha=False)
    rgba = np.concatenate([rgb, np.ones((h, w, 1), dtype=np.float32)], axis=-1)
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)


def compose(paths):
    out = None
    for p in paths:
        src = load_rgba(p)
        if out is None:
            out = np.ones(src.shape[:2] + (3,), dtype=np.float32) * np.array(REVIEW_BG, dtype=np.float32)
        a = src[..., 3:4]
        out = src[..., :3] * a + out * (1 - a)
    return out


def write_review(review_dir, mid, columns):
    if not review_dir:
        return
    imgs = [compose(c) for c in columns if c]
    gap = np.ones((imgs[0].shape[0], 8, 3), dtype=np.float32) * 0.1
    row = []
    for i, im in enumerate(imgs):
        if i:
            row.append(gap)
        row.append(im)
    save_rgb(os.path.join(review_dir, f'{mid}.png'), np.concatenate(row, axis=1))


def frame_creature(objs_by_pose, feet):
    """Canvas (1x px) and camera center covering every pose."""
    x0, x1, z0, z1 = objs_by_pose
    m = MARGIN_PX / common.PX_PER_UNIT
    w = ceil_to((x1 - x0 + 2 * m) * common.PX_PER_UNIT, CELL)
    if feet:
        h = ceil_to((z1 - z0 + m) * common.PX_PER_UNIT, CELL)
        cz = z0 + h / 2 / common.PX_PER_UNIT
    else:
        h = ceil_to((z1 - z0 + 2 * m) * common.PX_PER_UNIT, CELL)
        cz = (z0 + z1) / 2
    return w, h, (x0 + x1) / 2, cz


def render_creature(mid, build, sets):
    scene = common.reset_scene()
    c = build()
    (c.get('lights') or common.creature_lights)(scene)
    parts = c['parts']
    all_objs = [o for p in parts for o in p['objects']]
    bounds = world_bounds(all_objs)
    for p in parts:
        if p.get('pose'):
            for which in (0, 1):
                with Posed(p, which):
                    bounds = union(bounds, world_bounds(p['objects']))
    w, h, cx, cz = frame_creature(bounds, c.get('feet', False))
    common.ortho_camera(scene, cx, cz, w / common.PX_PER_UNIT, w, h, SUPERSAMPLE)

    def to_px(pt):
        return [round((pt[0] - cx) * common.PX_PER_UNIT + w / 2, 1),
                round(h / 2 - (pt[2] - cz) * common.PX_PER_UNIT, 1)]

    for out, review in each_set(scene, sets, 2.4):
        meta = {'id': mid, 'kind': 'creature', 'w': w, 'h': h, 'supersample': SUPERSAMPLE, 'parts': []}
        cols = [[], [], []]
        for p in parts:
            name = f"{mid}.{p['name']}"
            f = f'{name}.png'
            render_to(os.path.join(out, f), p['objects'], all_objs)
            entry = {'name': p['name'], 'file': f, 'anim': p.get('anim', 'none')}
            for k in ('amp', 'period'):
                if k in p:
                    entry[k] = p[k]
            if p.get('pivot') is not None:
                entry['pivot'] = to_px(p['pivot'])
            cols[0].append(os.path.join(out, f))
            if p.get('pose'):
                entry['frames'] = []
                for which, tag in ((0, 'A'), (1, 'B')):
                    ff = f'{name}.{tag}.png'
                    with Posed(p, which):
                        render_to(os.path.join(out, ff), p['objects'], all_objs)
                    entry['frames'].append(ff)
                    cols[1 + which].append(os.path.join(out, ff))
            else:
                cols[1].append(os.path.join(out, f))
                cols[2].append(os.path.join(out, f))
            meta['parts'].append(entry)
        write_json(out, mid, meta)
        write_review(review, mid, cols if any(p.get('pose') for p in parts) else cols[:1])
    return f'{w}x{h}'


def render_plant(mid, build, sets):
    scene = common.reset_scene()
    pl = build()
    (pl.get('lights') or common.creature_lights)(scene)
    objs = pl['objects']
    x0, x1, z0, z1 = world_bounds(objs)
    m = MARGIN_PX / common.PX_PER_UNIT
    half = max(abs(x0), abs(x1)) + m
    w = ceil_to(2 * half * common.PX_PER_UNIT, 2 * CELL)
    h = ceil_to((z1 + m) * common.PX_PER_UNIT, CELL)
    common.ortho_camera(scene, 0.0, h / 2 / common.PX_PER_UNIT, w / common.PX_PER_UNIT, w, h, SUPERSAMPLE)
    f = f'{mid}.png'
    for out, review in each_set(scene, sets, 2.4):
        render_to(os.path.join(out, f), objs, objs)
        write_json(out, mid, {'id': mid, 'kind': 'plant', 'file': f, 'w': w, 'h': h, 'supersample': SUPERSAMPLE,
                              'segments': pl['segments'], 'sway': pl['sway']})
        write_review(review, mid, [[os.path.join(out, f)]])
    return f'{w}x{h}'


def render_sprites(mid, build, sets):
    scene = common.reset_scene()
    sp = build()
    (sp.get('lights') or common.creature_lights)(scene)
    all_objs = [o for s in sp['sprites'] for o in s['objects']]
    frames = []
    for s in sp['sprites']:
        x0, x1, z0, z1 = world_bounds(s['objects'])
        m = 2 / common.PX_PER_UNIT
        w = ceil_to((x1 - x0 + 2 * m) * common.PX_PER_UNIT, CELL)
        h = ceil_to((z1 - z0 + 2 * m) * common.PX_PER_UNIT, CELL)
        frames.append((s, w, h, (x0 + x1) / 2, (z0 + z1) / 2))
    for out, review in each_set(scene, sets, 2.4):
        entries = []
        for s, w, h, cx, cz in frames:
            common.ortho_camera(scene, cx, cz, w / common.PX_PER_UNIT, w, h, SUPERSAMPLE)
            f = f"{s['name']}.png"
            render_to(os.path.join(out, f), s['objects'], all_objs)
            entries.append({'name': s['name'], 'file': f, 'w': w, 'h': h})
            write_review(review, s['name'], [[os.path.join(out, f)]])
        write_json(out, mid, {'id': mid, 'kind': 'sprites', 'supersample': SUPERSAMPLE, 'sprites': entries})
    return f'{len(frames)} sprites'


def render_backdrop(mid, build, sets):
    scene = common.reset_scene()
    b = build(scene)
    if OPTS['crop'] < 1.0:
        r = scene.render
        r.use_border, r.use_crop_to_border = True, True
        r.border_min_x, r.border_max_x, r.border_min_y, r.border_max_y = 0.0, OPTS['crop'], 0.0, 1.0
    f = f'{mid}.png'
    # The water is the same in every set (the cel set's haze is matched to it).
    for out, review in each_set(scene, sets, 1.2, convert=b['layer'] != 'water'):
        scene.render.filepath = os.path.join(out, f)
        bpy.ops.render.render(write_still=True)
        meta = {'id': mid, 'kind': 'backdrop', 'layer': b['layer'], 'file': f, 'w': b['w'], 'h': b['h'],
                'supersample': 1}
        write_json(out, mid, meta)
        write_review(review, mid, [[os.path.join(out, f)]])
    return f"{b['w']}x{b['h']}"


def write_json(out, mid, meta):
    with open(os.path.join(out, f'{mid}.json'), 'w') as fh:
        json.dump(meta, fh, indent=2)
        fh.write('\n')


KINDS = [('CREATURES', render_creature), ('PLANTS', render_plant), ('SPRITES', render_sprites),
         ('BACKDROPS', render_backdrop)]


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser(prog='render.py')
    ap.add_argument('ids', nargs='*')
    ap.add_argument('--samples', type=int, default=96)
    ap.add_argument('--threads', type=int, default=0)
    ap.add_argument('--out', default=os.path.join(HERE, 'renders'))
    ap.add_argument('--review', default='')
    ap.add_argument('--view', default='Khronos PBR Neutral', help="color view: 'Khronos PBR Neutral', AgX, 'AgX - Punchy'")
    ap.add_argument('--sets', default='photo,toon',
                    help='which render sets: photo (realistic, --out) and/or toon (cel-shaded, --out + "-toon")')
    ap.add_argument('--crop', type=float, default=1.0)
    a = ap.parse_args(argv)
    OPTS['crop'] = a.crop
    common.SETTINGS['samples'] = a.samples
    common.SETTINGS['threads'] = a.threads
    common.SETTINGS['view'] = a.view
    out = os.path.abspath(a.out)
    review = os.path.abspath(a.review) if a.review else ''
    sets = []
    for name in ('photo', 'toon'):
        if name not in a.sets.split(','):
            continue
        o = out if name == 'photo' else out + '-toon'
        r = (review if name == 'photo' else os.path.join(review, 'toon')) if review else ''
        os.makedirs(o, exist_ok=True)
        if r:
            os.makedirs(r, exist_ok=True)
        sets.append({'name': name, 'out': o, 'review': r})
    if not sets:
        sys.exit('--sets must name photo and/or toon')

    jobs = []
    for modname in MODULES:
        if not os.path.exists(os.path.join(HERE, f'{modname}.py')):
            continue
        mod = importlib.import_module(modname)
        for attr, fn in KINDS:
            for mid, build in getattr(mod, attr, {}).items():
                if not a.ids or mid in a.ids or modname in a.ids:
                    jobs.append((mid, build, fn))
    if not jobs:
        sys.exit(f'nothing matches {a.ids}')
    failed = []
    for mid, build, fn in jobs:
        t0 = time.time()
        try:
            info = fn(mid, build, sets)
            print(f'MODEL {mid}: {info} in {time.time() - t0:.0f}s', flush=True)
        except Exception as e:  # keep going; report at the end
            import traceback
            traceback.print_exc()
            failed.append(mid)
            print(f'MODEL {mid}: FAILED {e}', flush=True)
    if failed:
        sys.exit(f'failed: {", ".join(failed)}')


main()
