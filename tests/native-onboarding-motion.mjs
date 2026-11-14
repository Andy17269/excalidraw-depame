import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Acde } from '../scripts/acde-driver.mjs';
import { createNativeFixture, emulateReducedMotion, waitForNative } from '../scripts/native-fixture.mjs';

const output = resolve(process.env.CANVAS_TEST_OUTPUT || '.debug/onboarding-motion');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(output, 'profile-'));
const options = {
  cwd: await createNativeFixture(profile),
  out: join(profile, 'build'),
  headless: true,
  env: {
    XDG_DATA_HOME: join(profile, 'data'),
    XDG_CONFIG_HOME: join(profile, 'config'),
    XDG_STATE_HOME: join(profile, 'state'),
    ACDE_STORAGE: '',
  },
};

const acde = await Acde.launch(options);
try {
  const app = acde.window('excalidraw-depame');
  await app.getByRole('button', { name: '继续', exact: true }).waitFor({ state: 'visible', timeout: 20000 });
  const sample = action => app.evaluate(`new Promise(resolve => {
    const frames = [];
    let start;
    const deadline = performance.now() + 10000;
    ${action}
    const tick = () => {
      const card = document.querySelector('.onboarding-card');
      if (card) {
        start ??= performance.now();
        const style = getComputedStyle(card), rect = card.getBoundingClientRect();
        frames.push({ ms: performance.now() - start, opacity: Number(style.opacity), transform: style.transform, x: rect.x, y: rect.y, focused: card.contains(document.activeElement) });
      }
      if (start !== undefined && performance.now() - start >= 700 || performance.now() > deadline) resolve(frames);
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })`);
  for (let i = 0; i < 400 && await app.evaluate('document.querySelector(".welcome-continue").disabled'); i++) {
    await app.evaluate('new Promise(r => requestAnimationFrame(r))');
  }
  const entrance = await sample(`document.querySelector('.welcome-continue').click();`);
  await writeFile(join(output, 'entrance-frames.json'), JSON.stringify(entrance, null, 2));
  assert.ok(entrance.length > 0, 'Tour must open before checking animation');
  assert.ok(entrance.some(f => f.opacity > .01 && f.opacity < .98), 'Card surface must fade in, not flash at full opacity');
  assert.ok(entrance.some(f => f.ms > 160 && f.ms < 320 && f.transform !== entrance.at(-1).transform), 'Entrance movement must remain visible beyond 160ms');
  assert.equal(entrance.at(-1).opacity, 1);
  assert.ok(entrance.every(f => f.focused), 'Entrance must preserve the focus trap');
  for (const direction of ['next', 'prev']) {
    const frames = await sample(`document.querySelector('.onboarding-${direction}').click();`);
    const last = frames.at(-1);
    assert.ok(frames.some(f => f.ms > 80 && f.ms < 300 && Math.abs(f.y - last.y) > 2), 'Step changes must travel through intermediate positions');
    assert.ok(frames.every(f => f.focused), 'Step changes must preserve keyboard focus');
  }
  await app.screenshot({ path: join(output, 'tour-settled.png') });
  await app.keyboard.press('Escape');
  await app.getByRole('button', { name: '菜单', exact: true }).click();
  await app.getByRole('menuitem', { name: '设置', exact: true }).click();
  const reopened = await sample(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '开始引导').click();`);
  assert.ok(reopened.some(f => f.opacity > .01 && f.opacity < .98), 'Reopening must replay the entrance');
  const reducedMotionSupported = await emulateReducedMotion(acde, app);
  const reduced = await sample(`document.querySelector('.onboarding-next').click();`);
  if (reducedMotionSupported) assert.equal(new Set(reduced.map(f => f.y)).size, 1, 'Reduced motion must move directly to the next step');
  if (reducedMotionSupported) assert.ok(reduced.every(f => f.opacity === 1), 'Reduced motion must keep the card fully visible');
  await acde.resize('excalidraw-depame', 390, 480);
  await waitForNative(app, `(() => {const r=document.querySelector('.onboarding-card').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1;})()`, 'Narrow tour stays in viewport');
  assert.deepEqual((await acde.console({ level: 'errors' })).entries, []);
  console.log('PASS card entrance, next/previous movement, replay, focus, reduced motion and narrow viewport');
} finally { await acde.close(); }
