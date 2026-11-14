import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Acde } from '../scripts/acde-driver.mjs';
import { createNativeFixture, enterCanvas, enableDemoMode } from '../scripts/native-fixture.mjs';

const output = resolve(process.env.CANVAS_TEST_OUTPUT || '.debug/network-offline');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(output, 'profile-'));
const shortTmp = await mkdtemp(join(process.platform === 'win32' ? tmpdir() : '/tmp', 'ad-net-'));
const cwd = await createNativeFixture(profile);

const acde = await Acde.launch({
  cwd,
  out: join(profile, 'build'),
  headless: true,
  env: {
    TMPDIR: shortTmp,
    XDG_DATA_HOME: join(profile, 'data'),
    XDG_CONFIG_HOME: join(profile, 'config'),
    XDG_STATE_HOME: join(profile, 'state'),
    ACDE_STORAGE: '',
  },
});

let app;
try {
  app = acde.window('excalidraw-depame');
  const frame = () => app.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))');
  const wait = async (check, message) => {
    for (let i = 0; i < 400; i++) {
      if (await check()) return;
      await frame();
    }
    throw new Error(message);
  };

  await enterCanvas(app);
  await wait(() => app.evaluate('!document.querySelector(".welcome-screen")'), 'Welcome did not close');

  await enableDemoMode(app);

  // Verify the live backend /api/network/status endpoint runs and returns valid JSON
  const liveProbe = await app.evaluate(`
    fetch('/api/network/status', { cache: 'no-store' }).then(r => ({ status: r.status }))
  `);
  assert.equal(liveProbe.status, 200);

  // Stub /api/network/status in page fetch for deterministic offline/online transition checks
  await app.evaluate(`(() => {
    const origFetch = window.fetch.bind(window);
    window.__mockNetworkOnline = true;
    window.fetch = async (input, init) => {
      const target = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (target.includes('/api/network/status')) {
        const online = Boolean(window.__mockNetworkOnline);
        return new Response(JSON.stringify({
          online,
          host: 'baidu.com',
          checkedAt: Date.now(),
          durationMs: online ? 3 : 5000,
          ...(online ? {} : { reason: 'ping baidu.com 超时（5s）' }),
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return origFetch(input, init);
    };
  })()`);

  // Transition to offline
  await app.evaluate(`(() => {
    window.__mockNetworkOnline = false;
    window.dispatchEvent(new Event('offline'));
  })()`);

  await wait(
    () => app.evaluate('document.querySelector(".dock-ai-row")?.classList.contains("is-offline")'),
    'AI dock row did not enter offline gray overlay state',
  );
  await wait(
    () => app.evaluate('Boolean(document.querySelector(".ai-error-toast"))'),
    'Offline error toast did not appear',
  );
  await new Promise(resolveDelay => setTimeout(resolveDelay, 250));

  const offlineSnapshot = await app.evaluate(`(() => {
    const row = document.querySelector('.dock-ai-row');
    const toast = document.querySelector('.ai-error-toast');
    return {
      toastText: toast?.textContent?.trim() ?? '',
      hasErrorDot: Boolean(toast?.querySelector('.status-dot.error')),
      hasInert: row?.hasAttribute('inert') ?? false,
      textareaDisabled: document.querySelector('.generate-input-wrap textarea')?.disabled ?? false,
      voiceDisabled: document.querySelector('.voice-button')?.disabled ?? false,
      generateDisabled: document.querySelector('.generate-button')?.disabled ?? false,
      visionDisabled: document.querySelector('.vision-button')?.disabled ?? false,
      presetsDisabled: document.querySelector('.presets-trigger')?.disabled ?? false,
      demoPillsVisible: Boolean(document.querySelector('.demo-prompt-pills')),
      libraryDisabled: document.querySelector('.library-trigger')?.disabled ?? true,
      rectToolDisabled: document.querySelector('.tools button[aria-label="矩形"]')?.disabled ?? true,
    };
  })()`);

  assert.ok(
    offlineSnapshot.toastText.includes('未检测到互联网连接，AI 功能已禁用'),
    `Unexpected offline toast text: ${offlineSnapshot.toastText}`,
  );
  assert.equal(offlineSnapshot.hasErrorDot, true);
  assert.equal(offlineSnapshot.hasInert, false);
  assert.equal(offlineSnapshot.textareaDisabled, true);
  assert.equal(offlineSnapshot.voiceDisabled, true);
  assert.equal(offlineSnapshot.generateDisabled, true);
  assert.equal(offlineSnapshot.visionDisabled, true);
  assert.equal(offlineSnapshot.presetsDisabled, false);
  assert.equal(offlineSnapshot.demoPillsVisible, false);
  assert.equal(offlineSnapshot.libraryDisabled, false);
  assert.equal(offlineSnapshot.rectToolDisabled, false);

  await app.screenshot({ path: join(output, 'offline-light.png') });

  // Local non-AI tools still work while offline (UI 组件模板 opens cleanly)
  await app.getByRole('button', { name: 'UI 组件模板', exact: true }).click();
  await wait(() => app.evaluate('document.querySelector(".library-panel")?.classList.contains("is-open")'), 'Local UI library did not open while offline');
  await app.keyboard.press('Escape');
  await wait(() => app.evaluate('!document.querySelector(".library-panel")?.classList.contains("is-open")'), 'Local UI library did not close');
  await new Promise(resolveDelay => setTimeout(resolveDelay, 220));

  // Dismissing the offline toast leaves the gray AI mask active
  await app.locator('.ai-error-toast button').click();
  await wait(() => app.evaluate('!document.querySelector(".ai-error-toast")'), 'Offline error toast did not dismiss');
  assert.equal(await app.evaluate('document.querySelector(".dock-ai-row")?.classList.contains("is-offline")'), true);
  assert.equal(await app.evaluate('document.querySelector(".generate-input-wrap textarea")?.disabled'), true);

  // Transition back online clears offline state and re-enables AI row
  await app.evaluate(`(() => {
    window.__mockNetworkOnline = true;
    window.dispatchEvent(new Event('online'));
  })()`);
  await wait(
    () => app.evaluate('!document.querySelector(".dock-ai-row")?.classList.contains("is-offline")'),
    'AI dock row did not recover after coming back online',
  );
  assert.equal(await app.evaluate('document.querySelector(".dock-ai-row")?.hasAttribute("inert")'), false);
  assert.equal(await app.evaluate('document.querySelector(".generate-input-wrap textarea")?.disabled'), false);
  assert.equal(await app.evaluate('document.querySelector(".presets-trigger")?.disabled'), false);

  // Re-verify offline toast & dark mode rendering
  await app.getByRole('button', { name: '菜单', exact: true }).click();
  await wait(() => app.evaluate('document.querySelector(".menu-dropdown")?.classList.contains("is-open")'), 'Menu dropdown did not open');
  await app.locator('.menu-dropdown').getByRole('menuitem', { name: '设置', exact: true }).click();
  await wait(() => app.evaluate('document.querySelector(".menu-overlay")?.classList.contains("is-open")'), 'Settings modal did not open');
  await app.locator('.menu-panel').getByRole('radio', { name: '深色', exact: true }).click();
  await app.keyboard.press('Escape');
  await wait(() => app.evaluate('!document.querySelector(".menu-overlay")?.classList.contains("is-open")'), 'Settings modal did not close');

  await app.evaluate(`(() => {
    window.__mockNetworkOnline = false;
    window.dispatchEvent(new Event('offline'));
  })()`);
  await wait(() => app.evaluate('Boolean(document.querySelector(".ai-error-toast"))'), 'Dark mode offline toast did not appear');
  await new Promise(resolveDelay => setTimeout(resolveDelay, 250));
  await app.screenshot({ path: join(output, 'offline-dark.png') });

  const errors = (await acde.console({ level: 'errors' })).entries;
  assert.deepEqual(errors, []);
  console.log('PASS offline detection toast, gray AI overlay disablement, local tool isolation, and online recovery');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error('CONSOLE:', JSON.stringify(await acde.console().catch(() => null)));
  if (app) await app.screenshot({ path: join(output, 'offline-failure.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await acde.close();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
  await rm(shortTmp, { recursive: true, force: true }).catch(() => {});
}
