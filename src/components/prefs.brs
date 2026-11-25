' Screensaver preferences, kept in the registry. Shared by AquariumScene
' (reads them at start) and SettingsScene (edits them).

function prefsSchema() as object
    return [
        { key: "style", label: "Art style", values: ["illustrated", "pixel"], names: ["Illustrated", "Pixel art"], fallback: "illustrated" },
        { key: "scroll", label: "Scrolling", values: ["1", "2", "3"], names: ["Slow", "Medium", "Fast"], fallback: "1" },
        { key: "fish", label: "Fish", values: ["8", "14", "22"], names: ["Few", "Some", "Lots"], fallback: "14" },
        { key: "clock", label: "Clock", values: ["off", "12", "24"], names: ["Off", "12-hour", "24-hour"], fallback: "off" },
        { key: "lighting", label: "Lighting", values: ["auto", "day", "night"], names: ["Follow time of day", "Always day", "Always night"], fallback: "auto" },
        { key: "visitors", label: "Rare visitors", values: ["on", "off"], names: ["On", "Off"], fallback: "on" }
    ]
end function

function loadPrefs() as object
    section = CreateObject("roRegistrySection", "reeftank")
    prefs = {}
    for each item in prefsSchema()
        value = item.fallback
        if section.Exists(item.key)
            stored = section.Read(item.key)
            if prefsIndexOf(item.values, stored) >= 0 then value = stored
        end if
        prefs[item.key] = value
    end for
    return prefs
end function

sub savePref(key as string, value as string)
    section = CreateObject("roRegistrySection", "reeftank")
    section.Write(key, value)
    section.Flush()
end sub

function prefsIndexOf(list as object, value as dynamic) as integer
    if value = invalid then return -1
    for i = 0 to list.Count() - 1
        if list[i] = value then return i
    end for
    return -1
end function
