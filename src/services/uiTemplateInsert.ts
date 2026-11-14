import { CaptureUpdateAction, FONT_FAMILY, convertToExcalidrawElements, getCommonBounds, newElementWith } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { ensureHandDrawnFonts } from './fonts';
import {
  UI_TEMPLATE_MAP,
  collectTemplateLabels,
  computeTemplateOrigin,
  type BoxBounds,
  type TemplateElementSpec,
} from './uiTemplates';

function collectSceneBounds(elements: readonly ExcalidrawElement[]): BoxBounds[] {
  const visible = elements.filter(el => !el.isDeleted);
  if (visible.length === 0) return [];
  const grouped = new Map<string, ExcalidrawElement[]>();
  const standalone: BoxBounds[] = [];

  for (const el of visible) {
    const groupId = el.groupIds[0];
    if (groupId) {
      const bucket = grouped.get(groupId);
      if (bucket) bucket.push(el);
      else grouped.set(groupId, [el]);
    } else {
      const [minX, minY, maxX, maxY] = getCommonBounds([el]);
      standalone.push({ minX, minY, maxX, maxY });
    }
  }

  for (const groupElements of grouped.values()) {
    const [minX, minY, maxX, maxY] = getCommonBounds(groupElements);
    standalone.push({ minX, minY, maxX, maxY });
  }
  return standalone;
}

function toExcalidrawSkeleton(spec: TemplateElementSpec, originX: number, originY: number) {
  const x = Math.round(originX + spec.x);
  const y = Math.round(originY + spec.y);
  if (spec.type === 'text') {
    return {
      type: 'text' as const,
      x,
      y,
      text: spec.text,
      fontSize: spec.fontSize ?? 14,
      fontFamily: FONT_FAMILY.Excalifont,
      strokeColor: spec.strokeColor ?? '#1e293b',
      ...(spec.width !== undefined ? { width: spec.width } : {}),
      ...(spec.height !== undefined ? { height: spec.height } : {}),
      ...(spec.textAlign !== undefined ? { textAlign: spec.textAlign } : {}),
      ...(spec.verticalAlign !== undefined ? { verticalAlign: spec.verticalAlign } : {}),
      ...(spec.opacity !== undefined ? { opacity: spec.opacity } : {}),
    };
  }
  if (spec.type === 'line') {
    return {
      type: 'line' as const,
      x,
      y,
      points: spec.points.map(([px, py]) => [px, py] as [number, number]),
      strokeColor: spec.strokeColor ?? '#cbd5e1',
      strokeWidth: spec.strokeWidth ?? 1,
      roughness: spec.roughness ?? 0,
      ...(spec.opacity !== undefined ? { opacity: spec.opacity } : {}),
    };
  }
  if (spec.type === 'ellipse') {
    return {
      type: 'ellipse' as const,
      x,
      y,
      width: spec.width,
      height: spec.height,
      strokeColor: spec.strokeColor ?? '#94a3b8',
      backgroundColor: spec.backgroundColor ?? '#f8fafc',
      fillStyle: spec.fillStyle ?? ('solid' as const),
      strokeWidth: spec.strokeWidth ?? 1,
      roughness: spec.roughness ?? 0,
      ...(spec.opacity !== undefined ? { opacity: spec.opacity } : {}),
    };
  }
  return {
    type: 'rectangle' as const,
    x,
    y,
    width: spec.width,
    height: spec.height,
    strokeColor: spec.strokeColor ?? '#94a3b8',
    backgroundColor: spec.backgroundColor ?? '#ffffff',
    fillStyle: spec.fillStyle ?? ('solid' as const),
    strokeWidth: spec.strokeWidth ?? 1,
    roughness: spec.roughness ?? 0,
    ...(spec.roundness !== undefined ? { roundness: spec.roundness } : {}),
    ...(spec.opacity !== undefined ? { opacity: spec.opacity } : {}),
    ...(spec.label
      ? {
          label: {
            text: spec.label.text,
            fontSize: spec.label.fontSize ?? 14,
            fontFamily: FONT_FAMILY.Excalifont,
            strokeColor: spec.label.strokeColor ?? '#1e293b',
          },
        }
      : {}),
  };
}

export async function insertUiTemplate(
  api: ExcalidrawImperativeAPI,
  templateId: string,
  options: { group?: boolean } = {},
): Promise<boolean> {
  const template = UI_TEMPLATE_MAP.get(templateId);
  if (!template) return false;

  await ensureHandDrawnFonts(collectTemplateLabels(template));

  const state = api.getAppState();
  const existing = api.getSceneElementsIncludingDeleted();
  const origin = computeTemplateOrigin(
    { width: template.width, height: template.height },
    {
      scrollX: state.scrollX,
      scrollY: state.scrollY,
      width: state.width,
      height: state.height,
      zoom: state.zoom.value,
    },
    collectSceneBounds(existing),
  );

  const skeletons = template.elements.map(el => toExcalidrawSkeleton(el, origin.x, origin.y));
  const groupId = options.group !== false
    ? `tpl_${template.id}_${Date.now().toString(36)}`
    : null;

  const placed = convertToExcalidrawElements(skeletons, { regenerateIds: true }).map((element, index) => {
    const spec = template.elements[index];
    const patch: Record<string, unknown> = {};
    if (element.type === 'text') {
      patch.fontFamily = FONT_FAMILY.Excalifont;
      if (spec?.type === 'text') {
        if (spec.textAlign !== undefined) patch.textAlign = spec.textAlign;
        if (spec.verticalAlign !== undefined) patch.verticalAlign = spec.verticalAlign;
        if (spec.width !== undefined) {
          patch.width = spec.width;
          patch.x = Math.round(origin.x + spec.x);
          patch.autoResize = false;
        }
        if (spec.height !== undefined && spec.verticalAlign === 'middle') {
          patch.y = Math.round(origin.y + spec.y + Math.max(0, (spec.height - element.height) / 2));
        }
      }
    }
    if (groupId) patch.groupIds = [...element.groupIds, groupId];
    return Object.keys(patch).length > 0 ? newElementWith(element, patch) : element;
  });

  const selectedElementIds: Record<string, true> = {};
  for (const el of placed) selectedElementIds[el.id] = true;

  api.setActiveTool({ type: 'selection' });
  api.updateScene({
    elements: [...existing, ...placed],
    appState: { selectedElementIds },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  api.scrollToContent(placed, { fitToViewport: true, viewportZoomFactor: 0.78, animate: false });
  return true;
}
