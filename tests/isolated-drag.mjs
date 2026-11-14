import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Acde } from '../scripts/acde-driver.mjs';
import { createNativeFixture, enterCanvas } from '../scripts/native-fixture.mjs';
import { PNG } from 'pngjs';
import { readFile } from 'node:fs/promises';

const label = process.argv[2] || 'normal';
const output = resolve(process.env.CANVAS_TEST_OUTPUT || '.acde/regression-artifacts', label);
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(output, 'profile-'));
const cwd = await createNativeFixture(profile);
const acde = await Acde.launch({ cwd, out: join(output, 'build'), headless: true, env: {
  XDG_DATA_HOME: join(profile, 'data'), XDG_CONFIG_HOME: join(profile, 'config'), XDG_STATE_HOME: join(profile, 'state'), ACDE_STORAGE: '', ACDE_SCALE: label.includes('hidpi') ? '1.5' : '1',
} });
try {
  const app = acde.window('excalidraw-depame');
  await enterCanvas(app);
  await app.getByRole('button', { name: '选择', exact: true }).click();
  assert.equal(JSON.parse(await app.evaluate('window.canvasBridge.read_canvas()')).length, 0, 'Isolated test must start empty');
  if (label.includes('no-blur')) await app.evaluate('document.querySelectorAll(".glass").forEach(e=>{e.style.backdropFilter="none";e.style.webkitBackdropFilter="none"})');
  await app.evaluate('window.canvasBridge.draw_diagram("flowchart LR\\nA[Alpha] --> B[Beta]")');
  await app.mouse.click(640, 400);
  await app.keyboard.press('ctrl+a');
  if (label.includes('zero')) { await app.getByRole('slider', { name: '透明度', exact: true }).focus(); await app.keyboard.press('Home'); await app.mouse.click(640, 400); await app.keyboard.press('ctrl+a'); }
  const start = performance.now();
  for (let i = 0; i < 5; i++) {
    await app.mouse.move(640, 400); await app.mouse.down(); await app.mouse.move(700, 440, { steps: 8 }); await app.mouse.up();
    await app.mouse.move(700, 440); await app.mouse.down(); await app.mouse.move(640, 400, { steps: 8 }); await app.mouse.up();
  }
  console.log(JSON.stringify({ label, dragMs: Math.round(performance.now() - start), elements: JSON.parse(await app.evaluate('window.canvasBridge.read_canvas()')).length, fonts: await app.evaluate('Array.from(document.fonts).filter(f=>["Excalifont","Xiaolai"].includes(f.family)&&f.status==="loaded").map(f=>f.family)'), errors: (await acde.console({ level: 'errors' })).entries }));
  await app.screenshot({ path: join(output, 'result.png') });
  const png = PNG.sync.read(await readFile(join(output, 'result.png')));
  const pixel = (Math.floor(png.height * .05) * png.width + Math.floor(png.width * .8)) * 4;
  assert.ok(png.data[pixel] > 250 && png.data[pixel + 1] > 250 && png.data[pixel + 2] > 250, 'Native title bar leaked into content');
  if (label.includes('zero')) {
    await app.getByRole('slider', { name: '透明度', exact: true }).focus(); await app.keyboard.press('End');
    await app.screenshot({ path: join(output, 'restored.png') });
  }
} finally { await acde.close(); }
