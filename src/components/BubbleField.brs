sub onConfig()
    cfg = m.top.config
    m.textures = cfg.bubbles
    if m.textures = invalid or m.textures.Count() = 0 then return
    m.floorY = cfg.floorY
    m.vents = cfg.vents
    m.tileW = cfg.tileW
    m.speed = cfg.speed
    ' Started at the same moment as the scroll animation, so elapsed time tells
    ' us how far the floor (and its vents) has moved.
    m.clock = CreateObject("roTimespan")
    m.items = []
    m.indexByAnim = {}
    m.pending = []
    m.relaunchTimer = m.top.findNode("relaunchTimer")
    m.relaunchTimer.observeField("fire", "relaunchPending")
    m.relaunchTimer.control = "start"
    for i = 0 to 25
        poster = m.top.createChild("Poster")
        poster.id = "b" + i.ToStr()
        poster.translation = [-200, 2000]
        anim = m.top.createChild("Animation")
        anim.id = "ba" + i.ToStr()
        anim.easeFunction = "linear"
        interp = anim.createChild("Vector2DFieldInterpolator")
        interp.fieldToInterp = poster.id + ".translation"
        anim.observeField("state", "onBubbleState")
        vent = -1
        if i < 18 then vent = i mod 2
        m.items.Push({ poster: poster, anim: anim, interp: interp, vent: vent })
        m.indexByAnim[anim.id] = i
        launch(i, rand(0, 10))
    end for
end sub

' Screen x of a vent at `t` seconds, picking the tile copy nearest the screen.
function ventScreenX(vent as integer, t as float) as float
    travelled = t * m.speed
    x = m.vents[vent] - (travelled - Int(travelled / m.tileW) * m.tileW)
    if x < -300 then x += m.tileW
    return x
end function

sub launch(i as integer, delay as float)
    item = m.items[i]
    ' Mostly small bubbles, some medium, few large.
    r = Rnd(0)
    tex = m.textures[0]
    if r > 0.85
        tex = m.textures[m.textures.Count() - 1]
    else if r > 0.5 and m.textures.Count() > 1
        tex = m.textures[1]
    end if
    if item.vent >= 0
        x = ventScreenX(item.vent, m.clock.TotalMilliseconds() / 1000 + delay) + rand(-8, 8)
    else
        x = rand(80, 1840 + m.speed * 8)
    end if
    y0 = m.floorY + rand(-20, 20)
    y1 = -tex.h - 10
    duration = (y0 - y1) / (rand(80, 130) + tex.w * 1.5)
    drift = m.speed * duration
    wobble = rand(4, 12)
    waves = rand(2, 4)
    phase = rand(0, 6.28)
    values = []
    n = 12
    for k = 0 to n
        t = k / n
        ' Linear in x so the bubble keeps pace with the scrolling floor; it
        ' speeds up a little as it rises.
        rise = 0.4 * t + 0.6 * t * t
        values.Push([x - drift * t + wobble * Sin(phase + t * waves * 6.2831853) - tex.w / 2, y0 + (y1 - y0) * rise])
    end for
    item.poster.uri = tex.uri
    item.poster.width = tex.w
    item.poster.height = tex.h
    item.interp.key = evenKeys(n + 1)
    item.interp.keyValue = values
    item.anim.duration = duration
    item.anim.delay = delay
    item.anim.control = "start"
end sub

' Finished bubbles are queued and relaunched from a Timer, never restarted
' inside their own "stopped" callback: brs-engine notifies observers inside
' stop() and then unschedules the animation, so a restart made here would be
' left "running" but never advance.
sub onBubbleState(event as object)
    anim = event.getRoSGNode()
    if anim.state <> "stopped" then return
    m.pending.Push(m.indexByAnim[anim.id])
end sub

sub relaunchPending()
    if m.pending.Count() = 0 then return
    queued = m.pending
    m.pending = []
    for each i in queued
        if m.items[i].vent >= 0
            launch(i, rand(0, 1.5))
        else
            launch(i, rand(1, 9))
        end if
    end for
end sub
