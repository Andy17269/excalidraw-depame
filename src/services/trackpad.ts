import type { AppState, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { clampZoom, zoomAtPoint } from './sceneMath.ts';

const CAPTURE_NEVER = 'NEVER' as const;

const UI_OVERLAY_SELECTOR = [
  '.context-menu',
  '.excalidraw-contextMenuContainer',
  '.layer-ui__wrapper',
  '.Modal',
  '.popover',
  '.excalidraw-hyperlinkContainer',
  '.excalidraw-eye-dropper-container',
  '.file-capsule',
  '.menu-dropdown',
  '.menu-overlay',
  '.menu-panel',
  '.zoom-capsule',
  '.properties',
  '.dock-position',
  '.tool-picker',
  '.presets-menu',
  '.welcome-screen',
].join(', ');

type PinchEvent = Event & { scale?: number; clientX?: number; clientY?: number };

export function isCanvasZoomTarget(canvasLayer: HTMLElement, target: EventTarget | null): boolean {
  if (!(target instanceof Element) || !canvasLayer.contains(target)) return false;
  if (target.closest(UI_OVERLAY_SELECTOR)) return false;
  if (target instanceof HTMLTextAreaElement) return target.classList.contains('excalidraw-wysiwyg');
  if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLButtonElement) {
    return false;
  }
  return target instanceof HTMLCanvasElement
    || target === canvasLayer
    || target.closest('.excalidraw-container') !== null;
}

/**
 * Attaches smooth cursor-anchored trackpad pinch/Ctrl-wheel zoom and rAF-batched
 * two-finger panning to the bottom-most canvas DOM layer, leaving sibling UI
 * overlays uncovered and letting normal UI scrolling pass through.
 */
export function attachTrackpad(
  canvasLayer: HTMLElement,
  api: ExcalidrawImperativeAPI,
  uiGuardHost?: HTMLElement | null,
): () => void {
  let gestureZoom = 1;
  let gestureScale = 1;
  let gesturing = false;
  let frame = 0;
  let settleTimer = 0;
  let ignoreZoomCache = false;
  let lastPointer: { x: number; y: number } | null = null;
  let pending: { zoom: number; x: number; y: number } | null = null;
  let pendingPan: { dx: number; dy: number } | null = null;

  const clearIgnoreZoomCache = () => {
    if (settleTimer) {
      clearTimeout(settleTimer);
      settleTimer = 0;
    }
    if (!ignoreZoomCache) return;
    ignoreZoomCache = false;
    api.updateScene({
      appState: { shouldCacheIgnoreZoom: false },
      captureUpdate: CAPTURE_NEVER,
    });
  };

  const resolvePoint = (event: { clientX?: number; clientY?: number }, state: AppState) => {
    const hasCoords = typeof event.clientX === 'number' && Number.isFinite(event.clientX)
      && typeof event.clientY === 'number' && Number.isFinite(event.clientY);
    if (hasCoords) {
      const zeroSynthetic = !(event instanceof MouseEvent)
        && event.clientX === 0 && event.clientY === 0
        && lastPointer !== null && (Math.abs(lastPointer.x) > 8 || Math.abs(lastPointer.y) > 8);
      if (!zeroSynthetic) return { x: event.clientX!, y: event.clientY! };
    }
    if (lastPointer) return lastPointer;
    return { x: state.offsetLeft + state.width / 2, y: state.offsetTop + state.height / 2 };
  };

  type ViewSnapshot = { zoom: number; scrollX: number; scrollY: number };
  let optimisticView: ViewSnapshot | null = null;
  const sentViews: ViewSnapshot[] = [];
  let syncTimer = 0;
  const matchesView = (a: ViewSnapshot, b: Pick<AppState, 'scrollX' | 'scrollY'> & { zoom: { value: number } }) =>
    Math.abs(a.zoom - b.zoom.value) < 1e-6
    && Math.abs(a.scrollX - b.scrollX) < 1e-4
    && Math.abs(a.scrollY - b.scrollY) < 1e-4;
  const clearOptimistic = () => {
    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = 0;
    }
    sentViews.length = 0;
    optimisticView = null;
  };
  const readView = (state: AppState): ViewSnapshot => {
    if (optimisticView && sentViews.length <= 1 && matchesView(optimisticView, state)) {
      clearOptimistic();
    }
    return optimisticView ?? { zoom: state.zoom.value, scrollX: state.scrollX, scrollY: state.scrollY };
  };

  const flush = (settle = false) => {
    frame = 0;
    if (!pending && !pendingPan) {
      if (settle) clearIgnoreZoomCache();
      return;
    }
    const state = api.getAppState();
    const initialView = readView(state);
    let view = initialView;
    if (pendingPan) {
      const zoom = clampZoom(view.zoom);
      view = {
        zoom,
        scrollX: view.scrollX - pendingPan.dx / zoom,
        scrollY: view.scrollY - pendingPan.dy / zoom,
      };
      pendingPan = null;
    }
    const hasZoom = pending !== null;
    let next = view;
    if (pending) {
      next = zoomAtPoint(
        view,
        pending.zoom,
        { x: pending.x - state.offsetLeft, y: pending.y - state.offsetTop },
      );
      pending = null;
    }
    if (next.zoom === initialView.zoom && next.scrollX === initialView.scrollX && next.scrollY === initialView.scrollY) {
      if (settle) clearIgnoreZoomCache();
      return;
    }
    const hadIgnoreCache = ignoreZoomCache;
    const keepCache = hasZoom ? !settle : (settle ? false : ignoreZoomCache);
    if (hasZoom || settle) ignoreZoomCache = keepCache;
    sentViews.push(next);
    optimisticView = next;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = window.setTimeout(clearOptimistic, 160);
    if (hasZoom || hadIgnoreCache) {
      api.updateScene({
        appState: {
          zoom: { value: next.zoom as typeof state.zoom.value },
          scrollX: next.scrollX,
          scrollY: next.scrollY,
          shouldCacheIgnoreZoom: keepCache,
        },
        captureUpdate: CAPTURE_NEVER,
      });
    } else {
      api.updateScene({
        appState: {
          scrollX: next.scrollX,
          scrollY: next.scrollY,
        },
        captureUpdate: CAPTURE_NEVER,
      });
    }
    if (hasZoom || settle) {
      if (settleTimer) {
        clearTimeout(settleTimer);
        settleTimer = 0;
      }
      if (keepCache) {
        settleTimer = window.setTimeout(clearIgnoreZoomCache, 160);
      }
    }
  };

  const queue = (zoom: number, x: number, y: number) => {
    if (!Number.isFinite(zoom) || zoom <= 0) return;
    const state = api.getAppState();
    pending = {
      zoom: clampZoom(zoom),
      x: Number.isFinite(x) ? x : state.offsetLeft + state.width / 2,
      y: Number.isFinite(y) ? y : state.offsetTop + state.height / 2,
    };
    if (!frame) frame = requestAnimationFrame(() => flush(false));
  };

  const trackPointer = (event: PointerEvent) => {
    if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
      lastPointer = { x: event.clientX, y: event.clientY };
    }
  };

  const onCanvasWheel = (event: WheelEvent) => {
    const isZoom = event.ctrlKey || event.metaKey;
    if (!isCanvasZoomTarget(canvasLayer, event.target)) {
      if (isZoom) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
      lastPointer = { x: event.clientX, y: event.clientY };
    }
    if (gesturing) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? (canvasLayer.clientHeight || window.innerHeight || 800) : 1;
    if (isZoom) {
      const delta = event.deltaY * unit;
      if (!Number.isFinite(delta) || delta === 0) return;
      const state = api.getAppState();
      const baseZoom = pending?.zoom ?? clampZoom(readView(state).zoom);
      const nextZoom = clampZoom(baseZoom * Math.exp(-Math.max(-100, Math.min(100, delta)) * 0.01));
      const point = resolvePoint(event, state);
      queue(nextZoom, point.x, point.y);
      return;
    }
    const rawX = Number.isFinite(event.deltaX) ? event.deltaX : 0;
    const rawY = Number.isFinite(event.deltaY) ? event.deltaY : 0;
    const dx = event.shiftKey ? (rawY || rawX) * unit : rawX * unit;
    const dy = event.shiftKey ? 0 : rawY * unit;
    if (dx === 0 && dy === 0) return;
    pendingPan = {
      dx: (pendingPan?.dx ?? 0) + dx,
      dy: (pendingPan?.dy ?? 0) + dy,
    };
    if (!frame) frame = requestAnimationFrame(() => flush(false));
  };

  const onGestureStart = (raw: Event) => {
    const event = raw as PinchEvent;
    if (!isCanvasZoomTarget(canvasLayer, event.target)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    gesturing = true;
    gestureZoom = pending?.zoom ?? clampZoom(readView(api.getAppState()).zoom);
    gestureScale = typeof event.scale === 'number' && Number.isFinite(event.scale) && event.scale > 0 ? event.scale : 1;
    if (typeof event.clientX === 'number' && Number.isFinite(event.clientX)
      && typeof event.clientY === 'number' && Number.isFinite(event.clientY)
      && (event.clientX !== 0 || event.clientY !== 0)) {
      lastPointer = { x: event.clientX, y: event.clientY };
    }
  };

  const onGestureChange = (raw: Event) => {
    const event = raw as PinchEvent;
    if (!gesturing) {
      if (!isCanvasZoomTarget(canvasLayer, event.target)) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.scale === 'number' && Number.isFinite(event.scale) && event.scale > 0) {
      const point = resolvePoint(event, api.getAppState());
      queue(clampZoom(gestureZoom * event.scale / gestureScale), point.x, point.y);
    }
  };

  const finishGesture = (event?: Event) => {
    if (event && !isCanvasZoomTarget(canvasLayer, event.target) && !gesturing) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!gesturing) return;
    gesturing = false;
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    flush(true);
  };

  const onVisibilityOrBlur = () => {
    if (document.visibilityState === 'hidden' || !document.hasFocus()) {
      gesturing = false;
      pending = null;
      pendingPan = null;
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      clearOptimistic();
      clearIgnoreZoomCache();
    }
  };

  // Bubble-phase guard on the outer host prevents zoom gestures over sibling UI layers from
  // reaching Excalidraw's document-level gesture listeners or triggering webview page zoom,
  // while never intercepting or covering UI interactions.
  const guardHost = uiGuardHost && uiGuardHost !== canvasLayer ? uiGuardHost : null;
  const onUiBubbleWheel = (event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  const onUiBubbleGesture = (event: Event) => {
    if (gesturing && (event.type === 'gestureend' || event.type === 'gesturecancel')) {
      finishGesture(event);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  canvasLayer.addEventListener('pointermove', trackPointer, { capture: true, passive: true });
  canvasLayer.addEventListener('pointerdown', trackPointer, { capture: true, passive: true });
  canvasLayer.addEventListener('wheel', onCanvasWheel, { capture: true, passive: false });
  canvasLayer.addEventListener('gesturestart', onGestureStart, { capture: true, passive: false });
  canvasLayer.addEventListener('gesturechange', onGestureChange, { capture: true, passive: false });
  canvasLayer.addEventListener('gestureend', finishGesture, { capture: true, passive: false });
  canvasLayer.addEventListener('gesturecancel', finishGesture, { capture: true, passive: false });
  window.addEventListener('blur', onVisibilityOrBlur);
  document.addEventListener('visibilitychange', onVisibilityOrBlur);
  if (guardHost) {
    guardHost.addEventListener('wheel', onUiBubbleWheel, { capture: false, passive: false });
    guardHost.addEventListener('gesturestart', onUiBubbleGesture, { capture: false, passive: false });
    guardHost.addEventListener('gesturechange', onUiBubbleGesture, { capture: false, passive: false });
    guardHost.addEventListener('gestureend', onUiBubbleGesture, { capture: false, passive: false });
    guardHost.addEventListener('gesturecancel', onUiBubbleGesture, { capture: false, passive: false });
  }

  const stopOnChange = typeof api.onChange === 'function'
    ? api.onChange((_elements, appState) => {
      if (sentViews.length === 0 && !optimisticView) return;
      const idx = sentViews.findIndex(v => matchesView(v, appState));
      if (idx >= 0) {
        sentViews.splice(0, idx + 1);
        if (sentViews.length === 0) clearOptimistic();
      } else {
        clearOptimistic();
      }
    })
    : null;

  return () => {
    stopOnChange?.();
    if (frame) cancelAnimationFrame(frame);
    if (settleTimer) clearTimeout(settleTimer);
    clearOptimistic();
    pending = null;
    pendingPan = null;
    gesturing = false;
    canvasLayer.removeEventListener('pointermove', trackPointer, true);
    canvasLayer.removeEventListener('pointerdown', trackPointer, true);
    canvasLayer.removeEventListener('wheel', onCanvasWheel, true);
    canvasLayer.removeEventListener('gesturestart', onGestureStart, true);
    canvasLayer.removeEventListener('gesturechange', onGestureChange, true);
    canvasLayer.removeEventListener('gestureend', finishGesture, true);
    canvasLayer.removeEventListener('gesturecancel', finishGesture, true);
    window.removeEventListener('blur', onVisibilityOrBlur);
    document.removeEventListener('visibilitychange', onVisibilityOrBlur);
    if (guardHost) {
      guardHost.removeEventListener('wheel', onUiBubbleWheel, false);
      guardHost.removeEventListener('gesturestart', onUiBubbleGesture, false);
      guardHost.removeEventListener('gesturechange', onUiBubbleGesture, false);
      guardHost.removeEventListener('gestureend', onUiBubbleGesture, false);
      guardHost.removeEventListener('gesturecancel', onUiBubbleGesture, false);
    }
  };
}
