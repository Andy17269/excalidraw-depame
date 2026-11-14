import { convertToExcalidrawElements, newElementWith } from '@excalidraw/excalidraw';
import type { ExcalidrawElement, ExcalidrawTextElement } from '@excalidraw/excalidraw/element/types';

type TextContainer = Extract<ExcalidrawElement, { type: 'rectangle' | 'diamond' | 'ellipse' | 'arrow' }>;

function isTextContainer(element: ExcalidrawElement): element is TextContainer {
  return ['rectangle', 'diamond', 'ellipse', 'arrow'].includes(element.type);
}

function resizeEndpoint(point: readonly number[], before: TextContainer, after: TextContainer): [number, number] {
  const cosine = Math.cos(before.angle);
  const sine = Math.sin(before.angle);
  const dx = point[0]! - before.x - before.width / 2;
  const dy = point[1]! - before.y - before.height / 2;
  const x = dx * cosine + dy * sine;
  const y = dy * cosine - dx * sine;
  const horizontal = Math.abs(x) / (before.width / 2);
  const vertical = Math.abs(y) / (before.height / 2);
  const distance = before.type === 'ellipse' ? Math.hypot(horizontal, vertical)
    : before.type === 'diamond' ? horizontal + vertical : Math.max(horizontal, vertical);
  if (!Number.isFinite(distance) || distance === 0) return [after.x + after.width / 2, after.y + after.height / 2];
  const boundaryX = x / distance;
  const boundaryY = y / distance;
  const nextX = boundaryX * after.width / before.width + x - boundaryX;
  const nextY = boundaryY * after.height / before.height + y - boundaryY;
  return [after.x + after.width / 2 + nextX * cosine - nextY * sine,
    after.y + after.height / 2 + nextX * sine + nextY * cosine];
}

export function layoutChangedText(elements: readonly ExcalidrawElement[], changedIds: ReadonlySet<string>): ExcalidrawElement[] {
  const byId = new Map(elements.map(element => [element.id, element]));
  const resized = new Map<string, { before: TextContainer; after: TextContainer }>();
  const arrowLabels = new Set<string>();
  const layout = (text: ExcalidrawTextElement) => {
    const container = text.containerId ? byId.get(text.containerId) : undefined;
    if (!container || container.isDeleted) return;
    if (!isTextContainer(container)) throw new Error('此容器暂不支持修改绑定文字');
    const converted = convertToExcalidrawElements([{
      ...container,
      boundElements: container.boundElements?.filter(bound => bound.type !== 'text'),
      // An invisible glyph keeps the converter's label path active for an empty title.
      label: { ...text, text: text.originalText || '\u200b' },
    }], { regenerateIds: false });
    const sizedContainer = converted.find(element => element.id === container.id)!;
    const sizedText = converted.find(element => element.id === text.id);
    if (sizedText?.type !== 'text') throw new Error('绑定文字布局失败');
    const nextContainer = newElementWith(container, { width: sizedContainer.width, height: sizedContainer.height });
    byId.set(container.id, nextContainer);
    byId.set(text.id, newElementWith(text, {
      text: text.originalText ? sizedText.text : '', x: sizedText.x, y: sizedText.y,
      width: sizedText.width, height: sizedText.height, angle: sizedText.angle,
    }));
    if (container.width !== nextContainer.width || container.height !== nextContainer.height) {
      resized.set(container.id, { before: container, after: nextContainer });
    }
  };
  for (const id of changedIds) {
    const text = byId.get(id);
    if (text?.type !== 'text' || !text.containerId) continue;
    if (byId.get(text.containerId)?.type === 'arrow') arrowLabels.add(id);
    else layout(text);
  }
  for (const element of elements) {
    if (element.type !== 'arrow' || element.isDeleted) continue;
    const start = element.startBinding && resized.get(element.startBinding.elementId);
    const end = element.endBinding && resized.get(element.endBinding.elementId);
    if (!start && !end) continue;
    // Rebuilding these routes would discard user routing; reject before committing the plan.
    if (('elbowed' in element && element.elbowed) || element.angle !== 0) throw new Error('此连线暂不支持随文字扩容，请先调整节点大小');
    const points = element.points.map(point => [element.x + point[0], element.y + point[1]]);
    if (start) points[0] = resizeEndpoint(points[0]!, start.before, start.after);
    if (end) points[points.length - 1] = resizeEndpoint(points.at(-1)!, end.before, end.after);
    const [x, y] = points[0]!;
    byId.set(element.id, newElementWith(byId.get(element.id) as typeof element, {
      x, y,
      width: Math.max(...points.map(point => point[0]!)) - Math.min(...points.map(point => point[0]!)),
      height: Math.max(...points.map(point => point[1]!)) - Math.min(...points.map(point => point[1]!)),
      points: points.map(point => [point[0]! - x!, point[1]! - y!]) as typeof element.points,
    }));
    for (const bound of element.boundElements ?? []) if (bound.type === 'text') arrowLabels.add(bound.id);
  }
  for (const id of arrowLabels) {
    const text = byId.get(id);
    if (text?.type === 'text') layout(text);
  }
  return elements.map(element => byId.get(element.id)!);
}
