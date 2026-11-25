' Motion runs entirely in Animation nodes on the render thread. This script
' only picks the next destination when an animation finishes.
'
' Coordinates: m.pos is the creature's visual center on screen. This node
' scales around the sprite center, so translation = center - size/2 at any
' depth scale. Scale is never negative: facing left swaps every part to its
' pre-mirrored image and mirrored position (setFacing), because Roku doesn't
' mirror images under a negative scale.

sub init()
    m.moveAnim = m.top.findNode("moveAnim")
    m.moveInterp = m.top.findNode("moveInterp")
    m.turnOut = m.top.findNode("turnOut")
    m.turnOutInterp = m.top.findNode("turnOutInterp")
    m.turnIn = m.top.findNode("turnIn")
    m.turnInInterp = m.top.findNode("turnInInterp")
    m.pauseTimer = m.top.findNode("pauseTimer")
    m.moveAnim.observeField("state", "onMoveState")
    m.turnOut.observeField("state", "onTurnOut")
    m.turnIn.observeField("state", "onTurnIn")
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
    m.turnOutInterp.fieldToInterp = m.uid + ".scale"
    m.turnInInterp.fieldToInterp = m.uid + ".scale"
    m.partNodes = [] ' every part's poster (and joint), so setFacing can swap them
    m.baseRGB = [1.0, 1.0, 1.0]
    if cfg.tintRGB <> invalid then m.baseRGB = cfg.tintRGB
    if cfg.opacity <> invalid then m.top.opacity = cfg.opacity

    ' All of this creature's looping motion (tails, fins, frames, school wobble)
    ' runs in ONE Animation, m.loop, of period m.loopPeriod. Roku's own tests
    ' show cheap devices lagging at ~20-50 concurrent Animation nodes, so we
    ' never give each part its own. Far-away fish (cfg.still) don't animate
    ' their parts at all: at half size, tinted, nobody can see a tail wag.
    school = 0
    if cfg.schoolSize <> invalid then school = cfg.schoolSize
    m.isSchool = school > 1
    m.still = (cfg.still = true)
    m.loop = invalid
    m.partPeriods = []
    longest = 0.0
    for each part in m.spec.parts
        d = partPeriod(part)
        m.partPeriods.Push(d)
        if d > longest then longest = d
    end for
    m.loopPeriod = longest
    if school > 1 then m.loopPeriod = rand(2.5, 4.5) ' the members' wobble period
    if m.loopPeriod <= 0 then m.loopPeriod = 1.0

    if school > 1
        for i = 0 to school - 1
            member = m.top.createChild("Group")
            member.id = m.uid + "m" + i.ToStr()
            ' Bigger schools spread into a looser cloud.
            offset = [rand(-1, 1) * m.w * (0.8 + school * 0.08), rand(-1, 1) * m.h * (1.0 + school * 0.1)]
            member.translation = offset
            buildParts(member, currentTint())
            if not m.still
                ' Each member wanders a little inside the formation.
                wobble = []
                ax = rand(0.1, 0.25) * m.w
                ay = rand(0.15, 0.35) * m.h
                phase = rand(0, 6.28)
                for k = 0 to 8
                    a = 6.2831853 * k / 8 + phase
                    wobble.Push([offset[0] + ax * Sin(a), offset[1] + ay * Sin(2 * a)])
                end for
                addInterp(loopAnim(), member.id + ".translation", "vector2d", invalid, wobble)
            end if
        end for
    else
        buildParts(m.top, currentTint())
    end if
    if m.loop <> invalid then m.loop.control = "start"

    if m.isVisitor
        startVisit()
    else if m.mode = "crawl"
        startCrawling(cfg)
    else
        m.pos = [rand(m.bounds[0], m.bounds[2]), rand(m.bounds[1], m.bounds[3])]
        m.top.scale = [m.s, m.s]
        if Rnd(0) < 0.5 then setFacing(-1)
        m.top.translation = [m.pos[0] - m.w / 2, m.pos[1] - m.h / 2]
        nextMove()
    end if
end sub

' The creature's color multiplier: its depth tint (far fish are bluer) times
' the scene's night darkening.
function currentTint() as string
    night = m.top.nightRGB
    return rgbColor(m.baseRGB[0] * night[0], m.baseRGB[1] * night[1], m.baseRGB[2] * night[2])
end function

sub applyTint()
    if m.partNodes = invalid then return
    tint = currentTint()
    for each rec in m.partNodes
        rec.poster.blendColor = tint
    end for
end sub

' The creature's shared loop Animation, created on first use.
function loopAnim() as object
    if m.loop = invalid then m.loop = newLoop(m.top, m.loopPeriod)
    return m.loop
end function

' Adds the sprite's part posters to parent and their motion to the shared
' loop. Parts are cropped to their visible pixels, so each sits at x/y on the
' creature's canvas. A part that moves (wag, pulse) hangs off its own joint:
' a Group placed exactly at the pivot (where a tail meets the body), with the
' poster offset relative to it, and the motion rotates or scales the joint
' around its own origin. On a real Roku (Ultra, OS 16), rotating the Poster
' itself around an off-center scaleRotateCenter inside a moving, flipping
' fish left tails drawn detached from their bodies.
' A part that wants a shorter period than the loop repeats several times per
' loop (cycles), so everything still fits in one Animation.
sub buildParts(parent as object, tint as string)
    ' School members and far-away fish don't move their fins, so they're one
    ' pre-combined image instead of 2-3: fewer images for the Roku to draw.
    if m.spec.flat <> invalid and (m.still or m.isSchool)
        poster = parent.createChild("Poster")
        m.partCount += 1
        poster.id = m.uid + "p" + m.partCount.ToStr()
        poster.uri = m.spec.flat.uri
        poster.width = m.spec.flat.w
        poster.height = m.spec.flat.h
        poster.translation = [m.spec.flat.x, m.spec.flat.y]
        poster.blendColor = tint
        m.partNodes.Push({ poster: poster, joint: invalid, part: m.spec.flat })
        return
    end if
    framePhase = rand(0.05, 0.45)
    for i = 0 to m.spec.parts.Count() - 1
        part = m.spec.parts[i]
        kind = part.anim
        if kind = invalid or m.still then kind = "none"
        m.partCount += 1
        id = m.uid + "p" + m.partCount.ToStr()
        if kind = "wag" or kind = "pulse"
            joint = parent.createChild("Group")
            joint.id = id + "j"
            joint.translation = [part.pivot[0], part.pivot[1]]
            poster = joint.createChild("Poster")
            poster.translation = [part.x - part.pivot[0], part.y - part.pivot[1]]
        else
            joint = invalid
            poster = parent.createChild("Poster")
            poster.translation = [part.x, part.y]
        end if
        poster.id = id
        m.partNodes.Push({ poster: poster, joint: joint, part: part })
        poster.uri = part.uri
        poster.width = part.w
        poster.height = part.h
        poster.blendColor = tint
        if part.anim = "frameB" then poster.opacity = 0
        cycles = 1
        if m.partPeriods[i] > 0 then cycles = Int(m.loopPeriod / m.partPeriods[i] + 0.5)
        if cycles < 1 then cycles = 1
        if kind = "wag"
            amp = 0.3
            if part.amp <> invalid then amp = part.amp
            addInterp(loopAnim(), joint.id + ".rotation", "float", invalid, sineCycles(0, amp, cycles, Rnd(0)))
        else if kind = "pulse"
            amp = 0.08
            if part.amp <> invalid then amp = part.amp
            values = []
            for each v in sineCycles(0, amp, cycles, Rnd(0))
                values.Push([1 + v, 1 - v])
            end for
            addInterp(loopAnim(), joint.id + ".scale", "vector2d", invalid, values)
        else if kind = "frameA" or kind = "frameB"
            ' Both frames use the same phase so they never show together.
            flip = frameFlip(framePhase, cycles)
            if kind = "frameA" then values = flip.a else values = flip.b
            poster.opacity = values[0]
            addInterp(loopAnim(), poster.id + ".opacity", "float", flip.keys, values)
        end if
    end for
end sub

' How long one cycle of this part's motion wants to take, in seconds.
function partPeriod(part as object) as float
    if part.period <> invalid then return part.period
    kind = part.anim
    if kind = "wag"
        if m.isVisitor then return rand(1.8, 2.6)
        return rand(0.7, 1.1)
    else if kind = "pulse"
        return rand(2.0, 2.8)
    else if kind = "frameA" or kind = "frameB"
        if m.isVisitor then return rand(1.0, 1.4)
        return rand(0.45, 0.6)
    end if
    return 0.0
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
        ' Squash to a sliver, swap art at the narrowest point, stretch back.
        m.pendingDir = dir
        m.turnOutInterp.keyValue = [[m.s, m.s], [m.s * 0.08, m.s]]
        m.turnInInterp.keyValue = [[m.s * 0.08, m.s], [m.s, m.s]]
        m.turning = true
        m.turnOut.control = "start"
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

sub onTurnOut()
    if m.turnOut.state = "stopped" and m.turning
        setFacing(m.pendingDir)
        m.turnIn.control = "start"
    end if
end sub

sub onTurnIn()
    if m.turnIn.state = "stopped" and m.turning
        m.turning = false
        startMove(m.pending, travelTime(m.pending))
    end if
end sub

' Points the creature left (-1) or right (1) by swapping each part to its
' mirrored (or original) image and position. Creatures that never turn (the
' crab, the jellyfish) have no mirrored art and stay as drawn.
sub setFacing(dir as integer)
    m.facing = dir
    for each rec in m.partNodes
        part = rec.part
        uri = part.uri
        x = part.x
        pivot = part.pivot
        if dir < 0 and part.uriL <> invalid
            uri = part.uriL
            x = m.w - part.x - part.w
            if pivot <> invalid then pivot = [m.w - part.pivot[0], part.pivot[1]]
        end if
        rec.poster.uri = uri
        if rec.joint <> invalid
            rec.joint.translation = [pivot[0], pivot[1]]
            rec.poster.translation = [x - pivot[0], part.y - pivot[1]]
        else
            rec.poster.translation = [x, part.y]
        end if
    end for
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
            setFacing(-1)
        end if
    end if
    m.pos = start
    m.top.scale = [m.s, m.s]
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
    ' A second move Animation, only critters need (see the comment above).
    anim2 = m.top.createChild("Animation")
    anim2.id = "moveAnim2"
    anim2.repeat = false
    interp2 = anim2.createChild("Vector2DFieldInterpolator")
    interp2.fieldToInterp = m.uid + ".translation"
    m.crawlAnims = [m.moveAnim, anim2]
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
    m.top.scale = [1, 1]
    if m.spec.sideways = invalid and Rnd(0) < 0.5 then setFacing(-1)
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
        if spec.sideways = invalid and dir <> m.facing then setFacing(dir)
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

