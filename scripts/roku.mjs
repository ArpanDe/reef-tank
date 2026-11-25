#!/usr/bin/env node
// Device helper for the Reef Tank screensaver.
//
//   node scripts/roku.mjs deploy [--release]   sideload src/ (release = without devMain.brs)
//   node scripts/roku.mjs zip --release        build out/reef-tank.zip without sideloading
//   node scripts/roku.mjs launch [k=v ...]     start the dev channel over ECP, args go to Main()
//   node scripts/roku.mjs key <Key> [...]      send ECP keypresses (Home, Select, Down, Back, ...)
//   node scripts/roku.mjs shot [name]          save a screenshot to out/screens/<name>.jpg
//   node scripts/roku.mjs logs [seconds] [--screensaver]
//                                              stream the BrightScript console (port 8085), or
//                                              the screensaver debugger (port 8087)
//   node scripts/roku.mjs console <cmd> [secs] run a debug-server command (port 8080), e.g. chanperf
//   node scripts/roku.mjs package              deploy release build and sign it (needs genkey)
//
// Reads ROKU_HOST, ROKU_PASSWORD, ROKU_SIGNING_PASSWORD from .env.

import 'dotenv/config';
import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { rokuDeploy } from 'roku-deploy';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [cmd, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith('--')));
const args = rest.filter((a) => !a.startsWith('--'));
const release = flags.has('--release');

const host = process.env.ROKU_HOST;
const password = process.env.ROKU_PASSWORD;

function need(name, value) {
  if (!value) {
    console.error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value;
}

function buildOptions() {
  const files = ['manifest', 'source/**/*', 'components/**/*', 'images/**/*'];
  if (release) files.push('!source/devMain.brs');
  return {
    rootDir: path.join(root, 'src'),
    files,
    outDir: path.join(root, 'out'),
    outFile: release ? 'reef-tank' : 'reef-tank-dev',
    stagingDir: path.join(root, 'out', 'staging'),
    retainDeploymentArchive: true,
  };
}

async function ecp(pathAndQuery) {
  const res = await fetch(`http://${need('ROKU_HOST', host)}:8060${pathAndQuery}`, { method: 'POST' });
  if (!res.ok) throw new Error(`ECP ${pathAndQuery} -> HTTP ${res.status}`);
}

// Connects to a device TCP port and prints what it sends for `seconds` (0 = until Ctrl-C).
function stream(port, seconds, send) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, need('ROKU_HOST', host));
    sock.setEncoding('utf8');
    sock.on('data', (d) => process.stdout.write(d));
    sock.on('error', reject);
    sock.on('close', resolve);
    sock.on('connect', () => {
      if (send) setTimeout(() => sock.write(`${send}\r\n`), 300);
      if (seconds > 0) setTimeout(() => sock.end(), seconds * 1000);
    });
  });
}

const commands = {
  async deploy() {
    const opts = { ...buildOptions(), host: need('ROKU_HOST', host), password: need('ROKU_PASSWORD', password) };
    await rokuDeploy.deploy(opts);
    console.log(`Sideloaded ${release ? 'release' : 'dev'} build to ${host}`);
  },

  async zip() {
    await rokuDeploy.createPackage(buildOptions());
    console.log(`Wrote ${rokuDeploy.getOutputZipFilePath(buildOptions())}`);
  },

  async launch() {
    const query = new URLSearchParams(args.map((kv) => kv.split('=')));
    await ecp(`/launch/dev${query.size ? `?${query}` : ''}`);
    console.log(`Launched dev channel ${query.size ? `with ${query}` : ''}`);
  },

  async key() {
    for (const k of args) {
      await ecp(`/keypress/${encodeURIComponent(k)}`);
      await new Promise((r) => setTimeout(r, 400));
    }
  },

  async shot() {
    const outDir = path.join(root, 'out', 'screens');
    fs.mkdirSync(outDir, { recursive: true });
    const file = await rokuDeploy.takeScreenshot({
      host: need('ROKU_HOST', host),
      password: need('ROKU_PASSWORD', password),
      outDir,
      outFile: args[0] ?? `shot-${Date.now()}`,
    });
    console.log(file);
  },

  async logs() {
    await stream(flags.has('--screensaver') ? 8087 : 8085, Number(args[0] ?? 0));
  },

  async console() {
    if (!args[0]) throw new Error('usage: console <command> [seconds]');
    await stream(8080, Number(args[1] ?? 4), args[0]);
  },

  async package() {
    const opts = {
      ...buildOptions(),
      host: need('ROKU_HOST', host),
      password: need('ROKU_PASSWORD', password),
      signingPassword: need('ROKU_SIGNING_PASSWORD', process.env.ROKU_SIGNING_PASSWORD),
    };
    // Packages are always release builds.
    opts.files = opts.files.filter((f) => !f.startsWith('!')).concat('!source/devMain.brs');
    opts.outFile = 'reef-tank';
    const pkg = await rokuDeploy.deployAndSignPackage(opts);
    console.log(`Signed package: ${pkg}`);
  },
};

if (!commands[cmd]) {
  console.error(`Unknown command "${cmd ?? ''}". See the header of scripts/roku.mjs.`);
  process.exit(1);
}
await commands[cmd]();
