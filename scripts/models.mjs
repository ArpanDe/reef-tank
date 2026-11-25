#!/usr/bin/env node
// Renders the 3D models in art/models/ with Blender (the source of the Realistic and Pixel styles).
// Usage: npm run models -- [ids or module names...] [--samples N] [--threads N] [--review DIR]
// Finds Blender from $BLENDER, then ~/.local/opt/blender-*/blender, then PATH.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function findBlender() {
  if (process.env.BLENDER) return process.env.BLENDER;
  const opt = path.join(os.homedir(), '.local', 'opt');
  if (fs.existsSync(opt)) {
    const dirs = fs.readdirSync(opt).filter((d) => /^blender-[\d.]+/.test(d)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const d of dirs) {
      const bin = path.join(opt, d, 'blender');
      if (fs.existsSync(bin)) return bin;
    }
  }
  try {
    execFileSync('blender', ['--version'], { stdio: 'ignore' });
    return 'blender';
  } catch {
    console.error('Blender not found. Install Blender 5.2+ and put it on PATH, or set BLENDER=/path/to/blender.');
    console.error('You only need it to change the 3D models; the rendered images are committed in art/models/renders/.');
    process.exit(1);
  }
}

// The renders are committed, so keep them small: Blender stores leftover color under fully
// transparent pixels (noise that compresses badly) and uses light compression. Zero it and
// recompress; every visible pixel stays exactly the same.
function tidy(dirs, since) {
  let before = 0;
  let after = 0;
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.png'))) {
      // One open file handle for the date check, the read and the rewrite, so the file can't be
      // swapped between them.
      const fd = fs.openSync(path.join(dir, f), 'r+');
      try {
        if (fs.fstatSync(fd).mtimeMs >= since) {
          const [b, a] = tidyPng(fd);
          before += b;
          after += a;
        }
      } finally {
        fs.closeSync(fd);
      }
    }
  }
  if (before) console.log(`tidied renders: ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB`);
}

// Returns [old size, new size]; rewrites the file only when that makes it smaller.
function tidyPng(fd) {
  const buf = fs.readFileSync(fd);
  const img = PNG.sync.read(buf);
  const data = Buffer.from(img.data);
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] === 0) data[i] = data[i + 1] = data[i + 2] = 0;
  const png = new PNG({ width: img.width, height: img.height });
  png.data = data;
  const out = PNG.sync.write(png, { deflateLevel: 9, filterType: -1, colorType: 6 });
  if (out.length >= buf.length) return [buf.length, buf.length];
  fs.ftruncateSync(fd, 0);
  fs.writeSync(fd, out, 0, out.length, 0);
  return [buf.length, out.length];
}

const args0 = process.argv.slice(2);
const outArg = args0.indexOf('--out');
const outDir = path.resolve(root, outArg >= 0 ? args0[outArg + 1] : path.join('art', 'models', 'renders'));
const started = Date.now();

const blender = findBlender();
const args = ['-b', '--factory-startup', '-noaudio', '-P', path.join(root, 'art', 'models', 'render.py'), '--', ...process.argv.slice(2)];
const child = spawn(blender, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
// Blender is chatty: show our own lines, warnings from Python and errors only.
const keep = /^(MODEL |Traceback|  File |\w*Error|Exception|failed:|nothing matches|Warning: |.*\.py:\d+: )/;
let tail = [];
const onData = (buf) => {
  for (const line of buf.toString().split('\n')) {
    if (!line.trim()) continue;
    tail.push(line);
    if (tail.length > 40) tail.shift();
    if (keep.test(line) || /^\s{4}\S/.test(line) && tail.some((l) => l.startsWith('Traceback'))) console.log(line);
  }
};
child.stdout.on('data', onData);
child.stderr.on('data', onData);
child.on('close', (code) => {
  tidy([outDir, `${outDir}-toon`], started);
  if (code) {
    console.error(`Blender exited with ${code}. Last output:\n${tail.join('\n')}`);
    process.exit(code);
  }
});
