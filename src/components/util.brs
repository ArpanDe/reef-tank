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

' `cycles` full sine cycles around center within one loop, starting `phase`
' (0..1) of the way into a cycle, sampled finely enough to look smooth.
function sineCycles(center as float, amp as float, cycles as integer, phase as float) as object
    n = 8 * cycles + 1
    if n > 49 then n = 49
    values = []
    for i = 0 to n - 1
        values.Push(center + amp * Sin(6.2831853 * (cycles * i / (n - 1) + phase)))
    end for
    return values
end function

' Keys and values for a two-frame flip repeated `cycles` times per loop,
' starting `phase` (0.05..0.45) into a cycle: frame A shows for half of each
' cycle and frame B (values inverted) for the other half.
function frameFlip(phase as float, cycles as integer) as object
    keys = []
    a = []
    b = []
    for j = 0 to cycles - 1
        base = j / cycles
        k1 = base + (0.5 - phase) / cycles
        k2 = base + (1.0 - phase) / cycles
        keys.Append([base, k1 - 0.0005, k1, k2 - 0.0005, k2])
        a.Append([1.0, 1.0, 0.0, 0.0, 1.0])
        b.Append([0.0, 0.0, 1.0, 1.0, 0.0])
    end for
    keys.Push(1.0)
    a.Push(1.0)
    b.Push(0.0)
    return { keys: keys, a: a, b: b }
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
