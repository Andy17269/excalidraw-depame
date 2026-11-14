import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fetchDeepSeek } from './deepseekTransport.ts';

export const DEFAULT_BASE_URL = 'https://api.deepseek.com';
export const DEFAULT_MODEL = 'deepseek-flash';
// Credentials come from user settings or DEEPSEEK_API_KEY; never ship a shared key.
export const DEFAULT_API_KEY = '';

export type WebSearchMode = 'auto' | 'always' | 'off';

export interface StoredAiSettings {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  webSearch?: WebSearchMode;
  animationEnabled?: boolean;
}

export interface PublicAiSettings {
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  apiKeySource: 'custom' | 'env' | 'none';
  apiKeyMasked: string;
  webSearch: WebSearchMode;
  animationEnabled: boolean;
  defaultBaseUrl: string;
  defaultModel: string;
}

export interface AiSettingsPatch {
  baseUrl?: unknown;
  apiKey?: unknown;
  clearApiKey?: unknown;
  model?: unknown;
  webSearch?: unknown;
  animationEnabled?: unknown;
}

export interface EffectiveAiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  webSearch: WebSearchMode;
  animationEnabled: boolean;
  apiKeySource: 'custom' | 'env' | 'none';
}

export interface TestAiConnectionResult {
  ok: boolean;
  latencyMs?: number;
  model?: string;
  error?: string;
}

const VALID_WEB_SEARCH = new Set<WebSearchMode>(['auto', 'always', 'off']);
let cachedPath: string | null = null;
let cachedSettings: StoredAiSettings | null = null;

export function resolveAiSettingsPath(): string {
  if (process.env.EXCALIDRAW_AI_SETTINGS_FILE?.trim()) {
    return process.env.EXCALIDRAW_AI_SETTINGS_FILE.trim();
  }
  if (process.env.ACDE_APP_DATA?.trim()) {
    return join(process.env.ACDE_APP_DATA.trim(), 'ai-settings.json');
  }
  if (process.env.XDG_DATA_HOME?.trim()) {
    return join(process.env.XDG_DATA_HOME.trim(), 'excalidraw-depame', 'ai-settings.json');
  }
  return join(homedir(), '.excalidraw-depame', 'ai-settings.json');
}

export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.length > 512) throw new Error('接口地址过长');
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('接口地址格式无效');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('接口地址仅支持 http 或 https');
  }
  if (parsed.username || parsed.password) {
    throw new Error('接口地址不能包含账号密码');
  }
  const cleanPath = parsed.pathname.replace(/\/+$/, '').replace(/\/v1$/i, '');
  return `${parsed.origin}${cleanPath}`;
}

export function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 8) return '••••';
  return `${trimmed.slice(0, 3)}••••${trimmed.slice(-4)}`;
}

function sanitizeStoredSettings(raw: unknown): StoredAiSettings {
  if (!raw || typeof raw !== 'object') return {};
  const record = raw as Record<string, unknown>;
  const next: StoredAiSettings = {};
  if (typeof record.baseUrl === 'string' && record.baseUrl.trim()) {
    try {
      const normalized = normalizeBaseUrl(record.baseUrl);
      if (normalized) next.baseUrl = normalized;
    } catch { /* ignore invalid persisted value */ }
  }
  if (typeof record.apiKey === 'string' && record.apiKey.trim()) {
    next.apiKey = record.apiKey.trim().slice(0, 512);
  }
  if (typeof record.model === 'string' && record.model.trim()) {
    next.model = record.model.trim().slice(0, 128);
  }
  if (typeof record.webSearch === 'string' && VALID_WEB_SEARCH.has(record.webSearch as WebSearchMode)) {
    next.webSearch = record.webSearch as WebSearchMode;
  }
  if (typeof record.animationEnabled === 'boolean') {
    next.animationEnabled = record.animationEnabled;
  }
  return next;
}

async function readStoredAiSettings(): Promise<StoredAiSettings> {
  const filePath = resolveAiSettingsPath();
  if (cachedSettings && cachedPath === filePath) return cachedSettings;
  try {
    const raw = await readFile(filePath, 'utf8');
    cachedPath = filePath;
    cachedSettings = sanitizeStoredSettings(JSON.parse(raw));
    return cachedSettings;
  } catch {
    cachedPath = filePath;
    cachedSettings = {};
    return cachedSettings;
  }
}

async function writeStoredAiSettings(settings: StoredAiSettings): Promise<void> {
  const filePath = resolveAiSettingsPath();
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(settings, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(tempPath, filePath);
  cachedPath = filePath;
  cachedSettings = settings;
}

export function clearAiSettingsCache(): void {
  cachedPath = null;
  cachedSettings = null;
}

function resolveEnvBaseUrl(): string {
  const raw = process.env.DEEPSEEK_BASE_URL?.trim();
  if (!raw) return DEFAULT_BASE_URL;
  try {
    return normalizeBaseUrl(raw) || DEFAULT_BASE_URL;
  } catch {
    return DEFAULT_BASE_URL;
  }
}

function resolveEffectiveFromStored(stored: StoredAiSettings): EffectiveAiConfig {
  const envKey = process.env.DEEPSEEK_API_KEY?.trim() ?? '';
  const envModel = process.env.DEEPSEEK_MODEL?.trim() ?? '';
  const customKey = stored.apiKey?.trim() ?? '';
  const apiKeySource: EffectiveAiConfig['apiKeySource'] = customKey
    ? 'custom'
    : envKey
      ? 'env'
      : 'none';
  return {
    baseUrl: stored.baseUrl?.trim() || resolveEnvBaseUrl(),
    apiKey: customKey || envKey || DEFAULT_API_KEY,
    model: stored.model?.trim() || envModel || DEFAULT_MODEL,
    webSearch: stored.webSearch ?? 'off',
    animationEnabled: stored.animationEnabled ?? true,
    apiKeySource,
  };
}

export async function getEffectiveAiConfig(): Promise<EffectiveAiConfig> {
  return resolveEffectiveFromStored(await readStoredAiSettings());
}

export async function getPublicAiSettings(): Promise<PublicAiSettings> {
  const stored = await readStoredAiSettings();
  const effective = resolveEffectiveFromStored(stored);
  return {
    baseUrl: effective.baseUrl,
    model: effective.model,
    hasApiKey: Boolean(effective.apiKey),
    apiKeySource: effective.apiKeySource,
    apiKeyMasked: effective.apiKeySource === 'custom' ? maskApiKey(effective.apiKey) : '',
    webSearch: effective.webSearch,
    animationEnabled: effective.animationEnabled,
    defaultBaseUrl: DEFAULT_BASE_URL,
    defaultModel: DEFAULT_MODEL,
  };
}

export async function updateAiSettings(patch: AiSettingsPatch): Promise<PublicAiSettings> {
  if (!patch || typeof patch !== 'object') throw new Error('设置参数无效');
  const current = await readStoredAiSettings();
  const next: StoredAiSettings = { ...current };

  if (patch.baseUrl !== undefined) {
    if (typeof patch.baseUrl !== 'string') throw new Error('接口地址格式无效');
    const normalized = normalizeBaseUrl(patch.baseUrl);
    if (!normalized || normalized === resolveEnvBaseUrl()) delete next.baseUrl;
    else next.baseUrl = normalized;
  }

  if (patch.clearApiKey === true) {
    delete next.apiKey;
  } else if (patch.apiKey !== undefined) {
    if (typeof patch.apiKey !== 'string') throw new Error('API Key 格式无效');
    const trimmed = patch.apiKey.trim();
    if (trimmed.length > 512) throw new Error('API Key 过长');
    if (trimmed) next.apiKey = trimmed;
  }

  if (patch.model !== undefined) {
    if (typeof patch.model !== 'string') throw new Error('模型名称格式无效');
    const trimmed = patch.model.trim();
    if (trimmed.length > 128) throw new Error('模型名称过长');
    const fallbackModel = process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL;
    if (!trimmed || trimmed === fallbackModel) delete next.model;
    else next.model = trimmed;
  }

  if (patch.webSearch !== undefined) {
    if (typeof patch.webSearch !== 'string' || !VALID_WEB_SEARCH.has(patch.webSearch as WebSearchMode)) {
      throw new Error('联网模式无效');
    }
    if (patch.webSearch === 'off') delete next.webSearch;
    else next.webSearch = patch.webSearch as WebSearchMode;
  }

  if (patch.animationEnabled !== undefined) {
    if (typeof patch.animationEnabled !== 'boolean') throw new Error('动画开关格式无效');
    if (patch.animationEnabled) delete next.animationEnabled;
    else next.animationEnabled = false;
  }

  await writeStoredAiSettings(next);
  return getPublicAiSettings();
}

export async function resetAiSettings(): Promise<PublicAiSettings> {
  const filePath = resolveAiSettingsPath();
  await rm(filePath, { force: true }).catch(() => {});
  cachedPath = filePath;
  cachedSettings = {};
  return getPublicAiSettings();
}

export async function testAiConnection(draft?: AiSettingsPatch): Promise<TestAiConnectionResult> {
  const stored = await readStoredAiSettings();
  const baseEffective = resolveEffectiveFromStored(stored);

  let baseUrl = baseEffective.baseUrl;
  let model = baseEffective.model;
  let apiKey = baseEffective.apiKey;

  if (draft && typeof draft === 'object') {
    if (typeof draft.baseUrl === 'string' && draft.baseUrl.trim()) {
      baseUrl = normalizeBaseUrl(draft.baseUrl);
    }
    if (typeof draft.model === 'string' && draft.model.trim()) {
      const trimmedModel = draft.model.trim();
      if (trimmedModel.length > 128) throw new Error('模型名称过长');
      model = trimmedModel;
    }
    if (draft.clearApiKey === true) {
      apiKey = process.env.DEEPSEEK_API_KEY?.trim() || DEFAULT_API_KEY;
    } else if (typeof draft.apiKey === 'string' && draft.apiKey.trim()) {
      apiKey = draft.apiKey.trim();
    }
  }

  const startedAt = Date.now();
  try {
    const postProbe = (includeThinking: boolean) => fetchDeepSeek(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        ...(includeThinking ? { thinking: { type: 'disabled' } } : {}),
        stream: false,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
      signal: AbortSignal.timeout(25000),
    });
    let response = await postProbe(true);
    if (response.status === 400) {
      response = await postProbe(false);
    }
    const latencyMs = Date.now() - startedAt;
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { ok: false, error: `API Key 无效或无权限 (${response.status})` };
      }
      if (response.status === 404) {
        return { ok: false, error: `接口或模型不可用 (${response.status})` };
      }
      return { ok: false, error: `服务返回错误 (${response.status})` };
    }
    return { ok: true, latencyMs, model };
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      return { ok: false, error: '连接超时' };
    }
    return { ok: false, error: error instanceof Error && error.message ? error.message : '无法连接到接口地址' };
  }
}
