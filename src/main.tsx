import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@excalidraw/excalidraw/index.css';
import './theme.css';
import './index.css';
import App from './App.tsx';
import { installCanvasCompat } from './services/canvasCompat';
import { installImageCompat } from './services/imageCompat';
import { initializeTheme } from './services/theme';

declare global { interface Window { EXCALIDRAW_ASSET_PATH?: string | string[] } }

window.EXCALIDRAW_ASSET_PATH ??= new URL(`${import.meta.env.BASE_URL}excalidraw-assets/`, document.baseURI).href;
const runtime = globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } };
runtime.process ??= { env: { NODE_ENV: import.meta.env.MODE } };
runtime.process.env ??= { NODE_ENV: import.meta.env.MODE };

const disabledRequest = (): IDBOpenDBRequest => {
  const request = Object.assign(new EventTarget(), {
    result: undefined,
    error: new DOMException('IndexedDB disabled', 'NotSupportedError'),
    source: null, transaction: null, readyState: 'done',
    onsuccess: null, onerror: null, onblocked: null, onupgradeneeded: null,
  }) as unknown as IDBOpenDBRequest;
  queueMicrotask(() => {
    const event = new Event('error', { cancelable: true });
    request.dispatchEvent(event);
    request.onerror?.call(request, event);
  });
  return request;
};
try {
  Object.defineProperty(window, 'indexedDB', { configurable: true, get: () => ({ open: disabledRequest, deleteDatabase: disabledRequest, databases: async () => [], cmp: () => 0 }) });
} catch {}

if (/acdert\//i.test(navigator.userAgent)) {
  const proto = CSSStyleDeclaration.prototype;
  const normalize = (property: string, value: string | null) => ['pointer-events', '--ui-pointerEvents'].includes(property) && value?.trim() === 'all' ? 'auto' : value;
  const setProperty = proto.setProperty;
  proto.setProperty = function (property, value, priority) { setProperty.call(this, property, normalize(property, value), priority); };
  const pointer = Object.getOwnPropertyDescriptor(proto, 'pointerEvents');
  if (pointer?.set && pointer.configurable) Object.defineProperty(proto, 'pointerEvents', { ...pointer, set(this: CSSStyleDeclaration, value: string) { pointer.set!.call(this, normalize('pointer-events', value)); } });
  installCanvasCompat();
  installImageCompat();
}

initializeTheme();
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
