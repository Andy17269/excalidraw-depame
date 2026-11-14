const DEMO_MODE_KEY = 'excalidraw-plus.demo-mode';

export function getDemoMode(): boolean {
  try {
    return globalThis.localStorage?.getItem(DEMO_MODE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveDemoMode(enabled: boolean): void {
  try {
    globalThis.localStorage?.setItem(DEMO_MODE_KEY, enabled ? '1' : '0');
  } catch {
    // Keep the current session usable when persistent storage is unavailable.
  }
}
