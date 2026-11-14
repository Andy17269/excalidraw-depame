import { CaptureUpdateAction, newElementWith } from '@excalidraw/excalidraw';
import type { AppState, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { getAiAnimationEnabled } from './aiSettings';
import { matchesShortcutLetter } from './undoShortcut';
import {
  buildRevealSteps,
  buildStepSchedule,
  interpolateViewport,
  resolveScheduledStep,
  truncatePolyline,
  type RevealStep,
  type Viewport,
} from './sceneMath';

export { buildRevealSteps, type RevealStep };

export interface AiCursorState {
  visible: boolean;
  x: number;
  y: number;
  phase: 'moving' | 'drawing' | 'idle';
}

export interface AnimateDiagramParams {
  api: ExcalidrawImperativeAPI;
  host: HTMLElement | null;
  baseElements: readonly ExcalidrawElement[];
  /** Scene snapshot to restore on single-step undo when animation replaces existing items. */
  undoBaseElements?: readonly ExcalidrawElement[];
  newElements: readonly ExcalidrawElement[];
  targetViewport: Viewport;
  isCurrent: () => boolean;
}

let cursorState: AiCursorState = { visible: false, x: 0, y: 0, phase: 'idle' };
const listeners = new Set<(state: AiCursorState) => void>();
let activeStop: ((mode: 'commit' | 'abort') => void) | null = null;
let animationActive = false;

export function isCanvasAnimationActive(): boolean {
  return animationActive;
}

function emitCursor(next: AiCursorState): void {
  cursorState = next;
  for (const listener of listeners) listener(next);
}

function hideCursor(): void {
  emitCursor({ ...cursorState, visible: false, phase: 'idle' });
}

export function getAiCursorState(): AiCursorState {
  return cursorState;
}

export function subscribeAiCursor(listener: (state: AiCursorState) => void): () => void {
  listeners.add(listener);
  listener(cursorState);
  return () => { listeners.delete(listener); };
}

export function cancelCanvasAnimation(): void {
  activeStop?.('abort');
}

function rampOpacity(targetOpacity: number, progress: number, minVisible: number): number {
  if (targetOpacity === 0) return 0;
  return Math.min(targetOpacity, Math.max(minVisible, Math.round(targetOpacity * Math.min(1, Math.max(0, progress)))));
}

function organicDrawEase(u: number, seed: number): number {
  const t = Math.min(1, Math.max(0, u));
  const base = 1 - Math.pow(1 - t, 2.75);
  // Subtle mid-stroke hesitation/cadence modulation that vanishes cleanly at 0 and 1.
  const ripple = Math.sin(t * Math.PI * (2 + (seed % 2))) * (1 - t) * t * 0.16;
  return Math.min(1, Math.max(0, base - ripple));
}

export function buildAnimatedElements(
  steps: readonly RevealStep<ExcalidrawElement>[],
  stepIndex: number,
  stepProgress: number,
  timing?: { thinkFraction?: number; moveFraction?: number },
): { elements: ExcalidrawElement[]; cursorScenePoint: { x: number; y: number }; phase: 'moving' | 'drawing' } {
  const elements: ExcalidrawElement[] = [];
  for (let i = 0; i < stepIndex; i++) {
    const done = steps[i]!;
    elements.push(done.primary, ...done.boundTexts);
  }
  const step = steps[stepIndex]!;
  const clamped = Math.min(1, Math.max(0, stepProgress));
  const thinkFraction = timing?.thinkFraction ?? (stepIndex > 0 ? 0.1 : 0);
  const moveFraction = timing?.moveFraction ?? (stepIndex > 0 ? 0.22 : 0);

  if (thinkFraction > 0 && clamped < thinkFraction) {
    const anchor = stepIndex > 0 ? steps[stepIndex - 1]!.endPoint : step.startPoint;
    const thinkT = clamped / thinkFraction;
    const drift = Math.sin(thinkT * Math.PI) * 1.8;
    const sign = stepIndex % 2 === 0 ? 1 : -1;
    return {
      elements,
      phase: 'moving',
      cursorScenePoint: {
        x: anchor.x + drift * sign,
        y: anchor.y - Math.abs(drift) * 0.6,
      },
    };
  }

  const moveEnd = thinkFraction + moveFraction;
  if (moveFraction > 0 && clamped < moveEnd) {
    const prev = steps[stepIndex - 1]!;
    const moveT = (clamped - thinkFraction) / moveFraction;
    const moveEase = moveT < 0.5 ? 4 * moveT * moveT * moveT : 1 - Math.pow(-2 * moveT + 2, 3) / 2;
    const dx = step.startPoint.x - prev.endPoint.x;
    const dy = step.startPoint.y - prev.endPoint.y;
    const dist = Math.hypot(dx, dy);
    const arcHeight = dist > 16 ? Math.min(18, dist * 0.08) * (stepIndex % 2 === 0 ? 1 : -1) : 0;
    const nx = dist > 1e-3 ? -dy / dist : 0;
    const ny = dist > 1e-3 ? dx / dist : 0;
    const arcOffset = Math.sin(moveEase * Math.PI) * arcHeight;
    return {
      elements,
      phase: 'moving',
      cursorScenePoint: {
        x: prev.endPoint.x + dx * moveEase + nx * arcOffset,
        y: prev.endPoint.y + dy * moveEase + ny * arcOffset,
      },
    };
  }

  const drawSpan = Math.max(1e-6, 1 - moveEnd);
  const drawU = moveEnd > 0 ? Math.min(1, Math.max(0, (clamped - moveEnd) / drawSpan)) : clamped;
  const ease = organicDrawEase(drawU, stepIndex);
  const primary = step.primary;
  let cursorScenePoint: { x: number; y: number };

  if ((primary.type === 'arrow' || primary.type === 'line') && 'points' in primary && Array.isArray(primary.points) && primary.points.length >= 2) {
    const truncated = truncatePolyline(primary.points, ease);
    elements.push(newElementWith(primary, {
      points: truncated.points as typeof primary.points,
      width: truncated.width,
      height: truncated.height,
      opacity: rampOpacity(primary.opacity, drawU * 2.5, 25),
    }));
    cursorScenePoint = { x: primary.x + truncated.tip[0], y: primary.y + truncated.tip[1] };
    if (drawU >= 0.65) {
      const textProgress = (drawU - 0.65) / 0.35;
      for (const bt of step.boundTexts) elements.push(newElementWith(bt, { opacity: rampOpacity(bt.opacity, textProgress, 15) }));
    }
  } else if (primary.type === 'text') {
    elements.push(newElementWith(primary, { opacity: rampOpacity(primary.opacity, ease, 15) }));
    cursorScenePoint = { x: primary.x + primary.width * ease, y: primary.y + primary.height / 2 };
  } else {
    const scale = 0.22 + 0.78 * ease;
    const width = Math.max(8, primary.width * scale);
    const height = Math.max(8, primary.height * scale);
    elements.push(newElementWith(primary, {
      width,
      height,
      opacity: rampOpacity(primary.opacity, drawU * 2.2, 20),
    }));
    cursorScenePoint = { x: primary.x + width, y: primary.y + height };
    if (drawU >= 0.45) {
      const textProgress = (drawU - 0.45) / 0.55;
      for (const bt of step.boundTexts) elements.push(newElementWith(bt, { opacity: rampOpacity(bt.opacity, textProgress, 15) }));
    }
  }

  return { elements, cursorScenePoint, phase: 'drawing' };
}

export function animateDiagramCreation(params: AnimateDiagramParams): Promise<void> {
  const { api, host, baseElements, undoBaseElements, newElements, targetViewport, isCurrent } = params;
  activeStop?.('commit');

  const steps = buildRevealSteps(newElements);
  const state = api.getAppState();
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const canAnimate = getAiAnimationEnabled() && !reducedMotion && steps.length > 0 && state.width > 0 && state.height > 0 && typeof requestAnimationFrame === 'function';

  if (!canAnimate) {
    if (!isCurrent()) return Promise.reject(new Error('画布已切换'));
    api.updateScene({
      elements: [...baseElements, ...newElements],
      appState: {
        zoom: { value: targetViewport.zoom as AppState['zoom']['value'] },
        scrollX: targetViewport.scrollX,
        scrollY: targetViewport.scrollY,
        shouldCacheIgnoreZoom: false,
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    hideCursor();
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const startViewport: Viewport = { zoom: state.zoom.value, scrollX: state.scrollX, scrollY: state.scrollY };
    const viewportSize = { width: state.width, height: state.height };
    const schedule = buildStepSchedule(steps);
    const totalMs = schedule.totalMs;
    const cameraMs = Math.min(totalMs, 1900, Math.max(700, Math.round(totalMs * 0.55)));
    let frameId = 0;
    let startTime = 0;
    let settled = false;
    let cameraCommitted = false;
    let nextSceneAt = 0;

    const isCanvasTarget = (target: EventTarget | null) =>
      target instanceof HTMLCanvasElement
      || (target instanceof HTMLTextAreaElement && target.classList.contains('excalidraw-wysiwyg'));

    const onPointerOrWheel = (event: Event) => {
      if (isCanvasTarget(event.target)) finish('interrupted');
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const isUndoCombo = (event.ctrlKey || event.metaKey) && !event.altKey && matchesShortcutLetter(event, 'z');
      if (event.key === 'Escape' || isUndoCombo || event.key === 'Undo' || event.code === 'Undo') {
        finish('interrupted');
      }
    };

    const cleanup = () => {
      animationActive = false;
      if (frameId) { cancelAnimationFrame(frameId); frameId = 0; }
      host?.removeEventListener('pointerdown', onPointerOrWheel, true);
      host?.removeEventListener('wheel', onPointerOrWheel, true);
      host?.removeEventListener('gesturestart', onPointerOrWheel, true);
      window.removeEventListener('keydown', onKeyDown, true);
      activeStop = null;
      hideCursor();
    };

    const finish = (outcome: 'completed' | 'interrupted' | 'abort') => {
      if (settled) return;
      settled = true;
      cleanup();
      if (outcome === 'abort' || !isCurrent()) {
        reject(new Error('画布已切换'));
        return;
      }
      // Intermediate frames may have advanced Excalidraw's history snapshot; reset it so the
      // final commit is recorded as one undoable increment over the pre-AI scene.
      api.updateScene({ elements: [...(undoBaseElements ?? baseElements)], captureUpdate: CaptureUpdateAction.NEVER });
      api.updateScene({
        elements: [...baseElements, ...newElements],
        appState: (outcome === 'completed'
          ? {
            zoom: { value: targetViewport.zoom as AppState['zoom']['value'] },
            scrollX: targetViewport.scrollX,
            scrollY: targetViewport.scrollY,
            shouldCacheIgnoreZoom: false,
          }
          : { shouldCacheIgnoreZoom: false }) as Pick<AppState, 'shouldCacheIgnoreZoom'>,
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      resolve();
    };

    animationActive = true;
    activeStop = mode => finish(mode === 'commit' ? 'completed' : 'abort');
    host?.addEventListener('pointerdown', onPointerOrWheel, { capture: true });
    host?.addEventListener('wheel', onPointerOrWheel, { capture: true, passive: true });
    host?.addEventListener('gesturestart', onPointerOrWheel, { capture: true });
    window.addEventListener('keydown', onKeyDown, { capture: true });

    const tick = (now: number) => {
      if (settled) return;
      if (!isCurrent()) { finish('abort'); return; }
      if (!startTime) startTime = now;
      const elapsed = Math.max(0, now - startTime);
      if (elapsed >= totalMs) { finish('completed'); return; }

      const camT = Math.min(1, elapsed / cameraMs);
      const view = interpolateViewport(startViewport, targetViewport, camT, viewportSize);
      const scheduled = resolveScheduledStep(schedule.items, elapsed);
      const frame = buildAnimatedElements(steps, scheduled.stepIndex, scheduled.stepProgress, {
        thinkFraction: scheduled.thinkFraction,
        moveFraction: scheduled.moveFraction,
      });
      const liveState = api.getAppState();

      if (now >= nextSceneAt) {
        const t0 = performance.now();
        const shouldUpdateCamera = camT < 1 || !cameraCommitted;
        if (camT >= 1) cameraCommitted = true;
        api.updateScene({
          elements: [...baseElements, ...frame.elements],
          ...(shouldUpdateCamera
            ? {
              appState: {
                zoom: { value: view.zoom as AppState['zoom']['value'] },
                scrollX: view.scrollX,
                scrollY: view.scrollY,
                shouldCacheIgnoreZoom: true,
              },
            }
            : {}),
          captureUpdate: CaptureUpdateAction.NEVER,
        });
        const cost = performance.now() - t0;
        nextSceneAt = cost > 14 ? now + Math.min(50, cost * 1.5) : 0;
      }

      emitCursor({
        visible: true,
        x: (frame.cursorScenePoint.x + view.scrollX) * view.zoom + liveState.offsetLeft,
        y: (frame.cursorScenePoint.y + view.scrollY) * view.zoom + liveState.offsetTop,
        phase: frame.phase,
      });
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
  });
}
