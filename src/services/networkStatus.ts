import { useCallback, useEffect, useRef, useState } from 'react';

export const OFFLINE_AI_MESSAGE = '未检测到互联网连接，AI 功能已禁用';

const CLIENT_PROBE_TIMEOUT_MS = 6500;
const ONLINE_RECHECK_INTERVAL_MS = 30000;
const OFFLINE_RECHECK_INTERVAL_MS = 10000;
const FOCUS_RECHECK_THROTTLE_MS = 3000;

export interface ClientNetworkStatus {
  online: boolean;
  checkedAt: number | null;
  reason?: string;
}

/**
 * Query backend `/api/network/status` (which runs `ping baidu.com` with 5s timeout).
 */
export async function fetchNetworkStatus(signal?: AbortSignal): Promise<ClientNetworkStatus> {
  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onParentAbort, { once: true });
  }
  const timer = globalThis.setTimeout(() => controller.abort(), CLIENT_PROBE_TIMEOUT_MS);

  try {
    const response = await fetch('/api/network/status', {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) {
      return { online: false, checkedAt: Date.now(), reason: `HTTP ${response.status}` };
    }
    const data = await response.json() as { online?: unknown; checkedAt?: unknown; reason?: unknown };
    if (typeof data.online !== 'boolean') {
      return { online: false, checkedAt: Date.now(), reason: '网络检测响应异常' };
    }
    return {
      online: data.online,
      checkedAt: typeof data.checkedAt === 'number' ? data.checkedAt : Date.now(),
      ...(typeof data.reason === 'string' && data.reason ? { reason: data.reason } : {}),
    };
  } catch {
    return { online: false, checkedAt: Date.now(), reason: '网络检测失败' };
  } finally {
    globalThis.clearTimeout(timer);
    signal?.removeEventListener('abort', onParentAbort);
  }
}

export interface InternetStatusState extends ClientNetworkStatus {
  recheck: () => Promise<boolean>;
}

/**
 * Track live Internet reachability using backend ping probes and browser network/focus events.
 */
export function useInternetStatus(): InternetStatusState {
  const [status, setStatus] = useState<ClientNetworkStatus>(() => ({
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    checkedAt: null,
  }));
  const seqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const statusRef = useRef(status);
  statusRef.current = status;

  const recheck = useCallback(async () => {
    const seq = ++seqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const next = await fetchNetworkStatus(controller.signal);
    if (seq !== seqRef.current || controller.signal.aborted) {
      return statusRef.current.online;
    }
    if (abortRef.current === controller) {
      abortRef.current = null;
    }
    setStatus(next);
    return next.online;
  }, []);

  useEffect(() => {
    void recheck();

    const handleOnline = () => {
      void recheck();
    };
    const handleOffline = () => {
      seqRef.current++;
      abortRef.current?.abort();
      abortRef.current = null;
      setStatus({ online: false, checkedAt: Date.now(), reason: '浏览器离线' });
      void recheck();
    };
    const handleFocusOrVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const lastChecked = statusRef.current.checkedAt;
      if (statusRef.current.online && lastChecked && Date.now() - lastChecked < FOCUS_RECHECK_THROTTLE_MS) {
        return;
      }
      void recheck();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);
    return () => {
      seqRef.current++;
      abortRef.current?.abort();
      abortRef.current = null;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
    };
  }, [recheck]);

  useEffect(() => {
    const intervalMs = status.online ? ONLINE_RECHECK_INTERVAL_MS : OFFLINE_RECHECK_INTERVAL_MS;
    const timer = window.setInterval(() => {
      void recheck();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [status.online, recheck]);

  return {
    online: status.online,
    checkedAt: status.checkedAt,
    reason: status.reason,
    recheck,
  };
}
