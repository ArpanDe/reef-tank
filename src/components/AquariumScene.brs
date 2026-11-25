' Builds the tank from the active art style's theme.json and owns the
' scene-wide motion and timers (burn-in protection, lighting, visitors).
'
' Burn-in protection: two deterministic motions make sure every pixel keeps
' changing, regardless of where the (random) fish and bubbles happen to be:
'   1. Parallax scroll. The far, reef and floor+plants layers slide left forever
'      at different speeds (each layer is two seamless tiles side by side).
'   2. Light cycle. Every lightSeconds a faint bright veil fades in and out,
'      then a faint dark veil. A pixel with channel value c moves by at least
'      max(brighten * (255 - c), darken * c), about 16/255 or more, so no pixel
'      holds its value through a cycle. The veils sit above the night overlay, so
'      this holds day and night.
' The burn-in audit in the browser preview (npm run preview) measures this.

function burnInConfig() as object
    return {
        scrollFar: 5, scrollReef: 10, scrollFront: 16, ' px/s at the "Slow" setting
        lightSeconds: 300, brighten: 0.12, darken: 0.15
    }
end function

sub init()
    m.top.backgroundColor = "0x06213AFF"
    m.top.backgroundURI = ""

    ' Dev builds can override settings and force things via ECP launch args.
    m.dev = m.global.devArgs
    if m.dev = invalid then m.dev = {}
    m.prefs = loadPrefs()
    for each item in prefsSchema()
        if prefsIndexOf(item.values, m.dev[item.key]) >= 0 then m.prefs[item.key] = m.dev[item.key]
    end for
    ' timescale speeds up the deterministic motions (for the burn-in audit);
    ' ambient=off leaves out everything random: fish, bubbles, rays, visitors, clock.
    m.timescale = 1.0
    if m.dev.timescale <> invalid then m.timescale = Val(m.dev.timescale)
    m.ambient = not (m.dev.ambient <> invalid and m.dev.ambient = "off")

    m.theme = loadTheme(m.prefs.style)
    if m.theme = invalid then m.theme = loadTheme("illustrated")
    if m.theme = invalid then return

    m.global.addFields({ speedScale: 1.0 })
    m.uidCounter = 0
    ' Allowed vertical range of a creature's center, per depth band.
    m.bandY = { far: [180, 640], mid: [160, 760], near: [220, 820] }
    m.layers = { far: m.top.findNode("farFish"), mid: m.top.findNode("midFish"), near: m.top.findNode("nearFish") }
    m.rays = invalid

    buildBackdrop()
    buildPlants()
    setupBurnIn()
    if m.ambient
        spawnFish()
        spawnCritters()
        m.rays = m.top.findNode("rays")
        m.rays.config = { ray: m.theme.ray }
        m.top.findNode("bubbles").config = {
            bubbles: m.theme.bubbles,
            floorY: 1080 - m.floorH * 0.5,
            vents: [rand(0, m.tileW), rand(0, m.tileW)],
            tileW: m.tileW,
            speed: m.frontSpeed
        }
        if m.prefs.clock <> "off" then m.top.findNode("clock").format = m.prefs.clock
        setupVisitors()
    end if
    setupLighting()
end sub

function loadTheme(style as string) as dynamic
    text = ReadAsciiFile("pkg:/images/themes/" + style + "/theme.json")
    if text = "" then return invalid
    return ParseJson(text)
end function

function nextUid(prefix as string) as string
    m.uidCounter += 1
    return prefix + m.uidCounter.ToStr()
end function

sub buildBackdrop()
    cfg = burnInConfig()
    bd = m.theme.backdrop
    if bd.water <> invalid then m.top.findNode("water").uri = bd.water.uri

    speed = m.prefs.scroll.ToInt() * m.timescale
    m.frontSpeed = cfg.scrollFront * speed
    m.floorH = 120
    m.tileW = 1920
    if bd.floor <> invalid
        m.floorH = bd.floor.h
        m.tileW = bd.floor.w
    end if
    startScroll("farLayer", bd.far, cfg.scrollFar * speed, invalid)
    startScroll("reefLayer", bd.reef, cfg.scrollReef * speed, invalid)
    ' Plants are rooted in the floor, so they scroll in lockstep with it.
    startScroll("floorLayer", bd.floor, m.frontSpeed, "plantsLayer")
end sub

' Lays two copies of a tiling layer side by side and slides the layer left by
' one tile width per loop, forever. `follower` scrolls in lockstep.
sub startScroll(layerId as string, a as dynamic, speed as float, follower as dynamic)
    if a = invalid then return
    layer = m.top.findNode(layerId)
    for each x in [0, a.w]
        poster = layer.createChild("Poster")
        poster.uri = a.uri
        poster.width = a.w
        poster.height = a.h
        poster.translation = [x, 1080 - a.h]
    end for
    anim = newLoop(m.top, a.w / speed)
    addInterp(anim, layerId + ".translation", "vector2d", [0.0, 1.0], [[0, 0], [-a.w, 0]])
    if follower <> invalid then addInterp(anim, follower + ".translation", "vector2d", [0.0, 1.0], [[0, 0], [-a.w, 0]])
    anim.control = "start"
end sub

sub buildPlants()
    plants = m.theme.plants
    if plants = invalid or plants.Count() = 0 then return
    layer = m.top.findNode("plantsLayer")
    baseY = 1080 - m.floorH * 0.55
    count = 5
    slot = m.tileW / count
    for i = 0 to count - 1
        kind = pickOne(plants)
        x = (i + rand(0.2, 0.8)) * slot
        y = baseY + rand(-6, 10)
        period = rand(4.5, 7.5)
        phase = Rnd(0)
        ' The same plant again one tile to the right, swaying in step, so the
        ' scroll loop joins invisibly.
        for each offset in [0, m.tileW]
            node = layer.createChild("Plant")
            node.config = { plant: kind, x: x + offset, baseY: y, period: period, phase: phase, uid: nextUid("pl") }
        end for
    end for
end sub

sub setupBurnIn()
    cfg = burnInConfig()
    up = []
    down = []
    for k = 0 to 24
        a = 6.2831853 * k / 24
        up.Push(cfg.brighten * clamp(Sin(a), 0, 1))
        down.Push(cfg.darken * clamp(-Sin(a), 0, 1))
    end for
    light = newLoop(m.top, cfg.lightSeconds / m.timescale)
    addInterp(light, "brighten.opacity", "float", invalid, up)
    addInterp(light, "darken.opacity", "float", invalid, down)
    light.control = "start"
end sub

sub spawnFish()
    total = m.prefs.fish.ToInt()
    counts = {}
    slots = 0
    tries = 0
    while slots < total and tries < 200
        tries += 1
        c = pickSpecies(counts)
        if c = invalid then exit while
        createCreature(c, pickBand(c))
        if counts[c.id] = invalid then counts[c.id] = 0
        counts[c.id] = counts[c.id] + 1
        ' A school takes several slots.
        if c.school <> invalid then slots += 3 else slots += 1
    end while
end sub

' Critters walk on the front part of the reef floor: 2, 4 or 6 of them with
' Few, Some or Lots of fish, cycling through species so they're all different.
sub spawnCritters()
    list = m.theme.critters
    if list = invalid or list.Count() = 0 then return
    layer = m.top.findNode("critterLayer")
    first = Int(Rnd(0) * list.Count())
    for i = 0 to Int(m.prefs.fish.ToInt() / 3) - 1
        c = list[(first + i) mod list.Count()]
        node = layer.createChild("Fish")
        node.config = {
            spec: c,
            uid: nextUid("cr"),
            depthScale: 1.0,
            tint: "0xFFFFFFFF",
            bounds: [0, 1080 - m.floorH * 0.42, 1920, 1080 - 14],
            floorSpeed: m.frontSpeed
        }
    end for
end sub

' Weighted random species that hasn't reached its `max`.
function pickSpecies(counts as object) as dynamic
    candidates = []
    total = 0.0
    for each c in m.theme.fish
        used = 0
        if counts[c.id] <> invalid then used = counts[c.id]
        if c.max = invalid or used < c.max
            weight = 1.0
            if c.weight <> invalid then weight = c.weight
            candidates.Push({ c: c, w: weight })
            total += weight
        end if
    end for
    if candidates.Count() = 0 then return invalid
    r = Rnd(0) * total
    for each cand in candidates
        r -= cand.w
        if r <= 0 then return cand.c
    end for
    return candidates[candidates.Count() - 1].c
end function

function pickBand(c as object) as string
    weights = { far: 0.3, mid: 0.45, near: 0.25 }
    total = 0.0
    for each band in c.bands
        total += weights[band]
    end for
    r = Rnd(0) * total
    for each band in c.bands
        r -= weights[band]
        if r <= 0 then return band
    end for
    return c.bands[0]
end function

function createCreature(c as object, band as string) as object
    s = m.theme.bandScale[band]
    tint = "0xFFFFFFFF"
    opacity = 1.0
    if band = "far"
        tint = "0x8DB2D4FF"
        opacity = 0.9
    end if
    school = 0
    spread = 0.5
    if c.school <> invalid
        school = Int(rand(c.school[0], c.school[1] + 1))
        spread = 1.9
    end if
    mx = c.w * s * spread + 30
    y = m.bandY[band]
    node = m.layers[band].createChild("Fish")
    node.config = {
        spec: c,
        uid: nextUid("c"),
        depthScale: s,
        tint: tint,
        opacity: opacity,
        schoolSize: school,
        bounds: [mx, y[0], 1920 - mx, y[1]]
    }
    return node
end function

' ---------- day / night ----------

sub setupLighting()
    m.night = m.top.findNode("night")
    timer = m.top.findNode("lightTimer")
    timer.observeField("fire", "updateLighting")
    updateLighting()
    timer.control = "start"
end sub

sub updateLighting()
    if m.prefs.lighting = "day"
        n = 0.0
    else if m.prefs.lighting = "night"
        n = 1.0
    else
        n = nightAmount(currentHour())
    end if
    m.night.opacity = 0.5 * n
    if m.rays <> invalid
        m.rays.opacity = 1.0 - 0.8 * n
        if n > 0.5 then m.rays.tint = "0xB0C8FFFF" else m.rays.tint = "0xFFFFFFFF"
    end if
    m.global.speedScale = 1.0 - 0.3 * n
end sub

function currentHour() as float
    if m.dev.hour <> invalid then return Val(m.dev.hour)
    now = CreateObject("roDateTime")
    now.ToLocalTime()
    return now.GetHours() + now.GetMinutes() / 60.0
end function

' 0 = full daylight, 1 = full night. Dusk 18:30-21:00, dawn 05:00-07:00.
function nightAmount(h as float) as float
    if h >= 21.0 or h < 5.0 then return 1.0
    if h >= 18.5 then return (h - 18.5) / 2.5
    if h < 7.0 then return 1.0 - (h - 5.0) / 2.0
    return 0.0
end function

' ---------- rare visitors ----------

sub setupVisitors()
    if m.prefs.visitors = "off" or m.theme.visitors.Count() = 0 then return
    m.visitorTimer = m.top.findNode("visitorTimer")
    m.visitorTimer.observeField("fire", "spawnVisitor")
    if m.dev.visitor <> invalid then scheduleVisitor(3) else scheduleVisitor(rand(150, 360))
end sub

sub scheduleVisitor(seconds as float)
    m.visitorTimer.duration = seconds
    m.visitorTimer.control = "start"
end sub

sub spawnVisitor()
    v = pickOne(m.theme.visitors)
    if m.dev.visitor <> invalid
        for each candidate in m.theme.visitors
            if candidate.id = m.dev.visitor then v = candidate
        end for
    end if
    node = createCreature(v, pickOne(v.bands))
    node.observeField("finished", "onVisitorFinished")
end sub

sub onVisitorFinished(event as object)
    node = event.getRoSGNode()
    node.getParent().removeChild(node)
    if m.dev.visitor <> invalid then scheduleVisitor(15) else scheduleVisitor(rand(180, 480))
end sub
