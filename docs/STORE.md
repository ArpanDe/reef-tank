# Publishing Reef Tank to the Roku Channel Store

Nothing here is submitted automatically. These are the pieces and the steps for when you decide to
publish.

## Before you submit

- [ ] **Name.** "Reef Tank" is a working title. Search the Channel Store first, since names must be
      unique. Renaming means editing `title` and `screensaver_title` in `src/manifest`.
- [ ] **Version.** Bump `major_version` / `minor_version` / `build_version` in `src/manifest` for each upload.
- [ ] **Release build check.** `npm run zip` writes `out/reef-tank.zip`. Confirm it has no `source/devMain.brs`:
      ```bash
      unzip -l out/reef-tank.zip
      ```
- [ ] **Run the release build on a TV.** `npm run deploy:release`, choose it in Settings › Theme › Screensaver,
      and let it start on its own after the idle timeout. Leave it running for an hour or more.
- [ ] **Low-end device.** If you can, try it on a basic Roku (Express or similar) with Fish = Lots, in both
      art styles. Use `npm run console -- chanperf 10` and `npm run console -- r2d2_bitmaps` to check CPU and
      texture memory.
- [ ] **Settings screen.** Each option cycles and is remembered after the screensaver restarts.
- [ ] **Certification.** Read Roku's current screensaver requirements and certification criteria on
      developer.roku.com. (Their docs block automated readers, so this checklist was not verified
      against them.) Known points: screensavers use `RunScreenSaver()` / `RunScreenSaverSettings()` and
      must not define `Main()` or `RunUserInterface()`. They should take no input during playback and
      play no video.

## Signing a package

Store uploads must be signed on a Roku you've keyed.

1. Key the device once:
   ```bash
   telnet $ROKU_HOST 8080
   ```
   At the prompt, type `genkey`. Save the **password** and **DevID** it prints somewhere safe. Every
   future update must be signed with the same key. Put the password in `.env` as `ROKU_SIGNING_PASSWORD`.
2. Build, sideload and sign:
   ```bash
   npm run package
   ```
   The signed package lands in `out/`.

## Uploading

In the Roku developer dashboard, create a new app of type **screensaver** (the exact menu names
change over time), upload the signed `.pkg`, and fill in the listing below. You can publish as
non-certified/private first to test the store install on your own devices before going public.

## Store artwork

`npm run art` renders these from the illustrated tank:

| File | Size | Use |
|---|---|---|
| `src/images/store/icon_focus_fhd.jpg` | 540 × 405 | Channel poster (FHD), packaged |
| `src/images/store/icon_focus_hd.jpg` | 290 × 218 | Channel poster (HD), packaged |
| `out/store/splash_fhd.jpg` | 1920 × 1080 | Listing artwork, **not packaged** |
| `out/store/splash_hd.jpg` | 1280 × 720 | Listing artwork, **not packaged** |

The package has no splash images: on a Roku Ultra a full-screen splash stayed in texture memory at
8.4 MB, and a screensaver doesn't need one (the manifest keeps `splash_color`). **Check** whether
current certification requires `splash_screen_*` for screensaver apps; if it does, add a small
splash rather than a full-screen one.

Add title text or a badge by creating `art/store/icon_focus.svg` or `art/store/splash.svg`. They're
drawn over the tank in tank coordinates (icons show the region x 480–1440, y 160–880).

**Screenshots** for the listing, taken from the TV with `npm run shot`:

```bash
npm run launch -- style=illustrated hour=13
```
```bash
npm run shot -- store-illustrated-day
```
```bash
npm run launch -- style=pixel hour=13
```
```bash
npm run shot -- store-pixel-day
```
```bash
npm run launch -- style=illustrated hour=23 clock=12
```
```bash
npm run shot -- store-night-clock
```

## Listing copy (draft)

**Short description:** A calm reef aquarium for your TV, in illustrated or pixel-art style.

**Long description:**
Turn your TV into a peaceful, thriving coral reef tank. Clownfish, tangs, angelfish, a pufferfish,
a seahorse and shimmering clouds of chromis and anthias swim over swaying sea whips and anemones,
while crabs, shrimp and sea stars wander the coral floor. Sunlight dances across the reef and
bubbles drift up to the surface. Now and then a sea turtle, manta ray or jellyfish passes by.
The reef slowly scrolls past, so nothing stays still long enough to burn into your screen.

- Two art styles: hand-crafted illustrated, or retro pixel art
- Lighting follows the time of day, with moonlit blue after dark
- Optional clock that slowly moves around the screen
- Choose a few fish, some, or lots
- No ads

**Keywords:** aquarium, fish, fish tank, reef, ocean, underwater, screensaver, relaxing, pixel art
