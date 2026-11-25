# Burn-in protection

A screensaver is only useful if it doesn't wear a picture into the panel. Reef Tank guarantees
that **every pixel's red, green and blue values each change by at least 12/255 within every
5 minutes**, day or night, at any Scrolling setting.

## How

The guarantee doesn't count on fish, bubbles or light rays happening to be in the right place. It
comes from two deterministic motions (`burnInConfig()` in `src/components/AquariumScene.brs`):

1. **Parallax scroll.** The far rocks, the reef, and the front reef with its plants slide left
   forever at 4, 8 and 16 px/s (×2 or ×3 with the Scrolling setting). Each backdrop is a seamless
   2556 px tile drawn twice side by side, so the scroll never ends or jumps. There's deliberately
   no "off" setting.
2. **Light cycle.** Every 5 minutes a faint bright veil (12%) fades in and out, then a faint dark
   veil (15%). Any channel value c moves by at least max(0.12 × (255 − c), 0.15 × c), about 16/255
   or more. Night dimming is applied as a tint on the images underneath the veil, so the guarantee
   also holds at night.

The optional clock moves to a new spot every minute.

## How it's tested

The browser preview (`npm run preview`) has a **Burn-in audit** button. It launches the screensaver
with only those two motions running (no fish, bubbles, rays, visitors or clock) at 10× speed,
samples all 2,073,600 pixels of every frame, and fails if any pixel's R, G or B didn't move by
12/255 within 5 minutes of real time. It also draws a map of any pixels that failed.

Latest results, at the slowest Scrolling setting:

| Style | Lighting | Result | Half of pixels changed by | Slowest pixel changed after |
|---|---|---|---|---|
| Illustrated | Day | PASS | 0 min 28 s | 2 min 25 s |
| Illustrated | Night | PASS | 1 min 30 s | 2 min 20 s |
| Pixel art | Day | PASS | 0 min 17 s | 2 min 23 s |
| Pixel art | Night | PASS | 0 min 22 s | 1 min 58 s |

These are measured in the simulator, not on a Roku. The motions are the same `Animation` nodes on a
device; the simulator just lets every pixel be sampled.

Run the audit again after changing the backdrops, the scroll speeds, the light cycle or the night
lighting.
