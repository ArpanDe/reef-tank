# Contributing

Thanks for helping. Bug reports, device test results and pull requests are all welcome.

## Reporting a problem

Please include:
- your Roku model and Roku OS version (Settings › System › About)
- the art style and settings you were using
- what you saw. A screenshot helps: with Developer Mode on, `npm run shot -- my-issue` saves one.

**Results from other Roku models are especially useful.** So far Reef Tank has only been tested on a
Roku Ultra. To capture texture memory and frame rate on yours, deploy it and run:

```bash
npm run console -- r2d2_bitmaps
```
```bash
npm run console -- "chanperf -r 2" 12
```
```bash
npm run console -- "fps_display 1"
```

The last one turns on Roku's frame-rate overlay; take a screenshot, then turn it off with
`fps_display 0`.

## Making a change

1. Read [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md), especially "Roku behaviors worth knowing".
2. Before sending a pull request:
   - `npm run build` passes with no warnings: art renders, BrightScript compiles and lints.
   - It works in `npm run preview`.
   - If you touched the backdrops, scrolling, light cycle or night lighting, the preview's
     **Burn-in audit** still passes ([docs/BURN-IN.md](docs/BURN-IN.md)).
   - If you can, check it on a real Roku; the simulator doesn't show everything (see the guide).
3. Keep within the [performance budget](docs/PERFORMANCE.md): under 20 MB of texture memory per
   style (`npm run art` prints it), under 50 running Animations (`npm run launch -- stats=1`), and
   no new large semi-transparent layers without measuring their frame-rate cost.

## Art

New creatures, plants or styles are welcome. Follow the spec in [art/README.md](art/README.md).
All art must be original: no traced or adapted assets from other screensavers, films or games.
