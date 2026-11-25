' Four soft light shafts. One Animation moves all of them: each ray's
' brightness breathes twice per loop and it swings once, each at its own phase.
sub onConfig()
    ray = m.top.config.ray
    m.posters = []
    if ray = invalid then return
    anim = newLoop(m.top, 24.0)
    xs = [260, 700, 1180, 1620]
    for i = 0 to xs.Count() - 1
        poster = m.top.createChild("Poster")
        poster.id = "ray" + i.ToStr()
        poster.uri = ray.uri
        poster.width = ray.w
        poster.height = ray.h
        poster.translation = [xs[i] + rand(-60, 60) - ray.w / 2, -30]
        poster.scaleRotateCenter = [ray.w / 2, 0]
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
