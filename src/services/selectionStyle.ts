import { CaptureUpdateAction, newElementWith } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { clampImageRadius, collectTextColorIds } from './elementStyle';

export function setTextColor(api: ExcalidrawImperativeAPI, color: string): void {
  if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) return;
  const ids = collectTextColorIds(api.getSceneElements(), api.getAppState().selectedElementIds);
  api.updateScene({
    elements: api.getSceneElementsIncludingDeleted().map(el => ids.has(el.id) ? newElementWith(el, { strokeColor: color }) : el),
    appState: { currentItemStrokeColor: color },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}

/** Excalidraw clips image roundness in both Canvas and SVG, preserving the source
 * bitmap, crop and flip. Adaptive radius is capped at one quarter of the short edge. */
export function setImageRadius(api: ExcalidrawImperativeAPI, value: number): void {
  if (!Number.isFinite(value) || value < 0) return;
  const selected = api.getAppState().selectedElementIds;
  api.updateScene({
    elements: api.getSceneElementsIncludingDeleted().map(element => {
      if (element.type !== 'image' || element.isDeleted || element.locked || !selected[element.id]) return element;
      const radius = clampImageRadius(value, element.width, element.height);
      return newElementWith(element, { roundness: radius === 0 ? null : { type: 3, value: radius } });
    }),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}
