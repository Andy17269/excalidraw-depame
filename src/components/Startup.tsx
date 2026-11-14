import { useEffect, useRef, useState } from 'react';
import appIcon from '../assets/startup/icon.png';
import actionNewIcon from '../assets/startup/action-new.png';
import { stripExcalidrawExtension } from '../services/excalidrawStorage';
import {
  formatRecentTime,
  listRecentFiles,
  loadRecentFiles,
  removeRecentFile,
  type RecentFileEntry,
} from '../services/recentFiles';
import { Icon } from './Icon';
import { STARTUP_PRESETS, type StartupPresetId } from '../services/startupPresets';

interface StartupProps {
  ready: boolean;
  busy: boolean;
  leaving: boolean;
  trapFocus?: boolean;
  onContinue: () => void;
  onNew: () => void;
  onOpen: () => void;
  onOpenRecent: (entry: RecentFileEntry) => void;
  onStartPreset?: (presetId: StartupPresetId) => void;
}

export function Startup({
  ready,
  busy,
  leaving,
  trapFocus = true,
  onContinue,
  onNew,
  onOpen,
  onOpenRecent,
  onStartPreset,
}: StartupProps) {
  const dialog = useRef<HTMLDivElement>(null);
  const newButton = useRef<HTMLButtonElement>(null);
  const [recentFiles, setRecentFiles] = useState<RecentFileEntry[]>(() => listRecentFiles());
  const disabled = !ready || busy || leaving;

  useEffect(() => {
    let cancelled = false;
    setRecentFiles(listRecentFiles());
    void loadRecentFiles().then(entries => {
      if (!cancelled) setRecentFiles(entries);
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  useEffect(() => {
    if (!disabled && trapFocus) newButton.current?.focus({ preventScroll: true });
  }, [disabled, trapFocus]);

  useEffect(() => {
    if (!trapFocus) return;
    const containFocus = (event: FocusEvent) => {
      if (dialog.current && !dialog.current.contains(event.target as Node)) {
        if (disabled) dialog.current.focus({ preventScroll: true });
        else newButton.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('focusin', containFocus);
    return () => document.removeEventListener('focusin', containFocus);
  }, [disabled, trapFocus]);

  const handleRemoveRecent = async (id: string) => {
    const next = await removeRecentFile(id);
    setRecentFiles(next);
  };

  return (
    <div
      className={`welcome-screen startup-screen ${leaving ? 'is-leaving' : ''}`}
      onPointerDown={event => event.stopPropagation()}
      onMouseDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
      onWheel={event => event.stopPropagation()}
    >
      <div className="welcome-backdrop" aria-hidden="true" />
      <div
        ref={dialog}
        className="welcome-card startup-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="startup-title"
        aria-busy={busy || !ready}
        tabIndex={-1}
        onFocus={event => {
          // acdert does not always scroll a newly focused button into view.
          if (event.target instanceof HTMLButtonElement) event.target.scrollIntoView({ block: 'nearest' });
        }}
        onKeyDown={event => {
          event.stopPropagation();
          if (event.key === 'Escape' && !disabled) {
            event.preventDefault();
            onContinue();
          }
          if (event.key !== 'Tab') return;
          const buttons = Array.from(dialog.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
          if (!buttons.length) {
            event.preventDefault();
            return;
          }
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          if (event.shiftKey && index <= 0) {
            event.preventDefault();
            buttons.at(-1)!.focus();
          } else if (!event.shiftKey && index === buttons.length - 1) {
            event.preventDefault();
            buttons[0].focus();
          }
        }}
      >
        <div className="startup-main">
          <div className="startup-brand">
            <img className="welcome-app-icon startup-app-icon" src={appIcon} alt="" aria-hidden="true" />
            <h1 id="startup-title">
              <strong>Excalidraw+</strong>
            </h1>
            <p className="startup-tagline"></p>
          </div>

          <div className="startup-file-actions" role="group" aria-label="文件操作">
            <button ref={newButton} type="button" className="startup-action-btn is-primary" disabled={disabled} onClick={onNew}>
              <span className="startup-action-icon-wrap" aria-hidden="true">
                <img className="welcome-file-icon" src={actionNewIcon} alt="" />
              </span>
              <span className="startup-action-copy">
                <strong>新建</strong>
                <span>创建空白白板</span>
              </span>
            </button>
            <button type="button" className="startup-action-btn" disabled={disabled} onClick={onOpen}>
              <span className="startup-action-icon-wrap" aria-hidden="true">
                <Icon name="folder" />
              </span>
              <span className="startup-action-copy">
                <strong>打开</strong>
                <span>打开本地 .excalidraw 文件</span>
              </span>
            </button>
          </div>
        </div>

        <aside className="startup-recent" aria-labelledby="startup-recent-heading">
          <div className="startup-recent-header">
            <div className="startup-recent-title">
              <Icon name="history" />
              <h2 id="startup-recent-heading">历史文件</h2>
            </div>
            {recentFiles.length > 0 && (
              <span className="startup-recent-count">{recentFiles.length}</span>
            )}
          </div>

          {recentFiles.length === 0 ? (
            <div className="startup-discover">
              <div className="startup-recent-empty">
                <strong>暂无历史文件</strong>
                <span>打开或保存的画布将显示在这里</span>
              </div>
              {onStartPreset && (
                <section className="startup-presets" aria-labelledby="startup-presets-heading">
                  <h3 id="startup-presets-heading">精选演示模板</h3>
                  {STARTUP_PRESETS.map(preset => (
                    <button
                      key={preset.id}
                      type="button"
                      className="startup-preset"
                      disabled={disabled}
                      title={`插入${preset.title}草图，体验草图转界面`}
                      onClick={() => onStartPreset(preset.id)}
                    >
                      <svg className={`startup-preset-preview is-${preset.id}`} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                        {preset.id === 'commerce' ? <>
                          <rect x="5" y="10" width="54" height="44" rx="4" /><path d="M18 10v44M18 20h41" />
                          <rect x="23" y="25" width="9" height="7" rx="2" /><rect x="36" y="25" width="9" height="7" rx="2" /><rect x="49" y="25" width="6" height="7" rx="2" />
                          <path d="M24 46l8-5 7 2 8-8 7 3M9 22h5M9 29h5M9 36h5" />
                        </> : preset.id === 'travel' ? <>
                          <rect x="16" y="5" width="32" height="54" rx="6" /><path d="M23 13h18M22 21h20" />
                          <rect x="22" y="27" width="20" height="16" rx="2" /><path d="M23 40l6-7 5 4 4-3 3 6M23 50h7M35 50h6" /><circle cx="36" cy="31" r="2" />
                        </> : <>
                          <rect x="16" y="5" width="32" height="54" rx="6" /><path d="M26 11h12M23 50h18" />
                          <rect x="22" y="19" width="20" height="16" rx="3" /><path d="M23 41h7M35 41h6" />
                        </>}
                      </svg>
                      <span className="startup-preset-copy"><strong>{preset.title}</strong><span>{preset.description}</span></span>
                      <Icon name="chevron" />
                    </button>
                  ))}
                </section>
              )}
            </div>
          ) : (
            <div className="startup-recent-list" role="list">
              {recentFiles.map(entry => (
                <div key={entry.id} className="startup-recent-row" role="listitem">
                  <button
                    type="button"
                    className="startup-recent-item"
                    disabled={disabled}
                    onClick={() => onOpenRecent(entry)}
                  >
                    <span className="startup-recent-badge" aria-hidden="true">
                      <Icon name="edit" />
                    </span>
                    <span className="startup-recent-meta">
                      <strong className="startup-recent-name">{stripExcalidrawExtension(entry.fileName)}</strong>
                      <span className="startup-recent-sub">
                        {formatRecentTime(entry.updatedAt)} · {entry.elementCount > 0 ? `${entry.elementCount} 个元素` : '空白画布'}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="startup-recent-remove"
                    title="从历史记录移除"
                    aria-label={`从历史记录移除 ${entry.fileName}`}
                    disabled={disabled}
                    onClick={event => {
                      event.stopPropagation();
                      void handleRemoveRecent(entry.id);
                    }}
                  >
                    <Icon name="close" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
