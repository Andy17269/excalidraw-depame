import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { PNG } from 'pngjs';
import { Acde } from '../scripts/acde-driver.mjs';
import { createNativeFixture, waitForNative } from '../scripts/native-fixture.mjs';

const output = resolve('.debug/selection-style');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(output, 'profile-'));
const cwd = await createNativeFixture(profile);
const pathTo = path => relative(cwd, resolve(path)).replaceAll('\\', '/');
await writeFile(join(cwd, 'harness.tsx'), `
import React, {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Excalidraw,convertToExcalidrawElements,serializeAsJSON,restore,CaptureUpdateAction,exportToBlob,exportToSvg} from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import '${pathTo('src/App.css')}';
import '${pathTo('src/index.css')}';
import '${pathTo('src/theme.css')}';
import {attachUndoShortcut} from '${pathTo('src/services/undoShortcut.ts')}';
import {Properties} from '${pathTo('src/components/Properties.tsx')}';
import {installCanvasCompat} from '${pathTo('src/services/canvasCompat.ts')}';
import {installImageCompat} from '${pathTo('src/services/imageCompat.ts')}';
installCanvasCompat();installImageCompat();
const canvas=document.createElement('canvas');canvas.width=240;canvas.height=160;
const ctx=canvas.getContext('2d');ctx.fillStyle='#ff3344';ctx.fillRect(0,0,240,160);
const file={id:'original-image',dataURL:canvas.toDataURL(),mimeType:'image/png',created:1};
window.__aiImage=convertToExcalidrawElements([{type:'image',fileId:file.id,x:0,y:0,width:200,height:120,roundness:{type:3,value:16}}])[0];
const initial={
elements:convertToExcalidrawElements([
{id:'image',type:'image',fileId:file.id,x:330,y:90,width:360,height:240},
{id:'heading',type:'text',x:330,y:355,text:'今日概览 / Today',fontSize:24,strokeColor:'#1e1e1e'},
{id:'card',type:'rectangle',x:330,y:420,width:360,height:80,strokeColor:'#1971c2',backgroundColor:'#a5d8ff',label:{text:'开始专注',fontSize:24,strokeColor:'#1e1e1e'}}
],{regenerateIds:false}),files:{[file.id]:file},appState:{scrollX:0,scrollY:0,viewBackgroundColor:'#ffffff'}};
const initialData=fetch('/style-roundtrip').then(r=>r.ok?r.json():null).then(data=>data?restore(data,null,null):initial);
const listeners=new Set();const subscribe=fn=>{listeners.add(fn);return()=>listeners.delete(fn)};
function Harness(){const [api,setApi]=useState(null);useEffect(()=>{if(api){window.__api=api;return attachUndoShortcut(()=>true,document,()=>api)}},[api]);return <main className='excalidraw-app' style={{height:'100vh'}}>
<Excalidraw initialData={initialData} excalidrawAPI={setApi} onChange={()=>listeners.forEach(fn=>fn())}/>
<nav style={{position:'absolute',top:12,left:330,zIndex:100,display:'flex',gap:12}}>{['image','heading','card'].map(id=><button key={id} onClick={()=>api.updateScene({appState:{selectedElementIds:{[id]:true}},captureUpdate:CaptureUpdateAction.NEVER})}>{id}</button>)}
<button onClick={()=>localStorage.setItem('style-saved',serializeAsJSON(api.getSceneElements(),api.getAppState(),api.getFiles(),'local'))}>保存测试</button></nav>
{api&&<Properties api={api} subscribe={subscribe}/>}</main>}
window.__exportImage=async()=>{const api=window.__api;const elements=api.getSceneElements().filter(e=>e.id==='image');const options={elements,files:api.getFiles(),appState:{exportBackground:false},exportPadding:0};const blob=await exportToBlob(options);const dataURL=await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(blob)});const svg=await exportToSvg(options);return {dataURL,svg:svg.outerHTML}};
createRoot(document.getElementById('root')).render(<Harness/>);
`);
await writeFile(join(cwd, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module" src="./harness.tsx"></script></body></html>');
const acde = await Acde.launch({ cwd, out: join(profile, 'build'), headless: true,
  env: { XDG_DATA_HOME: join(profile, 'data'), XDG_CONFIG_HOME: join(profile, 'config'), XDG_STATE_HOME: join(profile, 'state'), ACDE_STORAGE: '' } });
try {
  const app = acde.window('excalidraw-depame');
  await waitForNative(app, '!!window.__api?.getSceneElements().length', 'style harness ready', 20000);
  const originalURL = await app.evaluate('window.__api.getFiles()["original-image"].dataURL');
  assert.equal(await app.evaluate('window.__aiImage.roundness?.value'), 16, 'AI image conversion must preserve radius');
  await app.getByRole('button', { name: 'image', exact: true }).click();
  await app.getByRole('button', { name: '图片圆角 24', exact: true }).click();
  await waitForNative(app, 'window.__api.getSceneElements().find(e=>e.id==="image").roundness?.value===24', 'image radius committed');
  const exported = await app.evaluate('window.__exportImage()');
  const png = PNG.sync.read(Buffer.from(exported.dataURL.split(',')[1], 'base64'));
  assert.equal(png.data[3], 0, 'image corner must be transparent');
  assert.equal(png.data[((png.height / 2 | 0) * png.width + (png.width / 2 | 0)) * 4 + 3], 255);
  assert.match(exported.svg, /rx="24"/);
  assert.equal(await app.evaluate('window.__api.getSceneElements().find(e=>e.id==="image").fileId'), 'original-image');
  await app.evaluate('new Promise(r=>{let n=20;const f=()=>--n?requestAnimationFrame(f):r();f()})');
  await app.screenshot({ path: join(output, 'image-rounded.png') });
  await app.locator('.excalidraw').focus();
  await app.keyboard.press('ctrl+z');
  await waitForNative(app, '!window.__api.getSceneElements().find(e=>e.id==="image").roundness', 'undo image rounding');
  await app.keyboard.press('ctrl+shift+z');
  await waitForNative(app, 'window.__api.getSceneElements().find(e=>e.id==="image").roundness?.value===24', 'redo image rounding');

  await app.getByRole('button', { name: 'heading', exact: true }).click();
  await app.getByRole('button', { name: '文字颜色 #e03131', exact: true }).click();
  await waitForNative(app, 'window.__api.getSceneElements().find(e=>e.id==="heading").strokeColor==="#e03131"', 'standalone text color');
  await app.getByRole('textbox', { name: '自定义文字颜色', exact: true }).fill('#663399');
  await app.keyboard.press('Enter');
  await waitForNative(app, 'window.__api.getSceneElements().find(e=>e.id==="heading").strokeColor==="#663399"', 'custom text color');
  await app.getByRole('button', { name: 'card', exact: true }).click();
  await app.getByRole('button', { name: '文字颜色 #ffffff', exact: true }).click();
  await waitForNative(app, 'window.__api.getSceneElements().some(e=>e.type==="text"&&e.containerId==="card"&&e.strokeColor==="#ffffff")', 'bound text color');
  assert.equal(await app.evaluate('window.__api.getSceneElements().find(e=>e.id==="card").strokeColor'), '#1971c2', 'text color must preserve card border');
  await app.screenshot({ path: join(output, 'text-color.png') });
  await app.getByRole('button', { name: '保存测试', exact: true }).click();
  const savedScene = await app.evaluate('localStorage.getItem("style-saved")');
  assert.equal(JSON.parse(savedScene).elements.find(e => e.id === 'heading').strokeColor, '#663399', 'saved text color');
  await writeFile(join(output, 'roundtrip.excalidraw'), savedScene);
  // Serve the serialized document on the next load, independently of runtime storage.
  await acde.route('/style-roundtrip', { json: JSON.parse(savedScene) });
  await acde.reload('excalidraw-depame');
  await waitForNative(app, '!!window.__api?.getSceneElements().length', 'reload saved scene');
  assert.equal(await app.evaluate('window.__api.getSceneElements().find(e=>e.id==="heading").strokeColor'), '#663399');
  await app.getByRole('button', { name: 'image', exact: true }).click();
  assert.equal(await app.evaluate('document.querySelector("input[aria-label=图片圆角]").value'), '24');
  for (let i = 0; i < 2; i++) {
    await app.getByRole('textbox', { name: '图片圆角', exact: true }).fill('1000');
    await app.keyboard.press('Enter');
    await waitForNative(app, 'document.querySelector("input[aria-label=图片圆角]").value==="60" && window.__api.getSceneElements().find(e=>e.id==="image").roundness?.value===60', 'clamped radius input display');
  }
  await app.getByRole('button', { name: '图片圆角 0', exact: true }).click();
  await waitForNative(app, '!window.__api.getSceneElements().find(e=>e.id==="image").roundness', 'restore straight corners after save and reopen');
  assert.equal(await app.evaluate('window.__api.getFiles()["original-image"].dataURL'), originalURL);
  assert.deepEqual((await acde.console({ level: 'errors' })).entries, []);
  console.log('PASS rounded PNG/SVG export, undo/redo, standalone/bound/custom text colors, save/reload and restore straight corners');
} catch (error) { console.error(error); console.error(JSON.stringify((await acde.console({ level: 'errors' })).entries)); process.exitCode = 1; }
finally { await acde.close(); }
