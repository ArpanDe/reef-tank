' Motion runs entirely in Animation nodes on the render thread. This script
' only picks the next destination when an animation finishes.
'
' Coordinates: m.pos is the creature's visual center on screen. This node
' scales around the sprite center, so translation = center - size/2 at any
' depth scale, and scale.x = -1 mirrors the sprite to face left.

sub init()
    m.moveAnim = m.top.findNode("moveAnim")
    m.moveInterp = m.top.findNode("moveInterp")
    m.turnAnim = m.top.findNode("turnAnim")
    m.turnInterp = m.top.findNode("turnInterp")
    m.pauseTimer = m.top.findNode("pauseTimer")
    m.moveAnim.observeField("state", "onMoveState")
    m.turnAnim.observeField("state", "onTurnState")
    m.pauseTimer.observeField("fire", "nextMove")
    m.top.observeField("config", "onConfig")
    m.facing = 1
    m.moving = false
    m.turning = false
    m.partCount = 0
end sub

sub onConfig()
    cfg = m.top.config
    m.spec = cfg.spec
    m.uid = cfg.uid
    m.s = cfg.depthScale
    m.bounds = cfg.bounds
    m.mode = m.spec.motion
    m.isVisitor = (m.mode = "cross" or m.mode = "rise")
    m.w = m.spec.w
    m.h = m.spec.h
    m.top.id = m.uid
    m.top.scaleRotateCenter = [m.w / 2, m.h / 2]
    m.moveInterp.fieldToInterp = m.uid + ".translation"
    m.turnInterp.fieldToInterp = m.uid + ".scale"
    if cfg.opacity <> invalid then m.top.opacity = cfg.opacity

    school = 0
    if cfg.schoolSize <> invalid then school = cfg.schoolSize
    if school > 1
        for i = 0 to school - 1
            member = m.top.createChild("Group")
            member.id = m.uid + "m" + i.ToStr()
            offset = [rand(-1.4, 1.4) * m.w, rand(-1.6, 1.6) * m.h]
            member.translation = offset
            buildParts(member, cfg.tint)
            ' Each member wanders a little inside the formation.
            wobble = []
            ax = rand(0.1, 0.25) * m.w
            ay = rand(0.15, 0.35) * m.h
            phase = rand(0, 6.28)
            for k = 0 to 8
                a = 6.2831853 * k / 8 + phase
                wobble.Push([offset[0] + ax * Sin(a), offset[1] + ay * Sin(2 * a)])
            end for
            addLoop(m.top, member.id + ".translation", "vector2d", wobble, rand(2.5, 4.5))
        end for
    else
        buildParts(m.top, cfg.tint)
    end if

    if m.isVisitor
        startVisit()
    else if m.mode = "crawl"
        startCrawling(cfg)
    else
        m.pos = [rand(m.bounds[0], m.bounds[2]), rand(m.bounds[1], m.bounds[3])]
        if Rnd(0) < 0.5 then m.facing = -1
        m.top.scale = [m.facing * m.s, m.s]
        m.top.translation = [m.pos[0] - m.w / 2, m.pos[1] - m.h / 2]
        nextMove()
    end if
end sub

' Adds the sprite's part posters to parent and starts their loops.
sub buildParts(parent as object, tint as string)
    frameAnim = invalid
    flip = frameFlip(rand(0.05, 0.45))
    for each part in m.spec.parts
        poster = parent.createChild("Poster")
        m.partCount += 1
        poster.id = m.uid + "p" + m.partCount.ToStr()
        poster.uri = part.uri
        poster.width = part.w
        poster.height = part.h
        poster.blendColor = tint
        kind = part.anim
        if kind = "wag"
            amp = 0.3
            if part.amp <> invalid then amp = part.amp
            poster.scaleRotateCenter = part.pivot
            addLoop(m.top, poster.id + ".rotation", "float", sineValues(0, amp, 13, Rnd(0)), partPeriod(part, 0.7, 1.1, 1.8, 2.6))
        else if kind = "pulse"
            amp = 0.08
            if part.amp <> invalid then amp = part.amp
            poster.scaleRotateCenter = part.pivot
            values = []
            for each v in sineValues(0, amp, 13, Rnd(0))
                values.Push([1 + v, 1 - v])
            end for
            addLoop(m.top, poster.id + ".scale", "vector2d", values, partPeriod(part, 2.0, 2.8, 2.0, 2.8))
        else if kind = "frameA" or kind = "frameB"
            ' Both frames share one Animation so they never show together.
            if frameAnim = invalid then frameAnim = newLoop(m.top, partPeriod(part, 0.45, 0.6, 1.0, 1.4))
            if kind = "frameA" then values = flip.a else values = flip.b
            poster.opacity = values[0]
            addInterp(frameAnim, poster.id + ".opacity", "float", flip.keys, values)
        end if
    end for
    if frameAnim <> invalid then frameAnim.control = "start"
end sub

function partPeriod(part as object, fishLo as float, fishHi as float, visitorLo as float, visitorHi as float) as float
    if part.period <> invalid then return part.period
    if m.isVisitor then return rand(visitorLo, visitorHi)
    return rand(fishLo, fishHi)
end function

sub nextMove()
    target = pickTarget()
    dx = target[0] - m.pos[0]
    dir = m.facing
    if dx > 30
        dir = 1
    else if dx < -30
        dir = -1
    end if
    m.pending = target
    if dir <> m.facing
        m.turnInterp.keyValue = [[m.facing * m.s, m.s], [dir * m.s, m.s]]
        m.facing = dir
        m.turning = true
        m.turnAnim.control = "start"
    else
        startMove(target, travelTime(target))
    end if
end sub

function pickTarget() as object
    b = m.bounds
    r = Rnd(0)
    if m.mode = "drift"
        return [clamp(m.pos[0] + rand(-180, 180), b[0], b[2]), rand(b[1], b[3])]
    else if r < 0.08
        ' Now and then, swim out of view and come back later.
        x = -m.w * m.s
        if Rnd(0) < 0.5 then x = 1920 + m.w * m.s
        return [x, rand(b[1], b[3])]
    else if r < 0.35
        return [clamp(m.pos[0] + rand(-240, 240), b[0], b[2]), clamp(m.pos[1] + rand(-90, 90), b[1], b[3])]
    end if
    return [rand(b[0], b[2]), rand(b[1], b[3])]
end function

function travelTime(target as object) as float
    ' Far fish look slower; everything slows at night (m.global.speedScale).
    speed = rand(m.spec.speed[0], m.spec.speed[1]) * m.s * m.global.speedScale
    if speed < 4 then speed = 4
    dx = target[0] - m.pos[0]
    dy = target[1] - m.pos[1]
    t = Sqr(dx * dx + dy * dy) / speed
    if t < 1.5 then t = 1.5
    return t
end function

' Swims from m.pos to target in `duration` seconds along a gently bobbing path.
sub startMove(target as object, duration as float)
    dx = target[0] - m.pos[0]
    dy = target[1] - m.pos[1]
    dist = Sqr(dx * dx + dy * dy)
    bob = rand(6, 22) * m.s
    waves = 1 + Int(dist / 500)
    values = []
    n = 12
    for i = 0 to n
        t = i / n
        values.Push([m.pos[0] + dx * t - m.w / 2, m.pos[1] + dy * t + bob * Sin(t * 3.1415927 * waves) - m.h / 2])
    end for
    m.moveInterp.key = evenKeys(n + 1)
    m.moveInterp.keyValue = values
    m.moveAnim.duration = duration
    m.pos = target
    m.moving = true
    m.moveAnim.control = "start"
end sub

sub onTurnState()
    if m.turnAnim.state = "stopped" and m.turning
        m.turning = false
        startMove(m.pending, travelTime(m.pending))
    end if
end sub

sub onMoveState()
    if m.mode = "crawl" then return ' critters use onCrawlState
    if m.moveAnim.state <> "stopped" or not m.moving then return
    m.moving = false
    if m.isVisitor
        m.top.finished = true
        return
    end if
    ' Always continue through the timer, never by restarting moveAnim from
    ' inside its own "stopped" callback: brs-engine notifies observers inside
    ' stop() and then unschedules the animation, so a restart made here is
    ' left "running" but never advances (the fish freezes).
    pause = 0.05
    if Rnd(0) < 0.35 then pause = rand(0.6, 3.0) ' hover for a moment
    m.pauseTimer.duration = pause
    m.pauseTimer.control = "start"
end sub

' Visitors make one slow pass: across the tank (cross) or up through it (rise).
sub startVisit()
    b = m.bounds
    halfW = m.w * m.s / 2 + 20
    halfH = m.h * m.s / 2 + 20
    if m.mode = "rise"
        x0 = rand(b[0], b[2])
        start = [x0, 1080 + halfH]
        target = [clamp(x0 + rand(-250, 250), b[0], b[2]), -halfH]
    else
        y0 = rand(b[1], b[3])
        y1 = clamp(y0 + rand(-120, 120), b[1], b[3])
        if Rnd(0) < 0.5
            start = [-halfW, y0]
            target = [1920 + halfW, y1]
        else
            start = [1920 + halfW, y0]
            target = [-halfW, y1]
            m.facing = -1
        end if
    end if
    m.pos = start
    m.top.scale = [m.facing * m.s, m.s]
    m.top.translation = [start[0] - m.w / 2, start[1] - m.h / 2]
    m.moveAnim.easeFunction = "linear"
    startMove(target, rand(m.spec.duration[0], m.spec.duration[1]))
end sub

' ---------- critters ----------
' Critters walk along the reef floor, which scrolls left at m.floorSpeed. Each
' segment (a walk or a rest) is laid out in screen space with that drift built
' in, so a critter keeps its footing on the moving floor. Segments alternate
' between two Animation nodes, so the next starts the moment the last ends
' without restarting a node from its own "stopped" callback.
sub startCrawling(cfg as object)
    m.floorSpeed = cfg.floorSpeed
    m.crawlAnims = [m.moveAnim, m.top.findNode("moveAnim2")]
    interp2 = m.top.findNode("moveInterp2")
    interp2.fieldToInterp = m.uid + ".translation"
    m.crawlInterps = [m.moveInterp, interp2]
    for each anim in m.crawlAnims
        anim.easeFunction = "linear"
        anim.observeField("state", "onCrawlState")
    end for
    m.crawlIdx = 0
    m.walked = false
    ' Feet stay on one line of the floor; x is the sprite's center on screen.
    m.feetY = rand(m.bounds[1], m.bounds[3])
    m.crawlX = rand(m.w, 1920 - m.w)
    if m.spec.sideways = invalid and Rnd(0) < 0.5 then m.facing = -1
    m.top.scale = [m.facing, 1]
    m.top.translation = [m.crawlX - m.w / 2, m.feetY - m.h]
    nextCrawl()
end sub


sub nextCrawl()
    ' A critter that has scrolled off the left edge walks back in from the right.
    if m.crawlX < -m.w then m.crawlX = 1920 + m.w / 2 + rand(0, 300)
    spec = m.spec
    dx = 0.0
    if not m.walked and Rnd(0) < 0.75
        stride = rand(spec.stride[0], spec.stride[1])
        dir = 1
        if Rnd(0) < 0.5 then dir = -1
        dx = dir * stride
        duration = stride / rand(spec.speed[0], spec.speed[1])
        if spec.sideways = invalid and dir <> m.facing
            m.facing = dir
            m.top.scale = [m.facing, 1]
        end if
        m.walked = true
    else
        duration = rand(spec.rest[0], spec.rest[1])
        m.walked = false
    end if
    drift = m.floorSpeed * duration
    values = []
    n = 10
    for i = 0 to n
        t = i / n
        ease = t * t * (3 - 2 * t) ' walks start and stop gently; the drift stays linear
        values.Push([m.crawlX + dx * ease - drift * t - m.w / 2, m.feetY - m.h])
    end for
    m.crawlX = m.crawlX + dx - drift
    m.crawlIdx = 1 - m.crawlIdx
    interp = m.crawlInterps[m.crawlIdx]
    interp.key = evenKeys(n + 1)
    interp.keyValue = values
    anim = m.crawlAnims[m.crawlIdx]
    anim.duration = duration
    anim.control = "start"
end sub

sub onCrawlState(event as object)
    anim = event.getRoSGNode()
    if anim.state <> "stopped" then return
    if anim.id <> m.crawlAnims[m.crawlIdx].id then return
    nextCrawl()
end sub
