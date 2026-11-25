' Builds the tank from the active art style's theme.json and owns the
' scene-wide motion and timers (burn-in protection, lighting, visitors).
'
' Burn-in protection: two deterministic motions make sure every pixel keeps
' changing, regardless of where the (random) fish and bubbles happen to be:
'   1. Parallax scroll. The far, reef and floor+plants layers slide left forever
'      at speeds 1:2:4 (each layer is two seamless tiles side by side).
'   2. Light cycle. Every lightSeconds a faint bright veil fades in and out,
'      then a faint dark veil (one Rectangle, "veil", changing color while
'      invisible). A pixel with channel value c moves by at least
'      max(brighten * (255 - c), darken * c), about 16/255 or more, so no pixel
'      holds its value through a cycle. Night darkens every image through its
'      tint (blendColor), and the veil sits on top, so this holds day and night.
'
' Performance: Roku's own tests saw cheap devices lag at 20-50 concurrent
' Animation nodes, so scene-wide motion is packed into a few Animations with
' many interpolators (one for all scrolling, one for all plants, one for the
' light cycle, one for the caustics).
' The burn-in audit in the browser preview (npm run preview) measures this.

function burnInConfig() as object
    return {
        scrollFar: 4, scrollReef: 8, scrollFront: 16, ' px/s at "Slow"; keep 1:2:4 so one Animation drives all three
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
    ' off=caustics,rays,veil,plants,bubbles,fish,critters switches single layers
    ' off, to measure what each costs on a device (with fps_display on).
    m.off = {}
    if m.dev.off <> invalid
        for each name in m.dev.off.Split(",")
            m.off[name] = true
        end for
    end if

    m.theme = loadTheme(m.prefs.style)
    if m.theme = invalid then m.theme = loadTheme("illustrated")
    if m.theme = invalid then return

    m.global.addFields({ speedScale: 1.0 })
    m.uidCounter = 0
    ' Allowed vertical range of a creature's center, per depth band.
    m.bandY = { far: [180, 640], mid: [160, 760], near: [220, 820] }
    m.layers = { far: m.top.findNode("farFish"), mid: m.top.findNode("midFish"), near: m.top.findNode("nearFish") }
    m.rays = invalid
    m.caustics = invalid
    ' Night is a multiply on every image (blendColor), not a full-screen layer:
    ' on a Roku Ultra the night overlay cost ~5 fps. These are the images and
    ' creatures to tint.
    m.nightRGB = [1.0, 1.0, 1.0]
    m.tintPosters = []

    buildBackdrop()
    if m.off.plants = invalid then buildPlants()
    if m.off.veil = invalid then setupBurnIn()
    if m.ambient
        if m.off.fish = invalid then spawnFish()
        if m.off.critters = invalid then spawnCritters()
        if m.off.caustics = invalid then setupCaustics()
        m.rays = m.top.findNode("rays")
        if m.off.rays = invalid then m.rays.config = { ray: m.theme.ray }
        if m.off.bubbles = invalid
            m.top.findNode("bubbles").config = {
                bubbles: m.theme.bubbles,
                floorY: 1080 - m.floorCover + 12,
                speed: m.frontSpeed
            }
        end if
        if m.prefs.clock <> "off" then m.top.findNode("clock").format = m.prefs.clock
        setupVisitors()
    end if
    setupLighting()
    ' Tells Roku the tank is built; certification measures launch time with it (3.2), and Static
    ' Analysis looks for this call. Roku only registers it when the tank is opened as an app (dev
    ' builds); as a screensaver it logs "not reachable", which is harmless. Settings scenes can't
    ' send it at all ("invalid beacon").
    m.top.signalBeacon("AppLaunchComplete")
    ' Dev builds: `stats=1` prints a count of every node type once the tank is built.
    if m.dev.stats <> invalid
        m.statsTimer = m.top.createChild("Timer")
        m.statsTimer.duration = 3
        m.statsTimer.observeField("fire", "printStats")
        m.statsTimer.control = "start"
    end if
end sub

sub printStats()
    counts = {}
    countNodes(m.top, counts)
    print "STATS "; FormatJson(counts)
end sub

sub countNodes(node as object, counts as object)
    kind = node.subtype()
    if counts[kind] = invalid then counts[kind] = 0
    counts[kind] = counts[kind] + 1
    if kind = "Animation" and node.state = "running"
        if counts.runningAnimations = invalid then counts.runningAnimations = 0
        counts.runningAnimations = counts.runningAnimations + 1
    end if
    for i = 0 to node.getChildCount() - 1
        countNodes(node.getChild(i), counts)
    end for
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
    water = m.top.findNode("water")
    if bd.water <> invalid then water.uri = bd.water.uri
    m.tintPosters.Push(water)

    speed = m.prefs.scroll.ToInt() * m.timescale
    m.frontSpeed = cfg.scrollFront * speed
    ' The front reef is solid from the bottom up to floorCover px everywhere:
    ' plants root just below that line and bubbles start there.
    m.floorCover = 120
    if m.theme.floorCover <> invalid and m.theme.floorCover > 0 then m.floorCover = m.theme.floorCover
    m.tileW = 1920
    if bd.floor <> invalid then m.tileW = bd.floor.w

    layers = [
        { id: "farLayer", tile: bd.far, speed: cfg.scrollFar * speed, follower: invalid },
        { id: "reefLayer", tile: bd.reef, speed: cfg.scrollReef * speed, follower: invalid },
        { id: "floorLayer", tile: bd.floor, speed: m.frontSpeed, follower: "plantsLayer" } ' plants are rooted in the floor
    ]
    for each layer in layers
        placeTiles(layer.id, layer.tile)
    end for
    startScrolling(layers)
end sub

' Two copies of a tiling layer side by side. Each copy may come in pieces
' (chunks), since textures wider than 2048 px aren't safe on every Roku, and
' sits `bottom` px above the screen bottom (rows always hidden behind the
' layers in front were trimmed off at build time).
sub placeTiles(layerId as string, tile as dynamic)
    if tile = invalid then return
    layer = m.top.findNode(layerId)
    for each copyX in [0, tile.w]
        for each chunk in tile.chunks
            poster = layer.createChild("Poster")
            poster.uri = chunk.uri
            poster.width = chunk.w
            poster.height = tile.h
            poster.translation = [copyX + chunk.x, 1080 - tile.bottom - tile.h]
            m.tintPosters.Push(poster)
        end for
    end for
end sub

' Slides every layer left by its tile width, forever. When the speeds are in
' whole-number ratios (1:2:4) and the tiles are the same width, a single
' Animation drives them all: the faster layers just wrap several times per
' loop (a jump of exactly one tile is invisible). Otherwise each layer gets
' its own Animation.
sub startScrolling(layers as object)
    active = []
    for each layer in layers
        if layer.tile <> invalid and layer.speed > 0 then active.Push(layer)
    end for
    if active.Count() = 0 then return
    slowest = active[0]
    for each layer in active
        if layer.speed < slowest.speed then slowest = layer
    end for
    period = slowest.tile.w / slowest.speed
    shared = true
    for each layer in active
        c = layer.speed * period / layer.tile.w
        if Abs(c - Int(c + 0.5)) > 0.001 then shared = false
    end for
    anim = invalid
    if shared then anim = newLoop(m.top, period)
    for each layer in active
        cycles = 1
        if shared
            cycles = Int(layer.speed * period / layer.tile.w + 0.5)
            target = anim
        else
            target = newLoop(m.top, layer.tile.w / layer.speed)
        end if
        saw = sawtooth(-layer.tile.w, cycles)
        addInterp(target, layer.id + ".translation", "vector2d", saw.keys, saw.values)
        if layer.follower <> invalid then addInterp(target, layer.follower + ".translation", "vector2d", saw.keys, saw.values)
        if not shared then target.control = "start"
    end for
    if shared then anim.control = "start"
end sub

' Keys/values that move x from 0 to `distance` `cycles` times per loop.
function sawtooth(distance as float, cycles as integer) as object
    keys = []
    values = []
    for j = 0 to cycles - 1
        keys.Append([j / cycles, (j + 1) / cycles - 0.0001])
        values.Append([[0, 0], [distance, 0]])
    end for
    keys.Push(1.0)
    values.Push([distance, 0])
    return { keys: keys, values: values }
end function

' Plants are built straight into the scene (not as components) so that ONE
' Animation can sway every plant: each plant is a chain of nested joint
' Groups, and up to three joints per plant rotate with a phase lag, so the
' sway builds up the stem. Each plant also has a twin one tile to the right,
' swaying in step, so the scroll loop joins invisibly.
sub buildPlants()
    plants = m.theme.plants
    if plants = invalid or plants.Count() = 0 then return
    layer = m.top.findNode("plantsLayer")
    baseY = 1080 - m.floorCover + 24
    m.plantSway = newLoop(m.top, 6.0)
    count = 7
    slot = m.tileW / count
    for i = 0 to count - 1
        kind = pickOne(plants)
        x = (i + rand(0.2, 0.8)) * slot
        y = baseY + rand(-6, 10)
        phase = Rnd(0)
        for each offset in [0, m.tileW]
            buildPlant(layer, kind, x + offset, y, phase)
        end for
    end for
    m.plantSway.control = "start"
end sub

sub buildPlant(layer as object, plant as object, x as float, baseY as float, phase as float)
    segments = plant.segments
    n = segments.Count()
    swayAt = [0, Int(n / 2), n - 1] ' joints that move; the rest ride along
    if n <= 3 then swayAt = [0, 1, 2]
    uid = nextUid("pl")
    parent = layer
    prevH = 0
    for i = 0 to n - 1
        seg = segments[i]
        joint = parent.createChild("Group")
        joint.id = uid + "j" + i.ToStr()
        if i = 0
            joint.translation = [x, baseY]
        else
            joint.translation = [0, -(prevH - plant.overlap)]
        end if
        poster = joint.createChild("Poster")
        poster.uri = seg.uri
        poster.width = seg.w
        poster.height = seg.h
        poster.translation = [-seg.w / 2, -seg.h]
        m.tintPosters.Push(poster)
        moves = false
        for each j in swayAt
            if j = i then moves = true
        end for
        if moves
            ' Upper joints bend more. Fewer joints move, so each bends more.
            amp = plant.sway * (0.5 + 0.5 * i / (n - 1 + 0.0001)) * n / swayAt.Count()
            addInterp(m.plantSway, joint.id + ".rotation", "float", invalid, sineCycles(0, amp, 1, phase - i * 0.07))
        end if
        prevH = seg.h
        parent = joint
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
    ' One veil: bright (white) for the first half of the cycle, dark (navy)
    ' for the second. It switches color at the halfway point, when it's fully
    ' transparent, so the switch can't be seen.
    opacity = []
    for k = 0 to 24
        opacity.Push(up[k] + down[k])
    end for
    light = newLoop(m.top, cfg.lightSeconds / m.timescale)
    addInterp(light, "veil.opacity", "float", invalid, opacity)
    colors = light.createChild("ColorFieldInterpolator")
    colors.key = [0.0, 0.4999, 0.5, 1.0]
    colors.keyValue = [&hE6F7FFFF, &hE6F7FFFF, &h020812FF, &h020812FF]
    colors.fieldToInterp = "veil.color"
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

' Dancing sunlight on the reef: the caustics texture, stretched and drifting
' on a slow loop. One copy, not two: on a Roku Ultra the second copy cost ~3
' fps for a subtle shimmer (big semi-transparent quads are what limit frame
' rate). It fades out at night with the rays.
sub setupCaustics()
    tex = m.theme.caustics
    if tex = invalid then return
    m.caustics = m.top.findNode("caustics")
    ' The texture's canvas is stretched over the screen with a margin for
    ' drifting. Only its visible part was kept at build time (fx/fy/fw/fh are
    ' that part's place on the canvas, as fractions).
    canvasW = 1920 + 240
    canvasH = 1080 + 160
    anim = newLoop(m.top, 45.0)
    ids = ["causticA"]
    opacities = [0.13]
    for i = 0 to 0
        poster = m.caustics.createChild("Poster")
        poster.id = ids[i]
        poster.uri = tex.uri
        poster.width = canvasW * tex.fw
        poster.height = canvasH * tex.fh
        poster.opacity = opacities[i]
        fx = tex.fx
        if i = 1
            ' Mirrored, so the two nets never line up.
            poster.scaleRotateCenter = [poster.width / 2, poster.height / 2]
            poster.scale = [-1, 1]
            fx = 1 - tex.fx - tex.fw
        end if
        ' Shifted down so the net fades in at the front reef's crown: caustics
        ' belong on the reef and sand, and in open water they read as a grid.
        base = [-120 + canvasW * fx, -80 + 260 + canvasH * tex.fy]
        path = []
        phase = Rnd(0) * 6.2831853
        for k = 0 to 24
            a = 6.2831853 * k / 24 + phase
            if i = 0
                path.Push([base[0] + 100 * Sin(a), base[1] + 60 * Sin(2 * a)])
            else
                path.Push([base[0] - 90 * Cos(a), base[1] + 50 * Sin(a)])
            end if
        end for
        addInterp(anim, ids[i] + ".translation", "vector2d", invalid, path)
    end for
    anim.control = "start"
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
            tintRGB: [1.0, 1.0, 1.0],
            bounds: [0, 1080 - 80, 1920, 1080 - 14], ' the front reef's bottom ledge
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
    tint = [1.0, 1.0, 1.0]
    opacity = 1.0
    if band = "far"
        tint = [0.553, 0.698, 0.831] ' bluer with distance
        opacity = 0.9
    end if
    school = 0
    spread = 0.5
    if c.school <> invalid
        school = Int(rand(c.school[0], c.school[1] + 1))
        spread = 1.3 + school * 0.08 ' matches the school's cloud size in Fish.brs
    end if
    mx = c.w * s * spread + 30
    y = m.bandY[band]
    node = m.layers[band].createChild("Fish")
    node.config = {
        spec: c,
        uid: nextUid("c"),
        still: (band = "far"),
        depthScale: s,
        tintRGB: tint,
        opacity: opacity,
        schoolSize: school,
        bounds: [mx, y[0], 1920 - mx, y[1]]
    }
    return node
end function

' ---------- day / night ----------

sub setupLighting()
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
    applyNight([1 - 0.5 * n, 1 - 0.48 * n, 1 - 0.40 * n]) ' close to the old 50% navy overlay
    if m.caustics <> invalid
        m.caustics.opacity = 1.0 - 0.85 * n
        m.caustics.visible = m.caustics.opacity > 0.05
    end if
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

' Darkens everything for night through each image's tint. Runs at most once a
' minute, and does nothing while the light isn't changing.
sub applyNight(rgb as object)
    if rgb[0] = m.nightRGB[0] and rgb[1] = m.nightRGB[1] and rgb[2] = m.nightRGB[2] then return
    m.nightRGB = rgb
    tint = rgbColor(rgb[0], rgb[1], rgb[2])
    for each poster in m.tintPosters
        poster.blendColor = tint
    end for
    for each layerId in ["farFish", "midFish", "nearFish", "critterLayer"]
        layer = m.top.findNode(layerId)
        for i = 0 to layer.getChildCount() - 1
            layer.getChild(i).nightRGB = rgb
        end for
    end for
    m.top.findNode("bubbles").nightRGB = rgb
end sub

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
    node.nightRGB = m.nightRGB
    node.observeField("finished", "onVisitorFinished")
end sub

sub onVisitorFinished(event as object)
    node = event.getRoSGNode()
    node.getParent().removeChild(node)
    if m.dev.visitor <> invalid then scheduleVisitor(15) else scheduleVisitor(rand(180, 480))
end sub
