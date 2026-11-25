"""Loose sprites (see render.py, SPRITES): the rising air bubbles.

An air bubble in water is almost invisible in the middle: what you see is its silvery rim (light
reflected at grazing angles), a bright specular highlight from the sun above, and a fainter glint
on the opposite side (the same highlight off the inside of the back surface). The film is
transparent, so the look is built from alpha: an emission shader mixed with a transparent one, the
mix driven by a Fresnel-like facing term and the highlights. Nothing here depends on the scene
lights.

Sizes: bubble-s/m/l are about 14, 22 and 34 px across at final size (1 unit = 100 px).
"""

import math

import bpy
from mathutils import Vector

from common import assign, new_material, sock

BUBBLES = [
    # name, diameter (units), vertical squash, rim/fill weight (small bubbles read more solid)
    ('bubble-s', 0.14, 1.0, 1.0),
    ('bubble-m', 0.22, 0.97, 0.8),
    ('bubble-l', 0.34, 0.93, 0.65),
]

# Direction (world space; -Y faces the viewer) the sun glint faces: upper left.
KEY = Vector((-0.42, -0.7, 0.58)).normalized()


class G:
    def __init__(self, name):
        self.mat, self.n = new_material(name)

    def put(self, socket, v):
        if isinstance(v, bpy.types.NodeSocket):
            self.n.link(v, socket)
        else:
            socket.default_value = v

    def math(self, op, a, b=None, clamp=False):
        nd = self.n.new('ShaderNodeMath', _operation=op)
        nd.use_clamp = clamp
        self.put(nd.inputs[0], a)
        if b is not None:
            self.put(nd.inputs[1], b)
        return nd.outputs[0]

    def remap(self, v, f0, f1, t0=0.0, t1=1.0, smooth=True):
        nd = self.n.new('ShaderNodeMapRange', **{'From Min': f0, 'From Max': f1, 'To Min': t0, 'To Max': t1})
        nd.clamp = True
        if smooth:
            nd.interpolation_type = 'SMOOTHSTEP'
        self.put(sock(nd.inputs, 'Value'), v)
        return sock(nd.outputs, 'Result')

    def dot(self, vec, direction):
        nd = self.n.new('ShaderNodeVectorMath', _operation='DOT_PRODUCT')
        self.put(nd.inputs[0], vec)
        nd.inputs[1].default_value = tuple(direction)
        return sock(nd.outputs, 'Value')

    def mix_color(self, fac, a, b):
        nd = self.n.new('ShaderNodeMix', _data_type='RGBA')
        self.put(sock(nd.inputs, 'Factor'), fac)
        self.put(sock(nd.inputs, 'A'), a)
        self.put(sock(nd.inputs, 'B'), b)
        return sock(nd.outputs, 'Result')


def bubble_material(name, weight):
    g = G(name)
    n = g.n
    lw = n.new('ShaderNodeLayerWeight', Blend=0.5)
    facing = sock(lw.outputs, 'Facing')  # 0 where the surface faces the viewer, 1 at the outline
    geo = n.new('ShaderNodeNewGeometry')
    nrm = sock(geo.outputs, 'Normal')

    # Rim: rises steeply toward the outline (a thin bright ring), brighter at the bottom where the
    # bubble gathers light from above; a faint body tint so the middle isn't a hole.
    rim = g.math('POWER', g.remap(facing, 0.18, 0.86, 0.0, 1.0), 1.4)
    below = g.remap(g.dot(nrm, (0, 0, -1)), -0.3, 0.9, 0.75, 1.25)
    rim = g.math('MULTIPLY', rim, below)
    body = 0.05 + 0.07 * weight
    fill = g.math('ADD', g.math('MULTIPLY', rim, 0.55 + 0.35 * weight), body)

    # Highlights: a small sharp sun glint on the front surface; seen through the bubble, the same
    # glint off the inside of the back surface shows lower right, smaller and dimmer.
    back = sock(geo.outputs, 'Backfacing')
    d = g.math('SUBTRACT', g.dot(nrm, KEY), g.math('MULTIPLY', back, 0.012))
    spots = g.math('MULTIPLY', g.remap(d, 0.962, 0.99), g.math('SUBTRACT', 1.0, g.math('MULTIPLY', back, 0.4)))
    alpha = g.math('MINIMUM', g.math('ADD', fill, spots), 1.0)

    # Color: pale aqua rim, white highlights pushed past 1 so they bloom to white.
    rim_col = (0.62, 0.86, 1.0, 1.0)
    col = g.mix_color(spots, rim_col, (1.0, 1.0, 1.0, 1.0))
    em = n.new('ShaderNodeEmission')
    g.put(sock(em.inputs, 'Color'), col)
    g.put(sock(em.inputs, 'Strength'), g.math('ADD', 1.1, g.math('MULTIPLY', spots, 2.5)))
    clear = n.new('ShaderNodeBsdfTransparent')
    mix = n.new('ShaderNodeMixShader')
    g.put(mix.inputs[0], alpha)
    n.link(sock(clear.outputs, 'BSDF'), mix.inputs[1])
    n.link(sock(em.outputs, 'Emission'), mix.inputs[2])
    out = n.new('ShaderNodeOutputMaterial')
    n.link(mix.outputs[0], sock(out.inputs, 'Surface'))
    return g.mat


def build_bubbles():
    sprites = []
    for i, (name, d, squash, weight) in enumerate(BUBBLES):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=d / 2, location=(i * 1.0, 0, 0))
        o = bpy.context.object
        o.name = name
        o.scale = (1.0, 1.0, squash)
        bpy.ops.object.shade_smooth()
        assign(o, bubble_material(name, weight))
        sprites.append({'name': name, 'objects': [o]})
    return {'sprites': sprites}


SPRITES = {'bubbles': build_bubbles}
