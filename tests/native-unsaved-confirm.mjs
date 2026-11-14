import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Acde } from '../scripts/acde-driver.mjs';
import { createNativeFixture, enterCanvas, selectFileMenu } from '../scripts/native-fixture.mjs';

const output = resolve(process.env.CANVAS_TEST_OUTPUT || '.debug/unsaved-confirm');
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

const acde = await Acde.launch(options);
try {
  const app = acde.window('excalidraw-depame');
  const frame = () => app.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const wait = async (code, message) => {
    for (let i = 0; i < 400; i++) {
      if (await app.evaluate(code)) return;
      await frame();
    }
    throw new Error(message);
  };
  const scene = async () => JSON.parse(await app.evaluate('window.canvasBridge.read_canvas()'));

  await enterCanvas(app);

  // 1. Open a local file so dirty persists after edits
  const fileA = join(profile, 'file-a.excalidraw');
  await writeFile(fileA, JSON.stringify({
    type: 'excalidraw',
    version: 2,
    elements: [{ id: 'rect-a', type: 'rectangle', x: 40, y: 40, width: 140, height: 80 }],
    appState: {},
    files: {},
  }));
  await acde.chooseFiles(fileA);
  await selectFileMenu(app, '打开...');
  await wait('document.querySelector(".file-name").textContent === "file-a"', 'Did not open file-a');
  assert.equal((await scene()).length, 1);

  // 2. Dirty the opened file
  await app.evaluate('window.canvasBridge.draw_diagram("flowchart LR\\nX-->Y")');
  await wait('document.querySelector(".status-dot")?.getAttribute("aria-label") === "未保存"', 'Document did not become dirty');
  const dirtyCount = (await scene()).length;
  assert.ok(dirtyCount > 1);

  // 3. Click 新建 -> confirm dialog appears; click 取消 -> stays on file-a
  await selectFileMenu(app, '新建');
  await wait('Boolean(document.querySelector("dialog.confirm-dialog[open]"))', 'Confirm dialog did not open on 新建');
  assert.equal(await app.evaluate('document.querySelector("dialog[open] .confirm-dialog-title")?.textContent'), '当前文件未保存');
  await app.locator('dialog.confirm-dialog').getByRole('button', { name: '取消', exact: true }).click();
  await wait('!document.querySelector("dialog.confirm-dialog[open]")', 'Confirm dialog did not close on 取消');
  assert.equal((await scene()).length, dirtyCount);
  assert.equal(await app.evaluate('document.querySelector(".file-name").textContent'), 'file-a');

  // 4. Click 打开 -> confirm dialog appears; click 不保存 -> opens file-b
  const fileB = join(profile, 'file-b.excalidraw');
  await writeFile(fileB, JSON.stringify({
    type: 'excalidraw',
    version: 2,
    elements: [{ id: 'rect-b', type: 'rectangle', x: 20, y: 20, width: 100, height: 60 }],
    appState: {},
    files: {},
  }));
  await selectFileMenu(app, '打开...');
  await wait('Boolean(document.querySelector("dialog.confirm-dialog[open]"))', 'Confirm dialog did not open on 打开');
  await acde.chooseFiles(fileB);
  await app.locator('dialog.confirm-dialog').getByRole('button', { name: '不保存', exact: true }).click();
  await wait('!document.querySelector("dialog.confirm-dialog[open]")', 'Confirm dialog did not close on 不保存');
  await wait('document.querySelector(".file-name").textContent === "file-b"', 'Did not open file-b after discard');
  assert.equal((await scene())[0].id, 'rect-b');

  // 5. Dirty file-b, click 新建 -> click 保存 -> saves file-b and creates new canvas
  await app.evaluate('window.canvasBridge.draw_diagram("flowchart LR\\nM-->N")');
  await wait('document.querySelector(".status-dot")?.getAttribute("aria-label") === "未保存"', 'file-b did not become dirty');
  const expectedSavedCount = (await scene()).length;
  await selectFileMenu(app, '新建');
  await wait('Boolean(document.querySelector("dialog.confirm-dialog[open]"))', 'Confirm dialog did not open on 新建 for file-b');
  await app.locator('dialog.confirm-dialog').getByRole('button', { name: '保存', exact: true }).click();
  await wait('!document.querySelector("dialog.confirm-dialog[open]")', 'Confirm dialog did not close after 保存');
  await wait('JSON.parse(window.canvasBridge.read_canvas()).length === 0', 'Canvas did not clear after 保存并新建');
  assert.equal(await app.evaluate('document.querySelector(".file-name").textContent'), '未命名白板');

  const savedB = JSON.parse(await readFile(fileB, 'utf8'));
  assert.equal(savedB.elements.filter(el => !el.isDeleted).length, expectedSavedCount);

  assert.deepEqual((await acde.console({ level: 'errors' })).entries, []);
  console.log('PASS unsaved confirm dialog for 新建 and 打开 (取消 / 不保存 / 保存)');
} catch (error) {
  console.error(error.message);
  await acde.window('excalidraw-depame').screenshot({ path: join(output, 'failure.png') }).catch(() => {});
  console.error(JSON.stringify((await acde.console({ level: 'errors' }).catch(() => ({ entries: [] }))).entries));
  process.exitCode = 1;
} finally {
  await acde.close();
}
