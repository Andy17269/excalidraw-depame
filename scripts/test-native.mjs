import { spawn } from 'node:child_process';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const live = process.argv.includes('--live');
const filterArg = process.argv.find(arg => arg.startsWith('--filter='));
const filter = filterArg ? new RegExp(filterArg.slice('--filter='.length)) : null;
const output = resolve(process.env.CANVAS_SUITE_OUTPUT || `.debug/native-suite-${Date.now()}`);
await mkdir(output, { recursive: true });
const files = (await readdir('tests')).filter(file =>
  (file.startsWith('native-') || file === 'network-offline.mjs') && file.endsWith('.mjs')
  && (live || !file.includes('-live')) && (!filter || filter.test(file)),
).sort();
if (!files.length) throw new Error('No native tests matched the filter');
const results = [];
for (const file of files) {
  const artifacts = join(output, basename(file, '.mjs'));
  await mkdir(artifacts, { recursive: true });
  const started = Date.now();
  console.log(`START ${file}`);
  let log = '';
  const result = await new Promise(resolveResult => {
    // Catch module errors so Node does not dump the runtime's minified driver source.
    const moduleUrl = pathToFileURL(resolve('tests', file)).href;
    const source = `try { await import(${JSON.stringify(moduleUrl)}); } catch (error) { console.error(error.stack || error); process.exitCode = 1; }`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', source], {
      detached: process.platform !== 'win32',
      env: { ...process.env, CANVAS_TEST_OUTPUT: artifacts },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      if (process.platform === 'win32') child.kill('SIGTERM');
      else { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* process already exited */ } }
    }, live && file.includes('-live') ? 360000 : 180000);
    child.stdout.on('data', data => { log += data; });
    child.stderr.on('data', data => { log += data; });
    child.on('error', error => { log += error.stack; });
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      resolveResult({ file, code, signal, timedOut, durationMs: Date.now() - started, artifacts });
    });
  });
  result.skips = log.split('\n').filter(line => line.startsWith('SKIP '));
  await writeFile(join(artifacts, 'output.log'), log);
  results.push(result);
  await writeFile(join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`${result.code === 0 ? 'PASS' : 'FAIL'} ${file} (${(result.durationMs / 1000).toFixed(1)}s)`);
  for (const line of log.split('\n').filter(line => line.length < 500 && /^(PASS|SKIP|Error:|AssertionError|Timed out:)/.test(line))) console.log(`  ${line}`);
}
console.log(JSON.stringify({ total: results.length, passed: results.filter(result => result.code === 0).length, failed: results.filter(result => result.code !== 0).map(result => result.file), skippedChecks: results.flatMap(result => result.skips), output }, null, 2));
process.exitCode = results.some(result => result.code !== 0) ? 1 : 0;
