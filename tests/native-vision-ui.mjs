import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Acde } from '../scripts/acde-driver.mjs';
import { createNativeFixture, enableDemoMode } from '../scripts/native-fixture.mjs';

const output = resolve(process.env.CANVAS_TEST_OUTPUT || '.debug/vision-ui');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(output, 'profile-'));
const acde = await Acde.launch({
  cwd: await createNativeFixture(profile),
  out: join(profile, 'build'),
  headless: true,
  env: {
    XDG_DATA_HOME: join(profile, 'data'),
    XDG_CONFIG_HOME: join(profile, 'config'),
    XDG_STATE_HOME: join(profile, 'state'),
    ACDE_STORAGE: '',
  },
});

try {
  const app = acde.window('excalidraw-depame');
  await acde.resize('excalidraw-depame', 1280, 800);
  await app.locator('.welcome-skip').click({ timeout: 20000 });
  const frame = () => app.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const scene = async () => JSON.parse(await app.evaluate('window.canvasBridge.read_canvas()'));
  const wait = async (check, message) => {
    for (let i = 0; i < 400; i++) {
      if (await check()) return;
      await frame();
    }
    throw new Error(message);
  };

  assert.equal(await app.evaluate('Boolean(document.querySelector(".vision-button")?.disabled)'), true);

  await app.getByRole('textbox', { name: '描述', exact: true }).click();
  await wait(async () => await app.evaluate('document.querySelector(".tool-picker")?.classList.contains("is-open")'), 'Tool picker did not open on input focus');
  assert.equal(await app.evaluate('document.querySelectorAll(".tool-picker .spring-rail-item").length'), 4);
  assert.equal(await app.evaluate('document.querySelectorAll(".tool-picker .tool-search-toggle").length'), 0);
  const pillSamples = await app.evaluate(`(() => {
    const pill = document.querySelector('.tool-picker .spring-rail-pill');
    const editBtn = document.querySelectorAll('.tool-picker button')[2];
    const readX = () => {
      const m = /translate3d\\(([-0-9.]+)px/.exec(pill.style.transform || '');
      return m ? Number(m[1]) : 0;
    };
    const startX = readX();
    editBtn.click();
    return new Promise(resolve => {
      const samples = [];
      const step = () => {
        samples.push(readX());
        if (samples.length < 6) requestAnimationFrame(step);
        else resolve({ startX, endX: editBtn.offsetLeft, samples });
      };
      requestAnimationFrame(step);
    });
  })()`);
  assert.ok(
    pillSamples.samples.some(x => x > pillSamples.startX + 2 && x < pillSamples.endX - 2),
    `Expected spring pill to slide smoothly across frames, got ${JSON.stringify(pillSamples)}`,
  );
  await app.getByRole('radio', { name: '图表', exact: true }).click();
  assert.equal(await app.evaluate('document.querySelector(".tool-picker button[aria-checked=true]")?.textContent'), '图表');
  for (let i = 0; i < 15; i++) await frame();
  await app.screenshot({ path: join(output, 'tool-picker.png') });

  await enableDemoMode(app);
  await app.getByRole('button', { name: '预设模板', exact: true }).click();
  await app.getByRole('menuitem', { name: '音乐 App', exact: true }).click();
  await wait(async () => (await scene()).length >= 8, 'Demo sketch did not render');
  await app.getByRole('button', { name: '矩形', exact: true }).click();
  await app.mouse.move(120, 160);
  await app.mouse.down();
  await app.mouse.move(230, 240, { steps: 6 });
  await app.mouse.up();
  await frame();
  await app.keyboard.press('Escape');
  const totalBefore = (await scene()).length;
  await app.screenshot({ path: join(output, 'sketch.png') });

  // Multi-select the centered phone sketch without opening pick mode first; corner badge should appear automatically.
  await app.getByRole('button', { name: '选择', exact: true }).click();
  await app.mouse.move(390, 90);
  await app.mouse.down();
  await app.mouse.move(880, 695, { steps: 10 });
  await app.mouse.up();
  await wait(async () => await app.evaluate('Boolean(document.querySelector(".vision-corner-badge"))'), 'Automatic multi-select corner badge did not appear');
  await app.screenshot({ path: join(output, 'corner-badge.png') });

  // Clear selection, then also verify manual UI草图 pick-mode bar works end-to-end.
  await app.mouse.click(320, 120);
  await wait(async () => !(await app.evaluate('Boolean(document.querySelector(".vision-corner-badge"))')), 'Corner badge did not hide when selection cleared');

  await app.getByRole('button', { name: 'UI草图', exact: true }).click();
  await wait(async () => await app.evaluate('Boolean(document.querySelector(".vision-pick-bar"))'), 'Pick bar did not open when no component selected');
  await wait(async () => await app.evaluate('document.querySelector(".tools [aria-label=选择]")?.getAttribute("aria-pressed") === "true"'), 'Active tool did not switch to selection');
  await app.screenshot({ path: join(output, 'pick-mode.png') });

  // Drag-select only the centered phone sketch, leaving the left marker rectangle unselected.
  await app.mouse.move(390, 50);
  await app.mouse.down();
  await app.mouse.move(880, 760, { steps: 10 });
  await app.mouse.up();
  await wait(async () => await app.evaluate('Boolean(document.querySelector(".vision-pick-primary"))'), 'Selected component confirm button did not appear');

  await app.getByRole('button', { name: '生成选中区域 UI', exact: true }).click();
  await wait(
    async () => {
      const current = await scene();
      const animating = await app.evaluate('Boolean(document.querySelector(".ai-cursor.is-visible"))');
      return !animating
        && current.filter(element => element.type === 'image').length === 8
        && current.some(element => element.type === 'text' && element.text.includes('DAMIDAMI'));
    },
    'Music Demo UI did not finish streaming onto canvas',
  );
  for (let i = 0; i < 12; i++) await frame();

  const rendered = await scene();
  assert.equal(rendered.filter(element => element.type === 'image').length, 8);
  assert.ok(rendered.filter(element => element.type === 'rectangle').length >= 4, 'Unselected rectangle marker must be preserved');
  assert.ok(rendered.some(element => element.type === 'text' && element.text.includes('为你精选')));
  assert.ok(rendered.some(element => element.type === 'text' && element.text.includes('DAMIDAMI')));
  await app.screenshot({ path: join(output, 'vision-ui.png') });

  await app.mouse.click(320, 120);
  await app.keyboard.press('ctrl+z');
  await wait(async () => (await scene()).length === totalBefore && !(await scene()).some(element => element.type === 'image'), 'Undo did not restore original sketch');
  assert.deepEqual((await acde.console({ level: 'errors' })).entries, []);
  console.log('PASS component pick flow, scoped vision UI generation preserving unselected items, contrast guard, undo, and zero errors');
} catch (error) {
  console.error(error.message);
  await acde.window('excalidraw-depame').screenshot({ path: join(output, 'failure.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await acde.close();
}
