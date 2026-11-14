import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Acde } from '../scripts/acde-driver.mjs';
import { createNativeFixture } from '../scripts/native-fixture.mjs';

const output = resolve('.debug/mcp-paths');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(output, 'profile-'));
const acde = await Acde.launch({
  cwd: await createNativeFixture(profile), out: join(profile, 'build'), headless: true,
  env: { XDG_DATA_HOME: join(profile, 'data'), XDG_CONFIG_HOME: join(profile, 'config'), XDG_STATE_HOME: join(profile, 'state'), ACDE_STORAGE: '' },
});
const app = acde.window('excalidraw-depame');
try {
  await acde.route('/api/network/status', { json: { online: true, checkedAt: Date.now() } });
  await app.locator('.welcome-skip').click({ timeout: 20000 });
  for (const [name, args] of [
    ['Filesystem', ['scripts/filesystem-mcp.mjs', '.']],
    ['Memory', ['scripts/memory-mcp.mjs']],
  ]) {
    const config = { name, command: 'node', args, env: { MEMORY_FILE_PATH: join(profile, 'memory.jsonl') } };
    const snapshot = await app.evaluate(`fetch('/api/mcp/servers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify(config))} }).then(r => r.json())`);
    const server = snapshot.servers.find(item => item.name === name);
    assert.equal(server.status, 'connected', server.error);
    assert.ok(server.tools.length > 0);
  }
  await app.getByRole('button', { name: '菜单', exact: true }).click();
  await app.getByRole('menuitem', { name: '设置', exact: true }).click();
  await app.getByRole('tab', { name: 'MCP 服务', exact: true }).click();
  await app.getByText('已连接 2/2', { exact: true }).waitFor({ state: 'visible' });
  await app.screenshot({ path: join(output, 'connected.png') });
  assert.deepEqual((await acde.console({ level: 'errors' })).entries, []);
  console.log('PASS native MCP relative scripts: Filesystem and Memory connected, 2/2 shown, no runtime errors');
} finally { await acde.close(); }
