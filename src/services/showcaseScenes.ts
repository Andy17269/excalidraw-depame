import { CaptureUpdateAction, FONT_FAMILY, convertToExcalidrawElements, getCommonBounds, newElementWith } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { BinaryFileData, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { SHOWCASE_EXAMPLES, showcaseMetadata, type ShowcaseId } from './showcaseCatalog';
import { buildShowcaseLayout, type ShowcaseImage } from './showcaseLayouts';
import { buildMusicDemoSketch } from './visionDemo';
import { buildMusicDemoScene, MUSIC_DEMO_TEXT_CORPUS } from './musicDemoUi';
import { ensureHandDrawnFonts } from './fonts';
import { getCanvasRevision } from './canvasBridge';
import { computeTemplateOrigin } from './uiTemplates';

export async function insertShowcaseSketch(api: ExcalidrawImperativeAPI, id: ShowcaseId = 'music'): Promise<void> {
  const revision = getCanvasRevision();
  const example = SHOWCASE_EXAMPLES.find(item => item.id === id)!;
  let elements: ExcalidrawElement[];
  if (id === 'music') elements = await buildMusicDemoSketch();
  else {
    const { elements: specs } = buildShowcaseLayout(id, true);
    await ensureHandDrawnFonts(specs.flatMap(el => el.type === 'text' ? [el.text] : []).join(''));
    elements = convertToExcalidrawElements(specs.map(el => el.type === 'text' ? { ...el, fontFamily: FONT_FAMILY.Excalifont } : el), { regenerateIds: true });
  }
  if (revision !== getCanvasRevision()) return;
  const existing = api.getSceneElementsIncludingDeleted();
  const visible = existing.filter(el => !el.isDeleted);
  const state = api.getAppState();
  const [minX, minY, maxX, maxY] = visible.length ? getCommonBounds(visible) : [0, 0, 0, 0];
  const origin = computeTemplateOrigin(example, { ...state, zoom: state.zoom.value }, visible.length ? [{ minX, minY, maxX, maxY }] : []);
  const instance = crypto.randomUUID();
  const placed = elements.map((el, i) => newElementWith(el, {
    x: el.x + origin.x, y: el.y + origin.y,
    customData: showcaseMetadata(id, instance, i === 0 ? 'frame' : 'part', el.id),
  }));
  api.setActiveTool({ type: 'selection' });
  api.updateScene({ elements: [...existing, ...placed], appState: { selectedElementIds: {} }, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  api.scrollToContent(placed, { fitToViewport: true, viewportZoomFactor: 0.78, animate: false });
}

async function loadPhoto(spec: ShowcaseImage, signal: AbortSignal): Promise<BinaryFileData> {
  const response = await fetch(new URL(`${import.meta.env.BASE_URL}${spec.path}`, document.baseURI), { signal });
  if (!response.ok) throw new Error('示例图片加载失败，请重试');
  const dataURL = await new Promise<string>((resolve, reject) => {
    response.blob().then(blob => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    }, reject);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('示例图片无法解码，请重试'));
    image.src = dataURL;
  });
  if (signal.aborted) throw new Error('生成已取消');
  // Cover-crop locally, keeping actual photo pixels; only the image is rasterized.
  const canvas = document.createElement('canvas');
  canvas.width = spec.width * 2;
  canvas.height = spec.height * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('图片处理不可用');
  const scale = Math.max(canvas.width / img.width, canvas.height / img.height) * (spec.key === 'trail' ? 1.5 : 1);
  const cropX = spec.key === 'bay' ? 0.8 : spec.key === 'trail' ? 0.15 : 0.5;
  ctx.drawImage(img, (canvas.width - img.width * scale) * cropX, (canvas.height - img.height * scale) / 2, img.width * scale, img.height * scale);
  return { id: `showcase-${crypto.randomUUID()}` as BinaryFileData['id'], dataURL: canvas.toDataURL('image/png') as BinaryFileData['dataURL'], mimeType: 'image/png', created: Date.now() };
}

export async function buildShowcaseScene(id: ShowcaseId, bounds: { x: number; y: number; width: number; height: number }, signal: AbortSignal) {
  const example = SHOWCASE_EXAMPLES.find(item => item.id === id)!;
  let elements: ExcalidrawElement[];
  let files: BinaryFileData[];
  if (id === 'music') {
    await ensureHandDrawnFonts(MUSIC_DEMO_TEXT_CORPUS);
    ({ elements, files } = await buildMusicDemoScene({ x: 195, y: 422 }, true));
  } else {
    const layout = buildShowcaseLayout(id, false);
    files = await Promise.all(layout.images.map(spec => loadPhoto(spec, signal)));
    await ensureHandDrawnFonts(layout.elements.flatMap(el => el.type === 'text' ? [el.text] : []).join(''));
    // Place photos above backgrounds; the photo regions never contain text.
    const specs = [...layout.elements, ...layout.images.map((spec, i) => ({ type: 'image' as const, fileId: files[i]!.id, x: spec.x, y: spec.y, width: spec.width, height: spec.height }))];
    elements = convertToExcalidrawElements(specs.map(el => el.type === 'text' ? { ...el, fontFamily: FONT_FAMILY.Excalifont } : el), { regenerateIds: true });
  }
  const scale = Math.min(bounds.width / example.width, bounds.height / example.height);
  const offsetX = bounds.x + (bounds.width - example.width * scale) / 2;
  const offsetY = bounds.y + (bounds.height - example.height * scale) / 2;
  elements = elements.map(el => newElementWith(el, {
    x: offsetX + el.x * scale, y: offsetY + el.y * scale,
    width: el.width * scale, height: el.height * scale,
    ...(el.type === 'text' ? { fontSize: el.fontSize * scale } : {}),
    ...(el.type === 'line' || el.type === 'arrow' ? { points: el.points.map(([x, y]) => [x * scale, y * scale] as [number, number]) } : {}),
  }));
  return { elements, files };
}
