import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { Acde } from '../scripts/acde-driver.mjs';
import { createNativeFixture } from '../scripts/native-fixture.mjs';

const output = resolve(process.env.CANVAS_TEST_OUTPUT || '.debug/regression-artifacts');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(output, 'canvas-plan-'));
const cwd = await createNativeFixture(profile);
const source = file => JSON.stringify(relative(cwd, resolve(file)).replaceAll('\\', '/'));
await writeFile(join(cwd, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="./excalidraw-assets/fonts.css"></head><body><div id="root" style="width:1280px;height:800px"></div><script type="module" src="./plan-test.ts"></script></body></html>');
await writeFile(join(cwd, 'plan-test.ts'), `
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Excalidraw, CaptureUpdateAction, FONT_FAMILY, convertToExcalidrawElements, newElementWith } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { applyCanvasPlan } from ${source('src/services/canvasPlan.ts')};
import { bindCanvas, getCanvasRevision } from ${source('src/services/canvasBridge.ts')};
import { installCanvasCompat } from ${source('src/services/canvasCompat.ts')};
window.EXCALIDRAW_ASSET_PATH = new URL('./excalidraw-assets/', document.baseURI).href;
installCanvasCompat();
createRoot(document.getElementById('root')).render(createElement(Excalidraw, {
  handleKeyboardGlobally: true,
  excalidrawAPI(api) {
    bindCanvas(api);
    window.planScene = () => api.getSceneElements();
    window.planReject = async () => {
      api.updateScene({ elements: api.getSceneElements().map(element => element.id === 'attached' ? newElementWith(element, { angle: .2 }) : element), captureUpdate: CaptureUpdateAction.NEVER });
      const before = JSON.stringify(api.getSceneElements());
      const text = api.getSceneElements().find(element => element.id === 'rectangle-text').originalText.repeat(4);
      let error = '';
      try { await applyCanvasPlan({ mermaid: 'flowchart LR\\nA-->B', changes: [{ id: 'rectangle-text', text }] }, api,
        new Map(api.getSceneElements().map(element => [element.id, element.version])), getCanvasRevision()); }
      catch (failure) { error = failure.message; }
      return { before, after: JSON.stringify(api.getSceneElements()), error };
    };
    window.planAppend = async () => {
      api.updateScene({ elements: api.getSceneElements().map(element => element.id === 'attached' ? newElementWith(element, { angle: 0 }) : element), captureUpdate: CaptureUpdateAction.NEVER });
      const before = api.getSceneElements();
      await applyCanvasPlan({ mermaid: 'flowchart LR\\nA[New]-->B[Diagram]', changes: [{ id: 'rectangle-text', text: 'Updated' }, { id: 'unrelated', text: '', backgroundColor: '#09f' }] }, api,
        new Map(before.map(element => [element.id, element.version])), getCanvasRevision());
      return { before, after: api.getSceneElements() };
    };
    window.planTest = async () => {
      const types = ['rectangle', 'diamond', 'ellipse', 'arrow'];
      const elements = types.flatMap((type, index) => convertToExcalidrawElements([{
        id: type, type, x: 100 + index * 260, y: 100, width: 160, height: type === 'arrow' ? 0 : 70,
        strokeColor: '#1971c2', backgroundColor: '#a5d8ff', opacity: 75,
        ...(type === 'arrow' ? { points: [[0, 0], [160, 0]] } : {}),
        label: { id: type + '-text', text: 'Old', fontFamily: FONT_FAMILY.Excalifont, fontSize: 20, strokeColor: '#e03131' },
      }], { regenerateIds: false }));
      const [connection] = convertToExcalidrawElements([{ id: 'attached', type: 'arrow', x: 180, y: 171, points: [[0, 0], [0, 2829]] }], { regenerateIds: false });
      const rectangle = elements.findIndex(element => element.id === 'rectangle');
      elements[rectangle] = newElementWith(elements[rectangle], { boundElements: [...elements[rectangle].boundElements, { type: 'arrow', id: 'attached' }] });
      elements.push(newElementWith(connection, { startBinding: { elementId: 'rectangle', focus: 0, gap: 1 } }));
      const unrelated = convertToExcalidrawElements([{ id: 'unrelated', type: 'rectangle', x: 10, y: 10, width: 30, height: 20 }], { regenerateIds: false })[0];
      api.updateScene({ elements: [...elements, unrelated], captureUpdate: CaptureUpdateAction.NEVER });
      const before = JSON.parse(JSON.stringify(api.getSceneElements()));
      api.history.clear();
      const replacement = '这是一个需要自动换行的较长中文节点标题，文字必须始终留在原有图形内部，并且随着标题变长自动扩容，保持水平和垂直居中，同时保留既有图形样式与连接关系。';
      await applyCanvasPlan({ changes: types.map(type => ({ id: type === 'rectangle' ? type : type + '-text', text: replacement })) }, api,
        new Map(before.map(element => [element.id, element.version])), getCanvasRevision());
      const after = JSON.parse(JSON.stringify(api.getSceneElements()));
      await applyCanvasPlan({ changes: [{ id: 'rectangle-text', text: 'Short' }] }, api,
        new Map(after.map(element => [element.id, element.version])), getCanvasRevision());
      return { before, after, shortened: api.getSceneElements(), replacement };
    };
  },
}));
`);
const acde = await Acde.launch({ cwd, out: join(profile, 'build'), headless: true, env: { XDG_DATA_HOME: join(profile, 'data'), XDG_CONFIG_HOME: join(profile, 'config'), XDG_STATE_HOME: join(profile, 'state'), ACDE_STORAGE: '' } });
try {
  const app = acde.window('excalidraw-depame');
  await app.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 });
  const result = await app.evaluate('window.planTest()');
  const byId = elements => new Map(elements.map(element => [element.id, element]));
  const before = byId(result.before);
  const after = byId(result.after);
  assert.deepEqual([...after.keys()], [...before.keys()], 'Changing a label must preserve element IDs and ordering');
  assert.deepEqual(after.get('unrelated'), before.get('unrelated'), 'Unrelated elements must remain unchanged');
  for (const type of ['rectangle', 'diamond', 'ellipse']) {
    const shape = after.get(type);
    const text = after.get(type + '-text');
    assert.ok(text.text.includes('\n'), `${type}: long label must wrap`);
    assert.equal(text.originalText, result.replacement);
    assert.equal(text.containerId, shape.id);
    assert.deepEqual(shape.boundElements, before.get(type).boundElements, `${type}: bindings must remain editable`);
    assert.ok(shape.height > before.get(type).height, `${type}: container must grow vertically`);
    assert.ok(text.x >= shape.x && text.x + text.width <= shape.x + shape.width, `${type}: label must fit horizontally`);
    assert.ok(text.y >= shape.y && text.y + text.height <= shape.y + shape.height, `${type}: label must fit vertically`);
    assert.ok(Math.abs(text.x + text.width / 2 - shape.x - shape.width / 2) < 1, `${type}: label must stay horizontally centered`);
    assert.ok(Math.abs(text.y + text.height / 2 - shape.y - shape.height / 2) < 1, `${type}: label must stay vertically centered`);
    assert.equal(shape.opacity, 75);
    assert.equal(shape.backgroundColor, '#a5d8ff');
    assert.equal(text.strokeColor, '#e03131');
    assert.ok(shape.version > before.get(type).version, `${type}: resized container must be recorded for undo and autosave`);
  }
  assert.deepEqual(after.get('arrow').points, before.get('arrow').points, 'Changing an arrow label must preserve its path');
  assert.equal(after.get('arrow-text').containerId, 'arrow');
  assert.ok(after.get('arrow-text').text.includes('\n'), 'Arrow labels must wrap');
  const attached = after.get('attached');
  assert.equal(attached.startBinding.elementId, 'rectangle');
  assert.ok(Math.abs(attached.y + attached.points[0][1] - after.get('rectangle').y - after.get('rectangle').height - 1) < 1, 'Attached endpoint must follow the expanded bottom edge with its existing gap');
  assert.equal(attached.y + attached.points.at(-1)[1], before.get('attached').y + before.get('attached').points.at(-1)[1], 'Unattached endpoint must remain in place');
  const short = byId(result.shortened);
  assert.equal(short.get('rectangle-text').text, 'Short');
  assert.ok(Math.abs(short.get('rectangle-text').x + short.get('rectangle-text').width / 2 - short.get('rectangle').x - short.get('rectangle').width / 2) < 1, 'Shortened label must be recentered');
  assert.ok(Math.abs(short.get('rectangle-text').y + short.get('rectangle-text').height / 2 - short.get('rectangle').y - short.get('rectangle').height / 2) < 1, 'Shortened label must be vertically recentered');
  await app.keyboard.press('Control+z');
  const undone = byId(await app.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(window.planScene()))))'));
  assert.equal(undone.get('rectangle-text').text, after.get('rectangle-text').text, 'Undo must restore the wrapped long title');
  assert.equal(undone.get('rectangle-text').y, after.get('rectangle-text').y, 'Undo must restore the long title layout');
  const rejected = await app.evaluate('window.planReject()');
  assert.match(rejected.error, /此连线暂不支持/);
  assert.equal(rejected.after, rejected.before, 'Unsupported geometry must reject before appending Mermaid or changing any elements');
  const appended = await app.evaluate('window.planAppend()');
  assert.ok(appended.after.length > appended.before.length, 'Prepared text changes must retain appended Mermaid elements');
  assert.equal(appended.after.find(element => element.id === 'rectangle-text').text, 'Updated');
  assert.equal(appended.after.find(element => element.id === 'unrelated').backgroundColor, '#0099ff');
  console.log('PASS native canvas plan bound labels wrap, center, resize containers and preserve editable bindings');
} catch (error) {
  console.error(error.message);
  console.error(JSON.stringify((await acde.console({ level: 'errors' }).catch(() => ({ entries: [] }))).entries));
  process.exitCode = 1;
} finally { await acde.close(); }
