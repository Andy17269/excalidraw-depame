import { mkdir, writeFile, symlink } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

export async function createNativeFixture(profile) {
  const cwd = join(profile, 'project');
  await mkdir(cwd, { recursive: true });
  await symlink(resolve('node_modules'), join(cwd, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ name: 'canvas-regression-fixture', private: true, type: 'module', packageManager: 'npm@11.19.0' }));
  await writeFile(join(cwd, 'acde.config.jsonc'), JSON.stringify({ type: 'app', framework: 'none', id: 'excalidraw-depame', label: 'Excalidraw', icon: relative(cwd, resolve('public/icon.png')).replaceAll('\\', '/'), entry: 'index.html', public: relative(cwd, resolve('public')).replaceAll('\\', '/'), capabilities: { fs: true, microphone: true }, optional: ['microphone'], backend: { entry: relative(cwd, resolve('server.ts')).replaceAll('\\', '/') } }));
  const source = relative(cwd, resolve('src/main.tsx')).replaceAll('\\', '/');
  await writeFile(join(cwd, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/excalidraw-assets/fonts.css"></head><body><div id="root"></div><script type="module" src="${source}"></script></body></html>`);
  return cwd;
}




export async function enableDemoMode(app) {
  await app.getByRole('button', { name: '菜单', exact: true }).click();
  await app.getByRole('menuitem', { name: '设置', exact: true }).click();
  await app.getByRole('tab', { name: '通用', exact: true }).click();
  const toggle = app.getByRole('switch', { name: '演示模式', exact: true });
  if (await app.evaluate(`document.querySelector('[role="switch"][aria-label="演示模式"]').getAttribute('aria-checked')`) !== 'true') await toggle.click();
  await app.getByRole('button', { name: '关闭设置', exact: true }).click();
}

export async function waitForNative(app, expression, message = expression, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await app.evaluate(expression)) return;
    await new Promise(resolveWait => setTimeout(resolveWait, 50));
  }
  throw new Error(`Timed out: ${message}`);
}

/** Enter either the first-run Welcome or returning Startup without starting the tour. */
export async function enterCanvas(app) {
  await waitForNative(app, 'Boolean(document.querySelector(".welcome-screen button:not(:disabled)"))', 'entry screen ready', 20000);
  await app.keyboard.press('Escape');
  await waitForNative(app, '!document.querySelector(".welcome-screen") && Boolean(window.canvasBridge)', 'canvas ready');
}

export async function selectFileMenu(app, name) {
  await app.getByRole('button', { name: '菜单', exact: true }).click();
  await app.locator('.menu-dropdown').getByRole('menuitem', { name, exact: true }).click();
}

/** Some runtime releases expose color-scheme emulation only. Never count an ignored motion option as coverage. */
export async function emulateReducedMotion(acde, app, reduced = true) {
  await acde.emulate({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const matches = await app.evaluate('matchMedia("(prefers-reduced-motion: reduce)").matches');
  if (matches !== reduced) {
    console.log('SKIP reduced-motion emulation: installed acde runtime does not support this option');
    return false;
  }
  return true;
}
