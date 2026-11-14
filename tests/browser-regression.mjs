import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
const output = resolve(process.env.CANVAS_TEST_OUTPUT || '.debug/browser-regression');
await mkdir(output, { recursive: true });
let devServer;
let baseUrl = process.env.CANVAS_BROWSER_URL;
if (!baseUrl) {
  const profile = await mkdtemp(join(output, 'server-'));
  process.env.EXCALIDRAW_AI_SETTINGS_FILE = join(profile, 'ai-settings.json');
  process.env.EXCALIDRAW_MCP_SETTINGS_FILE = join(profile, 'mcp-servers.json');
  const { createServer } = await import('vite');
  devServer = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
  await devServer.listen();
  baseUrl = devServer.resolvedUrls.local[0];
}
const browser = await chromium.launch({ channel: 'chrome', headless: true,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', permissions: ['microphone'], reducedMotion: 'reduce' });
const page = await context.newPage();
await page.addInitScript(() => {
  window.__audioFrames = 0;
  const NativeAudioContext = window.AudioContext;
  navigator.mediaDevices.getUserMedia = async constraints => {
    if (window.__denyMicrophone) { window.__microphoneRejections = (window.__microphoneRejections || 0) + 1; throw new DOMException('Synthetic permission rejection', 'NotAllowedError'); }
    if (!constraints.audio) throw new Error('Expected audio-only capture');
    const source = new NativeAudioContext();
    const oscillator = source.createOscillator();
    const destination = source.createMediaStreamDestination();
    oscillator.connect(destination);
    oscillator.start();
    await source.resume();
    const stream = destination.stream;
    for (const track of stream.getTracks()) {
      const stop = track.stop.bind(track);
      track.stop = () => { stop(); oscillator.stop(); void source.close(); };
    }
    window.__microphoneState = stream.getTracks().map(track => ({ kind: track.kind, state: track.readyState }));
    return stream;
  };
  window.AudioContext = class extends NativeAudioContext {
    constructor(...args) { super(...args); window.__audioContext = this; }
  };
  const createProcessor = AudioContext.prototype.createScriptProcessor;
  AudioContext.prototype.createScriptProcessor = function (...args) {
    const processor = createProcessor.apply(this, args);
    processor.addEventListener('audioprocess', () => { window.__audioFrames++; });
    return processor;
  };
});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/api/network/status', route => route.fulfill({ json: { online: true, checkedAt: Date.now() } }));
const wait = expression => page.waitForFunction(expression, undefined, { timeout: 20000 });
const scene = () => page.evaluate(() => JSON.parse(window.canvasBridge.read_canvas()));
const menu = async name => { await page.getByRole('button', { name: '菜单', exact: true }).click(); await page.locator('.menu-dropdown').getByRole('menuitem', { name, exact: true }).click(); };
try {
  await page.goto(baseUrl);
  await page.getByRole('button', { name: '继续', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
  assert.equal(await page.locator('.welcome-card').evaluate(el => getComputedStyle(el).animationName), 'none');
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.locator('.onboarding-card').waitFor();
  assert.equal(await page.locator('.onboarding-card').evaluate(el => getComputedStyle(el).animationName), 'none');
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  assert.equal(await page.locator('.onboarding-card').evaluate(el => getComputedStyle(el).transitionDuration), '0s');
  await page.keyboard.press('Escape');
  await menu('设置');
  await page.getByRole('tab', { name: 'AI 引擎', exact: true }).click();
  const toggle = page.getByRole('switch', { name: '绘制动画', exact: true });
  await wait('!document.querySelector("[role=switch][aria-label=绘制动画]").disabled');
  assert.equal(await page.locator('.menu-switch-thumb').first().evaluate(el => getComputedStyle(el).transitionDuration), '0s');
  await toggle.click();
  console.log('PASS browser true reduced-motion media query, entry, tour and switches');

  // A fresh installation must be able to configure a provider without a bundled key.
  assert.equal(await page.getByLabel('接口地址', { exact: true }).count(), 1, 'Provider URL configuration must be reachable in AI settings');
  await page.getByLabel('接口地址', { exact: true }).fill('https://example.invalid/v1');
  await page.getByLabel('模型名称', { exact: true }).fill('test-model');
  await page.getByLabel('API Key', { exact: true }).fill('test-only-local-key');
  assert.equal(await page.getByLabel('API Key', { exact: true }).getAttribute('type'), 'password');
  await page.locator('.menu-form').getByRole('button', { name: '保存', exact: true }).click();
  await wait('document.querySelector(".menu-status.is-saved")?.textContent.includes("已保存")');
  assert.equal(await page.getByLabel('API Key', { exact: true }).inputValue(), '');
  const publicSettings = await page.evaluate(() => fetch('/api/settings/ai').then(r => r.json()));
  assert.equal(publicSettings.baseUrl, 'https://example.invalid');
  assert.equal(publicSettings.model, 'test-model');
  assert.equal(publicSettings.hasApiKey, true);
  assert.ok(!JSON.stringify(publicSettings).includes('test-only-local-key'));
  await page.keyboard.press('Escape');
  console.log('PASS browser provider configuration, persistence and key masking');

  let speechRequests = 0;
  let wavHeader;
  let generateRequests = 0;
  await page.route('**/api/speech', async route => {
    speechRequests++;
    const data = route.request().postDataBuffer();
    wavHeader = { riff: data.toString('ascii', 0, 4), sampleRate: data.readUInt32LE(24), channels: data.readUInt16LE(22), bits: data.readUInt16LE(34), size: data.length };
    await route.fulfill({ json: { text: '画一个语音测试流程图' } });
  });
  await page.route('**/api/generate', async route => { generateRequests++; await route.fulfill({ json: { mermaid: 'flowchart LR\nA["语音输入"]-->B["生成完成"]', usedTools: [] } }); });
  const voice = page.getByRole('button', { name: '语音', exact: true });
  await voice.focus();
  await page.keyboard.down('Space');
  await wait('document.querySelector(".voice-button").classList.contains("listening")');
  await wait('window.__audioFrames >= 5');
  await page.keyboard.up('Space');
  await wait('JSON.parse(window.canvasBridge.read_canvas()).some(el => el.text?.includes("生成完成"))');
  assert.equal(speechRequests, 1);
  assert.equal(generateRequests, 1);
  assert.deepEqual({ ...wavHeader, size: undefined }, { riff: 'RIFF', sampleRate: 16000, channels: 1, bits: 16, size: undefined });
  assert.ok(wavHeader.size > 6400);
  const before = (await scene()).length;
  await page.keyboard.down('Alt');
  await wait('document.querySelector(".voice-button").classList.contains("listening")');
  await page.waitForTimeout(500);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.keyboard.up('Alt');
  assert.equal(speechRequests, 1, 'Blur cancels recording without an ASR request');
  assert.equal((await scene()).length, before);
  console.log('PASS fake-device microphone, real PCM16 WAV encoding, ASR-to-diagram and blur cancellation');

  const fileStatusBeforeDenial = await page.locator('.file-capsule > .status-dot').getAttribute('class');
  await page.evaluate(() => { window.__denyMicrophone = true; });
  await voice.focus();
  await page.keyboard.down('Space');
  await wait('window.__microphoneRejections === 1 && !document.querySelector(".voice-button").classList.contains("listening")');
  await page.keyboard.up('Space');
  assert.equal(await page.locator('.file-capsule > .status-dot').getAttribute('class'), fileStatusBeforeDenial, 'Microphone permission failure must not mark document saving as failed');
  assert.match(await page.locator('.ai-error-toast').textContent(), /麦克风|语音/);
  assert.equal(speechRequests, 1);
  await page.getByRole('button', { name: '关闭提示', exact: true }).click();
  await page.evaluate(() => { window.__denyMicrophone = false; });
  console.log('PASS microphone rejection reports voice feedback and preserves document status');

  await page.getByRole('textbox', { name: '描述', exact: true }).fill('输入法组合中');
  await page.getByRole('textbox', { name: '描述', exact: true }).dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
  assert.equal(generateRequests, 1, 'IME Enter must not submit');
  await page.getByRole('textbox', { name: '描述', exact: true }).fill('');
  const beforeFailure = await scene();
  await page.unroute('**/api/generate');
  await page.route('**/api/generate', route => route.fulfill({ status: 502, json: { error: '测试服务暂不可用' } }));
  await page.getByRole('textbox', { name: '描述', exact: true }).fill('画流程图');
  await page.getByRole('button', { name: '生成', exact: true }).click();
  await page.locator('.ai-error-toast').waitFor();
  assert.deepEqual(await scene(), beforeFailure);
  assert.equal(await page.getByRole('textbox', { name: '描述', exact: true }).inputValue(), '画流程图');
  await page.getByRole('button', { name: '关闭提示', exact: true }).click();
  await page.getByRole('textbox', { name: '描述', exact: true }).fill('');
  console.log('PASS IME composition protection and AI failure preserves content and prompt');

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 320, height: 480 });
  await menu('设置');
  await page.getByRole('tab', { name: '通用', exact: true }).click();
  await page.getByRole('radio', { name: '深色', exact: true }).click();
  for (const name of ['通用', 'AI 引擎', 'MCP 服务']) {
    await page.getByRole('tab', { name, exact: true }).click();
    const bounds = await page.locator('.settings-panel').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 321 && bounds.y + bounds.height <= 481);
  }
  await page.screenshot({ path: join(output, 'browser-dark-narrow.png') });
  await page.keyboard.press('Escape');
  await page.unroute('**/api/network/status');
  await page.route('**/api/network/status', route => route.fulfill({ json: { online: false, checkedAt: Date.now() } }));
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await wait('document.querySelector(".dock-ai-row").inert && document.querySelector(".generate-form textarea").disabled');
  assert.equal(await page.getByRole('button', { name: '矩形', exact: true }).isEnabled(), true);
  await page.unroute('**/api/network/status');
  await page.route('**/api/network/status', route => route.fulfill({ json: { online: true, checkedAt: Date.now() } }));
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await wait('!document.querySelector(".dock-ai-row").inert && !document.querySelector(".generate-form textarea").disabled');
  assert.deepEqual(errors, []);
  await writeFile(join(output, 'results.json'), JSON.stringify({ reducedMotion: true, microphone: 'synthetic device', wavHeader, speechRequests, generateRequests, errors }, null, 2));
  console.log('PASS browser dark narrow settings and zero uncaught errors');
} catch (error) {
  console.error(await page.evaluate(() => ({ microphone: window.__microphoneState, frames: window.__audioFrames, audioState: window.__audioContext?.state, voice: document.querySelector('.voice-button')?.className, status: document.querySelector('.status-dot')?.className })));
  await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
  console.error(error.stack);
  process.exitCode = 1;
} finally { await browser.close(); await devServer?.close(); }
