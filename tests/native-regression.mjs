import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Acde } from '../scripts/acde-driver.mjs';
import { createNativeFixture, enterCanvas, selectFileMenu } from '../scripts/native-fixture.mjs';
import { PNG } from 'pngjs';

const output = resolve(process.env.CANVAS_TEST_OUTPUT || '.debug/regression-artifacts');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(output, 'full-'));
const cwd = await createNativeFixture(profile);
const registry = join(tmpdir(), typeof process.getuid === 'function' ? `acde-dev-${process.getuid()}` : 'acde-dev');
const previous = new Set(await readdir(registry).catch(() => []));
const acde = await Acde.launch({ cwd, out: join(profile, 'build'), headless: true, env: { XDG_DATA_HOME: join(profile, 'data'), XDG_CONFIG_HOME: join(profile, 'config'), XDG_STATE_HOME: join(profile, 'state'), ACDE_STORAGE: '', ACDE_SCALE: '1.5' } });
let mcp;
let app;
try {
  app = acde.window('excalidraw-depame');
  await enterCanvas(app);
  const evaluate = code => app.evaluate(code);
  const frame = () => evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
  const scene = async () => JSON.parse(await evaluate('window.canvasBridge.read_canvas()'));
  const wait = async (read, message) => { for (let i = 0; i < 600; i++) { if (await read()) return; await frame(); } throw new Error(message); };
  const drag = async (x, y, endX, endY, steps = 5) => { await app.mouse.move(x, y); await app.mouse.down(); await app.mouse.move(endX, endY, { steps }); await app.mouse.up(); await frame(); };
  await app.getByRole('button', { name: '选择', exact: true }).click({ timeout: 20000 });
  assert.equal((await scene()).length, 0, 'Test isolation failed');
  assert.equal(await evaluate('Array.from(document.querySelectorAll(".layer-ui__wrapper")).every(e=>getComputedStyle(e).display==="none")'), true);

  await app.getByRole('button', { name: '文字', exact: true }).click();
  await frame();
  await app.mouse.move(350, 160); await app.mouse.down(); await frame(); await app.mouse.up(); await frame();
  await app.locator('textarea.excalidraw-wysiwyg').waitFor({ state: 'visible' });
  await app.keyboard.insertText('你好 Whiteboard');
  assert.match(await evaluate('getComputedStyle(document.querySelector("textarea.excalidraw-wysiwyg")).fontFamily'), /Excalifont/);
  await app.keyboard.press('Escape');
  await wait(async () => (await scene()).some(element => element.type === 'text' && element.text.includes('你好')), 'Text was not committed');
  await wait(() => evaluate('Array.from(document.fonts).some(f=>f.family==="Excalifont"&&f.status==="loaded")'), 'Hand-drawn font was not loaded');
  console.log('PASS native text input and local hand-drawn fonts');

  await app.getByRole('button', { name: '矩形', exact: true }).click();
  await drag(700, 300, 900, 430);
  const original = (await scene()).find(element => element.type === 'rectangle');
  assert.ok(original && Math.abs(original.width - 200) < 3);
  const slider = await evaluate('(()=>{const r=document.querySelector(".opacity-slider").getBoundingClientRect();return {x:r.x+2,y:r.y+r.height/2,right:r.right-2}})()');
  for (let i = 0; i < 10; i++) {
    await drag(slider.right, slider.y, slider.x, slider.y, 3);
    assert.equal(await evaluate('document.querySelector("[role=slider]").getAttribute("aria-valuenow")'), '0', `slider to zero ${i}`);
    await drag(slider.x, slider.y, slider.right, slider.y, 3);
    assert.equal(await evaluate('document.querySelector("[role=slider]").getAttribute("aria-valuenow")'), '100', `slider to full ${i}`);
  }
  await app.getByRole('slider', { name: '透明度', exact: true }).focus(); await app.keyboard.press('Home');
  await frame(); assert.equal(await evaluate('document.querySelector("[role=slider]").getAttribute("aria-valuenow")'), '0', 'Home sets zero');
  await app.keyboard.press('ctrl+z'); await frame();
  assert.equal(await evaluate('document.querySelector("[role=slider]").getAttribute("aria-valuenow")'), '100', 'opacity undo');
  assert.ok((await scene()).some(element => element.id === original.id), 'Opacity undo removed the shape');
  console.log('PASS opacity 0↔100, 20 slider drags, undo');

  await app.getByRole('button', { name: '选择', exact: true }).click();
  for (let i = 0; i < 15; i++) { await drag(800, 365, 850, 395, 4); await drag(850, 395, 800, 365, 4); }
  const moved = (await scene()).find(element => element.id === original.id);
  assert.ok(Math.abs(moved.x - original.x) < 3);
  console.log('PASS 30 canvas element drags');

  await app.mouse.click(1100, 600);
  assert.equal(await evaluate('(()=>{const stage=document.querySelector(".canvas-stage"),layer=document.querySelector(".canvas-layer"),capsule=document.querySelector(".file-capsule"),dock=document.querySelector(".canvas-dock"),ta=document.querySelector(".generate-form textarea");if(!stage||!layer||stage.firstElementChild!==layer)return false;for(const el of [capsule,dock,ta]){if(!el||layer.contains(el))return false;const r=el.getBoundingClientRect();const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);if(!hit||!el.contains(hit))return false;}return true;})()'), true, 'canvas-layer must sit below UI without covering it');
  await evaluate('(()=>{const ta=document.querySelector(".generate-form textarea");ta.dispatchEvent(new WheelEvent("wheel",{ctrlKey:true,deltaY:-69.314718,clientX:640,clientY:400,bubbles:true,cancelable:true}));for(const [type,scale] of [["gesturestart",1],["gesturechange",2],["gestureend",2]]){const e=new Event(type,{bubbles:true,cancelable:true});Object.assign(e,{scale,clientX:640,clientY:400});ta.dispatchEvent(e)}return true})()'); await frame();
  await evaluate('document.querySelector("canvas.interactive").dispatchEvent(new WheelEvent("wheel",{ctrlKey:true,deltaY:-69.314718,clientX:640,clientY:400,bubbles:true,cancelable:true}))'); await frame();
  await app.getByRole('button', { name: '矩形', exact: true }).click(); await drag(720, 220, 920, 350);
  const rectangles = (await scene()).filter(element => element.type === 'rectangle');
  assert.ok(Math.abs(rectangles.at(-1).width / original.width - .5) < .05);
  await evaluate('(()=>{const c=document.querySelector("canvas.interactive");for(const [type,scale] of [["gesturestart",1],["gesturechange",2],["gestureend",2]]){const e=new Event(type,{bubbles:true,cancelable:true});Object.assign(e,{scale,clientX:640,clientY:400});c.dispatchEvent(e)}return true})()'); await frame();
  await app.getByRole('button', { name: '矩形', exact: true }).click(); await drag(850, 500, 1050, 630);
  assert.ok(Math.abs((await scene()).filter(element => element.type === 'rectangle').at(-1).width / original.width - .25) < .05);
  console.log('PASS trackpad wheel and native gesture zoom');

  const fixture = resolve(process.env.HEIC_TEST_FILE || 'tests/fixtures/example.heic');
  await acde.drop(fixture, { web: 'excalidraw-depame', x: 500, y: 450 });
  await wait(async () => (await scene()).some(element => element.type === 'image'), 'HEIC was not imported');
  const image = (await scene()).find(element => element.type === 'image');
  assert.ok(image.width * 4 <= await evaluate('innerWidth * .7 + 1'), 'Imported image ignored canvas zoom');
  await drag(500, 450, 540, 480, 6);
  assert.ok((await scene()).find(element => element.id === image.id).x > image.x + 5, 'Image drag did not move the image');
  console.log('PASS HEIC conversion and native canvas import');

  await acde.route('/api/compose', { json: { mermaid: 'flowchart LR\nA["合成节点"] --> B["验证完成"]' } });
  await app.getByRole('textbox', { name: '描述', exact: true }).fill('在当前画布追加合成测试图表');
  const beforeGenerate = (await scene()).length;
  await app.getByRole('button', { name: '生成', exact: true }).click();
  await wait(async () => (await scene()).length > beforeGenerate, 'AI form did not append diagram');
  await acde.unroute();
  console.log('PASS contextual AI form and editable diagram');

  const added = (await readdir(registry)).filter(name => !previous.has(name) && /^\d+\.json$/.test(name));
  assert.equal(added.length, 1);
  mcp = new Client({ name: 'canvas-mcp-test', version: '1.0.0' });
  await mcp.connect(new StdioClientTransport({ command: process.execPath, args: ['scripts/canvas-mcp.mjs'], cwd: process.cwd(), env: { ...process.env, ACDE_SESSION: added[0].replace('.json', '') } }));
  const tools = await mcp.listTools(); assert.deepEqual(tools.tools.map(tool => tool.name).sort(), ['draw_diagram', 'read_canvas']);
  const summary = await mcp.callTool({ name: 'read_canvas', arguments: {} }); assert.equal(summary.isError, undefined);
  const beforeMcp = (await scene()).length;
  const drawn = await mcp.callTool({ name: 'draw_diagram', arguments: { mermaid_code: 'flowchart TD\nMCP["MCP测试"] --> OK["完成"]' } });
  assert.ok(!drawn.isError); assert.ok((await scene()).length > beforeMcp);
  console.log('PASS real MCP stdio read_canvas and draw_diagram');
  await mcp.close(); mcp = null;

  const savedPath = join(profile, 'canvas.excalidraw');
  await acde.chooseSaveFile(savedPath); await selectFileMenu(app, '保存');
  await wait(() => evaluate('document.querySelector(".file-capsule button").disabled===false'), 'Save did not finish');
  const saved = JSON.parse(await readFile(savedPath, 'utf8'));
  assert.equal(saved.type, 'excalidraw'); assert.equal(saved.elements.filter(element => !element.isDeleted).length, (await scene()).length);
  assert.ok(Object.values(saved.files).some(file => file.mimeType === 'image/png'));
  assert.ok(saved.elements.filter(element => element.type === 'text').every(element => element.fontFamily === 5));
  const count = (await scene()).length;
  await acde.reload('excalidraw-depame'); await enterCanvas(app); await app.getByRole('button', { name: '选择', exact: true }).click();
  assert.equal((await scene()).length, count);
  await acde.chooseFiles(savedPath); await selectFileMenu(app, '打开...');
  await wait(() => evaluate('document.querySelector(".file-capsule button").disabled===false'), 'Open did not finish');
  assert.equal((await scene()).length, count);
  await app.mouse.click(1100, 650); await app.keyboard.press('ctrl+z'); assert.equal((await scene()).length, count);
  console.log('PASS native save, PNG persistence, reload, open and clean history');

  await app.screenshot({ path: join(output, 'native-final.png') });
  const png = PNG.sync.read(await readFile(join(output, 'native-final.png')));
  const p = (Math.floor(png.height * .05) * png.width + Math.floor(png.width * .8)) * 4;
  assert.ok(png.data[p] > 250 && png.data[p + 1] > 250 && png.data[p + 2] > 250, 'Renderer title bar leaked into canvas');
  await acde.resize('excalidraw-depame', 480, 720);
  await frame();
  assert.equal(await evaluate('(()=>{const r=document.querySelector(".canvas-dock").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()'), true);
  await app.screenshot({ path: join(output, 'native-narrow.png') });
  const errors = (await acde.console({ level: 'errors' })).entries;
  assert.deepEqual(errors, []);
  console.log('PASS framebuffer, narrow layout, zero runtime errors');
  console.log(`Artifacts: ${output}`);
} catch (error) {
  console.error(error.message);
  if (app) { await app.screenshot({ path: join(output, 'native-failure.png') }).catch(() => {}); console.error(await app.evaluate('JSON.stringify({body:document.body.innerText,status:document.querySelector(".status-dot")?.className,active:document.querySelector(".tools .active")?.title,edit:document.querySelector("textarea")?.outerHTML,scene:window.canvasBridge?.read_canvas()})').catch(() => 'Page unavailable')); console.error(JSON.stringify((await acde.network({failed:true})).entries)); }
  process.exitCode = 1;
} finally { if (mcp) await mcp.close(); await acde.close(); }
