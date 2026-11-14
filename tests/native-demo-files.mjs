import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Acde } from '../scripts/acde-driver.mjs';
import { createNativeFixture, enterCanvas, selectFileMenu, waitForNative } from '../scripts/native-fixture.mjs';
const boards = await readdir('demo/boards').catch(() => []);
if (!boards.length) {
  console.log('SKIP prepared demo files: demo/boards is not present in this checkout');
} else {
  const output = resolve(process.env.CANVAS_TEST_OUTPUT || '.debug/demo-files');
  await mkdir(output, { recursive: true });
  const profile = await mkdtemp(join(output, 'profile-'));
  const acde = await Acde.launch({ cwd: await createNativeFixture(profile), out: join(profile, 'build'), headless: true,
    env: { XDG_DATA_HOME: join(profile, 'data'), XDG_CONFIG_HOME: join(profile, 'config'), XDG_STATE_HOME: join(profile, 'state'), ACDE_STORAGE: '' } });
  const app = acde.window('excalidraw-depame');
  try {
    await enterCanvas(app);
    for (const [index, name] of boards.filter(name => name.endsWith('.excalidraw')).sort().entries()) {
      const source = resolve('demo/boards', name);
      const raw = await readFile(source);
      const originalHash = createHash('sha256').update(raw).digest('hex');
      const original = JSON.parse(raw);
      const expected = original.elements.filter(el => !el.isDeleted);
      await acde.chooseFiles(source);
      await selectFileMenu(app, '打开...');
      await waitForNative(app, `JSON.parse(window.canvasBridge.read_canvas()).length === ${expected.length} && !document.querySelector(".menu-trigger").disabled`, `Demo ${name} opened`);
      const exported = join(profile, `demo-copy-${index}.excalidraw`);
      await acde.chooseSaveFile(exported);
      await selectFileMenu(app, '另存为...');
      await waitForNative(app, `document.querySelector(".file-name").textContent === "demo-copy-${index}"`, 'Demo copy saved');
      const saved = JSON.parse(await readFile(exported, 'utf8'));
      assert.equal(saved.elements.length, expected.length);
      const imageIds = expected.filter(el => el.type === 'image').map(el => el.fileId);
      for (const id of imageIds) assert.equal(saved.files[id]?.dataURL, original.files[id]?.dataURL, 'Embedded image survives import/export');
      assert.equal(createHash('sha256').update(await readFile(source)).digest('hex'), originalHash, 'Source demo is never overwritten');
      await app.screenshot({ path: join(output, `demo-${index}.png`) });
      console.log(`PASS demo file ${name}: ${expected.length} elements, ${imageIds.length} embedded images, saved copy and unchanged source`);
    }
    assert.deepEqual((await acde.console({ level: 'errors' })).entries, []);
  } finally { await acde.close(); }
}
