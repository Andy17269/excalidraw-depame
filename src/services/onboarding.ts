import type { AcdeFs } from '@dopame/acde-api';

const ONBOARDING_KEY = 'excalidraw-plus.onboarding-completed';
const TOUR_KEY = 'excalidraw-plus.tour-completed';
const ONBOARDING_FS_PATH = 'workspace/onboarding.json';

async function tryGetAcdeFs(): Promise<AcdeFs | null> {
  if (typeof globalThis.window === 'undefined') return null;
  try {
    const mod = await import('./excalidrawStorage.ts');
    return await mod.getAcdeFs();
  } catch {
    return null;
  }
}

export function hasCompletedOnboarding(): boolean {
  try {
    return globalThis.localStorage?.getItem(ONBOARDING_KEY) === '1';
  } catch {
    return false;
  }
}

export async function loadOnboardingCompleted(): Promise<boolean> {
  if (hasCompletedOnboarding()) return true;
  const fs = await tryGetAcdeFs();
  if (!fs) return false;
  try {
    const { text } = await fs.readText('private', ONBOARDING_FS_PATH);
    const parsed = JSON.parse(text) as { completed?: unknown };
    if (parsed?.completed === true) {
      try {
        globalThis.localStorage?.setItem(ONBOARDING_KEY, '1');
      } catch {
        // Ignore storage errors.
      }
      return true;
    }
  } catch {
    // Not persisted yet.
  }
  return false;
}

export async function markOnboardingCompleted(): Promise<void> {
  try {
    globalThis.localStorage?.setItem(ONBOARDING_KEY, '1');
  } catch {
    // Ignore storage errors in restricted environments.
  }
  const fs = await tryGetAcdeFs();
  if (fs) {
    try {
      await fs.writeFile('private', ONBOARDING_FS_PATH, JSON.stringify({ completed: true }), {
        create: 'always',
        mkdirs: true,
      });
    } catch {
      // Ignore fs errors.
    }
  }
}

export function hasCompletedTour(): boolean {
  try {
    return globalThis.localStorage?.getItem(TOUR_KEY) === '1';
  } catch {
    return false;
  }
}

export function markTourCompleted(): void {
  try {
    globalThis.localStorage?.setItem(TOUR_KEY, '1');
  } catch {
    // Ignore storage errors in restricted environments.
  }
}

export function resetTour(): void {
  try {
    globalThis.localStorage?.removeItem(TOUR_KEY);
  } catch {
    // Ignore storage errors in restricted environments.
  }
}

export async function resetOnboarding(): Promise<void> {
  try {
    globalThis.localStorage?.removeItem(ONBOARDING_KEY);
    globalThis.localStorage?.removeItem(TOUR_KEY);
  } catch {
    // Ignore storage errors in restricted environments.
  }
  const fs = await tryGetAcdeFs();
  if (fs) {
    try {
      await fs.delete('private', ONBOARDING_FS_PATH);
    } catch {
      // Ignore if file doesn't exist.
    }
  }
}
