' Each bubble repeats one rise forever. Bubbles on the same Animation start
' at different points in the cycle (phase), so they don't rise together, and
' the three cycle lengths differ, so the overall pattern takes minutes to repeat.
sub onConfig()
    cfg = m.top.config
    textures = cfg.bubbles
    if textures = invalid or textures.Count() = 0 then return
    periods = [7.0, 9.5, 12.0]
    count = 0
    for each period in periods
        anim = newLoop(m.top, period)
        for i = 0 to 3
            ' Mostly small bubbles, some medium, few large.
            r = Rnd(0)
            tex = textures[0]
            if r > 0.85
                tex = textures[textures.Count() - 1]
            else if r > 0.5 and textures.Count() > 1
                tex = textures[1]
            end if
            poster = m.top.createChild("Poster")
            poster.id = "b" + count.ToStr()
            poster.uri = tex.uri
            poster.width = tex.w
            poster.height = tex.h
            path = risePath(tex, cfg.floorY, cfg.speed * period, rand(80, 1840 + cfg.speed * period), Rnd(0))
            addInterp(anim, poster.id + ".translation", "vector2d", path.keys, path.values)
            count += 1
        end for
        anim.control = "start"
    end for
end sub

' One rise from floorY to above the screen, drifting `drift` px left with a
' wobble, as keys/values starting `phase` (0..1) of the way up. The jump from
' the top back to the bottom happens off screen at the top and behind the
' bubble's appearance point at the bottom.
function risePath(tex as object, floorY as float, drift as float, x0 as float, phase as float) as object
    wobble = rand(4, 12)
    waves = rand(2, 4)
    wphase = rand(0, 6.28)
    top = -tex.h - 10
    n = 12
    keys = []
    values = []
    ' From `phase` up to the top...
    for k = 0 to n
        u = phase + (1 - phase) * k / n
        keys.Push((u - phase))
        values.Push(bubbleAt(u, tex, floorY, top, drift, x0, wobble, waves, wphase))
    end for
    ' ...then from the bottom up to `phase`, if there's any of the cycle left.
    if phase > 0.01
        for k = 0 to n
            u = phase * k / n
            t = (1 - phase) + u
            if k = 0 then t = t + 0.0001
            keys.Push(t)
            values.Push(bubbleAt(u, tex, floorY, top, drift, x0, wobble, waves, wphase))
        end for
    end if
    keys[keys.Count() - 1] = 1.0
    return { keys: keys, values: values }
end function

function bubbleAt(u as float, tex as object, floorY as float, top as float, drift as float, x0 as float, wobble as float, waves as float, wphase as float) as object
    rise = 0.4 * u + 0.6 * u * u ' speeds up a little as it rises
    x = x0 - drift * u + wobble * Sin(wphase + u * waves * 6.2831853) - tex.w / 2
    return [x, floorY + (top - floorY) * rise]
end function
