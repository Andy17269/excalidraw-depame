export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'excalidraw-plus.theme-preference';
const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';
const listeners = new Set<() => void>();

let currentPreference: ThemePreference = readStoredPreference();
let unsubscribeMedia: (() => void) | undefined;

function readStoredPreference(): ThemePreference {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    // Ignore storage errors in restricted environments.
  }
  return 'system';
}

export function getSystemTheme(): ResolvedTheme {
  try {
    if (typeof globalThis.window?.matchMedia === 'function') {
      return globalThis.window.matchMedia(DARK_MEDIA_QUERY).matches ? 'dark' : 'light';
    }
  } catch {
    // Fall back to light if matchMedia is unavailable.
  }
  return 'light';
}

export function resolveTheme(preference: ThemePreference, systemTheme: ResolvedTheme = getSystemTheme()): ResolvedTheme {
  return preference === 'system' ? systemTheme : preference;
}

export function getThemePreference(): ThemePreference {
  return currentPreference;
}

export function getResolvedTheme(): ResolvedTheme {
  return resolveTheme(currentPreference);
}

export function applyResolvedTheme(resolved: ResolvedTheme): void {
  const root = globalThis.document?.documentElement;
  if (!root) return;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
}

/** Apply appearance before the first React render, including the welcome screen. */
export function initializeTheme(): ResolvedTheme {
  const resolved = getResolvedTheme();
  applyResolvedTheme(resolved);
  return resolved;
}

function ensureMediaListener(): void {
  if (unsubscribeMedia) return;
  if (typeof globalThis.window?.matchMedia !== 'function') return;
  try {
    const media = globalThis.window.matchMedia(DARK_MEDIA_QUERY);
    const onChange = () => {
      if (currentPreference === 'system') {
        applyResolvedTheme(media.matches ? 'dark' : 'light');
        for (const listener of listeners) listener();
      }
    };
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange);
      unsubscribeMedia = () => media.removeEventListener('change', onChange);
    } else if (typeof media.addListener === 'function') {
      media.addListener(onChange);
      unsubscribeMedia = () => media.removeListener(onChange);
    }
  } catch {
    // Some embedded runtimes expose matchMedia but cannot create a query.
  }
}

export function setThemePreference(next: ThemePreference): ResolvedTheme {
  currentPreference = next;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, next);
  } catch {
    // Ignore storage errors.
  }
  const resolved = resolveTheme(next);
  applyResolvedTheme(resolved);
  for (const listener of listeners) listener();
  return resolved;
}

export function subscribeTheme(listener: () => void): () => void {
  ensureMediaListener();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      unsubscribeMedia?.();
      unsubscribeMedia = undefined;
    }
  };
}
