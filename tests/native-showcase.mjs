import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Acde } from '../scripts/acde-driver.mjs';
import { createNativeFixture, enableDemoMode, emulateReducedMotion } from '../scripts/native-fixture.mjs';

const output = resolve(process.env.CANVAS_TEST_OUTPUT || '.debug/showcase');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(output, 'profile-'));
const acde = await Acde.launch({ cwd: await createNativeFixture(profile), out: join(profile, 'build'), headless: true,
  env: { XDG_DATA_HOME: join(profile, 'data'), XDG_CONFIG_HOME: join(profile, 'config'), XDG_STATE_HOME: join(profile, 'state'), ACDE_STORAGE: join(profile, 'storage') } });
const app = acde.window('excalidraw-depame');
const frame = () => app.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
const scene = async () => JSON.parse(await app.evaluate('window.canvasBridge.read_canvas()'));
const wait = async (check, label) => {
  for (let i = 0; i < 900; i++) {
    if (await check()) return;
    await frame();
  }
  throw new Error(`Timed out: ${label}`);
};
const settle = async () => { for (let i = 0; i < 15; i++) await frame(); };
try {
  await acde.resize('excalidraw-depame', 1600, 1000);
  await acde.route('/api/network/status', { json: { online: true, checkedAt: Date.now() } });
  await app.locator('.welcome-skip').click({ timeout: 20000 });
  await wait(async () => !(await app.evaluate('!!document.querySelector(".welcome-screen")')), 'welcome');
  await enableDemoMode(app);
  await acde.reload('excalidraw-depame');
  await wait(async () => await app.evaluate('document.querySelectorAll(".startup-preset").length === 3 && !document.querySelector(".startup-preset").disabled'), 'startup examples');
  await app.screenshot({ path: join(output, 'startup.png') });
  await app.keyboard.press('Escape');
  await wait(async () => !(await app.evaluate('!!document.querySelector(".welcome-screen")')), 'startup closed');

  // A file-backed document stays dirty after autosave, so canceling a file
  // action really exercises the unsaved-confirm path rather than creating a new canvas.
  const sourceFile = join(profile, 'showcase.excalidraw');
  await writeFile(sourceFile, JSON.stringify({ type: 'excalidraw', version: 2, elements: [], appState: {}, files: {} }));
  await acde.chooseFiles(sourceFile);
  await app.keyboard.press('ctrl+o');
  await wait(async () => await app.evaluate('document.querySelector(".file-name").textContent.includes("showcase")'), 'file-backed canvas');

  for (const [id, title, expected, imageCount] of [['music', '音乐 App', 'DAMIDAMI', 8], ['travel', '旅行发现 App', '沿着海岸，慢一点', 3], ['commerce', '电商运营工作台', '¥ 128,640', 0]]) {
    await app.getByRole('button', { name: '选择', exact: true }).click();
    await app.mouse.click(100, 450);
    await app.keyboard.press('ctrl+a');
    await app.keyboard.press('Delete');
    await wait(async () => (await scene()).length === 0, 'clear canvas');
    // A surrounding real diagram must survive replacing the example.
    await app.evaluate('window.canvasBridge.draw_diagram("flowchart LR\\nA[保留周边内容] --> B[继续编辑]")');
    await wait(async () => !(await app.evaluate('!!document.querySelector(".ai-cursor.is-visible")')), 'marker animation');
    const before = await scene();
    await app.getByRole('button', { name: '预设模板', exact: true }).click();
    await app.getByRole('menuitem', { name: title, exact: true }).click();
    await wait(async () => (await scene()).length > before.length + 10, 'sketch insertion');
    const sketch = await scene();
    await settle();
    await app.screenshot({ path: join(output, `${id}-sketch.png`) });
    await app.getByRole('button', { name: 'UI草图', exact: true }).click();
    await app.getByRole('button', { name: '整页生成', exact: true }).click();
    await wait(async () => (await scene()).some(el => el.type === 'text' && el.text?.includes(expected))
      && !(await app.evaluate('!!document.querySelector(".ai-cursor.is-visible")')), `${id} result`);
    const result = await scene();
    assert.equal(result.filter(el => el.type === 'image').length, imageCount);
    assert.ok(before.every(el => result.some(item => item.id === el.id)), 'Unrelated content must survive');
    assert.ok(result.filter(el => el.type === 'text').length > 10, 'Result contains editable text');
    await settle();
    await app.screenshot({ path: join(output, `${id}-result.png`) });
    await app.mouse.click(100, 450);
    await app.keyboard.press('ctrl+z');
    await wait(async () => {
      const restored = await scene();
      return restored.length === sketch.length && sketch.every(el => restored.some(item => item.id === el.id));
    }, 'single-step undo');
    console.log(`PASS ${id}: local result, editable elements, preserved surrounding content, undo`);
  }
  // Cancel a file action during reveal: the untouched sketch must be restored.
  const beforeCancel = await scene();
  await app.getByRole('button', { name: 'UI草图', exact: true }).click();
  await app.getByRole('button', { name: '整页生成', exact: true }).click();
  await wait(async () => await app.evaluate('!!document.querySelector(".ai-cursor.is-visible")'), 'reveal started');
  await app.keyboard.press('ctrl+n');
  await app.locator('.confirm-dialog[open] .menu-btn-ghost').click();
  await wait(async () => {
    const restored = await scene();
    return restored.length === beforeCancel.length && beforeCancel.every(el => restored.some(item => item.id === el.id));
  }, 'cancel restores sketch');
  console.log('PASS cancel file action during reveal restores original sketch');

  // A local example completes offline without unlocking remote generation controls.
  await acde.route('/api/network/status', { json: { online: false, checkedAt: Date.now() } });
  await app.evaluate('window.dispatchEvent(new Event("offline"))');
  await wait(async () => await app.evaluate('document.querySelector(".generate-form textarea").disabled'), 'offline state');
  assert.equal(await app.evaluate('document.querySelector(".vision-button").disabled'), false);
  assert.equal(await app.evaluate('document.querySelector(".presets-trigger").disabled'), false);
  assert.equal(await app.evaluate('document.querySelector(".generate-button").disabled'), true);
  await emulateReducedMotion(acde, app);
  await app.getByRole('button', { name: 'UI草图', exact: true }).click();
  await app.getByRole('button', { name: '整页生成', exact: true }).click();
  await wait(async () => (await scene()).some(el => el.text?.includes('¥ 128,640')) && !(await app.evaluate('!!document.querySelector(".ai-cursor.is-visible")')), 'offline local result');
  console.log('PASS offline local result; remote generation remains disabled');

  await acde.emulate({ colorScheme: 'dark' });
  await emulateReducedMotion(acde, app);
  await acde.resize('excalidraw-depame', 480, 800);
  await app.getByRole('button', { name: '预设模板', exact: true }).click();
  await settle();
  await app.screenshot({ path: join(output, 'menu-narrow-dark.png') });
  const bounds = await app.evaluate('(()=>{const r=document.querySelector(".presets-menu").getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight}})()');
  assert.ok(bounds.left >= 0 && bounds.right <= bounds.width && bounds.top >= 0 && bounds.bottom <= bounds.height, JSON.stringify(bounds));
  assert.deepEqual((await acde.console({ level: 'errors' })).entries, []);
  console.log('PASS startup and narrow dark menu; zero runtime errors');
} catch (error) {
  await app.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
  throw error;
} finally { await acde.close(); }
