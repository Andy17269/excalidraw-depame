import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Acde, acdeBinary } from '../scripts/acde-driver.mjs';
import { enterCanvas, selectFileMenu, waitForNative } from '../scripts/native-fixture.mjs';
const output = resolve(process.env.CANVAS_TEST_OUTPUT || '.debug/packaged');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'canvas-package-'));
const packaged = join(profile, 'package');
execFileSync(acdeBinary, ['build', '--out', packaged], { cwd: process.cwd(), timeout: 120000, stdio: 'pipe' });
const acde = await Acde.launch({ cwd: packaged, headless: true,
  env: { XDG_DATA_HOME: join(profile, 'data'), XDG_CONFIG_HOME: join(profile, 'config'), XDG_STATE_HOME: join(profile, 'state'), ACDE_STORAGE: '' } });
const app = acde.window('excalidraw-depame');
try {
  await enterCanvas(app);
  await app.evaluate('window.canvasBridge.draw_diagram("flowchart LR\\nA[Packaged]-->B[Editable]")');
  await waitForNative(app, 'JSON.parse(window.canvasBridge.read_canvas()).length >= 5', 'Packaged diagram visible');
  assert.equal(await app.evaluate('Array.from(document.fonts).some(f=>f.family==="Excalifont" && f.status==="loaded")'), true);
  await acde.drop(resolve('tests/fixtures/example.heic'), { web: 'excalidraw-depame', x: 500, y: 350 });
  await waitForNative(app, 'JSON.parse(window.canvasBridge.read_canvas()).some(el=>el.type==="image")', 'Relocated HEIC worker works');
  const target = join(profile, 'packaged-scene.excalidraw');
  await acde.chooseSaveFile(target);
  await selectFileMenu(app, '保存');
  await waitForNative(app, 'document.querySelector(".file-name").textContent === "packaged-scene"', 'Packaged save succeeds');
  assert.ok(Object.keys(JSON.parse(await readFile(target, 'utf8')).files).length > 0);
  const mcp = await app.evaluate('fetch("/api/mcp").then(r=>r.json())');
  if (!existsSync(mcp.localServer.scriptPath)) console.log('SKIP installed external MCP: the stdio CLI bridge requires the source checkout and acde dev, as documented in docs/MCP.md');
  assert.deepEqual((await acde.console({ level: 'errors' })).entries, []);
  await app.screenshot({ path: join(output, 'packaged-scene.png') });
  console.log('PASS relocated release package, offline fonts, editable diagram, HEIC worker and native save');
} catch (error) {
  await app.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
  throw error;
} finally { await acde.close(); }
