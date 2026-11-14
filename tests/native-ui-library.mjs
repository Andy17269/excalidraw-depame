import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Acde } from '../scripts/acde-driver.mjs';
import { createNativeFixture, enableDemoMode } from '../scripts/native-fixture.mjs';

const output = resolve(process.env.CANVAS_TEST_OUTPUT || '.debug/ui-library');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(output, 'profile-'));
const acde = await Acde.launch({
  cwd: await createNativeFixture(profile),
  out: join(profile, 'build'),
  headless: true,
  env: {
    XDG_DATA_HOME: join(profile, 'data'),
    XDG_CONFIG_HOME: join(profile, 'config'),
    XDG_STATE_HOME: join(profile, 'state'),
    ACDE_STORAGE: '',
  },
});

try {
  const app = acde.window('excalidraw-depame');
  await app.locator('.welcome-skip').click({ timeout: 20000 });
  const frame = () => app.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const scene = async () => JSON.parse(await app.evaluate('window.canvasBridge.read_canvas()'));
  const wait = async (check, message) => {
    for (let i = 0; i < 400; i++) {
      if (await check()) return;
      await frame();
    }
    throw new Error(message);
  };

  await enableDemoMode(app);
  assert.equal(await app.evaluate('Boolean(document.querySelector(".canvas-dock .library-trigger"))'), true);
  await app.getByRole('button', { name: 'UI 组件模板', exact: true }).click();
  await wait(
    async () => await app.evaluate('document.querySelector(".library-panel")?.classList.contains("is-open")'),
    'UI library panel did not open',
  );
  assert.equal(await app.evaluate('document.querySelectorAll(".library-card").length'), 5);

  for (const [tabName, expectedCount] of [['手机网页', 5], ['电脑网页', 5], ['电脑应用', 5], ['全部', 20], ['手机应用', 5]]) {
    await app.getByRole('tab', { name: tabName, exact: true }).click();
    await frame();
    assert.equal(
      await app.evaluate('document.querySelectorAll(".library-card").length'),
      expectedCount,
      `Expected ${expectedCount} cards in tab ${tabName}`,
    );
  }

  for (let i = 0; i < 12; i++) await frame();
  await app.screenshot({ path: join(output, 'library-open.png') });

  // Insert first template: 应用首页信息流
  await app.getByRole('button', { name: /应用首页信息流/ }).click();
  await wait(async () => (await scene()).length >= 15, 'Mobile App home template did not insert');
  const firstScene = await scene();
  const firstBounds = firstScene.reduce(
    (acc, el) => ({
      minX: Math.min(acc.minX, el.x),
      maxX: Math.max(acc.maxX, el.x + (el.width ?? 0)),
    }),
    { minX: Infinity, maxX: -Infinity },
  );

  // Switch to search, find 在线应用数据仪表盘, and insert beside the first template
  const searchBox = app.getByRole('textbox', { name: '搜索 界面模板', exact: true });
  await searchBox.fill('仪表盘');
  await frame();
  assert.equal(await app.evaluate('document.querySelectorAll(".library-card").length'), 1);
  await app.getByRole('button', { name: /在线应用数据仪表盘/ }).click();
  await wait(async () => (await scene()).length > firstScene.length + 10, 'PC Dashboard template did not insert');

  const secondScene = await scene();
  const addedElements = secondScene.slice(firstScene.length);
  const secondMinX = Math.min(...addedElements.map(el => el.x));
  assert.ok(
    secondMinX >= firstBounds.maxX + 40,
    `Expected second template (${secondMinX}) to be tiled right of first (${firstBounds.maxX})`,
  );

  // Close library via Escape and confirm Sketch-to-UI button is enabled with selected template
  await app.keyboard.press('Escape');
  await wait(
    async () => !(await app.evaluate('document.querySelector(".library-panel")?.classList.contains("is-open")')),
    'Library panel did not close on Escape',
  );
  assert.equal(await app.evaluate('Boolean(document.querySelector(".vision-button")?.disabled)'), false);
  for (let i = 0; i < 12; i++) await frame();
  await app.screenshot({ path: join(output, 'library-inserted.png') });

  // Single-step undo removes the second inserted template cleanly
  await app.evaluate('document.querySelector(".excalidraw")?.focus()');
  await frame();
  await app.keyboard.press('ctrl+z');
  await wait(async () => (await scene()).length === firstScene.length, 'Single-step undo did not remove inserted template');

  assert.deepEqual((await acde.console({ level: 'errors' })).entries, []);
  console.log('PASS UI template library tabs, search, non-overlapping insertion, escape close, undo, and zero console errors');
} catch (error) {
  console.error(error.message);
  await acde.window('excalidraw-depame').screenshot({ path: join(output, 'failure.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await acde.close();
}
