import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  callMcpTool,
  connectMcpServer,
  createMcpServer,
  deleteMcpServer,
  disconnectMcpServer,
  fetchMcpSnapshot,
  formatArgsText,
  formatKeyValueLines,
  importMcpJson,
  parseArgsText,
  parseKeyValueLines,
  refreshAllMcp,
  testMcpServer,
  updateLocalMcpEnabled,
  updateMcpServer,
  type McpServerDraft,
  type McpServerView,
  type McpSnapshot,
  type McpToolInfo,
  type McpTransportType,
} from '../services/mcpSettings';
import { Icon } from './Icon';

interface McpSectionProps {
  active: boolean;
}

type ViewMode = 'list' | 'form' | 'import';

interface FormState {
  editingId: string | null;
  name: string;
  transport: McpTransportType;
  enabled: boolean;
  command: string;
  argsText: string;
  cwd: string;
  envText: string;
  url: string;
  headersText: string;
  disabledTools: string[];
}

interface FeedbackState {
  tone: 'saved' | 'pending' | 'error';
  text: string;
}

const EMPTY_FORM: FormState = {
  editingId: null,
  name: '',
  transport: 'stdio',
  enabled: true,
  command: '',
  argsText: '',
  cwd: '',
  envText: '',
  url: '',
  headersText: '',
  disabledTools: [],
};

const TRANSPORT_OPTIONS: ReadonlyArray<{ id: McpTransportType; label: string }> = [
  { id: 'stdio', label: '本地进程' },
  { id: 'http', label: 'HTTP' },
  { id: 'sse', label: 'SSE' },
];

const MCP_PRESETS: ReadonlyArray<{
  key: string;
  pkg: string;
  label: string;
  description: string;
  draft: McpServerDraft;
}> = [
  {
    key: 'filesystem',
    pkg: 'filesystem-mcp.mjs',
    label: 'Filesystem',
    description: '读取本地目录与文件',
    draft: {
      name: 'Filesystem',
      transport: 'stdio',
      enabled: true,
      command: 'node',
      args: ['scripts/filesystem-mcp.mjs', '.'],
    },
  },
  {
    key: 'memory',
    pkg: 'memory-mcp.mjs',
    label: 'Memory',
    description: '本地知识图谱记忆',
    draft: {
      name: 'Memory',
      transport: 'stdio',
      enabled: true,
      command: 'node',
      args: ['scripts/memory-mcp.mjs'],
    },
  },
];

const IMPORT_PLACEHOLDER = `{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]
    }
  }
}`;

function formFromServer(server: McpServerView): FormState {
  return {
    editingId: server.id,
    name: server.name,
    transport: server.transport,
    enabled: server.enabled,
    command: server.command ?? '',
    argsText: formatArgsText(server.args),
    cwd: server.cwd ?? '',
    envText: formatKeyValueLines(server.env, '='),
    url: server.url ?? '',
    headersText: formatKeyValueLines(server.headers, ':'),
    disabledTools: server.disabledTools ?? [],
  };
}

function buildSkeletonArgsJson(tool: McpToolInfo): string {
  const props = tool.inputSchema?.properties;
  if (!props || typeof props !== 'object') return '{}';
  const sample: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(props)) {
    const type = schema && typeof schema === 'object' && 'type' in schema ? String((schema as { type?: unknown }).type) : 'string';
    if (type === 'number' || type === 'integer') sample[key] = 0;
    else if (type === 'boolean') sample[key] = false;
    else if (type === 'array') sample[key] = [];
    else if (type === 'object') sample[key] = {};
    else sample[key] = '';
  }
  return JSON.stringify(sample, null, 2);
}

export function McpSection({ active }: McpSectionProps) {
  const [snapshot, setSnapshot] = useState<McpSnapshot | null>(null);
  const [mode, setMode] = useState<ViewMode>('list');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [importText, setImportText] = useState('');
  const [expandedServerId, setExpandedServerId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [runnerKey, setRunnerKey] = useState<string | null>(null);
  const [runnerArgs, setRunnerArgs] = useState('{}');
  const [runnerOutput, setRunnerOutput] = useState<{ ok: boolean; text: string } | null>(null);
  const [showLocalConfig, setShowLocalConfig] = useState(false);
  const [copiedLocal, setCopiedLocal] = useState(false);

  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  const testAbortRef = useRef<AbortController | null>(null);
  const nameId = useId();
  const commandId = useId();
  const argsId = useId();
  const cwdId = useId();
  const envId = useId();
  const urlId = useId();
  const headersId = useId();
  const importId = useId();

  useEffect(() => {
    if (!active) {
      testAbortRef.current?.abort();
      testAbortRef.current = null;
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setFeedback(null);
    void fetchMcpSnapshot(controller.signal)
      .then(data => {
        if (!controller.signal.aborted) setSnapshot(data);
      })
      .catch(error => {
        if (!controller.signal.aborted) {
          setFeedback({ tone: 'error', text: error instanceof Error ? error.message : '读取 MCP 配置失败' });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [active]);

  const busy = loading || busyKey !== null;

  const buildDraft = (): McpServerDraft => {
    const base: McpServerDraft = {
      name: form.name.trim(),
      transport: form.transport,
      enabled: form.enabled,
      disabledTools: form.disabledTools,
    };
    if (form.transport === 'stdio') {
      base.command = form.command.trim();
      base.args = parseArgsText(form.argsText);
      if (form.cwd.trim()) base.cwd = form.cwd.trim();
      base.env = parseKeyValueLines(form.envText, '=');
    } else {
      base.url = form.url.trim();
      base.headers = parseKeyValueLines(form.headersText, ':');
    }
    return base;
  };

  const onSaveForm = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    let draft: McpServerDraft;
    try {
      draft = buildDraft();
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : '参数无效' });
      return;
    }
    setBusyKey('save');
    setFeedback({ tone: 'pending', text: '保存并连接中' });
    try {
      const next = form.editingId
        ? await updateMcpServer(form.editingId, draft)
        : await createMcpServer(draft);
      setSnapshot(next);
      setMode('list');
      setForm(EMPTY_FORM);
      setFeedback({ tone: 'saved', text: form.editingId ? '已更新服务' : '已添加服务' });
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : '保存失败' });
    } finally {
      setBusyKey(null);
    }
  };

  const onTestDraft = async () => {
    if (busy) return;
    let draft: McpServerDraft;
    try {
      draft = buildDraft();
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : '参数无效' });
      return;
    }
    testAbortRef.current?.abort();
    const controller = new AbortController();
    testAbortRef.current = controller;
    setBusyKey('test');
    setFeedback({ tone: 'pending', text: '测试连接中' });
    try {
      const result = await testMcpServer(draft, controller.signal);
      if (controller.signal.aborted) return;
      if (result.ok) {
        const count = result.tools?.length ?? 0;
        const ms = typeof result.latencyMs === 'number' ? ` · ${result.latencyMs}ms` : '';
        setFeedback({ tone: 'saved', text: `连接成功 · ${count} 个工具${ms}` });
      } else {
        setFeedback({ tone: 'error', text: result.error || '连接测试失败' });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setFeedback({ tone: 'error', text: error instanceof Error ? error.message : '连接测试失败' });
      }
    } finally {
      if (testAbortRef.current === controller) testAbortRef.current = null;
      setBusyKey(null);
    }
  };

  const onImportSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusyKey('import');
    setFeedback({ tone: 'pending', text: '导入并连接中' });
    try {
      const { importedCount, snapshot: next } = await importMcpJson(importText);
      setSnapshot(next);
      setImportText('');
      setMode('list');
      setFeedback({ tone: 'saved', text: `已导入 ${importedCount} 个服务` });
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : '导入失败' });
    } finally {
      setBusyKey(null);
    }
  };

  const onToggleServer = async (server: McpServerView) => {
    if (busy) return;
    setBusyKey(`toggle:${server.id}`);
    setFeedback({ tone: 'pending', text: server.enabled ? '断开中' : '连接中' });
    try {
      const next = await updateMcpServer(server.id, { enabled: !server.enabled });
      setSnapshot(next);
      setFeedback({ tone: 'saved', text: server.enabled ? '已停用' : '已启用' });
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : '切换失败' });
    } finally {
      setBusyKey(null);
    }
  };

  const onReconnectServer = async (server: McpServerView) => {
    if (busy) return;
    setBusyKey(`conn:${server.id}`);
    setFeedback({ tone: 'pending', text: server.status === 'connected' ? '刷新中' : '连接中' });
    try {
      const updated = server.status === 'connected'
        ? await disconnectMcpServer(server.id).then(() => connectMcpServer(server.id))
        : await connectMcpServer(server.id);
      setSnapshot(prev => prev ? {
        ...prev,
        servers: prev.servers.map(item => item.id === updated.id ? updated : item),
      } : prev);
      if (updated.status === 'connected') {
        setFeedback({ tone: 'saved', text: `${updated.name} 已连接 · ${updated.tools.length} 个工具` });
      } else {
        setFeedback({ tone: 'error', text: updated.error || '连接失败' });
      }
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : '连接失败' });
    } finally {
      setBusyKey(null);
    }
  };

  const onDeleteServer = async (id: string) => {
    if (busy) return;
    setBusyKey(`del:${id}`);
    setConfirmDeleteId(null);
    try {
      const next = await deleteMcpServer(id);
      setSnapshot(next);
      if (expandedServerId === id) setExpandedServerId(null);
      setFeedback({ tone: 'saved', text: '已删除服务' });
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : '删除失败' });
    } finally {
      setBusyKey(null);
    }
  };

  const onAddPreset = async (preset: (typeof MCP_PRESETS)[number]) => {
    if (busy) return;
    setBusyKey(`preset:${preset.key}`);
    setFeedback({ tone: 'pending', text: `正在接入 ${preset.label}` });
    try {
      const next = await createMcpServer(preset.draft);
      setSnapshot(next);
      setFeedback({ tone: 'saved', text: `已接入 ${preset.label}` });
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : '接入失败' });
    } finally {
      setBusyKey(null);
    }
  };

  const onToggleTool = async (server: McpServerView, toolName: string) => {
    if (busy) return;
    const disabled = new Set(server.disabledTools ?? []);
    if (disabled.has(toolName)) disabled.delete(toolName);
    else disabled.add(toolName);
    setBusyKey(`tool:${server.id}:${toolName}`);
    try {
      const next = await updateMcpServer(server.id, { disabledTools: [...disabled] });
      setSnapshot(next);
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : '更新工具失败' });
    } finally {
      setBusyKey(null);
    }
  };

  const onRunTool = async (serverId: string, toolName: string) => {
    if (busy) return;
    let parsedArgs: Record<string, unknown> = {};
    try {
      const parsed = runnerArgs.trim() ? JSON.parse(runnerArgs) : {};
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('参数必须是 JSON 对象');
      }
      parsedArgs = parsed as Record<string, unknown>;
    } catch (error) {
      setRunnerOutput({ ok: false, text: error instanceof Error ? error.message : 'JSON 参数无效' });
      return;
    }
    setBusyKey(`run:${serverId}:${toolName}`);
    setRunnerOutput(null);
    try {
      const result = await callMcpTool(serverId, toolName, parsedArgs);
      setRunnerOutput({
        ok: result.ok,
        text: result.ok ? result.text : (result.error || result.text || '执行失败'),
      });
    } catch (error) {
      setRunnerOutput({ ok: false, text: error instanceof Error ? error.message : '执行失败' });
    } finally {
      setBusyKey(null);
    }
  };

  const onRefreshAll = async () => {
    if (busy) return;
    setBusyKey('refresh-all');
    setFeedback({ tone: 'pending', text: '刷新全部服务中' });
    try {
      const next = await refreshAllMcp();
      setSnapshot(next);
      const connected = next.servers.filter(item => item.status === 'connected').length;
      setFeedback({ tone: 'saved', text: `已连接 ${connected}/${next.servers.length} 个服务` });
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : '刷新失败' });
    } finally {
      setBusyKey(null);
    }
  };

  const onToggleLocalMcp = async () => {
    if (busy || !snapshot) return;
    setBusyKey('local-toggle');
    try {
      const next = await updateLocalMcpEnabled(!snapshot.localServer.enabled);
      setSnapshot(next);
      setFeedback({ tone: 'saved', text: next.localServer.enabled ? '已启用本机白板 MCP' : '已暂停本机白板 MCP' });
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : '切换失败' });
    } finally {
      setBusyKey(null);
    }
  };

  const onCopyLocalConfig = async () => {
    if (!snapshot) return;
    try {
      await navigator.clipboard.writeText(snapshot.localServer.clientConfigJson);
      setCopiedLocal(true);
      window.setTimeout(() => setCopiedLocal(false), 1800);
    } catch {
      setShowLocalConfig(true);
    }
  };

  const servers = snapshot?.servers ?? [];
  const connectedCount = servers.filter(item => item.status === 'connected').length;
  const availablePresets = MCP_PRESETS.filter(preset =>
    !servers.some(server =>
      server.name.toLowerCase() === preset.draft.name.toLowerCase()
      || (server.args ?? []).some(arg => arg.includes(preset.pkg)),
    ),
  );

  return (
    <div className="mcp-section">
      {mode === 'list' && (
        <>
          <div className="mcp-toolbar">
            <span className="mcp-summary">
              {servers.length ? `已连接 ${connectedCount}/${servers.length}` : '暂无外部服务'}
            </span>
            <div className="mcp-toolbar-actions">
              {servers.length > 0 && (
                <button
                  type="button"
                  className="mcp-tool-btn"
                  title="刷新全部"
                  aria-label="刷新全部 MCP"
                  disabled={busy}
                  onClick={() => void onRefreshAll()}
                >
                  <Icon name="refresh" />
                </button>
              )}
              <button
                type="button"
                className="menu-btn-secondary mcp-compact-btn"
                disabled={busy}
                onClick={() => {
                  setFeedback(null);
                  setMode('import');
                }}
              >
                导入 JSON
              </button>
              <button
                type="button"
                className="menu-btn-primary mcp-compact-btn"
                disabled={busy}
                onClick={() => {
                  setFeedback(null);
                  setForm(EMPTY_FORM);
                  setMode('form');
                }}
              >
                <Icon name="plus" />
                <span>添加</span>
              </button>
            </div>
          </div>

          <div className="mcp-list">
            {servers.length === 0 ? (
              <div className="mcp-empty">
                <Icon name="plug" />
                <strong>连接工具，扩展 AI 能力</strong>
                <span>尚未配置外部服务。从下方一键接入，也可添加或导入已有配置。</span>
              </div>
            ) : (
              servers.map(server => {
                const expanded = expandedServerId === server.id;
                const disabledSet = new Set(server.disabledTools ?? []);
                const enabledToolsCount = server.tools.filter(tool => !disabledSet.has(tool.name)).length;
                const endpointLabel = server.transport === 'stdio'
                  ? `${server.command ?? ''} ${(server.args ?? []).join(' ')}`.trim()
                  : (server.url ?? '');
                return (
                  <div key={server.id} className="mcp-card">
                    <div className="mcp-card-top">
                      <div className="mcp-card-info">
                        <span
                          className={`status-dot ${
                            server.status === 'connected'
                              ? 'saved'
                              : server.status === 'connecting'
                                ? 'pending'
                                : server.status === 'error'
                                  ? 'error'
                                  : 'idle'
                          }`}
                          title={server.status}
                        />
                        <span className="mcp-card-name" title={server.name}>{server.name}</span>
                        <span className="mcp-pill">{server.transport === 'stdio' ? '本地进程' : server.transport === 'sse' ? '服务器推送' : '流式网络连接'}</span>
                        {server.status === 'connected' && (
                          <span className="mcp-pill is-accent">{enabledToolsCount}/{server.tools.length} 工具</span>
                        )}
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-label={`启用 ${server.name}`}
                        aria-checked={server.enabled}
                        className={`menu-switch mcp-switch-sm ${server.enabled ? 'is-on' : ''}`}
                        disabled={busy}
                        onClick={() => void onToggleServer(server)}
                      >
                        <span className="menu-switch-thumb" />
                      </button>
                    </div>

                    {endpointLabel && (
                      <div className="mcp-card-endpoint" title={endpointLabel}>{endpointLabel}</div>
                    )}

                    {server.status === 'error' && server.error && (
                      <div className="mcp-card-error" title={server.error}>{server.error}</div>
                    )}

                    <div className="mcp-card-actions">
                      <button
                        type="button"
                        className={`mcp-card-expand ${expanded ? 'is-expanded' : ''}`}
                        aria-expanded={expanded}
                        disabled={busy}
                        onClick={() => {
                          setExpandedServerId(expanded ? null : server.id);
                          setRunnerKey(null);
                          setRunnerOutput(null);
                        }}
                      >
                        <Icon name="chevron" />
                        <span>{server.tools.length ? `工具 (${server.tools.length})` : '工具'}</span>
                      </button>
                      <div className="mcp-card-btns">
                        <button
                          type="button"
                          className="mcp-icon-action"
                          title={server.status === 'connected' ? '重连' : '连接'}
                          aria-label={`连接 ${server.name}`}
                          disabled={busy || !server.enabled}
                          onClick={() => void onReconnectServer(server)}
                        >
                          <Icon name="refresh" />
                        </button>
                        <button
                          type="button"
                          className="mcp-icon-action"
                          title="编辑"
                          aria-label={`编辑 ${server.name}`}
                          disabled={busy}
                          onClick={() => {
                            setFeedback(null);
                            setForm(formFromServer(server));
                            setMode('form');
                          }}
                        >
                          <Icon name="edit" />
                        </button>
                        {confirmDeleteId === server.id ? (
                          <div className="mcp-delete-confirm">
                            <button
                              type="button"
                              className="mcp-danger-btn"
                              disabled={busy}
                              onClick={() => void onDeleteServer(server.id)}
                            >
                              确认
                            </button>
                            <button
                              type="button"
                              className="mcp-cancel-btn"
                              disabled={busy}
                              onClick={() => setConfirmDeleteId(null)}
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="mcp-icon-action is-danger"
                            title="删除"
                            aria-label={`删除 ${server.name}`}
                            disabled={busy}
                            onClick={() => setConfirmDeleteId(server.id)}
                          >
                            <Icon name="trash" />
                          </button>
                        )}
                      </div>
                    </div>

                    {expanded && (
                      <div className="mcp-tools-drawer">
                        {server.tools.length === 0 ? (
                          <div className="mcp-tools-empty">
                            {server.status === 'connected' ? '该服务未暴露工具' : '连接服务后可查看并调试工具'}
                          </div>
                        ) : (
                          server.tools.map(tool => {
                            const toolEnabled = !disabledSet.has(tool.name);
                            const thisRunnerKey = `${server.id}:${tool.name}`;
                            const runnerOpen = runnerKey === thisRunnerKey;
                            return (
                              <div key={tool.name} className="mcp-tool-item">
                                <div className="mcp-tool-head">
                                  <div className="mcp-tool-title">
                                    <code>{tool.name}</code>
                                    {tool.description && <p>{tool.description}</p>}
                                  </div>
                                  <div className="mcp-tool-controls">
                                    <button
                                      type="button"
                                      className={`mcp-run-toggle ${runnerOpen ? 'active' : ''}`}
                                      title="调试调用"
                                      aria-label={`调试 ${tool.name}`}
                                      disabled={busy || server.status !== 'connected'}
                                      onClick={() => {
                                        if (runnerOpen) {
                                          setRunnerKey(null);
                                          setRunnerOutput(null);
                                        } else {
                                          setRunnerKey(thisRunnerKey);
                                          setRunnerArgs(buildSkeletonArgsJson(tool));
                                          setRunnerOutput(null);
                                        }
                                      }}
                                    >
                                      <Icon name="play" />
                                    </button>
                                    <button
                                      type="button"
                                      role="switch"
                                      aria-label={`启用工具 ${tool.name}`}
                                      aria-checked={toolEnabled}
                                      className={`menu-switch mcp-switch-sm ${toolEnabled ? 'is-on' : ''}`}
                                      disabled={busy}
                                      onClick={() => void onToggleTool(server, tool.name)}
                                    >
                                      <span className="menu-switch-thumb" />
                                    </button>
                                  </div>
                                </div>
                                {runnerOpen && (
                                  <div className="mcp-tool-runner">
                                    <textarea className="resize-none"
                                      rows={3}
                                      spellCheck={false}
                                      aria-label="工具参数 JSON"
                                      value={runnerArgs}
                                      disabled={busy}
                                      onChange={event => setRunnerArgs(event.target.value)}
                                    />
                                    <div className="mcp-tool-runner-bar">
                                      <button
                                        type="button"
                                        className="menu-btn-primary mcp-compact-btn"
                                        disabled={busy}
                                        onClick={() => void onRunTool(server.id, tool.name)}
                                      >
                                        {busyKey === `run:${server.id}:${tool.name}` ? '执行中' : '运行'}
                                      </button>
                                    </div>
                                    {runnerOutput && (
                                      <pre className={`mcp-tool-output ${runnerOutput.ok ? '' : 'is-error'}`}>
                                        {runnerOutput.text}
                                      </pre>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {availablePresets.length > 0 && (
            <div className="mcp-presets">
              <span className="mcp-presets-label">一键接入</span>
              <div className="mcp-presets-list">
                {availablePresets.map(preset => (
                  <button
                    key={preset.key}
                    type="button"
                    className="mcp-preset-btn"
                    title={preset.description}
                    disabled={busy}
                    onClick={() => void onAddPreset(preset)}
                  >
                    <Icon name="plus" />
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {snapshot && (
            <div className="mcp-local-card">
              <div className="mcp-card-top">
                <div className="mcp-card-info">
                  <span className={`status-dot ${snapshot.localServer.enabled ? 'saved' : 'idle'}`} />
                  <span className="mcp-card-name">本机白板 MCP</span>
                  <span className="mcp-pill">dopame-canvas</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-label="允许外部 MCP 调用画布"
                  aria-checked={snapshot.localServer.enabled}
                  className={`menu-switch mcp-switch-sm ${snapshot.localServer.enabled ? 'is-on' : ''}`}
                  disabled={busy}
                  onClick={() => void onToggleLocalMcp()}
                >
                  <span className="menu-switch-thumb" />
                </button>
              </div>
              <div className="mcp-local-tools">
                {snapshot.localServer.tools.map(tool => (
                  <span key={tool.name} className="mcp-pill" title={tool.description}>
                    {tool.name}
                  </span>
                ))}
              </div>
              <div className="mcp-local-actions">
                <button
                  type="button"
                  className="menu-btn-secondary mcp-compact-btn"
                  onClick={() => void onCopyLocalConfig()}
                >
                  <Icon name={copiedLocal ? 'check' : 'copy'} />
                  <span>{copiedLocal ? '已复制' : '复制客户端配置'}</span>
                </button>
                <button
                  type="button"
                  className="menu-btn-ghost"
                  onClick={() => setShowLocalConfig(prev => !prev)}
                >
                  {showLocalConfig ? '收起 JSON' : '查看 JSON'}
                </button>
              </div>
              {showLocalConfig && (
                <pre className="mcp-code-preview">{snapshot.localServer.clientConfigJson}</pre>
              )}
            </div>
          )}
        </>
      )}

      {mode === 'form' && (
        <form className="menu-form" noValidate onSubmit={event => void onSaveForm(event)}>
          <div className="mcp-subview-head">
            <button
              type="button"
              className="menu-btn-ghost"
              disabled={busy}
              onClick={() => {
                setMode('list');
                setFeedback(null);
              }}
            >
              ← 返回
            </button>
            <span className="mcp-subview-title">{form.editingId ? '编辑 MCP 服务' : '添加 MCP 服务'}</span>
          </div>

          <div className="menu-field">
            <div className="menu-field-head">
              <label htmlFor={nameId}>服务名称</label>
            </div>
            <input
              id={nameId}
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="例如 filesystem / fetch"
              value={form.name}
              disabled={busy}
              onChange={event => {
                setForm(prev => ({ ...prev, name: event.target.value }));
                if (feedback) setFeedback(null);
              }}
            />
          </div>

          <div className="menu-row">
            <span className="menu-row-label">传输类型</span>
            <div className="menu-segmented" role="radiogroup" aria-label="传输类型">
              {TRANSPORT_OPTIONS.map(option => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={form.transport === option.id}
                  disabled={busy}
                  onClick={() => {
                    setForm(prev => ({ ...prev, transport: option.id }));
                    if (feedback) setFeedback(null);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {form.transport === 'stdio' ? (
            <>
              <div className="menu-field">
                <div className="menu-field-head">
                  <label htmlFor={commandId}>启动命令</label>
                </div>
                <input
                  id={commandId}
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="例如 npx / uvx / node"
                  value={form.command}
                  disabled={busy}
                  onChange={event => {
                    setForm(prev => ({ ...prev, command: event.target.value }));
                    if (feedback) setFeedback(null);
                  }}
                />
              </div>

              <div className="menu-field">
                <div className="menu-field-head">
                  <label htmlFor={argsId}>命令参数</label>
                </div>
                <input
                  id={argsId}
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="空格分隔，支持引号，如 -y @scope/pkg"
                  value={form.argsText}
                  disabled={busy}
                  onChange={event => {
                    setForm(prev => ({ ...prev, argsText: event.target.value }));
                    if (feedback) setFeedback(null);
                  }}
                />
              </div>

              <div className="menu-field">
                <div className="menu-field-head">
                  <label htmlFor={cwdId}>工作目录（可选）</label>
                </div>
                <input
                  id={cwdId}
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="/path/to/workspace"
                  value={form.cwd}
                  disabled={busy}
                  onChange={event => {
                    setForm(prev => ({ ...prev, cwd: event.target.value }));
                    if (feedback) setFeedback(null);
                  }}
                />
              </div>

              <div className="menu-field">
                <div className="menu-field-head">
                  <label htmlFor={envId}>环境变量（每行 KEY=VALUE）</label>
                </div>
                <textarea className="resize-none"
                  id={envId}
                  rows={2}
                  spellCheck={false}
                  placeholder="API_TOKEN=..."
                  value={form.envText}
                  disabled={busy}
                  onChange={event => {
                    setForm(prev => ({ ...prev, envText: event.target.value }));
                    if (feedback) setFeedback(null);
                  }}
                />
              </div>
            </>
          ) : (
            <>
              <div className="menu-field">
                <div className="menu-field-head">
                  <label htmlFor={urlId}>服务地址 URL</label>
                </div>
                <input
                  id={urlId}
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="https://example.com/mcp"
                  value={form.url}
                  disabled={busy}
                  onChange={event => {
                    setForm(prev => ({ ...prev, url: event.target.value }));
                    if (feedback) setFeedback(null);
                  }}
                />
              </div>

              <div className="menu-field">
                <div className="menu-field-head">
                  <label htmlFor={headersId}>请求头（每行 Header: Value）</label>
                </div>
                <textarea className="resize-none"
                  id={headersId}
                  rows={2}
                  spellCheck={false}
                  placeholder="Authorization: Bearer ..."
                  value={form.headersText}
                  disabled={busy}
                  onChange={event => {
                    setForm(prev => ({ ...prev, headersText: event.target.value }));
                    if (feedback) setFeedback(null);
                  }}
                />
              </div>
            </>
          )}

          <div className="menu-row">
            <span className="menu-row-label">启用并连接</span>
            <button
              type="button"
              role="switch"
              aria-label="启用并连接"
              aria-checked={form.enabled}
              className={`menu-switch ${form.enabled ? 'is-on' : ''}`}
              disabled={busy}
              onClick={() => setForm(prev => ({ ...prev, enabled: !prev.enabled }))}
            >
              <span className="menu-switch-thumb" />
            </button>
          </div>

          <div className="menu-actions">
            <button
              type="button"
              className="menu-btn-ghost"
              disabled={busy}
              onClick={() => {
                setMode('list');
                setFeedback(null);
              }}
            >
              取消
            </button>
            <div className="menu-actions-right">
              <button
                type="button"
                className="menu-btn-secondary"
                disabled={busy}
                onClick={() => void onTestDraft()}
              >
                {busyKey === 'test' ? '测试中' : '测试连接'}
              </button>
              <button
                type="submit"
                className="menu-btn-primary"
                disabled={busy}
              >
                {busyKey === 'save' ? '保存中' : '保存'}
              </button>
            </div>
          </div>
        </form>
      )}

      {mode === 'import' && (
        <form className="menu-form" noValidate onSubmit={event => void onImportSubmit(event)}>
          <div className="mcp-subview-head">
            <button
              type="button"
              className="menu-btn-ghost"
              disabled={busy}
              onClick={() => {
                setMode('list');
                setFeedback(null);
              }}
            >
              ← 返回
            </button>
            <span className="mcp-subview-title">导入 mcpServers JSON</span>
          </div>

          <div className="menu-field">
            <div className="menu-field-head">
              <label htmlFor={importId}>粘贴配置 JSON</label>
            </div>
            <textarea className="resize-none"
              id={importId}
              rows={7}
              spellCheck={false}
              placeholder={IMPORT_PLACEHOLDER}
              value={importText}
              disabled={busy}
              onChange={event => {
                setImportText(event.target.value);
                if (feedback) setFeedback(null);
              }}
            />
          </div>

          <div className="menu-actions">
            <button
              type="button"
              className="menu-btn-ghost"
              disabled={busy}
              onClick={() => {
                setMode('list');
                setFeedback(null);
              }}
            >
              取消
            </button>
            <button
              type="submit"
              className="menu-btn-primary"
              disabled={busy || !importText.trim()}
            >
              {busyKey === 'import' ? '导入中' : '导入并连接'}
            </button>
          </div>
        </form>
      )}

      {feedback && (
        <div className="menu-status" role="status" aria-live="polite">
          <span className={`status-dot ${feedback.tone}`} aria-hidden="true" />
          <span>{feedback.text}</span>
        </div>
      )}
    </div>
  );
}
