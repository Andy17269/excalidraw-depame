import { DEFAULT_API_KEY, DEFAULT_MODEL, getEffectiveAiConfig, type EffectiveAiConfig } from './aiConfig.ts';
import { fetchDeepSeek } from './deepseekTransport.ts';
import { executeAiMcpTool, prepareAiMcpTools } from './mcpManager.ts';

export const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || DEFAULT_API_KEY;
export const DEEPSEEK_MODEL = DEFAULT_MODEL;

export interface DiagramGenerationOptions {
  webSearch?: boolean;
}

export interface DiagramGenerationResult {
  mermaid: string;
  usedTools: string[];
  webSearchEnabled: boolean;
}

type DiagramBlock =
  | { type: 'text'; text?: string }
  | { type: 'tool_use'; id: string; name: string; input?: Record<string, unknown> }
  | { type: 'server_tool_use'; id?: string; name?: string }
  | { type: 'web_search_tool_result' }
  | { type: string; name?: string; text?: string };

interface DiagramMessage {
  role: 'user' | 'assistant';
  content: string | DiagramBlock[];
}

const DIAGRAM_SEARCH_INTENT_RE = /联网|搜索|查找|查询|最新|参考|资料|对比|教程|https?:\/\//;
const DIAGRAM_SYSTEM_PROMPT = [
  '只输出纯 Mermaid 语法，严禁解释和 markdown 代码块。只用 flowchart TD、flowchart LR 或 mindmap。节点文字用中文，flowchart 的标签全部用双引号包裹。每行一条语句，不使用 HTML、图片、外部链接、初始化指令或交互指令。最多 30 个节点。',
  '配色规范：思维导图（mindmap）或流程图小块支持柔和的背景/边框配色；默认最多选择 2 种低饱和度柔和配色（严禁过艳/高饱和/荧光色），如 #eef5ff/#4f7cac、#eef7f2/#4c8b6f、#fdf5eb/#b07b42、#f4f1fa/#7863a8。若输出 mindmap，可在首行后用 `%% colors: #背景/#边框, #背景/#边框` 指定最多 2 组配色。',
].join('\n');

async function generateDiagramDirect(prompt: string, config: EffectiveAiConfig): Promise<string> {
  const response = await fetchDeepSeek(`${config.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model, thinking: { type: 'disabled' }, stream: false, max_tokens: 4096,
      messages: [
        { role: 'system', content: DIAGRAM_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`DeepSeek ${response.status}`);
  const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const code = body.choices?.[0]?.message?.content;
  if (typeof code !== 'string' || !code.trim()) throw new Error('图表为空');
  return code;
}

export async function generateDiagramWithTools(
  prompt: string,
  options?: DiagramGenerationOptions,
): Promise<DiagramGenerationResult> {
  const config = await getEffectiveAiConfig();
  const useWebSearch = config.webSearch === 'off'
    ? false
    : options?.webSearch === true
      ? true
      : config.webSearch === 'always'
        ? true
        : DIAGRAM_SEARCH_INTENT_RE.test(prompt);
  const mcp = await prepareAiMcpTools();
  const tools = [
    ...(useWebSearch
      ? [
        { type: 'deepseek_web_search', name: 'deepseek_web_search' },
        { type: 'deepseek_read_url', name: 'deepseek_read_url' },
      ]
      : []),
    ...mcp.tools,
  ];

  if (!tools.length) {
    return { mermaid: await generateDiagramDirect(prompt, config), usedTools: [], webSearchEnabled: false };
  }

  const usedToolSet = new Set<string>();
  const messages: DiagramMessage[] = [{ role: 'user', content: [{ type: 'text', text: prompt }] }];
  let code = '';

  for (let turn = 0; turn < 5; turn++) {
    const response = await fetchDeepSeek(`${config.baseUrl}/anthropic/v1/messages`, {
      method: 'POST',
      headers: { 'x-api-key': config.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        thinking: { type: 'disabled' },
        max_tokens: 4096,
        stream: false,
        tools,
        system: `${DIAGRAM_SYSTEM_PROMPT}\n如开启了联网搜索或扩展工具，请先调用工具查找准确、最新的资料或结构，再整理为清晰的 Mermaid 图表输出。`,
        messages,
      }),
      signal: AbortSignal.timeout(90000),
    });
    if (!response.ok) throw new Error(`DeepSeek ${response.status}`);
    const result = await response.json() as { content?: DiagramBlock[] };
    const blocks = Array.isArray(result.content) ? result.content : [];
    for (const block of blocks) {
      if ((block.type === 'tool_use' || block.type === 'server_tool_use') && typeof block.name === 'string' && block.name) {
        usedToolSet.add(block.name);
      } else if (block.type === 'web_search_tool_result') {
        usedToolSet.add('deepseek_web_search');
      }
    }
    const mcpCalls = blocks.filter((block): block is Extract<DiagramBlock, { type: 'tool_use' }> =>
      block.type === 'tool_use' && typeof block.name === 'string' && mcp.bindings.has(block.name),
    );
    if (mcpCalls.length) {
      messages.push({ role: 'assistant', content: blocks });
      const results = await Promise.all(mcpCalls.map(async call => ({
        type: 'tool_result' as const,
        tool_use_id: call.id,
        content: await executeAiMcpTool(call.name, call.input, mcp.bindings),
      })));
      messages.push({ role: 'user', content: results });
      continue;
    }
    code = blocks
      .filter((block): block is Extract<DiagramBlock, { type: 'text' }> => block.type === 'text')
      .map(block => block.text ?? '')
      .join('');
    break;
  }

  if (typeof code !== 'string' || !code.trim()) throw new Error('图表为空');
  return { mermaid: code, usedTools: [...usedToolSet], webSearchEnabled: useWebSearch };
}

export async function generateDiagram(prompt: string): Promise<string> {
  return generateDiagramDirect(prompt, await getEffectiveAiConfig());
}
