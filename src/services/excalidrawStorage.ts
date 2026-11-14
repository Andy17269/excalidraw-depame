/// <reference types="@dopame/acde-api/app" />
import { load } from "@dopame/acde-api";
import type { AcdeFs, AcdeWindow, SystemRequest } from "@dopame/acde-api";
import { restore, serializeAsJSON } from "@excalidraw/excalidraw";
import type { RestoredDataState } from "@excalidraw/excalidraw/data/restore";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

export const DEFAULT_FILE_NAME = "未命名白板.excalidraw";
export const AUTOSAVE_FILE_PATH = "workspace/autosave.excalidraw";

export interface WorkspaceSnapshotInfo {
  id: string;
  name: string;
  kind: "autosave" | "recovery" | "snapshot";
  size: number;
  modifiedMs: number;
  version?: string;
}

export interface FsRootSummary {
  id: string;
  label: string;
  source: string;
  mode: string;
  exists: boolean;
}

export interface OpenedExcalidrawFile {
  fileName: string;
  content: string;
  handle: FileSystemFileHandle | null;
}

export interface SaveExcalidrawResult {
  fileName: string;
  handle: FileSystemFileHandle | null;
  savedVia: "handle" | "picker" | "acde-fs" | "download";
}

type FilePickerWindow = Window & {
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    types?: Array<{
      description?: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{
      description?: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<FileSystemFileHandle>;
};

let cachedFs: Promise<AcdeFs | null> | null = null;
let cachedWindow: Promise<AcdeWindow | null> | null = null;
let lastSyncedTitle = "";

export function getAcdeFs(): Promise<AcdeFs | null> {
  if (!cachedFs) {
    cachedFs = load("fs").catch(() => null);
  }
  return cachedFs;
}

export function getAcdeWindow(): Promise<AcdeWindow | null> {
  if (!cachedWindow) {
    cachedWindow = load("window").catch(() => null);
  }
  return cachedWindow;
}

/** Syncs both document title and Dopame OS native window title. */
export async function syncWindowTitle(fileName: string, isDirty: boolean): Promise<void> {
  const title = `${stripExcalidrawExtension(fileName)}${isDirty ? " ●" : ""} — Excalidraw+`;
  if (title === lastSyncedTitle) {
    return;
  }
  lastSyncedTitle = title;
  document.title = title;
  const win = await getAcdeWindow();
  win?.setTitle(title);
}

/** Serializes current scene into standard `.excalidraw` v2 JSON. */
export function serializeExcalidrawScene(
  elements: readonly ExcalidrawElement[],
  appState: Partial<AppState>,
  files: BinaryFiles,
): string {
  return serializeAsJSON(elements, appState, files, "local");
}

/** Serializes directly from an imperative Excalidraw API instance. */
export function serializeFromApi(api: ExcalidrawImperativeAPI): string {
  return serializeAsJSON(
    api.getSceneElements(),
    api.getAppState(),
    api.getFiles(),
    "local",
  );
}

/** Validates and restores `.excalidraw` JSON text into Excalidraw scene data. */
export function parseExcalidrawText(rawText: string): RestoredDataState {
  const parsed = JSON.parse(rawText) as {
    type?: unknown;
    elements?: unknown;
    appState?: Record<string, unknown>;
    files?: BinaryFiles;
  };
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.elements)) {
    throw new Error("无效的 .excalidraw 文件格式（缺少 elements 数组）");
  }
  if (parsed.type !== undefined && parsed.type !== "excalidraw") {
    throw new Error(`不支持的文件类型：${String(parsed.type)}`);
  }

  return restore(
    {
      elements: parsed.elements,
      appState: parsed.appState ?? null,
      files: parsed.files ?? undefined,
    },
    null,
    null,
    { refreshDimensions: true, repairBindings: true },
  );
}

/** Reads `workspace/autosave.excalidraw` from Dopame OS `acde:fs` private root. */
export async function loadAutosaveScene(): Promise<RestoredDataState | null> {
  const fs = await getAcdeFs();
  if (!fs) {
    return null;
  }
  try {
    const { text } = await fs.readText("private", AUTOSAVE_FILE_PATH);
    return parseExcalidrawText(text);
  } catch {
    return null;
  }
}

/** Persists serialized `.excalidraw` JSON to `acde:fs` private root. */
export async function saveAutosaveScene(content: string): Promise<boolean> {
  const fs = await getAcdeFs();
  if (!fs) {
    return false;
  }
  await fs.writeFile("private", AUTOSAVE_FILE_PATH, content, {
    create: "always",
    mkdirs: true,
  });
  return true;
}

/** Lists available `acde:fs` roots for diagnostics and workspace inspection. */
export async function getFsRootsSummary(): Promise<FsRootSummary[]> {
  const fs = await getAcdeFs();
  if (!fs) {
    return [];
  }
  try {
    const roots = await fs.roots();
    return roots.map((root) => ({
      id: root.id,
      label: root.label,
      source: root.source,
      mode: root.mode,
      exists: root.exists,
    }));
  } catch {
    return [];
  }
}

/** Lists autosave, recovery, and manual snapshots inside `private:workspace`. */
export async function listWorkspaceSnapshots(): Promise<WorkspaceSnapshotInfo[]> {
  const fs = await getAcdeFs();
  if (!fs) {
    return [];
  }
  try {
    const listing = await fs.list("private", "workspace", false);
    return listing.entries
      .filter((entry) => entry.kind === "file" && entry.name.endsWith(".excalidraw"))
      .map((entry): WorkspaceSnapshotInfo => ({
        id: `workspace/${entry.name}`,
        name: entry.name,
        kind: entry.name === "autosave.excalidraw"
          ? "autosave"
          : entry.name.startsWith("recovery-")
            ? "recovery"
            : "snapshot",
        size: entry.size,
        modifiedMs: entry.modifiedMs,
        version: entry.version,
      }))
      .sort((a, b) => b.modifiedMs - a.modifiedMs);
  } catch {
    return [];
  }
}

/** Writes a timestamped manual snapshot into `private:workspace`. */
export async function createManualSnapshot(content: string): Promise<WorkspaceSnapshotInfo | null> {
  const fs = await getAcdeFs();
  if (!fs) {
    return null;
  }
  const name = `snapshot-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.excalidraw`;
  const id = `workspace/${name}`;
  const entry = await fs.writeFile("private", id, content, {
    create: "new",
    mkdirs: true,
  });
  return {
    id,
    name: entry.name,
    kind: "snapshot",
    size: entry.size,
    modifiedMs: entry.modifiedMs,
    version: entry.version,
  };
}

/** Reads a snapshot JSON payload from `private:workspace`. */
export async function readWorkspaceSnapshot(path: string): Promise<{ text: string; modifiedMs: number; size: number; version?: string } | null> {
  if (!path.startsWith("workspace/") || path.includes("..")) {
    throw new Error("无效的快照路径");
  }
  const fs = await getAcdeFs();
  if (!fs) {
    return null;
  }
  return fs.readText("private", path);
}

/** Deletes a recovery or manual snapshot from `private:workspace`. */
export async function deleteWorkspaceSnapshot(path: string): Promise<boolean> {
  if (path === AUTOSAVE_FILE_PATH || !path.startsWith("workspace/") || path.includes("..")) {
    return false;
  }
  const fs = await getAcdeFs();
  if (!fs) {
    return false;
  }
  await fs.delete("private", path);
  return true;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** Strips `.excalidraw` / `.json` suffix for UI display. */
export function stripExcalidrawExtension(name: string): string {
  const stripped = name.trim().replace(/\.excalidraw(?:\.json)?$/i, "").replace(/\.json$/i, "");
  return stripped || name.trim() || "未命名白板";
}

export function ensureExcalidrawExtension(name: string): string {
  const trimmed = name.trim() || DEFAULT_FILE_NAME;
  return trimmed.toLowerCase().endsWith(".excalidraw") || trimmed.toLowerCase().endsWith(".json")
    ? trimmed
    : `${trimmed}.excalidraw`;
}

function openFileViaInputFallback(): Promise<OpenedExcalidrawFile | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".excalidraw,.json,application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      try {
        resolve({
          fileName: file.name,
          content: await file.text(),
          handle: null,
        });
      } catch (err) {
        reject(err);
      }
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** Opens a local `.excalidraw` file via Dopame OS native picker or `<input type="file">`. */
export async function openLocalExcalidrawFile(): Promise<OpenedExcalidrawFile | null> {
  const pickerWin = window as FilePickerWindow;
  if (typeof pickerWin.showOpenFilePicker === "function") {
    try {
      const [handle] = await pickerWin.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: "Excalidraw 白板文件",
            accept: { "application/json": [".excalidraw", ".json"] },
          },
        ],
      });
      if (!handle) {
        return null;
      }
      const file = await handle.getFile();
      return {
        fileName: file.name || handle.name,
        content: await file.text(),
        handle,
      };
    } catch (error) {
      if (isAbortError(error)) {
        return null;
      }
      throw error;
    }
  }
  return openFileViaInputFallback();
}

/** Saves `.excalidraw` JSON to local disk via active handle or native save dialog. */
export async function saveLocalExcalidrawFile(params: {
  content: string;
  fileName: string;
  handle: FileSystemFileHandle | null;
  forceSaveAs?: boolean;
}): Promise<SaveExcalidrawResult | null> {
  const suggestedName = ensureExcalidrawExtension(params.fileName);

  if (params.handle && !params.forceSaveAs) {
    const writable = await params.handle.createWritable();
    await writable.write(params.content);
    await writable.close();
    return {
      fileName: params.handle.name || suggestedName,
      handle: params.handle,
      savedVia: "handle",
    };
  }

  const pickerWin = window as FilePickerWindow;
  if (typeof pickerWin.showSaveFilePicker === "function") {
    try {
      const nextHandle = await pickerWin.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: "Excalidraw 白板文件",
            accept: { "application/json": [".excalidraw"] },
          },
        ],
      });
      const writable = await nextHandle.createWritable();
      await writable.write(params.content);
      await writable.close();
      return {
        fileName: nextHandle.name || suggestedName,
        handle: nextHandle,
        savedVia: "picker",
      };
    } catch (error) {
      if (isAbortError(error)) {
        return null;
      }
      throw error;
    }
  }

  const fs = await getAcdeFs();
  if (fs) {
    const targetPath = `exports/${suggestedName}`;
    await fs.writeFile("private", targetPath, params.content, {
      create: "always",
      mkdirs: true,
    });
    return {
      fileName: suggestedName,
      handle: null,
      savedVia: "acde-fs",
    };
  }

  const blob = new Blob([params.content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = suggestedName;
  link.click();
  URL.revokeObjectURL(url);
  return {
    fileName: suggestedName,
    handle: null,
    savedVia: "download",
  };
}

/** Registers Dopame OS native window menus and `open-file` request handlers. */
export async function setupAcdeWindowIntegration(handlers: {
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onImportFiles?: () => void;
  onCreateSnapshot?: () => void;
  onToggleFullscreen?: () => void;
  onOpenSettings?: () => void;
  onOpenFileRequest: (file: OpenedExcalidrawFile) => void;
  onBeforeClose?: () => Promise<void> | void;
}): Promise<() => void> {
  const win = await getAcdeWindow();
  if (!win) {
    return () => {};
  }

  const menus = [
    {
      id: "file",
      label: "文件",
      items: [
        { id: "new", label: "新建", shortcut: "ctrl+n", onSelect: handlers.onNew },
        { id: "open", label: "打开...", shortcut: "ctrl+o", onSelect: handlers.onOpen },
        { type: "separator" as const },
        { id: "save", label: "保存", shortcut: "ctrl+s", onSelect: handlers.onSave },
        { id: "save-as", label: "另存为...", shortcut: "ctrl+shift+s", onSelect: handlers.onSaveAs },
        ...(handlers.onImportFiles
          ? [{ type: "separator" as const }, { id: "import-files", label: "插入图片 / 文件...", shortcut: "ctrl+i", onSelect: handlers.onImportFiles }]
          : []),
        ...(handlers.onCreateSnapshot
          ? [{ type: "separator" as const }, { id: "snapshot", label: "快照", onSelect: handlers.onCreateSnapshot }]
          : []),
      ],
    },
    ...(handlers.onToggleFullscreen || handlers.onOpenSettings
      ? [{
          id: "view",
          label: "视图",
          items: [
            ...(handlers.onToggleFullscreen ? [{ id: "fullscreen", label: "切换全屏", shortcut: "f11", onSelect: handlers.onToggleFullscreen }] : []),
            ...(handlers.onOpenSettings ? [{ id: "settings", label: "系统与设置", onSelect: handlers.onOpenSettings }] : []),
          ],
        }]
      : []),
  ];

  win.setMenus(menus);

  const unsubRequest = win.on("request", async (req: SystemRequest) => {
    if (req.kind === "open-file" && req.handle && req.handle.kind === "file") {
      try {
        const file = await req.handle.getFile();
        handlers.onOpenFileRequest({
          fileName: file.name || req.handle.name,
          content: await file.text(),
          handle: req.handle,
        });
      } catch (err) {
        console.error("Failed to open file from system request:", err);
      }
    }
  });

  const unsubBeforeClose = win.on("beforeclose", async () => {
    await handlers.onBeforeClose?.();
  });

  return () => {
    unsubRequest();
    unsubBeforeClose();
  };
}
