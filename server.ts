import { generateDiagramWithTools } from './server/deepseek.ts';
import { convertHeicToPng } from './server/heic.ts';
import { transcribeAudio } from './server/speech.ts';
import { composeCanvas } from './server/compose.ts';
import { generateVisionUi } from './server/visionUi.ts';
import { checkInternetConnectivity } from './server/networkStatus.ts';
import {
  getPublicAiSettings,
  resetAiSettings,
  testAiConnection,
  updateAiSettings,
  type AiSettingsPatch,
} from './server/aiConfig.ts';
import {
  callMcpServerTool,
  connectMcpServer,
  createMcpServer,
  deleteMcpServer,
  disconnectMcpServer,
  getMcpSnapshot,
  importMcpServersJson,
  refreshAllMcpServers,
  setLocalMcpEnabled,
  testMcpServerDraft,
  updateMcpServer,
  type McpServerInput,
} from './server/mcpManager.ts';

async function readSmallJson(request: Request, maxBytes = 32 * 1024): Promise<Record<string, unknown>> {
  if (Number(request.headers.get('content-length')) > maxBytes) {
    throw new Error('请求体过大');
  }
  const text = await request.text();
  if (text.length > maxBytes) {
    throw new Error('请求体过大');
  }
  if (!text.trim()) return {};
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('请求参数无效');
  }
  return parsed as Record<string, unknown>;
}

async function handleMcpRequest(url: URL, request: Request): Promise<Response | null> {
  const path = url.pathname;
  const noStore = { 'Cache-Control': 'no-store' };
  if (path === '/api/mcp' && request.method === 'GET') {
    return Response.json(await getMcpSnapshot(), { headers: noStore });
  }
  if (path === '/api/mcp/local' && request.method === 'PUT') {
    try {
      const body = await readSmallJson(request);
      if (typeof body.enabled !== 'boolean') throw new Error('参数无效');
      return Response.json(await setLocalMcpEnabled(body.enabled), { headers: noStore });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : '更新失败' }, { status: 400 });
    }
  }
  if (path === '/api/mcp/refresh' && request.method === 'POST') {
    return Response.json(await refreshAllMcpServers(), { headers: noStore });
  }
  if (path === '/api/mcp/test' && request.method === 'POST') {
    try {
      const draft = await readSmallJson(request) as McpServerInput;
      return Response.json(await testMcpServerDraft(draft), { headers: noStore });
    } catch (error) {
      return Response.json({ ok: false, error: error instanceof Error ? error.message : '测试参数无效' }, { status: 400 });
    }
  }
  if (path === '/api/mcp/import' && request.method === 'POST') {
    try {
      const body = await readSmallJson(request, 256 * 1024);
      const rawJson = typeof body.json === 'string' ? body.json : JSON.stringify(body);
      return Response.json(await importMcpServersJson(rawJson), { headers: noStore });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : '导入失败' }, { status: 400 });
    }
  }
  if (path === '/api/mcp/servers' && request.method === 'POST') {
    try {
      const input = await readSmallJson(request) as McpServerInput;
      return Response.json(await createMcpServer(input), { headers: noStore });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : '添加失败' }, { status: 400 });
    }
  }
  const serverActionMatch = /^\/api\/mcp\/servers\/([^/]+)(?:\/(connect|disconnect|call))?$/.exec(path);
  if (!serverActionMatch) return null;
  const serverId = decodeURIComponent(serverActionMatch[1]!);
  const action = serverActionMatch[2];
  try {
    if (!action && request.method === 'PUT') {
      const patch = await readSmallJson(request) as McpServerInput;
      return Response.json(await updateMcpServer(serverId, patch), { headers: noStore });
    }
    if (!action && request.method === 'DELETE') {
      return Response.json(await deleteMcpServer(serverId), { headers: noStore });
    }
    if (action === 'connect' && request.method === 'POST') {
      return Response.json(await connectMcpServer(serverId), { headers: noStore });
    }
    if (action === 'disconnect' && request.method === 'POST') {
      return Response.json(await disconnectMcpServer(serverId), { headers: noStore });
    }
    if (action === 'call' && request.method === 'POST') {
      const body = await readSmallJson(request, 128 * 1024);
      const toolName = typeof body.toolName === 'string' ? body.toolName : '';
      const args = body.arguments && typeof body.arguments === 'object' && !Array.isArray(body.arguments)
        ? body.arguments as Record<string, unknown>
        : {};
      return Response.json(await callMcpServerTool(serverId, toolName, args), { headers: noStore });
    }
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '操作失败' }, { status: 400 });
  }
  return new Response('Method Not Allowed', { status: 405 });
}

function formatAiError(error: unknown, fallback: string, passthrough: ReadonlySet<string> = new Set()): string {
  if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return '请求 AI 超时，请重试';
  }
  if (error instanceof TypeError) {
    return '连接 AI 服务失败，请检查网络或接口配置';
  }
  const message = error instanceof Error ? error.message : fallback;
  if (message.startsWith('DeepSeek ') || passthrough.has(message)) return message;
  return fallback;
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/network/status') {
      if (request.method !== 'GET') {
        return new Response('Method Not Allowed', { status: 405 });
      }
      return Response.json(await checkInternetConnectivity(), { headers: { 'Cache-Control': 'no-store' } });
    }
    if (url.pathname === '/api/settings/ai') {
      if (request.method === 'GET') {
        return Response.json(await getPublicAiSettings(), { headers: { 'Cache-Control': 'no-store' } });
      }
      if (request.method === 'PUT' || request.method === 'POST') {
        try {
          const patch = await readSmallJson(request) as AiSettingsPatch;
          return Response.json(await updateAiSettings(patch), { headers: { 'Cache-Control': 'no-store' } });
        } catch (error) {
          const message = error instanceof Error ? error.message : '保存设置失败';
          return Response.json({ error: message }, { status: 400 });
        }
      }
      if (request.method === 'DELETE') {
        return Response.json(await resetAiSettings(), { headers: { 'Cache-Control': 'no-store' } });
      }
      return new Response('Method Not Allowed', { status: 405 });
    }
    if (url.pathname === '/api/settings/ai/test' && request.method === 'POST') {
      try {
        const draft = await readSmallJson(request) as AiSettingsPatch;
        return Response.json(await testAiConnection(draft), { headers: { 'Cache-Control': 'no-store' } });
      } catch (error) {
        const message = error instanceof Error ? error.message : '测试参数无效';
        return Response.json({ ok: false, error: message }, { status: 400 });
      }
    }
    if (url.pathname.startsWith('/api/mcp')) {
      const mcpResponse = await handleMcpRequest(url, request);
      if (mcpResponse) return mcpResponse;
    }
    if (url.pathname === '/api/compose' && request.method === 'POST') {
      try {
        if (Number(request.headers.get('content-length')) > 5 * 1024 * 1024) return new Response(null, { status: 413 });
        const text = await request.text();
        if (text.length > 5 * 1024 * 1024) return new Response(null, { status: 413 });
        const { prompt, context, image, webSearch } = JSON.parse(text) as { prompt?: unknown; context?: unknown; image?: unknown; webSearch?: unknown };
        const validArrayContext = Array.isArray(context) && context.length <= 200;
        const validSpatialContext = Boolean(context && typeof context === 'object' && !Array.isArray(context));
        if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 4000 || (!validArrayContext && !validSpatialContext) || (image !== undefined && typeof image !== 'string')) return new Response(null, { status: 400 });
        let usedTools: string[] = [];
        let webSearchEnabled = false;
        const plan = await composeCanvas(prompt, context, image, false, {
          webSearch: typeof webSearch === 'boolean' ? webSearch : undefined,
          onToolsUsed: (tools, searchOn) => {
            usedTools = tools;
            webSearchEnabled = searchOn;
          },
        }) as Record<string, unknown>;
        return Response.json({ ...plan, usedTools, webSearchEnabled });
      } catch (error) {
        const message = error instanceof Error ? error.message : '编辑规划生成失败';
        console.error('Compose 生成失败', message);
        return Response.json({ error: formatAiError(error, '生成失败', new Set(['缺少新增图表', '编辑规划格式无效'])) }, { status: 502 });
      }
    }
    if (url.pathname === '/api/vision-ui' && request.method === 'POST') {
      try {
        if (Number(request.headers.get('content-length')) > 5 * 1024 * 1024) return new Response(null, { status: 413 });
        const text = await request.text();
        if (text.length > 5 * 1024 * 1024) return new Response(null, { status: 413 });
        const { image, prompt, targetSize, context } = JSON.parse(text) as { image?: unknown; prompt?: unknown; targetSize?: unknown; context?: unknown };
        if (typeof image !== 'string' || !image.startsWith('data:image/png;base64,') || (prompt !== undefined && (typeof prompt !== 'string' || prompt.length > 2000))) {
          return Response.json({ error: '请求无效' }, { status: 400 });
        }
        const rawSize = targetSize && typeof targetSize === 'object' ? (targetSize as { width?: unknown; height?: unknown }) : undefined;
        const safeSize = rawSize
          && typeof rawSize.width === 'number' && Number.isFinite(rawSize.width)
          && typeof rawSize.height === 'number' && Number.isFinite(rawSize.height)
          ? { width: Math.min(4000, Math.max(40, rawSize.width)), height: Math.min(4000, Math.max(40, rawSize.height)) }
          : undefined;
        const safeContext = context && typeof context === 'object' && !Array.isArray(context) ? context : undefined;
        return Response.json({ elements: await generateVisionUi(image, prompt ?? '', safeSize, safeContext) });
      } catch (error) {
        const message = error instanceof Error ? error.message : '识图生成失败';
        console.error('Vision UI 生成失败', message);
        return Response.json({ error: formatAiError(error, '识图生成失败', new Set(['未生成有效 UI 元素'])) }, { status: 502 });
      }
    }
    if (url.pathname === '/api/speech' && request.method === 'POST') {
      try {
        if (Number(request.headers.get('content-length')) > 8 * 1024 * 1024) return new Response(null, { status: 413 });
        return Response.json({ text: await transcribeAudio(new Uint8Array(await request.arrayBuffer())) });
      } catch { return Response.json({ error: '识别失败' }, { status: 502 }); }
    }
    if (url.pathname === '/api/images/convert' && request.method === 'POST') {
      try {
        if (Number(request.headers.get('content-length')) > 32 * 1024 * 1024) return new Response(null, { status: 413 });
        const buffer = new Uint8Array(await request.arrayBuffer());
        const png = await convertHeicToPng(buffer);
        return new Response(png as Uint8Array<ArrayBuffer>, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' } });
      } catch (error) {
        console.error('图片转换失败', error instanceof Error ? error.message : String(error));
        return Response.json({ error: '转换失败' }, { status: 422 });
      }
    }
    if (url.pathname !== '/api/generate' || request.method !== 'POST') return new Response('Not found', { status: 404 });
    try {
      if (Number(request.headers.get('content-length')) > 20000) return Response.json({ error: '描述过长' }, { status: 413 });
      const body = await request.text();
      if (body.length > 20000) return Response.json({ error: '描述过长' }, { status: 413 });
      const { prompt, webSearch } = JSON.parse(body) as { prompt?: unknown; webSearch?: unknown };
      if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 4000) return Response.json({ error: '描述无效' }, { status: 400 });
      return Response.json(await generateDiagramWithTools(prompt.trim(), { webSearch: typeof webSearch === 'boolean' ? webSearch : undefined }));
    } catch (error) {
      const message = error instanceof Error ? error.message : '生成失败';
      console.error('DeepSeek生成失败', message, error instanceof Error && error.cause instanceof Error ? error.cause.message : '');
      return Response.json({ error: formatAiError(error, '生成失败', new Set(['图表为空'])) }, { status: 502 });
    }
  },
};
