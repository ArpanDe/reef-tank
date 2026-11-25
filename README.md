# Reef Tank

An original aquarium screensaver for Roku: a sunlit coral reef with swimming fish, clouds of small
reef fish, swaying sea whips and anemones, crabs, shrimp and other critters wandering the reef
floor, rising bubbles, light rays and dancing sunlight, and the occasional turtle, manta or
jellyfish passing through. The reef scrolls slowly past in parallax. It has two art styles (**Illustrated**
and **Pixel art**), an optional drifting clock, and lighting that follows the time of day.

It's a replacement for Roku's Aquatic Life screensaver, which Roku is retiring on December 1, 2026.
All the art here is original.

## Setup

1. Turn on Developer Mode on your Roku: on the remote press **Home ×3, Up ×2, Right, Left, Right,
   Left, Right**, then follow the prompts and choose a password.
2. Install the tools and point them at your Roku:
   ```bash
   npm install
   cp .env.example .env   # then fill in ROKU_HOST and ROKU_PASSWORD
   ```
3. Build and sideload:
   ```bash
   npm run deploy
   ```
4. On the TV, go to **Settings › Theme › Screensaver** and choose **Reef Tank**. Its settings are
   under **Settings › Theme › Screensaver › Custom settings** (the wording varies by Roku OS version).

## Development loop

| Command | What it does |
|---|---|
| `npm run preview` | Run the real dev build in your browser at <http://localhost:6502> using [brs-engine](https://github.com/lvcabral/brs-engine), a BrightScript simulator. No Roku needed. Controls switch style, scrolling speed, fish, time of day, clock and visitors. **Burn-in audit** checks the guarantee below. In the Settings screen, arrows move, Enter = OK, Escape = Back |
| `npm run art` | Render `art/` into PNGs + `theme.json` (and review images in `out/`) |
| `npm run lint` | Compile and lint all BrightScript (BrighterScript + bslint) |
| `npm run preview` → **Save frame** | Saves the emulator's current frame, full size, to `out/screens/` |
| `npm run launch -- stats=1` | Prints a count of every node type 3 s after start, including how many Animations are running (also works in the preview) |
| `npm run deploy` | art + lint + sideload a **dev build** |
| `npm run launch` | Start the screensaver now. Pass overrides: `npm run launch -- style=pixel fish=20 hour=3 clock=24 visitor=turtle` |
| `npm run settings` | Open the settings screen |
| `npm run shot -- name` | Save a screenshot to `out/screens/name.jpg` |
| `npm run logs` | Stream the BrightScript console (Ctrl-C to stop) |
| `npm run console -- chanperf 10` | Run a debug-server command (CPU/memory: `chanperf`; textures: `r2d2_bitmaps`) |
| `npm run deploy:release` | Sideload the **release build** (no dev entry point) |
| `npm run package` | Build a signed `.pkg` for the Channel Store (see [docs/STORE.md](docs/STORE.md)) |

Dev builds include `src/source/devMain.brs`, a `Main()` that lets ECP launch the screensaver with
overrides. Release builds and packages leave it out, because Roku doesn't allow `Main()` in
screensavers.

## Burn-in protection

A screensaver is only useful if it doesn't wear a picture into the panel, so Reef Tank guarantees
that **every pixel's red, green and blue values each change by at least 12/255 within every
5 minutes**, day or night. The guarantee doesn't count on fish, bubbles or light rays being in the
right place; it comes from two deterministic motions (`burnInConfig()` in
`src/components/AquariumScene.brs`):

1. **Parallax scroll.** The far rocks, reef, and front reef+plants slide left forever at 4, 8 and
   16 px/s (×2 or ×3 with the Scrolling setting). Each backdrop is a seamless 2556 px tile drawn
   twice side by side.
2. **Light cycle.** Every 5 minutes a faint bright veil (12%) fades in and out, then a faint dark
   veil (15%). Any channel value c moves by at least max(0.12 × (255 − c), 0.15 × c), about 16/255
   or more. The veils sit above the night dimming, so this also holds at night.

The clock overlay moves to a new spot every minute.

**Measured** with the preview's Burn-in audit. It runs only those two motions (no fish, bubbles,
rays, visitors or clock) at 10× speed, samples all 2,073,600 pixels, and fails if any pixel's R, G
or B didn't move by 12/255 within 5 minutes of real time:

| Style | Lighting | Result | Half of pixels changed by | Slowest pixel changed after |
|---|---|---|---|---|
| Illustrated | Day | PASS | 0 min 40 s | 2 min 27 s |
| Illustrated | Night | PASS | 1 min 43 s | 2 min 05 s |
| Pixel art | Day | PASS | 0 min 15 s | 2 min 24 s |
| Pixel art | Night | PASS | 0 min 17 s | 2 min 01 s |

These were measured in brs-engine, not on a Roku; the motions are the same `Animation` nodes on a device.

## Performance budget

Cheap Rokus are slow and short on graphics memory, so the build and the engine are tuned against
the limits Roku and its developers have published:

| Limit | Where it comes from | Our target |
|---|---|---|
| Animations running at once | Roku's Performance FAQ: ~800 fine on a high-end device, lag at ~50 on "Giga" devices (Roku 2 HD/XD/XS, LT 2400X) and trouble at ~20 on "Tyler" (Roku 1/SE/2/LT 2700X–2720X) | under 50 at every setting |
| Texture memory | Every image costs width × height × 4 bytes, whatever its file format ([Roku memory management](https://developer.roku.com/dev/docs/memory-management)). Per-device budgets aren't published; Roku partner support cites ~20 MB (Tyler) and ~44–45 MB (Giga) | under 20 MB per style |
| Package size | 4 MB certification cap, as cited on [Roku's developer forum](https://forum.developer.roku.com/t/package-file-size-limit/8342) | under 4 MB |
| Bitmap size | 2048 px per side, widely reported by developers ([forum](https://community.roku.com/t5/Roku-Developer-Program/WARNING-Max-Bitmap-Size-Changing/td-p/293797)) but not confirmed officially | no texture over 2048 px |

Roku's archived performance and texture pages (sdkdocs-archive.roku.com) and the partner-support
article couldn't be fetched directly from here; their figures above come from search-engine
extracts of those pages. Device codenames are from a community [device chart](https://gist.github.com/triwav/ca8ce871f08b338fc19e0fe2e5e16b94).
These are old devices, and no current numbers are published, so treat them as a conservative floor.

**Measured** (texture and package numbers from `npm run art`; Animation counts from `stats=1` in the
preview):

| | Before | After |
|---|---|---|
| Package, both styles + store art | 7.5 MB | 1.9 MB |
| Texture memory, illustrated | 25.7 MB | 10.4 MB |
| Texture memory, pixel art | 28.3 MB | 16.8 MB |
| Largest texture side | 2556 px | 1278 px |
| Animation nodes at the default Fish setting (Some) | 213 | 58, of which 35 running |
| Running Animations at Few / Lots | – | 18 / 45 |

The "after" figures include the much bigger front reef.

**How:**
- **Build time, not on the Roku.** The art is procedurally generated by `npm run art` and shipped as
  images. Generating it on the device would cost the same texture memory once drawn, plus slow
  BrightScript drawing at startup.
- **Sprites are cropped** to their visible pixels (offsets in `theme.json`).
- **Hidden rows are trimmed:** the build measures, per pixel column, how far up each layer in front
  is solid, and drops the rows of the layers behind it that can never be seen.
- **Soft textures are stored small** (illustrated style: far layer at ½, light rays at ¼, sunlight
  net at ½) and stretched back by the Poster. Pixel art stays full size to stay crisp.
- **Wide textures are split** into pieces under 2048 px.
- **Files are compressed:** palette PNGs where that's lossless (pixel art) or within a tight error
  bound (illustrated); JPEG for the opaque store art and Settings preview.
- **Few Animations, many interpolators:** one Animation per creature for all its fins, tails, frames
  and school wobble; one for all plants; one for all scrolling (speeds in a 1:2:4 ratio); one for the
  light cycle; one for the sunlight; three looping ones for bubbles, which need no script at all.
  Far-away fish don't animate their fins.
- **Fewer full-screen layers:** the light cycle's bright and dark veils are one Rectangle, and the
  night overlay and sunlight are hidden while they're invisible.

Still to check on real hardware: `npm run console -- r2d2_bitmaps` for actual texture use, and
`npm run console -- chanperf 10` for CPU, ideally on a basic Roku Express.

## How it works

- `src/source/main.brs`: Roku's entry points, `RunScreenSaver()` and `RunScreenSaverSettings()`.
- `src/components/AquariumScene`: builds the tank from the active style's `theme.json`, in depth
  layers (far/mid/near fish sit between backdrop layers). It also runs the burn-in motions,
  day/night lighting and visitor scheduling.
- `src/components/Fish`: every creature, including the critters that walk the reef floor. All
  motion is `Animation` nodes on the render thread. BrightScript only picks the next waypoint when a
  swim finishes, so it stays smooth on low-end Rokus. One rule to keep: never restart an Animation
  from its own `state` callback (continue through a Timer or a second Animation instead). In
  brs-engine that leaves the animation "running" but unscheduled, and the creature freezes.
- Plants are built directly by the scene and swayed by one shared Animation. `BubbleField`,
  `LightRays` and `ClockOverlay` are the other ambient pieces. `SettingsScene` edits the preferences,
  saved in the registry (`components/prefs.brs`).
- `art/`: art sources and the contract between art and engine ([art/README.md](art/README.md)).
  `art/species.json` holds creature behavior; each style's `sprites.json` holds its images and
  animations.
