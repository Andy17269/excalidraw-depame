import { getEffectiveAiConfig } from './aiConfig.ts';

export async function transcribeAudio(audio: Uint8Array): Promise<string> {
  if (audio.byteLength < 44 || audio.byteLength > 8 * 1024 * 1024) throw new Error('音频无效');
  const config = await getEffectiveAiConfig();
  const form = new FormData();
  form.set('file', new Blob([audio as Uint8Array<ArrayBuffer>], { type: 'audio/wav' }), 'speech.wav');
  const response = await fetch(`${config.baseUrl}/v1/tools/asr`, { method: 'POST', headers: { Authorization: `Bearer ${config.apiKey}` }, body: form, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`DeepSeek ${response.status}`);
  const result = await response.json() as { text?: string };
  if (typeof result.text !== 'string' || !result.text.trim()) throw new Error('未识别');
  return result.text.trim();
}
