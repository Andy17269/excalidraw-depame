import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachTrackpad, isCanvasZoomTarget } from '../src/services/trackpad.ts';

type Listener = { type: string; fn: EventListener; capture: boolean };

class FakeClassList {
  private set: Set<string>;
  constructor(names: string[]) {
    this.set = new Set(names);
  }
  contains(name: string) {
    return this.set.has(name);
  }
}

class FakeElement {
  classList: FakeClassList;
  parentElement: FakeElement | null = null;
  clientHeight = 800;
  listeners: Listener[] = [];
  constructor(classes: string[] = []) {
    this.classList = new FakeClassList(classes);
  }
  appendChild(child: FakeElement) {
    child.parentElement = this;
    return child;
  }
  contains(node: FakeElement | null): boolean {
    for (let cur = node; cur; cur = cur.parentElement) {
      if (cur === this) return true;
    }
    return false;
  }
  closest(selector: string): FakeElement | null {
    const tokens = selector.split(',').map(part => part.trim().replace(/^\./, ''));
    const check = (node: FakeElement | null): FakeElement | null => {
      for (let cur = node; cur; cur = cur.parentElement) {
        if (tokens.some(token => cur.classList.contains(token))) return cur;
      }
      return null;
    };
    return check(this);
  }
  addEventListener(type: string, fn: EventListener, options?: boolean | AddEventListenerOptions) {
    const capture = typeof options === 'boolean' ? options : Boolean(options?.capture);
    this.listeners.push({ type, fn, capture });
  }
  removeEventListener(type: string, fn: EventListener, options?: boolean | EventListenerOptions) {
    const capture = typeof options === 'boolean' ? options : Boolean(options?.capture);
    this.listeners = this.listeners.filter(l => !(l.type === type && l.fn === fn && l.capture === capture));
  }
}

class FakeCanvasElement extends FakeElement {}
class FakeTextAreaElement extends FakeElement {}
class FakeInputElement extends FakeElement {}
class FakeSelectElement extends FakeElement {}
class FakeButtonElement extends FakeElement {}
class FakeBaseEvent {
  type: string;
  target: FakeElement;
  defaultPrevented = false;
  propagationStopped = false;
  constructor(type: string, target: FakeElement, init: Record<string, unknown> = {}) {
    this.type = type;
    this.target = target;
    Object.assign(this, init);
  }
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this.propagationStopped = true; }
}
class FakeMouseEvent extends FakeBaseEvent {}
class SyntheticGestureEvent extends FakeBaseEvent {}

function dispatch(target: FakeElement, event: FakeBaseEvent) {
  const path: FakeElement[] = [];
  let cur: FakeElement | null = target;
  while (cur) {
    path.unshift(cur);
    cur = cur.parentElement;
  }
  for (const node of path) {
    if (event.propagationStopped) break;
    for (const l of node.listeners) {
      if (l.type === event.type && l.capture) l.fn(event as unknown as Event);
    }
  }
  for (let i = path.length - 1; i >= 0; i--) {
    if (event.propagationStopped) break;
    for (const l of path[i]!.listeners) {
      if (l.type === event.type && !l.capture) l.fn(event as unknown as Event);
    }
  }
}

function installDomStubs() {
  let rafId = 1;
  const rafQueue = new Map<number, () => void>();
  Object.assign(globalThis, {
    Element: FakeElement,
    HTMLCanvasElement: FakeCanvasElement,
    HTMLTextAreaElement: FakeTextAreaElement,
    HTMLInputElement: FakeInputElement,
    HTMLSelectElement: FakeSelectElement,
    HTMLButtonElement: FakeButtonElement,
    MouseEvent: FakeMouseEvent,
    window: {
      innerHeight: 800,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    document: {
      visibilityState: 'visible',
      hasFocus: () => true,
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    requestAnimationFrame: (cb: () => void) => {
      const id = rafId++;
      rafQueue.set(id, cb);
      return id;
    },
    cancelAnimationFrame: (id: number) => {
      rafQueue.delete(id);
    },
  });
  return {
    flushFrames() {
      for (const [id, cb] of Array.from(rafQueue)) {
        rafQueue.delete(id);
        cb();
      }
    },
  };
}

test('isCanvasZoomTarget accepts canvas and wysiwyg editor while rejecting UI overlays', () => {
  installDomStubs();
  const stage = new FakeElement(['canvas-stage']);
  const canvasLayer = stage.appendChild(new FakeElement(['canvas-layer']));
  const excalidraw = canvasLayer.appendChild(new FakeElement(['excalidraw', 'excalidraw-container']));
  const interactive = excalidraw.appendChild(new FakeCanvasElement(['excalidraw__canvas', 'interactive']));
  const wysiwyg = excalidraw.appendChild(new FakeTextAreaElement(['excalidraw-wysiwyg']));
  const contextMenu = excalidraw.appendChild(new FakeElement(['context-menu']));
  const contextItem = contextMenu.appendChild(new FakeButtonElement(['context-menu-item']));

  const dock = stage.appendChild(new FakeElement(['dock-position']));
  const dockTextarea = dock.appendChild(new FakeTextAreaElement());
  const zoomCapsule = stage.appendChild(new FakeElement(['zoom-capsule']));
  const zoomBtn = zoomCapsule.appendChild(new FakeButtonElement(['zoom-step']));

  assert.equal(isCanvasZoomTarget(canvasLayer as unknown as HTMLElement, interactive as unknown as EventTarget), true);
  assert.equal(isCanvasZoomTarget(canvasLayer as unknown as HTMLElement, wysiwyg as unknown as EventTarget), true);
  assert.equal(isCanvasZoomTarget(canvasLayer as unknown as HTMLElement, contextItem as unknown as EventTarget), false);
  assert.equal(isCanvasZoomTarget(canvasLayer as unknown as HTMLElement, dockTextarea as unknown as EventTarget), false);
  assert.equal(isCanvasZoomTarget(canvasLayer as unknown as HTMLElement, zoomBtn as unknown as EventTarget), false);
});

test('attachTrackpad isolates UI layer scrolling/zooming and anchors canvas zoom to pointer', () => {
  const { flushFrames } = installDomStubs();
  const stage = new FakeElement(['canvas-stage']);
  const canvasLayer = stage.appendChild(new FakeElement(['canvas-layer']));
  const excalidraw = canvasLayer.appendChild(new FakeElement(['excalidraw-container']));
  const interactive = excalidraw.appendChild(new FakeCanvasElement(['interactive']));
  const dock = stage.appendChild(new FakeElement(['dock-position']));
  const dockTextarea = dock.appendChild(new FakeTextAreaElement());

  const state = {
    zoom: { value: 1 },
    scrollX: 0,
    scrollY: 0,
    offsetLeft: 0,
    offsetTop: 0,
    width: 1280,
    height: 800,
    shouldCacheIgnoreZoom: false,
  };
  let updates = 0;
  const api = {
    getAppState: () => state,
    updateScene: ({ appState }: { appState: Record<string, unknown> }) => {
      updates++;
      Object.assign(state, appState);
    },
  };

  const detach = attachTrackpad(
    canvasLayer as unknown as HTMLElement,
    api as never,
    stage as unknown as HTMLElement,
  );

  // Plain wheel on UI passes through untouched
  const plainUiWheel = new FakeMouseEvent('wheel', dockTextarea, { deltaY: 30, ctrlKey: false });
  dispatch(dockTextarea, plainUiWheel);
  assert.equal(plainUiWheel.defaultPrevented, false);
  assert.equal(updates, 0);

  // Ctrl+wheel on UI does not zoom canvas, but stops page zoom in bubble phase
  const ctrlUiWheel = new FakeMouseEvent('wheel', dockTextarea, { deltaY: -69.314718, ctrlKey: true, clientX: 640, clientY: 400 });
  dispatch(dockTextarea, ctrlUiWheel);
  flushFrames();
  assert.equal(ctrlUiWheel.defaultPrevented, true);
  assert.equal(updates, 0);
  assert.equal(state.zoom.value, 1);

  // Track pointer then run GestureEvent without coords: anchors to last pointer on canvas
  dispatch(interactive, new FakeMouseEvent('pointermove', interactive, { clientX: 640, clientY: 400 }));
  const gStart = new FakeMouseEvent('gesturestart', interactive, { scale: 1 });
  dispatch(interactive, gStart);
  assert.equal(gStart.defaultPrevented, true);
  assert.equal(gStart.propagationStopped, true);

  // Non-MouseEvent gesturechange with synthetic (0, 0) uses lastPointer (640, 400)
  const gChange = new SyntheticGestureEvent('gesturechange', interactive, { scale: 2, clientX: 0, clientY: 0 });
  dispatch(interactive, gChange);
  flushFrames();
  assert.equal(state.zoom.value, 2);
  assert.equal(state.scrollX, -320);
  assert.equal(state.scrollY, -200);
  assert.equal(state.shouldCacheIgnoreZoom, true);

  // Gesture end clears cache flag immediately
  const gEnd = new FakeMouseEvent('gestureend', interactive, { scale: 2, clientX: 640, clientY: 400 });
  dispatch(interactive, gEnd);
  assert.equal(state.shouldCacheIgnoreZoom, false);

  detach();
});

test('attachTrackpad avoids zoom divergence when rapid wheel ticks arrive before async updateScene commit', () => {
  const { flushFrames } = installDomStubs();
  const stage = new FakeElement(['canvas-stage']);
  const canvasLayer = stage.appendChild(new FakeElement(['canvas-layer']));
  const excalidraw = canvasLayer.appendChild(new FakeElement(['excalidraw-container']));
  const interactive = excalidraw.appendChild(new FakeCanvasElement(['interactive']));

  const committed = {
    zoom: { value: 1.5 },
    scrollX: 0,
    scrollY: 0,
    offsetLeft: 0,
    offsetTop: 0,
    width: 1280,
    height: 800,
    shouldCacheIgnoreZoom: false,
  };
  let listener: ((el: unknown[], state: typeof committed) => void) | null = null;
  const pendingCommits: Array<typeof committed> = [];
  const api = {
    getAppState: () => committed,
    onChange: (cb: (el: unknown[], state: typeof committed) => void) => {
      listener = cb;
      return () => { listener = null; };
    },
    updateScene: ({ appState }: { appState: Partial<typeof committed> }) => {
      pendingCommits.push({ ...committed, ...appState });
    },
  };

  const detach = attachTrackpad(canvasLayer as unknown as HTMLElement, api as never, stage as unknown as HTMLElement);
  for (let i = 1; i <= 10; i++) {
    dispatch(interactive, new FakeMouseEvent('wheel', interactive, {
      ctrlKey: true,
      deltaY: i % 2 === 0 ? -15 : 15,
      clientX: 640,
      clientY: 400,
    }));
    flushFrames();
  }
  const latest = pendingCommits.at(-1)!;
  assert.ok(Math.abs(latest.zoom.value - 1.5) < 1e-6, `Expected zoom to stay 1.5 without commit lag drift, got ${latest.zoom.value}`);

  // External reset clears optimistic tracking cleanly
  Object.assign(committed, { zoom: { value: 1 } });
  listener?.([], committed);
  dispatch(interactive, new FakeMouseEvent('wheel', interactive, { ctrlKey: true, deltaY: -69.314718, clientX: 640, clientY: 400 }));
  flushFrames();
  assert.ok(Math.abs(pendingCommits.at(-1)!.zoom.value - 2) < 1e-3);

  detach();
});

test('attachTrackpad batches horizontal, vertical, and shift+wheel panning smoothly without commit lag jitter', () => {
  const { flushFrames } = installDomStubs();
  const stage = new FakeElement(['canvas-stage']);
  const canvasLayer = stage.appendChild(new FakeElement(['canvas-layer']));
  const excalidraw = canvasLayer.appendChild(new FakeElement(['excalidraw-container']));
  const interactive = excalidraw.appendChild(new FakeCanvasElement(['interactive']));

  const committed = {
    zoom: { value: 2 },
    scrollX: 0,
    scrollY: 0,
    offsetLeft: 0,
    offsetTop: 0,
    width: 1280,
    height: 800,
    shouldCacheIgnoreZoom: false,
  };
  let listener: ((el: unknown[], state: typeof committed) => void) | null = null;
  const pendingCommits: Array<typeof committed> = [];
  const api = {
    getAppState: () => committed,
    onChange: (cb: (el: unknown[], state: typeof committed) => void) => {
      listener = cb;
      return () => { listener = null; };
    },
    updateScene: ({ appState }: { appState: Partial<typeof committed> }) => {
      pendingCommits.push({ ...committed, ...appState });
    },
  };

  const detach = attachTrackpad(canvasLayer as unknown as HTMLElement, api as never, stage as unknown as HTMLElement);

  // Two rapid horizontal + vertical wheel events within one frame should batch into one updateScene
  const w1 = new FakeMouseEvent('wheel', interactive, { deltaX: 20, deltaY: 10, deltaMode: 0, ctrlKey: false });
  const w2 = new FakeMouseEvent('wheel', interactive, { deltaX: 40, deltaY: 30, deltaMode: 0, ctrlKey: false });
  dispatch(interactive, w1);
  dispatch(interactive, w2);
  assert.equal(w1.defaultPrevented, true);
  assert.equal(w1.propagationStopped, true);
  assert.equal(pendingCommits.length, 0);
  flushFrames();
  assert.equal(pendingCommits.length, 1);
  assert.equal(pendingCommits[0]!.scrollX, -30);
  assert.equal(pendingCommits[0]!.scrollY, -20);

  // Next frame before React commits should continue from optimistic scrollX/scrollY, not reset to 0
  dispatch(interactive, new FakeMouseEvent('wheel', interactive, { deltaX: 20, deltaY: 0, shiftKey: false, ctrlKey: false }));
  flushFrames();
  assert.equal(pendingCommits.length, 2);
  assert.equal(pendingCommits[1]!.scrollX, -40);
  assert.equal(pendingCommits[1]!.scrollY, -20);

  // Commit state and test Shift+wheel horizontal pan
  Object.assign(committed, pendingCommits[1]);
  listener?.([], committed);
  dispatch(interactive, new FakeMouseEvent('wheel', interactive, { deltaX: 0, deltaY: 40, shiftKey: true, ctrlKey: false }));
  flushFrames();
  assert.equal(pendingCommits.at(-1)!.scrollX, -60);
  assert.equal(pendingCommits.at(-1)!.scrollY, -20);

  detach();
});
