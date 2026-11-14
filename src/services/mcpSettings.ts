export type McpTransportType = 'stdio' | 'http' | 'sse';
export type McpConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpServerView {
  id: string;
  name: string;
  transport: McpTransportType;
  enabled: boolean;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
  disabledTools?: string[];
  status: McpConnectionStatus;
  error?: string;
  tools: McpToolInfo[];
  lastConnectedAt?: number;
  serverVersion?: { name: string; version: string };
}

export interface LocalWhiteboardMcpInfo {
  name: string;
  enabled: boolean;
  command: string;
  scriptPath: string;
  tools: Array<{ name: string; description: string }>;
  clientConfigJson: string;
}

export interface McpSnapshot {
  servers: McpServerView[];
  localServer: LocalWhiteboardMcpInfo;
}

export interface McpServerDraft {
  name: string;
  transport: McpTransportType;
  enabled: boolean;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
  disabledTools?: string[];
}

export interface McpTestResult {
  ok: boolean;
  latencyMs?: number;
  tools?: McpToolInfo[];
  serverVersion?: { name: string; version: string };
  error?: string;
}

export interface McpToolCallResult {
  ok: boolean;
  isError?: boolean;
  text: string;
  error?: string;
}

let localMcpEnabled = true;
const localListeners = new Set<(enabled: boolean) => void>();

export function getLocalMcpEnabled(): boolean {
  return localMcpEnabled;
}

export function subscribeLocalMcpEnabled(listener: (enabled: boolean) => void): () => void {
  localListeners.add(listener);
  listener(localMcpEnabled);
  return () => { localListeners.delete(listener); };
}

function syncLocalMcpState(snapshot: McpSnapshot): McpSnapshot {
  const next = snapshot.localServer?.enabled !== false;
  if (localMcpEnabled !== next) {
    localMcpEnabled = next;
    for (const listener of localListeners) listener(next);
  }
  return snapshot;
}

async function requestJson<T>(url: string, init?: RequestInit, fallbackError = '请求失败'): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? fallbackError);
  return body;
}

export async function fetchMcpSnapshot(signal?: AbortSignal): Promise<McpSnapshot> {
  const snapshot = await requestJson<McpSnapshot>('/api/mcp', { method: 'GET', signal }, '读取 MCP 配置失败');
  return syncLocalMcpState(snapshot);
}

export async function createMcpServer(draft: McpServerDraft): Promise<McpSnapshot> {
  const snapshot = await requestJson<McpSnapshot>('/api/mcp/servers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  }, '添加 MCP 服务失败');
  return syncLocalMcpState(snapshot);
}

export async function updateMcpServer(id: string, patch: Partial<McpServerDraft>): Promise<McpSnapshot> {
  const snapshot = await requestJson<McpSnapshot>(`/api/mcp/servers/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  }, '更新 MCP 服务失败');
  return syncLocalMcpState(snapshot);
}

export async function deleteMcpServer(id: string): Promise<McpSnapshot> {
  const snapshot = await requestJson<McpSnapshot>(`/api/mcp/servers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }, '删除 MCP 服务失败');
  return syncLocalMcpState(snapshot);
}

export async function connectMcpServer(id: string): Promise<McpServerView> {
  return requestJson<McpServerView>(`/api/mcp/servers/${encodeURIComponent(id)}/connect`, {
    method: 'POST',
  }, '连接 MCP 服务失败');
}

export async function disconnectMcpServer(id: string): Promise<McpServerView> {
  return requestJson<McpServerView>(`/api/mcp/servers/${encodeURIComponent(id)}/disconnect`, {
    method: 'POST',
  }, '断开 MCP 服务失败');
}

export async function testMcpServer(draft: McpServerDraft, signal?: AbortSignal): Promise<McpTestResult> {
  const response = await fetch('/api/mcp/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
    signal,
  });
  const body = await response.json().catch(() => ({ ok: false, error: '连接测试失败' })) as McpTestResult;
  if (!response.ok) return { ok: false, error: body.error ?? '连接测试失败' };
  return body;
}

export async function callMcpTool(
  serverId: string,
  toolName: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<McpToolCallResult> {
  return requestJson<McpToolCallResult>(`/api/mcp/servers/${encodeURIComponent(serverId)}/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toolName, arguments: args }),
    signal,
  }, '调用工具失败');
}

export async function importMcpJson(json: string): Promise<{ importedCount: number; snapshot: McpSnapshot }> {
  const result = await requestJson<{ importedCount: number; snapshot: McpSnapshot }>('/api/mcp/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json }),
  }, '导入 MCP 配置失败');
  syncLocalMcpState(result.snapshot);
  return result;
}

export async function refreshAllMcp(): Promise<McpSnapshot> {
  const snapshot = await requestJson<McpSnapshot>('/api/mcp/refresh', {
    method: 'POST',
  }, '刷新 MCP 服务失败');
  return syncLocalMcpState(snapshot);
}

export async function updateLocalMcpEnabled(enabled: boolean): Promise<McpSnapshot> {
  const snapshot = await requestJson<McpSnapshot>('/api/mcp/local', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  }, '更新本机 MCP 开关失败');
  return syncLocalMcpState(snapshot);
}

/** Splits shell-style arguments while respecting single/double quotes and backslashes. */
export function parseArgsText(raw: string): string[] {
  const args: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    if (escaping) {
      current += ch;
      escaping = false;
      continue;
    }
    if (ch === '\\' && quote !== "'") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current.length) {
        args.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (escaping) current += '\\';
  if (current.length) args.push(current);
  return args;
}

export function formatArgsText(args?: string[]): string {
  if (!args?.length) return '';
  return args.map(arg => (/[\s"'\\]/.test(arg) ? JSON.stringify(arg) : arg)).join(' ');
}

export function parseKeyValueLines(raw: string, separator: '=' | ':'): Record<string, string> | undefined {
  const map: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf(separator);
    const altIndex = separator === ':' ? trimmed.indexOf('=') : -1;
    const splitAt = eqIndex >= 0 ? eqIndex : altIndex;
    if (splitAt <= 0) throw new Error(`无效行 "${trimmed}"，请使用 ${separator === '=' ? 'KEY=VALUE' : 'Header: Value'} 格式`);
    const key = trimmed.slice(0, splitAt).trim();
    const value = trimmed.slice(splitAt + 1).trim();
    if (!key) throw new Error(`无效行 "${trimmed}"`);
    map[key] = value;
  }
  return Object.keys(map).length ? map : undefined;
}

export function formatKeyValueLines(map?: Record<string, string>, separator: '=' | ':' = '='): string {
  if (!map) return '';
  const joiner = separator === ':' ? ': ' : '=';
  return Object.entries(map).map(([k, v]) => `${k}${joiner}${v}`).join('\n');
}
