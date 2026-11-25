# Reef Tank

An original, open-source aquarium screensaver for Roku. A sunlit coral reef scrolls slowly past
while fish swim, schools of small reef fish drift by, crabs and shrimp wander the sand, sea whips
sway, and now and then a sea turtle, manta ray or jellyfish passes through.

It started as a home-made replacement for Roku's Aquatic Life screensaver, which Roku is retiring
on December 1, 2026. Nothing here comes from Aquatic Life: all the art is original.

![Reef Tank in the illustrated style, on a Roku Ultra](docs/images/illustrated.jpg)

| Pixel art style | Night, with the clock on |
|---|---|
| ![Reef Tank in the pixel art style](docs/images/pixel.jpg) | ![Reef Tank at night with the clock](docs/images/night.jpg) |

<sub>Screenshots taken on a Roku Ultra.</sub>

## Features

- **Two art styles:** illustrated, or retro pixel art.
- **A living reef:** clownfish, blue and yellow tangs, angelfish, a pufferfish, a seahorse, and
  schools of chromis and anthias. Crabs, a hermit crab, a sea star, a nudibranch and a cleaner
  shrimp walk the sand. A big parallax reef scrolls past with swaying sea whips, anemones,
  bubbles, light rays and dancing sunlight.
- **Rare visitors:** a sea turtle, manta ray or jellyfish every few minutes.
- **Lighting that follows the time of day,** with dusk, a moonlit blue night and dawn.
- **An optional clock** (12- or 24-hour) that moves around the screen.
- **Burn-in protection you can measure:** every pixel changes within every 5 minutes, day or
  night, and there's a test that proves it. See [docs/BURN-IN.md](docs/BURN-IN.md).
- **Light enough for cheap Rokus:** a ~2 MB package, ~12–18 MB of texture memory, and few
  simultaneous animations, measured on real hardware. See [docs/PERFORMANCE.md](docs/PERFORMANCE.md).
- **No ads, no network access, no tracking.**

## Install it on your Roku

Reef Tank isn't in the Roku Channel Store, so you install it yourself using Roku's Developer
Mode. It should work on any current Roku player or Roku TV; so far it's been tested on a Roku
Ultra (reports from other models are welcome). You need a computer on the same network with
[Node.js](https://nodejs.org/) 20 or newer and git.

1. **Turn on Developer Mode.** On the Roku remote, press **Home ×3, Up ×2, Right, Left, Right,
   Left, Right**. On the screen that appears, note the IP address, choose **Enable installer and
   restart**, accept the license, and set a password. The username is always `rokudev`.
2. **Get the code and point it at your Roku:**
   ```bash
   git clone <this repository's URL> reef-tank
   cd reef-tank
   npm install
   cp .env.example .env
   ```
   Edit `.env` and set `ROKU_HOST` to your Roku's IP and `ROKU_PASSWORD` to the password you chose.
   `.env` is gitignored, so your password stays on your machine.
3. **Build and install:**
   ```bash
   npm run deploy
   ```
4. **Make it your screensaver:** on the TV, go to **Settings › Theme › Screensavers › Change
   screensaver** and choose **Reef Tank**.

### Settings

Reef Tank's settings are on the Screensavers settings screen; the wording varies by Roku OS
version. Highlight a setting and press OK to change it.

| Setting | Options |
|---|---|
| Art style | Illustrated, Pixel art |
| Scrolling | Slow, Medium, Fast |
| Fish | Few, Some, Lots |
| Clock | Off, 12-hour, 24-hour |
| Lighting | Follow time of day, Always day, Always night |
| Rare visitors | On, Off |

To uninstall, repeat the remote sequence from step 1 and choose **Disable installer and restart**.
A Roku holds one sideloaded app at a time, so installing something else also replaces it.

## Try it without a Roku

```bash
npm install
npm run preview
```

This opens <http://localhost:6502>, which runs the real screensaver code in
[brs-engine](https://github.com/lvcabral/brs-engine), a Roku simulator for the browser. Controls on
the page switch the style, scrolling, fish, time of day, clock and visitors, and open the Settings
screen.

## Documentation

- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md): commands, dev launch options, how the code is
  organized, and Roku behaviors worth knowing about.
- [docs/BURN-IN.md](docs/BURN-IN.md): how the burn-in guarantee works and how it's tested.
- [docs/PERFORMANCE.md](docs/PERFORMANCE.md): Roku's limits, how the build stays under them, and
  measurements from a real device.
- [art/README.md](art/README.md): the art spec, for adding creatures, plants or a new style.
- [docs/STORE.md](docs/STORE.md): what publishing to the Roku Channel Store would take.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License and credits

[MIT](LICENSE), for both the code and the art.

Built with [Claude Code](https://claude.com/claude-code): the code and art were written with AI
assistance, then tested in the simulator and on real Rokus. It stands on
[brs-engine](https://github.com/lvcabral/brs-engine), the
[RokuCommunity](https://github.com/rokucommunity) tools
([BrighterScript](https://github.com/rokucommunity/brighterscript),
[bslint](https://github.com/rokucommunity/bslint),
[roku-deploy](https://github.com/rokucommunity/roku-deploy)),
[resvg-js](https://github.com/thx/resvg-js), [sharp](https://sharp.pixelplumbing.com/) and
[pngjs](https://github.com/pngjs/pngjs).

Reef Tank is not affiliated with or endorsed by Roku, Inc. Roku is a trademark of Roku, Inc.
Aquatic Life and Marine Aquarium belong to their respective owners.
