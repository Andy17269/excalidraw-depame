import type { RefObject } from 'react';
import type { WorkspaceSnapshotInfo } from '../services/excalidrawStorage';
import { Icon } from './Icon';
import { SnapshotSection } from './SnapshotSection';

interface SnapshotModalProps {
  open: boolean;
  onClose: () => void;
  panelRef: RefObject<HTMLElement | null>;
  documentReady: boolean;
  documentBusy: boolean;
  onCreateSnapshot: () => Promise<WorkspaceSnapshotInfo | null>;
  onRestoreSnapshot: (path: string) => Promise<boolean>;
}

export function SnapshotModal({
  open,
  onClose,
  panelRef,
  documentReady,
  documentBusy,
  onCreateSnapshot,
  onRestoreSnapshot,
}: SnapshotModalProps) {
  return (
    <div
      className={`menu-overlay ${open ? 'is-open' : ''}`}
      aria-hidden={!open}
      inert={!open}
      onWheel={event => event.stopPropagation()}
      onPointerDown={event => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={panelRef}
        className="menu-panel glass snapshot-modal"
        role="dialog"
        aria-modal="true"
        aria-label="快照"
        onPointerDown={event => event.stopPropagation()}
      >
        <div className="menu-panel-header">
          <div className="mcp-card-info">
            <Icon name="history" />
            <span className="mcp-card-name">快照</span>
          </div>
          <button
            type="button"
            className="menu-close"
            title="关闭"
            aria-label="关闭快照"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>

        <SnapshotSection
          active={open}
          ready={documentReady}
          busy={documentBusy}
          onCreateSnapshot={onCreateSnapshot}
          onRestoreSnapshot={onRestoreSnapshot}
          onClosePanel={onClose}
        />
      </section>
    </div>
  );
}
