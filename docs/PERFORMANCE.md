# Performance

Cheap Rokus are slow and short on graphics memory. Reef Tank is built against the limits Roku and
its developers have published, and measured on a real device.

## The limits

| Limit | Source | Target |
|---|---|---|
| Animations running at once | Roku's Performance FAQ: ~800 fine on a high-end device, visible lag at ~50 on "Giga" devices (Roku 2 HD/XD/XS, LT 2400X) and trouble at ~20 on "Tyler" (Roku 1/SE/2/LT 2700X–2720X) | under 50 at every setting |
| Texture memory | Every image costs width × height × 4 bytes once loaded, whatever its file format ([Roku memory management](https://developer.roku.com/dev/docs/memory-management)). Per-device budgets aren't published; Roku partner support cites ~20 MB (Tyler) and ~44–45 MB (Giga) | under 20 MB per style |
| Package size | A 4 MB certification cap, as cited on [Roku's developer forum](https://forum.developer.roku.com/t/package-file-size-limit/8342) | under 4 MB |
| Bitmap size | 2048 px per side, widely reported by developers ([forum](https://community.roku.com/t5/Roku-Developer-Program/WARNING-Max-Bitmap-Size-Changing/td-p/293797)) but not confirmed by Roku | no texture over 2048 px |

Roku's archived performance and texture pages (sdkdocs-archive.roku.com) and the partner-support
article couldn't be fetched directly while this was researched, so the figures above come from
search-engine extracts of those pages. Device codenames are from a community
[device chart](https://gist.github.com/triwav/ca8ce871f08b338fc19e0fe2e5e16b94). These are old
devices and no current numbers are published, so treat them as a conservative floor.

## Measured

**Build** (from `npm run art`, which prints a budget line per style, and `stats=1` in the preview):

| | Before optimizing | Now |
|---|---|---|
| Package, all styles | 7.5 MB (two styles) | 3.5 MB (three styles) |
| Texture memory, realistic (estimate: every texture) | – | 13.5 MB |
| Texture memory, illustrated (estimate: every texture) | 25.7 MB | 14.4 MB |
| Texture memory, pixel art (estimate: every texture) | 28.3 MB | 17.9 MB |
| Largest texture side | 2556 px | 1278 px |
| Animation nodes at the default Fish setting | 213 | 58, of which 35 running |
| Running Animations at Few / Lots | – | 18 / 45 |

The build estimate counts every texture; a device only loads what's on screen.

**On a Roku Ultra 4670X, Roku OS 16.0.4,** with the art from the 3D models, using the debug console
(`npm run console`): `r2d2_bitmaps` for texture memory, `chanperf` for CPU, and `fps_display 1`
for Roku's own frame-rate overlay (read from screenshots, three samples per case, visitors off):

| | Realistic | Illustrated | Pixel art |
|---|---|---|---|
| Frame rate, default fish (Some), day | **51** fps | **49–51** fps | **49–50** fps |
| Frame rate, default fish, night | **51–52** fps | **49** fps | **49** fps |
| Frame rate, Lots, day | **48–49** fps | **46–47** fps | **45–46** fps |
| Texture memory actually loaded | 11.9 MB | 12.2 MB | 15.7 MB |
| CPU / process memory | 8–9% / ~20 MB | 8–9% / ~20 MB | 7–10% / ~20 MB |

Texture memory is the most seen for the style's own images. Roku keeps images cached between
launches, so it includes species that had swum by in earlier runs, an upper bound. With the
earlier hand-drawn art the same device measured 49–52 fps (illustrated, default fish, day) and
45–46 fps (pixel art, Lots, day), so moving to the 3D models didn't change the frame rate.

What each feature cost per frame, measured with the hand-drawn art by switching it off with the
dev-only `off=` launch option (pixel art, Lots): light rays ~6 fps, a second sunlight layer ~3, a
full-screen night overlay ~5, fish and critters together ~8, plants and bubbles nothing measurable.
With everything off but the backdrop it runs at 60 fps. The CPU is nearly idle; the limit is the
GPU blending large semi-transparent images.

Not yet measured: a basic Roku such as a Roku Express. Reports welcome.

## How the build stays small

The art is generated ahead of time (3D models rendered by Blender with `npm run models`, then
`npm run art`) and shipped as images. Drawing it on the Roku instead would cost the same texture
memory once drawn, plus slow BrightScript drawing at startup, and the Roku has no 3D or vector
renderer for screensavers anyway. The build then optimizes what it ships:

- **Sprites are cropped** to their visible pixels, with offsets in `theme.json`.
- **Hidden rows are trimmed.** The build measures, for every pixel column, how far up each layer in
  front is solid, and drops the rows of the layers behind it that can never be seen.
- **Soft textures are stored small** (realistic and illustrated: far layer at ½, light rays at ¼,
  sunlight net at ½) and stretched back by the Poster. Pixel art stays full size to stay crisp.
- **Wide textures are split** into pieces under 2048 px.
- **Files are compressed:** pixel art as lossless palette PNGs (it uses one 160-color palette);
  realistic and illustrated textures as 256-color palette PNGs when the average error stays under
  5/255 (invisible at screen size, and about 30% smaller); JPEG for the opaque Settings preview and
  store icons. All three styles fit in about 3.5 MB of the 4 MB package limit.
- **No splash image.** A full-screen splash stayed loaded at 8.4 MB, so the manifest only sets
  `splash_color`.

## How the engine stays light

- **Few Animations, many interpolators:**
  - one Animation per creature for all its fins, tails, frames and school wobble
  - one for all plants
  - one for all scrolling (speeds in a 1:2:4 ratio)
  - one each for the light cycle and the sunlight
  - three looping ones for bubbles, which need no script at all
- **Single-image sprites** for school members and far-away fish, which don't animate their fins.
- **Fewer big transparent layers:**
  - three narrow light rays
  - one sunlight layer
  - the light cycle's bright and dark veils as one Rectangle
  - night as a tint on every image (`blendColor`) instead of a full-screen layer
- **No work between events:** BrightScript only runs when a swim, turn or walk finishes, or when the
  lighting is updated once a minute.
