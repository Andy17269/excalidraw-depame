/// <reference types="@dopame/acde-api/app" />
import { load } from "@dopame/acde-api";
import type {
  AcdeCapabilities,
  CapabilityStatus,
  WindowMode,
  WindowRect,
  WindowState,
} from "@dopame/acde-api";
import { getAcdeWindow } from "./excalidrawStorage";

export interface KernelSnapshot {
  connected: boolean;
  platform: string;
  mode: string;
  contractLevel: number;
  backdropSupport: string;
  windowId: number | null;
  windowState: WindowState | null;
  windowMode: WindowMode;
  minimizable: boolean;
  hostControls: boolean;
  focused: boolean;
  capabilities: CapabilityStatus[];
}

let cachedCaps: Promise<AcdeCapabilities | null> | null = null;
let currentWindowMode: WindowMode = "free";
let currentFocused = true;
let initializedTracking = false;

export function getAcdeCapabilities(): Promise<AcdeCapabilities | null> {
  if (!cachedCaps) {
    cachedCaps = load("capabilities").catch(() => null);
  }
  return cachedCaps;
}

async function ensureWindowTracking(): Promise<void> {
  if (initializedTracking) return;
  initializedTracking = true;
  const win = await getAcdeWindow();
  if (!win) return;
  win.on("activate", () => {
    currentFocused = true;
  });
  win.on("deactivate", () => {
    currentFocused = false;
  });
}

/** Reads current Dopame OS runtime capabilities and window state. */
export async function getKernelSnapshot(): Promise<KernelSnapshot> {
  await ensureWindowTracking();
  const [caps, win] = await Promise.all([getAcdeCapabilities(), getAcdeWindow()]);
  if (!caps && !win) {
    return {
      connected: false,
      platform: "browser",
      mode: "browser",
      contractLevel: 0,
      backdropSupport: "unsupported",
      windowId: null,
      windowState: null,
      windowMode: currentWindowMode,
      minimizable: false,
      hostControls: false,
      focused: typeof document !== "undefined" ? document.hasFocus() : true,
      capabilities: [],
    };
  }
  return {
    connected: true,
    platform: caps?.platform ?? "unknown",
    mode: caps?.mode ?? "standalone",
    contractLevel: caps?.level ?? 1,
    backdropSupport: caps?.window.backdrop ?? "unsupported",
    windowId: win?.id ?? null,
    windowState: win?.state ?? null,
    windowMode: currentWindowMode,
    minimizable: win?.minimizable ?? false,
    hostControls: win?.hostControls ?? false,
    focused: currentFocused,
    capabilities: caps ? caps.list() : [],
  };
}

/** Subscribes to native window state and focus changes. */
export async function subscribeKernelEvents(onUpdate: () => void): Promise<() => void> {
  await ensureWindowTracking();
  const win = await getAcdeWindow();
  if (!win) return () => {};
  const unsubs = [
    win.on("state", onUpdate),
    win.on("activate", onUpdate),
    win.on("deactivate", onUpdate),
    win.on("minimizable", onUpdate),
    win.on("hostcontrols", onUpdate),
  ];
  return () => {
    for (const unsub of unsubs) unsub();
  };
}

/** Requests a Dopame OS window state transition (`normal` | `filled` | `fullscreen` | `minimized`). */
export async function setAcdeWindowState(state: WindowState): Promise<boolean> {
  const win = await getAcdeWindow();
  if (!win) return false;
  if (state === "minimized") {
    if (!win.minimizable) return false;
    await win.minimize();
    return true;
  }
  win.requestState(state);
  return true;
}

/** Toggles between `fullscreen` and `normal` window states. */
export async function toggleAcdeFullscreen(): Promise<boolean> {
  const win = await getAcdeWindow();
  if (!win) return false;
  win.requestState(win.state === "fullscreen" ? "normal" : "fullscreen");
  return true;
}

/** Sets window movement/resize mode (`free` | `fixed` | `pinned`). */
export async function setAcdeWindowMode(mode: WindowMode): Promise<boolean> {
  const win = await getAcdeWindow();
  if (!win) return false;
  win.requestMode(mode);
  currentWindowMode = mode;
  return true;
}

/** Requests an optional permission such as `microphone` via `acde:capabilities`. */
export async function requestAcdeCapability(name: string): Promise<CapabilityStatus | null> {
  const caps = await getAcdeCapabilities();
  if (!caps) return null;
  return caps.request(name);
}

/** Requests system attention when an async task finishes while the window is unfocused. */
export async function requestAttentionIfBackground(): Promise<void> {
  const win = await getAcdeWindow();
  if (!win) return;
  if (!currentFocused) {
    await win.requestAttention().catch(() => {});
  }
}

/** Applies or clears native window backdrop blur when supported by the runtime. */
export async function syncWindowBackdrop(rect: WindowRect | null): Promise<void> {
  const [caps, win] = await Promise.all([getAcdeCapabilities(), getAcdeWindow()]);
  if (!win || !caps || caps.window.backdrop === "unsupported") return;
  win.setBackdrop(rect, rect ? { radius: 24, blur: 24, saturate: 1.2 } : undefined);
}

/** Closes the current Dopame OS window (exiting standalone apps), falling back to `window.close()` in browser previews. */
export async function exitAcdeApp(): Promise<boolean> {
  const win = await getAcdeWindow();
  if (win) {
    return win.close();
  }
  window.close();
  return true;
}
