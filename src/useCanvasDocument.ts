import { useCallback, useEffect, useRef, useState } from 'react';
import { CaptureUpdateAction, FONT_FAMILY, hashElementsVersion } from '@excalidraw/excalidraw';
import { ensureHandDrawnFonts } from './services/fonts';
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { DEFAULT_FILE_NAME, createManualSnapshot, ensureExcalidrawExtension, getAcdeFs, loadAutosaveScene, openLocalExcalidrawFile, parseExcalidrawText, readWorkspaceSnapshot, saveAutosaveScene, saveLocalExcalidrawFile, serializeExcalidrawScene, serializeFromApi, setupAcdeWindowIntegration, syncWindowTitle, type OpenedExcalidrawFile, type WorkspaceSnapshotInfo } from './services/excalidrawStorage';
import { isCanvasAnimationActive } from './services/canvasAnimator';
import { invalidateCanvas } from './services/canvasBridge';
import { notify } from './services/notifications';
import { loadRecentFileContent, recordRecentFile, type RecentFileEntry } from './services/recentFiles';
import { toggleAcdeFullscreen } from './services/acdeKernel';
import { matchesShortcutLetter } from './services/undoShortcut';
import { getResolvedTheme } from './services/theme';

function fingerprint(elements: readonly ExcalidrawElement[], state: Pick<AppState, 'viewBackgroundColor'>, files: BinaryFiles): string {
  return `${hashElementsVersion(elements)}|${elements.length}|${state.viewBackgroundColor}|${Object.keys(files).sort().join(',')}`;
}

export function useCanvasDocument(
  api: ExcalidrawImperativeAPI | null,
  shortcutsEnabled = true,
  options?: {
    onOpenSettings?: () => void;
    onRequestNew?: () => void;
    onRequestOpen?: () => void;
    onImportFiles?: () => void;
  },
) {
  const [fileName, setFileName] = useState(DEFAULT_FILE_NAME);
  const [hasHandle, setHasHandle] = useState(false);
  const [status, setStatus] = useState<'idle' | 'pending' | 'saved' | 'error'>('idle');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const isDirtyRef = useRef(false);
  const statusRef = useRef<'idle' | 'pending' | 'saved' | 'error'>('idle');
  const shortcuts = useRef(shortcutsEnabled);
  shortcuts.current = shortcutsEnabled;
  const state = useRef({
    api,
    hydrated: false,
    fileName: DEFAULT_FILE_NAME,
    handle: null as FileSystemFileHandle | null,
    saved: '',
    lastHash: '',
    lastFilesRef: null as BinaryFiles | null,
    lastFilesSig: '',
    timer: 0,
    epoch: 0,
    queue: Promise.resolve(),
    busy: false,
  });
  state.current.api = api;

  const commitDirty = useCallback((next: boolean) => {
    if (isDirtyRef.current === next) return;
    isDirtyRef.current = next;
    setDirty(next);
  }, []);

  const commitStatus = useCallback((next: 'idle' | 'pending' | 'saved' | 'error') => {
    if (statusRef.current === next) return;
    statusRef.current = next;
    setStatus(next);
  }, []);

  const persist = useCallback((content: string): Promise<boolean> => {
    const task = state.current.queue.then(() => saveAutosaveScene(content));
    state.current.queue = task.then(() => {}, () => {});
    return task;
  }, []);

  const flush = useCallback(async () => {
    const current = state.current;
    clearTimeout(current.timer);
    const target = current.api;
    if (!target || !current.hydrated) return;
    const hash = fingerprint(target.getSceneElementsIncludingDeleted(), target.getAppState(), target.getFiles());
    if (hash === current.saved) return current.queue;
    const epoch = current.epoch;
    const saved = await persist(serializeFromApi(target));
    if (epoch !== current.epoch) return;
    if (saved) current.saved = hash;
    if (hash !== fingerprint(target.getSceneElementsIncludingDeleted(), target.getAppState(), target.getFiles())) return;
    commitStatus(saved ? 'saved' : 'pending');
    if (saved && !current.handle) commitDirty(false);
  }, [persist, commitDirty, commitStatus]);

  const restoreScene = useCallback((target: ExcalidrawImperativeAPI, restored: ReturnType<typeof parseExcalidrawText>) => {
    invalidateCanvas();
    const current = state.current;
    clearTimeout(current.timer);
    current.epoch++;
    current.hydrated = false;
    target.resetScene();
    target.addFiles(Object.values(restored.files));
    target.updateScene({ elements: restored.elements, appState: { ...restored.appState, theme: getResolvedTheme(), currentItemFontFamily: FONT_FAMILY.Excalifont, openMenu: null, openSidebar: null, openDialog: null }, captureUpdate: CaptureUpdateAction.NEVER });
    void ensureHandDrawnFonts(restored.elements.filter(element => element.type === 'text').map(element => element.text).join('')).catch(() => {});
    target.history.clear();
    const files = target.getFiles();
    current.saved = fingerprint(target.getSceneElementsIncludingDeleted(), target.getAppState(), files);
    current.lastHash = current.saved;
    current.lastFilesRef = files;
    current.lastFilesSig = Object.keys(files).sort().join(',');
    current.hydrated = true;
    if (restored.elements.length) requestAnimationFrame(() => target.scrollToContent(restored.elements, { fitToViewport: true, viewportZoomFactor: .8, animate: false }));
    commitDirty(false);
    commitStatus('saved');
  }, [commitDirty, commitStatus]);
  const backupScene = useCallback(async () => {
    const target = state.current.api;
    if (!target?.getSceneElements().length) return;
    const fs = await getAcdeFs();
    if (fs) await fs.writeFile('private', `workspace/recovery-${Date.now()}-${crypto.randomUUID()}.excalidraw`, serializeFromApi(target), { create: 'new', mkdirs: true });
  }, []);

  useEffect(() => {
    if (!api) return;
    let disposed = false;
    state.current.hydrated = false;
    setReady(false);
    void loadAutosaveScene().then(restored => {
      if (disposed) return;
      if (restored) restoreScene(api, restored);
      else {
        const files = api.getFiles();
        state.current.saved = fingerprint(api.getSceneElementsIncludingDeleted(), api.getAppState(), files);
        state.current.lastHash = state.current.saved;
        state.current.lastFilesRef = files;
        state.current.lastFilesSig = Object.keys(files).sort().join(',');
        state.current.hydrated = true;
      }
      setReady(true);
    }).catch(() => { if (!disposed) { state.current.hydrated = true; setReady(true); commitStatus('error'); } });
    return () => { disposed = true; state.current.hydrated = false; };
  }, [api, restoreScene, commitStatus]);

  const onChange = useCallback((elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
    const current = state.current;
    if (!current.hydrated || isCanvasAnimationActive()) return;
    const filesSig = files === current.lastFilesRef ? current.lastFilesSig : Object.keys(files).sort().join(',');
    current.lastFilesRef = files;
    current.lastFilesSig = filesSig;
    const hash = `${hashElementsVersion(elements)}|${elements.length}|${appState.viewBackgroundColor}|${filesSig}`;
    if (hash === current.lastHash || hash === current.saved) return;
    current.lastHash = hash;
    if (!isDirtyRef.current) {
      isDirtyRef.current = true;
      queueMicrotask(() => { if (isDirtyRef.current) setDirty(true); });
    }
    if (statusRef.current !== 'pending') {
      statusRef.current = 'pending';
      queueMicrotask(() => { if (statusRef.current === 'pending') setStatus('pending'); });
    }
    clearTimeout(current.timer);
    current.timer = window.setTimeout(() => { void flush().catch(() => commitStatus('error')); }, 800);
  }, [flush, commitStatus]);

  const rename = useCallback((name: string) => { state.current.fileName = name; setFileName(name); }, []);
  const renameFile = useCallback((nextName: string): boolean => {
    const trimmed = nextName.trim();
    if (!trimmed) return false;
    const fullName = ensureExcalidrawExtension(trimmed);
    if (fullName === state.current.fileName) return true;
    if (state.current.handle && state.current.handle.name !== fullName) {
      state.current.handle = null;
      setHasHandle(false);
    }
    rename(fullName);
    return true;
  }, [rename]);
  const run = useCallback(async (action: () => Promise<void | boolean>) => {
    if (state.current.busy || !state.current.hydrated) return false;
    state.current.busy = true;
    setBusy(true);
    try { return (await action()) !== false; } catch { commitStatus('error'); return false; }
    finally { state.current.busy = false; setBusy(false); }
  }, [commitStatus]);

  const openParsed = useCallback(async (opened: OpenedExcalidrawFile) => {
    const target = state.current.api;
    if (!target) return;
    const restored = parseExcalidrawText(opened.content);
    await flush();
    await backupScene();
    state.current.handle = opened.handle;
    setHasHandle(Boolean(opened.handle));
    rename(opened.fileName);
    restoreScene(target, restored);
    const saved = await persist(serializeExcalidrawScene(restored.elements, restored.appState, restored.files));
    if (!saved) commitStatus('pending');
    await recordRecentFile({
      fileName: opened.fileName,
      content: opened.content,
      handle: opened.handle,
      elementCount: restored.elements.length,
    });
  }, [flush, persist, rename, restoreScene, backupScene, commitStatus]);

  const open = useCallback(() => run(async () => {
    const opened = await openLocalExcalidrawFile();
    if (!opened) return false;
    await openParsed(opened);
  }), [run, openParsed]);

  const openRecent = useCallback((entry: RecentFileEntry) => run(async () => {
    const opened = await loadRecentFileContent(entry);
    if (!opened) {
      void notify('无法读取该历史文件');
      return false;
    }
    await openParsed(opened);
  }), [run, openParsed]);

  const openFile = useCallback((file: File) => run(async () => {
    await openParsed({
      fileName: file.name || DEFAULT_FILE_NAME,
      content: await file.text(),
      handle: null,
    });
  }), [run, openParsed]);

  const save = useCallback((forceSaveAs = false) => run(async () => {
    const current = state.current;
    const target = current.api!;
    const hash = fingerprint(target.getSceneElementsIncludingDeleted(), target.getAppState(), target.getFiles());
    const content = serializeFromApi(target);
    // Call saveLocalExcalidrawFile before any async IPC so transient user activation (e.g. Command+S) is preserved for showSaveFilePicker.
    const result = await saveLocalExcalidrawFile({ content, fileName: current.fileName, handle: current.handle, forceSaveAs });
    await persist(content);
    if (!result) return false;
    current.handle = result.handle;
    setHasHandle(Boolean(result.handle));
    rename(result.fileName);
    if (hash === fingerprint(target.getSceneElementsIncludingDeleted(), target.getAppState(), target.getFiles())) {
      current.saved = hash;
      current.lastHash = hash;
      commitDirty(false);
      commitStatus('saved');
    }
    await recordRecentFile({
      fileName: result.fileName,
      content,
      handle: result.handle,
      elementCount: target.getSceneElements().length,
    });
    void notify('已保存');
  }), [run, persist, rename, commitDirty, commitStatus]);

  const create = useCallback(() => run(async () => {
    const current = state.current;
    const target = current.api!;
    await flush();
    await backupScene();
    restoreScene(target, parseExcalidrawText('{"type":"excalidraw","elements":[]}'));
    current.handle = null;
    setHasHandle(false);
    rename(DEFAULT_FILE_NAME);
    await persist(serializeFromApi(target));
  }), [run, flush, restoreScene, rename, persist, backupScene]);

  const createSnapshot = useCallback(async (): Promise<WorkspaceSnapshotInfo | null> => {
    const target = state.current.api;
    if (!target || !state.current.hydrated) return null;
    await flush();
    return createManualSnapshot(serializeFromApi(target));
  }, [flush]);

  const restoreSnapshot = useCallback((path: string) => run(async () => {
    const target = state.current.api;
    if (!target) return false;
    const loaded = await readWorkspaceSnapshot(path);
    if (!loaded) return false;
    const restored = parseExcalidrawText(loaded.text);
    await flush();
    await backupScene();
    state.current.handle = null;
    setHasHandle(false);
    restoreScene(target, restored);
    const saved = await persist(serializeExcalidrawScene(restored.elements, restored.appState, restored.files));
    if (!saved) commitStatus('pending');
    void notify('已恢复快照');
    return true;
  }), [run, flush, backupScene, restoreScene, persist, commitStatus]);

  const onOpenSettingsRef = useRef(options?.onOpenSettings);
  onOpenSettingsRef.current = options?.onOpenSettings;
  const onRequestNewRef = useRef(options?.onRequestNew);
  onRequestNewRef.current = options?.onRequestNew;
  const onRequestOpenRef = useRef(options?.onRequestOpen);
  onRequestOpenRef.current = options?.onRequestOpen;
  const onImportFilesRef = useRef(options?.onImportFiles);
  onImportFilesRef.current = options?.onImportFiles;

  useEffect(() => { void syncWindowTitle(fileName, dirty).catch(() => {}); }, [fileName, dirty]);
  useEffect(() => {
    if (!api) return;
    let disposed = false;
    let cleanup = () => {};
    const triggerNew = () => { if (onRequestNewRef.current) onRequestNewRef.current(); else void create(); };
    const triggerOpen = () => { if (onRequestOpenRef.current) onRequestOpenRef.current(); else void open(); };
    void setupAcdeWindowIntegration({
      onNew: triggerNew,
      onOpen: triggerOpen,
      onSave: () => void save(),
      onSaveAs: () => void save(true),
      onImportFiles: () => { onImportFilesRef.current?.(); },
      onCreateSnapshot: () => { void createSnapshot(); },
      onToggleFullscreen: () => { void toggleAcdeFullscreen(); },
      onOpenSettings: () => { onOpenSettingsRef.current?.(); },
      onOpenFileRequest: opened => void run(() => openParsed(opened)),
      onBeforeClose: flush,
    }).then(unsub => { if (disposed) unsub(); else cleanup = unsub; }).catch(() => {});
    const unload = () => { void flush().catch(() => {}); };
    const shortcut = (event: KeyboardEvent) => {
      if (!shortcuts.current) return;
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (matchesShortcutLetter(event, 's')) {
        event.preventDefault(); event.stopImmediatePropagation();
        void save(event.shiftKey);
        return;
      }
      if (event.shiftKey) return;
      if (matchesShortcutLetter(event, 'o')) {
        event.preventDefault(); event.stopImmediatePropagation();
        triggerOpen();
      } else if (matchesShortcutLetter(event, 'n')) {
        event.preventDefault(); event.stopImmediatePropagation();
        triggerNew();
      } else if (matchesShortcutLetter(event, 'i')) {
        event.preventDefault(); event.stopImmediatePropagation();
        onImportFilesRef.current?.();
      } else if (event.code === 'Comma' || event.key === ',') {
        event.preventDefault(); event.stopImmediatePropagation();
        onOpenSettingsRef.current?.();
      }
    };
    window.addEventListener('beforeunload', unload);
    window.addEventListener('keydown', shortcut, true);
    return () => { disposed = true; cleanup(); clearTimeout(state.current.timer); window.removeEventListener('beforeunload', unload); window.removeEventListener('keydown', shortcut, true); };
  }, [api, create, open, save, openParsed, run, flush, createSnapshot]);

  const reportError = useCallback(() => commitStatus('error'), [commitStatus]);
  return { fileName, hasHandle, status, dirty, busy, ready, onChange, create, open, openRecent, openFile, save, renameFile, flush, createSnapshot, restoreSnapshot, reportError };
}
