// PROTOTYPE (#209), throwaway. Procedural stand-ins for the AI-made assets of
// the example layered Illustration `loc-hunters-camp`: a 1600×900 Still
// (Lanczos upscale of the 640×360 original) and three Layer files drawn as
// SVG in the ink style of prototype #196 and encoded by sharp: sun shafts, a
// crow on the stump and a bird. The camp is abandoned, so there is no fire.
//
//   node scripts/prototype-layered-illustration/make-assets.mjs
//
// Writes into scenarios/whispering-woods/images/ and prints the byte sizes.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '../..');
const IMAGES = path.join(ROOT, 'scenarios/whispering-woods/images');
const LAYERS = path.join(IMAGES, 'layers');
const INK = '#2a251d';

// Bird strip: 4 frames of 72×42 px (wing up, level, down, level).
const BIRD = { frames: 4, w: 72, h: 42 };
// Crow strip: 8 frames of 96×96 px, feet at 96% of the frame. Frames always
// loop at one fps, so a pause is spelled as repeated frames.
const CROW = { w: 96, h: 96, poses: [0, 0, 0, -18, -18, 0, 32, 0] };
// Sun shafts: half the Still's resolution; at the default `width: 100` the
// Layer is stretched over the whole Still, which soft shafts survive.
const SHAFTS = { w: 800, h: 450 };

function birdSvg() {
  const s = BIRD.w / 48;
  const tips = [5, 13, 22, 13];
  let body = '';
  for (let f = 0; f < BIRD.frames; f++) {
    const ox = f * BIRD.w;
    const mid = 15 * s;
    const tip = tips[f] * s;
    const lift = mid - 6 * s + (tip - 13 * s) * 0.3;
    body += `<path d="M${ox + 4 * s},${tip} Q${ox + 14 * s},${lift} ${ox + 24 * s},${mid} Q${ox + 34 * s},${lift} ${ox + 44 * s},${tip}" fill="none" stroke="${INK}" stroke-width="${2.6 * s}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${BIRD.w * BIRD.frames}" height="${BIRD.h}">${body}</svg>`;
}

// A crow in profile facing left, perched; the head turns about the neck.
function crowSvg() {
  let body = '';
  CROW.poses.forEach((angle, f) => {
    const ox = f * CROW.w;
    body += `<g transform="translate(${ox},0)" stroke="${INK}" stroke-linecap="round" stroke-linejoin="round">
      <path d="M44,77 L41,92 M41,92 l-5,1 M41,92 l4,1 M54,77 L54,92 M54,92 l-5,1 M54,92 l4,1" fill="none" stroke-width="2"/>
      <path d="M64,66 L90,82 L86,87 L60,74 Z" fill="${INK}" stroke-width="1.5"/>
      <ellipse cx="50" cy="64" rx="22" ry="14" transform="rotate(18 50 64)" fill="${INK}" stroke-width="1.5"/>
      <path d="M40,60 Q52,58 62,66" fill="none" stroke="#fdfbf5" stroke-width="1.2" opacity="0.7"/>
      <g transform="rotate(${angle} 36 54)">
        <circle cx="30" cy="46" r="10" fill="${INK}" stroke-width="1.5"/>
        <path d="M22,42 L7,47 L22,51 Z" fill="${INK}" stroke-width="1.5"/>
        <circle cx="27" cy="44" r="1.8" fill="#fdfbf5" stroke="none"/>
      </g>
    </g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CROW.w * CROW.poses.length}" height="${CROW.h}">${body}</svg>`;
}

// Pale gold shafts falling from the upper right through the pines, for a
// `multiply` Layer: on an ink-on-paper Still, `screen` would barely show.
function shaftsSvg() {
  const { w, h } = SHAFTS;
  const shafts = [
    { x: 640, width: 70, opacity: 0.3 },
    { x: 520, width: 40, opacity: 0.22 },
    { x: 430, width: 95, opacity: 0.28 },
    { x: 300, width: 55, opacity: 0.2 },
  ];
  const slant = 260;
  const polys = shafts
    .map((s) => `<polygon points="${s.x},-30 ${s.x + s.width},-30 ${s.x + s.width * 1.6 - slant},${h + 30} ${s.x - slant},${h + 30}" fill="rgb(255,214,130)" opacity="${s.opacity}"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs><filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter></defs>
  <g filter="url(#soft)">${polys}</g>
</svg>`;
}

async function main() {
  fs.mkdirSync(LAYERS, { recursive: true });
  const original = path.join(IMAGES, 'loc-hunters-camp.png');
  // Always upscale main's 640×360 original, so reruns do not compound.
  const source = execFileSync('git', ['show', 'main:scenarios/whispering-woods/images/loc-hunters-camp.png'], { cwd: ROOT, maxBuffer: 1 << 24 });
  const still = await sharp(source).resize(1600, 900, { kernel: 'lanczos3' }).png({ compressionLevel: 9, palette: false }).toBuffer();
  fs.writeFileSync(original, still);
  const outputs = {
    'layers/hunters-camp-sun.webp': await sharp(Buffer.from(shaftsSvg())).webp({ quality: 80, alphaQuality: 80 }).toBuffer(),
    'layers/crow.webp': await sharp(Buffer.from(crowSvg())).webp({ quality: 90 }).toBuffer(),
    'layers/bird.webp': await sharp(Buffer.from(birdSvg())).webp({ quality: 90 }).toBuffer(),
  };
  for (const [name, bytes] of Object.entries(outputs)) fs.writeFileSync(path.join(IMAGES, name), bytes);
  const sizes = { 'loc-hunters-camp.png': still.length, ...Object.fromEntries(Object.entries(outputs).map(([k, v]) => [k, v.length])) };
  for (const [name, bytes] of Object.entries(sizes)) {
    const meta = await sharp(path.join(IMAGES, name)).metadata();
    console.log(`${name.padEnd(34)} ${String(meta.width).padStart(5)}×${String(meta.height).padEnd(4)} ${(bytes / 1024).toFixed(1).padStart(8)} KiB`);
  }
  const total = Object.values(sizes).reduce((a, b) => a + b, 0);
  console.log(`${'total'.padEnd(46)} ${(total / 1024).toFixed(1).padStart(8)} KiB of 4096`);
}

main();
