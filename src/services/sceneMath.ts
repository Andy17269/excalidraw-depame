export type Viewport = { zoom: number; scrollX: number; scrollY: number };
export interface ViewportOffsets { top?: number; right?: number; bottom?: number; left?: number }
export interface FitViewportOptions {
  viewportZoomFactor?: number;
  minZoom?: number;
  maxZoom?: number;
  offsets?: ViewportOffsets;
}
type SummaryElement = { id: string; type: string; x: number; y: number; width: number; height: number; isDeleted?: boolean; text?: string };

const DEFAULT_OFFSETS: Required<ViewportOffsets> = { top: 68, right: 24, bottom: 92, left: 24 };

function viewportCenterScreen(viewport: { width: number; height: number }, offsets?: ViewportOffsets): { x: number; y: number; width: number; height: number } {
  const left = offsets?.left ?? DEFAULT_OFFSETS.left;
  const right = offsets?.right ?? DEFAULT_OFFSETS.right;
  const top = offsets?.top ?? DEFAULT_OFFSETS.top;
  const bottom = offsets?.bottom ?? DEFAULT_OFFSETS.bottom;
  const width = Math.max(1, viewport.width - left - right);
  const height = Math.max(1, viewport.height - top - bottom);
  return { x: left + width / 2, y: top + height / 2, width, height };
}

export function computeFitViewport(
  bounds: readonly [number, number, number, number],
  viewport: { width: number; height: number },
  options?: FitViewportOptions,
): Viewport {
  const [minX, minY, maxX, maxY] = bounds;
  const center = viewportCenterScreen(viewport, options?.offsets);
  const boxW = Math.max(1, maxX - minX);
  const boxH = Math.max(1, maxY - minY);
  const factor = Math.min(1, Math.max(0.1, options?.viewportZoomFactor ?? 0.92));
  const minZoom = options?.minZoom ?? 0.1;
  const maxZoom = options?.maxZoom ?? 1.5;
  const zoom = Math.min(maxZoom, Math.max(minZoom, Math.min(center.width / boxW, center.height / boxH) * factor));
  return {
    zoom,
    scrollX: center.x / zoom - (minX + maxX) / 2,
    scrollY: center.y / zoom - (minY + maxY) / 2,
  };
}

export function interpolateViewport(
  from: Viewport,
  to: Viewport,
  t: number,
  viewport: { width: number; height: number },
  offsets?: ViewportOffsets,
): Viewport {
  if (t <= 0) return { ...from };
  if (t >= 1) return { ...to };
  const center = viewportCenterScreen(viewport, offsets);
  const ease = 1 - Math.pow(1 - t, 4);
  const fromZoom = Math.max(0.1, from.zoom);
  const toZoom = Math.max(0.1, to.zoom);
  const fromCenterX = center.x / fromZoom - from.scrollX;
  const fromCenterY = center.y / fromZoom - from.scrollY;
  const toCenterX = center.x / toZoom - to.scrollX;
  const toCenterY = center.y / toZoom - to.scrollY;
  const zoom = fromZoom * Math.pow(toZoom / fromZoom, ease);
  const centerX = fromCenterX + (toCenterX - fromCenterX) * ease;
  const centerY = fromCenterY + (toCenterY - fromCenterY) * ease;
  return {
    zoom,
    scrollX: center.x / zoom - centerX,
    scrollY: center.y / zoom - centerY,
  };
}

function polylineBounds(points: readonly (readonly [number, number])[]): { width: number; height: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [px, py] of points) {
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  }
  return { width: maxX - minX, height: maxY - minY };
}

export function truncatePolyline(
  points: readonly (readonly [number, number])[],
  progress: number,
): { points: [number, number][]; tip: [number, number]; width: number; height: number } {
  if (points.length === 0) return { points: [[0, 0], [0, 0]], tip: [0, 0], width: 0, height: 0 };
  if (points.length === 1) {
    const p: [number, number] = [points[0]![0], points[0]![1]];
    return { points: [p], tip: p, width: 0, height: 0 };
  }
  const u = Math.min(1, Math.max(0.02, progress));
  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const len = Math.hypot(points[i + 1]![0] - points[i]![0], points[i + 1]![1] - points[i]![1]);
    lengths.push(len);
    total += len;
  }
  if (u >= 1 || total === 0) {
    const copy = points.map(([px, py]): [number, number] => [px, py]);
    return { points: copy, tip: copy.at(-1)!, ...polylineBounds(copy) };
  }
  const target = total * u;
  const out: [number, number][] = [[points[0]![0], points[0]![1]]];
  let acc = 0;
  let tip: [number, number] = out[0]!;
  for (let i = 0; i < lengths.length; i++) {
    const seg = lengths[i]!;
    const p0 = points[i]!;
    const p1 = points[i + 1]!;
    if (acc + seg >= target || i === lengths.length - 1) {
      const frac = seg > 0 ? Math.min(1, Math.max(0, (target - acc) / seg)) : 1;
      tip = [p0[0] + (p1[0] - p0[0]) * frac, p0[1] + (p1[1] - p0[1]) * frac];
      out.push(tip);
      break;
    }
    out.push([p1[0], p1[1]]);
    acc += seg;
  }
  return { points: out, tip, ...polylineBounds(out) };
}

export interface RevealableElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number;
  isDeleted?: boolean;
  containerId?: string | null;
  points?: readonly (readonly [number, number])[];
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
}

export interface RevealStep<T extends RevealableElement = RevealableElement> {
  primary: T;
  boundTexts: T[];
  startPoint: { x: number; y: number };
  endPoint: { x: number; y: number };
}

const isConnector = (element: RevealableElement) => element.type === 'arrow' || element.type === 'line';

function compareReadingOrder(a: RevealableElement, b: RevealableElement): number {
  return Math.round(a.y / 40) - Math.round(b.y / 40) || a.x - b.x;
}

export function buildRevealSteps<T extends RevealableElement>(elements: readonly T[]): RevealStep<T>[] {
  const active = elements.filter(element => !element.isDeleted);
  const byId = new Map(active.map(element => [element.id, element]));
  const boundByContainer = new Map<string, T[]>();
  const primaries: T[] = [];

  for (const element of active) {
    if (element.type === 'text' && element.containerId && byId.has(element.containerId)) {
      const list = boundByContainer.get(element.containerId) ?? [];
      list.push(element);
      boundByContainer.set(element.containerId, list);
    } else {
      primaries.push(element);
    }
  }

  const nodes = primaries.filter(element => !isConnector(element)).sort(compareReadingOrder);
  const connectors = primaries.filter(isConnector).sort(compareReadingOrder);
  const outgoing = new Map<string, T[]>();
  const inDegree = new Map<string, number>();

  for (const arrow of connectors) {
    const startId = arrow.startBinding?.elementId;
    const endId = arrow.endBinding?.elementId;
    if (startId && byId.has(startId)) {
      const list = outgoing.get(startId) ?? [];
      list.push(arrow);
      outgoing.set(startId, list);
    }
    if (endId && endId !== startId && byId.has(endId)) {
      inDegree.set(endId, (inDegree.get(endId) ?? 0) + 1);
    }
  }

  const visited = new Set<string>();
  const ordered: T[] = [];
  const queue: T[] = [];

  const enqueue = (node: T) => {
    if (!visited.has(node.id)) queue.push(node);
  };

  const drain = () => {
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.id)) continue;
      visited.add(current.id);
      ordered.push(current);
      for (const arrow of outgoing.get(current.id) ?? []) {
        if (!visited.has(arrow.id)) {
          visited.add(arrow.id);
          ordered.push(arrow);
        }
        const targetId = arrow.endBinding?.elementId;
        const target = targetId ? byId.get(targetId) : undefined;
        if (target && !isConnector(target)) enqueue(target);
      }
    }
  };

  for (const node of nodes) {
    if ((inDegree.get(node.id) ?? 0) === 0) enqueue(node);
  }
  drain();

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      enqueue(node);
      drain();
    }
  }
  for (const arrow of connectors) {
    if (!visited.has(arrow.id)) {
      visited.add(arrow.id);
      ordered.push(arrow);
    }
  }

  return ordered.map(primary => {
    const boundTexts = boundByContainer.get(primary.id) ?? [];
    if (isConnector(primary) && Array.isArray(primary.points) && primary.points.length >= 2) {
      const first = primary.points[0]!;
      const last = primary.points.at(-1)!;
      return {
        primary,
        boundTexts,
        startPoint: { x: primary.x + first[0], y: primary.y + first[1] },
        endPoint: { x: primary.x + last[0], y: primary.y + last[1] },
      };
    }
    return {
      primary,
      boundTexts,
      startPoint: { x: primary.x, y: primary.y },
      endPoint: { x: primary.x + primary.width, y: primary.y + primary.height },
    };
  });
}

export interface MindmapBranch { descr: string; children: MindmapBranch[] }

export interface SoftColorPair {
  backgroundColor: string;
  strokeColor: string;
}

export const SOFT_MINDMAP_PALETTE: readonly SoftColorPair[] = [
  { backgroundColor: '#eef5ff', strokeColor: '#4f7cac' },
  { backgroundColor: '#eef7f2', strokeColor: '#4c8b6f' },
  { backgroundColor: '#fdf5eb', strokeColor: '#b07b42' },
  { backgroundColor: '#f4f1fa', strokeColor: '#7863a8' },
  { backgroundColor: '#fbf1f4', strokeColor: '#b06578' },
  { backgroundColor: '#f1f5f9', strokeColor: '#64748b' },
];

function parseHexRgb(raw: string): [number, number, number, string] | null {
  const trimmed = raw.trim().toLowerCase();
  const full = /^#([0-9a-f]{6})$/.exec(trimmed);
  if (full) {
    const hex = full[1]!;
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), `#${hex}`];
  }
  const short = /^#([0-9a-f]{3})$/.exec(trimmed);
  if (short) {
    const [r, g, b] = short[1]!;
    const hex = `${r}${r}${g}${g}${b}${b}`;
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), `#${hex}`];
  }
  return null;
}

function rgbChromaAndLightness(r: number, g: number, b: number): { chroma: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  return { chroma: max - min, l: (max + min) / 2 };
}

/** Rejects garish/high-saturation hex colors and falls back to a muted soft color. */
export function sanitizeSoftHexColor(raw: string, fallback: string, role: 'fill' | 'stroke'): string {
  const parsed = parseHexRgb(raw);
  if (!parsed) return fallback;
  const [r, g, b, normalized] = parsed;
  const { chroma, l } = rgbChromaAndLightness(r, g, b);
  if (role === 'fill') {
    if (chroma > 0.25 || l < 0.72) return fallback;
  } else if (chroma > 0.55 || l > 0.75 || l < 0.15) {
    return fallback;
  }
  return normalized;
}

export function buildMindmapBranchAssignments(root: MindmapBranch): {
  flowchart: string;
  branchByOrder: Array<0 | 1>;
} {
  const lines = ['flowchart LR'];
  const branchByOrder: Array<0 | 1> = [];
  let count = 0;
  const visit = (node: MindmapBranch, branchIndex: 0 | 1, parent?: string) => {
    if (++count > 200) throw new Error('节点过多');
    const id = `M${count}`;
    const label = node.descr.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\r\n]+/g, ' ');
    lines.push(`${id}["${label}"]`);
    branchByOrder.push(branchIndex);
    if (parent) lines.push(`${parent} --- ${id}`);
    node.children.forEach((child, idx) => {
      const nextBranch = parent ? branchIndex : ((idx % 2) as 0 | 1);
      visit(child, nextBranch, id);
    });
  };
  visit(root, 0);
  return { flowchart: lines.join('\n'), branchByOrder };
}

export function mindmapAsFlowchart(root: MindmapBranch): string {
  return buildMindmapBranchAssignments(root).flowchart;
}

function parseStyleProps(propsRaw: string, fallback: SoftColorPair): SoftColorPair {
  const fillMatch = /fill\s*:\s*(#[0-9a-fA-F]{3,6})/.exec(propsRaw);
  const strokeMatch = /stroke\s*:\s*(#[0-9a-fA-F]{3,6})/.exec(propsRaw);
  return {
    backgroundColor: fillMatch ? sanitizeSoftHexColor(fillMatch[1]!, fallback.backgroundColor, 'fill') : fallback.backgroundColor,
    strokeColor: strokeMatch ? sanitizeSoftHexColor(strokeMatch[1]!, fallback.strokeColor, 'stroke') : fallback.strokeColor,
  };
}

export function extractMermaidNodeStyles(source: string): {
  palette: [SoftColorPair, SoftColorPair];
  styleByLabel: Map<string, SoftColorPair>;
} {
  const defaultFirst = SOFT_MINDMAP_PALETTE[0]!;
  const defaultSecond = SOFT_MINDMAP_PALETTE[1]!;
  const palette: [SoftColorPair, SoftColorPair] = [defaultFirst, defaultSecond];

  const commentMatch = /^%%\s*colors\s*:\s*(.+)$/im.exec(source);
  if (commentMatch) {
    const pairs = commentMatch[1]!.split(',').map(part => part.trim()).filter(Boolean).slice(0, 2);
    pairs.forEach((pairText, idx) => {
      const [rawFill, rawStroke] = pairText.split('/').map(s => s.trim());
      const fb = SOFT_MINDMAP_PALETTE[idx] ?? defaultFirst;
      palette[idx] = {
        backgroundColor: rawFill ? sanitizeSoftHexColor(rawFill, fb.backgroundColor, 'fill') : fb.backgroundColor,
        strokeColor: rawStroke ? sanitizeSoftHexColor(rawStroke, fb.strokeColor, 'stroke') : fb.strokeColor,
      };
    });
  }

  const labelsById = new Map<string, string>();
  const labelDefRe = /\b([A-Za-z0-9_-]+)\s*(?:\(\(|\[\[|\(\[|\{\{|\[\(|\["|\[|\(|\{)\s*"?([^"\n\])}]+?)"?\s*(?:\)\)|\]\]|\]\)|\}\}|\)\]|"\]|\]|\)|\})/g;
  let m: RegExpExecArray | null;
  while ((m = labelDefRe.exec(source)) !== null) {
    labelsById.set(m[1]!, m[2]!.trim());
  }

  const classDefs = new Map<string, SoftColorPair>();
  const classDefRe = /^\s*classDef\s+([A-Za-z0-9_-]+)\s+(.+)$/gm;
  while ((m = classDefRe.exec(source)) !== null) {
    const fb = SOFT_MINDMAP_PALETTE[classDefs.size % 2]!;
    classDefs.set(m[1]!, parseStyleProps(m[2]!, fb));
  }

  const styleById = new Map<string, SoftColorPair>();
  const classAssignRe = /^\s*class\s+([A-Za-z0-9_,-]+)\s+([A-Za-z0-9_-]+)\s*$/gm;
  while ((m = classAssignRe.exec(source)) !== null) {
    const pair = classDefs.get(m[2]!);
    if (!pair) continue;
    for (const id of m[1]!.split(',')) {
      const cleanId = id.trim();
      if (cleanId) styleById.set(cleanId, pair);
    }
  }

  const styleRe = /^\s*style\s+([A-Za-z0-9_-]+)\s+(.+)$/gm;
  while ((m = styleRe.exec(source)) !== null) {
    const fb = SOFT_MINDMAP_PALETTE[styleById.size % 2]!;
    styleById.set(m[1]!, parseStyleProps(m[2]!, fb));
  }

  const styleByLabel = new Map<string, SoftColorPair>();
  const distinctKeys = new Map<string, SoftColorPair>();
  for (const [id, pair] of styleById) {
    const key = `${pair.backgroundColor}|${pair.strokeColor}`;
    if (!distinctKeys.has(key) && distinctKeys.size >= 2) {
      const capped = [...distinctKeys.values()][distinctKeys.size % 2]!;
      const label = labelsById.get(id);
      if (label) styleByLabel.set(label, capped);
      continue;
    }
    distinctKeys.set(key, pair);
    const label = labelsById.get(id);
    if (label) styleByLabel.set(label, pair);
  }

  return { palette, styleByLabel };
}

export function resolveDiagramNodeColors(
  elements: readonly { id: string; type: string; containerId?: string | null; text?: string }[],
  options: { isMindmap: boolean; source: string; branchByOrder?: readonly (0 | 1)[] },
): Map<string, SoftColorPair> {
  const result = new Map<string, SoftColorPair>();
  const { palette, styleByLabel } = extractMermaidNodeStyles(options.source);
  const textByContainer = new Map<string, string>();
  for (const el of elements) {
    if (el.type === 'text' && el.containerId && typeof el.text === 'string') {
      textByContainer.set(el.containerId, el.text.trim());
    }
  }

  let shapeIdx = 0;
  for (const el of elements) {
    if (el.type !== 'rectangle' && el.type !== 'ellipse' && el.type !== 'diamond') continue;
    if (options.isMindmap) {
      const branch = options.branchByOrder?.[shapeIdx] ?? ((shapeIdx % 2) as 0 | 1);
      result.set(el.id, palette[branch]);
    } else if (styleByLabel.size > 0) {
      const label = textByContainer.get(el.id);
      if (label && styleByLabel.has(label)) {
        result.set(el.id, styleByLabel.get(label)!);
      }
    }
    shapeIdx++;
  }
  return result;
}

export function needsCanvasContext(prompt: string): boolean {
  return /现有|已有|当前|这个|这张|选中|旁边|右侧|左侧|基础|继续|追加|新增|添加|补充|修改|改成|改为|替换|调整|删除|理解|分析|识别|整理|对齐|配色|字号|颜色|风格|样式|联网|参考|仿|https?:\/\//.test(prompt);
}

export function clampZoom(requestedZoom: number): number {
  if (!Number.isFinite(requestedZoom)) return 1;
  return Math.min(30, Math.max(.1, requestedZoom));
}

export function zoomAtPoint(view: Viewport, requestedZoom: number, point: { x: number; y: number }): Viewport {
  const zoom = clampZoom(requestedZoom);
  return {
    zoom,
    scrollX: view.scrollX + point.x / zoom - point.x / view.zoom,
    scrollY: view.scrollY + point.y / zoom - point.y / view.zoom,
  };
}

export function normalizeMermaid(source: string): string {
  const code = source.trim().replace(/^```(?:mermaid)?\s*\n?/i, '').replace(/\n?```\s*$/, '').trim();
  if (code.length > 50000 || !/^(?:flowchart|graph|mindmap|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram)\b/.test(code)) {
    throw new Error('Mermaid 格式无效');
  }
  return code;
}

export function summarizeElements(elements: readonly SummaryElement[]): string {
  return JSON.stringify(elements.filter(element => !element.isDeleted).map(({ id, type, x, y, width, height, text }) => ({ id, type, x, y, width, height, ...(text === undefined ? {} : { text }) })));
}

export interface ScheduledStep {
  startMs: number;
  endMs: number;
  thinkFraction: number;
  moveFraction: number;
}

function seededUnit(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Builds a non-uniform reveal timeline with thinking pauses and distance-aware travel. */
export function buildStepSchedule<T extends RevealableElement>(steps: readonly RevealStep<T>[]): {
  items: ScheduledStep[];
  totalMs: number;
} {
  if (steps.length === 0) return { items: [], totalMs: 0 };

  const raw: Array<{ weightMs: number; thinkFraction: number; moveFraction: number }> = [];
  let rawTotal = 0;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    const prev = i > 0 ? steps[i - 1]! : null;
    const dist = prev ? Math.hypot(step.startPoint.x - prev.endPoint.x, step.startPoint.y - prev.endPoint.y) : 0;
    const jitter = seededUnit(i + steps.length * 3);
    const isConnector = step.primary.type === 'arrow' || step.primary.type === 'line';

    const thinkMs = i === 0
      ? 90 + jitter * 70
      : (dist > 140 ? 95 : 40) + (!isConnector && jitter > 0.62 ? 85 : jitter * 45);
    const moveMs = i === 0 ? 0 : Math.min(220, 55 + dist * 0.24 + jitter * 25);
    const drawBase = isConnector ? 165 : step.primary.type === 'text' ? 140 : 210;
    const drawMs = drawBase + seededUnit(i * 7 + 1) * 75;
    const weightMs = thinkMs + moveMs + drawMs;
    rawTotal += weightMs;
    raw.push({
      weightMs,
      thinkFraction: thinkMs / weightMs,
      moveFraction: moveMs / weightMs,
    });
  }

  const totalMs = Math.min(5800, Math.max(1500, Math.round(rawTotal)));
  const scale = rawTotal > 0 ? totalMs / rawTotal : 1;
  const items: ScheduledStep[] = [];
  let cursorMs = 0;

  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i]!;
    const dur = i === raw.length - 1 ? totalMs - cursorMs : entry.weightMs * scale;
    items.push({
      startMs: cursorMs,
      endMs: cursorMs + dur,
      thinkFraction: entry.thinkFraction,
      moveFraction: entry.moveFraction,
    });
    cursorMs += dur;
  }

  return { items, totalMs };
}

export function resolveScheduledStep(
  schedule: readonly ScheduledStep[],
  elapsedMs: number,
): { stepIndex: number; stepProgress: number; thinkFraction: number; moveFraction: number } {
  const clampedElapsed = Math.max(0, elapsedMs);
  for (let i = 0; i < schedule.length; i++) {
    const item = schedule[i]!;
    if (clampedElapsed <= item.endMs || i === schedule.length - 1) {
      const span = Math.max(1e-6, item.endMs - item.startMs);
      return {
        stepIndex: i,
        stepProgress: Math.min(1, Math.max(0, (clampedElapsed - item.startMs) / span)),
        thinkFraction: item.thinkFraction,
        moveFraction: item.moveFraction,
      };
    }
  }
  return { stepIndex: 0, stepProgress: 1, thinkFraction: 0, moveFraction: 0 };
}
