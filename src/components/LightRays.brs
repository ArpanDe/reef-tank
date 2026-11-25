' Three soft light shafts. One Animation moves all of them: each ray's
' brightness breathes twice per loop and it swings once, each at its own phase.
' Rays are big semi-transparent quads, the costliest thing per frame on a Roku
' (measured with fps_display on a Roku Ultra: 4 full-size rays cost ~6 fps), so
' they're drawn smaller than the art (RAY_W x RAY_H) and there are only three.
sub onConfig()
    ray = m.top.config.ray
    m.posters = []
    if ray = invalid then return
    rayW = 240 ' keep in step with RAY_DRAWN in scripts/render-art.mjs
    rayH = 820
    anim = newLoop(m.top, 24.0)
    xs = [380, 1000, 1600]
    for i = 0 to xs.Count() - 1
        poster = m.top.createChild("Poster")
        poster.id = "ray" + i.ToStr()
        poster.uri = ray.uri
        poster.width = rayW
        poster.height = rayH
        poster.translation = [xs[i] + rand(-60, 60) - rayW / 2, -30]
        poster.scaleRotateCenter = [rayW / 2, 0]
        poster.blendColor = m.top.tint
        m.posters.Push(poster)
        addInterp(anim, poster.id + ".opacity", "float", invalid, sineCycles(0.15, 0.08, 2, Rnd(0)))
        addInterp(anim, poster.id + ".rotation", "float", invalid, sineCycles(rand(-0.12, 0.12), 0.04, 1, Rnd(0)))
    end for
    anim.control = "start"
end sub

sub onTint()
    if m.posters = invalid then return
    for each poster in m.posters
        poster.blendColor = m.top.tint
    end for
end sub
