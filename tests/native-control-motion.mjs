import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Acde } from '../scripts/acde-driver.mjs';
import { createNativeFixture, enableDemoMode, emulateReducedMotion } from '../scripts/native-fixture.mjs';

const output = resolve('.debug/control-motion');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(output, 'profile-'));
const acde = await Acde.launch({ cwd: await createNativeFixture(profile), out: join(profile, 'build'), headless: true,
  env: { XDG_DATA_HOME: join(profile, 'data'), XDG_CONFIG_HOME: join(profile, 'config'), XDG_STATE_HOME: join(profile, 'state'), ACDE_STORAGE: '' } });
const app = acde.window('excalidraw-depame');
const wait = async code => {
  for (let i = 0; i < 400; i++) {
    if (await app.evaluate(code)) return;
    await app.evaluate('new Promise(r => requestAnimationFrame(r))');
  }
  throw new Error(`Timed out: ${code}`);
};
try {
  await acde.route('/api/network/status', { json: { online: true, checkedAt: Date.now() } });
  await app.locator('.welcome-skip').click({ timeout: 20000 });
  await wait('!document.querySelector(".welcome-screen")');
  await app.getByRole('button', { name: '矩形', exact: true }).click();
  await wait('document.querySelector(".properties").getAttribute("aria-hidden") === "false"');
  assert.equal(await app.evaluate('document.querySelector(".tools [aria-pressed=true]").getAttribute("aria-label")'), '矩形');
  await app.getByRole('button', { name: '菜单', exact: true }).click();
  await app.getByRole('menuitem', { name: '设置', exact: true }).click();
  await app.getByRole('tab', { name: 'AI 引擎', exact: true }).click();
  await wait('!document.querySelector("[role=switch][aria-label=绘制动画]").disabled');
  // Observe real state changes and native thumb movement in both directions.
  const observeToggle = () => app.evaluate(`new Promise(resolve => {
    const control = document.querySelector('[role=switch][aria-label=绘制动画]');
    const thumb = control.querySelector('.menu-switch-thumb');
    const before = control.getAttribute('aria-checked');
    const start = performance.now();
    const frames = [];
    control.click();
    const sample = () => {
      const style = getComputedStyle(thumb);
      frames.push({ ms: performance.now() - start, transform: style.transform, checked: control.getAttribute('aria-checked') });
      if (performance.now() - start < 500) requestAnimationFrame(sample);
      else resolve({ before, frames });
    };
    requestAnimationFrame(sample);
  })`);
  for (let i = 0; i < 2; i++) {
    const { before, frames } = await observeToggle();
    const final = frames.at(-1);
    assert.notEqual(final.checked, before);
    assert.ok(frames.every(f => f.checked === final.checked), 'State must update immediately while feedback settles');
    assert.ok(frames.some(f => f.ms >= 180 && f.ms < 300 && f.transform !== final.transform), 'Switch travel must remain visible beyond 180ms');
    await writeFile(join(output, `switch-${i}.json`), JSON.stringify(frames, null, 2));
  }
  await app.screenshot({ path: join(output, 'settings-ai.png') });
  await app.getByRole('tab', { name: '通用', exact: true }).click();
  await app.getByRole('radio', { name: '深色', exact: true }).click();
  assert.equal(await app.evaluate('document.documentElement.dataset.theme'), 'dark');
  await app.getByRole('tab', { name: 'MCP 服务', exact: true }).click();
  assert.equal(await app.evaluate('Array.from(document.querySelectorAll(".settings-tabpanel")).filter(el => !el.hidden).length'), 1);
  await app.getByRole('button', { name: '添加', exact: true }).click();
  await app.getByRole('switch', { name: '启用并连接', exact: true }).click();
  assert.equal(await app.evaluate('document.querySelector("[role=switch][aria-label=启用并连接]").getAttribute("aria-checked")'), 'false');
  await app.getByRole('button', { name: '取消', exact: true }).click();
  const reducedMotionSupported = await emulateReducedMotion(acde, app);
  await app.getByRole('tab', { name: 'AI 引擎', exact: true }).click();
  const reduced = await observeToggle();
  if (reducedMotionSupported) assert.equal(new Set(reduced.frames.map(f => f.transform)).size, 1, 'Reduced motion must snap the thumb');
  if (reducedMotionSupported) assert.equal(await app.evaluate('getComputedStyle(document.querySelector(".settings-tabpanel:not([hidden])")).animationName'), 'none');
  await app.getByRole('button', { name: '关闭设置', exact: true }).click();
  await app.getByRole('button', { name: '选择', exact: true }).click();
  assert.equal(await app.evaluate('document.querySelector(".tools [aria-pressed=true]").getAttribute("aria-label")'), '选择');
  await emulateReducedMotion(acde, app, false);
  await enableDemoMode(app);
  await app.getByRole('button', { name: 'UI 组件模板', exact: true }).click();
  await app.getByRole('tab', { name: '电脑网页', exact: true }).click();
  assert.equal(await app.evaluate('document.activeElement.textContent'), '电脑网页');
  assert.ok(await app.evaluate('document.querySelectorAll(".library-grid .library-card").length') > 0);
  await app.screenshot({ path: join(output, 'library-filter.png') });
  await app.getByRole('button', { name: '关闭素材库', exact: true }).click();
  assert.deepEqual((await acde.console({ level: 'errors' })).entries, []);
  console.log('PASS visible switch motion in both directions, immediate state, settings tabs, theme, reduced motion and editor controls');
} finally { await acde.close(); }
