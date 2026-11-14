export interface SpatialViewport {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
}

export interface CompactCanvasElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor: string;
  backgroundColor: string;
  text?: string;
}

export interface OffscreenElementSummary {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
}

export interface SpatialCanvasContext {
  viewport: SpatialViewport;
  selectedElements: CompactCanvasElement[];
  viewportElements: CompactCanvasElement[];
  offscreenElements: OffscreenElementSummary[];
}

export interface SpatialElementInput {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor: string;
  backgroundColor: string;
  text?: string;
  isDeleted?: boolean;
}

export interface SpatialAppStateInput {
  scrollX: number;
  scrollY: number;
  width: number;
  height: number;
  zoom?: { value?: number };
  selectedElementIds?: Readonly<Record<string, boolean>>;
}

export function computeViewportWorldBounds(appState: SpatialAppStateInput): SpatialViewport {
  const zoom = Math.max(0.1, appState.zoom?.value ?? 1);
  const width = Math.max(1, appState.width || 1280);
  const height = Math.max(1, appState.height || 800);
  return {
    x: Math.round(-appState.scrollX),
    y: Math.round(-appState.scrollY),
    width: Math.round(width / zoom),
    height: Math.round(height / zoom),
    zoom: Number(zoom.toFixed(2)),
  };
}

export function intersectsViewport(
  el: Pick<SpatialElementInput, 'x' | 'y' | 'width' | 'height'>,
  viewport: Pick<SpatialViewport, 'x' | 'y' | 'width' | 'height'>,
): boolean {
  const minX = Math.min(el.x, el.x + el.width);
  const maxX = Math.max(el.x, el.x + el.width);
  const minY = Math.min(el.y, el.y + el.height);
  const maxY = Math.max(el.y, el.y + el.height);
  return (
    maxX >= viewport.x
    && minX <= viewport.x + viewport.width
    && maxY >= viewport.y
    && minY <= viewport.y + viewport.height
  );
}

function toCompactElement(el: SpatialElementInput): CompactCanvasElement {
  return {
    id: el.id,
    type: el.type,
    x: Math.round(el.x),
    y: Math.round(el.y),
    width: Math.round(el.width),
    height: Math.round(el.height),
    strokeColor: el.strokeColor,
    backgroundColor: el.backgroundColor,
    ...(typeof el.text === 'string' && el.text.length > 0 ? { text: el.text } : {}),
  };
}

function toOffscreenSummary(el: SpatialElementInput): OffscreenElementSummary {
  return {
    id: el.id,
    type: el.type,
    x: Math.round(el.x),
    y: Math.round(el.y),
    width: Math.round(el.width),
    height: Math.round(el.height),
    ...(typeof el.text === 'string' && el.text.length > 0 ? { text: el.text } : {}),
  };
}

export function buildSpatialCanvasContext<T extends SpatialElementInput>(
  elements: readonly T[],
  appState: SpatialAppStateInput,
  limits: { maxViewport?: number; maxOffscreen?: number } = {},
): {
  context: SpatialCanvasContext;
  viewportSourceElements: T[];
} {
  const maxViewport = limits.maxViewport ?? 120;
  const maxOffscreen = limits.maxOffscreen ?? 120;
  const viewport = computeViewportWorldBounds(appState);
  const selectedIds = appState.selectedElementIds ?? {};

  const selectedElements: CompactCanvasElement[] = [];
  const viewportElements: CompactCanvasElement[] = [];
  const offscreenElements: OffscreenElementSummary[] = [];
  const viewportSourceElements: T[] = [];

  for (const el of elements) {
    if (el.isDeleted) continue;
    const isSelected = Boolean(selectedIds[el.id]);
    const inViewport = intersectsViewport(el, viewport);

    if (isSelected) {
      selectedElements.push(toCompactElement(el));
      viewportSourceElements.push(el);
    } else if (inViewport) {
      if (viewportElements.length < maxViewport) {
        viewportElements.push(toCompactElement(el));
      }
      viewportSourceElements.push(el);
    } else if (offscreenElements.length < maxOffscreen) {
      offscreenElements.push(toOffscreenSummary(el));
    }
  }

  return {
    context: {
      viewport,
      selectedElements,
      viewportElements,
      offscreenElements,
    },
    viewportSourceElements,
  };
}

export function snapToGrid8(value: number): number {
  return Math.round(value / 8) * 8;
}
