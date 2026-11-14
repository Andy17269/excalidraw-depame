import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attachUndoShortcut,
  formatShortcutLabelForMac,
  getUndoShortcutLabel,
  isDeleteShortcut,
  isWritableTarget,
  resolveCanvasShortcut,
  resolveUndoShortcut,
  translateToastMessage,
  triggerCanvasUndo,
} from '../src/services/undoShortcut.ts';

type ListenerEntry = { fn: (event: FakeKeyboardEvent) => void; capture: boolean };

class FakeNode {
  parentNode: FakeNode | null = null;
  listeners = new Map<string, Set<ListenerEntry>>();

  contains(node: FakeNode | null): boolean {
    for (let cur: FakeNode | null = node; cur; cur = cur.parentNode) {
      if (cur === this) return true;
    }
    return false;
  }
  addEventListener(type: string, fn: (event: FakeKeyboardEvent) => void, capture = false) {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add({ fn, capture: Boolean(capture) });
  }
  removeEventListener(type: string, fn: (event: FakeKeyboardEvent) => void, capture = false) {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const entry of set) {
      if (entry.fn === fn && entry.capture === Boolean(capture)) {
        set.delete(entry);
      }
    }
  }
  dispatchEvent(event: FakeKeyboardEvent): boolean {
    if (!event.target) event.target = this;
    const path: FakeNode[] = [this];
    for (let cur = this.parentNode; cur; cur = cur.parentNode) {
      path.push(cur);
    }
    // Capture phase: ancestor -> target
    for (let i = path.length - 1; i >= 0; i--) {
      if (event.propagationStopped) break;
      for (const entry of path[i]!.listeners.get(event.type) ?? []) {
        if (!entry.capture) continue;
        if (event.immediatePropagationStopped) break;
        entry.fn(event);
      }
    }
    // Bubble phase: target -> ancestor
    const maxIndex = event.bubbles ? path.length - 1 : 0;
    for (let i = 0; i <= maxIndex; i++) {
      if (event.propagationStopped) break;
      for (const entry of path[i]!.listeners.get(event.type) ?? []) {
        if (entry.capture) continue;
        if (event.immediatePropagationStopped) break;
        entry.fn(event);
      }
    }
    return !event.defaultPrevented;
  }
}

class FakeElement extends FakeNode {
  isContentEditable = false;
  dataset: Record<string, string> = {};
  excalidrawNode: FakeElement | null = null;
  querySelector(selector: string): FakeElement | null {
    return selector === '.excalidraw' ? this.excalidrawNode : null;
  }
}
class FakeHtmlElement extends FakeElement {}
class FakeInputElement extends FakeHtmlElement {
  type = 'text';
}
class FakeTextAreaElement extends FakeHtmlElement {}
class FakeSelectElement extends FakeHtmlElement {}
class FakeDocument extends FakeNode {
  activeElement: FakeElement | null = null;
  excalidrawNode: FakeElement | null = null;
  querySelector(selector: string): FakeElement | null {
    return selector === '.excalidraw' ? this.excalidrawNode : null;
  }
}

class FakeKeyboardEvent {
  type: string;
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  repeat: boolean;
  bubbles: boolean;
  cancelable: boolean;
  target: FakeNode | null = null;
  defaultPrevented = false;
  propagationStopped = false;
  immediatePropagationStopped = false;

  constructor(type: string, init: KeyboardEventInit = {}) {
    this.type = type;
    this.key = init.key ?? '';
    this.code = init.code ?? '';
    this.ctrlKey = Boolean(init.ctrlKey);
    this.metaKey = Boolean(init.metaKey);
    this.shiftKey = Boolean(init.shiftKey);
    this.altKey = Boolean(init.altKey);
    this.repeat = Boolean(init.repeat);
    this.bubbles = Boolean(init.bubbles);
    this.cancelable = Boolean(init.cancelable);
  }
  preventDefault() {
    this.defaultPrevented = true;
  }
  stopPropagation() {
    this.propagationStopped = true;
  }
  stopImmediatePropagation() {
    this.propagationStopped = true;
    this.immediatePropagationStopped = true;
  }
}

function installDomGlobals(platform: string) {
  Object.assign(globalThis, {
    Node: FakeNode,
    Element: FakeElement,
    HTMLElement: FakeHtmlElement,
    HTMLInputElement: FakeInputElement,
    HTMLTextAreaElement: FakeTextAreaElement,
    HTMLSelectElement: FakeSelectElement,
    KeyboardEvent: FakeKeyboardEvent,
  });
  Object.defineProperty(globalThis, 'navigator', {
    value: { platform },
    configurable: true,
  });
}

test('resolveUndoShortcut maps Cmd+Z, Cmd+Shift+Z, Ctrl+Y and Undo/Redo keys on acdert Linux platform', () => {
  assert.equal(resolveUndoShortcut({ key: 'z', code: 'KeyZ', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false }, 'Linux x86_64'), 'undo');
  assert.equal(resolveUndoShortcut({ key: 'Z', code: 'KeyZ', metaKey: true, ctrlKey: false, shiftKey: true, altKey: false, defaultPrevented: false }, 'Linux x86_64'), 'redo');
  assert.equal(resolveUndoShortcut({ key: 'Process', code: 'KeyZ', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false }, 'Linux x86_64'), 'undo');
  assert.equal(resolveUndoShortcut({ key: 'y', code: 'KeyY', metaKey: false, ctrlKey: true, shiftKey: false, altKey: false, defaultPrevented: false }, 'Linux x86_64'), 'redo');
  assert.equal(resolveUndoShortcut({ key: 'Undo', code: 'Undo', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false }, 'Linux x86_64'), 'undo');
  assert.equal(resolveUndoShortcut({ key: 'Redo', code: 'Redo', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false }, 'Linux x86_64'), 'redo');

  // Native Ctrl+Z / Ctrl+Shift+Z is already handled by Excalidraw on Linux x86_64
  assert.equal(resolveUndoShortcut({ key: 'z', code: 'KeyZ', metaKey: false, ctrlKey: true, shiftKey: false, altKey: false, defaultPrevented: false }, 'Linux x86_64'), null);
  assert.equal(resolveUndoShortcut({ key: 'Z', code: 'KeyZ', metaKey: false, ctrlKey: true, shiftKey: true, altKey: false, defaultPrevented: false }, 'Linux x86_64'), null);
  // Alt+Z (zen mode) and dual modifiers must not be hijacked
  assert.equal(resolveUndoShortcut({ key: 'z', code: 'KeyZ', metaKey: true, ctrlKey: false, shiftKey: false, altKey: true, defaultPrevented: false }, 'Linux x86_64'), null);
  assert.equal(resolveUndoShortcut({ key: 'z', code: 'KeyZ', metaKey: true, ctrlKey: true, shiftKey: false, altKey: false, defaultPrevented: false }, 'Linux x86_64'), null);
});

test('resolveUndoShortcut respects native browser platforms on macOS and Windows', () => {
  // Mac browser already handles Cmd+Z, bridges Ctrl+Z and Ctrl+Y
  assert.equal(resolveUndoShortcut({ key: 'z', code: 'KeyZ', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false }, 'MacIntel'), null);
  assert.equal(resolveUndoShortcut({ key: 'z', code: 'KeyZ', metaKey: false, ctrlKey: true, shiftKey: false, altKey: false, defaultPrevented: false }, 'MacIntel'), 'undo');
  assert.equal(resolveUndoShortcut({ key: 'y', code: 'KeyY', metaKey: false, ctrlKey: true, shiftKey: false, altKey: false, defaultPrevented: false }, 'MacIntel'), 'redo');

  // Windows browser already handles Ctrl+Z and Ctrl+Y, bridges Cmd+Z
  assert.equal(resolveUndoShortcut({ key: 'y', code: 'KeyY', metaKey: false, ctrlKey: true, shiftKey: false, altKey: false, defaultPrevented: false }, 'Win32'), null);
  assert.equal(resolveUndoShortcut({ key: 'z', code: 'KeyZ', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false }, 'Win32'), 'undo');
});

test('isWritableTarget distinguishes text inputs from canvas and button controls', () => {
  installDomGlobals('Linux x86_64');
  const textarea = new FakeTextAreaElement();
  const textInput = new FakeInputElement();
  const buttonInput = new FakeInputElement();
  buttonInput.type = 'button';
  const select = new FakeSelectElement();
  const wysiwyg = new FakeHtmlElement();
  wysiwyg.dataset.type = 'wysiwyg';
  const editable = new FakeHtmlElement();
  editable.isContentEditable = true;
  const div = new FakeHtmlElement();

  assert.equal(isWritableTarget(textarea as unknown as EventTarget), true);
  assert.equal(isWritableTarget(textInput as unknown as EventTarget), true);
  assert.equal(isWritableTarget(select as unknown as EventTarget), true);
  assert.equal(isWritableTarget(wysiwyg as unknown as EventTarget), true);
  assert.equal(isWritableTarget(editable as unknown as EventTarget), true);
  assert.equal(isWritableTarget(buttonInput as unknown as EventTarget), false);
  assert.equal(isWritableTarget(div as unknown as EventTarget), false);
});

test('attachUndoShortcut dispatches synthetic Ctrl+Z/Ctrl+Shift+Z on acdert and respects disabled/writable guards', () => {
  installDomGlobals('Linux x86_64');
  const doc = new FakeDocument();
  const stage = new FakeHtmlElement();
  stage.parentNode = doc;
  const textarea = new FakeTextAreaElement();
  textarea.parentNode = doc;

  const excalidrawEvents: FakeKeyboardEvent[] = [];
  doc.addEventListener('keydown', event => {
    if (event.ctrlKey && event.key.toLowerCase() === 'z') {
      excalidrawEvents.push(event);
      event.preventDefault();
      event.stopPropagation();
    }
  });

  let enabled = true;
  const detach = attachUndoShortcut(() => enabled, doc as unknown as Document);

  // Cmd+Z on canvas stage triggers synthetic Ctrl+Z and prevents default on original event
  const cmdZ = new FakeKeyboardEvent('keydown', { key: 'z', code: 'KeyZ', metaKey: true, bubbles: true, cancelable: true });
  stage.dispatchEvent(cmdZ);
  assert.equal(excalidrawEvents.length, 1);
  assert.equal(excalidrawEvents[0]!.ctrlKey, true);
  assert.equal(excalidrawEvents[0]!.metaKey, false);
  assert.equal(excalidrawEvents[0]!.shiftKey, false);
  assert.equal(cmdZ.defaultPrevented, true);

  // Cmd+Shift+Z triggers synthetic Ctrl+Shift+Z
  const cmdShiftZ = new FakeKeyboardEvent('keydown', { key: 'Z', code: 'KeyZ', metaKey: true, shiftKey: true, bubbles: true, cancelable: true });
  stage.dispatchEvent(cmdShiftZ);
  assert.equal(excalidrawEvents.length, 2);
  assert.equal(excalidrawEvents[1]!.ctrlKey, true);
  assert.equal(excalidrawEvents[1]!.shiftKey, true);

  // Ctrl+Y triggers synthetic Ctrl+Shift+Z on acdert
  const ctrlY = new FakeKeyboardEvent('keydown', { key: 'y', code: 'KeyY', ctrlKey: true, bubbles: true, cancelable: true });
  stage.dispatchEvent(ctrlY);
  assert.equal(excalidrawEvents.length, 3);
  assert.equal(excalidrawEvents[2]!.ctrlKey, true);
  assert.equal(excalidrawEvents[2]!.shiftKey, true);

  // Writable target is ignored
  const inputCmdZ = new FakeKeyboardEvent('keydown', { key: 'z', code: 'KeyZ', metaKey: true, bubbles: true, cancelable: true });
  textarea.dispatchEvent(inputCmdZ);
  assert.equal(excalidrawEvents.length, 3);
  assert.equal(inputCmdZ.defaultPrevented, false);

  // Disabled state (welcome/menu/library open) is ignored
  enabled = false;
  const disabledCmdZ = new FakeKeyboardEvent('keydown', { key: 'z', code: 'KeyZ', metaKey: true, bubbles: true, cancelable: true });
  stage.dispatchEvent(disabledCmdZ);
  assert.equal(excalidrawEvents.length, 3);
  assert.equal(disabledCmdZ.defaultPrevented, false);

  // Capture-phase bridging still works even if a child stops propagation in bubble phase
  enabled = true;
  const child = new FakeHtmlElement();
  child.parentNode = doc;
  child.addEventListener('keydown', event => {
    if (event.metaKey) event.stopPropagation();
  }, false);
  const swallowedBubbleCmdZ = new FakeKeyboardEvent('keydown', { key: 'z', code: 'KeyZ', metaKey: true, bubbles: true, cancelable: true });
  child.dispatchEvent(swallowedBubbleCmdZ);
  assert.equal(excalidrawEvents.length, 4);
  assert.equal(swallowedBubbleCmdZ.defaultPrevented, true);

  // Programmatic menu undo targets .excalidraw container and triggers native undo
  const host = new FakeHtmlElement();
  const excalidrawRoot = new FakeHtmlElement();
  excalidrawRoot.parentNode = doc;
  host.excalidrawNode = excalidrawRoot;
  assert.equal(triggerCanvasUndo(host as unknown as Element, doc as unknown as Document), true);
  assert.equal(excalidrawEvents.length, 5);
  assert.equal(excalidrawEvents[4]!.ctrlKey, true);
  assert.equal(excalidrawEvents[4]!.shiftKey, false);

  detach();
});

test('getUndoShortcutLabel and undo skip selection-only history entries', () => {
  installDomGlobals('Linux x86_64');
  assert.equal(getUndoShortcutLabel('MacIntel', ''), '⌘Z');
  assert.equal(getUndoShortcutLabel('Linux x86_64', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'), '⌘Z');
  assert.equal(getUndoShortcutLabel('Linux x86_64', 'Mozilla/5.0 (X11; Linux x86_64)', 'darwin'), '⌘Z');
  assert.equal(getUndoShortcutLabel('Win32', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'win32'), 'Ctrl+Z');

  // Simulate Excalidraw undo stack: [draw rect, deselect rect, select rect]
  const doc = new FakeDocument();
  const stage = new FakeHtmlElement();
  stage.parentNode = doc;
  const stack: Array<{ elements: Array<{ id: string; version: number; versionNonce: number; isDeleted: boolean }>; selected: Record<string, boolean> }> = [
    { elements: [], selected: {} },
    { elements: [{ id: 'r1', version: 1, versionNonce: 1, isDeleted: false }], selected: {} },
    { elements: [{ id: 'r1', version: 1, versionNonce: 1, isDeleted: false }], selected: { r1: true } },
  ];
  let current = stack[2]!;
  const mockApi = {
    getSceneElementsIncludingDeleted: () => current.elements,
    getAppState: () => ({ selectedElementIds: current.selected }),
  };

  doc.addEventListener('keydown', event => {
    if (event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === 'z') {
      if (stack.length > 1) {
        stack.pop();
        current = stack[stack.length - 1]!;
      }
      event.preventDefault();
      event.stopPropagation();
    }
  });

  const detach = attachUndoShortcut(() => true, doc as unknown as Document, () => mockApi);
  const cmdZ = new FakeKeyboardEvent('keydown', { key: 'z', code: 'KeyZ', metaKey: true, bubbles: true, cancelable: true });
  stage.dispatchEvent(cmdZ);
  assert.equal(current.elements.length, 0);
  assert.equal(cmdZ.defaultPrevented, true);

  // Also test triggerCanvasUndo skipping selection-only steps
  stack.push(
    { elements: [{ id: 'r2', version: 1, versionNonce: 2, isDeleted: false }], selected: { r2: true } },
    { elements: [{ id: 'r2', version: 1, versionNonce: 2, isDeleted: false }], selected: {} },
  );
  current = stack[stack.length - 1]!;
  assert.equal(triggerCanvasUndo(null, doc as unknown as Document, mockApi), true);
  assert.equal(current.elements.length, 0);

  detach();
});

test('resolveCanvasShortcut maps macOS Cmd canvas shortcuts to Ctrl on Linux x86_64 and keeps Cmd+C/V native', () => {
  assert.deepEqual(
    resolveCanvasShortcut({ key: 'x', code: 'KeyX', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }, 'Linux x86_64'),
    { key: 'x', code: 'KeyX', ctrlKey: true },
  );
  assert.deepEqual(
    resolveCanvasShortcut({ key: 'ç', code: 'KeyC', metaKey: true, ctrlKey: false, shiftKey: false, altKey: true }, 'Linux x86_64'),
    { key: 'c', code: 'KeyC', ctrlKey: true, altKey: true },
  );
  assert.deepEqual(
    resolveCanvasShortcut({ key: '√', code: 'KeyV', metaKey: true, ctrlKey: false, shiftKey: false, altKey: true }, 'Linux x86_64'),
    { key: 'v', code: 'KeyV', ctrlKey: true, altKey: true },
  );
  assert.deepEqual(
    resolveCanvasShortcut({ key: '[', code: 'BracketLeft', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }, 'Linux x86_64'),
    { key: '[', code: 'BracketLeft', ctrlKey: true },
  );
  assert.deepEqual(
    resolveCanvasShortcut({ key: '{', code: 'BracketLeft', metaKey: true, ctrlKey: false, shiftKey: true, altKey: false }, 'Linux x86_64'),
    { key: '{', code: 'BracketLeft', ctrlKey: true, shiftKey: true },
  );
  assert.deepEqual(
    resolveCanvasShortcut({ key: ']', code: 'BracketRight', metaKey: true, ctrlKey: false, shiftKey: false, altKey: true }, 'Linux x86_64'),
    { key: '}', code: 'BracketRight', ctrlKey: true, shiftKey: true },
  );
  assert.deepEqual(
    resolveCanvasShortcut({ key: 'k', code: 'KeyK', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }, 'Linux x86_64'),
    { key: 'k', code: 'KeyK', ctrlKey: true },
  );
  assert.deepEqual(
    resolveCanvasShortcut({ key: 'd', code: 'KeyD', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }, 'Linux x86_64'),
    { key: 'd', code: 'KeyD', ctrlKey: true },
  );
  assert.deepEqual(
    resolveCanvasShortcut({ key: 'L', code: 'KeyL', metaKey: true, ctrlKey: false, shiftKey: true, altKey: false }, 'Linux x86_64'),
    { key: 'l', code: 'KeyL', ctrlKey: true, shiftKey: true },
  );
  // Cmd+C / Cmd+V without Alt must pass through for native clipboard events
  assert.equal(resolveCanvasShortcut({ key: 'c', code: 'KeyC', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }, 'Linux x86_64'), null);
  assert.equal(resolveCanvasShortcut({ key: 'v', code: 'KeyV', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }, 'Linux x86_64'), null);
  // Native Mac browser already uses Cmd
  assert.equal(resolveCanvasShortcut({ key: 'd', code: 'KeyD', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }, 'MacIntel'), null);
});

test('translateToastMessage and formatShortcutLabelForMac localize English fallbacks and Mac glyphs', () => {
  assert.equal(translateToastMessage('Link copied to clipboard'), '已复制链接到剪贴板');
  assert.equal(
    translateToastMessage('Copied selection to clipboard as SVG\n(light)'),
    '已将所选项作为 SVG 复制到剪贴板（浅色）',
  );
  assert.equal(translateToastMessage('Copied to clipboard.'), '已复制到剪贴板');
  assert.equal(translateToastMessage('Copied styles.'), '样式已拷贝');
  assert.equal(formatShortcutLabelForMac('Ctrl+Shift+L'), '⌘⇧L');
  assert.equal(formatShortcutLabelForMac('Ctrl+Alt+C'), '⌘⌥C');
  assert.equal(formatShortcutLabelForMac('Ctrl+['), '⌘[');
  assert.equal(formatShortcutLabelForMac('Shift+H'), '⇧H');
});

test('isDeleteShortcut recognizes Backspace/Delete and non-writable range inputs without breaking text inputs', () => {
  installDomGlobals('Linux x86_64');
  const rangeInput = new FakeInputElement();
  rangeInput.type = 'range';
  assert.equal(isWritableTarget(rangeInput as unknown as EventTarget), false);

  assert.equal(isDeleteShortcut({ key: 'Backspace', code: 'Backspace', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }), true);
  assert.equal(isDeleteShortcut({ key: 'Delete', code: 'Delete', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }), true);
  assert.equal(isDeleteShortcut({ key: 'Process', code: 'Backspace', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }), true);
  assert.equal(isDeleteShortcut({ key: 'Backspace', code: 'Backspace', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }), false);
  assert.equal(isDeleteShortcut({ key: 'Backspace', code: 'Backspace', metaKey: false, ctrlKey: true, shiftKey: false, altKey: false }), false);
});
