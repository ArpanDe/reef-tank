# Art contract

Reef Tank ships three art styles, all made from one set of 3D models (`art/models/`, built and
rendered with Blender). Each style has a folder with a `sprites.json`:

- **Realistic** (`art/photo/`): the realistic renders, scaled to size.
- **Illustrated** (`art/illustrated/`): the same models rendered cel-shaded with ink outlines.
- **Pixel art** (`art/pixel/`): the cel-shaded renders, down-rezzed to 6-px cells.

So a new creature is one model, and it appears in all three styles. See
[3D models](#3d-models). Light rays and caustics are small procedural textures drawn per style.

`npm run art` (`scripts/render-art.mjs`) turns them into PNGs under `src/images/themes/<style>/`
plus a `theme.json` the Roku scene loads.

All art is **original**. Draw generic real-world reef species in your own composition. Don't imitate
the Aquatic Life / SereneScreen "Marine Aquarium" screensaver, or any film or game character.

## What reaches the Roku

You draw at full size; `render-art` writes optimized textures for the device: sprites cropped to
their visible pixels, backdrop rows hidden behind solid layers in front trimmed off, soft textures
(illustrated far layer, rays, caustics) stored smaller, wide textures split under 2048 px, and PNGs
palette-compressed where that's lossless or visually identical. It prints the texture-memory and
file-size totals for each style; keep each style under 20 MB of texture memory.

**Keep the front reef (`floor`) fully opaque from the bottom up to its crown.** The build uses that
solid region to drop the hidden parts of the layers behind it, so any see-through gap costs memory.

## Checking your work

```bash
node scripts/render-art.mjs illustrated   # or: photo, pixel
```

The script prints warnings and writes three review images:

- `out/art-<style>-sheet.png`: every sprite on a grid, at final size
- `out/art-<style>-scene.png`: a half-size mock of the whole tank (backdrop, plants, fish, rays)
- `out/art-<style>-scene-full.png`: the same mock at full 1920×1080
- `out/art-<style>-seams.png`: each tiling backdrop's right edge joined to its left edge

## 3D models

Every creature, plant, bubble and reef layer is built in code in `art/models/*.py` (Blender's
Python API). Nothing is modeled by hand or downloaded: meshes come from numbers (lofted fish
bodies, fin sheets, tubes, lumpy rock), and materials from shader nodes and small numpy-painted
textures. Each model is built once and rendered twice:

- **realistic**, with Cycles and the Khronos PBR Neutral view (which keeps saturated reef colors
  true), into `art/models/renders/`;
- **cel-shaded**, with EEVEE: `art/models/toon.py` turns every material into its own colors times
  two or three flat light bands (cast shadows band too), and Freestyle draws the ink lines, into
  `art/models/renders-toon/`.

```bash
npm run models -- clownfish --samples 32 --review out/models   # quick draft of one model
npm run models                                                 # everything, full quality
npm run art                                                    # then rebuild the styles
```

`npm run models` writes both render sets (committed, so building doesn't need Blender): PNGs plus
one `<id>.json` per model with its canvas size, parts, pivots and motions. `--review` also writes
`out/models/<id>.png` (and `out/models/toon/<id>.png`): the model over water blue in its neutral
pose, then the two Pixel frames. `--sets photo` or `--sets toon` renders just one set.

**The contract** is in the docstring of `art/models/render.py`. In short:

- 1 Blender unit = 100 px at final size. The camera looks along +Y; Z is up; creatures face +X.
- A creature is a list of **parts**, each rendered on its own and drawn back to front. A part that
  moves names its engine motion for Realistic (`anim`, `amp`, and a `pivot` point) and a `pose`:
  two real 3D poses (a fin turned toward and away from the viewer, a wing up and down), which
  become Pixel's two alternating frames.
- Critters set `feet`, so the canvas bottom is their lowest point.
- A plant stands on the origin. It's rendered whole and sliced into stacked sway segments.
- Backdrop layers tile: everything is periodic in X with the tile's width (see `reef.py`), and the
  water gradient and each layer's haze come from the same colors, so far layers melt into the
  water behind them.

**How Pixel is made from the cel renders** (`scripts/render-art.mjs`). It uses the cel-shaded set
rather than the realistic one, as pipelines like Dead Cells' do: flat bands down-rez into clean
pixel clusters, while realistic shading turns into blotches. One palette for the whole style
(libimagequant via sharp, then merged to 160 colors with a weighted k-means in OKLab); every source
pixel is snapped to that palette and each 6-px cell takes its most common color, so edges stay
crisp and flat colors stay pure instead of averaging to mud; alpha is cut at 50% except on
see-through art (bubbles, jellyfish), which keeps a few levels; creatures and plants get a darker
outline on their silhouette. Moving parts are separate images, so a body never changes between
frames and doesn't flicker.

## Screen and layers

The screen is 1920×1080. Back to front:

1. `water`: vertical gradient, stretched horizontally across the screen
2. `far`: distant rock/reef silhouettes, bottom-anchored
3. far fish (engine scales them by `bandScale.far` and tints them blue)
4. `reef`: midground rocks and corals, bottom-anchored
5. mid fish
6. plants (rooted just behind the floor)
7. near fish
8. `floor`: the front reef, bottom-anchored, drawn in front of everything above
9. critters, walking along the sand ledge at the front reef's base
10. light rays, bubbles, visitors

### Backdrops tile and scroll

To prevent burn-in, the scene **scrolls `far`, `reef` and `floor` sideways forever** at different
speeds (parallax). Each layer is drawn twice side by side, so **every backdrop must tile
seamlessly**: the right edge has to flow into the left edge with no visible join. Backdrop layers
are **2556 px wide** (426 cells in pixel style).

To make a layer seamless:
- Place features at x modulo 2556. Draw any feature that crosses an edge a second time at x ± 2556.
- Make continuous outlines (ridgelines, the floor's top edge) periodic. For example, use a sum of
  sines whose periods divide 2556, or noise sampled around a circle.
- Check `out/art-<style>-seams.png`, which shows each layer's right edge joined to its left edge.
  The scene mocks put that seam in the middle of the screen.

Since the reef slides past, there's no fixed middle to keep clear. Instead, alternate taller
clusters with low stretches every ~700–1100 px, so open water keeps passing through the fish zone
(y 150–750). Avoid big flat runs of a single color; texture everywhere helps every pixel change.

| Key | Size (px) | Notes |
|---|---|---|
| `water` | 8 × 1080 | Bright near the surface, deep blue at the bottom. Stretched horizontally. Keep it a smooth, steady gradient top to bottom (no flat bands) so vertical sway changes every row |
| `far` | 2556 × ≤600 | Tiles. Low contrast, blue-shifted, like it's far away through water |
| `reef` | 2556 × ≤540 | Tiles. A **healthy, crowded tropical reef**: rock ~85%+ covered by living coral, sponges, anemones and clams, in saturated colors. It may sit slightly darker and bluer than the floor for depth, but never desaturated. Pale, white or grey corals read as dead (bleached) coral, and big bare rock mounds read as tombstones: avoid both |
| `floor` | 2556 × 360–440 | Tiles. The **front reef**: a massive wall of big, bold coral formations (brain and boulder corals 120–260 px, thickets 150–250 px tall, table corals 200–360 px wide, sponges, anemone beds, clams), **fully opaque from the bottom up to at least 280 px** (it always covers the bottom quarter of the screen), with an irregular crown rising to 360–440 px. Cave mouths and crevices are painted dark, never left transparent. The **bottom 90 px** is the ledge critters walk on: warm coral sand, low carpets and polyps, nothing taller than ~20 px. The most saturated and detailed layer after the fish |
| `ray` | 360 × 1100 | One soft light shaft, **white** with alpha falloff (the engine tints it and sets opacity) |
| `bubbles` | 3 files | Small, medium, large (illustrated ≈14/22/34 px) |
| `caustics` | 960 × 540 | The dancing sunlight net on a shallow sea floor: thin, soft, wavy **white** lines in a cellular pattern, transparent elsewhere. The engine stretches two copies 2× over the tank at low opacity and drifts them past each other. Doesn't need to tile |

## Creatures

Every creature is drawn **facing right**. The engine mirrors it to swim left.

A creature is a list of **parts**, drawn back to front. **All parts of one creature share the same
canvas size** (same SVG viewBox or grid size), so they line up with no offsets. A part that moves
(a tail) must reach under the part in front of it (the body), so no gap opens when it rotates.

| id | Canvas (px) | Suggested parts |
|---|---|---|
| clownfish | 180 × 110 | tail (wag), body |
| bluetang | 240 × 150 | tail (wag), body |
| yellowtang | 200 × 190 | tail (wag), body |
| angelfish | 200 × 240 | tail (wag), body (long trailing fins are part of the body) |
| pufferfish | 170 × 140 | tail (wag), body |
| seahorse | 90 × 200 | dorsal fin (wag, small amp), body. Upright, faces right |
| chromis | 70 × 34 | tail (wag), body. Small blue-green reef fish, shown in clouds of 8–14 |
| anthias | 80 × 40 | tail (wag), body. Small orange-pink reef fish, shown in clouds of 8–14 |
| turtle | 420 × 300 | rear flipper (wag), body (shell, head), front flipper (wag) |
| manta | 520 × 300 | far wing (wag), body, near wing (wag). Gliding, three-quarter view |
| jellyfish | 160 × 300 | tentacles (wag, small amp, pivot at the bell), bell (pulse) |
| crab | 120 × 80 | legs (wag, small amp), body, claws (wag, small). Seen from the front-side, walks sideways |
| hermitcrab | 110 × 90 | legs (wag), shell + body. Spiral shell on top, legs and claws peeking out the front (right) |
| seastar | 110 × 110 | body (pulse, very small amp). Five arms, seen from slightly above, textured |
| nudibranch | 120 × 50 | body, gills / rhinophores (pulse or wag). Brightly patterned sea slug |
| shrimp | 110 × 60 | legs + tail fan (wag), body, antennae (wag). Banded cleaner shrimp |

**Critters** (crab, hermitcrab, seastar, nudibranch, shrimp) walk along the floor at full size
(no depth scaling). Draw them with their feet on the bottom edge of the canvas, so the engine can
stand them on the ground. Keep their colors readable against coral rubble.

In the Pixel style a moving part is two alternating frames, `frameA` and `frameB`, rendered from
the part's two 3D poses; the rest of the creature stays still. Realistic fish tails use `sweep`.

### Part animations

| `anim` | What the engine does | Fields |
|---|---|---|
| `none` (default) | Static | |
| `wag` | Rotates back and forth around `pivot` | `amp` radians (default 0.3), `period` seconds (default: from swim speed) |
| `pulse` | Squashes around `pivot`: scale [1+amp, 1−amp] and back | `amp` (default 0.08), `period` (default 2.4) |
| `sweep` | Narrows horizontally toward `pivot` and back, twice per period: a fin swinging toward and away from the viewer, seen from the side | `amp` fraction (default 0.4), `period` (default: from swim speed) |
| `frameA` / `frameB` | Two-frame flip: A shows for the first half of each period, B the second | `period` (default: from swim speed) |

`pivot` is `[x, y]` in **source units**: SVG user units (px) for illustrated, grid cells for
`.txt` / `.px.mjs` art. render-art converts it to final pixels. Model renders carry their pivots in
final pixels already.

## Plants

A plant is a stack of upright **segments**, bottom to top. Each segment's **bottom-center** attaches
to the **top-center** of the segment below. The engine rotates each segment a little with a phase lag,
so the whole stem sways. Segment widths ≤ 120 px, heights 60–140 px, 3–7 segments per plant.
Make at least 3 plant types, all tropical (for example tall gorgonian sea whips, short sea grass, anemone). No kelp: it's a cold-water plant.

## sprites.json

```jsonc
{
  "pixelScale": 6,                                   // pixel style only: cell size (integer upscale)
  "bandScale": { "far": 0.5, "mid": 0.75, "near": 1 }, // pixel: use 0.5 / 0.8333 / 1 so 6-px cells stay crisp
  "models": { "pixel": { "colors": 160 } },          // take backdrop, bubbles, plants and creatures from
                                                     // art/models/renders (then omit those keys below)
  "backdrop": { "water": "water.svg", "far": "far.svg.mjs", "reef": "reef.svg.mjs", "floor": "floor.svg.mjs" },
  "ray": "ray.svg",
  "bubbles": ["bubble-s.svg", "bubble-m.svg", "bubble-l.svg"],
  "plants": [
    { "id": "seawhip", "segments": ["seawhip-1.svg", "seawhip-2.svg", "seawhip-3.svg"], "overlap": 4, "sway": 0.06 }
  ],
  "creatures": {
    "clownfish": {
      "parts": [
        { "file": "clownfish.tail.svg", "anim": "wag", "pivot": [52, 55], "amp": 0.3 },
        { "file": "clownfish.body.svg" }
      ]
    }
  }
}
```

`overlap` is how many px each segment sinks into the one below. `sway` is the max rotation per
segment in radians.

With `models`, only `pixelScale`, `bandScale`, `ray` and `caustics` come from sprites.json; paths may
point into another style's folder (Realistic uses `../illustrated/ray.svg`). `models.pixel` tunes the
Pixel conversion: `colors` (palette size), `saturation` and `contrast` (applied before the palette).

## Source file formats

| Extension | Meaning |
|---|---|
| `.svg` | Rendered at its own `width`/`height` |
| `.svg.mjs` | ES module; `export default function()` returns an SVG string. Use for procedural backdrops (seed your randomness so builds are repeatable) |
| `.txt` | Pixel grid, upscaled by `pixelScale` with nearest-neighbor. Format below |
| `.px.mjs` | ES module; `export default function()` returns `{ width, height, data }` (RGBA `Uint8Array`, low-res), upscaled by `pixelScale` |

Output PNG names drop the source extensions (`clownfish.tail.svg` → `clownfish.tail.png`), so keep
base names unique within a style.

### Pixel `.txt` grids

```text
# comment
palette:
. transparent
k #10141c
o #f26b1d
w #ffffff
g #3fbf5f 80      <- optional alpha (hex 00-ff)
grid:
....kkkk....
..kkoooookk.
```

`art/pixel/palette.txt` (optional, same `palette:` format) is loaded first; a file's own palette
adds to or overrides it. Short rows are padded with transparent cells (with a warning).
