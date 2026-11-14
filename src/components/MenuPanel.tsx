import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from 'react';
import {
  fetchAiSettings,
  getCachedAiSettings,
  resetAiSettings,
  saveAiSettings,
  testAiConnection,
  type PublicAiSettings,
  type WebSearchMode,
} from '../services/aiSettings';
import { Icon } from './Icon';
import { McpSection } from './McpSection';
import { SystemSection } from './SystemSection';
import { SpringRail } from './SpringRail';
import {
  getThemePreference,
  setThemePreference,
  subscribeTheme,
  type ThemePreference,
} from '../services/theme';

const THEME_OPTIONS: ReadonlyArray<{ id: ThemePreference; label: string }> = [
  { id: 'system', label: '跟随系统' },
  { id: 'light', label: '浅色' },
  { id: 'dark', label: '深色' },
];
const SETTINGS_TABS = [
  { id: 'general', label: '通用' },
  { id: 'ai', label: 'AI 引擎' },
  { id: 'mcp', label: 'MCP 服务' },
] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number]['id'];
const WEB_SEARCH_OPTIONS: ReadonlyArray<{ id: WebSearchMode; label: string }> = [
  { id: 'auto', label: '自动' },
  { id: 'always', label: '开启' },
  { id: 'off', label: '关闭' },
];

interface MenuPanelProps {
  open: boolean;
  demoMode: boolean;
  onDemoModeChange: (enabled: boolean) => void;
  onClose: () => void;
  panelRef: RefObject<HTMLElement | null>;
  onResetOnboardingAndExit?: () => Promise<void> | void;
  onOpenTour?: () => void;
}

interface FeedbackState {
  tone: 'saved' | 'pending' | 'error';
  text: string;
}

const DEFAULT_PUBLIC_SETTINGS: PublicAiSettings = {
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-flash',
  hasApiKey: false,
  apiKeySource: 'none',
  apiKeyMasked: '',
  webSearch: 'off',
  animationEnabled: true,
  defaultBaseUrl: 'https://api.deepseek.com',
  defaultModel: 'deepseek-flash',
};

export function MenuPanel({
  open,
  demoMode,
  onDemoModeChange,
  onClose,
  panelRef,
  onResetOnboardingAndExit,
  onOpenTour,
}: MenuPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [switchDirection, setSwitchDirection] = useState('forward');
  const tabsId = useId();
  const selectTab = (tab: SettingsTab) => {
    if (tab === activeTab) return;
    setSwitchDirection(SETTINGS_TABS.findIndex(item => item.id === tab) > SETTINGS_TABS.findIndex(item => item.id === activeTab) ? 'forward' : 'backward');
    setActiveTab(tab);
  };
  const [settings, setSettings] = useState<PublicAiSettings>(DEFAULT_PUBLIC_SETTINGS);
  const [baseUrl, setBaseUrl] = useState(DEFAULT_PUBLIC_SETTINGS.baseUrl);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [clearApiKey, setClearApiKey] = useState(false);
  const [model, setModel] = useState(DEFAULT_PUBLIC_SETTINGS.model);
  const [webSearch, setWebSearch] = useState<WebSearchMode>('off');
  const [animationEnabled, setAnimationEnabled] = useState(true);
  const [themePref, setThemePref] = useState<ThemePreference>(() => getThemePreference());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resettingOnboarding, setResettingOnboarding] = useState(false);

  const testAbortRef = useRef<AbortController | null>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const userEditedRef = useRef(false);
  const resetDialogRef = useRef<HTMLDialogElement>(null);
  const resetTitleId = useId();
  const resetDescId = useId();
  const connectionId = useId();

  useEffect(() => {
    const dialog = resetDialogRef.current;
    if (!dialog) return;
    if (resetConfirmOpen) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
      dialog.returnValue = '';
    }
  }, [resetConfirmOpen]);

  useEffect(() => {
    if (open && activeTab === 'ai' && feedback) statusRef.current?.scrollIntoView({ block: 'nearest' });
  }, [feedback, activeTab, open]);
  useEffect(() => subscribeTheme(() => setThemePref(getThemePreference())), []);

  const applyServerSettings = (next: PublicAiSettings) => {
    setSettings(next);
    setBaseUrl(next.baseUrl);
    setModel(next.model);
    setWebSearch(next.webSearch);
    setAnimationEnabled(next.animationEnabled);
    setApiKeyDraft('');
    setClearApiKey(false);
  };

  useEffect(() => {
    if (!open) {
      testAbortRef.current?.abort();
      testAbortRef.current = null;
      setResetConfirmOpen(false);
      return;
    }
    userEditedRef.current = false;
    const cached = getCachedAiSettings();
    if (cached) applyServerSettings(cached);
    const controller = new AbortController();
    setLoading(!cached);
    setFeedback(null);
    void fetchAiSettings(controller.signal)
      .then(loaded => {
        if (!controller.signal.aborted && !userEditedRef.current) applyServerSettings(loaded);
      })
      .catch(error => {
        if (!controller.signal.aborted) {
          setFeedback({ tone: 'error', text: error instanceof Error ? error.message : '读取设置失败' });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, [open]);

  const busy = loading || saving || testing;

  const buildPayload = () => ({
    baseUrl: baseUrl.trim() || settings.defaultBaseUrl,
    model: model.trim() || settings.defaultModel,
    ...(clearApiKey ? { clearApiKey: true } : apiKeyDraft.trim() ? { apiKey: apiKeyDraft.trim() } : {}),
    webSearch,
    animationEnabled,
  });

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setSaving(true);
    setFeedback({ tone: 'pending', text: '保存中' });
    try {
      const updated = await saveAiSettings(buildPayload());
      userEditedRef.current = false;
      applyServerSettings(updated);
      setFeedback({ tone: 'saved', text: '已保存' });
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : '保存失败' });
    } finally {
      setSaving(false);
    }
  };

  const onTestConnection = async () => {
    if (busy) return;
    testAbortRef.current?.abort();
    const controller = new AbortController();
    testAbortRef.current = controller;
    setTesting(true);
    setFeedback({ tone: 'pending', text: '测试连接中' });
    try {
      const result = await testAiConnection(buildPayload(), controller.signal);
      if (controller.signal.aborted) return;
      if (result.ok) {
        const ms = typeof result.latencyMs === 'number' ? ` · ${result.latencyMs}ms` : '';
        setFeedback({ tone: 'saved', text: `连接正常${ms}` });
      } else {
        setFeedback({ tone: 'error', text: result.error || '连接失败' });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setFeedback({ tone: 'error', text: error instanceof Error ? error.message : '连接失败' });
      }
    } finally {
      if (testAbortRef.current === controller) testAbortRef.current = null;
      setTesting(false);
    }
  };

  const onReset = async () => {
    if (busy) return;
    setSaving(true);
    setFeedback({ tone: 'pending', text: '恢复默认中' });
    try {
      const reset = await resetAiSettings();
      userEditedRef.current = false;
      applyServerSettings(reset);
      setFeedback({ tone: 'saved', text: '已恢复默认' });
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : '重置失败' });
    } finally {
      setSaving(false);
    }
  };

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
        className="menu-panel settings-panel glass"
        role="dialog"
        aria-modal="true"
        aria-label="设置"
        onPointerDown={event => event.stopPropagation()}
      >
        <div className="menu-panel-header">
          <div className="mcp-card-info">
            <Icon name="settings" />
            <span className="mcp-card-name">设置</span>
          </div>
          <button
            type="button"
            className="menu-close"
            title="关闭"
            aria-label="关闭设置"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>

        <SpringRail
          className="settings-tabs"
          items={SETTINGS_TABS}
          activeId={activeTab}
          onSelect={selectTab}
          ariaLabel="设置分类"
          itemRole="tab"
          tabIdPrefix={tabsId}
          visible={open}
        />
        <div className="settings-scroll" data-switch-direction={switchDirection}>
          <div className="settings-tabpanel" role="tabpanel" id={`${tabsId}-panel-general`} aria-labelledby={`${tabsId}-tab-general`} hidden={activeTab !== 'general'} aria-hidden={activeTab !== 'general'} inert={activeTab !== 'general'}>
          <section className="settings-section" aria-labelledby="settings-heading-general">
            <h3 id="settings-heading-general" className="settings-section-heading">
              <span>通用</span>
            </h3>
            <div className="menu-row">
              <span className="menu-row-label">外观模式</span>
              <div className="menu-segmented" role="radiogroup" aria-label="外观模式">
                {THEME_OPTIONS.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={themePref === option.id}
                    className={themePref === option.id ? 'active' : ''}
                    onClick={() => {
                      setThemePreference(option.id);
                      setThemePref(option.id);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="menu-row">
              <div className="menu-row-copy">
                <span className="menu-row-label">演示模式</span>
                <span className="menu-row-hint">显示开始页模板、工具栏预设与固定推荐</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-label="演示模式"
                aria-checked={demoMode}
                className={`menu-switch ${demoMode ? 'is-on' : ''}`}
                onClick={() => onDemoModeChange(!demoMode)}
              ><span className="menu-switch-thumb" /></button>
            </div>
            {onOpenTour && (
              <div className="menu-row">
                <div className="menu-row-copy">
                  <span className="menu-row-label">使用引导</span>
                  <span className="menu-row-hint">查看主要功能区域、AI 导图与 MCP 介绍</span>
                </div>
                <button
                  type="button"
                  className="menu-btn-secondary"
                  disabled={busy}
                  onClick={() => {
                    onClose();
                    onOpenTour();
                  }}
                >
                  开始引导
                </button>
              </div>
            )}
            {onResetOnboardingAndExit && (
              <div className="menu-row">
                <div className="menu-row-copy">
                  <span className="menu-row-label">启动引导</span>
                  <span className="menu-row-hint">下次启动时重新显示欢迎页</span>
                </div>
                <button
                  type="button"
                  className="menu-btn-secondary"
                  disabled={busy || resettingOnboarding}
                  onClick={() => setResetConfirmOpen(true)}
                >
                  重置引导
                </button>
              </div>
            )}
          </section>

          <section className="settings-section" aria-labelledby="settings-heading-system">
            <h3 id="settings-heading-system" className="settings-section-heading"><span>Dopame OS</span></h3>
            <SystemSection active={open && activeTab === 'general'} />
          </section>
          </div>

          <div className="settings-tabpanel" role="tabpanel" id={`${tabsId}-panel-ai`} aria-labelledby={`${tabsId}-tab-ai`} hidden={activeTab !== 'ai'} aria-hidden={activeTab !== 'ai'} inert={activeTab !== 'ai'}>
          <section className="settings-section" aria-labelledby="settings-heading-ai">
            <h3 id="settings-heading-ai" className="settings-section-heading">
              <span>AI 设置</span>
            </h3>
            <form className="menu-form" noValidate onSubmit={event => void onSubmit(event)}>
              <div className="menu-field">
                <label htmlFor={`${connectionId}-url`}>接口地址</label>
                <input id={`${connectionId}-url`} type="url" value={baseUrl} disabled={busy}
                  placeholder={settings.defaultBaseUrl} autoComplete="off"
                  onChange={event => { userEditedRef.current = true; setBaseUrl(event.target.value); setFeedback(null); }} />
              </div>
              <div className="menu-field">
                <label htmlFor={`${connectionId}-model`}>模型名称</label>
                <input id={`${connectionId}-model`} value={model} disabled={busy}
                  placeholder={settings.defaultModel} autoComplete="off"
                  onChange={event => { userEditedRef.current = true; setModel(event.target.value); setFeedback(null); }} />
              </div>
              <div className="menu-field">
                <label htmlFor={`${connectionId}-key`}>API Key</label>
                <input id={`${connectionId}-key`} type="password" value={apiKeyDraft} disabled={busy}
                  placeholder={settings.hasApiKey ? '已配置，留空保持不变' : '填写服务 API Key'} autoComplete="new-password"
                  onChange={event => { userEditedRef.current = true; setApiKeyDraft(event.target.value); setClearApiKey(false); setFeedback(null); }} />
              </div>
              <div className="menu-row">
            <span className="menu-row-label">联网参考</span>
            <div className="menu-segmented" role="radiogroup" aria-label="联网参考">
              {WEB_SEARCH_OPTIONS.map(option => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={webSearch === option.id}
                  disabled={busy}
                  onClick={() => {
                    userEditedRef.current = true;
                    setWebSearch(option.id);
                    if (feedback) setFeedback(null);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="menu-row">
            <span className="menu-row-label">绘制动画</span>
            <button
              type="button"
              role="switch"
              aria-label="绘制动画"
              aria-checked={animationEnabled}
              className={`menu-switch ${animationEnabled ? 'is-on' : ''}`}
              disabled={busy}
              onClick={() => {
                userEditedRef.current = true;
                setAnimationEnabled(prev => !prev);
                if (feedback) setFeedback(null);
              }}
            >
              <span className="menu-switch-thumb" />
            </button>
          </div>

          {feedback && (
            <div ref={statusRef} className={`menu-status is-${feedback.tone}`} role="status" aria-live="polite">
              {feedback.tone === 'pending' ? (
                <svg className="generate-button-icon is-spinning" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 3a9 9 0 1 0 9 9" />
                </svg>
              ) : (
                <span className={`status-dot ${feedback.tone}`} aria-hidden="true" />
              )}
              <span>{feedback.text}</span>
            </div>
          )}

          <div className="menu-actions">
            <button
              type="button"
              className="menu-btn-ghost"
              disabled={busy}
              onClick={() => void onReset()}
            >
              恢复默认
            </button>
              <button
                type="button"
                className="menu-btn-secondary"
                disabled={busy}
                onClick={() => void onTestConnection()}
              >
                {testing ? '测试中' : '测试连接'}
              </button>
              <button
                type="submit"
                className="menu-btn-primary"
                disabled={busy}
              >
                {saving ? '保存中' : '保存'}
              </button>
          </div>
            </form>
          </section>
          </div>

          <div className="settings-tabpanel" role="tabpanel" id={`${tabsId}-panel-mcp`} aria-labelledby={`${tabsId}-tab-mcp`} hidden={activeTab !== 'mcp'} aria-hidden={activeTab !== 'mcp'} inert={activeTab !== 'mcp'}>
          <section className="settings-section" aria-labelledby="settings-heading-mcp">
            <h3 id="settings-heading-mcp" className="settings-section-heading">
              <span>MCP 管理</span>
            </h3>
            <McpSection active={open && activeTab === 'mcp'} />
          </section>
          </div>
        </div>
      </section>
      <dialog
        ref={resetDialogRef}
        className="confirm-dialog glass"
        aria-labelledby={resetTitleId}
        aria-describedby={resetDescId}
        onCancel={event => {
          event.preventDefault();
          if (!resettingOnboarding) setResetConfirmOpen(false);
        }}
        onClose={() => {
          if (resetDialogRef.current) resetDialogRef.current.returnValue = '';
        }}
        onPointerDown={event => event.stopPropagation()}
        onWheel={event => event.stopPropagation()}
      >
        <div className="confirm-dialog-body">
          <h2 id={resetTitleId} className="confirm-dialog-title">重置启动引导</h2>
          <p id={resetDescId} className="confirm-dialog-desc">
            确认重置引导吗？确认后将清除初次引导记录并自动关闭应用，下次启动时将重新显示欢迎页。
          </p>
        </div>
        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="menu-btn-ghost"
            autoFocus
            disabled={resettingOnboarding}
            onClick={() => setResetConfirmOpen(false)}
          >
            取消
          </button>
          <div className="confirm-dialog-actions-right">
            <button
              type="button"
              className="menu-btn-primary"
              disabled={resettingOnboarding}
              onClick={() => {
                if (resettingOnboarding || !onResetOnboardingAndExit) return;
                setResettingOnboarding(true);
                setResetConfirmOpen(false);
                void Promise.resolve(onResetOnboardingAndExit()).finally(() => {
                  setResettingOnboarding(false);
                });
              }}
            >
              {resettingOnboarding ? '正在关闭…' : '确认并关闭'}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
