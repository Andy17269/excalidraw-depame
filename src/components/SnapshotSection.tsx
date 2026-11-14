import { useCallback, useEffect, useState } from 'react';
import {
  deleteWorkspaceSnapshot,
  listWorkspaceSnapshots,
  type WorkspaceSnapshotInfo,
} from '../services/excalidrawStorage';
import { Icon } from './Icon';

interface SnapshotSectionProps {
  active: boolean;
  ready: boolean;
  busy: boolean;
  onCreateSnapshot: () => Promise<WorkspaceSnapshotInfo | null>;
  onRestoreSnapshot: (path: string) => Promise<boolean>;
  onClosePanel: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTime(ms: number): string {
  const date = new Date(ms);
  const now = new Date();
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return `${hh}:${mm}:${ss}`;
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}/${day} ${hh}:${mm}`;
}

function snapshotLabel(item: WorkspaceSnapshotInfo): string {
  if (item.kind === 'autosave') return '自动保存';
  if (item.kind === 'recovery') return '自动恢复';
  return '手动快照';
}

export function SnapshotSection({
  active,
  ready,
  busy,
  onCreateSnapshot,
  onRestoreSnapshot,
  onClosePanel,
}: SnapshotSectionProps) {
  const [snapshots, setSnapshots] = useState<WorkspaceSnapshotInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'saved' | 'error'; text: string } | null>(null);

  const refreshSnapshots = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listWorkspaceSnapshots();
      setSnapshots(list.filter(item => item.kind !== 'recovery'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    setFeedback(null);
    void refreshSnapshots();
  }, [active, refreshSnapshots]);

  const handleCreate = async () => {
    if (!ready || busy || actionBusy) return;
    setActionBusy(true);
    setFeedback(null);
    try {
      const created = await onCreateSnapshot();
      if (created) {
        setFeedback({ tone: 'saved', text: '已创建快照' });
        await refreshSnapshots();
      } else {
        setFeedback({ tone: 'error', text: '当前环境不支持本地快照' });
      }
    } catch (err) {
      setFeedback({ tone: 'error', text: err instanceof Error ? err.message : '创建快照失败' });
    } finally {
      setActionBusy(false);
    }
  };

  const handleRestore = async (item: WorkspaceSnapshotInfo) => {
    if (!ready || busy || actionBusy) return;
    setActionBusy(true);
    setFeedback(null);
    try {
      const ok = await onRestoreSnapshot(item.id);
      if (ok) {
        setFeedback({ tone: 'saved', text: '已恢复快照' });
        onClosePanel();
      } else {
        setFeedback({ tone: 'error', text: '恢复快照失败' });
      }
    } catch (err) {
      setFeedback({ tone: 'error', text: err instanceof Error ? err.message : '恢复快照失败' });
    } finally {
      setActionBusy(false);
    }
  };

  const handleDelete = async (item: WorkspaceSnapshotInfo) => {
    if (actionBusy || item.kind === 'autosave') return;
    setActionBusy(true);
    setFeedback(null);
    try {
      const ok = await deleteWorkspaceSnapshot(item.id);
      if (ok) {
        setSnapshots(prev => prev.filter(s => s.id !== item.id));
      }
    } catch (err) {
      setFeedback({ tone: 'error', text: err instanceof Error ? err.message : '删除快照失败' });
    } finally {
      setActionBusy(false);
    }
  };

  const disabled = loading || actionBusy;

  return (
    <div className="mcp-section system-section">
      <div className="mcp-card">
        <div className="mcp-toolbar">
          <div className="mcp-card-info">
            <Icon name="history" />
            <span className="mcp-card-name">画布快照</span>
            <span className="mcp-pill">{snapshots.length}</span>
          </div>
          <div className="mcp-toolbar-actions">
            <button
              type="button"
              className="menu-btn-secondary mcp-compact-btn"
              disabled={!ready || busy || disabled}
              onClick={() => void handleCreate()}
            >
              <Icon name="plus" />
              <span>新建快照</span>
            </button>
          </div>
        </div>

        {snapshots.length > 0 ? (
          <div className="system-snapshot-list">
            {snapshots.map(item => {
              const title = `${snapshotLabel(item)} · ${formatTime(item.modifiedMs)}`;
              return (
                <div key={item.id} className="system-snapshot-row">
                  <div className="system-snapshot-info">
                    <div className="system-snapshot-head">
                      <span className={`mcp-pill ${item.kind === 'autosave' ? 'is-accent' : ''}`}>
                        {snapshotLabel(item)}
                      </span>
                      <span className="system-snapshot-time">{formatTime(item.modifiedMs)}</span>
                      <span className="menu-badge">{formatBytes(item.size)}</span>
                    </div>
                  </div>
                  <div className="mcp-card-btns">
                    <button
                      type="button"
                      className="menu-btn-secondary mcp-compact-btn"
                      aria-label={`恢复 ${title}`}
                      disabled={!ready || busy || disabled}
                      onClick={() => void handleRestore(item)}
                    >
                      恢复
                    </button>
                    {item.kind !== 'autosave' && (
                      <button
                        type="button"
                        className="mcp-icon-action is-danger"
                        title={`删除 ${title}`}
                        aria-label={`删除 ${title}`}
                        disabled={disabled}
                        onClick={() => void handleDelete(item)}
                      >
                        <Icon name="trash" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mcp-empty">
            暂无快照，点击「新建快照」即可保存当前画布
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
