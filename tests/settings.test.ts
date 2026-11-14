import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import backend from '../server.ts';
import { clearAiSettingsCache, DEFAULT_API_KEY } from '../server/aiConfig.ts';
import { generateDiagram } from '../server/deepseek.ts';
import { composeCanvas } from '../server/compose.ts';
import {
  clearMcpCache,
  disconnectAllMcpServers,
  prepareAiMcpTools,
} from '../server/mcpManager.ts';
import { formatArgsText, parseArgsText, parseKeyValueLines } from '../src/services/mcpSettings.ts';

test('AI settings API persists custom config without leaking API key and routes AI calls', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ai-settings-test-'));
  const settingsFile = join(dir, 'ai-settings.json');
  const prevEnvFile = process.env.EXCALIDRAW_AI_SETTINGS_FILE;
  process.env.EXCALIDRAW_AI_SETTINGS_FILE = settingsFile;
  clearAiSettingsCache();

  try {
    const initialRes = await backend.fetch(new Request('http://localhost/api/settings/ai'));
    assert.equal(initialRes.status, 200);
    const initial = await initialRes.json() as Record<string, unknown>;
    assert.equal(initial.baseUrl, 'https://api.deepseek.com');
    assert.equal(initial.model, 'deepseek-flash');
    assert.equal(initial.apiKeyMasked, '');
    assert.equal('apiKey' in initial, false);

    const invalidRes = await backend.fetch(new Request('http://localhost/api/settings/ai', {
      method: 'PUT',
      body: JSON.stringify({ baseUrl: 'ftp://invalid-host' }),
    }));
    assert.equal(invalidRes.status, 400);

    const updateRes = await backend.fetch(new Request('http://localhost/api/settings/ai', {
      method: 'PUT',
      body: JSON.stringify({
        baseUrl: 'https://custom.ai.example/v1/',
        apiKey: 'sk-custom-secret-9876',
        model: 'deepseek-chat',
        webSearch: 'always',
        animationEnabled: false,
      }),
    }));
    assert.equal(updateRes.status, 200);
    const updated = await updateRes.json() as Record<string, unknown>;
    assert.equal(updated.baseUrl, 'https://custom.ai.example');
    assert.equal(updated.model, 'deepseek-chat');
    assert.equal(updated.apiKeySource, 'custom');
    assert.equal(updated.apiKeyMasked, 'sk-••••9876');
    assert.equal(updated.webSearch, 'always');
    assert.equal(updated.animationEnabled, false);
    assert.equal(JSON.stringify(updated).includes('sk-custom-secret-9876'), false);

    clearAiSettingsCache();
    const reloadedRes = await backend.fetch(new Request('http://localhost/api/settings/ai'));
    const reloaded = await reloadedRes.json() as Record<string, unknown>;
    assert.equal(reloaded.baseUrl, 'https://custom.ai.example');
    assert.equal(reloaded.model, 'deepseek-chat');
    assert.equal(reloaded.apiKeyMasked, 'sk-••••9876');
    assert.equal(reloaded.animationEnabled, false);

    const originalFetch = globalThis.fetch;
    const seenRequests: Array<{ url: string; auth: string | null; model: unknown }> = [];
    globalThis.fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      const body = JSON.parse(String(init?.body)) as { model?: unknown };
      seenRequests.push({ url: String(input), auth: headers.get('authorization'), model: body.model });
      return Response.json({ choices: [{ message: { content: 'flowchart TD\nA["开始"] --> B["结束"]' } }] });
    };
    try {
      await generateDiagram('测试自定义配置');
      assert.equal(seenRequests[0]?.url, 'https://custom.ai.example/v1/chat/completions');
      assert.equal(seenRequests[0]?.auth, 'Bearer sk-custom-secret-9876');
      assert.equal(seenRequests[0]?.model, 'deepseek-chat');

      const testOkRes = await backend.fetch(new Request('http://localhost/api/settings/ai/test', {
        method: 'POST',
        body: JSON.stringify({ model: 'deepseek-flash' }),
      }));
      const testOk = await testOkRes.json() as { ok: boolean; model?: string };
      assert.equal(testOk.ok, true);
      assert.equal(testOk.model, 'deepseek-flash');
    } finally {
      globalThis.fetch = originalFetch;
    }

    const resetRes = await backend.fetch(new Request('http://localhost/api/settings/ai', { method: 'DELETE' }));
    assert.equal(resetRes.status, 200);
    const reset = await resetRes.json() as Record<string, unknown>;
    assert.equal(reset.baseUrl, 'https://api.deepseek.com');
    assert.equal(reset.model, 'deepseek-flash');
    assert.equal(reset.apiKeyMasked, '');
  } finally {
    clearAiSettingsCache();
    if (prevEnvFile === undefined) delete process.env.EXCALIDRAW_AI_SETTINGS_FILE;
    else process.env.EXCALIDRAW_AI_SETTINGS_FILE = prevEnvFile;
    await rm(dir, { recursive: true, force: true });
  }
});

test('MCP manager handles full CRUD, real stdio connection, tool execution, AI tool loop, and JSON import', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mcp-settings-test-'));
  const mcpFile = join(dir, 'mcp-servers.json');
  const aiFile = join(dir, 'ai-settings.json');
  const mockServerScript = join(dir, 'mock-mcp-server.mjs');
  const prevMcpEnv = process.env.EXCALIDRAW_MCP_SETTINGS_FILE;
  const prevAiEnv = process.env.EXCALIDRAW_AI_SETTINGS_FILE;
  process.env.EXCALIDRAW_MCP_SETTINGS_FILE = mcpFile;
  process.env.EXCALIDRAW_AI_SETTINGS_FILE = aiFile;
  clearMcpCache();
  clearAiSettingsCache();

  await writeFile(mockServerScript, `
import { McpServer } from ${JSON.stringify(join(process.cwd(), 'node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js'))};
import { StdioServerTransport } from ${JSON.stringify(join(process.cwd(), 'node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js'))};
import { z } from ${JSON.stringify(join(process.cwd(), 'node_modules/zod/index.js'))};

const server = new McpServer({ name: 'test-mcp', version: '1.0.0' });
server.registerTool('echo_tool', {
  description: 'Echoes text back',
  inputSchema: { text: z.string() },
}, async ({ text }) => ({
  content: [{ type: 'text', text: 'ECHO:' + text }],
}));
server.registerTool('disabled_candidate', {
  description: 'Second tool for toggle tests',
  inputSchema: {},
}, async () => ({
  content: [{ type: 'text', text: 'ok' }],
}));
await server.connect(new StdioServerTransport());
`, 'utf8');

  try {
    const initialRes = await backend.fetch(new Request('http://localhost/api/mcp'));
    assert.equal(initialRes.status, 200);
    const initial = await initialRes.json() as { servers: unknown[]; localServer: { name: string; enabled: boolean; tools: unknown[] } };
    assert.equal(initial.servers.length, 0);
    assert.equal(initial.localServer.name, 'dopame-canvas');
    assert.equal(initial.localServer.enabled, true);
    assert.equal(initial.localServer.tools.length, 2);

    const testDraftRes = await backend.fetch(new Request('http://localhost/api/mcp/test', {
      method: 'POST',
      body: JSON.stringify({
        name: 'draft-stdio',
        transport: 'stdio',
        command: process.execPath,
        args: [mockServerScript],
      }),
    }));
    const draftTest = await testDraftRes.json() as { ok: boolean; tools?: Array<{ name: string }> };
    assert.equal(draftTest.ok, true);
    assert.deepEqual(draftTest.tools?.map(tool => tool.name).sort(), ['disabled_candidate', 'echo_tool']);

    const createRes = await backend.fetch(new Request('http://localhost/api/mcp/servers', {
      method: 'POST',
      body: JSON.stringify({
        name: 'test-stdio',
        transport: 'stdio',
        enabled: true,
        command: process.execPath,
        args: [mockServerScript],
      }),
    }));
    assert.equal(createRes.status, 200);
    const created = await createRes.json() as { servers: Array<{ id: string; status: string; tools: Array<{ name: string }> }> };
    assert.equal(created.servers.length, 1);
    const serverId = created.servers[0]!.id;
    assert.equal(created.servers[0]!.status, 'connected');
    assert.equal(created.servers[0]!.tools.length, 2);

    const callRes = await backend.fetch(new Request(`http://localhost/api/mcp/servers/${serverId}/call`, {
      method: 'POST',
      body: JSON.stringify({ toolName: 'echo_tool', arguments: { text: 'hello-mcp' } }),
    }));
    const callBody = await callRes.json() as { ok: boolean; text: string };
    assert.equal(callBody.ok, true);
    assert.equal(callBody.text, 'ECHO:hello-mcp');

    const disableToolRes = await backend.fetch(new Request(`http://localhost/api/mcp/servers/${serverId}`, {
      method: 'PUT',
      body: JSON.stringify({ disabledTools: ['disabled_candidate'] }),
    }));
    assert.equal(disableToolRes.status, 200);

    const prepared = await prepareAiMcpTools();
    assert.equal(prepared.tools.length, 1);
    assert.match(prepared.tools[0]!.description, /\[MCP:test-stdio\]/);
    const exposedToolName = prepared.tools[0]!.name;

    const originalFetch = globalThis.fetch;
    let turn = 0;
    globalThis.fetch = async (_input, init) => {
      turn++;
      const payload = JSON.parse(String(init?.body)) as { tools?: Array<{ name: string }>; messages: Array<{ content: Array<{ type: string; content?: string }> }> };
      if (turn === 1) {
        assert.ok(payload.tools?.some(tool => tool.name === exposedToolName));
        return Response.json({
          content: [{ type: 'tool_use', id: 'call-1', name: exposedToolName, input: { text: 'from-ai' } }],
        });
      }
      const toolResult = payload.messages.at(-1)?.content[0];
      assert.equal(toolResult?.type, 'tool_result');
      assert.equal(toolResult?.content, 'ECHO:from-ai');
      return Response.json({
        content: [{ type: 'text', text: '{"mermaid":"flowchart LR\\nA[\\"ECHO:from-ai\\"] --> B[\\"OK\\"]"}' }],
      });
    };
    try {
      const plan = await composeCanvas('调用工具', []) as { mermaid: string };
      assert.match(plan.mermaid, /ECHO:from-ai/);
      assert.equal(turn, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }

    const importRes = await backend.fetch(new Request('http://localhost/api/mcp/import', {
      method: 'POST',
      body: JSON.stringify({
        json: JSON.stringify({
          mcpServers: {
            remoteDemo: {
              url: 'https://example.com/mcp',
              disabled: true,
              headers: { Authorization: 'Bearer token-1' },
            },
          },
        }),
      }),
    }));
    assert.equal(importRes.status, 200);
    const imported = await importRes.json() as { importedCount: number; snapshot: { servers: Array<{ name: string; enabled: boolean; transport: string }> } };
    assert.equal(imported.importedCount, 1);
    const remote = imported.snapshot.servers.find(item => item.name === 'remoteDemo');
    assert.equal(remote?.enabled, false);
    assert.equal(remote?.transport, 'http');

    const toggleLocalRes = await backend.fetch(new Request('http://localhost/api/mcp/local', {
      method: 'PUT',
      body: JSON.stringify({ enabled: false }),
    }));
    const localOff = await toggleLocalRes.json() as { localServer: { enabled: boolean } };
    assert.equal(localOff.localServer.enabled, false);

    const deleteRes = await backend.fetch(new Request(`http://localhost/api/mcp/servers/${serverId}`, { method: 'DELETE' }));
    assert.equal(deleteRes.status, 200);
    const afterDelete = await deleteRes.json() as { servers: Array<{ id: string }> };
    assert.equal(afterDelete.servers.some(item => item.id === serverId), false);
  } finally {
    await disconnectAllMcpServers();
    clearMcpCache();
    clearAiSettingsCache();
    if (prevMcpEnv === undefined) delete process.env.EXCALIDRAW_MCP_SETTINGS_FILE;
    else process.env.EXCALIDRAW_MCP_SETTINGS_FILE = prevMcpEnv;
    if (prevAiEnv === undefined) delete process.env.EXCALIDRAW_AI_SETTINGS_FILE;
    else process.env.EXCALIDRAW_AI_SETTINGS_FILE = prevAiEnv;
    await rm(dir, { recursive: true, force: true });
  }
});

test('MCP form helper parsers handle quoted args and key-value lines', () => {
  const args = parseArgsText('-y "@modelcontextprotocol/server-filesystem" "/tmp/my dir"');
  assert.deepEqual(args, ['-y', '@modelcontextprotocol/server-filesystem', '/tmp/my dir']);
  assert.equal(formatArgsText(args), '-y @modelcontextprotocol/server-filesystem "/tmp/my dir"');
  assert.deepEqual(parseKeyValueLines('FOO=bar\n# comment\nBAZ=1=2', '='), { FOO: 'bar', BAZ: '1=2' });
  assert.deepEqual(parseKeyValueLines('Authorization: Bearer abc', ':'), { Authorization: 'Bearer abc' });
});

test('fresh AI configuration requires a user key instead of embedding a shared credential', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ai-no-builtin-'));
  const previousFile = process.env.EXCALIDRAW_AI_SETTINGS_FILE;
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.EXCALIDRAW_AI_SETTINGS_FILE = join(dir, 'settings.json');
  delete process.env.DEEPSEEK_API_KEY;
  clearAiSettingsCache();
  try {
    const response = await backend.fetch(new Request('http://localhost/api/settings/ai'));
    const settings = await response.json() as Record<string, unknown>;
    assert.equal(settings.hasApiKey, false);
    assert.equal(settings.apiKeySource, 'none');
    assert.equal(DEFAULT_API_KEY, '');
  } finally {
    if (previousFile === undefined) delete process.env.EXCALIDRAW_AI_SETTINGS_FILE;
    else process.env.EXCALIDRAW_AI_SETTINGS_FILE = previousFile;
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
    clearAiSettingsCache();
    await rm(dir, { recursive: true, force: true });
  }
});
