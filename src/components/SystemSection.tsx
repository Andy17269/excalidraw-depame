import { useCallback, useEffect, useState } from 'react';
import type { WindowMode, WindowState } from '@dopame/acde-api';
import {
  getKernelSnapshot,
  requestAcdeCapability,
  setAcdeWindowMode,
  setAcdeWindowState,
  subscribeKernelEvents,
  type KernelSnapshot,
} from '../services/acdeKernel';
import { Icon } from './Icon';

interface SystemSectionProps {
  active: boolean;
}

const SYSTEM_LABELS: Record<string, string> = {
  browser: '浏览器', standalone: '独立运行', desktop: '桌面',
  unsupported: '不支持', supported: '支持', native: '原生', simulated: '模拟',
  none: '无', macos: 'macOS', windows: 'Windows', linux: 'Linux',
  fs: '文件访问', window: '窗口管理', clipboard: '剪贴板', notifications: '系统通知',
  notification: '系统通知', ai: '人工智能', caps: '权限管理', open: '打开应用',
  dialog: '系统对话框', camera: '摄像头', microphone: '麦克风',
  services: '系统服务', shell: '命令执行', network: '网络访问',
};
const systemLabel = (value: string | undefined) => value ? SYSTEM_LABELS[value] ?? value : '检测中';

const WINDOW_STATES: ReadonlyArray<{ id: WindowState; label: string }> = [
  { id: 'normal', label: '标准' },
  { id: 'filled', label: '铺满' },
  { id: 'fullscreen', label: '全屏' },
];

const WINDOW_MODES: ReadonlyArray<{ id: WindowMode; label: string }> = [
  { id: 'free', label: '自由' },
  { id: 'fixed', label: '固定' },
  { id: 'pinned', label: '钉住' },
];

function capabilityStateLabel(state: string): string {
  switch (state) {
    case 'available': return '可用';
    case 'not-asked': return '未询问';
    case 'asking': return '等待授权';
    case 'denied': return '已拒绝';
    case 'service-not-running': return '未启动';
    case 'unsupported': return '不支持';
    default: return state;
  }
}

export function SystemSection({ active }: SystemSectionProps) {
  const [kernel, setKernel] = useState<KernelSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'saved' | 'error'; text: string } | null>(null);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      setKernel(await getKernelSnapshot());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void refreshAll();
    let cleanup = () => {};
    let disposed = false;
    void subscribeKernelEvents(() => {
      void getKernelSnapshot().then(next => {
        if (!disposed) setKernel(next);
      });
    }).then(unsub => {
      if (disposed) unsub();
      else cleanup = unsub;
    });
    return () => {
      disposed = true;
      cleanup();
    };
  }, [active, refreshAll]);

  const handleStateChange = async (state: WindowState) => {
    setActionBusy(true);
    setFeedback(null);
    try {
      const ok = await setAcdeWindowState(state);
      if (ok) {
        await refreshAll();
      }
    } catch (err) {
      setFeedback({ tone: 'error', text: err instanceof Error ? err.message : '窗口状态切换失败' });
    } finally {
      setActionBusy(false);
    }
  };

  const handleModeChange = async (mode: WindowMode) => {
    setActionBusy(true);
    setFeedback(null);
    try {
      const ok = await setAcdeWindowMode(mode);
      if (ok) {
        setKernel(prev => (prev ? { ...prev, windowMode: mode } : prev));
      }
    } catch (err) {
      setFeedback({ tone: 'error', text: err instanceof Error ? err.message : '窗口模式切换失败' });
    } finally {
      setActionBusy(false);
    }
  };

  const handleRequestCap = async (name: string) => {
    setActionBusy(true);
    setFeedback(null);
    try {
      await requestAcdeCapability(name);
      await refreshAll();
    } catch (err) {
      setFeedback({ tone: 'error', text: err instanceof Error ? err.message : '权限请求失败' });
    } finally {
      setActionBusy(false);
    }
  };

  const disabled = loading || actionBusy;

  return (
    <div className="mcp-section system-section">
      <div className="mcp-card">
        <div className="mcp-card-top">
          <div className="mcp-card-info">
            <span className={`status-dot ${kernel?.connected ? 'saved' : 'idle'}`} />
            <span className="mcp-card-name">Dopame OS 运行环境</span>
            <span className="mcp-pill is-accent">{systemLabel(kernel?.mode)}</span>
          </div>
          <button
            type="button"
            className="mcp-tool-btn"
            title="刷新内核状态"
            aria-label="刷新内核状态"
            disabled={disabled}
            onClick={() => void refreshAll()}
          >
            <Icon name="refresh" />
          </button>
        </div>

        <div className="system-meta-grid">
          <span className="mcp-pill">平台: {systemLabel(kernel?.platform)}</span>
          <span className="mcp-pill">契约: L{kernel?.contractLevel ?? 0}</span>
          <span className="mcp-pill">窗口: #{kernel?.windowId ?? '-'}</span>
          <span className="mcp-pill">毛玻璃: {systemLabel(kernel?.backdropSupport)}</span>
        </div>

        {kernel?.connected && (
          <>
            <div className="menu-row">
              <span className="menu-row-label">窗口状态</span>
              <div className="menu-segmented" role="group" aria-label="窗口状态">
                {WINDOW_STATES.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={kernel.windowState === item.id}
                    disabled={disabled}
                    onClick={() => void handleStateChange(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={disabled || !kernel.minimizable}
                  title={kernel.minimizable ? '最小化窗口' : '当前单窗口宿主模式不支持最小化'}
                  onClick={() => void handleStateChange('minimized')}
                >
                  最小化
                </button>
              </div>
            </div>

            <div className="menu-row">
              <span className="menu-row-label">窗口约束</span>
              <div className="menu-segmented" role="group" aria-label="窗口约束">
                {WINDOW_MODES.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={kernel.windowMode === item.id}
                    disabled={disabled}
                    onClick={() => void handleModeChange(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {kernel && kernel.capabilities.some(cap => cap.state !== 'not-declared' && cap.state !== 'shell-only') && (
          <div className="system-caps-list">
            {kernel.capabilities
              .filter(cap => cap.state !== 'not-declared' && cap.state !== 'shell-only')
              .map(cap => (
              <div key={cap.name} className="system-cap-chip">
                <span>{systemLabel(cap.name)}</span>
                <span className={`mcp-pill ${cap.state === 'available' ? 'is-accent' : ''}`}>
                  {capabilityStateLabel(cap.state)}
                </span>
                {cap.state === 'not-asked' && (
                  <button
                    type="button"
                    className="menu-inline-action"
                    disabled={disabled}
                    onClick={() => void handleRequestCap(cap.name)}
                  >
                    授权
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {feedback && (
        <div className={`menu-status is-${feedback.tone}`} role="status" aria-live="polite">
          <span className={`status-dot ${feedback.tone}`} aria-hidden="true" />
          <span>{feedback.text}</span>
        </div>
      )}
    </div>
  );
}
