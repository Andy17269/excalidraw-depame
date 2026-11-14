import { FONT_FAMILY, convertToExcalidrawElements, getCommonBounds, newElementWith } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import {
  buildMindmapBranchAssignments,
  computeFitViewport,
  normalizeMermaid,
  resolveDiagramNodeColors,
  summarizeElements,
  type MindmapBranch,
} from './sceneMath';
import { animateDiagramCreation, cancelCanvasAnimation } from './canvasAnimator';
import { notify } from './notifications';
import { ensureHandDrawnFonts } from './fonts';
import { fetchApi } from './apiFetch';

let canvas: ExcalidrawImperativeAPI | null = null;
let host: HTMLElement | null = null;
let revision = 0;
let renderQueue = Promise.resolve();

export { cancelCanvasAnimation };

export function bindCanvas(api: ExcalidrawImperativeAPI | null, hostElement?: HTMLElement | null): void {
  cancelCanvasAnimation();
  canvas = api;
  host = hostElement ?? null;
  revision++;
}

export function invalidateCanvas(): void {
  cancelCanvasAnimation();
  revision++;
}
export function getCanvasRevision(): number { return revision; }

export interface DiagramToolResult {
  mermaid: string;
  usedTools: string[];
  webSearchEnabled: boolean;
}

export async function generateMermaidWithTools(
  prompt: string,
  signal?: AbortSignal,
  options?: { webSearch?: boolean },
): Promise<DiagramToolResult> {
  if (!prompt.trim() || prompt.length > 4000) throw new Error('描述无效');
  const response = await fetchApi('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: prompt.trim(), ...(options?.webSearch !== undefined ? { webSearch: options.webSearch } : {}) }),
    signal,
  });
  const body = await response.json().catch(() => ({})) as {
    mermaid?: string;
    usedTools?: unknown;
    webSearchEnabled?: unknown;
    error?: string;
  };
  if (!response.ok || typeof body.mermaid !== 'string') throw new Error(body.error ?? '生成失败');
  return {
    mermaid: normalizeMermaid(body.mermaid),
    usedTools: Array.isArray(body.usedTools) ? body.usedTools.filter((item): item is string => typeof item === 'string') : [],
    webSearchEnabled: body.webSearchEnabled === true,
  };
}

export async function generateMermaidViaDeepSeek(prompt: string, signal?: AbortSignal): Promise<string> {
  const result = await generateMermaidWithTools(prompt, signal);
  return result.mermaid;
}

export function renderMermaidToCanvas(source: string, anchor?: { x: number; y: number }): Promise<{ count: number }> {
  const api = canvas;
  const started = revision;
  const render = async () => {
    if (!api || api !== canvas || started !== revision) throw new Error('画布已切换');
    let code = normalizeMermaid(source);
    const isMindmap = /^mindmap\b/.test(code);
    let branchByOrder: Array<0 | 1> | undefined;
    await ensureHandDrawnFonts(code);
    if (isMindmap) {
      const { default: mermaid } = await import('mermaid');
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
      const diagram = await mermaid.mermaidAPI.getDiagramFromText(code);
      const root = (diagram.db as { getMindmap(): MindmapBranch | null }).getMindmap();
      if (!root) throw new Error('导图为空');
      const converted = buildMindmapBranchAssignments(root);
      code = converted.flowchart;
      branchByOrder = converted.branchByOrder;
    }
    const { parseMermaidToExcalidraw } = await import('@excalidraw/mermaid-to-excalidraw');
    const parsed = await parseMermaidToExcalidraw(code);
    if (!api || api !== canvas || started !== revision) throw new Error('画布已切换');
    const rawElements = convertToExcalidrawElements(parsed.elements, { regenerateIds: true });
    const nodeColors = resolveDiagramNodeColors(rawElements, { isMindmap, source, branchByOrder });
    let elements = rawElements.map(element => {
      if (element.type === 'text') return newElementWith(element, { fontFamily: FONT_FAMILY.Excalifont });
      const color = nodeColors.get(element.id);
      return color ? newElementWith(element, { fillStyle: 'solid', backgroundColor: color.backgroundColor, strokeColor: color.strokeColor }) : element;
    });
    if (!elements.length) throw new Error('图表为空');
    const current = api.getSceneElements();
    const [left, top] = getCommonBounds(elements);
    const [, , right] = current.length ? getCommonBounds(current) : [0, 0, 0, 0];
    const x = anchor && Number.isFinite(anchor.x) && Math.abs(anchor.x) < 1e7 ? anchor.x : current.length ? right + 100 : 0;
    const y = anchor && Number.isFinite(anchor.y) && Math.abs(anchor.y) < 1e7 ? anchor.y : 0;
    elements = elements.map(element => newElementWith(element, { x: element.x - left + x, y: element.y - top + y }));
    if (parsed.files) api.addFiles(Object.values(parsed.files));
    const baseElements = api.getSceneElementsIncludingDeleted();
    const state = api.getAppState();
    const targetViewport = computeFitViewport(getCommonBounds(elements), { width: state.width, height: state.height }, { viewportZoomFactor: 0.92, maxZoom: 1.5 });
    await animateDiagramCreation({
      api,
      host,
      baseElements,
      newElements: elements,
      targetViewport,
      isCurrent: () => api === canvas && started === revision,
    });
    void notify('图表已生成');
    return { count: elements.length };
  };
  const result = renderQueue.then(render);
  renderQueue = result.then(() => {}, () => {});
  return result;
}

export function readCanvasSummary(): string {
  if (!canvas) throw new Error('画布未就绪');
  return summarizeElements(canvas.getSceneElements());
}

export const canvasTools = { draw_diagram: renderMermaidToCanvas, read_canvas: readCanvasSummary };
