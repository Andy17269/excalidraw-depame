import { CaptureUpdateAction, FONT_FAMILY, convertToExcalidrawElements, exportToBlob, newElementWith } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { getCanvasRevision, renderMermaidToCanvas } from './canvasBridge';
import { ensureHandDrawnFonts } from './fonts';
import { notify } from './notifications';
import { layoutChangedText } from './canvasPlanLayout';
import { fetchApi } from './apiFetch';
import { buildSpatialCanvasContext } from './canvasContext';

export interface CanvasPlan {
  mermaid?: string;
  anchor?: { x: number; y: number };
  changes?: Array<{ id: string; text?: string; strokeColor?: string; backgroundColor?: string }>;
  usedTools?: string[];
  webSearchEnabled?: boolean;
}

export async function generateCanvasPlan(
  prompt: string,
  api: ExcalidrawImperativeAPI,
  signal: AbortSignal,
  options?: { webSearch?: boolean },
): Promise<CanvasPlan> {
  const allElements = api.getSceneElements();
  const { context, viewportSourceElements } = buildSpatialCanvasContext(allElements, api.getAppState());
  const visualElements = viewportSourceElements.length ? viewportSourceElements : allElements.slice(0, 120);
  let image: string | undefined;
  if (visualElements.some(element => element.type === 'image' || element.type === 'freedraw')) {
    const blob = await exportToBlob({ elements: visualElements, files: api.getFiles(), maxWidthOrHeight: 768, appState: { exportBackground: true } });
    image = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob);
    });
  }
  const response = await fetchApi('/api/compose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, context, image, ...(options?.webSearch !== undefined ? { webSearch: options.webSearch } : {}) }),
    signal,
  });
  const body = await response.json().catch(() => ({})) as CanvasPlan & { error?: string };
  if (!response.ok) throw new Error(body.error ?? '生成失败');
  return body;
}

function normalizePlanColor(value: string): string {
  const trimmed = value.trim();
  const shortHex = /^#([0-9a-f]{3})$/i.exec(trimmed);
  if (shortHex) {
    const [r, g, b] = shortHex[1]!;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return trimmed;
}

export async function applyCanvasPlan(plan: CanvasPlan, api: ExcalidrawImperativeAPI, versions: Map<string, number>, revision: number): Promise<void> {
  const assertCurrent = () => {
    if (revision !== getCanvasRevision()) throw new Error('画布已切换');
    const current = new Map(api.getSceneElements().map(element => [element.id, element.version]));
    for (const [id, version] of versions) if (current.get(id) !== version) throw new Error('画布已更新');
  };
  assertCurrent();
  const existing = new Map(api.getSceneElements().map(element => [element.id, element]));
  type CanvasChange = NonNullable<CanvasPlan['changes']>[number];
  const changes = (Array.isArray(plan.changes) ? plan.changes : []).flatMap<CanvasChange>(rawChange => {
    if (!rawChange || typeof rawChange !== 'object') return [rawChange];
    const change: CanvasChange = {
      ...rawChange,
      ...(typeof rawChange.strokeColor === 'string' ? { strokeColor: normalizePlanColor(rawChange.strokeColor) } : {}),
      ...(typeof rawChange.backgroundColor === 'string' ? { backgroundColor: normalizePlanColor(rawChange.backgroundColor) } : {}),
    };
    const target = existing.get(change.id);
    const textId = target?.type !== 'text' ? target?.boundElements?.find(bound => bound.type === 'text')?.id : undefined;
    if (change.text !== undefined && textId) {
      return [
        { id: textId, text: change.text },
        ...(change.strokeColor || change.backgroundColor ? [{ id: change.id, strokeColor: change.strokeColor, backgroundColor: change.backgroundColor }] : []),
      ];
    }
    if (target && target.type !== 'text' && change.text === '') {
      const { text: _ignored, ...rest } = change;
      return rest.strokeColor !== undefined || rest.backgroundColor !== undefined ? [rest] : [];
    }
    return [change];
  });
  if (changes.length > 200) throw new Error('修改过多');
  const ids = new Set(api.getSceneElements().map(element => element.id));
  for (const change of changes) {
    if (!change || !ids.has(change.id) || (change.text !== undefined && (typeof change.text !== 'string' || change.text.length > 2000))) throw new Error('修改无效');
    if (change.text !== undefined && api.getSceneElements().find(element => element.id === change.id)?.type !== 'text') throw new Error('文字目标无效');
    for (const color of [change.strokeColor, change.backgroundColor]) if (color !== undefined && !/^(?:#[0-9a-f]{6}|transparent)$/i.test(color)) throw new Error('颜色无效');
  }
  await ensureHandDrawnFonts(changes.map(change => change.text ?? '').join(''));
  assertCurrent();
  let prepared: Map<string, ExcalidrawElement> | undefined;
  if (changes.length) {
    const byId = new Map(changes.map(change => [change.id, change]));
    const original = api.getSceneElementsIncludingDeleted();
    const next = original.map(element => {
      const change = byId.get(element.id);
      if (!change) return element;
      const colors = { ...(change.strokeColor ? { strokeColor: change.strokeColor } : {}), ...(change.backgroundColor ? { backgroundColor: change.backgroundColor } : {}) };
      if (change.text !== undefined && element.type === 'text') {
        if (element.containerId) return newElementWith(element, { ...colors, text: change.text, originalText: change.text, fontFamily: FONT_FAMILY.Excalifont });
        const [sized] = convertToExcalidrawElements([{ type: 'text', text: change.text, x: element.x, y: element.y, fontFamily: FONT_FAMILY.Excalifont, fontSize: element.fontSize }]);
        return newElementWith(element, { ...colors, text: change.text, originalText: change.text, width: sized!.width, height: sized!.height, fontFamily: FONT_FAMILY.Excalifont });
      }
      return newElementWith(element, colors);
    });
    const laidOut = layoutChangedText(next, new Set(changes.filter(change => change.text !== undefined).map(change => change.id)));
    prepared = new Map(laidOut.filter((element, index) => element !== original[index]).map(element => [element.id, element]));
  }
  if (plan.mermaid) await renderMermaidToCanvas(plan.mermaid, plan.anchor);
  assertCurrent();
  if (prepared) {
    api.updateScene({ elements: api.getSceneElementsIncludingDeleted().map(element => prepared.get(element.id) ?? element), captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    if (!plan.mermaid) void notify('图表已生成');
  }
  if (!plan.mermaid && !changes.length) throw new Error('图表为空');
}
