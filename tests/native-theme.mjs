import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Acde } from '../scripts/acde-driver.mjs';
import { createNativeFixture, enableDemoMode, emulateReducedMotion } from '../scripts/native-fixture.mjs';

const output = resolve(process.env.CANVAS_TEST_OUTPUT || '.debug/dark-mode/native');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(output, 'profile-'));
const acde = await Acde.launch({
  cwd: await createNativeFixture(profile), out: join(profile, 'build'), headless: true,
  env: { XDG_DATA_HOME: join(profile, 'data'), XDG_CONFIG_HOME: join(profile, 'config'), XDG_STATE_HOME: join(profile, 'state'), ACDE_STORAGE: '' },
});
const app = acde.window('excalidraw-depame');
const frame = () => app.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
const wait = async (code, message) => {
  for (let i = 0; i < 400; i++) { if (await app.evaluate(code)) return; await frame(); }
  throw new Error(message);
};
const shot = async name => {
  await wait('Array.from(document.querySelectorAll(".welcome-screen:not(.is-leaving),.welcome-card,.menu-overlay.is-open,.library-panel.is-open,.onboarding-card")).every(el=>Number(getComputedStyle(el).opacity) >= .99)', 'Entrance did not settle');
  await frame();
  await app.screenshot({ path: join(output, `${name}.png`) });
};
const styles = selector => app.evaluate(`(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return null;
  const s = getComputedStyle(el);
  return { bg: s.backgroundColor, color: s.color, filter: s.filter, outline: s.outlineStyle, outlineColor: s.outlineColor };
})()`);
const darkSurface = async selector => {
  const s = await styles(selector);
  assert.ok(s, `Missing ${selector}`);
  const rgb = s.bg.match(/[\d.]+/g).map(Number);
  assert.ok(Math.max(...rgb.slice(0, 3)) < 95 && (rgb[3] ?? 1) > .5, `${selector} must have a dark surface: ${JSON.stringify(s)}`);
};
const readable = async (selector, surface, minimum = 4.5) => {
  const { ratio, color, bg } = await app.evaluate(`(() => {
    const rgb = s => (s.match(/[\\d.]+/g) || []).map(Number).slice(0, 3);
    const color = getComputedStyle(document.querySelector(${JSON.stringify(selector)})).color;
    const bg = getComputedStyle(document.querySelector(${JSON.stringify(surface)})).backgroundColor;
    const lum = s => rgb(s).map(n => n/255).map(n => n <= .04045 ? n/12.92 : ((n+.055)/1.055)**2.4).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
    const a=lum(color), b=lum(bg);
    return {ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),color,bg};
  })()`);
  assert.ok(ratio >= minimum, `${selector} contrast ${ratio.toFixed(2)} < ${minimum} (${color} on ${bg})`);
};
const openSettings = async () => {
  await app.getByRole('button', { name: '菜单', exact: true }).click();
  await app.getByRole('menuitem', { name: '设置', exact: true }).click();
  await app.getByRole('tab', { name: '通用', exact: true }).waitFor({ state: 'visible' });
};
const theme = async label => {
  await app.getByRole('radio', { name: label, exact: true }).click();
  await frame();
};

try {
  await acde.route('/api/network/status', { json: { online: true, checkedAt: Date.now() } });
  await acde.route('/api/mcp', { json: {
    servers: [{ id: 'theme-fixture', name: '外观测试服务', transport: 'stdio', command: 'node', enabled: true, status: 'connected', tools: [{ name: 'echo', description: '仅用于界面回归', inputSchema: { type: 'object', properties: { text: { type: 'string' } } } }] }],
    localServer: { name: '白板', enabled: true, command: 'node', scriptPath: '/fixture/canvas-mcp.mjs', tools: [], clientConfigJson: '{}' },
  } });
  await acde.route('/api/mcp/servers/theme-fixture/call', { json: { ok: true, text: '测试完成' } });
  await acde.emulate({ colorScheme: 'dark' });
  const reducedMotionSupported = await emulateReducedMotion(acde, app);
  await wait('document.documentElement.dataset.theme === "dark" && !document.querySelector(".welcome-continue")?.disabled', 'Welcome theme did not initialize');
  await darkSurface('.welcome-card');
  await readable('.welcome-content h1 strong', '.welcome-card');
  await readable('.welcome-feature p', '.welcome-card');
  await shot('welcome-dark');
  await acde.emulate({ colorScheme: 'light' });
  await frame();
  await readable('.welcome-feature p', '.welcome-card');
  await shot('welcome-light');
  await acde.emulate({ colorScheme: 'dark' });
  await app.locator('.welcome-skip').click();
  await wait('!document.querySelector(".welcome-screen")', 'Welcome did not close');
  await acde.reload('excalidraw-depame');
  await wait('!!document.querySelector(".startup-action-btn") && !document.querySelector(".startup-action-btn").disabled', 'Startup not ready');
  await darkSurface('.startup-action-btn:not(.is-primary)');
  await darkSurface('.startup-recent');
  await readable('.startup-brand h1', '.welcome-card');
  await readable('.startup-action-btn.is-primary .startup-action-copy strong', '.startup-action-btn.is-primary');
  await app.locator('.startup-action-btn.is-primary').hover();
  await frame();
  await readable('.startup-action-btn.is-primary .startup-action-copy strong', '.startup-action-btn.is-primary');
  await shot('startup-dark');
  await acde.resize('excalidraw-depame', 390, 700);
  await frame();
  assert.equal(await app.evaluate('document.querySelector(".startup-card").scrollWidth <= document.querySelector(".startup-card").clientWidth + 1'), true);
  await shot('startup-narrow-dark');
  await acde.resize('excalidraw-depame', 1280, 800);
  await app.locator('.startup-action-btn.is-primary').click();
  await wait('!document.querySelector(".welcome-screen")', 'New did not enter canvas');
  await openSettings();
  await theme('深色');
  await darkSurface('.menu-panel');
  await readable('.menu-row-label', '.menu-panel');
  await readable('.menu-btn-primary', '.menu-btn-primary');
  await shot('settings-general-dark');
  await acde.emulate({ colorScheme: 'light' });
  await frame();
  assert.equal(await app.evaluate('document.documentElement.dataset.theme'), 'dark', 'explicit dark overrides system');
  await theme('浅色');
  assert.equal(await app.evaluate('document.documentElement.dataset.theme'), 'light');
  await shot('settings-general-light');
  await theme('跟随系统');
  await acde.emulate({ colorScheme: 'dark' });
  await wait('document.documentElement.dataset.theme === "dark" && !!document.querySelector(".excalidraw.theme--dark")', 'System appearance did not reach canvas');
  await theme('深色');
  for (const label of ['AI 引擎', 'MCP 服务']) {
    await app.getByRole('tab', { name: label, exact: true }).click();
    await frame();
    if (label === 'AI 引擎') await readable('.menu-btn-primary', '.menu-btn-primary');
    else {
      await wait('!!document.querySelector(".mcp-local-card")', 'MCP snapshot did not load');
      await darkSurface('.mcp-local-card');
      await app.getByRole('button', { name: '添加', exact: true }).click();
      await darkSurface('.mcp-section .menu-field input');
      await app.getByRole('button', { name: '← 返回', exact: true }).click();
      await app.getByRole('button', { name: '工具 (1)', exact: true }).click();
      await app.getByRole('button', { name: '调试 echo', exact: true }).click();
      await darkSurface('.mcp-tool-item');
      await darkSurface('.mcp-tool-runner textarea');
      await app.getByRole('button', { name: '运行', exact: true }).click();
      await wait('document.querySelector(".mcp-tool-output")?.textContent.includes("测试完成")', 'MCP output did not render');
      await readable('.mcp-tool-output', '.mcp-tool-item');
      await shot('mcp-debug-dark');
    }
    await shot(label === 'AI 引擎' ? 'settings-ai-dark' : 'settings-mcp-dark');
  }
  await app.keyboard.press('Escape');
  await app.getByRole('button', { name: '矩形', exact: true }).click();
  await app.mouse.move(460, 260);
  await app.mouse.down();
  await app.mouse.move(620, 380, { steps: 6 });
  await app.mouse.up();
  await wait('JSON.parse(window.canvasBridge.read_canvas()).length === 1', 'Shape did not draw');
  await wait('document.querySelector(".properties").classList.contains("is-open")', 'Properties missing');
  await darkSurface('.size-row input');
  await shot('properties-dark');
  await enableDemoMode(app);
  await app.getByRole('button', { name: 'UI 组件模板', exact: true }).click();
  await wait('document.querySelector(".library-panel").classList.contains("is-open")', 'Library missing');
  await darkSurface('.library-card');
  await darkSurface('.library-thumb');
  assert.match((await styles('.library-thumb-svg')).filter, /invert/, 'Only thumbnail drawing uses canvas dark filter');
  await shot('library-dark');
  await app.getByRole('button', { name: '关闭素材库', exact: true }).click();
  console.log('PASS welcome/startup, all appearance choices, MCP debug, properties and template preview');

  // Opening a saved light document must keep the chosen appearance and clean status.
  const file = join(profile, 'theme-fixture.excalidraw');
  await writeFile(file, JSON.stringify({ type: 'excalidraw', version: 2, elements: [{ id: 'theme-shape', type: 'rectangle', x: 320, y: 180, width: 140, height: 100, strokeColor: '#1e1e1e', backgroundColor: '#a5d8ff' }], appState: { theme: 'light', viewBackgroundColor: '#ffffff' }, files: {} }));
  await acde.chooseFiles(file);
  await app.getByRole('button', { name: '菜单', exact: true }).click();
  await app.getByRole('menuitem', { name: '打开...', exact: true }).click();
  await wait('JSON.parse(window.canvasBridge.read_canvas())[0]?.id === "theme-shape"', 'Light document did not load');
  assert.equal(await app.evaluate('!!document.querySelector(".excalidraw.theme--dark")'), true);
  await app.locator('.file-name').click();
  await darkSurface('.file-info-popover');
  await darkSurface('.file-rename-row input');
  assert.equal(await app.evaluate('!!document.querySelector(".file-status-pill.is-saved")'), true);
  await shot('file-info-dark');
  await app.keyboard.press('Escape');
  const before = await app.evaluate('window.canvasBridge.read_canvas()');
  await openSettings();
  await app.getByRole('tab', { name: '通用', exact: true }).click();
  for (const label of ['浅色', '深色', '跟随系统', '深色']) await theme(label);
  await app.keyboard.press('Escape');
  assert.equal(await app.evaluate('window.canvasBridge.read_canvas()'), before, 'Appearance must not mutate element data');
  await app.locator('.file-name').click();
  assert.equal(await app.evaluate('!!document.querySelector(".file-status-pill.is-saved")'), true, 'Appearance must not mark saved document dirty');
  await app.keyboard.press('Escape');
  await app.keyboard.press('Meta+z');
  assert.equal(await app.evaluate('window.canvasBridge.read_canvas()'), before, 'Appearance must not add a content undo step');
  assert.equal(await app.evaluate('!!document.querySelector(".excalidraw.theme--dark")'), true);
  await app.getByRole('button', { name: '菜单', exact: true }).click();
  await app.getByRole('menuitem', { name: '快照', exact: true }).click();
  await wait('!!document.querySelector(".snapshot-modal .system-snapshot-row")', 'Snapshot list missing');
  await darkSurface('.snapshot-modal .system-snapshot-row');
  await app.getByRole('button', { name: '新建快照', exact: true }).click();
  await wait('document.querySelector(".snapshot-modal .menu-status.is-saved")?.textContent.includes("已创建快照")', 'Snapshot success feedback missing');
  await readable('.snapshot-modal .menu-status.is-saved', '.snapshot-modal');
  await shot('snapshot-dark');
  await app.keyboard.press('Escape');
  await app.getByRole('button', { name: '菜单', exact: true }).click();
  await app.getByRole('menuitem', { name: '关于', exact: true }).click();
  await darkSurface('.about-license-list');
  await shot('about-dark');
  await app.keyboard.press('Escape');
  await app.mouse.click(800, 450, { button: 'right' });
  await wait('!!document.querySelector(".context-menu")', 'Context menu missing');
  await darkSurface('.context-menu');
  await readable('.context-menu-item', '.context-menu');
  await readable('.context-menu-item.dangerous .context-menu-item__label', '.context-menu');
  await shot('context-menu-dark');
  await app.mouse.click(750, 70);
  await wait('!document.querySelector(".context-menu")', 'Context menu did not dismiss');

  // CSS state fixture for Excalidraw's toast; no clipboard or system notification side effects.
  await app.evaluate(`(() => {
    const toast = document.createElement('div');
    toast.id = 'theme-toast-fixture'; toast.className = 'Toast';
    const message = document.createElement('div'); message.className = 'Toast__message'; message.textContent = '操作已完成';
    toast.append(message); document.querySelector('.excalidraw').append(toast);
  })()`);
  await darkSurface('.Toast');
  await readable('.Toast__message', '.Toast');
  await shot('toast-dark');
  await app.evaluate('document.getElementById("theme-toast-fixture").remove()');
  console.log('PASS document appearance isolation, undo, saved state, snapshot, about, context menu and toast');

  await openSettings();
  await app.getByRole('tab', { name: '通用', exact: true }).click();
  await acde.resize('excalidraw-depame', 390, 700);
  for (const label of ['通用', 'AI 引擎', 'MCP 服务']) {
    await app.getByRole('tab', { name: label, exact: true }).click();
    await frame();
    const overflow = await app.evaluate(`(() => {
      const root = document.querySelector('.settings-scroll'), bounds = root.getBoundingClientRect();
      return { width: root.clientWidth, outerWidth: bounds.width, scroll: root.scrollWidth, children: [...root.querySelectorAll('*')].filter(el => { const r = el.getBoundingClientRect(); return !el.closest('[hidden]') && r.width > 0 && r.height > 0 && r.right > bounds.right + 1; }).map(el=>({class:el.getAttribute('class'),width:el.clientWidth,scroll:el.scrollWidth,right:el.getBoundingClientRect().right})) };
    })()`);
    // acdert's clientWidth excludes its scrollbar while descendant layout uses the outer width.
    assert.ok(overflow.scroll <= Math.max(overflow.width, overflow.outerWidth) + 8 && overflow.children.length === 0, `${label} overflow: ${JSON.stringify(overflow)}`);
  }
  await shot('settings-narrow-dark');
  await acde.resize('excalidraw-depame', 1280, 800);
  await app.getByRole('tab', { name: '通用', exact: true }).click();
  await app.getByRole('button', { name: '开始引导', exact: true }).click();
  await wait('!!document.querySelector(".onboarding-card")', 'Tour did not open');
  await darkSurface('.onboarding-card');
  await readable('.onboarding-card-title', '.onboarding-card');
  await app.keyboard.press('Tab');
  await app.getByRole('button', { name: '下一步', exact: true }).focus();
  assert.equal((await styles('.onboarding-next')).outline, 'solid', 'Keyboard focus must remain visible');
  if (reducedMotionSupported) assert.equal(await app.evaluate('getComputedStyle(document.querySelector(".onboarding-card")).animationName'), 'none');
  await shot('onboarding-dark');
  await app.keyboard.press('Escape');

  // Exercise real pending/error feedback without calling an external AI service.
  console.log('PASS narrow settings, keyboard focus, tour and reduced motion');
  await app.evaluate(`(() => {
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      if (String(input).endsWith('/api/generate')) {
        await new Promise(resolve => { window.__releaseThemeRequest = resolve; });
        return new Response(JSON.stringify({ error: '测试错误，请重试' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
      return original(input, init);
    };
  })()`);
  await app.getByRole('textbox', { name: '描述', exact: true }).fill('绘制流程图');
  await app.getByRole('button', { name: '生成', exact: true }).click();
  await wait('!!document.querySelector(".ai-tool-toast.is-pending") && !!window.__releaseThemeRequest', 'Pending AI state missing');
  await darkSurface('.ai-tool-toast');
  await readable('.ai-pending-copy strong', '.ai-tool-toast');
  await shot('ai-pending-dark');
  await app.evaluate('window.__releaseThemeRequest()');
  await wait('!!document.querySelector(".ai-error-toast")', 'AI error feedback missing');
  await darkSurface('.ai-error-toast');
  await shot('ai-error-dark');
  await app.getByRole('button', { name: '关闭提示', exact: true }).click();
  console.log('PASS pending and error AI feedback');

  // A real edit still dirties the file and its confirmation follows the theme.
  await app.getByRole('button', { name: '矩形', exact: true }).click();
  await app.mouse.move(500, 300);
  await app.mouse.down();
  await app.mouse.move(580, 360, { steps: 5 });
  await app.mouse.up();
  await wait('JSON.parse(window.canvasBridge.read_canvas()).length === 2', 'Edit did not add a second shape');
  await app.getByRole('button', { name: '菜单', exact: true }).click();
  await app.getByRole('menuitem', { name: '新建', exact: true }).click();
  await wait('!!document.querySelector("dialog.confirm-dialog[open]")', 'Dirty document did not prompt');
  await darkSurface('dialog.confirm-dialog[open]');
  await readable('dialog[open] .confirm-dialog-desc', 'dialog[open]');
  await shot('unsaved-dark');
  await app.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(await app.evaluate('JSON.parse(window.canvasBridge.read_canvas()).length'), 2);
  await acde.route('/api/network/status', { json: { online: false, checkedAt: Date.now() } });
  await app.evaluate('window.dispatchEvent(new Event("offline"))');
  await wait('!!document.querySelector(".ai-error-toast.is-offline")', 'Offline state missing');
  await darkSurface('.ai-error-toast.is-offline');
  await shot('offline-dark');
  await acde.route('/api/network/status', { json: { online: true, checkedAt: Date.now() } });
  await acde.reload('excalidraw-depame');
  await wait('!!document.querySelector(".startup-card") && document.documentElement.dataset.theme === "dark"', 'Dark preference not restored');
  await wait('!!document.querySelector(".startup-recent-item")', 'Recent files did not load');
  await darkSurface('.startup-recent-item');
  await shot('startup-recent-dark');
  const errors = (await acde.console({ level: 'errors' })).entries;
  const expectedFailure = '图表生成失败: 测试错误，请重试';
  assert.equal(errors.filter(entry => entry.kind === 'console' && entry.text === expectedFailure).length, 1, 'Expected one diagnostic for the deliberately failed AI request');
  assert.deepEqual(errors.filter(entry => entry.kind !== 'console' || entry.text !== expectedFailure), [], 'Unexpected runtime errors');
  console.log('PASS native dark/light/system appearance, contrast, startup, settings, properties, previews, file state, context menu, snapshots, about and reload');
} catch (error) {
  await shot('failure').catch(() => {});
  throw error;
} finally {
  await acde.close();
}
