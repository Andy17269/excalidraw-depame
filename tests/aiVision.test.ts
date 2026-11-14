import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import backend from '../server.ts';
import { extractVisionElements, generateVisionUi } from '../server/visionUi.ts';
import { UI_ASSETS, queryUiAssets } from '../src/services/uiAssets.ts';
import { sanitizeVisionElements } from '../src/services/visionSanitize.ts';

test('UI asset catalog contains 45 existing files across 5 categories', () => {
  assert.equal(UI_ASSETS.length, 45);
  const counts = new Map<string, number>();
  const ids = new Set<string>();
  for (const asset of UI_ASSETS) {
    assert.ok(!ids.has(asset.id), `Duplicate asset id: ${asset.id}`);
    ids.add(asset.id);
    counts.set(asset.category, (counts.get(asset.category) ?? 0) + 1);
    const fullPath = resolve('public', asset.path);
    assert.ok(existsSync(fullPath), `Missing asset file: ${fullPath}`);
    assert.ok(statSync(fullPath).size > 500, `Asset file too small: ${fullPath}`);
    assert.ok(asset.recommendedTextColor === '#ffffff' || asset.recommendedTextColor === '#0f172a');
    assert.ok(asset.safeArea.note.length > 5);
  }
  assert.deepEqual(Object.fromEntries(counts), { hero: 9, metric: 5, media: 21, profile: 5, list: 5 });
});

test('queryUiAssets filters by category and keywords', () => {
  const weather = queryUiAssets('list', '天气');
  assert.equal(weather[0]?.id, 'list-weather-widget');
  const hero = queryUiAssets('hero');
  assert.equal(hero.length, 9);
  assert.equal(queryUiAssets('all', '购物').filter(asset => asset.id.startsWith('shopping-')).length, 10);
  assert.equal(queryUiAssets('all', '科技').length, 10);
});

test('extractVisionElements strips code fences and rejects empty payloads', () => {
  const parsed = extractVisionElements('```json\n[{"type":"rectangle","x":0,"y":0,"width":100,"height":40}]\n```');
  assert.equal(parsed.length, 1);
  assert.throws(() => extractVisionElements('[]'), /未生成有效 UI 元素/);
});

test('generateVisionUi executes get_ui_assets tool loop and returns UI elements', async () => {
  const fetch = globalThis.fetch;
  let messageCall = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/files')) return Response.json({ id: 'file-sketch-1' });
    messageCall++;
    if (messageCall === 1) {
      return Response.json({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'tool-1', name: 'get_ui_assets', input: { category: 'hero', query: 'ai' } }],
      });
    }
    const body = JSON.parse(String(init?.body)) as { stream?: boolean; messages: Array<{ role: string; content: Array<{ type: string; content?: string }> }> };
    assert.equal(body.stream, false);
    const toolResult = body.messages.at(-1)?.content[0];
    assert.equal(toolResult?.type, 'tool_result');
    assert.match(toolResult?.content ?? '', /hero-ai-assistant/);
    assert.match(toolResult?.content ?? '', /safeArea/);
    assert.match(toolResult?.content ?? '', /recommendedTextColor/);
    return Response.json({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: JSON.stringify([{ type: 'image', assetId: 'hero-ai-assistant', x: 20, y: 20, width: 320, height: 180 }]) }],
    });
  };
  try {
    const elements = await generateVisionUi('data:image/png;base64,iVBORw0KGgo=', '科技感首页', { width: 320, height: 180 });
    assert.equal(messageCall, 2);
    assert.equal(elements.length, 1);
  } finally {
    globalThis.fetch = fetch;
  }
});

test('POST /api/vision-ui validates PNG data URL before calling DeepSeek', async () => {
  const response = await backend.fetch(new Request('http://localhost/api/vision-ui', {
    method: 'POST',
    body: JSON.stringify({ image: 'not-a-png', prompt: '' }),
  }));
  assert.equal(response.status, 400);
});

test('sanitizeVisionElements keeps valid shapes and fixes low-contrast text over UI cards and containers', () => {
  const sanitized = sanitizeVisionElements([
    { type: 'rectangle', x: 0, y: 0, width: 390, height: 844, backgroundColor: '#ffffff', strokeColor: '#cbd5e1', label: { text: '标题', strokeColor: '#ffffff' } },
    { type: 'image', assetId: 'hero-analytics-promo', x: 24, y: 120, width: 342, height: 192 },
    { type: 'text', x: 40, y: 140, text: '浅底误用白字', strokeColor: '#ffffff' },
    { type: 'image', assetId: 'hero-ai-assistant', x: 24, y: 340, width: 342, height: 180 },
    { type: 'text', x: 40, y: 480, text: '深底误用黑字', strokeColor: '#0f172a' },
    { type: 'image', assetId: 'unknown-asset', x: 0, y: 0, width: 100, height: 100 },
    { type: 'script', x: 0, y: 0 },
    { type: 'text', x: Number.NaN, y: 10, text: 'hello' },
  ]);
  assert.equal(sanitized.shapes.length, 4);
  assert.equal((sanitized.shapes[0]!.label as { strokeColor: string }).strokeColor, '#0f172a');
  assert.equal(sanitized.shapes[1]!.strokeColor, '#0f172a');
  assert.equal(sanitized.shapes[2]!.strokeColor, '#ffffff');
  assert.equal(sanitized.images.length, 2);
  assert.equal(sanitized.images[0]?.assetId, 'hero-analytics-promo');
  assert.match(sanitized.texts, /标题/);
});
