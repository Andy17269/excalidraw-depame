import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Acde } from '../scripts/acde-driver.mjs';
import { createNativeFixture, enableDemoMode, emulateReducedMotion } from '../scripts/native-fixture.mjs';

const output = resolve(process.env.CANVAS_TEST_OUTPUT || '.debug/ui-polish');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(output, 'profile-'));
const acde = await Acde.launch({
  cwd: await createNativeFixture(profile), out: join(profile, 'build'), headless: true,
  env: { XDG_DATA_HOME: join(profile, 'data'), XDG_CONFIG_HOME: join(profile, 'config'), XDG_STATE_HOME: join(profile, 'state'), ACDE_STORAGE: join(profile, 'storage') },
});
const app = acde.window('excalidraw-depame');
const frame = () => app.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
const wait = async (code, message) => {
  for (let i = 0; i < 400; i++) { if (await app.evaluate(code)) return; await frame(); }
  throw new Error(message);
};
const screenshot = name => app.screenshot({ path: join(output, `${name}.png`) });
const startup = async () => {
  await wait('document.querySelectorAll(".startup-preset").length === 3 && !document.querySelector(".startup-action-btn").disabled', 'Startup presets did not become ready');
};
const mockGeneration = async () => {
  await app.evaluate(`(() => {
    const original = window.fetch.bind(window);
    window.__polishRequests = [];
    window.fetch = async (input, init) => {
      if (String(input).endsWith('/api/generate')) {
        window.__polishRequests.push({ body: JSON.parse(init.body), welcome: !!document.querySelector('.welcome-screen'), scene: JSON.parse(window.canvasBridge.read_canvas()).length });
        await new Promise(resolve => { window.__releasePolish = resolve; });
        return new Response(JSON.stringify({ mermaid: 'flowchart LR\\nA[任务] --> B[完成]' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return original(input, init);
    };
  })()`);
};
const openSettings = async () => {
  await app.getByRole('button', { name: '菜单', exact: true }).click();
  await app.getByRole('menuitem', { name: '设置', exact: true }).click();
  await app.getByRole('tab', { name: '通用', exact: true }).waitFor({ state: 'visible' });
};

try {
  await acde.route('/api/network/status', { json: { online: true, checkedAt: Date.now() } });
  await app.locator('.welcome-skip').click({ timeout: 20000 });
  await wait('!document.querySelector(".welcome-screen")', 'Welcome did not close');
  assert.equal(await app.evaluate('document.querySelector(".vision-button").disabled'), true);
  assert.match(await app.evaluate('document.querySelector(".vision-button").title'), /请先在画布绘制/);
  await enableDemoMode(app);
  await screenshot('canvas-empty-light');
  await acde.emulate({ colorScheme: 'dark' });
  await frame();
  await screenshot('canvas-empty-dark');
  await acde.emulate({ colorScheme: 'light' });
  await acde.reload('excalidraw-depame');
  await startup();
  await app.locator('.startup-action-btn').first().focus();
  await app.keyboard.press('Shift+Tab');
  assert.equal(await app.evaluate('document.activeElement === document.querySelectorAll(".startup-preset")[2]'), true);
  await app.keyboard.press('Tab');
  assert.equal(await app.evaluate('document.activeElement.classList.contains("is-primary")'), true);
  await screenshot('startup-light');
  await acde.emulate({ colorScheme: 'dark' });
  await frame();
  await screenshot('startup-dark');
  await acde.resize('excalidraw-depame', 390, 700);
  await frame();
  assert.equal(await app.evaluate('document.querySelector(".startup-card").scrollWidth <= document.querySelector(".startup-card").clientWidth + 1'), true);
  await app.locator('.startup-preset').last().focus();
  await frame();
  assert.equal(await app.evaluate('(()=>{const button=document.activeElement.getBoundingClientRect(),card=document.querySelector(".startup-card").getBoundingClientRect();return button.top >= card.top && button.bottom <= card.bottom})()'), true, 'Focused preset must scroll into the visible card');
  await screenshot('startup-narrow-dark');
  await acde.resize('excalidraw-depame', 1280, 800);
  await acde.emulate({ colorScheme: 'light' });
  await mockGeneration();
  await app.locator('.startup-preset').first().click();
  await wait('!!document.querySelector("dialog[open]") || !document.querySelector(".welcome-screen")', 'Preset click did not act');
  if (await app.evaluate('!!document.querySelector("dialog[open]")')) {
    assert.equal(await app.evaluate('(()=>{const r=document.querySelector("dialog[open]").getBoundingClientRect();return r.top >= 0 && r.bottom <= innerHeight})()'), true, 'Confirmation must stay inside the viewport');
    await screenshot('preset-unsaved-confirm');
    await app.getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(await app.evaluate('window.__polishRequests.length'), 0);
    await app.locator('.startup-preset').first().click();
    await app.getByRole('button', { name: '不保存', exact: true }).click();
  }
  await wait('!document.querySelector(".welcome-screen") && JSON.parse(window.canvasBridge.read_canvas()).length > 8', 'Music sketch was not inserted');
  assert.equal(await app.evaluate('window.__polishRequests.length'), 0, 'Showcase insertion is local');
  await app.getByRole('button', { name: '预设模板', exact: true }).click();
  await app.getByRole('menuitem', { name: '流程', exact: true }).click();
  await wait('window.__polishRequests.length === 1', 'Diagram preset did not generate');
  assert.equal(await app.evaluate('window.__polishRequests[0].welcome'), false);
  assert.match(await app.evaluate('window.__polishRequests[0].body.prompt'), /登录/);
  await wait('!!document.querySelector(".ai-tool-toast.is-pending")', 'Planning feedback missing');
  await screenshot('generating-light');
  await acde.emulate({ colorScheme: 'dark' });
  await frame();
  await screenshot('generating-dark');
  await app.evaluate('window.__releasePolish()');
  await wait('!document.querySelector(".dock-shell.is-generating") && JSON.parse(window.canvasBridge.read_canvas()).length > 0', 'Diagram did not complete');
  assert.equal(await app.evaluate('window.__polishRequests.length'), 1, 'Preset must launch once');
  console.log('PASS startup focus loop, light/dark/narrow layouts, preset timing and generation feedback');

  await acde.reload('excalidraw-depame');
  await startup();
  await mockGeneration();
  await app.locator('.startup-preset').nth(1).click();
  await wait('!!document.querySelector("dialog[open]") || !document.querySelector(".welcome-screen")', 'Travel click did not act');
  if (await app.evaluate('!!document.querySelector("dialog[open]")')) await app.getByRole('button', { name: '不保存', exact: true }).click();
  await wait('!document.querySelector(".welcome-screen") && JSON.parse(window.canvasBridge.read_canvas()).some(e=>e.text === "山海之间")', 'Travel sketch did not insert');
  assert.equal(await app.evaluate('window.__polishRequests.length'), 0, 'Travel sketch inserts locally');
  await acde.reload('excalidraw-depame');
  await startup();
  await mockGeneration();
  await app.locator('.startup-preset').last().click();
  await wait('!!document.querySelector("dialog[open]") || !document.querySelector(".welcome-screen")', 'Sketch click did not act');
  if (await app.evaluate('!!document.querySelector("dialog[open]")')) await app.getByRole('button', { name: '不保存', exact: true }).click();
  await wait('!document.querySelector(".welcome-screen") && JSON.parse(window.canvasBridge.read_canvas()).filter(e=>e.type === "rectangle").length >= 5', 'Sketch was not inserted');
  assert.equal(await app.evaluate('window.__polishRequests.length'), 0, 'Sketch must not call AI');
  console.log('PASS travel and commerce sketches insert locally on new canvases');

  await openSettings();
  for (const theme of ['light', 'dark']) {
    await acde.emulate({ colorScheme: theme });
    for (const label of ['通用', 'AI 引擎', 'MCP 服务']) {
      await app.getByRole('tab', { name: label, exact: true }).click();
      await frame();
      assert.equal(await app.evaluate('Array.from(document.querySelectorAll(".settings-tabpanel")).filter(p=>!p.hidden).length'), 1);
      assert.equal(await app.evaluate('Array.from(document.querySelectorAll(".settings-tabpanel[hidden]")).every(p=>p.hasAttribute("inert") && p.getAttribute("aria-hidden") === "true")'), true);
      await screenshot(`settings-${theme}-${label === '通用' ? 'general' : label === 'AI 引擎' ? 'ai' : 'mcp'}`);
    }
  }
  await app.getByRole('tab', { name: '通用', exact: true }).click();
  await app.keyboard.press('ArrowRight');
  assert.equal(await app.evaluate('document.activeElement.textContent'), 'AI 引擎');
  await wait('!document.querySelector(".menu-form [role=switch]").disabled', 'AI settings did not load');
  await app.getByRole('switch', { name: '绘制动画', exact: true }).click();
  const draft = await app.evaluate('document.querySelector(".menu-form [role=switch]").getAttribute("aria-checked")');
  await app.getByRole('tab', { name: 'MCP 服务', exact: true }).click();
  await app.getByRole('tab', { name: 'AI 引擎', exact: true }).click();
  assert.equal(await app.evaluate('document.querySelector(".menu-form [role=switch]").getAttribute("aria-checked")'), draft);
  assert.equal(await app.evaluate('(()=>{const buttons=[...document.querySelectorAll(".menu-actions > button")];return buttons.length===3 && Math.max(...buttons.map(b=>b.getBoundingClientRect().top))-Math.min(...buttons.map(b=>b.getBoundingClientRect().top))<2})()'), true);
  await acde.resize('excalidraw-depame', 390, 700);
  for (const label of ['通用', 'AI 引擎', 'MCP 服务']) {
    await app.getByRole('tab', { name: label, exact: true }).click();
    await frame();
    assert.equal(await app.evaluate('document.querySelector(".settings-scroll").scrollWidth <= document.querySelector(".settings-scroll").clientWidth + 1'), true);
    await screenshot(`settings-narrow-${label === '通用' ? 'general' : label === 'AI 引擎' ? 'ai' : 'mcp'}`);
  }
  await app.getByRole('tab', { name: '通用', exact: true }).click();
  await app.getByRole('button', { name: '重置引导', exact: true }).click();
  await app.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(await app.evaluate('!!document.querySelector(".menu-overlay.is-open")'), true);
  await app.keyboard.press('Escape');
  await wait('!document.querySelector(".menu-overlay.is-open")', 'Escape did not close settings');
  const reducedMotionSupported = await emulateReducedMotion(acde, app);
  await acde.reload('excalidraw-depame');
  await startup();
  if (reducedMotionSupported) assert.equal(await app.evaluate('getComputedStyle(document.querySelector(".startup-card")).animationName'), 'none');
  await app.keyboard.press('Escape');
  await wait('!document.querySelector(".welcome-screen")', 'Startup Escape did not close');
  assert.deepEqual((await acde.console({ level: 'errors' })).entries, []);
  console.log('PASS settings tabs, keyboard, draft persistence, action alignment, reset cancel, reduced motion and Escape');
} catch (error) {
  console.error(error);
  console.error(await app.evaluate('JSON.stringify({ dialogs: [...document.querySelectorAll("dialog")].map(d=>({open:d.open,text:d.textContent})), requests: window.__polishRequests, buttons: [...document.querySelectorAll(".startup-preset")].map(b=>({disabled:b.disabled,text:b.textContent})) })'));
  await screenshot('failure').catch(() => {});
  console.error(JSON.stringify((await acde.console({ level: 'errors' }).catch(() => ({ entries: [] }))).entries));
  process.exitCode = 1;
} finally {
  await acde.close();
}
