// PROTOTYPE (#196), throwaway. Variant C: engine-provided effect presets drawn
// on a canvas over the still. Authors only pick a preset and an anchor; the
// pixels come from this code, so every Scenario gets the same look.

export type Geometry = {
  hearth: { x: number; y: number; width: number };
  light: { x: number; y: number; radius: number };
  sky: { top: number; bottom: number };
};

// Same flicker as the author layers: every component below 3 Hz and a small
// amplitude, so a `light-flicker` preset stays clear of WCAG 2.3.1.
export function flicker(t: number) {
  return (
    0.75 +
    0.12 * Math.sin(2 * Math.PI * 0.5 * t) +
    0.08 * Math.sin(2 * Math.PI * 1.25 * t + 1) +
    0.05 * Math.sin(2 * Math.PI * 2.5 * t + 2)
  );
}

const noise = (x: number) => 0.5 + 0.5 * (0.6 * Math.sin(x) + 0.4 * Math.sin(x * 2.3 + 1));
const hash = (i: number) => {
  const s = Math.sin(i * 127.1) * 43758.5453;
  return s - Math.floor(s);
};

function lightFlicker(ctx: CanvasRenderingContext2D, W: number, H: number, g: Geometry, t: number) {
  const { x, y, radius } = g.light;
  const grad = ctx.createRadialGradient(x * W, y * H, 0, x * W, y * H, radius * W);
  grad.addColorStop(0, 'rgba(255, 150, 40, 0.34)');
  grad.addColorStop(0.4, 'rgba(255, 170, 70, 0.12)');
  grad.addColorStop(1, 'rgba(255, 190, 110, 0)');
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = Math.min(1, flicker(t));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function fire(ctx: CanvasRenderingContext2D, W: number, H: number, g: Geometry, t: number) {
  const cx = g.hearth.x * W;
  const base = g.hearth.y * H;
  const fw = g.hearth.width * W;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  for (let k = 0; k < 7; k++) {
    const rel = k / 6 - 0.5;
    const off = rel * fw * 0.7;
    const h = fw * (0.3 + 0.3 * (1 - Math.abs(rel) * 1.6)) * (0.7 + 0.3 * noise(t * 3.1 + k * 1.3));
    const sway = fw * 0.08 * Math.sin(t * 4.1 + k * 2.1);
    const bw = fw * 0.12;
    const grad = ctx.createLinearGradient(0, base, 0, base - h);
    grad.addColorStop(0, 'rgba(255, 110, 20, 0.95)');
    grad.addColorStop(0.5, 'rgba(255, 165, 40, 0.75)');
    grad.addColorStop(1, 'rgba(255, 220, 120, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx + off - bw, base);
    ctx.quadraticCurveTo(cx + off - bw, base - h * 0.5, cx + off + sway, base - h);
    ctx.quadraticCurveTo(cx + off + bw, base - h * 0.5, cx + off + bw, base);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  const size = Math.max(1.5, W / 400);
  for (let i = 0; i < 12; i++) {
    const life = (t * 0.55 + hash(i)) % 1;
    const x = cx + (hash(i + 7) - 0.5) * fw * 0.6 + Math.sin(t * 2 + i) * fw * 0.06;
    const y = base - fw * 0.25 - life * fw * 0.9;
    ctx.fillStyle = `rgba(220, 80, 20, ${(1 - life) * 0.9})`;
    ctx.fillRect(x, y, size, size);
  }
}

function birds(ctx: CanvasRenderingContext2D, W: number, H: number, g: Geometry, t: number) {
  const span = 0.016 * W;
  ctx.save();
  ctx.strokeStyle = '#2a251d';
  ctx.lineWidth = Math.max(1, W / 450);
  ctx.lineCap = 'round';
  [0.25, 0.6, 0.85].forEach((band, k) => {
    const p = (t / (9 + k * 2.5) + k * 0.35) % 1;
    const x = (p * 1.2 - 0.1) * W;
    const y = (g.sky.top + (g.sky.bottom - g.sky.top) * band) * H + 4 * Math.sin(t * 0.8 + k);
    const flap = Math.sin(t * 7 + k * 2) * span * 0.45;
    ctx.beginPath();
    ctx.moveTo(x - span, y - flap);
    ctx.quadraticCurveTo(x - span * 0.45, y - span * 0.35, x, y);
    ctx.quadraticCurveTo(x + span * 0.45, y - span * 0.35, x + span, y - flap);
    ctx.stroke();
  });
  ctx.restore();
}

export const PRESETS = { 'light-flicker': lightFlicker, fire, birds };
