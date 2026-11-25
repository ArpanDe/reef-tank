' Reef Tank: an original aquarium screensaver.
' Roku calls RunScreenSaver() when the screensaver starts, and
' RunScreenSaverSettings() from Settings > Theme > Screensaver > Reef Tank.

sub RunScreenSaver()
    showScene("AquariumScene", invalid)
end sub

sub RunScreenSaverSettings()
    showScene("SettingsScene", invalid)
end sub

' Creates the screen and scene, then blocks until Roku closes it.
' devArgs is only ever non-invalid in dev builds (see devMain.brs).
sub showScene(sceneName as string, devArgs as dynamic)
    screen = CreateObject("roSGScreen")
    port = CreateObject("roMessagePort")
    screen.setMessagePort(port)

    globalNode = screen.getGlobalNode()
    if devArgs = invalid then devArgs = {}
    globalNode.addFields({ devArgs: devArgs })

    screen.CreateScene(sceneName)
    screen.show()

    while true
        msg = wait(0, port)
        if type(msg) = "roSGScreenEvent" and msg.isScreenClosed() then return
    end while
end sub
