sub init()
    m.schema = prefsSchema()
    m.prefs = loadPrefs()
    m.top.findNode("title").font.size = 72
    m.preview = m.top.findNode("preview")
    m.caption = m.top.findNode("caption")
    m.list = m.top.findNode("list")
    content = CreateObject("roSGNode", "ContentNode")
    for each item in m.schema
        row = content.createChild("ContentNode")
        row.title = rowTitle(item)
    end for
    m.list.content = content
    m.list.observeField("itemSelected", "onSelected")
    m.list.setFocus(true)
    updatePreview()
end sub

function rowTitle(item as object) as string
    return item.label + ":   " + item.names[prefsIndexOf(item.values, m.prefs[item.key])]
end function

sub onSelected()
    index = m.list.itemSelected
    item = m.schema[index]
    i = (prefsIndexOf(item.values, m.prefs[item.key]) + 1) mod item.values.Count()
    m.prefs[item.key] = item.values[i]
    savePref(item.key, item.values[i])
    m.list.content.getChild(index).title = rowTitle(item)
    updatePreview()
end sub

sub updatePreview()
    style = m.prefs.style
    m.preview.uri = "pkg:/images/themes/" + style + "/preview.jpg"
    if style = "pixel" then m.caption.text = "Pixel art style" else m.caption.text = "Illustrated style"
end sub
