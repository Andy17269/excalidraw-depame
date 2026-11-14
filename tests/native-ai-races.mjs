import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { Acde } from '../scripts/acde-driver.mjs';
import { createNativeFixture, waitForNative } from '../scripts/native-fixture.mjs';
const output = resolve(process.env.CANVAS_TEST_OUTPUT || '.debug/ai-races');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(output, 'profile-'));
const cwd = await createNativeFixture(profile);
const source = path => JSON.stringify(relative(cwd, resolve(path)).replaceAll('\\', '/'));
await writeFile(join(cwd, 'index.html'), '<!doctype html><html><body><div id="root" style="width:1280px;height:800px"></div><script type="module" src="./race-test.ts"></script></body></html>');
await writeFile(join(cwd, 'race-test.ts'), `
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Excalidraw, CaptureUpdateAction, convertToExcalidrawElements, newElementWith } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { generateUiFromSketch } from ${source('src/services/aiVision.ts')};
import { bindCanvas, invalidateCanvas } from ${source('src/services/canvasBridge.ts')};
import { installCanvasCompat } from ${source('src/services/canvasCompat.ts')};
window.EXCALIDRAW_ASSET_PATH = new URL('./excalidraw-assets/', document.baseURI).href;
installCanvasCompat();
const originalFetch = window.fetch.bind(window);
window.fetch = (input, init) => String(input).endsWith('/api/vision-ui')
  ? new Promise(resolve => { window.releaseVision = () => resolve(new Response(JSON.stringify({elements:[{type:'rectangle',x:0,y:0,width:200,height:300,backgroundColor:'#ffffff',fillStyle:'solid'},{type:'text',x:20,y:20,text:'Generated result',fontSize:20}]}),{status:200,headers:{'Content-Type':'application/json'}})); })
  : originalFetch(input, init);
createRoot(document.getElementById('root')).render(createElement(Excalidraw, {excalidrawAPI(api) {
  bindCanvas(api);
  window.raceScene = () => api.getSceneElements();
  window.startRace = () => {
    api.resetScene();
    api.updateScene({elements:convertToExcalidrawElements([{id:'source',type:'rectangle',x:100,y:100,width:240,height:320,label:{text:'Original sketch'}}],{regenerateIds:false}),captureUpdate:CaptureUpdateAction.NEVER});
    bindCanvas(api);
    window.releaseVision = null;
    window.raceResult = null;
    window.raceAbort = new AbortController();
    generateUiFromSketch(api, '', window.raceAbort.signal, {scope:'all'}).then(()=>window.raceResult={ok:true},error=>window.raceResult={ok:false,error:error.message});
  };
  window.changeSource = () => api.updateScene({elements:api.getSceneElements().map(el=>el.id==='source'?newElementWith(el,{x:el.x+80}):el),captureUpdate:CaptureUpdateAction.IMMEDIATELY});
  window.changeDocument = () => { invalidateCanvas(); api.resetScene(); api.updateScene({elements:convertToExcalidrawElements([{id:'other-document',type:'rectangle',x:0,y:0,width:40,height:40}],{regenerateIds:false}),captureUpdate:CaptureUpdateAction.NEVER}); };
  window.raceReady = true;
}}));
`);
const acde = await Acde.launch({ cwd, out: join(profile, 'build'), headless: true,
  env: { XDG_DATA_HOME: join(profile, 'data'), XDG_CONFIG_HOME: join(profile, 'config'), XDG_STATE_HOME: join(profile, 'state'), ACDE_STORAGE: '' } });
const app = acde.window('excalidraw-depame');
try {
  await waitForNative(app, 'window.raceReady', 'Race fixture ready');
  await app.evaluate('window.startRace()');
  await waitForNative(app, 'Boolean(window.releaseVision)', 'Vision request queued');
  await app.evaluate('window.changeSource(); window.releaseVision()');
  await waitForNative(app, 'Boolean(window.raceResult)', 'Stale result handled');
  const result = await app.evaluate('({result:window.raceResult,scene:window.raceScene()})');
  assert.equal(result.result.ok, false, 'A stale vision result must reject instead of overwriting a newer sketch');
  assert.match(result.result.error, /草图已更新|画布已更新/);
  assert.equal(result.scene.find(el => el.id === 'source')?.x, 180);
  assert.ok(!result.scene.some(el => el.text?.includes('Generated result')));
  console.log('PASS delayed vision result preserves edits made during generation');

  await app.evaluate('window.startRace()');
  await waitForNative(app, 'Boolean(window.releaseVision)', 'Second vision queued');
  await app.evaluate('window.changeDocument(); window.releaseVision()');
  await waitForNative(app, 'Boolean(window.raceResult)', 'Document switch handled');
  assert.equal(await app.evaluate('window.raceResult.ok'), false);
  assert.deepEqual(await app.evaluate('window.raceScene().map(el=>el.id)'), ['other-document']);
  console.log('PASS delayed vision result cannot write into a different document');

  await app.evaluate('window.startRace()');
  await waitForNative(app, 'Boolean(window.releaseVision)', 'Third vision queued');
  const before = await app.evaluate('JSON.stringify(window.raceScene())');
  await app.evaluate('window.raceAbort.abort(); window.releaseVision()');
  await waitForNative(app, 'Boolean(window.raceResult)', 'Abort handled');
  assert.equal(await app.evaluate('window.raceResult.ok'), false);
  assert.equal(await app.evaluate('JSON.stringify(window.raceScene())'), before);
  assert.deepEqual((await acde.console({ level: 'errors' })).entries, []);
  console.log('PASS aborted vision ignores late responses and preserves scene');
} catch (error) {
  await app.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
  throw error;
} finally { await acde.close(); }
