# Publishing Reef Tank to the Roku Streaming Store

Nothing here is submitted automatically. Creating the developer account, generating the signing key
and submitting in Roku's Developer Dashboard are steps the owner of the app takes. Roku now calls
the Channel Store the **Streaming Store** and channels **apps**.

Checked in November 2026 against Roku's [screensaver policy](https://developer.roku.com/dev/docs/screensavers),
[certification criteria](https://developer.roku.com/dev/docs/certification) (October 2026),
[Static Analysis tests](https://developer.roku.com/dev/docs/static-analysis-tool-1),
[App Publishing](https://developer.roku.com/dev/docs/channel-publishing-guide) and
[Packaging](https://developer.roku.com/dev/docs/packaging-channels) and the
[manifest reference](https://developer.roku.com/dev/docs/channel-manifest). Roku's docs only render in a
browser, so automated readers get an empty page.

## What Roku requires of a screensaver

| Requirement | Source | Reef Tank |
|---|---|---|
| A standalone screensaver: `RunScreenSaver()` and optionally `RunScreenSaverSettings()`; no `Main()` or `RunUserInterface()` | Screensaver policy | Done. Release builds leave out `devMain.brs` |
| Manifest has `screensaver_title` and **no `title`**. With `title`, Static Analysis treats the package as a channel that overrides the system screensaver and blocks publishing (4.5) | Screensaver policy, manifest reference | Done. Dev builds sideload and launch without it too |
| `rsg_version=1.3` in the manifest, required from October 1, 2026 | Manifest reference | Done |
| No video or audio players, ChannelStore, user input, deep links, ads, purchases or component libraries | Screensaver policy | Done |
| Package 4 MB or less | 3.7 | Done: 3.6 MB |
| Non-zero version, raised for every upload | 6.1 | Bump `build_version` in `src/manifest` each time |
| `mm_icon_focus_hd` (and `_fhd`) in the manifest | 6.4 | Done |
| Launches within 15 seconds, with an `AppLaunchComplete` signal beacon (Static Analysis error if missing) | 3.2 | Done: the tank sends it once built, about 0.3–0.5 s after launch on a Roku Ultra. Roku only registers it when the tank is opened as an app; as a screensaver it logs "not reachable" (harmless), and a settings screen can't send it |
| Store art clearly shows the app's name, isn't transparent, and uses broadcast-safe colors | 6.4 | Done: the poster has "Reef Tank" on it |
| A splash screen in FHD and HD (6.4) | Certification criteria | Not needed: the manifest reference lists only `screensaver_title` and the version numbers as required for a standalone screensaver. The package has none, because a full-screen splash stayed loaded at 8.4 MB of texture memory |
| Performs well on every Roku model that still gets OS updates; test on several models with different memory | 3.1 | Only tested on a Roku Ultra so far |

## One-time setup

1. **Developer account (free).** Enroll a Roku account in the
   [Roku Developer Program](https://developer.roku.com/enrollment/standard) ([setup guide](https://developer.roku.com/dev/docs/account-setup)), as an **Individual**. The
   developer name you enter is shown as the publisher in the store. Roku recommends that the
   owning account use an email address you'll keep for good. Packaging needs the development
   Roku to be **linked to the developer account** and online.
2. **Signing key.** Every version of the app must be signed with the same key, or updates lose
   users' saved settings. Generate it once on the development Roku:
   ```bash
   telnet $ROKU_HOST 8080
   ```
   At the prompt, type `genkey`. Save the **password** and **DevID** it prints somewhere safe, such
   as a password manager, and put the password in `.env` as `ROKU_SIGNING_PASSWORD`. Running
   `genkey` again replaces the key on the device; to sign with an old key, use **Rekey** on the
   device's Utilities page with a package signed with it and its password.
3. **Build, sideload the release build and sign it:**
   ```bash
   npm run package
   ```
   The signed `.pkg` lands in `out/`. A release build has no `Main()`, so when Roku opens it right
   after sideloading it just shows the splash color; press Home. It runs from the screensaver
   menu. Confirm the release zip has no `source/devMain.brs`:
   ```bash
   unzip -l out/reef-tank.zip
   ```

## Test as a beta app first

Private ("non-certified") channels were discontinued in 2022. Their replacement is the **beta
app**:
- up to 20 testers, who install it with an access code
- no certification needed
- deleted after 120 days

In the Developer Dashboard, create a beta app, upload the `.pkg`, and run **Static Analysis**, which
beta apps can use too. Then install it on your own Roku with the access code, choose it in
**Settings › Theme › Screensavers**, and let it start on its own after the idle timeout. Check
**Change screensaver settings**, and leave it running for an hour or more.

## Submit the public app

In the Developer Dashboard, create a **public** app and fill in:

| Page | Fields |
|---|---|
| New app | App name (30 characters max; can't contain "Roku"). A search found no store app named exactly "Reef Tank", but confirm in the dashboard. Countries and default language |
| Listing setup | Countries, domestic region, **Made for kids: No** (Yes brings children's-privacy obligations), category, age rating |
| Store assets | On-device description (300 characters max), online description (1,500 max), poster 540 × 405, up to six screenshots at 1920 × 1080 |
| App profile | App type **Theme** (wallpapers, screensavers and sounds); privacy policy URL ([docs/PRIVACY.md](PRIVACY.md): `https://github.com/ArpanDe/reef-tank/blob/master/docs/PRIVACY.md`) and terms URL ([docs/TERMS.md](TERMS.md)); customer support URL, email and phone; "learn more" URL; administrative and technical contacts (Roku uses these internally) |
| Monetization | **Free** |
| App package | The signed `.pkg` and a minimum firmware version |
| Static Analysis | Must pass with no errors |

Then **Schedule Publish**. The earliest slot is two business days out, and Fridays and weekends
aren't allowed. Roku reviews the app before it goes live. Each update repeats the package, Static
Analysis and schedule steps with a higher version number and the same signing key.

## Store artwork

`npm run art` renders these from the illustrated tank:

| File | Size | Use |
|---|---|---|
| `src/images/store/icon_focus_fhd.jpg` | 540 × 405 | App poster (FHD), packaged; also the store poster |
| `src/images/store/icon_focus_hd.jpg` | 290 × 218 | App poster (HD), packaged |
| `out/store/splash_fhd.jpg` | 1920 × 1080 | Splash, **not packaged** (screensavers don't need one) |
| `out/store/splash_hd.jpg` | 1280 × 720 | Splash, **not packaged** |

Add the app's name or a badge by creating `art/store/icon_focus.svg` or `art/store/splash.svg`.
They're drawn over the tank in tank coordinates (icons show the region x 480–1440, y 160–880).

**Screenshots** (1920 × 1080, up to six), taken from the TV. Make sure Roku's frame-rate overlay
is off first (`npm run console -- "fps_display 0"`). For each shot, launch a look, wait for a
good moment, then save it:

```bash
npm run launch -- style=photo hour=13 visitor=manta
```
```bash
npm run shot -- store-realistic
```

Other looks worth a screenshot: `style=illustrated hour=13 visitor=turtle`, `style=pixel hour=13`,
and `style=photo hour=23 clock=12`.

## Listing copy (draft)

**On-device description** (296 of 300 characters):
A calm coral reef aquarium for your TV, in realistic, illustrated or pixel-art style. Fish swim,
crabs wander, plants sway, and now and then a turtle, manta or jellyfish drifts by. Lighting
follows the time of day, an optional clock moves around, and the reef scrolls so nothing burns in.
No ads.

**Online description:**
Turn your TV into a peaceful coral reef tank. Clownfish, tangs, angelfish, a pufferfish, a
seahorse and schools of chromis and anthias swim over swaying sea whips and anemones, while crabs,
shrimp and a sea star wander the sand. Sunlight dances across the reef and bubbles drift up. Now
and then a sea turtle, manta ray or jellyfish passes by. The reef slowly scrolls past, so nothing
stays still long enough to burn into your screen.

- Three art styles from the same 3D models: realistic, cel-shaded illustrated, or retro pixel art
- Lighting follows the time of day, with a moonlit blue after dark
- An optional clock that moves around the screen
- A few fish, some, or lots
- No ads, no tracking, no network access
- Free and open source: github.com/ArpanDe/reef-tank
