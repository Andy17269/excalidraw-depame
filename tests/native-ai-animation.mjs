import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Acde } from '../scripts/acde-driver.mjs';
import { createNativeFixture, enterCanvas } from '../scripts/native-fixture.mjs';

const output = resolve(process.env.CANVAS_TEST_OUTPUT || '.debug/ai-animation');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(output, 'profile-'));
const acde = await Acde.launch({ cwd: await createNativeFixture(profile), out: join(profile, 'build'), headless: true, env: { XDG_DATA_HOME: join(profile, 'data'), XDG_CONFIG_HOME: join(profile, 'config'), XDG_STATE_HOME: join(profile, 'state'), ACDE_STORAGE: '' } });
try {
  const app = acde.window('excalidraw-depame');
  await enterCanvas(app);
  const frame = () => app.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const scene = async () => JSON.parse(await app.evaluate('window.canvasBridge.read_canvas()'));
  assert.equal((await scene()).length, 0);
  await app.evaluate(`(()=>{window.__cursor=[];window.__done=false;const c=document.querySelector('.ai-cursor');const t=()=>window.__cursor.push({v:c.classList.contains('is-visible'),t:c.style.transform});const id=setInterval(t,40);window.__stop=()=>clearInterval(id);window.canvasBridge.draw_diagram('flowchart LR\\nA["开始"] --> B["处理"] --> C["结束"]').then(()=>{window.__done=true});return true})()`);
  for (let i = 0; i < 400 && !(await app.evaluate('window.__done')); i++) await frame();
  assert.ok(await app.evaluate('window.__done'), 'animation never finished');
  await app.evaluate('window.__stop()');
  const trail = await app.evaluate('window.__cursor');
  assert.ok(trail.some(s => s.v), 'AI cursor never visible');
  assert.ok(new Set(trail.filter(s => s.v).map(s => s.t)).size > 5, 'AI cursor did not move');
  await frame(); assert.equal(await app.evaluate("document.querySelector('.ai-cursor').classList.contains('is-visible')"), false, 'AI cursor must hide after finishing');
  const count = (await scene()).length;
  assert.ok(count >= 5, 'diagram incomplete');
  await app.mouse.click(1100, 650);
  await app.getByRole('button', { name: '选择', exact: true }).click();
  await app.keyboard.press('ctrl+z');
  for (let i = 0; i < 30; i++) await frame();
  assert.equal((await scene()).length, 0, 'single undo must remove whole AI diagram');
  assert.deepEqual((await acde.console({ level: 'errors' })).entries, []);
  console.log('PASS AI diagram animates with cursor, commits fully, one-step undo');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { await acde.close(); }
