import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Acde } from '../scripts/acde-driver.mjs';
import { createNativeFixture } from '../scripts/native-fixture.mjs';

const output = resolve(process.env.CANVAS_TEST_OUTPUT || '.debug/onboarding-tour');
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
  const frame = () => app.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const wait = async (code, message) => {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (await app.evaluate(code)) return;
      await frame();
    }
    throw new Error(message);
  };

  // 1. Welcome page has "跳过引导" and "继续", no "新建"/"打开"
  await app.getByRole('button', { name: '继续', exact: true }).waitFor({ state: 'visible', timeout: 20000 });
  await wait('!document.querySelector(".welcome-continue").disabled', 'Welcome did not become ready');
  assert.equal(await app.evaluate('Boolean(document.querySelector(".welcome-skip"))'), true);
  assert.equal(await app.evaluate('document.querySelector(".welcome-skip").textContent.trim()'), '跳过引导');
  assert.equal(await app.evaluate('Boolean(document.querySelector(".welcome-files"))'), false);
  await app.screenshot({ path: join(output, 'welcome.png') });

  // 2. Click "继续" -> enters canvas and auto-starts 7-step OnboardingTour
  await app.getByRole('button', { name: '继续', exact: true }).click();
  await wait('Boolean(document.querySelector(".onboarding-card"))', 'OnboardingTour did not open after Welcome Continue');
  assert.equal(await app.evaluate('document.querySelector(".onboarding-step-count").textContent.trim()'), '1 / 7');
  await app.screenshot({ path: join(output, 'tour-step-1.png') });

  // 3. Walk through all 7 steps, verifying card stays inside viewport
  for (let step = 1; step <= 7; step++) {
    assert.equal(
      await app.evaluate('document.querySelector(".onboarding-step-count").textContent.trim()'),
      `${step} / 7`,
    );
    const inViewport = await app.evaluate(`(() => {
      const r = document.querySelector(".onboarding-card").getBoundingClientRect();
      return r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1;
    })()`);
    assert.equal(inViewport, true, `Tour card clipped out of viewport on step ${step}`);
    if (step === 6) {
      await app.screenshot({ path: join(output, 'tour-step-6-vision-ui.png') });
    }
    if (step === 7) {
      await app.screenshot({ path: join(output, 'tour-step-7-mcp.png') });
    }
    const btnLabel = step === 7 ? '开始使用' : '下一步';
    await app.getByRole('button', { name: btnLabel, exact: true }).click();
    await frame();
  }
  await wait('!document.querySelector(".onboarding-card")', 'OnboardingTour did not close after last step');
  console.log('PASS 1: Welcome -> 7-step OnboardingTour completed cleanly');

  // 4. Reload shows Startup without "欢迎回来" and with aligned action buttons; tour does not auto-open
  await acde.reload('excalidraw-depame');
  await wait('Boolean(document.querySelector(".startup-action-btn")) && !document.querySelector(".startup-action-btn").disabled', 'Startup did not become ready');
  assert.equal(await app.evaluate('document.querySelector("#startup-title").textContent.trim()'), 'Excalidraw+');
  const iconsAligned = await app.evaluate(`(() => {
    const icons = Array.from(document.querySelectorAll(".startup-action-icon-wrap"));
    return icons.length === 2 && Math.abs(icons[0].getBoundingClientRect().left - icons[1].getBoundingClientRect().left) < 1;
  })()`);
  assert.equal(iconsAligned, true, 'Startup action icons should be left-aligned');
  await app.screenshot({ path: join(output, 'startup.png') });

  await app.getByRole('button', { name: /新建/, exact: false }).first().click();
  await wait('!document.querySelector(".welcome-screen")', 'Startup did not dismiss');
  for (let i = 0; i < 6; i++) await frame();
  assert.equal(await app.evaluate('Boolean(document.querySelector(".onboarding-card"))'), false);
  console.log('PASS 2: Startup title, aligned action buttons, and no auto-tour on returning launch');

  // 5. Re-open tour from 设置 -> 通用 -> 使用引导 and dismiss with Escape
  await app.getByRole('button', { name: '菜单', exact: true }).click();
  await app.getByRole('menuitem', { name: '设置', exact: true }).click();
  await wait('document.querySelector(".menu-overlay").classList.contains("is-open")', 'Settings did not open');
  await app.getByRole('button', { name: '开始引导', exact: true }).click();
  await wait('Boolean(document.querySelector(".onboarding-card"))', 'Tour did not open from Settings -> General');
  await app.keyboard.press('Escape');
  await wait('!document.querySelector(".onboarding-card")', 'Escape did not close OnboardingTour');
  assert.deepEqual((await acde.console({ level: 'errors' })).entries, []);
  console.log('PASS 3: Re-opening tour from Settings -> General and dismissing with Escape');
} finally {
  await acde.close();
}
