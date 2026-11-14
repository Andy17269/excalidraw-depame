import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Acde } from '../scripts/acde-driver.mjs';
import { createNativeFixture, enterCanvas, selectFileMenu, waitForNative } from '../scripts/native-fixture.mjs';
const output = resolve(process.env.CANVAS_TEST_OUTPUT || '.debug/editing');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(output, 'profile-'));
const acde = await Acde.launch({ cwd: await createNativeFixture(profile), out: join(profile, 'build'), headless: true,
  env: { XDG_DATA_HOME: join(profile, 'data'), XDG_CONFIG_HOME: join(profile, 'config'), XDG_STATE_HOME: join(profile, 'state'), ACDE_STORAGE: '' } });
const app = acde.window('excalidraw-depame');
const scene = async () => JSON.parse(await app.evaluate('window.canvasBridge.read_canvas()'));
const drag = async (x, y, right, bottom) => { await app.mouse.move(x, y); await app.mouse.down(); await app.mouse.move(right, bottom, { steps: 12 }); await app.mouse.up(); };
try {
  await enterCanvas(app);
  await acde.resize('excalidraw-depame', 1600, 900);
  for (const [tool, x, y, right, bottom] of [
    ['矩形', 600, 200, 760, 300], ['菱形', 850, 180, 1000, 300], ['箭头', 700, 400, 950, 440], ['画笔', 400, 400, 480, 460],
  ]) { await app.getByRole('button', { name: tool, exact: true }).click(); await drag(x, y, right, bottom); }
  await app.getByRole('button', { name: '文字', exact: true }).click();
  await app.mouse.click(400, 160);
  await app.locator('textarea.excalidraw-wysiwyg').waitFor({ state: 'visible' });
  await app.keyboard.insertText('编辑与剪贴板测试');
  await app.keyboard.press('Escape');
  await waitForNative(app, 'JSON.parse(window.canvasBridge.read_canvas()).some(el=>el.type==="text")', 'Text committed');
  const original = await scene();
  for (const type of ['rectangle', 'diamond', 'arrow', 'freedraw', 'text']) assert.ok(original.some(el => el.type === type), `Manual ${type} tool must create its element`);
  console.log('PASS manual rectangle, diamond, arrow, freehand and Chinese text tools');

  await app.getByRole('button', { name: '选择', exact: true }).click();
  await app.mouse.click(1200, 300);
  await app.keyboard.press('Meta+a');
  await app.keyboard.press('Meta+c');
  const copied = await acde.clipboard();
  assert.equal(JSON.parse(copied).type, 'excalidraw/clipboard');
  await app.keyboard.press('Meta+v');
  await waitForNative(app, `JSON.parse(window.canvasBridge.read_canvas()).length === ${original.length * 2}`, 'Paste duplicates selected elements');
  const duplicated = await scene();
  assert.ok(original.every(el => duplicated.some(item => item.id === el.id)), 'Paste preserves original elements');
  await app.keyboard.press('Meta+x');
  await waitForNative(app, `JSON.parse(window.canvasBridge.read_canvas()).length === ${original.length}`, 'Cut removes only pasted selection');
  await app.keyboard.press('Meta+v');
  await waitForNative(app, `JSON.parse(window.canvasBridge.read_canvas()).length === ${original.length * 2}`, 'Paste restores cut content');
  console.log('PASS isolated native clipboard copy/paste/cut and original-content preservation');

  await app.mouse.click(1200, 300);
  await app.keyboard.press('Meta+a');
  await app.keyboard.press('Meta+g');
  const file = join(profile, 'grouped.excalidraw');
  await acde.chooseSaveFile(file);
  await selectFileMenu(app, '保存');
  await waitForNative(app, 'document.querySelector(".file-name").textContent === "grouped"', 'Group document saved');
  const grouped = JSON.parse(await readFile(file, 'utf8')).elements;
  const groupId = grouped[0].groupIds?.at(-1);
  assert.ok(groupId && grouped.every(el => el.groupIds.includes(groupId)), 'Group shortcut creates one editable group');
  await app.keyboard.press('Meta+Shift+g');
  await selectFileMenu(app, '保存');
  await waitForNative(app, '!document.querySelector(".menu-trigger").disabled', 'Ungroup saved');
  assert.ok(JSON.parse(await readFile(file, 'utf8')).elements.every(el => !el.groupIds.includes(groupId)));
  await app.mouse.click(650, 250, { button: 'right' });
  await app.locator('.context-menu-item').filter({ hasText: '复制为 SVG 到剪贴板' }).click();
  const svgDeadline = Date.now() + 10000;
  let svg = '';
  while (Date.now() < svgDeadline) {
    svg = await acde.clipboard();
    if (/<svg[\s>]/.test(svg)) break;
    await new Promise(resolveWait => setTimeout(resolveWait, 50));
  }
  assert.match(svg, /<svg[\s>]/, 'SVG clipboard action must produce a real vector image');
  console.log('PASS SVG copy produces vector markup in the isolated native clipboard');

  await acde.setClipboard('来自剪贴板的中文内容');
  await app.mouse.click(1200, 300);
  await app.keyboard.press('Meta+v');
  await waitForNative(app, 'JSON.parse(window.canvasBridge.read_canvas()).some(el=>el.text==="来自剪贴板的中文内容")', 'Plain text paste creates editable text');
  await app.keyboard.press('Escape');
  await selectFileMenu(app, '新建');
  await app.locator('dialog[open]').getByRole('button', { name: '不保存', exact: true }).click();
  await waitForNative(app, 'JSON.parse(window.canvasBridge.read_canvas()).length === 0', 'New document ready');
  await app.getByRole('button', { name: '矩形', exact: true }).click();
  await drag(600, 200, 760, 300);
  await app.getByRole('button', { name: '橡皮', exact: true }).click();
  await drag(580, 250, 790, 250);
  await waitForNative(app, 'JSON.parse(window.canvasBridge.read_canvas()).length === 0', 'Eraser removes touched shape');
  await app.keyboard.press('Meta+z');
  await waitForNative(app, 'JSON.parse(window.canvasBridge.read_canvas()).length === 1', 'Undo restores erased shape');
  await app.keyboard.press('Meta+Shift+z');
  await waitForNative(app, 'JSON.parse(window.canvasBridge.read_canvas()).length === 0', 'Redo reapplies erasing');
  assert.deepEqual((await acde.console({ level: 'errors' })).entries, []);
  await app.screenshot({ path: join(output, 'editing-complete.png') });
  console.log('PASS grouping, ungrouping, plain-text paste, eraser, undo and redo');
} catch (error) {
  await app.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
  throw error;
} finally { await acde.close(); }
