import { useEffect, useId, useRef } from 'react';

interface UnsavedConfirmDialogProps {
  open: boolean;
  action: 'new' | 'open' | null;
  fileName: string;
  busy: boolean;
  onCancel: () => void;
  onDiscard: () => void;
  onSaveAndContinue: () => void;
}

export function UnsavedConfirmDialog({
  open,
  action,
  fileName,
  busy,
  onCancel,
  onDiscard,
  onSaveAndContinue,
}: UnsavedConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
      dialog.returnValue = '';
    }
  }, [open]);

  const actionLabel = action === 'open' ? '打开其他文件' : '新建画布';

  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog glass"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onCancel={event => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      onClose={() => {
        if (dialogRef.current) dialogRef.current.returnValue = '';
      }}
      onPointerDown={event => event.stopPropagation()}
      onWheel={event => event.stopPropagation()}
    >
      <div className="confirm-dialog-body">
        <h2 id={titleId} className="confirm-dialog-title">当前文件未保存</h2>
        <p id={descId} className="confirm-dialog-desc">
          “{fileName}”有未保存的更改。{actionLabel}前是否先保存？
        </p>
      </div>
      <div className="confirm-dialog-actions">
        <button
          type="button"
          className="menu-btn-ghost"
          autoFocus
          disabled={busy}
          onClick={onCancel}
        >
          取消
        </button>
        <div className="confirm-dialog-actions-right">
          <button
            type="button"
            className="menu-btn-secondary confirm-dialog-discard"
            disabled={busy}
            onClick={onDiscard}
          >
            不保存
          </button>
          <button
            type="button"
            className="menu-btn-primary"
            disabled={busy}
            onClick={onSaveAndContinue}
          >
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </dialog>
  );
}
