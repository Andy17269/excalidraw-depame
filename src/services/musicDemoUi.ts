import { FONT_FAMILY, convertToExcalidrawElements, newElementWith } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { BinaryFileData } from '@excalidraw/excalidraw/types';
import { pickDistinctRandom } from './musicMatch';
export {
  collectMusicReplacedIds,
  hasMusicKeyword,
  pickDistinctRandom,
  type MusicSourceElementLike,
} from './musicMatch';

export interface CoverStyle {
  id: string;
  name: string;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
}

function paintToPngDataUrl(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): BinaryFileData['dataURL'] {
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.scale(scale, scale);
  draw(ctx, width, height);
  return canvas.toDataURL('image/png') as BinaryFileData['dataURL'];
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fillLinearBg(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  stops: readonly [number, string][],
  x1 = 0,
  y1 = 0,
  x2 = w * 0.75,
  y2 = h,
): void {
  const grad = ctx.createLinearGradient(x1, y1, x2, y2);
  for (const [offset, color] of stops) grad.addColorStop(offset, color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function fillRadialGlow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  inner: string,
  outer: string,
  w: number,
  h: number,
): void {
  const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, r);
  glow.addColorStop(0, inner);
  glow.addColorStop(1, outer);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
}

/** 10 procedural tall cover styles for featured portrait cards (no brand logos). */
export const TALL_COVER_STYLES: readonly CoverStyle[] = [
  {
    id: 'coral-silk',
    name: 'Coral Silk',
    draw: (ctx, w, h) => {
      fillLinearBg(ctx, w, h, [[0, '#e62e3d'], [0.45, '#f0647a'], [0.82, '#f598a8'], [1, '#eeb5c1']]);
      fillRadialGlow(ctx, w * 0.25, h * 0.18, w * 0.75, 'rgba(220,30,43,0.9)', 'rgba(244,114,135,0)', w, h);
      fillRadialGlow(ctx, w * 0.88, h * 0.36, w * 0.7, 'rgba(225,29,72,0.82)', 'rgba(253,164,175,0)', w, h);
      fillRadialGlow(ctx, w * 0.48, h * 0.52, w * 0.6, 'rgba(255,228,232,0.56)', 'rgba(255,228,232,0)', w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 24;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(w * 0.06, h * 0.23);
      ctx.bezierCurveTo(w * 0.32, h * 0.38, w * 0.65, h * 0.08, w * 0.94, h * 0.2);
      ctx.stroke();
    },
  },
  {
    id: 'amber-rings',
    name: 'Amber Rings',
    draw: (ctx, w, h) => {
      fillLinearBg(ctx, w, h, [[0, '#ec922e'], [0.65, '#e48725'], [1, '#d87a1c']], 0, 0, w * 0.4, h);
      ctx.lineWidth = 3.2;
      for (const [r, alpha] of [[88, 0.72], [61, 0.78], [34, 0.85]] as const) {
        ctx.strokeStyle = `rgba(254, 243, 199, ${alpha})`;
        ctx.beginPath();
        ctx.arc(w, h * 0.4, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    },
  },
  {
    id: 'cobalt-aurora',
    name: 'Cobalt Aurora',
    draw: (ctx, w, h) => {
      fillLinearBg(ctx, w, h, [[0, '#1e3a8a'], [0.5, '#2563eb'], [1, '#38bdf8']]);
      fillRadialGlow(ctx, w * 0.2, h * 0.25, w * 0.85, 'rgba(56,189,248,0.68)', 'rgba(56,189,248,0)', w, h);
      fillRadialGlow(ctx, w * 0.85, h * 0.72, w * 0.7, 'rgba(129,140,248,0.65)', 'rgba(129,140,248,0)', w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 28;
      ctx.beginPath();
      ctx.moveTo(-20, h * 0.65);
      ctx.lineTo(w + 20, h * 0.25);
      ctx.stroke();
    },
  },
  {
    id: 'violet-nebula',
    name: 'Violet Nebula',
    draw: (ctx, w, h) => {
      fillLinearBg(ctx, w, h, [[0, '#4c1d95'], [0.52, '#7c3aed'], [1, '#ec4899']]);
      fillRadialGlow(ctx, w * 0.7, h * 0.22, w * 0.75, 'rgba(244,114,182,0.72)', 'rgba(244,114,182,0)', w, h);
      fillRadialGlow(ctx, w * 0.25, h * 0.68, w * 0.65, 'rgba(167,139,250,0.55)', 'rgba(167,139,250,0)', w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.beginPath();
      ctx.arc(w * 0.35, h * 0.34, w * 0.28, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  {
    id: 'emerald-tide',
    name: 'Emerald Tide',
    draw: (ctx, w, h) => {
      fillLinearBg(ctx, w, h, [[0, '#065f46'], [0.55, '#10b981'], [1, '#6ee7b7']]);
      fillRadialGlow(ctx, w * 0.78, h * 0.2, w * 0.7, 'rgba(167,243,208,0.6)', 'rgba(167,243,208,0)', w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.beginPath();
      ctx.moveTo(0, h * 0.52);
      ctx.bezierCurveTo(w * 0.35, h * 0.4, w * 0.65, h * 0.64, w, h * 0.48);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();
    },
  },
  {
    id: 'peach-horizon',
    name: 'Peach Horizon',
    draw: (ctx, w, h) => {
      fillLinearBg(ctx, w, h, [[0, '#fb7185'], [0.5, '#fdba74'], [1, '#fde047']]);
      fillRadialGlow(ctx, w * 0.5, h * 0.36, w * 0.55, 'rgba(255,255,255,0.65)', 'rgba(255,255,255,0)', w, h);
      ctx.fillStyle = 'rgba(244,63,94,0.24)';
      ctx.fillRect(0, h * 0.62, w, h * 0.38);
    },
  },
  {
    id: 'indigo-prism',
    name: 'Indigo Prism',
    draw: (ctx, w, h) => {
      fillLinearBg(ctx, w, h, [[0, '#1e1b4b'], [0.5, '#4338ca'], [1, '#818cf8']]);
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.beginPath();
      ctx.moveTo(w * 0.15, 0);
      ctx.lineTo(w * 0.85, 0);
      ctx.lineTo(w * 0.5, h * 0.72);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(165,180,252,0.22)';
      ctx.beginPath();
      ctx.moveTo(0, h * 0.3);
      ctx.lineTo(w, h * 0.55);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();
    },
  },
  {
    id: 'rose-quartz',
    name: 'Rose Quartz',
    draw: (ctx, w, h) => {
      fillLinearBg(ctx, w, h, [[0, '#be185d'], [0.48, '#f472b6'], [1, '#fbcfe8']]);
      ctx.strokeStyle = 'rgba(255,255,255,0.34)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 0.42, 34 + i * 26, 0, Math.PI * 2);
        ctx.stroke();
      }
    },
  },
  {
    id: 'lime-pulse',
    name: 'Lime Pulse',
    draw: (ctx, w, h) => {
      fillLinearBg(ctx, w, h, [[0, '#0f766e'], [0.55, '#14b8a6'], [1, '#a3e635']]);
      fillRadialGlow(ctx, w * 0.3, h * 0.3, w * 0.75, 'rgba(217,249,157,0.58)', 'rgba(217,249,157,0)', w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.32)';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(0, h * 0.45, w * 0.65, -0.7, 0.9);
      ctx.stroke();
    },
  },
  {
    id: 'crimson-velvet',
    name: 'Crimson Velvet',
    draw: (ctx, w, h) => {
      fillLinearBg(ctx, w, h, [[0, '#881337'], [0.52, '#e11d48'], [1, '#fb923c']]);
      fillRadialGlow(ctx, w * 0.75, h * 0.28, w * 0.68, 'rgba(253,186,116,0.52)', 'rgba(253,186,116,0)', w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.ellipse(w * 0.45, h * 0.85, w * 0.9, h * 0.32, -0.18, 0, Math.PI * 2);
      ctx.fill();
    },
  },
];

/** 10 procedural square album cover styles for 最近播放 & Mini Player. */
export const SQUARE_COVER_STYLES: readonly CoverStyle[] = [
  {
    id: 'pop-collage',
    name: 'Pop Collage',
    draw: (ctx, w, h) => {
      const hw = w / 2;
      const hh = h / 2;
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(0, 0, hw, hh);
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(0, hh * 0.7, hw, hh * 0.3);
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(hw * 0.5, hh * 0.4, w * 0.088, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#67e8f9';
      ctx.fillRect(hw, 0, hw, hh);
      ctx.fillStyle = '#ecfeff';
      ctx.strokeStyle = '#0891b2';
      ctx.lineWidth = Math.max(1.5, w * 0.016);
      ctx.beginPath();
      ctx.arc(hw * 1.5, hh * 0.48, w * 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fef9c3';
      ctx.fillRect(0, hh, hw, hh);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#d97706';
      roundRectPath(ctx, hw * 0.18, hh * 1.28, hw * 0.64, hh * 0.48, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#1d4ed8';
      ctx.fillRect(hw, hh, hw, hh);
      ctx.fillStyle = 'rgba(219,234,254,0.9)';
      ctx.beginPath();
      ctx.moveTo(hw, hh * 1.26);
      ctx.quadraticCurveTo(hw * 1.44, hh * 1.5, hw * 1.58, h);
      ctx.lineTo(hw, h);
      ctx.closePath();
      ctx.fill();
    },
  },
  {
    id: 'glass-cubes',
    name: 'Glass Cubes',
    draw: (ctx, w, h) => {
      fillLinearBg(ctx, w, h, [[0, '#c084fc'], [0.5, '#dbeafe'], [1, '#f472b6']], 0, 0, w, h);
      const cubes = [
        [0.29, 0.28, 0.15, 'rgba(255,255,255,0.75)', '#93c5fd'],
        [0.45, 0.37, 0.16, 'rgba(252,231,243,0.8)', '#f472b6'],
        [0.24, 0.49, 0.16, 'rgba(224,231,255,0.84)', '#6366f1'],
        [0.58, 0.55, 0.15, 'rgba(255,255,255,0.78)', '#38bdf8'],
        [0.39, 0.63, 0.15, 'rgba(250,232,255,0.82)', '#a855f7'],
      ] as const;
      ctx.lineWidth = Math.max(1, w * 0.01);
      for (const [cx, cy, size, fill, stroke] of cubes) {
        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        roundRectPath(ctx, w * cx, h * cy, w * size, h * size, Math.max(2, w * 0.028));
        ctx.fill();
        ctx.stroke();
      }
    },
  },
  {
    id: 'vinyl-bauhaus',
    name: 'Vinyl Bauhaus',
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(0, 0, w * 0.42, h);
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(w * 0.58, h * 0.52, w * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(w * 0.58, h * 0.52, w * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fef3c7';
      ctx.beginPath();
      ctx.arc(w * 0.58, h * 0.52, w * 0.035, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  {
    id: 'synth-sunset',
    name: 'Synth Sunset',
    draw: (ctx, w, h) => {
      fillLinearBg(ctx, w, h, [[0, '#311042'], [0.55, '#9d174d'], [1, '#f97316']], 0, 0, 0, h);
      const sun = ctx.createLinearGradient(0, h * 0.18, 0, h * 0.7);
      sun.addColorStop(0, '#fde047');
      sun.addColorStop(1, '#fb7185');
      ctx.fillStyle = sun;
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.48, w * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1e1b4b';
      ctx.fillRect(0, h * 0.62, w, h * 0.38);
      ctx.fillRect(0, h * 0.53, w, h * 0.035);
    },
  },
  {
    id: 'botanical-wave',
    name: 'Botanical Wave',
    draw: (ctx, w, h) => {
      fillLinearBg(ctx, w, h, [[0, '#ecfccb'], [0.5, '#a7f3d0'], [1, '#34d399']], 0, 0, w, h);
      ctx.fillStyle = 'rgba(5, 150, 105, 0.35)';
      ctx.beginPath();
      ctx.arc(w * 0.25, h * 0.78, w * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.beginPath();
      ctx.arc(w * 0.75, h * 0.28, w * 0.24, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  {
    id: 'holo-prism',
    name: 'Holo Prism',
    draw: (ctx, w, h) => {
      fillLinearBg(ctx, w, h, [[0, '#e0f2fe'], [0.35, '#fce7f3'], [0.7, '#ede9fe'], [1, '#fef9c3']], 0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.68)';
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * 0.14);
      ctx.lineTo(w * 0.84, h * 0.5);
      ctx.lineTo(w * 0.5, h * 0.86);
      ctx.lineTo(w * 0.16, h * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(99,102,241,0.38)';
      ctx.lineWidth = Math.max(1.5, w * 0.014);
      ctx.stroke();
    },
  },
  {
    id: 'terrazzo-pop',
    name: 'Terrazzo Pop',
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, w, h);
      const shapes = [
        [0.24, 0.26, 0.14, '#f43f5e'],
        [0.7, 0.22, 0.12, '#3b82f6'],
        [0.32, 0.7, 0.15, '#f59e0b'],
        [0.72, 0.68, 0.16, '#10b981'],
        [0.5, 0.48, 0.12, '#8b5cf6'],
      ] as const;
      for (const [cx, cy, r, color] of shapes) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(w * cx, h * cy, w * r, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },
  {
    id: 'midnight-sonar',
    name: 'Midnight Sonar',
    draw: (ctx, w, h) => {
      fillLinearBg(ctx, w, h, [[0, '#0f172a'], [1, '#1e3a8a']], 0, 0, w, h);
      ctx.strokeStyle = 'rgba(56,189,248,0.65)';
      ctx.lineWidth = Math.max(1.2, w * 0.015);
      for (const r of [0.16, 0.28, 0.4]) {
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 0.5, w * r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.5, w * 0.07, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  {
    id: 'citrus-aura',
    name: 'Citrus Aura',
    draw: (ctx, w, h) => {
      fillLinearBg(ctx, w, h, [[0, '#d9f99d'], [1, '#4ade80']], 0, 0, w, h);
      fillRadialGlow(ctx, w * 0.5, h * 0.48, w * 0.45, 'rgba(254,240,138,0.9)', 'rgba(254,240,138,0)', w, h);
      ctx.fillStyle = 'rgba(21,128,61,0.68)';
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.5, w * 0.24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.46, w * 0.1, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  {
    id: 'nordic-dunes',
    name: 'Nordic Dunes',
    draw: (ctx, w, h) => {
      fillLinearBg(ctx, w, h, [[0, '#ffedd5'], [1, '#fecdd3']], 0, 0, 0, h);
      ctx.fillStyle = '#fb7185';
      ctx.beginPath();
      ctx.arc(w * 0.68, h * 0.3, w * 0.13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(0, h * 0.66);
      ctx.quadraticCurveTo(w * 0.45, h * 0.46, w, h * 0.7);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#9a3412';
      ctx.beginPath();
      ctx.moveTo(0, h * 0.8);
      ctx.quadraticCurveTo(w * 0.6, h * 0.66, w, h * 0.82);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();
    },
  },
];

function drawClippedSquareCover(style: CoverStyle): (ctx: CanvasRenderingContext2D, w: number, h: number) => void {
  return (ctx, w, h) => {
    ctx.save();
    roundRectPath(ctx, 0, 0, w, h, 14);
    ctx.clip();
    style.draw(ctx, w, h);
    ctx.restore();
  };
}

function drawClippedTallCover(style: CoverStyle): (ctx: CanvasRenderingContext2D, w: number, h: number) => void {
  return (ctx, w, h) => {
    ctx.save();
    roundRectPath(ctx, 0, 0, w, h, 22);
    ctx.clip();
    style.draw(ctx, w, h);
    ctx.restore();
  };
}

function drawStatusIcons(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#0f172a';
  const bars = [
    [2, 10, 3, 5],
    [7, 8, 3, 7],
    [12, 5, 3, 10],
    [17, 3, 3, 12],
  ] as const;
  for (const [bx, by, bw, bh] of bars) {
    roundRectPath(ctx, bx, by, bw, bh, 1);
    ctx.fill();
  }
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(33, 13, 8, -Math.PI * 0.78, -Math.PI * 0.22);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(33, 13, 4.8, -Math.PI * 0.75, -Math.PI * 0.25);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(33, 13, 1.3, 0, Math.PI * 2);
  ctx.fill();

  roundRectPath(ctx, 45, 2.5, 26, 13, 4);
  ctx.fill();
  ctx.fillStyle = '#64748b';
  roundRectPath(ctx, 72, 6, 2, 6, 1);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 9.5px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('83', 58, 9.5);
}

function drawAvatarAw(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.arc(22, 22, 20.5, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#cbd5e1';
  ctx.stroke();

  const grad = ctx.createLinearGradient(0, 4, 0, 40);
  grad.addColorStop(0, '#a3b5d8');
  grad.addColorStop(1, '#7a8db8');
  ctx.beginPath();
  ctx.arc(22, 22, 18, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 14px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('AW', 22, 22.5);
}

function drawMiniControlsWithCover(coverStyle: CoverStyle): (ctx: CanvasRenderingContext2D) => void {
  return ctx => {
    ctx.save();
    roundRectPath(ctx, 2, 2, 38, 38, 9);
    ctx.clip();
    ctx.translate(2, 2);
    coverStyle.draw(ctx, 38, 38);
    ctx.restore();

    roundRectPath(ctx, 2, 2, 38, 38, 9);
    ctx.strokeStyle = 'rgba(15,23,42,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    roundRectPath(ctx, 266, 11, 5, 20, 1.5);
    ctx.fill();
    roundRectPath(ctx, 275, 11, 5, 20, 1.5);
    ctx.fill();

    for (const sx of [300, 313]) {
      ctx.beginPath();
      ctx.moveTo(sx, 12);
      ctx.lineTo(sx + 13, 21);
      ctx.lineTo(sx, 30);
      ctx.closePath();
      ctx.fill();
    }
  };
}

function drawTabIcons(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#2563eb';
  ctx.beginPath();
  ctx.moveTo(37, 6);
  ctx.lineTo(25, 16);
  ctx.lineTo(28, 16);
  ctx.lineTo(28, 26);
  ctx.lineTo(34, 26);
  ctx.lineTo(34, 19);
  ctx.lineTo(40, 19);
  ctx.lineTo(40, 26);
  ctx.lineTo(46, 26);
  ctx.lineTo(46, 16);
  ctx.lineTo(49, 16);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#0f172a';
  for (const [gx, gy] of [[94, 7], [105, 7], [94, 18], [105, 18]] as const) {
    roundRectPath(ctx, gx, gy, 8, 8, 2);
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(171, 16.5, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.9;
  ctx.lineCap = 'round';
  for (const r of [7, 11.5]) {
    ctx.beginPath();
    ctx.arc(171, 16.5, r, Math.PI * 0.72, Math.PI * 1.28);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(171, 16.5, r, -Math.PI * 0.28, Math.PI * 0.28);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.moveTo(232, 7);
  ctx.lineTo(244, 7);
  ctx.moveTo(230, 10.5);
  ctx.lineTo(246, 10.5);
  ctx.stroke();
  roundRectPath(ctx, 228, 13, 20, 14, 3);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(237, 22);
  ctx.lineTo(237, 16.5);
  ctx.lineTo(242, 15.5);
  ctx.lineTo(242, 21);
  ctx.stroke();

  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(303, 15, 6.8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(308.2, 20.2);
  ctx.lineTo(314, 26);
  ctx.stroke();
}

export const MUSIC_DEMO_TEXT_CORPUS =
  "07:13 Home AW 为你精选 新歌推荐 为你定制 Sān-Z、TAK、1000 Rabbits、 Sylvie's Head 和以及其他 专属心情 Focus 音乐无界 最近播放 › DAMIDAMI Sihan, Sān-Z & HOYO-MiX 主页 新发现 广播 资料库 搜索";

/**
 * Builds the Music Home high-fidelity UI elements with randomly selected covers
 * from 10 tall + 10 square procedural designs, centered on `targetCenter`.
 */
export async function buildMusicDemoScene(targetCenter: { x: number; y: number }, fixed = false): Promise<{
  elements: ExcalidrawElement[];
  files: BinaryFileData[];
}> {
  const [heroStyle, sideStyle] = fixed ? [TALL_COVER_STYLES[0], TALL_COVER_STYLES[1]] : pickDistinctRandom(TALL_COVER_STYLES, 2);
  const [recentLeftStyle, recentRightStyle, miniCoverStyle] = fixed ? SQUARE_COVER_STYLES.slice(0, 3) : pickDistinctRandom(SQUARE_COVER_STYLES, 3);

  const canvasAssets: ReadonlyArray<{
    key: string;
    width: number;
    height: number;
    draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  }> = [
    { key: 'status', width: 76, height: 18, draw: drawStatusIcons },
    { key: 'avatar', width: 44, height: 44, draw: drawAvatarAw },
    { key: 'new-music', width: 236, height: 312, draw: drawClippedTallCover(heroStyle!) },
    { key: 'focus', width: 108, height: 312, draw: drawClippedTallCover(sideStyle!) },
    { key: 'recent-collage', width: 150, height: 150, draw: drawClippedSquareCover(recentLeftStyle!) },
    { key: 'recent-cubes', width: 150, height: 150, draw: drawClippedSquareCover(recentRightStyle!) },
    { key: 'mini-controls', width: 336, height: 42, draw: drawMiniControlsWithCover(miniCoverStyle!) },
    { key: 'tab-icons', width: 342, height: 32, draw: drawTabIcons },
  ];

  const now = Date.now();
  const fileIds = new Map<string, BinaryFileData['id']>();
  const files: BinaryFileData[] = canvasAssets.map(item => {
    const id = `music-demo-${item.key}-${crypto.randomUUID()}` as BinaryFileData['id'];
    fileIds.set(item.key, id);
    return {
      id,
      dataURL: paintToPngDataUrl(item.width, item.height, item.draw),
      mimeType: 'image/png' as const,
      created: now,
      lastRetrieved: now,
    };
  });

  const skeletons: Parameters<typeof convertToExcalidrawElements>[0] = [
    // Outer iPhone frame (390×844)
    {
      type: 'rectangle',
      x: 0,
      y: 0,
      width: 390,
      height: 844,
      strokeColor: '#cbd5e1',
      backgroundColor: '#ffffff',
      fillStyle: 'solid',
      strokeWidth: 2,
      roughness: 0,
      roundness: { type: 3 },
    },
    // Top status bar
    { type: 'text', x: 32, y: 15, text: '07:13', fontSize: 15, strokeColor: '#0f172a' },
    {
      type: 'image',
      fileId: fileIds.get('status')!,
      x: 288,
      y: 14,
      width: 76,
      height: 18,
    },
    // Home title + AW avatar
    { type: 'text', x: 22, y: 50, text: '首页', fontSize: 34, strokeColor: '#0f172a' },
    {
      type: 'image',
      fileId: fileIds.get('avatar')!,
      x: 324,
      y: 46,
      width: 44,
      height: 44,
    },
    // Section 1: 为你精选
    { type: 'text', x: 22, y: 116, text: '为你精选', fontSize: 20, strokeColor: '#0f172a' },
    // Left Hero Card: 新歌推荐
    {
      type: 'image',
      fileId: fileIds.get('new-music')!,
      x: 22,
      y: 148,
      width: 236,
      height: 312,
    },
    { type: 'text', x: 96, y: 236, text: '全新', fontSize: 36, strokeColor: '#ffffff' },
    { type: 'text', x: 82, y: 280, text: '音乐', fontSize: 36, strokeColor: '#ffffff' },
    { type: 'text', x: 38, y: 378, text: '为你定制', fontSize: 13, strokeColor: '#ffffff' },
    { type: 'text', x: 38, y: 402, text: 'Sān-Z、TAK、1000 Rabbits、', fontSize: 11, strokeColor: '#fff1f2' },
    { type: 'text', x: 38, y: 422, text: "Sylvie's Head 和以及其他", fontSize: 11, strokeColor: '#fff1f2' },
    // Right Peeking Card: 专属心情 / Focus
    {
      type: 'image',
      fileId: fileIds.get('focus')!,
      x: 270,
      y: 148,
      width: 108,
      height: 312,
    },
    { type: 'text', x: 284, y: 376, text: '专属心情', fontSize: 11, strokeColor: '#fef3c7' },
    { type: 'text', x: 284, y: 396, text: '专注', fontSize: 16, strokeColor: '#ffffff' },
    { type: 'text', x: 284, y: 422, text: '音乐无界', fontSize: 11, strokeColor: '#fef3c7' },
    // Section 2: 最近播放 >
    { type: 'text', x: 22, y: 488, text: '最近播放  ›', fontSize: 20, strokeColor: '#0f172a' },
    {
      type: 'image',
      fileId: fileIds.get('recent-collage')!,
      x: 22,
      y: 524,
      width: 150,
      height: 150,
    },
    {
      type: 'image',
      fileId: fileIds.get('recent-cubes')!,
      x: 184,
      y: 524,
      width: 150,
      height: 150,
    },
    {
      type: 'rectangle',
      x: 346,
      y: 524,
      width: 32,
      height: 150,
      strokeColor: '#fde047',
      backgroundColor: '#fef9c3',
      fillStyle: 'solid',
      strokeWidth: 1,
      roughness: 0,
      roundness: { type: 3 },
    },
    // Floating Mini-Player Pill
    {
      type: 'rectangle',
      x: 18,
      y: 688,
      width: 354,
      height: 56,
      strokeColor: '#e2e8f0',
      backgroundColor: '#f8fafc',
      fillStyle: 'solid',
      strokeWidth: 1,
      roughness: 0,
      roundness: { type: 3 },
    },
    {
      type: 'image',
      fileId: fileIds.get('mini-controls')!,
      x: 28,
      y: 695,
      width: 336,
      height: 42,
    },
    { type: 'text', x: 78, y: 698, text: 'DAMIDAMI', fontSize: 14, strokeColor: '#0f172a' },
    { type: 'text', x: 78, y: 718, text: 'Sihan, Sān-Z & HOYO-MiX', fontSize: 11, strokeColor: '#475569' },
    // Floating Bottom Glass TabBar Pill
    {
      type: 'rectangle',
      x: 18,
      y: 756,
      width: 354,
      height: 68,
      strokeColor: '#e2e8f0',
      backgroundColor: '#f8fafc',
      fillStyle: 'solid',
      strokeWidth: 1,
      roughness: 0,
      roundness: { type: 3 },
    },
    // Active Tab Highlight Pill (主页)
    {
      type: 'rectangle',
      x: 24,
      y: 761,
      width: 74,
      height: 58,
      strokeColor: '#cbd5e1',
      backgroundColor: '#e2e8f0',
      fillStyle: 'solid',
      strokeWidth: 1,
      roughness: 0,
      roundness: { type: 3 },
    },
    {
      type: 'image',
      fileId: fileIds.get('tab-icons')!,
      x: 24,
      y: 764,
      width: 342,
      height: 32,
    },
    { type: 'text', x: 49, y: 800, text: '主页', fontSize: 11, strokeColor: '#2563eb' },
    { type: 'text', x: 109, y: 800, text: '新发现', fontSize: 11, strokeColor: '#0f172a' },
    { type: 'text', x: 184, y: 800, text: '广播', fontSize: 11, strokeColor: '#0f172a' },
    { type: 'text', x: 247, y: 800, text: '资料库', fontSize: 11, strokeColor: '#0f172a' },
    { type: 'text', x: 317, y: 800, text: '搜索', fontSize: 11, strokeColor: '#0f172a' },
  ];

  const offsetX = Math.round(targetCenter.x - 390 / 2);
  const offsetY = Math.round(targetCenter.y - 844 / 2);

  const elements = convertToExcalidrawElements(skeletons, { regenerateIds: true }).map(element =>
    newElementWith(element, {
      x: element.x + offsetX,
      y: element.y + offsetY,
      ...(element.type === 'text' ? { fontFamily: FONT_FAMILY.Excalifont } : {}),
    }),
  );

  return { elements, files };
}
