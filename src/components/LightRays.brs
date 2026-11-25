sub onConfig()
    ray = m.top.config.ray
    m.posters = []
    if ray = invalid then return
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
        ' Brightness breathes slowly; the shaft swings a few degrees.
        addLoop(m.top, poster.id + ".opacity", "float", sineValues(0.15, 0.08, 13, Rnd(0)), rand(9, 16))
        addLoop(m.top, poster.id + ".rotation", "float", sineValues(rand(-0.12, 0.12), 0.04, 13, Rnd(0)), rand(20, 34))
    end for
end sub

sub onTint()
    if m.posters = invalid then return
    for each poster in m.posters
        poster.blendColor = m.top.tint
    end for
end sub
