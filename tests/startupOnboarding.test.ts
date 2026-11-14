import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasCompletedOnboarding,
  hasCompletedTour,
  markOnboardingCompleted,
  markTourCompleted,
  resetOnboarding,
  resetTour,
} from '../src/services/onboarding.ts';
import {
  formatRecentTime,
  listRecentFiles,
  loadRecentFileContent,
  recordRecentFile,
  removeRecentFile,
} from '../src/services/recentFiles.ts';

function installMockLocalStorage() {
  const store = new Map<string, string>();
  const mockStorage = {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    get length() {
      return store.size;
    },
  } as Storage;

  Object.defineProperty(globalThis, 'localStorage', {
    value: mockStorage,
    configurable: true,
    writable: true,
  });
  return store;
}

test('onboarding state defaults to false, persists completion, and resets cleanly', async () => {
  installMockLocalStorage();
  assert.equal(hasCompletedOnboarding(), false);
  assert.equal(hasCompletedTour(), false);

  await markOnboardingCompleted();
  markTourCompleted();
  assert.equal(hasCompletedOnboarding(), true);
  assert.equal(hasCompletedTour(), true);

  resetTour();
  assert.equal(hasCompletedTour(), false);

  markTourCompleted();
  await resetOnboarding();
  assert.equal(hasCompletedOnboarding(), false);
  assert.equal(hasCompletedTour(), false);
});

test('recentFiles records, deduplicates, formats time, and removes entries', async () => {
  installMockLocalStorage();
  assert.deepEqual(listRecentFiles(), []);

  await recordRecentFile({
    fileName: 'architecture.excalidraw',
    content: '{"type":"excalidraw","elements":[{"id":"1"}]}',
    handle: null,
    elementCount: 1,
  });

  await recordRecentFile({
    fileName: 'flowchart.excalidraw',
    content: '{"type":"excalidraw","elements":[{"id":"2"},{"id":"3"}]}',
    handle: null,
    elementCount: 2,
  });

  // Re-recording the first file should move it to the top without duplicating.
  await recordRecentFile({
    fileName: 'architecture.excalidraw',
    content: '{"type":"excalidraw","elements":[{"id":"1"},{"id":"4"},{"id":"5"}]}',
    handle: null,
    elementCount: 3,
  });

  const list = listRecentFiles();
  assert.equal(list.length, 2);
  assert.equal(list[0].fileName, 'architecture.excalidraw');
  assert.equal(list[0].elementCount, 3);
  assert.equal(list[1].fileName, 'flowchart.excalidraw');

  // Without acde:fs or IndexedDB in Node, loadRecentFileContent returns null gracefully.
  assert.equal(await loadRecentFileContent(list[0]), null);

  const afterRemove = await removeRecentFile(list[0].id);
  assert.equal(afterRemove.length, 1);
  assert.equal(afterRemove[0].fileName, 'flowchart.excalidraw');

  const now = 1_700_000_000_000;
  assert.equal(formatRecentTime(now - 10_000, now), '刚刚');
  assert.equal(formatRecentTime(now - 5 * 60_000, now), '5 分钟前');
  assert.equal(formatRecentTime(now - 3 * 3600_000, now), '3 小时前');
  assert.equal(formatRecentTime(now - 2 * 86400_000, now), '2 天前');
});
