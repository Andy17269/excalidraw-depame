import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Acde } from '../scripts/acde-driver.mjs';
import { createNativeFixture, enterCanvas } from '../scripts/native-fixture.mjs';

const output = resolve(process.env.CANVAS_TEST_OUTPUT || '.debug/kernel-desktop-artifacts');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(output, 'profile-'));

const wait = async (fn, message, frameFn) => {
  for (let i = 0; i < 400; i++) {
    if (await fn()) return;
    await frameFn();
  }
  throw new Error(message);
};

// 1. Test P1: Dopame 内核 tab, acde:capabilities, acde:window, and acde:fs snapshots
{
  const cwd = await createNativeFixture(join(profile, 'app'));
  const acde = await Acde.launch({
    cwd,
    out: join(profile, 'app-build'),
    headless: true,
    env: {
      XDG_DATA_HOME: join(profile, 'data1'),
      XDG_CONFIG_HOME: join(profile, 'config1'),
      XDG_STATE_HOME: join(profile, 'state1'),
      ACDE_STORAGE: '',
    },
  });
  try {
    const app = acde.window('excalidraw-depame');
    const frame = () => app.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))');

    await enterCanvas(app);
    await wait(() => app.evaluate('!document.querySelector(".welcome-screen")'), 'Welcome did not close', frame);

    await app.getByRole('button', { name: '矩形' }).click();
    await app.mouse.move(460, 260);
    await app.mouse.down();
    await app.mouse.move(620, 380, { steps: 6 });
    await app.mouse.up();
    await wait(() => app.evaluate('JSON.parse(window.canvasBridge.read_canvas()).length === 1'), 'Shape was not drawn', frame);

    // Verify simplified 内核 tab
    await app.getByRole('button', { name: '菜单', exact: true }).click();
    await app.locator('.menu-dropdown').getByRole('menuitem', { name: '设置', exact: true }).click();
    const panel = app.locator('.menu-panel');
    await panel.getByRole('tab', { name: '通用', exact: true }).click();

    await wait(
      () => app.evaluate('document.body.innerText.includes("Dopame OS 运行环境")'),
      'Kernel diagnostics did not render',
      frame,
    );
    await panel.getByRole('button', { name: '关闭设置', exact: true }).click();

    // Verify standalone 快照 secondary modal (isolated from settings tabs)
    await app.getByRole('button', { name: '菜单', exact: true }).click();
    await app.locator('.menu-dropdown').getByRole('menuitem', { name: '快照', exact: true }).click();
    const snapshotModal = app.locator('.snapshot-modal');
    await wait(
      () => app.evaluate('(() => { const el = document.querySelector(".snapshot-modal"); if (!el) return false; const t = el.innerText; return t.includes("画布快照") && !t.includes("AI 设置") && !t.includes("MCP 管理") && !t.includes("root:private"); })()'),
      'Standalone snapshot modal did not render cleanly',
      frame,
    );

    await snapshotModal.getByRole('button', { name: '新建快照', exact: true }).click();
    await wait(
      () => app.evaluate('(() => { const t = document.querySelector(".snapshot-modal")?.innerText || ""; return t.includes("手动快照") && !t.includes(".excalidraw") && !t.includes("snapshot-"); })()'),
      'Manual snapshot was not created or leaked raw filename',
      frame,
    );
    await app.screenshot({ path: join(output, 'p1-kernel-snapshots.png') });

    // Close modal, verify sorted menu items, clear canvas via 新建, then restore from the manual snapshot
    await snapshotModal.getByRole('button', { name: '关闭快照', exact: true }).click();
    await app.getByRole('button', { name: '菜单', exact: true }).click();
    await wait(() => app.evaluate('document.querySelector(".menu-dropdown")?.classList.contains("is-open")'), 'Menu dropdown did not open', frame);
    const menuLabels = await app.evaluate(`
      Array.from(document.querySelectorAll('.menu-dropdown .menu-dropdown-label')).map(el => el.textContent?.trim())
    `);
    assert.deepEqual(menuLabels, ['新建', '打开...', '保存', '另存为...', '快照', '插入图片 / 文件...', '撤销', '设置', '关于', '退出']);
    await wait(() => app.evaluate('document.querySelector(".status-dot").classList.contains("saved")'), 'Autosave before new', frame);
    await app.locator('.menu-dropdown').getByRole('menuitem', { name: /新建/ }).click();
    await wait(() => app.evaluate('JSON.parse(window.canvasBridge.read_canvas()).length === 0'), 'Canvas did not clear on 新建', frame);

    await app.getByRole('button', { name: '菜单', exact: true }).click();
    await app.locator('.menu-dropdown').getByRole('menuitem', { name: '快照', exact: true }).click();
    await wait(() => app.evaluate('document.querySelectorAll(".snapshot-modal .system-snapshot-row").length >= 1'), 'Snapshot list did not reload', frame);

    await snapshotModal.locator('button[aria-label^="恢复 手动快照"]').first().click();
    await wait(() => app.evaluate('JSON.parse(window.canvasBridge.read_canvas()).length === 1'), 'Snapshot restore did not recover shape', frame);

    assert.deepEqual((await acde.console({ level: 'errors' })).entries, []);
    console.log('PASS P1: Dopame kernel diagnostics, window controls, and acde:fs snapshot create/restore');
  } finally {
    await acde.close();
  }
}

await rm(profile, { recursive: true, force: true }).catch(() => {});
