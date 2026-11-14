import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Acde } from '../scripts/acde-driver.mjs';
import { createNativeFixture } from '../scripts/native-fixture.mjs';

const output = resolve(process.env.CANVAS_TEST_OUTPUT || '.debug/demo-mode');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(output, 'profile-'));
const acde = await Acde.launch({
  cwd: await createNativeFixture(profile), out: join(profile, 'build'), headless: true,
  env: { XDG_DATA_HOME: join(profile, 'data'), XDG_CONFIG_HOME: join(profile, 'config'), XDG_STATE_HOME: join(profile, 'state'), ACDE_STORAGE: join(profile, 'storage') },
});
const app = acde.window('excalidraw-depame');
const wait = async code => {
  for (let i = 0; i < 400; i++) {
    if (await app.evaluate(code)) return;
    await app.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  }
  throw new Error(`Timed out: ${code}`);
};
const settings = async () => {
  await app.getByRole('button', { name: '菜单', exact: true }).click();
  await app.getByRole('menuitem', { name: '设置', exact: true }).click();
};
const assertRecommendations = async enabled => {
  const state = await app.evaluate(`({
    library: !!document.querySelector('.library-trigger'),
    presets: !!document.querySelector('.presets-trigger'),
    quick: document.querySelectorAll('.quick-prompt-chip').length,
    tools: !!document.querySelector('.tools'),
    input: !!document.querySelector('.generate-form textarea')
  })`);
  assert.deepEqual(state, { library: enabled, presets: enabled, quick: enabled ? 4 : 0, tools: true, input: true });
};
const startup = async () => {
  await acde.reload('excalidraw-depame');
  await wait('!!document.querySelector(".startup-action-btn") && !document.querySelector(".startup-action-btn").disabled');
};
try {
  await acde.route('/api/network/status', { json: { online: true, checkedAt: Date.now() } });
  await app.locator('.welcome-skip').click({ timeout: 20000 });
  await wait('!document.querySelector(".welcome-screen")');
  await assertRecommendations(false);
  await startup();
  assert.equal(await app.evaluate('document.querySelectorAll(".startup-preset").length'), 0, 'Demo templates must be hidden by default');
  await app.keyboard.press('Escape');
  await wait('!document.querySelector(".welcome-screen")');
  await settings();
  const toggle = app.getByRole('switch', { name: '演示模式', exact: true });
  assert.equal(await app.evaluate(`document.querySelector('[role="switch"][aria-label="演示模式"]').getAttribute('aria-checked')`), 'false');
  await toggle.click();
  assert.equal(await app.evaluate(`document.querySelector('[role="switch"][aria-label="演示模式"]').getAttribute('aria-checked')`), 'true');
  await assertRecommendations(true);
  await app.screenshot({ path: join(output, 'demo-mode-enabled.png') });
  await startup();
  await app.screenshot({ path: join(output, 'demo-startup.png') });
  assert.equal(await app.evaluate('document.querySelectorAll(".startup-preset").length'), 3, 'Enabled demo mode must persist after reload');
  await app.keyboard.press('Escape');
  await wait('!document.querySelector(".welcome-screen")');
  await settings();
  assert.equal(await app.evaluate(`document.querySelector('[role="switch"][aria-label="演示模式"]').getAttribute('aria-checked')`), 'true');
  await toggle.click();
  await assertRecommendations(false);
  await startup();
  assert.equal(await app.evaluate('document.querySelectorAll(".startup-preset").length'), 0, 'Disabling demo mode must persist after reload');
  assert.deepEqual((await acde.console({ level: 'errors' })).entries, []);
  console.log('PASS demo mode defaults off, enabled/disabled templates and persistence');
} finally { await acde.close(); }
