import { fetchDeepSeek } from './deepseekTransport.ts';
import { getEffectiveAiConfig } from './aiConfig.ts';
import { uploadCanvasImage } from './deepseekFiles.ts';
import { executeAiMcpTool, prepareAiMcpTools } from './mcpManager.ts';
import { queryUiAssets, type UiAssetCategory } from '../src/services/uiAssets.ts';

type MessageBlock =
  | { type: 'text'; text: string }
  | { type: 'document'; source: { type: 'file'; file_id: string } }
  | { type: 'tool_use'; id: string; name: string; input?: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: MessageBlock[];
}

const VALID_CATEGORIES = new Set<UiAssetCategory | 'all'>(['all', 'hero', 'metric', 'media', 'profile', 'list']);

const TOOLS = [
  {
    name: 'get_ui_assets',
    description: '获取预置的高保真纯视觉卡片素材（均不含文字）。返回 assetId、title、description、recommendedSize、surfaceTone(明暗底色)、recommendedTextColor(推荐对比文字色)、overlayRecommended(是否允许图片内叠字) 以及 safeArea(归一化0~1文本安全区坐标与排版警告)。必须严格依据 safeArea 与 recommendedTextColor 排版！',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['all', 'hero', 'metric', 'media', 'profile', 'list'] },
        query: { type: 'string' },
      },
    },
  },
];

const SYSTEM_PROMPT = [
  '你是资深移动端/桌面 UI 设计师与 Excalidraw 界面架构师。用户会给你一张手绘 UI 草图区域截图（以及目标区域宽高与可选风格说明）。',
  '第一步：根据草图中的框架、圆圈、卡片、图表、列表与手写文字，先调用 get_ui_assets 工具查询并挑选合适的纯视觉卡片素材。',
  '第二步：输出一个纯 JSON 数组（严禁 markdown 代码块或任何解释），代表高保真 Excalidraw UI 组件列表。',
  '【强制对比度与安全区规则 —— 绝对不能违反】：',
  '- get_ui_assets 返回每张图的 surfaceTone、recommendedTextColor、overlayRecommended 与 safeArea（归一化 0~1）。',
  '- 若 overlayRecommended 为 false（绝大多数浅色图表、产品图、头像、清单卡）：禁止把文字压在图片上！请将图片放在上方/左侧，并在图片下方或右侧用纯白(#ffffff)矩形底座 + 深色(#0f172a/#475569)文字来写标题和指标。',
  '- 若 overlayRecommended 为 true（例如深蓝底 hero-ai-assistant、list-weather-widget）：仅允许在 safeArea（x + safeArea.x*w, y + safeArea.y*h 区域）内放置文字，且文字颜色必须严格使用 recommendedTextColor（深蓝底用 #ffffff，浅蓝底用 #0f172a），严禁在浅色卡片上放白色文字！',
  '- 任何文字与所在底层色块/卡片必须满足高对比度（浅底 #ffffff/#f8fafc/#e3f2fd 配深字 #0f172a/#1e293b/#334155；深底 #2196f3/#1976d2/#0f172a 配白字 #ffffff）。',
  '支持的元素骨架格式：',
  '- 容器/按钮/手机外壳/卡片底座：{"type":"rectangle","x":0,"y":0,"width":390,"height":844,"strokeColor":"#cbd5e1","backgroundColor":"#f8fafc","fillStyle":"solid","strokeWidth":2,"roughness":0,"roundness":{"type":3},"label":{"text":"可选文字","fontSize":16,"strokeColor":"#0f172a"}}',
  '- 圆形头像/图标底圆：{"type":"ellipse","x":24,"y":56,"width":44,"height":44,"strokeColor":"#2196f3","backgroundColor":"#e3f2fd","fillStyle":"solid","roughness":0}',
  '- 预置视觉卡片图片（assetId 必须来自 get_ui_assets 返回值）：{"type":"image","assetId":"hero-ai-assistant","x":24,"y":136,"width":342,"height":192}',
  '- 独立文字：{"type":"text","x":24,"y":60,"text":"探索发现","fontSize":22,"strokeColor":"#0f172a"}',
  '- 分割线：{"type":"line","x":24,"y":760,"points":[[0,0],[342,0]],"strokeColor":"#e2e8f0","strokeWidth":1,"roughness":0}',
  '视觉规范与高速推理约束：',
  '1. 直接调用模型内置的现代 UI 设计规范（如 iOS / 极简卡片风格），不走慢速联网搜索。',
  '2. 若指定了目标区域尺寸 targetSize(width x height)，请严格以 (0,0) 为左上角、以该尺寸为外框紧凑对齐排版（若选中的只是单个卡片/局部组件，只生成该局部组件 UI，不要硬套整台手机外壳）。若未指定则手机原型按 390x844、桌面按 960x600 对齐。若附带三层空间上下文（selectedElements / viewportElements / offscreenElements），优先对齐 selectedElements 与 viewportElements，确保不与 offscreenElements 重叠。',
  '3. 主色调使用 #2196f3，辅助浅蓝 #e3f2fd、纯白 #ffffff、浅灰底 #f8fafc、深灰字 #0f172a/#1e293b、次级灰字 #475569；所有组件 roughness 设为 0。',
  '4. 所有生成元素的坐标与尺寸必须按 8px 网格对齐（x、y、width、height 均为 8 的倍数），间距统一（如 16px/24px）、排版有秩序，总元素数控制在 6-80 个之间。',
].join('\n');

function runTool(name: string, input: { category?: string; query?: string } | undefined): string {
  if (name !== 'get_ui_assets') return JSON.stringify({ error: '未知工具' });
  const rawCategory = input?.category ?? 'all';
  const category = VALID_CATEGORIES.has(rawCategory as UiAssetCategory | 'all') ? (rawCategory as UiAssetCategory | 'all') : 'all';
  const assets = queryUiAssets(category, input?.query ?? '').slice(0, 12).map(({
    id,
    category: cat,
    title,
    description,
    aspectRatio,
    defaultWidth,
    defaultHeight,
    surfaceTone,
    recommendedTextColor,
    overlayRecommended,
    safeArea,
  }) => ({
    assetId: id,
    category: cat,
    title,
    description,
    aspectRatio,
    recommendedSize: { width: defaultWidth, height: defaultHeight },
    surfaceTone,
    recommendedTextColor,
    overlayRecommended,
    safeArea,
  }));
  return JSON.stringify({ assets });
}

export function extractVisionElements(text: string): unknown[] {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  const slice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  const parsed = JSON.parse(slice) as unknown;
  if (!Array.isArray(parsed) || !parsed.length) throw new Error('未生成有效 UI 元素');
  return parsed;
}

export async function generateVisionUi(
  image: string,
  prompt = '',
  targetSize?: { width: number; height: number },
  context?: unknown,
): Promise<unknown[]> {
  const fileId = await uploadCanvasImage(image);
  const sizeHint = targetSize
    ? `目标选中组件区域尺寸为 ${Math.round(targetSize.width)}x${Math.round(targetSize.height)} px，请按此区域宽高比例从 (0,0) 开始输出对应组件 UI。`
    : '';
  const contextHint = context ? `\n空间上下文参考：${JSON.stringify(context)}` : '';
  const userNote = prompt.trim()
    ? `请识别手绘草图并重构为高保真 UI，${sizeHint}补充设计需求：${prompt.trim()}。请先调用 get_ui_assets 获取卡片素材与 safeArea/recommendedTextColor，再输出纯 JSON 数组。${contextHint}`
    : `请识别手绘草图并重构为高保真 UI。${sizeHint}请先调用 get_ui_assets 获取卡片素材与 safeArea/recommendedTextColor，再输出纯 JSON 数组。${contextHint}`;

  const messages: AnthropicMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'document', source: { type: 'file', file_id: fileId } },
        { type: 'text', text: userNote },
      ],
    },
  ];

  const config = await getEffectiveAiConfig();
  const mcp = await prepareAiMcpTools();
  const tools = [...TOOLS, ...mcp.tools];
  for (let turn = 0; turn < 5; turn++) {
    const response = await fetchDeepSeek(`${config.baseUrl}/anthropic/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': config.apiKey,
        'Content-Type': 'application/json',
        'anthropic-beta': 'files-api-2025-04-14',
      },
      body: JSON.stringify({
        model: config.model,
        thinking: { type: 'disabled' },
        max_tokens: 8192,
        stream: false,
        tools,
        system: SYSTEM_PROMPT,
        messages,
      }),
      signal: AbortSignal.timeout(90000),
    });
    if (!response.ok) throw new Error(`DeepSeek ${response.status}`);
    const result = await response.json() as { stop_reason?: string; content?: MessageBlock[] };
    const blocks = Array.isArray(result.content) ? result.content : [];
    const toolCalls = blocks.filter((block): block is Extract<MessageBlock, { type: 'tool_use' }> => block.type === 'tool_use');
    if (toolCalls.length) {
      messages.push({ role: 'assistant', content: blocks });
      const toolResults = await Promise.all(toolCalls.map(async call => ({
        type: 'tool_result' as const,
        tool_use_id: call.id,
        content: mcp.bindings.has(call.name)
          ? await executeAiMcpTool(call.name, call.input, mcp.bindings)
          : runTool(call.name, call.input as { category?: string; query?: string } | undefined),
      })));
      messages.push({
        role: 'user',
        content: toolResults,
      });
      continue;
    }
    const text = blocks.filter((block): block is Extract<MessageBlock, { type: 'text' }> => block.type === 'text').map(block => block.text).join('');
    if (!text.trim()) throw new Error('UI 生成为空');
    return extractVisionElements(text);
  }
  throw new Error('工具调用轮次超限');
}
