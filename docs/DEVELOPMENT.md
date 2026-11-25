# Development

## Setup

You need [Node.js](https://nodejs.org/) 20 or newer. For on-device work you also need a Roku in
Developer Mode, with its address and password in `.env` (see the [README](../README.md#install-it-on-your-roku)).

To change the 3D models behind the art styles you also need
[Blender](https://www.blender.org/download/) 5.2 or newer (`npm run models` looks for it in
`$BLENDER`, then `~/.local/opt/blender-*/`, then on your `PATH`). You don't need Blender to build:
the rendered images are committed in `art/models/renders/`.

```bash
npm install
```

## Commands

| Command | What it does |
|---|---|
| `npm run preview` | Builds, then runs the real dev build in your browser at <http://localhost:6502> using [brs-engine](https://github.com/lvcabral/brs-engine). No Roku needed. Page controls switch style, scrolling, fish, time of day, clock and visitors; **Save frame** writes the current frame to `out/screens/`; **Burn-in audit** runs the [burn-in test](BURN-IN.md). In the Settings screen, arrows move, Enter is OK, Escape is Back |
| `npm run models -- [ids]` | Renders the 3D models in `art/models/` with Blender, realistic into `art/models/renders/` and cel-shaded into `art/models/renders-toon/` (all of them, or just the ids or modules named, e.g. `clownfish` or `critters`). Add `--samples 32 --review out/models` for quick drafts with review images |
| `npm run art` | Builds all three styles into the images and `theme.json` the screensaver loads, plus review images in `out/`: Realistic from the realistic renders, Illustrated and Pixel from the cel-shaded ones |
| `npm run lint` | Compiles and lints all BrightScript (BrighterScript + bslint) |
| `npm run build` | `art` + `lint` |
| `npm run deploy` | Builds and sideloads a **dev build** to the Roku in `.env` |
| `npm run deploy:release` | Builds and sideloads the **release build** (without the dev entry point) |
| `npm run launch -- <options>` | Starts the screensaver on the Roku now, with the dev options below |
| `npm run settings` | Opens the Settings screen on the Roku |
| `npm run shot -- <name>` | Saves a Roku screenshot to `out/screens/<name>.jpg` |
| `npm run logs` | Streams the Roku's BrightScript console (Ctrl-C to stop) |
| `npm run console -- "<command>" [seconds]` | Runs a debug-console command on the Roku, for example `chanperf -r 2` (CPU), `r2d2_bitmaps` (texture memory) or `fps_display 1` (frame-rate overlay) |
| `npm run zip` | Builds the release zip at `out/reef-tank.zip` |
| `npm run package` | Builds a signed `.pkg` for the Channel Store (see [STORE.md](STORE.md)) |

## Dev launch options

Dev builds include `src/source/devMain.brs`, a `Main()` that lets Roku's External Control Protocol
launch the screensaver with options. Release builds leave it out, because Roku doesn't allow
`Main()` in screensavers. Pass options to `npm run launch` as `name=value`, or use the preview's
controls.

| Option | Effect |
|---|---|
| `style=illustrated\|photo\|pixel`, `scroll=1\|2\|3`, `fish=8\|14\|22`, `clock=off\|12\|24`, `lighting=auto\|day\|night`, `visitors=on\|off` | Override the saved settings |
| `hour=13` | Pretend it's this hour (0–24, decimals allowed) for the lighting |
| `visitor=turtle\|manta\|jellyfish` | Bring in that visitor after 3 seconds, and again 15 seconds after each one leaves |
| `mode=settings` | Open the Settings screen instead |
| `stats=1` | Print a count of every node type 3 seconds after start, including running Animations |
| `off=rays,caustics,…` | Switch single features off to measure what they cost: `caustics`, `rays`, `veil`, `plants`, `bubbles`, `fish`, `critters` |
| `ambient=off` | Only the deterministic burn-in motions: no fish, critters, bubbles, rays, sunlight, visitors or clock |
| `timescale=10` | Speed up the scroll and light cycle (used by the burn-in audit) |

Example:

```bash
npm run launch -- style=pixel fish=22 hour=23 clock=12 visitor=turtle
```

## How the code is organized

```
art/                  art sources, the art spec (art/README.md), creature behavior (species.json)
art/models/           Blender scripts that build every creature, plant and reef layer in 3D
art/models/renders/   realistic renders: the Realistic (photo) style
art/models/renders-toon/  cel-shaded renders: the Illustrated and Pixel styles
art/<style>/          per-style settings (sprites.json), light ray and caustics
scripts/models.mjs    runs Blender on art/models/render.py
scripts/render-art.mjs  turns art/ into device textures + theme.json, and review images in out/
scripts/roku.mjs      deploy, launch, screenshots, logs, debug console, packaging
scripts/preview-server.mjs, preview/  the in-browser preview
src/manifest          the Roku app manifest
src/source/           Roku entry points: RunScreenSaver, RunScreenSaverSettings (+ dev Main)
src/components/       SceneGraph components
```

- **`AquariumScene`** loads the active style's `theme.json` and builds the tank in depth layers:
  far, mid and near fish sit between the backdrop layers. It owns the scrolling, the plants, the
  burn-in light cycle, day/night lighting and visitor scheduling.
- **`Fish`** is every creature: fish, schools, the seahorse, visitors, and the critters that walk
  the sand. All motion is `Animation` nodes on Roku's render thread. BrightScript only runs to pick
  the next destination when a swim, turn or walk finishes.
- **`BubbleField`**, **`LightRays`** and **`ClockOverlay`** are the other ambient pieces.
  **`SettingsScene`** edits the preferences, which are saved in the registry (`prefs.brs`).
- **Art** comes from one set of 3D models (`art/models/`), rendered realistic and cel-shaded.
  render-art scales the realistic renders for Realistic and the cel renders for Illustrated, and
  down-rezzes the cel renders to 6-px cells with one shared palette for Pixel. Behavior is in
  `art/species.json`. See [art/README.md](../art/README.md) to add creatures, plants or a style.

## Roku behaviors worth knowing

These each cost real debugging time:

- **Roku can't mirror an image.** A negative `scale` (or width) moves child images to mirrored
  positions but draws the images themselves unflipped. Creatures that turn get pre-mirrored art
  from the build, and a turn squashes the sprite, swaps the art, and stretches it back.
- **Rotate parts around a joint Group.** A moving part (a tail, a fin) hangs off a Group placed at
  its attachment point and rotates around the Group's own origin. Rotating a Poster around an
  off-center `scaleRotateCenter` inside a moving creature drew detached tails on a real Roku.
- **Never restart an Animation from its own `state` callback.** Continue through a Timer or a
  second Animation instead. In brs-engine, an Animation restarted inside its own "stopped"
  notification is left "running" but never advances, and the creature freezes.
- **`Animation.delay` is re-applied on every repeat.** Use phase-shifted keyframes, not `delay`,
  to put loops out of step, or they pause every cycle.
- **The GPU is the bottleneck, not the CPU.** Big semi-transparent images (full-screen overlays,
  light shafts) cost frame rate; plants and bubbles cost almost nothing. Measure with
  `fps_display 1` and the `off=` option.
- **Every loaded image costs width × height × 4 bytes**, whatever its file format. A full-screen
  splash alone is 8.4 MB.
- **The simulator isn't the device.** brs-engine is excellent for fast iteration and for things
  like the burn-in audit, but it mirrors images (a Roku doesn't), its timing differs in places, and
  it doesn't show GPU limits. Check visual changes on a real Roku.
