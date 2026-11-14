import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Acde } from '../scripts/acde-driver.mjs';
import { createNativeFixture, enterCanvas, waitForNative } from '../scripts/native-fixture.mjs';

const output = resolve(process.env.CANVAS_TEST_OUTPUT || '.debug/welcome');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(output, 'profile-'));
const options = { cwd: await createNativeFixture(profile), out: join(profile, 'build'), headless: true,
  env: { XDG_DATA_HOME: join(profile, 'data'), XDG_CONFIG_HOME: join(profile, 'config'), XDG_STATE_HOME: join(profile, 'state'), ACDE_STORAGE: '' } };
let acde = await Acde.launch(options);
let app = acde.window('excalidraw-depame');
try {
  const scene = async () => JSON.parse(await app.evaluate('window.canvasBridge.read_canvas()'));
  await app.getByRole('button', { name: '继续', exact: true }).waitFor({ state: 'visible', timeout: 20000 });
  await waitForNative(app, '!document.querySelector(".welcome-continue").disabled', 'Welcome ready');
  assert.equal(await app.evaluate('document.querySelectorAll(".welcome-icon svg").length'), 3);
  assert.equal(await app.evaluate('document.querySelector(".canvas-stage").inert && document.querySelector(".canvas-stage").getAttribute("aria-hidden") === "true"'), true);
  await waitForNative(app, 'document.activeElement.textContent === "继续"', 'Welcome places keyboard focus');
  await app.keyboard.press('Tab');
  assert.equal(await app.evaluate('document.activeElement.textContent.trim()'), '跳过引导');
  await app.keyboard.press('shift+Tab');
  assert.equal(await app.evaluate('document.activeElement.textContent'), '继续');
  assert.equal(await app.evaluate('document.querySelector(".welcome-app-icon").naturalWidth > 0'), true);
  await app.screenshot({ path: join(output, 'welcome.png') });
  for (const [width, height] of [[390, 640], [800, 460], [1280, 800]]) {
    await acde.resize('excalidraw-depame', width, height);
    await waitForNative(app, '(() => { const r=document.querySelector(".welcome-card").getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth+1 && r.top>=0 && r.bottom<=innerHeight+1; })()', 'Welcome fits viewport');
    await app.screenshot({ path: join(output, `welcome-${width}-${height}.png`) });
  }
  await app.evaluate('window.canvasBridge.draw_diagram("flowchart LR\\nA[Welcome]-->B[Canvas]")');
  const count = (await scene()).length;
  assert.ok(count >= 5, 'MCP bridge works while Welcome is visible');
  await app.getByRole('button', { name: '继续', exact: true }).click();
  await waitForNative(app, 'Boolean(document.querySelector(".onboarding-card"))', 'Continue starts tour');
  assert.equal((await scene()).length, count);
  await app.keyboard.press('Escape');
  await waitForNative(app, '!document.querySelector(".onboarding-card") && document.querySelector(".status-dot").classList.contains("saved")', 'Tour closes and autosave finishes');
  console.log('PASS Welcome icons, focus trap, narrow/short layout, MCP during Welcome and Continue tour');

  await acde.reload('excalidraw-depame');
  await waitForNative(app, 'Boolean(document.querySelector(".startup-action-btn:not(:disabled)"))', 'Returning Startup ready');
  assert.equal((await scene()).length, count);
  await acde.chooseFiles(null);
  await app.getByRole('button', { name: /^打开/ }).click();
  await waitForNative(app, '!document.querySelector(".startup-action-btn").disabled', 'Cancelled open restores Startup');
  assert.equal((await scene()).length, count);
  await app.getByRole('button', { name: /^新建/ }).click();
  await waitForNative(app, '!document.querySelector(".welcome-screen")', 'New opens editor');
  assert.equal((await scene()).length, 0);
  const backups = await readdir(join(profile, 'data'), { recursive: true });
  assert.ok(backups.some(path => /recovery-.*\.excalidraw$/.test(path)), 'New preserves previous canvas as recovery backup');
  console.log('PASS returning Startup, cancelled picker, new document and recovery backup');

  const file = join(profile, 'welcome-open.excalidraw');
  await writeFile(file, JSON.stringify({ type: 'excalidraw', version: 2, elements: [{ id: 'welcome-test', type: 'rectangle', x: 20, y: 20, width: 180, height: 100 }], appState: {}, files: {} }));
  await acde.reload('excalidraw-depame');
  await waitForNative(app, 'Boolean(document.querySelector(".startup-action-btn:not(:disabled)"))', 'Startup ready');
  await acde.chooseFiles(file);
  await app.getByRole('button', { name: /^打开/ }).click();
  await waitForNative(app, '!document.querySelector(".welcome-screen")', 'Open enters editor');
  assert.equal((await scene())[0].id, 'welcome-test');
  assert.equal(await app.evaluate('document.querySelector(".file-name").textContent'), 'welcome-open');
  await acde.close();
  acde = await Acde.launch(options);
  app = acde.window('excalidraw-depame');
  await enterCanvas(app);
  assert.equal((await scene())[0].id, 'welcome-test');
  assert.deepEqual((await acde.console({ level: 'errors' })).entries, []);
  console.log('PASS native file open and fresh-process persistence; zero runtime errors');
} catch (error) {
  await app.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
  throw error;
} finally { await acde.close(); }
