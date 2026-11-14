import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Acde } from '../scripts/acde-driver.mjs';
import { createNativeFixture, enterCanvas } from '../scripts/native-fixture.mjs';

const output = resolve(process.env.CANVAS_TEST_OUTPUT || '.debug/web-search');
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
  await enterCanvas(app);
  const frame = () => app.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const wait = async (check, message) => {
    for (let i = 0; i < 400; i++) {
      if (await check()) return;
      await frame();
    }
    throw new Error(message);
  };

  // Default state: no fixed demo-prompt-pills, and web search toggle is hidden when backend webSearch is off
  assert.equal(await app.evaluate('Boolean(document.querySelector(".demo-prompt-pills"))'), false);
  await app.getByRole('textbox', { name: '描述', exact: true }).click();
  await wait(async () => await app.evaluate('document.querySelector(".tool-picker")?.classList.contains("is-open")'), 'Tool picker did not open');
  assert.equal(await app.evaluate('document.querySelectorAll(".tool-picker .tool-search-toggle").length'), 0);

  // Enable webSearch in backend settings via the real AI Settings UI, then verify the toggle appears in the floating bar
  await app.getByRole('button', { name: '菜单', exact: true }).click();
  await app.locator('.menu-dropdown [role="menuitem"]').filter({ hasText: '设置' }).click();
  await app.getByRole('tab', { name: 'AI 引擎', exact: true }).click();
  await wait(async () => await app.evaluate('Boolean(document.querySelector(".menu-overlay.is-open")) && !document.querySelector(".menu-panel .menu-btn-primary")?.disabled'), 'AI Settings modal did not finish loading');
  await app.locator('.menu-panel [role="radio"]').filter({ hasText: '自动' }).click();
  await app.locator('.menu-panel .menu-btn-primary').filter({ hasText: '保存' }).click();
  await wait(async () => await app.evaluate('(document.querySelector(".menu-panel")?.textContent || "").includes("已保存")'), 'AI Settings save did not complete');
  await app.keyboard.press('Escape');
  await wait(async () => await app.evaluate('!document.querySelector(".menu-overlay.is-open")'), 'AI Settings modal did not close');
  await app.getByRole('textbox', { name: '描述', exact: true }).click();
  await wait(async () => await app.evaluate('document.querySelectorAll(".tool-picker .tool-search-toggle").length === 1'), 'Search toggle did not appear after enabling backend webSearch');

  // Switch to 图表 mode and enable 联网搜索 in the floating bar
  await app.getByRole('radio', { name: '图表', exact: true }).click();
  const searchToggle = app.locator('.tool-search-toggle');
  assert.equal(await app.evaluate('document.querySelector(".tool-search-toggle")?.getAttribute("aria-pressed")'), 'false');
  await searchToggle.click();
  assert.equal(await app.evaluate('document.querySelector(".tool-search-toggle")?.getAttribute("aria-pressed")'), 'true');
  assert.equal(await app.evaluate('document.querySelector(".tool-picker")?.classList.contains("is-open")'), true);
  assert.equal(await app.evaluate('Boolean(document.querySelector(".generate-search-badge"))'), true);
  await app.screenshot({ path: join(output, 'floating-bar-search.png') });

  // Intercept /api/generate in browser fetch to verify webSearch=true payload and tool toast
  await app.evaluate(`(() => {
    const origFetch = window.fetch.bind(window);
    window.__lastGenerateBody = null;
    window.fetch = async (input, init) => {
      if (String(input).endsWith('/api/generate')) {
        window.__lastGenerateBody = JSON.parse(String(init?.body || '{}'));
        await new Promise(r => setTimeout(r, 250));
        return new Response(JSON.stringify({
          mermaid: 'flowchart TD\\nA["联网检索"] --> B["生成图表"]',
          usedTools: ['deepseek_web_search'],
          webSearchEnabled: true,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return origFetch(input, init);
    };
  })()`);

  await app.getByRole('textbox', { name: '描述', exact: true }).fill('React 19 架构图');
  await app.getByRole('button', { name: '生成', exact: true }).click();

  await wait(async () => await app.evaluate('Boolean(document.querySelector(".ai-tool-toast.is-pending"))'), 'Pending tool hint did not appear');
  await wait(async () => await app.evaluate('Boolean(document.querySelector(".ai-tool-toast:not(.is-pending)"))'), 'Tool usage toast did not appear');

  const toastText = await app.evaluate('document.querySelector(".ai-tool-toast")?.textContent || ""');
  assert.ok(toastText.includes('已调用工具：联网搜索'), `Unexpected toast text: ${toastText}`);
  const payload = JSON.parse(await app.evaluate('JSON.stringify(window.__lastGenerateBody)'));
  assert.equal(payload.webSearch, true);
  await app.screenshot({ path: join(output, 'tool-toast.png') });

  assert.deepEqual((await acde.console({ level: 'errors' })).entries, []);
  console.log('PASS floating bar web search toggle, pending/completed tool toast, and zero errors');
} catch (error) {
  console.error(error.message);
  await acde.window('excalidraw-depame').screenshot({ path: join(output, 'failure.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await acde.close();
}
