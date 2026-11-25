' DEV BUILD ONLY. scripts/roku.mjs leaves this file out of release builds,
' because Roku doesn't allow Main() in published screensavers.
'
' It lets `npm run launch` start the screensaver over ECP, e.g.
'   POST :8060/launch/dev?mode=settings
'   POST :8060/launch/dev?style=pixel&fish=20&hour=3&visitor=turtle&clock=24
sub Main(args as dynamic)
    if args = invalid then args = {}
    if args.mode <> invalid and args.mode = "settings"
        showScene("SettingsScene", args)
    else
        showScene("AquariumScene", args)
    end if
end sub
