import assert from 'node:assert/strict';
import test from 'node:test';
import { getThemePreference, resolveTheme, setThemePreference } from '../src/services/theme.ts';

let moduleId = 0;
async function themeEnvironment(t: test.TestContext, stored: string | null = null, legacy = false) {
  const descriptors = new Map(['window', 'document', 'localStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const changes = new Set<() => void>();
  const root = { dataset: {} as Record<string, string>, style: { colorScheme: '' } };
  const media = {
    matches: true,
    ...(legacy ? {
      addListener: (fn: () => void) => changes.add(fn),
      removeListener: (fn: () => void) => changes.delete(fn),
    } : {
      addEventListener: (_: string, fn: () => void) => changes.add(fn),
      removeEventListener: (_: string, fn: () => void) => changes.delete(fn),
    }),
  };
  const storage = {
    getItem: () => stored,
    setItem: (_: string, value: string) => { stored = value; },
  };
  for (const [key, value] of Object.entries({ window: { matchMedia: () => media }, document: { documentElement: root }, localStorage: storage })) {
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  t.after(() => {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  const theme = await import(`../src/services/theme.ts?test=${++moduleId}`);
  return { theme, root, media, changes, storage, change: (dark: boolean) => { media.matches = dark; for (const fn of changes) fn(); } };
}

test('theme defaults to system and resolves light/dark from system or explicit preference', () => {
  assert.equal(getThemePreference(), 'system');
  assert.equal(resolveTheme('system', 'dark'), 'dark');
  assert.equal(resolveTheme('system', 'light'), 'light');
  assert.equal(resolveTheme('light', 'dark'), 'light');
  assert.equal(resolveTheme('dark', 'light'), 'dark');

  assert.equal(setThemePreference('dark'), 'dark');
  assert.equal(getThemePreference(), 'dark');
  assert.equal(setThemePreference('system'), 'light');
});

test('initialization restores saved appearance before mounting UI and falls back from invalid storage', async t => {
  const { theme, root } = await themeEnvironment(t, 'light');
  assert.equal(theme.initializeTheme(), 'light');
  assert.equal(root.dataset.theme, 'light');
  assert.equal(root.style.colorScheme, 'light');
});

test('invalid preference follows system and unavailable storage does not prevent changes', async t => {
  const { theme, root, storage } = await themeEnvironment(t, 'invalid');
  assert.equal(theme.initializeTheme(), 'dark');
  storage.setItem = () => { throw new Error('blocked'); };
  assert.equal(theme.setThemePreference('light'), 'light');
  assert.equal(root.dataset.theme, 'light');
  storage.getItem = () => { throw new Error('blocked'); };
  const reloaded = await import(`../src/services/theme.ts?test=${++moduleId}`);
  assert.equal(reloaded.initializeTheme(), 'dark');
});

for (const legacy of [false, true]) {
  test(`system changes update all subscribers only in system mode (${legacy ? 'legacy' : 'modern'} media API)`, async t => {
    const { theme, root, changes, change } = await themeEnvironment(t, null, legacy);
    theme.initializeTheme();
    let calls = 0;
    const unsubscribe = theme.subscribeTheme(() => calls++);
    const other = theme.subscribeTheme(() => calls++);
    assert.equal(changes.size, 1);
    change(false);
    assert.equal(root.dataset.theme, 'light');
    assert.equal(calls, 2);
    theme.setThemePreference('dark');
    change(false);
    assert.equal(root.dataset.theme, 'dark');
    assert.equal(calls, 4);
    unsubscribe();
    other();
    assert.equal(changes.size, 0, 'last subscriber must detach the media listener, including StrictMode remounts');
    const again = theme.subscribeTheme(() => calls++);
    assert.equal(changes.size, 1);
    theme.setThemePreference('system');
    change(true);
    assert.equal(root.style.colorScheme, 'dark');
    again();
  });
}

test('missing or throwing matchMedia gracefully defaults to light', async t => {
  const { theme, root } = await themeEnvironment(t);
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { matchMedia: () => { throw new Error('unsupported'); } } });
  assert.equal(theme.initializeTheme(), 'light');
  const unsubscribe = theme.subscribeTheme(() => {});
  assert.equal(root.dataset.theme, 'light');
  unsubscribe();
});
