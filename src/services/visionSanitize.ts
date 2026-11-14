import { UI_ASSET_MAP } from './uiAssets.ts';

export interface VisionSkeletonInput {
  type?: unknown;
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
  strokeColor?: unknown;
  backgroundColor?: unknown;
  fillStyle?: unknown;
  strokeWidth?: unknown;
  roughness?: unknown;
  roundness?: unknown;
  opacity?: unknown;
  text?: unknown;
  fontSize?: unknown;
  points?: unknown;
  assetId?: unknown;
  label?: unknown;
}

export interface SanitizedVisionResult {
  shapes: Array<Record<string, unknown>>;
  images: Array<{ assetId: string; x: number; y: number; width: number; height: number; opacity: number }>;
  texts: string;
}

const SHAPE_TYPES = new Set(['rectangle', 'ellipse', 'diamond', 'line', 'arrow', 'text']);
const FILL_STYLES = new Set(['hachure', 'cross-hatch', 'solid', 'zigzag']);

const isFiniteNumber = (value: unknown, min = -1e5, max = 1e5): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

const safeColor = (value: unknown, fallback: string): string =>
  typeof value === 'string' && /^(?:#[0-9a-f]{3,8}|transparent)$/i.test(value.trim()) ? value.trim() : fallback;

function hexLuminance(hex: string): number | null {
  const clean = hex.trim().replace(/^#/, '');
  const full = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean.length >= 6 ? clean.slice(0, 6) : '';
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  const toLinear = (channel: number) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = toLinear(Number.parseInt(full.slice(0, 2), 16));
  const g = toLinear(Number.parseInt(full.slice(2, 4), 16));
  const b = toLinear(Number.parseInt(full.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ensureReadableTextColor(textColor: string, backgroundColor: string): string {
  const bgLum = hexLuminance(backgroundColor);
  const fgLum = hexLuminance(textColor);
  if (bgLum === null || fgLum === null) return textColor;
  const ratio = (Math.max(fgLum, bgLum) + 0.05) / (Math.min(fgLum, bgLum) + 0.05);
  if (ratio >= 3.2) return textColor;
  const whiteRatio = (1 + 0.05) / (bgLum + 0.05);
  const darkRatio = (bgLum + 0.05) / (0.015 + 0.05);
  return darkRatio >= whiteRatio ? '#0f172a' : '#ffffff';
}

function pointInsideRect(x: number, y: number, rect: { x: number; y: number; width: number; height: number }): boolean {
  return x >= rect.x - 4 && x <= rect.x + rect.width + 4 && y >= rect.y - 4 && y <= rect.y + rect.height + 4;
}

/** Sanitizes AI-generated Excalidraw element skeletons and splits image asset references. */
export function sanitizeVisionElements(raw: unknown[], fontFamily?: number): SanitizedVisionResult {
  const shapes: Array<Record<string, unknown>> = [];
  const images: Array<{ assetId: string; x: number; y: number; width: number; height: number; opacity: number }> = [];
  const texts: string[] = [];

  for (const entry of raw.slice(0, 120)) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as VisionSkeletonInput;
    const x = isFiniteNumber(item.x) ? item.x : 0;
    const y = isFiniteNumber(item.y) ? item.y : 0;
    const opacity = isFiniteNumber(item.opacity, 0, 100) ? item.opacity : 100;

    if (item.type === 'image' && typeof item.assetId === 'string') {
      const asset = UI_ASSET_MAP.get(item.assetId.trim());
      if (!asset) continue;
      const width = isFiniteNumber(item.width, 16, 2400) ? item.width : asset.defaultWidth;
      const height = isFiniteNumber(item.height, 16, 2400) ? item.height : asset.defaultHeight;
      images.push({ assetId: asset.id, x, y, width, height, opacity });
      continue;
    }

    if (typeof item.type !== 'string' || !SHAPE_TYPES.has(item.type)) continue;
    const strokeColor = safeColor(item.strokeColor, '#1e293b');
    const backgroundColor = safeColor(item.backgroundColor, 'transparent');
    const strokeWidth = isFiniteNumber(item.strokeWidth, 1, 12) ? item.strokeWidth : 1;
    const roughness = isFiniteNumber(item.roughness, 0, 2) ? item.roughness : 0;

    if (item.type === 'text') {
      const text = typeof item.text === 'string' ? item.text.trim().slice(0, 500) : '';
      if (!text) continue;
      const fontSize = isFiniteNumber(item.fontSize, 8, 96) ? item.fontSize : 16;
      texts.push(text);
      shapes.push({
        type: 'text',
        x,
        y,
        text,
        fontSize,
        ...(fontFamily !== undefined ? { fontFamily } : {}),
        strokeColor,
        opacity,
      });
      continue;
    }

    if (item.type === 'line' || item.type === 'arrow') {
      const points = Array.isArray(item.points) && item.points.length >= 2
        ? item.points.filter((pt): pt is [number, number] => Array.isArray(pt) && isFiniteNumber(pt[0]) && isFiniteNumber(pt[1])).slice(0, 16)
        : [[0, 0], [isFiniteNumber(item.width, 1, 2400) ? item.width : 120, 0]];
      if (points.length < 2) continue;
      shapes.push({ type: item.type, x, y, points, strokeColor, strokeWidth, roughness, opacity });
      continue;
    }

    const width = isFiniteNumber(item.width, 4, 2400) ? item.width : 120;
    const height = isFiniteNumber(item.height, 4, 2400) ? item.height : 48;
    const fillStyle = typeof item.fillStyle === 'string' && FILL_STYLES.has(item.fillStyle) ? item.fillStyle : 'solid';
    const skeleton: Record<string, unknown> = {
      type: item.type,
      x,
      y,
      width,
      height,
      strokeColor,
      backgroundColor,
      fillStyle,
      strokeWidth,
      roughness,
      opacity,
    };
    if (item.type === 'rectangle' && (!item.roundness || typeof item.roundness === 'object')) {
      skeleton.roundness = { type: 3 };
    }
    if (item.label && typeof item.label === 'object') {
      const rawLabel = item.label as { text?: unknown; fontSize?: unknown; strokeColor?: unknown };
      const labelText = typeof rawLabel.text === 'string' ? rawLabel.text.trim().slice(0, 300) : '';
      if (labelText) {
        texts.push(labelText);
        const rawLabelColor = safeColor(rawLabel.strokeColor, '#1e293b');
        skeleton.label = {
          text: labelText,
          fontSize: isFiniteNumber(rawLabel.fontSize, 8, 72) ? rawLabel.fontSize : 15,
          ...(fontFamily !== undefined ? { fontFamily } : {}),
          strokeColor: fillStyle === 'solid' ? ensureReadableTextColor(rawLabelColor, backgroundColor) : rawLabelColor,
        };
      }
    }
    shapes.push(skeleton);
  }

  // Enforce readable contrast for standalone text overlapping UI card assets or solid containers.
  const solidShapes = shapes.filter(
    shape => shape.type !== 'text' && shape.type !== 'line' && shape.type !== 'arrow' && shape.fillStyle === 'solid' && shape.backgroundColor !== 'transparent',
  ) as Array<{ x: number; y: number; width: number; height: number; backgroundColor: string }>;

  for (const shape of shapes) {
    if (shape.type !== 'text') continue;
    const tx = Number(shape.x);
    const ty = Number(shape.y);
    const currentColor = String(shape.strokeColor ?? '#1e293b');
    const overlappingAsset = [...images].reverse().find(img => pointInsideRect(tx, ty, img));
    if (overlappingAsset) {
      const asset = UI_ASSET_MAP.get(overlappingAsset.assetId);
      const lum = hexLuminance(currentColor);
      if (asset && lum !== null) {
        if ((asset.surfaceTone === 'light' || asset.surfaceTone === 'mixed') && lum > 0.42) {
          shape.strokeColor = asset.recommendedTextColor;
        } else if (asset.surfaceTone === 'dark' && lum < 0.25) {
          shape.strokeColor = asset.recommendedTextColor;
        }
      }
      continue;
    }
    const container = [...solidShapes].reverse().find(rect => pointInsideRect(tx, ty, rect));
    if (container) {
      shape.strokeColor = ensureReadableTextColor(currentColor, container.backgroundColor);
    }
  }

  return { shapes, images, texts: texts.join('') };
}
