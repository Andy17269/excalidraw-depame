import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Acde } from '../scripts/acde-driver.mjs';
import { createNativeFixture, enterCanvas } from '../scripts/native-fixture.mjs';

const output = resolve(process.env.CANVAS_TEST_OUTPUT || '.debug/settings-artifacts');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(output, 'profile-'));
const shortTmp = await mkdtemp(join(process.platform === 'win32' ? tmpdir() : '/tmp', 'ad-'));
const mockServerScript = join(profile, 'mock-mcp-server.mjs');
await writeFile(mockServerScript, `
import { McpServer } from ${JSON.stringify(resolve('node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js'))};
import { StdioServerTransport } from ${JSON.stringify(resolve('node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js'))};
import { z } from ${JSON.stringify(resolve('node_modules/zod/index.js'))};

const server = new McpServer({ name: 'native-test-mcp', version: '1.0.0' });
server.registerTool('echo_tool', {
  description: 'Echoes text back for UI testing',
  inputSchema: { text: z.string() },
}, async ({ text }) => ({
  content: [{ type: 'text', text: 'NATIVE_ECHO:' + text }],
}));
await server.connect(new StdioServerTransport());
`, 'utf8');

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
  const wait = async (fn, message) => {
    for (let i = 0; i < 400; i++) {
      if (await fn()) return;
      await frame();
    }
    throw new Error(message);
  };

  await enterCanvas(app);
  await wait(() => app.evaluate('!document.querySelector(".welcome-screen")'), 'Welcome did not close');

  // Top-left menu opens a compact list with icon-equipped 撤销 and 设置 options
  await app.getByRole('button', { name: '矩形' }).click();
  await app.mouse.move(460, 260);
  await app.mouse.down();
  await app.mouse.move(620, 380, { steps: 6 });
  await app.mouse.up();
  await wait(
    () => app.evaluate('JSON.parse(window.canvasBridge.read_canvas()).length === 1'),
    'Failed to draw shape before testing menu undo',
  );

  // Deselect on empty canvas (away from .properties) and re-select on stroke so undo must skip selection-only steps
  await app.mouse.click(800, 300);
  await app.mouse.click(460, 320);

  await app.getByRole('button', { name: '菜单', exact: true }).click();
  await wait(() => app.evaluate('document.querySelector(".menu-dropdown")?.classList.contains("is-open")'), 'Menu dropdown did not open');
  await app.screenshot({ path: join(output, 'menu-dropdown.png') });
  const dropdownItems = await app.evaluate(`
    Array.from(document.querySelectorAll('.menu-dropdown [role="menuitem"]')).map(el => ({
      label: (el.querySelector('.menu-dropdown-label') ?? el).textContent?.trim(),
      shortcut: el.querySelector('.menu-dropdown-shortcut')?.textContent?.trim() ?? null,
      hasSvg: Boolean(el.querySelector('svg')),
    }))
  `);
  assert.deepEqual(dropdownItems.map(item => item.label), ['新建', '打开...', '保存', '另存为...', '快照', '插入图片 / 文件...', '撤销', '设置', '关于', '退出']);
  assert.ok(dropdownItems.every(item => item.hasSvg));
  assert.equal(dropdownItems.find(item => item.label === '撤销').shortcut, process.platform === 'darwin' ? '⌘Z' : 'Ctrl+Z');

  await app.locator('.menu-dropdown').getByRole('menuitem', { name: '撤销' }).click();
  await wait(
    () => app.evaluate('!document.querySelector(".menu-dropdown")?.classList.contains("is-open") && JSON.parse(window.canvasBridge.read_canvas()).length === 0'),
    'Menu undo did not close dropdown or undo canvas drawing in one step',
  );

  // Cmd+Shift+Z restores the undone shape and Cmd+Z undoes it again in acdert
  await app.keyboard.press('Meta+Shift+z');
  await wait(
    () => app.evaluate('JSON.parse(window.canvasBridge.read_canvas()).length === 1'),
    'Meta+Shift+z did not redo canvas drawing',
  );
  await app.keyboard.press('Meta+z');
  await wait(
    () => app.evaluate('JSON.parse(window.canvasBridge.read_canvas()).length === 0'),
    'Meta+z did not undo canvas drawing',
  );

  // Clicking 设置 opens full-screen centered settings modal with light gray backdrop
  await app.getByRole('button', { name: '菜单', exact: true }).click();
  await wait(() => app.evaluate('document.querySelector(".menu-dropdown")?.classList.contains("is-open")'), 'Menu dropdown did not reopen');
  await app.locator('.menu-dropdown').getByRole('menuitem', { name: '设置', exact: true }).click();
  await wait(
    () => app.evaluate('document.querySelector(".menu-overlay")?.classList.contains("is-open") && !document.querySelector(".menu-dropdown")?.classList.contains("is-open")'),
    'Centered settings modal did not open',
  );
  const modalLayout = await app.evaluate(`(() => {
    const overlay = document.querySelector('.menu-overlay');
    const panel = document.querySelector('.menu-panel');
    if (!overlay || !panel) return null;
    const oRect = overlay.getBoundingClientRect();
    const pRect = panel.getBoundingClientRect();
    return {
      overlayBg: getComputedStyle(overlay).backgroundColor,
      centerDx: Math.abs((pRect.left + pRect.width / 2) - (oRect.left + oRect.width / 2)),
      centerDy: Math.abs((pRect.top + pRect.height / 2) - (oRect.top + oRect.height / 2)),
      width: pRect.width,
    };
  })()`);
  assert.ok(modalLayout, 'Missing menu overlay/panel bounds');
  assert.ok(modalLayout.centerDx < 2 && modalLayout.centerDy < 2, `Settings panel not centered: ${JSON.stringify(modalLayout)}`);
  assert.notEqual(modalLayout.overlayBg, 'rgba(0, 0, 0, 0)');

  const panel = app.locator('.menu-panel');
  await panel.getByRole('tab', { name: 'AI 引擎', exact: true }).click();
  await panel.getByRole('radio', { name: '开启', exact: true }).click();
  await panel.getByRole('switch', { name: '绘制动画', exact: true }).click();
  await panel.getByRole('button', { name: '保存', exact: true }).click();
  await wait(
    () => app.evaluate('document.querySelector(".menu-status")?.textContent?.includes("已保存")'),
    'AI settings save feedback missing',
  );
  await app.screenshot({ path: join(output, 'settings-ai.png') });

  // Backdrop click closes the centered settings modal
  await app.mouse.click(24, 24);
  await wait(() => app.evaluate('!document.querySelector(".menu-overlay")?.classList.contains("is-open")'), 'Backdrop click did not close settings modal');

  await acde.reload('excalidraw-depame');
  await enterCanvas(app);
  await wait(() => app.evaluate('!document.querySelector(".welcome-screen")'), 'Welcome did not close after reload');
  await app.getByRole('button', { name: '菜单', exact: true }).click();
  await wait(() => app.evaluate('document.querySelector(".menu-dropdown")?.classList.contains("is-open")'), 'Menu dropdown did not open after reload');
  await app.locator('.menu-dropdown').getByRole('menuitem', { name: '设置', exact: true }).click();
  await wait(
    () => app.evaluate('document.querySelector(".menu-overlay")?.classList.contains("is-open")'),
    'Saved AI settings did not persist across reload',
  );
  await panel.getByRole('tab', { name: 'AI 引擎', exact: true }).click();
  assert.equal(await app.evaluate('document.querySelector("[role=switch][aria-label=绘制动画]")?.getAttribute("aria-checked")'), 'false');

  await panel.getByRole('tab', { name: 'MCP 服务', exact: true }).click();
  await wait(() => app.evaluate('Boolean(document.querySelector(".mcp-local-card"))'), 'MCP tab did not load');

  await panel.getByRole('button', { name: '添加', exact: true }).click();
  await panel.getByLabel('服务名称', { exact: true }).fill('local-echo');
  await panel.getByLabel('启动命令', { exact: true }).fill(process.execPath);
  await panel.getByLabel('命令参数', { exact: true }).fill(mockServerScript);
  await panel.getByRole('button', { name: '保存', exact: true }).click();
  await wait(
    () => app.evaluate('document.body.innerText.includes("local-echo") && document.body.innerText.includes("1/1 工具")'),
    'MCP server did not connect and discover tools',
  );

  await panel.getByRole('button', { name: '工具 (1)', exact: true }).click();
  await panel.getByRole('button', { name: '调试 echo_tool', exact: true }).click();
  await panel.getByLabel('工具参数 JSON', { exact: true }).fill('{"text":"ping-123"}');
  await panel.getByRole('button', { name: '运行', exact: true }).click();
  await wait(
    () => app.evaluate('document.querySelector(".mcp-tool-output")?.textContent?.includes("NATIVE_ECHO:ping-123")'),
    'MCP tool runner did not show expected output',
  );
  await app.screenshot({ path: join(output, 'settings-mcp.png') });

  assert.equal(await app.evaluate('Boolean(window.canvasBridge)'), true);
  await panel.getByRole('switch', { name: '允许外部 MCP 调用画布', exact: true }).click();
  await wait(() => app.evaluate('window.canvasBridge === undefined'), 'Disabling local MCP did not hide canvasBridge');
  await panel.getByRole('switch', { name: '允许外部 MCP 调用画布', exact: true }).click();
  await wait(() => app.evaluate('Boolean(window.canvasBridge)'), 'Re-enabling local MCP did not restore canvasBridge');

  await panel.getByRole('button', { name: '删除 local-echo', exact: true }).click();
  await panel.getByRole('button', { name: '确认', exact: true }).click();
  await wait(() => app.evaluate('!document.querySelector(".settings-tabpanel:not([hidden]) .mcp-card")'), 'MCP server was not deleted');

  // Escape closes the centered settings modal and restores focus
  await app.keyboard.press('Escape');
  await wait(() => app.evaluate('!document.querySelector(".menu-overlay")?.classList.contains("is-open")'), 'Escape did not close settings modal');

  const errors = (await acde.console({ level: 'errors' })).entries;
  assert.deepEqual(errors, []);

  // Clicking 退出 in the top-left menu closes the window and exits the app
  await app.getByRole('button', { name: '菜单', exact: true }).click();
  await wait(() => app.evaluate('document.querySelector(".menu-dropdown")?.classList.contains("is-open")'), 'Menu dropdown did not open before exit');
  try {
    await app.locator('.menu-dropdown').getByRole('menuitem', { name: '退出', exact: true }).click();
  } catch (error) {
    if (!acde.closed) throw error;
  }
  const exitDeadline = Date.now() + 10000;
  while (!acde.closed && Date.now() < exitDeadline) {
    await new Promise(resolveDelay => setTimeout(resolveDelay, 100));
  }
  assert.equal(acde.closed, true, 'Clicking 退出 did not exit the app session');

  console.log('PASS native top-left dropdown menu, undo, exit app, centered settings modal, AI settings persistence, full MCP management, and zero runtime errors');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  if (app) await app.screenshot({ path: join(output, 'settings-failure.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await acde.close();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
  await rm(shortTmp, { recursive: true, force: true }).catch(() => {});
}
