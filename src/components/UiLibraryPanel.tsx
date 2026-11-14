import { memo, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  TEMPLATE_PLATFORMS,
  queryUiTemplates,
  type TemplatePlatform,
} from '../services/uiTemplates';
import { Icon } from './Icon';
import { SpringRail } from './SpringRail';
import { TemplateThumbnail } from './TemplateThumbnail';

interface UiLibraryPanelProps {
  open: boolean;
  ready: boolean;
  busy: boolean;
  panelRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onInsert: (templateId: string) => Promise<boolean>;
}

const PLATFORM_TABS: ReadonlyArray<{ id: 'all' | TemplatePlatform; label: string }> = [
  { id: 'all', label: '全部' },
  ...TEMPLATE_PLATFORMS,
];

export const UiLibraryPanel = memo(function UiLibraryPanel({
  open,
  ready,
  busy,
  panelRef,
  onClose,
  onInsert,
}: UiLibraryPanelProps) {
  const [platform, setPlatform] = useState<'all' | TemplatePlatform>('mobile-app');
  const [query, setQuery] = useState('');
  const [insertingId, setInsertingId] = useState<string | null>(null);
  const [insertedId, setInsertedId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const feedbackTimerRef = useRef(0);

  useEffect(() => () => window.clearTimeout(feedbackTimerRef.current), []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      searchRef.current?.focus({ preventScroll: true });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [open]);

  const items = useMemo(() => {
    const effectivePlatform = query.trim() ? 'all' : platform;
    return queryUiTemplates({
      platform: effectivePlatform,
      query,
    });
  }, [platform, query]);

  const handleInsert = async (templateId: string) => {
    if (!ready || busy || insertingId) return;
    setInsertingId(templateId);
    try {
      const ok = await onInsert(templateId);
      if (ok) {
        setInsertedId(templateId);
        window.clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = window.setTimeout(() => setInsertedId(null), 1400);
      }
    } finally {
      setInsertingId(null);
    }
  };

  return (
    <aside
      ref={panelRef}
      className={`library-panel glass ${open ? 'is-open' : ''}`}
      role="dialog"
      aria-label="界面素材库"
      aria-hidden={!open}
      inert={!open}
      onWheel={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
    >
      <div className="library-header">
        <div className="library-title-group">
          <Icon name="library" />
          <span className="library-title">界面素材库</span>
        </div>
        <button
          type="button"
          className="menu-close"
          aria-label="关闭素材库"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>

      <div className="library-search">
        <Icon name="search" />
        <input
          ref={searchRef}
          type="text"
          value={query}
          placeholder="搜索模板（登录 / 仪表盘 / H5...）"
          aria-label="搜索 界面模板"
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => {
            if (event.key !== 'Escape') event.stopPropagation();
          }}
        />
        {query && (
          <button
            type="button"
            className="library-search-clear"
            aria-label="清空搜索"
            onClick={() => {
              setQuery('');
              searchRef.current?.focus();
            }}
          >
            <Icon name="close" />
          </button>
        )}
      </div>

      <SpringRail
        items={PLATFORM_TABS}
        activeId={query.trim() ? null : platform}
        onSelect={next => {
          setPlatform(next);
          if (query.trim()) setQuery('');
        }}
        ariaLabel="适用平台"
        role="tablist"
        itemRole="tab"
        ariaSelectionAttr="aria-selected"
        className="library-tabs"
        visible={open}
      />

      <div className="library-grid-scroll">
        {items.length > 0 ? (
          <div className="library-grid" key={platform}>
            {items.map(template => {
              const isInserted = insertedId === template.id;
              const isInserting = insertingId === template.id;
              return (
                <button
                  key={template.id}
                  type="button"
                  className={`library-card ${isInserted ? 'is-inserted' : ''}`}
                  title={`${template.name} · ${template.description}`}
                  disabled={!ready || busy || Boolean(insertingId)}
                  onClick={() => void handleInsert(template.id)}
                >
                  <div className="library-thumb">
                    <TemplateThumbnail template={template} />
                    <span className="library-card-badge">
                      {isInserting ? '插入中...' : isInserted ? '已插入' : '+ 插入'}
                    </span>
                  </div>
                  <span className="library-card-name">{template.name}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="library-empty">
            <span>未找到匹配的 界面模板</span>
            <button
              type="button"
              className="menu-btn-secondary"
              onClick={() => {
                setQuery('');
                setPlatform('all');
              }}
            >
              重置筛选
            </button>
          </div>
        )}
      </div>
    </aside>
  );
});
