export type UndoRedoAction = 'undo' | 'redo';

const NON_WRITABLE_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'radio',
  'submit',
  'reset',
  'file',
  'image',
  'hidden',
  'range',
]);

function isLatinChar(key: string): boolean {
  return /^[a-z]$/i.test(key);
}

/** Matches Excalidraw's `isDarwin` check against `navigator.platform`. */
export function isExcalidrawDarwin(
  platform = typeof navigator !== 'undefined' ? navigator.platform : '',
): boolean {
  return /Mac|iPod|iPhone|iPad/.test(platform);
}

/** Matches Excalidraw's `isWindows` check against `navigator.platform`. */
export function isExcalidrawWindows(
  platform = typeof navigator !== 'undefined' ? navigator.platform : '',
): boolean {
  return platform.startsWith('Win');
}

/** Matches a Latin letter key or its physical KeyCode when an IME/non-Latin layout is active. */
export function matchesShortcutLetter(
  event: Pick<KeyboardEvent, 'key' | 'code'>,
  letter: string,
): boolean {
  const lower = letter.toLowerCase();
  if (event.key.toLowerCase() === lower) return true;
  const expectedCode = `Key${lower.toUpperCase()}`;
  return !isLatinChar(event.key) && event.code === expectedCode;
}

/** Returns true when keyboard undo/redo belongs to a text input rather than the canvas. */
export function isWritableTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  if (typeof HTMLTextAreaElement !== 'undefined' && target instanceof HTMLTextAreaElement) return true;
  if (typeof HTMLSelectElement !== 'undefined' && target instanceof HTMLSelectElement) return true;
  if (typeof HTMLInputElement !== 'undefined' && target instanceof HTMLInputElement) {
    return !NON_WRITABLE_INPUT_TYPES.has(target.type);
  }
  if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement) {
    return target.isContentEditable || target.dataset?.type === 'wysiwyg';
  }
  return false;
}

/**
 * Resolves undo/redo shortcuts that Excalidraw skips because `acdert` reports
 * `navigator.platform` as `Linux x86_64` on all hosts (or when using Ctrl+Z on macOS browsers).
 */
export function resolveUndoShortcut(
  event: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'defaultPrevented'>,
  platform?: string,
): UndoRedoAction | null {
  if (event.defaultPrevented || event.altKey) return null;

  if (!event.ctrlKey && !event.metaKey) {
    if (event.key === 'Undo' || event.code === 'Undo') {
      return event.shiftKey ? 'redo' : 'undo';
    }
    if (event.key === 'Redo' || event.code === 'Redo') {
      return 'redo';
    }
    return null;
  }

  if (event.ctrlKey === event.metaKey) return null;

  const darwin = isExcalidrawDarwin(platform);
  const windows = isExcalidrawWindows(platform);

  if (matchesShortcutLetter(event, 'z')) {
    const usesNativeMod = darwin ? event.metaKey : event.ctrlKey;
    if (usesNativeMod) return null;
    return event.shiftKey ? 'redo' : 'undo';
  }

  if (!event.shiftKey && event.ctrlKey && matchesShortcutLetter(event, 'y')) {
    return windows ? null : 'redo';
  }

  return null;
}

export interface UndoHistoryApi {
  getSceneElementsIncludingDeleted(): readonly {
    id: string;
    version: number;
    versionNonce: number;
    isDeleted: boolean;
  }[];
  getAppState(): {
    selectedElementIds?: Readonly<Record<string, boolean>>;
    selectedGroupIds?: Readonly<Record<string, boolean>>;
    editingGroupId?: string | null;
  };
}

/** Returns the platform-appropriate undo shortcut label for UI hints. */
export function getUndoShortcutLabel(
  platform = typeof navigator !== 'undefined' ? navigator.platform : '',
  userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '',
  acdePlatform?: string,
): string {
  if (
    acdePlatform === 'darwin'
    || isExcalidrawDarwin(platform)
    || /Macintosh|Mac OS X/i.test(userAgent)
  ) {
    return '⌘Z';
  }
  return 'Ctrl+Z';
}

function getElementsSignature(api: UndoHistoryApi): string {
  return api.getSceneElementsIncludingDeleted()
    .map(el => `${el.id}:${el.version}:${el.versionNonce}:${el.isDeleted ? 1 : 0}`)
    .join('|');
}

function getSelectionSignature(api: UndoHistoryApi): string {
  const state = api.getAppState();
  return JSON.stringify([
    state.selectedElementIds ?? {},
    state.selectedGroupIds ?? {},
    state.editingGroupId ?? null,
  ]);
}

const MAX_SELECTION_UNDO_SKIPS = 64;

const syntheticEvents = new WeakSet<KeyboardEvent>();

function dispatchSyntheticHistoryKey(
  action: UndoRedoAction,
  target: EventTarget,
  platform: string,
  repeat = false,
): boolean {
  const targetMod = isExcalidrawDarwin(platform) ? 'metaKey' : 'ctrlKey';
  const synthetic = new KeyboardEvent('keydown', {
    key: action === 'redo' ? 'Z' : 'z',
    code: 'KeyZ',
    ctrlKey: targetMod === 'ctrlKey',
    metaKey: targetMod === 'metaKey',
    shiftKey: action === 'redo',
    altKey: false,
    repeat,
    bubbles: true,
    cancelable: true,
  });
  syntheticEvents.add(synthetic);
  target.dispatchEvent(synthetic);
  return synthetic.defaultPrevented;
}

function dispatchUndoSkippingSelection(
  target: EventTarget,
  platform: string,
  api?: UndoHistoryApi | null,
  repeat = false,
): boolean {
  if (!api) {
    return dispatchSyntheticHistoryKey('undo', target, platform, repeat);
  }
  const beforeElements = getElementsSignature(api);
  let prevSelection = getSelectionSignature(api);
  if (!dispatchSyntheticHistoryKey('undo', target, platform, repeat)) {
    return false;
  }

  let skips = 0;
  const step = () => {
    if (getElementsSignature(api) !== beforeElements) return;
    const nextSelection = getSelectionSignature(api);
    if (nextSelection !== prevSelection) {
      if (skips >= MAX_SELECTION_UNDO_SKIPS) return;
      skips += 1;
      prevSelection = nextSelection;
      if (!dispatchSyntheticHistoryKey('undo', target, platform, false)) return;
      step();
    }
  };

  step();
  // React 18 may flush Excalidraw's setState asynchronously; re-check after commit.
  if (getElementsSignature(api) === beforeElements && skips < MAX_SELECTION_UNDO_SKIPS) {
    setTimeout(() => {
      if (getElementsSignature(api) !== beforeElements) return;
      const nextSelection = getSelectionSignature(api);
      if (nextSelection === prevSelection) return;
      prevSelection = nextSelection;
      const asyncStep = () => {
        if (skips >= MAX_SELECTION_UNDO_SKIPS) return;
        skips += 1;
        if (!dispatchSyntheticHistoryKey('undo', target, platform, false)) return;
        setTimeout(() => {
          if (getElementsSignature(api) !== beforeElements) return;
          const updatedSelection = getSelectionSignature(api);
          if (updatedSelection === prevSelection) return;
          prevSelection = updatedSelection;
          asyncStep();
        }, 0);
      };
      asyncStep();
    }, 0);
  }
  return true;
}

/** Triggers Excalidraw's native canvas undo from UI actions such as menu items. */
export function triggerCanvasUndo(
  container?: Element | null,
  doc: Document = document,
  api?: UndoHistoryApi | null,
): boolean {
  const platform = typeof navigator !== 'undefined' ? navigator.platform : '';
  const target = container?.querySelector('.excalidraw') ?? doc.querySelector('.excalidraw') ?? doc;
  return dispatchUndoSkippingSelection(target, platform, api);
}

/**
 * Bridges Cmd+Z / Cmd+Shift+Z / Ctrl+Y / hardware Undo-Redo keys to Excalidraw's
 * native undo/redo action without stealing undo inside text inputs, and skips
 * pure selection-only entries when undoing.
 */
export function attachUndoShortcut(
  isEnabled: () => boolean,
  doc: Document = document,
  getApi?: () => UndoHistoryApi | null | undefined,
): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (syntheticEvents.has(event) || !isEnabled()) return;
    const activeTarget = typeof Element !== 'undefined' && event.target instanceof Element
      ? event.target
      : doc.activeElement;
    if (isWritableTarget(event.target) || isWritableTarget(activeTarget)) return;

    const platform = typeof navigator !== 'undefined' ? navigator.platform : '';
    const action = resolveUndoShortcut(event, platform);
    const api = getApi?.() ?? null;
    const isNativeUndo = !action
      && Boolean(api)
      && !event.defaultPrevented
      && !event.altKey
      && !event.shiftKey
      && event.ctrlKey !== event.metaKey
      && matchesShortcutLetter(event, 'z')
      && (isExcalidrawDarwin(platform) ? event.metaKey : event.ctrlKey);

    if (!action && !isNativeUndo) return;

    const targetNode = event.target;
    const dispatchTarget = targetNode === doc
      || (typeof Node !== 'undefined' && targetNode instanceof Node && doc.contains(targetNode))
      ? targetNode
      : doc;

    const handled = action === 'redo'
      ? dispatchSyntheticHistoryKey('redo', dispatchTarget, platform, event.repeat)
      : dispatchUndoSkippingSelection(dispatchTarget, platform, api, event.repeat);

    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const onCanvasShortcut = (event: KeyboardEvent) => {
    if (syntheticEvents.has(event) || !isEnabled()) return;
    const activeTarget = typeof Element !== 'undefined' && event.target instanceof Element
      ? event.target
      : doc.activeElement;
    if (isWritableTarget(event.target) || isWritableTarget(activeTarget)) return;

    const platform = typeof navigator !== 'undefined' ? navigator.platform : '';
    const SyntheticEvent = typeof KeyboardEvent === 'function' ? KeyboardEvent : null;
    if (!SyntheticEvent) return;

    if (isDeleteShortcut(event)) {
      const needsBridge = (event.key !== 'Backspace' && event.key !== 'Delete')
        || (typeof HTMLInputElement !== 'undefined'
          && (event.target instanceof HTMLInputElement || activeTarget instanceof HTMLInputElement));
      if (!needsBridge) return;
      const canvasTarget = doc.querySelector('.excalidraw') ?? doc;
      const synthetic = new SyntheticEvent('keydown', {
        key: 'Delete',
        code: 'Delete',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        repeat: event.repeat,
        bubbles: true,
        cancelable: true,
        composed: true,
      });
      syntheticEvents.add(synthetic);
      canvasTarget.dispatchEvent(synthetic);
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const bridged = resolveCanvasShortcut(event, platform);
    if (!bridged) return;

    const targetNode = event.target;
    const dispatchTarget = targetNode === doc
      || (typeof Node !== 'undefined' && targetNode instanceof Node && doc.contains(targetNode))
      ? targetNode
      : doc;

    const synthetic = new SyntheticEvent('keydown', {
      key: bridged.key,
      code: bridged.code,
      ctrlKey: bridged.ctrlKey,
      shiftKey: Boolean(bridged.shiftKey),
      altKey: Boolean(bridged.altKey),
      metaKey: false,
      repeat: event.repeat,
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    syntheticEvents.add(synthetic);
    dispatchTarget.dispatchEvent(synthetic);
    event.preventDefault();
    event.stopPropagation();
  };

  // Capture on document so inner bubble handlers cannot swallow Cmd+Z or Cmd+* before bridging.
  doc.addEventListener('keydown', onKeyDown, true);
  doc.addEventListener('keydown', onCanvasShortcut, true);
  return () => {
    doc.removeEventListener('keydown', onKeyDown, true);
    doc.removeEventListener('keydown', onCanvasShortcut, true);
  };
}

export type ShortcutKeyEvent = Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'> & {
  defaultPrevented?: boolean;
};

export function isDeleteShortcut(event: ShortcutKeyEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  return event.key === 'Backspace'
    || event.key === 'Delete'
    || event.code === 'Backspace'
    || event.code === 'Delete';
}

export interface CanvasShortcutBridge {
  key: string;
  code: string;
  ctrlKey: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

function matchesCodeOrKey(event: ShortcutKeyEvent, code: string, fallbackKeys: string[]): boolean {
  if (event.code === code) return true;
  const key = event.key?.toLowerCase() ?? '';
  return fallbackKeys.includes(key);
}

/**
 * Translates macOS Cmd+* canvas shortcuts into Ctrl+* events when Excalidraw
 * is running under a non-Darwin platform string (e.g. acdert's Linux x86_64).
 * Intentionally leaves Cmd+C and Cmd+V untouched so native clipboard events fire.
 */
export function resolveCanvasShortcut(
  event: ShortcutKeyEvent,
  platform = typeof navigator !== 'undefined' ? navigator.platform : '',
): CanvasShortcutBridge | null {
  if (isExcalidrawDarwin(platform)) return null;
  if (!event.metaKey || event.ctrlKey) return null;

  if (matchesShortcutLetter(event, 'x') && !event.altKey && !event.shiftKey) {
    return { key: 'x', code: 'KeyX', ctrlKey: true };
  }
  if (matchesShortcutLetter(event, 'c') && event.altKey && !event.shiftKey) {
    return { key: 'c', code: 'KeyC', ctrlKey: true, altKey: true };
  }
  if (matchesShortcutLetter(event, 'v') && event.altKey && !event.shiftKey) {
    return { key: 'v', code: 'KeyV', ctrlKey: true, altKey: true };
  }
  if (matchesCodeOrKey(event, 'BracketLeft', ['[', '{'])) {
    if (event.shiftKey || event.altKey) {
      return { key: '{', code: 'BracketLeft', ctrlKey: true, shiftKey: true };
    }
    return { key: '[', code: 'BracketLeft', ctrlKey: true };
  }
  if (matchesCodeOrKey(event, 'BracketRight', [']', '}'])) {
    if (event.shiftKey || event.altKey) {
      return { key: '}', code: 'BracketRight', ctrlKey: true, shiftKey: true };
    }
    return { key: ']', code: 'BracketRight', ctrlKey: true };
  }
  if (matchesShortcutLetter(event, 'k') && !event.altKey && !event.shiftKey) {
    return { key: 'k', code: 'KeyK', ctrlKey: true };
  }
  if (matchesShortcutLetter(event, 'd') && !event.altKey && !event.shiftKey) {
    return { key: 'd', code: 'KeyD', ctrlKey: true };
  }
  if (matchesShortcutLetter(event, 'l') && event.shiftKey && !event.altKey) {
    return { key: 'l', code: 'KeyL', ctrlKey: true, shiftKey: true };
  }
  if (matchesShortcutLetter(event, 'a') && !event.altKey && !event.shiftKey) {
    return { key: 'a', code: 'KeyA', ctrlKey: true };
  }
  if (matchesShortcutLetter(event, 'g') && !event.altKey) {
    return { key: 'g', code: 'KeyG', ctrlKey: true, shiftKey: event.shiftKey };
  }
  if ((event.code === 'Digit0' || event.code === 'Numpad0' || event.key === '0') && !event.altKey && !event.shiftKey) {
    return { key: '0', code: event.code || 'Digit0', ctrlKey: true };
  }
  if ((event.code === 'Minus' || event.code === 'NumpadSubtract' || event.key === '-') && !event.altKey && !event.shiftKey) {
    return { key: '-', code: event.code || 'Minus', ctrlKey: true };
  }
  if ((event.code === 'Equal' || event.code === 'NumpadAdd' || event.key === '=' || event.key === '+') && !event.altKey) {
    return { key: '+', code: event.code || 'Equal', ctrlKey: true };
  }
  if (matchesCodeOrKey(event, 'Quote', ["'"]) && !event.altKey && !event.shiftKey) {
    return { key: "'", code: 'Quote', ctrlKey: true };
  }
  return null;
}

const EXACT_TOAST_TRANSLATIONS: Record<string, string> = {
  'Link copied to clipboard': '已复制链接到剪贴板',
  'Copied to clipboard.': '已复制到剪贴板',
  '已复制到剪切板。': '已复制到剪贴板',
  'Copied styles.': '样式已拷贝',
  '样式已拷贝。': '样式已拷贝',
  'Added to library': '已添加到素材库',
  '添加到素材库中': '已添加到素材库',
  'File saved.': '文件已保存',
};

/** Translates Excalidraw's English fallback toast strings into concise Chinese. */
export function translateToastMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return message;
  const exact = EXACT_TOAST_TRANSLATIONS[trimmed];
  if (exact) return exact;

  const exportMatch = trimmed.match(/^Copied (.+?) to clipboard as (SVG|PNG)(?:\n\((.+?)\))?$/);
  if (exportMatch) {
    const [, rawTarget, format, rawScheme] = exportMatch;
    const target = rawTarget === 'canvas' ? '画布' : rawTarget === 'selection' ? '所选项' : rawTarget;
    const scheme = rawScheme === 'light' ? '浅色' : rawScheme === 'dark' ? '深色' : rawScheme;
    return scheme
      ? `已将${target}作为 ${format} 复制到剪贴板（${scheme}）`
      : `已将${target}作为 ${format} 复制到剪贴板`;
  }

  const savedMatch = trimmed.match(/^Saved to (.+)$/);
  if (savedMatch) {
    return `已保存到 ${savedMatch[1]}`;
  }

  if (trimmed.startsWith('Embedding this url is currently not allowed')) {
    return '暂不支持嵌入此网址';
  }
  if (trimmed.startsWith('The link you embedded does not match the expected format')) {
    return '嵌入的链接格式无效，请使用来源网站提供的 embed 代码';
  }
  return message;
}

/** Formats Excalidraw Ctrl+/Shift+/Alt+ shortcut hints with macOS symbols. */
export function formatShortcutLabelForMac(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return label;
  return trimmed
    .replace(/Ctrl\+/g, '⌘')
    .replace(/Alt\+/g, '⌥')
    .replace(/Shift\+/g, '⇧');
}

/**
 * Watches Excalidraw's DOM subtree to localize untranslated Toast messages and
 * adapt context-menu shortcut labels to macOS glyphs when appropriate.
 */
export function attachExcalidrawDomPatcher(root: ParentNode, isMac: boolean | (() => boolean)): () => void {
  const patchTree = () => {
    const mac = typeof isMac === 'function' ? isMac() : isMac;
    for (const el of root.querySelectorAll('.Toast__message')) {
      const text = el.textContent ?? '';
      const translated = translateToastMessage(text);
      if (translated !== text) {
        el.textContent = translated;
      }
    }
    if (mac) {
      for (const el of root.querySelectorAll('.context-menu-item__shortcut')) {
        const text = el.textContent ?? '';
        const formatted = formatShortcutLabelForMac(text);
        if (formatted !== text) {
          el.textContent = formatted;
        }
      }
    }
    for (const menu of root.querySelectorAll('.context-menu')) {
      let lastWasSeparator = true;
      let lastVisibleSeparator: HTMLElement | null = null;
      for (const child of Array.from(menu.children)) {
        if (!(child instanceof HTMLElement)) continue;
        if (child.classList.contains('context-menu-item-separator')) {
          if (lastWasSeparator) {
            child.style.display = 'none';
          } else {
            child.style.display = '';
            lastWasSeparator = true;
            lastVisibleSeparator = child;
          }
        } else if (typeof getComputedStyle === 'function' ? getComputedStyle(child).display !== 'none' : child.style.display !== 'none') {
          lastWasSeparator = false;
          lastVisibleSeparator = null;
        }
      }
      if (lastVisibleSeparator) {
        lastVisibleSeparator.style.display = 'none';
      }
    }
  };

  patchTree();
  if (typeof MutationObserver === 'undefined') return () => {};
  const observer = new MutationObserver(patchTree);
  observer.observe(root, { childList: true, subtree: true, characterData: true });
  return () => observer.disconnect();
}
