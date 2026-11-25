sub onConfig()
    cfg = m.top.config
    plant = cfg.plant
    segments = plant.segments
    n = segments.Count()
    period = rand(4.5, 7.5)
    if cfg.period <> invalid then period = cfg.period
    phase = Rnd(0)
    if cfg.phase <> invalid then phase = cfg.phase
    parent = m.top
    prevH = 0
    for i = 0 to n - 1
        seg = segments[i]
        joint = parent.createChild("Group")
        joint.id = cfg.uid + "j" + i.ToStr()
        if i = 0
            joint.translation = [cfg.x, cfg.baseY]
        else
            joint.translation = [0, -(prevH - plant.overlap)]
        end if
        poster = joint.createChild("Poster")
        poster.uri = seg.uri
        poster.width = seg.w
        poster.height = seg.h
        poster.translation = [-seg.w / 2, -seg.h]
        ' Upper segments bend more; each lags a little behind the one below it.
        amp = plant.sway * (0.5 + 0.5 * i / (n - 1 + 0.0001))
        addLoop(m.top, joint.id + ".rotation", "float", sineValues(0, amp, 13, phase - i * 0.07), period)
        prevH = seg.h
        parent = joint
    end for
end sub
