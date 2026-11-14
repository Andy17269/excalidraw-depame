import { CaptureUpdateAction, FONT_FAMILY, convertToExcalidrawElements, exportToBlob, getCommonBounds, newElementWith } from '@excalidraw/excalidraw';
import type { BinaryFileData, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { getCanvasRevision } from './canvasBridge';
import { ensureHandDrawnFonts } from './fonts';
import { notify } from './notifications';
import { UI_ASSET_MAP } from './uiAssets';
import { sanitizeVisionElements } from './visionSanitize';
import { fetchApi } from './apiFetch';
import { animateDiagramCreation } from './canvasAnimator';
import { buildSpatialCanvasContext, snapToGrid8 } from './canvasContext';
import { OFFLINE_AI_MESSAGE } from './networkStatus';
import { resolveShowcase, SHOWCASE_EXAMPLES } from './showcaseCatalog';
import { buildShowcaseScene } from './showcaseScenes';

function resolveAssetUrl(path: string): string {
  return new URL(`${import.meta.env.BASE_URL}${path}`, document.baseURI).href;
}

async function fetchAsDataUrl(url: string): Promise<{ dataURL: string; mimeType: string }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('素材加载失败');
  const blob = await response.blob();
  const dataURL = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return { dataURL, mimeType: blob.type || 'image/png' };
}

export async function generateUiFromSketch(
  api: ExcalidrawImperativeAPI,
  prompt: string,
  signal: AbortSignal,
  options?: { scope?: 'selected' | 'all'; allowRemote?: boolean },
): Promise<void> {
  const allElements = api.getSceneElements();
  if (!allElements.length) throw new Error('画布为空');

  const appState = api.getAppState();
  const { context, viewportSourceElements } = buildSpatialCanvasContext(allElements, appState);
  const selectedIds = appState.selectedElementIds;
  const selectedElements = allElements.filter(element => selectedIds[element.id]);
  const useSelected = options?.scope !== 'all' && selectedElements.length > 0;
  const sourceElements = useSelected
    ? selectedElements
    : (viewportSourceElements.length > 0 ? viewportSourceElements : allElements);
  const replacedIds = new Set(sourceElements.map(element => element.id));
  const [srcLeft, srcTop, srcRight, srcBottom] = getCommonBounds(sourceElements);
  const targetSize = {
    width: Math.max(40, Math.round(srcRight - srcLeft)),
    height: Math.max(40, Math.round(srcBottom - srcTop)),
  };

  const revision = getCanvasRevision();
  const sourceVersions = new Map(sourceElements.map(element => [element.id, element.version]));
  const assertSourceCurrent = () => {
    if (signal.aborted || revision !== getCanvasRevision()) throw new Error('画布已切换');
    const current = new Map(api.getSceneElements().map(element => [element.id, element.version]));
    for (const [id, version] of sourceVersions) {
      if (current.get(id) !== version) throw new Error('草图已更新，请重新生成');
    }
  };
  const showcase = resolveShowcase(sourceElements, allElements);
  if (showcase) {
    const { elements: showcaseElements, files: showcaseFiles } = await buildShowcaseScene(showcase.id, showcase.bounds, signal);
    assertSourceCurrent();
    const preReplaceScene = api.getSceneElementsIncludingDeleted();
    const remaining = preReplaceScene.filter(el => !showcase.elementIds.has(el.id));
    if (showcaseFiles.length) api.addFiles(showcaseFiles);
    const appState = api.getAppState();
    api.updateScene({
      appState: { selectedElementIds: {} },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    try {
      await animateDiagramCreation({
        api,
        host: document.querySelector<HTMLElement>('.canvas-stage'),
        baseElements: remaining,
        undoBaseElements: preReplaceScene,
        newElements: showcaseElements,
        targetViewport: {
          zoom: appState.zoom.value,
          scrollX: appState.scrollX,
          scrollY: appState.scrollY,
        },
        isCurrent: () => !signal.aborted && revision === getCanvasRevision(),
      });
    } catch (error) {
      // Do not restore into a newly opened document; a same-document cancellation
      // must leave the original sketch intact, even after partial reveal frames.
      if (revision === getCanvasRevision()) {
        api.updateScene({ elements: preReplaceScene, appState: { shouldCacheIgnoreZoom: false }, captureUpdate: CaptureUpdateAction.NEVER });
      }
      throw error;
    }

    notify(`已完成${SHOWCASE_EXAMPLES.find(item => item.id === showcase.id)!.title}示例`);
    return;
  }

  if (options?.allowRemote === false) throw new Error(OFFLINE_AI_MESSAGE);

  const blob = await exportToBlob({
    elements: sourceElements,
    files: api.getFiles(),
    maxWidthOrHeight: 768,
    appState: { exportBackground: true },
  });
  const image = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  assertSourceCurrent();

  const response = await fetchApi('/api/vision-ui', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image, prompt: prompt.trim(), targetSize, context }),
    signal,
  });
  const body = await response.json().catch(() => ({})) as { elements?: unknown[]; error?: string };
  if (!response.ok || !Array.isArray(body.elements)) throw new Error(body.error ?? '识图生成失败');
  assertSourceCurrent();

  const sanitized = sanitizeVisionElements(body.elements, FONT_FAMILY.Excalifont);
  if (!sanitized.shapes.length && !sanitized.images.length) throw new Error('未生成有效 UI');

  await ensureHandDrawnFonts(sanitized.texts || '应用界面 界面');
  assertSourceCurrent();

  const uniqueAssets = [...new Set(sanitized.images.map(item => item.assetId))];
  const loadedAssets = new Map<string, BinaryFileData['id']>();
  const binaryFiles: BinaryFileData[] = [];

  await Promise.all(uniqueAssets.map(async assetId => {
    const asset = UI_ASSET_MAP.get(assetId);
    if (!asset) return;
    const { dataURL, mimeType } = await fetchAsDataUrl(resolveAssetUrl(asset.path));
    const fileId = `ui-${assetId}-${crypto.randomUUID()}` as BinaryFileData['id'];
    loadedAssets.set(assetId, fileId);
    binaryFiles.push({
      id: fileId,
      dataURL: dataURL as BinaryFileData['dataURL'],
      mimeType: mimeType as BinaryFileData['mimeType'],
      created: Date.now(),
      lastRetrieved: Date.now(),
    });
  }));

  assertSourceCurrent();

  const imageSkeletons = sanitized.images.flatMap(item => {
    const fileId = loadedAssets.get(item.assetId);
    if (!fileId) return [];
    return [{ type: 'image' as const, fileId, x: item.x, y: item.y, width: item.width, height: item.height, opacity: item.opacity }];
  });

  const overlayTexts = sanitized.shapes.filter(shape => shape.type === 'text');
  const containerShapes = sanitized.shapes.filter(shape => shape.type !== 'text');
  const allSkeletons = [...containerShapes, ...imageSkeletons, ...overlayTexts] as Parameters<typeof convertToExcalidrawElements>[0];
  let converted = convertToExcalidrawElements(allSkeletons, { regenerateIds: true }).map(element =>
    element.type === 'text' ? newElementWith(element, { fontFamily: FONT_FAMILY.Excalifont }) : element,
  );
  if (!converted.length) throw new Error('未生成有效 UI');

  const [left, top, right, bottom] = getCommonBounds(converted);
  const offsetX = snapToGrid8((srcLeft + srcRight) / 2 - (left + right) / 2);
  const offsetY = snapToGrid8((srcTop + srcBottom) / 2 - (top + bottom) / 2);
  converted = converted.map(element => newElementWith(element, { x: element.x + offsetX, y: element.y + offsetY }));

  const remainingElements = api.getSceneElementsIncludingDeleted().filter(element => !replacedIds.has(element.id));
  if (binaryFiles.length) api.addFiles(binaryFiles);
  api.updateScene({
    elements: [...remainingElements, ...converted],
    appState: { selectedElementIds: {} },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  if (!useSelected) {
    api.scrollToContent(converted, { fitToViewport: true, viewportZoomFactor: 0.8, animate: false });
  }
  void notify(useSelected ? '区域 UI 已生成' : '高保真 UI 已生成');
}
