import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type McpTransportType = 'stdio' | 'http' | 'sse';
export type McpConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface McpServerConfig {
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
}

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpServerView extends McpServerConfig {
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

export interface McpServerInput {
  id?: unknown;
  name?: unknown;
  transport?: unknown;
  enabled?: unknown;
  command?: unknown;
  args?: unknown;
  env?: unknown;
  cwd?: unknown;
  url?: unknown;
  headers?: unknown;
  disabledTools?: unknown;
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
  content?: unknown[];
  error?: string;
}

export interface AiMcpToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface AiMcpToolBinding {
  serverId: string;
  toolName: string;
}

interface StoredMcpState {
  localMcpEnabled?: boolean;
  servers: McpServerConfig[];
}

interface ActiveMcpConnection {
  status: McpConnectionStatus;
  error?: string;
  tools: McpToolInfo[];
  lastConnectedAt?: number;
  serverVersion?: { name: string; version: string };
  client?: Client;
  transport?: Transport;
  connectingPromise?: Promise<void>;
}

const VALID_TRANSPORTS = new Set<McpTransportType>(['stdio', 'http', 'sse']);
const CONNECT_TIMEOUT_MS = 15000;
const CALL_TIMEOUT_MS = 30000;

let cachedPath: string | null = null;
let cachedState: StoredMcpState | null = null;
const activeConnections = new Map<string, ActiveMcpConnection>();

export function resolveMcpSettingsPath(): string {
  if (process.env.EXCALIDRAW_MCP_SETTINGS_FILE?.trim()) {
    return process.env.EXCALIDRAW_MCP_SETTINGS_FILE.trim();
  }
  if (process.env.ACDE_APP_DATA?.trim()) {
    return join(process.env.ACDE_APP_DATA.trim(), 'mcp-servers.json');
  }
  if (process.env.XDG_DATA_HOME?.trim()) {
    return join(process.env.XDG_DATA_HOME.trim(), 'excalidraw-depame', 'mcp-servers.json');
  }
  return join(homedir(), '.excalidraw-depame', 'mcp-servers.json');
}

function resolveProjectRoot(): string {
  try {
    // acde may place backend/server.js in a deeply nested --out directory.
    // Its process cwd is app data, so resolve project scripts from the module.
    let candidate = dirname(fileURLToPath(import.meta.url));
    while (true) {
      if (existsSync(join(candidate, 'scripts', 'canvas-mcp.mjs'))) return candidate;
      const parent = dirname(candidate);
      if (parent === candidate) break;
      candidate = parent;
    }
  } catch { /* fallback to cwd */ }
  return process.cwd();
}

function normalizeStringMap(raw: unknown, label: string): Record<string, string> | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${label}格式无效`);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const cleanKey = key.trim();
    if (!cleanKey) continue;
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      throw new Error(`${label}包含无效值`);
    }
    out[cleanKey] = String(value);
  }
  return Object.keys(out).length ? out : undefined;
}

function normalizeStringArray(raw: unknown, label: string): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new Error(`${label}必须是数组`);
  return raw.map(item => {
    if (typeof item !== 'string') throw new Error(`${label}仅支持字符串`);
    return item;
  }).filter(item => item.length > 0);
}

function normalizeHttpUrl(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('请填写服务地址 URL');
  const trimmed = raw.trim();
  if (trimmed.length > 1024) throw new Error('服务地址过长');
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('服务地址 URL 格式无效');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('服务地址仅支持 http 或 https');
  }
  return parsed.toString();
}

function slugifyId(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || `mcp-${Date.now().toString(36)}`;
}

function makeUniqueId(preferred: string, existingIds: Set<string>): string {
  const base = slugifyId(preferred);
  if (!existingIds.has(base)) return base;
  for (let index = 2; index < 1000; index++) {
    const candidate = `${base}-${index}`;
    if (!existingIds.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

function validateServerInput(input: McpServerInput, id: string): McpServerConfig {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) throw new Error('请填写服务名称');
  if (name.length > 80) throw new Error('服务名称过长');

  let transport: McpTransportType;
  if (input.transport === undefined) {
    transport = typeof input.url === 'string' && input.url.trim() ? 'http' : 'stdio';
  } else if (typeof input.transport === 'string' && VALID_TRANSPORTS.has(input.transport as McpTransportType)) {
    transport = input.transport as McpTransportType;
  } else {
    throw new Error('不支持的传输类型');
  }

  const enabled = input.enabled === undefined ? true : Boolean(input.enabled);
  const disabledTools = normalizeStringArray(input.disabledTools, '禁用工具列表');

  if (transport === 'stdio') {
    const command = typeof input.command === 'string' ? input.command.trim() : '';
    if (!command) throw new Error('请填写启动命令');
    if (command.length > 512) throw new Error('启动命令过长');
    const args = normalizeStringArray(input.args, '命令参数');
    const env = normalizeStringMap(input.env, '环境变量');
    const cwd = typeof input.cwd === 'string' && input.cwd.trim() ? input.cwd.trim() : undefined;
    return {
      id,
      name,
      transport,
      enabled,
      command,
      ...(args.length ? { args } : {}),
      ...(env ? { env } : {}),
      ...(cwd ? { cwd } : {}),
      ...(disabledTools.length ? { disabledTools } : {}),
    };
  }

  const url = normalizeHttpUrl(input.url);
  const headers = normalizeStringMap(input.headers, '请求头');
  return {
    id,
    name,
    transport,
    enabled,
    url,
    ...(headers ? { headers } : {}),
    ...(disabledTools.length ? { disabledTools } : {}),
  };
}

function sanitizeStoredState(raw: unknown): StoredMcpState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { localMcpEnabled: true, servers: [] };
  const record = raw as Record<string, unknown>;
  const localMcpEnabled = typeof record.localMcpEnabled === 'boolean' ? record.localMcpEnabled : true;
  const rawServers = Array.isArray(record.servers) ? record.servers : [];
  const servers: McpServerConfig[] = [];
  const seen = new Set<string>();
  for (const item of rawServers) {
    if (!item || typeof item !== 'object') continue;
    try {
      const candidate = item as McpServerInput;
      const rawId = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : String(candidate.name ?? '');
      const id = makeUniqueId(rawId, seen);
      const validated = validateServerInput(candidate, id);
      seen.add(id);
      servers.push(validated);
    } catch {
      /* skip malformed entry */
    }
  }
  return { localMcpEnabled, servers };
}

async function readStoredMcpState(): Promise<StoredMcpState> {
  const filePath = resolveMcpSettingsPath();
  if (cachedState && cachedPath === filePath) return cachedState;
  try {
    const raw = await readFile(filePath, 'utf8');
    cachedPath = filePath;
    cachedState = sanitizeStoredState(JSON.parse(raw));
    return cachedState;
  } catch {
    cachedPath = filePath;
    cachedState = { localMcpEnabled: true, servers: [] };
    return cachedState;
  }
}

async function writeStoredMcpState(state: StoredMcpState): Promise<void> {
  const filePath = resolveMcpSettingsPath();
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(tempPath, filePath);
  cachedPath = filePath;
  cachedState = state;
}

export function clearMcpCache(): void {
  cachedPath = null;
  cachedState = null;
}

function buildLocalServerInfo(enabled: boolean): LocalWhiteboardMcpInfo {
  const projectRoot = resolveProjectRoot();
  const scriptPath = join(projectRoot, 'scripts', 'canvas-mcp.mjs');
  const clientConfig = {
    mcpServers: {
      'dopame-canvas': {
        command: 'node',
        args: [scriptPath],
      },
    },
  };
  return {
    name: 'dopame-canvas',
    enabled,
    command: 'node',
    scriptPath,
    tools: [
      { name: 'draw_diagram', description: '将 Mermaid 流程图或思维导图追加到当前白板' },
      { name: 'read_canvas', description: '读取当前白板未删除元素与文本摘要' },
    ],
    clientConfigJson: JSON.stringify(clientConfig, null, 2),
  };
}

function toServerView(config: McpServerConfig): McpServerView {
  const runtime = activeConnections.get(config.id);
  return {
    ...config,
    status: runtime?.status ?? 'disconnected',
    ...(runtime?.error ? { error: runtime.error } : {}),
    tools: runtime?.tools ?? [],
    ...(runtime?.lastConnectedAt ? { lastConnectedAt: runtime.lastConnectedAt } : {}),
    ...(runtime?.serverVersion ? { serverVersion: runtime.serverVersion } : {}),
  };
}

function buildTransport(config: McpServerConfig): { transport: Transport; getStderr: () => string } {
  let stderrTail = '';
  if (config.transport === 'stdio') {
    const mergedEnv = config.env
      ? { ...getDefaultEnvironment(), ...config.env }
      : getDefaultEnvironment();
    const command = config.command === 'node' ? process.execPath : config.command!;
    const transport = new StdioClientTransport({
      command,
      args: config.args ?? [],
      env: mergedEnv,
      cwd: config.cwd || resolveProjectRoot(),
      stderr: 'pipe',
    });
    transport.stderr?.on('data', (chunk: Buffer | string) => {
      stderrTail = `${stderrTail}${String(chunk)}`.slice(-1200);
    });
    return { transport, getStderr: () => stderrTail.trim() };
  }

  const targetUrl = new URL(config.url!);
  const requestInit = config.headers ? { headers: config.headers } : undefined;
  if (config.transport === 'sse') {
    const transport = new SSEClientTransport(targetUrl, requestInit ? { requestInit } : undefined);
    return { transport, getStderr: () => '' };
  }
  const transport = new StreamableHTTPClientTransport(targetUrl, requestInit ? { requestInit } : undefined);
  return { transport, getStderr: () => '' };
}

function formatConnectionError(error: unknown, stderr: string): string {
  const base = error instanceof Error ? error.message : '连接失败';
  if (!stderr) return base;
  const lastLine = stderr.split(/\r?\n/).filter(Boolean).slice(-2).join(' ');
  return lastLine && !base.includes(lastLine) ? `${base} (${lastLine.slice(0, 180)})` : base;
}

async function openClientConnection(config: McpServerConfig): Promise<{
  client: Client;
  transport: Transport;
  tools: McpToolInfo[];
  serverVersion?: { name: string; version: string };
}> {
  const client = new Client({ name: 'excalidraw-depame', version: '1.0.0' });
  const { transport, getStderr } = buildTransport(config);
  try {
    await client.connect(transport, { timeout: CONNECT_TIMEOUT_MS });
    const listed = await client.listTools(undefined, { timeout: CONNECT_TIMEOUT_MS });
    const tools: McpToolInfo[] = (listed.tools ?? []).map(tool => ({
      name: tool.name,
      ...(tool.description ? { description: tool.description } : {}),
      ...(tool.inputSchema ? { inputSchema: tool.inputSchema as Record<string, unknown> } : {}),
    }));
    const serverVersion = client.getServerVersion();
    return {
      client,
      transport,
      tools,
      ...(serverVersion ? { serverVersion: { name: serverVersion.name, version: serverVersion.version } } : {}),
    };
  } catch (error) {
    await Promise.allSettled([client.close(), transport.close()]);
    throw new Error(formatConnectionError(error, getStderr()));
  }
}

async function disconnectRuntime(id: string): Promise<void> {
  const current = activeConnections.get(id);
  if (!current) return;
  activeConnections.delete(id);
  await Promise.allSettled([current.client?.close(), current.transport?.close()]);
}

export async function disconnectAllMcpServers(): Promise<void> {
  const ids = [...activeConnections.keys()];
  await Promise.allSettled(ids.map(id => disconnectRuntime(id)));
}

export async function connectMcpServer(id: string): Promise<McpServerView> {
  const state = await readStoredMcpState();
  const config = state.servers.find(server => server.id === id);
  if (!config) throw new Error('未找到指定的 MCP 服务');

  const existing = activeConnections.get(id);
  if (existing?.connectingPromise) {
    await existing.connectingPromise;
    return toServerView(config);
  }

  await disconnectRuntime(id);

  const runtime: ActiveMcpConnection = {
    status: 'connecting',
    tools: existing?.tools ?? [],
  };
  activeConnections.set(id, runtime);

  const task = (async () => {
    try {
      const opened = await openClientConnection(config);
      if (activeConnections.get(id) !== runtime) {
        await Promise.allSettled([opened.client.close(), opened.transport.close()]);
        return;
      }
      runtime.client = opened.client;
      runtime.transport = opened.transport;
      runtime.tools = opened.tools;
      runtime.serverVersion = opened.serverVersion;
      runtime.lastConnectedAt = Date.now();
      runtime.status = 'connected';
      runtime.error = undefined;

      opened.transport.onclose = () => {
        if (activeConnections.get(id) === runtime && runtime.status === 'connected') {
          runtime.status = 'disconnected';
        }
      };
      opened.transport.onerror = err => {
        if (activeConnections.get(id) === runtime) {
          runtime.status = 'error';
          runtime.error = err.message || '连接中断';
        }
      };
    } catch (error) {
      if (activeConnections.get(id) === runtime) {
        runtime.status = 'error';
        runtime.error = error instanceof Error ? error.message : '连接失败';
      }
    } finally {
      runtime.connectingPromise = undefined;
    }
  })();

  runtime.connectingPromise = task;
  await task;
  return toServerView(config);
}

export async function disconnectMcpServer(id: string): Promise<McpServerView> {
  const state = await readStoredMcpState();
  const config = state.servers.find(server => server.id === id);
  if (!config) throw new Error('未找到指定的 MCP 服务');
  await disconnectRuntime(id);
  return toServerView(config);
}

export async function getMcpSnapshot(): Promise<McpSnapshot> {
  const state = await readStoredMcpState();
  return {
    servers: state.servers.map(toServerView),
    localServer: buildLocalServerInfo(state.localMcpEnabled !== false),
  };
}

export async function createMcpServer(input: McpServerInput): Promise<McpSnapshot> {
  const state = await readStoredMcpState();
  const existingIds = new Set(state.servers.map(server => server.id));
  const rawId = typeof input.id === 'string' && input.id.trim() ? input.id.trim() : String(input.name ?? '');
  const id = makeUniqueId(rawId, existingIds);
  const config = validateServerInput(input, id);
  const nextState: StoredMcpState = { ...state, servers: [...state.servers, config] };
  await writeStoredMcpState(nextState);
  if (config.enabled) {
    await connectMcpServer(config.id).catch(() => {});
  }
  return getMcpSnapshot();
}

export async function updateMcpServer(id: string, patch: McpServerInput): Promise<McpSnapshot> {
  const state = await readStoredMcpState();
  const index = state.servers.findIndex(server => server.id === id);
  if (index === -1) throw new Error('未找到指定的 MCP 服务');
  const existing = state.servers[index]!;

  const merged: McpServerInput = {
    name: patch.name !== undefined ? patch.name : existing.name,
    transport: patch.transport !== undefined ? patch.transport : existing.transport,
    enabled: patch.enabled !== undefined ? patch.enabled : existing.enabled,
    command: patch.command !== undefined ? patch.command : existing.command,
    args: patch.args !== undefined ? patch.args : existing.args,
    env: patch.env !== undefined ? patch.env : existing.env,
    cwd: patch.cwd !== undefined ? patch.cwd : existing.cwd,
    url: patch.url !== undefined ? patch.url : existing.url,
    headers: patch.headers !== undefined ? patch.headers : existing.headers,
    disabledTools: patch.disabledTools !== undefined ? patch.disabledTools : existing.disabledTools,
  };
  const updated = validateServerInput(merged, id);
  const nextServers = [...state.servers];
  nextServers[index] = updated;
  await writeStoredMcpState({ ...state, servers: nextServers });

  const connectionSensitiveChanged =
    updated.transport !== existing.transport
    || updated.command !== existing.command
    || JSON.stringify(updated.args ?? []) !== JSON.stringify(existing.args ?? [])
    || JSON.stringify(updated.env ?? {}) !== JSON.stringify(existing.env ?? {})
    || updated.cwd !== existing.cwd
    || updated.url !== existing.url
    || JSON.stringify(updated.headers ?? {}) !== JSON.stringify(existing.headers ?? {});

  if (!updated.enabled) {
    await disconnectRuntime(id);
  } else if (connectionSensitiveChanged || activeConnections.get(id)?.status !== 'connected') {
    await connectMcpServer(id).catch(() => {});
  }
  return getMcpSnapshot();
}

export async function deleteMcpServer(id: string): Promise<McpSnapshot> {
  const state = await readStoredMcpState();
  if (!state.servers.some(server => server.id === id)) throw new Error('未找到指定的 MCP 服务');
  await disconnectRuntime(id);
  const nextServers = state.servers.filter(server => server.id !== id);
  await writeStoredMcpState({ ...state, servers: nextServers });
  return getMcpSnapshot();
}

export async function testMcpServerDraft(input: McpServerInput): Promise<McpTestResult> {
  let config: McpServerConfig;
  try {
    config = validateServerInput({ ...input, name: input.name || 'test-server' }, 'draft');
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '配置参数无效' };
  }
  const startedAt = Date.now();
  try {
    const opened = await openClientConnection(config);
    const latencyMs = Date.now() - startedAt;
    await Promise.allSettled([opened.client.close(), opened.transport.close()]);
    return {
      ok: true,
      latencyMs,
      tools: opened.tools,
      ...(opened.serverVersion ? { serverVersion: opened.serverVersion } : {}),
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '连接测试失败' };
  }
}

export async function callMcpServerTool(
  serverId: string,
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<McpToolCallResult> {
  if (!toolName.trim()) throw new Error('工具名称无效');
  const state = await readStoredMcpState();
  const config = state.servers.find(server => server.id === serverId);
  if (!config) throw new Error('未找到指定的 MCP 服务');

  let runtime = activeConnections.get(serverId);
  if (!runtime || runtime.status !== 'connected' || !runtime.client) {
    await connectMcpServer(serverId);
    runtime = activeConnections.get(serverId);
  }
  if (!runtime || runtime.status !== 'connected' || !runtime.client) {
    return { ok: false, text: '', error: runtime?.error || 'MCP 服务未连接' };
  }

  try {
    const result = await runtime.client.callTool(
      { name: toolName, arguments: args },
      undefined,
      { timeout: CALL_TIMEOUT_MS },
    );
    const blocks = Array.isArray(result.content) ? result.content : [];
    const text = blocks.map(block => {
      if (block && typeof block === 'object' && 'text' in block && typeof block.text === 'string') {
        return block.text;
      }
      return JSON.stringify(block);
    }).join('\n').trim() || JSON.stringify(result);
    return {
      ok: !result.isError,
      isError: Boolean(result.isError),
      text,
      content: blocks,
    };
  } catch (error) {
    return {
      ok: false,
      text: '',
      error: error instanceof Error ? error.message : '工具调用失败',
    };
  }
}

export async function importMcpServersJson(rawJson: string): Promise<{ importedCount: number; snapshot: McpSnapshot }> {
  if (typeof rawJson !== 'string' || !rawJson.trim()) throw new Error('请输入 MCP 配置 JSON');
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('JSON 解析失败，请检查格式');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('配置必须是一个 JSON 对象');
  }
  const root = parsed as Record<string, unknown>;
  const mapSource = root.mcpServers && typeof root.mcpServers === 'object' && !Array.isArray(root.mcpServers)
    ? root.mcpServers as Record<string, unknown>
    : root;

  const entries = Object.entries(mapSource);
  if (!entries.length) throw new Error('未在 JSON 中找到任何 MCP 服务配置');

  const state = await readStoredMcpState();
  const nextServers = [...state.servers];
  const existingIds = new Set(nextServers.map(server => server.id));
  const touchedIds: string[] = [];

  for (const [key, rawEntry] of entries) {
    if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
      throw new Error(`服务 "${key}" 配置无效`);
    }
    const entry = rawEntry as Record<string, unknown>;
    const transport: McpTransportType = typeof entry.type === 'string' && VALID_TRANSPORTS.has(entry.type as McpTransportType)
      ? entry.type as McpTransportType
      : typeof entry.transport === 'string' && VALID_TRANSPORTS.has(entry.transport as McpTransportType)
        ? entry.transport as McpTransportType
        : typeof entry.url === 'string' && entry.url.trim()
          ? 'http'
          : 'stdio';

    const existingIdx = nextServers.findIndex(server => server.id === slugifyId(key) || server.name === key);
    const id = existingIdx >= 0 ? nextServers[existingIdx]!.id : makeUniqueId(key, existingIds);
    existingIds.add(id);

    const validated = validateServerInput({
      name: typeof entry.name === 'string' && entry.name.trim() ? entry.name : key,
      transport,
      enabled: entry.disabled === true ? false : entry.enabled === undefined ? true : Boolean(entry.enabled),
      command: entry.command,
      args: entry.args,
      env: entry.env,
      cwd: entry.cwd,
      url: entry.url,
      headers: entry.headers,
      disabledTools: entry.disabledTools,
    }, id);

    if (existingIdx >= 0) nextServers[existingIdx] = validated;
    else nextServers.push(validated);
    touchedIds.push(id);
  }

  await writeStoredMcpState({ ...state, servers: nextServers });
  await Promise.allSettled(
    touchedIds.map(async id => {
      const server = nextServers.find(item => item.id === id);
      if (server?.enabled) await connectMcpServer(id);
      else await disconnectRuntime(id);
    }),
  );

  return { importedCount: touchedIds.length, snapshot: await getMcpSnapshot() };
}

export async function refreshAllMcpServers(): Promise<McpSnapshot> {
  const state = await readStoredMcpState();
  await Promise.allSettled(
    state.servers.map(server => server.enabled ? connectMcpServer(server.id) : disconnectRuntime(server.id)),
  );
  return getMcpSnapshot();
}

export async function setLocalMcpEnabled(enabled: boolean): Promise<McpSnapshot> {
  const state = await readStoredMcpState();
  await writeStoredMcpState({ ...state, localMcpEnabled: Boolean(enabled) });
  return getMcpSnapshot();
}

function buildSafeToolName(serverIndex: number, toolName: string, used: Set<string>): string {
  const sanitized = toolName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 44) || 'tool';
  let candidate = `mcp_${serverIndex}_${sanitized}`;
  if (!used.has(candidate)) {
    used.add(candidate);
    return candidate;
  }
  for (let suffix = 2; suffix < 1000; suffix++) {
    const next = `${candidate.slice(0, 56)}_${suffix}`;
    if (!used.has(next)) {
      used.add(next);
      return next;
    }
  }
  return `mcp_${serverIndex}_${Date.now().toString(36)}`;
}

/**
 * Ensures enabled external MCP servers are connected and returns Anthropic-compatible
 * tool definitions alongside a binding map for routing tool calls.
 */
export async function prepareAiMcpTools(): Promise<{
  tools: AiMcpToolDefinition[];
  bindings: Map<string, AiMcpToolBinding>;
}> {
  const state = await readStoredMcpState();
  const enabledServers = state.servers.filter(server => server.enabled);
  const tools: AiMcpToolDefinition[] = [];
  const bindings = new Map<string, AiMcpToolBinding>();
  if (!enabledServers.length) return { tools, bindings };

  await Promise.allSettled(
    enabledServers.map(async server => {
      const runtime = activeConnections.get(server.id);
      if (!runtime || runtime.status === 'disconnected') {
        await connectMcpServer(server.id);
      }
    }),
  );

  const usedNames = new Set<string>();
  enabledServers.forEach((server, serverIndex) => {
    const runtime = activeConnections.get(server.id);
    if (!runtime || runtime.status !== 'connected') return;
    const disabled = new Set(server.disabledTools ?? []);
    for (const tool of runtime.tools) {
      if (disabled.has(tool.name)) continue;
      const exposedName = buildSafeToolName(serverIndex, tool.name, usedNames);
      bindings.set(exposedName, { serverId: server.id, toolName: tool.name });
      tools.push({
        name: exposedName,
        description: `[MCP:${server.name}] ${tool.description || tool.name}`,
        input_schema: tool.inputSchema && typeof tool.inputSchema === 'object'
          ? tool.inputSchema
          : { type: 'object', properties: {} },
      });
    }
  });

  return { tools, bindings };
}

export async function executeAiMcpTool(
  exposedName: string,
  input: Record<string, unknown> | undefined,
  bindings: Map<string, AiMcpToolBinding>,
): Promise<string> {
  const binding = bindings.get(exposedName);
  if (!binding) return JSON.stringify({ error: '未知工具' });
  const result = await callMcpServerTool(binding.serverId, binding.toolName, input ?? {});
  if (!result.ok) {
    return JSON.stringify({ error: result.error || result.text || '工具执行失败' });
  }
  return result.text.slice(0, 24000);
}
