import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Acde } from '../scripts/acde-driver.mjs';
import { createNativeFixture } from '../scripts/native-fixture.mjs';

const output = resolve(process.env.CANVAS_TEST_OUTPUT || '.debug/settings-ui');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(output, 'profile-'));
const acde = await Acde.launch({
  cwd: await createNativeFixture(profile), out: join(profile, 'build'), headless: true,
  env: { XDG_DATA_HOME: join(profile, 'data'), XDG_CONFIG_HOME: join(profile, 'config'), XDG_STATE_HOME: join(profile, 'state'), ACDE_STORAGE: '' },
});
const app = acde.window('excalidraw-depame');
const settle = () => app.evaluate('new Promise(r=>setTimeout(r,350))');
const rects = () => app.evaluate(`(() => {
  const rect = s => { const r=document.querySelector(s).getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}; };
  return {panel:rect('.settings-panel'),tabs:rect('.settings-tabs'),content:rect('.settings-scroll'),width:innerWidth,height:innerHeight};
})()`);
try {
  await acde.route('/api/network/status', { json: { online: true, checkedAt: Date.now() } });
  await app.locator('.welcome-skip').click({ timeout: 20000 });
  await app.locator('.generate-form textarea').click();
  assert.equal(await app.evaluate('getComputedStyle(document.querySelector(".generate-form")).borderTopLeftRadius'), '24px');
  await app.screenshot({ path: join(output, 'input-focus-rounded.png') });
  await app.getByRole('button', { name: '菜单', exact: true }).click();
  await app.getByRole('menuitem', { name: '设置', exact: true }).click();
  await settle();
  for (const label of ['AI 引擎', 'MCP 服务', '通用']) {
    const frames = await app.evaluate(`new Promise(resolve => {
      const rail = document.querySelector('.settings-tabs');
      const button = Array.from(rail.querySelectorAll('[role=tab]')).find(el => el.textContent === ${JSON.stringify(label)});
      button.click();
      const start = performance.now();
      const frames = [];
      const sample = () => {
        const panel = document.querySelector('.settings-tabpanel:not([hidden])');
        frames.push({ pill: rail.querySelector('.spring-rail-pill').style.transform, content: getComputedStyle(panel).transform });
        if (performance.now() - start < 700) requestAnimationFrame(sample);
        else resolve(frames);
      };
      requestAnimationFrame(sample);
    })`);
    assert.ok(new Set(frames.map(frame => frame.pill)).size > 2, 'The settings selection pill must slide between tabs');
    assert.ok(new Set(frames.map(frame => frame.content)).size > 2, 'Settings content must animate when switching tabs');
    await writeFile(join(output, `motion-${label}.json`), JSON.stringify(frames, null, 2));
  }
  for (const [width, height] of [[1100, 720], [390, 720], [390, 480]]) {
    await acde.resize('excalidraw-depame', width, height);
    for (const theme of ['light', 'dark']) {
      await acde.emulate({ colorScheme: theme });
      let previous;
      for (const [id, label] of [['general', '通用'], ['ai', 'AI 引擎'], ['mcp', 'MCP 服务']]) {
        await app.getByRole('tab', { name: label, exact: true }).click();
        await settle();
        const state = await rects();
        if (previous) {
          assert.ok(Math.abs(previous.panel.height-state.panel.height) < 1, 'Switching settings must preserve window height');
          assert.ok(Math.abs(previous.panel.y-state.panel.y) < 1, 'Switching settings must preserve window position');
        }
        assert.ok(state.tabs.bottom <= state.content.y + 1, 'Navigation must stay above the scrolling content');
        assert.ok(state.panel.x >= 0 && state.panel.right <= state.width && state.panel.bottom <= state.height);
        assert.equal(await app.evaluate('document.querySelector(".settings-scroll").scrollWidth <= document.querySelector(".settings-scroll").clientWidth + 1'), true);
        {
          await app.locator('.settings-scroll').scroll(10000);
          await settle();
          assert.equal(await app.evaluate(`(() => {
            const scroller = document.querySelector('.settings-scroll');
            const content = document.querySelector('.settings-tabpanel:not([hidden])').getBoundingClientRect();
            return (scroller.scrollHeight <= scroller.clientHeight || scroller.scrollTop > 0) && content.bottom <= scroller.getBoundingClientRect().bottom + 1;
          })()`), true, 'All settings content must remain reachable by scrolling');
          const afterScroll = await rects();
          assert.ok(Math.abs(afterScroll.tabs.y - state.tabs.y) < 1, 'Scrolling must not move navigation');
          await app.locator('.settings-scroll').scroll(-10000);
        }
        await app.screenshot({ path: join(output, `after-${id}-${theme}-${width}-${height}.png`) });
        previous = state;
      }
    }
  }
  await app.getByRole('tab', { name: '通用', exact: true }).click();
  await app.keyboard.press('ArrowRight');
  assert.equal(await app.evaluate('document.activeElement.getAttribute("aria-selected")'), 'true');
  await app.keyboard.press('Escape');
  assert.equal(await app.evaluate('document.querySelector(".menu-overlay.is-open") === null'), true);
  assert.deepEqual((await acde.console({ level: 'errors' })).entries, []);
  console.log('Settings layout, themes, narrow navigation and keyboard passed');
} finally { await acde.close(); }
