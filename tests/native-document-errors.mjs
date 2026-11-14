import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Acde } from '../scripts/acde-driver.mjs';
import { createNativeFixture, enterCanvas, selectFileMenu, waitForNative } from '../scripts/native-fixture.mjs';
const output = resolve(process.env.CANVAS_TEST_OUTPUT || '.debug/document-errors');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(output, 'profile-'));
const acde = await Acde.launch({ cwd: await createNativeFixture(profile), out: join(profile, 'build'), headless: true,
  env: { XDG_DATA_HOME: join(profile, 'data'), XDG_CONFIG_HOME: join(profile, 'config'), XDG_STATE_HOME: join(profile, 'state'), ACDE_STORAGE: '' } });
const app = acde.window('excalidraw-depame');
const snapshot = () => app.evaluate('window.canvasBridge.read_canvas()');
try {
  await enterCanvas(app);
  await app.evaluate('window.canvasBridge.draw_diagram("flowchart LR\\nA[Original]-->B[Keep]")');
  await waitForNative(app, 'document.querySelector(".status-dot").classList.contains("saved")', 'Autosave settled');
  const original = await snapshot();
  const corrupt = join(profile, 'corrupt.excalidraw');
  await writeFile(corrupt, '{broken json');
  await acde.chooseFiles(corrupt);
  await selectFileMenu(app, '打开...');
  await waitForNative(app, 'document.querySelector(".status-dot").classList.contains("error")', 'Invalid file reported');
  assert.equal(await snapshot(), original, 'Malformed file must not reset existing scene');
  assert.equal(await app.evaluate('document.querySelector(".file-name").textContent'), '未命名白板');
  console.log('PASS corrupt document preserves existing scene and file identity');

  await acde.chooseSaveFile(null);
  await selectFileMenu(app, '另存为...');
  await waitForNative(app, '!document.querySelector(".menu-trigger").disabled', 'Cancelled save settles');
  assert.equal(await snapshot(), original);
  await app.evaluate(`(() => {
    window.__originalSavePicker = window.showSaveFilePicker;
    window.showSaveFilePicker = async () => ({ kind:'file', name:'write-error.excalidraw', createWritable:async()=>{throw new DOMException('Synthetic permission error','NotAllowedError')} });
  })()`);
  await selectFileMenu(app, '另存为...');
  await waitForNative(app, 'document.querySelector(".status-dot").classList.contains("error") && !document.querySelector(".menu-trigger").disabled', 'Write failure recovers UI');
  assert.equal(await snapshot(), original);
  assert.equal(await app.evaluate('document.querySelector(".file-name").textContent'), '未命名白板');
  await app.evaluate('window.showSaveFilePicker = window.__originalSavePicker');
  const target = join(profile, 'recovered.excalidraw');
  await acde.chooseSaveFile(target);
  await selectFileMenu(app, '另存为...');
  await waitForNative(app, 'document.querySelector(".file-name").textContent === "recovered" && document.querySelector(".status-dot").classList.contains("saved")', 'Save retry succeeds');
  const savedRaw = await readFile(target, 'utf8');
  const saved = JSON.parse(savedRaw);
  assert.equal(saved.elements.length, JSON.parse(original).length);
  console.log('PASS cancelled picker and denied write preserve content; retry saves successfully');

  await app.locator('.file-name').click();
  await app.getByRole('textbox', { name: '文件名称', exact: true }).fill('renamed-whiteboard');
  await app.getByRole('button', { name: '确定', exact: true }).click();
  assert.equal(await app.evaluate('document.querySelector(".file-name").textContent'), 'renamed-whiteboard');
  const renamed = join(profile, 'renamed-whiteboard.excalidraw');
  await acde.chooseSaveFile(renamed);
  await selectFileMenu(app, '保存');
  await waitForNative(app, '!document.querySelector(".menu-trigger").disabled', 'Renamed save completes');
  assert.equal(JSON.parse(await readFile(renamed, 'utf8')).elements.length, saved.elements.length);
  assert.equal(await readFile(target, 'utf8'), savedRaw, 'Renaming must leave the original file untouched');
  assert.deepEqual((await acde.console({ level: 'errors' })).entries, []);
  await app.screenshot({ path: join(output, 'document-recovered.png') });
  console.log('PASS renamed document saves to a new file without changing the original');
} catch (error) {
  await app.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
  throw error;
} finally { await acde.close(); }
