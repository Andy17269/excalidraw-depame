import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Acde } from '../scripts/acde-driver.mjs';
import { createNativeFixture, emulateReducedMotion } from '../scripts/native-fixture.mjs';

const output = resolve('.debug/entry-transition');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(output, 'profile-'));
const acde = await Acde.launch({ cwd: await createNativeFixture(profile), out: join(profile, 'build'), headless: true,
  env: { XDG_DATA_HOME: join(profile, 'data'), XDG_CONFIG_HOME: join(profile, 'config'), XDG_STATE_HOME: join(profile, 'state'), ACDE_STORAGE: '' } });
try {
  const app = acde.window('excalidraw-depame');
  const wait = async code => {
    for (let i = 0; i < 400; i++) {
      if (await app.evaluate(code)) return;
      await app.evaluate('new Promise(r => requestAnimationFrame(r))');
    }
    throw new Error(`Timed out: ${code}`);
  };
  const phase = 'document.querySelector(".excalidraw-app").dataset.entryPhase';
  await wait('document.querySelector(".welcome-continue") && !document.querySelector(".welcome-continue").disabled');
  await app.evaluate(`(() => {
    window.__entryFrames = [];
    const start = performance.now();
    const sample = () => {
      const root = document.querySelector('.excalidraw-app');
      const dock = getComputedStyle(document.querySelector('.canvas-dock'));
      window.__entryFrames.push({ ms: performance.now() - start, phase: root.dataset.entryPhase, transform: dock.transform, opacity: Number(dock.opacity), backdrop: getComputedStyle(document.querySelector('.welcome-screen') || root).backdropFilter });
      if (root.dataset.entryPhase !== 'closed') requestAnimationFrame(sample);
    };
    document.querySelector('.welcome-continue').click();
    requestAnimationFrame(sample);
  })()`);
  assert.equal(await app.evaluate(phase), 'leaving');
  assert.equal(await app.evaluate('document.querySelector(".canvas-stage").inert && document.querySelector(".file-capsule").inert'), true);
  assert.equal(await app.evaluate('Boolean(document.querySelector(".onboarding-card"))'), false);
  await app.screenshot({ path: join(output, 'entry-start.png') });
  await app.evaluate('new Promise(r => setTimeout(r, 220))');
  await writeFile(join(output, 'middle-state.json'), JSON.stringify(await app.evaluate(`['.canvas-stage','.dock-position','.canvas-dock','.file-capsule','.welcome-screen'].map(sel=>{const el=document.querySelector(sel);if(!el)return {sel,absent:true};const s=getComputedStyle(el),r=el.getBoundingClientRect();return {sel,visibility:s.visibility,display:s.display,opacity:s.opacity,filter:s.filter,top:r.top,left:r.left,width:r.width,height:r.height}})`), null, 2));
  await app.screenshot({ path: join(output, 'entry-middle.png') });
  await wait(`${phase} === 'closed'`);
  await wait('Boolean(document.querySelector(".onboarding-card"))');
  assert.equal(await app.evaluate('document.querySelector(".canvas-stage").inert'), false);
  assert.equal(await app.evaluate('getComputedStyle(document.querySelector(".canvas-dock")).animationName'), 'none');
  await app.screenshot({ path: join(output, 'entry-tour.png') });
  const frames = await app.evaluate('window.__entryFrames');
  await writeFile(join(output, 'frames.json'), JSON.stringify(frames, null, 2));
  assert.ok(frames.some(frame => frame.opacity > .02 && frame.opacity < .99), 'Native renderer must interpolate opacity');
  assert.ok(new Set(frames.map(frame => frame.transform)).size > 3, 'Native renderer must interpolate movement');
  assert.ok(frames.some(frame => { const blur = Number.parseFloat(frame.backdrop.replace('blur(', '')); return blur > 0 && blur < 10; }), 'Backdrop blur must recede so incoming controls become visible');
  assert.ok(frames.at(-1).ms >= 800 && frames.at(-1).ms < 1500, 'Transition must finish near the 850ms deadline');
  await acde.reload('excalidraw-depame');
  await wait('document.querySelector(".startup-action-btn.is-primary") && !document.querySelector(".startup-action-btn.is-primary").disabled');
  await emulateReducedMotion(acde, app);
  await app.keyboard.press('Escape');
  await wait(`${phase} === 'closed'`);
  assert.equal(await app.evaluate('Boolean(document.querySelector(".welcome-screen"))'), false);
  assert.equal(await app.evaluate('getComputedStyle(document.querySelector(".file-capsule")).animationName'), 'none');
  assert.equal(await app.evaluate('document.activeElement.classList.contains("excalidraw")'), true);
  // Dark/narrow entry, then enable reduced motion while it is running.
  await emulateReducedMotion(acde, app, false);
  await acde.emulate({ colorScheme: 'dark' });
  await acde.resize('excalidraw-depame', 390, 640);
  await acde.reload('excalidraw-depame');
  await wait('document.querySelector(".startup-action-btn.is-primary") && !document.querySelector(".startup-action-btn.is-primary").disabled');
  await app.keyboard.press('Escape');
  assert.equal(await app.evaluate(phase), 'leaving');
  await app.evaluate('new Promise(r => setTimeout(r, 250))');
  await app.screenshot({ path: join(output, 'entry-dark-narrow.png') });
  await emulateReducedMotion(acde, app);
  await wait(`${phase} === 'closed'`);
  assert.equal(await app.evaluate('getComputedStyle(document.querySelector(".canvas-dock")).animationName'), 'none');
  assert.equal(await app.evaluate('document.documentElement.dataset.theme'), 'dark');
  assert.deepEqual((await acde.console({ level: 'errors' })).entries, []);
  console.log('PASS entry transition isolation, delayed tour, cleanup, Startup reduced motion and focus');
} finally { await acde.close(); }
