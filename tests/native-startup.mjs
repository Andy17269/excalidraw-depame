import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Acde } from '../scripts/acde-driver.mjs';
import { createNativeFixture } from '../scripts/native-fixture.mjs';

const output = resolve(process.env.CANVAS_TEST_OUTPUT || '.debug/startup');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(output, 'profile-'));
const options = {
  cwd: await createNativeFixture(profile),
  out: join(profile, 'build'),
  headless: true,
  env: {
    XDG_DATA_HOME: join(profile, 'data'),
    XDG_CONFIG_HOME: join(profile, 'config'),
    XDG_STATE_HOME: join(profile, 'state'),
    ACDE_STORAGE: '',
  },
};

let acde = await Acde.launch(options);
try {
  let app = acde.window('excalidraw-depame');
  const frame = () => app.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const wait = async (code, message) => {
    for (let i = 0; i < 400; i++) {
      if (await app.evaluate(code)) return;
      await frame();
    }
    throw new Error(message);
  };
  const scene = async () => JSON.parse(await app.evaluate('window.canvasBridge.read_canvas()'));

  // 1. First launch shows Welcome
  await app.getByRole('button', { name: '继续', exact: true }).waitFor({ state: 'visible', timeout: 20000 });
  await wait('!document.querySelector(".welcome-continue").disabled', 'Welcome did not become ready');
  assert.equal(await app.evaluate('Boolean(document.querySelector("#welcome-title"))'), true);
  assert.equal(await app.evaluate('Boolean(document.querySelector(".startup-card"))'), false);
  await app.getByRole('button', { name: '继续', exact: true }).click();
  await wait('!document.querySelector(".welcome-screen")', 'Continue did not dismiss welcome');
  console.log('PASS 1: First launch shows Welcome and records onboarding completion');

  // 2. Subsequent launch shows landscape Startup page with empty recent files
  await acde.reload('excalidraw-depame');
  await wait('Boolean(document.querySelector(".startup-action-btn.is-primary")) && !document.querySelector(".startup-action-btn.is-primary").disabled', 'Startup did not become ready');
  assert.equal(await app.evaluate('Boolean(document.querySelector("#startup-title"))'), true);
  assert.equal(await app.evaluate('Boolean(document.querySelector("#welcome-title"))'), false);
  const isLandscape = await app.evaluate('(()=>{const r=document.querySelector(".startup-card").getBoundingClientRect();return r.width > r.height})()');
  assert.equal(isLandscape, true, 'Startup card should be landscape (wider than tall)');
  const rightOfMain = await app.evaluate('(()=>{const m=document.querySelector(".startup-main").getBoundingClientRect(),r=document.querySelector(".startup-recent").getBoundingClientRect();return r.left >= m.right - 2})()');
  assert.equal(rightOfMain, true, 'Recent files panel should be on the right of main actions');
  assert.equal(await app.evaluate('document.querySelector(".startup-recent").textContent.includes("暂无历史文件")'), true);
  await app.screenshot({ path: join(output, 'startup-empty.png') });
  console.log('PASS 2: Subsequent launch shows landscape Startup page');

  // 3. Open a file -> recorded in Recent Files -> visible on next Startup
  const file = join(profile, 'system-arch.excalidraw');
  await writeFile(file, JSON.stringify({
    type: 'excalidraw',
    version: 2,
    elements: [
      { id: 'arch-rect-1', type: 'rectangle', x: 40, y: 40, width: 160, height: 90 },
      { id: 'arch-rect-2', type: 'rectangle', x: 260, y: 40, width: 160, height: 90 },
    ],
    appState: {},
    files: {},
  }));
  await acde.chooseFiles(file);
  await app.getByRole('button', { name: /打开/, exact: false }).first().click();
  await wait('!document.querySelector(".welcome-screen")', 'Open did not enter canvas');
  assert.equal((await scene()).length, 2);

  await acde.reload('excalidraw-depame');
  await wait('Boolean(document.querySelector(".startup-recent-item"))', 'Recent file did not appear on Startup');
  assert.equal(await app.evaluate('document.querySelector(".startup-recent-name").textContent'), 'system-arch');
  await app.screenshot({ path: join(output, 'startup-recent.png') });
  console.log('PASS 3: Opened file appears in Startup recent files');

  // 4. Create new blank canvas, then reload and open from Recent Files
  await app.getByRole('button', { name: /新建/, exact: false }).first().click();
  await wait('!document.querySelector(".welcome-screen")', 'New did not enter canvas');
  assert.equal((await scene()).length, 0);

  await acde.reload('excalidraw-depame');
  await wait('Boolean(document.querySelector(".startup-recent-item")) && !document.querySelector(".startup-action-btn.is-primary").disabled', 'Startup with recent file not ready');
  await app.evaluate('document.querySelector(".startup-recent-item").click()');
  await wait('!document.querySelector(".welcome-screen")', 'Clicking recent file did not enter canvas');
  assert.equal((await scene()).length, 2);
  assert.equal(await app.evaluate('document.querySelector(".file-name").textContent'), 'system-arch');
  console.log('PASS 4: Clicking recent file restores canvas and file name');

  // 5. Settings -> Reset Onboarding -> Confirm -> App closes, next launch shows Welcome
  await app.evaluate('document.querySelector(".menu-trigger").click()');
  await app.getByRole('menuitem', { name: '设置' }).click();
  await app.getByRole('button', { name: '重置引导', exact: true }).waitFor({ state: 'visible', timeout: 10000 });
  await app.getByRole('button', { name: '重置引导', exact: true }).click();
  await app.getByRole('button', { name: '确认并关闭', exact: true }).waitFor({ state: 'visible', timeout: 5000 });
  await app.screenshot({ path: join(output, 'reset-confirm.png') });
  await app.getByRole('button', { name: '确认并关闭', exact: true }).click().catch(() => {});

  // Wait for window to close (webs list becomes empty or acde process exits)
  let closed = false;
  for (let i = 0; i < 60; i++) {
    try {
      const alive = await app.evaluate('true');
      if (!alive) { closed = true; break; }
    } catch {
      closed = true;
      break;
    }
    await new Promise(r => setTimeout(r, 150));
  }
  assert.equal(closed, true, 'App window did not close after confirming reset onboarding');
  await acde.close().catch(() => {});

  // Relaunch with same profile -> should show Welcome again
  acde = await Acde.launch(options);
  app = acde.window('excalidraw-depame');
  await app.getByRole('button', { name: '继续', exact: true }).waitFor({ state: 'visible', timeout: 20000 });
  assert.equal(await app.evaluate('Boolean(document.querySelector("#welcome-title"))'), true, 'Welcome should show again after reset');
  assert.equal(await app.evaluate('Boolean(document.querySelector(".startup-card"))'), false);
  assert.deepEqual((await acde.console({ level: 'errors' })).entries, []);
  console.log('PASS 5: Reset onboarding closes app and next launch shows Welcome');
} catch (error) {
  console.error(error.message);
  await acde.window('excalidraw-depame').screenshot({ path: join(output, 'failure.png') }).catch(() => {});
  console.error(JSON.stringify((await acde.console({ level: 'errors' }).catch(() => ({ entries: [] }))).entries));
  process.exitCode = 1;
} finally {
  await acde.close().catch(() => {});
}
