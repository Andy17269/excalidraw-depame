import { createHash } from 'node:crypto';
import { fetchDeepSeek } from './deepseekTransport.ts';
import { getEffectiveAiConfig } from './aiConfig.ts';

const files = new Map<string, { id: string; at: number }>();

export async function uploadCanvasImage(image: string): Promise<string> {
  if (!image.startsWith('data:image/png;base64,') || image.length > 4 * 1024 * 1024) throw new Error('截图无效');
  const config = await getEffectiveAiConfig();
  const key = createHash('sha256').update(`${config.baseUrl}\0${config.apiKey}\0${image}`).digest('hex');
  const cached = files.get(key);
  if (cached && Date.now() - cached.at < 600000) return cached.id;
  const form = new FormData();
  form.set('purpose', 'rich_layout_recognition');
  form.set('file', new Blob([Buffer.from(image.split(',')[1]!, 'base64')], { type: 'image/png' }), 'canvas.png');
  const response = await fetchDeepSeek(`${config.baseUrl}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: form,
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`DeepSeek ${response.status}`);
  const body = await response.json() as { id: string };
  if (!body.id) throw new Error('识图失败');
  if (files.size >= 8) files.delete(files.keys().next().value!);
  files.set(key, { id: body.id, at: Date.now() });
  return body.id;
}
