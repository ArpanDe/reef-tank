' Small helpers shared by the scene components.

function rand(lo as float, hi as float) as float
    return lo + Rnd(0) * (hi - lo)
end function

function clamp(v as float, lo as float, hi as float) as float
    if v < lo then return lo
    if v > hi then return hi
    return v
end function

function pickOne(list as object) as dynamic
    return list[Int(Rnd(0) * list.Count())]
end function

' n evenly spaced animation keys from 0 to 1.
function evenKeys(n as integer) as object
    keys = []
    for i = 0 to n - 1
        keys.Push(i / (n - 1))
    end for
    return keys
end function

' One full sine cycle around center, as n closed-loop samples (first = last),
' starting `phase` of the way into the cycle (0..1). Loops get out-of-step
' phases this way rather than with Animation.delay, which Roku re-applies on
' every repeat (the loop would pause each cycle).
function sineValues(center as float, amp as float, n as integer, phase as float) as object
    values = []
    for i = 0 to n - 1
        values.Push(center + amp * Sin(6.2831853 * (i / (n - 1) + phase)))
    end for
    return values
end function

' Keys and values for a two-frame flip starting `phase` (0.05..0.45) into the
' cycle: frame A shows for half of each cycle, frame B (values inverted) the other half.
function frameFlip(phase as float) as object
    a = 0.5 - phase
    b = 1.0 - phase
    return { keys: [0.0, a - 0.001, a, b - 0.001, b, 1.0], a: [1.0, 1.0, 0.0, 0.0, 1.0, 1.0], b: [0.0, 0.0, 1.0, 1.0, 0.0, 0.0] }
end function

' A repeating linear Animation under owner, not started yet.
function newLoop(owner as object, period as float) as object
    anim = owner.createChild("Animation")
    anim.repeat = true
    anim.easeFunction = "linear"
    anim.duration = period
    return anim
end function

' Adds an interpolator to anim. target is "nodeId.field"; kind is "float" or
' "vector2d"; keys = invalid spaces the values evenly.
sub addInterp(anim as object, target as string, kind as string, keys as dynamic, values as object)
    if kind = "float"
        interp = anim.createChild("FloatFieldInterpolator")
    else
        interp = anim.createChild("Vector2DFieldInterpolator")
    end if
    if keys = invalid then keys = evenKeys(values.Count())
    interp.key = keys
    interp.keyValue = values
    interp.fieldToInterp = target
end sub

' Shorthand: a started loop with a single interpolator.
function addLoop(owner as object, target as string, kind as string, values as object, period as float) as object
    anim = newLoop(owner, period)
    addInterp(anim, target, kind, invalid, values)
    anim.control = "start"
    return anim
end function
