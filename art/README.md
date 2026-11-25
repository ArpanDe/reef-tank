# Art contract

Reef Tank ships two art styles, **illustrated** and **pixel**. Each lives in its own folder
(`art/illustrated/`, `art/pixel/`) with a `sprites.json` that lists every image and how it animates.
`npm run art` (`scripts/render-art.mjs`) turns them into PNGs under `src/images/themes/<style>/`
plus a `theme.json` the Roku scene loads.

All art is **original**. Draw generic real-world reef species in your own composition. Don't imitate
the Aquatic Life / SereneScreen "Marine Aquarium" screensaver, or any film or game character.

## Checking your work

```bash
node scripts/render-art.mjs illustrated   # or: pixel
```

The script prints warnings and writes three review images:

- `out/art-<style>-sheet.png`: every sprite on a grid, at final size
- `out/art-<style>-scene.png`: a half-size mock of the whole tank (backdrop, plants, fish, rays)
- `out/art-<style>-scene-full.png`: the same mock at full 1920×1080
- `out/art-<style>-seams.png`: each tiling backdrop's right edge joined to its left edge

## Screen and layers

The screen is 1920×1080. Back to front:

1. `water`: vertical gradient, stretched horizontally across the screen
2. `far`: distant rock/reef silhouettes, bottom-anchored
3. far fish (engine scales them by `bandScale.far` and tints them blue)
4. `reef`: midground rocks and corals, bottom-anchored
5. mid fish
6. plants (rooted just behind the floor)
7. near fish
8. `floor`: the reef floor strip, bottom-anchored, drawn in front of everything above
9. critters, walking along the front part of the floor
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
| `floor` | 2556 × 200–280 | Tiles. A **coral garden on warm coral sand** (golden or cream, never grey gravel or pale bone-like fragments): coral heads, clams, sponges, anemones and zoanthid carpets, grouped in textured clusters rather than lone rounded domes. The top edge is irregular, with coral heads poking up. The **bottom ~45%** is the ground critters walk on, so keep it fairly low and horizontal (rubble, encrusting coral, sand pockets) with no tall objects; taller features belong in the upper part |
| `ray` | 360 × 1100 | One soft light shaft, **white** with alpha falloff (the engine tints it and sets opacity) |
| `bubbles` | 3 files | Small, medium, large (illustrated ≈14/22/34 px) |
| `caustics` | 960 × 540 | The dancing sunlight net on a shallow sea floor: thin, soft, wavy **white** lines in a cellular pattern, transparent elsewhere. The engine stretches two copies 2× over the tank at low opacity and drifts them past each other. Doesn't need to tile |

## Creatures

Every creature is drawn **facing right**. The engine mirrors it to swim left.

A creature is a list of **parts**, drawn back to front. **All parts of one creature share the same
canvas size** (same SVG viewBox or grid size), so they line up with no offsets. A part that moves
(a tail) must reach under the part in front of it (the body), so no gap opens when it rotates.

| id | Illustrated canvas (px) | Pixel grid (cells, ×6) | Suggested parts |
|---|---|---|---|
| clownfish | 180 × 110 | 30 × 18 | tail (wag), body |
| bluetang | 240 × 150 | 40 × 25 | tail (wag), body |
| yellowtang | 200 × 190 | 34 × 32 | tail (wag), body |
| angelfish | 200 × 240 | 34 × 40 | tail (wag), body (long trailing fins are part of the body) |
| pufferfish | 170 × 140 | 28 × 24 | tail (wag), body |
| seahorse | 90 × 200 | 15 × 34 | dorsal fin (wag, small amp), body. Upright, faces right |
| chromis | 70 × 34 | 12 × 6 | tail (wag), body. Small blue-green reef fish, shown in clouds of 8–14 |
| anthias | 80 × 40 | 13 × 7 | tail (wag), body. Small orange-pink reef fish, shown in clouds of 8–14 |
| turtle | 420 × 300 | 70 × 50 | rear flipper (wag), body (shell, head), front flipper (wag) |
| manta | 520 × 300 | 86 × 50 | far wing (wag), body, near wing (wag). Gliding, three-quarter view |
| jellyfish | 160 × 300 | 26 × 50 | tentacles (wag, small amp, pivot at the bell), bell (pulse) |
| crab | 120 × 80 | 20 × 14 | legs (wag, small amp; pixel: frameA/B), body, claws (wag, small). Seen from the front-side, walks sideways |
| hermitcrab | 110 × 90 | 18 × 15 | legs (wag; pixel: frameA/B), shell + body. Spiral shell on top, legs and claws peeking out the front (right) |
| seastar | 110 × 110 | 18 × 18 | body (pulse, very small amp). Five arms, seen from slightly above, textured |
| nudibranch | 120 × 50 | 20 × 8 | body, gills / rhinophores (pulse or wag). Brightly patterned sea slug |
| shrimp | 110 × 60 | 18 × 10 | legs + tail fan (wag; pixel: frameA/B), body, antennae (wag). Banded cleaner shrimp |

**Critters** (crab, hermitcrab, seastar, nudibranch, shrimp) walk along the floor at full size
(no depth scaling). Draw them with their feet on the bottom edge of the canvas, so the engine can
stand them on the ground. Keep their colors readable against coral rubble.

Pixel creatures use two alternating frames instead of rotation: `frameA` and `frameB` parts for the
tail (or wings, or bell), plus the static body.

### Part animations

| `anim` | What the engine does | Fields |
|---|---|---|
| `none` (default) | Static | |
| `wag` | Rotates back and forth around `pivot` | `amp` radians (default 0.3), `period` seconds (default: from swim speed) |
| `pulse` | Squashes around `pivot`: scale [1+amp, 1−amp] and back | `amp` (default 0.08), `period` (default 2.4) |
| `frameA` / `frameB` | Two-frame flip: A shows for the first half of each period, B the second | `period` (default: from swim speed) |

`pivot` is `[x, y]` in **source units**: SVG user units (px) for illustrated, grid cells for pixel.
render-art converts it to final pixels.

## Plants

A plant is a stack of upright **segments**, bottom to top. Each segment's **bottom-center** attaches
to the **top-center** of the segment below. The engine rotates each segment a little with a phase lag,
so the whole stem sways. Segment widths ≤ 120 px, heights 60–140 px, 3–7 segments per plant.
Make at least 3 plant types, all tropical (for example tall gorgonian sea whips, short sea grass, anemone). No kelp: it's a cold-water plant.

## sprites.json

```jsonc
{
  "pixelScale": 6,                                   // pixel style only: integer upscale for .txt / .px.mjs
  "bandScale": { "far": 0.5, "mid": 0.75, "near": 1 }, // pixel: use 0.5 / 0.8333 / 1 so 6-px cells stay crisp
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
