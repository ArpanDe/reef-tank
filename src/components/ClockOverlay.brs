sub init()
    m.label = m.top.findNode("time")
    m.label.font.size = 48
    m.tick = m.top.findNode("tick")
    m.moveTimer = m.top.findNode("moveTimer")
    m.fadeOut = m.top.findNode("fadeOut")
    m.fadeIn = m.top.findNode("fadeIn")
    m.tick.observeField("fire", "updateText")
    m.moveTimer.observeField("fire", "onMoveTimer")
    m.fadeOut.observeField("state", "onFadedOut")
end sub

sub onFormat()
    updateText()
    placeRandomly()
    m.fadeIn.control = "start"
    m.tick.control = "start"
    m.moveTimer.control = "start"
end sub

sub updateText()
    now = CreateObject("roDateTime")
    now.ToLocalTime()
    h = now.GetHours()
    minutes = now.GetMinutes().ToStr()
    if minutes.Len() < 2 then minutes = "0" + minutes
    if m.top.format = "24"
        hours = h.ToStr()
        if hours.Len() < 2 then hours = "0" + hours
        m.label.text = hours + ":" + minutes
    else
        suffix = " AM"
        if h >= 12 then suffix = " PM"
        h12 = h mod 12
        if h12 = 0 then h12 = 12
        m.label.text = h12.ToStr() + ":" + minutes + suffix
    end if
end sub

' Somewhere inside the title-safe area (96..1824 x 53..1027).
sub placeRandomly()
    m.label.translation = [rand(110, 1550), rand(70, 960)]
end sub

sub onMoveTimer()
    m.fadeOut.control = "start"
end sub

sub onFadedOut()
    if m.fadeOut.state <> "stopped" then return
    updateText()
    placeRandomly()
    m.fadeIn.control = "start"
end sub
