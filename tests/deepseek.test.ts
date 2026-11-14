import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateDiagram, generateDiagramWithTools } from '../server/deepseek.ts';
import { composeCanvas } from '../server/compose.ts';
import { clearAiSettingsCache, testAiConnection, updateAiSettings } from '../server/aiConfig.ts';

async function withWebSearchEnabled(fn: () => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'ds-test-'));
  const prev = process.env.EXCALIDRAW_AI_SETTINGS_FILE;
  process.env.EXCALIDRAW_AI_SETTINGS_FILE = join(dir, 'ai-settings.json');
  clearAiSettingsCache();
  try {
    await updateAiSettings({ webSearch: 'auto' });
    await fn();
  } finally {
    if (prev === undefined) delete process.env.EXCALIDRAW_AI_SETTINGS_FILE;
    else process.env.EXCALIDRAW_AI_SETTINGS_FILE = prev;
    clearAiSettingsCache();
    await rm(dir, { recursive: true, force: true });
  }
}
import { transcribeAudio } from '../server/speech.ts';
import { encodeWav } from '../src/services/audio.ts';
import { fetchApi } from '../src/services/apiFetch.ts';
import { fetchDeepSeek } from '../server/deepseekTransport.ts';

test('DeepSeek retries transient TLS failures without retrying authentication responses', async () => {
  const fetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { if (++calls === 1) throw new TypeError('fetch failed'); return new Response(null, { status: 401 }); };
  try { assert.equal((await fetchDeepSeek('https://api.deepseek.com/test', {})).status, 401); assert.equal(calls, 2); }
  finally { globalThis.fetch = fetch; }
});

test('DeepSeek requests disable thinking and parse structured text blocks', async () => {
  const fetch = globalThis.fetch;
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, body: JSON.parse(String(init?.body)) });
    return Response.json(url.endsWith('/messages')
      ? { content: [{ type: 'text', text: '{"changes":[{"id":"synthetic-test","text":"TEST_ONLY"}]}' }] }
      : { choices: [{ message: { content: 'flowchart LR\nA-->B' } }] });
  };
  try {
    assert.match(await generateDiagram('synthetic test graph'), /^flowchart/);
    assert.deepEqual(await composeCanvas('synthetic test rename', [{ id: 'synthetic-test', type: 'text', text: 'TEST' }]), { changes: [{ id: 'synthetic-test', text: 'TEST_ONLY' }] });
    assert.deepEqual(requests.map(request => request.body.thinking), [{ type: 'disabled' }, { type: 'disabled' }]);
    assert.deepEqual(requests.map(request => request.body.stream), [false, false]);
    assert.equal(requests[0]!.body.model, 'deepseek-flash');
    assert.equal(requests[1]!.body.tools, undefined);
    await withWebSearchEnabled(async () => {
      await composeCanvas('参考测试样式', []);
    });
    assert.ok(Array.isArray(requests[2]!.body.tools));
  } finally { globalThis.fetch = fetch; }
});

test('DeepSeek ASR uses WAV file multipart without invented model parameters', async () => {
  const fetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), 'https://api.deepseek.com/v1/tools/asr');
    const form = init!.body as FormData;
    const file = form.get('file') as File;
    assert.equal(file.name, 'speech.wav');
    assert.equal(file.type, 'audio/wav');
    assert.equal(form.has('model'), false);
    return Response.json({ text: '合成测试' });
  };
  try { assert.equal(await transcribeAudio(new Uint8Array(encodeWav([new Float32Array(8000)], 16000))), '合成测试'); }
  finally { globalThis.fetch = fetch; }
});

test('append requests retry plans that only rename existing content', async () => {
  const fetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => Response.json({ content: [{ type: 'text', text: JSON.stringify(++calls === 1 ? { changes: [{ id: 'existing', text: '错误替换' }] } : { mermaid: 'flowchart TD\nA["新节点"]' }) }] });
  try {
    assert.deepEqual(await composeCanvas('追加一个节点', []), { mermaid: 'flowchart TD\nA["新节点"]' });
    assert.equal(calls, 2);
  } finally { globalThis.fetch = fetch; }
});

test('composeCanvas extracts JSON objects wrapped in prose or fences', async () => {
  const fetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    content: [{ type: 'text', text: '好的，以下是调整后的方案：\n```json\n{"changes":[{"id":"box-1","backgroundColor":"#0f172a"}]}\n```\n请查看。' }],
  });
  try {
    assert.deepEqual(await composeCanvas('改背景', [{ id: 'box-1', type: 'rectangle' }]), {
      changes: [{ id: 'box-1', backgroundColor: '#0f172a' }],
    });
  } finally { globalThis.fetch = fetch; }
});

test('testAiConnection retries without thinking when provider rejects extra parameter', async () => {
  const fetch = globalThis.fetch;
  const bodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    bodies.push(body);
    if ('thinking' in body) return new Response('unsupported parameter', { status: 400 });
    return Response.json({ choices: [{ message: { content: 'hi' } }] });
  };
  try {
    const res = await testAiConnection({ baseUrl: 'https://compat.example/v1', apiKey: 'sk-test-1234', model: 'gpt-4o-mini' });
    assert.equal(res.ok, true);
    assert.equal(bodies.length, 2);
    assert.equal('thinking' in bodies[0]!, true);
    assert.equal('thinking' in bodies[1]!, false);
  } finally { globalThis.fetch = fetch; }
});

test('fetchApi retries once after transient connector disconnect TypeError', async () => {
  const fetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    if (++calls === 1) throw new TypeError('Failed to fetch');
    return Response.json({ ok: true });
  };
  try {
    const res = await fetchApi('/api/generate', { method: 'POST' });
    assert.equal(res.status, 200);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = fetch; }
});

test('generateDiagramWithTools enables deepseek_web_search when webSearch option is true and reports usedTools', async () => {
  const fetch = globalThis.fetch;
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    return Response.json({
      content: [
        { type: 'server_tool_use', id: 'ws-1', name: 'deepseek_web_search' },
        { type: 'web_search_tool_result' },
        { type: 'text', text: 'flowchart TD\nA["搜索结果"]-->B["生成图表"]' },
      ],
    });
  };
  try {
    await withWebSearchEnabled(async () => {
      const result = await generateDiagramWithTools('React 19 架构', { webSearch: true });
      assert.equal(requests.length, 1);
      assert.match(requests[0]!.url, /\/anthropic\/v1\/messages$/);
      const toolNames = (requests[0]!.body.tools as Array<{ name: string }>).map(t => t.name);
      assert.ok(toolNames.includes('deepseek_web_search'));
      assert.ok(toolNames.includes('deepseek_read_url'));
      assert.deepEqual(result.usedTools, ['deepseek_web_search']);
      assert.equal(result.webSearchEnabled, true);
      assert.match(result.mermaid, /^flowchart TD/);
    });
  } finally { globalThis.fetch = fetch; }
});

test('composeCanvas honors explicit webSearch option and invokes onToolsUsed callback', async () => {
  const fetch = globalThis.fetch;
  const requests: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return Response.json({
      content: [
        { type: 'server_tool_use', id: 'ws-2', name: 'deepseek_web_search' },
        { type: 'text', text: '{"mermaid":"flowchart LR\\nA[\\"最新\\"]-->B[\\"架构\\"]"}' },
      ],
    });
  };
  try {
    let reportedTools: string[] = [];
    let reportedWebSearch = false;
    let plan: unknown;
    await withWebSearchEnabled(async () => {
      plan = await composeCanvas('梳理架构', [], undefined, false, {
        webSearch: true,
        onToolsUsed: (tools, webSearchOn) => {
          reportedTools = tools;
          reportedWebSearch = webSearchOn;
        },
      });
    });
    assert.ok(Array.isArray(requests[0]!.tools));
    assert.deepEqual(reportedTools, ['deepseek_web_search']);
    assert.equal(reportedWebSearch, true);
    assert.deepEqual(plan, { mermaid: 'flowchart LR\nA["最新"]-->B["架构"]' });
  } finally { globalThis.fetch = fetch; }
});
