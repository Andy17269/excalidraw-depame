import type { AcdeFs } from '@dopame/acde-api';
import type { OpenedExcalidrawFile } from './excalidrawStorage.ts';

async function tryGetAcdeFs(): Promise<AcdeFs | null> {
  if (typeof globalThis.window === 'undefined') return null;
  try {
    const mod = await import('./excalidrawStorage.ts');
    return await mod.getAcdeFs();
  } catch {
    return null;
  }
}

const RECENT_FILES_KEY = 'excalidraw-plus.recent-files';
const RECENT_FILES_FS_PATH = 'workspace/recent-files.json';
const MAX_RECENT_FILES = 10;
const IDB_NAME = 'excalidraw-plus-recent';
const IDB_STORE = 'files';

export interface RecentFileEntry {
  id: string;
  fileName: string;
  updatedAt: number;
  elementCount: number;
  cachePath?: string;
  hasHandle?: boolean;
}

interface StoredRecentRecord {
  id: string;
  content: string;
  handle: FileSystemFileHandle | null;
}

function parseEntries(raw: string): RecentFileEntry[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is RecentFileEntry =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof item.id === 'string' &&
        typeof item.fileName === 'string' &&
        typeof item.updatedAt === 'number' &&
        typeof item.elementCount === 'number',
    );
  } catch {
    return [];
  }
}

function readStoredList(): RecentFileEntry[] {
  try {
    const raw = globalThis.localStorage?.getItem(RECENT_FILES_KEY);
    return raw ? parseEntries(raw) : [];
  } catch {
    return [];
  }
}

function writeStoredList(entries: RecentFileEntry[]): void {
  try {
    globalThis.localStorage?.setItem(RECENT_FILES_KEY, JSON.stringify(entries));
  } catch {
    // Ignore storage errors in restricted environments.
  }
}

async function persistRecentList(entries: RecentFileEntry[]): Promise<void> {
  writeStoredList(entries);
  const fs = await tryGetAcdeFs();
  if (fs) {
    try {
      await fs.writeFile('private', RECENT_FILES_FS_PATH, JSON.stringify(entries), {
        create: 'always',
        mkdirs: true,
      });
    } catch {
      // Ignore fs errors.
    }
  }
}

function openRecentDb(): Promise<IDBDatabase | null> {
  if (typeof globalThis.indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = globalThis.indexedDB.open(IDB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function putIdbRecord(record: StoredRecentRecord): Promise<void> {
  const db = await openRecentDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(record);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

async function getIdbRecord(id: string): Promise<StoredRecentRecord | null> {
  const db = await openRecentDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(id);
      req.onsuccess = () => {
        db.close();
        resolve((req.result as StoredRecentRecord | undefined) ?? null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

async function deleteIdbRecord(id: string): Promise<void> {
  const db = await openRecentDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(id);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

export function listRecentFiles(): RecentFileEntry[] {
  return readStoredList().sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadRecentFiles(): Promise<RecentFileEntry[]> {
  const local = readStoredList();
  const fs = await tryGetAcdeFs();
  if (!fs) return local.sort((a, b) => b.updatedAt - a.updatedAt);
  try {
    const { text } = await fs.readText('private', RECENT_FILES_FS_PATH);
    const fromFs = parseEntries(text);
    const byId = new Map<string, RecentFileEntry>();
    for (const item of fromFs) byId.set(item.id, item);
    for (const item of local) {
      const prev = byId.get(item.id);
      if (!prev || item.updatedAt > prev.updatedAt) byId.set(item.id, item);
    }
    const merged = Array.from(byId.values())
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_RECENT_FILES);
    writeStoredList(merged);
    return merged;
  } catch {
    return local.sort((a, b) => b.updatedAt - a.updatedAt);
  }
}

export async function recordRecentFile(params: {
  fileName: string;
  content: string;
  handle: FileSystemFileHandle | null;
  elementCount: number;
}): Promise<RecentFileEntry[]> {
  const normalizedName = params.fileName.trim() || '未命名白板.excalidraw';
  const existing = await loadRecentFiles();
  const matched = existing.find((item) => item.fileName === normalizedName);
  const id = matched?.id ?? crypto.randomUUID();
  const cachePath = `workspace/recent/${id}.excalidraw`;

  const fs = await tryGetAcdeFs();
  let persistedInFs = false;
  if (fs) {
    try {
      await fs.writeFile('private', cachePath, params.content, {
        create: 'always',
        mkdirs: true,
      });
      persistedInFs = true;
    } catch {
      persistedInFs = false;
    }
  }

  await putIdbRecord({
    id,
    content: params.content,
    handle: params.handle,
  });

  const nextEntry: RecentFileEntry = {
    id,
    fileName: normalizedName,
    updatedAt: Date.now(),
    elementCount: params.elementCount,
    cachePath: persistedInFs ? cachePath : matched?.cachePath,
    hasHandle: Boolean(params.handle),
  };

  const merged = [nextEntry, ...existing.filter((item) => item.id !== id)];
  const kept = merged.slice(0, MAX_RECENT_FILES);
  const evicted = merged.slice(MAX_RECENT_FILES);
  await persistRecentList(kept);

  for (const old of evicted) {
    void cleanupRecentBacking(old);
  }

  return kept;
}

async function cleanupRecentBacking(entry: RecentFileEntry): Promise<void> {
  if (entry.cachePath) {
    const fs = await tryGetAcdeFs();
    if (fs) {
      await fs.delete('private', entry.cachePath).catch(() => {});
    }
  }
  await deleteIdbRecord(entry.id);
}

export async function loadRecentFileContent(entry: RecentFileEntry): Promise<OpenedExcalidrawFile | null> {
  const idbRecord = await getIdbRecord(entry.id);
  if (idbRecord?.handle) {
    try {
      const file = await idbRecord.handle.getFile();
      return {
        fileName: file.name || entry.fileName,
        content: await file.text(),
        handle: idbRecord.handle,
      };
    } catch {
      // Fall back to cached content if handle permission or file is unavailable.
    }
  }

  if (entry.cachePath) {
    const fs = await tryGetAcdeFs();
    if (fs) {
      try {
        const { text } = await fs.readText('private', entry.cachePath);
        return {
          fileName: entry.fileName,
          content: text,
          handle: null,
        };
      } catch {
        // Fall back to IndexedDB content cache.
      }
    }
  }

  if (idbRecord?.content) {
    return {
      fileName: entry.fileName,
      content: idbRecord.content,
      handle: null,
    };
  }

  return null;
}

export async function removeRecentFile(id: string): Promise<RecentFileEntry[]> {
  const existing = await loadRecentFiles();
  const target = existing.find((item) => item.id === id);
  const next = existing.filter((item) => item.id !== id);
  await persistRecentList(next);
  if (target) {
    await cleanupRecentBacking(target);
  }
  return next;
}

export function formatRecentTime(timestamp: number, now = Date.now()): string {
  const diffMs = Math.max(0, now - timestamp);
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}
