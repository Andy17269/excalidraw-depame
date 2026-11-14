import { fetchApi } from './apiFetch';

export type WebSearchMode = 'auto' | 'always' | 'off';

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

export interface SaveAiSettingsInput {
  baseUrl?: string;
  apiKey?: string;
  clearApiKey?: boolean;
  model?: string;
  webSearch?: WebSearchMode;
  animationEnabled?: boolean;
}

export interface TestAiConnectionResult {
  ok: boolean;
  latencyMs?: number;
  model?: string;
  error?: string;
}

let animationEnabled = true;
let cachedSettings: PublicAiSettings | null = null;
const listeners = new Set<(settings: PublicAiSettings) => void>();

export function getAiAnimationEnabled(): boolean {
  return animationEnabled;
}

export function getCachedAiSettings(): PublicAiSettings | null {
  return cachedSettings;
}

export function subscribeAiSettings(listener: (settings: PublicAiSettings) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function syncLocalPreferences(settings: PublicAiSettings): PublicAiSettings {
  cachedSettings = settings;
  animationEnabled = settings.animationEnabled !== false;
  for (const listener of listeners) listener(settings);
  return settings;
}

export async function fetchAiSettings(signal?: AbortSignal): Promise<PublicAiSettings> {
  const response = await fetchApi('/api/settings/ai', { method: 'GET', signal });
  const body = await response.json().catch(() => ({})) as PublicAiSettings & { error?: string };
  if (!response.ok) throw new Error(body.error ?? '读取 AI 设置失败');
  return syncLocalPreferences(body);
}

export async function saveAiSettings(input: SaveAiSettingsInput): Promise<PublicAiSettings> {
  const response = await fetchApi('/api/settings/ai', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await response.json().catch(() => ({})) as PublicAiSettings & { error?: string };
  if (!response.ok) throw new Error(body.error ?? '保存 AI 设置失败');
  return syncLocalPreferences(body);
}

export async function resetAiSettings(): Promise<PublicAiSettings> {
  const response = await fetchApi('/api/settings/ai', { method: 'DELETE' });
  const body = await response.json().catch(() => ({})) as PublicAiSettings & { error?: string };
  if (!response.ok) throw new Error(body.error ?? '恢复默认失败');
  return syncLocalPreferences(body);
}

export async function testAiConnection(input: SaveAiSettingsInput, signal?: AbortSignal): Promise<TestAiConnectionResult> {
  const response = await fetchApi('/api/settings/ai/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  const body = await response.json().catch(() => ({ ok: false, error: '连接测试失败' })) as TestAiConnectionResult;
  if (!response.ok) return { ok: false, error: body.error ?? '连接测试失败' };
  return body;
}
