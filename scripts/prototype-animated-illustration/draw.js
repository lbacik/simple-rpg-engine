// PROTOTYPE (#196), throwaway. Runs inside a headless Chromium page (loaded by
// render.mjs). Draws the "author-supplied" ink layers (flame sprite, bird
// sprite, hearth light) and composes whole-file video frames from them.
/* global document, window, Image */

const INK = '#2a251d';
const FLAME = { frames: 8, fps: 10, w: 160, h: 200, base: 190 };
const BIRD = { frames: 4, fps: 8, w: 48, h: 28 };

function flameSprite() {
  const c = document.createElement('canvas');
  c.width = FLAME.w * FLAME.frames;
  c.height = FLAME.h;
  const ctx = c.getContext('2d');
  const tongues = [
    { dx: -0.26, h: 0.3, m: 1 },
    { dx: 0.25, h: 0.34, m: 2 },
    { dx: -0.12, h: 0.44, m: 2 },
    { dx: 0.12, h: 0.47, m: 1 },
    { dx: 0, h: 0.58, m: 1 },
  ];
  const steps = 18;
  for (let f = 0; f < FLAME.frames; f++) {
    const ox = f * FLAME.w;
    const phase = (2 * Math.PI * f) / FLAME.frames;
    tongues.forEach((tg, k) => {
      const W = FLAME.w;
      const cx = ox + W / 2 + tg.dx * W;
      const h = FLAME.base * tg.h * (0.8 + 0.2 * Math.sin(phase * tg.m + k));
      const sway = W * 0.13 * Math.sin(phase * tg.m + k * 1.7);
      const bw = W * 0.12;
      // Sample both edges bottom-to-top: the body narrows, leans with the
      // sway (stronger near the tip) and wiggles, so the tip licks sideways.
      const edge = (side) => {
        const pts = [];
        for (let i = 0; i <= steps; i++) {
          const y = i / steps;
          const half = bw * Math.pow(1 - y, 0.75);
          const wiggle = bw * 0.28 * Math.sin(y * Math.PI * 2.2 - phase * tg.m + k) * y;
          pts.push([cx + side * half + sway * y * y + wiggle, FLAME.base - h * y]);
        }
        return pts;
      };
      const left = edge(-1);
      const right = edge(1).reverse();
      ctx.beginPath();
      [...left, ...right].forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.fillStyle = 'rgba(253, 251, 245, 0.85)';
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      // One inner stroke along the tongue, like a pen line inside the flame.
      if (tg.h > 0.4) {
        ctx.beginPath();
        for (let i = 2; i <= steps - 5; i++) {
          const y = i / steps;
          const x = cx + sway * y * y * 0.9 + bw * 0.2 * Math.sin(y * Math.PI * 2 - phase * tg.m);
          if (i === 2) ctx.moveTo(x, FLAME.base - h * 0.85 * y);
          else ctx.lineTo(x, FLAME.base - h * 0.85 * y);
        }
        ctx.lineWidth = 1.3;
        ctx.stroke();
      }
    });
    // Sparks: short strokes rising one step per frame.
    for (let s = 0; s < 4; s++) {
      const p = (f / FLAME.frames + s / 4) % 1;
      const x = ox + FLAME.w * (0.35 + 0.1 * s) + 6 * Math.sin(phase + s);
      const y = FLAME.base - FLAME.h * 0.5 - p * FLAME.h * 0.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 1.5, y - 5);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
  }
  return c;
}

function birdSprite() {
  const c = document.createElement('canvas');
  c.width = BIRD.w * BIRD.frames;
  c.height = BIRD.h;
  const ctx = c.getContext('2d');
  const tips = [5, 13, 22, 13];
  for (let f = 0; f < BIRD.frames; f++) {
    const ox = f * BIRD.w;
    const mid = 15;
    ctx.beginPath();
    ctx.moveTo(ox + 4, tips[f]);
    ctx.quadraticCurveTo(ox + 14, mid - 6 + (tips[f] - 13) * 0.3, ox + 24, mid);
    ctx.quadraticCurveTo(ox + 34, mid - 6 + (tips[f] - 13) * 0.3, ox + 44, tips[f]);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  return c;
}

function lightLayer(width, height, light) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(light.x * width, light.y * height, 0, light.x * width, light.y * height, light.radius * width);
  g.addColorStop(0, 'rgba(255, 150, 40, 0.34)');
  g.addColorStop(0.4, 'rgba(255, 170, 70, 0.12)');
  g.addColorStop(1, 'rgba(255, 190, 110, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  return c;
}

// Flicker of the hearth light: integer cycles per 8 s loop, every component
// below 3 Hz, so the loop is seamless and far from the WCAG 2.3.1 threshold.
function flicker(t) {
  return 0.75 + 0.12 * Math.sin(2 * Math.PI * 0.5 * t) + 0.08 * Math.sin(2 * Math.PI * 1.25 * t + 1) + 0.05 * Math.sin(2 * Math.PI * 2.5 * t + 2);
}

const BIRDS = [
  { band: 0.25, phase: 0, flap: 0 },
  { band: 0.6, phase: 0.35, flap: 1 },
  { band: 0.85, phase: 0.7, flap: 2 },
];

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

let state;

window.prepare = async (stillDataUrl, geometry, loopSeconds) => {
  const still = await loadImage(stillDataUrl);
  const flames = flameSprite();
  const birds = birdSprite();
  const light = lightLayer(still.width, still.height, geometry.light);
  state = { still, flames, birds, light, geometry, loopSeconds };
  return {
    flame: flames.toDataURL('image/webp', 0.9),
    bird: birds.toDataURL('image/webp', 0.9),
    light: light.toDataURL('image/webp', 0.8),
    width: still.width,
    height: still.height,
  };
};

// One whole-file frame: the layers baked together plus a slow, looping camera
// drift standing in for the full-frame motion of AI image-to-video output.
window.frame = (t) => {
  const { still, flames, birds, light, geometry, loopSeconds } = state;
  const W = still.width;
  const H = still.height;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const zoom = 1 + 0.025 * (1 - Math.cos((2 * Math.PI * t) / loopSeconds)) / 2;
  ctx.translate(W / 2, H / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-W / 2, -H / 2);
  ctx.drawImage(still, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = Math.min(1, flicker(t));
  ctx.drawImage(light, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  const hw = geometry.hearth.width * W;
  const hh = (hw * FLAME.h) / FLAME.w;
  const f = Math.floor(t * FLAME.fps) % FLAME.frames;
  ctx.drawImage(flames, f * FLAME.w, 0, FLAME.w, FLAME.h, geometry.hearth.x * W - hw / 2, geometry.hearth.y * H - (hh * FLAME.base) / FLAME.h, hw, hh);
  const bw = 0.032 * W;
  const bh = (bw * BIRD.h) / BIRD.w;
  for (const b of BIRDS) {
    const p = (t / loopSeconds + b.phase) % 1;
    const x = (p * 1.2 - 0.1) * W;
    const y = (geometry.sky.top + (geometry.sky.bottom - geometry.sky.top) * b.band) * H + 4 * Math.sin((2 * Math.PI * 2 * t) / loopSeconds + b.phase * 6);
    const bf = (Math.floor(t * BIRD.fps) + b.flap) % BIRD.frames;
    ctx.drawImage(birds, bf * BIRD.w, 0, BIRD.w, BIRD.h, x, y, bw, bh);
  }
  return c.toDataURL('image/png');
};
