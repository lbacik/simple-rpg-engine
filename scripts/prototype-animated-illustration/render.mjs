// PROTOTYPE (#196), throwaway. Renders the assets for the animated
// Illustration prototype into public/prototype-animated-illustration/:
//   - author-supplied layers (flame sprite, bird sprite, hearth light), WebP
//   - whole-file loops baked from those layers: MP4 (H.264), WebM (VP9),
//     animated AVIF and animated WebP (size comparison only)
//   - sizes.json with the byte size of every file
// Run: node scripts/prototype-animated-illustration/render.mjs (needs ffmpeg).
/* global URL, Buffer, window, console */

import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = join(root, 'public/prototype-animated-illustration');
const geometry = JSON.parse(
  readFileSync(join(root, 'src/app/play/[playthroughId]/_prototype-animated-illustration/geometry.json'), 'utf8'),
);
const { loopSeconds, fps } = geometry;
const frameDir = join(root, 'node_modules/.cache/prototype-animated-illustration');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<!doctype html><body></body>');
await page.addScriptTag({ path: join(root, 'scripts/prototype-animated-illustration/draw.js') });

const save = (name, dataUrl) => writeFileSync(join(out, name), Buffer.from(dataUrl.split(',')[1], 'base64'));
const ffmpeg = (...args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

for (const [id, g] of Object.entries(geometry.illustrations)) {
  const still = `data:image/png;base64,${readFileSync(join(out, `${id}.png`)).toString('base64')}`;
  const layers = await page.evaluate(([s, geo, loop]) => window.prepare(s, geo, loop), [still, g, loopSeconds]);
  save('flame-sprite.webp', layers.flame);
  save('bird-sprite.webp', layers.bird);
  save(`${id}-light.webp`, layers.light);

  rmSync(frameDir, { recursive: true, force: true });
  mkdirSync(frameDir, { recursive: true });
  const total = loopSeconds * fps;
  for (let i = 0; i < total; i++) {
    const png = await page.evaluate((t) => window.frame(t), i / fps);
    writeFileSync(join(frameDir, `${String(i).padStart(4, '0')}.png`), Buffer.from(png.split(',')[1], 'base64'));
  }
  const input = ['-framerate', String(fps), '-i', join(frameDir, '%04d.png')];
  ffmpeg(...input, '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', join(out, `${id}.mp4`));
  ffmpeg(...input, '-c:v', 'libvpx-vp9', '-crf', '36', '-b:v', '0', '-row-mt', '1', '-pix_fmt', 'yuv420p', '-an', join(out, `${id}.webm`));
  ffmpeg(...input, '-c:v', 'libaom-av1', '-cpu-used', '6', '-crf', '35', '-row-mt', '1', '-pix_fmt', 'yuv420p', join(out, `${id}.avif`));
  ffmpeg(...input, '-c:v', 'libwebp_anim', '-lossless', '0', '-quality', '75', '-loop', '0', join(out, `${id}.anim.webp`));
}

await browser.close();
rmSync(frameDir, { recursive: true, force: true });

const sizes = Object.fromEntries(
  readdirSync(out)
    .filter((name) => name !== 'sizes.json')
    .sort()
    .map((name) => [name, statSync(join(out, name)).size]),
);
writeFileSync(join(out, 'sizes.json'), `${JSON.stringify(sizes, null, 2)}\n`);
console.log(sizes);
