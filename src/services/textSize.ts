import { CaptureUpdateAction, convertToExcalidrawElements, newElementWith } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { ensureHandDrawnFonts } from './fonts';
import { getCanvasRevision } from './canvasBridge';
import { layoutChangedText } from './canvasPlanLayout';

export async function setTextSize(api: ExcalidrawImperativeAPI, fontSize: number): Promise<void> {
  if (!Number.isFinite(fontSize) || fontSize < 1 || fontSize > 500) return;
  const revision = getCanvasRevision();
  const ids = new Set(api.getSceneElements().filter(element => api.getAppState().selectedElementIds[element.id]).flatMap(element => [element.id, ...(element.boundElements ?? []).filter(bound => bound.type === 'text').map(bound => bound.id)]));
  await ensureHandDrawnFonts(api.getSceneElements().filter(element => ids.has(element.id) && element.type === 'text').map(element => 'text' in element ? element.text : '').join(''));
  if (revision !== getCanvasRevision()) return;
  const changed = new Set<string>();
  const elements = api.getSceneElementsIncludingDeleted().map(element => {
    if (element.type !== 'text' || !ids.has(element.id) || element.isDeleted) return element;
    changed.add(element.id);
    if (element.containerId) return newElementWith(element, { fontSize });
    const [sized] = convertToExcalidrawElements([{ ...element, text: element.originalText, fontSize }], { regenerateIds: false });
    return newElementWith(element, { fontSize, width: sized!.width, height: sized!.height, text: 'text' in sized! ? sized.text : element.text });
  });
  api.updateScene({ elements: layoutChangedText(elements, changed), appState: { currentItemFontSize: fontSize }, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
}
