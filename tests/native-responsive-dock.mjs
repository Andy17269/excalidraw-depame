import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Acde } from '../scripts/acde-driver.mjs';
import { createNativeFixture } from '../scripts/native-fixture.mjs';

const output = resolve(process.env.CANVAS_TEST_OUTPUT || '.debug/responsive-dock');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(output, 'profile-'));
const acde = await Acde.launch({
  cwd: await createNativeFixture(profile), out: join(profile, 'build'), headless: true,
  env: { XDG_DATA_HOME: join(profile, 'data'), XDG_CONFIG_HOME: join(profile, 'config'), XDG_STATE_HOME: join(profile, 'state'), ACDE_STORAGE: '' },
});
const app = acde.window('excalidraw-depame');
const frame = () => app.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
const layout = () => app.evaluate(`(() => {
  const rect = s => { const r = document.querySelector(s).getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width}; };
  const dock = rect('.canvas-dock'), zoom = rect('.zoom-capsule'), tools = rect('.tools'), ai = rect('.dock-ai-row');
  const visible = el => el.getBoundingClientRect().width > 0 && getComputedStyle(el).display !== 'none';
  const overlaps = r => r.left<zoom.right && r.right>zoom.left && r.top<zoom.bottom && r.bottom>zoom.top;
  return { dock, zoom, width:innerWidth, overlap:overlaps(tools) || overlaps(ai),
    tools:[...document.querySelectorAll('.tools > button[aria-pressed]')].filter(visible).map(el=>el.getAttribute('aria-label')),
    collapsed:!!document.querySelector('.zoom-trigger') && visible(document.querySelector('.zoom-trigger')) };
})()`);

try {
  await acde.route('/api/network/status', { json: { online: true, checkedAt: Date.now() } });
  await app.locator('.welcome-skip').click({ timeout: 20000 });
  for (let i = 0; i < 100 && await app.evaluate('!!document.querySelector(".welcome-screen")'); i++) await frame();
  let previousCount = 7;
  for (const width of [1600, 1280, 1120, 1000, 900, 800, 720, 681, 680, 520, 390, 320]) {
    await acde.resize('excalidraw-depame', width, 720);
    await frame();
    const result = await layout();
    console.log(width, JSON.stringify(result));
    assert.equal(result.overlap, false, `Dock and zoom overlap at ${width}px`);
    for (const rect of [result.dock, result.zoom]) {
      assert.ok(rect.left >= 0 && rect.right <= result.width + 1, `Controls outside viewport at ${width}px`);
    }
    if (width === 1600) assert.equal(result.tools.length, 7);
    if (width <= 1280) assert.equal(result.collapsed, true, `Zoom must collapse at ${width}px`);
    if (width > 680) assert.ok(result.tools.length <= previousCount, 'Tools must collapse from the end as width decreases');
    previousCount = result.tools.length;
    const order = ['选择', '矩形', '菱形', '箭头', '画笔', '文字', '橡皮'];
    assert.deepEqual(result.tools, order.slice(0, result.tools.length));
    if ([1600, 900, 390].includes(width)) await app.screenshot({ path: join(output, `canvas-${width}.png`) });
  }
  await acde.resize('excalidraw-depame', 720, 720);
  await frame();
  await app.locator('.tools-more').click();
  await app.keyboard.press('End');
  assert.equal(await app.evaluate('document.activeElement.textContent'), '橡皮');
  await frame();
  await frame();
  await app.screenshot({ path: join(output, 'tools-menu-720.png') });
  await app.getByRole('menuitemradio', { name: '橡皮', exact: true }).click();
  assert.equal(await app.evaluate('window.canvasBridge && document.querySelector(".tools-more").getAttribute("aria-expanded")'), 'false');
  await app.locator('.tools-more').click();
  assert.equal(await app.evaluate('document.querySelector(".tools-menu [aria-checked=true]").textContent'), '橡皮');
  await app.keyboard.press('Escape');
  assert.equal(await app.evaluate('document.activeElement.classList.contains("tools-more")'), true);
  await app.getByRole('button', { name: '缩放与拖动', exact: true }).click();
  await app.getByRole('button', { name: '放大', exact: true }).click();
  assert.equal(await app.evaluate('document.querySelector(".zoom-reset").textContent'), '110%');
  await app.getByRole('button', { name: '重置缩放', exact: true }).click();
  await app.getByRole('button', { name: '抓手工具', exact: true }).click();
  assert.equal(await app.evaluate('document.querySelector(".zoom-hand").getAttribute("aria-pressed")'), 'true');
  await app.keyboard.press('Escape');
  assert.equal(await app.evaluate('document.activeElement.classList.contains("zoom-trigger")'), true);
  await acde.emulate({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await acde.resize('excalidraw-depame', 320, 480);
  await frame();
  await app.getByRole('button', { name: '缩放与拖动', exact: true }).click();
  await frame();
  await frame();
  await app.screenshot({ path: join(output, 'zoom-menu-320-dark.png') });
  assert.equal(await app.evaluate('(() => { const r=document.querySelector(".zoom-actions").getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth && r.top>=0; })()'), true);
  await app.locator('.tools-more').click();
  assert.equal(await app.evaluate('document.querySelector(".zoom-trigger").getAttribute("aria-expanded")'), 'false');
  await app.keyboard.press('Tab');
  await app.keyboard.press('Escape');
  await acde.resize('excalidraw-depame', 1600, 720);
  await frame();
  assert.equal((await layout()).tools.length, 7);
  assert.deepEqual((await acde.console({ level: 'errors' })).entries, []);
  console.log('Responsive dock layout and controls passed');
} finally {
  await acde.close();
}
