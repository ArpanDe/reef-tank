"""Cel shading: renders the same models as flat-shaded, outlined cartoons (EEVEE + Freestyle).

render.py calls apply(scene) after a model and its lights are built, when run with --toon. Every
Principled BSDF becomes: its own base color x a few flat light bands (from a white diffuse probe
through Shader to RGB, so cast shadows band too), as emission. Alpha, the reef's water haze and
everything else in the material are kept. Freestyle draws the outlines.
"""

import bpy

from common import Nodes, sock

# Light level (white diffuse, after INPUT_SCALE) -> brightness of the band.
BANDS = [(0.0, 0.5), (0.2, 0.78), (0.55, 1.0)]
INPUT_SCALE = 0.5
LINE_COLOR = (0.05, 0.04, 0.07)


def _src(inp):
    return inp.links[0].from_socket if inp.is_linked else None


def _toon_color(n, base_src, base_val, normal_src):
    probe = n.new('ShaderNodeBsdfDiffuse')
    sock(probe.inputs, 'Color').default_value = (1, 1, 1, 1)
    if normal_src is not None:
        n.link(normal_src, sock(probe.inputs, 'Normal'))
    s2r = n.new('ShaderNodeShaderToRGB')
    n.link(sock(probe.outputs, 'BSDF'), sock(s2r.inputs, 'Shader'))
    bw = n.new('ShaderNodeRGBToBW')
    n.link(sock(s2r.outputs, 'Color'), sock(bw.inputs, 'Color'))
    scale = n.new('ShaderNodeMath', _operation='MULTIPLY')
    n.link(sock(bw.outputs, 'Val'), scale.inputs[0])
    scale.inputs[1].default_value = INPUT_SCALE
    ramp = n.new('ShaderNodeValToRGB')
    cr = ramp.color_ramp
    cr.interpolation = 'CONSTANT'
    cr.elements[0].position = BANDS[0][0]
    cr.elements[0].color = (BANDS[0][1],) * 3 + (1,)
    cr.elements[1].position = BANDS[-1][0]
    cr.elements[1].color = (BANDS[-1][1],) * 3 + (1,)
    for pos, v in BANDS[1:-1]:
        el = cr.elements.new(pos)
        el.color = (v, v, v, 1)
    n.link(sock(scale.outputs, 'Value'), sock(ramp.inputs, 'Fac'))
    mul = n.new('ShaderNodeMix', _data_type='RGBA', _blend_type='MULTIPLY', Factor=1.0)
    if base_src is not None:
        n.link(base_src, sock(mul.inputs, 'A'))
    else:
        sock(mul.inputs, 'A').default_value = base_val
    n.link(sock(ramp.outputs, 'Color'), sock(mul.inputs, 'B'))
    return sock(mul.outputs, 'Result')


def ink_color(mat, base_in, alpha_in):
    """Line color for this material (Freestyle reads it through a Material color modifier): a dark
    shade of a flat base color, so thin things (legs, antennae) don't turn into black strings; a pale,
    half-transparent line in its own color for see-through parts (jellyfish); plain ink when the
    color comes from a texture."""
    see_through = alpha_in.is_linked or alpha_in.default_value < 0.98
    if base_in.is_linked:
        mat.line_color = (*LINE_COLOR, 1.0)
    elif see_through:
        c = base_in.default_value
        mat.line_color = (c[0] * 0.9, c[1] * 0.9, c[2] * 0.9, 0.45)
    else:
        c = base_in.default_value
        mat.line_color = (c[0] * 0.3, c[1] * 0.3, c[2] * 0.3, 1.0)
    return see_through


def convert_material(mat):
    tree = mat.node_tree
    n = Nodes(tree)
    see_through = False
    mat.line_color = (*LINE_COLOR, 1.0)
    for p in [x for x in tree.nodes if x.bl_idname == 'ShaderNodeBsdfPrincipled']:
        base_in, alpha_in, normal_in = sock(p.inputs, 'Base Color'), sock(p.inputs, 'Alpha'), sock(p.inputs, 'Normal')
        see_through = ink_color(mat, base_in, alpha_in) or see_through
        # Drop fine bump detail from the bands; keep only big shapes.
        color = _toon_color(n, _src(base_in), tuple(base_in.default_value), None)
        em = n.new('ShaderNodeEmission', Strength=1.0)
        n.link(color, sock(em.inputs, 'Color'))
        out = sock(em.outputs, 'Emission')
        if alpha_in.is_linked or alpha_in.default_value < 1.0:
            see = n.new('ShaderNodeMixShader')
            if alpha_in.is_linked:
                n.link(_src(alpha_in), see.inputs[0])
            else:
                see.inputs[0].default_value = alpha_in.default_value
            n.link(sock(n.new('ShaderNodeBsdfTransparent').outputs, 'BSDF'), see.inputs[1])
            n.link(out, see.inputs[2])
            out = sock(see.outputs, 'Shader')
        for link in list(sock(p.outputs, 'BSDF').links):
            tree.links.new(out, link.to_socket)
        tree.nodes.remove(p)
    # Translucent fin glow becomes flat color too.
    for t in [x for x in tree.nodes if x.bl_idname == 'ShaderNodeBsdfTranslucent']:
        em = n.new('ShaderNodeEmission', Strength=0.8)
        c = sock(t.inputs, 'Color')
        if c.is_linked:
            n.link(_src(c), sock(em.inputs, 'Color'))
        else:
            sock(em.inputs, 'Color').default_value = tuple(c.default_value)
        for link in list(sock(t.outputs, 'BSDF').links):
            tree.links.new(sock(em.outputs, 'Emission'), link.to_socket)
        tree.nodes.remove(t)
    # Custom see-through shaders (the jellyfish: glow + transparency, no Principled BSDF) stay as
    # they are, but get a pale line in their own color.
    kinds = {x.bl_idname for x in tree.nodes}
    if 'ShaderNodeBsdfTransparent' in kinds and not see_through:
        see_through = True
        rgb = [x for x in tree.nodes if x.bl_idname == 'ShaderNodeRGB']
        c = sock(rgb[0].outputs, 'Color').default_value if rgb else (0.8, 0.8, 0.9, 1)
        mat.line_color = (c[0] * 0.9, c[1] * 0.9, c[2] * 0.9, 0.45)
    # Blended transparency is smooth; dithered left see-through parts grainy.
    mat.surface_render_method = 'BLENDED' if see_through else 'DITHERED'


def apply(scene, line_px=2.4):
    scene.render.engine = 'BLENDER_EEVEE'
    scene.eevee.taa_render_samples = 32
    vs = scene.view_settings
    vs.view_transform = 'Standard'
    vs.look = 'None'
    for mat in bpy.data.materials:
        if mat.node_tree is not None and mat.name != 'water':
            convert_material(mat)
    scene.render.use_freestyle = True
    scene.render.line_thickness_mode = 'ABSOLUTE'
    scene.render.line_thickness = 1.0
    vl = scene.view_layers[0]
    vl.use_freestyle = True
    fs = vl.freestyle_settings
    ls = fs.linesets[0] if len(fs.linesets) else fs.linesets.new('lines')
    ls.select_by_visibility = True
    ls.select_by_edge_types = True
    ls.select_silhouette = True
    ls.select_border = True
    ls.select_crease = False
    ls.select_external_contour = True
    if ls.linestyle is None:
        ls.linestyle = bpy.data.linestyles.new('ink')
    style = ls.linestyle
    style.color = LINE_COLOR
    style.thickness = line_px
    if not any(m.type == 'MATERIAL' for m in style.color_modifiers):
        cm = style.color_modifiers.new('material', 'MATERIAL')
        cm.material_attribute = 'LINE'
        am = style.alpha_modifiers.new('material', 'MATERIAL')
        am.material_attribute = 'LINE_A'
