import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Acde } from '../scripts/acde-driver.mjs';
import { createNativeFixture, enterCanvas, selectFileMenu, waitForNative } from '../scripts/native-fixture.mjs';
import { configureLiveAi } from '../scripts/live-ai-fixture.mjs';
const output = resolve(process.env.CANVAS_TEST_OUTPUT || '.debug/multimodal-live');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(output, 'profile-'));
const acde = await Acde.launch({ cwd: await createNativeFixture(profile), out: join(profile, 'build'), headless: true,
  env: { XDG_DATA_HOME: join(profile, 'data'), XDG_CONFIG_HOME: join(profile, 'config'), XDG_STATE_HOME: join(profile, 'state'), ACDE_STORAGE: '' } });
const app = acde.window('excalidraw-depame');
try {
  await configureLiveAi(app);
  await acde.route('/api/network/status', { json: { online: true, checkedAt: Date.now() } });
  await enterCanvas(app);
  const fixture = join(profile, 'ordinary-sketch.excalidraw');
  await writeFile(fixture, JSON.stringify({ type: 'excalidraw', version: 2, appState: {}, files: {}, elements: [
    { id: 'ordinary-frame', type: 'rectangle', x: 0, y: 0, width: 390, height: 700 },
    { id: 'ordinary-heading', type: 'text', text: '天气', originalText: '天气', x: 24, y: 24, width: 80, height: 32, fontSize: 24, fontFamily: 5 },
    { id: 'ordinary-weather', type: 'rectangle', x: 24, y: 100, width: 342, height: 220 },
    { id: 'ordinary-list', type: 'rectangle', x: 24, y: 350, width: 342, height: 200 },
  ] }));
  await acde.chooseFiles(fixture);
  await selectFileMenu(app, '打开...');
  await waitForNative(app, 'JSON.parse(window.canvasBridge.read_canvas()).length === 4', 'Synthetic sketch opened');
  await app.getByRole('button', { name: 'UI草图', exact: true }).click();
  await app.getByRole('button', { name: '整页生成', exact: true }).click();
  await waitForNative(app, '!document.querySelector(".vision-button").classList.contains("generating") && !document.querySelector(".generate-form").getAttribute("aria-busy").includes("true")', 'Real vision request finishes', 150000);
  const result = JSON.parse(await app.evaluate('window.canvasBridge.read_canvas()'));
  const failure = await app.evaluate('document.querySelector(".ai-error-toast")?.textContent || ""');
  assert.equal(failure, '', `Real vision failed: ${failure}`);
  assert.ok(result.length >= 6 && result.some(el => el.type === 'text'), 'Real model must return editable UI');
  assert.ok(!result.some(el => el.id === 'ordinary-weather'), 'Real model replaces the ordinary sketch');
  await app.screenshot({ path: join(output, 'real-vision-ui.png') });
  console.log(`PASS real ordinary-sketch vision: ${result.length} editable elements, ${result.filter(el => el.type === 'image').length} images`);

  if (process.platform === 'darwin') {
    const aiff = join(profile, 'synthetic-speech.aiff');
    const wav = join(profile, 'synthetic-speech.wav');
    execFileSync('say', ['-o', aiff, 'Draw a simple flow chart with three steps.'], { timeout: 30000, stdio: 'ignore' });
    execFileSync('ffmpeg', ['-y', '-i', aiff, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav], { timeout: 30000, stdio: 'ignore' });
    const data = (await readFile(wav)).toString('base64');
    const speech = await app.evaluate(`(async()=>{const bytes=Uint8Array.from(atob(${JSON.stringify(data)}),c=>c.charCodeAt(0));const r=await fetch('/api/speech',{method:'POST',headers:{'Content-Type':'audio/wav'},body:bytes});return {status:r.status,body:await r.json()}})()`);
    assert.equal(speech.status, 200, 'Real ASR endpoint accepts synthesized PCM16 WAV');
    assert.ok(typeof speech.body.text === 'string' && speech.body.text.trim().length >= 5);
    console.log(`PASS real ASR synthesized speech: ${speech.body.text}`);
  } else console.log('SKIP synthesized live ASR: macOS say is unavailable on this platform');
  assert.deepEqual((await acde.console({ level: 'errors' })).entries, []);
} catch (error) {
  await app.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
  throw error;
} finally { await acde.close(); }
