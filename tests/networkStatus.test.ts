import { test } from 'node:test';
import assert from 'node:assert/strict';
import backend from '../server.ts';
import {
  buildPingCommand,
  createConnectivityChecker,
  PING_HOST,
  PING_TIMEOUT_MS,
} from '../server/networkStatus.ts';

test('buildPingCommand constructs 5s timeout ping args per platform', () => {
  assert.deepEqual(buildPingCommand('darwin'), {
    file: 'ping',
    args: ['-c', '1', '-t', '5', PING_HOST],
    timeoutMs: PING_TIMEOUT_MS,
  });
  assert.deepEqual(buildPingCommand('linux'), {
    file: 'ping',
    args: ['-c', '1', '-W', '5', PING_HOST],
    timeoutMs: PING_TIMEOUT_MS,
  });
  assert.deepEqual(buildPingCommand('win32'), {
    file: 'ping',
    args: ['-n', '1', '-w', '5000', PING_HOST],
    timeoutMs: PING_TIMEOUT_MS,
  });
});

test('createConnectivityChecker returns online status when ping succeeds', async () => {
  let tick = 1000;
  const check = createConnectivityChecker({
    platform: 'darwin',
    now: () => (tick += 25),
    runner: async command => {
      assert.deepEqual(command.args, ['-c', '1', '-t', '5', 'baidu.com']);
      return { ok: true };
    },
  });

  const result = await check();
  assert.equal(result.online, true);
  assert.equal(result.host, 'baidu.com');
  assert.equal(result.durationMs, 25);
  assert.equal(result.reason, undefined);
});

test('createConnectivityChecker reports offline status when ping fails or rejects', async () => {
  const failed = createConnectivityChecker({
    runner: async () => ({ ok: false, reason: 'ping baidu.com 超时（5s）' }),
  });
  const failRes = await failed();
  assert.equal(failRes.online, false);
  assert.equal(failRes.reason, 'ping baidu.com 超时（5s）');

  const threw = createConnectivityChecker({
    runner: async () => { throw new Error('spawn ENOENT'); },
  });
  const threwRes = await threw();
  assert.equal(threwRes.online, false);
  assert.equal(threwRes.reason, 'spawn ENOENT');
});

test('createConnectivityChecker deduplicates concurrent probes and releases after completion', async () => {
  let calls = 0;
  let release!: () => void;
  let pending = new Promise<{ ok: boolean }>(resolve => {
    release = () => resolve({ ok: true });
  });

  const check = createConnectivityChecker({
    runner: async () => {
      calls++;
      return pending;
    },
  });

  const p1 = check();
  const p2 = check();
  assert.equal(calls, 1);
  release();
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(r1, r2);
  assert.equal(r1.online, true);

  pending = Promise.resolve({ ok: false, reason: 'offline' });
  const r3 = await check();
  assert.equal(calls, 2);
  assert.equal(r3.online, false);
});

test('/api/network/status returns JSON on GET and rejects POST', async () => {
  const postRes = await backend.fetch(new Request('http://localhost/api/network/status', { method: 'POST' }));
  assert.equal(postRes.status, 405);

  const getRes = await backend.fetch(new Request('http://localhost/api/network/status', { method: 'GET' }));
  assert.equal(getRes.status, 200);
  const body = await getRes.json() as { online: boolean; host: string; checkedAt: number; durationMs: number };
  assert.equal(typeof body.online, 'boolean');
  assert.equal(body.host, 'baidu.com');
  assert.equal(typeof body.checkedAt, 'number');
  assert.equal(typeof body.durationMs, 'number');
});
