import { type CSSProperties, memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Excalidraw, MainMenu, getCommonBounds } from '@excalidraw/excalidraw';
import type { AppState, ExcalidrawImperativeAPI, ExcalidrawProps } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { bindCanvas, cancelCanvasAnimation, canvasTools, generateMermaidWithTools, getCanvasRevision } from './services/canvasBridge';
import { isCanvasAnimationActive, subscribeAiCursor } from './services/canvasAnimator';
import { attachTrackpad } from './services/trackpad';
import { attachImageImport, pickAndImportFiles } from './services/imageImport';
import { attachFontLoading } from './services/fonts';
import { attachExcalidrawDomPatcher, attachUndoShortcut, getUndoShortcutLabel, triggerCanvasUndo } from './services/undoShortcut';
import { exitAcdeApp, getAcdeCapabilities, requestAttentionIfBackground } from './services/acdeKernel';
import { useCanvasDocument } from './useCanvasDocument';
import { Properties } from './components/Properties';
import { MenuPanel } from './components/MenuPanel';
import { SnapshotModal } from './components/SnapshotModal';
import { AboutModal } from './components/AboutModal';
import { UiLibraryPanel } from './components/UiLibraryPanel';
import { Icon } from './components/Icon';
import { SpringRail } from './components/SpringRail';
import { useDockPopover } from './components/useDockPopover';
import { AiCursor } from './components/AiCursor';
import { Welcome } from './components/Welcome';
import { Startup } from './components/Startup';
import { OnboardingTour } from './components/OnboardingTour';
import { UnsavedConfirmDialog } from './components/UnsavedConfirmDialog';
import presetsIcon from './assets/presets-icon.png';
import { useVoiceInput } from './useVoiceInput';
import { applyCanvasPlan, generateCanvasPlan } from './services/canvasPlan';
import { clampZoom, needsCanvasContext, zoomAtPoint } from './services/sceneMath';
import { generateUiFromSketch } from './services/aiVision';
import { insertShowcaseSketch as insertDemoSketch } from './services/showcaseScenes';
import { SHOWCASE_EXAMPLES } from './services/showcaseCatalog';
import { STARTUP_PRESETS, type StartupPresetId } from './services/startupPresets';
import { getDemoMode, saveDemoMode } from './services/demoMode';
import { insertUiTemplate } from './services/uiTemplateInsert';
import { fetchAiSettings, subscribeAiSettings, type WebSearchMode } from './services/aiSettings';
import { fetchMcpSnapshot, subscribeLocalMcpEnabled } from './services/mcpSettings';
import { OFFLINE_AI_MESSAGE, useInternetStatus } from './services/networkStatus';
import { stripExcalidrawExtension } from './services/excalidrawStorage';
import { applyResolvedTheme, getResolvedTheme, subscribeTheme, type ResolvedTheme } from './services/theme';
import {
  hasCompletedOnboarding,
  hasCompletedTour,
  loadOnboardingCompleted,
  markOnboardingCompleted,
  markTourCompleted,
  resetOnboarding,
} from './services/onboarding';
import type { RecentFileEntry } from './services/recentFiles';
import './App.css';
import './motion.css';

const ENTRY_DURATION_MS = 850;

const TOOLS = [
  ['selection', '选择'], ['rectangle', '矩形'], ['diamond', '菱形'],
  ['arrow', '箭头'], ['freedraw', '画笔'], ['text', '文字'], ['eraser', '橡皮'],
] as const;
const PRESETS = [['流程', '登录流程'], ['架构', '系统架构'], ['导图', '思维导图']] as const;
const QUICK_PROMPTS = [
  ...SHOWCASE_EXAMPLES.map(example => ({ label: example.title, kind: 'sketch' as const, showcaseId: example.id, prompt: '' })),
  { label: '电商微服务架构', kind: 'diagram' as const, prompt: '电商微服务架构图，包含网关、用户、订单、支付、库存与消息队列' },
];
type AiToolMode = 'auto' | 'diagram' | 'compose' | 'vision-ui';

const TOOL_LABELS: Record<string, string> = {
  deepseek_web_search: '联网搜索',
  deepseek_read_url: '网页读取',
  get_ui_assets: '获取 UI 素材',
  // Filesystem MCP
  read_file: '读取文件',
  read_text_file: '读取文本文件',
  read_media_file: '读取媒体文件',
  read_multiple_files: '批量读取文件',
  write_file: '写入文件',
  append_file: '追加文件内容',
  edit_file: '编辑文件',
  create_directory: '创建目录',
  list_directory: '列出目录',
  list_directory_with_sizes: '列出目录及大小',
  directory_tree: '获取目录树',
  move_file: '移动文件',
  copy_file: '复制文件',
  search_files: '搜索文件',
  get_file_info: '获取文件信息',
  list_allowed_directories: '查看允许目录',
  // Memory MCP
  create_entities: '写入记忆实体',
  create_relations: '建立记忆关系',
  add_observations: '补充记忆观测',
  delete_entities: '删除记忆实体',
  delete_observations: '删除记忆观测',
  delete_relations: '删除记忆关系',
  read_graph: '读取记忆图谱',
  search_nodes: '检索记忆节点',
  open_nodes: '打开记忆节点',
  // 其他常见 MCP 工具
  fetch: '抓取网页',
  draw_diagram: '绘制图表',
  read_canvas: '读取画布',
};

function resolveToolLabel(name: string): string {
  if (TOOL_LABELS[name]) return TOOL_LABELS[name]!;
  const stripped = name.replace(/^mcp_\d+_/, '');
  return TOOL_LABELS[stripped] ?? stripped;
}

function formatUsedToolsLabel(usedTools: readonly string[], webSearchActive: boolean): string | null {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const name of usedTools) {
    const label = resolveToolLabel(name);
    if (label && !seen.has(label)) {
      seen.add(label);
      labels.push(label);
    }
  }
  if (labels.length > 0) return `已调用工具：${labels.join('、')}`;
  if (webSearchActive) return '已启用联网搜索完成图表生成';
  return null;
}
const AI_TOOLS: ReadonlyArray<{ id: AiToolMode; label: string; tip: string; placeholder: string }> = [
  { id: 'auto', label: '自动', tip: '自动识别：生成新图表或结合画布规划', placeholder: '描述图表...' },
  { id: 'diagram', label: '图表', tip: '生成流程图、架构图或思维导图', placeholder: '输入流程图、架构图或导图描述...' },
  { id: 'compose', label: '编辑', tip: '读取当前画布内容进行追加或修改', placeholder: '描述对当前画布的修改或追加...' },
  { id: 'vision-ui', label: 'UI草图', tip: '识别画布草图并填充素材生成高保真 UI', placeholder: '补充 UI 风格或要求（可直接生成）...' },
];
const UI_OPTIONS = { canvasActions: { changeViewBackgroundColor: false, clearCanvas: false, export: false, loadScene: false, saveToActiveFile: false, toggleTheme: false, saveAsImage: false }, tools: { image: false } } as const;
const MAIN_MENU = <MainMenu />;
const renderNothing = () => null;

declare global { interface Window { canvasBridge?: typeof canvasTools } }

const MemoExcalidraw = memo(function MemoExcalidraw({
  onApi,
  onChange,
  theme,
  viewModeEnabled,
  handleKeyboardGlobally,
}: {
  onApi: (api: ExcalidrawImperativeAPI) => void;
  onChange: NonNullable<ExcalidrawProps['onChange']>;
  theme: ResolvedTheme;
  viewModeEnabled: boolean;
  handleKeyboardGlobally: boolean;
}) {
  return (
    <Excalidraw
      excalidrawAPI={onApi}
      onChange={onChange}
      UIOptions={UI_OPTIONS}
      isCollaborating={false}
      langCode="zh-CN"
      aiEnabled={false}
      theme={theme}
      zenModeEnabled={false}
      viewModeEnabled={viewModeEnabled}
      handleKeyboardGlobally={handleKeyboardGlobally}
      renderTopRightUI={renderNothing}
    >
      {MAIN_MENU}
    </Excalidraw>
  );
});

const ToolButtons = memo(function ToolButtons({
  api,
  ready,
  subscribe,
  getActiveTool,
}: {
  api: ExcalidrawImperativeAPI | null;
  ready: boolean;
  subscribe: (listener: () => void) => () => void;
  getActiveTool: () => string;
}) {
  const [, forceUpdate] = useReducer(count => count + 1, 0);
  useEffect(() => subscribe(forceUpdate), [subscribe]);
  const activeTool = getActiveTool();
  const [visibleCount, setVisibleCount] = useState<number>(TOOLS.length);
  const { open, setOpen, containerRef, triggerRef, panelRef, host, placement } = useDockPopover(true);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => {
      // Every slot is a 40px button with a 3px gap. Reserve the last slot for More.
      const slots = Math.floor((container.clientWidth + 3) / 43);
      const count = slots >= TOOLS.length ? TOOLS.length : Math.max(1, slots - 1);
      setVisibleCount(count);
      setOpen(false);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, setOpen]);
  const overflowTools = TOOLS.slice(visibleCount);
  return (
    <div ref={containerRef} className="tools" role="toolbar" aria-label="工具">
      {TOOLS.slice(0, visibleCount).map(([type, title]) => (
        <button
          key={type}
          type="button"
          className={`icon-button ${activeTool === type ? 'active' : ''}`}
          title={title}
          aria-label={title}
          aria-pressed={activeTool === type}
          disabled={!ready}
          onClick={() => api?.setActiveTool({ type })}
        >
          <Icon name={type} />
        </button>
      ))}
      {overflowTools.length > 0 && <>
        <button
          ref={triggerRef}
          type="button"
          className={`icon-button tools-more ${open || overflowTools.some(([type]) => type === activeTool) ? 'active' : ''}`}
          title="更多工具"
          aria-label="更多工具"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls="dock-more-tools"
          disabled={!ready}
          onClick={() => setOpen(value => !value)}
          onKeyDown={event => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setOpen(true);
            }
          }}
        ><Icon name="more" /></button>
        {open && host && placement && createPortal(<div ref={panelRef} id="dock-more-tools" className="tools-menu glass" style={{ left: placement.left, bottom: placement.bottom }} role="menu" aria-label="更多工具">
          {overflowTools.map(([type, title]) => <button
            key={type}
            type="button"
            role="menuitemradio"
            aria-checked={activeTool === type}
            className={activeTool === type ? 'active' : ''}
            disabled={!ready}
            onClick={() => {
              api?.setActiveTool({ type });
              setOpen(false);
              triggerRef.current?.focus({ preventScroll: true });
            }}
          ><Icon name={type} /><span>{title}</span>{activeTool === type && <Icon name="check" />}</button>)}
        </div>, host)}
      </>}
    </div>
  );
});

const ZoomControls = memo(function ZoomControls({
  api,
  ready,
  subscribe,
  getZoom,
  subscribeTool,
  getActiveTool,
}: {
  api: ExcalidrawImperativeAPI | null;
  ready: boolean;
  subscribe: (listener: () => void) => () => void;
  getZoom: () => number;
  subscribeTool: (listener: () => void) => () => void;
  getActiveTool: () => string;
}) {
  const [, forceUpdate] = useReducer(count => count + 1, 0);
  useEffect(() => subscribe(forceUpdate), [subscribe]);
  useEffect(() => subscribeTool(forceUpdate), [subscribeTool]);
  const zoom = getZoom();
  const percent = Math.round(zoom * 100);
  const handActive = getActiveTool() === 'hand';
  const { open, setOpen, containerRef, triggerRef, panelRef, host, placement } = useDockPopover();
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 1280px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1280px)');
    const update = () => { setCompact(media.matches); setOpen(false); };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [setOpen]);
  const setZoom = (targetZoom: number) => {
    if (!api) return;
    cancelCanvasAnimation();
    const state = api.getAppState();
    const next = zoomAtPoint(
      { zoom: state.zoom.value, scrollX: state.scrollX, scrollY: state.scrollY },
      clampZoom(targetZoom),
      { x: state.width / 2, y: state.height / 2 },
    );
    api.updateScene({
      appState: {
        zoom: { value: next.zoom as typeof state.zoom.value },
        scrollX: next.scrollX,
        scrollY: next.scrollY,
        shouldCacheIgnoreZoom: false,
      },
      captureUpdate: 'NEVER',
    });
  };
  const actions = (
      <div ref={panelRef} id="dock-zoom-controls" className={`zoom-actions ${compact ? 'is-popover glass' : ''}`} style={compact && placement ? { right: placement.right, bottom: placement.bottom } : undefined} role="group" aria-label="缩放与拖动控件">
      <button
        type="button"
        className="zoom-step"
        title="缩小"
        aria-label="缩小"
        disabled={!ready || percent <= 10}
        onClick={() => setZoom((Math.ceil(zoom * 10 - 1e-6) - 1) / 10)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M5 12h14" />
        </svg>
      </button>
      <button
        type="button"
        className="zoom-reset"
        title="重置缩放"
        aria-label="重置缩放"
        disabled={!ready}
        onClick={() => setZoom(1)}
      >
        {percent}%
      </button>
      <button
        type="button"
        className="zoom-step"
        title="放大"
        aria-label="放大"
        disabled={!ready || percent >= 3000}
        onClick={() => setZoom((Math.floor(zoom * 10 + 1e-6) + 1) / 10)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <span className="divider zoom-divider" />
      <button
        type="button"
        className={`zoom-step zoom-hand ${handActive ? 'active' : ''}`}
        title={handActive ? '退出抓手拖动（切回选择）' : '抓手工具（拖动画布）'}
        aria-label="抓手工具"
        aria-pressed={handActive}
        disabled={!ready}
        onClick={() => api?.setActiveTool({ type: handActive ? 'selection' : 'hand' })}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 11V6a2 2 0 0 0-4 0v5" />
          <path d="M14 10V4a2 2 0 0 0-4 0v6" />
          <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
          <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
        </svg>
      </button>
      </div>
  );
  return (
    <div
      ref={containerRef}
      className="zoom-capsule"
      role="group"
      aria-label="缩放"
      onWheel={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
    >
      {compact && <button
        ref={triggerRef}
        type="button"
        className={`icon-button zoom-trigger ${open || handActive ? 'active' : ''}`}
        title={`缩放与拖动（${percent}%）`}
        aria-label="缩放与拖动"
        aria-expanded={open}
        aria-controls="dock-zoom-controls"
        disabled={!ready}
        onClick={() => setOpen(value => !value)}
      ><Icon name="search" /></button>}
      {compact ? open && host && createPortal(actions, host) : actions}
    </div>
  );
});

function buildInspectorSignature(elements: readonly ExcalidrawElement[], state: AppState): string {
  let hasSelected = false;
  for (const id in state.selectedElementIds) {
    if (state.selectedElementIds[id]) { hasSelected = true; break; }
  }
  const base = `${state.activeTool.type}|${state.currentItemFontSize}|${state.currentItemOpacity}|${state.currentItemStrokeColor}|${state.currentItemBackgroundColor}|${state.currentItemStrokeWidth}`;
  if (!hasSelected) return base;
  const selectedParts: string[] = [];
  for (let i = 0; i < elements.length; i++) {
    const element = elements[i]!;
    if (!state.selectedElementIds[element.id]) continue;
    const fontSize = 'fontSize' in element ? element.fontSize : '';
    selectedParts.push(`${element.id}:${element.opacity}:${element.strokeColor}:${element.backgroundColor}:${element.strokeWidth}:${element.width}:${element.height}:${fontSize}`);
  }
  return `${base}|${selectedParts.join(';')}`;
}

export default function App() {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [prompt, setPrompt] = useState('');
  const [generation, setGeneration] = useState<'idle' | 'pending' | 'error'>('idle');
  const [aiError, setAiError] = useState<string | null>(null);
  const internet = useInternetStatus();
  const isOffline = !internet.online;
  const [offlineToastDismissed, setOfflineToastDismissed] = useState(false);
  const [visionRunning, setVisionRunning] = useState(false);
  const [visionPickMode, setVisionPickMode] = useState(false);
  const [selectedInfo, setSelectedInfo] = useState<{ count: number; width: number; height: number; badgeLeft: number | null; badgeTop: number | null }>({ count: 0, width: 0, height: 0, badgeLeft: null, badgeTop: null });
  const [aiAnimating, setAiAnimating] = useState(false);
  const [hasElements, setHasElements] = useState(false);
  const [hasLocalShowcase, setHasLocalShowcase] = useState(false);
  const [entryKind, setEntryKind] = useState<'welcome' | 'startup'>(() => (hasCompletedOnboarding() ? 'startup' : 'welcome'));
  const [welcome, setWelcome] = useState<'open' | 'leaving' | 'closed'>('open');
  const startupPresetRef = useRef<StartupPresetId | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const shouldStartTourRef = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [fileInfoOpen, setFileInfoOpen] = useState(false);
  const [fileNameDraft, setFileNameDraft] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [demoMode, setDemoMode] = useState(getDemoMode);
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const snapshotPanelRef = useRef<HTMLElement>(null);
  const aboutPanelRef = useRef<HTMLElement>(null);
  const openSecondaryModal = (target: 'settings' | 'snapshots' | 'about') => {
    setMenuOpen(false);
    setFileInfoOpen(false);
    setPresetsOpen(false);
    setLibraryOpen(false);
    setInputFocused(false);
    setVisionPickMode(false);
    setSettingsOpen(target === 'settings');
    setSnapshotsOpen(target === 'snapshots');
    setAboutOpen(target === 'about');
  };
  const [exiting, setExiting] = useState(false);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => getResolvedTheme());
  const [undoShortcutLabel, setUndoShortcutLabel] = useState(() => getUndoShortcutLabel());
  const undoShortcutLabelRef = useRef(undoShortcutLabel);
  undoShortcutLabelRef.current = undoShortcutLabel;
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [toolMode, setToolMode] = useState<AiToolMode>('auto');
  const [backendWebSearch, setBackendWebSearch] = useState<WebSearchMode>('off');
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [aiToolToast, setAiToolToast] = useState<string | null>(null);
  const [pendingToolHint, setPendingToolHint] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [pendingFileAction, setPendingFileAction] = useState<'new' | 'open' | null>(null);
  const requestFileActionRef = useRef<(action: 'new' | 'open') => void>(() => {});
  const host = useRef<HTMLDivElement>(null);
  const canvasLayer = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuDropdownRef = useRef<HTMLDivElement>(null);
  const fileNameTriggerRef = useRef<HTMLButtonElement>(null);
  const fileInfoPopoverRef = useRef<HTMLDivElement>(null);
  const fileNameInputRef = useRef<HTMLInputElement>(null);
  const menuPanelRef = useRef<HTMLElement>(null);
  const libraryTriggerRef = useRef<HTMLButtonElement>(null);
  const libraryPanelRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [presetsRight, setPresetsRight] = useState(0);
  const [pickerLeft, setPickerLeft] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const generationId = useRef(0);
  const hasElementsRef = useRef(false);
  const activeToolRef = useRef('selection');
  const toolListenersRef = useRef(new Set<() => void>());
  const zoomRef = useRef(1);
  const zoomListenersRef = useRef(new Set<() => void>());
  const inspectorSignatureRef = useRef('');
  const inspectorListenersRef = useRef(new Set<() => void>());
  const latestSceneRef = useRef<{ elements: readonly ExcalidrawElement[]; state: AppState } | null>(null);
  const syncRafRef = useRef(0);
  const onImportFilesRef = useRef<() => void>(() => {});
  const document = useCanvasDocument(api, welcome === 'closed', {
    onOpenSettings: () => openSecondaryModal('settings'),
    onRequestNew: () => requestFileActionRef.current('new'),
    onRequestOpen: () => requestFileActionRef.current('open'),
    onImportFiles: () => onImportFilesRef.current(),
  });
  const openFileRef = useRef(document.openFile);
  openFileRef.current = document.openFile;
  onImportFilesRef.current = () => {
    if (!api || !document.ready || document.busy) return;
    setMenuOpen(false);
    setFileInfoOpen(false);
    void pickAndImportFiles(api, {
      onOpenExcalidraw: async (file) => { await document.openFile(file); },
      onError: document.reportError,
    });
  };
  const keyboardGloballyEnabled = welcome === 'closed' && !menuOpen && !fileInfoOpen && !settingsOpen && !snapshotsOpen && !aboutOpen && !libraryOpen && !pendingFileAction;
  const keyboardEnabledRef = useRef(false);
  keyboardEnabledRef.current = document.ready && keyboardGloballyEnabled;
  const voice = useVoiceInput(
    text => { setPrompt(text); void generate(text); },
    () => setAiError('语音输入失败，请检查麦克风权限或网络后重试'),
    welcome !== 'closed' || generation === 'pending' || document.busy || !document.ready || isOffline,
  );
  const voiceCancelRef = useRef(voice.cancel);
  voiceCancelRef.current = voice.cancel;

  const subscribeTool = useCallback((listener: () => void) => {
    toolListenersRef.current.add(listener);
    return () => { toolListenersRef.current.delete(listener); };
  }, []);
  const getActiveTool = useCallback(() => activeToolRef.current, []);
  const subscribeZoom = useCallback((listener: () => void) => {
    zoomListenersRef.current.add(listener);
    return () => { zoomListenersRef.current.delete(listener); };
  }, []);
  const getZoom = useCallback(() => zoomRef.current, []);
  const subscribeInspector = useCallback((listener: () => void) => {
    inspectorListenersRef.current.add(listener);
    return () => { inspectorListenersRef.current.delete(listener); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadOnboardingCompleted().then(completed => {
      if (!cancelled && completed) setEntryKind('startup');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (welcome !== 'leaving') return;
    if (entryKind === 'welcome') void markOnboardingCompleted();
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finish = () => setWelcome('closed');
    const onMotionChange = () => { if (motion.matches) finish(); };
    const timer = window.setTimeout(finish, motion.matches ? 0 : ENTRY_DURATION_MS);
    motion.addEventListener('change', onMotionChange);
    return () => {
      clearTimeout(timer);
      motion.removeEventListener('change', onMotionChange);
    };
  }, [welcome, entryKind]);
  useEffect(() => {
    if (welcome !== 'closed') return;
    if (shouldStartTourRef.current) {
      shouldStartTourRef.current = false;
      setTourOpen(true);
      return;
    }
    host.current?.querySelector<HTMLElement>('.excalidraw')?.focus({ preventScroll: true });
  }, [welcome]);
  useEffect(() => {
    const updateTheme = () => {
      const next = getResolvedTheme();
      applyResolvedTheme(next);
      setResolvedTheme(next);
    };
    const unsubscribe = subscribeTheme(updateTheme);
    updateTheme();
    return unsubscribe;
  }, []);
  useEffect(() => {
    let cancelled = false;
    void getAcdeCapabilities().then(caps => {
      if (!cancelled && caps?.platform) {
        setUndoShortcutLabel(getUndoShortcutLabel(undefined, undefined, caps.platform));
      }
    });
    const controller = new AbortController();
    const unsubAiSettings = subscribeAiSettings(settings => {
      setBackendWebSearch(settings.webSearch);
      if (settings.webSearch === 'off') setWebSearchEnabled(false);
    });
    void fetchAiSettings(controller.signal).catch(() => {});
    void fetchMcpSnapshot(controller.signal).catch(() => {});
    return () => {
      cancelled = true;
      unsubAiSettings();
      controller.abort();
    };
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuDropdownRef.current?.contains(target) && !menuTriggerRef.current?.contains(target)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setMenuOpen(false);
        menuTriggerRef.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [menuOpen]);
  useEffect(() => {
    if (!fileInfoOpen) return;
    setFileNameDraft(stripExcalidrawExtension(document.fileName));
    const focusTimer = window.setTimeout(() => {
      fileNameInputRef.current?.focus({ preventScroll: true });
      fileNameInputRef.current?.select();
    }, 30);
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!fileInfoPopoverRef.current?.contains(target) && !fileNameTriggerRef.current?.contains(target)) {
        setFileInfoOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setFileInfoOpen(false);
        fileNameTriggerRef.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [fileInfoOpen, document.fileName]);
  useEffect(() => {
    if (!settingsOpen && !snapshotsOpen && !aboutOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setSettingsOpen(false);
        setSnapshotsOpen(false);
        setAboutOpen(false);
        menuTriggerRef.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [settingsOpen, snapshotsOpen, aboutOpen]);
  useEffect(() => {
    if (!libraryOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!libraryPanelRef.current?.contains(target) && !libraryTriggerRef.current?.contains(target)) {
        setLibraryOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setLibraryOpen(false);
        libraryTriggerRef.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [libraryOpen]);

  useEffect(() => {
    if (!api || !host.current || !canvasLayer.current || !document.ready) return;
    bindCanvas(api, host.current);
    const unsubLocalMcp = subscribeLocalMcpEnabled(enabled => {
      if (enabled) window.canvasBridge = canvasTools;
      else delete window.canvasBridge;
    });
    const initialState = api.getAppState();
    const initialElements = api.getSceneElements();
    setHasLocalShowcase(initialElements.some(el => !el.isDeleted && (el.customData?.showcase as { role?: string } | undefined)?.role === 'frame'));
    activeToolRef.current = initialState.activeTool.type;
    zoomRef.current = initialState.zoom.value;
    inspectorSignatureRef.current = buildInspectorSignature(initialElements, initialState);
    let anyVisible = false;
    for (let i = 0; i < initialElements.length; i++) {
      if (!initialElements[i]!.isDeleted) { anyVisible = true; break; }
    }
    if (hasElementsRef.current !== anyVisible) {
      hasElementsRef.current = anyVisible;
      setHasElements(anyVisible);
    }
    for (const listener of toolListenersRef.current) listener();
    for (const listener of zoomListenersRef.current) listener();
    for (const listener of inspectorListenersRef.current) listener();
    const detachTrackpad = attachTrackpad(canvasLayer.current, api, host.current);
    const detachImages = attachImageImport(host.current, api, document.reportError, async (file) => { await openFileRef.current(file); });
    const detachFonts = attachFontLoading(host.current);
    const detachUndo = attachUndoShortcut(() => keyboardEnabledRef.current, window.document, () => api);
    const detachDomPatcher = attachExcalidrawDomPatcher(canvasLayer.current, () => undoShortcutLabelRef.current === '⌘Z');
    return () => { unsubLocalMcp(); bindCanvas(null); delete window.canvasBridge; detachTrackpad(); detachImages(); detachFonts(); detachUndo(); detachDomPatcher(); };
  }, [api, document.ready, document.reportError]);
  useEffect(() => {
    if (!aiToolToast) return;
    const timer = window.setTimeout(() => setAiToolToast(null), 4500);
    return () => clearTimeout(timer);
  }, [aiToolToast]);
  useEffect(() => () => { abort.current?.abort(); cancelAnimationFrame(syncRafRef.current); }, []);
  useEffect(() => subscribeAiCursor(cursor => setAiAnimating(prev => prev === cursor.visible ? prev : cursor.visible)), []);
  const aiBusy = generation === 'pending' || aiAnimating;
  const pendingButton = generation === 'pending';
  const toolPickerItems = useMemo(() => AI_TOOLS.map(item => ({
    id: item.id,
    label: item.label,
    icon: <Icon name={item.id} />,
    title: item.tip,
    disabled: item.id === 'vision-ui' && !hasElements,
  })), [hasElements]);
  const pickerOpen = inputFocused && !presetsOpen && !isOffline && generation !== 'pending' && welcome === 'closed';
  const activeToolMeta = AI_TOOLS.find(item => item.id === toolMode) ?? AI_TOOLS[0];
  useEffect(() => {
    if (!presetsOpen && !pickerOpen) return;
    const syncOffset = () => {
      if (!shellRef.current) return;
      const shell = shellRef.current.getBoundingClientRect();
      if (triggerRef.current) {
        const trigger = triggerRef.current.getBoundingClientRect();
        setPresetsRight(Math.max(0, Math.round(shell.right - trigger.right)));
      }
      if (formRef.current) {
        const form = formRef.current.getBoundingClientRect();
        setPickerLeft(Math.max(0, Math.round(form.left - shell.left)));
      }
    };
    syncOffset();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (presetsOpen && shellRef.current && !shellRef.current.contains(target)) setPresetsOpen(false);
      if (pickerOpen && !formRef.current?.contains(target) && !pickerRef.current?.contains(target)) setInputFocused(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPresetsOpen(false);
        setInputFocused(false);
      }
    };
    window.addEventListener('resize', syncOffset);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => { window.removeEventListener('resize', syncOffset); window.removeEventListener('pointerdown', onPointerDown, true); window.removeEventListener('keydown', onKeyDown, true); };
  }, [presetsOpen, pickerOpen]);
  useEffect(() => {
    if (!visionPickMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setVisionPickMode(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [visionPickMode]);

  const voiceHoldRef = useRef(false);
  const wasOfflineRef = useRef(false);
  useEffect(() => {
    if (isOffline) {
      if (!wasOfflineRef.current) {
        wasOfflineRef.current = true;
        setOfflineToastDismissed(false);
        setPresetsOpen(false);
        setInputFocused(false);
        setVisionPickMode(false);
        voiceHoldRef.current = false;
        voiceCancelRef.current();
      }
    } else if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      setOfflineToastDismissed(false);
    }
  }, [isOffline]);
  const activeAiToastError = isOffline && !offlineToastDismissed ? OFFLINE_AI_MESSAGE : aiError;

  useEffect(() => {
    const canHoldAlt = () =>
      keyboardEnabledRef.current
      && !isOffline
      && voice.supported
      && document.ready
      && !document.busy
      && generation !== 'pending'
      && voice.phase !== 'transcribing';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Alt' || event.repeat || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (!canHoldAlt()) return;
      event.preventDefault();
      voiceHoldRef.current = true;
      void voice.begin();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== 'Alt' || !voiceHoldRef.current) return;
      voiceHoldRef.current = false;
      void voice.end();
    };
    const onBlur = () => {
      if (!voiceHoldRef.current) return;
      voiceHoldRef.current = false;
      voice.cancel();
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [voice, document.ready, document.busy, generation, isOffline]);

  const cancelGeneration = () => {
    setPresetsOpen(false);
    setLibraryOpen(false);
    setInputFocused(false);
    setVisionPickMode(false);
    voice.cancel();
    cancelCanvasAnimation();
    generationId.current++;
    abort.current?.abort();
    abort.current = null;
    setVisionRunning(false);
    setGeneration('idle');
    setAiError(null);
  };
  const performFileAction = async (action: 'new' | 'open') => {
    const ok = action === 'new' ? await document.create() : await document.open();
    if (!ok) startupPresetRef.current = null;
    if (ok && welcome !== 'closed') setWelcome('leaving');
  };
  const handleOpenRecent = async (entry: RecentFileEntry) => {
    if (!document.ready || document.busy) return;
    setMenuOpen(false);
    setSettingsOpen(false);
    cancelGeneration();
    const ok = await document.openRecent(entry);
    if (ok && welcome !== 'closed') setWelcome('leaving');
  };
  const handleResetOnboardingAndExit = async () => {
    await resetOnboarding();
    await handleExitApp();
  };
  const requestFileAction = (action: 'new' | 'open') => {
    if (!document.ready || document.busy) return;
    setMenuOpen(false);
    setSettingsOpen(false);
    cancelGeneration();
    if (document.dirty) {
      setPendingFileAction(action);
      return;
    }
    void performFileAction(action);
  };
  const handleStartPreset = (presetId: StartupPresetId) => {
    if (!api || !document.ready || document.busy || welcome !== 'open' || startupPresetRef.current) return;
    const preset = STARTUP_PRESETS.find(item => item.id === presetId);
    if (!preset) return;
    startupPresetRef.current = presetId;
    requestFileAction('new');
  };
  requestFileActionRef.current = requestFileAction;
  const handleExitApp = async () => {
    if (exiting) return;
    setExiting(true);
    setMenuOpen(false);
    setSettingsOpen(false);
    setPresetsOpen(false);
    setLibraryOpen(false);
    try {
      await document.flush();
    } catch {
      // Best-effort autosave flush before closing
    }
    try {
      const closed = await exitAcdeApp();
      if (!closed) setExiting(false);
    } catch {
      setExiting(false);
    }
  };
  const enterVisionPickMode = () => {
    if (isOffline && !hasLocalShowcase) {
      setOfflineToastDismissed(false);
      return;
    }
    setPresetsOpen(false);
    setInputFocused(false);
    setAiError(null);
    setOfflineToastDismissed(true);
    setVisionPickMode(true);
    api?.setActiveTool({ type: 'selection' });
  };
  const generateVision = async (description = prompt, scope: 'selected' | 'all' = 'selected') => {
    if (isOffline && !hasLocalShowcase) {
      setOfflineToastDismissed(false);
      return;
    }
    if (!api || !document.ready || abort.current || !api.getSceneElements().length) return;
    setVisionPickMode(false);
    const controller = new AbortController();
    abort.current = controller;
    const id = ++generationId.current;
    setGeneration('pending');
    setAiError(null);
    setVisionRunning(true);
    try {
      await generateUiFromSketch(api, description, controller.signal, { scope, allowRemote: !isOffline });
      if (id === generationId.current) { setGeneration('idle'); setAiError(null); if (description && toolMode === 'vision-ui') setPrompt(''); void requestAttentionIfBackground(); }
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : '未知错误';
      const message = rawMessage === 'Failed to fetch' || rawMessage === 'Load failed' ? '网络请求失败或超时，请重试' : rawMessage;
      if (!controller.signal.aborted) console.error('Demo UI 生成失败:', message);
      if (!controller.signal.aborted && id === generationId.current) { setGeneration('error'); setAiError(`UI草图失败：${message}`); }
    } finally {
      if (id === generationId.current) { abort.current = null; setVisionRunning(false); }
    }
  };
  const onVisionButtonClick = () => {
    if (isOffline && !hasLocalShowcase) {
      setOfflineToastDismissed(false);
      return;
    }
    if (selectedInfo.count > 0) {
      void generateVision(prompt, 'selected');
      return;
    }
    if (visionPickMode) {
      setVisionPickMode(false);
      return;
    }
    enterVisionPickMode();
  };
  const generate = async (description = prompt, explicitMode?: AiToolMode) => {
    if (isOffline) {
      setOfflineToastDismissed(false);
      return;
    }
    const activeMode = explicitMode ?? toolMode;
    setInputFocused(false);
    if (activeMode === 'vision-ui') {
      if (selectedInfo.count > 0) await generateVision(description, 'selected');
      else enterVisionPickMode();
      return;
    }
    if (!api || !document.ready || !description.trim() || abort.current) return;
    const controller = new AbortController();
    abort.current = controller;
    const id = ++generationId.current;
    const revision = getCanvasRevision();
    setGeneration('pending');
    setAiError(null);
    setAiToolToast(null);
    const canUseWebSearch = backendWebSearch !== 'off' && webSearchEnabled;
    const requestWebSearch = canUseWebSearch ? true : undefined;
    setPendingToolHint(canUseWebSearch ? '正在联网查找参考…' : '正在规划布局…');
    try {
      const useContext = activeMode === 'compose' || (activeMode === 'auto' && needsCanvasContext(description));
      const versions = new Map(useContext ? api.getSceneElements().map(element => [element.id, element.version]) : []);
      const plan = useContext
        ? await generateCanvasPlan(description, api, controller.signal, { webSearch: requestWebSearch })
        : await generateMermaidWithTools(description, controller.signal, { webSearch: requestWebSearch });
      if (id !== generationId.current || revision !== getCanvasRevision()) { setGeneration('idle'); return; }
      const toolLabel = formatUsedToolsLabel(plan.usedTools ?? [], Boolean(plan.webSearchEnabled));
      setPendingToolHint('正在绘制图表…');
      await applyCanvasPlan(plan, api, versions, revision);
      if (id === generationId.current) {
        setGeneration('idle');
        setAiError(null);
        setPrompt('');
        if (toolLabel) setAiToolToast(toolLabel);
        void requestAttentionIfBackground();
      }
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : '未知错误';
      const message = rawMessage === 'Failed to fetch' || rawMessage === 'Load failed' ? '网络请求失败或超时，请重试' : rawMessage;
      if (!controller.signal.aborted) console.error('图表生成失败:', message);
      if (!controller.signal.aborted && id === generationId.current) { setGeneration('error'); setAiError(message); }
    } finally {
      if (id === generationId.current) {
        abort.current = null;
        setPendingToolHint(null);
      }
    }
  };
  // Consume only after the welcome transition has released the canvas. Clearing
  // the ref before starting also prevents duplicate launches under StrictMode.
  useEffect(() => {
    if (welcome !== 'closed' || !api || !document.ready || document.busy) return;
    const preset = STARTUP_PRESETS.find(item => item.id === startupPresetRef.current);
    if (!preset) return;
    startupPresetRef.current = null;
    void insertDemoSketch(api, preset.showcaseId).catch(error => {
      setAiError(error instanceof Error ? error.message : '插入草图失败');
      setGeneration('error');
    });
  });
  const flushEditorSync = useCallback(() => {
    syncRafRef.current = 0;
    const latest = latestSceneRef.current;
    if (!latest || isCanvasAnimationActive()) return;
    const { elements, state } = latest;
    setHasLocalShowcase(elements.some(el => !el.isDeleted && (el.customData?.showcase as { role?: string } | undefined)?.role === 'frame'));
    let anyVisible = false;
    for (let i = 0; i < elements.length; i++) {
      if (!elements[i]!.isDeleted) { anyVisible = true; break; }
    }
    if (hasElementsRef.current !== anyVisible) {
      hasElementsRef.current = anyVisible;
      setHasElements(anyVisible);
    }
    if (activeToolRef.current !== state.activeTool.type) {
      activeToolRef.current = state.activeTool.type;
      for (const listener of toolListenersRef.current) listener();
    }
    if (Math.round(zoomRef.current * 100) !== Math.round(state.zoom.value * 100)) {
      zoomRef.current = state.zoom.value;
      for (const listener of zoomListenersRef.current) listener();
    } else {
      zoomRef.current = state.zoom.value;
    }
    const interacting = Boolean(state.resizingElement || state.selectedElementsAreBeingDragged || state.selectionElement || state.newElement || state.editingTextElement);
    const selected: typeof elements[number][] = [];
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i]!;
      if (!element.isDeleted && state.selectedElementIds[element.id]) selected.push(element);
    }
    let selW = 0;
    let selH = 0;
    let badgeLeft: number | null = null;
    let badgeTop: number | null = null;
    if (selected.length > 0) {
      const [l, t, r, b] = getCommonBounds(selected);
      selW = Math.max(1, Math.round(r - l));
      selH = Math.max(1, Math.round(b - t));
      if (selected.length > 1 && !interacting) {
        const zoom = state.zoom.value || 1;
        const preferredRight = Math.round((r + state.scrollX) * zoom + 12);
        const fallbackLeft = Math.round((l + state.scrollX) * zoom - 44);
        const rawX = preferredRight <= state.width - 52 ? preferredRight : fallbackLeft;
        const rawY = Math.round((t + state.scrollY) * zoom - 6);
        badgeLeft = Math.max(16, Math.min(Math.max(16, state.width - 52), rawX));
        badgeTop = Math.max(76, Math.min(Math.max(76, state.height - 120), rawY));
      }
    }
    setSelectedInfo(prev => (
      prev.count === selected.length
      && prev.width === selW
      && prev.height === selH
      && prev.badgeLeft === badgeLeft
      && prev.badgeTop === badgeTop
    ) ? prev : { count: selected.length, width: selW, height: selH, badgeLeft, badgeTop });
    if (state.resizingElement) return;
    const signature = buildInspectorSignature(elements, state);
    if (signature !== inspectorSignatureRef.current) {
      inspectorSignatureRef.current = signature;
      for (const listener of inspectorListenersRef.current) listener();
    }
  }, []);

  const gridBgRef = useRef<HTMLDivElement>(null);
  const syncGridBg = useCallback((state: { scrollX?: number; scrollY?: number; zoom?: { value?: number } } | null | undefined) => {
    const el = gridBgRef.current;
    if (!el || !state) return;
    const zoom = state.zoom?.value ?? 1;
    if (!Number.isFinite(zoom) || zoom <= 0) return;
    const scrollX = state.scrollX ?? 0;
    const scrollY = state.scrollY ?? 0;
    let minor = 16;
    let major = 64;
    while (minor * zoom < 8) {
      minor *= 2;
      major *= 2;
    }
    const minorPx = +(minor * zoom).toFixed(3);
    const majorPx = +(major * zoom).toFixed(3);
    const ox = +(scrollX * zoom).toFixed(2);
    const oy = +(scrollY * zoom).toFixed(2);
    el.style.backgroundSize = `${minorPx}px ${minorPx}px, ${majorPx}px ${majorPx}px, ${majorPx}px ${majorPx}px`;
    el.style.backgroundPosition = `${ox}px ${oy}px, ${ox}px ${oy}px, ${ox}px ${oy}px`;
  }, []);

  useEffect(() => {
    if (api) syncGridBg(api.getAppState());
  }, [api, syncGridBg]);

  const onChange = useCallback<NonNullable<ExcalidrawProps['onChange']>>((elements, state, files) => {
    syncGridBg(state);
    document.onChange(elements, state, files);
    if (isCanvasAnimationActive()) return;
    latestSceneRef.current = { elements, state };
    if (!syncRafRef.current) {
      syncRafRef.current = requestAnimationFrame(flushEditorSync);
    }
  }, [document.onChange, flushEditorSync, syncGridBg]);

  return <div className="excalidraw-app" data-entry-phase={welcome} style={{ '--entry-duration': `${ENTRY_DURATION_MS}ms` } as CSSProperties}>
    <div ref={host} className={`canvas-stage ${welcome === 'open' ? '' : 'is-ready'} ${welcome === 'closed' ? 'is-active' : ''}`.trim()} inert={welcome !== 'closed'} aria-hidden={welcome !== 'closed'}>
    <div ref={canvasLayer} className="canvas-layer">
      <MemoExcalidraw
        onApi={setApi}
        onChange={onChange}
        theme={resolvedTheme}
        viewModeEnabled={!document.ready || welcome !== 'closed'}
        handleKeyboardGlobally={keyboardGloballyEnabled}
      />
    </div>
    <div ref={gridBgRef} className="canvas-grid-bg" aria-hidden="true" />
    <AiCursor />
    {api && <Properties api={api} subscribe={subscribeInspector} />}
    {welcome === 'closed' && (!isOffline || hasLocalShowcase) && !menuOpen && !libraryOpen && !visionPickMode && !visionRunning && generation !== 'pending' && selectedInfo.count > 1 && selectedInfo.badgeLeft !== null && selectedInfo.badgeTop !== null && (
      <button
        type="button"
        className="vision-corner-badge glass"
        style={{ left: `${selectedInfo.badgeLeft}px`, top: `${selectedInfo.badgeTop}px` }}
        title={`基于选中的 ${selectedInfo.count} 个组件生成 UI`}
        aria-label="一键生成选中 UI"
        onWheel={event => event.stopPropagation()}
        onPointerDown={event => event.stopPropagation()}
        onClick={() => void generateVision(prompt, 'selected')}
      >
        <Icon name="vision" />
      </button>
    )}
    <div
      className="dock-position"
      onWheel={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
    >
      <div className={`dock-shell ${aiBusy ? 'is-generating' : ''}`} ref={shellRef}>
        <div className="dock-glow" aria-hidden="true">
          <span className="dock-glow-orb dock-glow-orb--a" />
          <span className="dock-glow-orb dock-glow-orb--b" />
        </div>
        <div className="dock-glow-ring" aria-hidden="true">
          <span className="dock-glow-ring-scaler">
            <span className="dock-glow-ring-beam" />
          </span>
        </div>
        <div className="canvas-dock glass">
          <ToolButtons api={api} ready={document.ready} subscribe={subscribeTool} getActiveTool={getActiveTool} />
          {demoMode && <button
            ref={libraryTriggerRef}
            type="button"
            className={`icon-button library-trigger ${libraryOpen ? 'active' : ''}`}
            title="UI 组件模板"
            aria-label="UI 组件模板"
            aria-expanded={libraryOpen}
            aria-haspopup="dialog"
            disabled={!document.ready || document.busy}
            onClick={() => {
              setMenuOpen(false);
              setSettingsOpen(false);
              setPresetsOpen(false);
              setInputFocused(false);
              setVisionPickMode(false);
              setLibraryOpen(open => !open);
            }}
          >
            <Icon name="library" />
          </button>}
          <span className="divider dock-divider" />
          <div
            className={`dock-ai-row ${isOffline ? 'is-offline' : ''} ${demoMode ? 'has-demo-access' : ''}`.trim()}
            inert={isOffline && !demoMode && !hasLocalShowcase}
            aria-disabled={(isOffline && !demoMode && !hasLocalShowcase) || undefined}
            title={isOffline ? OFFLINE_AI_MESSAGE : undefined}
          >
            <form ref={formRef} className="generate-form" noValidate onSubmit={event => { event.preventDefault(); void generate(); }} aria-busy={generation === 'pending'}>
              <Icon name="sparkle" />
              <div className="generate-input-wrap" data-replicated-value={prompt}>
                <textarea rows={1} aria-label="描述" placeholder={isOffline ? '未连接互联网，AI 已禁用' : voice.phase === 'listening' ? '聆听...' : voice.phase === 'transcribing' ? '识别...' : activeToolMeta.placeholder} value={prompt} maxLength={4000} onFocus={() => { if (isOffline) return; setPresetsOpen(false); setInputFocused(true); }} onBlur={event => { const next = event.relatedTarget as Node | null; if (!next || (!formRef.current?.contains(next) && !pickerRef.current?.contains(next))) setInputFocused(false); }} onChange={event => { setPrompt(event.target.value); setInputFocused(true); if (generation === 'error') setGeneration('idle'); if (aiError) setAiError(null); }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { if (event.nativeEvent.isComposing || event.keyCode === 229) return; event.preventDefault(); formRef.current?.requestSubmit(); } }} disabled={isOffline || generation === 'pending'} />
              </div>
              {backendWebSearch !== 'off' && webSearchEnabled && toolMode !== 'vision-ui' && (
                <button
                  type="button"
                  className="generate-search-badge"
                  title="已启用联网搜索（点击关闭）"
                  aria-label="已启用联网搜索"
                  aria-pressed={true}
                  disabled={isOffline || generation === 'pending'}
                  onPointerDown={event => event.preventDefault()}
                  onClick={() => setWebSearchEnabled(false)}
                >
                  <Icon name="globe" />
                  <span>联网</span>
                </button>
              )}
              <button type="button" className={`voice-button ${voice.phase === 'listening' ? 'listening' : ''} ${voice.phase === 'transcribing' ? 'transcribing' : ''}`} aria-label="语音" title="按住 Alt 键或长按说话" disabled={isOffline || !document.ready || document.busy || !voice.supported || generation === 'pending' || voice.phase === 'transcribing'}
                onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); void voice.begin(); }}
                onPointerUp={() => void voice.end()} onPointerCancel={voice.cancel} onLostPointerCapture={() => void voice.end()}
                onKeyDown={event => { if ([' ', 'Enter'].includes(event.key) && !event.repeat) { event.preventDefault(); void voice.begin(); } }}
                onKeyUp={event => { if ([' ', 'Enter'].includes(event.key)) { event.preventDefault(); void voice.end(); } }}><Icon name="microphone" /></button>
              <button className={`generate-button ${prompt.trim() ? 'has-prompt' : ''} ${pendingButton ? 'is-pending' : ''} ${generation === 'error' ? 'is-error' : ''}`} type="submit" disabled={isOffline || !document.ready || generation === 'pending' || (toolMode === 'vision-ui' ? !hasElements : !prompt.trim())}>
                {pendingButton ? (
                  <svg className="generate-button-icon is-spinning" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9" /></svg>
                ) : generation === 'error' ? (
                  <svg className="generate-button-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
                ) : (
                  <svg className="generate-button-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5m-5.5 5.5L12 5l5.5 5.5" /></svg>
                )}
                <span>{pendingButton ? '生成中' : generation === 'error' ? '重试' : '生成'}</span>
              </button>
            </form>
            <button type="button" className={`vision-button ${visionRunning || visionPickMode ? 'active' : ''}`} title={!hasElements ? (demoMode ? '请先在画布绘制或点击下方精选示例' : '请先在画布绘制界面草图') : '选择草图组件按区域生成 UI'} aria-label="UI草图" aria-pressed={visionPickMode} disabled={(isOffline && !hasLocalShowcase) || !document.ready || document.busy || !hasElements || generation === 'pending'} onClick={onVisionButtonClick}>
              {visionRunning ? (
                <svg className="generate-button-icon is-spinning" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9" /></svg>
              ) : (
                <Icon name="vision" />
              )}
              <span>{visionRunning ? '生成中' : 'UI草图'}</span>
            </button>
            {demoMode && <button ref={triggerRef} type="button" className={`icon-button presets-trigger ${presetsOpen ? 'active' : ''}`} title="预设模板" aria-label="预设模板" aria-expanded={presetsOpen} aria-haspopup="menu" disabled={!document.ready || document.busy || generation === 'pending'} onClick={() => { setInputFocused(false); setLibraryOpen(false); setVisionPickMode(false); setPresetsOpen(open => !open); }}>
              <img src={presetsIcon} alt="" aria-hidden="true" />
            </button>}
          </div>
          <ZoomControls api={api} ready={document.ready} subscribe={subscribeZoom} getZoom={getZoom} subscribeTool={subscribeTool} getActiveTool={getActiveTool} />
        </div>
        {demoMode && welcome === 'closed' && document.ready && !hasElements && generation === 'idle' && !isOffline && !libraryOpen && !presetsOpen && !pickerOpen && !visionPickMode && !activeAiToastError && !aiToolToast && voice.phase === 'idle' && (
          <div className="quick-prompts" role="group" aria-label="快速灵感模板">
            {QUICK_PROMPTS.map(item => (
              <button
                key={item.label}
                type="button"
                className="quick-prompt-chip"
                onClick={() => {
                  if (item.kind === 'sketch') {
                    if (api) void insertDemoSketch(api, item.showcaseId).catch(error => { setAiError(error instanceof Error ? error.message : '插入示例失败'); setGeneration('error'); });
                    return;
                  }
                  setPrompt(item.prompt);
                  void generate(item.prompt, 'diagram');
                }}
              >
                <Icon name={item.kind === 'sketch' ? 'vision' : 'sparkle'} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        )}
        {demoMode && <UiLibraryPanel
          open={libraryOpen}
          ready={document.ready && welcome === 'closed'}
          busy={document.busy}
          panelRef={libraryPanelRef}
          onClose={() => setLibraryOpen(false)}
          onInsert={async templateId => (api ? insertUiTemplate(api, templateId) : false)}
        />}
        {(voice.phase === 'listening' || voice.phase === 'transcribing') && welcome === 'closed' && (
          <div className={`voice-status-bubble glass ${voice.phase === 'listening' ? 'is-listening' : ''}`} role="status" aria-live="polite">
            <span className="voice-status-dot" aria-hidden="true" />
            <span>{voice.phase === 'listening' ? '正在聆听… 松开结束语音输入' : '正在识别语音…'}</span>
          </div>
        )}
        {generation === 'pending' && (!visionPickMode || visionRunning) && !presetsOpen && welcome === 'closed' && (
          <div className="ai-tool-toast glass is-pending" role="status" aria-live="polite">
            <span className="ai-tool-toast-dot" aria-hidden="true" />
            <span className="ai-pending-copy">
              <strong>{aiAnimating ? '正在绘制到画布…' : visionRunning ? '正在生成界面…' : pendingToolHint || '正在规划布局…'}</strong>
              <span>{visionRunning ? '正在完善界面 · 可随时停止' : 'AI 正在创作 · 可随时停止'}</span>
            </span>
          </div>
        )}
        {aiToolToast && !activeAiToastError && !visionPickMode && !pickerOpen && !presetsOpen && generation !== 'pending' && welcome === 'closed' && (
          <div className="ai-tool-toast glass" role="status" aria-live="polite">
            <Icon name="globe" />
            <span>{aiToolToast}</span>
            <button type="button" aria-label="关闭工具提示" onClick={() => setAiToolToast(null)}>关闭</button>
          </div>
        )}
        {activeAiToastError && !libraryOpen && !visionPickMode && !pickerOpen && !presetsOpen && welcome === 'closed' && (
          <div className={`ai-error-toast glass ${isOffline && !offlineToastDismissed ? 'is-offline' : ''}`.trim()} role="alert">
            <span className="status-dot error" aria-hidden="true" />
            <span>{activeAiToastError}</span>
            <button
              type="button"
              aria-label="关闭提示"
              onClick={() => {
                if (isOffline && !offlineToastDismissed) setOfflineToastDismissed(true);
                else setAiError(null);
              }}
            >
              关闭
            </button>
          </div>
        )}
        {visionPickMode && !visionRunning && generation !== 'pending' && welcome === 'closed' && (
          <div className="vision-pick-bar glass" role="region" aria-label="选择草图组件">
            <Icon name="selection" />
            <span>{selectedInfo.count > 0 ? `已选 ${selectedInfo.count} 个组件 (${selectedInfo.width}×${selectedInfo.height})` : '请框选或点击要生成 UI 的草图组件'}</span>
            {selectedInfo.count > 0 ? (
              <button type="button" className="vision-pick-primary" onClick={() => void generateVision(prompt, 'selected')}>生成选中区域 UI</button>
            ) : (
              <button type="button" className="vision-pick-secondary" onClick={() => void generateVision(prompt, 'all')}>整页生成</button>
            )}
            <button type="button" className="vision-pick-cancel" onClick={() => setVisionPickMode(false)}>取消</button>
          </div>
        )}
        <div
          ref={pickerRef}
          className={`tool-picker glass ${pickerOpen ? 'is-open' : ''}`}
          style={{ left: `${pickerLeft}px` }}
          aria-hidden={!pickerOpen}
          inert={!pickerOpen}
        >
          <SpringRail
            className="tool-picker-rail"
            items={toolPickerItems}
            activeId={toolMode}
            onSelect={setToolMode}
            ariaLabel="AI 工具选择"
            role="radiogroup"
            itemRole="radio"
            ariaSelectionAttr="aria-checked"
            visible={pickerOpen}
            preventFocusOnPointerDown
          />
          {backendWebSearch !== 'off' && toolMode !== 'vision-ui' && (
            <>
              <span className="tool-picker-divider" aria-hidden="true" />
              <button
                type="button"
                className={`tool-search-toggle ${webSearchEnabled ? 'is-active' : ''}`}
                aria-pressed={webSearchEnabled}
                title={webSearchEnabled ? '已启用联网搜索（点击关闭）' : '手动启用联网搜索查找资料'}
                onPointerDown={event => event.preventDefault()}
                onClick={() => setWebSearchEnabled(prev => !prev)}
              >
                <Icon name="globe" />
                <span>联网搜索</span>
              </button>
            </>
          )}
        </div>
        {demoMode && <div className={`presets-menu glass ${presetsOpen ? 'is-open' : ''}`} style={{ right: `${presetsRight}px` }} role="menu" aria-label="预设模板" aria-hidden={!presetsOpen} inert={!presetsOpen}>
          {PRESETS.map(([label, description]) => <button key={label} type="button" role="menuitem" title={description} disabled={isOffline || !document.ready || generation === 'pending'} onClick={() => { setPresetsOpen(false); setPrompt(description); void generate(description, 'diagram'); }}>{label}</button>)}
          <div className="presets-section-label">精选示例 · 草图转界面</div>
          {SHOWCASE_EXAMPLES.map(example => <button key={example.id} type="button" role="menuitem" title={`插入${example.title}草图，再点击「UI草图」查看成品`} disabled={!document.ready || document.busy || generation === 'pending' || !api} onClick={() => {
            setPresetsOpen(false);
            if (api) void insertDemoSketch(api, example.id).catch(error => { setAiError(error instanceof Error ? error.message : '插入示例失败'); setGeneration('error'); });
          }}>{example.title}</button>)}
          <button type="button" role="menuitem" title="浏览手机与 电脑网页/App 界面模板库" disabled={!document.ready} onClick={() => { setPresetsOpen(false); setLibraryOpen(true); }}>界面素材库...</button>
        </div>}
      </div>
    </div>
    </div>
    {welcome !== 'open' && <div
      inert={welcome !== 'closed'}
      aria-hidden={welcome !== 'closed'}
      className="file-capsule glass"
      aria-label="文件"
      onWheel={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
    >
      <button
        ref={menuTriggerRef}
        type="button"
        className={`menu-trigger ${menuOpen || settingsOpen || snapshotsOpen || aboutOpen ? 'active' : ''}`}
        title="菜单"
        aria-label="菜单"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        disabled={!document.ready || document.busy}
        onClick={() => {
          setFileInfoOpen(false);
          setPresetsOpen(false);
          setLibraryOpen(false);
          setSettingsOpen(false);
          setSnapshotsOpen(false);
          setAboutOpen(false);
          setInputFocused(false);
          setVisionPickMode(false);
          setMenuOpen(open => !open);
        }}
      >
        <Icon name="menu" />
      </button>
      <button
        ref={fileNameTriggerRef}
        type="button"
        className={`file-name ${fileInfoOpen ? 'active' : ''}`}
        title={`${document.fileName} — 点击修改名称或查看文件信息`}
        aria-expanded={fileInfoOpen}
        aria-haspopup="dialog"
        disabled={!document.ready}
        onClick={() => {
          setMenuOpen(false);
          setPresetsOpen(false);
          setLibraryOpen(false);
          setSettingsOpen(false);
          setSnapshotsOpen(false);
          setInputFocused(false);
          setVisionPickMode(false);
          setFileInfoOpen(open => !open);
        }}
      >
        <span className="file-name-text">{stripExcalidrawExtension(document.fileName)}</span>
      </button>
      <span className={`status-dot ${document.status}`} role="status" aria-label={document.status === 'error' ? '失败' : document.dirty ? '未保存' : '已保存'} />
    </div>}
    {welcome === 'closed' && <div
      ref={fileInfoPopoverRef}
      className={`file-info-popover glass ${fileInfoOpen ? 'is-open' : ''}`}
      role="dialog"
      aria-label="文件信息与重命名"
      aria-hidden={!fileInfoOpen}
      inert={!fileInfoOpen}
      onWheel={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
    >
      <form
        className="file-rename-form"
        onSubmit={event => {
          event.preventDefault();
          if (document.renameFile(fileNameDraft)) {
            setFileInfoOpen(false);
          }
        }}
      >
        <label className="file-info-label" htmlFor="file-rename-input">文件名称</label>
        <div className="file-rename-row">
          <input
            ref={fileNameInputRef}
            id="file-rename-input"
            type="text"
            value={fileNameDraft}
            maxLength={120}
            autoComplete="off"
            spellCheck={false}
            placeholder="输入文件名称"
            onChange={event => setFileNameDraft(event.target.value)}
          />
          <button type="submit" className="file-rename-submit" disabled={!fileNameDraft.trim()}>确定</button>
        </div>
      </form>
      <div className="file-info-meta">
        <div className="file-info-row">
          <span>完整文件名</span>
          <span className="file-info-value" title={document.fileName}>{document.fileName}</span>
        </div>
        <div className="file-info-row">
          <span>保存状态</span>
          <span className={`file-status-pill ${document.status === 'error' ? 'is-error' : document.dirty ? 'is-dirty' : 'is-saved'}`}>
            <span className={`status-dot ${document.status}`} aria-hidden="true" />
            <span>{document.status === 'error' ? '保存异常' : document.status === 'pending' ? '自动保存中...' : document.dirty ? '未保存' : '已保存'}</span>
          </span>
        </div>
        <div className="file-info-row">
          <span>画布元素</span>
          <span className="file-info-value">{api ? api.getSceneElements().length : 0} 个</span>
        </div>
        <div className="file-info-row">
          <span>存储位置</span>
          <span className="file-info-value">{document.hasHandle ? '本地文件' : '未绑定本地文件'}</span>
        </div>
      </div>
    </div>}
    <div
      ref={menuDropdownRef}
      className={`menu-dropdown glass ${menuOpen ? 'is-open' : ''}`}
      role="menu"
      aria-label="主菜单"
      aria-hidden={!menuOpen}
      inert={!menuOpen}
      onWheel={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
    >
      <button
        type="button"
        role="menuitem"
        aria-label="新建"
        className="menu-dropdown-item"
        disabled={!document.ready || document.busy || welcome !== 'closed'}
        onClick={() => {
          setMenuOpen(false);
          setFileInfoOpen(false);
          requestFileAction('new');
        }}
      >
        <Icon name="file-plus" />
        <span className="menu-dropdown-label">新建</span>
        <kbd className="menu-dropdown-shortcut" aria-hidden="true">{undoShortcutLabel.startsWith('⌘') ? '⌘N' : 'Ctrl+N'}</kbd>
      </button>
      <button
        type="button"
        role="menuitem"
        aria-label="打开..."
        className="menu-dropdown-item"
        disabled={!document.ready || document.busy || welcome !== 'closed'}
        onClick={() => {
          setMenuOpen(false);
          setFileInfoOpen(false);
          requestFileAction('open');
        }}
      >
        <Icon name="folder" />
        <span className="menu-dropdown-label">打开...</span>
        <kbd className="menu-dropdown-shortcut" aria-hidden="true">{undoShortcutLabel.startsWith('⌘') ? '⌘O' : 'Ctrl+O'}</kbd>
      </button>
      <button
        type="button"
        role="menuitem"
        aria-label="保存"
        className="menu-dropdown-item"
        disabled={!document.ready || document.busy || welcome !== 'closed'}
        onClick={() => {
          setMenuOpen(false);
          setFileInfoOpen(false);
          setSettingsOpen(false);
          void document.save();
        }}
      >
        <Icon name="save" />
        <span className="menu-dropdown-label">保存</span>
        <kbd className="menu-dropdown-shortcut" aria-hidden="true">{undoShortcutLabel.startsWith('⌘') ? '⌘S' : 'Ctrl+S'}</kbd>
      </button>
      <button
        type="button"
        role="menuitem"
        aria-label="另存为..."
        className="menu-dropdown-item"
        disabled={!document.ready || document.busy || welcome !== 'closed'}
        onClick={() => {
          setMenuOpen(false);
          setFileInfoOpen(false);
          setSettingsOpen(false);
          void document.save(true);
        }}
      >
        <Icon name="save" />
        <span className="menu-dropdown-label">另存为...</span>
        <kbd className="menu-dropdown-shortcut" aria-hidden="true">{undoShortcutLabel.startsWith('⌘') ? '⇧⌘S' : 'Ctrl+Shift+S'}</kbd>
      </button>
      <button
        type="button"
        role="menuitem"
        className="menu-dropdown-item"
        disabled={!document.ready || document.busy || welcome !== 'closed'}
        onClick={() => openSecondaryModal('snapshots')}
      >
        <Icon name="history" />
        <span className="menu-dropdown-label">快照</span>
      </button>
      <div className="menu-dropdown-divider" role="separator" />
      <button
        type="button"
        role="menuitem"
        aria-label="插入图片 / 文件..."
        className="menu-dropdown-item"
        disabled={!document.ready || document.busy || welcome !== 'closed'}
        onClick={() => onImportFilesRef.current()}
      >
        <Icon name="image" />
        <span className="menu-dropdown-label">插入图片 / 文件...</span>
        <kbd className="menu-dropdown-shortcut" aria-hidden="true">{undoShortcutLabel.startsWith('⌘') ? '⌘I' : 'Ctrl+I'}</kbd>
      </button>
      <button
        type="button"
        role="menuitem"
        aria-label="撤销"
        className="menu-dropdown-item"
        disabled={!document.ready || document.busy || welcome !== 'closed'}
        onClick={() => {
          setMenuOpen(false);
          triggerCanvasUndo(host.current, window.document, api);
          host.current?.querySelector<HTMLElement>('.excalidraw')?.focus({ preventScroll: true });
        }}
      >
        <Icon name="undo" />
        <span className="menu-dropdown-label">撤销</span>
        <kbd className="menu-dropdown-shortcut" aria-hidden="true">{undoShortcutLabel}</kbd>
      </button>
      <div className="menu-dropdown-divider" role="separator" />
      <button
        type="button"
        role="menuitem"
        aria-label="设置"
        className="menu-dropdown-item"
        onClick={() => openSecondaryModal('settings')}
      >
        <Icon name="settings" />
        <span className="menu-dropdown-label">设置</span>
        <kbd className="menu-dropdown-shortcut" aria-hidden="true">{undoShortcutLabel.startsWith('⌘') ? '⌘,' : 'Ctrl+,'}</kbd>
      </button>
      <button
        type="button"
        role="menuitem"
        className="menu-dropdown-item"
        onClick={() => openSecondaryModal('about')}
      >
        <Icon name="info" />
        <span className="menu-dropdown-label">关于</span>
      </button>
      <div className="menu-dropdown-divider" role="separator" />
      <button
        type="button"
        role="menuitem"
        className="menu-dropdown-item is-danger"
        disabled={exiting}
        onClick={() => void handleExitApp()}
      >
        <Icon name="exit" />
        <span className="menu-dropdown-label">退出</span>
      </button>
    </div>
    <MenuPanel
      open={settingsOpen}
      demoMode={demoMode}
      onDemoModeChange={enabled => {
        saveDemoMode(enabled);
        setDemoMode(enabled);
        if (!enabled) {
          setPresetsOpen(false);
          setLibraryOpen(false);
        }
      }}
      onClose={() => setSettingsOpen(false)}
      panelRef={menuPanelRef}
      onResetOnboardingAndExit={handleResetOnboardingAndExit}
      onOpenTour={() => setTourOpen(true)}
    />
    <OnboardingTour
      open={tourOpen && welcome === 'closed'}
      onClose={() => {
        markTourCompleted();
        setTourOpen(false);
        host.current?.querySelector<HTMLElement>('.excalidraw')?.focus({ preventScroll: true });
      }}
    />
    <SnapshotModal
      open={snapshotsOpen}
      onClose={() => setSnapshotsOpen(false)}
      panelRef={snapshotPanelRef}
      documentReady={document.ready}
      documentBusy={document.busy}
      onCreateSnapshot={document.createSnapshot}
      onRestoreSnapshot={document.restoreSnapshot}
    />
    <AboutModal
      open={aboutOpen}
      onClose={() => setAboutOpen(false)}
      panelRef={aboutPanelRef}
    />
    {welcome !== 'closed' && (
      entryKind === 'welcome' ? (
        <Welcome
          ready={document.ready}
          busy={document.busy}
          leaving={welcome === 'leaving'}
          trapFocus={!menuOpen && !settingsOpen && !snapshotsOpen && !pendingFileAction}
          onContinue={() => {
            shouldStartTourRef.current = !hasCompletedTour();
            setWelcome('leaving');
          }}
          onSkip={() => {
            shouldStartTourRef.current = false;
            markTourCompleted();
            setWelcome('leaving');
          }}
        />
      ) : (
        <Startup
          ready={document.ready}
          busy={document.busy}
          leaving={welcome === 'leaving'}
          trapFocus={!menuOpen && !settingsOpen && !snapshotsOpen && !pendingFileAction}
          onContinue={() => setWelcome('leaving')}
          onNew={() => requestFileAction('new')}
          onOpen={() => requestFileAction('open')}
          onOpenRecent={entry => void handleOpenRecent(entry)}
          onStartPreset={demoMode ? handleStartPreset : undefined}
        />
      )
    )}
    <UnsavedConfirmDialog
      open={pendingFileAction !== null}
      action={pendingFileAction}
      fileName={document.fileName}
      busy={document.busy}
      onCancel={() => { startupPresetRef.current = null; setPendingFileAction(null); }}
      onDiscard={() => {
        const action = pendingFileAction;
        setPendingFileAction(null);
        if (action) void performFileAction(action);
      }}
      onSaveAndContinue={async () => {
        const action = pendingFileAction;
        const saved = await document.save();
        if (!saved) return;
        setPendingFileAction(null);
        if (action) void performFileAction(action);
      }}
    />
  </div>;
}

